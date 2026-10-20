// crow-watch: live board of crow's agents and Claude usage.
//
// Four views on keys 1-4: Agents (from `crow-runs json`, the same source as
// `crow runs`), Usage, Savings and History (from `crow-usage --json`). Layouts
// adapt to the terminal: stacked on tall or narrow ones, a grid on wide ones;
// boxes size to their content and leftover height goes to more content.
// Colours are the terminal's 16 ANSI slots and no background is painted, so the
// board follows the terminal theme (see theme.go).
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
)

// ---------- data (mirrors crow-runs collect()) ----------

type event struct {
	TS     string `json:"ts"`
	Action string `json:"action"`
}

type agent struct {
	Kind            string   `json:"kind"`
	PID             int      `json:"pid"`
	Account         string   `json:"account"`
	Project         string   `json:"project"`
	Cwd             string   `json:"cwd"`
	SessionID       string   `json:"session_id"`
	State           string   `json:"state"`
	StartedAt       string   `json:"started_at"`
	LastActivityS   int      `json:"last_activity_s"`
	LastAction      string   `json:"last_action"`
	LastPrompt      string   `json:"last_prompt"`
	ContextTokens   int      `json:"context_tokens"`
	SubagentsActive int      `json:"subagents_active"`
	Recent          []event  `json:"recent"`
	RunID           string   `json:"run_id"`
	Label           string   `json:"label"`
	Title           string   `json:"title"`
	Commits         []string `json:"commits"`
}

type finished struct {
	RunID       string   `json:"run_id"`
	Project     string   `json:"project"`
	Label       string   `json:"label"`
	Status      string   `json:"status"`
	DurationS   int      `json:"duration_s"`
	EndedAt     string   `json:"ended_at"`
	ResumedFrom []string `json:"resumed_from"`
	Commits     []string `json:"commits"`
}

type snapshot struct {
	Slots struct {
		Busy int `json:"busy"`
		Max  int `json:"max"`
	} `json:"slots"`
	Agents   []agent    `json:"agents"`
	Finished []finished `json:"finished"`
}

func crowBin(name string) string {
	if h := os.Getenv("CROW_HOME"); h != "" {
		return filepath.Join(h, "bin", name)
	}
	exe, _ := os.Executable()
	return filepath.Join(filepath.Dir(exe), "..", "..", "bin", name)
}

type dataMsg struct {
	snap *snapshot
	err  error
}
type reportMsg struct{ id, text string }
type tickMsg time.Time

func fetch() tea.Msg {
	out, err := exec.Command(crowBin("crow-runs"), "json").Output()
	if err != nil {
		return dataMsg{err: err}
	}
	var s snapshot
	if err := json.Unmarshal(out, &s); err != nil {
		return dataMsg{err: err}
	}
	return dataMsg{snap: &s}
}

func fetchReport(id string) tea.Cmd {
	return func() tea.Msg {
		out, _ := exec.Command(crowBin("crow-runs"), "report", id).Output()
		return reportMsg{id: id, text: strings.TrimSpace(string(out))}
	}
}

func tick() tea.Cmd {
	return tea.Tick(2*time.Second, func(t time.Time) tea.Msg { return tickMsg(t) })
}

// ---------- model ----------

const (
	vAgents = iota
	vUsage
	vSavings
	vHistory
)

var viewNames = []string{"Agents", "Usage", "Savings", "History"}

type item struct {
	key   string
	agent *agent
	fin   *finished
}

type model struct {
	w, h      int
	view      int
	snap      *snapshot
	err       error
	items     []item
	cursor    int
	selKey    string
	detailOff int
	reports   map[string]string
	notice    string
	updated   time.Time
	help      bool

	usage        *usage
	usageErr     error
	usageLoading bool
	uCursor      int
	period       string // d | w | m (Savings, History)
	now          time.Time
}

func (m model) clock() time.Time {
	if !m.now.IsZero() {
		return m.now
	}
	return time.Now()
}

// rebuild orders the agent list: runs, then sessions waiting on you first, then finished runs.
func (m *model) rebuild() {
	m.items = nil
	if m.snap == nil {
		return
	}
	for i := range m.snap.Agents {
		if a := &m.snap.Agents[i]; a.Kind == "run" {
			m.items = append(m.items, item{key: keyOf(a), agent: a})
		}
	}
	var sess []item
	for i := range m.snap.Agents {
		if a := &m.snap.Agents[i]; a.Kind == "session" {
			sess = append(sess, item{key: keyOf(a), agent: a})
		}
	}
	rank := map[string]int{"waiting": 0, "working": 1, "quiet": 2, "idle": 3}
	for i := 1; i < len(sess); i++ { // stable insertion sort: waiting, working, then the rest
		for j := i; j > 0 && rank[sess[j].agent.State] < rank[sess[j-1].agent.State]; j-- {
			sess[j], sess[j-1] = sess[j-1], sess[j]
		}
	}
	m.items = append(m.items, sess...)
	for i := range m.snap.Finished {
		if i >= 8 {
			break
		}
		f := &m.snap.Finished[i]
		m.items = append(m.items, item{key: f.RunID, fin: f})
	}
	m.cursor = 0
	for i, it := range m.items {
		if it.key == m.selKey {
			m.cursor = i
		}
	}
	if len(m.items) > 0 {
		m.selKey = m.items[m.cursor].key
	}
}

