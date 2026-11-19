package api

import (
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"testing"
	"time"

	"crow-core/contract"
	"crow-core/internal/ops"
)

func opsAnswer(t *testing.T, s *Server, path string) contract.Ops {
	t.Helper()
	w := do(t, s, call{path: path})
	var sec struct{ Data contract.Ops }
	if err := json.Unmarshal(w.Body.Bytes(), &sec); err != nil {
		t.Fatalf("%v: %s", err, w.Body)
	}
	return sec.Data
}

// The serve tick observer logs today's live lanes once per state change, and the ops
// answer lays the logged spans over the derived ones.
func TestObserveOpsLogsAndMerges(t *testing.T) {
	s, _ := newServer(t)
	if err := s.ObserveOps(); err != nil {
		t.Fatal(err)
	}
	if err := s.ObserveOps(); err != nil {
		t.Fatal(err)
	}
	lines, err := ops.ReadLog(s.opsLog.Path)
	if err != nil {
		t.Fatal(err)
	}
	if len(lines) == 0 {
		t.Fatal("no live lane logged")
	}
	seen := map[string]bool{}
	for _, x := range lines {
		if seen[x.Lane] {
			t.Errorf("lane %s logged twice without a change", x.Lane)
		}
		seen[x.Lane] = true
	}
	// One more line moves the first logged lane to waiting an hour ago.
	x := lines[0]
	x.TS, x.State = clock.Add(-time.Hour).UTC().Format(time.RFC3339), "waiting"
	b, _ := json.Marshal(x)
	if err := os.WriteFile(s.opsLog.Path, append(b, '\n'), 0o600); err != nil {
		t.Fatal(err)
	}
	o := opsAnswer(t, s, "/api/state/ops?day="+clock.Format(time.DateOnly))
	for _, l := range o.Lanes {
		if l.ID == x.Lane && l.WaitS >= 3600 {
			return
		}
	}
	t.Fatalf("lane %s has no logged wait: %+v", x.Lane, o.Lanes)
}

// Without a state dir the observer does nothing.
func TestObserveOpsNoStateDir(t *testing.T) {
	s := New(Options{Now: func() time.Time { return clock }})
	if err := s.ObserveOps(); err != nil {
		t.Fatal(err)
	}
	if s.opsLog != nil {
		t.Fatal("log without a state dir")
	}
}

func TestAFKPending(t *testing.T) {
	md := "| # | job file | item | state |\n|---|---|---|---|\n" +
		"| 1 | job-a.md | item_1 | done 58d5c24d |\n| 2 | job-b.md | item_2 | skipped (cap) |\n" +
		"| 3 | job-c.md | item_3 | running |\n| 4 | job-d.md | item_4 | |\n"
	if got := afkPending(md); !slices.Equal(got, []string{"job-c.md", "job-d.md"}) {
		t.Errorf("pending %v", got)
	}
}

func TestAFKJobsQueueFile(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, filepath.Join(dir, "afk", "queue.md"), []byte("| 1 | job-crow-x.md | done |\n| 2 | job-crow-y.md | |\n"))
	writeFile(t, filepath.Join(dir, "afk", "job-crow-x.md"), []byte("x"))
	writeFile(t, filepath.Join(dir, "afk", "job-crow-y.md"), []byte("y"))
	writeFile(t, filepath.Join(dir, "afk", "queued", "job-blur.md"), []byte("z"))
	got := afkJobs(dir)
	if len(got) != 2 || got[0].ID != "job-crow-y.md" || got[0].Title != "crow y" || got[1].ID != "queued/job-blur.md" {
		t.Errorf("afk %+v", got)
	}
}

func TestAddPaused(t *testing.T) {
	next := "2026-11-10T17:00:00Z"
	jobs := []Job{{Unit: "crow-retro.timer", Activates: "crow-retro.service", Next: &next}}
	jobs = AddPaused(jobs, []byte(`[{"unit_file":"crow-retro.timer","state":"enabled"},{"unit_file":"crow-toolwatch.timer","state":"disabled"},{"unit_file":"other.timer","state":"disabled"}]`))
	if len(jobs) != 2 || jobs[0].Paused || !jobs[1].Paused || jobs[1].Activates != "crow-toolwatch.service" {
		t.Errorf("jobs %+v", jobs)
	}
	jobs = AddDescriptions(jobs, []byte("Id=crow-retro.service\nDescription=crow daily session retro batch\n\nId=crow-toolwatch.service\nDescription=crow-toolwatch.service\n"))
	if jobs[0].Description != "crow daily session retro batch" || jobs[1].Description != "" {
		t.Errorf("descriptions %+v", jobs)
	}
}
