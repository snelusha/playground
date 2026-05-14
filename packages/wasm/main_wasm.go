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
	"ballerina-lang-go/projects"
	"ballerina-lang-go/runtime"
	"ballerina-lang-go/tools/diagnostics"
	"fmt"
	"syscall/js"
)

func main() {
	js.Global().Set("run", js.FuncOf(run))
	js.Global().Set("getDiagnostics", js.FuncOf(getDiagnostics))

	select {}
}

func runOutcome(stdout, stderr string) map[string]any {
	return map[string]any{
		"stdout": stdout,
		"stderr": stderr,
	}
}

func run(_ js.Value, args []js.Value) any {
	return newPromise(func(resolve js.Value, _ js.Value) {
		go func() {
			onOutput := js.Null()
			if len(args) >= 3 {
				onOutput = args[2]
			}

			stderr := outputWriter{onOutput: onOutput, stream: "stderr"}
			stdout := outputWriter{onOutput: onOutput, stream: "stdout"}
			done := func() { resolve.Invoke(js.Undefined()) }

			defer func() {
				if r := recover(); r != nil {
					fmt.Fprintf(stderr, "%v\n", r)
				}
				done()
			}()

			if len(args) < 2 {
				fmt.Fprintf(stderr, "expected at least 2 arguments: (fsProxy, path[, onOutput])\n")
				return
			}

			proxy := args[0]
			path := args[1].String()
			fsys := NewBridgeFS(proxy)

			result, err := projects.Load(fsys, path)
			if err != nil {
				fmt.Fprintf(stderr, "%v\n", err)
				return
			}

			if diags := result.Diagnostics(); diags.HasErrors() {
				printDiagnostics(fsys, path, stderr, diags, diagnostics.NewDiagnosticEnv())
				return
			}

			compilation := result.Project().CurrentPackage().Compilation()
			if diags := compilation.DiagnosticResult(); diags.HasErrors() {
				printDiagnostics(fsys, path, stderr, diags, compilation.DiagnosticEnv())
				return
			}

			project := result.Project()

			birPkgs := projects.NewBallerinaBackend(compilation).BIRPackages()
			if len(birPkgs) == 0 {
				fmt.Fprintf(stderr, "BIR generation failed: no BIR package produced\n")
				return
			}

			pal := wasmPal(stderr, stdout)
			rt := runtime.NewRuntime(pal, project.Environment().TypeEnv())
			for _, birPkg := range birPkgs {
				if err := rt.Interpret(*birPkg); err != nil {
					fmt.Fprintf(stderr, "%v\n", err)
					return
				}
			}
		}()
	})
}

func getDiagnostics(_ js.Value, args []js.Value) any {
	return newPromise(func(resolve js.Value, reject js.Value) {
		defer func() {
			if r := recover(); r != nil {
				resolve.Invoke(js.ValueOf([]any{}))
			}
		}()

		if len(args) < 2 {
			resolve.Invoke(js.ValueOf([]any{}))
			return
		}

		proxy := args[0]
		path := args[1].String()
		fsys := NewBridgeFS(proxy)

		result, err := projects.Load(fsys, path)
		if err != nil {
			resolve.Invoke(js.ValueOf([]any{}))
			return
		}

		if result.Diagnostics().HasErrors() {
			resolve.Invoke(mapDiagnostics(result.Diagnostics().Diagnostics(), diagnostics.NewDiagnosticEnv()))
			return
		}

		compilation := result.Project().CurrentPackage().Compilation()
		if compilation.DiagnosticResult().HasErrors() {
			resolve.Invoke(mapDiagnostics(compilation.DiagnosticResult().Diagnostics(), compilation.DiagnosticEnv()))
			return
		}

		resolve.Invoke(js.ValueOf([]any{}))
	})
}

type outputWriter struct {
	onOutput js.Value
	stream   string
}

func (w outputWriter) Write(p []byte) (int, error) {
	emitOutput(w.onOutput, w.stream, string(p))
	return len(p), nil
}

func emitOutput(onOutput js.Value, stream, text string) {
	if onOutput.Type() != js.TypeFunction {
		return
	}
	onOutput.Invoke(map[string]any{
		"stream": stream,
		"text":   text,
	})
}

func mapDiagnostics(diags []diagnostics.Diagnostic, de *diagnostics.DiagnosticEnv) []any {
	mapped := make([]any, 0, len(diags))
	for _, d := range diags {
		location := d.Location()
		if diagnostics.IsLocationEmpty(location) || !diagnostics.LocationHasSource(location) {
			continue
		}

		start := map[string]any{"line": de.StartLine(location), "character": de.StartColumn(location)}
		end := map[string]any{"line": de.EndLine(location), "character": de.EndColumn(location)}
		mapped = append(mapped, map[string]any{
			"range": map[string]any{
				"start": start,
				"end":   end,
			},
			"severity": 1,
			"message":  d.Message(),
		})
	}
	return mapped
}