func keyOf(a *agent) string {
	if a.RunID != "" {
		return a.RunID
	}
	if a.SessionID != "" {
		return a.SessionID
	}
	return fmt.Sprint(a.PID)
}

func (m model) Init() tea.Cmd { return tea.Batch(fetch, tick(), fetchUsage, usageTick()) }

func (m model) selected() *item {
	if m.cursor < len(m.items) {
		return &m.items[m.cursor]
	}
	return nil
}

func (m model) maybeReport() tea.Cmd {
	if it := m.selected(); it != nil && it.fin != nil {
		if _, ok := m.reports[it.fin.RunID]; !ok {
			return fetchReport(it.fin.RunID)
		}
	}
	return nil
}

func copyID(id string) string {
	if err := exec.Command("wl-copy", id).Run(); err != nil {
		return "wl-copy not available"
	}
	return "copied " + short(id)
}

// openProject opens a new kitty window on the project (crow term, safe from inside Claude).
func openProject(project string) string {
	name := strings.TrimSuffix(project, " (hub)")
	if err := exec.Command(crowBin("crow"), "term", name).Start(); err != nil {
		return "crow term failed: " + err.Error()
	}
	return "opening " + name + " in kitty"
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.w, m.h = msg.Width, msg.Height
	case tickMsg:
		return m, tea.Batch(fetch, tick())
	case dataMsg:
		m.err = msg.err
		if msg.snap != nil {
			m.snap = msg.snap
			m.updated = time.Now()
			m.rebuild()
		}
		return m, m.maybeReport()
	case usageTickMsg:
		if m.usageLoading {
			return m, usageTick()
		}
		m.usageLoading = true
		return m, tea.Batch(fetchUsage, usageTick())
	case usageMsg:
		m.usageLoading, m.usageErr = false, msg.err
		if msg.u != nil {
			m.usage = msg.u
			m.uCursor = max(0, min(m.uCursor, len(m.usage.rows)-1))
		}
	case reportMsg:
		m.reports[msg.id] = msg.text
	case tea.KeyMsg:
		m.notice = ""
		key := msg.String()
		if m.help && key != "q" && key != "ctrl+c" {
			m.help = false
			return m, nil
		}
		switch key {
		case "q", "ctrl+c":
			return m, tea.Quit
		case "esc":
			m.help = false
		case "?":
			m.help = true
		case "1", "2", "3", "4":
			m.view = int(key[0] - '1')
		case "tab":
			m.view = (m.view + 1) % len(viewNames)
		case "shift+tab":
			m.view = (m.view + len(viewNames) - 1) % len(viewNames)
		case "u":
			m.view = map[bool]int{true: vAgents, false: vUsage}[m.view == vUsage]
		case "d", "w", "m":
			m.period = key
		case "r":
			if m.view == vAgents {
				return m, fetch
			}
			if !m.usageLoading {
				m.usageLoading = true
				return m, fetchUsage
			}
		case "c":
			if m.view == vAgents {
				if it := m.selected(); it != nil {
					m.notice = copyID(it.key)
				}
			} else if s := m.usage.selected(m.uCursor); s != nil {
				m.notice = copyID(s.ID)
			}
		case "enter", "o":
			if m.view == vAgents {
				if it := m.selected(); it != nil {
					if it.agent != nil {
						m.notice = openProject(it.agent.Project)
					} else {
						m.notice = openProject(it.fin.Project)
					}
				}
			} else if s := m.usage.selected(m.uCursor); s != nil {
				m.notice = openProject(s.Project)
			}
		case "up", "k":
			if m.view == vAgents {
				if m.cursor > 0 {
					m.cursor--
					m.selKey, m.detailOff = m.items[m.cursor].key, 0
					return m, m.maybeReport()
				}
			} else {
				m.uCursor = max(0, m.uCursor-1)
			}
		case "down", "j":
			if m.view == vAgents {
				if m.cursor < len(m.items)-1 {
					m.cursor++
					m.selKey, m.detailOff = m.items[m.cursor].key, 0
					return m, m.maybeReport()
				}
			} else if m.usage != nil {
				m.uCursor = max(0, min(m.uCursor+1, len(m.usage.rows)-1))
			}
		case "pgup":
			m.detailOff = max(0, m.detailOff-10)
		case "pgdown":
			m.detailOff += 10
		}
	}
	return m, nil
}

func short(id string) string {
	if len(id) > 8 {
		return id[:8]
	}
	return id
}

// ---------- view ----------

