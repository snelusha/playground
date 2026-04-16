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
	"fmt"
	"os"
	"syscall/js"
)

func main() {
	js.Global().Set("run", js.FuncOf(run))

	select {}
}

func run(this js.Value, args []js.Value) any {
	return newPromise(func(resolve js.Value, reject js.Value) {
		defer func() {
			if r := recover(); r != nil {
				panicErr := fmt.Errorf("%v", r)
				fmt.Fprintf(os.Stderr, "%v\n", panicErr)
				reject.Invoke(js.ValueOf(jsError(panicErr)))
			}
		}()

		if len(args) < 2 {
			reject.Invoke(js.ValueOf(jsError(fmt.Errorf("expected at least 2 arguments: (fsProxy, path)"))))
			return
		}

		proxy := args[0]
		path := args[1].String()

		fsys := NewLocalStorageFS(proxy)

		result, err := directory.LoadProject(fsys, path)
		if err != nil {
			reject.Invoke(js.ValueOf(jsError(err)))
			return
		}

		diags := result.Diagnostics()
		if diags.HasErrors() {
			printDiagnostics(fsys, path, os.Stderr, diags)
			resolve.Invoke(js.Null())
			return
		}

		project := result.Project()
		pkg := project.CurrentPackage()

		compilation := pkg.Compilation()
		diags = compilation.DiagnosticResult()
		if diags.HasErrors() {
			printDiagnostics(fsys, path, os.Stderr, diags)
			resolve.Invoke(js.Null())
			return
		}

		backend := projects.NewBallerinaBackend(compilation)
		birPkgs := backend.BIRPackages()

		if len(birPkgs) == 0 {
			reject.Invoke(js.ValueOf(jsError(fmt.Errorf("BIR generation failed: no BIR package produced"))))
			return
		}

		rt := runtime.NewRuntime()

		for _, birPkg := range birPkgs {
			if err := rt.Interpret(*birPkg); err != nil {
				reject.Invoke(js.ValueOf(jsError(err)))
				return
			}
		}

		resolve.Invoke(js.Null())
	})
}

func jsError(err error) map[string]any {
	return map[string]any{
		"error": err.Error(),
	}
}

func newPromise(executor func(resolve js.Value, reject js.Value)) js.Value {
	var promiseExecutor js.Func
	promiseExecutor = js.FuncOf(func(this js.Value, args []js.Value) any {
		resolve := args[0]
		reject := args[1]

		go func() {
			defer promiseExecutor.Release()
			executor(resolve, reject)
		}()

		return nil
	})

	return js.Global().Get("Promise").New(promiseExecutor)
}
