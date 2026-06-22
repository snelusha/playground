package main

import (
	"ballerina-lang-go/platform/pal"
	"io"
	"time"
)

var processStart = time.Now()

func wasmPal(stderr, stdout io.Writer, signals pal.SignalSource) pal.Platform {
	return pal.Platform{
		IO: pal.IO{
			Stdout: stdout.Write,
			Stderr: stderr.Write,
		},
		Time: pal.Time{
			Now:          time.Now,
			MonotonicNow: func() time.Duration { return time.Since(processStart) },
		},
		HTTP: pal.HTTP{
			NewClient: func(cfg pal.ClientConfig) pal.HTTPClient {
				return &fetchHTTPClient{cfg: cfg}
			},
			Listen: listen,
		},
		Signals: signals,
	}
}
