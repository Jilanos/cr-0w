// crow-watch: live board of every agent (background runs, sessions, finished runs).
//
// Two views, toggled with `u`: agents (from `crow-runs json`, the same source as
// `crow runs`) and usage (from `crow-usage --json`, see usage.go). Colours are
// the terminal's 16 ANSI slots and no background is painted, so the board follows
// the terminal theme. Tall terminals stack the panes; wide ones put them side by side.
package main

import (
	"cmp"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/charmbracelet/x/ansi"
	"github.com/mattn/go-runewidth"
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

func crowRuns() string { return crowBin("crow-runs") }

type dataMsg struct {
	snap *snapshot
	err  error
}
type reportMsg struct{ id, text string }
type tickMsg time.Time

func fetch() tea.Msg {
	out, err := exec.Command(crowRuns(), "json").Output()
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
		out, _ := exec.Command(crowRuns(), "report", id).Output()
		return reportMsg{id: id, text: strings.TrimSpace(string(out))}
	}
}

func tick() tea.Cmd {
	return tea.Tick(2*time.Second, func(t time.Time) tea.Msg { return tickMsg(t) })
}

// ---------- styles: ANSI slots only ----------

var (
	cBlack   = lipgloss.Color("0")
	cRed     = lipgloss.Color("1")
	cGreen   = lipgloss.Color("2")
	cYellow  = lipgloss.Color("3")
	cMagenta = lipgloss.Color("5")
	cCyan    = lipgloss.Color("6")
	cDim     = lipgloss.Color("8")
	cBlue    = lipgloss.Color("12")

	sPlain   = lipgloss.NewStyle()
	sBold    = lipgloss.NewStyle().Bold(true)
	sDim     = lipgloss.NewStyle().Foreground(cDim)
	sHead    = lipgloss.NewStyle().Foreground(cMagenta).Bold(true)
	sCyan    = lipgloss.NewStyle().Foreground(cCyan)
	sYellow  = lipgloss.NewStyle().Foreground(cYellow)
	sMagenta = lipgloss.NewStyle().Foreground(cMagenta)
	sSel     = lipgloss.NewStyle().Background(cBlue).Foreground(cBlack)
	sTitle   = lipgloss.NewStyle().Background(cMagenta).Foreground(cBlack).Bold(true)
)

type stateStyle struct {
	glyph, label string
	style        lipgloss.Style
}

var states = map[string]stateStyle{
	"working": {"●", "working", lipgloss.NewStyle().Foreground(cGreen).Bold(true)},
	"quiet":   {"◌", "quiet", lipgloss.NewStyle().Foreground(cYellow)},
	"waiting": {"◆", "needs you", lipgloss.NewStyle().Foreground(cMagenta).Bold(true)},
	"idle":    {"○", "idle", sDim},
	"done":    {"✓", "done", lipgloss.NewStyle().Foreground(cGreen)},
	"failed":  {"✗", "failed", lipgloss.NewStyle().Foreground(cRed).Bold(true)},
	"limit":   {"⏸", "usage limit", lipgloss.NewStyle().Foreground(cYellow)},
	"lost":    {"?", "lost", sDim},
}

func st(name string) stateStyle {
	if s, ok := states[name]; ok {
		return s
	}
	return stateStyle{"?", name, sDim}
}

// ---------- text helpers ----------

// seg is a run of text with one style; lines are built from segs so they can be
// truncated to the pane width before styling, and re-rendered plain when selected.
type seg struct {
	text  string
	style lipgloss.Style
}
type line []seg

func (l line) render(width int, selected bool) string {
	var b strings.Builder
	used := 0
	for _, s := range l {
		t := strings.ReplaceAll(s.text, "\n", " ")
		w := runewidth.StringWidth(t)
		if used+w > width {
			t = runewidth.Truncate(t, width-used, "…")
			w = runewidth.StringWidth(t)
		}
		if selected {
			b.WriteString(t)
		} else {
			b.WriteString(s.style.Render(t))
		}
		used += w
		if used >= width {
			break
		}
	}
	if selected {
		return sSel.Render(b.String() + strings.Repeat(" ", max(0, width-used)))
	}
	return b.String()
}

func pad(s string, w int) string {
	s = runewidth.Truncate(s, w, "…")
	return s + strings.Repeat(" ", max(0, w-runewidth.StringWidth(s)))
}

