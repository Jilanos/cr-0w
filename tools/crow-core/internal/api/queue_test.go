package api

import (
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

func TestRoutineAction(t *testing.T) {
	s, calls, log := liveServer(t, nil)
	if w := do(t, s, post("/api/routines/crow-retro.timer/pause", "")); w.Code != 200 {
		t.Fatalf("pause %d %s", w.Code, w.Body)
	}
	if len(*calls) != 1 || (*calls)[0].Name != "crow-routine" || !slices.Equal((*calls)[0].Args, []string{"pause", "crow-retro.timer"}) {
		t.Errorf("calls %+v", *calls)
	}
	if l := logLines(t, log); len(l) != 1 || l[0].Action != "routine_pause" {
		t.Errorf("log %+v", l)
	}
	for _, p := range []string{"/api/routines/crow-retro.timer/drop", "/api/routines/other.timer/run"} {
		if w := do(t, s, post(p, "")); w.Code != 404 {
			t.Errorf("%s: %d", p, w.Code)
		}
	}
}

func TestAFKEditSkip(t *testing.T) {
	s, _, log := liveServer(t, nil)
	dir := filepath.Join(s.o.StateDir, "afk")
	writeFile(t, filepath.Join(dir, "queue.md"), []byte("| 1 | job-crow-y.md | |\n"))
	writeFile(t, filepath.Join(dir, "job-crow-y.md"), []byte("old"))
	if w := do(t, s, call{method: http.MethodGet, path: "/api/afk?id=job-crow-y.md"}); w.Code != 200 || !strings.Contains(w.Body.String(), `"text":"old"`) {
		t.Fatalf("read %d %s", w.Code, w.Body)
	}
	if w := do(t, s, call{method: http.MethodPut, path: "/api/afk", header: csrf, body: `{"id":"job-crow-y.md","text":"new"}`}); w.Code != 200 {
		t.Fatalf("save %d %s", w.Code, w.Body)
	}
	if b, _ := os.ReadFile(filepath.Join(dir, "job-crow-y.md")); string(b) != "new" {
		t.Errorf("saved %q", b)
	}
	if w := do(t, s, post("/api/afk/skip?id=job-crow-y.md", "")); w.Code != 200 {
		t.Fatalf("skip %d %s", w.Code, w.Body)
	}
	if _, err := os.Stat(filepath.Join(dir, "superseded", "job-crow-y.md")); err != nil {
		t.Error(err)
	}
	if b, _ := os.ReadFile(filepath.Join(dir, "queue.md")); !strings.Contains(string(b), "skipped (nest)") {
		t.Errorf("queue %q", b)
	}
	if l := logLines(t, log); len(l) != 2 || l[0].Action != "afk_edit" || l[1].Action != "afk_skip" {
		t.Errorf("log %+v", l)
	}
	if w := do(t, s, call{method: http.MethodGet, path: "/api/afk?id=../queue.md"}); w.Code != 404 {
		t.Errorf("traversal %d", w.Code)
	}
}
