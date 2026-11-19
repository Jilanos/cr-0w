package ops

import (
	"encoding/json"
	"math"
	"slices"
	"testing"
	"time"

	"crow-core/contract"
	"crow-core/lanes"
)

// now is Tuesday 2026-11-10 09:00 in a fixed zone east of UTC.
var (
	zone = time.FixedZone("CET", 3600)
	now  = time.Date(2026, 11, 10, 9, 0, 0, 0, zone)
)

func decode(t *testing.T, s string) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal([]byte(s), &m); err != nil {
		t.Fatal(err)
	}
	return m
}

const usage = `{"sessions": [
 {"id": "s1", "account": "work", "project": "crow", "title": "crow: ops timeline", "kind": "interactive",
  "models": ["claude-opus-5-5"], "start": "2026-11-09T07:55:00+01:00", "end": "2026-11-10T08:45:00+01:00",
  "activity": {"2026-11-09": [48, 49, 50, 54], "2026-11-10": [48, 49, 52]},
  "activity_tokens": {"2026-11-10": {"48": 100, "52": 50}},
  "by_day": {"2026-11-09": {"cost_usd": 2.5, "tokens": 900}, "2026-11-10": {"cost_usd": 1.25, "tokens": 400}},
  "today": {"cost_usd": 1.25}, "tokens": 1300},
 {"id": "r1", "account": "personal", "project": "crow", "title": "nightly audit", "kind": "run",
  "activity": {"2026-11-09": [12, 13]}, "by_day": {"2026-11-09": {"cost_usd": 0.3, "tokens": 50}}},
 {"id": "r2", "account": "personal", "project": "crow", "title": "nightly audit", "kind": "run",
  "activity": {"2026-11-09": [20]}, "by_day": {"2026-11-09": {"cost_usd": 0.1, "tokens": 20}}},
 {"id": "m1", "account": "work", "project": "shop", "title": "build item", "kind": "run",
  "activity": {"2026-11-10": [30, 31]}, "by_day": {"2026-11-10": {"cost_usd": "cost_usd"}}},
 {"id": "old", "account": "work", "project": "shop", "title": "old work", "kind": "interactive",
  "activity": {}, "by_day": {"2026-11-03": {"cost_usd": 4, "tokens": 70}}}
]}`

// s1 waits on the owner since 08:40; r2 ended stuck yesterday with two commits.
const dispatch = `{"slots": {"busy": 0, "max": 2},
 "agents": [{"kind": "interactive", "state": "waiting", "session_id": "s1", "account": "work", "project": "crow",
  "title": "ops", "started_at": "2026-11-10T07:55:00+01:00", "last_activity_s": 1200, "context_tokens": 5000}],
 "finished": [
  {"run_id": "r2", "status": "stuck", "ended_at": "2026-11-09T03:30:00+01:00", "commits": ["a", "b"]},
  {"run_id": "r1", "status": "done", "ended_at": "2026-11-09T02:20:00+01:00", "commits": []},
  {"run_id": "m1", "status": "status", "ended_at": "2026-11-10T05:20:00+01:00"}]}`

const registry = `{"projects": [{"name": "cr-0w", "short": "crow", "path": "/p/cr-0w"}, {"name": "shop", "short": "shop", "path": "/p/shop"}]}`

func input(t *testing.T, days ...string) Input {
	return Input{Now: now, Days: days, Usage: decode(t, usage), Dispatch: decode(t, dispatch), Projects: decode(t, registry),
		Sessions: decode(t, `{"sessions": []}`),
		Jobs:     []map[string]any{{"unit": "crow-retro.timer", "activates": "crow-retro.service", "next": "2026-11-10T17:00:00Z"}},
		Missions: []contract.Mission{
			{ID: "m-1", State: "running", Runs: []contract.Run{{Run: "m1"}}},
			{ID: "m-2", State: "queued", Project: "cr-0w", Goal: "Refresh the docs index"},
			{ID: "m-3", State: "done"}},
		AFK: []contract.OpsQueued{{Kind: "afk", ID: "job-01.md", Title: "Audit"}}}
}

