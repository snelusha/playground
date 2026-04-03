package main

import (
	"fmt"
	"syscall/js"
)

func echo(msg string) {
	fmt.Println(msg)
}

func add(a, b int) int {
	return a + b
}

func main() {
	done := make(chan struct{})

	js.Global().Set("echo", js.FuncOf(func(this js.Value, args []js.Value) interface{} {
		if len(args) < 1 {
			return nil
		}
		echo(args[0].String())
		return nil
	}))

	js.Global().Set("add", js.FuncOf(func(this js.Value, args []js.Value) interface{} {
		if len(args) < 2 {
			return nil
		}
		a := args[0].Int()
		b := args[1].Int()
		return add(a, b)
	}))

	<-done
}
