// Package ops builds the core ops answer (item_257): the day lanes of the shared lanes
// package cut into state spans, the queue, and totals per project and per kind. It reads
// the decoded section bodies and does no I/O. Bodies are read leniently: a field of the
// wrong type counts as missing.
package ops

import (
	"encoding/json"
	"math"
	"path/filepath"
	"slices"
	"sort"
	"strings"
	"time"

	"crow-core/contract"
	"crow-core/internal/work"
	"crow-core/lanes"
)

// Input is what one ops answer reads.
type Input struct {
	Now      time.Time      // its location sets the day bounds
	Days     []string       // YYYY-MM-DD, oldest first
	Usage    map[string]any // crow-usage --json
	Dispatch map[string]any // crow-runs json
	Sessions map[string]any // crow-sessions list --json
	Projects map[string]any // crow-registry json
	Jobs     any            // the jobs section: crow-* timers
	Missions []contract.Mission
	AFK      []contract.OpsQueued // AFK jobs waiting, read by the caller
}

// Bucket is the width of one crow-usage activity bucket.
const Bucket = 10 * time.Minute

// Build returns the ops answer for in.Days. Day and Week are left to the caller.
func Build(in Input) contract.Ops {
	reg := Names(work.Registry(in.Projects))
	out := contract.Ops{Days: slices.Clone(in.Days), Lanes: []contract.OpsLane{}, Queue: queue(in, reg), Totals: []contract.OpsTotal{}}
	if out.Days == nil {
		out.Days = []string{}
	}
	runs := missionRuns(in.Missions)
	routines := routineNames(in.Jobs)
	fin := finished(in.Dispatch)
	sessions := rows(in.Usage, "sessions")
	today := in.Now.Format(time.DateOnly)
	for _, day := range in.Days {
		start, err := time.ParseInLocation(time.DateOnly, day, in.Now.Location())
		if err != nil || day > today {
			continue
		}
		var agents []lanes.Agent
		var slots [2]int
		if day == today {
			agents, slots = Agents(in.Now, in.Dispatch, in.Sessions, reg)
		}
		ls, extra := DayLanes(day, sessions, agents, slots, reg)
		for _, i := range lanes.Order(ls) {
			out.Lanes = append(out.Lanes, lane(in, start, ls[i], agents, fin, runs, routines))
		}
		for _, l := range extra {
			out.Lanes = append(out.Lanes, lane(in, start, l, agents, fin, runs, routines))
		}
	}
	out.Totals = Totals(out.Lanes)
	return out
}

// DayLanes runs the shared lanes builder on one day of crow-usage sessions. extra holds
// the sessions with cost on the day but no activity buckets (crow-usage keeps buckets for
// two days only): they get a lane without spans.
func DayLanes(day string, sessions []map[string]any, agents []lanes.Agent, slots [2]int, reg lanes.Names) (ls, extra []lanes.Lane) {
	var in []lanes.Session
	for _, s := range sessions {
		in = append(in, session(s, day))
	}
	ls = lanes.Build(in, agents, slots, reg)
	seen := map[string]bool{}
	for _, l := range ls {
		for _, k := range l.Keys {
			seen[k] = true
		}
	}
	for i, s := range in {
		if seen[s.ID] || s.ID == "" {
			continue
		}
		if _, ok := entry(row(sessions[i], "by_day"), day); !ok {
			continue
		}
		extra = append(extra, lanes.Lane{Key: s.ID, Keys: []string{s.ID}, Project: reg.ShortName(s.Project),
			Title: lanes.Who(s.Title, s.Project, reg), Account: s.Account, Model: lanes.ShortModel(s.Models),
			Agent: -1, Run: s.Kind == "run", Runs: 1, Cost: s.Cost, Tokens: s.Tokens, State: lanes.Done,
			Cells: map[int]bool{}, Start: s.Start, End: s.End})
	}
	return ls, extra
}