func byID(t *testing.T, o contract.Ops, day, id string) contract.OpsLane {
	t.Helper()
	for _, l := range o.Lanes {
		if l.Day == day && l.ID == id {
			return l
		}
	}
	t.Fatalf("no lane %s on %s in %+v", id, day, o.Lanes)
	return contract.OpsLane{}
}

func at(h, m int) string {
	return time.Date(2026, 11, 10, h, m, 0, 0, zone).Format(time.RFC3339)
}

func yday(h, m int) string {
	return time.Date(2026, 11, 9, h, m, 0, 0, zone).Format(time.RFC3339)
}

// AC1: the lanes of a past day are the deck's lanes: same lanes, same active buckets,
// same states. The deck builds them with lanes.Build over activity[day].
func TestPastDayMatchesDeckLanes(t *testing.T) {
	day := "2026-11-09"
	o := Build(input(t, day))
	var deck []lanes.Session
	for _, s := range rows(decode(t, usage), "sessions") {
		var bs []int
		for _, b := range list(row(s, "activity"), day) {
			bs = append(bs, int(b.(float64)))
		}
		deck = append(deck, lanes.Session{ID: str(s, "id"), Project: str(s, "project"), Title: str(s, "title"), Kind: str(s, "kind"), Buckets: bs})
	}
	reg := Names{{Name: "cr-0w", Short: "crow"}, {Name: "shop", Short: "shop"}}
	want := lanes.Build(deck, nil, [2]int{}, reg)
	var got []contract.OpsLane
	for _, l := range o.Lanes {
		if l.Day == day && len(l.Spans) > 0 {
			got = append(got, l)
		}
	}
	if len(got) != len(want) {
		t.Fatalf("got %d lanes with spans, deck has %d", len(got), len(want))
	}
	start := time.Date(2026, 11, 9, 0, 0, 0, 0, zone)
	for _, w := range want {
		l := byID(t, o, day, w.Key)
		var cells []int
		for _, s := range l.Spans {
			if s.State == "idle" || s.State == "waiting" {
				continue
			}
			a, _ := time.Parse(time.RFC3339, s.Start)
			b, _ := time.Parse(time.RFC3339, s.End)
			for x := a; x.Before(b); x = x.Add(Bucket) {
				cells = append(cells, int(x.Sub(start)/Bucket))
			}
		}
		var deckCells []int
		for c := range w.Cells {
			deckCells = append(deckCells, c)
		}
		slices.Sort(deckCells)
		if !slices.Equal(cells, deckCells) {
			t.Errorf("%s: cells %v, deck %v", w.Key, cells, deckCells)
		}
		if l.State != w.State && !(l.State == "stuck" && w.State == lanes.Done) {
			t.Errorf("%s: state %s, deck %s", w.Key, l.State, w.State)
		}
	}
}

func TestSpansFromBuckets(t *testing.T) {
	o := Build(input(t, "2026-11-09"))
	s1 := byID(t, o, "2026-11-09", "s1")
	want := []contract.OpsSpan{
		{State: "working", Start: yday(8, 0), End: yday(8, 30)},
		{State: "idle", Start: yday(8, 30), End: yday(9, 0)},
		{State: "working", Start: yday(9, 0), End: yday(9, 10)},
	}
	if !slices.Equal(s1.Spans, want) {
		t.Errorf("s1 spans %+v, want %+v", s1.Spans, want)
	}
	if s1.State != lanes.Done || s1.ActiveS != 40*60 || s1.WaitS != 0 || s1.CostUSD != 2.5 || s1.Tokens != 900 {
		t.Errorf("s1 %+v", s1)
	}
}

