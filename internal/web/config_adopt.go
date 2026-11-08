// Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
package web

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"yavc.app/internal/session"
)

// adoptConfig fills absent settings once, under the same authority lock as PUT.
// Existing values, including explicit nulls, always win over migrated defaults.
func (s *Server) adoptConfig(w http.ResponseWriter, r *http.Request) {
	if !s.own(w, r) {
		return
	}
	name := r.PathValue("name")
	if !appletName.MatchString(name) {
		http.Error(w, "No such settings.", http.StatusNotFound)
		return
	}
	text, err := readText(r)
	if err != nil {
		s.done(w, err, "The settings could not be read.")
		return
	}
	var input struct {
		Marker   string                     `json:"marker"`
		Defaults map[string]json.RawMessage `json:"defaults"`
	}
	if json.Unmarshal([]byte(text), &input) != nil || input.Defaults == nil || input.Marker == "" || len(input.Marker) > 64 || input.Marker == "__proto__" || input.Marker == "constructor" || input.Marker == "prototype" {
		http.Error(w, "A migration marker and defaults object are required.", http.StatusBadRequest)
		return
	}
	_, err = s.update(w, r, func(sess *session.Session) error {
		values := map[string]json.RawMessage{}
		if raw, ok := sess.Config[name]; ok {
			if err := json.Unmarshal([]byte(raw), &values); err != nil {
				return err
			}
		}
		if values == nil {
			return errors.New("existing settings must be an object")
		}
		if _, done := values[input.Marker]; done {
			return nil
		}
		for key, value := range input.Defaults {
			if key == "__proto__" || key == "constructor" || key == "prototype" {
				continue
			}
			if _, exists := values[key]; !exists {
				values[key] = value
			}
		}
		values[input.Marker] = json.RawMessage("1")
		encoded, err := json.Marshal(values)
		if err != nil {
			return err
		}
		if err = withinBudget(sess.Config, name, string(encoded)); err != nil {
			return err
		}
		sess.Config[name] = string(encoded)
		sess.ConfigAt[name] = time.Now().UTC()
		return nil
	})
	s.done(w, err, "")
}
