// Copyright (c) 2026, WSO2 LLC. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

package main

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"io/fs"
	"path"
	"strconv"
	"strings"
	"sync"
	"syscall/js"

	"github.com/ballerina-nutcracker/ballerina/ls/core/compile"
	"github.com/ballerina-nutcracker/ballerina/ls/core/event"
	"github.com/ballerina-nutcracker/ballerina/ls/core/workspace"
	"github.com/ballerina-nutcracker/ballerina/ls/server"
)

// languageServerTransport adapts browser messages to the framed byte stream
// used by the LSP server. The framing remains an implementation detail of this
// host: callers exchange one JSON-RPC message per call.
type languageServerTransport struct {
	incoming  chan []byte
	onMessage js.Value

	readMu  sync.Mutex
	pending *bytes.Reader
}

func (t *languageServerTransport) Read(p []byte) (int, error) {
	t.readMu.Lock()
	defer t.readMu.Unlock()
	for t.pending == nil || t.pending.Len() == 0 {
		message, ok := <-t.incoming
		if !ok {
			return 0, io.EOF
		}
		t.pending = bytes.NewReader(message)
	}
	return t.pending.Read(p)
}

func (t *languageServerTransport) Write(p []byte) (int, error) {
	frame := string(p)
	header, payload, ok := strings.Cut(frame, "\r\n\r\n")
	if !ok {
		return 0, fmt.Errorf("language server wrote an unframed message")
	}
	for _, line := range strings.Split(header, "\r\n") {
		name, value, found := strings.Cut(line, ":")
		if !found || !strings.EqualFold(strings.TrimSpace(name), "Content-Length") {
			continue
		}
		length, err := strconv.Atoi(strings.TrimSpace(value))
		if err != nil || length != len(payload) {
			return 0, fmt.Errorf("language server wrote an invalid Content-Length")
		}
		t.onMessage.Invoke(payload)
		return len(p), nil
	}
	return 0, fmt.Errorf("language server wrote a message without Content-Length")
}

type rootedBridgeFS struct {
	base *bridgeFS
	root string
}

func (f rootedBridgeFS) Open(name string) (fs.File, error) {
	if !fs.ValidPath(name) {
		return nil, &fs.PathError{Op: "open", Path: name, Err: fs.ErrInvalid}
	}
	if name == "." {
		return f.base.Open(f.root)
	}
	return f.base.Open(path.Join(f.root, name))
}

type languageServerInstance struct {
	transport *languageServerTransport
	projects  *workspace.ProjectService
	compiler  *compile.CompilationService
	bus       *event.Bus
}

var activeLanguageServer struct {
	sync.Mutex
	instance *languageServerInstance
}

func startLanguageServer(_ js.Value, args []js.Value) any {
	if len(args) != 2 {
		return js.ValueOf("startLanguageServer: expected (fsProxy, onMessage)")
	}
	if args[1].Type() != js.TypeFunction {
		return js.ValueOf("startLanguageServer: onMessage must be a function")
	}

	activeLanguageServer.Lock()
	defer activeLanguageServer.Unlock()
	if activeLanguageServer.instance != nil {
		return js.Null()
	}

	bridge := NewBridgeFS(args[0])
	transport := &languageServerTransport{
		incoming:  make(chan []byte, 64),
		onMessage: args[1],
	}
	bus := event.New()
	projects := workspace.New(func(root string) fs.FS {
		return rootedBridgeFS{base: bridge, root: root}
	}, bus)
	compiler := compile.New(projects, bus)
	instance := &languageServerInstance{
		transport: transport,
		projects:  projects,
		compiler:  compiler,
		bus:       bus,
	}
	activeLanguageServer.instance = instance

	go func() {
		defer func() {
			_ = projects.Shutdown(context.Background())
			compiler.Shutdown()
			bus.Close()
			activeLanguageServer.Lock()
			if activeLanguageServer.instance == instance {
				activeLanguageServer.instance = nil
			}
			activeLanguageServer.Unlock()
		}()
		_ = server.New(transport, projects, compiler, bus).Serve()
	}()
	return js.Null()
}

func flushLanguageServer(_ js.Value, _ []js.Value) any {
	activeLanguageServer.Lock()
	instance := activeLanguageServer.instance
	activeLanguageServer.Unlock()
	if instance == nil {
		return js.ValueOf("language server is not started")
	}
	instance.compiler.Flush()
	instance.bus.Flush()
	return js.Null()
}

func sendLanguageServerMessage(_ js.Value, args []js.Value) any {
	if len(args) != 1 || args[0].Type() != js.TypeString {
		return js.ValueOf("sendLanguageServerMessage: expected a JSON-RPC message")
	}
	activeLanguageServer.Lock()
	instance := activeLanguageServer.instance
	activeLanguageServer.Unlock()
	if instance == nil {
		return js.ValueOf("language server is not started")
	}
	payload := []byte(args[0].String())
	frame := []byte(fmt.Sprintf("Content-Length: %d\r\n\r\n", len(payload)))
	frame = append(frame, payload...)
	instance.transport.incoming <- frame
	return js.Null()
}
