package main

// Agents page (req_011 round 2): Right now and Accounts on top, the day lanes under them
// (one row per session today, grouped by project), then the selected lane's tail with its
// question card and the Detail pane. Portrait stacks the top boxes and folds Detail into
// the tail box's tabs; under 100 columns one pane shows at a time.

import (
	"fmt"
	"github.com/mattn/go-runewidth"
	"strings"
	"time"

	"github.com/charmbracelet/lipgloss"
)

const (
	apLanes = iota
	apTail
	apDiff
	apDetail
	agentPanes
)

var agentPaneNames = [agentPanes]string{"lanes", "tail", "diff", "detail"}

// agentsView is the data and state an Agents render needs.
type agentsView struct {
	lk     *look
	fx     *fixtures
	now    time.Time
	sync   string
	pane   int
	sel    int // position in laneOrder
	input  string
	typing bool
	shift  int  // hours the lane window moved back ([ and ])
	full   bool // w: the whole day
	zoom   bool // d: Detail full screen
}

func (av agentsView) loading() bool { return av.sync == stLoading }

func (av agentsView) order() []int { return laneOrder(av.fx.Lanes) }

func (av agentsView) cur() *laneRow {
	o := av.order()
	if av.sel >= 0 && av.sel < len(o) {
		return &av.fx.Lanes[o[av.sel]]
	}
	return nil
}

func (av agentsView) agent(l *laneRow) *agentRow {
	if l == nil || l.Agent < 0 || l.Agent >= len(av.fx.Agents) {
		return nil
	}
	return &av.fx.Agents[l.Agent]
}

func (av agentsView) git(l *laneRow) *laneGit {
	if l == nil || l.Cwd == "" || av.fx.LaneGit == nil {
		return nil
	}
	return av.fx.LaneGit[l.Cwd]
}

func laneGlyph(lk *look, state string) seg {
	switch state {
	case lsNeeds:
		return seg{"!", lk.warn.Bold(true)}
	case lsWorking:
		return seg{"●", lk.ok}
	case lsIdle:
		return seg{"○", lk.sub}
	case lsRun:
		return seg{"◆", lk.cyan}
	case lsPaused:
		return seg{"‖", lk.warn}
	}
	return seg{"✓", lk.ok}
}

func wrap(s string, w int) []string {
	var out []string
	cur := ""
	for _, word := range strings.Fields(s) {
		if cur != "" && len([]rune(cur))+1+len([]rune(word)) > w {
			out, cur = append(out, cur), word
			continue
		}
		cur = strings.TrimSpace(cur + " " + word)
	}
	if cur != "" {
		out = append(out, cur)
	}
	return out
}

func dur(mins int) string {
	if mins >= 60 {
		return fmt.Sprintf("%dh%02d", mins/60, mins%60)
	}
	return fmt.Sprintf("%dm", mins)
}

// ctxWindow: the context window a session runs in. Past 200k it must be the 1M window.
func ctxWindow(ctx int) int {
	if ctx > 200_000 {
		return 1_000_000
	}
	return 200_000
}

// ctxLabel: the context used out of its window, e.g. "163k/200k".
func ctxLabel(ctx int) string {
	if ctxWindow(ctx) == 1_000_000 {
		return tokensK(ctx) + "/1M"
	}
	return tokensK(ctx) + "/200k"
}

// ctxBar is the context gauge: share of the session's window, coloured by how full it is.
func (av agentsView) ctxBar(ctx, cells int) line {
	lk := av.lk
	pct := min(100, ctx*100/ctxWindow(ctx))
	st := lk.ok
	switch {
	case pct >= 85:
		st = lk.bad
	case pct >= 60:
		st = lk.warn
	}
	return gaugeBar(lk, pct, cells, st)
}

// ----- Right now -----

func (av agentsView) rightNowRows(iw int, wide bool) []line {
	lk, fx := av.lk, av.fx
	var out []line
	for _, a := range fx.Agents {
		if a.Group != gRunning && a.Group != gRuns {
			continue
		}
		var g seg
		var lab seg
		switch {
		case a.Interrupted:
			g, lab = seg{"‖", lk.warn}, seg{"paused", lk.warn}
		case a.Group == gRuns:
			g, lab = seg{"◆", lk.cyan}, seg{"background", lk.cyan}
		case a.State == "idle":
			g, lab = seg{"○", lk.sub}, seg{"idle " + shortAge(av.now.Sub(a.Quiet)), lk.sub}
		default:
			g, lab = seg{"●", lk.ok}, seg{"working", lk.ok}
		}
		if a.Quiet.IsZero() && a.State == "idle" {
			lab = seg{"idle", lk.sub}
		}
		left := line{g, spc(1), {fit(cmpOr(a.Project, a.Name), 24), lk.bold}}
		if wide {
			left = append(left, seg{fit(strings.Trim(a.Account+" · "+a.Model, " ·"), 22), lk.sub})
		}
		left = append(left, seg{a.Doing, lk.plain})
		out = append(out, lr(left, line{lab}, iw))
	}
	for _, a := range fx.Agents {
		if a.Group != gDone {
			continue
		}
		what := strings.TrimPrefix(a.Doing, "finished: ")
		if _, d, ok := strings.Cut(a.Meta, " · "); ok {
			what += " · done in " + d
		}
		left := line{{"✓", lk.ok}, spc(1), {fit(a.Name, 24), lk.bold}}
		if wide {
			left = append(left, seg{fit(a.Short, 22), lk.sub})
		}
		left = append(left, seg{what, lk.sub})
		out = append(out, lr(left, line{{a.Since, lk.sub}}, iw))
	}
	return out
}

