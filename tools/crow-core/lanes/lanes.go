// Package lanes builds the day lanes of the deck Agents tab and the core ops answer: one
// lane per session that worked on a day, from crow-usage's 10-minute activity buckets,
// joined to the live agents from crow-runs. Background runs with the same title in the
// same project share one lane. It imports only the standard library and does no I/O.
package lanes

import (
	"fmt"
	"sort"
	"strings"
	"time"
)

// Lane states, in the glyph legend's terms.
const (
	Needs   = "needs"   // waits for the owner's answer
	Working = "working" // interactive, busy
	Idle    = "idle"    // interactive, waits for the next prompt
	Run     = "run"     // background run at work
	Paused  = "paused"  // stopped on a usage limit
	Done    = "done"    // ended on the day
)

// Agent groups, in the deck's display order.
const (
	GroupNeeds   = iota // waits for the owner
	GroupRunning        // interactive sessions at work
	GroupRuns           // background runs and paused runs
	GroupDone           // finished on the day
)

// Names resolves project names against the registry. A nil-safe implementation may
// answer names unchanged.
type Names interface {
	ShortName(name string) string              // registry short name, the name itself when unknown
	PathOf(name string) (path string, ok bool) // checkout of a project name, short name or folder
}

// Session is one crow-usage session, cut to the day the lanes are built for.
type Session struct {
	ID, Account, Project, Title, Kind, Branch string
	Models                                    []string
	Start, End                                time.Time
	Buckets                                   []int       // 10-minute buckets with activity on the day
	BucketTokens                              map[int]int // tokens per bucket on the day
	Cost                                      float64
	Tokens, CachePct, Compactions             int
	Files                                     map[string]int // edited file basename to edits
}

// Agent is one live or finished agent from crow-runs (and paused sessions).
type Agent struct {
	Session     string // session id, or run id for runs
	Group       int
	State       string // working, idle, needs, waiting (paused), done
	Interrupted bool
	Doing       string
	Project     string
	Name        string
	Title       string
	Short       string
	Account     string
	Cwd         string
	Ctx         int
	Started     time.Time
	Quiet       time.Time // last activity
}

// Lane is one session (or a set of same-titled runs) across the day.
type Lane struct {
	Key         string   // session id, or the agent's session/run id
	Keys        []string // every session and run id folded into the lane
	Project     string
	Title       string
	State       string
	Account     string
	Model       string // "opus-5-5"
	Branch      string
	Cwd         string
	Agent       int // index in the agents passed to Build, -1 none
	Run         bool
	Runs        int // runs folded into this lane
	Ctx         int // context tokens, live sessions only
	Cost        float64
	Priced      bool
	Cells       map[int]bool // 10-minute buckets with activity
	Tok         map[int]int  // tokens per bucket
	Tokens      int
	CachePct    int
	Compactions int
	Files       map[string]int // edited file basename to edits
	Start, End  time.Time
	WaitFrom    time.Time // needs: when the agent started waiting
	Next        string
	NextYou     bool
}

// First is the first active bucket, -1 when none.
func (l Lane) First() int {
	f := -1
	for b := range l.Cells {
		if f < 0 || b < f {
			f = b
		}
	}
	return f
}

// Last is the last active bucket, -1 when none.
func (l Lane) Last() int {
	f := -1
	for b := range l.Cells {
		if b > f {
			f = b
		}
	}
	return f
}

// Mins is the active time on the day: ten minutes per bucket.
func (l Lane) Mins() int { return 10 * len(l.Cells) }

// Live is true while an agent still works the lane.
func (l Lane) Live() bool {
	switch l.State {
	case Needs, Working, Idle, Run:
		return true
	}
	return false
}

// ShortModel picks the session's main model and drops the family prefix.
func ShortModel(models []string) string {
	best, rank := "", -1
	for _, m := range models {
		r := 0
		for i, fam := range []string{"haiku", "sonnet", "opus", "fable"} {
			if strings.Contains(m, fam) {
				r = i + 1
			}
		}
		if r > rank {
			best, rank = m, r
		}
	}
	best = strings.TrimPrefix(best, "claude-")
	if i := strings.Index(best, "["); i > 0 {
		best = best[:i]
	}
	return best
}

// BucketTime is the start of bucket b on the day of day, in day's location.
func BucketTime(day time.Time, b int) time.Time {
	y, mo, d := day.Date()
	return time.Date(y, mo, d, 0, b*10, 0, 0, day.Location())
}

// Who is the session title without its "project: " prefix; a title that is only a slash
// command or empty falls back to the project's short name.
func Who(title, project string, names Names) string {
	proj := names.ShortName(project)
	title = strings.TrimSpace(title)
	if i := strings.Index(title, ": "); i >= 0 && i < 24 {
		title = strings.TrimSpace(title[i+2:])
	}
	if title == "" || strings.HasPrefix(title, "/") {
		return proj
	}
	return title
}

