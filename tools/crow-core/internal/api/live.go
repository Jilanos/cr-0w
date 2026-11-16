package api

// Actions on live Claude sessions, dispatch runs and Today mail (item_170). Each route
// checks its target against the section the owner sees, runs the same bin/ script as
// the deck, appends one line to the core action log and refreshes the touched section
// at once. guard has already checked the owner login, the CSRF header and the origin.

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Script runs bin/<name> with args and extra environment and returns its stdout. A
// non-zero exit returns the stdout it printed with an error carrying the end of stderr.
type Script func(env []string, name string, args ...string) ([]byte, error)

// LiveAction is one line of the core action log (live-action.schema.json) and the reply
// of every live route.
type LiveAction struct {
	TS      string `json:"ts"`
	Actor   string `json:"actor"`
	Surface string `json:"surface"`
	Action  string `json:"action"`
	Target  string `json:"target"`
	Text    string `json:"text,omitempty"`
	Account string `json:"account,omitempty"`
	Project string `json:"project,omitempty"`
	OK      bool   `json:"ok"`
	Code    int    `json:"code"`
	Message string `json:"message"`
	RunID   string `json:"run_id,omitempty"`
}

// ActionLogName is the core action log, next to the missions root.
const ActionLogName = "actions.jsonl"

// NewSession is the body of POST /api/sessions.
type NewSession struct {
	Project string `json:"project"`
	Account string `json:"account,omitempty"`
	Prompt  string `json:"prompt,omitempty"`
}

// Resume is the optional body of POST /api/sessions/{id}/resume. The cwd comes from the
// session row; Account overrides the row's account.
type Resume struct {
	Account string `json:"account,omitempty"`
}

// RunRequest is the body of POST /api/dispatch.
type RunRequest struct {
	Project string `json:"project"`
	Label   string `json:"label"`
	Prompt  string `json:"prompt"`
	Model   string `json:"model,omitempty"`
	// Account pins the run to one allowed account; empty lets crow-runs pick.
	Account string `json:"account,omitempty"`
}

// PromptAnswer is the body of POST /api/sessions/{pid}/answer (item_174): the prompt id the
// owner saw and the option tapped, allow (once) or deny. An AskUserQuestion prompt (item_193)
// takes answers instead: one entry per question, a list of 0-based option indexes or
// {"other": text, "options": [...]}; crow-prompt validates them against the questions.
type PromptAnswer struct {
	Prompt  string          `json:"prompt"`
	Option  string          `json:"option,omitempty"`
	Answers json.RawMessage `json:"answers,omitempty"`
}

// Send is the body of POST /api/sessions/{pid}/send.
type Send struct {
	Text string `json:"text"`
}

func (s *Server) routeLive(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/sessions", s.newSession)
	mux.HandleFunc("POST /api/sessions/{id}/resume", s.resume)
	mux.HandleFunc("POST /api/sessions/{pid}/send", s.send)
	mux.HandleFunc("POST /api/sessions/{pid}/interrupt", s.agentCtl("interrupt"))
	mux.HandleFunc("POST /api/sessions/{pid}/stop", s.agentCtl("stop"))
	mux.HandleFunc("POST /api/sessions/{pid}/answer", s.promptAnswer)
	mux.HandleFunc("POST /api/dispatch", s.dispatchRun)
	mux.HandleFunc("POST /api/dispatch/{run}/stop", s.stopRun)
	mux.HandleFunc("POST /api/today/{id}/done", s.mail("done"))
	mux.HandleFunc("POST /api/today/{id}/snooze", s.mail("snooze"))
}

// errStale answers 409 when the section a target is checked against has no fresh data.
var errStale = errors.New("stale")

// live reads a section after refreshing it, so a target is checked against what is
// true now, not the last poll. A section that failed its refresh is stale.
func (s *Server) live(name string) (map[string]any, error) {
	e := s.ext[name]
	if e == nil {
		return nil, fmt.Errorf("%s: no such section: %w", name, errStale)
	}
	s.Refresh(name)
	e.mu.Lock()
	defer e.mu.Unlock()
	if !e.have || e.err != "" {
		why := e.err
		if why == "" {
			why = "not loaded yet"
		}
		return nil, fmt.Errorf("%s view is stale (%s): %w", name, why, errStale)
	}
	m, _ := e.data.(map[string]any)
	if m == nil {
		return nil, fmt.Errorf("%s: not an object: %w", name, errStale)
	}
	return m, nil
}

// rows is the list under key of a section body.
func rows(m map[string]any, key string) []map[string]any {
	var out []map[string]any
	list, _ := m[key].([]any)
	for _, v := range list {
		if r, ok := v.(map[string]any); ok {
			out = append(out, r)
		}
	}
	return out
}

