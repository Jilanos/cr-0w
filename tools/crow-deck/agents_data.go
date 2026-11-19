package main

// Day lanes: the shared crow-core/lanes builder over today's crow-usage sessions and the
// live agents from crow-runs.

import (
	"os/exec"
	"strconv"
	"strings"
	"time"

	"crow-core/lanes"
)

// Lane states, in the glyph legend's terms.
const (
	lsNeeds   = lanes.Needs
	lsWorking = lanes.Working
	lsIdle    = lanes.Idle
	lsRun     = lanes.Run
	lsPaused  = lanes.Paused
	lsDone    = lanes.Done
)

// laneRow is one session (or a set of same-titled runs) across today.
type laneRow = lanes.Lane

func bucketTime(day time.Time, b int) time.Time { return lanes.BucketTime(day, b) }

// ShortName and PathOf let the registry resolve names for the lanes package.
func (r *registry) ShortName(name string) string { return r.shortName(name) }

func (r *registry) PathOf(name string) (string, bool) {
	p, ok := r.find(name)
	return p.Path, ok
}

// lanesOf builds today's lanes with the shared builder. Live agents without activity yet
// still get a lane. A live agent with no model takes its lane's.
func lanesOf(now time.Time, sessions []usageSession, agents []agentRow, slots [2]int, reg *registry) []laneRow {
	day := now.Local().Format("2006-01-02")
	in := make([]lanes.Session, 0, len(sessions))
	for _, s := range sessions {
		ls := lanes.Session{ID: s.ID, Account: s.Account, Project: s.Project, Title: s.Title, Kind: s.Kind,
			Branch: s.Branch, Models: s.Models, Buckets: s.Activity[day], BucketTokens: map[int]int{},
			Cost: s.Today.CostUSD, Tokens: s.Tokens, CachePct: s.CachePct, Compactions: s.Compactions, Files: s.FilesEdited}
		ls.Start, _ = parseTime(s.Start)
		ls.End, _ = parseTime(s.End)
		for k, v := range s.ActivityTokens[day] {
			if n, err := strconv.Atoi(k); err == nil {
				ls.BucketTokens[n] += v
			}
		}
		in = append(in, ls)
	}
	ag := make([]lanes.Agent, len(agents))
	for i, a := range agents {
		ag[i] = lanes.Agent{Session: a.Session, Group: a.Group, State: a.State, Interrupted: a.Interrupted,
			Doing: a.Doing, Project: a.Project, Name: a.Name, Title: a.Title, Short: a.Short, Account: a.Account,
			Cwd: a.Cwd, Ctx: a.Ctx, Started: a.Started, Quiet: a.Quiet}
	}
	out := lanes.Build(in, ag, slots, reg)
	for _, l := range out {
		if l.Agent >= 0 && agents[l.Agent].Model == "" {
			agents[l.Agent].Model = l.Model
		}
	}
	return out
}

// laneGroup is one project's lanes, in display order.
type laneGroup = lanes.Group

func groupLanes(ls []laneRow) []laneGroup { return lanes.Groups(ls) }

// laneOrder is the lanes in display order.
func laneOrder(ls []laneRow) []int { return lanes.Order(ls) }

// ----- git facts of the selected lane's checkout -----

type gitFile struct {
	Path     string
	Add, Del int
	Binary   bool
}

// laneGit is the working tree state the Detail and diff tabs show.
type laneGit struct {
	Files []gitFile
	Diff  []string // `git diff` lines, capped
	Last  string   // last commit: "hash subject"
	Err   string
	At    time.Time
	Busy  bool
}

type laneGitMsg struct {
	cwd string
	g   laneGit
}

const laneGitTTL = 30 * time.Second
const diffCap = 400

var gitRunner = func(dir string, args ...string) (string, error) {
	cmd := exec.Command("git", append([]string{"-C", dir}, args...)...)
	out, err := cmd.Output()
	return string(out), err
}

func fetchLaneGit(cwd string) laneGit {
	g := laneGit{At: time.Now()}
	out, err := gitRunner(cwd, "diff", "--numstat", "HEAD")
	if err != nil {
		g.Err = "not a git checkout"
		return g
	}
	for _, ln := range strings.Split(strings.TrimSpace(out), "\n") {
		f := strings.SplitN(ln, "\t", 3)
		if len(f) != 3 {
			continue
		}
		a, e1 := strconv.Atoi(f[0])
		d, e2 := strconv.Atoi(f[1])
		g.Files = append(g.Files, gitFile{Path: f[2], Add: a, Del: d, Binary: e1 != nil || e2 != nil})
	}
	if out, err := gitRunner(cwd, "diff", "--no-color", "-U1", "HEAD"); err == nil {
		lines := strings.Split(strings.TrimRight(out, "\n"), "\n")
		if len(lines) > diffCap {
			lines = lines[:diffCap]
		}
		if len(lines) == 1 && lines[0] == "" {
			lines = nil
		}
		g.Diff = lines
	}
	if out, err := gitRunner(cwd, "log", "-1", "--format=%h %s"); err == nil {
		g.Last = strings.TrimSpace(out)
	}
	return g
}
