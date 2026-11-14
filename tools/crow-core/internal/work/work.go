// Package work builds the core work feed (item_202): live sessions, dispatch runs,
// sessions parked on a usage limit, merge requests and missions folded into one list of
// contract.WorkItem. The project and state rules are the ones Nest's hero used
// (tools/nest/src/hero/model.ts, data/state.ts), moved here so every surface agrees.
//
// The script sections come in as decoded JSON (map[string]any) because their shape is
// the script contract's, not a Go type; a missing or odd field reads as empty.
package work

import (
	"cmp"
	"fmt"
	"slices"
	"strconv"
	"strings"
	"time"

	"crow-core/contract"
)

// Input is everything the feed is built from. A nil section contributes nothing.
type Input struct {
	Projects map[string]any // crow-registry json
	Dispatch map[string]any // crow-runs json
	Sessions map[string]any // crow-sessions list --json
	MRs      map[string]any // crow-mrs json
	Missions []contract.Mission
	Inbox    []contract.InboxItem // open rows are enough
	Now      time.Time
}

// DoneFor keeps a done or cancelled mission in the feed this long after its last change.
const DoneFor = 24 * time.Hour

// Project is one registry row.
type Project struct{ Name, Short, Path string }

// Registry reads the registry rows of a crow-registry body.
func Registry(m map[string]any) []Project {
	var out []Project
	for _, p := range rows(m, "projects") {
		out = append(out, Project{Name: str(p, "name"), Short: str(p, "short"), Path: str(p, "path")})
	}
	return out
}

// ProjectOfCwd is the longest registry path holding cwd, its `<path>.wt/` worktrees
// included. Empty when none does.
func ProjectOfCwd(cwd string, reg []Project) string {
	if cwd == "" {
		return ""
	}
	best, bestLen := "", -1
	for _, p := range reg {
		root := strings.TrimRight(p.Path, "/")
		if root == "" {
			continue
		}
		under := cwd == root || strings.HasPrefix(cwd, root+"/") || cwd == root+".wt" || strings.HasPrefix(cwd, root+".wt/")
		if under && len(root) > bestLen {
			best, bestLen = p.Name, len(root)
		}
	}
	return best
}

// projectOfAgent: cwd first, then the agent's own project when known, then its largest
// usage share, then its own project as given.
func projectOfAgent(a map[string]any, reg []Project, known map[string]bool) string {
	if p := ProjectOfCwd(str(a, "cwd"), reg); p != "" {
		return p
	}
	own := str(a, "project")
	if known[own] {
		return own
	}
	top, share := "", -1.0
	for _, p := range rows(a, "projects") {
		if s := num(p, "share_pct"); s > share && str(p, "name") != "" {
			top, share = str(p, "name"), s
		}
	}
	if top != "" {
		return top
	}
	return own
}

// projectByName maps a forge or mission project name to its registry name: a registry
// name or short name matches, anything else stays as given.
func projectByName(reg []Project, names ...string) string {
	for _, n := range names {
		for _, p := range reg {
			if n != "" && (p.Name == n || p.Short == n) {
				return p.Name
			}
		}
	}
	for _, n := range names {
		if n != "" {
			return n
		}
	}
	return ""
}

// MissionState folds a mission's contract state into a work state (Nest uiState).
func MissionState(m contract.Mission, inbox []contract.InboxItem) string {
	switch m.State {
	case "failed":
		return "failed"
	case "done", "cancelled":
		return "done"
	case "waiting", "review":
		return "needs"
	}
	if asked(m.ID, inbox) != nil {
		return "needs"
	}
	if m.State == "queued" {
		if n := len(m.Runs); n > 0 && m.Runs[n-1].Cause != nil && *m.Runs[n-1].Cause == "usage_limit" {
			return "sleeping"
		}
		return "queued"
	}
	return "working"
}

// asked is the oldest open, non-FYI inbox row of a mission.
func asked(id string, inbox []contract.InboxItem) *contract.InboxItem {
	var out *contract.InboxItem
	for i := range inbox {
		r := &inbox[i]
		if r.Mission == id && r.State == "open" && r.Type != "fyi" && (out == nil || r.Created < out.Created) {
			out = r
		}
	}
	return out
}

