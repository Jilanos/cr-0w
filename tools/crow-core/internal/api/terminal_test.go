package api

import (
	"errors"
	"net/http"
	"reflect"
	"testing"
)

// item_240: screen, keys and resize run crow-screen on a tmux session, reply with its
// line, map refusals to 409 and failures to 502, and log nothing.
func TestTerminalRoutes(t *testing.T) {
	cases := []struct {
		name  string
		c     call
		reply string
		err   error
		code  int
		args  []string
	}{
		{"screen", call{method: http.MethodGet, path: "/api/sessions/4242/screen"},
			`{"ok":true,"code":0,"message":"","lines":["$ "],"cols":80,"rows":24,"cursor":{"x":2,"y":0,"shown":true}}`, nil, 200,
			[]string{"show", "--pid", "4242"}},
		{"keys", post("/api/sessions/4242/keys", `{"keys":[{"text":"hi"},{"key":"Enter"}]}`),
			`{"ok":true,"code":0,"message":"sent 2 keys"}`, nil, 200,
			[]string{"keys", "--pid", "4242", "--keys", `[{"text":"hi"},{"key":"Enter"}]`}},
		{"resize", post("/api/sessions/4242/resize", `{"cols":100,"rows":30}`),
			`{"ok":true,"code":0,"message":"100x30"}`, nil, 200,
			[]string{"resize", "--pid", "4242", "--cols", "100", "--rows", "30"}},
		{"refused", post("/api/sessions/4242/keys", `{"keys":[{"key":"F99"}]}`),
			`{"ok":false,"code":1,"message":"unknown key F99"}`, errors.New("exit status 1"), 409, nil},
		{"tmux failed", call{method: http.MethodGet, path: "/api/sessions/4242/screen"},
			`{"ok":false,"code":2,"message":"tmux: no server"}`, errors.New("exit status 2"), 502, nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s, calls, logp := liveServer(t, func(scriptCall) ([]byte, error) { return []byte(tc.reply), tc.err })
			w := do(t, s, tc.c)
			if w.Code != tc.code {
				t.Fatalf("status %d, want %d: %s", w.Code, tc.code, w.Body)
			}
			if len(*calls) != 1 || (*calls)[0].Name != "crow-screen" {
				t.Fatalf("calls %+v, want one crow-screen", *calls)
			}
			if tc.args != nil && !reflect.DeepEqual((*calls)[0].Args, tc.args) {
				t.Errorf("args %q, want %q", (*calls)[0].Args, tc.args)
			}
			if len(logLines(t, logp)) != 0 {
				t.Error("terminal calls must not be logged")
			}
		})
	}
}

// Sessions outside tmux, unknown pids and bad bodies never reach crow-screen.
func TestTerminalRefusals(t *testing.T) {
	cases := []struct {
		c    call
		code int
	}{
		{call{method: http.MethodGet, path: "/api/sessions/6161/screen"}, 409},
		{call{method: http.MethodGet, path: "/api/sessions/9999/screen"}, 404},
		{post("/api/sessions/4242/keys", `{"keys":"Enter"}`), 400},
		{post("/api/sessions/4242/keys", `{}`), 400},
		{post("/api/sessions/4242/resize", `{"cols":5,"rows":30}`), 400},
		{call{method: http.MethodPost, path: "/api/sessions/4242/keys", body: `{"keys":[]}`}, 403},
	}
	for _, tc := range cases {
		s, calls, _ := liveServer(t, nil)
		if w := do(t, s, tc.c); w.Code != tc.code {
			t.Errorf("%s %s: status %d, want %d: %s", tc.c.method, tc.c.path, w.Code, tc.code, w.Body)
		}
		if len(*calls) != 0 {
			t.Errorf("%s: ran %+v", tc.c.path, *calls)
		}
	}
}
