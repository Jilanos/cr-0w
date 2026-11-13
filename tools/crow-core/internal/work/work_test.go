package work

import (
	"bytes"
	"encoding/json"
	"flag"
	"os"
	"path/filepath"
	"testing"
	"time"

	"crow-core/contract"
	"crow-core/internal/testfix"
)

var update = flag.Bool("update", false, "rewrite the work record fixture")

// record is the contract record fixture the feed of testdata/feed.json must match.
var record = filepath.Join(testfix.Repo(), "logics", "specs", "core_contract", "fixtures", "records", "work.json")

var now = time.Date(2026, 11, 13, 12, 0, 0, 0, time.UTC)

// fixture is testdata/feed.json: one body per script section plus missions and inbox.
type fixture struct {
	Projects map[string]any       `json:"projects"`
	Dispatch map[string]any       `json:"dispatch"`
	Sessions map[string]any       `json:"sessions"`
	MRs      map[string]any       `json:"mrs"`
	Missions []contract.Mission   `json:"missions"`
	Inbox    []contract.InboxItem `json:"inbox"`
}

func build(t *testing.T) []contract.WorkItem {
	t.Helper()
	b, err := os.ReadFile("testdata/feed.json")
	if err != nil {
		t.Fatal(err)
	}
	var f fixture
	if err := json.Unmarshal(b, &f); err != nil {
		t.Fatal(err)
	}
	return Build(Input{Projects: f.Projects, Dispatch: f.Dispatch, Sessions: f.Sessions, MRs: f.MRs,
		Missions: f.Missions, Inbox: f.Inbox, Now: now})
}

// TestRecord keeps the contract record fixture equal to the feed (go test -update).
func TestRecord(t *testing.T) {
	got, err := json.MarshalIndent(build(t), "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	got = append(got, '\n')
	if *update {
		if err := os.WriteFile(record, got, 0o644); err != nil {
			t.Fatal(err)
		}
		return
	}
	if !bytes.Equal(got, testfix.Read(t, record)) {
		t.Errorf("feed differs from %s (go test -update to rewrite)", record)
	}
}

func feed(t *testing.T) map[string]contract.WorkItem {
	t.Helper()
	items := build(t)
	out := map[string]contract.WorkItem{}
	for _, it := range items {
		if _, dup := out[it.ID]; dup {
			t.Fatalf("duplicate id %s", it.ID)
		}
		out[it.ID] = it
	}
	for i := 1; i < len(items); i++ {
		if contract.WorkRank(items[i-1].State) > contract.WorkRank(items[i].State) {
			t.Fatalf("not sorted by state: %s before %s", items[i-1].ID, items[i].ID)
		}
	}
	return out
}

func TestEveryKind(t *testing.T) {
	got := map[string]bool{}
	for _, it := range feed(t) {
		got[it.Kind] = true
	}
	for _, k := range contract.WorkKinds {
		if !got[k] {
			t.Errorf("no %s item in the feed", k)
		}
	}
}

func TestItems(t *testing.T) {
	items := feed(t)
	cases := []struct {
		id, project, state, why, mission string
		wait                             int64 // -1: no wait
	}{
		// live session waiting on a prompt, in a hub worktree: needs, project by cwd
		{"session:101", "cr-0w", "needs", "asks Bash", "", 90},
		// live run under a repo worktree, linked to its mission by run id
		{"run:r-live", "platform-api", "working", "", "20261113-build-x", -1},
		// session in no registry path: its own project when known
		{"session:102", "nest-app", "working", "", "", -1},
		// session in no registry path with an unknown project: largest share
		{"session:103", "platform-api", "working", "", "", -1},
		// finished runs: failed and done
		{"run:r-fail", "cr-0w", "failed", "run failed", "", -1},
		{"run:r-done", "cr-0w", "done", "run done", "", -1},
		// parked on a usage limit that resets later
		{"parked:conv-parked", "platform-api", "sleeping", "usage limit", "", -1},
		// review asked of the owner
		{"mr:https://forge/lambda/230", "platform-api", "needs", "review asked", "", 3600},
		// own MR with a red pipeline, linked to its mission by branch
		{"mr:https://forge/lambda/231", "platform-api", "needs", "red pipeline", "20261113-build-x", 600},
		// own MR waiting on review
		{"mr:https://forge/cr-0w/5", "cr-0w", "queued", "waiting on review", "", -1},
		// mission waiting on an inbox answer
		{"mission:20261113-ask", "cr-0w", "needs", "choice", "20261113-ask", 1800},
		// mission running
		{"mission:20261113-build-x", "platform-api", "working", "", "20261113-build-x", -1},
		// queued after a usage limit
		{"mission:20261113-limit", "cr-0w", "sleeping", "", "20261113-limit", -1},
	}
	for _, c := range cases {
		it, ok := items[c.id]
		if !ok {
			t.Errorf("%s: missing", c.id)
			continue
		}
		wait := int64(-1)
		if it.WaitS != nil {
			wait = *it.WaitS
		}
		if it.Project != c.project || it.State != c.state || it.Why != c.why || it.Mission != c.mission || wait != c.wait {
			t.Errorf("%s: got project=%s state=%s why=%q mission=%s wait=%d, want %s %s %q %s %d",
				c.id, it.Project, it.State, it.Why, it.Mission, wait, c.project, c.state, c.why, c.mission, c.wait)
		}
	}
	if it := items["parked:conv-parked"]; it.ResetsAt != "2026-11-13T14:00:00Z" {
		t.Errorf("parked resets_at = %q", it.ResetsAt)
	}
	for _, gone := range []string{
		"parked:conv-reset", // its limit already reset
		"parked:conv-live",  // resumed: a live session holds it
		"mission:20261101-old",
	} {
		if _, ok := items[gone]; ok {
			t.Errorf("%s should not be in the feed", gone)
		}
	}
}

func TestProjectOfCwd(t *testing.T) {
	reg := []Project{
		{Name: "cr-0w", Path: "/p/cr-0w"},
		{Name: "nest", Path: "/p/cr-0w/tools/nest/"},
		{Name: "lambda", Path: "/p/lambda"},
	}
	for cwd, want := range map[string]string{
		"/p/cr-0w":                "cr-0w",
		"/p/cr-0w/bin":            "cr-0w",
		"/p/cr-0w/tools/nest/src": "nest", // longest path wins
		"/p/cr-0w.wt/nest-scope":  "cr-0w",
		"/p/lambda.wt":            "lambda",
		"/p/lambda-old":           "",
		"/p/cr-0w.wtx/a":          "",
		"":                        "",
	} {
		if got := ProjectOfCwd(cwd, reg); got != want {
			t.Errorf("ProjectOfCwd(%q) = %q, want %q", cwd, got, want)
		}
	}
}
