package ops

import (
	"testing"

	"crow-core/contract"
)

func TestCleanTitle(t *testing.T) {
	for in, want := range map[string]string{
		"item-256-rail":                        "item_256 rail",
		"item-257-ops-2":                       "item_257 ops",
		"mr235-threads-ci":                     "!235 threads ci",
		"reply-x-2026-11-19.md":                "reply x",
		"2026-11-19-batch.md, owner-prefs.md":  "batch, owner prefs",
		"Ops.tsx, ops.ts":                      "ops",
		"sketch.html":                          "sketch",
		"Launch review threads on failing MRs": "Launch review threads on failing MRs",
	} {
		if got := cleanTitle(in); got != want {
			t.Errorf("cleanTitle(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestTidy(t *testing.T) {
	sp := func(st, a, b string) contract.OpsSpan {
		return contract.OpsSpan{State: st, Start: "2026-11-09T" + a + ":00+01:00", End: "2026-11-09T" + b + ":00+01:00"}
	}
	o := contract.Ops{Lanes: []contract.OpsLane{
		{ID: "a", Day: "2026-11-09", Project: "crow (hub)", Kind: "interactive", Title: "x.go", State: "working"},
		{ID: "b", Day: "2026-11-09", Project: "crow-butler", Kind: "run", Title: "review threads", State: "done"},
		{ID: "c", Day: "2026-11-09", Project: "crow", Kind: "run", Title: "item-7-ops", State: "done", Runs: 1, ActiveS: 600,
			Spans: []contract.OpsSpan{sp("done", "10:00", "10:20")}},
		{ID: "d", Day: "2026-11-09", Project: "crow", Kind: "run", Title: "item-7-ops-2", State: "run", Runs: 1, ActiveS: 300,
			Spans: []contract.OpsSpan{sp("working", "11:00", "11:05")}},
	}}
	got := Tidy(o, decode(t, registry)).Lanes
	if len(got) != 3 {
		t.Fatalf("lanes = %d, want 3: %+v", len(got), got)
	}
	if got[0].Project != "crow" || got[0].Title != "hub" {
		t.Errorf("hub lane = %s / %s", got[0].Project, got[0].Title)
	}
	if got[1].Project != "crow" || got[1].Title != "butler: review threads" {
		t.Errorf("butler lane = %s / %s", got[1].Project, got[1].Title)
	}
	m := got[2]
	if m.Title != "item_7 ops" || m.Runs != 2 || m.State != "run" || m.ID != "d" || m.ActiveS != 900 {
		t.Errorf("merged lane = %+v", m)
	}
	want := []contract.OpsSpan{sp("working", "10:00", "10:16"), sp("done", "10:16", "10:20"), sp("working", "11:00", "11:05")}
	if len(m.Spans) != 3 || m.Spans[0].End != "2026-11-09T09:16:00Z" && m.Spans[0].End != want[0].End || m.Spans[1].State != "done" {
		t.Errorf("spans = %+v", m.Spans)
	}
}
