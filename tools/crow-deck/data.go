package main

// Live data: the bin/ scripts' JSON (crow-runs, crow-sessions, crow-usage, crow-accounts,
// crow-registry) is fetched by exec and mapped to fixtures. Nothing here calls a model:
// crow-usage runs with CROW_TITLES_PER_DAY=0 so it never starts its title worker.

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"crow-core/lanes"
)

func crowHome() string {
	if h := os.Getenv("CROW_HOME"); h != "" {
		return h
	}
	exe, _ := os.Executable()
	return filepath.Join(filepath.Dir(exe), "..", "..")
}

func crowBin(name string) string { return filepath.Join(crowHome(), "bin", name) }

// ----- source types (mirror the scripts' JSON) -----

type event struct {
	TS     string `json:"ts"`
	Action string `json:"action"`
}

type liveAgent struct {
	Kind          string  `json:"kind"`
	PID           int     `json:"pid"`
	Account       string  `json:"account"`
	Project       string  `json:"project"`
	Cwd           string  `json:"cwd"`
	SessionID     string  `json:"session_id"`
	State         string  `json:"state"`
	StartedAt     string  `json:"started_at"`
	LastActivityS int     `json:"last_activity_s"`
	LastAction    string  `json:"last_action"`
	LastPrompt    string  `json:"last_prompt"`
	ContextTokens int     `json:"context_tokens"`
	Recent        []event `json:"recent"`
	RunID         string  `json:"run_id"`
	Label         string  `json:"label"`
	Title         string  `json:"title"`
}

type finishedRun struct {
	RunID     string   `json:"run_id"`
	Project   string   `json:"project"`
	Label     string   `json:"label"`
	Status    string   `json:"status"`
	DurationS int      `json:"duration_s"`
	EndedAt   string   `json:"ended_at"`
	Commits   []string `json:"commits"`
	CostUSD   *float64 `json:"cost_usd"`   // nil: cdx has no figure, show nothing
	BudgetUSD *float64 `json:"budget_usd"` // the run's --budget cap
	Denials   []string `json:"denials"`    // tool calls the run's allowlist refused ("Bash: touch x")
}

// runCost renders "$0.71" or "$0.71 of $25"; empty when the run has no cost.
func runCost(cost, budget *float64) string {
	if cost == nil {
		return ""
	}
	s := fmt.Sprintf("$%.2f", *cost)
	if budget != nil && *budget > 0 {
		s += fmt.Sprintf(" of $%g", *budget)
	}
	return s
}

type runsSnap struct {
	Slots struct {
		Busy int `json:"busy"`
		Max  int `json:"max"`
	} `json:"slots"`
	Agents   []liveAgent   `json:"agents"`
	Finished []finishedRun `json:"finished"`
}

// intrSession: a session cut off by a usage limit (crow-sessions list --json).
type intrSession struct {
	ID          string `json:"conversation_id"`
	Account     string `json:"account"`
	Project     string `json:"project"`
	Cwd         string `json:"cwd"`
	LastEvent   string `json:"last_event"`
	Limit       string `json:"limit"`
	ResetsAt    int64  `json:"resets_at"`
	FirstPrompt string `json:"first_prompt"`
	Relaunched  any    `json:"relaunched"`
}

type limitRow struct {
	Account          string   `json:"account"`
	Remaining5hPct   *int     `json:"remaining_5h_pct"`
	Reset5hAt        string   `json:"reset_5h_at"`
	RemainingWeekPct *int     `json:"remaining_week_pct"`
	ResetWeekAt      string   `json:"reset_week_at"`
	Burn5h           *float64 `json:"burn_5h_pct_per_h"`
	EmptyAt          string   `json:"empty_at"`
	Active           bool     `json:"active"`
}