// Build returns the feed, most urgent first.
func Build(in Input) []contract.WorkItem {
	reg := Registry(in.Projects)
	known := map[string]bool{}
	for _, p := range reg {
		known[p.Name] = true
	}
	for _, m := range in.Missions {
		known[m.Project] = true
	}
	b := builder{in: in, reg: reg, ids: map[string]bool{}}
	for _, m := range in.Missions {
		b.ids[m.ID] = true
	}
	live := map[string]bool{} // run ids and session ids with a live process

	for _, a := range rows(in.Dispatch, "agents") {
		kind, ref := contract.WorkSession, str(a, "pid")
		if str(a, "kind") == "run" {
			kind, ref = contract.WorkRun, str(a, "run_id")
		}
		live[str(a, "run_id")], live[str(a, "session_id")] = true, true
		it := contract.WorkItem{
			ID: kind + ":" + ref, Kind: kind, Project: projectOfAgent(a, reg, known), State: "working",
			Title: first(str(a, "title"), str(a, "label"), str(a, "last_prompt"), str(a, "project")),
			Since: agentSince(a), Source: contract.WorkSource{Section: "dispatch", Ref: ref},
			Mission: b.linked(str(a, "mission"), str(a, "run_id"), str(a, "cwd")),
		}
		if str(a, "state") == "waiting" {
			it.State, it.Why = "needs", "waiting on you"
			if p, _ := a["prompt"].(map[string]any); p != nil {
				it.Why = strings.TrimSpace("asks " + str(p, "tool"))
			}
			if s, ok := a["last_activity_s"].(float64); ok {
				it.WaitS = secs(int64(s))
			}
		}
		b.addAt(it, str(a, "cwd"), str(a, "branch"))
	}

	for _, f := range rows(in.Dispatch, "finished") {
		id := str(f, "run_id")
		if id == "" || live[id] {
			continue
		}
		st := str(f, "status")
		it := contract.WorkItem{
			ID: contract.WorkRun + ":" + id, Kind: contract.WorkRun, Project: projectByName(reg, str(f, "project")),
			State: finishedState(st), Title: first(str(f, "label"), str(f, "project")), Since: str(f, "ended_at"),
			Why: "run " + st, Source: contract.WorkSource{Section: "dispatch", Ref: id},
			Mission: b.linked(str(f, "mission"), id, ""),
		}
		b.addAt(it, "", str(f, "branch"))
	}

	for _, r := range rows(in.Sessions, "sessions") {
		id := str(r, "conversation_id")
		reset, err := time.Parse(time.RFC3339, str(r, "resets_at"))
		if id == "" || live[id] || str(r, "limit") == "" || err != nil || !reset.After(in.Now) {
			continue
		}
		p := ProjectOfCwd(str(r, "cwd"), reg)
		if p == "" {
			p = projectByName(reg, str(r, "project"))
		}
		b.addAt(contract.WorkItem{
			ID: contract.WorkParked + ":" + id, Kind: contract.WorkParked, Project: p, State: "sleeping",
			Title: first(str(r, "last_prompt"), str(r, "first_prompt"), p), Since: str(r, "last_event"),
			ResetsAt: str(r, "resets_at"), Why: "usage limit", Source: contract.WorkSource{Section: "sessions", Ref: id},
			Mission: b.linked(str(r, "mission"), "", str(r, "cwd")),
		}, str(r, "cwd"), str(r, "branch"))
	}
	b.byWorktree()

	for _, m := range rows(in.MRs, "mrs") {
		b.add(b.mr(m))
	}

	for _, m := range in.Missions {
		var it contract.WorkItem
		if IsLinked(m) {
			it = b.linkedMission(m)
		} else {
			it = b.mission(m)
		}
		if it.State == "done" && b.age(it.Since) > DoneFor {
			continue
		}
		b.add(it)
	}

	slices.SortStableFunc(b.out, func(x, y contract.WorkItem) int {
		return cmp.Or(
			cmp.Compare(contract.WorkRank(x.State), contract.WorkRank(y.State)),
			cmp.Compare(waited(y), waited(x)),
			strings.Compare(y.Since, x.Since),
			strings.Compare(x.ID, y.ID),
		)
	})
	return b.out
}

type builder struct {
	in  Input
	reg []Project
	out []contract.WorkItem
	at  []place         // where each item of out runs, same index
	ids map[string]bool // known mission ids
}

// place is the cwd and git branch a work item runs in, when known.
type place struct{ cwd, branch string }

func (b *builder) add(it contract.WorkItem) { b.addAt(it, "", "") }

func (b *builder) addAt(it contract.WorkItem, cwd, branch string) {
	b.out = append(b.out, it)
	b.at = append(b.at, place{cwd, branch})
}

// linked is the mission of a piece of work (item_203): the id it carries (a handoff
// note's Mission: line, a dispatch run's linked mission) when that mission exists, else
// the mission holding its run id or worktree.
func (b *builder) linked(own, run, cwd string) string {
	if own != "" && b.ids[own] {
		return own
	}
	return b.missionOf(run, cwd)
}