func (m model) View() string {
	if m.w == 0 {
		return ""
	}
	head := m.header()
	foot := m.footer()
	bodyH := m.h - 2 - 1 // header + gap, footer
	var body block
	switch {
	case m.help:
		body = m.helpView(bodyH)
	case m.view == vAgents:
		body = m.agentsView(bodyH)
	case m.usage == nil:
		msg := line{{"loading usage…", sSub}}
		if m.usageErr != nil {
			msg = line{{"crow-usage failed: " + m.usageErr.Error(), sErr}}
		}
		body = block{" " + msg.render(m.w-1, false)}
	case m.view == vUsage:
		body = m.usageView(bodyH)
	case m.view == vSavings:
		body = m.savingsView(bodyH)
	default:
		body = m.historyView(bodyH)
	}
	for len(body) < bodyH {
		body = append(body, strings.Repeat(" ", m.w))
	}
	out := append(block{head, strings.Repeat(" ", m.w)}, body[:bodyH]...)
	return strings.Join(append(out, foot), "\n")
}

// header: hub name, the four views (active one as an accent pill), live status on the right.
func (m model) header() string {
	l := line{{" crow ", sAcc}, {"│ ", sDim}}
	for i, n := range viewNames {
		if i == m.view && !m.help {
			l = append(l, seg{" " + n + " ", sTabOn}, seg{" ", sPlain})
		} else {
			l = append(l, seg{fmt.Sprint(i + 1), sDim}, seg{" " + n + "  ", sSub})
		}
	}
	right := m.statusRight()
	gap := m.w - l.width() - right.width() - 1
	if gap < 2 { // narrow: drop the status first
		return l.render(m.w, false)
	}
	return append(append(l, seg{strings.Repeat(" ", gap), sPlain}), right...).render(m.w, false)
}

// statusRight: current account's 5h window, today's spend, attention counts, clock.
func (m model) statusRight() line {
	var l line
	if m.snap != nil {
		waiting := 0
		for _, a := range m.snap.Agents {
			if a.State == "waiting" {
				waiting++
			}
		}
		if waiting > 0 {
			l = append(l, seg{fmt.Sprintf("◆ %d need%s you", waiting, map[bool]string{true: "s", false: ""}[waiting == 1]), st("waiting").style}, seg{"   ", sPlain})
		}
	}
	if u := m.usage; u != nil {
		if c := u.current(); c != nil && c.Remaining5hPct != nil {
			p := *c.Remaining5hPct
			l = append(l, seg{c.Account + " ", sSub})
			l = append(l, lineBar(float64(p), 8, levelStyle(p))...)
			l = append(l, seg{fmt.Sprintf(" %d%%", p), levelStyle(p)}, seg{"  ·  ", sDim})
		}
		l = append(l, seg{money(u.Today.CostUSD), sBold}, seg{" today", sSub}, seg{"  ·  ", sDim})
	}
	t := m.updated
	if t.IsZero() {
		t = m.clock()
	}
	return append(l, seg{t.Format("15:04"), sSub})
}

func (m model) footer() string {
	keys := []string{"1-4", "views", "↑↓", "select", "o", "open", "c", "copy id"}
	switch m.view {
	case vSavings, vHistory:
		keys = []string{"1-4", "views", "d w m", "period"}
	}
	keys = append(keys, "?", "all keys", "q", "quit")
	l := line{{" ", sPlain}}
	for i := 0; i < len(keys); i += 2 {
		l = append(l, seg{keys[i], sAcc}, seg{" " + keys[i+1] + "   ", sSub})
	}
	if m.notice != "" {
		l = append(l, seg{m.notice, sYellow})
	}
	return l.render(m.w, false)
}

func (m model) helpView(h int) block {
	rows := [][2]string{
		{"1 2 3 4", "Agents · Usage · Savings · History"}, {"Tab / Shift+Tab", "next / previous view"}, {"u", "toggle Agents ↔ Usage"},
		{"↑↓  j k", "select an agent or a session"}, {"PgUp PgDn", "scroll the details"}, {"o  Enter", "open the project in a new kitty window"},
		{"c", "copy the run or session id"}, {"d w m", "period: today, 7 days, 30 days (Savings, History)"}, {"r", "refresh now"},
		{"?", "this help (any key closes)"}, {"q", "quit"},
	}
	body := []line{{{"", sPlain}}}
	for _, r := range rows {
		body = append(body, line{{"  " + pad(r[0], 18), sAcc}, {r[1], sPlain}})
	}
	body = append(body, line{}, line{{"  Glyphs  ", sHead}, {"● working  ◆ needs you  ○ idle  ✓ done  ✗ failed  ‖ usage limit", sSub}},
		line{{"  Context ", sHead}, {" share of the model's context window the session fills; compacts near 100 %", sSub}})
	w := min(m.w, 90)
	b := box(line{{"Keys", sAcc}}, nil, body, w, 0, 0, -1, true)
	pad := strings.Repeat(" ", (m.w-w)/2)
	out := block{}
	for _, l := range b {
		out = append(out, pad+l+strings.Repeat(" ", m.w-w-len(pad)))
	}
	return out
}

func main() {
	p := tea.NewProgram(model{reports: map[string]string{}, period: "w"}, tea.WithAltScreen())
	if _, err := p.Run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

