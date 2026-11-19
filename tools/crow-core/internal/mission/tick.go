package mission

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"time"

	"crow-core/contract"
	"crow-core/internal/brief"
)

// LivePhase is the highest kind phase the tick starts (README phases: 1 = design, plan,
// research and review; 2 = review-fix and write; 3 = build and repair).
const LivePhase = 1

// NewLive creates a mission the tick starts. A kind above LivePhase is refused before
// anything is written. Linked missions (Ensure) use New: the tick never runs them.
func (env Env) NewLive(s Spec) (contract.Mission, error) {
	if k, err := env.Kinds(s.Kind); err == nil && k != nil && k.Phase > LivePhase {
		return contract.Mission{}, failf(ErrInvalid, "kind %s is phase %d; not started by the tick yet", k.Name, k.Phase)
	}
	return env.New(s)
}

// Dispatch is one `crow-runs dispatch` call for a mission run.
type Dispatch struct {
	Mission, Project, Label, PromptFile string
	Kind                                string // crow-runs run kind: task or review
	Model, Power                        string
	Permission                          string // "review" for a plan-mode run, else empty
	WriteDir                            string // the mission folder: the run may edit only there besides its kind's rights
	BudgetUSD                           float64
	TimeoutMin                          int
	ContinueRun                         string // cdx --continue-run of this run (same account and sandbox)
	Resumes                             string // a cold run that resumes this run (crow-runs ledger chain)
}

// Started is what crow-runs reports for a dispatched run.
type Started struct {
	RunID, Account string
}

// DispatchError is a dispatch crow-runs refused; nothing started.
type DispatchError struct {
	Code, Message string
}

func (e *DispatchError) Error() string { return e.Code + ": " + e.Message }

// RunState is what `crow-runs state` reports of a run.
type RunState struct {
	RunID    string  `json:"run_id"`
	Ended    bool    `json:"ended"`
	State    string  `json:"state"` // done, stopped, budget, stuck, limit, failed
	ExitCode *int    `json:"exit_code"`
	Policy   *Policy `json:"policy"`
}

// Policy is the item_115 choice for a run cut by a usage limit.
type Policy struct {
	Choice string `json:"choice"` // wait or move
	Reason string `json:"reason"`
}

// Runner starts runs and reads their end. The engine's crow-runs implements it.
type Runner interface {
	Dispatch(Dispatch) (Started, error)
	State(run string) (RunState, error)
}

// TickReport is what one tick did, mission by mission.
type TickReport struct {
	Finished []TickLine `json:"finished"`
	Started  []TickLine `json:"started"`
	Held     []TickLine `json:"held"`
}

// TickLine is one mission the tick touched or left.
type TickLine struct {
	Mission string `json:"mission"`
	Run     string `json:"run,omitempty"`
	State   string `json:"state"`
	Detail  string `json:"detail,omitempty"`
}

// causes maps a crow-runs end state to a run_end cause.
var causes = map[string]string{
	"done": "done", "limit": "usage_limit", "budget": "budget",
	"stuck": "timeout", "stopped": "stopped", "failed": "error",
}

// Tick finishes the mission runs that ended, then admits queued missions oldest first
// while fewer than maxRuns missions run. A dispatch crow-runs refuses leaves the mission
// queued and ends admission for this tick.
func (env Env) Tick(r Runner, maxRuns int) (TickReport, error) {
	rep := TickReport{Finished: []TickLine{}, Started: []TickLine{}, Held: []TickLine{}}
	ms, err := env.List()
	if err != nil {
		return rep, err
	}
	running := 0
	for _, m := range ms {
		if m.State != "running" {
			continue
		}
		line, live, err := env.finish(r, m)
		if err != nil {
			return rep, err
		}
		if live {
			running++
		} else if line != nil {
			rep.Finished = append(rep.Finished, *line)
		}
	}
	queued := slices.DeleteFunc(slices.Clone(ms), func(m contract.Mission) bool { return m.State != "queued" })
	slices.SortStableFunc(queued, func(a, b contract.Mission) int {
		if c := strings.Compare(a.Created, b.Created); c != 0 {
			return c
		}
		return strings.Compare(a.ID, b.ID)
	})
	full := ""
	for _, m := range queued {
		k, err := env.Kinds(m.Kind)
		if err != nil || k == nil {
			rep.Held = append(rep.Held, TickLine{Mission: m.ID, State: m.State, Detail: fmt.Sprintf("kind %s: %v", m.Kind, err)})
			continue
		}
		if k.Phase > LivePhase {
			rep.Held = append(rep.Held, TickLine{Mission: m.ID, State: m.State,
				Detail: fmt.Sprintf("kind %s is phase %d; the live phase is %d", k.Name, k.Phase, LivePhase)})
			continue
		}
		resuming := len(m.Runs) > 0
		if resuming {
			line, err := env.beforeResume(m)
			if err != nil {
				return rep, err
			}
			if line != nil {
				rep.Finished = append(rep.Finished, *line)
				continue
			}
		}
		if full == "" && running >= maxRuns {
			full = fmt.Sprintf("%d of %d runs busy", running, maxRuns)
		}
		if full != "" {
			rep.Held = append(rep.Held, TickLine{Mission: m.ID, State: m.State, Detail: full})
			continue
		}
		var line *TickLine
		if resuming {
			// A run cut by the usage limit resumes on another account or after the reset:
			// its session does not carry over, so it starts cold from the brief.
			prev := lastRun(m)
			cold := prev != nil && prev.Cause != nil && *prev.Cause == "usage_limit"
			line, err = env.resume(r, m, k, cold)
		} else {
			line, err = env.start(r, m, k)
		}
		var de *DispatchError
		if errors.As(err, &de) || (err != nil && line == nil) {
			full = "dispatch refused: " + err.Error()
			rep.Held = append(rep.Held, TickLine{Mission: m.ID, State: m.State, Detail: full})
			continue
		}
		if err != nil {
			return rep, err
		}
		running++
		rep.Started = append(rep.Started, *line)
	}
	return rep, nil
}