// byWorktree links unlinked work to the mission of other work in the same worktree
// (<repo>.wt/<name>). A worktree holding work of two missions links nothing more.
func (b *builder) byWorktree() {
	of := map[string]string{}
	for i, it := range b.out {
		if wt := worktreeOf(b.at[i].cwd); wt != "" && it.Mission != "" {
			if m, seen := of[wt]; seen && m != it.Mission {
				of[wt] = ""
			} else {
				of[wt] = it.Mission
			}
		}
	}
	for i := range b.out {
		if wt := worktreeOf(b.at[i].cwd); wt != "" && b.out[i].Mission == "" {
			b.out[i].Mission = of[wt]
		}
	}
}

// onBranch is the mission of linked work of a project running on a branch.
func (b *builder) onBranch(project, branch string) string {
	for i, it := range b.out {
		if branch != "" && it.Mission != "" && b.at[i].branch == branch && it.Project == project {
			return it.Mission
		}
	}
	return ""
}

// worktreeOf is the <repo>.wt/<name> folder holding cwd, empty outside worktrees.
func worktreeOf(cwd string) string {
	parts := strings.Split(cwd, "/")
	for i := 0; i+1 < len(parts); i++ {
		if len(parts[i]) > len(".wt") && strings.HasSuffix(parts[i], ".wt") && parts[i+1] != "" {
			return strings.Join(parts[:i+2], "/")
		}
	}
	return ""
}

// IsLinked says whether a mission groups work started by a handoff or a dispatch
// (mission.Ensure): a build mission running with no core run of its own.
func IsLinked(m contract.Mission) bool {
	return m.Kind == "build" && m.State == "running" && len(m.Runs) == 0
}

// mission maps a mission the core runs itself: its state is the contract state.
func (b *builder) mission(m contract.Mission) contract.WorkItem {
	st := MissionState(m, b.in.Inbox)
	it := contract.WorkItem{
		ID: contract.WorkMission + ":" + m.ID, Kind: contract.WorkMission, Project: projectByName(b.reg, m.Project),
		State: st, Title: first(m.Goal, m.ID), Since: m.Updated, Mission: m.ID,
		Source: contract.WorkSource{Section: "missions", Ref: m.ID},
	}
	if n := len(m.Runs); n > 0 && m.Runs[n-1].Ended == nil && st == "working" {
		it.Since = m.Runs[n-1].Started
	}
	switch st {
	case "needs":
		from := m.Updated
		if r := asked(m.ID, b.in.Inbox); r != nil {
			from, it.Why = r.Created, r.Type
		} else {
			it.Why = m.State
		}
		it.WaitS = secs(int64(b.age(from) / time.Second))
	case "failed":
		if n := len(m.Runs); n > 0 && m.Runs[n-1].Cause != nil {
			it.Why = *m.Runs[n-1].Cause
		}
	}
	return it
}

// linkedMission maps a linked mission: its state is the most urgent state of the work
// linked to it (failed > needs > working > sleeping > queued), done once all of it is
// done. A failure counts only while no newer work exists: after it, the state rolls up
// from the newer work alone. An open inbox ask still makes it needs. With no work in
// sight it is done since its last linked work ended, so it leaves the feed DoneFor later.
func (b *builder) linkedMission(m contract.Mission) contract.WorkItem {
	if asked(m.ID, b.in.Inbox) != nil {
		return b.mission(m)
	}
	it := b.mission(m)
	var work []*contract.WorkItem
	var failed *contract.WorkItem
	latest := ""
	for i := range b.out {
		w := &b.out[i]
		if w.Kind == contract.WorkMission || w.Mission != m.ID {
			continue
		}
		work = append(work, w)
		if w.State == "failed" && (failed == nil || at(w.Since).After(at(failed.Since))) {
			failed = w
		}
		latest = later(latest, w.Since)
	}
	for _, r := range rows(b.in.Sessions, "sessions") {
		if str(r, "mission") == m.ID {
			latest = later(latest, str(r, "last_event")) // parked sessions past their reset
		}
	}
	if latest == "" {
		latest = m.Updated // no linked work seen: the mission's own last change
	}
	if failed != nil {
		var newer []*contract.WorkItem
		for _, w := range work {
			if w.State != "failed" && at(w.Since).After(at(failed.Since)) {
				newer = append(newer, w)
			}
		}
		if len(newer) > 0 {
			work = newer
		}
	}
	var top *contract.WorkItem
	for _, w := range work {
		if top == nil || contract.WorkRank(w.State) < contract.WorkRank(top.State) {
			top = w
		}
	}
	if top == nil {
		it.State, it.Why, it.Since = "done", "no live work", latest
		return it
	}
	it.State, it.Why, it.WaitS, it.ResetsAt, it.Since = top.State, top.Kind+": "+top.Why, top.WaitS, top.ResetsAt, top.Since
	if top.Why == "" {
		it.Why = top.Kind
	}
	if top.State == "done" {
		it.Since = latest
	}
	return it
}

// at parses an RFC 3339 time; the zero time when it does not parse.
func at(ts string) time.Time {
	t, _ := time.Parse(time.RFC3339, ts)
	return t
}

