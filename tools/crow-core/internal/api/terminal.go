package api

// Terminal tab of a Nest session (item_240): the screen of the tmux pane or kitty window
// holding the session, keys typed into it, and its size, through `crow-screen`. These
// calls poll about once a second, so they read the cached dispatch view (no refresh) and
// are not logged in actions.jsonl. Only interactive sessions are served, not runs.

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
)

func (s *Server) routeTerminal(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/sessions/{pid}/screen", s.screen)
	mux.HandleFunc("POST /api/sessions/{pid}/keys", s.keys)
	mux.HandleFunc("POST /api/sessions/{pid}/resize", s.resize)
}

// Keys is the body of POST /api/sessions/{pid}/keys: named tmux keys or literal text.
type Keys struct {
	Keys json.RawMessage `json:"keys"`
}

// Resize is the body of POST /api/sessions/{pid}/resize.
type Resize struct {
	Cols int `json:"cols"`
	Rows int `json:"rows"`
}

// termAgent is the agent with pid in the cached dispatch view, when it is an interactive
// session (a background run has no screen).
func (s *Server) termAgent(pid string) (map[string]any, int, error) {
	if n, err := strconv.Atoi(pid); err != nil || n <= 0 {
		return nil, http.StatusNotFound, fmt.Errorf("bad pid %q", pid)
	}
	e := s.ext["dispatch"]
	if e == nil {
		return nil, http.StatusConflict, fmt.Errorf("dispatch: no such section")
	}
	e.mu.Lock()
	m, _ := e.data.(map[string]any)
	have := e.have
	e.mu.Unlock()
	var a map[string]any
	if have && m != nil {
		for _, r := range rows(m, "agents") {
			if str(r, "pid") == pid {
				a = r
				break
			}
		}
	}
	if a == nil { // not loaded yet, or a session started since the last refresh
		var err error
		if a, err = s.agent(pid); err != nil {
			return nil, http.StatusNotFound, err
		}
	}
	if str(a, "kind") != "session" && str(a, "tmux") == "" {
		return nil, http.StatusConflict, fmt.Errorf("%s is a background run, it has no screen", pid)
	}
	return a, 0, nil
}

// screenCall runs crow-screen and replies with its JSON line: 200 ok, 409 refused, 502 failed.
func (s *Server) screenCall(w http.ResponseWriter, pid string, args ...string) {
	if _, code, err := s.termAgent(pid); err != nil {
		fail(w, code, err.Error())
		return
	}
	if s.o.Script == nil {
		fail(w, http.StatusServiceUnavailable, "no script runner (CROW_ENGINE unset)")
		return
	}
	out, err := s.o.Script(nil, "crow-screen", append(args[:1:1], append([]string{"--pid", pid}, args[1:]...)...)...)
	var res struct {
		OK      bool   `json:"ok"`
		Code    int    `json:"code"`
		Message string `json:"message"`
	}
	line := tailLine(out)
	if json.Unmarshal(line, &res) != nil {
		msg := "crow-screen: no reply"
		if err != nil {
			msg = err.Error()
		}
		fail(w, http.StatusBadGateway, msg)
		return
	}
	code := http.StatusOK
	switch {
	case res.OK:
	case res.Code == 1:
		code = http.StatusConflict
	default:
		code = http.StatusBadGateway
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(code)
	_, _ = w.Write(append(line, '\n'))
}

func (s *Server) screen(w http.ResponseWriter, r *http.Request) {
	s.screenCall(w, r.PathValue("pid"), "show")
}

func (s *Server) keys(w http.ResponseWriter, r *http.Request) {
	var b Keys
	if !decode(w, r, &b, false) {
		return
	}
	if len(b.Keys) == 0 || b.Keys[0] != '[' || !json.Valid(b.Keys) {
		fail(w, http.StatusBadRequest, "keys: a JSON list")
		return
	}
	s.screenCall(w, r.PathValue("pid"), "keys", "--keys", string(b.Keys))
}

func (s *Server) resize(w http.ResponseWriter, r *http.Request) {
	var b Resize
	if !decode(w, r, &b, false) {
		return
	}
	if b.Cols < 20 || b.Cols > 400 || b.Rows < 5 || b.Rows > 200 {
		fail(w, http.StatusBadRequest, "size: cols 20 to 400, rows 5 to 200")
		return
	}
	s.screenCall(w, r.PathValue("pid"), "resize", "--cols", strconv.Itoa(b.Cols), "--rows", strconv.Itoa(b.Rows))
}