func (av agentsView) rightNowSpec(iw int, wide bool) boxSpec {
	lk := av.lk
	sp := boxSpec{title: "Right now", index: 1, sel: -1}
	sp.right = line{{fmt.Sprintf("bg slots %d/%d", av.fx.Slots[0], max(av.fx.Slots[1], 1)), lk.sub}}
	if av.loading() {
		sp.rows = []line{{{"syncing…", lk.sub}}}
		return sp
	}
	sp.rows = av.rightNowRows(iw, wide)
	if len(sp.rows) == 0 {
		sp.rows = []line{{{"Nothing running.", lk.sub}}}
	}
	return sp
}

// ----- Accounts -----

func (av agentsView) acctLine(g gauge, gw int) line {
	lk := av.lk
	name, dot := lk.plain, spc(1)
	if g.Policy == "use" {
		name, dot = lk.acc.Bold(true), seg{"●", lk.ok}
	}
	l := line{dot, spc(1), {fit(g.Account, 8), name}, {"5h ", lk.sub}}
	l = append(l, gaugeBar(lk, g.FiveH, gw, lk.level(g.FiveH))...)
	l = append(l, seg{fmt.Sprintf(" %3d%%", g.FiveH), lk.level(g.FiveH)})
	if g.Reset != "" {
		l = append(l, seg{" resets " + fit(g.Reset, 5), lk.sub})
	}
	if g.Week >= 0 {
		l = append(l, spc(3), seg{"week ", lk.sub})
		l = append(l, gaugeBar(lk, g.Week, gw, lk.level(g.Week))...)
		l = append(l, seg{fmt.Sprintf(" %3d%%", g.Week), lk.level(g.Week)})
	}
	switch {
	case g.Empty != "":
		l = append(l, spc(2), seg{"empty at " + g.Empty, lk.bad.Bold(true)})
	case g.Week >= 0 && g.Week < 5:
		l = append(l, spc(2), seg{"week spent", lk.warn})
	}
	return l
}

func (av agentsView) teamSegs(g gauge, gw int) line {
	lk := av.lk
	l := line{{fit(g.Account, 8), lk.sub}, {"5h ", lk.dim}}
	l = append(l, gaugeBar(lk, g.FiveH, gw, lk.level(g.FiveH))...)
	l = append(l, seg{fmt.Sprintf(" %3d%%  ", g.FiveH), lk.sub}, seg{"wk ", lk.dim})
	l = append(l, gaugeBar(lk, max(0, g.Week), gw, lk.level(max(0, g.Week)))...)
	return append(l, seg{fmt.Sprintf(" %3d%%", max(0, g.Week)), lk.sub})
}

func (av agentsView) acctRows(iw int, port bool) []line {
	lk, fx := av.lk, av.fx
	var out []line
	gw := min(12, max(4, (iw-46)/2)) // both gauges, their % and the reset fit in iw
	if port {
		gw = 14
	}
	for _, g := range fx.Gauges {
		out = append(out, av.acctLine(g, gw))
	}
	if len(fx.Team) == 0 {
		return out
	}
	out = append(out, line{{"team ", lk.head}, {rep("╌", iw-5), lk.dim}})
	if port {
		var l line
		for k, g := range fx.Team {
			if k > 0 {
				l = append(l, spc(4))
			}
			l = append(l, av.teamSegs(g, 6)...)
		}
		return append(out, l)
	}
	for _, g := range fx.Team {
		out = append(out, append(av.teamSegs(g, 8), spc(4), seg{"team · crow never uses it", lk.dim}))
	}
	return out
}

func (av agentsView) acctSpec(iw int, port bool) boxSpec {
	lk := av.lk
	sp := boxSpec{title: "Accounts today · % left", index: 2, sel: -1, right: line{{"→ 5 Usage", lk.sub}}}
	if av.loading() {
		sp.rows = []line{{{"syncing…", lk.sub}}}
		return sp
	}
	sp.rows = av.acctRows(iw, port)
	if len(sp.rows) == 0 {
		sp.rows = []line{{{"No account limits yet.", lk.sub}}}
	}
	return sp
}

// ----- day lanes -----

// window is the lane time range in minutes of the day.
func (av agentsView) window(port bool) (t0, t1 int) {
	span := 7
	if port {
		span = 5
	}
	end := min(24, av.now.Hour()+2)
	t1 = end * 60
	t0 = max(0, t1-span*60)
	if av.shift > 0 {
		t0 = max(0, t0-av.shift*60)
		t1 = t0 + span*60
	}
	if av.full {
		first := t0
		for _, l := range av.fx.Lanes {
			if f := l.First(); f >= 0 {
				first = min(first, f*10/60*60)
			}
		}
		t0, t1 = first, max(t1, end*60)
	}
	return t0, t1
}

// laneCol is one fixed column left of the bars; align 1 is right-aligned.
type laneCol struct {
	name     string
	w, align int
}

type laneCols struct {
	tw, rw, actw int
	cols         []laneCol
	port         bool
}

func (av agentsView) laneLayout(iw int, port bool) laneCols {
	c := laneCols{tw: 40, actw: 18, port: port}
	c.cols = []laneCol{{"model", 10, 0}, {"context", 17, 0}, {"cost", 6, 1}, {"time", 5, 1}}
	if port {
		c.tw, c.actw, c.cols = 32, 12, []laneCol{{"cost", 6, 1}}
	}
	used := func() int {
		n := 4 + c.tw + 2 + 2 + c.actw
		for _, k := range c.cols {
			n += k.w + 2
		}
		return n
	}
	for iw-used() < 20 && len(c.cols) > 1 {
		c.cols = c.cols[:len(c.cols)-1]
	}
	for iw-used() < 20 && c.tw > 16 {
		c.tw--
	}
	c.rw = max(10, iw-used())
	return c
}