// later is the later of two RFC 3339 times.
func later(a, b string) string {
	if at(b).After(at(a)) {
		return b
	}
	return a
}

// age is how long ago an RFC 3339 time was; zero when it does not parse.
func (b *builder) age(ts string) time.Duration {
	t, err := time.Parse(time.RFC3339, ts)
	if err != nil {
		return 0
	}
	return max(0, b.in.Now.Sub(t))
}

// missionOf finds the mission a run or a worktree belongs to: the run id among its runs,
// else its worktree holding cwd.
func (b *builder) missionOf(run, cwd string) string {
	for _, m := range b.in.Missions {
		for _, r := range m.Runs {
			if run != "" && r.Run == run {
				return m.ID
			}
		}
	}
	for _, m := range b.in.Missions {
		if wt := strings.TrimRight(deref(m.Worktree), "/"); cwd != "" && wt != "" && (cwd == wt || strings.HasPrefix(cwd, wt+"/")) {
			return m.ID
		}
	}
	return ""
}

// mr maps one merge request. The owner owes it when a review is asked of them, or when
// it is theirs and the pipeline is red or threads are open. A running pipeline works;
// the rest waits on others (queued).
func (b *builder) mr(m map[string]any) contract.WorkItem {
	url := first(str(m, "url"), str(m, "repo")+str(m, "ref"))
	it := contract.WorkItem{
		ID: contract.WorkMR + ":" + url, Kind: contract.WorkMR,
		Project: projectByName(b.reg, str(m, "name"), str(m, "project")), State: "queued",
		Title: strings.TrimSpace(str(m, "ref") + " " + str(m, "title")), Since: str(m, "updated"),
		Source: contract.WorkSource{Section: "mrs", Ref: url},
	}
	draft, _ := m["draft"].(bool)
	mine := str(m, "role") == "AUTHOR" || str(m, "role") == "ASSIGNEE"
	open := int(num(m, "threads_open"))
	switch {
	case str(m, "role") == "REVIEWER" && !draft:
		it.State, it.Why = "needs", "review asked"
		it.WaitS = secs(int64(b.age(first(str(m, "created"), str(m, "updated"))) / time.Second))
	case mine && str(m, "pipeline") == "failed":
		it.State, it.Why = "failed", "red pipeline"
	case mine && open > 0:
		it.State, it.Why = "needs", fmt.Sprintf("%d open threads", open)
		it.WaitS = secs(int64(b.age(str(m, "updated")) / time.Second))
	case str(m, "pipeline") == "running":
		it.State, it.Why = "working", "pipeline running"
	case draft:
		it.Why = "draft"
	default:
		it.Why = "waiting on review"
	}
	for _, ms := range b.in.Missions {
		if (deref(ms.MR) != "" && deref(ms.MR) == url) ||
			(deref(ms.Branch) != "" && deref(ms.Branch) == str(m, "branch") && projectByName(b.reg, ms.Project) == it.Project) {
			it.Mission = ms.ID
			break
		}
	}
	if it.Mission == "" {
		it.Mission = b.onBranch(it.Project, str(m, "branch"))
	}
	return it
}

// finishedState maps a finished dispatch run status (crow-runs run_state).
func finishedState(status string) string {
	switch status {
	case "failed", "stuck", "budget":
		return "failed"
	case "limit":
		return "sleeping"
	}
	return "done"
}

// agentSince is when a live agent started: started_at, else its oldest recent action.
func agentSince(a map[string]any) string {
	if s := str(a, "started_at"); s != "" {
		return s
	}
	var ts []string
	for _, r := range rows(a, "recent") {
		if t := str(r, "ts"); t != "" {
			ts = append(ts, t)
		}
	}
	if len(ts) == 0 {
		return ""
	}
	return slices.Min(ts)
}

func waited(it contract.WorkItem) int64 {
	if it.WaitS == nil {
		return -1
	}
	return *it.WaitS
}

func secs(n int64) *int64 { return &n }

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func first(xs ...string) string {
	for _, x := range xs {
		if x = strings.TrimSpace(x); x != "" {
			return x
		}
	}
	return ""
}

func rows(m map[string]any, key string) []map[string]any {
	var out []map[string]any
	list, _ := m[key].([]any)
	for _, v := range list {
		if r, ok := v.(map[string]any); ok {
			out = append(out, r)
		}
	}
	return out
}

func str(r map[string]any, k string) string {
	switch v := r[k].(type) {
	case string:
		return v
	case float64:
		return strconv.FormatFloat(v, 'f', -1, 64)
	}
	return ""
}

func num(r map[string]any, k string) float64 {
	switch v := r[k].(type) {
	case float64:
		return v
	case string:
		f, _ := strconv.ParseFloat(v, 64)
		return f
	}
	return 0
}
