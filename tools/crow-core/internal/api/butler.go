package api

// Butler chat (item_176): the owner talks to CR-0W from Nest. The process bridge lives
// in internal/butler; these routes read a conversation and add the owner's messages.
// Nest polls GET with after=<last seq> while a reply is being written.

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"crow-core/internal/butler"
)

func (s *Server) routeButler(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/butler/{conv}", s.butlerGet)
	mux.HandleFunc("POST /api/butler/{conv}/say", s.butlerSay)
}

// Say is POST /api/butler/{conv}/say. Account is the account of this turn and the next
// ones; empty keeps the current choice (auto when none was made).
type Say struct {
	Text    string  `json:"text"`
	Surface string  `json:"surface,omitempty"` // nest, phone
	Account *string `json:"account,omitempty"` // "" = back to auto
}

func (s *Server) butlerGet(w http.ResponseWriter, r *http.Request) {
	if s.o.Butler == nil {
		fail(w, http.StatusNotFound, "butler disabled on this core")
		return
	}
	after, _ := strconv.Atoi(r.URL.Query().Get("after"))
	v, err := s.o.Butler.Get(r.PathValue("conv"), after)
	if err != nil {
		fail(w, butlerStatus(err), err.Error())
		return
	}
	writeJSON(w, http.StatusOK, v)
}

func (s *Server) butlerSay(w http.ResponseWriter, r *http.Request) {
	if s.o.Butler == nil {
		fail(w, http.StatusNotFound, "butler disabled on this core")
		return
	}
	var in Say
	if !decode(w, r, &in, false) {
		return
	}
	switch in.Surface {
	case "", "nest", "phone":
	default:
		fail(w, http.StatusBadRequest, "surface: nest or phone")
		return
	}
	conv := r.PathValue("conv")
	if in.Account != nil {
		if err := s.account(*in.Account); err != nil {
			fail(w, http.StatusBadRequest, err.Error())
			return
		}
		if err := s.o.Butler.SetAccount(conv, *in.Account); err != nil {
			fail(w, butlerStatus(err), err.Error())
			return
		}
	}
	msg, err := s.o.Butler.Say(conv, in.Text, in.Surface)
	if err != nil && msg.Seq == 0 {
		fail(w, butlerStatus(err), err.Error())
		return
	}
	// A start failure is already a note in the transcript: the message was kept.
	writeJSON(w, http.StatusAccepted, msg)
}

func butlerStatus(err error) int {
	if errors.Is(err, butler.ErrConv) {
		return http.StatusBadRequest
	}
	if err != nil && err.Error() == "text: required" {
		return http.StatusBadRequest
	}
	return http.StatusInternalServerError
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(code)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(v)
}
