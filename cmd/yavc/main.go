// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

// yavc is the yavc.app engine: one binary serving the desktop, every
// applet at its own subdomain, and the readers' sessions (DESIGN.md).
package main

import (
	"flag"
	"log"
	"net/http"
	"strings"
	"time"

	"yavc.app/internal/session"
	"yavc.app/internal/web"
)

func main() {
	addr := flag.String("addr", "127.0.0.1:8400", "the address to listen on")
	domain := flag.String("domain", "localhost", "the site's domain; applets answer at {name}.domain")
	secure := flag.Bool("secure", false, "the site is reached over HTTPS, so cookies are marked Secure")
	applets := flag.String("applets", "applets,apps", "folders of installed applet packages, comma-separated")
	pudl := flag.String("pudl", "web/pudl", "the folder holding PUDL's dist files")
	data := flag.String("data", "data", "the folder the engine keeps sessions in")
	retain := flag.Duration("retain", 90*24*time.Hour, "how long a session lives unseen")
	title := flag.String("title", "yavc.app", "the site's name")
	flag.Parse()

	store, err := session.New(*data, *retain)
	if err != nil {
		log.Fatalf("the data folder cannot be used: %v", err)
	}
	if n := store.Sweep(); n > 0 {
		log.Printf("%d expired sessions removed", n)
	}
	go func() {
		for range time.Tick(time.Hour) {
			store.Sweep()
		}
	}()

	s, err := web.New(&web.Server{
		Domain: *domain, Secure: *secure, Applets: strings.Split(*applets, ","), PUDL: *pudl,
		Sessions: store, Title: *title,
	})
	if err != nil {
		log.Fatal(err)
	}
	log.Printf("yavc.app engine at http://%s for %s", *addr, *domain)
	srv := &http.Server{Addr: *addr, Handler: s, ReadHeaderTimeout: 10 * time.Second}
	log.Fatal(srv.ListenAndServe())
}
