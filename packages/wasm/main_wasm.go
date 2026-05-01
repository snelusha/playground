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
	"os"
	"syscall/js"
)

func main() {
	js.Global().Set("run", js.FuncOf(run))
	js.Global().Set("getDiagnostics", js.FuncOf(getDiagnostics))

	select {}
}

func run(_ js.Value, args []js.Value) any {
	return newPromise(func(resolve js.Value, _ js.Value) {
		go func() {
			defer func() {
				if r := recover(); r != nil {
					fmt.Fprintf(os.Stderr, "%v\n", r)
					resolve.Invoke(jsError(fmt.Errorf("%v", r)))
				}
			}()

			if len(args) < 2 {
				resolve.Invoke(jsError(fmt.Errorf("expected at least 2 arguments: (fsProxy, path)")))
				return
			}

			proxy := args[0]
			path := args[1].String()
			fsys := NewBridgeFS(proxy)

			result, err := projects.Load(fsys, path)
			if err != nil {
				resolve.Invoke(jsError(err))
				return
			}

			if diags := result.Diagnostics(); diags.HasErrors() {
				printDiagnostics(fsys, path, os.Stderr, diags, diagnostics.NewDiagnosticEnv())
				resolve.Invoke(js.Null())
				return
			}

			compilation := result.Project().CurrentPackage().Compilation()
			if diags := compilation.DiagnosticResult(); diags.HasErrors() {
				printDiagnostics(fsys, path, os.Stderr, diags, compilation.DiagnosticEnv())
				resolve.Invoke(js.Null())
				return
			}

			birPkgs := projects.NewBallerinaBackend(compilation).BIRPackages()
			if len(birPkgs) == 0 {
				resolve.Invoke(jsError(fmt.Errorf("BIR generation failed: no BIR package produced")))
				return
			}

			// FIXME: This is a copy of nativePal and should be replaced with a proper implementation.
			wasmPal := pal.Platform{
				IO: pal.IO{
					Stdout: func(p []byte) (n int, err error) {
						return os.Stdout.Write(p)
					},
					Stderr: func(p []byte) (n int, err error) {
						return os.Stderr.Write(p)
					},
				},
			}

			rt := runtime.NewRuntime(wasmPal)
			for _, birPkg := range birPkgs {
				if err := rt.Interpret(*birPkg); err != nil {
					resolve.Invoke(jsError(err))
					return
				}
			}

			resolve.Invoke(js.Null())
		}()
	})
}

func mapDiagnostics(diags []diagnostics.Diagnostic) []any {
	mapped := make([]any, len(diags))
	for i, d := range diags {
		lineRange := d.Location().LineRange()
		start := map[string]any{"line": lineRange.StartLine().Line(), "character": lineRange.StartLine().Offset()}
		end := map[string]any{"line": lineRange.EndLine().Line(), "character": lineRange.EndLine().Offset()}
		mapped[i] = map[string]any{
			"range": map[string]any{
				"start": start,
				"end":   end,
			},
			"severity": 1,
			"message":  d.Message(),
		}
	}
	return mapped
}

func getDiagnostics(_ js.Value, args []js.Value) any {
	return newPromise(func(resolve js.Value, reject js.Value) {
		defer func() {
			if r := recover(); r != nil {
				reject.Invoke(jsError(fmt.Errorf("%v", r)))
			}
		}()

		if len(args) < 2 {
			reject.Invoke(jsError(fmt.Errorf("expected at least 2 arguments: (fsProxy, path)")))
			return
		}

		proxy := args[0]
		path := args[1].String()
		fsys := NewBridgeFS(proxy)

		result, err := directory.LoadProject(fsys, path)
		if err != nil {
			reject.Invoke(jsError(err))
			return
		}

		if result.Diagnostics().HasErrors() {
			resolve.Invoke(mapDiagnostics(result.Diagnostics().Diagnostics()))
			return
		}

		compilation := result.Project().CurrentPackage().Compilation()
		if compilation.DiagnosticResult().HasErrors() {
			resolve.Invoke(mapDiagnostics(compilation.DiagnosticResult().Diagnostics()))
			return
		}

		resolve.Invoke(js.ValueOf([]any{}))
	})
}

func jsError(err error) map[string]any {
	return map[string]any{
		"error": err.Error(),
	}
}