// Build makes the day's lanes. Sessions without buckets get a lane only when a live
// agent holds them; live agents without a session still get a lane. slots is the
// background run slots, busy and max.
func Build(sessions []Session, agents []Agent, slots [2]int, names Names) []Lane {
	bySess := map[string]int{}
	for i, a := range agents {
		if a.Session != "" && a.Group != GroupDone {
			bySess[a.Session] = i
		}
	}
	used := map[int]bool{}
	var lanes []Lane
	runLane := map[string]int{}
	for _, s := range sessions {
		ai, isLive := bySess[s.ID]
		if len(s.Buckets) == 0 && !isLive {
			continue
		}
		l := Lane{Key: s.ID, Keys: []string{s.ID}, Project: names.ShortName(s.Project), Title: Who(s.Title, s.Project, names), Account: s.Account,
			Model: ShortModel(s.Models), Branch: s.Branch, Agent: -1, Run: s.Kind == "run", Runs: 1,
			Cost: s.Cost, Priced: true, Cells: map[int]bool{}, Tok: map[int]int{},
			Tokens: s.Tokens, CachePct: s.CachePct, Compactions: s.Compactions, Files: s.Files,
			Start: s.Start, End: s.End}
		for _, x := range s.Buckets {
			l.Cells[x] = true
		}
		for k, v := range s.BucketTokens {
			l.Tok[k] += v
		}
		if isLive {
			l.Agent, used[ai] = ai, true
		}
		if l.Run {
			key := l.Project + "\x00" + l.Title
			if j, ok := runLane[key]; ok {
				lanes[j] = merge(lanes[j], l)
				continue
			}
			runLane[key] = len(lanes)
		}
		lanes = append(lanes, l)
	}
	for i, a := range agents {
		if used[i] || a.Group == GroupDone {
			continue
		}
		lanes = append(lanes, Lane{Key: a.Session, Keys: []string{a.Session}, Project: or(a.Project, a.Name), Title: or(a.Title, a.Short),
			Account: a.Account, Agent: i, Run: a.Group == GroupRuns && !a.Interrupted, Runs: 1, Ctx: a.Ctx,
			Cells: map[int]bool{}, Tok: map[int]int{}, Start: a.Started})
	}
	for i := range lanes {
		l := &lanes[i]
		if l.Agent >= 0 {
			a := agents[l.Agent]
			l.Ctx = a.Ctx
			l.Cwd = a.Cwd
			l.Project = or(a.Project, l.Project)
		}
		if l.Cwd == "" {
			if p, ok := names.PathOf(l.Project); ok {
				l.Cwd = p
			}
		}
		l.State, l.Next, l.NextYou = state(*l, agents, slots)
		if l.State == Needs && l.Agent >= 0 {
			l.WaitFrom = agents[l.Agent].Quiet
		}
	}
	return lanes
}

func merge(a, b Lane) Lane {
	for k := range b.Cells {
		a.Cells[k] = true
	}
	for k, v := range b.Tok {
		a.Tok[k] += v
	}
	a.Runs++
	a.Keys = append(a.Keys, b.Keys...)
	a.Cost += b.Cost
	a.Tokens += b.Tokens
	if b.Agent >= 0 {
		a.Agent, a.Key = b.Agent, b.Key
	}
	if b.End.After(a.End) {
		a.End, a.Branch = b.End, or(b.Branch, a.Branch)
	}
	if a.Start.IsZero() || (!b.Start.IsZero() && b.Start.Before(a.Start)) {
		a.Start = b.Start
	}
	return a
}

// state is the lane's glyph state and its "next" column: who acts next.
func state(l Lane, agents []Agent, slots [2]int) (st, next string, you bool) {
	if l.Agent < 0 {
		return Done, "nobody", false
	}
	a := agents[l.Agent]
	switch {
	case a.Interrupted:
		return Paused, or(strings.TrimPrefix(backAt(a.Doing), "back "), "paused"), false
	case a.Group == GroupNeeds:
		return Needs, "answer", true
	case a.Group == GroupRuns:
		return Run, fmt.Sprintf("background %d/%d", slots[0], max(slots[1], 1)), false
	case a.State == "idle":
		return Idle, "next prompt", true
	}
	return Working, "working", false
}

// backAt finds "back HH:MM" in a paused row's text.
func backAt(s string) string {
	if i := strings.Index(s, "back "); i >= 0 {
		rest := s[i:]
		if j := strings.Index(rest, ","); j > 0 {
			rest = rest[:j]
		}
		return rest
	}
	return ""
}

// Group is one project's lanes, in display order.
type Group struct {
	Project       string
	Lanes         []int // indexes in the lanes
	Need, Running int
	LastAt        int
}

// Groups orders projects: most lanes that need the owner first, then running ones, then
// the latest activity. Inside a project, lanes run by start.
func Groups(lanes []Lane) []Group {
	idx := map[string]int{}
	var gs []Group
	for i, l := range lanes {
		j, ok := idx[l.Project]
		if !ok {
			j = len(gs)
			idx[l.Project] = j
			gs = append(gs, Group{Project: l.Project, LastAt: -1})
		}
		g := &gs[j]
		g.Lanes = append(g.Lanes, i)
		if l.NextYou {
			g.Need++
		}
		if l.State == Working || l.State == Run {
			g.Running++
		}
		g.LastAt = max(g.LastAt, l.Last())
	}
	for _, g := range gs {
		sort.SliceStable(g.Lanes, func(a, b int) bool {
			la, lb := lanes[g.Lanes[a]], lanes[g.Lanes[b]]
			fa, fb := la.First(), lb.First()
			if fa < 0 {
				fa = 1 << 20
			}
			if fb < 0 {
				fb = 1 << 20
			}
			return fa < fb
		})
	}
	sort.SliceStable(gs, func(a, b int) bool {
		if gs[a].Need != gs[b].Need {
			return gs[a].Need > gs[b].Need
		}
		if gs[a].Running != gs[b].Running {
			return gs[a].Running > gs[b].Running
		}
		return gs[a].LastAt > gs[b].LastAt
	})
	return gs
}

// Order is the lanes in display order.
func Order(lanes []Lane) []int {
	var out []int
	for _, g := range Groups(lanes) {
		out = append(out, g.Lanes...)
	}
	return out
}

func or(a, b string) string {
	if a != "" {
		return a
	}
	return b
}
