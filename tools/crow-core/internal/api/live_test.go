package api

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"crow-core/internal/testfix"
)

// liveData are the section bodies the live actions check their targets against.
var liveData = map[string]string{
	"dispatch": `{"slots":{"busy":1,"max":2},"agents":[
		{"kind":"session","pid":4242,"account":"main","project":"demo","cwd":"/src/demo","session_id":"s-1","run_id":null,"tmux":"crow-demo-101010",
		 "prompt":{"id":"p1","tool":"Bash","detail":"date +%s > stamp.txt","work_approval":null}},
		{"kind":"session","pid":6161,"account":"main","project":"demo","cwd":"/src/demo","session_id":"s-3","run_id":null,
		 "prompt":{"id":"p2","tool":"Bash","detail":"git push origin feat","work_approval":"demo"}},
		{"kind":"session","pid":7171,"account":"main","project":"demo","cwd":"/src/demo","session_id":"s-4","run_id":null,
		 "prompt":{"id":"p3","tool":"AskUserQuestion","detail":"Pick a color?","work_approval":null,
		  "questions":[{"header":"Color","question":"Pick a color?","multiSelect":false,"options":[{"label":"Red"},{"label":"Blue"}]}]}},
		{"kind":"run","pid":5151,"account":"spare","project":"demo","cwd":"/src/demo.wt/r","session_id":"s-2","run_id":"a1b2c3d4"}]}`,
	"sessions": `{"sessions":[{"conversation_id":"c0ffee00-0000-4000-8000-000000000001","account":"main","cwd":"/src/demo","project":"demo","limit":"five_hour"}]}`,
	"accounts": `{"default":"main","accounts":[{"name":"main","policy":"use"},{"name":"spare","policy":"ask-first"},{"name":"locked","policy":"never"}]}`,
	"projects": `{"projects":[{"name":"demo","short":"dm"}]}`,
	"today":    `{"important":[{"id":"mail-1","subject":"Contract"}],"flagged":[{"id":"mail-2","subject":"Invoice"}]}`,
}

// scriptCall is one run of the script double.
type scriptCall struct {
	Env  []string
	Name string
	Args []string
}

// liveServer is newServer with the live sections above, a temp action log and a script
// double that records each call and answers reply (or an action ok line).
func liveServer(t *testing.T, reply func(c scriptCall) ([]byte, error)) (*Server, *[]scriptCall, string) {
	t.Helper()
	s, _ := newServer(t)
	for name, body := range liveData {
		b := []byte(body)
		s.ext[name].src.Fetch = func() (any, error) {
			var v any
			return v, json.Unmarshal(b, &v)
		}
	}
	var calls []scriptCall
	s.o.Script = func(env []string, name string, args ...string) ([]byte, error) {
		c := scriptCall{env, name, args}
		calls = append(calls, c)
		if reply != nil {
			return reply(c)
		}
		return []byte(`{"schema":1,"ok":true,"action":"send","target":"x","message":"done","code":0}`), nil
	}
	s.o.ActionLog = filepath.Join(t.TempDir(), ActionLogName)
	return s, &calls, s.o.ActionLog
}

func logLines(t *testing.T, p string) []LiveAction {
	t.Helper()
	b, err := os.ReadFile(p)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		t.Fatal(err)
	}
	var out []LiveAction
	for _, l := range strings.Split(strings.TrimSpace(string(b)), "\n") {
		var ev LiveAction
		if err := json.Unmarshal([]byte(l), &ev); err != nil {
			t.Fatalf("bad log line %q: %v", l, err)
		}
		out = append(out, ev)
	}
	return out
}