func (c laneCols) lead() int {
	n := 4 + c.tw
	for _, k := range c.cols {
		n += k.w + 2
	}
	return n + 2
}

// laneCells paints one lane into rw cells: 'w' work, 'q' waits for you, 'i' idle.
func laneCells(l laneRow, now time.Time, t0, t1, rw int) []byte {
	cells := make([]byte, rw)
	x := func(m int) int { return (m - t0) * rw / max(1, t1-t0) }
	paint := func(b int, k byte) {
		a, z := max(b*10, t0), min(b*10+10, t1)
		if z <= a {
			return
		}
		x0 := x(a)
		x1 := max(x0+1, x(z))
		for i := max(0, x0); i < min(rw, x1); i++ {
			if k == 'w' || cells[i] == 0 || (k == 'q' && cells[i] == 'i') {
				cells[i] = k
			}
		}
	}
	f, la := l.First(), l.Last()
	if !l.Run && f >= 0 {
		for b := f; b <= la; b++ {
			paint(b, 'i')
		}
	}
	if l.State == lsNeeds {
		from := la + 1
		if !l.WaitFrom.IsZero() {
			from = min(from, (l.WaitFrom.Local().Hour()*60+l.WaitFrom.Local().Minute())/10)
		}
		nowB := (now.Hour()*60 + now.Minute()) / 10
		for b := max(0, from); b <= nowB; b++ {
			paint(b, 'q')
		}
	}
	for b := range l.Cells {
		paint(b, 'w')
	}
	return cells
}

func (av agentsView) laneBars(l laneRow, c laneCols, t0, t1 int) line {
	lk := av.lk
	cells := laneCells(l, av.now, t0, t1, c.rw)
	x := func(m int) int { return (m - t0) * c.rw / max(1, t1-t0) }
	grid := make([]byte, c.rw)
	for hr := (t0 + 59) / 60; hr*60 <= t1; hr++ {
		if p := x(hr * 60); p >= 0 && p < c.rw {
			grid[p] = 'h'
		}
	}
	nowM := av.now.Hour()*60 + av.now.Minute()
	if p := x(nowM); nowM >= t0 && nowM <= t1 && p >= 0 && p < c.rw {
		grid[p] = 'n'
	}
	work := lk.sub
	switch {
	case l.Run:
		work = lk.cyan
	case l.Live():
		work = lk.ok
	}
	var out line
	for i := 0; i < c.rw; {
		j := i
		for j < c.rw && cells[j] == cells[i] && (cells[i] != 0 || grid[j] == grid[i]) {
			j++
		}
		switch cells[i] {
		case 'w':
			out = append(out, seg{rep("█", j-i), work})
		case 'q':
			out = append(out, seg{rep("▓", j-i), lk.warn})
		case 'i':
			out = append(out, seg{rep("░", j-i), lk.dim})
		default:
			switch grid[i] {
			case 'h':
				out = append(out, seg{rep("┊", j-i), lk.dim})
			case 'n':
				out = append(out, seg{rep("╎", j-i), lk.acc})
			default:
				out = append(out, spc(j-i))
			}
		}
		i = j
	}
	return out
}

func (av agentsView) laneLine(l laneRow, c laneCols, t0, t1 int, sel bool) line {
	lk := av.lk
	mark := spc(2)
	ts := lk.plain
	if sel {
		mark, ts = seg{"› ", lk.acc.Bold(true)}, lk.bold
	}
	title := l.Title
	if l.Runs > 1 {
		title += fmt.Sprintf(" x%d runs", l.Runs)
	}
	out := line{mark, laneGlyph(lk, l.State), spc(1), {fit(title, c.tw), ts}}
	for _, k := range c.cols {
		out = append(out, spc(2))
		switch k.name {
		case "model":
			m := ""
			if l.Live() {
				m = l.Model
			}
			out = append(out, seg{fit(m, k.w), lk.sub})
		case "context":
			if l.Live() && !l.Run && l.Ctx > 0 {
				out = append(out, av.ctxBar(l.Ctx, 7)...)
				out = append(out, seg{fmt.Sprintf(" %-9s", ctxLabel(l.Ctx)), lk.sub})
			} else {
				out = append(out, spc(k.w))
			}
		case "cost":
			s := "-"
			if l.Cost >= 0.005 {
				s = money(l.Cost)
			}
			out = append(out, seg{fmt.Sprintf("%*s", k.w, s), lk.sub})
		case "time":
			s := dur(l.Mins())
			if l.Runs > 1 {
				s = fmt.Sprintf("x%d", l.Runs)
			} else if l.Mins() == 0 {
				s = "-"
			}
			out = append(out, seg{fmt.Sprintf("%*s", k.w, s), lk.sub})
		}
	}
	out = append(out, spc(1))
	if f := l.First(); f >= 0 && f*10 < t0 && l.Last()*10+10 > t0 {
		out = append(out, seg{"<", lk.sub})
	} else {
		out = append(out, spc(1))
	}
	out = append(out, av.laneBars(l, c, t0, t1)...)
	out = append(out, spc(2))
	switch {
	case l.NextYou:
		out = append(out, seg{"you: ", lk.warn.Bold(true)}, seg{fit(l.Next, max(0, c.actw-5)), lk.warn})
	case l.State == lsRun:
		out = append(out, seg{fit(l.Next, c.actw), lk.cyan})
	case l.State == lsPaused:
		out = append(out, seg{fit(l.Next, c.actw), lk.warn})
	case l.State == lsWorking:
		out = append(out, seg{fit(l.Next, c.actw), lk.ok})
	default:
		out = append(out, seg{fit(l.Next, c.actw), lk.dim})
	}
	return out
}

