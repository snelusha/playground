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

	fsys := NewLocalStorageFS(proxy)

	result, err := projects.Load(fsys, path)
	if err != nil {
		return jsError(err)
	}

	diags := result.Diagnostics()
	if diags.HasErrors() {
		printDiagnostics(fsys, path, os.Stderr, diags, diagnostics.NewDiagnosticEnv())
		return nil
	}

	project := result.Project()
	pkg := project.CurrentPackage()

	compilation := pkg.Compilation()
	diags = compilation.DiagnosticResult()
	if diags.HasErrors() {
		printDiagnostics(fsys, path, os.Stderr, diags, compilation.DiagnosticEnv())
		return nil
	}

	backend := projects.NewBallerinaBackend(compilation)
	birPkgs := backend.BIRPackages()

	if len(birPkgs) == 0 {
		return jsError(fmt.Errorf("BIR generation failed: no BIR package produced"))
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
