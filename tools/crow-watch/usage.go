// Usage view (limits, spend, sessions, breakdowns), fed by `crow-usage --json` every 30 seconds.
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

// shown: whether u.rows[i] is on screen. Day headers always are; today's sessions
// too; an earlier day's sessions only while its header is expanded.
func (u *usage) shown(i int, exp map[string]bool) bool {
	r := u.rows[i]
	return r.head || r.day == u.todayKey() || exp[r.day]
}

// visible: the indexes into u.rows on screen, in order. The cursor moves over these.
func (u *usage) visible(exp map[string]bool) []int {
	var out []int
	for i := range u.rows {
		if u.shown(i, exp) {
			out = append(out, i)
		}
	}
	return out
}

// pick: the row under cursor i of the visible list, nil when out of range.
func (u *usage) pick(exp map[string]bool, i int) *sessRow {
	if u == nil {
		return nil
	}
	vis := u.visible(exp)
	if i < 0 || i >= len(vis) {
		return nil
	}
	return &u.rows[vis[i]]
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

// spendHead: the three spend figures, then the period's tokens and its split
// (new input, output, cache), each line cut back to what fits the width.
func (u *usage) spendHead(width int, p rollup) []line {
	figs := line{{money(u.Today.CostUSD), sBold.Foreground(cWhite)}, {" today   ", sSub}, {money(u.Week.CostUSD), sBold}, {" last 7 days   ", sSub},
		{money(u.Month.CostUSD), sBold}, {" 30 days", sSub}}
	tok := line{{human(p.Tokens), sCyan}, {fmt.Sprintf(" tokens · %d %s", p.Sessions, plural(p.Sessions, "session", "sessions")), sSub}}
	if p.Unpriced > 0 {
		tok = append(tok, seg{fmt.Sprintf(" · %d unpriced", p.Unpriced), sYellow})
	}
	parts := []line{
		{{"in ", sSub}, {human(p.Input), sCyan}},
		{{" · out ", sSub}, {human(p.Output), sCyan}},
		{{" · cache read ", sSub}, {human(p.CacheRead), sCyan}, {fmt.Sprintf(" (%d%%)", p.CachePct), sSub}},
		{{" · write ", sSub}, {human(p.CacheWrite), sCyan}},
	}
	var split line
	for _, part := range parts {
		if split.width()+part.width() > width {
			break
		}
		split = append(split, part...)
	}
	return []line{figs, tok, split}
}

// chartLabelRows: the rows under the bars: value, tokens and day from 6 columns per day, else the day alone.
func chartLabelRows(days, width int) int {
	if days == 0 {
		return 0
	}
	if max(3, min(14, width/days)) < 6 {
		return 1
	}
	return 3
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

func (u *usage) rowLine(r sessRow, width int, open bool) line {
	c := u.sessCols(width)
	if r.head { // a day divider that folds: chevron, the day, a rule, its totals
		cost, tok, n := 0.0, 0, 0
		for _, x := range u.rows {
			if !x.head && x.day == r.day {
				cost += x.cost
				tok += x.tok
				n++
			}
		}
		name := r.day
		if t, err := time.Parse("2006-01-02", r.day); err == nil {
			name = t.Format("Monday 02 January")
		}
		chev := "+"
		if open {
			chev = "-"
		}
		count := fmt.Sprintf(" · %d %s", n, plural(n, "session", "sessions"))
		rule := max(1, width-17-4-len(name)-len(count)-1)
		return line{{chev + " ", sAcc}, {name, sSub}, {count, sDim}, {" " + strings.Repeat("─", rule) + " ", sDim}, {padL(human(tok), 8), sSub}, {padL(money(cost), 9), sSub}}
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

// sessionBody: header, today's rows, total, then the earlier days' headers (their
// sessions only while expanded). Returns the body and, per visible row, its index in it.
func (u *usage) sessionBody(width int, exp map[string]bool) ([]line, []int) {
	body := u.sessionHeader(width)
	var idx []int
	for i, r := range u.rows {
		if i == u.nToday && i > 0 {
			body = append(body, line{{"  " + strings.Repeat("─", width-2), sDim}}, u.totalLine(width), line{})
		}
		if !u.shown(i, exp) {
			continue
		}
		idx = append(idx, len(body))
		body = append(body, u.rowLine(r, width, exp[r.day]))
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

// savingsCompact: one line per tool with a short note; the full explanations are in the ? help.
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

// ---------- views ----------

func title(name string, extra string) line {
	l := line{{name, sAcc}}
	if extra != "" {
		l = append(l, seg{" " + extra, sSub})
	}
	return l
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

// chartDays: 7 days for today and the week, 30 for the month.
func (m model) chartDays() []rollup {
	if m.period == "m" {
		return m.usage.History
	}
	return m.usage.Days
}

// sessionsBox: the sessions list in a box of height h (0: fit the content), scrolled to keep the selection visible.
func (m model) sessionsBox(w, h int) block {
	u := m.usage
	body, idx := u.sessionBody(w-4, m.expanded)
	if h <= 0 {
		h = len(body) + 2
	}
	sel := -1
	if m.uCursor < len(idx) {
		sel = idx[m.uCursor]
	}
	off := 0
	if visible := h - 2; sel >= visible {
		off = sel - visible + 1
	}
	return box(title("Sessions", fmt.Sprintf("today %d · earlier days folded", u.nToday)), line{{"o open · c copy id · ⏎ fold day", sSub}}, body, w, h, off, sel, true)
}

// sessionsWant: the lines the sessions box needs to show everything expanded so far.
func (m model) sessionsWant(w int) int {
	body, _ := m.usage.sessionBody(w-4, m.expanded)
	return len(body) + 2
}

// spendBox: spend figures, then the bars with whatever height is left; h <= 0 fits the figures and a 6-row chart.
func (m model) spendBox(w, h int) block {
	u := m.usage
	p, _ := m.periodRollup()
	days := m.chartDays()
	head := u.spendHead(w-4, p)
	labels := chartLabelRows(len(days), w-4)
	if h <= 0 {
		h = 2 + len(head) + 1 + 6 + labels
	}
	body := append([]line{}, head...)
	if chartH := h - 2 - len(head) - 1 - labels; chartH >= 3 {
		body = append(append(body, line{}), chart(days, w-4, chartH, false)...)
	}
	return box(title("Spend", ""), periodTabs(m.period), body, w, h, 0, -1, false)
}

func (m model) limitsBox(w int) block {
	return box(title("Limits", ""), line{{"remaining", sSub}}, m.usage.limitLines(w-4), w, 0, 0, -1, false)
}

func (m model) savingsBox(w int, oneLine bool) block {
	p, label := m.periodRollup()
	body := m.usage.savingsCompact(p, label)
	if oneLine {
		body = []line{m.usage.savingsOneLine(p, label)}
	}
	return box(title("Savings", label), line{{"? what they mean", sSub}}, body, w, 0, 0, -1, false)
}

func (m model) projectBox(w, n int) block {
	p, label := m.periodRollup()
	return box(title("By project", label), nil, barRows(p.ByProject, w-4, n, sBlueFg, false), w, 0, 0, -1, false)
}

func (m model) modelBox(w, n int) block {
	p, label := m.periodRollup()
	return box(title("By model", label), nil, barRows(p.ByModel, w-4, n, sMagenta, false), w, 0, 0, -1, false)
}

// toolsBox: the context weight of each tool, in a box of h rows. Off by default (key t).
func (m model) toolsBox(w, h int) block {
	p, label := m.periodRollup()
	return box(title("Context weight by tool", label), line{{"t hide", sSub}}, toolRows(p.Tools, w-4, h-3), w, h, 0, -1, false)
}

// breakdowns: By project and By model (or the tool weights when toggled) in the h rows given,
// each box sized to its content, dropped when the rows run out.
func (m model) breakdowns(w, h int) block {
	p, _ := m.periodRollup()
	var out block
	if m.tools {
		if h >= 8 {
			out = m.toolsBox(w, h)
		}
		return out
	}
	if h >= 5 {
		pb := m.projectBox(w, max(1, min(min(len(p.ByProject), 6), h-2)))
		out = append(out, pb...)
		h -= len(pb)
	}
	if h >= 4 {
		out = append(out, m.modelBox(w, max(1, min(min(len(p.ByModel), 4), h-2)))...)
	}
	return out
}

// usageView: two columns from 140 wide. Left: limits, spend (the bars take the
// leftover height) and savings. Right: the sessions, as tall as their content,
// then the breakdowns. Narrower terminals stack the same boxes.
func (m model) usageView(h int) block {
	if m.w < 140 {
		return m.usageStacked(h)
	}
	lw := max(56, min(92, m.w*38/100))
	rw := m.w - lw
	limits := m.limitsBox(lw)
	sav := m.savingsBox(lw, false)
	left := append(block{}, limits...)
	left = append(left, m.spendBox(lw, max(0, h-len(limits)-len(sav)))...)
	left = append(left, sav...)
	// Sessions as tall as they are, but the breakdowns keep a share of the column.
	sessH := min(m.sessionsWant(rw), max(8, h-14))
	if m.tools {
		sessH = min(sessH, max(8, h-12))
	}
	right := m.sessionsBox(rw, sessH)
	right = append(right, m.breakdowns(rw, h-sessH)...)
	return hcat([]int{lw, rw}, left, right)
}

// usageStacked: narrow terminals, one column. Limits and the spend figures first, then the
// sessions; what room is left goes to the bars, savings and breakdowns in that order.
func (m model) usageStacked(h int) block {
	u := m.usage
	w := m.w
	p, _ := m.periodRollup()
	limits := m.limitsBox(w)
	rem := h - len(limits)
	headN := len(u.spendHead(w-4, p))
	rem -= 2 + headN
	days := m.chartDays()
	chartBox := 1 + 5 + chartLabelRows(len(days), w-4)
	sessMin := min(u.nToday, 12) + 6
	want := m.sessionsWant(w)
	rem -= min(want, sessMin)
	chartH := 0
	if rem >= chartBox {
		rem -= chartBox
		chartH = 5
	}
	oneLine := true
	savN := 0
	if rem >= 7 {
		rem, savN, oneLine = rem-7, 7, false
	} else if rem >= 3 {
		rem, savN = rem-3, 3
	}
	sessExtra := min(want-min(want, sessMin), rem)
	rem -= sessExtra
	var ana block
	if rem >= 5 {
		ana = m.breakdowns(w, rem)
		rem -= len(ana)
	}
	if chartH > 0 { // leftover height goes to the bars, not to blank sessions rows
		chartH += min(rem, 14)
		rem -= min(rem, 14)
	}
	sessH := min(want, sessMin) + sessExtra
	body := append([]line{}, u.spendHead(w-4, p)...)
	spendH := 2 + headN
	if chartH > 0 {
		body = append(append(body, line{}), chart(days, w-4, chartH, false)...)
		spendH = 0
	}
	out := append(block{}, limits...)
	out = append(out, box(title("Spend", ""), periodTabs(m.period), body, w, spendH, 0, -1, false)...)
	out = append(out, m.sessionsBox(w, max(5, sessH))...)
	if savN > 0 {
		out = append(out, m.savingsBox(w, oneLine)...)
	}
	return append(out, ana...)
}

func (u *usage) savingsOneLine(p rollup, label string) line {
	rtk := u.Rtk.SavedTokens
	if label == "today" {
		rtk = u.Rtk.TodaySavedTokens
	}
	return line{{"rtk ", sSub}, {human(rtk) + " tok", sOK}, {" · cache ", sSub}, {money(p.CacheSaved), sOK},
		{" · routing ", sSub}, {money(p.RouteSaved), sOK}, {fmt.Sprintf(" · %d retros", u.Retros.Today), sSub}}
}
