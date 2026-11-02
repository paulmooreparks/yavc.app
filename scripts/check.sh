#!/usr/bin/env bash
# Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
#
# Every check the repository holds itself to, in one command, run before a
# commit and by CI on every push (docs/review.md). It stops at the first
# failure and says which check failed.
#
#   scripts/check.sh              everything
#   scripts/check.sh --since REF  also the checks that compare with git ref REF
#                                 (an applet changed since REF has a new version)
set -euo pipefail
cd "$(dirname "$0")/.."

since=()
if [[ "${1:-}" == "--since" && -n "${2:-}" ]]; then since=(--since "$2"); fi

step() { printf '\n== %s\n' "$1"; }

step "Go formatting"
unformatted=$(gofmt -l cmd internal)
if [[ -n "$unformatted" ]]; then echo "gofmt would change:"; echo "$unformatted"; exit 1; fi

step "go vet, server and WebAssembly"
go vet ./...
GOOS=js GOARCH=wasm go vet ./cmd/yavc-md

step "Go tests"
# The race detector needs cgo; CI has it, a Windows machine without a C
# compiler does not.
if [[ "$(go env CGO_ENABLED)" == "1" ]] && command -v "$(go env CC)" >/dev/null 2>&1; then
  go test -race -count=1 ./...
else
  echo "(no C compiler here, so without the race detector)"
  go test -count=1 ./...
fi

step "Builds: the engine and the Markdown engine for the browser"
go build -o /dev/null ./cmd/yavc
GOOS=js GOARCH=wasm go build -o /dev/null ./cmd/yavc-md

step "The project's own rules"
node scripts/check.mjs "${since[@]}"

printf '\nAll checks passed.\n'