// session cuts one crow-usage session to day: its buckets, bucket tokens, cost and tokens.
func session(s map[string]any, day string) lanes.Session {
	out := lanes.Session{ID: str(s, "id"), Account: str(s, "account"), Project: str(s, "project"), Title: str(s, "title"),
		Kind: str(s, "kind"), Branch: str(s, "branch"), BucketTokens: map[int]int{}}
	for _, m := range list(s, "models") {
		if v, ok := m.(string); ok {
			out.Models = append(out.Models, v)
		}
	}
	out.Start, _ = parseTime(str(s, "start"))
	out.End, _ = parseTime(str(s, "end"))
	if act, ok := row(s, "activity")[day].([]any); ok {
		for _, b := range act {
			if f, ok := b.(float64); ok {
				out.Buckets = append(out.Buckets, int(f))
			}
		}
	}
	if tok, ok := entry(row(s, "activity_tokens"), day); ok {
		for k, v := range tok {
			b, err := json.Number(k).Int64()
			if f, ok := v.(float64); ok && err == nil {
				out.BucketTokens[int(b)] += int(f)
			}
		}
	}
	if d, ok := entry(row(s, "by_day"), day); ok {
		out.Cost, _ = num(d, "cost_usd")
		t, _ := num(d, "tokens")
		out.Tokens = int(t)
	} else {
		out.Cost, _ = num(row(s, "today"), "cost_usd")
		t, _ := num(s, "tokens")
		out.Tokens = int(t)
	}
	c, _ := num(s, "cache_pct")
	n, _ := num(s, "compactions")
	out.CachePct, out.Compactions = int(c), int(n)
	return out
}

// Agents maps live crow-runs agents and same-day interrupted sessions as the deck does
// (tools/crow-deck/data.go agentRows). Finished runs stay out: the lanes builder skips them.
func Agents(now time.Time, dispatch, sessions map[string]any, reg lanes.Names) ([]lanes.Agent, [2]int) {
	var out []lanes.Agent
	for _, a := range rows(dispatch, "agents") {
		r := lanes.Agent{Account: str(a, "account"), Session: str(a, "session_id"), Cwd: str(a, "cwd"),
			Project: reg.ShortName(str(a, "project")), Title: str(a, "title")}
		ctx, _ := num(a, "context_tokens")
		r.Ctx = int(ctx)
		r.Started, _ = parseTime(str(a, "started_at"))
		idle, _ := num(a, "last_activity_s")
		r.Quiet = now.Add(-time.Duration(idle) * time.Second)
		switch {
		case str(a, "kind") == "run":
			r.Group, r.State = lanes.GroupRuns, "working"
			if str(a, "state") == "quiet" {
				r.State = "idle"
			}
			r.Session = str(a, "run_id")
			r.Name = str(a, "label")
			if r.Name == "" {
				r.Name = "run " + short4(r.Session)
			}
			r.Short = r.Name
		case str(a, "state") == "waiting":
			r.Group, r.State = lanes.GroupNeeds, "needs"
			r.Name, r.Short = r.Project, or(r.Title, r.Project)
		default:
			r.Group, r.State = lanes.GroupRunning, "working"
			if str(a, "state") == "idle" {
				r.State = "idle"
			}
			r.Name, r.Short = r.Project, or(r.Title, r.Project)
		}
		out = append(out, r)
	}
	for _, s := range rows(sessions, "sessions") {
		if s["relaunched"] != nil {
			continue
		}
		t, ok := parseTime(str(s, "last_event"))
		if !ok || t.In(now.Location()).Format(time.DateOnly) != now.Format(time.DateOnly) {
			continue
		}
		id := str(s, "conversation_id")
		name := or(reg.ShortName(str(s, "project")), "session")
		out = append(out, lanes.Agent{Group: lanes.GroupRuns, State: "waiting", Name: name, Short: name + " " + short4(id),
			Account: str(s, "account"), Doing: "paused", Session: id, Cwd: str(s, "cwd"), Interrupted: true})
	}
	busy, _ := num(row(dispatch, "slots"), "busy")
	mx, _ := num(row(dispatch, "slots"), "max")
	return out, [2]int{int(busy), int(mx)}
}

// run is one finished crow-runs run.
type run struct {
	status  string
	ended   time.Time
	commits int
}

func finished(dispatch map[string]any) map[string]run {
	out := map[string]run{}
	for _, f := range rows(dispatch, "finished") {
		t, ok := parseTime(str(f, "ended_at"))
		if !ok || str(f, "run_id") == "" {
			continue
		}
		out[str(f, "run_id")] = run{status: str(f, "status"), ended: t, commits: len(list(f, "commits"))}
	}
	return out
}

// endState maps a finished run's crow-runs status to the state of its last span.
func endState(status string) string {
	switch status {
	case "done", "stopped":
		return "done"
	case "stuck", "limit":
		return "stuck"
	case "failed", "budget":
		return "failed"
	}
	return ""
}

