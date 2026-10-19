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
