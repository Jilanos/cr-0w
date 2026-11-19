package contract

import (
	"encoding/json"
	"fmt"
)

// Mission is the mission record of adr_001, as printed by crow mission list/show --json.
type Mission struct {
	ID         string   `json:"id"`
	Kind       string   `json:"kind"`
	Batch      *string  `json:"batch"`
	Scope      string   `json:"scope"`
	DataClass  string   `json:"data_class"`
	Project    string   `json:"project"`
	Goal       string   `json:"goal"`
	EndState   string   `json:"end_state"`
	Autonomy   string   `json:"autonomy"`
	Gates      []string `json:"gates"`
	State      string   `json:"state"`
	Runs       []Run    `json:"runs"`
	Version    int      `json:"version"`
	Validation *string  `json:"validation"`
	FileScope  []string `json:"file_scope"`
	Budget     Budget   `json:"budget"`
	Branch     *string  `json:"branch"`
	Worktree   *string  `json:"worktree"`
	MR         *string  `json:"mr"`
	Created    string   `json:"created"`
	Updated    string   `json:"updated"`
	// Linked marks a mission grouping a handoff or a dispatch, with no core run of its
	// own. Only the missions section sets it.
	Linked bool `json:"linked,omitempty"`
}

// Mission states, in lifecycle order.
var States = []string{"preflight", "queued", "running", "waiting", "review", "publishing", "done", "failed", "cancelled"}

// Moves lists the legal state moves of adr_001. waiting and review are parked: an answer
// sends them back to queued for a resume (item_135). done reopens (`dig` on an FYI
// report) and failed retries, both through queued. queued parks on waiting when core asks
// the owner at the resume cap (item_135). cancelled is final.
var Moves = map[string][]string{
	"preflight":  {"queued", "cancelled"},
	"queued":     {"running", "waiting", "failed", "cancelled"},
	"running":    {"waiting", "review", "done", "failed", "cancelled"},
	"waiting":    {"queued", "running", "failed", "cancelled"},
	"review":     {"queued", "running", "publishing", "done", "cancelled"},
	"publishing": {"done", "failed"},
	"done":       {"queued"},
	"failed":     {"queued", "cancelled"},
	"cancelled":  {},
}

// CanMove reports whether a mission in state from may move to state to.
func CanMove(from, to string) bool {
	for _, s := range Moves[from] {
		if s == to {
			return true
		}
	}
	return false
}

type Budget struct {
	TimeMin   int     `json:"time_min"`
	BudgetUSD float64 `json:"budget_usd"`
	Resumes   int     `json:"resumes"`
}

// Run is one cdx run of a mission. Ended, Cause and Exit are nil while it is live.
type Run struct {
	Run     string  `json:"run"`
	Mission string  `json:"mission"`
	Account string  `json:"account"`
	Version int     `json:"version"`
	Cold    bool    `json:"cold"`
	Started string  `json:"started"`
	Ended   *string `json:"ended"`
	Cause   *string `json:"cause"`
	Exit    *int    `json:"exit"`
}

// InboxItem is one row the owner answers: a version file at a gate or a parked question.
type InboxItem struct {
	ID        string   `json:"id"`
	Mission   string   `json:"mission"`
	Kind      string   `json:"kind"`
	Project   string   `json:"project"`
	Type      string   `json:"type"`
	Source    string   `json:"source"`
	Version   int      `json:"version"`
	File      string   `json:"file"`
	Ask       string   `json:"ask"`
	Verbs     []string `json:"verbs"`
	Blocking  bool     `json:"blocking"`
	Artifacts []string `json:"artifacts"`
	State     string   `json:"state"`
	Created   string   `json:"created"`
	Answered  *string  `json:"answered"`
}

// Event is one line of missions/<id>/events.jsonl.
type Event struct {
	TS      string          `json:"ts"`
	Mission string          `json:"mission"`
	Type    string          `json:"type"`
	Actor   string          `json:"actor"`
	Data    json.RawMessage `json:"data"`
}