// lane cuts one lanes.Lane into spans on the day starting at start.
func lane(in Input, start time.Time, l lanes.Lane, agents []lanes.Agent, fin map[string]run, missions map[string]bool, routines map[string]bool) contract.OpsLane {
	day := start.Format(time.DateOnly)
	end := start.AddDate(0, 0, 1)
	if in.Now.Before(end) {
		end = in.Now
	}
	out := contract.OpsLane{ID: l.Key, Day: day, Project: l.Project, Account: l.Account, Title: l.Title, Model: l.Model,
		State: l.State, Keys: slices.Clone(l.Keys), CostUSD: round(l.Cost), Tokens: l.Tokens, Runs: l.Runs}
	if out.Keys == nil {
		out.Keys = []string{}
	}
	spans := Spans(start, l.Cells)
	// A finished run ended on the day: its status is the state of its last span.
	var last run
	for _, k := range l.Keys {
		if r, ok := fin[k]; ok && r.ended.In(start.Location()).Format(time.DateOnly) == day {
			out.Commits += r.commits
			if r.ended.After(last.ended) {
				last = r
			}
		}
	}
	if st := endState(last.status); st != "" && l.Agent < 0 {
		if len(spans) > 0 {
			spans[len(spans)-1].state = st
		}
		if st != "done" {
			out.State = st
		}
	}
	// A live lane waiting on the owner waits from when it went quiet until now.
	if l.NextYou && l.Agent >= 0 {
		from := agents[l.Agent].Quiet
		if n := len(spans); n > 0 && spans[n-1].end.After(from) {
			from = spans[n-1].end
		}
		if from.Before(start) {
			from = start
		}
		if from.Before(end) {
			spans = append(spans, span{"waiting", from, end})
		}
	}
	out.Kind = kind(l, missions, routines)
	out.Spans = []contract.OpsSpan{}
	for _, s := range spans {
		if s.end.After(end) {
			s.end = end
		}
		if !s.end.After(s.start) {
			continue
		}
		out.Spans = append(out.Spans, contract.OpsSpan{State: s.state, Start: s.start.Format(time.RFC3339), End: s.end.Format(time.RFC3339)})
		d := int64(s.end.Sub(s.start) / time.Second)
		switch s.state {
		case "waiting":
			out.WaitS += d
		case "working", "stuck", "failed", "done":
			out.ActiveS += d
		}
	}
	return out
}

// span is one stretch of a lane in one state.
type span struct {
	state      string
	start, end time.Time
}

// Spans turns active buckets into working spans and the gaps between them into idle ones.
func Spans(day time.Time, cells map[int]bool) []span {
	var bs []int
	for b, on := range cells {
		if on {
			bs = append(bs, b)
		}
	}
	sort.Ints(bs)
	var out []span
	for i := 0; i < len(bs); {
		j := i
		for j+1 < len(bs) && bs[j+1] == bs[j]+1 {
			j++
		}
		from, to := lanes.BucketTime(day, bs[i]), lanes.BucketTime(day, bs[j]+1)
		if n := len(out); n > 0 {
			out = append(out, span{"idle", out[n-1].end, from})
		}
		out = append(out, span{"working", from, to})
		i = j + 1
	}
	return out
}

func kind(l lanes.Lane, missions, routines map[string]bool) string {
	for _, k := range l.Keys {
		if missions[k] {
			return "mission"
		}
	}
	if routines[strings.ToLower(l.Title)] {
		return "routine"
	}
	if l.Run {
		return "run"
	}
	return "interactive"
}

func missionRuns(ms []contract.Mission) map[string]bool {
	out := map[string]bool{}
	for _, m := range ms {
		for _, r := range m.Runs {
			out[r.Run] = true
		}
	}
	return out
}

// routineNames are the crow timers by bare name ("brief" for crow-brief.timer).
func routineNames(jobs any) map[string]bool {
	out := map[string]bool{}
	for _, j := range anyRows(jobs) {
		for _, n := range []string{str(j, "unit"), str(j, "activates")} {
			n = strings.TrimPrefix(n, "crow-")
			n = strings.TrimSuffix(strings.TrimSuffix(n, ".timer"), ".service")
			if n != "" {
				out[strings.ToLower(n)] = true
			}
		}
	}
	return out
}

