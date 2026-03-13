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
	"path/filepath"
)

func main() {
	fmt.Println("Ballerina WASM Runtime")
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: wasm <path>")
		os.Exit(1)
	}
	if result := execute(os.Args[1]); result != nil {
		if errMsg, ok := result["error"]; ok {
			fmt.Fprintln(os.Stderr, errMsg)
			os.Exit(1)
		}
	}
}

func execute(path string) map[string]any {
	info, err := os.Stat(path)
	if err != nil {
		return jsError(err)
	}

	baseDir := path
	if !info.IsDir() {
		baseDir = filepath.Dir(path)
		path = filepath.Base(path)
	} else {
		path = "."
	}

	fsys := os.DirFS(baseDir)

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
	bir := backend.BIR()

	if bir == nil {
		return jsError(fmt.Errorf("BIR generation failed"))
	}

	rt := runtime.NewRuntime()
	if err := rt.Interpret(*bir); err != nil {
		return jsError(err)
	}

	return nil
}

func jsError(err error) map[string]any {
	return map[string]any{
		"error": err.Error(),
	}
}