func (av agentsView) hourRuler(c laneCols, t0, t1 int) string {
	r := []rune(rep(" ", c.rw))
	cph := c.rw * 60 / max(1, t1-t0)
	step := 1
	if cph < 4 {
		step = 2
	}
	for hr := (t0 + 59) / 60; hr*60 <= t1; hr += step {
		p := (hr*60 - t0) * c.rw / max(1, t1-t0)
		lab := fmt.Sprintf("%02d", hr)
		if cph >= 8 {
			lab += ":00"
		}
		if p+len(lab) <= c.rw {
			copy(r[p:], []rune(lab))
		}
	}
	return string(r)
}

func (av agentsView) laneLegend(port bool, hidden int) line {
	lk := av.lk
	names := []string{" working  ", " waits for you  ", " idle  ", " finished  ", " background"}
	if port {
		names = []string{" work ", " waits ", " idle ", " done ", " bg"}
	}
	var l line
	if hidden > 0 {
		l = append(l, seg{fmt.Sprintf("%d earlier hidden (w)  ", hidden), lk.sub})
	}
	for i, st := range []seg{{"█", lk.ok}, {"▓", lk.warn}, {"░", lk.dim}, {"█", lk.sub}, {"█", lk.cyan}} {
		l = append(l, st, seg{names[i], lk.sub})
	}
	return l
}

// laneSpec draws the lanes box with room for rows body lines (now marker, header and
// legend included). The selection scrolls into view.
func (av agentsView) laneSpec(iw, rows int, port bool) boxSpec {
	lk := av.lk
	sp := boxSpec{title: "Agents", index: 3, sel: -1, focused: av.pane == apLanes}
	if av.loading() {
		sp.rows = []line{{{"syncing…", lk.sub}}}
		return sp
	}
	if len(av.fx.Lanes) == 0 {
		sp.rows = []line{{{"No session today yet.", lk.sub}}}
		return sp
	}
	nlive := 0
	for _, l := range av.fx.Lanes {
		if l.Live() {
			nlive++
		}
	}
	sp.title = fmt.Sprintf("Agents %d live · day lanes", nlive)
	t0, t1 := av.window(port)
	when := av.now.Format("today, Mon 2 Jan")
	if av.full {
		when += " · full day"
	}
	sp.right = line{{when, lk.sub}}
	c := av.laneLayout(iw, port)
	lead := c.lead()
	nowM := av.now.Hour()*60 + av.now.Minute()
	var top []line
	if nowM >= t0 && nowM <= t1 {
		p := lead + (nowM-t0)*c.rw/max(1, t1-t0)
		mk := fmt.Sprintf("now %02d:%02d", av.now.Hour(), av.now.Minute())
		top = append(top, line{spc(p - 1), {"▼ " + mk, lk.acc.Bold(true)}})
	} else {
		top = append(top, nil)
	}
	hdr := line{spc(4), {fit("title", c.tw), lk.head}}
	for _, k := range c.cols {
		h := fit(k.name, k.w)
		if k.align == 1 {
			h = fmt.Sprintf("%*s", k.w, k.name)
		}
		hdr = append(hdr, spc(2), seg{h, lk.head})
	}
	hdr = append(hdr, spc(2), seg{av.hourRuler(c, t0, t1), lk.head}, spc(2), seg{"next", lk.head})
	top = append(top, hdr)
	var body []line
	selRow, pos, hidden := -1, 0, 0
	for _, g := range groupLanes(av.fx.Lanes) {
		var shown []int
		for _, i := range g.Lanes {
			l := av.fx.Lanes[i]
			if la := l.Last(); la >= 0 && la*10+10 <= t0 && !l.Live() {
				hidden++
				pos++
				continue
			}
			shown = append(shown, i)
		}
		if len(shown) == 0 {
			continue
		}
		head := line{{g.Project, lk.bold}, {fmt.Sprintf("  %d", len(g.Lanes)), lk.sub}}
		if g.Need > 0 {
			head = append(head, seg{fmt.Sprintf("   %d need you", g.Need), lk.warn.Bold(true)})
		}
		if g.Running > 0 {
			head = append(head, seg{fmt.Sprintf("   %d running", g.Running), lk.ok})
		}
		head = append(head, spc(1), seg{rep("╌", iw-head.width()-1), lk.dim})
		body = append(body, head)
		for _, i := range g.Lanes {
			if !contains(shown, i) {
				continue
			}
			if pos == av.sel {
				selRow = len(body)
			}
			body = append(body, av.laneLine(av.fx.Lanes[i], c, t0, t1, pos == av.sel))
			pos++
		}
	}
	slots := max(1, rows-len(top)-1)
	off := 0
	if selRow >= slots {
		off = selRow - slots + 1
	}
	if off+slots > len(body) {
		off = max(0, len(body)-slots)
	}
	vis := body[off:min(len(body), off+slots)]
	sp.rows = append(top, vis...)
	for len(sp.rows) < rows-1 {
		sp.rows = append(sp.rows, nil)
	}
	leg := av.laneLegend(port, hidden)
	sp.rows = append(sp.rows, line{spc(iw - leg.width())}.trunc(iw))
	sp.rows[len(sp.rows)-1] = append(sp.rows[len(sp.rows)-1], leg...)
	if len(body) > slots {
		sp.bottom = fmt.Sprintf("lane %d of %d", av.sel+1, len(av.order()))
	}
	return sp
}

func contains(xs []int, v int) bool {
	for _, x := range xs {
		if x == v {
			return true
		}
	}
	return false
}

