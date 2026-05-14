package main

import (
	"ballerina-lang-go/pal"
	"bytes"
)

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
	}
}
