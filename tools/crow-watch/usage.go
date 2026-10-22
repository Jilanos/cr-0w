// Usage and History views, fed by `crow-usage --json` every 30 seconds.
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
	"github.com/mattn/go-runewidth"
)

// ---------- data (mirrors crow-usage build()) ----------

type limit struct {
	Account          string   `json:"account"`
	Remaining5hPct   *int     `json:"remaining_5h_pct"`
	Reset5hAt        string   `json:"reset_5h_at"`
	RemainingWeekPct *int     `json:"remaining_week_pct"`
	ResetWeekAt      string   `json:"reset_week_at"`
	Active           bool     `json:"active"`
	Burn5h           *float64 `json:"burn_5h_pct_per_h"`
	EmptyAt          string   `json:"empty_at"`
}

type named struct {
	Name     string  `json:"name"`
	CostUSD  float64 `json:"cost_usd"`
	Tokens   int     `json:"tokens"`
	Sessions int     `json:"sessions"`
	Calls    int     `json:"calls"`
	Images   int     `json:"images"`
}

// rollup: one day or a period (today, week, month).
type rollup struct {
	Date        string  `json:"date"`
	CostUSD     float64 `json:"cost_usd"`
	Tokens      int     `json:"tokens"`
	Sessions    int     `json:"sessions"`
	Unpriced    int     `json:"unpriced"`
	CachePct    int     `json:"cache_pct"`
	Input       int     `json:"input_tokens"`
	Output      int     `json:"output_tokens"`
	CacheWrite  int     `json:"cache_write_tokens"`
	CacheRead   int     `json:"cache_read_tokens"`
	CacheSaved  float64 `json:"cache_saved_usd"`
	RouteSaved  float64 `json:"routing_saved_usd"`
	Runs        int     `json:"runs"`
	RoutedRuns  int     `json:"routed_runs"`
	Compactions int     `json:"compactions"`
	ByProject   []named `json:"by_project"`
	ByModel     []named `json:"by_model"`
	Tools       []named `json:"tools"`
}

type slice struct {
	CostUSD *float64 `json:"cost_usd"`
	Tokens  int      `json:"tokens"`
}

type usageSession struct {
	ID       string           `json:"id"`
	Account  string           `json:"account"`
	Project  string           `json:"project"`
	Title    string           `json:"title"`
	Kind     string           `json:"kind"`
	Models   []string         `json:"models"`
	Start    string           `json:"start"`
	End      string           `json:"end"`
	Active   bool             `json:"active"`
	Tokens   int              `json:"tokens"`
	CostUSD  *float64         `json:"cost_usd"`
	ByDay    map[string]slice `json:"by_day"`
	Activity map[string][]int `json:"activity"`
	// Points of the account's current 5h and weekly windows this session used.
	LimitShare struct {
		FiveHour *float64 `json:"five_hour_pct"`
		Week     *float64 `json:"week_pct"`
	} `json:"limit_share"`
}

type usage struct {
	GeneratedAt string         `json:"generated_at"`
	Limits      []limit        `json:"limits"`
	Today       rollup         `json:"today"`
	Week        rollup         `json:"week"`
	Month       rollup         `json:"month"`
	Days        []rollup       `json:"days"`
	History     []rollup       `json:"history"`
	Sessions    []usageSession `json:"sessions"`
	Rtk         struct {
		SavedTokens      int     `json:"saved_tokens"`
		SavedPct         float64 `json:"saved_pct"`
		Commands         int     `json:"commands"`
		TimeMs           int     `json:"time_ms"`
		Failures         int     `json:"failures"`
		TodaySavedTokens int     `json:"today_saved_tokens"`
		TodaySavedPct    float64 `json:"today_saved_pct"`
		TodayCommands    int     `json:"today_commands"`
	} `json:"rtk"`
	Retros struct {
		Today            int `json:"today"`
		Week             int `json:"week"`
		PendingProposals int `json:"pending_proposals"`
	} `json:"retros"`

	rows   []sessRow // sessions list: today, then earlier days (newest first)
	byID   map[string]*usageSession
	nToday int
	acctW  int // widest account name
}

// sessRow is one line of the sessions list: a day divider or a session's slice of that day.
// first: the session's newest row, the one that carries its limit shares.
type sessRow struct {
	day    string
	head   bool
	s      *usageSession
	cost   float64
	tok    int
	priced bool
	first  bool
}

