package work

import (
	"testing"

	"crow-core/contract"
)

// Linked missions (item_203): the work a handoff or a dispatch starts carries its mission
// id in the feed, and the mission's state rolls up from that work.

const linkedID = "20261113-build-demo-item-203"

func linkedInput(agents, finished, parked, mrs []any, inbox ...contract.InboxItem) Input {
	return Input{
		Projects: map[string]any{"projects": []any{
			map[string]any{"name": "demo", "short": "dm", "path": "/p/demo"},
		}},
		Dispatch: map[string]any{"agents": agents, "finished": finished},
		Sessions: map[string]any{"sessions": parked},
		MRs:      map[string]any{"mrs": mrs},
		Missions: []contract.Mission{
			{ID: linkedID, Kind: "build", Project: "demo", Goal: "Missions auto", State: "running", Runs: []contract.Run{},
				Created: "2026-11-13T09:00:00Z", Updated: "2026-11-13T09:00:00Z"},
		},
		Inbox: inbox,
		Now:   now,
	}
}

func byID(items []contract.WorkItem) map[string]contract.WorkItem {
	out := map[string]contract.WorkItem{}
	for _, it := range items {
		out[it.ID] = it
	}
	return out
}

// item_203 AC2: the session, run and MR a handoff or a dispatch spawns carry its mission.
func TestLinkedWorkCarriesTheMission(t *testing.T) {
	agents := []any{
		// the handoff session: Mission: line of its note, branch of its transcript
		map[string]any{"kind": "session", "pid": 301.0, "session_id": "s301", "cwd": "/p/demo.wt/m203/sub", "state": "working",
			"mission": linkedID, "branch": "missions-auto", "started_at": "2026-11-13T10:00:00Z"},
		// a second session in the same worktree, opened by hand
		map[string]any{"kind": "session", "pid": 302.0, "session_id": "s302", "cwd": "/p/demo.wt/m203", "state": "working"},
		// a session pointing at a mission that does not exist
		map[string]any{"kind": "session", "pid": 303.0, "session_id": "s303", "cwd": "/p/demo", "state": "working", "mission": "nope"},
		// a live dispatch run with its linked mission
		map[string]any{"kind": "run", "pid": 304.0, "run_id": "r-live", "cwd": "/p/demo.wt/r", "state": "working", "mission": linkedID},
	}
	finished := []any{
		map[string]any{"run_id": "r-done", "project": "demo", "status": "done", "ended_at": "2026-11-13T08:00:00Z", "mission": linkedID},
	}
	parked := []any{
		map[string]any{"conversation_id": "conv-m", "cwd": "/p/elsewhere", "project": "demo", "limit": "five_hour",
			"resets_at": "2026-11-13T14:00:00Z", "mission": linkedID},
	}
	mrs := []any{
		map[string]any{"name": "demo", "url": "https://forge/demo/7", "branch": "missions-auto", "role": "AUTHOR", "pipeline": "passed"},
		map[string]any{"name": "demo", "url": "https://forge/demo/8", "branch": "other", "role": "AUTHOR", "pipeline": "passed"},
		map[string]any{"name": "shop", "url": "https://forge/shop/1", "branch": "missions-auto", "role": "AUTHOR", "pipeline": "passed"},
	}
	items := byID(Build(linkedInput(agents, finished, parked, mrs)))
	for id, want := range map[string]string{
		"session:301":             linkedID, // handoff note
		"session:302":             linkedID, // same worktree
		"session:303":             "",       // unknown mission id
		"run:r-live":              linkedID, // run id
		"run:r-done":              linkedID,
		"parked:conv-m":           linkedID,
		"mr:https://forge/demo/7": linkedID, // branch of the handoff session
		"mr:https://forge/demo/8": "",       // other branch
		"mr:https://forge/shop/1": "",       // same branch, other project
		"mission:" + linkedID:     linkedID,
	} {
		it, ok := items[id]
		if !ok {
			t.Errorf("%s: missing", id)
		} else if it.Mission != want {
			t.Errorf("%s: mission = %q, want %q", id, it.Mission, want)
		}
	}
	// working sessions outrank the parked session, the queued MR and the done run
	if m := items["mission:"+linkedID]; m.State != "working" || m.Why != "session" {
		t.Errorf("mission = %s %q, want working on a session", m.State, m.Why)
	}
}

// item_203 AC3: work started without an end state has no mission and still shows.
func TestUnlinkedWorkStillShows(t *testing.T) {
	agents := []any{
		map[string]any{"kind": "session", "pid": 401.0, "session_id": "s401", "cwd": "/p/demo", "state": "working"},
		map[string]any{"kind": "session", "pid": 402.0, "session_id": "s402", "cwd": "/p/demo", "state": "working", "mission": linkedID},
		map[string]any{"kind": "run", "pid": 403.0, "run_id": "r-plain", "cwd": "/p/demo.wt/plain", "state": "working"},
	}
	in := linkedInput(agents, nil, nil, nil)
	in.Missions = nil
	items := byID(Build(in))
	for _, id := range []string{"session:401", "session:402", "run:r-plain"} {
		if it, ok := items[id]; !ok || it.Mission != "" {
			t.Errorf("%s: present=%v mission=%q", id, ok, it.Mission)
		}
	}
	if len(items) != 3 {
		t.Errorf("feed = %v", items)
	}
}