// TestLiveFixtures checks each live reply against its fixture. Requests come from
// fixtures/api/requests.
func TestLiveFixtures(t *testing.T) {
	dispatched := func(c scriptCall) ([]byte, error) {
		return []byte(`{"ok":true,"run_id":"e5f6a7b8","account":"spare"}`), nil
	}
	full := func(c scriptCall) ([]byte, error) {
		return []byte(`{"ok":false,"error":{"code":"too_many_runs","message":"2 runs already running"}}`), errors.New("exit status 1")
	}
	cases := map[string]struct {
		c     call
		code  int
		reply func(scriptCall) ([]byte, error)
	}{
		"live-send":                   {post("/api/sessions/4242/send", request(t, "send")), 200, nil},
		"live-prompt-answer":          {post("/api/sessions/4242/answer", request(t, "prompt-answer")), 200, nil},
		"error-prompt-stale":          {post("/api/sessions/4242/answer", `{"prompt":"old","option":"allow"}`), 409, nil},
		"live-dispatch":               {post("/api/dispatch", request(t, "run")), 200, dispatched},
		"live-start":                  {post("/api/sessions", request(t, "session")), 200, func(scriptCall) ([]byte, error) { return nil, nil }},
		"error-send-unknown-pid":      {post("/api/sessions/9999/send", request(t, "send")), 404, nil},
		"live-dispatch-refused":       {post("/api/dispatch", request(t, "run")), 409, full},
		"error-session-never-account": {post("/api/sessions", `{"project":"demo","account":"locked"}`), 400, nil},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			s, _, _ := liveServer(t, tc.reply)
			w := do(t, s, tc.c)
			if w.Code != tc.code {
				t.Errorf("%s: status %d, want %d: %s", tc.c.path, w.Code, tc.code, w.Body)
			}
			got := indent(t, w.Body.Bytes())
			p := filepath.Join(Fixtures, name+".json")
			if *update {
				writeFile(t, p, got)
				return
			}
			if want := testfix.Read(t, p); !bytes.Equal(got, want) {
				t.Errorf("%s: reply differs from %s (go test -update to rewrite)\n%s", tc.c.path, p, got)
			}
		})
	}
}

// AC1, AC2, AC4: each action runs its script once on the right target and logs one
// line with actor and surface.
func TestLiveActionsRunTheirScript(t *testing.T) {
	cases := []struct {
		path, body string
		name       string
		args       []string
		env        []string
	}{
		{"/api/sessions/4242/send", `{"text":"yes, go on"}`, "crow-focus", []string{"--pid", "4242", "--send", "yes, go on", "--json"}, nil},
		{"/api/sessions/4242/interrupt", "", "crow-focus", []string{"--pid", "4242", "--interrupt", "--json"}, nil},
		{"/api/sessions/5151/stop", "", "crow-focus", []string{"--pid", "5151", "--stop", "--json"}, nil},
		{"/api/sessions/4242/answer", `{"prompt":"p1","option":"allow"}`, "crow-prompt",
			[]string{"answer", "--pid", "4242", "--prompt", "p1", "--option", "allow", "--json"}, nil},
		{"/api/sessions/6161/answer", `{"prompt":"p2","option":"deny"}`, "crow-prompt",
			[]string{"answer", "--pid", "6161", "--prompt", "p2", "--option", "deny", "--json"}, nil},
		{"/api/sessions/7171/answer", `{"prompt":"p3","answers":[ [1] ]}`, "crow-prompt",
			[]string{"answer", "--pid", "7171", "--prompt", "p3", "--answers", "[[1]]", "--json"}, nil},
		{"/api/sessions/7171/answer", `{"prompt":"p3","option":"deny"}`, "crow-prompt",
			[]string{"answer", "--pid", "7171", "--prompt", "p3", "--option", "deny", "--json"}, nil},
		{"/api/dispatch/a1b2c3d4/stop", "", "crow-runs", []string{"stop", "a1b2c3d4", "--json"}, nil},
		{"/api/today/mail-1/done", "", "crow-today", []string{"done", "mail-1", "--json"}, nil},
		{"/api/today/mail-2/snooze", "", "crow-today", []string{"snooze", "mail-2", "--json"}, nil},
		{"/api/sessions/c0ffee00-0000-4000-8000-000000000001/resume", "", "crow-focus",
			[]string{"--pid", "0", "--account", "main", "--cwd", "/src/demo", "--session", "c0ffee00-0000-4000-8000-000000000001"}, []string{"CROW_TERMINAL=headless"}},
		{"/api/sessions", `{"project":"demo","account":"spare","prompt":"look at the build"}`, "crow",
			[]string{"term", "--on-busy", "fail", "demo", "look at the build"}, []string{"CROW_TERMINAL=headless", "CROW_ACCOUNT=spare"}},
		{"/api/sessions", `{"project":"demo"}`, "crow", []string{"term", "--on-busy", "fail", "demo"}, []string{"CROW_TERMINAL=headless"}},
		{"/api/sessions/4242/attach", "", "crow-focus", []string{"--pid", "4242", "--attach", "--json"}, nil},
	}
	for _, tc := range cases {
		t.Run(tc.path, func(t *testing.T) {
			s, calls, log := liveServer(t, nil)
			if w := do(t, s, post(tc.path, tc.body)); w.Code != 200 {
				t.Fatalf("status %d: %s", w.Code, w.Body)
			}
			if len(*calls) != 1 {
				t.Fatalf("calls = %v", *calls)
			}
			c := (*calls)[0]
			if c.Name != tc.name || strings.Join(c.Args, "\x00") != strings.Join(tc.args, "\x00") ||
				strings.Join(c.Env, ",") != strings.Join(tc.env, ",") {
				t.Errorf("ran %s %q env %q, want %s %q env %q", c.Name, c.Args, c.Env, tc.name, tc.args, tc.env)
			}
			evs := logLines(t, log)
			if len(evs) != 1 || evs[0].Actor != "owner" || evs[0].Surface != "nest" || !evs[0].OK {
				t.Errorf("log = %+v", evs)
			}
		})
	}
}

