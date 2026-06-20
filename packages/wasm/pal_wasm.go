package main

import (
	"ballerina-lang-go/platform/pal"
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"path"
	"strings"
	"sync"
	"syscall/js"
	"time"
)

var wasmProcessStart = time.Now()

var activeHTTPServices = wasmHTTPServices{handlers: map[int]http.Handler{}}

type wasmHTTPServices struct {
	mu       sync.Mutex
	handlers map[int]http.Handler
}

type wasmHTTPServerHandle struct {
	port int
}

func (h wasmHTTPServerHandle) Shutdown(context.Context) error {
	activeHTTPServices.unregister(h.port)
	return nil
}

func (h wasmHTTPServerHandle) Close() error {
	activeHTTPServices.unregister(h.port)
	return nil
}

func (s *wasmHTTPServices) register(cfg pal.ServerConfig, handler http.Handler) (pal.ServerHandle, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	port := cfg.Port
	if port == 0 {
		port = len(s.handlers) + 1
	}
	s.handlers[port] = handler
	return wasmHTTPServerHandle{port: port}, nil
}

func (s *wasmHTTPServices) unregister(port int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.handlers, port)
}

func (s *wasmHTTPServices) invoke(port int, method, targetPath, body string) (map[string]any, error) {
	s.mu.Lock()
	var handler http.Handler
	if port > 0 {
		handler = s.handlers[port]
	} else if len(s.handlers) == 1 {
		for _, h := range s.handlers {
			handler = h
		}
	}
	handlerCount := len(s.handlers)
	s.mu.Unlock()
	if handler == nil {
		if port > 0 {
			return nil, fmt.Errorf("no active HTTP service is listening on port %d", port)
		}
		if handlerCount > 1 {
			return nil, fmt.Errorf("multiple HTTP services are listening; specify a port")
		}
		return nil, fmt.Errorf("no active HTTP service is listening")
	}

	if targetPath == "" {
		targetPath = "/"
	}
	if !strings.HasPrefix(targetPath, "/") {
		targetPath = "/" + targetPath
	}

	req := httptest.NewRequest(strings.ToUpper(method), targetPath, strings.NewReader(body))
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)

	resp := res.Result()
	defer resp.Body.Close()
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	headers := map[string]any{}
	for name, values := range resp.Header {
		headers[name] = strings.Join(values, ", ")
	}

	return map[string]any{
		"status":  resp.StatusCode,
		"headers": headers,
		"body":    string(respBody),
	}, nil
}

type fetchHTTPClient struct {
	cfg pal.ClientConfig
}

type requestContext struct {
	controller js.Value
	timeout    *time.Timer
}

func (ctx *requestContext) cleanup() {
	if ctx.timeout != nil {
		ctx.timeout.Stop()
	}
}

func (c *fetchHTTPClient) Execute(_ context.Context, method, url string, body io.Reader, _ int64, contentType string, reqHeaders map[string][]string) (int, map[string][]string, io.ReadCloser, error) {
	fetch := js.Global().Get("fetch")
	if !fetch.Truthy() {
		return 0, nil, nil, fmt.Errorf("browser fetch API is not available")
	}

	var bodyBytes []byte
	if body != nil {
		b, err := io.ReadAll(body)
		if err != nil {
			return 0, nil, nil, err
		}
		bodyBytes = b
	}

	reqCtx := &requestContext{}
	defer reqCtx.cleanup()

	options := c.buildFetchOptions(method, bodyBytes, contentType, reqHeaders, reqCtx)

	resp, err := c.executeRequest(fetch, url, options)
	if err != nil {
		return 0, nil, nil, err
	}

	respHeaders := c.extractHeaders(resp)
	respBody, err := c.extractBody(resp)
	if err != nil {
		return 0, nil, nil, err
	}

	return resp.Get("status").Int(), respHeaders, io.NopCloser(bytes.NewReader(respBody)), nil
}

func (c *fetchHTTPClient) buildFetchOptions(method string, body []byte, contentType string, reqHeaders map[string][]string, reqCtx *requestContext) map[string]any {
	options := map[string]any{
		"method":   method,
		"headers":  c.buildHeaders(contentType, reqHeaders),
		"redirect": redirectMode(c.cfg.FollowRedirects.Enabled),
	}

	if body != nil && methodAllowsBody(method) {
		options["body"] = c.encodeBody(body)
	}
	if c.cfg.Timeout > 0 {
		options["signal"] = c.setupTimeout(reqCtx)
	}

	return options
}

func methodAllowsBody(method string) bool {
	switch strings.ToUpper(method) {
	case "GET", "HEAD":
		return false
	default:
		return true
	}
}

func (c *fetchHTTPClient) buildHeaders(contentType string, reqHeaders map[string][]string) js.Value {
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

	return headers
}

func (c *fetchHTTPClient) encodeBody(body []byte) js.Value {
	bodyBytes := js.Global().Get("Uint8Array").New(len(body))
	js.CopyBytesToJS(bodyBytes, body)
	return bodyBytes
}