func str(r map[string]any, k string) string {
	switch v := r[k].(type) {
	case string:
		return v
	case float64:
		return strconv.FormatFloat(v, 'f', -1, 64)
	}
	return ""
}

// liveFail writes the status of a check error: stale 409, the rest as given.
func liveFail(w http.ResponseWriter, err error, code int) {
	if errors.Is(err, errStale) {
		code = http.StatusConflict
	}
	fail(w, code, err.Error())
}

// agent finds a live claude process by pid in the dispatch section.
func (s *Server) agent(pid string) (map[string]any, error) {
	if n, err := strconv.Atoi(pid); err != nil || n <= 0 {
		return nil, fmt.Errorf("bad pid %q", pid)
	}
	m, err := s.live("dispatch")
	if err != nil {
		return nil, err
	}
	for _, a := range rows(m, "agents") {
		if str(a, "pid") == pid {
			return a, nil
		}
	}
	return nil, fmt.Errorf("no live session with pid %s", pid)
}

// account checks an account the owner named: it must exist and not be "never".
func (s *Server) account(name string) error {
	if name == "" {
		return nil
	}
	m, err := s.live("accounts")
	if err != nil {
		return err
	}
	for _, a := range rows(m, "accounts") {
		if str(a, "name") == name {
			if str(a, "policy") == "never" {
				return fmt.Errorf("account %s is never used by crow", name)
			}
			return nil
		}
	}
	return fmt.Errorf("no account %q", name)
}

// project checks a registry project name.
func (s *Server) project(name string) error {
	if name == "" {
		return errors.New("project: required")
	}
	m, err := s.live("projects")
	if err != nil {
		return err
	}
	for _, p := range rows(m, "projects") {
		if str(p, "name") == name || str(p, "short") == name {
			return nil
		}
	}
	return fmt.Errorf("no project %q in the registry", name)
}

func (s *Server) send(w http.ResponseWriter, r *http.Request) {
	var b Send
	if !decode(w, r, &b, false) {
		return
	}
	if strings.TrimSpace(b.Text) == "" {
		fail(w, http.StatusBadRequest, "text: required")
		return
	}
	pid := r.PathValue("pid")
	a, err := s.agent(pid)
	if err != nil {
		liveFail(w, err, http.StatusNotFound)
		return
	}
	ev := LiveAction{Action: "send", Target: pid, Text: b.Text, Account: str(a, "account"), Project: str(a, "project")}
	s.runAction(w, ev, nil, "crow-focus", "--pid", pid, "--send", b.Text, "--json")
	s.Refresh("dispatch")
}

func (s *Server) agentCtl(action string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !decode(w, r, &struct{}{}, true) {
			return
		}
		pid := r.PathValue("pid")
		a, err := s.agent(pid)
		if err != nil {
			liveFail(w, err, http.StatusNotFound)
			return
		}
		ev := LiveAction{Action: action, Target: pid, Account: str(a, "account"), Project: str(a, "project")}
		s.runAction(w, ev, nil, "crow-focus", "--pid", pid, "--"+action, "--json")
		s.Refresh("dispatch")
	}
}

// promptAnswer presses allow or deny on the permission prompt a session waits on. The prompt
// must still be the one the owner saw (409 otherwise, nothing pressed); allow on a work
// push or MR is refused here and again by the script (owner prefs: approvals only).
func (s *Server) promptAnswer(w http.ResponseWriter, r *http.Request) {
	var b PromptAnswer
	if !decode(w, r, &b, false) {
		return
	}
	asks := len(b.Answers) > 0 && string(b.Answers) != "null"
	if asks == (b.Option != "") || (!asks && b.Option != "allow" && b.Option != "deny") {
		fail(w, http.StatusBadRequest, "option: allow or deny, or answers")
		return
	}
	if asks && (b.Answers[0] != '[' || !json.Valid(b.Answers)) {
		fail(w, http.StatusBadRequest, "answers: one entry per question")
		return
	}
	if strings.TrimSpace(b.Prompt) == "" {
		fail(w, http.StatusBadRequest, "prompt: required")
		return
	}
	pid := r.PathValue("pid")
	a, err := s.agent(pid)
	if err != nil {
		liveFail(w, err, http.StatusNotFound)
		return
	}
	p, _ := a["prompt"].(map[string]any)
	switch {
	case p == nil || str(p, "id") != b.Prompt:
		fail(w, http.StatusConflict, "pid "+pid+" no longer waits on that prompt")
		return
	case b.Option == "allow" && str(p, "work_approval") != "":
		fail(w, http.StatusConflict, "work approval on "+str(p, "work_approval")+": give it in approvals")
		return
	case asks && p["questions"] == nil:
		fail(w, http.StatusConflict, "pid "+pid+": that prompt takes allow or deny")
		return
	case b.Option == "allow" && p["questions"] != nil:
		fail(w, http.StatusConflict, "pid "+pid+": that prompt takes answers")
		return
	}
	verb, args := b.Option, []string{"--option", b.Option}
	if asks {
		var compact bytes.Buffer
		_ = json.Compact(&compact, b.Answers)
		verb, args = "answers", []string{"--answers", compact.String()}
	}
	ev := LiveAction{Action: "answer", Target: pid, Text: verb + ": " + str(p, "tool") + " " + str(p, "detail"),
		Account: str(a, "account"), Project: str(a, "project")}
	s.runAction(w, ev, nil, "crow-prompt", append(append([]string{"answer", "--pid", pid, "--prompt", b.Prompt}, args...), "--json")...)
	s.Refresh("dispatch")
}

