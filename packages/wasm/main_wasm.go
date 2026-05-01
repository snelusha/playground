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
	_ "ballerina-lang-go/lib/rt"
	"ballerina-lang-go/pal"
	"ballerina-lang-go/projects"
	"ballerina-lang-go/runtime"
	"ballerina-lang-go/tools/diagnostics"
	"fmt"
	"io"
	"os"
	"syscall/js"
)

func main() {
	js.Global().Set("run", js.FuncOf(run))

	select {}
}

func run(this js.Value, args []js.Value) any {
	defer func() {
		if r := recover(); r != nil {
			fmt.Fprintf(os.Stderr, "%v\n", r)
		}
	}()

	if len(args) < 2 {
		return jsError(fmt.Errorf("expected at least 2 arguments: (fsProxy, path)"))
	}

	proxy := args[0]
	path := args[1].String()
	stdoutWriter, stderrWriter, diagnosticWriter := resolveIOWriters(args)

	fsys := NewLocalStorageFS(proxy)

	result, err := projects.Load(fsys, path)
	if err != nil {
		return jsError(err)
	}

	diags := result.Diagnostics()
	if diags.HasErrors() {
		printDiagnostics(fsys, path, diagnosticWriter, diags, diagnostics.NewDiagnosticEnv())
		return nil
	}

	project := result.Project()
	pkg := project.CurrentPackage()

	compilation := pkg.Compilation()
	diags = compilation.DiagnosticResult()
	if diags.HasErrors() {
		printDiagnostics(fsys, path, diagnosticWriter, diags, compilation.DiagnosticEnv())
		return nil
	}

	backend := projects.NewBallerinaBackend(compilation)
	birPkgs := backend.BIRPackages()

	if len(birPkgs) == 0 {
		return jsError(fmt.Errorf("BIR generation failed: no BIR package produced"))
	}

	// FIXME: This is a copy of nativePal and should be replaced with a proper implementation.
	wasmPal := newWasmPal(stdoutWriter, stderrWriter)

	rt := runtime.NewRuntime(wasmPal)

	for _, birPkg := range birPkgs {
		if err := rt.Interpret(*birPkg); err != nil {
			return jsError(err)
		}
	}

	return nil
}

func jsError(err error) map[string]any {
	return map[string]any{
		"error": err.Error(),
	}
}

type writeFunc func([]byte) (int, error)

func (w writeFunc) Write(p []byte) (int, error) {
	return w(p)
}

func jsValueWriter(fn js.Value) func([]byte) (int, error) {
	return func(p []byte) (int, error) {
		fn.Invoke(string(p))
		return len(p), nil
	}
}

func resolveIOWriters(args []js.Value) (stdout writeFunc, stderr writeFunc, diagnosticsWriter io.Writer) {
	stdout = writeFunc(os.Stdout.Write)
	stderr = writeFunc(os.Stderr.Write)
	diagnosticsWriter = io.Writer(os.Stderr)

	if len(args) < 3 || args[2].Type() != js.TypeObject {
		return stdout, stderr, diagnosticsWriter
	}

	ioHandlers := args[2]
	if stdoutFn := ioHandlers.Get("stdout"); stdoutFn.Type() == js.TypeFunction {
		stdout = writeFunc(jsValueWriter(stdoutFn))
	}
	if stderrFn := ioHandlers.Get("stderr"); stderrFn.Type() == js.TypeFunction {
		stderr = writeFunc(jsValueWriter(stderrFn))
		diagnosticsWriter = stderr
	}
	return stdout, stderr, diagnosticsWriter
}

func newWasmPal(stdout writeFunc, stderr writeFunc) pal.Platform {
	return pal.Platform{
		IO: pal.IO{
			Stdout: stdout,
			Stderr: stderr,
		},
	}
}
