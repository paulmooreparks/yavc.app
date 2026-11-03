//go:build js && wasm

// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

package d2api

// The browser build refuses ELK (see elkInBuild).
func init() { elkInBuild = false }