func (s *Server) resume(w http.ResponseWriter, r *http.Request) {
	var b Resume
	if !decode(w, r, &b, true) {
		return
	}
	id := r.PathValue("id")
	m, err := s.live("sessions")
	if err != nil {
		liveFail(w, err, http.StatusNotFound)
		return
	}
	var row map[string]any
	for _, x := range rows(m, "sessions") {
		if str(x, "conversation_id") == id {
			row = x
		}
	}
	if row == nil {
		fail(w, http.StatusNotFound, fmt.Sprintf("no session %q", id))
		return
	}
	acct := b.Account
	if acct == "" {
		acct = str(row, "account")
	}
	if err := s.account(acct); err != nil {
		liveFail(w, err, http.StatusBadRequest)
		return
	}
	ev := LiveAction{Action: "resume", Target: id, Account: acct, Project: str(row, "project")}
	s.runAction(w, ev, nil, "crow-focus", "--pid", "0", "--account", acct, "--cwd", str(row, "cwd"), "--session", id)
	s.Refresh("dispatch")
	s.Refresh("sessions")
}

// newSession opens a new window like the deck's terminal action: crow term picks a free
// allowed account unless the owner named one.
func (s *Server) newSession(w http.ResponseWriter, r *http.Request) {
	var b NewSession
	if !decode(w, r, &b, false) {
		return
	}
	if err := s.project(b.Project); err != nil {
		liveFail(w, err, http.StatusBadRequest)
		return
	}
	if err := s.account(b.Account); err != nil {
		liveFail(w, err, http.StatusBadRequest)
		return
	}
	var env []string
	if b.Account != "" {
		env = []string{"CROW_ACCOUNT=" + b.Account}
	}
	args := []string{"term", "--on-busy", "fail", b.Project}
	if b.Prompt != "" {
		args = append(args, b.Prompt)
	}
	ev := LiveAction{Action: "start", Target: b.Project, Text: b.Prompt, Account: b.Account, Project: b.Project}
	s.runAction(w, ev, env, "crow", args...)
	s.Refresh("dispatch")
}

func (s *Server) dispatchRun(w http.ResponseWriter, r *http.Request) {
	var b RunRequest
	if !decode(w, r, &b, false) {
		return
	}
	if strings.TrimSpace(b.Label) == "" || strings.TrimSpace(b.Prompt) == "" {
		fail(w, http.StatusBadRequest, "label and prompt: required")
		return
	}
	if err := s.project(b.Project); err != nil {
		liveFail(w, err, http.StatusBadRequest)
		return
	}
	if err := s.account(b.Account); err != nil {
		liveFail(w, err, http.StatusBadRequest)
		return
	}
	m, err := s.live("dispatch")
	if err != nil {
		liveFail(w, err, http.StatusConflict)
		return
	}
	if slots, _ := m["slots"].(map[string]any); slots != nil {
		busy, _ := slots["busy"].(float64)
		max, _ := slots["max"].(float64)
		if max > 0 && busy >= max {
			fail(w, http.StatusConflict, fmt.Sprintf("%d runs already running (max %d)", int(busy), int(max)))
			return
		}
	}
	f, err := os.CreateTemp("", "crow-nest-prompt-*.md")
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer os.Remove(f.Name())
	_, err = f.WriteString(b.Prompt)
	if cerr := f.Close(); err == nil {
		err = cerr
	}
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	args := []string{"dispatch", b.Project, b.Label, "--prompt-file", f.Name(), "--json"}
	if b.Model != "" {
		args = append(args, "--model", b.Model)
	}
	if b.Account != "" {
		args = append(args, "--account", b.Account)
	}
	ev := LiveAction{Action: "dispatch", Target: b.Project, Text: b.Prompt, Account: b.Account, Project: b.Project}
	s.runAction(w, ev, nil, "crow-runs", args...)
	s.Refresh("dispatch")
}

