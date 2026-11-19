package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"crow-core/contract"
	"crow-core/internal/api"
	"crow-core/internal/mission"
	"crow-core/internal/testfix"
)

// fakeRuns stands in for crow-runs: every run stays live. block, when set, holds each
// dispatch until it closes; failState fails that many State calls first.
type fakeRuns struct {
	mu         sync.Mutex
	dispatched []mission.Dispatch
	block      chan struct{}
	entered    chan struct{}
	failState  int
}

func (f *fakeRuns) Dispatch(d mission.Dispatch) (mission.Started, error) {
	if f.entered != nil {
		f.entered <- struct{}{}
	}
	if f.block != nil {
		<-f.block
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	f.dispatched = append(f.dispatched, d)
	return mission.Started{RunID: fmt.Sprintf("fake%d", len(f.dispatched)), Account: "main"}, nil
}

func (f *fakeRuns) State(run string) (mission.RunState, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.failState > 0 {
		f.failState--
		return mission.RunState{}, errors.New("crow-runs state: boom")
	}
	return mission.RunState{RunID: run}, nil
}

type logs struct {
	mu    sync.Mutex
	lines []string
}

func (l *logs) logf(format string, args ...any) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.lines = append(l.lines, fmt.Sprintf(format, args...))
}

func (l *logs) text() string {
	l.mu.Lock()
	defer l.mu.Unlock()
	return strings.Join(l.lines, "\n")
}

func newTicker(t *testing.T, r mission.Runner) (*ticker, *api.Server, *logs, *atomic.Int32) {
	t.Helper()
	env, _ := liveEnv(t)
	var refreshed atomic.Int32
	srv := api.New(api.Options{Env: env, Owner: func() string { return owner },
		Sources: []api.Source{{Name: "dispatch", Fetch: func() (any, error) { refreshed.Add(1); return []any{}, nil }}}})
	l := &logs{}
	return &ticker{env: env, runner: r, maxRuns: func() int { return 2 }, locked: srv.Locked,
		after: func(mission.TickReport) { srv.Refresh("dispatch") }, logf: l.logf}, srv, l, &refreshed
}

const owner = "owner@example.com"

func section[T any](t *testing.T, srv *api.Server, name string) T {
	t.Helper()
	w := httptest.NewRecorder()
	srv.Handler(true).ServeHTTP(w, httptest.NewRequest("GET", "http://core/api/state/"+name, nil))
	var s struct{ Data T }
	if err := json.Unmarshal(w.Body.Bytes(), &s); err != nil {
		t.Fatalf("%s: %v: %s", name, err, w.Body)
	}
	return s.Data
}

