package ops

import (
	"bufio"
	"encoding/json"
	"errors"
	"os"
	"slices"
	"sort"
	"sync"
	"time"

	"crow-core/contract"
	"crow-core/lanes"
)

// LogName is the state log under the core state dir.
const LogName = "ops-states.jsonl"

// DefaultMaxBytes is the size at which the state log rotates to <name>.1.
const DefaultMaxBytes = 4 << 20

// Line is one state change of a live lane. A terminal state (done, stuck, failed) marks
// the lane ended and becomes the state of its last span.
type Line struct {
	TS      string   `json:"ts"`
	Lane    string   `json:"lane"`
	Keys    []string `json:"keys"`
	Project string   `json:"project"`
	Title   string   `json:"title"`
	Account string   `json:"account"`
	Kind    string   `json:"kind"`
	State   string   `json:"state"`
}

// Log appends one line per lane per state change. Every older file is <path>.1: when the
// file reaches MaxBytes it replaces <path>.1 and a new file starts.
type Log struct {
	Path     string
	MaxBytes int64

	mu   sync.Mutex
	last map[string]Line // live lanes by id, nil until loaded
}

// Observe records the state of each live lane of the day lanes at now. Lanes logged live
// before and no longer live get a terminal line.
func (l *Log) Observe(now time.Time, ls []contract.OpsLane) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.last == nil {
		l.last = map[string]Line{}
		old, err := ReadLog(l.Path)
		if err != nil {
			return err
		}
		for _, x := range old {
			if terminal(x.State) {
				delete(l.last, x.Lane)
			} else {
				l.last[x.Lane] = x
			}
		}
	}
	ts := now.UTC().Format(time.RFC3339)
	var out []Line
	live := map[string]bool{}
	for _, x := range ls {
		st := liveState(x.State)
		if st == "" {
			continue
		}
		live[x.ID] = true
		if prev, ok := l.last[x.ID]; ok && prev.State == st {
			continue
		}
		out = append(out, Line{TS: ts, Lane: x.ID, Keys: slices.Clone(x.Keys), Project: x.Project, Title: x.Title,
			Account: x.Account, Kind: x.Kind, State: st})
	}
	ended := map[string]string{}
	for _, x := range ls {
		if !live[x.ID] {
			ended[x.ID] = x.State
		}
	}
	var gone []string
	for id := range l.last {
		if !live[id] {
			gone = append(gone, id)
		}
	}
	sort.Strings(gone)
	for _, id := range gone {
		x := l.last[id]
		x.TS, x.State = ts, "done"
		switch st := ended[id]; st {
		case "stuck", "failed":
			x.State = st
		case lanes.Paused:
			x.State = "stuck"
		}
		out = append(out, x)
	}
	if len(out) == 0 {
		return nil
	}
	if err := l.append(out); err != nil {
		return err
	}
	for _, x := range out {
		if terminal(x.State) {
			delete(l.last, x.Lane)
		} else {
			l.last[x.Lane] = x
		}
	}
	return nil
}

