package api

import (
	"encoding/json"
	"os"
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