// A finished run sets the state of its last span; runs with one title share a lane.
func TestFinishedRunEndsSpan(t *testing.T) {
	o := Build(input(t, "2026-11-09"))
	r := byID(t, o, "2026-11-09", "r1")
	if r.Kind != "run" || r.Runs != 2 || !slices.Equal(r.Keys, []string{"r1", "r2"}) || r.Commits != 2 {
		t.Fatalf("folded run lane %+v", r)
	}
	last := r.Spans[len(r.Spans)-1]
	if last.State != "stuck" || last.Start != yday(3, 20) || r.State != "stuck" {
		t.Errorf("last span %+v, lane state %s", last, r.State)
	}
	if r.ActiveS != 30*60 || r.CostUSD != 0.4 {
		t.Errorf("active %d cost %v", r.ActiveS, r.CostUSD)
	}
}

// A live lane waiting on the owner waits from when it went quiet until now.
func TestTodayWaitsOnOwner(t *testing.T) {
	o := Build(input(t, "2026-11-10"))
	s1 := byID(t, o, "2026-11-10", "s1")
	want := []contract.OpsSpan{
		{State: "working", Start: at(8, 0), End: at(8, 20)},
		{State: "idle", Start: at(8, 20), End: at(8, 40)},
		{State: "working", Start: at(8, 40), End: at(8, 50)},
		{State: "waiting", Start: at(8, 50), End: at(9, 0)},
	}
	if !slices.Equal(s1.Spans, want) || s1.State != lanes.Needs || s1.WaitS != 600 || s1.CostUSD != 1.25 {
		t.Errorf("s1 %+v", s1)
	}
	m := byID(t, o, "2026-11-10", "m1")
	if m.Kind != "mission" || m.Project != "shop" || m.CostUSD != 0 || m.State != lanes.Done {
		t.Errorf("mission lane %+v", m)
	}
	if m.Spans[len(m.Spans)-1].State != "working" {
		t.Errorf("unknown status must keep the span: %+v", m.Spans)
	}
}

func TestQueue(t *testing.T) {
	o := Build(input(t, "2026-11-10"))
	want := []contract.OpsQueued{
		{Kind: "mission", ID: "m-2", Project: "crow", Title: "Refresh the docs index"},
		{Kind: "routine", ID: "crow-retro.timer", Title: "crow-retro.service", Next: "2026-11-10T17:00:00Z"},
		{Kind: "afk", ID: "job-01.md", Title: "Audit"},
	}
	if !slices.Equal(o.Queue, want) {
		t.Errorf("queue %+v", o.Queue)
	}
}

// AC3: week totals are the sums of the day lanes.
func TestWeekTotalsAddUp(t *testing.T) {
	days := []string{"2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"}
	in := input(t, days...)
	in.Usage = decode(t, `{"sessions": [{"id": "w1", "project": "shop", "title": "earlier", "kind": "interactive",
	 "activity": {}, "by_day": {"2026-11-09": {"cost_usd": 4, "tokens": 70}}}]}`)
	in.Usage["sessions"] = append(in.Usage["sessions"].([]any), decode(t, usage)["sessions"].([]any)...)
	o := Build(in)
	if len(o.Lanes) == 0 {
		t.Fatal("no lanes")
	}
	for _, l := range o.Lanes {
		if l.Day > "2026-11-10" {
			t.Errorf("lane on a future day: %+v", l)
		}
	}
	for _, by := range []string{"project", "kind"} {
		var lanesN int
		var active, wait int64
		var cost float64
		var tokens int
		for _, tot := range o.Totals {
			if tot.By == by {
				lanesN += tot.Lanes
				active += tot.ActiveS
				wait += tot.WaitS
				cost += tot.CostUSD
				tokens += tot.Tokens
			}
		}
		var sumA, sumW int64
		var sumC float64
		var sumT int
		for _, l := range o.Lanes {
			sumA += l.ActiveS
			sumW += l.WaitS
			sumC += l.CostUSD
			sumT += l.Tokens
		}
		if lanesN != len(o.Lanes) || active != sumA || wait != sumW || tokens != sumT || math.Abs(cost-sumC) > 1e-6 {
			t.Errorf("%s totals: lanes %d/%d active %d/%d wait %d/%d tokens %d/%d cost %v/%v",
				by, lanesN, len(o.Lanes), active, sumA, wait, sumW, tokens, sumT, cost, sumC)
		}
	}
	w1 := byID(t, o, "2026-11-09", "w1")
	if len(w1.Spans) != 0 || w1.CostUSD != 4 || w1.State != lanes.Done {
		t.Errorf("costed lane without buckets %+v", w1)
	}
	for _, tot := range o.Totals {
		if tot.By == "project" && tot.Name == "crow" && tot.Stuck != 1 {
			t.Errorf("crow stuck %d, want 1", tot.Stuck)
		}
	}
}