func parseUsage(b []byte) (*usage, error) {
	var u usage
	if err := json.Unmarshal(b, &u); err != nil {
		return nil, err
	}
	u.byID = map[string]*usageSession{}
	for i := range u.Sessions {
		u.byID[u.Sessions[i].ID] = &u.Sessions[i]
	}
	days := map[string][]sessRow{}
	for i := range u.Sessions {
		s := &u.Sessions[i]
		for d, x := range s.ByDay {
			c := 0.0
			if x.CostUSD != nil {
				c = *x.CostUSD
			}
			days[d] = append(days[d], sessRow{day: d, s: s, cost: c, tok: x.Tokens, priced: x.CostUSD != nil})
		}
	}
	var keys []string
	for d := range days {
		keys = append(keys, d)
	}
	sort.Sort(sort.Reverse(sort.StringSlice(keys)))
	today := u.todayKey()
	for _, d := range keys {
		rs := days[d]
		sort.SliceStable(rs, func(i, j int) bool { return rs[i].cost > rs[j].cost })
		if d != today {
			u.rows = append(u.rows, sessRow{day: d, head: true})
		} else {
			u.nToday = len(rs)
		}
		u.rows = append(u.rows, rs...)
	}
	seen := map[string]bool{}
	for i := range u.rows {
		if r := &u.rows[i]; !r.head && !seen[r.s.ID] {
			r.first, seen[r.s.ID] = true, true
		}
	}
	for _, s := range u.Sessions {
		u.acctW = max(u.acctW, len(s.Account))
	}
	return &u, nil
}

func (u *usage) todayKey() string {
	if n := len(u.Days); n > 0 {
		return u.Days[n-1].Date
	}
	return time.Now().Format("2006-01-02")
}

// current: the account cdx marks active, else the first listed.
func (u *usage) current() *limit {
	for i := range u.Limits {
		if u.Limits[i].Active {
			return &u.Limits[i]
		}
	}
	if len(u.Limits) > 0 {
		return &u.Limits[0]
	}
	return nil
}