// item_188: a headless start replies with the tmux session it runs in.
func TestStartRepliesTmux(t *testing.T) {
	s, _, log := liveServer(t, func(c scriptCall) ([]byte, error) {
		return []byte("crow: started\n" + `{"ok":true,"message":"started demo on main, no window","account":"main","tmux":"crow-demo-101500"}`), nil
	})
	w := do(t, s, post("/api/sessions", `{"project":"demo"}`))
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"tmux":"crow-demo-101500"`) {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
	if evs := logLines(t, log); len(evs) != 1 || evs[0].Tmux != "crow-demo-101500" || evs[0].Account != "main" {
		t.Errorf("log = %+v", evs)
	}
}

// AC6: the dispatch prompt goes through a prompt file, which is gone afterwards.
func TestDispatchPromptFile(t *testing.T) {
	var prompt, file string
	s, _, _ := liveServer(t, func(c scriptCall) ([]byte, error) {
		for i, a := range c.Args {
			if a == "--prompt-file" {
				file = c.Args[i+1]
				b, _ := os.ReadFile(file)
				prompt = string(b)
			}
		}
		return []byte(`{"ok":true,"run_id":"e5f6a7b8","account":"spare"}`), nil
	})
	if w := do(t, s, post("/api/dispatch", `{"project":"demo","label":"fix","prompt":"Fix the flaky test.","model":"sonnet"}`)); w.Code != 200 {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
	if prompt != "Fix the flaky test." {
		t.Errorf("prompt file held %q", prompt)
	}
	if _, err := os.Stat(file); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("prompt file %s left behind", file)
	}
}

// The account the owner picked reaches crow-runs as --account and the log line.
func TestDispatchAccount(t *testing.T) {
	cases := []struct{ body, want, tail string }{
		{`{"project":"demo","label":"fix","prompt":"p","account":"spare"}`, "spare", "--json --account spare"},
		{`{"project":"demo","label":"fix","prompt":"p"}`, "", "--json"},
	}
	for _, tc := range cases {
		s, calls, log := liveServer(t, nil)
		if w := do(t, s, post("/api/dispatch", tc.body)); w.Code != 200 {
			t.Fatalf("status %d: %s", w.Code, w.Body)
		}
		args := strings.Join((*calls)[0].Args, " ")
		if !strings.HasSuffix(args, tc.tail) {
			t.Errorf("args %q, want suffix %q", args, tc.tail)
		}
		if evs := logLines(t, log); len(evs) != 1 || evs[0].Account != tc.want {
			t.Errorf("log = %+v", evs)
		}
	}
}

// AC2, AC3, AC6: refusals run nothing and log nothing.
func TestLiveRefusalsRunNothing(t *testing.T) {
	cases := []struct {
		c    call
		code int
	}{
		{post("/api/sessions/9999/stop", ""), 404},
		{post("/api/sessions/abc/send", `{"text":"x"}`), 404},
		{post("/api/sessions/4242/send", `{"text":"  "}`), 400},
		{post("/api/dispatch/nope/stop", ""), 404},
		{post("/api/sessions/4242/answer", `{"prompt":"old","option":"allow"}`), 409},
		{post("/api/sessions/5151/answer", `{"prompt":"p1","option":"deny"}`), 409},
		{post("/api/sessions/6161/answer", `{"prompt":"p2","option":"allow"}`), 409},
		{post("/api/sessions/4242/answer", `{"prompt":"p1","option":"always"}`), 400},
		{post("/api/sessions/4242/answer", `{"option":"deny"}`), 400},
		{post("/api/sessions/7171/answer", `{"prompt":"p3","option":"allow"}`), 409},
		{post("/api/sessions/7171/answer", `{"prompt":"old","answers":[[1]]}`), 409},
		{post("/api/sessions/4242/answer", `{"prompt":"p1","answers":[[1]]}`), 409},
		{post("/api/sessions/7171/answer", `{"prompt":"p3","option":"deny","answers":[[1]]}`), 400},
		{post("/api/sessions/7171/answer", `{"prompt":"p3","answers":{"a":1}}`), 400},
		{post("/api/today/mail-9/done", ""), 404},
		{post("/api/sessions/unknown/resume", ""), 404},
		{post("/api/sessions", `{"project":"ghost"}`), 400},
		{post("/api/sessions", `{"project":"demo","account":"nobody"}`), 400},
		{post("/api/dispatch", `{"project":"demo","label":"x"}`), 400},
		{post("/api/dispatch", `{"project":"demo","label":"x","prompt":"y","account":"nobody"}`), 400},
		{post("/api/dispatch", `{"project":"demo","label":"x","prompt":"y","account":"locked"}`), 400},
		{call{method: "POST", path: "/api/sessions/4242/send", body: `{"text":"x"}`}, 403},
		{call{method: "POST", path: "/api/sessions/4242/stop", header: map[string]string{CSRFHeader: "1", "Origin": "https://evil.example"}}, 403},
	}
	for _, tc := range cases {
		t.Run(tc.c.path, func(t *testing.T) {
			s, calls, log := liveServer(t, nil)
			if w := do(t, s, tc.c); w.Code != tc.code {
				t.Errorf("status %d, want %d: %s", w.Code, tc.code, w.Body)
			}
			if len(*calls) != 0 || len(logLines(t, log)) != 0 {
				t.Errorf("ran %v", *calls)
			}
		})
	}
}

// AC6: a third concurrent run is refused before the script runs.
func TestDispatchFullSlots(t *testing.T) {
	s, calls, _ := liveServer(t, nil)
	s.ext["dispatch"].src.Fetch = func() (any, error) {
		var v any
		return v, json.Unmarshal([]byte(`{"slots":{"busy":2,"max":2},"agents":[]}`), &v)
	}
	w := do(t, s, post("/api/dispatch", request(t, "run")))
	if w.Code != 409 || len(*calls) != 0 {
		t.Errorf("status %d calls %v: %s", w.Code, *calls, w.Body)
	}
}

// A section whose refresh fails is a stale view: 409, nothing runs.
func TestLiveStaleView(t *testing.T) {
	s, calls, _ := liveServer(t, nil)
	s.ext["dispatch"].src.Fetch = func() (any, error) { return nil, errors.New("crow-runs: exit status 2") }
	w := do(t, s, post("/api/sessions/4242/stop", ""))
	if w.Code != 409 || len(*calls) != 0 {
		t.Errorf("status %d calls %v: %s", w.Code, *calls, w.Body)
	}
}

// A refused script (code 1) answers 409 and is still logged once.
func TestLiveScriptRefusal(t *testing.T) {
	s, _, log := liveServer(t, func(scriptCall) ([]byte, error) {
		return []byte(`{"schema":1,"ok":false,"action":"send","target":"4242","message":"no window for pid 4242","code":1}`), errors.New("exit status 1")
	})
	w := do(t, s, post("/api/sessions/4242/send", `{"text":"hi"}`))
	evs := logLines(t, log)
	if w.Code != 409 || len(evs) != 1 || evs[0].OK || evs[0].Code != 1 {
		t.Errorf("status %d log %+v", w.Code, evs)
	}
}
