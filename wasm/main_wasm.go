package main

import (
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
		printDiagnostics(fsys, os.Stderr, diags)
		return nil
	}

	project := result.Project()
	pkg := project.CurrentPackage()

	compilation := pkg.Compilation()
	diags = compilation.DiagnosticResult()
	if diags.HasErrors() {
		printDiagnostics(fsys, os.Stderr, diags)
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