// laneRowsNeed is the body height the lanes want: now, header, groups, lanes, legend.
func (av agentsView) laneRowsNeed(port bool) int {
	if av.loading() || len(av.fx.Lanes) == 0 {
		return 1
	}
	t0, _ := av.window(port)
	n := 3
	for _, g := range groupLanes(av.fx.Lanes) {
		k := 0
		for _, i := range g.Lanes {
			l := av.fx.Lanes[i]
			if la := l.Last(); la >= 0 && la*10+10 <= t0 && !l.Live() {
				continue
			}
			k++
		}
		if k > 0 {
			n += k + 1
		}
	}
	return n
}

// ----- tail, diff, question card -----

// tabsTitle names the tabs on the border with the active one in brackets.
func tabsTitle(tabs []string, on int) string {
	out := make([]string, len(tabs))
	for i, t := range tabs {
		out[i] = t
		if i == on {
			out[i] = "[" + t + "]"
		}
	}
	return strings.Join(out, " ")
}

// laneHead is the first row of the tail box: who, where, context and the state.
func (av agentsView) laneHead(l *laneRow, iw int) line {
	lk := av.lk
	out := line{laneGlyph(lk, l.State), spc(1), {l.Project, lk.bold}, spc(2), {strings.Trim(l.Account+" · "+l.Model, " ·"), lk.sub}}
	if l.Ctx > 0 && !l.Run {
		out = append(out, seg{"  ctx ", lk.sub})
		out = append(out, av.ctxBar(l.Ctx, 7)...)
		out = append(out, seg{" " + ctxLabel(l.Ctx), lk.sub})
	}
	switch l.State {
	case lsNeeds:
		since := ""
		if !l.WaitFrom.IsZero() {
			since = " since " + clock(l.WaitFrom)
		}
		out = append(out, seg{"   waiting" + since, lk.warn})
	case lsWorking:
		out = append(out, seg{"   working", lk.ok})
	case lsRun:
		out = append(out, seg{"   background", lk.cyan})
	case lsIdle:
		out = append(out, seg{"   waits for your next prompt", lk.sub})
	case lsPaused:
		out = append(out, seg{"   paused, " + l.Next, lk.warn})
	default:
		if !l.End.IsZero() {
			out = append(out, seg{"   ended " + clock(l.End), lk.sub})
		}
	}
	return out.trunc(iw)
}

// tailLine is one tail entry wrapped to the box width: a message reads whole on a phone
// instead of ending in an ellipsis at the border.
func (av agentsView) tailLine(t tailLine, last, asks bool, iw int) []line {
	lk := av.lk
	text := t.Text
	label, rest, ok := strings.Cut(text, ": ")
	if !ok || len(label) > 18 || strings.Contains(label, " ") {
		label, rest = "", text
	}
	ls := lk.cyan.Bold(true)
	if label == "says" {
		ls = lk.ok.Bold(true)
	}
	rs := lk.plain
	if last && asks && (label == "says" || label == "AskUserQuestion") {
		ls, rs = lk.warn.Bold(true), lk.warn.Bold(true)
	}
	l := line{{"› ", lk.key}}
	if label != "" {
		l = append(l, seg{label + ":", ls}, spc(1))
	}
	parts := wrapFirst(rest, iw-l.width(), iw-2)
	if len(parts) == 0 {
		return []line{l}
	}
	out := []line{append(l, seg{parts[0], rs})}
	for _, p := range parts[1:] {
		out = append(out, line{spc(2), {p, rs}})
	}
	return out
}

// wrapFirst wraps s to first columns on the first row and to rest on the next ones.
func wrapFirst(s string, first, rest int) []string {
	first, rest = max(1, first), max(1, rest)
	var out []string
	cur, w := "", first
	for _, word := range strings.Fields(s) {
		if cur != "" && runewidth.StringWidth(cur)+1+runewidth.StringWidth(word) > w {
			out, cur, w = append(out, cur), word, rest
			continue
		}
		cur = strings.TrimSpace(cur + " " + word)
	}
	if cur != "" {
		out = append(out, cur)
	}
	return out
}

// askCard is the agent's question in a framed card with the answer keys.
func (av agentsView) askCard(l *laneRow, a *agentRow, iw, maxAsk int) []line {
	lk := av.lk
	in := iw - 4
	age := ""
	if !l.WaitFrom.IsZero() {
		age = " · " + shortAge(av.now.Sub(l.WaitFrom))
	}
	tl := line{{"╭─ ", lk.warn}, {"agent asks", lk.warn.Bold(true)}, {age + " ", lk.sub}}
	tr := line{{" " + l.Project + " ", lk.sub}, {"─╮", lk.warn}}
	mid := iw - tl.width() - tr.width()
	out := []line{append(append(tl, seg{rep("─", mid), lk.warn}), tr...)}
	row := func(c line) line {
		c = c.trunc(in)
		return append(append(line{{"│ ", lk.warn}}, c...), spc(in-c.width()), seg{" │", lk.warn})
	}
	ask := wrap(cmpOr(a.Ask, "waiting for your answer"), in)
	if maxAsk = max(3, maxAsk); len(ask) > maxAsk {
		ask = append(ask[:maxAsk-1:maxAsk-1], ask[maxAsk-1]+" …")
	}
	for _, s := range ask {
		out = append(out, row(line{{s, lk.plain}}))
	}
	out = append(out, row(nil))
	if av.typing {
		out = append(out, row(line{{"› ", lk.key}, {av.input, lk.plain}, {"▍", lk.acc}}))
		out = append(out, row(line{{"enter", lk.key}, {" send   ", lk.sub}, {"esc", lk.key}, {" cancel", lk.sub}}))
	} else {
		out = append(out, row(line{{"a", lk.key}, {" yes   ", lk.sub}, {"x", lk.key}, {" no   ", lk.sub}, {"e", lk.key}, {" yes, but…   ", lk.sub},
			{"c", lk.key}, {" own answer   ", lk.sub}, {"enter", lk.key}, {" open the session", lk.sub}}))
	}
	return append(out, line{{"╰" + rep("─", iw-2) + "╯", lk.warn}})
}

