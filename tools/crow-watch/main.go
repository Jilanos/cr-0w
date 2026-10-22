// crow-watch: live board of crow's agents and Claude usage.
//
// Three views on keys 1-3: Agents (from `crow-runs json`, the same source as
// `crow runs`), Usage and History (from `crow-usage --json`). Layouts
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
	"github.com/charmbracelet/lipgloss"
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

// interrupted: a session cut off by a usage limit (mirrors crow-sessions list --json).
type interrupted struct {
	ID          string   `json:"conversation_id"`
	Account     string   `json:"account"`
	Project     string   `json:"project"`
	Cwd         string   `json:"cwd"`
	Branch      string   `json:"branch"`
	LastEvent   string   `json:"last_event"`
	Limit       string   `json:"limit"`
	ResetsAt    int64    `json:"resets_at"`
	FirstPrompt string   `json:"first_prompt"`
	LastPrompt  string   `json:"last_prompt"`
	Workspaces  []string `json:"workspaces"`
	Relaunched  any      `json:"relaunched"`
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

type sessionsMsg struct{ list []interrupted }

// fetchInterrupted reads the registry of sessions stopped by a limit; a failure
// leaves the board as it was (the registry is an extra, not the board's source).
func fetchInterrupted() tea.Msg {
	out, err := exec.Command(crowBin("crow-sessions"), "list", "--json").Output()
	if err != nil {
		return sessionsMsg{}
	}
	var reg struct {
		Sessions []interrupted `json:"sessions"`
	}
	if json.Unmarshal(out, &reg) != nil {
		return sessionsMsg{}
	}
	return sessionsMsg{list: reg.Sessions}
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
	vHistory
)

var viewNames = []string{"Agents", "Usage", "History"}

// Agent groups, in the order the board lists them: what needs the owner, what
// is working, what finished, then idle sessions.
const (
	gNeed = iota
	gWork
	gDone
	gIdle
)

var groupNames = []string{"Needs you", "Working", "Finished", "Idle"}

type item struct {
	key   string
	group int
	agent *agent
	fin   *finished
	intr  *interrupted
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
	intr         []interrupted // sessions stopped by a usage limit
	usageLoading bool
	uCursor      int
	period       string // d | w | m (History)
	now          time.Time
}

func (m model) clock() time.Time {
	if !m.now.IsZero() {
		return m.now
	}
	return time.Now()
}

// recentStop: interrupted sessions older than this are history, not something to act on.
const recentStop = 24 * time.Hour

// rebuild orders the agent list by what it asks of the owner: sessions waiting
// on a reply, failed runs and sessions stopped by a limit first; then runs and
// working sessions; then finished runs; idle sessions last.
func (m *model) rebuild() {
	m.items = nil
	if m.snap == nil {
		return
	}
	groups := make([][]item, len(groupNames))
	add := func(g int, it item) { it.group = g; groups[g] = append(groups[g], it) }
	live := map[string]bool{}
	for i := range m.snap.Agents {
		a := &m.snap.Agents[i]
		live[a.SessionID] = true
		switch {
		case a.State == "waiting":
			add(gNeed, item{key: keyOf(a), agent: a})
		case a.Kind == "run" || a.State == "working" || a.State == "quiet":
			add(gWork, item{key: keyOf(a), agent: a})
		default:
			add(gIdle, item{key: keyOf(a), agent: a})
		}
	}
	for i := range m.snap.Finished {
		if i >= 8 {
			break
		}
		f := &m.snap.Finished[i]
		g := gDone
		if f.Status != "done" {
			g = gNeed
		}
		add(g, item{key: f.RunID, fin: f})
	}
	for i := range m.intr {
		s := &m.intr[i]
		if s.Relaunched != nil || live[s.ID] {
			continue
		}
		if sec := m.since(s.LastEvent); sec < 0 || sec > recentStop.Seconds() {
			continue
		}
		add(gNeed, item{key: s.ID, intr: s})
	}
	for _, g := range groups {
		m.items = append(m.items, g...)
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

func (m model) Init() tea.Cmd {
	return tea.Batch(fetch, tick(), fetchUsage, fetchInterrupted, usageTick())
}

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
		return m, tea.Batch(fetchUsage, fetchInterrupted, usageTick())
	case usageMsg:
		m.usageLoading, m.usageErr = false, msg.err
		if msg.u != nil {
			m.usage = msg.u
			m.uCursor = max(0, min(m.uCursor, len(m.usage.rows)-1))
		}
	case sessionsMsg:
		m.intr = msg.list
		m.rebuild()
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
		case "1", "2", "3":
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
					switch {
					case it.agent != nil:
						m.notice = openProject(it.agent.Project)
					case it.fin != nil:
						m.notice = openProject(it.fin.Project)
					default:
						m.notice = openProject(it.intr.Project)
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
	default:
		body = m.historyView(bodyH)
	}
	for len(body) < bodyH {
		body = append(body, strings.Repeat(" ", m.w))
	}
	out := append(block{head, strings.Repeat(" ", m.w)}, body[:bodyH]...)
	return strings.Join(append(out, foot), "\n")
}

// header: hub name, the three views (active one as an accent pill), live status on the right.
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
			l = append(l, seg{fmt.Sprintf(" %d%%", p), levelStyle(p)})
			if c.EmptyAt != "" { // runs out before its reset: the one headroom fact to see from every view
				l = append(l, seg{" out ~" + hhmm(c.EmptyAt), lipgloss.NewStyle().Foreground(cYellow).Bold(true)})
			}
			l = append(l, seg{"  ·  ", sDim})
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
	keys := []string{"1-3", "views", "↑↓", "select", "o", "open", "c", "copy id"}
	if m.view == vHistory {
		keys = []string{"1-3", "views", "d w m", "period"}
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
		{"1 2 3", "Agents · Usage · History"}, {"Tab / Shift+Tab", "next / previous view"}, {"u", "toggle Agents ↔ Usage"},
		{"↑↓  j k", "select an agent or a session"}, {"PgUp PgDn", "scroll the details"}, {"o  Enter", "open the project in a new kitty window"},
		{"c", "copy the run or session id"}, {"d w m", "period: today, 7 days, 30 days (History)"}, {"r", "refresh now"},
		{"?", "this help (any key closes)"}, {"q", "quit"},
	}
	body := []line{{{"", sPlain}}}
	for _, r := range rows {
		body = append(body, line{{"  " + pad(r[0], 18), sAcc}, {r[1], sPlain}})
	}
	body = append(body, line{}, line{{"  Glyphs  ", sHead}, {"● working  ◆ needs you  ○ idle  ✓ done  ✗ failed  ‖ stopped by a usage limit", sSub}},
		line{{"  Context ", sHead}, {" ctx 82 %: the share of the context window a session fills, shown from 70 %; it compacts near 100 %", sSub}},
		line{{"  Limits  ", sHead}, {" 5h / week on a session: points of its account's window it used", sSub}},
		line{}, line{{"  Savings ", sHead}, {" rtk: command output trimmed before Claude reads it (bytes ÷ 4)", sSub}},
		line{{"          ", sPlain}, {" prompt cache: cache reads against their uncached input price", sSub}},
		line{{"          ", sPlain}, {" model routing: Sonnet/Haiku runs priced at Opus rates, the gap", sSub}},
		line{{"          ", sPlain}, {" compactions: a session filled its window; split or delegate", sSub}})
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
