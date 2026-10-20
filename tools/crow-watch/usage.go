// Usage view: limits per account, today's spend, a 7-day cost chart and today's
// sessions, fed by `crow-usage --json` every 30 seconds.
package main

import (
	"encoding/json"
	"fmt"
	"os/exec"
	"sort"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// ---------- data (mirrors crow-usage build()) ----------

type limit struct {
	Account          string `json:"account"`
	Remaining5hPct   *int   `json:"remaining_5h_pct"`
	Reset5hAt        string `json:"reset_5h_at"`
	RemainingWeekPct *int   `json:"remaining_week_pct"`
	ResetWeekAt      string `json:"reset_week_at"`
	Active           bool   `json:"active"`
}

type usageDay struct {
	Date     string  `json:"date"`
	CostUSD  float64 `json:"cost_usd"`
	Tokens   int     `json:"tokens"`
	Sessions int     `json:"sessions"`
	CachePct int     `json:"cache_pct"`
}

type usageSession struct {
	ID      string   `json:"id"`
	Account string   `json:"account"`
	Project string   `json:"project"`
	Kind    string   `json:"kind"`
	Models  []string `json:"models"`
	Start   string   `json:"start"`
	End     string   `json:"end"`
	Active  bool     `json:"active"`
	Tokens  int      `json:"tokens"`
	CostUSD *float64 `json:"cost_usd"`
}

type usage struct {
	GeneratedAt string         `json:"generated_at"`
	Limits      []limit        `json:"limits"`
	Today       usageDay       `json:"today"`
	Days        []usageDay     `json:"days"`
	Sessions    []usageSession `json:"sessions"`
	Rtk         struct {
		SavedTokens int     `json:"saved_tokens"`
		SavedPct    float64 `json:"saved_pct"`
	} `json:"rtk"`
	Retros struct {
		Today            int `json:"today"`
		PendingProposals int `json:"pending_proposals"`
	} `json:"retros"`

	today []usageSession // today's sessions, most recent first
}

func parseUsage(b []byte) (*usage, error) {
	var u usage
	if err := json.Unmarshal(b, &u); err != nil {
		return nil, err
	}
	// "today" is the script's last day, so the view agrees with its totals.
	day := ""
	if n := len(u.Days); n > 0 {
		day = u.Days[n-1].Date
	}
	for _, s := range u.Sessions {
		if s.End != "" && localDay(s.End) == day {
			u.today = append(u.today, s)
		}
	}
	sort.SliceStable(u.today, func(i, j int) bool { return u.today[i].End > u.today[j].End })
	return &u, nil
}

func localDay(iso string) string {
	t, err := time.Parse(time.RFC3339Nano, iso)
	if err != nil {
		return ""
	}
	return t.Local().Format("2006-01-02")
}

type usageMsg struct {
	u   *usage
	err error
}
type usageTickMsg time.Time

func fetchUsage() tea.Msg {
	out, err := exec.Command(crowBin("crow-usage"), "--json").Output()
	if err != nil {
		return usageMsg{err: err}
	}
	u, err := parseUsage(out)
	return usageMsg{u: u, err: err}
}

func usageTick() tea.Cmd {
	return tea.Tick(30*time.Second, func(t time.Time) tea.Msg { return usageTickMsg(t) })
}

// ---------- formatting ----------

func human(n int) string {
	switch {
	case n >= 1_000_000:
		return fmt.Sprintf("%.1fM", float64(n)/1e6)
	case n >= 1000:
		return fmt.Sprintf("%dk", n/1000)
	default:
		return fmt.Sprint(n)
	}
}

func dollars(c *float64) string {
	if c == nil {
		return "–"
	}
	return fmt.Sprintf("$%.2f", *c)
}

func levelStyle(pct int) lipgloss.Style {
	switch {
	case pct < 20:
		return lipgloss.NewStyle().Foreground(cRed).Bold(true)
	case pct <= 50:
		return sYellow
	default:
		return lipgloss.NewStyle().Foreground(cGreen)
	}
}

// gauge: filled blocks for what is left, coloured by level; pct + reset after it.
func gauge(pct *int, width int, reset string) []seg {
	if pct == nil {
		return []seg{{strings.Repeat("▱", width), sDim}, {padL("–", 5), sDim}, {"  " + pad(reset, 12), sDim}}
	}
	p := max(0, min(100, *pct))
	fill := (p*width + 50) / 100
	s := levelStyle(p)
	return []seg{
		{strings.Repeat("▰", fill), s}, {strings.Repeat("▱", width-fill), sDim},
		{padL(fmt.Sprintf("%d%%", p), 5), s}, {"  " + pad(reset, 12), sDim},
	}
}

// shortReset drops the date when the reset is on the data's own day ("Oct 20 16:20" → "16:20").
func shortReset(s, today string) string {
	t, err := time.Parse("2006-01-02", today)
	if err == nil && strings.HasPrefix(s, t.Format("Jan 2 ")) {
		return strings.TrimPrefix(s, t.Format("Jan 2 "))
	}
	return s
}

func models(ms []string) string {
	var out []string
	for _, m := range ms {
		if strings.HasPrefix(m, "<") {
			continue
		}
		out = append(out, strings.TrimPrefix(m, "claude-"))
	}
	return strings.Join(out, ",")
}

// ---------- sections ----------

func (u *usage) todayKey() string {
	if n := len(u.Days); n > 0 {
		return u.Days[n-1].Date
	}
	return ""
}

func (u *usage) limitLines(width int) []line {
	nameW := 6
	for _, l := range u.Limits {
		nameW = max(nameW, len(l.Account))
	}
	head := 2 + nameW + 5 // mark, name, "  5h "
	tail := 5 + 2 + 12    // pct, reset
	gw := min(20, (width-head-tail-5-tail)/2)
	split := gw < 5 // not enough room for both gauges on one line
	if split {
		gw = max(3, min(20, width-head-tail))
	}
	var out []line
	for _, l := range u.Limits {
		mark, name := seg{"  ", sPlain}, seg{pad(l.Account, nameW), sPlain}
		if l.Active {
			mark, name = seg{"● ", st("working").style}, seg{pad(l.Account, nameW), sBold}
		}
		five := append(line{mark, name, {"  5h ", sDim}}, gauge(l.Remaining5hPct, gw, shortReset(l.Reset5hAt, u.todayKey()))...)
		week := gauge(l.RemainingWeekPct, gw, shortReset(l.ResetWeekAt, u.todayKey()))
		if split {
			out = append(out, five, append(line{{strings.Repeat(" ", 2+nameW), sPlain}, {"  wk ", sDim}}, week...))
		} else {
			out = append(out, append(append(five, seg{"wk ", sDim}), week...))
		}
	}
	if len(u.Limits) == 0 {
		out = append(out, line{{"no limits (cdx status failed)", sDim}})
	}
	return out
}

func (u *usage) todayHead() line {
	t := u.Today
	return line{
		{"TODAY", sHead.Underline(true)}, {fmt.Sprintf(" $%.2f", t.CostUSD), sBold},
		{fmt.Sprintf(" · %s tok (%d%% cache) · %d sessions", human(t.Tokens), t.CachePct, t.Sessions), sPlain},
	}
}

// sparkLines: one column per day (bar, $ value, weekday), oldest dropped when narrow.
func (u *usage) sparkLines(width int) []line {
	const colW = 9
	days := u.Days
	if n := max(1, width/colW); len(days) > n {
		days = days[len(days)-n:]
	}
	top := 0.0
	for _, d := range days {
		top = max(top, d.CostUSD)
	}
	blocks := []rune("▁▂▃▄▅▆▇█")
	var bars, vals, names line
	for i, d := range days {
		style := sCyan
		if i == len(days)-1 {
			style = sMagenta.Bold(true)
		}
		b := seg{strings.Repeat("▁", colW-2) + "  ", sDim}
		if d.CostUSD > 0 && top > 0 {
			k := int(d.CostUSD/top*float64(len(blocks)-1) + 0.5)
			b = seg{strings.Repeat(string(blocks[k]), colW-2) + "  ", style}
		}
		name := d.Date
		if t, err := time.Parse("2006-01-02", d.Date); err == nil {
			name = t.Format("Mon 02")
		}
		bars = append(bars, b)
		vals = append(vals, seg{pad(fmt.Sprintf("$%.2f", d.CostUSD), colW), style})
		names = append(names, seg{pad(name, colW), sDim})
	}
	return []line{bars, vals, names}
}

func (u *usage) sessionHeader() line {
	return line{{"  " + pad("account", 9) + pad("project", 22) + pad("models", 20) + padL("tokens", 7) + padL("cost", 9), sDim}}
}

func (u *usage) sessionLine(s usageSession) line {
	mark := seg{"✓ ", lipgloss.NewStyle().Foreground(cGreen)}
	switch {
	case s.Active:
		mark = seg{"● ", st("working").style}
	case s.Kind == "run":
		mark = seg{"⚙ ", sCyan}
	}
	return line{mark, {pad(s.Account, 8) + " ", sPlain}, {pad(s.Project, 21) + " ", sBold}, {pad(models(s.Models), 19) + " ", sDim},
		{padL(human(s.Tokens), 7), sCyan}, {padL(dollars(s.CostUSD), 9), sYellow}}
}

func (u *usage) statsLine() line {
	return line{
		{"rtk saved ", sDim}, {fmt.Sprintf("%s (%.0f%%)", human(u.Rtk.SavedTokens), u.Rtk.SavedPct), sCyan},
		{" · retros today ", sDim}, {fmt.Sprint(u.Retros.Today), sCyan},
		{" · proposals pending ", sDim}, {fmt.Sprint(u.Retros.PendingProposals), sCyan},
	}
}

// ---------- layout ----------

// box: rounded border, a head line, fixed lines, then body lines from off; body[sel] is highlighted (-1: none).
func box(head line, fixed, body []line, w, h, off, sel int, focused bool) string {
	border := cDim
	if focused {
		border = cBlue
	}
	innerW := w - 4
	out := []string{head.render(innerW, false)}
	for _, l := range fixed {
		out = append(out, l.render(innerW, false))
	}
	for i := off; i < len(body) && len(out) < h-2; i++ {
		out = append(out, body[i].render(innerW, i == sel))
	}
	return lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(border).
		Padding(0, 1).Width(w - 2).Height(h - 2).MaxHeight(h).Render(strings.Join(out, "\n"))
}

func (m model) usageView(title, footer string) string {
	u := m.usage
	avail := m.h - lipgloss.Height(title) - lipgloss.Height(footer)
	if u == nil {
		msg := line{{"loading usage…", sDim}}
		if m.usageErr != nil {
			msg = line{{"crow-usage failed: " + m.usageErr.Error(), lipgloss.NewStyle().Foreground(cRed)}}
		}
		body := " " + msg.render(m.w-1, false) + strings.Repeat("\n", max(0, avail-1))
		return lipgloss.JoinVertical(lipgloss.Left, title, body, footer)
	}
	iw := m.w - 4
	limits := u.limitLines(iw)
	limH := 3 + len(limits)
	stats := " " + u.statsLine().render(m.w-1, false)
	spark := u.sparkLines(iw)
	rest := avail - limH - 1 // stats line

	// Drop order when short: sessions table, then the chart, then the today box.
	todayH := 3 + len(spark)
	if rest < todayH+6 && rest >= todayH {
		todayH = rest
	}
	if rest < todayH {
		spark, todayH = nil, min(3, rest)
		if todayH < 3 {
			todayH = 0
		}
	}
	parts := []string{title, box(line{{"LIMITS", sHead.Underline(true)}, {"  remaining · resets", sDim}}, nil, limits, m.w, limH, 0, -1, false)}
	if todayH > 0 {
		parts = append(parts, box(u.todayHead(), nil, spark, m.w, todayH, 0, -1, false))
	}
	tableH := rest - todayH
	if tableH >= 6 {
		var rows []line
		for _, s := range u.today {
			rows = append(rows, u.sessionLine(s))
		}
		if len(u.today) == 0 {
			rows = append(rows, line{{"no sessions today", sDim}})
		}
		sel := -1
		if len(u.today) > 0 {
			sel = m.uCursor
		}
		visible := tableH - 4 // border, head, column header
		off := 0
		if sel >= visible {
			off = sel - visible + 1
		}
		head := line{{"SESSIONS", sHead.Underline(true)}, {fmt.Sprintf(" today (%d)", len(u.today)), sDim}}
		parts = append(parts, box(head, []line{u.sessionHeader()}, rows, m.w, tableH, off, sel, true))
	} else if tableH > 0 {
		parts = append(parts, strings.Repeat("\n", tableH-1))
	}
	parts = append(parts, stats, footer)
	return lipgloss.JoinVertical(lipgloss.Left, parts...)
}
