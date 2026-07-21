package main

import (
	"ballerina-lang-go/platform/pal"
	"sync"
)

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
