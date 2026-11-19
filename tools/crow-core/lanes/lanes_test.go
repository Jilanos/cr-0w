package lanes

import (
	"testing"
	"time"
)

type names map[string]string

func (n names) ShortName(s string) string {
	if v, ok := n[s]; ok {
		return v
	}
	return s
}

func (n names) PathOf(s string) (string, bool) { return "/src/" + s, s != "" }

func TestBuild(t *testing.T) {
	now := time.Date(2026, 11, 18, 15, 0, 0, 0, time.Local)
	sessions := []Session{
		{ID: "s-live", Project: "atlas-api", Title: "atlas: fix retry", Buckets: []int{50, 51}, Cost: 1},
		{ID: "r-1", Project: "atlas-api", Title: "nightly", Kind: "run", Buckets: []int{10}, Cost: 2, Tokens: 5,
			Start: now.Add(-3 * time.Hour)},
		{ID: "r-2", Project: "atlas-api", Title: "nightly", Kind: "run", Buckets: []int{12}, Cost: 3, Tokens: 7,
			Start: now.Add(-4 * time.Hour), BucketTokens: map[int]int{12: 9}},
		{ID: "s-quiet", Project: "atlas-api"},
	}
	agents := []Agent{
		{Session: "s-live", Group: GroupNeeds, State: "needs", Quiet: now.Add(-time.Minute), Ctx: 40},
		{Session: "x-new", Group: GroupRunning, State: "idle", Project: "beta"},
		{Session: "r-old", Group: GroupDone},
	}
	got := Build(sessions, agents, [2]int{1, 2}, names{"atlas-api": "atl"})
	if len(got) != 3 {
		t.Fatalf("lanes = %d, want 3: %+v", len(got), got)
	}
	live, run, fresh := got[0], got[1], got[2]
	if live.State != Needs || !live.NextYou || live.Title != "fix retry" || live.Project != "atl" || live.Ctx != 40 ||
		!live.WaitFrom.Equal(agents[0].Quiet) || live.Mins() != 20 || !live.Live() {
		t.Errorf("live lane: %+v", live)
	}
	if run.State != Done || run.Runs != 2 || run.Cost != 5 || run.Tokens != 12 || run.First() != 10 || run.Last() != 12 ||
		!run.Start.Equal(now.Add(-4*time.Hour)) || run.Tok[12] != 9 || run.Cwd != "/src/atl" {
		t.Errorf("run lane: %+v", run)
	}
	if fresh.State != Idle || fresh.Key != "x-new" || fresh.First() != -1 {
		t.Errorf("agent lane: %+v", fresh)
	}
	if o := Order(got); len(o) != 3 || o[0] != 1 || o[1] != 0 || o[2] != 2 {
		t.Errorf("order = %v", o)
	}
}

func TestStatePausedAndRun(t *testing.T) {
	agents := []Agent{{Interrupted: true, Doing: "paused on 5h limit, back 14:30, R relaunch"}, {Group: GroupRuns}}
	if st, next, _ := state(Lane{Agent: 0}, agents, [2]int{}); st != Paused || next != "14:30" {
		t.Errorf("paused = %s %s", st, next)
	}
	if st, next, _ := state(Lane{Agent: 1}, agents, [2]int{1, 0}); st != Run || next != "background 1/1" {
		t.Errorf("run = %s %s", st, next)
	}
}

func TestShortModelAndWho(t *testing.T) {
	if m := ShortModel([]string{"claude-haiku-5-5", "claude-opus-5-5[1m]"}); m != "opus-5-5" {
		t.Errorf("model = %s", m)
	}
	if w := Who("atlas: /retro", "atlas-api", names{"atlas-api": "atl"}); w != "atl" {
		t.Errorf("who = %s", w)
	}
}
