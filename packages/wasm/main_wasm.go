// Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com).
//
// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

package main

import (
	_ "ballerina-lang-go/lib/rt"
	"ballerina-lang-go/pal"
	"ballerina-lang-go/projects"
	"ballerina-lang-go/runtime"
	"ballerina-lang-go/tools/diagnostics"
	"bytes"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"syscall/js"
)

func main() {
	js.Global().Set("run", js.FuncOf(run))

	select {}
}

type nativeHTTPClient struct {
	client *http.Client
}

func (c *nativeHTTPClient) Execute(method, url string, body []byte, contentType string, reqHeaders map[string][]string) (int, map[string][]string, []byte, error) {
	var bodyReader io.Reader
	if body != nil {
		bodyReader = bytes.NewReader(body)
	}
	req, err := http.NewRequest(method, url, bodyReader)
	if err != nil {
		return 0, nil, nil, err
	}
	req.Header.Set("User-Agent", "ballerina")
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	for k, vals := range reqHeaders {
		if len(vals) == 0 {
			continue
		}
		req.Header.Set(k, vals[0])
		for _, v := range vals[1:] {
			req.Header.Add(k, v)
		}
	}
	resp, err := c.client.Do(req)
	if err != nil {
		return 0, nil, nil, err
	}
	defer func() { _ = resp.Body.Close() }()
	respBody, err := io.ReadAll(resp.Body)
	return resp.StatusCode, map[string][]string(resp.Header), respBody, err
}

// tlsVerifyConnectionWithCNFallback returns a VerifyConnection callback that verifies the
// server's certificate chain against rootCAs and falls back to CN-based hostname matching
// when no SANs are present. Go 1.15+ disabled CN-only hostname verification (RFC 6125 §2.3),
// but many self-signed and Java-issued certificates still rely on it.
func tlsVerifyConnectionWithCNFallback(rootCAs *x509.CertPool) func(tls.ConnectionState) error {
	return func(cs tls.ConnectionState) error {
		opts := x509.VerifyOptions{
			Roots:         rootCAs,
			Intermediates: x509.NewCertPool(),
		}
		for _, cert := range cs.PeerCertificates[1:] {
			opts.Intermediates.AddCert(cert)
		}
		if _, err := cs.PeerCertificates[0].Verify(opts); err != nil {
			return err
		}
		// cs.ServerName is the SNI hostname (no port). Try SAN-based verification first;
		// fall back to CN matching for legacy certificates.
		leaf := cs.PeerCertificates[0]
		if err := leaf.VerifyHostname(cs.ServerName); err == nil {
			return nil
		}
		return tlsMatchCN(leaf.Subject.CommonName, cs.ServerName)
	}
}

// tlsMatchCN checks whether pattern (a certificate CN) matches host.
// Supports simple wildcard patterns of the form "*.example.com".
func tlsMatchCN(pattern, host string) error {
	pattern = strings.ToLower(strings.TrimSuffix(pattern, "."))
	host = strings.ToLower(strings.TrimSuffix(host, "."))
	if pattern == host {
		return nil
	}
	if strings.HasPrefix(pattern, "*.") {
		suffix := pattern[1:] // ".example.com"
		if strings.HasSuffix(host, suffix) && strings.Count(host, ".") == strings.Count(suffix, ".") {
			return nil
		}
	}
	return fmt.Errorf("x509: certificate CN %q does not match host %q", pattern, host)
}

func run(_ js.Value, args []js.Value) any {
	return newPromise(func(resolve js.Value, _ js.Value) {
		go func() {
			defer func() {
				if r := recover(); r != nil {
					fmt.Fprintf(os.Stderr, "%v\n", r)
					resolve.Invoke(jsError(fmt.Errorf("%v", r)))
				}
			}()

			if len(args) < 2 {
				resolve.Invoke(jsError(fmt.Errorf("expected at least 2 arguments: (fsProxy, path)")))
				return
			}

			proxy := args[0]
			path := args[1].String()
			fsys := NewBridgeFS(proxy)

			result, err := projects.Load(fsys, path)
			if err != nil {
				resolve.Invoke(jsError(err))
				return
			}

			if diags := result.Diagnostics(); diags.HasErrors() {
				printDiagnostics(fsys, path, os.Stderr, diags, diagnostics.NewDiagnosticEnv())
				resolve.Invoke(js.Null())
				return
			}

			compilation := result.Project().CurrentPackage().Compilation()
			if diags := compilation.DiagnosticResult(); diags.HasErrors() {
				printDiagnostics(fsys, path, os.Stderr, diags, compilation.DiagnosticEnv())
				resolve.Invoke(js.Null())
				return
			}

			birPkgs := projects.NewBallerinaBackend(compilation).BIRPackages()
			if len(birPkgs) == 0 {
				resolve.Invoke(jsError(fmt.Errorf("BIR generation failed: no BIR package produced")))
				return
			}

			// FIXME: This is a copy of nativePal and should be replaced with a proper implementation.
			wasmPal := pal.Platform{
				IO: pal.IO{
					Stdout: func(p []byte) (n int, err error) {
						return os.Stdout.Write(p)
					},
					Stderr: func(p []byte) (n int, err error) {
						return os.Stderr.Write(p)
					},
				},
				HTTP: pal.HTTP{
					NewClient: func(cfg pal.ClientConfig) pal.HTTPClient {
						tlsConfig := &tls.Config{InsecureSkipVerify: cfg.TLS.InsecureSkipVerify} //nolint:gosec
						if len(cfg.TLS.CACertPEM) > 0 {
							pool := x509.NewCertPool()
							pool.AppendCertsFromPEM(cfg.TLS.CACertPEM)
							tlsConfig.RootCAs = pool
							if !cfg.TLS.InsecureSkipVerify {
								// Go 1.15+ requires SANs for hostname verification; many self-signed and
								// Java-issued certs only set the CN field. When a custom CA is provided
								// we do our own verification so CN-only certs are accepted as a fallback.
								tlsConfig.InsecureSkipVerify = true //nolint:gosec
								tlsConfig.VerifyConnection = tlsVerifyConnectionWithCNFallback(pool)
							}
						}
						if len(cfg.TLS.ClientCertPEM) > 0 && len(cfg.TLS.ClientKeyPEM) > 0 {
							if cert, err := tls.X509KeyPair(cfg.TLS.ClientCertPEM, cfg.TLS.ClientKeyPEM); err == nil {
								tlsConfig.Certificates = []tls.Certificate{cert}
							}
						}
						transport := &http.Transport{TLSClientConfig: tlsConfig}
						protocols := new(http.Protocols)
						if cfg.HTTPVersion == "2.0" {
							protocols.SetHTTP2(true)
							protocols.SetUnencryptedHTTP2(true)
						} else {
							protocols.SetHTTP1(true)
						}
						transport.Protocols = protocols
						c := &http.Client{Timeout: cfg.Timeout, Transport: transport}
						if !cfg.FollowRedirects {
							c.CheckRedirect = func(req *http.Request, via []*http.Request) error {
								return http.ErrUseLastResponse
							}
						}
						return &nativeHTTPClient{client: c}
					},
				},
			}

			rt := runtime.NewRuntime(wasmPal)
			for _, birPkg := range birPkgs {
				if err := rt.Interpret(*birPkg); err != nil {
					resolve.Invoke(jsError(err))
					return
				}
			}

			resolve.Invoke(js.Null())
		}()
	})
}

func jsError(err error) map[string]any {
	return map[string]any{
		"error": err.Error(),
	}
}