// Sessions in the repo root never link by cwd; a worktree holding two missions links nothing more.
func TestWorktreeLinkingNeedsOneMission(t *testing.T) {
	agents := []any{
		map[string]any{"kind": "session", "pid": 501.0, "session_id": "s501", "cwd": "/p/demo", "state": "working", "mission": linkedID},
		map[string]any{"kind": "session", "pid": 502.0, "session_id": "s502", "cwd": "/p/demo", "state": "working"},
		map[string]any{"kind": "session", "pid": 503.0, "session_id": "s503", "cwd": "/p/demo.wt/both", "state": "working", "mission": linkedID},
		map[string]any{"kind": "session", "pid": 504.0, "session_id": "s504", "cwd": "/p/demo.wt/both", "state": "working", "mission": "20261113-build-demo-other"},
		map[string]any{"kind": "session", "pid": 505.0, "session_id": "s505", "cwd": "/p/demo.wt/both", "state": "working"},
	}
	in := linkedInput(agents, nil, nil, nil)
	in.Missions = append(in.Missions, contract.Mission{ID: "20261113-build-demo-other", Kind: "build", Project: "demo",
		State: "running", Runs: []contract.Run{}, Updated: "2026-11-13T09:00:00Z"})
	items := byID(Build(in))
	for id, want := range map[string]string{
		"session:502": "", "session:504": "20261113-build-demo-other", "session:505": "",
	} {
		if got := items[id].Mission; got != want {
			t.Errorf("%s: mission = %q, want %q", id, got, want)
		}
	}
}

// A linked mission's state is the most urgent state of its work: failed > needs >
// working > sleeping > queued, done once all of it is done. An inbox ask makes it needs.
func TestLinkedMissionStateRollsUp(t *testing.T) {
	session := func(state string) any {
		return map[string]any{"kind": "session", "pid": 601.0, "session_id": "s601", "cwd": "/p/demo.wt/m", "state": state,
			"mission": linkedID, "last_activity_s": 120.0, "started_at": "2026-11-13T11:00:00Z"}
	}
	run := func(id, status, ended string) any {
		return map[string]any{"run_id": id, "project": "demo", "status": status, "ended_at": ended, "mission": linkedID}
	}
	mr := func(pipeline string) any {
		return map[string]any{"name": "demo", "url": "https://forge/demo/9", "branch": "b", "role": "AUTHOR", "pipeline": pipeline,
			"updated": "2026-11-13T11:00:00Z"}
	}
	runOnB := map[string]any{"kind": "run", "pid": 602.0, "run_id": "r-b", "cwd": "/p/demo.wt/b", "state": "working",
		"mission": linkedID, "branch": "b"}
	ask := contract.InboxItem{ID: "i1", Mission: linkedID, Type: "choice", State: "open", Created: "2026-11-13T11:30:00Z"}
	cases := []struct {
		name              string
		agents, fin, mrs  []any
		inbox             []contract.InboxItem
		state, why, since string
	}{
		{"no work", nil, nil, nil, nil, "done", "no live work", "2026-11-13T09:00:00Z"},
		{"working session", []any{session("working")}, nil, nil, nil, "working", "session", "2026-11-13T11:00:00Z"},
		{"waiting session wins", []any{session("waiting")}, []any{run("r1", "done", "2026-11-13T08:00:00Z")}, nil, nil,
			"needs", "session: waiting on you", "2026-11-13T11:00:00Z"},
		{"failure newer than all work wins", []any{session("waiting")}, []any{run("r1", "failed", "2026-11-13T11:30:00Z")}, nil, nil,
			"failed", "run: run failed", "2026-11-13T11:30:00Z"},
		{"session after a failure wins", []any{session("waiting")}, []any{run("r1", "failed", "2026-11-13T08:00:00Z")}, nil, nil,
			"needs", "session: waiting on you", "2026-11-13T11:00:00Z"},
		{"work before the latest failure ignored", []any{session("working")},
			[]any{run("r1", "failed", "2026-11-13T08:00:00Z"), run("r2", "failed", "2026-11-13T10:00:00Z"), run("r3", "done", "2026-11-13T09:00:00Z")},
			nil, nil, "working", "session", "2026-11-13T11:00:00Z"},
		{"done run after a failure", nil, []any{run("r1", "failed", "2026-11-13T08:00:00Z"), run("r2", "done", "2026-11-13T10:00:00Z")}, nil, nil,
			"done", "run: run done", "2026-11-13T10:00:00Z"},
		{"all done", nil, []any{run("r1", "done", "2026-11-13T08:00:00Z"), run("r2", "done", "2026-11-13T10:00:00Z")}, nil, nil,
			"done", "run: run done", "2026-11-13T10:00:00Z"},
		{"unlinked MR only", nil, nil, []any{mr("running")}, nil, "done", "no live work", "2026-11-13T09:00:00Z"},
		{"run on the MR branch links the MR", []any{runOnB}, nil, []any{mr("failed")}, nil,
			"needs", "mr: red pipeline", "2026-11-13T11:00:00Z"},
		{"inbox ask", []any{session("working")}, nil, nil, []contract.InboxItem{ask}, "needs", "choice", "2026-11-13T09:00:00Z"},
	}
	for _, c := range cases {
		items := byID(Build(linkedInput(c.agents, c.fin, nil, c.mrs, c.inbox...)))
		m, ok := items["mission:"+linkedID]
		if !ok {
			t.Errorf("%s: mission missing", c.name)
			continue
		}
		if m.State != c.state || m.Why != c.why || m.Since != c.since {
			t.Errorf("%s: state=%s why=%q since=%s, want %s %q %s", c.name, m.State, m.Why, m.Since, c.state, c.why, c.since)
		}
	}
}

