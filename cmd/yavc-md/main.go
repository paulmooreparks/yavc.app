//go:build js && wasm

// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

// yavc-md is the Markdown engine the Editor runs in the browser, compiled
// to WebAssembly, so a document's text never leaves the browser (DESIGN.md,
// decision 11). It puts one object on the page, yavcMd, with one function
// for each of internal/mdapi's, which take and return JSON text; the
// functions themselves, and what each returns, are in that package.
package main

import (
	"encoding/json"
	"fmt"
	"syscall/js"

	"yavc.app/internal/mdapi"
)

// fn makes the page's function for one of mdapi's. mdapi.Call recovers
// from a panic in the function itself; this recovers from one in reading
// the page's argument, so no call can stop the engine.
func fn(name string) js.Func {
	return js.FuncOf(func(this js.Value, args []js.Value) (out any) {
		defer func() {
			if r := recover(); r != nil {
				b, _ := json.Marshal(map[string]string{"error": fmt.Sprintf("%s%s: %v", mdapi.Failed, name, r)})
				out = string(b)
			}
		}()
		arg := ""
		if len(args) > 0 {
			arg = args[0].String()
		}
		return mdapi.Call(name, arg)
	})
}

func main() {
	api := js.Global().Get("Object").New()
	for _, name := range mdapi.Names() {
		api.Set(name, fn(name))
	}
	js.Global().Set("yavcMd", api)
	select {}
}
