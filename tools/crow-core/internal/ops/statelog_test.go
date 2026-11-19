package ops

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"crow-core/contract"
)

// clock is a fake clock the tests move by hand.
type clock struct{ t time.Time }

func (c *clock) tick(d time.Duration) time.Time { c.t = c.t.Add(d); return c.t }

func live(id, state string) contract.OpsLane {
	return contract.OpsLane{ID: id, Keys: []string{id}, Project: "crow", Title: id, Account: "work", Kind: "interactive", State: state}
}

func states(t *testing.T, path string) []string {
	t.Helper()
	ls, err := ReadLog(path)
	if err != nil {
		t.Fatal(err)
	}
	var out []string
	for _, x := range ls {
		out = append(out, x.Lane+" "+x.State)
	}
	return out
}

// One line per lane per state change, not per tick; a lane that leaves ends with done,
// a paused lane ends stuck; a new Log on the same file goes on from its last lines.
func TestLogOneLinePerChange(t *testing.T) {
	p := filepath.Join(t.TempDir(), LogName)
	c := &clock{now}
	l := &Log{Path: p}
	steps := [][]contract.OpsLane{
		{live("a", "working"), live("b", "needs"), live("c", "done")},
		{live("a", "working"), live("b", "needs")},
		{live("a", "idle"), live("b", "needs"), live("p", "run")},
		{live("b", "working"), live("p", "paused")},
	}
	for _, ls := range steps {
		if err := l.Observe(c.tick(2*time.Minute), ls); err != nil {
			t.Fatal(err)
		}
	}
	want := []string{"a working", "b waiting", "a waiting", "p working", "b working", "a done", "p stuck"}
	if got := states(t, p); !reflect.DeepEqual(got, want) {
		t.Fatalf("lines = %q, want %q", got, want)
	}
	again := &Log{Path: p}
	if err := again.Observe(c.tick(2*time.Minute), []contract.OpsLane{live("b", "working")}); err != nil {
		t.Fatal(err)
	}
	if got := states(t, p); len(got) != len(want) {
		t.Fatalf("reload wrote again: %q", got)
	}
	if err := again.Observe(c.tick(2*time.Minute), nil); err != nil {
		t.Fatal(err)
	}
	if got := states(t, p); got[len(got)-1] != "b done" {
		t.Fatalf("b not ended after reload: %q", got)
	}
}

// The log rotates to <path>.1 at MaxBytes and keeps two files; reads go oldest first and
// skip bad lines.
func TestLogRotates(t *testing.T) {
	p := filepath.Join(t.TempDir(), LogName)
	c := &clock{now}
	l := &Log{Path: p, MaxBytes: 300}
	for i := range 12 {
		st := "working"
		if i%2 == 1 {
			st = "needs"
		}
		if err := l.Observe(c.tick(time.Minute), []contract.OpsLane{live("a", st)}); err != nil {
			t.Fatal(err)
		}
	}
	for _, f := range []string{p, p + ".1"} {
		st, err := os.Stat(f)
		if err != nil {
			t.Fatal(err)
		}
		if st.Size() > 300+200 {
			t.Errorf("%s is %d bytes", f, st.Size())
		}
	}
	if _, err := os.Stat(p + ".2"); err == nil {
		t.Error("a third file was kept")
	}
	got, err := ReadLog(p)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) == 0 || len(got) >= 12 {
		t.Fatalf("read %d lines, want the last few of 12", len(got))
	}
	for i := 1; i < len(got); i++ {
		if got[i].TS <= got[i-1].TS {
			t.Fatalf("not oldest first: %v", got)
		}
	}
	if got[len(got)-1].State != "waiting" {
		t.Errorf("last line = %+v", got[len(got)-1])
	}
	f, _ := os.OpenFile(p, os.O_APPEND|os.O_WRONLY, 0o600)
	f.WriteString("not json\n{\"lane\":\"x\"}\n{\"ts\":\"yesterday\",\"lane\":\"x\",\"state\":\"working\"}\n")
	f.Close()
	if again, _ := ReadLog(p); len(again) != len(got) {
		t.Errorf("bad lines read: %d, want %d", len(again), len(got))
	}
}