func TestLenientInput(t *testing.T) {
	in := Input{Now: now, Days: []string{"2026-11-10"}, Usage: decode(t, `{"sessions": "nope"}`),
		Dispatch: decode(t, `{"agents": [{"kind": 1, "last_activity_s": "x"}], "slots": "x"}`), Jobs: "x"}
	o := Build(in)
	if o.Lanes == nil || o.Queue == nil || o.Totals == nil {
		t.Fatalf("nil lists: %+v", o)
	}
}

// A crow-runs worker writes its session in <repo>.wt/<label>. That session lane groups
// under the repo, takes the run id as a key, and follows the live agent of its run.
func TestRunLinksToWorktreeSession(t *testing.T) {
	in := input(t, "2026-11-10")
	in.Usage = decode(t, `{"sessions": [
 {"id": "w1", "account": "personal", "project": "item-9-ops", "cwd": "/p/cr-0w.wt/item-9-ops", "title": "item-9-ops", "kind": "run",
  "branch": "item-9-ops", "activity": {"2026-11-10": [40, 41]}, "by_day": {"2026-11-10": {"cost_usd": 0.5, "tokens": 10}}},
 {"id": "w2", "account": "personal", "project": "item-8-docs", "cwd": "/p/cr-0w.wt/item-8-docs", "title": "item-8-docs", "kind": "run",
  "activity": {"2026-11-10": [30]}, "by_day": {"2026-11-10": {"cost_usd": 0.2, "tokens": 5}}},
 {"id": "w3", "account": "personal", "project": "item-9-ops", "cwd": "/p/cr-0w.wt/item-9-ops", "title": "item-9-ops-2", "kind": "run",
  "activity": {"2026-11-10": [20]}, "by_day": {"2026-11-10": {"cost_usd": 0.1, "tokens": 5}}}]}`)
	in.Sessions = decode(t, `{"sessions": [{"conversation_id": "w3", "project": "item-9-ops", "last_event": "2026-11-10T08:00:00+01:00"}]}`)
	in.Dispatch = decode(t, `{"slots": {"busy": 1, "max": 2},
 "agents": [{"kind": "run", "state": "working", "run_id": "aa11", "label": "item-9-ops", "project": "cr-0w",
  "account": "personal", "started_at": "2026-11-10T06:40:00+01:00", "last_activity_s": 10}],
 "finished": [{"run_id": "bb22", "status": "failed", "label": "item-8-docs", "project": "cr-0w",
  "ended_at": "2026-11-10T05:15:00+01:00", "commits": ["c"]}]}`)
	o := Build(in)
	if len(o.Lanes) != 3 {
		t.Fatalf("want 2 lanes, got %+v", o.Lanes)
	}
	live := byID(t, o, "2026-11-10", "w1")
	if live.Project != "crow" || live.State != lanes.Run || !slices.Equal(live.Keys, []string{"w1", "aa11"}) {
		t.Errorf("live run lane %+v", live)
	}
	// An interrupted session in the same worktree keeps its own lane.
	if p := byID(t, o, "2026-11-10", "w3"); p.State != lanes.Paused || len(p.Keys) != 1 {
		t.Errorf("paused lane %+v", p)
	}
	done := byID(t, o, "2026-11-10", "w2")
	if done.Project != "crow" || done.State != "failed" || done.Commits != 1 || !slices.Equal(done.Keys, []string{"w2", "bb22"}) {
		t.Errorf("finished run lane %+v", done)
	}
}