// dispatchFor turns a kind into crow-runs flags. A read-only or review permission runs as
// a crow-runs review run: its allowlist keeps the project read only. Every other kind runs
// as a task run. Both may write in the mission folder dir (version file, outbox), so none
// runs in plan mode, which refuses every edit.
func dispatchFor(m contract.Mission, k *contract.Kind, dir, label, prompt string) Dispatch {
	d := Dispatch{
		Mission: m.ID, Project: m.Project, Label: label, PromptFile: prompt, Kind: "task", WriteDir: dir,
		Model: k.Account.Model, Power: k.Effort, BudgetUSD: m.Budget.BudgetUSD, TimeoutMin: m.Budget.TimeMin,
	}
	if k.Permission != nil && (*k.Permission == "read-only" || *k.Permission == "review") {
		d.Kind = "review"
	}
	return d
}

// start writes the brief, dispatches the run, then records running and run_start. A nil
// line with an error means nothing started.
func (env Env) start(r Runner, m contract.Mission, k *contract.Kind) (*TickLine, error) {
	dir, in, err := env.Brief(m.ID)
	if err != nil {
		return nil, err
	}
	if err := brief.Write(dir, in); err != nil {
		return nil, err
	}
	label := in.Key
	if label == "" {
		label = brief.Key(m)
	}
	s, err := r.Dispatch(dispatchFor(m, k, dir, label, filepath.Join(dir, "brief.md")))
	if err != nil {
		return nil, err
	}
	ts := env.Now().Format(time.RFC3339)
	if err := env.append(m.ID, "core", "state", ts, contract.StateData{From: "queued", To: "running"}); err != nil {
		return &TickLine{Mission: m.ID, Run: s.RunID}, err
	}
	sd := contract.RunStartData{Run: s.RunID, AccountClass: m.Scope, Cold: true, Version: m.Version + 1}
	if s.Account != "" {
		sd.Account = &s.Account
	}
	if err := env.append(m.ID, "core", "run_start", ts, sd); err != nil {
		return &TickLine{Mission: m.ID, Run: s.RunID}, err
	}
	return &TickLine{Mission: m.ID, Run: s.RunID, State: "running", Detail: "on " + s.Account}, nil
}

