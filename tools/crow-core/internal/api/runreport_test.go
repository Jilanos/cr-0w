package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"testing"

	"crow-core/contract"
)

func runAnswer(t *testing.T, s *Server, id string) (int, contract.RunReport) {
	t.Helper()
	w := do(t, s, call{path: "/api/runs/" + id})
	var d contract.RunReport
	if w.Code == http.StatusOK {
		if err := json.Unmarshal(w.Body.Bytes(), &d); err != nil {
			t.Fatalf("%v: %s", err, w.Body)
		}
	}
	return w.Code, d
}

// A crow-runs run reads its ledger record, the dispatch section and its final message;
// a prefix of six or more matches one run; a mission run comes from the store; an
// unknown id is 404.
func TestRunReport(t *testing.T) {
	s, _ := newServer(t)
	var asked [][]string
	s.o.Script = func(_ []string, name string, args ...string) ([]byte, error) {
		asked = append(asked, append([]string{name}, args...))
		if args[1] == "run_id" {
			return []byte("Done. Two commits.\n"), nil
		}
		return nil, errors.New("no stdout")
	}
	code, d := runAnswer(t, s, "run_id")
	if code != 200 || d.Source != "dispatch" || d.Status != "status" || d.Report != "Done. Two commits." ||
		d.Item == nil || *d.Item != "item_001_x" || d.Ended == nil {
		t.Fatalf("%d %+v", code, d)
	}
	if !slices.Equal(asked[0], []string{"crow-runs", "final", "run_id"}) {
		t.Errorf("script calls %q", asked)
	}
	code, d = runAnswer(t, s, "9f8e7d")
	if code != 200 || d.Run != "9f8e7d6c5b4a" || d.Status != "unknown" || d.Report != "" || d.Worktree != nil {
		t.Fatalf("prefix: %d %+v", code, d)
	}
	if code, _ = runAnswer(t, s, "9f8e7"); code != 404 {
		t.Errorf("short prefix: %d", code)
	}
	code, d = runAnswer(t, s, "a1b2c3d4")
	if code != 200 || d.Source != "mission" || d.Mission == nil || d.Label == "" || d.Status != "done" {
		t.Fatalf("mission run: %d %+v", code, d)
	}
	f, err := os.OpenFile(filepath.Join(s.o.StateDir, RunsLedger), os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		t.Fatal(err)
	}
	f.WriteString(`{"run_id":"9f8e7d000000","project":"crow"}` + "\n")
	f.Close()
	if code, _ = runAnswer(t, s, "9f8e7d"); code != 400 {
		t.Errorf("ambiguous prefix: %d", code)
	}
}
