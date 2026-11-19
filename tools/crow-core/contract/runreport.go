package contract

// RunReport is the data of GET /api/runs/{id}: one crow-runs run from its ledger, or a
// mission run from the core store.
type RunReport struct {
	Run      string   `json:"run"`
	Source   string   `json:"source"` // dispatch or mission
	Project  string   `json:"project"`
	Label    string   `json:"label"`
	Account  string   `json:"account"`
	Status   string   `json:"status"`
	Started  string   `json:"started"`
	Ended    *string  `json:"ended"`
	CostUSD  *float64 `json:"cost_usd"`
	Commits  []string `json:"commits"`
	Branch   *string  `json:"branch"`
	Worktree *string  `json:"worktree"`
	Item     *string  `json:"item"`
	Mission  *string  `json:"mission"`
	Report   string   `json:"report"`
}
