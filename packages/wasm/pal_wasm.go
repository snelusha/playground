package main

import (
	"ballerina-lang-go/platform/pal"
	"io"
)

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
