package contract

// WorkItem is one row of the core work feed (item_202): every piece of work core can see,
// whatever made it, in one shape. Nest and the deck read GET /api/state/work instead of
// joining sessions, runs, parked sessions, MRs and missions themselves.
type WorkItem struct {
	ID      string `json:"id"`      // <kind>:<source id>, stable while the source lives
	Kind    string `json:"kind"`    // WorkKinds
	Project string `json:"project"` // registry name when matched, else the source's own name
	State   string `json:"state"`   // WorkStates
	Title   string `json:"title"`
	// Since is when the work started (or last changed for MRs and missions), RFC 3339.
	Since string `json:"since,omitempty"`
	// WaitS is how long a needs item has waited on the owner, in seconds.
	WaitS *int64 `json:"wait_s,omitempty"`
	// ResetsAt is when a sleeping item's usage limit resets, RFC 3339.
	ResetsAt string `json:"resets_at,omitempty"`
	// Why says what makes the state, in a few words (waiting on a prompt, red pipeline).
	Why     string     `json:"why,omitempty"`
	Mission string     `json:"mission,omitempty"` // mission id when the work belongs to one
	Source  WorkSource `json:"source"`
}

// WorkSource points back at the row a work item comes from: the section and its key there.
type WorkSource struct {
	Section string `json:"section"` // dispatch, sessions, mrs, missions
	Ref     string `json:"ref"`     // pid, run id, conversation id, MR url, mission id
}

// Work kinds.
const (
	WorkSession = "session"
	WorkRun     = "run"
	WorkParked  = "parked"
	WorkMR      = "mr"
	WorkMission = "mission"
)

var WorkKinds = []string{WorkSession, WorkRun, WorkParked, WorkMR, WorkMission}

// Work states, most urgent first (the Nest planet order of item_199).
var WorkStates = []string{"failed", "needs", "working", "sleeping", "queued", "done"}

// WorkRank orders states for sorting: lower is more urgent.
func WorkRank(state string) int {
	for i, s := range WorkStates {
		if s == state {
			return i
		}
	}
	return len(WorkStates)
}
