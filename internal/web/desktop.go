// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0

package web

import (
	"net/url"
	"slices"
	"strings"
)

// The desktop's state is its address (PUDL's window contract): open, the
// open windows; top, the one in front; min, the minimised ones; and p.<key>,
// each window's placement. The server writes each window button's href as
// the address of the state pressing it produces, and the taskbar's three
// links the same way, so a page without script still works and PUDL's
// script finds the links already pointed where it would point them.

type desktopState struct {
	open, min []string
	top       string
	query     url.Values // everything else, kept as it is
}

// maxWindows is the most windows an address may open; the rest of the
// list is ignored.
const maxWindows = 20

func parseDesktop(q url.Values) desktopState {
	d := desktopState{query: url.Values{}, top: q.Get("top")}
	// Each list keeps a window once, at its first place, and no more than
	// maxWindows of them.
	list := func(s string) []string {
		var out []string
		for _, k := range strings.Split(s, ",") {
			if len(out) == maxWindows {
				break
			}
			if k != "" && winKey.MatchString(k) && !slices.Contains(out, k) {
				out = append(out, k)
			}
		}
		return out
	}
	d.open, d.min = list(q.Get("open")), list(q.Get("min"))
	for k, v := range q {
		if k != "open" && k != "min" && k != "top" {
			d.query[k] = v
		}
	}
	return d
}

func (d desktopState) shown() []string {
	var out []string
	for _, k := range d.open {
		if !slices.Contains(d.min, k) {
			out = append(out, k)
		}
	}
	return out
}

func (d desktopState) String() string {
	q := url.Values{}
	for k, v := range d.query {
		q[k] = v
	}
	if len(d.open) > 0 {
		q.Set("open", strings.Join(d.open, ","))
	}
	if len(d.min) > 0 {
		q.Set("min", strings.Join(d.min, ","))
	}
	if d.top != "" && slices.Contains(d.shown(), d.top) {
		q.Set("top", d.top)
	}
	if len(q) == 0 {
		return "/"
	}
	return "/?" + q.Encode()
}

func (d desktopState) copy() desktopState {
	c := desktopState{open: slices.Clone(d.open), min: slices.Clone(d.min), top: d.top, query: url.Values{}}
	for k, v := range d.query {
		c.query[k] = slices.Clone(v)
	}
	return c
}

func (d desktopState) openWindow(key string) string {
	c := d.copy()
	if !slices.Contains(c.open, key) {
		c.open = append(c.open, key)
	}
	c.min = slices.DeleteFunc(c.min, func(k string) bool { return k == key })
	c.top = key
	return c.String()
}

// front chooses the window in front after key left the shown ones.
func (d *desktopState) front(key string) {
	if d.top != key {
		return
	}
	d.top = ""
	if s := d.shown(); len(s) > 0 {
		d.top = s[len(s)-1]
	}
}

func (d desktopState) minimize(key string) string {
	c := d.copy()
	if slices.Contains(c.open, key) && !slices.Contains(c.min, key) {
		c.min = append(c.min, key)
	}
	c.front(key)
	return c.String()
}

func (d desktopState) close(key string) string {
	c := d.copy()
	c.open = slices.DeleteFunc(c.open, func(k string) bool { return k == key })
	c.min = slices.DeleteFunc(c.min, func(k string) bool { return k == key })
	c.query.Del("p." + key)
	c.front(key)
	return c.String()
}

// maximize toggles the window between maximised and floating, keeping the
// numbers of its placement, which PUDL restores to.
func (d desktopState) maximize(key string, w, h string) string {
	c := d.copy()
	p := c.query.Get("p." + key)
	mode, nums := "floating", "0.05,0.06,"+w+","+h
	if i := strings.Index(p, ":"); i > 0 {
		mode, nums = p[:i], p[i+1:]
	}
	if mode == "maximized" {
		mode = "floating"
	} else {
		mode = "maximized"
	}
	c.query.Set("p."+key, mode+":"+nums)
	if !slices.Contains(c.open, key) {
		c.open = append(c.open, key)
	}
	c.min = slices.DeleteFunc(c.min, func(k string) bool { return k == key })
	c.top = key
	return c.String()
}

type barLinks struct {
	Back, Restore, CloseAll            string
	NoneShown, NoneMinimized, NoneOpen bool
}

func (d desktopState) bar() barLinks {
	all := d.copy()
	all.min = slices.Clone(all.open)
	all.top = ""
	none := d.copy()
	none.min = nil
	if none.top == "" && len(none.open) > 0 {
		none.top = none.open[len(none.open)-1]
	}
	closed := desktopState{query: url.Values{}}
	for k, v := range d.query {
		if !strings.HasPrefix(k, "p.") {
			closed.query[k] = v
		}
	}
	return barLinks{Back: all.String(), Restore: none.String(), CloseAll: closed.String(),
		NoneShown: len(d.shown()) == 0, NoneMinimized: len(d.min) == 0, NoneOpen: len(d.open) == 0}
}
