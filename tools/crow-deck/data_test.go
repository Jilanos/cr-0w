package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	tea "github.com/charmbracelet/bubbletea"
)

// All payloads below are invented. They follow the shape of the scripts' JSON.

func testNow() time.Time {
	return time.Date(2026, 10, 29, 14, 7, 0, 0, time.Local)
}

func iso(h, m int) string {
	return time.Date(2026, 10, 29, h, m, 0, 0, time.Local).UTC().Format(time.RFC3339)
}

func testRuns() *runsSnap {
	r := &runsSnap{}
	r.Slots.Busy, r.Slots.Max = 1, 2
	r.Agents = []liveAgent{
		{PID: 11, Account: "main", Project: "atlas", Cwd: "/w/atlas", SessionID: "s-wait", State: "waiting", StartedAt: iso(13, 55),
			LastActivityS: 60, LastAction: "says: Keep this finding?\nmore", ContextTokens: 31000, Title: "review !1",
			Recent: []event{{TS: iso(14, 6), Action: "checking config"}, {TS: iso(14, 4), Action: "reading file"}}},
		{PID: 12, Account: "main", Project: "orbit (hub)", Cwd: "/w/orbit", SessionID: "s-work", State: "working", StartedAt: iso(14, 0),
			LastAction: "edit x.go", ContextTokens: 5000},
		{PID: 13, Account: "main", Project: "orbit", SessionID: "s-idle", State: "idle", StartedAt: iso(9, 0), Title: "notes"},
		{Kind: "run", PID: 14, Account: "spare", Project: "atlas", RunID: "abcd1234", Label: "lint", State: "working", StartedAt: iso(14, 1)},
	}
	r.Finished = []finishedRun{
		{RunID: "ffff0001", Project: "atlas", Label: "tests", Status: "ok", DurationS: 600, EndedAt: iso(11, 5), Commits: []string{"a", "b"}, CostUSD: fp(0.7084), BudgetUSD: fp(25)},
		{RunID: "ffff0002", Project: "atlas", Label: "old", Status: "ok", EndedAt: time.Date(2026, 10, 28, 11, 0, 0, 0, time.Local).UTC().Format(time.RFC3339)},
	}
	return r
}

func testReg() *registry {
	return &registry{
		Identities: map[string]string{"work": "w@example.test", "personal": "p@example.test"},
		StateDir:   "/nonexistent",
		Projects: []regProject{
			{Name: "atlas", Short: "atl", Scope: "work", Git: regGit{Email: "w@example.test", StaleTrees: 1}},
			{Name: "orbit", Short: "orb", Scope: "personal", Git: regGit{Email: "p@example.test", Dirty: 2}},
		},
	}
}

func TestAgentRowsGroupsAndSort(t *testing.T) {
	resets := time.Date(2026, 10, 29, 16, 30, 0, 0, time.Local).Unix()
	intr := []intrSession{
		{ID: "paused-session-1", Account: "main", Project: "atlas", Cwd: "/w/atlas", LastEvent: iso(13, 0), Limit: "five_hour", ResetsAt: resets},
		{ID: "gone", Project: "atlas", LastEvent: iso(13, 0), Relaunched: "yes"},
		{ID: "yesterday", Project: "atlas", LastEvent: time.Date(2026, 10, 28, 9, 0, 0, 0, time.Local).UTC().Format(time.RFC3339)},
	}
	rows := agentRows(testNow(), testRuns(), intr, testReg())
	var got []string
	for _, r := range rows {
		got = append(got, fmt.Sprintf("%d/%s/%s", r.Group, r.State, r.Short))
	}
	want := []string{
		"0/needs/review !1", "1/working/orb", "1/idle/notes", "2/working/lint",
		"2/waiting/atl paus", "3/done/atl tests",
	}
	if strings.Join(got, "|") != strings.Join(want, "|") {
		t.Fatalf("rows\n got %v\nwant %v", got, want)
	}
	needs := rows[0]
	if needs.Ask != "Keep this finding?\nmore" || needs.Doing != "asks you: Keep this finding?" {
		t.Errorf("needs row: ask %q doing %q", needs.Ask, needs.Doing)
	}
	if len(needs.Tail) != 2 || needs.Tail[0].Text != "reading file" {
		t.Errorf("tail not oldest first: %+v", needs.Tail)
	}
	if needs.Meta != "main · 31k tokens · 12m" {
		t.Errorf("meta %q", needs.Meta)
	}
	var paused agentRow
	for _, r := range rows {
		if r.Interrupted {
			paused = r
		}
	}
	if !strings.Contains(paused.Doing, "paused on 5h limit, back 16:30, R relaunch") {
		t.Errorf("paused doing %q", paused.Doing)
	}
	if n := (&fixtures{Agents: rows}).agentsNeedYou(); n != 1 {
		t.Errorf("needs you = %d, want 1", n)
	}
}

