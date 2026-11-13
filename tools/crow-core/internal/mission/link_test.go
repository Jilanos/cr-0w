package mission

import (
	"errors"
	"regexp"
	"slices"
	"testing"
	"time"
)

// keyPattern is the slug branch of the build kind key pattern.
var keyPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{2,40}$`)

// item_203 AC1: a handoff with an end state creates one linked mission, running with no
// core run; a second handoff for the same Logics ref reuses it, even on another day.
func TestEnsureCreatesThenReusesByLogicsRef(t *testing.T) {
	env, root := newEnv(t)
	m, created, err := env.Ensure(Link{Project: "dm", Logics: "item_203_missions_created_automatically", EndState: "Commits on the branch.", Goal: "Missions auto"})
	if err != nil {
		t.Fatal(err)
	}
	if !created || m.ID != "20261109-build-demo-item-203" || m.Project != "demo" || m.Kind != LinkKind {
		t.Fatalf("created=%v mission=%+v", created, m)
	}
	if m.State != "running" || len(m.Runs) != 0 || len(m.Gates) != 0 || m.Goal != "Missions auto" {
		t.Errorf("mission = %+v", m)
	}
	if got := events(t, root, m.ID); !slices.Equal(got, []string{"created", "state", "state"}) {
		t.Errorf("events = %v", got)
	}

	later := env.Now().Add(48 * time.Hour)
	env.Now = func() time.Time { return later }
	again, created, err := env.Ensure(Link{Project: "demo", Logics: "item_203", EndState: "Another end state.", Goal: "Second handoff"})
	if err != nil {
		t.Fatal(err)
	}
	if created || again.ID != m.ID {
		t.Errorf("second handoff: created=%v id=%s, want reuse of %s", created, again.ID, m.ID)
	}
	ms, _ := env.List()
	if len(ms) != 1 {
		t.Errorf("missions = %d, want 1", len(ms))
	}
}

// Without a Logics ref the end state is the key: the same end state reuses, another one
// creates a second mission. The same ref in another project is another mission.
func TestEnsureKeysOnEndStateWithoutRef(t *testing.T) {
	env, _ := newEnv(t)
	a, _, err := env.Ensure(Link{Project: "demo", EndState: "Commit and push after my OK."})
	if err != nil {
		t.Fatal(err)
	}
	b, created, _ := env.Ensure(Link{Project: "demo", EndState: "  commit and push after my  OK. "})
	if created || b.ID != a.ID {
		t.Errorf("same end state: created=%v %s vs %s", created, b.ID, a.ID)
	}
	c, created, _ := env.Ensure(Link{Project: "demo", EndState: "Open the MR."})
	if !created || c.ID == a.ID {
		t.Errorf("other end state reused %s", a.ID)
	}
	d, created, _ := env.Ensure(Link{Project: "shop", Logics: "CD-503", EndState: "x"})
	e, created2, _ := env.Ensure(Link{Project: "demo", Logics: "CD-503", EndState: "x"})
	if !created || !created2 || d.ID == e.ID {
		t.Errorf("CD-503 across projects: %s %s", d.ID, e.ID)
	}
	if a.Goal != "Commit and push after my OK." {
		t.Errorf("goal defaults to the end state: %q", a.Goal)
	}
}

// item_203 AC3: no end state, no mission.
func TestEnsureRefusesWithoutEndState(t *testing.T) {
	env, root := newEnv(t)
	_, _, err := env.Ensure(Link{Project: "demo", Logics: "item_203", EndState: "  "})
	if !errors.Is(err, ErrInvalid) {
		t.Fatalf("err = %v", err)
	}
	if ms, _ := env.List(); len(ms) != 0 {
		t.Errorf("missions = %v under %s", ms, root)
	}
}

// A cancelled linked mission is not reused.
func TestEnsureSkipsCancelled(t *testing.T) {
	env, _ := newEnv(t)
	m, _, _ := env.Ensure(Link{Project: "demo", Logics: "req_060_nest_deck", EndState: "x"})
	if m.ID != "20261109-build-demo-req-060" {
		t.Errorf("id = %s", m.ID)
	}
	if _, err := env.Cancel(m.ID, "", "cli", func(string) {}); err != nil {
		t.Fatal(err)
	}
	later := env.Now().Add(24 * time.Hour)
	env.Now = func() time.Time { return later }
	n, created, err := env.Ensure(Link{Project: "demo", Logics: "req_060", EndState: "x"})
	if err != nil || !created || n.ID == m.ID {
		t.Errorf("after cancel: created=%v id=%s err=%v", created, n.ID, err)
	}
}

// The tick neither starts nor finishes a linked mission.
func TestTickLeavesLinkedMissionAlone(t *testing.T) {
	env, root := newEnv(t)
	m, _, _ := env.Ensure(Link{Project: "demo", Logics: "item_203", EndState: "x"})
	r := &fakeRunner{}
	rep, err := env.Tick(r, 2)
	if err != nil {
		t.Fatal(err)
	}
	if len(r.dispatched) != 0 || len(rep.Started)+len(rep.Finished)+len(rep.Held) != 0 {
		t.Errorf("tick touched the linked mission: %+v %+v", rep, r.dispatched)
	}
	if got := show(t, env, m.ID); got.State != "running" || len(events(t, root, m.ID)) != 3 {
		t.Errorf("mission = %+v", got)
	}
}

func TestLinkKey(t *testing.T) {
	for in, want := range map[string]string{
		"item_203_missions_created": "cr-0w-item-203", "item_203": "cr-0w-item-203", "CD-503": "cr-0w-cd-503",
		"req_060_nest_deck_track_all_work": "cr-0w-req-060", "task_101_x": "cr-0w-task-101", "My Thing!": "cr-0w-my-thing",
	} {
		if got := LinkKey("cr-0w", in, "e"); got != want {
			t.Errorf("LinkKey(%q) = %q, want %q", in, got, want)
		}
	}
	a, b := LinkKey("demo", "", "Open the MR"), LinkKey("demo", "", "open  the mr")
	if a != b || len(a) != len("demo-es-")+10 {
		t.Errorf("end state keys %q %q", a, b)
	}
	long := LinkKey("a-very-long-project-name-from-the-registry", "a free form reference that runs on and on", "e")
	if len(long) > 40 || !keyPattern.MatchString(long) {
		t.Errorf("long key %q (%d)", long, len(long))
	}
}