type usageSession struct {
	ID       string           `json:"id"`
	Account  string           `json:"account"`
	Project  string           `json:"project"`
	Cwd      string           `json:"cwd"`
	Path     string           `json:"path"` // the transcript
	Title    string           `json:"title"`
	Start    string           `json:"start"`
	End      string           `json:"end"`
	Activity map[string][]int `json:"activity"`
	Kind     string           `json:"kind"`
	Branch   string           `json:"branch"`
	Models   []string         `json:"models"`
	Tokens   int              `json:"tokens"`
	CostUSD  float64          `json:"cost_usd"`
	Messages int              `json:"user_messages"`
	Today    struct {
		CostUSD float64 `json:"cost_usd"`
	} `json:"today"`
	CachePct       int                       `json:"cache_pct"`
	Compactions    int                       `json:"compactions"`
	ActivityTokens map[string]map[string]int `json:"activity_tokens"`
	FilesEdited    map[string]int            `json:"files_edited"`
	Active         bool                      `json:"active"`
	InputTokens    int                       `json:"input_tokens"`
	OutputTokens   int                       `json:"output_tokens"`
	ContextTokens  int                       `json:"context_tokens"`
	ContextLevel   string                    `json:"context_level"` // ok, warn, over
	ByDay          map[string]dayUse         `json:"by_day"`
	LimitShare     struct {
		FiveH *float64 `json:"five_hour_pct"`
		Week  *float64 `json:"week_pct"`
	} `json:"limit_share"`
}

// dayUse is one session's or one day's share of tokens and cost.
type dayUse struct {
	Date       string  `json:"date"`
	CostUSD    float64 `json:"cost_usd"`
	Tokens     int     `json:"tokens"`
	CacheRead  int     `json:"cache_read_tokens"`
	CacheWrite int     `json:"cache_write_tokens"`
}

type usageName struct {
	Name     string  `json:"name"`
	CostUSD  float64 `json:"cost_usd"`
	Tokens   int     `json:"tokens"`
	Sessions int     `json:"sessions"`
}

type usageTool struct {
	Name  string `json:"name"`
	Calls int    `json:"calls"`
}

type usageTotals struct {
	CostUSD         float64     `json:"cost_usd"`
	CacheSavedUSD   float64     `json:"cache_saved_usd"`
	RoutingSavedUSD float64     `json:"routing_saved_usd"`
	CachePct        int         `json:"cache_pct"`
	ByProject       []usageName `json:"by_project"`
	ByModel         []usageName `json:"by_model"`
	Tokens          int         `json:"tokens"`
	Runs            int         `json:"runs"`
	RoutedRuns      int         `json:"routed_runs"`
	Compactions     int         `json:"compactions"`
	Tools           []usageTool `json:"tools"`
}

type usageSnap struct {
	GeneratedAt string         `json:"generated_at"`
	Limits      []limitRow     `json:"limits"`
	Sessions    []usageSession `json:"sessions"`
	Today       usageTotals    `json:"today"`
	Week        usageTotals    `json:"week"`
	Month       usageTotals    `json:"month"`
	History     []dayUse       `json:"history"`
	RTK         struct {
		TodaySavedTokens int     `json:"today_saved_tokens"`
		TodaySavedPct    float64 `json:"today_saved_pct"`
		TodayCommands    int     `json:"today_commands"`
		SavedTokens      int     `json:"saved_tokens"`
		SavedPct         float64 `json:"saved_pct"`
		Commands         int     `json:"commands"`
	} `json:"rtk"`
	Retros struct {
		Today int `json:"today"`
		Week  int `json:"week"`
	} `json:"retros"`
}

type acctPolicy struct {
	Name   string `json:"name"`
	Policy string `json:"policy"`
	Tier   string `json:"tier"` // mine, team
}

type regGit struct {
	Email      string `json:"email"`
	Dirty      int    `json:"dirty"`
	Ahead      int    `json:"ahead"`
	StaleTrees int    `json:"stale_trees"`
}

type regProject struct {
	Name    string `json:"name"`
	Short   string `json:"short"`
	Scope   string `json:"scope"`
	Forge   string `json:"forge"`
	Remote  string `json:"remote"`
	Path    string `json:"path"`
	Status  string `json:"status"`
	Logics  bool   `json:"logics"`
	Release struct {
		Target  string `json:"target"`
		State   string `json:"state"`
		Roadmap string `json:"roadmap"`
		Date    string `json:"date"`  // YYYY-MM-DD, a dated release without a roadmap doc
		Label   string `json:"label"` // its name, "Prod launch"
	} `json:"release"`
	Road *regRoad       `json:"road"`
	Git  regGit         `json:"git"`
	Work map[string]int `json:"work"` // owner commits per day, YYYY-MM-DD
}