func TestSyncState(t *testing.T) {
	now := testNow()
	ls := newLiveState()
	if st, _ := ls.syncState(now); st != stLoading {
		t.Errorf("empty: %s", st)
	}
	ls.apply(srcMsg{src: srcRuns, val: testRuns(), at: now})
	if st, _ := ls.syncState(now); st != stFresh {
		t.Errorf("fresh: %s", st)
	}
	if st, note := ls.syncState(now.Add(5 * time.Minute)); st != stStale || note != "stale 5m" {
		t.Errorf("stale: %s %q", st, note)
	}
	ls.apply(srcMsg{src: srcUsage, err: errors.New("boom")})
	if st, note := ls.syncState(now); st != stError || note != "usage failed" {
		t.Errorf("error: %s %q", st, note)
	}
	ls.apply(srcMsg{src: srcUsage, val: &usageSnap{}, at: now})
	if st, _ := ls.syncState(now); st != stFresh {
		t.Errorf("recovered: %s", st)
	}
	bad := newLiveState()
	bad.apply(srcMsg{src: srcRuns, err: errors.New("no cdx")})
	if st, note := bad.syncState(now); st != stError || note != "cdx not running" {
		t.Errorf("first fetch failed: %s %q", st, note)
	}
}

func TestGaugeRowsSkipsNever(t *testing.T) {
	five, week, burn := 40, 70, 12.4
	usage := &usageSnap{Limits: []limitRow{
		{Account: "main", Remaining5hPct: &five, RemainingWeekPct: &week, Burn5h: &burn, Reset5hAt: "Oct 29 21:10"},
		{Account: "locked", Remaining5hPct: &five},
		{Account: "nodata"},
		{Account: "mate", Remaining5hPct: &five, RemainingWeekPct: &week},
	}}
	g, team := gaugeRows(testRuns(), usage, []acctPolicy{{"main", "use", "mine"}, {"locked", "never", "mine"}, {"mate", "never", "team"}}, testNow())
	if len(g) != 1 || g[0].Account != "main" || g[0].Reset != "21:10" || g[0].Burn != "burn 12%/h" || g[0].RunsMax != 2 || g[0].Week != 70 {
		t.Fatalf("gauges %+v", g)
	}
	if len(team) != 1 || team[0].Account != "mate" || team[0].Week != 70 {
		t.Fatalf("team %+v", team)
	}
}

func TestDoneToday(t *testing.T) {
	path := filepath.Join(t.TempDir(), "day.md")
	body := "- 09:10 [crow] first\n- 14:02 [retro] skipped\n- 11:30 [hub] daily posted\nnoise\n"
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	daily := filepath.Join(t.TempDir(), "2026-11-07.md")
	note := "# Day\n\n## 📥 Capture\n- 08:00 [x] not crow\n\n## CR-0W\n- 12:15 [hub] brief\n\n## 🌙 End of day\n- 18:00 [y] no\n"
	if err := os.WriteFile(daily, []byte(note), 0o644); err != nil {
		t.Fatal(err)
	}
	got := doneToday(path, daily)
	if len(got) != 3 || got[0] != (doneRow{"12:15", "hub", "brief"}) || got[1] != (doneRow{"11:30", "hub", "daily posted"}) || got[2].What != "first" {
		t.Fatalf("done %+v", got)
	}
}

