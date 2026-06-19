package main

import (
	"ballerina-lang-go/platform/pal"
	"fmt"
	"io"
	"strings"
	"sync"
	"syscall/js"
	"time"
)

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

func (c *fetchHTTPClient) Execute(method, url string, body []byte, contentType string, reqHeaders map[string][]string) (int, map[string][]string, []byte, error) {
	fetch := js.Global().Get("fetch")
	if !fetch.Truthy() {
		return 0, nil, nil, fmt.Errorf("browser fetch API is not available")
	}

	reqCtx := &requestContext{}
	defer reqCtx.cleanup()

	options := c.buildFetchOptions(method, body, contentType, reqHeaders, reqCtx)

	resp, err := c.executeRequest(fetch, url, options)
	if err != nil {
		return 0, nil, nil, err
	}

	respHeaders := c.extractHeaders(resp)
	respBody, err := c.extractBody(resp)
	if err != nil {
		return 0, nil, nil, err
	}

	return resp.Get("status").Int(), respHeaders, respBody, nil
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

func wasmPal(stderr, stdout io.Writer, signals pal.SignalSource) pal.Platform {
	return pal.Platform{
		IO: pal.IO{
			Stdout: stdout.Write,
			Stderr: stderr.Write,
		},
		HTTP: pal.HTTP{
			NewClient: func(cfg pal.ClientConfig) pal.HTTPClient {
				return &fetchHTTPClient{cfg: cfg}
			},
		},
		Signals: signals,
	}
}
