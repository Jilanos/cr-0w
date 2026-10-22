package main

import (
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

func fixtureNow() time.Time { return time.Date(2026, 10, 20, 13, 52, 31, 0, time.Local) }

func sample() *snapshot {
	s := &snapshot{}
	s.Slots.Busy, s.Slots.Max = 1, 2
	s.Agents = []agent{
		{Kind: "run", Project: "notes-plugin", State: "working", LastActivityS: 4, ContextTokens: 64000,
			RunID: "d6a1b19c6c7e", SessionID: "13f3961c-b13e-ce02-8773-39492d2231b7", Label: "0.2 item_000 books flow correctness", StartedAt: "2026-10-20T11:08:40+00:00",
			LastAction: "Bash: npm test -- newNote-undo with a very long command line that must be truncated cleanly",
			Commits:    []string{"8c5c4dc create task", "2085394 quick add keeps create"},
			Recent:     []event{{TS: "2026-10-20T11:12:33.919Z", Action: "Edit: src/views/quickAdd.ts"}}},
		{Kind: "session", Project: "hub", State: "idle", LastActivityS: 900, ContextTokens: 120000, Title: "morning brief",
			SessionID: "912e46e6-dce4-c3c0-f315-9108adf8aa15", StartedAt: "2026-10-20T08:03:00+00:00", LastAction: "says: ok"},
		{Kind: "session", Project: "hub", State: "waiting", LastActivityS: 120, ContextTokens: 820000, Title: "usage pill for the bar",
			SessionID: "1d7947d7-6f95-cc15-d38d-84cdfadca8ff", StartedAt: "2026-10-20T09:03:00+00:00", LastAction: "says: done", LastPrompt: "can you check the pill?"},
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
	tall := model{w: 118, h: 95, usage: u, view: vUsage, period: "w", now: fixtureNow()}
	contains(t, "tall", tall.View(), []string{"Limits", "Spend", "Sessions", "Savings", "rtk", "cache", "runs out ~", "today", "By project", "By model", "cache read"},
		[]string{"<synthetic>", "claude-", "Context weight", "By day", "History"})
	small := model{w: 90, h: 30, usage: u, view: vUsage, period: "w", now: fixtureNow()}
	contains(t, "small", small.View(), []string{"Limits", "Sessions"}, []string{"By project"})
	wide := model{w: 240, h: 62, usage: u, view: vUsage, period: "w", now: fixtureNow()}
	contains(t, "wide", wide.View(), []string{"Limits", "Spend", "Savings", "Sessions", "account", "5h", "week", "Monday 19 October", "By project", "By model"},
		[]string{"Context weight", "By day", "3 Savings"})
	laptop := model{w: 160, h: 45, usage: u, view: vUsage, period: "w", now: fixtureNow()}
	contains(t, "laptop", laptop.View(), []string{"Limits", "Spend", "Savings", "Sessions", "prompt cache", "Mon", "7 days"}, []string{"3 History", "By day"})
	for _, size := range [][2]int{{118, 95}, {160, 45}, {240, 62}} {
		for _, p := range []string{"d", "w", "m"} {
			m := model{w: size[0], h: size[1], usage: u, view: vUsage, period: p, now: fixtureNow()}
			contains(t, fmt.Sprintf("usage %dx%d period %s keeps the token split and the savings", size[0], size[1], p), m.View(),
				[]string{"cache read", "Savings", "prompt cache", "model routing", "compactions", "retros"}, nil)
		}
	}
}

// Earlier days are folded to their header; Enter or Space unfolds the day under the cursor.
func TestFoldedDays(t *testing.T) {
	u := fixtureUsage(t)
	m := model{w: 160, h: 62, usage: u, view: vUsage, period: "w", now: fixtureNow(), reports: map[string]string{}}
	out := m.View()
	contains(t, "folded", out, []string{"+ Monday 19 October", "15 sessions today"}, []string{"- Monday 19 October"})
	var day string
	for i := range u.rows {
		if r := &u.rows[i]; r.head {
			day = r.day
			break
		}
	}
	m.uCursor = m.cursorOfDay(day)
	for _, key := range []string{"enter", " "} {
		next, _ := m.Update(keyMsg(key))
		m = next.(model)
		want := key == "enter"
		if m.expanded[day] != want {
			t.Fatalf("after %q expanded[%s] = %v, want %v", key, day, m.expanded[day], want)
		}
		if want {
			contains(t, "unfolded", m.View(), []string{"- Monday 19 October"}, []string{"+ Monday 19 October"})
		}
	}
	// the cursor can reach the unfolded rows and o/c act on a session, not on a header
	m.expanded = map[string]bool{day: true}
	if got := len(u.visible(m.expanded)); got <= len(u.visible(nil)) {
		t.Errorf("unfolding a day shows %d rows, folded shows %d", got, len(u.visible(nil)))
	}
	if r := u.pick(nil, u.nToday); r == nil || !r.head {
		t.Errorf("the row after today's sessions should be a day header")
	}
}

func TestToolsToggle(t *testing.T) {
	u := fixtureUsage(t)
	for _, size := range [][2]int{{118, 95}, {160, 45}, {240, 62}} {
		m := model{w: size[0], h: size[1], usage: u, view: vUsage, period: "w", now: fixtureNow(), reports: map[string]string{}}
		contains(t, "tools off", m.View(), nil, []string{"Context weight"})
		next, _ := m.Update(keyMsg("t"))
		m = next.(model)
		contains(t, fmt.Sprintf("tools on %dx%d", size[0], size[1]), m.View(), []string{"Context weight by tool", "per call"}, []string{"By model"})
	}
}

func keyMsg(k string) tea.KeyMsg {
	switch k {
	case "enter":
		return tea.KeyMsg{Type: tea.KeyEnter}
	case " ":
		return tea.KeyMsg{Type: tea.KeySpace, Runes: []rune{' '}}
	}
	return tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune(k)}
}

// cursorOfDay: the visible index of a day's header.
func (m model) cursorOfDay(day string) int {
	for i, ri := range m.usage.visible(m.expanded) {
		if r := m.usage.rows[ri]; r.head && r.day == day {
			return i
		}
	}
	return -1
}

// A session's newest row carries its account and its share of the account's limit windows.
func TestSessionLimitShares(t *testing.T) {
	u := fixtureUsage(t)
	var r sessRow
	for _, x := range u.rows {
		if !x.head && x.first && x.s.LimitShare.FiveHour != nil && *x.s.LimitShare.FiveHour >= 1 {
			r = x
			break
		}
	}
	if r.s == nil {
		t.Fatal("no session with a 5h share in the fixture")
	}
	l := u.rowLine(r, 140, false)
	var b strings.Builder
	for _, sg := range l {
		b.WriteString(sg.text)
	}
	contains(t, "row", b.String(), []string{r.s.Account, sharePct(r.s.LimitShare.FiveHour), sharePct(r.s.LimitShare.Week)}, nil)
}

// sampleIntr: the registry as crow-sessions lists it: one recent stop, one
// from days ago, one already relaunched, one that is open again (live).
func sampleIntr() []interrupted {
	return []interrupted{
		{ID: "5ab51b0c-0000", Account: "main", Project: "notes-plugin", Cwd: "/work/notes-plugin", Branch: "night/books-flow",
			LastEvent: "2026-10-20T10:25:00.000Z", Limit: "five_hour", ResetsAt: 1792000000, FirstPrompt: "0.2 books flow\nmore",
			LastPrompt: "commit the books flow fix", Workspaces: []string{"/work/notes-plugin"}},
		{ID: "old00000-0000", Account: "main", Project: "dotfiles", LastEvent: "2026-10-17T10:25:00.000Z", Limit: "five_hour"},
		{ID: "done0000-0000", Account: "main", Project: "hub", LastEvent: "2026-10-20T11:00:00.000Z", Relaunched: map[string]any{"target": "spare"}},
		{ID: "1d7947d7-6f95-cc15-d38d-84cdfadca8ff", Account: "main", Project: "hub", LastEvent: "2026-10-20T11:00:00.000Z"},
	}
}

func triageModel(t *testing.T) model {
	s := sample()
	s.Finished = append(s.Finished, finished{RunID: "fa11ed00", Project: "billing-api", Label: "pagination", Status: "failed",
		DurationS: 300, EndedAt: "2026-10-20T09:07:00+00:00"})
	m := model{w: 160, h: 45, snap: s, intr: sampleIntr(), usage: fixtureUsage(t), now: fixtureNow(), reports: map[string]string{}}
	m.rebuild()
	return m
}

// The board lists what needs the owner first, then work, finished runs and idle sessions.
func TestAgentsTriageOrder(t *testing.T) {
	m := triageModel(t)
	var got []string
	for _, it := range m.items {
		got = append(got, fmt.Sprintf("%s:%s", groupNames[it.group], it.key))
	}
	want := []string{"Needs you:1d7947d7-6f95-cc15-d38d-84cdfadca8ff", "Needs you:fa11ed00", "Needs you:5ab51b0c-0000",
		"Working:d6a1b19c6c7e", "Finished:89e3de4b", "Idle:912e46e6-dce4-c3c0-f315-9108adf8aa15"}
	if strings.Join(got, " ") != strings.Join(want, " ") {
		t.Fatalf("order\n got %v\nwant %v", got, want)
	}
}

func TestAgentsView(t *testing.T) {
	m := triageModel(t)
	out := m.View()
	contains(t, "agents", out,
		[]string{"Needs you", "Working", "1 of 2 run slots busy", "Finished", "Idle", "waiting for your reply", "ctx 82%",
			"main 5h limit", "failed", "1 commit", "Today"},
		[]string{"ctx 12%", "ctx 6%", "context used", "1/2", "old00000", "dotfiles", "so far", " a…"})
	m.selKey = "5ab51b0c-0000"
	m.rebuild()
	contains(t, "interrupted details", m.View(), []string{"stopped by the 5h limit", "crow relaunch 5ab51b0c", "commit the books flow fix"}, nil)
	m.selKey = "1d7947d7-6f95-cc15-d38d-84cdfadca8ff"
	m.rebuild()
	contains(t, "waiting details", m.View(), []string{"Latest prompt", "can you check the pill?"}, nil)
}

// With nothing waiting, the first group still answers the question.
func TestAgentsNothingWaiting(t *testing.T) {
	s := sample()
	s.Agents = s.Agents[:2]
	m := model{w: 160, h: 45, snap: s, now: fixtureNow(), reports: map[string]string{}}
	m.rebuild()
	contains(t, "calm", m.View(), []string{"Needs you  nothing waiting on you"}, []string{"◆ 1 need"})
}

func TestCtxTag(t *testing.T) {
	w := contextWindow()
	for _, c := range []struct {
		tokens int
		want   string
	}{{0, ""}, {w * 69 / 100, ""}, {w * 70 / 100, "ctx 70%"}, {w * 90 / 100, "ctx 90%"}} {
		if got := ctxTag(c.tokens).text; got != c.want {
			t.Errorf("ctxTag(%d) = %q, want %q", c.tokens, got, c.want)
		}
	}
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

// A tall terminal shows every Usage section.
func TestTallUsageShowsEverySection(t *testing.T) {
	m := model{w: 118, h: 95, snap: sample(), usage: fixtureUsage(t), view: 1, period: "w", now: fixtureNow(), reports: map[string]string{}}
	m.rebuild()
	out := m.View()
	for _, s := range []string{"Limits", "Spend", "Sessions", "Savings", "By project", "By model"} {
		if !strings.Contains(out, "─ "+s) {
			t.Errorf("tall usage view is missing the %s box", s)
		}
	}
}

func TestLineBarShortWidths(t *testing.T) {
	count := func(pct float64, cells int) int {
		return len([]rune(lineBar(pct, cells, sOK)[0].text))
	}
	for _, c := range []struct {
		pct         float64
		cells, want int
	}{{3, 4, 1}, {97, 4, 3}, {0, 4, 0}, {100, 4, 4}, {50, 4, 2}, {50, 1, 1}} {
		if got := count(c.pct, c.cells); got != c.want {
			t.Errorf("lineBar(%v,%d) filled %d, want %d", c.pct, c.cells, got, c.want)
		}
	}
}