func TestLanesJoinAgentsAndMergeRuns(t *testing.T) {
	agents := agentRows(testNow(), testRuns(), nil, testReg())
	day := "2026-10-29"
	act := func(bs ...int) map[string][]int { return map[string][]int{day: bs} }
	sessions := []usageSession{
		{ID: "s-wait", Account: "main", Project: "atlas", Title: "atlas: review !1", Activity: act(82, 83),
			ActivityTokens: map[string]map[string]int{day: {"82": 900, "83": 100}}, Models: []string{"claude-sonnet-5-5", "claude-opus-5-5[1m]"}},
		{ID: "s-done", Account: "main", Project: "orbit", Title: "notes pass", Activity: act(54, 55)},
		{ID: "r1", Kind: "run", Project: "atlas", Title: "lint", Activity: act(40), Today: struct {
			CostUSD float64 `json:"cost_usd"`
		}{0.5}},
		{ID: "r2", Kind: "run", Project: "atlas", Title: "lint", Activity: act(60), Today: struct {
			CostUSD float64 `json:"cost_usd"`
		}{0.25}},
		{ID: "s-old", Project: "orbit", Activity: map[string][]int{"2026-10-28": {10}}},
	}
	lanes := lanesOf(testNow(), sessions, agents, [2]int{1, 2}, testReg())
	by := map[string]laneRow{}
	for _, l := range lanes {
		by[l.Key] = l
	}
	if _, ok := by["s-old"]; ok {
		t.Error("yesterday's session got a lane")
	}
	w := by["s-wait"]
	if w.State != lsNeeds || !w.NextYou || w.Model != "opus-5-5" || w.Tok[82] != 900 || w.Ctx != 31000 || w.Cwd != "/w/atlas" {
		t.Errorf("waiting lane %+v", w)
	}
	if !w.WaitFrom.Equal(testNow().Add(-time.Minute)) {
		t.Errorf("wait from %v", w.WaitFrom)
	}
	if d := by["s-done"]; d.State != lsDone || d.Agent != -1 || d.Mins() != 20 {
		t.Errorf("done lane %+v", d)
	}
	if r := by["r1"]; r.Runs != 2 || len(r.Cells) != 2 || r.Cost != 0.75 {
		t.Errorf("merged runs %+v", r)
	}
	if i := by["s-idle"]; i.State != lsIdle || i.Next != "next prompt" {
		t.Errorf("live agent without activity %+v", i)
	}
	if o := laneOrder(lanes); lanes[o[0]].Key != "r1" && lanes[o[0]].Key != "s-wait" {
		t.Errorf("the project that needs the owner comes first: %v", o)
	}
	if n := whoName(usageSession{Project: "atlas", Title: "atlas: fix retry"}, testReg()); n != "fix retry" {
		t.Errorf("name %q", n)
	}
	if n := whoName(usageSession{Project: "atlas", Title: "atlas: /retro run"}, testReg()); n != "atl" {
		t.Errorf("slash title %q", n)
	}
}

func TestLaneGitParsesNumstat(t *testing.T) {
	old := gitRunner
	defer func() { gitRunner = old }()
	gitRunner = func(dir string, args ...string) (string, error) {
		switch {
		case args[1] == "--numstat":
			return "3\t1\tsrc/a.go\n-\t-\tlogo.png\n", nil
		case args[0] == "diff":
			return "diff --git a/src/a.go b/src/a.go\n+x\n", nil
		}
		return "abc123 fix[GO]: thing\n", nil
	}
	g := fetchLaneGit("/w")
	if len(g.Files) != 2 || g.Files[0] != (gitFile{Path: "src/a.go", Add: 3, Del: 1}) || !g.Files[1].Binary || len(g.Diff) != 2 || g.Last != "abc123 fix[GO]: thing" {
		t.Fatalf("git %+v", g)
	}
}

