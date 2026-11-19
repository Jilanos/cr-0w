package contract

// Ops is GET /api/state/ops (item_257): the lanes of one day or one ISO week, the queue,
// and totals per project and per kind. The totals are the sums of the lanes.
type Ops struct {
	Day    string      `json:"day,omitempty"`  // YYYY-MM-DD, set for ?day
	Week   string      `json:"week,omitempty"` // YYYY-Www, set for ?week
	Days   []string    `json:"days"`           // the days covered, oldest first
	Lanes  []OpsLane   `json:"lanes"`
	Queue  []OpsQueued `json:"queue"`
	Totals []OpsTotal  `json:"totals"`
}

// OpsLane is one session, or a set of same-titled runs, across one day.
type OpsLane struct {
	ID      string    `json:"id"`  // session id, or the run id of the live run
	Day     string    `json:"day"` // YYYY-MM-DD
	Project string    `json:"project"`
	Account string    `json:"account"`
	Kind    string    `json:"kind"` // OpsKinds
	Title   string    `json:"title"`
	Model   string    `json:"model,omitempty"`
	State   string    `json:"state"`    // OpsLaneStates: state at the end of the day, or now
	Spans   []OpsSpan `json:"spans"`    // oldest first, inside the day
	Keys    []string  `json:"keys"`     // session and run ids folded into the lane
	ActiveS int64     `json:"active_s"` // seconds in working, stuck, failed and done spans
	WaitS   int64     `json:"wait_s"`   // seconds in waiting spans
	CostUSD float64   `json:"cost_usd"`
	Tokens  int       `json:"tokens"`
	Commits int       `json:"commits"`
	Runs    int       `json:"runs"` // runs or sessions folded into the lane
}

// OpsSpan is one stretch of a lane in one state.
type OpsSpan struct {
	State string `json:"state"` // OpsSpanStates
	Start string `json:"start"` // RFC 3339
	End   string `json:"end"`   // RFC 3339
}

// OpsQueued is one piece of work waiting to start.
type OpsQueued struct {
	Kind    string `json:"kind"` // mission, routine, afk
	ID      string `json:"id"`
	Project string `json:"project,omitempty"`
	Title   string `json:"title"`
	Next    string `json:"next,omitempty"` // routines: next start, RFC 3339
}

// OpsTotal sums the lanes of one project or one kind.
type OpsTotal struct {
	By      string  `json:"by"` // project or kind
	Name    string  `json:"name"`
	Lanes   int     `json:"lanes"`
	ActiveS int64   `json:"active_s"`
	WaitS   int64   `json:"wait_s"`
	Stuck   int     `json:"stuck"`  // lanes with a stuck span
	Failed  int     `json:"failed"` // lanes with a failed span
	CostUSD float64 `json:"cost_usd"`
	Tokens  int     `json:"tokens"`
}

// Ops lane kinds, span states and lane states.
var (
	OpsKinds      = []string{"interactive", "run", "mission", "routine"}
	OpsSpanStates = []string{"working", "waiting", "idle", "stuck", "failed", "done"}
	OpsLaneStates = []string{"needs", "working", "idle", "run", "paused", "done", "stuck", "failed"}
)
