package mission

// Linked missions (item_203): `crow handoff` and `crow dispatch` with an end state create
// or reuse a mission that groups the work they start. The work runs in the handoff
// session or the dispatch run, never in a core run: the mission is created straight into
// running with no run, so the tick neither starts nor finishes it. Its feed state comes
// from the work linked to it (internal/work).

import (
	"crypto/sha1"
	"encoding/hex"
	"regexp"
	"strings"
	"time"

	"crow-core/contract"
)

// LinkKind is the kind of a linked mission. Its phase is above the live phase, so the
// tick never dispatches it even while it sits in queued.
const LinkKind = "build"

// LinkReason is the reason of the move to running of a linked mission.
const LinkReason = "linked work"

// Link is what a handoff or a dispatch gives.
type Link struct {
	Project  string // registry name or alias
	Logics   string // Logics ref (item_203_..., req_060, CD-503), optional
	EndState string
	Goal     string // the task or label; the end state when empty
}

var (
	logicsRef = regexp.MustCompile(`^(item|req|task|prod|adr)_([0-9]{3})`)
	keyChars  = regexp.MustCompile(`[^a-z0-9]+`)
)

// LinkKey is the key part of a linked mission id: the project, then the Logics ref when
// given (item_203_... reads item-203, a ticket key reads cd-503), else "es-" and a hash
// of the end state. It fits the build key pattern (a slug of at most 40 characters).
func LinkKey(project, logics, endState string) string {
	ref := strings.TrimSpace(logics)
	if m := logicsRef.FindStringSubmatch(ref); m != nil {
		ref = m[0]
	}
	if ref == "" {
		norm := strings.Join(strings.Fields(strings.ToLower(endState)), " ")
		h := sha1.Sum([]byte(norm))
		ref = "es-" + hex.EncodeToString(h[:])[:10]
	}
	ref = slugAll(ref)
	if len(ref) > 30 {
		ref = strings.TrimRight(ref[:30], "-")
	}
	proj := slugAll(project)
	if room := 39 - len(ref); len(proj) > room {
		proj = strings.TrimRight(proj[:room], "-")
	}
	return strings.Trim(proj+"-"+ref, "-")
}

func slugAll(s string) string {
	return strings.Trim(keyChars.ReplaceAllString(strings.ToLower(s), "-"), "-")
}

// Ensure returns the linked mission of a handoff or a dispatch, created when no mission
// of the project has its key yet. A cancelled mission is never reused. created says
// whether this call made it.
func (env Env) Ensure(l Link) (m contract.Mission, created bool, err error) {
	if strings.TrimSpace(l.EndState) == "" {
		return m, false, failf(ErrInvalid, "a linked mission needs an end state")
	}
	ps, err := LoadProjects(env.Projects)
	if err != nil {
		return m, false, err
	}
	p, err := findProject(ps, l.Project)
	if err != nil {
		return m, false, failf(ErrInvalid, "%v", err)
	}
	key := LinkKey(p.Name, l.Logics, l.EndState)
	ms, err := env.List()
	if err != nil {
		return m, false, err
	}
	tail := "-" + LinkKind + "-" + key // ids are <yyyymmdd><tail>
	for _, x := range ms {
		if x.Project == p.Name && x.Kind == LinkKind && x.State != "cancelled" &&
			strings.HasSuffix(x.ID, tail) && len(x.ID) == 8+len(tail) {
			return x, false, nil
		}
	}
	goal := strings.TrimSpace(l.Goal)
	if goal == "" {
		goal = l.EndState
	}
	none := []string{}
	m, err = env.New(Spec{Kind: LinkKind, Project: p.Name, Goal: goal, EndState: l.EndState, Key: key, Gates: &none})
	if err != nil {
		return m, false, err
	}
	reason := LinkReason
	ts := env.Now().Format(time.RFC3339)
	if err := env.append(m.ID, "core", "state", ts, contract.StateData{From: "queued", To: "running", Reason: &reason}); err != nil {
		return m, true, err
	}
	m, err = env.find(m.ID)
	return m, true, err
}