func (av agentsView) tailRows(l *laneRow, iw, n int) []line {
	lk := av.lk
	a := av.agent(l)
	rows := []line{av.laneHead(l, iw), {{rep("╌", iw), lk.dim}}}
	var card []line
	if a != nil && l.State == lsNeeds {
		// The question gets every row but 3 tail rows; the card's frame and keys take 5.
		card = append([]line{nil}, av.askCard(l, a, iw, n-len(rows)-5-3)...)
	} else if av.typing && a != nil {
		card = []line{nil, {{"› ", lk.key}, {av.input, lk.plain}, {"▍", lk.acc}}}
	}
	slots := max(0, n-len(rows)-len(card))
	var tail []line
	switch {
	case a != nil && len(a.Tail) > 0:
		for i, t := range a.Tail {
			rows := av.tailLine(t, i == len(a.Tail)-1, l.State == lsNeeds, iw)
			// The newest entry alone overflows: keep its start, say what is cut.
			if i == len(a.Tail)-1 && len(rows) > slots && slots > 1 {
				cut := len(rows) - (slots - 1)
				rows = append(rows[:slots-1:slots-1], line{spc(2), {fmt.Sprintf("… %d more lines, enter opens the session", cut), lk.sub}})
			}
			tail = append(tail, rows...)
		}
	case a != nil:
		tail = []line{{{cmpOr(a.Doing, "no activity yet"), lk.sub}}}
	default:
		tail = []line{{{"Session ended. enter resumes it in a new window.", lk.sub}}}
		if len(l.Files) > 0 {
			tail = append(tail, line{{fmt.Sprintf("edited %d files in this session", len(l.Files)), lk.sub}})
		}
	}
	if len(tail) > slots {
		tail = tail[len(tail)-slots:]
	}
	rows = append(rows, tail...)
	for len(rows) < n-len(card) {
		rows = append(rows, nil)
	}
	return append(rows, card...)
}

func diffStyle(lk *look, s string) lipgloss.Style {
	switch {
	case strings.HasPrefix(s, "+++"), strings.HasPrefix(s, "---"), strings.HasPrefix(s, "diff "), strings.HasPrefix(s, "index "):
		return lk.sub
	case strings.HasPrefix(s, "@@"):
		return lk.cyan
	case strings.HasPrefix(s, "+"):
		return lk.ok
	case strings.HasPrefix(s, "-"):
		return lk.bad
	}
	return lk.plain
}

func (av agentsView) diffRows(l *laneRow, iw, n int) []line {
	lk := av.lk
	rows := []line{av.laneHead(l, iw), {{rep("╌", iw), lk.dim}}}
	g := av.git(l)
	switch {
	case l.Cwd == "":
		rows = append(rows, line{{"No checkout known for this session.", lk.sub}})
	case g == nil || (g.At.IsZero() && g.Busy):
		rows = append(rows, line{{"reading the working tree…", lk.sub}})
	case g.Err != "":
		rows = append(rows, line{{l.Cwd + ": " + g.Err, lk.sub}})
	case len(g.Files) == 0:
		rows = append(rows, line{{"Working tree clean.", lk.sub}})
		if g.Last != "" {
			rows = append(rows, line{{"last commit  ", lk.sub}, {g.Last, lk.plain}})
		}
	default:
		for _, f := range g.Files {
			rows = append(rows, av.fileLine(f, iw))
		}
		rows = append(rows, nil)
		for _, d := range g.Diff {
			rows = append(rows, line{{d, diffStyle(lk, d)}})
		}
	}
	if len(rows) > n {
		rows = rows[:n]
	}
	return rows
}

func (av agentsView) fileLine(f gitFile, iw int) line {
	lk := av.lk
	pw := min(40, max(10, iw-16))
	l := line{spc(2), {fit(f.Path, pw), lk.plain}}
	if f.Binary {
		return append(l, seg{" binary", lk.sub})
	}
	return append(l, seg{fmt.Sprintf(" +%d", f.Add), lk.ok}, seg{fmt.Sprintf(" -%d", f.Del), lk.bad})
}

func (av agentsView) tailSpec(iw, h int, tabs []string) boxSpec {
	lk := av.lk
	on := 0
	switch av.pane {
	case apDiff:
		on = 1
	case apDetail:
		on = min(2, len(tabs)-1)
	}
	sp := boxSpec{title: tabsTitle(tabs, on), index: 4, sel: -1, focused: av.pane != apLanes}
	if len(tabs) == 2 && av.pane == apDetail {
		sp.focused = false
	}
	n := h - lk.boxH(0)
	if av.loading() {
		sp.rows = []line{{{"syncing…", lk.sub}}}
		return sp
	}
	l := av.cur()
	if l == nil {
		sp.rows = []line{{{"Nothing to show.", lk.sub}}}
		return sp
	}
	if len(tabs) == 3 {
		sp.right = line{{fmt.Sprintf("lane %d of %d", av.sel+1, len(av.order())), lk.sub}}
	} else {
		sp.right = line{{l.Title, lk.sub}}
	}
	switch {
	case on == 2:
		sp.rows = av.detailRows(l, iw, n)
	case on == 1:
		sp.rows = av.diffRows(l, iw, n)
	default:
		sp.rows = av.tailRows(l, iw, n)
	}
	return sp
}

// ----- Detail -----

func (av agentsView) gaugeOf(account string) (gauge, bool) {
	for _, g := range append(append([]gauge{}, av.fx.Gauges...), av.fx.Team...) {
		if g.Account == account {
			return g, true
		}
	}
	return gauge{}, false
}