// item_250 AC1: the serve loop starts a queued phase-1 mission on its own; the missions
// and runs sections show it and the dispatch section is refreshed.
func TestServeTickStartsQueuedMission(t *testing.T) {
	r := &fakeRuns{}
	tk, srv, l, refreshed := newTicker(t, r)
	m, err := tk.env.NewLive(mission.Spec{Kind: "research", Project: "demo", Goal: "Compare push providers.", EndState: "A report."})
	if err != nil {
		t.Fatal(err)
	}
	if got := section[[]contract.Mission](t, srv, "missions"); !hasState(got, m.ID, "queued") {
		t.Fatalf("not queued: %+v", got)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go tk.loop(ctx, 10*time.Millisecond)
	deadline := time.Now().Add(5 * time.Second)
	for !hasState(section[[]contract.Mission](t, srv, "missions"), m.ID, "running") {
		if time.Now().After(deadline) {
			t.Fatalf("mission never ran; log:\n%s", l.text())
		}
		time.Sleep(10 * time.Millisecond)
	}
	runs := section[[]contract.Run](t, srv, "runs")
	if len(runs) == 0 || runs[0].Mission != m.ID || runs[0].Run != "fake1" {
		t.Errorf("runs section = %+v", runs)
	}
	if refreshed.Load() == 0 {
		t.Error("dispatch section not refreshed")
	}
	if !strings.Contains(l.text(), `"run":"fake1"`) {
		t.Errorf("tick report not logged:\n%s", l.text())
	}
	cancel()
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(r.dispatched) != 1 || r.dispatched[0].Mission != m.ID {
		t.Errorf("dispatched %+v", r.dispatched)
	}
}

func hasState(ms []contract.Mission, id, state string) bool {
	for _, m := range ms {
		if m.ID == id {
			return m.State == state
		}
	}
	return false
}

// item_250 AC2: a pass while another holds the tick lock is skipped, and a CLI tick is
// refused meanwhile.
func TestServeTicksNeverOverlap(t *testing.T) {
	r := &fakeRuns{block: make(chan struct{}), entered: make(chan struct{}, 1)}
	tk, _, l, _ := newTicker(t, r)
	if _, err := tk.env.NewLive(mission.Spec{Kind: "research", Project: "demo", Goal: "Slow start.", EndState: "A report."}); err != nil {
		t.Fatal(err)
	}
	done := make(chan error)
	go func() { _, err := tk.once(); done <- err }()
	<-r.entered // the first pass is inside Dispatch, holding the lock
	if _, err := tk.once(); !errors.Is(err, errTickBusy) {
		t.Fatalf("second pass err = %v", err)
	}
	if err := tickCmd(tk.env, t.TempDir(), nil, &bytes.Buffer{}); err == nil || !strings.Contains(err.Error(), "another tick is running") {
		t.Fatalf("cli tick err = %v", err)
	}
	close(r.block)
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(l.text(), "tick skipped: another tick is running") {
		t.Errorf("skip not logged:\n%s", l.text())
	}
	if _, err := tk.once(); err != nil {
		t.Fatalf("pass after release: %v", err)
	}
}

// item_250 AC2: a failing pass logs and the next one runs.
func TestServeTickFailureLogsAndGoesOn(t *testing.T) {
	r := &fakeRuns{failState: 1}
	tk, _, l, _ := newTicker(t, r)
	if _, err := tk.once(); err == nil {
		t.Fatal("first pass should fail")
	}
	if !strings.Contains(l.text(), "tick failed:") || !strings.Contains(l.text(), "boom") {
		t.Errorf("failure not logged:\n%s", l.text())
	}
	if _, err := tk.once(); err != nil {
		t.Fatalf("next pass: %v", err)
	}
	tk.locked = func(func(mission.Env) error) error { panic("bad") }
	if _, err := tk.once(); err == nil || !strings.Contains(err.Error(), "panic") {
		t.Fatalf("panic err = %v", err)
	}
	if _, err := tickLock(tk.env); err != nil {
		t.Fatalf("lock kept after panic: %v", err)
	}
}

func TestTickInterval(t *testing.T) {
	for v, want := range map[string]time.Duration{"": 2 * time.Minute, "0": 0, "90s": 90 * time.Second, "300": 5 * time.Minute} {
		got, err := tickInterval(func(string) string { return v })
		if err != nil || got != want {
			t.Errorf("%q = %s, %v", v, got, err)
		}
	}
	for _, v := range []string{"soon", "-1m"} {
		if got, err := tickInterval(func(string) string { return v }); err == nil || got != DefaultTickInterval {
			t.Errorf("%q = %s, %v", v, got, err)
		}
	}
}

// item_250 AC3: the CLI, the API and the MCP tool refuse kinds the tick does not start,
// naming the phase, and write nothing.
func TestMissionNewRefusesKindsAboveLivePhase(t *testing.T) {
	env, root := liveEnv(t)
	for kind, phase := range map[string]string{"review-fix": "phase 2", "build": "phase 3"} {
		err := missionCmd(env, []string{"new", "--kind", kind, "--project", "demo", "--goal", "Fix it.", "--end-state", "Green."}, &bytes.Buffer{})
		if err == nil || !strings.Contains(err.Error(), "kind "+kind+" is "+phase+"; not started by the tick yet") {
			t.Errorf("cli %s: %v", kind, err)
		}
	}

	srv := api.New(api.Options{Env: env, Owner: func() string { return owner }})
	sock := filepath.Join(t.TempDir(), "core.sock")
	ln, err := net.Listen("unix", sock)
	if err != nil {
		t.Fatal(err)
	}
	hs := &http.Server{Handler: srv.Handler(true)}
	go hs.Serve(ln)
	defer hs.Close()

	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "http://core/api/missions", strings.NewReader(`{"kind":"build","project":"demo","goal":"g","end_state":"e"}`))
	req.Header.Set("X-Crow", "1")
	srv.Handler(true).ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "kind build is phase 3; not started by the tick yet") {
		t.Errorf("api: %d %s", w.Code, w.Body)
	}

	in := `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"mission_new","arguments":{"kind":"review-fix","project":"demo","goal":"g","end_state":"e"}}}` + "\n"
	var out bytes.Buffer
	if err := mcpServe(sock, strings.NewReader(in), &out); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), `"isError":true`) || !strings.Contains(out.String(), "kind review-fix is phase 2; not started by the tick yet") {
		t.Errorf("mcp: %s", out.String())
	}

	ms, err := env.List()
	if err != nil {
		t.Fatal(err)
	}
	for _, m := range ms {
		if m.Kind != "research" {
			t.Errorf("refused kind written: %s (root %s)", m.ID, root)
		}
	}
	// A live kind still goes through every surface.
	if err := missionCmd(env, []string{"new", "--kind", "plan", "--project", "demo", "--goal", "Plan it.", "--end-state", "A plan."}, &bytes.Buffer{}); err != nil {
		t.Errorf("plan refused: %v", err)
	}
}

// item_250 AC4: the missions section marks a linked mission with no core run; core
// missions carry no flag.
func TestMissionsSectionMarksLinked(t *testing.T) {
	env, _ := liveEnv(t)
	linked, _, err := env.Ensure(mission.Link{Project: "demo", Logics: "item_250_x", EndState: "Merged."})
	if err != nil {
		t.Fatal(err)
	}
	srv := api.New(api.Options{Env: env, Owner: func() string { return owner }})
	w := httptest.NewRecorder()
	srv.Handler(true).ServeHTTP(w, httptest.NewRequest("GET", "http://core/api/state/missions", nil))
	var s struct{ Data []map[string]any }
	if err := json.Unmarshal(w.Body.Bytes(), &s); err != nil {
		t.Fatal(err)
	}
	seen := 0
	for _, m := range s.Data {
		v, has := m["linked"]
		switch m["id"] {
		case linked.ID:
			seen++
			if v != true || m["state"] != "running" {
				t.Errorf("linked mission %v", m)
			}
		case testfix.Running:
			seen++
			if has {
				t.Errorf("core-run mission flagged: %v", m)
			}
		}
	}
	if seen != 2 {
		t.Fatalf("missions %s", w.Body)
	}
}
