package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/charmbracelet/lipgloss"
	"github.com/muesli/termenv"
)

// TestShots writes each view as ANSI at several terminal sizes, for bin/ansi-shot:
//
//	SHOTS=out/ go test -run TestShots .                       # fixtures
//	SHOTS=out/ RUNS=runs.json USAGE=usage.json go test ...    # live payloads
//
// Sizes approximate real monitors: a vertical 1080p, a laptop, a wide 1440p, a small split.
func TestShots(t *testing.T) {
	dir := os.Getenv("SHOTS")
	if dir == "" {
		t.Skip("set SHOTS=<dir>")
	}
	lipgloss.SetColorProfile(termenv.ANSI)
	defer lipgloss.SetColorProfile(termenv.Ascii)
	snap := sample()
	if p := os.Getenv("RUNS"); p != "" {
		b, err := os.ReadFile(p)
		if err != nil {
			t.Fatal(err)
		}
		snap = &snapshot{}
		if err := json.Unmarshal(b, snap); err != nil {
			t.Fatal(err)
		}
	}
	ub, err := os.ReadFile(cmpOr(os.Getenv("USAGE"), "testdata/usage.json"))
	if err != nil {
		t.Fatal(err)
	}
	u, err := parseUsage(ub)
	if err != nil {
		t.Fatal(err)
	}
	now := fixtureNow()
	if os.Getenv("RUNS") != "" {
		now = time.Now()
	}
	sizes := map[string][2]int{"vertical": {118, 95}, "laptop": {160, 45}, "wide": {240, 62}, "small": {90, 30}}
	os.MkdirAll(dir, 0o755)
	for name, sz := range sizes {
		for v, view := range []string{"agents", "usage", "savings", "history"} {
			m := model{w: sz[0], h: sz[1], snap: snap, usage: u, view: v, period: "w", now: now,
				updated: now, reports: map[string]string{}}
			m.rebuild()
			f := filepath.Join(dir, fmt.Sprintf("%s-%s.ans", view, name))
			if err := os.WriteFile(f, []byte(m.View()), 0o644); err != nil {
				t.Fatal(err)
			}
		}
	}
}

func cmpOr(a, b string) string {
	if a != "" {
		return a
	}
	return b
}