func (av agentsView) mrOf(l *laneRow) *mrRow {
	if l.Branch == "" || l.Branch == "main" || l.Branch == "master" {
		return nil
	}
	for i, r := range av.fx.MRs {
		if r.Branch == l.Branch {
			return &av.fx.MRs[i]
		}
	}
	return nil
}

func tokSpark(vals []int) string {
	glyphs := []rune(" ▁▂▃▄▅▆▇█")
	top := 0
	for _, v := range vals {
		top = max(top, v)
	}
	var b strings.Builder
	for _, v := range vals {
		k := 0
		if top > 0 && v > 0 {
			k = max(1, v*8/top)
		}
		b.WriteRune(glyphs[k])
	}
	return b.String()
}

// tokChart: tokens per 10 min as a 3-row bar chart, the max and half labelled on the
// left, clock ticks under it, and the peak.
func (av agentsView) tokChart(l *laneRow, f, la, iw int) []line {
	lk := av.lk
	const lab = 7 // " 1.2M ┤"
	w := max(8, iw-lab-1)
	if la-f+1 > w {
		f = la - w + 1
	}
	peak, peakB := 0, f
	for b := f; b <= la; b++ {
		if l.Tok[b] > peak {
			peak, peakB = l.Tok[b], b
		}
	}
	const hh = 3
	bars := make([]*grid, hh)
	for i := range bars {
		bars[i] = newGrid(la-f+1, lk.ok)
	}
	for b := f; b <= la; b++ {
		for r, g := range barCells(l.Tok[b], peak, hh) {
			if g != " " {
				bars[r].put(b-f, g, lk.ok)
			}
		}
	}
	yl := []string{tokensShort(peak), tokensShort(peak / 2), "0"} // one per row, hh is 3
	rows := []line{{{"tokens per 10 min", lk.head}}}
	for r, g := range bars {
		rows = append(rows, line{{fmt.Sprintf("%5s ┤", yl[r]), lk.dim}}.join(g.line()))
	}
	n := la - f + 1
	axis := newGrid(n, lk.dim)
	axis.put(0, clock(bucketTime(av.now, f)), lk.dim)
	if n >= 12 {
		axis.put(n-5, clock(bucketTime(av.now, la)), lk.dim)
	}
	for b := 9; b < n; b += 9 {
		if axis.free(b-1, 7) {
			axis.put(b, clock(bucketTime(av.now, f+b)), lk.dim)
		}
	}
	rows = append(rows, line{{fit("", lab), lk.dim}}.join(axis.line()))
	note := fmt.Sprintf("peak %s at %s", tokensShort(peak), clock(bucketTime(av.now, peakB)))
	switch l.State {
	case lsNeeds:
		note += "  ·  now waiting for you"
	case lsWorking, lsRun:
		note += "  ·  still going"
	}
	return append(rows, line{{fit("", lab), lk.dim}, {note, lk.sub}})
}

func (av agentsView) detailRows(l *laneRow, iw, n int) []line {
	lk := av.lk
	var rows []line
	kv := func(k string, v ...seg) { rows = append(rows, append(line{{fit(k, 9), lk.sub}}, v...)) }
	title := l.Title
	if l.Runs > 1 {
		title += fmt.Sprintf(" (%d runs today)", l.Runs)
	}
	kv("task", seg{title, lk.plain})
	if l.Branch != "" {
		kv("branch", seg{l.Branch, lk.plain}, seg{"  ·  repo " + l.Project, lk.sub})
	} else {
		kv("repo", seg{l.Project, lk.plain})
	}
	if r := av.mrOf(l); r != nil {
		kv("linked", seg{r.Ref + " " + r.Title, lk.plain})
	} else if l.Branch != "" {
		kv("linked", seg{"no MR on this branch", lk.sub})
	}
	if l.Account != "" {
		acct := line{{l.Account, lk.plain}}
		if g, ok := av.gaugeOf(l.Account); ok {
			s := fmt.Sprintf("  5h %d%% left", g.FiveH)
			if g.Week >= 0 {
				s += fmt.Sprintf(", week %d%% left", g.Week)
			}
			if g.Policy != "" {
				s += "  ·  policy " + g.Policy
			}
			acct = append(acct, seg{s, lk.sub})
		}
		kv("account", acct...)
	}
	if !l.Start.IsZero() {
		s := clock(l.Start) + "  ·  " + dur(l.Mins()) + " active today"
		if !l.End.IsZero() {
			s += "  ·  last activity " + shortAge(av.now.Sub(l.End)) + " ago"
		}
		kv("started", seg{s, lk.plain})
	}
	if l.Tokens > 0 {
		s := tokensShort(l.Tokens)
		if l.Priced {
			s += "  ·  " + money(l.Cost) + " today"
		}
		s += fmt.Sprintf("  ·  cache read %d%%  ·  %d %s", l.CachePct, l.Compactions, plural(l.Compactions, "compaction", "compactions"))
		kv("tokens", seg{s, lk.plain})
	}
	if f, la := l.First(), l.Last(); f >= 0 && len(l.Tok) > 0 {
		rows = append(rows, av.tokChart(l, f, la, iw)...)
	}
	rows = append(rows, nil)
	g := av.git(l)
	switch {
	case g != nil && g.Err == "" && !g.At.IsZero():
		rows = append(rows, line{{"working tree ", lk.head}, {fmt.Sprintf("%d %s changed", len(g.Files), plural(len(g.Files), "file", "files")), lk.sub}})
		for i, f := range g.Files {
			if i == 6 {
				rows = append(rows, line{spc(2), {fmt.Sprintf("+%d more (tab: diff)", len(g.Files)-6), lk.sub}})
				break
			}
			rows = append(rows, av.fileLine(f, iw))
		}
		if g.Last != "" {
			rows = append(rows, line{spc(2), {"last on branch  ", lk.sub}, {g.Last, lk.plain}})
		}
	case len(l.Files) > 0:
		rows = append(rows, line{{"edited ", lk.head}, {fmt.Sprintf("%d %s in this session", len(l.Files), plural(len(l.Files), "file", "files")), lk.sub}})
		k := 0
		for _, name := range sortedKeys(l.Files) {
			if k == 6 {
				break
			}
			rows = append(rows, line{spc(2), {fit(name, 30), lk.plain}, {fmt.Sprintf(" %d %s", l.Files[name], plural(l.Files[name], "edit", "edits")), lk.sub}})
			k++
		}
	}
	if len(rows) > n {
		rows = rows[:n]
	}
	return rows
}