// regRoad is the milestone progress crow-registry reads from the roadmap doc.
type regRoad struct {
	Done    int       `json:"done"`
	Total   int       `json:"total"`
	Current string    `json:"current"`
	Exit    string    `json:"exit"`
	Start   string    `json:"start"`  // the roadmap doc date
	Target  string    `json:"target"` // the current milestone's date
	Miles   []regMile `json:"miles"`
	Doc     string    `json:"doc"` // the roadmap doc, absolute; `e` opens it
}

type regMile struct {
	Title string `json:"title"`
	Done  bool   `json:"done"`
	Date  string `json:"date"`
}

type registry struct {
	Identities  map[string]string `json:"identities"`
	StateDir    string            `json:"state_dir"`
	ThreadsFile string            `json:"threads_file"`
	DailyDir    string            `json:"daily_dir"`
	Projects    []regProject      `json:"projects"`
}

// ----- fetching -----

func runJSON(timeout time.Duration, env []string, out any, name string, args ...string) error {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, crowBin(name), args...)
	cmd.Env = append(os.Environ(), env...)
	b, err := cmd.Output()
	if err != nil {
		return fmt.Errorf("%s: %w", name, err)
	}
	return json.Unmarshal(b, out)
}

func fetchRuns() (*runsSnap, error) {
	var s runsSnap
	return &s, runJSON(20*time.Second, nil, &s, "crow-runs", "json")
}

func fetchInterrupted() ([]intrSession, error) {
	var r struct {
		Sessions []intrSession `json:"sessions"`
	}
	err := runJSON(20*time.Second, nil, &r, "crow-sessions", "list", "--json")
	return r.Sessions, err
}

func fetchUsage() (*usageSnap, error) {
	var s usageSnap
	return &s, runJSON(30*time.Second, []string{"CROW_TITLES_PER_DAY=0"}, &s, "crow-usage", "--json")
}

func fetchAccounts() ([]acctPolicy, error) {
	var r struct {
		Accounts []acctPolicy `json:"accounts"`
	}
	err := runJSON(10*time.Second, nil, &r, "crow-accounts", "json")
	return r.Accounts, err
}

func fetchRegistry() (*registry, error) {
	var r registry
	return &r, runJSON(30*time.Second, nil, &r, "crow-registry", "json")
}

// ----- live state -----

const (
	srcRuns     = "runs"
	srcSessions = "sessions"
	srcUsage    = "usage"
	srcAccounts = "accounts"
	srcRegistry = "registry"
	srcMRs      = "mrs"
)

// liveState holds the last good payload of every source with its age and last error.
type liveState struct {
	runs   *runsSnap
	intr   []intrSession
	usage  *usageSnap
	acct   []acctPolicy
	reg    *registry
	mrs    *mrsSnap
	today  *todaySnap
	checks *checksSnap
	rel    *relStatus
	at     map[string]time.Time
	err    map[string]string
	// MR diffs and threads, fetched when an MR is selected.
	details map[string]*detailEntry
	// git state of the selected lane's checkout, by path.
	git map[string]*laneGit
}

type detailEntry struct {
	d    *mrDetail
	at   time.Time
	err  string
	busy bool
}

func newLiveState() *liveState {
	return &liveState{at: map[string]time.Time{}, err: map[string]string{}, details: map[string]*detailEntry{}, git: map[string]*laneGit{}}
}

// srcMsg is one source's result.
type srcMsg struct {
	src string
	val any
	err error
	at  time.Time
}

func (ls *liveState) apply(msg srcMsg) {
	if msg.err != nil {
		ls.err[msg.src] = msg.err.Error()
		return
	}
	delete(ls.err, msg.src)
	ls.at[msg.src] = msg.at
	switch v := msg.val.(type) {
	case *runsSnap:
		ls.runs = v
	case []intrSession:
		ls.intr = v
	case *usageSnap:
		ls.usage = v
	case []acctPolicy:
		ls.acct = v
	case *registry:
		ls.reg = v
	case *mrsSnap:
		ls.mrs = v
	case *todaySnap:
		ls.today = v
	case *checksSnap:
		ls.checks = v
	case *relStatus:
		ls.rel = v
	}
}

