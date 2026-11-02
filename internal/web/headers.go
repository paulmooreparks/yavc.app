// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

package web

import "net/http"

// contentSecurityPolicy is what every page may load and run (security
// review, 2026-11-03). Scripts come only from this origin and from
// Plausible (DESIGN.md, decision 6), with no inline script, so a slip in
// the HTML sanitizer cannot become running code. WebAssembly runs the
// Markdown engine and the Terminal's shell. Styles may be inline, because
// PUDL and the applications set style attributes and build stylesheets in
// script; a document's own styles are filtered by apps/md-engine/safe-html.js.
// Pictures may come from anywhere on the web, as a document's pictures do,
// and frames only from the two video players the video shortcode knows.
const contentSecurityPolicy = "default-src 'self'; " +
	"script-src 'self' 'wasm-unsafe-eval' https://plausible.io; " +
	"style-src 'self' 'unsafe-inline'; " +
	"img-src 'self' data: blob: https:; " +
	"media-src 'self' data: blob:; " +
	"font-src 'self' data:; " +
	"connect-src 'self' https://plausible.io; " +
	"frame-src https://www.youtube-nocookie.com https://player.vimeo.com; " +
	"worker-src 'self' blob:; " +
	"object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'"

// securityHeaders sets the headers every response carries. secure says the
// site is reached over HTTPS, so browsers are told to keep to it.
func securityHeaders(h http.Header, secure bool) {
	h.Set("Content-Security-Policy", contentSecurityPolicy)
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("X-Frame-Options", "SAMEORIGIN")
	h.Set("Referrer-Policy", "same-origin")
	h.Set("Cross-Origin-Opener-Policy", "same-origin-allow-popups")
	if secure {
		h.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
	}
}
