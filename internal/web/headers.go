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
//
// Analytics are sent only when the site is reached over HTTPS, which is the
// public site (DESIGN.md, decision 147). A copy run without it neither loads
// the script nor names Plausible's host in its policy, so the policy never
// allows a host the page does not use, and no page waits on a host outside
// the machine.
func contentSecurityPolicy(analytics bool) string {
	host := ""
	if analytics {
		host = " " + analyticsHost
	}
	return "default-src 'self'; " +
		"script-src 'self' 'wasm-unsafe-eval'" + host + "; " +
		"style-src 'self' 'unsafe-inline'; " +
		"img-src 'self' data: blob: https:; " +
		"media-src 'self' data: blob:; " +
		"font-src 'self' data:; " +
		"connect-src 'self'" + host + "; " +
		"frame-src https://www.youtube-nocookie.com https://player.vimeo.com; " +
		"worker-src 'self' blob:; " +
		"object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'"
}

// analyticsHost is the one host a page may load a script from or send to
// besides its own, on the public site.
const analyticsHost = "https://plausible.io"

// workerPolicy is the policy of the D2 engine's worker
// (apps/diagram-kit/worker.js; docs/diagrams-design.md, decision 3). A
// worker runs under the policy its own script was served with, which CSP
// Level 3 specifies, and not under the page's. D2 runs its layout engines'
// JavaScript through eval, which no page here may do, so the worker alone
// may; in return it may load nothing but this origin's scripts and reach
// no host at all, not even this one. The page compiles the engine and
// hands it over, and a diagram's text arrives as a message, so whatever
// ran in the worker could only answer the page that asked.
const workerPolicy = "default-src 'none'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'"

// engineWorker is the one script served with workerPolicy.
const engineWorker = "diagram-kit/worker.js"

// securityHeaders sets the headers every response carries. secure says the
// site is reached over HTTPS, so browsers are told to keep to it.
func securityHeaders(h http.Header, secure bool) {
	h.Set("Content-Security-Policy", contentSecurityPolicy(secure))
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("X-Frame-Options", "SAMEORIGIN")
	h.Set("Referrer-Policy", "same-origin")
	h.Set("Cross-Origin-Opener-Policy", "same-origin-allow-popups")
	if secure {
		h.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
	}
}