func (s *Server) stopRun(w http.ResponseWriter, r *http.Request) {
	if !decode(w, r, &struct{}{}, true) {
		return
	}
	run := r.PathValue("run")
	m, err := s.live("dispatch")
	if err != nil {
		liveFail(w, err, http.StatusNotFound)
		return
	}
	var row map[string]any
	for _, a := range rows(m, "agents") {
		if run != "" && str(a, "run_id") == run {
			row = a
		}
	}
	if row == nil {
		fail(w, http.StatusNotFound, fmt.Sprintf("no live run %q", run))
		return
	}
	ev := LiveAction{Action: "run_stop", Target: run, Account: str(row, "account"), Project: str(row, "project")}
	s.runAction(w, ev, nil, "crow-runs", "stop", run, "--json")
	s.Refresh("dispatch")
}

func (s *Server) mail(action string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !decode(w, r, &struct{}{}, true) {
			return
		}
		id := r.PathValue("id")
		m, err := s.live("today")
		if err != nil {
			liveFail(w, err, http.StatusNotFound)
			return
		}
		found := false
		for _, key := range []string{"important", "flagged"} {
			for _, x := range rows(m, key) {
				found = found || str(x, "id") == id
			}
		}
		if !found {
			fail(w, http.StatusNotFound, fmt.Sprintf("no mail %q in Today", id))
			return
		}
		s.runAction(w, LiveAction{Action: action, Target: id}, nil, "crow-today", action, id, "--json")
		s.Refresh("today")
	}
}

// result is the action result line of a --json script (script action.schema.json) or
// the crow-runs dispatch reply.
type result struct {
	OK      bool   `json:"ok"`
	Code    *int   `json:"code"`
	Message string `json:"message"`
	RunID   string `json:"run_id"`
	Account string `json:"account"`
	Error   *struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

// runAction runs one script, logs the action and writes the reply: 200 done, 409 when
// the script refused (code 1, a full or busy dispatch), 502 when it failed.
func (s *Server) runAction(w http.ResponseWriter, ev LiveAction, env []string, name string, args ...string) {
	ev.TS, ev.Actor, ev.Surface = s.o.Now().UTC().Format(time.RFC3339), "owner", Surface
	if s.o.Script == nil {
		fail(w, http.StatusServiceUnavailable, "no script runner (CROW_ENGINE unset)")
		return
	}
	out, err := s.o.Script(env, name, args...)
	var res result
	parsed := json.Unmarshal(tailLine(out), &res) == nil && (res.Code != nil || res.Error != nil || res.OK)
	switch {
	case parsed && res.OK:
		ev.OK, ev.Code, ev.Message = true, 0, res.Message
		ev.RunID = res.RunID
		if ev.Account == "" {
			ev.Account = res.Account
		}
		if ev.Message == "" && res.RunID != "" {
			ev.Message = "dispatched run " + res.RunID
		}
	case parsed && res.Error != nil:
		ev.Message = res.Error.Code + ": " + res.Error.Message
		ev.Code = 1
		if res.Error.Code != "too_many_runs" && res.Error.Code != "cwd_busy" {
			ev.Code = 2
		}
	case parsed:
		ev.Code, ev.Message = 2, res.Message
		if *res.Code == 1 {
			ev.Code = 1
		}
	case err == nil:
		ev.OK, ev.Message = true, strings.TrimSpace(string(tailLine(out)))
		if ev.Message == "" && ev.Action == "start" {
			ev.Message = "opened a window on " + ev.Project
		} else if ev.Message == "" {
			ev.Message = ev.Action + " " + ev.Target
		}
	default:
		ev.Code, ev.Message = 2, err.Error()
	}
	if lerr := s.logAction(ev); lerr != nil {
		fail(w, http.StatusInternalServerError, "action ran but was not logged: "+lerr.Error())
		return
	}
	code := http.StatusOK
	switch ev.Code {
	case 1:
		code = http.StatusConflict
	case 2:
		code = http.StatusBadGateway
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(code)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(ev)
}

var logMu sync.Mutex

// logAction appends ev to the action log. Lines are never rewritten.
func (s *Server) logAction(ev LiveAction) error {
	p := s.o.ActionLog
	if p == "" {
		return errors.New("no action log path")
	}
	line, err := json.Marshal(ev)
	if err != nil {
		return err
	}
	logMu.Lock()
	defer logMu.Unlock()
	if err := os.MkdirAll(filepath.Dir(p), 0o700); err != nil {
		return err
	}
	f, err := os.OpenFile(p, os.O_WRONLY|os.O_APPEND|os.O_CREATE, 0o600)
	if err != nil {
		return err
	}
	if _, err := f.Write(append(line, '\n')); err != nil {
		f.Close()
		return err
	}
	if err := f.Sync(); err != nil {
		f.Close()
		return err
	}
	return f.Close()
}

// tailLine is the last non-empty line of b.
func tailLine(b []byte) []byte {
	b = bytes.TrimSpace(b)
	if i := bytes.LastIndexByte(b, '\n'); i >= 0 {
		return b[i+1:]
	}
	return b
}