func sortedKeys(m map[string]int) []string {
	var ks []string
	for k := range m {
		ks = append(ks, k)
	}
	for i := range ks {
		for j := i + 1; j < len(ks); j++ {
			if m[ks[j]] > m[ks[i]] || (m[ks[j]] == m[ks[i]] && ks[j] < ks[i]) {
				ks[i], ks[j] = ks[j], ks[i]
			}
		}
	}
	return ks
}

func (av agentsView) detailSpec(iw, h int) boxSpec {
	lk := av.lk
	sp := boxSpec{title: "Detail · selected lane", index: 5, sel: -1, focused: av.pane == apDetail}
	sp.right = line{{"d full screen", lk.sub}}
	if av.zoom {
		sp.right = line{{"d back", lk.sub}}
	}
	if av.loading() {
		sp.rows = []line{{{"syncing…", lk.sub}}}
		return sp
	}
	l := av.cur()
	if l == nil {
		sp.rows = []line{{{"Select a lane.", lk.sub}}}
		return sp
	}
	sp.rows = av.detailRows(l, iw, h-lk.boxH(0))
	return sp
}

// ----- layout -----

func (av agentsView) body(w, h int) []string {
	lk := av.lk
	lay := layoutFor(w)
	var out block
	switch {
	case av.zoom:
		out = lk.box(av.detailSpec(lk.innerW(w), h), w, h)
	case lay == laySingle:
		out = av.single(w, h)
	case lay == layLandscape:
		out = av.landscape(w, h)
	default:
		out = av.portrait(w, h)
	}
	for len(out) < h {
		out = append(out, blank(w))
	}
	return out[:h]
}

func (av agentsView) gaps() (gh, gv int) { return av.lk.gaps() }

func (av agentsView) landscape(w, h int) block {
	lk := av.lk
	gh, gv := av.gaps()
	aw := min(92, w*2/5)
	rw := w - aw - gh
	rn := av.rightNowSpec(lk.innerW(rw), true)
	ac := av.acctSpec(lk.innerW(aw), false)
	topH := lk.boxH(min(8, max(len(rn.rows), len(ac.rows))))
	top := hcat([]int{rw, aw}, gh, lk.box(rn, rw, topH), lk.box(ac, aw, topH))
	rest := h - topH - 2*gv
	lanesH := min(lk.boxH(av.laneRowsNeed(false)), rest-16)
	lanesH = max(lanesH, min(rest, lk.boxH(5)))
	lanes := lk.box(av.laneSpec(lk.innerW(w), lanesH-lk.boxH(0), false), w, lanesH)
	botH := rest - lanesH
	out := vcat(top, blankLines(w, gv), lanes, blankLines(w, gv))
	if botH < lk.boxH(2) {
		return out
	}
	lw := (w - gh) * 124 / 235
	dw := w - gh - lw
	tail := lk.box(av.tailSpec(lk.innerW(lw), botH, []string{"tail", "diff"}), lw, botH)
	det := lk.box(av.detailSpec(lk.innerW(dw), botH), dw, botH)
	return vcat(out, hcat([]int{lw, dw}, gh, tail, det))
}

func (av agentsView) portrait(w, h int) block {
	lk := av.lk
	_, gv := av.gaps()
	rn := av.rightNowSpec(lk.innerW(w), false)
	rnH := lk.boxH(min(6, len(rn.rows)))
	ac := av.acctSpec(lk.innerW(w), true)
	acH := lk.boxH(len(ac.rows))
	rest := h - rnH - acH - 3*gv
	lanesH := min(lk.boxH(av.laneRowsNeed(true)), rest-18)
	lanesH = max(lanesH, min(rest, lk.boxH(5)))
	out := vcat(lk.box(rn, w, rnH), blankLines(w, gv), lk.box(ac, w, acH), blankLines(w, gv),
		lk.box(av.laneSpec(lk.innerW(w), lanesH-lk.boxH(0), true), w, lanesH), blankLines(w, gv))
	botH := h - len(out)
	if botH < lk.boxH(2) {
		return out
	}
	return vcat(out, lk.box(av.tailSpec(lk.innerW(w), botH, []string{"tail", "diff", "detail"}), w, botH))
}

func blankLines(w, n int) block {
	var b block
	for i := 0; i < n; i++ {
		b = append(b, blank(w))
	}
	return b
}

func (av agentsView) single(w, h int) block {
	lk := av.lk
	pos := fmt.Sprintf("%s · pane %d of %d · tab", agentPaneNames[av.pane], av.pane+1, agentPanes)
	var sp boxSpec
	if av.pane == apLanes {
		sp = av.laneSpec(lk.innerW(w), h-lk.boxH(0), true)
	} else {
		sp = av.tailSpec(lk.innerW(w), h, []string{"tail", "diff", "detail"})
	}
	sp.bottom = pos
	return lk.box(sp, w, h)
}