// applyDetail stores the diff of one MR; a failure is kept with its time so it is retried
// after the TTL, not on every tick.
func (ls *liveState) applyDetail(msg detailMsg) {
	e := ls.details[msg.key]
	if e == nil {
		e = &detailEntry{}
		ls.details[msg.key] = e
	}
	e.busy, e.at = false, msg.at
	if msg.err != nil {
		e.err = firstLine(msg.err.Error())
		return
	}
	e.d, e.err = msg.d, ""
}

// syncState summarises the sources for the header dot: loading until runs arrived, red
// naming the failing source, yellow when the oldest source is older than staleAfter.
const staleAfter = 90 * time.Second

func (ls *liveState) syncState(now time.Time) (state, note string) {
	if ls.runs == nil && len(ls.err) == 0 {
		return stLoading, ""
	}
	for _, src := range []string{srcRuns, srcSessions, srcUsage, srcAccounts, srcRegistry, srcMRs} {
		if _, bad := ls.err[src]; bad {
			return stError, map[string]string{
				srcRuns: "cdx not running", srcSessions: "sessions scan failed", srcUsage: "usage failed",
				srcAccounts: "accounts failed", srcRegistry: "registry failed", srcMRs: "forge sync failed",
			}[src]
		}
	}
	if ls.mrs != nil {
		for _, name := range []string{"gitlab", "github"} {
			if st := ls.mrs.Forges[name]; st != "" && st != "ok" {
				return stError, name + " sync failed"
			}
		}
	}
	for _, t := range ls.at {
		if now.Sub(t) > staleAfter {
			return stStale, "stale " + shortAge(now.Sub(t))
		}
	}
	return stFresh, ""
}

func shortAge(d time.Duration) string {
	s := int(d.Seconds())
	switch {
	case s < 0:
		return "0s"
	case s < 60:
		return fmt.Sprintf("%ds", s)
	case s < 3600:
		return fmt.Sprintf("%dm", s/60)
	case s < 86400:
		return fmt.Sprintf("%dh%02d", s/3600, (s%3600)/60)
	}
	return fmt.Sprintf("%dd", s/86400)
}

// ----- mapping to fixtures -----