func TestOpenThreads(t *testing.T) {
	path := filepath.Join(t.TempDir(), "open-threads.md")
	body := "# Open threads\n- [ ] 2026-10-20 [orbit] before any section\n" +
		"## Me\n- [ ] 2026-10-28 [hub] write the runbook → decide\n- [x] 2026-10-27 [atlas] done thing\n" +
		"## Crow\n- [ ] 2026-10-29 [atlas] fix retry for CD-580 and !214 → session\nnot a thread\n" +
		"## Waiting\n- [ ] 2026-10-21 [atlas] Sam: review item_047 → wait\n" +
		"- [ ] 2026-10-22 [orbit] legal answer, no person → mail\n- [ ] bad-date [orbit] polish\n"
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	got := openThreads(path, testReg())
	want := []nextRow{
		{"orb", "before any section", true, "me", "2026-10-20", "", "orbit", ""},
		{"crow", "write the runbook", true, "me", "2026-10-28", "decide", "crow", ""},
		{"atl", "fix retry for CD-580 and !214", false, "crow", "2026-10-29", "CD-580", "atlas", ""},
		{"atl", "review item_047", false, "Sam", "2026-10-21", "item_047", "atlas", ""},
		{"orb", "legal answer, no person", true, "others", "2026-10-22", "mail", "orbit", ""},
		{"orb", "polish", true, "others", "", "", "orbit", ""},
	}
	if len(got) != len(want) {
		t.Fatalf("rows %+v", got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("row %d: %+v, want %+v", i, got[i], want[i])
		}
	}
	if openThreads(filepath.Join(t.TempDir(), "none.md"), testReg()) != nil {
		t.Error("missing file should give no rows")
	}
	now := time.Date(2026, 10, 29, 15, 0, 0, 0, time.Local)
	for in, out := range map[string]string{"2026-10-29": "today", "2026-10-22": "7d", "": "", "x": ""} {
		if a := threadAge(in, now); a != out {
			t.Errorf("age %q = %q, want %q", in, a, out)
		}
	}
}

func TestBuildFixturesLive(t *testing.T) {
	ls := newLiveState()
	now := testNow()
	ls.apply(srcMsg{src: srcRuns, val: testRuns(), at: now})
	ls.apply(srcMsg{src: srcRegistry, val: testReg(), at: now})
	fx := buildFixtures(liveInput{Now: now, LS: ls})
	if !fx.Live || fx.Sync != stFresh || fx.Slots != [2]int{1, 2} || len(fx.Agents) != 5 {
		t.Fatalf("fixtures %+v", fx)
	}
	if fx.Repos != 2 || fx.Dirty != 1 || fx.Health.StaleTrees != 1 || !fx.Health.Identity {
		t.Errorf("repos %d dirty %d health %+v", fx.Repos, fx.Dirty, fx.Health)
	}
	reg := testReg()
	reg.Projects[0].Git.Email = "other@example.test"
	ls.apply(srcMsg{src: srcRegistry, val: reg, at: now})
	if buildFixtures(liveInput{Now: now, LS: ls}).Health.Identity {
		t.Error("identity mismatch not flagged")
	}
}

