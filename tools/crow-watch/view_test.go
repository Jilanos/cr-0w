package main

import (
	"os"
	"strings"
	"testing"

	"github.com/charmbracelet/lipgloss"
)

func sample() *snapshot {
	s := &snapshot{}
	s.Slots.Busy, s.Slots.Max = 1, 2
	s.Agents = []agent{
		{Kind: "run", Project: "obsidian-stacks", State: "working", LastActivityS: 4, ContextTokens: 64000,
			RunID: "d6a1b19c6c7e", Label: "0.2 item_000 books flow correctness", StartedAt: "2026-10-19T13:08:40+00:00",
			LastAction: "Bash: npm test -- newNote-undo with a very long command line that must be truncated cleanly",
			Commits:    []string{"8c5c4dc create task", "2085394 quick add keeps create"},
			Recent:     []event{{TS: "2026-10-19T13:12:33.919Z", Action: "Edit: src/views/quickAdd.ts"}}},
		{Kind: "session", Project: "crow (hub)", State: "waiting", LastActivityS: 120, ContextTokens: 420000,
			SessionID: "b88066e9-5b44", StartedAt: "2026-10-19T12:03:00+00:00", LastAction: "says: done"},
	}
	s.Finished = []finished{{RunID: "89e3de4b", Project: "lazytf", Label: "LICENSE + item_000", Status: "done",
		DurationS: 660, EndedAt: "2026-10-19T13:07:00+00:00", ResumedFrom: []string{"4f263cc5"}, Commits: []string{"e8e58f7 license"}}}
	return s
}

// The view must fill the terminal exactly and never overflow a line, in both
// a tall (stacked) and a wide (side-by-side) terminal.
func TestViewFitsTerminal(t *testing.T) {
	for _, size := range [][2]int{{118, 95}, {200, 50}, {90, 30}} {
		m := model{w: size[0], h: size[1], snap: sample(), reports: map[string]string{}}
		m.rebuild()
		v := m.View()
		lines := strings.Split(v, "\n")
		if len(lines) != size[1] {
			t.Errorf("%dx%d: %d lines, want %d", size[0], size[1], len(lines), size[1])
		}
		for i, l := range lines {
			if w := lipgloss.Width(l); w > size[0] {
				t.Errorf("%dx%d: line %d is %d wide", size[0], size[1], i, w)
			}
		}
		if os.Getenv("SHOW") != "" {
			t.Logf("\n%s", v)
		}
	}
}

func fixtureUsage(t *testing.T) *usage {
	b, err := os.ReadFile("testdata/usage.json")
	if err != nil {
		t.Fatal(err)
	}
	u, err := parseUsage(b)
	if err != nil {
		t.Fatal(err)
	}
	return u
}

// The usage view fills the terminal exactly; wide terminals show every section,
// narrow/short ones drop the sessions table first and always keep the gauges.
func TestUsageView(t *testing.T) {
	cases := []struct {
		w, h      int
		want, not []string
	}{
		{100, 40, []string{"AGENTS", "USAGE", "LIMITS", "TODAY $12.53", "32.8M tok (98% cache)", "SESSIONS today (6)",
			"opus-5-5,sonnet-5-5", "22.4M", "$7.69", "rtk saved 2.2M (29%)", "proposals pending 2"}, []string{"<synthetic>", "claude-"}},
		{60, 20, []string{"LIMITS", "work", "spare", "TODAY", "rtk saved"}, []string{"SESSIONS"}},
		{50, 14, []string{"LIMITS", "spare", "lab", "side", "work"}, []string{"SESSIONS"}},
	}
	for _, c := range cases {
		m := model{w: c.w, h: c.h, usage: fixtureUsage(t), showUsage: true, uCursor: 1, reports: map[string]string{}}
		v := m.View()
		lines := strings.Split(v, "\n")
		if len(lines) != c.h {
			t.Errorf("%dx%d: %d lines, want %d", c.w, c.h, len(lines), c.h)
		}
		for i, l := range lines {
			if w := lipgloss.Width(l); w > c.w {
				t.Errorf("%dx%d: line %d is %d wide", c.w, c.h, i, w)
			}
		}
		for _, s := range c.want {
			if !strings.Contains(v, s) {
				t.Errorf("%dx%d: missing %q", c.w, c.h, s)
			}
		}
		for _, s := range c.not {
			if strings.Contains(v, s) {
				t.Errorf("%dx%d: unexpected %q", c.w, c.h, s)
			}
		}
		if os.Getenv("SHOW") != "" {
			t.Logf("\n%s", v)
		}
	}
}

func TestUsageTodaySessions(t *testing.T) {
	u := fixtureUsage(t)
	if len(u.today) != 6 || u.today[0].End < u.today[5].End {
		t.Fatalf("today sessions: got %d, want 6 most recent first", len(u.today))
	}
	if got := human(340000); got != "340k" {
		t.Errorf("human(340000) = %q", got)
	}
	if got := shortReset("Oct 20 16:20", "2026-10-20"); got != "16:20" {
		t.Errorf("shortReset = %q", got)
	}
}