func parseTime(s string) (time.Time, bool) {
	for _, layout := range []string{time.RFC3339Nano, time.RFC3339, "2006-01-02T15:04:05.000Z"} {
		if t, err := time.Parse(layout, s); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}

func clock(t time.Time) string { return t.Local().Format("15:04") }

// shortName maps a project name from the scripts to the registry's short name.
func (r *registry) shortName(name string) string {
	name = strings.TrimSuffix(name, " (hub)")
	if r != nil {
		for _, p := range r.Projects {
			if p.Name == name || p.Short == name {
				return p.Short
			}
		}
	}
	return name
}

// find is the project for a name, short name or checkout folder name (any case).
func (r *registry) find(name string) (regProject, bool) {
	name = strings.TrimSuffix(name, " (hub)")
	if r != nil {
		for _, p := range r.Projects {
			if p.Name == name || p.Short == name || strings.EqualFold(filepath.Base(p.Path), name) {
				return p, true
			}
		}
	}
	return regProject{}, false
}

// fullName is the registry name for a short or full name; unknown names come back as is.
func (r *registry) fullName(name string) string {
	if p, ok := r.find(name); ok {
		return p.Name
	}
	return strings.TrimSuffix(name, " (hub)")
}

func (r *registry) scopeOf(name string) string {
	p, _ := r.find(name)
	return p.Scope
}

func firstLine(s string) string {
	s, _, _ = strings.Cut(strings.TrimSpace(s), "\n")
	return strings.TrimSpace(s)
}

// lastLine is the error a failed command ends on; notices (account picks) come first.
func lastLine(s string) string {
	s = strings.TrimSpace(s)
	if i := strings.LastIndex(s, "\n"); i >= 0 {
		s = s[i+1:]
	}
	return strings.TrimSpace(s)
}

func tokensK(n int) string {
	if n >= 1000 {
		return fmt.Sprintf("%dk", n/1000)
	}
	return fmt.Sprintf("%d", n)
}

// agentRows maps the runs snapshot and the interrupted registry to rows, newest first
// inside each group. The group is what the Agents tab sorts on.
func agentRows(now time.Time, runs *runsSnap, intr []intrSession, reg *registry) []agentRow {
	var rows []agentRow
	if runs == nil {
		return nil
	}
	for _, a := range runs.Agents {
		r := agentRow{
			Account: a.Account, PID: a.PID, Session: a.SessionID, Cwd: a.Cwd, Project: reg.shortName(a.Project),
			Title: a.Title, Ctx: a.ContextTokens,
		}
		started, _ := parseTime(a.StartedAt)
		idle := time.Duration(a.LastActivityS) * time.Second
		last := firstLine(strings.TrimPrefix(a.LastAction, "says: "))
		switch {
		case a.Kind == "run":
			r.Group, r.State = gRuns, "working"
			if a.State == "quiet" {
				r.State = "idle"
			}
			r.Session = a.RunID
			r.Name = cmpOr(a.Label, "run "+short4(a.RunID))
			r.Short = r.Name
			r.Doing = cmpOr(last, "running")
			r.Since = shortAge(now.Sub(started))
		case a.State == "waiting":
			r.Group, r.State = gNeeds, "needs"
			r.Name = r.Project
			r.Short = cmpOr(a.Title, r.Project)
			r.Doing = "asks you: " + cmpOr(last, "waiting for your answer")
			r.Ask = strings.TrimSpace(strings.TrimPrefix(a.LastAction, "says: "))
			r.Since = shortAge(idle)
		default:
			r.Group, r.State = gRunning, "working"
			if a.State == "idle" {
				r.State = "idle"
			}
			r.Name = r.Project
			r.Short = cmpOr(a.Title, r.Project)
			r.Doing = cmpOr(a.Title, last)
			r.Since = shortAge(now.Sub(started))
		}
		r.Meta = a.Account + " · " + tokensK(a.ContextTokens) + " tokens · " + shortAge(now.Sub(started))
		if !started.IsZero() {
			r.Started = started
		}
		r.Quiet = now.Add(-idle)
		for _, e := range a.Recent {
			if t, ok := parseTime(e.TS); ok {
				r.Tail = append(r.Tail, tailLine{At: clock(t), Text: e.Action})
			}
		}
		// recent is newest first in crow-runs; the tail reads oldest first.
		for i, j := 0, len(r.Tail)-1; i < j; i, j = i+1, j-1 {
			r.Tail[i], r.Tail[j] = r.Tail[j], r.Tail[i]
		}
		rows = append(rows, r)
	}
	for _, s := range intr {
		if s.Relaunched != nil {
			continue
		}
		t, ok := parseTime(s.LastEvent)
		if !ok || !sameDay(t, now) {
			continue
		}
		resets := ""
		if s.ResetsAt > 0 {
			resets = "back " + clock(time.Unix(s.ResetsAt, 0))
		}
		name := cmpOr(reg.shortName(s.Project), "session")
		rows = append(rows, agentRow{
			Group: gRuns, State: "waiting", Name: name, Short: name + " " + short4(s.ID), Account: s.Account,
			Doing: "paused on " + limitName(s.Limit) + ", " + resets + ", R relaunch", Since: shortAge(now.Sub(t)),
			Session: s.ID, Cwd: s.Cwd, Interrupted: true, Meta: s.Account + " · " + limitName(s.Limit),
			Tail: []tailLine{{At: clock(t), Text: "stopped on the " + limitName(s.Limit)}, {At: "", Text: resets + " (R relaunches it on another account)"}},
		})
	}
	for _, f := range runs.Finished {
		t, ok := parseTime(f.EndedAt)
		if !ok || !sameDay(t, now) {
			continue
		}
		name := reg.shortName(f.Project)
		doing := "finished: " + cmpOr(f.Label, "run")
		if n := len(f.Commits); n > 0 {
			doing += fmt.Sprintf(", %d %s", n, plural(n, "commit", "commits"))
		}
		meta := f.Status + " · " + shortAge(time.Duration(f.DurationS)*time.Second)
		tail := []tailLine{{At: clock(t), Text: doing}}
		if c := runCost(f.CostUSD, f.BudgetUSD); c != "" {
			meta += " · " + c
			tail = append(tail, tailLine{Text: "cost " + c})
		}
		if n := len(f.Denials); n > 0 {
			meta += fmt.Sprintf(" · %d denied", n)
			for _, d := range f.Denials {
				tail = append(tail, tailLine{Text: "denied " + d})
			}
		}
		rows = append(rows, agentRow{
			Group: gDone, State: "done", Name: name, Short: name + " " + cmpOr(f.Label, short4(f.RunID)), Account: "",
			Doing: doing, Since: clock(t), Session: f.RunID, Meta: meta,
			Tail: tail,
		})
	}
	sort.SliceStable(rows, func(i, j int) bool { return rows[i].Group < rows[j].Group })
	return rows
}

func limitName(kind string) string {
	switch kind {
	case "five_hour":
		return "5h limit"
	case "seven_day", "week", "weekly":
		return "weekly limit"
	}
	return "usage limit"
}

func plural(n int, one, many string) string {
	if n == 1 {
		return one
	}
	return many
}

func cmpOr(a, b string) string {
	if a != "" {
		return a
	}
	return b
}

func short4(id string) string {
	if len(id) > 4 {
		return id[:4]
	}
	return id
}

func sameDay(a, b time.Time) bool {
	ay, am, ad := a.Local().Date()
	by, bm, bd := b.Local().Date()
	return ay == by && am == bm && ad == bd
}

// gaugeRows maps cdx limits and the account policy to the Usage gauges; accounts with
// policy never are left out (crow does not use them).
// gaugeRows returns the accounts crow may use, then the tier team accounts (any policy)
// for the compact Pulse line.
func gaugeRows(runs *runsSnap, usage *usageSnap, acct []acctPolicy, now time.Time) (mine, team []gauge) {
	if usage == nil {
		return nil, nil
	}
	policy, tier := map[string]string{}, map[string]string{}
	for _, a := range acct {
		policy[a.Name], tier[a.Name] = a.Policy, a.Tier
	}
	used := map[string]int{}
	slots := 0
	if runs != nil {
		slots = runs.Slots.Max
		for _, a := range runs.Agents {
			if a.Kind == "run" {
				used[a.Account]++
			}
		}
	}
	for _, l := range usage.Limits {
		pol := policy[l.Account]
		if l.Remaining5hPct == nil || pol == "never" && tier[l.Account] != "team" {
			continue
		}
		g := gauge{Account: l.Account, FiveH: *l.Remaining5hPct, Week: -1, Policy: pol, RunsUsed: used[l.Account], RunsMax: slots}
		g.Reset, g.WeekReset = resetTime(l.Reset5hAt), l.ResetWeekAt
		g.ResetAt, g.WeekAt, g.Active = resetAt(l.Reset5hAt, now), resetAt(l.ResetWeekAt, now), l.Active
		g.Empty = emptyClock(l.EmptyAt)
		if l.RemainingWeekPct != nil {
			g.Week = *l.RemainingWeekPct
		}
		if l.Burn5h != nil {
			g.Burn, g.BurnPct = fmt.Sprintf("burn %.0f%%/h", *l.Burn5h), *l.Burn5h
		}
		if tier[l.Account] == "team" {
			team = append(team, g)
		} else {
			mine = append(mine, g)
		}
	}
	return mine, team
}

// resetAt reads a cdx reset such as "Nov 2 17:50" in the year of now; zero when unreadable.
func resetAt(s string, now time.Time) time.Time {
	t, err := time.ParseInLocation("2006 Jan 2 15:04", fmt.Sprintf("%d %s", now.Year(), s), time.Local)
	if err != nil {
		return time.Time{}
	}
	if t.Sub(now) < -180*24*time.Hour { // a January reset seen in December
		t = t.AddDate(1, 0, 0)
	}
	return t
}

// resetTime keeps the clock of a "Oct 29 21:10" reset, whatever the day.
func resetTime(s string) string {
	if i := strings.LastIndex(s, " "); i >= 0 {
		return s[i+1:]
	}
	return s
}

// whoName is the session title without its "project: " prefix; a title that is only a slash
// command or empty falls back to the project name.
func whoName(s usageSession, reg *registry) string { return lanes.Who(s.Title, s.Project, reg) }

// openThreads reads the unchecked "- [ ] date [tag] text → next" lines of open-threads.md
// as the Next list. The "## Me / Crow / Waiting" section sets the actor; a Waiting line
// names its person before a colon. Lines outside a section count as the owner's.
func openThreads(path string, reg *registry) []nextRow {
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()
	var out []nextRow
	section := "me"
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 1<<20), 1<<20)
	for sc.Scan() {
		line := sc.Text()
		if h, ok := strings.CutPrefix(line, "## "); ok {
			switch strings.ToLower(strings.TrimSpace(h)) {
			case "me":
				section = "me"
			case "crow":
				section = "crow"
			case "waiting":
				section = "waiting"
			}
			continue
		}
		rest, ok := strings.CutPrefix(line, "- [ ] ")
		if !ok {
			continue
		}
		fields := strings.SplitN(rest, " ", 3)
		if len(fields) < 3 || !strings.HasPrefix(fields[1], "[") {
			continue
		}
		tag := strings.Trim(fields[1], "[]")
		what, next, _ := strings.Cut(fields[2], " → ")
		what = strings.TrimSpace(what)
		actor := section
		if section == "waiting" {
			actor = "others"
			if who, tail, ok := strings.Cut(what, ": "); ok && who != "" && len(who) <= 20 && !strings.ContainsAny(who, " []") {
				actor, what = who, strings.TrimSpace(tail)
			}
		}
		name, repo := "crow", reg.fullName("crow")
		if tag != "hub" {
			name, repo = reg.shortName(tag), reg.fullName(tag)
		}
		scope := reg.scopeOf(tag)
		if tag == "hub" {
			scope = "personal"
		}
		since := ""
		if _, err := time.Parse("2006-01-02", fields[0]); err == nil {
			since = fields[0]
		}
		why := threadRef.FindString(what)
		if why == "" {
			why = strings.TrimSpace(next)
		}
		out = append(out, nextRow{Project: name, What: what, Perso: scope == "personal",
			Actor: actor, Since: since, Why: why, Repo: repo})
	}
	return out
}