func padL(s string, w int) string {
	return strings.Repeat(" ", max(0, w-runewidth.StringWidth(s))) + s
}

func age(sec float64) string {
	s := int(sec)
	switch {
	case s < 0:
		return "–"
	case s < 60:
		return fmt.Sprintf("%ds", s)
	case s < 3600:
		return fmt.Sprintf("%dm", s/60)
	default:
		return fmt.Sprintf("%dh%02d", s/3600, (s%3600)/60)
	}
}

func since(iso string) float64 {
	t, err := time.Parse(time.RFC3339, iso)
	if err != nil {
		t, err = time.Parse("2006-01-02T15:04:05.000Z", iso)
		if err != nil {
			return -1
		}
	}
	return time.Since(t).Seconds()
}

func clock(iso string) string {
	t, err := time.Parse(time.RFC3339Nano, iso)
	if err != nil {
		return "        "
	}
	return t.Local().Format("15:04:05")
}

func ctxSeg(tokens int) seg {
	if tokens == 0 {
		return seg{padL("–", 5), sDim}
	}
	k := tokens / 1000
	s := lipgloss.NewStyle().Foreground(cGreen)
	if k >= 400 {
		s = lipgloss.NewStyle().Foreground(cRed).Bold(true)
	} else if k >= 150 {
		s = sYellow
	}
	return seg{padL(fmt.Sprintf("%dk", k), 5), s}
}

// ---------- model ----------

type item struct {
	key   string
	agent *agent
	fin   *finished
}

type model struct {
	w, h        int
	snap        *snapshot
	err         error
	items       []item
	cursor      int
	selKey      string
	focusDetail bool
	detailOff   int
	listOff     int
	reports     map[string]string
	notice      string
	updated     time.Time

	showUsage    bool
	usage        *usage
	usageErr     error
	usageLoading bool
	uCursor      int
}

