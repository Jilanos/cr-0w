package api

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// Queue actions of the Ops panel (item_190): routines run now, pause and resume through
// bin/crow-routine; AFK jobs are read, edited and skipped in <state>/afk.
func (s *Server) routeQueue(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/routines/{unit}/{verb}", s.routine)
	mux.HandleFunc("GET /api/afk", s.afkRead)
	mux.HandleFunc("PUT /api/afk", s.afkSave)
	mux.HandleFunc("POST /api/afk/skip", s.afkSkip)
}

var reUnit = regexp.MustCompile(`^crow-[a-z0-9-]+\.timer$`)

func (s *Server) routine(w http.ResponseWriter, r *http.Request) {
	if !decode(w, r, &struct{}{}, true) {
		return
	}
	unit, verb := r.PathValue("unit"), r.PathValue("verb")
	if !reUnit.MatchString(unit) || (verb != "run" && verb != "pause" && verb != "resume") {
		fail(w, http.StatusNotFound, fmt.Sprintf("no routine action %s %s", verb, unit))
		return
	}
	s.runAction(w, LiveAction{Action: "routine_" + verb, Target: unit}, nil, "crow-routine", verb, unit)
	s.Refresh("jobs")
}

// AFKJob is the body of GET and PUT /api/afk?id=<job>.
type AFKJob struct {
	ID   string `json:"id"`
	Text string `json:"text"`
}

var reAFK = regexp.MustCompile(`^(queued/)?job-[A-Za-z0-9._-]+\.md$`)

// afkPath is the job file of id under <state>/afk, "" when id is not a job file name.
func (s *Server) afkPath(id string) string {
	if s.o.StateDir == "" || !reAFK.MatchString(id) || strings.Contains(id, "..") {
		return ""
	}
	return filepath.Join(s.o.StateDir, "afk", filepath.FromSlash(id))
}

func (s *Server) afkRead(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	p := s.afkPath(id)
	b, err := os.ReadFile(p)
	if p == "" || err != nil {
		fail(w, http.StatusNotFound, fmt.Sprintf("no AFK job %q", id))
		return
	}
	writeJSON(w, http.StatusOK, AFKJob{ID: id, Text: string(b)})
}

func (s *Server) afkSave(w http.ResponseWriter, r *http.Request) {
	var body AFKJob
	if !decode(w, r, &body, false) {
		return
	}
	p := s.afkPath(body.ID)
	if _, err := os.Stat(p); p == "" || err != nil {
		fail(w, http.StatusNotFound, fmt.Sprintf("no AFK job %q", body.ID))
		return
	}
	if strings.TrimSpace(body.Text) == "" {
		fail(w, http.StatusBadRequest, "empty job text")
		return
	}
	s.fileAction(w, LiveAction{Action: "afk_edit", Target: body.ID}, func() (string, error) {
		tmp := p + ".tmp"
		if err := os.WriteFile(tmp, []byte(body.Text), 0o600); err != nil {
			return "", err
		}
		return "saved " + body.ID, os.Rename(tmp, p)
	})
}

// afkSkip moves the job to <state>/afk/superseded/ and marks its queue.md row skipped.
func (s *Server) afkSkip(w http.ResponseWriter, r *http.Request) {
	if !decode(w, r, &struct{}{}, true) {
		return
	}
	id := r.URL.Query().Get("id")
	p := s.afkPath(id)
	if _, err := os.Stat(p); p == "" || err != nil {
		fail(w, http.StatusNotFound, fmt.Sprintf("no AFK job %q", id))
		return
	}
	s.fileAction(w, LiveAction{Action: "afk_skip", Target: id}, func() (string, error) {
		dir := filepath.Join(s.o.StateDir, "afk")
		if err := os.MkdirAll(filepath.Join(dir, "superseded"), 0o700); err != nil {
			return "", err
		}
		if err := os.Rename(p, filepath.Join(dir, "superseded", filepath.Base(p))); err != nil {
			return "", err
		}
		q := filepath.Join(dir, "queue.md")
		if b, err := os.ReadFile(q); err == nil && !strings.Contains(id, "/") {
			if out, ok := markSkipped(string(b), id); ok {
				if err := os.WriteFile(q, []byte(out), 0o600); err != nil {
					return "", err
				}
			}
		}
		return "skipped " + id, nil
	})
}

// markSkipped sets the last cell of the queue.md row naming file to "skipped (nest)".
func markSkipped(md, file string) (string, bool) {
	ls := strings.Split(md, "\n")
	for i, l := range ls {
		t := strings.TrimSpace(l)
		if !strings.HasPrefix(t, "|") || !strings.Contains(t, "| "+file+" |") {
			continue
		}
		cells := strings.Split(strings.Trim(t, "|"), "|")
		cells[len(cells)-1] = " skipped (nest) "
		ls[i] = "|" + strings.Join(cells, "|") + "|"
		return strings.Join(ls, "\n"), true
	}
	return md, false
}

// fileAction runs a file change of the owner, logs it like a live action and replies with it.
func (s *Server) fileAction(w http.ResponseWriter, ev LiveAction, do func() (string, error)) {
	ev.TS, ev.Actor, ev.Surface = s.o.Now().UTC().Format("2006-01-02T15:04:05Z07:00"), "owner", Surface
	msg, err := do()
	if err != nil {
		ev.Code, ev.Message = 2, err.Error()
	} else {
		ev.OK, ev.Message = true, msg
	}
	if lerr := s.logAction(ev); lerr != nil {
		fail(w, http.StatusInternalServerError, "action ran but was not logged: "+lerr.Error())
		return
	}
	code := http.StatusOK
	if !ev.OK {
		code = http.StatusInternalServerError
	}
	writeJSON(w, code, ev)
}
