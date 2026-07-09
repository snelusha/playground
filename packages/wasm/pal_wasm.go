package main

import (
	"ballerina-lang-go/platform/pal"
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"path"
	"strings"
	"sync"
	"syscall/js"
	"time"
)

var processStart = time.Now()

type fetchHTTPClient struct {
	cfg pal.ClientConfig
}

type requestContext struct {
	controller js.Value
	timer      *time.Timer
	cancelDone chan struct{}
}

func (ctx *requestContext) cleanup() {
	if ctx.timer != nil {
		ctx.timer.Stop()
	}
	if ctx.cancelDone != nil {
		close(ctx.cancelDone)
	}
}

func (c *fetchHTTPClient) Execute(ctx context.Context, method, url string, body io.Reader, _ int64, contentType string, reqHeaders map[string][]string) (int, map[string][]string, io.ReadCloser, error) {
	fetch := js.Global().Get("fetch")
	if !fetch.Truthy() {
		return 0, nil, nil, fmt.Errorf("browser fetch API is not available")
	}

	bodyBytes, err := readRequestBody(method, body)
	if err != nil {
		return 0, nil, nil, err
	}

	reqCtx := &requestContext{}
	defer reqCtx.cleanup()

	options := c.buildFetchOptions(ctx, method, bodyBytes, contentType, reqHeaders, reqCtx)
	resp, err := c.executeRequest(fetch, url, options)
	if err != nil {
		return 0, nil, nil, err
	}

	respHeaders := c.extractHeaders(resp)
	respBody, err := c.extractBody(resp)
	if err != nil {
		return 0, nil, nil, err
	}
	if c.cfg.ResponseLimits.MaxEntityBodySize != -1 && int64(len(respBody)) > c.cfg.ResponseLimits.MaxEntityBodySize {
		return 0, nil, nil, fmt.Errorf("response entity body size exceeds: %d bytes", c.cfg.ResponseLimits.MaxEntityBodySize)
	}

	return resp.Get("status").Int(), respHeaders, io.NopCloser(bytes.NewReader(respBody)), nil
}

func readRequestBody(method string, body io.Reader) ([]byte, error) {
	if body == nil || !methodAllowsBody(method) {
		return nil, nil
	}
	return io.ReadAll(body)
}

func (c *fetchHTTPClient) buildFetchOptions(ctx context.Context, method string, body []byte, contentType string, reqHeaders map[string][]string, reqCtx *requestContext) map[string]any {
	options := map[string]any{
		"method":   method,
		"headers":  c.buildHeaders(contentType, reqHeaders),
		"redirect": redirectMode(c.cfg.FollowRedirects.Enabled),
	}

	if body != nil {
		options["body"] = c.encodeBody(body)
	}
	if signal := c.setupAbortSignal(ctx, reqCtx); signal.Truthy() {
		options["signal"] = signal
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

func (c *fetchHTTPClient) setupAbortSignal(ctx context.Context, reqCtx *requestContext) js.Value {
	if ctx == nil {
		ctx = context.Background()
	}
	if c.cfg.Timeout <= 0 && ctx.Done() == nil {
		return js.Undefined()
	}

	reqCtx.controller = js.Global().Get("AbortController").New()
	if c.cfg.Timeout > 0 {
		reqCtx.timer = time.AfterFunc(c.cfg.Timeout, func() {
			reqCtx.controller.Call("abort")
		})
	}
	if ctx.Done() != nil {
		reqCtx.cancelDone = make(chan struct{})
		go func() {
			select {
			case <-ctx.Done():
				reqCtx.controller.Call("abort")
			case <-reqCtx.cancelDone:
			}
		}()
	}
	return reqCtx.controller.Get("signal")
}

func (c *fetchHTTPClient) executeRequest(fetch js.Value, url string, options map[string]any) (js.Value, error) {
	return awaitPromise(fetch.Invoke(url, js.ValueOf(options)))
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
				panic("GetEnv is not supported in Playground")
			},
			GetUsername: func() string {
				panic("GetUsername is not supported in Playground")
			},
			GetUserHome: func() string {
				panic("GetUserHome is not supported in Playground")
			},
			SetEnv: func(key, val string) error {
				panic("SetEnv is not supported in Playground")
			},
			UnsetEnv: func(key string) error {
				panic("UnsetEnv is not supported in Playground")
			},
			ListEnv: func() map[string]string {
				panic("ListEnv is not supported in Playground")
			},
			Exec: func(command string, args []string, envOverride map[string]string) (pal.ProcessHandle, error) {
				panic("Exec is not supported in Playground")
			},
		},
		Time: pal.Time{
			Now:          time.Now,
			MonotonicNow: func() time.Duration { return time.Since(processStart) },
		},
		HTTP: pal.HTTP{
			NewClient: func(cfg pal.ClientConfig) pal.HTTPClient {
				return &fetchHTTPClient{cfg: cfg}
			},
		},
		Signals: signals,
	}
}