func (m *model) rebuild() {
	m.items = nil
	if m.snap == nil {
		return
	}
	for i := range m.snap.Agents {
		a := &m.snap.Agents[i]
		if a.Kind == "run" {
			m.items = append(m.items, item{key: keyOf(a), agent: a})
		}
	}
	for i := range m.snap.Agents {
		a := &m.snap.Agents[i]
		if a.Kind == "session" {
			m.items = append(m.items, item{key: keyOf(a), agent: a})
		}
	}
	for i := range m.snap.Finished {
		if i >= 5 {
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
			m.uCursor = max(0, min(m.uCursor, len(m.usage.today)-1))
		}
	case reportMsg:
		m.reports[msg.id] = msg.text
	case tea.KeyMsg:
		m.notice = ""
		switch msg.String() {
		case "q", "ctrl+c", "esc":
			return m, tea.Quit
		case "u":
			m.showUsage = !m.showUsage
		case "tab":
			m.focusDetail = !m.focusDetail
		case "r":
			if m.showUsage {
				if m.usageLoading {
					return m, nil
				}
				m.usageLoading = true
				return m, fetchUsage
			}
			return m, fetch
		case "c":
			if m.showUsage {
				if m.usage != nil && m.uCursor < len(m.usage.today) {
					id := m.usage.today[m.uCursor].ID
					if err := exec.Command("wl-copy", id).Run(); err == nil {
						m.notice = "copied " + short(id)
					} else {
						m.notice = "wl-copy not available"
					}
				}
			} else if it := m.selected(); it != nil {
				if err := exec.Command("wl-copy", it.key).Run(); err == nil {
					m.notice = "copied " + short(it.key)
				} else {
					m.notice = "wl-copy not available"
				}
			}
		case "up", "k":
			if m.showUsage {
				m.uCursor = max(0, m.uCursor-1)
			} else if m.focusDetail {
				m.detailOff = max(0, m.detailOff-1)
			} else if m.cursor > 0 {
				m.cursor--
				m.selKey, m.detailOff = m.items[m.cursor].key, 0
				return m, m.maybeReport()
			}
		case "down", "j":
			if m.showUsage {
				if m.usage != nil {
					m.uCursor = max(0, min(m.uCursor+1, len(m.usage.today)-1))
				}
			} else if m.focusDetail {
				m.detailOff++
			} else if m.cursor < len(m.items)-1 {
				m.cursor++
				m.selKey, m.detailOff = m.items[m.cursor].key, 0
				return m, m.maybeReport()
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
	title := m.title()
	footer := m.footer()
	if m.showUsage {
		return m.usageView(title, footer)
	}
	summary := m.summaryBox()
	mainH := m.h - lipgloss.Height(title) - lipgloss.Height(summary) - lipgloss.Height(footer)

	var body string
	stacked := m.w < 100 || m.h*2 > m.w // tall terminal: list on top, details below
	if stacked {
		listLines := m.listLines(m.w - 4)
		listH := min(len(listLines)+3, mainH*55/100)
		listH = max(listH, min(8, mainH))
		body = lipgloss.JoinVertical(lipgloss.Left,
			m.pane("Agents", listLines, m.w, listH, !m.focusDetail, true),
			m.pane("Details", m.detailLines(m.w-4), m.w, mainH-listH, m.focusDetail, false))
	} else {
		lw := max(60, m.w*5/8)
		dw := m.w - lw
		body = lipgloss.JoinHorizontal(lipgloss.Top,
			m.pane("Agents", m.listLines(lw-4), lw, mainH, !m.focusDetail, true),
			m.pane("Details", m.detailLines(dw-4), dw, mainH, m.focusDetail, false))
	}
	return lipgloss.JoinVertical(lipgloss.Left, title, summary, body, footer)
}

// title: the hub name and both views, the active one highlighted.
func (m model) title() string {
	tab := func(name string, on bool) string {
		if on {
			return sSel.Bold(true).Render(" " + name + " ")
		}
		return sTitle.Faint(true).Render(" " + name + " ")
	}
	t := sTitle.Render("CR-0W · ") + tab("AGENTS", !m.showUsage) + sTitle.Render("│") + tab("USAGE", m.showUsage)
	bar := lipgloss.PlaceHorizontal(m.w, lipgloss.Center, t, lipgloss.WithWhitespaceBackground(cMagenta))
	if m.updated.IsZero() || m.w < 60 {
		return bar
	}
	// Last refresh on the right edge, inside the title bar.
	stamp := sTitle.Faint(true).Render(m.updated.Format("15:04:05") + " ")
	cut := m.w - lipgloss.Width(stamp)
	return ansi.Truncate(bar, cut, "") + stamp
}

func (m model) summaryBox() string {
	l := line{}
	if m.snap != nil {
		busy, mx := m.snap.Slots.Busy, m.snap.Slots.Max
		working, waiting := 0, 0
		for _, a := range m.snap.Agents {
			switch a.State {
			case "working":
				working++
			case "waiting":
				waiting++
			}
		}
		gauge := sDim
		if busy > 0 {
			gauge = st("working").style
		}
		l = line{{"runs ", sHead}, {strings.Repeat("▰", busy), gauge}, {strings.Repeat("▱", max(0, mx-busy)), sDim}}
		// Only counts that say something; the gauge already shows busy/max.
		for _, c := range []struct {
			n     int
			state string
			text  string
		}{{waiting, "waiting", "need you"}, {working, "working", "working"}, {len(m.snap.Finished), "done", "finished today"}} {
			if c.n > 0 {
				s := st(c.state)
				l = append(l, seg{"   " + s.glyph + " ", s.style}, seg{fmt.Sprintf("%d %s", c.n, c.text), sPlain})
			}
		}
		if working == 0 && waiting == 0 {
			l = append(l, seg{"   nothing running", sDim})
		}
	} else if m.err != nil {
		l = line{{"crow-runs failed: " + m.err.Error(), lipgloss.NewStyle().Foreground(cRed)}}
	} else {
		l = line{{"loading…", sDim}}
	}
	return lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(cDim).
		Padding(0, 1).Width(m.w - 2).Render(l.render(m.w-4, false))
}

func (m model) footer() string {
	keys := line{
		{"↑↓/jk", sHead}, {": navigate  ", sPlain}, {"Tab", sHead}, {": switch pane  ", sPlain},
		{"PgUp/PgDn", sHead}, {": scroll details  ", sPlain}, {"u", sHead}, {": usage  ", sPlain},
		{"r", sHead}, {": refresh  ", sPlain}, {"c", sHead}, {": copy id  ", sPlain}, {"q", sHead}, {": quit", sPlain},
	}
	if m.showUsage {
		keys = line{
			{"↑↓/jk", sHead}, {": navigate  ", sPlain}, {"u", sHead}, {": agents  ", sPlain},
			{"r", sHead}, {": refresh  ", sPlain}, {"c", sHead}, {": copy id  ", sPlain}, {"q", sHead}, {": quit", sPlain},
		}
	}
	if m.notice != "" {
		keys = append(keys, seg{"   " + m.notice, sYellow})
	}
	return " " + keys.render(m.w-1, false)
}

func (m model) pane(title string, lines []line, w, h int, focused, isList bool) string {
	border := cDim
	if focused {
		border = cBlue
	}
	innerW, innerH := w-4, h-2
	head := line{{title, sHead.Underline(true)}}.render(innerW, false)
	avail := max(0, innerH-1)

	off := m.detailOff
	if isList {
		off = m.listScroll(lines, avail)
	}
	off = max(0, min(off, len(lines)-avail))
	var out []string
	out = append(out, head)
	for i := off; i < len(lines) && len(out) <= avail; i++ {
		out = append(out, lines[i].render(innerW, isList && m.lineSelected(i)))
	}
	return lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(border).
		Padding(0, 1).Width(w - 2).Height(innerH).MaxHeight(h).Render(strings.Join(out, "\n"))
}

// list rows: section headers + 2 lines per item; selection is tracked by line index.
type listMap struct{ start, end []int }

func (m model) listLayout() ([]line, listMap) {
	var lines []line
	var lm listMap
	lines = append(lines, line{{"  " + pad("project", 17) + padL("active", 6) + padL("ctx", 5) + padL("com", 4) + "  task / session  ↳ doing now", sDim}})
	section := func(name string, n int) {
		lines = append(lines, line{{fmt.Sprintf("%s (%d)", name, n), sBold}})
	}
	runs, sess := 0, 0
	for _, it := range m.items {
		if it.agent != nil && it.agent.Kind == "run" {
			runs++
		} else if it.agent != nil {
			sess++
		}
	}
	nfin := 0
	if m.snap != nil {
		nfin = len(m.snap.Finished)
	}
	prev := ""
	for i, it := range m.items {
		group := "FINISHED"
		if it.agent != nil && it.agent.Kind == "run" {
			group = "RUNS"
		} else if it.agent != nil {
			group = "SESSIONS"
		}
		if group != prev {
			if group == "SESSIONS" && prev == "" {
				section("RUNS", 0)
				lines = append(lines, line{{"  none", sDim}})
			}
			if prev != "" {
				lines = append(lines, line{})
			}
			n := map[string]int{"RUNS": runs, "SESSIONS": sess, "FINISHED": nfin}[group]
			section(group, n)
			prev = group
		}
		lm.start = append(lm.start, len(lines))
		lines = append(lines, m.itemLines(it)...)
		lm.end = append(lm.end, len(lines))
		_ = i
	}
	if len(m.items) == 0 {
		lines = append(lines, line{{"no agents", sDim}})
	}
	return lines, lm
}

func (m model) listLines(width int) []line {
	l, _ := m.listLayout()
	return l
}

func (m model) lineSelected(i int) bool {
	_, lm := m.listLayout()
	if m.cursor >= len(lm.start) {
		return false
	}
	return i >= lm.start[m.cursor] && i < lm.end[m.cursor]
}

func (m model) listScroll(lines []line, avail int) int {
	_, lm := m.listLayout()
	if m.cursor >= len(lm.end) || lm.end[m.cursor] <= avail {
		return 0
	}
	return lm.end[m.cursor] - avail
}

func (m model) itemLines(it item) []line {
	if a := it.agent; a != nil {
		s := st(a.State)
		task := cmp.Or(a.Label, a.Title)
		if task == "" {
			if a.Kind == "session" {
				task = "session " + short(a.SessionID)
			} else {
				task = "(not dispatched by crow)"
			}
		}
		doing, dstyle := a.LastAction, sCyan
		if a.State == "waiting" {
			doing, dstyle = "waiting for your reply", sMagenta
		}
		ageStyle := sDim
		if a.State == "working" || a.State == "waiting" {
			ageStyle = s.style
		}
		commits := ""
		if a.Kind == "run" {
			commits = fmt.Sprint(len(a.Commits))
		}
		return []line{
			{{s.glyph + " ", s.style}, {pad(a.Project, 17), sBold}, {padL(age(float64(a.LastActivityS)), 6), ageStyle},
				ctxSeg(a.ContextTokens), {padL(commits, 4) + "  ", sCyan}, {task, sPlain}},
			{{"  ↳ ", sDim}, {doing, dstyle}},
		}
	}
	f := it.fin
	s := st(f.Status)
	extra := ""
	if len(f.ResumedFrom) > 0 {
		extra = fmt.Sprintf(" · resumed %d×", len(f.ResumedFrom))
	}
	return []line{
		{{s.glyph + " ", s.style}, {pad(f.Project, 17), sPlain}, {padL(age(since(f.EndedAt)), 6), sDim},
			{padL("", 5), sDim}, {padL(fmt.Sprint(len(f.Commits)), 4) + "  ", sCyan}, {f.Label, sPlain}},
		{{"  ↳ ", sDim}, {s.label + extra, s.style}},
	}
}

func (m model) detailLines(width int) []line {
	it := m.selected()
	if it == nil {
		return []line{{{"nothing selected", sDim}}}
	}
	var out []line
	commits := func(cs []string) {
		if len(cs) == 0 {
			return
		}
		out = append(out, line{}, line{{"Commits", sHead}})
		for _, c := range cs {
			sha, msg, _ := strings.Cut(c, " ")
			out = append(out, line{{sha, sYellow}, {" " + msg, sPlain}})
		}
	}
	if a := it.agent; a != nil {
		s := st(a.State)
		id := "session " + short(a.SessionID)
		if a.RunID != "" {
			id = "run " + short(a.RunID)
		}
		out = append(out,
			line{{s.glyph + " " + s.label + "  ", s.style}, {a.Project, sBold}},
		)
		if t := cmp.Or(a.Label, a.Title); t != "" {
			out = append(out, line{{t, sBold}})
		}
		meta := fmt.Sprintf("%s · up %s · active %s ago", id, age(since(a.StartedAt)), age(float64(a.LastActivityS)))
		if a.Account != "" {
			meta += " · " + a.Account
		}
		if a.SubagentsActive > 0 {
			meta += fmt.Sprintf(" · %d subagents", a.SubagentsActive)
		}
		out = append(out, line{{meta, sDim}}, line{{a.Cwd, sDim}}, line{}, line{{"Recent activity", sHead}})
		for i := len(a.Recent) - 1; i >= 0; i-- { // newest first
			e := a.Recent[i]
			tool, rest, _ := strings.Cut(e.Action, ": ")
			ts := sCyan
			if tool == "says" {
				ts = sMagenta
			}
			rest, _, _ = strings.Cut(rest, "\n")
			out = append(out, line{{clock(e.TS) + "  ", sDim}, {tool, ts}, {"  " + rest, sPlain}})
		}
		commits(a.Commits)
		return out
	}
	f := it.fin
	s := st(f.Status)
	out = append(out, line{{s.glyph + " " + s.label + "  ", s.style}, {f.Project, sBold}}, line{{f.Label, sBold}})
	meta := fmt.Sprintf("run %s · ran %s · ended %s ago", short(f.RunID), age(float64(f.DurationS)), age(since(f.EndedAt)))
	if len(f.ResumedFrom) > 0 {
		meta += " · resumed after " + short(f.ResumedFrom[0])
	}
	out = append(out, line{{meta, sDim}})
	commits(f.Commits)
	out = append(out, line{}, line{{"Report", sHead}})
	rep, ok := m.reports[f.RunID]
	if !ok {
		out = append(out, line{{"loading…", sDim}})
	} else if rep == "" {
		out = append(out, line{{"no report", sDim}})
	} else {
		wrapped := lipgloss.NewStyle().Width(width).Render(rep)
		for _, l := range strings.Split(wrapped, "\n") {
			out = append(out, line{{strings.TrimRight(l, " "), sPlain}})
		}
	}
	return out
}

func main() {
	p := tea.NewProgram(model{reports: map[string]string{}}, tea.WithAltScreen())
	if _, err := p.Run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