// A finished run and an open MR on its branch: the mission waits on the MR, not done.
func TestLinkedMissionWaitsOnItsOpenMR(t *testing.T) {
	fin := []any{map[string]any{"run_id": "r1", "project": "demo", "status": "done", "ended_at": "2026-11-13T08:00:00Z",
		"mission": linkedID, "branch": "feat"}}
	mrs := []any{map[string]any{"name": "demo", "url": "https://forge/demo/10", "branch": "feat", "role": "AUTHOR",
		"pipeline": "passed", "updated": "2026-11-13T09:30:00Z"}}
	items := byID(Build(linkedInput(nil, fin, nil, mrs)))
	if mr := items["mr:https://forge/demo/10"]; mr.Mission != linkedID {
		t.Errorf("MR mission = %q", mr.Mission)
	}
	if m := items["mission:"+linkedID]; m.State != "queued" || m.Why != "mr: waiting on review" {
		t.Errorf("mission = %s %q, want queued on the MR", m.State, m.Why)
	}
}

// A done linked mission leaves the feed DoneFor after its last work ended.
func TestDoneLinkedMissionLeaves(t *testing.T) {
	fin := []any{map[string]any{"run_id": "r1", "project": "demo", "status": "done", "ended_at": "2026-11-12T08:00:00Z", "mission": linkedID}}
	items := byID(Build(linkedInput(nil, fin, nil, nil)))
	if _, ok := items["mission:"+linkedID]; ok {
		t.Error("done linked mission older than DoneFor is still in the feed")
	}
}

// A linked mission with no live or pending work reads done and leaves DoneFor after its
// last linked work ended; a parked session past its reset counts as that work.
func TestLinkedMissionWithoutWorkLeaves(t *testing.T) {
	in := linkedInput(nil, nil, nil, nil)
	in.Missions[0].Updated = "2026-11-12T08:00:00Z"
	if _, ok := byID(Build(in))["mission:"+linkedID]; ok {
		t.Error("linked mission with no work for over DoneFor is still in the feed")
	}
	ended := []any{map[string]any{"conversation_id": "conv-old", "cwd": "/p/demo", "limit": "five_hour",
		"resets_at": "2026-11-13T10:00:00Z", "last_event": "2026-11-13T07:00:00Z", "mission": linkedID}}
	in = linkedInput(nil, nil, ended, nil)
	in.Missions[0].Updated = "2026-11-12T08:00:00Z"
	items := byID(Build(in))
	if _, ok := items["parked:conv-old"]; ok {
		t.Error("parked session past its reset is in the feed")
	}
	if m := items["mission:"+linkedID]; m.State != "done" || m.Since != "2026-11-13T07:00:00Z" {
		t.Errorf("mission = %s since %s, want done since the session ended", m.State, m.Since)
	}
}

func TestIsLinked(t *testing.T) {
	for _, c := range []struct {
		m    contract.Mission
		want bool
	}{
		{contract.Mission{Kind: "build", State: "running"}, true},
		{contract.Mission{Kind: "build", State: "running", Runs: []contract.Run{{Run: "r"}}}, false}, // core runs it
		{contract.Mission{Kind: "build", State: "queued"}, false},
		{contract.Mission{Kind: "research", State: "running"}, false},
	} {
		if got := IsLinked(c.m); got != c.want {
			t.Errorf("IsLinked(%+v) = %v", c.m, got)
		}
	}
}

func TestWorktreeOf(t *testing.T) {
	for cwd, want := range map[string]string{
		"/p/demo.wt/m203":       "/p/demo.wt/m203",
		"/p/demo.wt/m203/sub/x": "/p/demo.wt/m203",
		"/p/demo":               "",
		"/p/demo.wt":            "",
		"/p/demo.wt/":           "",
		"/p/.wt/x":              "",
		"":                      "",
	} {
		if got := worktreeOf(cwd); got != want {
			t.Errorf("worktreeOf(%q) = %q, want %q", cwd, got, want)
		}
	}
}
