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
	"ballerina-lang-go/platform/pal"
	"bytes"
	"fmt"
	"syscall/js"
	"time"
)

type fetchHTTPClient struct {
	cfg pal.ClientConfig
}

func (c *fetchHTTPClient) Execute(method, url string, body []byte, contentType string, reqHeaders map[string][]string) (int, map[string][]string, []byte, error) {
	fetch := js.Global().Get("fetch")
	if !fetch.Truthy() {
		return 0, nil, nil, fmt.Errorf("browser fetch API is not available")
	}

	headers := js.Global().Get("Headers").New()
	for k, vals := range reqHeaders {
		if len(vals) == 0 {
			continue
		}
		headers.Call("set", k, vals[0])
		for _, v := range vals[1:] {
			headers.Call("append", k, v)
		}
	}
	if contentType != "" {
		headers.Call("set", "Content-Type", contentType)
	}

	options := map[string]any{
		"method":   method,
		"headers":  headers,
		"redirect": redirectMode(c.cfg.FollowRedirects.Enabled),
	}
	if body != nil {
		bodyBytes := js.Global().Get("Uint8Array").New(len(body))
		js.CopyBytesToJS(bodyBytes, body)
		options["body"] = bodyBytes
	}

	var timeout *time.Timer
	var controller js.Value
	if c.cfg.Timeout > 0 {
		controller = js.Global().Get("AbortController").New()
		options["signal"] = controller.Get("signal")
		timeout = time.AfterFunc(c.cfg.Timeout, func() {
			controller.Call("abort")
		})
	}

	resp, err := awaitPromise(fetch.Invoke(url, js.ValueOf(options)))
	if timeout != nil {
		timeout.Stop()
	}
	if err != nil {
		return 0, nil, nil, err
	}

	respHeaders := map[string][]string{}
	forEach := js.FuncOf(func(_ js.Value, args []js.Value) any {
		value := args[0].String()
		name := args[1].String()
		respHeaders[name] = append(respHeaders[name], value)
		return nil
	})
	resp.Get("headers").Call("forEach", forEach)
	forEach.Release()

	arrayBuffer, err := awaitPromise(resp.Call("arrayBuffer"))
	if err != nil {
		return 0, nil, nil, err
	}
	uint8Array := js.Global().Get("Uint8Array").New(arrayBuffer)
	respBody := make([]byte, uint8Array.Get("byteLength").Int())
	js.CopyBytesToGo(respBody, uint8Array)

	return resp.Get("status").Int(), respHeaders, respBody, nil
}

func newHTTPClient(cfg pal.ClientConfig) pal.HTTPClient {
	return &fetchHTTPClient{cfg: cfg}
}

func redirectMode(enabled bool) string {
	if enabled {
		return "follow"
	}
	return "manual"
}

func wasmPal(stderrBuf, stdoutBuf *bytes.Buffer) pal.Platform {
	return pal.Platform{
		IO: pal.IO{
			Stdout: func(p []byte) (n int, err error) {
				return stdoutBuf.Write(p)
			},
			Stderr: func(p []byte) (n int, err error) {
				return stderrBuf.Write(p)
			},
		},
		HTTP: pal.HTTP{
			NewClient: newHTTPClient,
		},
	}
}