// finish records the end of the live run of a running mission. live is true while the
// run goes on.
func (env Env) finish(r Runner, m contract.Mission) (line *TickLine, live bool, err error) {
	var run *contract.Run
	for i := range m.Runs {
		if m.Runs[i].Ended == nil {
			run = &m.Runs[i]
		}
	}
	if run == nil {
		return nil, false, nil // a running mission without a live run is item_135's to resume
	}
	st, err := r.State(run.Run)
	if err != nil {
		return nil, false, fmt.Errorf("%s: run %s: %w", m.ID, run.Run, err)
	}
	if !st.Ended {
		return nil, true, nil
	}
	cause, ok := causes[st.State]
	if !ok {
		cause = "error"
	}
	ts := env.Now().Format(time.RFC3339)
	end := contract.RunEndData{Run: run.Run, Cause: cause, Exit: st.ExitCode}
	move := func(to, reason string) error {
		sd := contract.StateData{From: "running", To: to}
		if reason != "" {
			sd.Reason = &reason
		}
		return env.append(m.ID, "core", "state", ts, sd)
	}
	incident := func(c, detail string) error {
		return env.append(m.ID, "core", "incident", ts, contract.IncidentData{Cause: c, Detail: &detail})
	}
	out := &TickLine{Mission: m.ID, Run: run.Run}

	if cause == "usage_limit" || cause == "budget" {
		// Parked for item_135: it resumes on the next allowed account or after the reset.
		detail := "run " + run.Run + " cut by " + cause
		if st.Policy != nil {
			detail += "; policy " + st.Policy.Choice + ": " + st.Policy.Reason
		}
		if err := env.append(m.ID, "core", "run_end", ts, end); err != nil {
			return nil, false, err
		}
		if err := incident(cause, detail); err != nil {
			return nil, false, err
		}
		out.State, out.Detail = "waiting", detail
		return out, false, move("waiting", "parked: "+cause)
	}

	dir := filepath.Join(env.Store.Root(), m.ID)
	var caps Caps
	if k, err := env.Kinds(m.Kind); err == nil {
		caps = capsOf(k)
	} else {
		caps = capsOf(nil)
	}
	dropped := func(paths []string) error {
		_, drops := Ingest(dir, paths, caps)
		for _, d := range drops {
			if err := incident(d.Cause, d.Detail); err != nil {
				return err
			}
		}
		return nil
	}

	// A questions file ends the turn: park the mission, the fold puts the questions in
	// the inbox. A bad file is noted and the turn ends as if it were absent.
	q, asked, bad := readQuestions(dir, m.ID, run.Version)
	endRun := func() error {
		if err := env.append(m.ID, "core", "run_end", ts, end); err != nil {
			return err
		}
		if bad != "" {
			return incident("bad_questions", bad)
		}
		return nil
	}
	if asked {
		if err := env.append(m.ID, "core", "run_end", ts, end); err != nil {
			return nil, false, err
		}
		if err := dropped(previews(q)); err != nil {
			return nil, false, err
		}
		ids := make([]string, len(q.Questions))
		for i, x := range q.Questions {
			ids[i] = x.ID
		}
		qd := contract.QuestionData{File: QuestionsFile, Version: q.Version, IDs: ids}
		if err := env.append(m.ID, "run", "question", ts, qd); err != nil {
			return nil, false, err
		}
		out.State, out.Detail = "waiting", fmt.Sprintf("%d question(s): %s", len(ids), strings.Join(ids, " "))
		return out, false, move("waiting", "parked: questions")
	}

	file, cb, why := versionFile(dir, m.ID, run.Version)
	if cb != nil {
		if err := Coverage(dir, m.ID, run.Version, cb); err != nil {
			file, cb, why = "", nil, file+": "+err.Error()
		}
	}
	if cb == nil {
		detail := fmt.Sprintf("run %s ended %s (exit %s): %s", run.Run, cause, exitText(st.ExitCode), why)
		if err := endRun(); err != nil {
			return nil, false, err
		}
		if err := incident("no_version_file", detail); err != nil {
			return nil, false, err
		}
		out.State, out.Detail = "failed", detail
		return out, false, move("failed", "no version file")
	}
	end.File = &file
	if err := endRun(); err != nil {
		return nil, false, err
	}
	if err := dropped(artifactPaths(cb)); err != nil {
		return nil, false, err
	}
	if err := env.append(m.ID, "core", "gate", ts, contract.GateData{File: file, Verdict: cb.Verdict}); err != nil {
		return nil, false, err
	}
	out.Detail = file + " " + cb.Verdict
	if len(m.Gates) == 0 && m.Autonomy == "auto" && cb.Verdict == "ready" {
		out.State = "done"
		return out, false, move("done", "straight-through")
	}
	out.State = "review"
	return out, false, move("review", "")
}

func exitText(p *int) string {
	if p == nil {
		return "unknown"
	}
	return strconv.Itoa(*p)
}

// versionFile finds the plan, report or mockup file of version n in dir and checks its
// crow block names the mission and the version. It returns why when none is valid.
func versionFile(dir, id string, n int) (string, *contract.CrowBlock, string) {
	var why []string
	for _, src := range []string{"report", "plan", "mockup"} {
		name := fmt.Sprintf("%s.v%d.md", src, n)
		b, err := os.ReadFile(filepath.Join(dir, name))
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err != nil {
			why = append(why, name+": "+err.Error())
			continue
		}
		cb, err := contract.ParseCrowBlock(b)
		switch {
		case err != nil:
			why = append(why, name+": "+err.Error())
		case cb.Mission != id:
			why = append(why, fmt.Sprintf("%s: crow block names mission %s", name, cb.Mission))
		case cb.Version != n:
			why = append(why, fmt.Sprintf("%s: crow block says version %d", name, cb.Version))
		default:
			return name, cb, ""
		}
	}
	if len(why) == 0 {
		return "", nil, fmt.Sprintf("no plan, report or mockup v%d", n)
	}
	return "", nil, strings.Join(why, "; ")
}
