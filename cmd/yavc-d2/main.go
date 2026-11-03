//go:build js && wasm

// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

// yavc-d2 is the D2 engine Diagrams, the Editor and Slides run in the
// browser, compiled to WebAssembly and run in a worker
// (apps/diagram-kit/worker.js; docs/diagrams-design.md), so a diagram's
// text never leaves the browser (DESIGN.md, decision 11). It puts one
// object on the worker's global scope, yavcD2, with one function for each
// of internal/d2api's, which take and return JSON text; the functions
// themselves, and what each returns, are in that package.
//
// D2 runs its dagre layout's JavaScript through the worker's eval, which
// is why it runs in a worker of its own with a policy of its own
// (internal/web, workerPolicy). ELK is refused in this build
// (internal/d2api, elkInBuild).
package main

import (
	"encoding/json"
	"fmt"
	"syscall/js"

	"yavc.app/internal/d2api"
)

// fn makes the worker's function for one of d2api's. d2api.Call recovers
// from a panic in the function itself; this recovers from one in reading
// the worker's argument, so no call can stop the engine.
func fn(name string) js.Func {
	return js.FuncOf(func(this js.Value, args []js.Value) (out any) {
		defer func() {
			if r := recover(); r != nil {
				b, _ := json.Marshal(map[string]string{"error": fmt.Sprintf("%s%s: %v", d2api.Failed, name, r)})
				out = string(b)
			}
		}()
		arg := ""
		if len(args) > 0 {
			arg = args[0].String()
		}
		return d2api.Call(name, arg)
	})
}

func main() {
	api := js.Global().Get("Object").New()
	for _, name := range d2api.Names() {
		api.Set(name, fn(name))
	}
	js.Global().Set("yavcD2", api)
	select {}
}