// fakeHome writes stub scripts so the exec path of the fetchers runs for real.
func fakeHome(t *testing.T, scripts map[string]string) {
	t.Helper()
	home := t.TempDir()
	if err := os.MkdirAll(filepath.Join(home, "bin"), 0o755); err != nil {
		t.Fatal(err)
	}
	for name, out := range scripts {
		body := "#!/bin/sh\ncat <<'EOF'\n" + out + "\nEOF\n"
		if err := os.WriteFile(filepath.Join(home, "bin", name), []byte(body), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	t.Setenv("CROW_HOME", home)
}

func TestFetchThroughScripts(t *testing.T) {
	fakeHome(t, map[string]string{
		"crow-runs":     `{"slots":{"busy":1,"max":2},"agents":[{"pid":5,"account":"main","project":"atlas","state":"working"}],"finished":[]}`,
		"crow-sessions": `{"sessions":[{"conversation_id":"c1","account":"main","limit":"five_hour"}]}`,
		"crow-accounts": `{"accounts":[{"name":"main","policy":"use"}]}`,
		"crow-usage":    `not json`,
	})
	runs, err := fetchRuns()
	if err != nil || runs.Slots.Max != 2 || len(runs.Agents) != 1 {
		t.Fatalf("runs %+v %v", runs, err)
	}
	if s, err := fetchInterrupted(); err != nil || len(s) != 1 || s[0].ID != "c1" {
		t.Errorf("sessions %+v %v", s, err)
	}
	if a, err := fetchAccounts(); err != nil || a[0].Policy != "use" {
		t.Errorf("accounts %+v %v", a, err)
	}
	if _, err := fetchUsage(); err == nil {
		t.Error("bad JSON should fail")
	}
	if _, err := fetchRegistry(); err == nil {
		t.Error("missing script should fail")
	}
}

// ----- live model and actions -----

type call struct {
	name string
	args []string
}

func recordRuns(t *testing.T, out string, err error) *[]call {
	t.Helper()
	var calls []call
	old := runBin
	runBin = func(name string, args ...string) (string, error) {
		calls = append(calls, call{name, args})
		return out, err
	}
	t.Cleanup(func() { runBin = old })
	return &calls
}

func liveModel(t *testing.T) model {
	t.Helper()
	m := newModel(defaultConfig())
	m.page = 1
	m.goLive()
	m.now = testNow()
	m = send(m, srcMsg{src: srcRuns, val: testRuns(), at: testNow()}, srcMsg{src: srcRegistry, val: testReg(), at: testNow()})
	return m
}

func TestLiveModelLoadsAndKeepsCursor(t *testing.T) {
	m := newModel(defaultConfig())
	m.goLive()
	if m.sync != stLoading {
		t.Fatalf("sync %s before data", m.sync)
	}
	m = liveModel(t)
	if m.sync != stFresh || len(m.fx.Agents) != 5 {
		t.Fatalf("sync %s agents %d", m.sync, len(m.fx.Agents))
	}
	want := m.fx.Lanes[laneOrder(m.fx.Lanes)[2]].Key
	m = send(m, keyMsg("j"), keyMsg("j"))
	if m.agentKey != want {
		t.Fatalf("cursor on %q, want %q", m.agentKey, want)
	}
	// A refresh that adds a row above must not move the cursor off its agent.
	r := testRuns()
	r.Agents = append([]liveAgent{{PID: 99, Account: "main", Project: "atlas", SessionID: "s-new", State: "waiting", StartedAt: iso(14, 6)}}, r.Agents...)
	m = send(m, srcMsg{src: srcRuns, val: r, at: testNow()})
	if k := m.fx.Lanes[laneOrder(m.fx.Lanes)[m.agentSel]].Key; k != want {
		t.Errorf("cursor moved to %q", k)
	}
}

func TestAgentAnswerKeysSendThroughFocus(t *testing.T) {
	m := liveModel(t)
	calls := recordRuns(t, "sent", nil)
	m = send(m, keyMsg("a"))
	if !m.typing || m.input != "yes" || m.agentPane != apTail {
		t.Fatalf("a: typing %v input %q", m.typing, m.input)
	}
	m = send(m, keyMsg("esc"))
	m = send(m, keyMsg("e"))
	if m.input != "yes, but " {
		t.Errorf("e input %q", m.input)
	}
	m = send(m, keyMsg("esc"), keyMsg("x"))
	if m.input != "no" {
		t.Errorf("x input %q", m.input)
	}
	m = send(m, tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("!")})
	m = send(m, tea.KeyMsg{Type: tea.KeyEnter})
	if m.typing || m.input != "" || m.overlay != ovAct || len(*calls) != 0 || !hasText(m.View(), "no!") {
		t.Fatalf("enter: typing %v input %q overlay %d calls %d", m.typing, m.input, m.overlay, len(*calls))
	}
	next, cmd := m.Update(tea.KeyMsg{Type: tea.KeyEnter})
	m = next.(model)
	if cmd == nil || m.overlay != ovNone {
		t.Fatal("the second enter must run the send")
	}
	msg := cmd().(actionMsg)
	if len(*calls) != 1 || (*calls)[0].name != "crow-focus" || strings.Join((*calls)[0].args, " ") != "--pid 11 --send no!" {
		t.Errorf("calls %+v", *calls)
	}
	if msg.text != "sent: sent" {
		t.Errorf("flash %q", msg.text)
	}
	// An agent that does not wait for an answer ignores a x e c.
	m = send(m, keyMsg("j"), keyMsg("a"))
	if m.typing || !strings.Contains(m.flash, "does not wait") {
		t.Errorf("running agent: typing %v flash %q", m.typing, m.flash)
	}
}

func TestAttachAndFailureFlash(t *testing.T) {
	m := liveModel(t)
	calls := recordRuns(t, "no window", errors.New("exit 1"))
	_, cmd := m.Update(keyMsg("g"))
	msg := cmd().(actionMsg)
	got := strings.Join((*calls)[0].args, " ")
	if got != "--pid 11 --account main --cwd /w/atlas" || msg.text != "jump failed: no window" {
		t.Errorf("args %q flash %q", got, msg.text)
	}
}

func testRel() *relStatus {
	return &relStatus{Recommended: "box", Accounts: []relAcct{
		{Name: "main", Policy: "use", Left5h: 0, LeftWeek: 40},
		{Name: "box", Policy: "use", Left5h: 70, LeftWeek: 60},
		{Name: "spare", Policy: "ask-first", Left5h: 90, LeftWeek: 50},
		{Name: "lab", Policy: "use", Blocked: "5h 96% used", Left5h: 4, LeftWeek: 70},
	}}
}

func TestRelaunchPickerPicksAndPassesPicked(t *testing.T) {
	m := liveModel(t)
	resets := time.Date(2026, 10, 29, 16, 30, 0, 0, time.Local).Unix()
	m = send(m, srcMsg{src: srcSessions, at: testNow(), val: []intrSession{
		{ID: "paused-1", Account: "main", Project: "atlas", LastEvent: iso(13, 0), Limit: "five_hour", ResetsAt: resets}}},
		srcMsg{src: srcRelay, at: testNow(), val: testRel()})
	m = send(m, keyMsg("R"))
	if m.overlay == ovConfirm {
		t.Fatal("R on a running agent must not open the confirm")
	}
	selectLane(&m, func(l laneRow) bool { return l.State == lsPaused })
	calls := recordRuns(t, "", nil)
	m = send(m, keyMsg("R"))
	if m.overlay != ovConfirm || len(*calls) != 0 {
		t.Fatalf("overlay %d calls %d: nothing may run before the confirm", m.overlay, len(*calls))
	}
	if m.relSel != 1 {
		t.Fatalf("preselected %d, want the recommended box", m.relSel)
	}
	out := m.View()
	for _, want := range []string{"Relaunch", "main: the session's own account", "lab: 5h 96% used", "week left"} {
		if !hasText(out, want) {
			t.Errorf("overlay misses %q", want)
		}
	}
	m = send(m, keyMsg("k"))
	if m.relSel != 1 {
		t.Errorf("k moved to %d: main is the session's own account", m.relSel)
	}
	m = send(m, keyMsg("j"), keyMsg("j"))
	if m.relSel != 2 {
		t.Errorf("j j moved to %d: lab is blocked, spare is the last pickable", m.relSel)
	}
	if !hasText(m.View(), "enter counts as your yes") {
		t.Error("ask-first note missing")
	}
	m = send(m, keyMsg("esc"))
	if m.overlay != ovNone || len(*calls) != 0 {
		t.Fatalf("esc: overlay %d calls %d", m.overlay, len(*calls))
	}
	m = send(m, keyMsg("R"), keyMsg("j"))
	next, cmd := m.Update(tea.KeyMsg{Type: tea.KeyEnter})
	m = next.(model)
	if cmd == nil {
		t.Fatal("enter did not start the relaunch")
	}
	if msg := cmd().(actionMsg); msg.text != "relaunched on spare" {
		t.Errorf("flash %q", msg.text)
	}
	if c := (*calls)[0]; c.name != "crow-relaunch" || strings.Join(c.args, " ") != "paused-1 spare --picked" {
		t.Errorf("call %+v", c)
	}
}

func TestRelaunchPickerWithNoFreeAccount(t *testing.T) {
	st := &relStatus{Accounts: []relAcct{{Name: "main", Policy: "use"}, {Name: "lab", Policy: "use", Blocked: "5h 96% used"}}}
	if i := relPreselect(st, "main"); i != -1 {
		t.Errorf("preselect %d with no pickable account", i)
	}
}

func TestNoTokens(t *testing.T) {
	now := time.Date(2026, 11, 5, 14, 0, 0, 0, time.Local)
	at := func(h, mi int) string { return time.Date(2026, 11, 5, h, mi, 0, 0, time.Local).Format(time.RFC3339) }
	st := &relStatus{Accounts: []relAcct{
		{Name: "main", Policy: "use", Blocked: "5h 91% used", Reset5hISO: at(15, 20)},
		{Name: "spare", Policy: "ask-first", Blocked: "week 50% used, crow's cap is 50%", Reset5hISO: at(14, 30), ResetWeekISO: time.Date(2026, 11, 10, 7, 0, 0, 0, time.Local).Format(time.RFC3339)},
		{Name: "team", Policy: "never"},
	}}
	if b, until := noTokens(st, now); !b || until != "15:20" {
		t.Errorf("blocked %v until %q, want true 15:20 (spare waits for its week reset)", b, until)
	}
	st.Accounts[1].Blocked = ""
	if b, _ := noTokens(st, now); b {
		t.Error("one free account means tokens are left")
	}
	if b, _ := noTokens(nil, now); b {
		t.Error("no status must not claim no tokens")
	}
}

func TestHomeNoModelGroup(t *testing.T) {
	m := liveModel(t)
	m.page = 0
	resets := time.Date(2026, 10, 29, 16, 30, 0, 0, time.Local).Unix()
	blocked := &relStatus{Accounts: []relAcct{{Name: "main", Policy: "use", Blocked: "5h 99% used",
		Reset5hISO: testNow().Add(80 * time.Minute).Format(time.RFC3339)}}}
	m = send(m, srcMsg{src: srcSessions, at: testNow(), val: []intrSession{
		{ID: "paused-1", Account: "main", Project: "atlas", LastEvent: iso(13, 0), Limit: "five_hour", ResetsAt: resets}}},
		srcMsg{src: srcRelay, at: testNow(), val: blocked})
	if len(m.fx.NoModel) == 0 {
		t.Fatal("no no-model rows while every account is blocked")
	}
	gs := m.homeView().groups()
	if !strings.HasPrefix(gs[0].name, "No tokens until ") {
		t.Errorf("first group %q", gs[0].name)
	}
	if !hasText(m.View(), "No tokens until") {
		t.Error("Home does not draw the no-model group")
	}
	m = send(m, srcMsg{src: srcRelay, at: testNow(), val: testRel()})
	if len(m.fx.NoModel) != 0 {
		t.Error("no-model rows stay while an account is free")
	}
}

func TestRefreshSchedule(t *testing.T) {
	if n := len(refreshCmds(1)); n != 2 {
		t.Errorf("tick 1: %d fetches, want runs and sessions", n)
	}
	if n := len(refreshCmds(usageTicks)); n != 5 {
		t.Errorf("usage tick: %d, want 5 (adds usage, accounts and relaunch status)", n)
	}
	if n := len(refreshCmds(registryTicks)); n != 9 {
		t.Errorf("registry tick: %d, want 9 (adds registry, MRs, Today and checks)", n)
	}
}

func TestStaleAndErrorShowInHeader(t *testing.T) {
	withANSI(t)
	m := liveModel(t)
	m.w, m.h = 170, 46
	m = send(m, tickMsg(testNow().Add(10*time.Minute)))
	if m.sync != stStale || !hasText(m.View(), "stale 10m") {
		t.Errorf("stale: sync %s", m.sync)
	}
	m = send(m, srcMsg{src: srcRuns, err: errors.New("x")})
	if m.sync != stError || !hasText(m.View(), "cdx not running") {
		t.Errorf("error: sync %s", m.sync)
	}
	checkFit(t, "live error", m.View(), 170, 46)
}

func TestLiveAgentsFitEverySize(t *testing.T) {
	withANSI(t)
	for ti, th := range themes {
		for _, sz := range sizes {
			for pane := 0; pane < agentPanes; pane++ {
				m := liveModel(t)
				m.th, m.w, m.h, m.agentPane = ti, sz[0], sz[1], pane
				checkFit(t, fmt.Sprintf("%s %dx%d pane %d", th.name, sz[0], sz[1], pane), m.View(), sz[0], sz[1])
			}
		}
	}
}

func TestRegistryFindByFolder(t *testing.T) {
	r := &registry{Projects: []regProject{{Name: "site-profile", Scope: "personal", Path: "/x/Site-Profile"}}}
	if got := r.fullName("Site-Profile"); got != "site-profile" {
		t.Fatalf("fullName by folder = %q", got)
	}
	if got := r.scopeOf("site-profile (hub)"); got != "personal" {
		t.Fatalf("scopeOf = %q", got)
	}
	if got := r.fullName("unknown"); got != "unknown" {
		t.Fatalf("unknown = %q", got)
	}
}

// selectLane puts the Agents cursor on the first lane that matches.
func selectLane(m *model, ok func(laneRow) bool) {
	for i, li := range laneOrder(m.fx.Lanes) {
		if ok(m.fx.Lanes[li]) {
			m.selectAgent(i)
			return
		}
	}
}

func fp(v float64) *float64 { return &v }

func TestFinishedRunCost(t *testing.T) {
	if got := runCost(fp(0.7084), fp(25)); got != "$0.71 of $25" {
		t.Errorf("with budget: %q", got)
	}
	if got := runCost(fp(1.5), nil); got != "$1.50" {
		t.Errorf("no budget: %q", got)
	}
	if got := runCost(nil, fp(25)); got != "" {
		t.Errorf("no cost must show nothing: %q", got)
	}
	var f finishedRun
	if err := json.Unmarshal([]byte(`{"run_id":"x","cost_usd":null}`), &f); err != nil || f.CostUSD != nil {
		t.Errorf("null cost parsed as %v (%v)", f.CostUSD, err)
	}
	if err := json.Unmarshal([]byte(`{"run_id":"x","cost_usd":0.4}`), &f); err != nil || f.CostUSD == nil || *f.CostUSD != 0.4 {
		t.Errorf("cost parsed as %v (%v)", f.CostUSD, err)
	}
	var done agentRow
	for _, r := range agentRows(testNow(), testRuns(), nil, testReg()) {
		if r.Group == gDone && strings.Contains(r.Short, "tests") {
			done = r
		}
	}
	if !strings.HasSuffix(done.Meta, "$0.71 of $25") {
		t.Errorf("meta %q lacks cost", done.Meta)
	}
}

func TestFinishedRunDenialsShow(t *testing.T) {
	r := testRuns()
	r.Finished[0].Denials = []string{"Bash: touch x", "WebFetch"}
	for _, row := range agentRows(testNow(), r, nil, testReg()) {
		if row.Session != "ffff0001" {
			continue
		}
		if !strings.Contains(row.Meta, "2 denied") {
			t.Errorf("meta %q lacks the denial count", row.Meta)
		}
		var tail []string
		for _, l := range row.Tail {
			tail = append(tail, l.Text)
		}
		if !strings.Contains(strings.Join(tail, "|"), "denied Bash: touch x|denied WebFetch") {
			t.Errorf("tail %v lacks the denials", tail)
		}
		return
	}
	t.Fatal("finished run row missing")
}