func (l *Log) append(lines []Line) error {
	limit := l.MaxBytes
	if limit <= 0 {
		limit = DefaultMaxBytes
	}
	if st, err := os.Stat(l.Path); err == nil && st.Size() >= limit {
		if err := os.Rename(l.Path, l.Path+".1"); err != nil {
			return err
		}
	}
	f, err := os.OpenFile(l.Path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	w := bufio.NewWriter(f)
	for _, x := range lines {
		b, _ := json.Marshal(x)
		w.Write(append(b, '\n')) //nolint:errcheck // Flush reports it
	}
	if err := w.Flush(); err != nil {
		f.Close()
		return err
	}
	return f.Close()
}

// ReadLog reads <path>.1 then path, oldest first. Missing files read empty; bad lines are
// skipped.
func ReadLog(path string) ([]Line, error) {
	var out []Line
	for _, p := range []string{path + ".1", path} {
		f, err := os.Open(p)
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err != nil {
			return out, err
		}
		sc := bufio.NewScanner(f)
		sc.Buffer(make([]byte, 64<<10), 1<<20)
		for sc.Scan() {
			var x Line
			if json.Unmarshal(sc.Bytes(), &x) == nil && x.Lane != "" && x.State != "" {
				if _, ok := parseTime(x.TS); ok {
					out = append(out, x)
				}
			}
		}
		err = sc.Err()
		f.Close()
		if err != nil {
			return out, err
		}
	}
	return out, nil
}

// liveState is the span state a live lane is in now, empty for a lane that is not live.
// An idle interactive lane waits for the owner's next prompt.
func liveState(lane string) string {
	switch lane {
	case lanes.Needs, lanes.Idle:
		return "waiting"
	case lanes.Working, lanes.Run:
		return "working"
	}
	return ""
}

func terminal(st string) bool { return st == "done" || st == "stuck" || st == "failed" }

// Merge lays the logged spans over the derived ones. For each lane and day the log covers,
// its spans replace the derived spans between the first and last logged instant; derived
// spans outside stay. A lane the log covers but the day lanes miss gets its own lane.
// Days without log lines keep the derived spans. Totals are summed again.
func Merge(o contract.Ops, lines []Line, now time.Time) contract.Ops {
	if len(lines) == 0 {
		return o
	}
	o.Lanes = slices.Clone(o.Lanes)
	byLane := map[string][]Line{}
	var ids []string
	for _, x := range lines {
		if _, ok := byLane[x.Lane]; !ok {
			ids = append(ids, x.Lane)
		}
		byLane[x.Lane] = append(byLane[x.Lane], x)
	}
	for _, id := range ids {
		sort.SliceStable(byLane[id], func(a, b int) bool { return byLane[id][a].TS < byLane[id][b].TS })
	}
	loc := now.Location()
	for _, day := range o.Days {
		start, err := time.ParseInLocation(time.DateOnly, day, loc)
		if err != nil || start.After(now) {
			continue
		}
		end := start.AddDate(0, 0, 1)
		if now.Before(end) {
			end = now
		}
		for _, id := range ids {
			ls := byLane[id]
			sp := logSpans(ls, now, start, end)
			if len(sp) == 0 {
				continue
			}
			i := find(o.Lanes, day, ls)
			if i < 0 {
				last := ls[len(ls)-1]
				o.Lanes = append(o.Lanes, contract.OpsLane{ID: id, Day: day, Project: last.Project, Account: last.Account,
					Kind: or(last.Kind, "interactive"), Title: last.Title, State: laneState(last), Keys: keysOf(ls), Runs: 1})
				i = len(o.Lanes) - 1
			}
			overlay(&o.Lanes[i], sp)
		}
	}
	o.Totals = Totals(o.Lanes)
	return o
}

// logSpans cuts one lane's lines into spans within [start, end). A terminal line ends the
// span before it and gives it its state; the last open line runs until now.
func logSpans(ls []Line, now, start, end time.Time) []span {
	var out []span
	for i, x := range ls {
		if terminal(x.State) {
			continue
		}
		from, _ := parseTime(x.TS)
		to := now
		st := x.State
		if i+1 < len(ls) {
			to, _ = parseTime(ls[i+1].TS)
			if terminal(ls[i+1].State) {
				st = ls[i+1].State
			}
		}
		from, to = from.In(start.Location()), to.In(start.Location())
		if from.Before(start) {
			from = start
		}
		if to.After(end) {
			to = end
		}
		if to.After(from) {
			out = append(out, span{st, from, to})
		}
	}
	return out
}

// find is the lane of day sharing a key or id with the logged lane, -1 when none.
func find(ls []contract.OpsLane, day string, lines []Line) int {
	keys := map[string]bool{}
	for _, x := range lines {
		keys[x.Lane] = true
		for _, k := range x.Keys {
			keys[k] = true
		}
	}
	for i, l := range ls {
		if l.Day != day {
			continue
		}
		if keys[l.ID] {
			return i
		}
		for _, k := range l.Keys {
			if keys[k] {
				return i
			}
		}
	}
	return -1
}

// overlay replaces the lane's spans inside the logged window and sums its times again.
func overlay(l *contract.OpsLane, logged []span) {
	w0, w1 := logged[0].start, logged[len(logged)-1].end
	var all []span
	for _, s := range l.Spans {
		from, ok1 := parseTime(s.Start)
		to, ok2 := parseTime(s.End)
		if !ok1 || !ok2 {
			continue
		}
		from, to = from.In(w0.Location()), to.In(w0.Location())
		if from.Before(w0) {
			all = append(all, span{s.State, from, minTime(to, w0)})
		}
		if to.After(w1) {
			all = append(all, span{s.State, maxTime(from, w1), to})
		}
	}
	all = append(all, logged...)
	sort.SliceStable(all, func(a, b int) bool { return all[a].start.Before(all[b].start) })
	l.Spans = []contract.OpsSpan{}
	l.ActiveS, l.WaitS = 0, 0
	for _, s := range all {
		if !s.end.After(s.start) {
			continue
		}
		l.Spans = append(l.Spans, contract.OpsSpan{State: s.state, Start: s.start.Format(time.RFC3339), End: s.end.Format(time.RFC3339)})
		d := int64(s.end.Sub(s.start) / time.Second)
		switch s.state {
		case "waiting":
			l.WaitS += d
		case "working", "stuck", "failed", "done":
			l.ActiveS += d
		}
	}
}

// laneState is the lane state of a lane known only from the log.
func laneState(last Line) string {
	switch last.State {
	case "waiting":
		return "needs"
	case "working":
		if last.Kind == "interactive" || last.Kind == "" {
			return "working"
		}
		return "run"
	}
	return last.State
}

func keysOf(ls []Line) []string {
	out := []string{}
	for _, x := range ls {
		for _, k := range x.Keys {
			if !slices.Contains(out, k) {
				out = append(out, k)
			}
		}
	}
	return out
}

func minTime(a, b time.Time) time.Time {
	if a.Before(b) {
		return a
	}
	return b
}

func maxTime(a, b time.Time) time.Time {
	if a.After(b) {
		return a
	}
	return b
}
