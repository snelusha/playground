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
	"ballerina-lang-go/projects/directory"
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

func mapDiagnostics(diags []diagnostics.Diagnostic) []any {
	out := make([]any, 0, len(diags))

	for _, d := range diags {
		loc := d.Location()
		lineRange := loc.LineRange()

		out = append(out, map[string]any{
			"message":  d.Message(),
			"severity": 1,
			"range": map[string]any{
				"start": map[string]any{
					"line":   lineRange.StartLine().Line(),
					"column": lineRange.StartLine().Offset(),
				},
				"end": map[string]any{
					"line":   lineRange.EndLine().Line(),
					"column": lineRange.EndLine().Offset(),
				},
			},
		})
	}

	return out
}

func computeDiagnostics(proxy js.Value, path string) (out any) {
	defer func() {
		if r := recover(); r != nil {
			fmt.Fprintf(os.Stderr, "%v\n", r)
			out = nil
		}
	}()

	fsys := NewLocalStorageFS(proxy)

	result, err := directory.LoadProject(fsys, path)
	if err != nil {
		return nil
	}

	diags := result.Diagnostics()
	if diags.HasErrors() {
		return mapDiagnostics(diags.Diagnostics())
	}

	project := result.Project()
	pkg := project.CurrentPackage()

	compilation := pkg.Compilation()
	diags = compilation.DiagnosticResult()
	if diags.HasErrors() {
		return mapDiagnostics(diags.Diagnostics())
	}

	return nil
}

func getDiagnostics(this js.Value, args []js.Value) any {
	if len(args) < 2 {
		return js.Global().Get("Promise").Call("resolve", js.Null())
	}

	proxy := args[0]
	path := args[1].String()

	executor := js.FuncOf(func(this js.Value, pargs []js.Value) any {
		resolve := pargs[0]
		go func() {
			result := computeDiagnostics(proxy, path)
			resolve.Invoke(result)
		}()
		return nil
	})
	promise := js.Global().Get("Promise").New(executor)
	executor.Release()
	return promise
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

	fsys := NewLocalStorageFS(proxy)

	result, err := directory.LoadProject(fsys, path)
	if err != nil {
		return jsError(err)
	}

	diags := result.Diagnostics()
	if diags.HasErrors() {
		printDiagnostics(fsys, path, os.Stderr, diags)
		return nil
	}

	project := result.Project()
	pkg := project.CurrentPackage()

	compilation := pkg.Compilation()
	diags = compilation.DiagnosticResult()
	if diags.HasErrors() {
		printDiagnostics(fsys, path, os.Stderr, diags)
		return nil
	}

	backend := projects.NewBallerinaBackend(compilation)
	birPkgs := backend.BIRPackages()

	if len(birPkgs) == 0 {
		return jsError(fmt.Errorf("BIR generation failed: no BIR package produced"))
	}

	rt := runtime.NewRuntime()

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