func line(lane, state string, h, m int, day int) Line {
	return Line{TS: time.Date(2026, 11, day, h, m, 0, 0, zone).UTC().Format(time.RFC3339), Lane: lane, Keys: []string{lane},
		Project: "crow", Title: "logged " + lane, Account: "work", Kind: "run", State: state}
}

// Logged spans replace the derived ones inside the logged window; derived spans outside it
// stay; totals follow.
func TestMergeOverPastDay(t *testing.T) {
	o := Build(input(t, "2026-11-09", "2026-11-10"))
	before := byID(t, o, "2026-11-09", "s1")
	if before.WaitS != 0 {
		t.Fatalf("derived lane already waits: %+v", before)
	}
	lines := []Line{
		line("s1", "working", 8, 0, 9), line("s1", "waiting", 8, 20, 9),
		line("s1", "working", 9, 0, 9), line("s1", "done", 9, 10, 9),
	}
	m := Merge(o, lines, now)
	got := byID(t, m, "2026-11-09", "s1")
	want := []contract.OpsSpan{
		{State: "working", Start: at9(8, 0), End: at9(8, 20)},
		{State: "waiting", Start: at9(8, 20), End: at9(9, 0)},
		{State: "done", Start: at9(9, 0), End: at9(9, 10)},
	}
	if !reflect.DeepEqual(got.Spans, want) {
		t.Fatalf("spans = %+v\nwant %+v", got.Spans, want)
	}
	if got.WaitS != 40*60 || got.ActiveS != 30*60 {
		t.Errorf("wait %d active %d", got.WaitS, got.ActiveS)
	}
	if got.CostUSD != before.CostUSD || got.Tokens != before.Tokens {
		t.Errorf("cost or tokens changed: %+v", got)
	}
	if !reflect.DeepEqual(byID(t, o, "2026-11-09", "s1"), before) {
		t.Error("Merge changed its input")
	}
	// Today has no log line for s1 before now: its derived lane stays.
	if a, b := byID(t, o, "2026-11-10", "s1"), byID(t, m, "2026-11-10", "s1"); !reflect.DeepEqual(a, b) {
		t.Errorf("today changed:\n%+v\n%+v", a, b)
	}
	var wait int64
	for _, l := range m.Lanes {
		wait += l.WaitS
	}
	var tw int64
	for _, tt := range m.Totals {
		if tt.By == "kind" {
			tw += tt.WaitS
		}
	}
	if tw != wait {
		t.Errorf("totals wait %d, lanes %d", tw, wait)
	}
}

// A lane only the log knows gets its own lane; a still-open line runs until now.
func TestMergeLoggedOnlyLane(t *testing.T) {
	o := Build(input(t, "2026-11-10"))
	n := len(o.Lanes)
	m := Merge(o, []Line{line("x9", "working", 8, 0, 10), line("x9", "waiting", 8, 30, 10)}, now)
	if len(m.Lanes) != n+1 {
		t.Fatalf("lanes %d, want %d", len(m.Lanes), n+1)
	}
	got := m.Lanes[n]
	if got.ID != "x9" || got.Kind != "run" || got.State != "needs" || got.Title != "logged x9" {
		t.Errorf("lane = %+v", got)
	}
	want := []contract.OpsSpan{
		{State: "working", Start: at(8, 0), End: at(8, 30)},
		{State: "waiting", Start: at(8, 30), End: at(9, 0)},
	}
	if !reflect.DeepEqual(got.Spans, want) {
		t.Errorf("spans = %+v", got.Spans)
	}
	if same := Merge(o, nil, now); !reflect.DeepEqual(same, o) {
		t.Error("no lines changed the answer")
	}
}

func at9(h, m int) string {
	return time.Date(2026, 11, 9, h, m, 0, 0, zone).Format(time.RFC3339)
}