func (u *usage) selected(i int) *usageSession {
	if u == nil || i < 0 || i >= len(u.rows) || u.rows[i].head {
		return nil
	}
	return u.rows[i].s
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

// hhmm: an ISO time (with or without seconds) as local "15:04".
func hhmm(iso string) string {
	for _, layout := range []string{time.RFC3339, "2006-01-02T15:04Z07:00"} {
		if t, err := time.Parse(layout, iso); err == nil {
			return t.Local().Format("15:04")
		}
	}
	return iso
}

// ---------- sections (each returns body lines for a box) ----------

func (u *usage) limitLines(width int) []line {
	nameW := 7
	for _, l := range u.Limits {
		nameW = max(nameW, len(l.Account)+1)
	}
	tail := 5 + 2 + 20 // pct, "resets Oct 26 17:00"
	gw := min(24, (width-2-nameW-tail*2-6)/2)
	split := gw < 6
	if split {
		gw = max(4, min(24, width-2-nameW-tail-4))
	}
	cell := func(pct *int, reset string) []seg {
		if pct == nil {
			return []seg{{strings.Repeat("·", gw), sDim}, {padL("–", 5), sSub}, {"  " + pad("", 13), sSub}}
		}
		s := levelStyle(*pct)
		return append(lineBar(float64(*pct), gw, s), seg{padL(fmt.Sprintf("%d%%", *pct), 5), s},
			seg{"  " + pad("resets "+shortReset(reset, u.todayKey()), 13+7), sSub})
	}
	head := line{{"  " + pad("account", nameW+1), sHead}, {pad("5-hour window", gw+5+2+20-1), sHead}}
	if !split {
		head = append(head, seg{"week", sHead})
	}
	out := []line{head}
	ls := append([]limit(nil), u.Limits...)
	sort.SliceStable(ls, func(i, j int) bool { return ls[i].Active && !ls[j].Active })
	for _, l := range ls {
		mark, name := seg{"  ", sPlain}, seg{pad(l.Account, nameW), sPlain}
		if l.Active {
			mark, name = seg{"● ", st("working").style}, seg{pad(l.Account, nameW), sBold}
		}
		five := append(line{mark, name}, cell(l.Remaining5hPct, l.Reset5hAt)...)
		week := cell(l.RemainingWeekPct, l.ResetWeekAt)
		if split {
			out = append(out, five, append(line{{strings.Repeat(" ", 2+nameW-3), sPlain}, {"wk ", sSub}}, week...))
		} else {
			out = append(out, append(append(five, seg{"  ", sPlain}), week...))
		}
		if l.Active && l.Burn5h != nil && *l.Burn5h > 0.5 {
			b := line{{strings.Repeat(" ", 2+nameW), sPlain}, {fmt.Sprintf("▼ %.0f%% per hour", *l.Burn5h), sYellow}}
			if l.EmptyAt != "" {
				out := " · runs out ~" + hhmm(l.EmptyAt) + ", before the reset"
				if b.width()+runewidth.StringWidth(out) > width {
					out = " · runs out ~" + hhmm(l.EmptyAt)
				}
				b = append(b, seg{out, lipgloss.NewStyle().Foreground(cYellow).Bold(true)})
			}
			out = append(out, b)
		}
	}
	if len(u.Limits) == 0 {
		out = append(out, line{{"no limits (cdx status failed)", sSub}})
	}
	return out
}

// spendHead: the spend figures, today's session count and unpriced sessions;
// on two lines when one does not fit the width.
func (u *usage) spendHead(width int) []line {
	t, w := u.Today, u.Week
	l := line{{money(t.CostUSD), sBold.Foreground(cWhite)}, {" today   ", sSub}, {money(w.CostUSD), sBold}, {" last 7 days   ", sSub},
		{money(u.Month.CostUSD), sBold}, {" 30 days", sSub}}
	extra := line{{fmt.Sprintf("%d sessions today", t.Sessions), sSub}}
	if t.Unpriced > 0 {
		extra = append(extra, seg{fmt.Sprintf("   %d unpriced", t.Unpriced), sYellow})
	}
	if l.width()+7+extra.width() <= width {
		return []line{append(append(l, seg{"   ·   ", sSub}), extra...)}
	}
	return []line{l, extra}
}

func (u *usage) splitLine() line {
	t := u.Today
	return line{
		{human(t.Tokens), sCyan}, {fmt.Sprintf(" tokens · %d sessions   ", t.Sessions), sSub},
		{"new in ", sSub}, {human(t.Input), sCyan}, {" · out ", sSub}, {human(t.Output), sCyan},
		{" · cache read ", sSub}, {human(t.CacheRead), sCyan}, {fmt.Sprintf(" (%d%%)", t.CachePct), sSub},
		{" · cache write ", sSub}, {human(t.CacheWrite), sCyan},
	}
}

// chart: vertical bars, one column per day, height rows; tokens instead of cost when tok.
func chart(days []rollup, width, height int, tok bool) []line {
	if len(days) == 0 || height < 1 {
		return nil
	}
	colW := max(3, min(14, width/len(days)))
	if n := width / colW; len(days) > n {
		days = days[len(days)-n:]
	}
	val := func(d rollup) float64 {
		if tok {
			return float64(d.Tokens)
		}
		return d.CostUSD
	}
	top := 0.0
	for _, d := range days {
		top = max(top, val(d))
	}
	barW := max(1, colW-2)
	if colW <= 4 {
		barW = colW - 1
	}
	eighths := []string{" ", "▁", "▂", "▃", "▄", "▅", "▆", "▇"}
	var out []line
	for r := height; r >= 1; r-- {
		var l line
		for i, d := range days {
			style := sBlueFg
			if i == len(days)-1 {
				style = sMagenta
			}
			v := 0.0
			if top > 0 {
				v = val(d) / top * float64(height)
			}
			ch := " "
			switch {
			case v >= float64(r):
				ch = "█"
			case v > float64(r-1):
				ch = eighths[int((v-float64(r-1))*8)]
			case r == 1:
				ch, style = "▁", sDim
			}
			l = append(l, seg{strings.Repeat(ch, barW), style}, seg{strings.Repeat(" ", colW-barW), sPlain})
		}
		out = append(out, l)
	}
	var vals, toks, names line
	for i, d := range days {
		style, ns, ts := sSub, sSub, sCyan
		if i == len(days)-1 {
			style, ns, ts = sAcc, sMagenta, sCyan.Bold(true)
		}
		v := money(d.CostUSD)
		if tok {
			v = human(d.Tokens)
		}
		if d.CostUSD >= 10 && !tok {
			v = fmt.Sprintf("$%.0f", d.CostUSD)
		}
		name := d.Date
		if t, err := time.Parse("2006-01-02", d.Date); err == nil {
			switch {
			case colW >= 9:
				name = t.Format("Mon 02")
			case colW >= 5:
				name = t.Format("Mon")
			default:
				name = t.Format("02")
			}
		}
		vals = append(vals, seg{pad(v, colW), style})
		toks = append(toks, seg{pad(human(d.Tokens), colW), ts})
		names = append(names, seg{pad(name, colW), ns})
	}
	if colW < 6 { // values don't fit under narrow bars: names only
		return append(out, names)
	}
	if tok {
		return append(out, vals, names)
	}
	return append(out, vals, toks, names)
}

// sessionCols: fixed columns around a title column that takes the rest.
// account and the two limit shares show from 70 columns.
type sessionCols struct{ project, title, models, account, share int }

func (u *usage) sessCols(width int) sessionCols {
	c := sessionCols{project: 17, models: 13, account: max(8, u.acctW+2), share: 6}
	if width < 180 { // model names are detail: shown only when the list has room to spare
		c.models = 0
	}
	if width < 70 {
		c.account, c.share = 0, 0
	}
	if width < 60 {
		c.project = 12
	}
	c.title = max(10, width-2-c.project-c.models-c.account-2*c.share-8-9)
	return c
}

func (u *usage) sessionHeader(width int) []line {
	c := u.sessCols(width)
	h := "  " + pad("project", c.project) + pad("session", c.title)
	if c.models > 0 {
		h += pad("models", c.models)
	}
	if c.account > 0 {
		h += pad("account", c.account) + padL("5h", c.share) + padL("week", c.share)
	}
	return []line{{{h + padL("tokens", 8) + padL("cost", 9), sHead}}, {{"  " + strings.Repeat("─", width-2), sDim}}}
}

// sharePct: a session's points of a limit window; blank when none or unknown.
func sharePct(p *float64) string {
	switch {
	case p == nil || *p <= 0:
		return ""
	case *p < 1:
		return "<1%"
	}
	return fmt.Sprintf("%.0f%%", *p)
}

func (u *usage) rowLine(r sessRow, width int) line {
	c := u.sessCols(width)
	if r.head { // a quiet divider: rule in slot 8, the day and its totals in slot 7
		cost, tok := 0.0, 0
		for _, x := range u.rows {
			if !x.head && x.day == r.day {
				cost += x.cost
				tok += x.tok
			}
		}
		name := r.day
		if t, err := time.Parse("2006-01-02", r.day); err == nil {
			name = t.Format("Monday 02 January")
		}
		rule := max(1, width-17-4-len(name)-1)
		return line{{"── ", sDim}, {name, sSub}, {" " + strings.Repeat("─", rule) + " ", sDim}, {padL(human(tok), 8), sSub}, {padL(money(cost), 9), sSub}}
	}
	s := r.s
	today := r.day == u.todayKey()
	mark := seg{"✓ ", sOK}
	switch {
	case s.Active && today:
		mark = seg{"● ", st("working").style}
	case s.Kind == "run":
		mark = seg{"󰐊 ", sCyan}
	}
	title := s.Title
	if title == "" {
		title = "session " + short(s.ID)
	}
	ps, ts := sBold, sPlain
	if !today {
		ps, ts = sSub, sSub
	}
	l := line{mark, {pad(s.Project, c.project-1) + " ", ps}, {pad(title, c.title-1) + " ", ts}}
	if c.models > 0 {
		l = append(l, seg{pad(models(s.Models), c.models-1) + " ", sSub})
	}
	if c.account > 0 {
		five, week := "", ""
		if r.first {
			five, week = sharePct(s.LimitShare.FiveHour), sharePct(s.LimitShare.Week)
		}
		l = append(l, seg{pad(s.Account, c.account), sSub}, seg{padL(five, c.share), sSub}, seg{padL(week, c.share), sSub})
	}
	cost := money(r.cost)
	if !r.priced {
		cost = "?"
	}
	return append(l, seg{padL(human(r.tok), 8), sCyan}, seg{padL(cost, 9), sYellow})
}

func (u *usage) totalLine(width int) line {
	t := u.Today
	return line{{pad(fmt.Sprintf("  %d %s today", u.nToday, plural(u.nToday, "session", "sessions")), width-17), sSub},
		{padL(human(t.Tokens), 8), sCyan.Bold(true)}, {padL(money(t.CostUSD), 9), sYellow.Bold(true)}}
}

// sessionBody: header, today's rows, total, then earlier days as far as rows allows.
// Returns the body and the index in it of each u.rows entry (for selection).
func (u *usage) sessionBody(width, rows int) ([]line, []int) {
	body := u.sessionHeader(width)
	idx := make([]int, len(u.rows))
	for i, r := range u.rows {
		if i == u.nToday && i > 0 {
			body = append(body, line{{"  " + strings.Repeat("─", width-2), sDim}}, u.totalLine(width), line{})
		}
		idx[i] = len(body)
		body = append(body, u.rowLine(r, width))
	}
	if u.nToday == len(u.rows) && u.nToday > 0 {
		body = append(body, line{{"  " + strings.Repeat("─", width-2), sDim}}, u.totalLine(width))
	}
	if len(u.rows) == 0 {
		body = append(body, line{{"no sessions yet", sSub}})
	}
	return body, idx
}

type saving struct {
	name, value, rate, what, brief string
	style                          lipgloss.Style
}

func (u *usage) savingRows(p rollup, label string) []saving {
	r := u.Rtk
	rtk := saving{"rtk", human(r.TodaySavedTokens) + " tok", fmt.Sprintf("%.0f%%", r.TodaySavedPct),
		fmt.Sprintf("trimmed from %d commands' output · %s all time", r.TodayCommands, human(r.SavedTokens)), "", sOK}
	if label != "today" {
		rtk = saving{"rtk", human(r.SavedTokens) + " tok", fmt.Sprintf("%.0f%%", r.SavedPct), "trimmed from command output, all time", "", sOK}
	}
	overhead := ""
	if r.Commands > 0 {
		overhead = fmt.Sprintf(" · %.1f s avg overhead · %d raw fallbacks", float64(r.TimeMs)/float64(r.Commands)/1000, r.Failures)
	}
	rtk.what += overhead
	rtk.brief = fmt.Sprintf("%d commands", r.TodayCommands)
	if label != "today" {
		rtk.brief = fmt.Sprintf("%d commands", r.Commands)
	}
	comp := sOK
	if p.Compactions > 0 {
		comp = sYellow
	}
	pending := sSub
	if u.Retros.PendingProposals > 0 {
		pending = sAcc
	}
	reviewed := u.Retros.Today
	if label != "today" {
		reviewed = u.Retros.Week
	}
	return []saving{
		rtk,
		{"prompt cache", money(p.CacheSaved), fmt.Sprintf("%d%%", p.CachePct), fmt.Sprintf("saved vs paying full input price for %s cache reads", human(p.CacheRead)),
			human(p.CacheRead) + " read", sOK},
		{"model routing", money(p.RouteSaved), "", fmt.Sprintf("%d of %d background runs on a cheaper model, priced at Opus", p.RoutedRuns, p.Runs),
			fmt.Sprintf("%d of %d runs", p.RoutedRuns, p.Runs), sOK},
		{"compactions", fmt.Sprint(p.Compactions), "", "sessions that filled their context window", "context filled", comp},
		{"retros", fmt.Sprint(reviewed), "", fmt.Sprintf("sessions reviewed · %d %s waiting for your OK", u.Retros.PendingProposals,
			plural(u.Retros.PendingProposals, "suggested change", "suggested changes")), fmt.Sprintf("%d to approve", u.Retros.PendingProposals), pending},
	}
}

func (u *usage) savingsLines(width int, p rollup, label string) []line {
	out := []line{{{"  " + pad("tool", 15) + padL(label, 10) + padL("rate", 6) + "   what it means", sHead}}, {{"  " + strings.Repeat("─", width-2), sDim}}}
	whatW := max(20, width-36)
	for _, s := range u.savingRows(p, label) {
		// The explanation wraps under itself instead of losing its figures to a cut.
		what := strings.Split(lipgloss.NewStyle().Width(whatW).Render(s.what), "\n")
		out = append(out, line{{"  " + pad(s.name, 15), sBold}, {padL(s.value, 10), s.style.Bold(true)}, {padL(s.rate, 6), s.style},
			{"   " + strings.TrimRight(what[0], " "), sSub}})
		for _, w := range what[1:] {
			out = append(out, line{{strings.Repeat(" ", 36), sPlain}, {strings.TrimRight(w, " "), sSub}})
		}
	}
	return out
}

// savingsCompact: one line per tool with a short note instead of the explanation, for narrow columns.
func (u *usage) savingsCompact(p rollup, label string) []line {
	var out []line
	for _, s := range u.savingRows(p, label) {
		out = append(out, line{{pad(s.name, 15), sBold}, {padL(s.value, 10), s.style.Bold(true)}, {padL(s.rate, 6), s.style}, {"   " + s.brief, sSub}})
	}
	return out
}

func barRows(items []named, width, n int, style lipgloss.Style, tokens bool) []line {
	if len(items) == 0 {
		return []line{{{"  nothing yet", sSub}}}
	}
	top := 0.0
	for _, e := range items {
		top = max(top, map[bool]float64{true: float64(e.Tokens), false: e.CostUSD}[tokens])
	}
	nameW := min(24, max(12, width/4))
	barW := max(6, width-2-nameW-10-1)
	var out []line
	for i, e := range items {
		if i >= n {
			break
		}
		v := map[bool]float64{true: float64(e.Tokens), false: e.CostUSD}[tokens]
		pct := 0.0
		if top > 0 {
			pct = v / top * 100
		}
		val := money(e.CostUSD)
		if tokens {
			val = human(e.Tokens)
		}
		l := line{{"  " + pad(e.Name, nameW), sBold}}
		l = append(l, lineBar(pct, barW, style)...)
		out = append(out, append(l, seg{padL(val, 10), sYellow}))
	}
	return out
}

func toolRows(tools []named, width, n int) []line {
	nameW := min(36, max(14, width/3))
	head := line{{"  " + pad("tool", nameW) + padL("calls", 7) + padL("tokens", 9) + padL("per call", 10) + "   share", sHead}}
	out := []line{head}
	top := 0
	for _, t := range tools {
		top = max(top, t.Tokens)
	}
	barW := max(4, width-2-nameW-7-9-10-3)
	for i, t := range tools {
		if i >= n {
			break
		}
		per := 0
		if t.Calls > 0 {
			per = t.Tokens / t.Calls
		}
		ps := sSub
		if per > 3000 {
			ps = sYellow
		}
		name := t.Name
		if t.Images > 0 {
			name += fmt.Sprintf(" (%d img)", t.Images)
		}
		l := line{{"  " + pad(name, nameW), sPlain}, {padL(fmt.Sprint(t.Calls), 7), sSub}, {padL(human(t.Tokens), 9), sCyan}, {padL(human(per), 10), ps}, {"   ", sPlain}}
		out = append(out, append(l, lineBar(float64(t.Tokens)/float64(max(1, top))*100, barW, sBlueFg)...))
	}
	if len(tools) == 0 {
		out = append(out, line{{"  no tool calls yet", sSub}})
	}
	return out
}

func (u *usage) historyLines(width int, p rollup, label string, rows int) []line {
	out := []line{{{"By project · " + label, sHead}}}
	out = append(out, barRows(p.ByProject, width, 6, sBlueFg, false)...)
	out = append(out, line{}, line{{"By model · " + label, sHead}})
	out = append(out, barRows(p.ByModel, width, 4, sMagenta, false)...)
	out = append(out, line{}, line{{"Context weight by tool · " + label, sHead}})
	return append(out, toolRows(p.Tools, width, max(6, rows-len(out)-1))...)
}

// ---------- views ----------

func title(name string, extra string) line {
	l := line{{name, sAcc}}
	if extra != "" {
		l = append(l, seg{" " + extra, sSub})
	}
	return l
}

// sessionsBox: the sessions list in a box of height h, scrolled to keep the selection visible.
func (m model) sessionsBox(w, h int) block {
	u := m.usage
	body, idx := u.sessionBody(w-4, h-2)
	sel := -1
	if m.uCursor < len(idx) {
		sel = idx[m.uCursor]
	}
	off := 0
	if visible := h - 2; sel >= visible {
		off = sel - visible + 1
	}
	return box(title("Sessions", fmt.Sprintf("today %d · then earlier days", u.nToday)), line{{"o open · c copy id", sSub}}, body, w, h, off, sel, true)
}

// usageView: two columns from 140 wide. Left: limits, spend (the 7-day bars
// take the leftover height) and savings; right: the sessions, full height.
// Narrower terminals stack the same boxes, sessions before savings.
func (m model) usageView(h int) block {
	u := m.usage
	if m.w < 140 {
		return m.usageStacked(h)
	}
	lw := max(56, min(92, m.w*38/100))
	rw := m.w - lw
	limits := box(title("Limits", ""), line{{"remaining", sSub}}, u.limitLines(lw-4), lw, 0, 0, -1, false)
	sav := box(title("Savings", "today"), line{{"3 history", sSub}}, u.savingsCompact(u.Today, "today"), lw, 0, 0, -1, false)
	left := append(block{}, limits...)
	if rest := h - len(limits) - len(sav); rest >= 6 {
		head := u.spendHead(lw - 4)
		fixed := 2 + len(head) + 1 + 3 // borders, figures, gap, the three label rows
		spend := func(boxH, chartH int) block {
			body := append([]line{}, head...)
			if chartH >= 3 {
				body = append(append(body, line{}), chart(u.Days, lw-4, chartH, false)...)
			}
			return box(title("Spend", "7 days"), nil, body, lw, boxH, 0, -1, false)
		}
		// Bars from 12 rows; a tall column adds the week's projects, the bars take what they leave.
		if left2 := rest - fixed - 12; left2 >= 8 {
			proj := box(title("By project", "7 days"), nil, barRows(u.Week.ByProject, lw-4, left2-2, sBlueFg, false), lw, 0, 0, -1, false)
			left = append(left, spend(0, 12+left2-len(proj))...)
			left = append(left, proj...)
		} else {
			left = append(left, spend(rest, rest-fixed)...)
		}
	}
	left = append(left, sav...)
	return hcat([]int{lw, rw}, left, m.sessionsBox(rw, h))
}

// usageStacked: narrow terminals. Limits, spend (bars only when the sessions
// still fit), sessions, one savings line.
func (m model) usageStacked(h int) block {
	u := m.usage
	w := m.w
	limits := box(title("Limits", ""), line{{"remaining", sSub}}, u.limitLines(w-4), w, 0, 0, -1, false)
	spendBody := u.spendHead(w - 4)
	minSess := min(u.nToday, 12) + 6
	if chartH := 5; h-len(limits)-(chartH+7+len(spendBody))-3-minSess >= 0 {
		spendBody = append(spendBody, line{})
		spendBody = append(spendBody, chart(u.Days, w-4, chartH, false)...)
	}
	spend := box(title("Spend", ""), nil, spendBody, w, 0, 0, -1, false)
	sav := box(title("Savings", "today"), line{{"3 history", sSub}}, []line{u.savingsOneLine()}, w, 0, 0, -1, false)
	sess := m.sessionsBox(w, max(5, h-len(limits)-len(spend)-len(sav)))
	out := append(append(append(block{}, limits...), spend...), sess...)
	return append(out, sav...)
}

func (u *usage) savingsOneLine() line {
	t := u.Today
	return line{{"rtk ", sSub}, {human(u.Rtk.TodaySavedTokens) + " tok", sOK}, {" · cache ", sSub}, {money(t.CacheSaved), sOK},
		{" · routing ", sSub}, {money(t.RouteSaved), sOK}, {fmt.Sprintf(" · %d retros", u.Retros.Today), sSub}}
}

func (m model) periodRollup() (rollup, string) {
	switch m.period {
	case "d":
		return m.usage.Today, "today"
	case "m":
		return m.usage.Month, "30 days"
	}
	return m.usage.Week, "7 days"
}

func periodTabs(cur string) line {
	l := line{}
	for _, p := range [][2]string{{"d", "today"}, {"w", "7 days"}, {"m", "30 days"}} {
		if p[0] == cur {
			l = append(l, seg{" " + p[1] + " ", sTabOn}, seg{" ", sPlain})
		} else {
			l = append(l, seg{p[0], sDim}, seg{" " + p[1] + "  ", sSub})
		}
	}
	return l
}

// dayCol: one column of the day table; columns that do not fit the width are left out, last first.
type dayCol struct {
	name string
	w    int
	val  func(d rollup) (string, lipgloss.Style)
}

var dayCols = []dayCol{
	{"spend", 10, func(d rollup) (string, lipgloss.Style) { return money(d.CostUSD), sYellow }},
	{"tokens", 9, func(d rollup) (string, lipgloss.Style) { return human(d.Tokens), sCyan }},
	{"cache saved", 13, func(d rollup) (string, lipgloss.Style) { return money(d.CacheSaved), sOK }},
	{"routing", 10, func(d rollup) (string, lipgloss.Style) { return money(d.RouteSaved), sOK }},
	{"sessions", 10, func(d rollup) (string, lipgloss.Style) { return fmt.Sprint(d.Sessions), sSub }},
	{"compactions", 13, func(d rollup) (string, lipgloss.Style) { return fmt.Sprint(d.Compactions), sSub }},
	{"cache", 7, func(d rollup) (string, lipgloss.Style) { return fmt.Sprintf("%d%%", d.CachePct), sSub }},
}

// dayTable: newest day first, one row per day with sessions, at most rows lines:
// spend and tokens, then what caching and routing saved.
func (u *usage) dayTable(width, rows int) []line {
	used := 2 + 14
	var cols []dayCol
	for _, c := range dayCols {
		if used+c.w > width {
			break
		}
		cols, used = append(cols, c), used+c.w
	}
	head := "  " + pad("day", 14)
	for _, c := range cols {
		head += padL(c.name, c.w)
	}
	out := []line{{{head, sHead}}}
	for i := len(u.History) - 1; i >= 0 && len(out) < rows; i-- {
		d := u.History[i]
		if d.Sessions == 0 {
			continue
		}
		name := d.Date
		if t, err := time.Parse("2006-01-02", d.Date); err == nil {
			name = t.Format("Mon 02 Jan")
		}
		ns := sPlain
		if d.Date == u.todayKey() {
			ns = sAcc
		}
		l := line{{"  " + pad(name, 14), ns}}
		for _, c := range cols {
			v, st := c.val(d)
			l = append(l, seg{padL(v, c.w), st})
		}
		out = append(out, l)
	}
	return out
}

// historyView: cost per day on top; breakdowns by project, model and tool,
// the savings for the period and the day table below.
func (m model) historyView(h int) block {
	u := m.usage
	p, label := m.periodRollup()
	w := m.w
	chartH := max(4, min(10, h/5))
	body := append([]line{{{money(u.Month.CostUSD), sBold}, {" in 30 days · ", sSub}, {human(u.Month.Tokens), sCyan}, {" tokens · ", sSub},
		{fmt.Sprint(u.Month.Sessions), sCyan}, {" sessions", sSub}}, append(line{{"today  ", sSub}}, u.splitLine()...), {}}, chart(u.History, w-4, chartH, false)...)
	cost := box(title("Cost per day", "30 days"), nil, body, w, 0, 0, -1, false)
	rest := h - len(cost)
	if w >= 150 {
		half := w / 2
		proj := box(title("By project", label), periodTabs(m.period), barRows(p.ByProject, half-4, 6, sBlueFg, false), half, 0, 0, -1, false)
		sav := box(title("Savings", label), nil, u.savingsLines(half-4, p, label), half, 0, 0, -1, false)
		left := append(proj, sav...)
		if r := rest - len(left); r >= 4 {
			left = append(left, box(title("By day", ""), nil, u.dayTable(half-4, r-2), half, r, 0, -1, false)...)
		}
		right := box(title("By model", label), nil, append(barRows(p.ByModel, w-half-4, 6, sMagenta, false), append([]line{{}, {{"Context weight by tool", sHead}}}, toolRows(p.Tools, w-half-4, rest-12)...)...), w-half, rest, 0, -1, false)
		return append(cost, hcat([]int{half, w - half}, left, right)...)
	}
	// The day table needs one row per day with sessions; the breakdown's tool
	// table takes the rest of a tall screen instead of leaving it blank.
	days := 0
	for _, d := range u.History {
		if d.Sessions > 0 {
			days++
		}
	}
	sav := box(title("Savings", label), nil, u.savingsLines(w-4, p, label), w, 0, 0, -1, false)
	br := box(title("Breakdown", label), periodTabs(m.period), u.historyLines(w-4, p, label, max(min(rest-2-len(sav), 26), rest-2-len(sav)-(days+3))), w, 0, 0, -1, false)
	out := append(cost, br...)
	if rest-len(br) >= len(sav) {
		out = append(out, sav...)
	}
	if left := h - len(out); left >= 5 {
		out = append(out, box(title("By day", ""), nil, u.dayTable(w-4, left-2), w, 0, 0, -1, false)...)
	}
	return out
}
