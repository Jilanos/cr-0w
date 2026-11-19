package api

// The write side of the core HTTP service (item_147): dispatch a mission, answer an inbox
// row, stop, cancel and hide. Each route calls the same mission function as the CLI with
// surface nest, so both write the same events. guard has already checked the owner
// login, the CSRF header and the origin.

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"

	"crow-core/internal/mission"
)

// Surface is what the API writes in action and answer events.
const Surface = "nest"

// maxBody caps a request body.
const maxBody = 64 << 10

// Dispatch is the body of POST /api/missions.
type Dispatch struct {
	Kind     string    `json:"kind"`
	Project  string    `json:"project"`
	Goal     string    `json:"goal"`
	EndState string    `json:"end_state"`
	Autonomy string    `json:"autonomy,omitempty"`
	Key      string    `json:"key,omitempty"`
	Gates    *[]string `json:"gates,omitempty"`
}

// Answer is the body of POST /api/missions/{id}/answer. Item names the row (its full id
// or the part after the mission id); empty takes the only open row. Verb defaults to
// answer. Version is the mission version the owner saw; an older one gets 409.
type Answer struct {
	Item    string `json:"item,omitempty"`
	Verb    string `json:"verb,omitempty"`
	Text    string `json:"text,omitempty"`
	Version int    `json:"version"`
}

// Cancel is the optional body of POST /api/missions/{id}/cancel.
type Cancel struct {
	Reason string `json:"reason,omitempty"`
}

func (s *Server) routeActions(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/missions", s.dispatch)
	mux.HandleFunc("POST /api/missions/{id}/answer", s.answer)
	mux.HandleFunc("POST /api/missions/{id}/stop", s.stop)
	mux.HandleFunc("POST /api/missions/{id}/cancel", s.cancel)
	mux.HandleFunc("POST /api/inbox/{id...}", s.hide)
}

func (s *Server) dispatch(w http.ResponseWriter, r *http.Request) {
	var b Dispatch
	if !decode(w, r, &b, false) {
		return
	}
	spec := mission.Spec{Kind: b.Kind, Project: b.Project, Goal: b.Goal, EndState: b.EndState,
		Autonomy: b.Autonomy, Key: b.Key, Gates: b.Gates, Surface: Surface}
	s.act(w, http.StatusCreated, func(env mission.Env) (any, error) { return env.NewLive(spec) })
}

func (s *Server) answer(w http.ResponseWriter, r *http.Request) {
	var b Answer
	if !decode(w, r, &b, false) {
		return
	}
	if b.Version <= 0 {
		fail(w, http.StatusBadRequest, "version: want the mission version the answer is for")
		return
	}
	if b.Verb == "" {
		b.Verb = "answer"
	}
	rep := mission.Reply{Verb: b.Verb, Surface: Surface, Version: b.Version}
	if b.Text != "" {
		rep.Words = []string{b.Text}
	}
	id := r.PathValue("id")
	s.act(w, http.StatusOK, func(env mission.Env) (any, error) {
		it, err := env.MissionItem(id, b.Item)
		if err != nil {
			return nil, err
		}
		return env.InboxReply(it.ID, rep)
	})
}

func (s *Server) stop(w http.ResponseWriter, r *http.Request) {
	if !decode(w, r, &struct{}{}, true) {
		return
	}
	id := r.PathValue("id")
	s.act(w, http.StatusOK, func(env mission.Env) (any, error) {
		if err := exact(env, id); err != nil {
			return nil, err
		}
		return env.Stop(id, Surface)
	})
}

func (s *Server) cancel(w http.ResponseWriter, r *http.Request) {
	var b Cancel
	if !decode(w, r, &b, true) {
		return
	}
	id := r.PathValue("id")
	s.act(w, http.StatusOK, func(env mission.Env) (any, error) {
		if err := exact(env, id); err != nil {
			return nil, err
		}
		return env.Cancel(id, b.Reason, Surface, func(string) {})
	})
}

// hide serves POST /api/inbox/<row id>/hide. Row ids hold slashes, so the route takes
// the rest of the path and checks the last part.
func (s *Server) hide(w http.ResponseWriter, r *http.Request) {
	rest := r.PathValue("id")
	const tail = "/hide"
	if len(rest) <= len(tail) || rest[len(rest)-len(tail):] != tail {
		fail(w, http.StatusNotFound, "no route")
		return
	}
	id := rest[:len(rest)-len(tail)]
	if !decode(w, r, &struct{}{}, true) {
		return
	}
	s.act(w, http.StatusOK, func(env mission.Env) (any, error) {
		it, err := env.InboxShow(id)
		if err != nil {
			return nil, err
		}
		if it.Item.ID != id {
			return nil, fmt.Errorf("no inbox item %q: %w", id, mission.ErrNotFound)
		}
		return env.Hide(id, Surface)
	})
}

// exact refuses an id prefix: the CLI resolves prefixes, the API names missions in full.
func exact(env mission.Env, id string) error {
	m, err := env.Show(id)
	if err != nil {
		return err
	}
	if m.ID != id {
		return fmt.Errorf("no mission %q: %w", id, mission.ErrNotFound)
	}
	return nil
}

// act runs one action under the store lock, then folds its events into the store.
func (s *Server) act(w http.ResponseWriter, code int, do func(mission.Env) (any, error)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	v, err := do(s.o.Env)
	if err != nil {
		fail(w, status(err), err.Error())
		return
	}
	if err := s.syncStore(); err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(code)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(v)
}

func status(err error) int {
	switch {
	case errors.Is(err, mission.ErrNotFound):
		return http.StatusNotFound
	case errors.Is(err, mission.ErrInvalid):
		return http.StatusBadRequest
	case errors.Is(err, mission.ErrConflict):
		return http.StatusConflict
	}
	return http.StatusInternalServerError
}

// decode reads a JSON body into v. Unknown fields are refused. optional lets an empty
// body through.
func decode(w http.ResponseWriter, r *http.Request, v any, optional bool) bool {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBody))
	dec.DisallowUnknownFields()
	err := dec.Decode(v)
	if optional && errors.Is(err, io.EOF) {
		return true
	}
	if err != nil {
		fail(w, http.StatusBadRequest, "body: "+err.Error())
		return false
	}
	if dec.More() {
		fail(w, http.StatusBadRequest, "body: one JSON object only")
		return false
	}
	return true
}