// doneToday reads the "- HH:MM [tag] text" lines of a day's activity, newest first:
// the legacy activity log, then the daily note's CR-0W section. Retro lines are skipped.
func doneToday(legacy, daily string) []doneRow {
	var lines []string
	if b, err := os.ReadFile(legacy); err == nil {
		lines = strings.Split(string(b), "\n")
	}
	if b, err := os.ReadFile(daily); err == nil {
		lines = append(lines, crowSection(string(b))...)
	}
	var out []doneRow
	for _, l := range lines {
		m := doneLine.FindStringSubmatch(l)
		if m == nil || m[2] == "retro" {
			continue
		}
		out = append(out, doneRow{m[1], m[2], strings.TrimSpace(m[3])})
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].When > out[j].When })
	return out
}

// crowSection is the body of the "## CR-0W" heading of a daily note.
func crowSection(text string) []string {
	var out []string
	in := false
	for _, l := range strings.Split(text, "\n") {
		if strings.HasPrefix(l, "## ") {
			in = strings.TrimSpace(l[3:]) == "CR-0W"
			continue
		}
		if in {
			out = append(out, l)
		}
	}
	return out
}

var doneLine = regexp.MustCompile(`^- (\d\d:\d\d) \[([^\]]+)\] (.*)$`)

// threadRef finds the first Logics item, MR/PR or ticket key in a thread line.
var threadRef = regexp.MustCompile(`\b(?:item|req|task)_\d{3}\b|![0-9]+\b|#[0-9]+\b|\b[A-Z][A-Z0-9]+-[0-9]+\b`)