// queue lists queued missions, routines by next start, then AFK jobs.
func queue(in Input, reg Names) []contract.OpsQueued {
	out := []contract.OpsQueued{}
	for _, m := range in.Missions {
		if m.State == "queued" || m.State == "preflight" {
			out = append(out, contract.OpsQueued{Kind: "mission", ID: m.ID, Project: reg.ShortName(m.Project), Title: m.Goal})
		}
	}
	var rs []contract.OpsQueued
	for _, j := range anyRows(in.Jobs) {
		if next := str(j, "next"); next != "" {
			rs = append(rs, contract.OpsQueued{Kind: "routine", ID: str(j, "unit"), Title: str(j, "activates"), Next: next})
		}
	}
	sort.SliceStable(rs, func(a, b int) bool { return rs[a].Next < rs[b].Next })
	out = append(out, rs...)
	return append(out, in.AFK...)
}

// Totals sums the lanes per project, then per kind, each sorted by name.
func Totals(ls []contract.OpsLane) []contract.OpsTotal {
	out := []contract.OpsTotal{}
	for _, by := range []string{"project", "kind"} {
		idx := map[string]int{}
		var part []contract.OpsTotal
		for _, l := range ls {
			name := l.Project
			if by == "kind" {
				name = l.Kind
			}
			i, ok := idx[name]
			if !ok {
				i = len(part)
				idx[name] = i
				part = append(part, contract.OpsTotal{By: by, Name: name})
			}
			t := &part[i]
			t.Lanes++
			t.ActiveS += l.ActiveS
			t.WaitS += l.WaitS
			t.CostUSD = round(t.CostUSD + l.CostUSD)
			t.Tokens += l.Tokens
			if hasSpan(l, "stuck") {
				t.Stuck++
			}
			if hasSpan(l, "failed") {
				t.Failed++
			}
		}
		sort.SliceStable(part, func(a, b int) bool { return part[a].Name < part[b].Name })
		out = append(out, part...)
	}
	return out
}

func hasSpan(l contract.OpsLane, state string) bool {
	for _, s := range l.Spans {
		if s.State == state {
			return true
		}
	}
	return false
}

// Names resolves project names against the registry rows for the lanes package.
type Names []work.Project

func (n Names) find(name string) (work.Project, bool) {
	for _, p := range n {
		if name != "" && (p.Name == name || p.Short == name || (p.Path != "" && filepath.Base(p.Path) == name)) {
			return p, true
		}
	}
	return work.Project{}, false
}

// ShortName is the registry short name, the name itself when unknown.
func (n Names) ShortName(name string) string {
	if p, ok := n.find(name); ok {
		return or(p.Short, p.Name)
	}
	return name
}

// PathOf is the checkout of a project name, short name or folder.
func (n Names) PathOf(name string) (string, bool) {
	p, ok := n.find(name)
	return p.Path, ok && p.Path != ""
}

// ----- lenient readers -----

func str(m map[string]any, k string) string {
	s, _ := m[k].(string)
	return s
}

func num(m map[string]any, k string) (float64, bool) {
	f, ok := m[k].(float64)
	return f, ok
}

func row(m map[string]any, k string) map[string]any {
	r, _ := m[k].(map[string]any)
	return r
}

// entry is the object at m[k], ok when there is one.
func entry(m map[string]any, k string) (map[string]any, bool) {
	r, ok := m[k].(map[string]any)
	return r, ok
}

func list(m map[string]any, k string) []any {
	l, _ := m[k].([]any)
	return l
}

func rows(m map[string]any, k string) []map[string]any {
	var out []map[string]any
	for _, x := range list(m, k) {
		if r, ok := x.(map[string]any); ok {
			out = append(out, r)
		}
	}
	return out
}

// anyRows reads a list of objects of any Go shape through JSON.
func anyRows(v any) []map[string]any {
	b, err := json.Marshal(v)
	if err != nil {
		return nil
	}
	var out []map[string]any
	if json.Unmarshal(b, &out) != nil {
		return nil
	}
	return out
}

func parseTime(s string) (time.Time, bool) {
	for _, layout := range []string{time.RFC3339Nano, "2006-01-02T15:04:05.999999", "2006-01-02 15:04:05"} {
		if t, err := time.Parse(layout, s); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}

func round(f float64) float64 { return math.Round(f*1e4) / 1e4 }

func short4(id string) string {
	if len(id) > 4 {
		return id[:4]
	}
	return id
}

func or(a, b string) string {
	if a != "" {
		return a
	}
	return b
}
