package api

import (
	"bufio"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"crow-core/contract"
)

// RunsLedger is the crow-runs ledger under the state dir, one JSON record per dispatch.
const RunsLedger = "runs.jsonl"

// minPrefix is the shortest run id prefix GET /api/runs/{id} matches.
const minPrefix = 6

// ledgerRecord is the part of a crow-runs ledger record the run report reads.
type ledgerRecord struct {
	RunID     string `json:"run_id"`
	Project   string `json:"project"`
	Label     string `json:"label"`
	Cwd       string `json:"cwd"`
	StartedAt string `json:"started_at"`
	Branch    string `json:"branch"`
	Account   string `json:"account"`
	LogicsRef string `json:"logics_ref"`
	Mission   string `json:"mission"`
}

var errAmbiguous = errors.New("run id prefix matches more than one run")

// runReport serves one run: a crow-runs run from its ledger first, then a mission run
// from the core store, 404 when neither knows the id.
func (s *Server) runReport(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	rec, err := s.ledgerRun(id)
	if errors.Is(err, errAmbiguous) {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	if rec != nil {
		d := s.dispatchReport(*rec)
		reply(w, r, hash(d), d)
		return
	}
	d, ok, err := s.missionRunReport(id)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !ok {
		fail(w, http.StatusNotFound, "no run")
		return
	}
	reply(w, r, hash(d), d)
}

// ledgerRun is the last ledger record of the run id, or of the one run whose id starts
// with it. nil when none matches or there is no ledger.
func (s *Server) ledgerRun(id string) (*ledgerRecord, error) {
	if s.o.StateDir == "" || id == "" {
		return nil, nil
	}
	f, err := os.Open(filepath.Join(s.o.StateDir, RunsLedger))
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	defer f.Close()
	var exact *ledgerRecord
	byPrefix := map[string]ledgerRecord{}
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 64<<10), 1<<20)
	for sc.Scan() {
		var x ledgerRecord
		if json.Unmarshal(sc.Bytes(), &x) != nil || x.RunID == "" {
			continue
		}
		switch {
		case x.RunID == id:
			exact = &x
		case len(id) >= minPrefix && strings.HasPrefix(x.RunID, id):
			byPrefix[x.RunID] = x
		}
	}
	if err := sc.Err(); err != nil {
		return nil, err
	}
	if exact != nil {
		return exact, nil
	}
	if len(byPrefix) > 1 {
		return nil, errAmbiguous
	}
	for _, x := range byPrefix {
		return &x, nil
	}
	return nil, nil
}

// dispatchReport fills a ledger run with the dispatch section (live or finished today)
// and the run's final message (crow-runs final, read only).
func (s *Server) dispatchReport(x ledgerRecord) contract.RunReport {
	d := contract.RunReport{Run: x.RunID, Source: "dispatch", Project: x.Project, Label: x.Label, Account: x.Account,
		Status: "unknown", Started: x.StartedAt, Commits: []string{}, Branch: ptr(x.Branch), Worktree: ptr(x.Cwd),
		Item: ptr(x.LogicsRef), Mission: ptr(x.Mission)}
	if e := s.ext["dispatch"]; e != nil {
		m, _ := s.extSection(e, true).Data.(map[string]any)
		for _, a := range rows(m, "agents") {
			if str(a, "run_id") == x.RunID {
				d.Status, d.Commits = "running", lines(a["commits"])
			}
		}
		for _, f := range rows(m, "finished") {
			if str(f, "run_id") != x.RunID {
				continue
			}
			d.Status, d.Ended, d.Commits = str(f, "status"), ptr(str(f, "ended_at")), lines(f["commits"])
			if c, ok := f["cost_usd"].(float64); ok {
				d.CostUSD = &c
			}
			if b := str(f, "branch"); b != "" {
				d.Branch = &b
			}
		}
	}
	if s.o.Script != nil {
		if out, err := s.o.Script(nil, "crow-runs", "final", x.RunID); err == nil {
			d.Report = strings.TrimSpace(string(out))
		}
	}
	return d
}

// missionRunReport is the store's mission run with the id, ok false when none.
func (s *Server) missionRunReport(id string) (contract.RunReport, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.syncStore(); err != nil {
		return contract.RunReport{}, false, err
	}
	runs, _ := s.store.data["runs"].([]contract.Run)
	for _, x := range runs {
		if x.Run != id {
			continue
		}
		d := contract.RunReport{Run: x.Run, Source: "mission", Account: x.Account, Status: "running", Started: x.Started,
			Ended: x.Ended, Commits: []string{}, Mission: ptr(x.Mission)}
		if x.Cause != nil {
			d.Status = *x.Cause
		}
		for _, m := range s.storeMissions() {
			if m.ID == x.Mission {
				d.Project, d.Label, d.Branch, d.Worktree = m.Project, m.Goal, m.Branch, m.Worktree
			}
		}
		return d, true, nil
	}
	return contract.RunReport{}, false, nil
}

func ptr(v string) *string {
	if v == "" {
		return nil
	}
	return &v
}

// lines reads a JSON list of strings, skipping other values.
func lines(v any) []string {
	out := []string{}
	l, _ := v.([]any)
	for _, x := range l {
		if s, ok := x.(string); ok {
			out = append(out, s)
		}
	}
	return out
}