// threadAge is "today" or "Nd" from a YYYY-MM-DD date; "" when the date is unknown.
func threadAge(since string, now time.Time) string {
	t, err := time.ParseInLocation("2006-01-02", since, now.Location())
	if err != nil {
		return ""
	}
	y, m, d := now.Date()
	days := int(time.Date(y, m, d, 0, 0, 0, 0, now.Location()).Sub(t).Hours() / 24)
	if days <= 0 {
		return "today"
	}
	return fmt.Sprintf("%dd", days)
}

// health: identity matches the registry for every repo, cdx answers, worktrees merged.
func healthOf(ls *liveState) health {
	h := health{Identity: true, CDX: ls.runs != nil && ls.err[srcRuns] == ""}
	if ls.reg == nil {
		return h
	}
	for _, p := range ls.reg.Projects {
		if p.Git.Email != "" && ls.reg.Identities[p.Scope] != "" && p.Git.Email != ls.reg.Identities[p.Scope] {
			h.Identity = false
		}
		h.StaleTrees += p.Git.StaleTrees
	}
	return h
}

type liveInput struct {
	Now time.Time
	LS  *liveState
}

// buildFixtures maps the live payloads to what the pages draw. Sources not wired yet keep
// an honest note instead of invented rows.
func buildFixtures(in liveInput) *fixtures {
	ls, now := in.LS, in.Now
	fx := &fixtures{Now: now.Local().Format("Mon 2 Jan 15:04"), Live: true}
	fx.Synced = clock(now)
	state, note := ls.syncState(now)
	fx.SyncNote = note
	fx.Health = healthOf(ls)
	if t, ok := ls.at[srcRuns]; ok {
		fx.Synced = clock(t)
	}
	fx.Agents = agentRows(now, ls.runs, ls.intr, ls.reg)
	if ls.runs != nil {
		fx.Slots = [2]int{ls.runs.Slots.Busy, ls.runs.Slots.Max}
	}
	fx.Gauges, fx.Team = gaugeRows(ls.runs, ls.usage, ls.acct, now)
	fx.Usage = usageViewOf(ls.usage, ls.reg, now)
	var sessions []usageSession
	if ls.usage != nil {
		sessions = ls.usage.Sessions
	}
	fx.Lanes = lanesOf(now, sessions, fx.Agents, fx.Slots, ls.reg)
	fx.LaneGit = ls.git
	fx.Today, fx.Mail = todayRows(ls.today, now.Local())
	fx.Hist = histOf(ls.usage, ls.reg, now)
	if ls.reg != nil {
		fx.Next = openThreads(ls.reg.threadsFile(), ls.reg)
		for i := range fx.Next {
			fx.Next[i].Age = threadAge(fx.Next[i].Since, now.Local())
		}
		day := now.Local().Format("2006-01-02") + ".md"
		daily := ""
		if ls.reg.DailyDir != "" {
			daily = filepath.Join(ls.reg.DailyDir, day)
		}
		fx.Done = doneToday(filepath.Join(ls.reg.StateDir, "activity", day), daily)
		for _, p := range ls.reg.Projects {
			fx.Repos++
			if p.Git.Dirty > 0 {
				fx.Dirty++
			}
			if p.Git.Ahead > 0 {
				fx.Ahead++
			}
		}
	}
	if ls.mrs != nil {
		fx.MRs, fx.Branches, fx.MRsReady = mrOrder(ls.mrs.MRs), ls.mrs.Branches, true
		fx.MRsAwaiting, fx.MRsMine, fx.MRsThreads = mrCounts(fx.MRs)
		fx.Blockers = mrBlockers(now, fx.MRs)
		fx.Decide = mrDecide(now, fx.MRs, ls.reg)
		for _, name := range []string{"gitlab", "github"} {
			if st := ls.mrs.Forges[name]; st != "" && st != "ok" {
				fx.ForgeErrs = append(fx.ForgeErrs, st)
			}
		}
	}
	fx.Decide = append(fx.Decide, checkDecide(ls.checks, now.Local())...)
	fx.Cards = projectCardsOf(now, ls.reg, fx.Agents, fx.Next, fx.MRs)
	fx.Projects = homeProjects(now, ls.reg, fx.Cards)
	fx.MRDetails, fx.MRErrs = map[string]*mrDetail{}, map[string]string{}
	for k, e := range ls.details {
		if e.d != nil {
			fx.MRDetails[k] = e.d
		}
		if e.err != "" {
			fx.MRErrs[k] = e.err
		}
	}
	fx.Rel = ls.rel
	if blocked, until := noTokens(ls.rel, now); blocked {
		fx.NoModel, fx.NoModelUntil = noModelRows(fx.Decide, ls.reg, fx.Agents), until
		fx.Decide = nil
	}
	fx.Sync = state
	return fx
}

// threadsFile is the open threads note: the registry's threads_file, else the legacy state dir file.
func (r registry) threadsFile() string {
	if r.ThreadsFile != "" {
		return r.ThreadsFile
	}
	return filepath.Join(r.StateDir, "open-threads.md")
}
