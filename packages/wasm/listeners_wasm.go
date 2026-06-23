package main

import (
	"ballerina-lang-go/platform/pal"
	"context"
	"fmt"
	"net/http"
	"sync"
)

var activeListeners = &listenerRegistry{
	listeners: make(map[string]http.Handler),
}

type (
	listenerRegistry struct {
		mu        sync.RWMutex
		listeners map[string]http.Handler
	}
	wasmListenerHandle struct {
		cfg      pal.ServerConfig
		registry *listenerRegistry
	}
)

func (w *wasmListenerHandle) Close() error {
	w.registry.unregister(w.cfg)
	return nil
}

func (w *wasmListenerHandle) Shutdown(ctx context.Context) error {
	w.registry.unregister(w.cfg)
	return nil
}

func (r *listenerRegistry) register(cfg pal.ServerConfig, handler http.Handler) (pal.ServerHandle, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	host := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
	if _, exists := r.listeners[host]; exists {
		return nil, fmt.Errorf("listener already registered for host %s", host)
	}
	r.listeners[host] = handler
	return &wasmListenerHandle{cfg: cfg, registry: r}, nil
}

func (r *listenerRegistry) unregister(cfg pal.ServerConfig) {
	r.mu.Lock()
	defer r.mu.Unlock()
	host := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
	delete(r.listeners, host)
}

func (r *listenerRegistry) getHandler(host string) (http.Handler, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	handler, ok := r.listeners[host]
	return handler, ok
}

func (r *listenerRegistry) hosts() []any {
	r.mu.RLock()
	defer r.mu.RUnlock()

	hosts := make([]any, 0, len(r.listeners))
	for host := range r.listeners {
		hosts = append(hosts, host)
	}
	return hosts
}

func listen(cfg pal.ServerConfig, handler http.Handler) (pal.ServerHandle, error) {
	return activeListeners.register(cfg, handler)
}
