package main

import (
	"os"
	"strings"
	"testing"
	"time"

	"github.com/charmbracelet/lipgloss"
)

func fixtureNow() time.Time { return time.Date(2026, 10, 20, 13, 52, 31, 0, time.Local) }

func sample() *snapshot {
	s := &snapshot{}
	s.Slots.Busy, s.Slots.Max = 1, 2
	s.Agents = []agent{
		{Kind: "run", Project: "notes-plugin", State: "working", LastActivityS: 4, ContextTokens: 64000,
			RunID: "d6a1b19c6c7e", Label: "0.2 item_000 books flow correctness", StartedAt: "2026-10-20T11:08:40+00:00",
			LastAction: "Bash: npm test -- newNote-undo with a very long command line that must be truncated cleanly",
			Commits:    []string{"8c5c4dc create task", "2085394 quick add keeps create"},
			Recent:     []event{{TS: "2026-10-20T11:12:33.919Z", Action: "Edit: src/views/quickAdd.ts"}}},
		{Kind: "session", Project: "hub", State: "idle", LastActivityS: 900, ContextTokens: 120000, Title: "morning brief",
			SessionID: "a77066e9-5b44", StartedAt: "2026-10-20T08:03:00+00:00", LastAction: "says: ok"},
		{Kind: "session", Project: "hub", State: "waiting", LastActivityS: 120, ContextTokens: 820000, Title: "usage pill for the bar",
			SessionID: "b88066e9-5b44", StartedAt: "2026-10-20T09:03:00+00:00", LastAction: "says: done", LastPrompt: "can you check the pill?"},
	}
	s.Finished = []finished{{RunID: "89e3de4b", Project: "terraform-tui", Label: "LICENSE + item_000", Status: "done",
		DurationS: 660, EndedAt: "2026-10-20T10:07:00+00:00", ResumedFrom: []string{"4f263cc5"}, Commits: []string{"e8e58f7 license"}}}
	return s
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

var sizes = [][2]int{{118, 95}, {160, 45}, {240, 62}, {90, 30}, {60, 20}}

// Every view must fill the terminal exactly and never overflow a line, at every size.
func TestViewsFitTerminal(t *testing.T) {
	u := fixtureUsage(t)
	for _, size := range sizes {
		for v := range viewNames {
			m := model{w: size[0], h: size[1], snap: sample(), usage: u, view: v, period: "w", now: fixtureNow(), reports: map[string]string{}}
			m.rebuild()
			out := m.View()
			lines := strings.Split(out, "\n")
			if len(lines) != size[1] {
				t.Errorf("%s %dx%d: %d lines, want %d", viewNames[v], size[0], size[1], len(lines), size[1])
			}
			for i, l := range lines {
				if w := lipgloss.Width(l); w != size[0] {
					t.Errorf("%s %dx%d: line %d is %d wide", viewNames[v], size[0], size[1], i, w)
					break
				}
			}
			if os.Getenv("SHOW") != "" {
				t.Logf("\n%s", out)
			}
		}
	}
}

func contains(t *testing.T, what, out string, want, not []string) {
	t.Helper()
	for _, s := range want {
		if !strings.Contains(out, s) {
			t.Errorf("%s: missing %q", what, s)
		}
	}
	for _, s := range not {
		if strings.Contains(out, s) {
			t.Errorf("%s: unexpected %q", what, s)
		}
	}
}

// Tall terminals show every usage section; small ones keep limits and sessions.
func TestUsageSections(t *testing.T) {
	u := fixtureUsage(t)
	tall := model{w: 118, h: 95, usage: u, view: vUsage, now: fixtureNow()}
	contains(t, "tall", tall.View(), []string{"Limits", "Spend", "Sessions", "Savings", "History", "prompt cache", "runs out ~", "today"}, []string{"<synthetic>", "claude-"})
	small := model{w: 90, h: 30, usage: u, view: vUsage, now: fixtureNow()}
	contains(t, "small", small.View(), []string{"Limits", "Sessions"}, []string{"By project"})
	wide := model{w: 240, h: 62, usage: u, view: vUsage, now: fixtureNow()}
	contains(t, "wide", wide.View(), []string{"Limits", "Spend", "Savings", "Sessions", "History", "By project"}, nil)
}

func TestAgentsView(t *testing.T) {
	m := model{w: 118, h: 60, snap: sample(), usage: fixtureUsage(t), now: fixtureNow(), reports: map[string]string{}, selKey: "b88066e9-5b44"}
	m.rebuild()
	if m.items[1].agent.State != "waiting" {
		t.Fatalf("waiting session should sort first among sessions, got %s", m.items[1].agent.State)
	}
	out := m.View()
	contains(t, "agents", out, []string{"Runs", "1 of 2 slots busy", "Sessions", "needs you", "82%", "usage pill for the bar", "Latest prompt", "Today"}, []string{"1/2"})
}

func TestUsageRows(t *testing.T) {
	u := fixtureUsage(t)
	if u.nToday == 0 || u.rows[0].head {
		t.Fatalf("today's sessions come first without a heading, got nToday=%d", u.nToday)
	}
	for i := 1; i < u.nToday; i++ {
		if u.rows[i].cost > u.rows[i-1].cost {
			t.Fatalf("today's sessions not sorted by cost at %d", i)
		}
	}
	if got := human(340000); got != "340k" {
		t.Errorf("human(340000) = %q", got)
	}
	if got := shortReset("Oct 20 16:20", "2026-10-20"); got != "16:20" {
		t.Errorf("shortReset = %q", got)
	}
}

func TestHHMMWithoutSeconds(t *testing.T) {
	for _, iso := range []string{"2026-10-20T18:40+02:00", "2026-10-20T18:40:00+02:00"} {
		want := time.Date(2026, 10, 20, 16, 40, 0, 0, time.UTC).Local().Format("15:04")
		if got := hhmm(iso); got != want {
			t.Errorf("hhmm(%q) = %q, want %q", iso, got, want)
		}
	}
}
