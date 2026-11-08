// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

// yavc is the yavc.app engine: one binary serving the desktop, every
// applet at its own subdomain, and the readers' sessions (DESIGN.md).
package main

import (
	"context"
	"errors"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
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
	pages := flag.String("pages", "pages", "the folder of the site's pages, Markdown files served at /{slug}")
	bin := flag.String("bin", "site/bin", "the folder of the site's scripts, listed by the file system under /site/bin")
	home := flag.String("home", "site/home", "the folder of the stock files a reader's home folder starts with")
	data := flag.String("data", "data", "the folder the engine keeps sessions in")
	retain := flag.Duration("retain", 90*24*time.Hour, "how long a session lives unseen")
	title := flag.String("title", "yavc.app", "the site's name")
	grouping := flag.String("document-grouping", "single", "editing windows: single or tabbed")
	flag.Parse()
	if *grouping != "single" && *grouping != "tabbed" {
		log.Fatal("document-grouping must be single or tabbed")
	}

	// The engine stops on an interrupt or a termination signal, letting the
	// requests in progress finish first.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	store, err := session.New(*data, *retain)
	if err != nil {
		log.Fatalf("the data folder cannot be used: %v", err)
	}
	if n := store.Sweep(); n > 0 {
		log.Printf("%d expired sessions removed", n)
	}
	go func() {
		t := time.NewTicker(time.Hour)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				if n := store.Sweep(); n > 0 {
					log.Printf("%d expired sessions removed", n)
				}
			}
		}
	}()

	s, err := web.New(&web.Server{
		Domain: *domain, Secure: *secure, Applets: strings.Split(*applets, ","), PUDL: *pudl, Pages: *pages, Bin: *bin, Home: *home,
		Sessions: store, Title: *title, DocumentGrouping: *grouping,
	})
	if err != nil {
		log.Fatal(err)
	}
	go s.Run(ctx)

	// Requests take their context from base, which is cancelled when the
	// engine begins to stop, so the pages' event streams end and let the
	// shutdown finish.
	base, cancelBase := context.WithCancel(context.Background())
	defer cancelBase()
	srv := s.HTTPServer(base, *addr)
	served := make(chan error, 1)
	go func() {
		log.Printf("yavc.app engine at http://%s for %s", *addr, *domain)
		served <- srv.ListenAndServe()
	}()
	select {
	case err := <-served:
		if !errors.Is(err, http.ErrServerClosed) {
			log.Fatal(err)
		}
		return
	case <-ctx.Done():
	}
	log.Print("stopping")
	cancelBase()
	shutdown, done := context.WithTimeout(context.Background(), 15*time.Second)
	defer done()
	if err := srv.Shutdown(shutdown); err != nil {
		log.Printf("stopping: %v", err)
	}
}