type CreatedData struct {
	Kind      string    `json:"kind"`
	Key       string    `json:"key"`
	Surface   string    `json:"surface"`
	Project   *string   `json:"project,omitempty"`
	Scope     *string   `json:"scope,omitempty"`
	DataClass *string   `json:"data_class,omitempty"`
	Goal      *string   `json:"goal,omitempty"`
	EndState  *string   `json:"end_state,omitempty"`
	Autonomy  *string   `json:"autonomy,omitempty"`
	Gates     *[]string `json:"gates,omitempty"`
	Budget    *Budget   `json:"budget,omitempty"`
	FileScope *[]string `json:"file_scope,omitempty"`
	Batch     *string   `json:"batch,omitempty"`
}

type StateData struct {
	From   string  `json:"from"`
	To     string  `json:"to"`
	Reason *string `json:"reason,omitempty"`
}

type RunStartData struct {
	Run          string  `json:"run"`
	Account      *string `json:"account,omitempty"`
	AccountClass string  `json:"account_class"`
	Cold         bool    `json:"cold"`
	Version      int     `json:"version"`
	ResumeOf     *string `json:"resume_of,omitempty"`
}

type RunEndData struct {
	Run   string  `json:"run"`
	Cause string  `json:"cause"`
	Exit  *int    `json:"exit,omitempty"`
	File  *string `json:"file,omitempty"`
}

type GateData struct {
	File    string `json:"file"`
	Verdict string `json:"verdict"`
}

type QuestionData struct {
	File    string   `json:"file"`
	Version int      `json:"version"`
	IDs     []string `json:"ids"`
}

type AnswerData struct {
	File    string  `json:"file"`
	Verb    string  `json:"verb"`
	Surface *string `json:"surface,omitempty"`
	Item    *string `json:"item,omitempty"`
}

// ValidationData is the data of a validation or validation_dropped event (req_037).
type ValidationData struct {
	File          string  `json:"file"`
	Version       int     `json:"version"`
	Verb          string  `json:"verb"`
	Action        string  `json:"action"`
	Target        string  `json:"target"`
	PayloadSHA256 string  `json:"payload_sha256"`
	OwnerEvent    string  `json:"owner_event"`
	PrevSHA256    string  `json:"prev_sha256"`
	Surface       string  `json:"surface"`
	DroppedBy     *string `json:"dropped_by,omitempty"`
}

type PublishData struct {
	Action       string  `json:"action"`
	Result       string  `json:"result"`
	ValidationTS string  `json:"validation_ts"`
	Detail       *string `json:"detail,omitempty"`
}

// ActionData is an owner action without a file of its own (item_147): stop or cancel a
// mission, hide an inbox row. It records where the owner acted.
type ActionData struct {
	Action  string  `json:"action"`
	Surface string  `json:"surface"`
	Item    *string `json:"item,omitempty"`
	Run     *string `json:"run,omitempty"`
	Reason  *string `json:"reason,omitempty"`
}

type IncidentData struct {
	Cause  string  `json:"cause"`
	Detail *string `json:"detail,omitempty"`
}

// EventTypes maps each event type to a constructor of its data struct.
var EventTypes = map[string]func() any{
	"created":            func() any { return &CreatedData{} },
	"state":              func() any { return &StateData{} },
	"run_start":          func() any { return &RunStartData{} },
	"run_end":            func() any { return &RunEndData{} },
	"gate":               func() any { return &GateData{} },
	"question":           func() any { return &QuestionData{} },
	"answer":             func() any { return &AnswerData{} },
	"validation":         func() any { return &ValidationData{} },
	"validation_dropped": func() any { return &ValidationData{} },
	"publish":            func() any { return &PublishData{} },
	"incident":           func() any { return &IncidentData{} },
	"action":             func() any { return &ActionData{} },
}

// DecodeEventData decodes the data of an event into the struct of its type.
func DecodeEventData(e Event) (any, error) {
	mk, ok := EventTypes[e.Type]
	if !ok {
		return nil, fmt.Errorf("unknown event type: %s", e.Type)
	}
	v := mk()
	if err := Decode(e.Data, v); err != nil {
		return nil, fmt.Errorf("%s data: %w", e.Type, err)
	}
	return v, nil
}