func (c *fetchHTTPClient) setupTimeout(reqCtx *requestContext) js.Value {
	reqCtx.controller = js.Global().Get("AbortController").New()
	reqCtx.timeout = time.AfterFunc(c.cfg.Timeout, func() {
		reqCtx.controller.Call("abort")
	})
	return reqCtx.controller.Get("signal")
}

func (c *fetchHTTPClient) executeRequest(fetch js.Value, url string, options map[string]any) (js.Value, error) {
	resp, err := awaitPromise(fetch.Invoke(url, js.ValueOf(options)))
	return resp, err
}

func (c *fetchHTTPClient) extractHeaders(resp js.Value) map[string][]string {
	respHeaders := map[string][]string{}
	forEach := js.FuncOf(func(_ js.Value, args []js.Value) any {
		value := args[0].String()
		name := args[1].String()
		respHeaders[name] = append(respHeaders[name], value)
		return nil
	})
	defer forEach.Release()

	resp.Get("headers").Call("forEach", forEach)
	return respHeaders
}

func (c *fetchHTTPClient) extractBody(resp js.Value) ([]byte, error) {
	arrayBuffer, err := awaitPromise(resp.Call("arrayBuffer"))
	if err != nil {
		return nil, err
	}

	uint8Array := js.Global().Get("Uint8Array").New(arrayBuffer)
	respBody := make([]byte, uint8Array.Get("byteLength").Int())
	js.CopyBytesToGo(respBody, uint8Array)

	return respBody, nil
}

func redirectMode(enabled bool) string {
	if enabled {
		return "follow"
	}
	return "manual"
}

var (
	activeSignalsMu sync.Mutex
	activeSignals   *signalSource
)

type signalSource struct {
	ch chan pal.Signal
}

func (s *signalSource) send(sig pal.Signal) bool {
	select {
	case s.ch <- sig:
		return true
	default:
		return false
	}
}

func (s *signalSource) cleanup() {
	close(s.ch)
}

func newSignalSource() (*signalSource, pal.SignalSource) {
	ch := make(chan pal.Signal, 2)
	return &signalSource{ch: ch}, pal.SignalSource{Signals: ch}
}

func activateSignalSource(s *signalSource) bool {
	activeSignalsMu.Lock()
	defer activeSignalsMu.Unlock()
	if activeSignals != nil {
		return false
	}
	activeSignals = s
	return true
}

func deactivateSignalSource(s *signalSource) {
	activeSignalsMu.Lock()
	defer activeSignalsMu.Unlock()
	if activeSignals == s {
		activeSignals = nil
	}
}

func sendSignal(sig pal.Signal) bool {
	activeSignalsMu.Lock()
	defer activeSignalsMu.Unlock()
	if activeSignals == nil {
		return false
	}
	return activeSignals.send(sig)
}

func resolvePath(cwd string, p string) string {
	if path.IsAbs(p) {
		return p
	}
	return path.Join(cwd, p)
}

func wasmPal(fsys *bridgeFS, cwd string, stderr, stdout io.Writer, signals pal.SignalSource) pal.Platform {
	return pal.Platform{
		IO: pal.IO{
			Stdout: stdout.Write,
			Stderr: stderr.Write,
		},
		FS: pal.FS{
			ReadFile: func(p string) ([]byte, error) {
				return fs.ReadFile(fsys, resolvePath(cwd, p))
			},
			WriteFile: func(p string, data []byte) error {
				return fsys.WriteFile(resolvePath(cwd, p), data, 0o644)
			},
			AppendFile: func(p string, data []byte) error {
				resolved := resolvePath(cwd, p)
				current, err := fs.ReadFile(fsys, resolved)
				if err != nil && !errors.Is(err, fs.ErrNotExist) {
					return err
				}
				return fsys.WriteFile(resolved, append(current, data...), 0o644)
			},
		},
		OS: pal.OS{
			GetEnv: func(name string) string {
				panic("GetEnv is not supported in WASM environment")
			},
			GetUsername: func() string {
				panic("GetUsername is not supported in WASM environment")
			},
			GetUserHome: func() string {
				panic("GetUserHome is not supported in WASM environment")
			},
			SetEnv: func(key, val string) error {
				panic("SetEnv is not supported in WASM environment")
			},
			UnsetEnv: func(key string) error {
				panic("UnsetEnv is not supported in WASM environment")
			},
			ListEnv: func() map[string]string {
				panic("ListEnv is not supported in WASM environment")
			},
			Exec: func(command string, args []string, envOverride map[string]string) (pal.ProcessHandle, error) {
				panic("Exec is not supported in WASM environment")
			},
		},
		Time: pal.Time{
			Now:          time.Now,
			MonotonicNow: func() time.Duration { return time.Since(wasmProcessStart) },
		},
		HTTP: pal.HTTP{
			NewClient: func(cfg pal.ClientConfig) pal.HTTPClient {
				return &fetchHTTPClient{cfg: cfg}
			},
			Listen: activeHTTPServices.register,
		},
		Signals: signals,
	}
}
