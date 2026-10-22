// Agents view: background runs, open sessions and finished runs as a table,
// the selected agent's details, and a timeline of who worked when today.
package main

import (
	"cmp"
	"fmt"
	"os"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/charmbracelet/lipgloss"
	"github.com/mattn/go-runewidth"
)

// contextWindow: the model window the context % is measured against.
func contextWindow() int {
	if n, err := strconv.Atoi(os.Getenv("CROW_CONTEXT_WINDOW")); err == nil && n > 0 {
		return n
	}
	return 1_000_000
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

func (m model) since(iso string) float64 {
	t, err := time.Parse(time.RFC3339, iso)
	if err != nil {
		t, err = time.Parse("2006-01-02T15:04:05.000Z", iso)
		if err != nil {
			return -1
		}
	}
	return m.clock().Sub(t).Seconds()
}

func ended(sec float64) string {
	if sec < 0 {
		return ""
	}
	return " " + age(sec) + " ago"
}

func clockOf(iso string) string {
	t, err := time.Parse(time.RFC3339Nano, iso)
	if err != nil {
		return "     "
	}
	return t.Local().Format("15:04")
}

// rowCols: one line per agent. Project, age and context columns sized to the
// rows' content, around a task and a "what is happening" column that share the rest.
type rowCols struct{ project, task, detail, age, ctx int }

func agCols(width int, rows []agentRow) rowCols {
	c := rowCols{project: 8}
	for _, r := range rows {
		c.project = max(c.project, runewidth.StringWidth(r.project)+1)
		c.age = max(c.age, runewidth.StringWidth(r.when)+1)
		if r.ctx.text != "" {
			c.ctx = max(c.ctx, runewidth.StringWidth(r.ctx.text)+2)
		}
	}
	c.project = min(c.project, map[bool]int{true: 13, false: 18}[width < 100])
	flex := max(20, width-2-c.project-c.age-c.ctx)
	c.task = max(12, flex*45/100)
	c.detail = flex - c.task
	return c
}

// ctxTag: the context gauge only once a session nears compaction (70 % and up).
func ctxTag(tokens int) seg {
	pct := float64(tokens) * 100 / float64(contextWindow())
	switch {
	case tokens == 0 || pct < 70:
		return seg{"", sPlain}
	case pct >= 85:
		return seg{fmt.Sprintf("ctx %.0f%%", pct), sErr}
	default:
		return seg{fmt.Sprintf("ctx %.0f%%", pct), lipgloss.NewStyle().Foreground(cYellow).Bold(true)}
	}
}

// commitCount: "3 commits", or "" when there are none.
func commitCount(n int) string {
	if n == 0 {
		return ""
	}
	return fmt.Sprintf("%d %s", n, plural(n, "commit", "commits"))
}

func joinDot(parts ...string) string {
	var out []string
	for _, p := range parts {
		if p != "" {
			out = append(out, p)
		}
	}
	return strings.Join(out, " · ")
}

// limitName: the registry's limit kind in words.
func limitName(kind string) string {
	switch kind {
	case "five_hour":
		return "5h limit"
	case "seven_day", "week", "weekly":
		return "weekly limit"
	}
	return "usage limit"
}

// intrTitle: the session's title from the usage data, else its first prompt.
func (m model) intrTitle(s *interrupted) string {
	if m.usage != nil {
		if u := m.usage.byID[s.ID]; u != nil && u.Title != "" {
			return u.Title
		}
	}
	t, _, _ := strings.Cut(strings.TrimSpace(s.FirstPrompt), "\n")
	return cmp.Or(t, "session "+short(s.ID))
}

func resetClock(unix int64) string {
	if unix <= 0 {
		return ""
	}
	return time.Unix(unix, 0).Local().Format("15:04")
}

// agentRow: the fields of one row before they are laid out in columns.
type agentRow struct {
	glyph, detail, ctx  seg
	project, task, when string
	ps, ts              lipgloss.Style
}

// itemRow: one row. glyph · project · task · what is happening · age · context.
func (m model) itemRow(it item) agentRow {
	var glyph seg
	var project, task, when string
	var detail seg
	ctx := seg{"", sPlain}
	ps, ts := sBold, sPlain
	switch {
	case it.agent != nil:
		a := it.agent
		s := st(a.State)
		glyph = seg{s.glyph + " ", s.style}
		project = a.Project
		task = cmp.Or(a.Label, a.Title)
		if task == "" {
			task = map[bool]string{true: "session " + short(a.SessionID), false: "(not dispatched by crow)"}[a.Kind == "session"]
		}
		action, _, _ := strings.Cut(a.LastAction, "\n")
		switch a.State {
		case "waiting":
			detail = seg{"waiting for your reply", sMagenta}
		case "idle":
			detail, ps, ts = seg{action, sSub}, sSub, sSub
		default:
			detail = seg{action, sCyan}
		}
		when = age(float64(a.LastActivityS))
		ctx = ctxTag(a.ContextTokens)
	case it.fin != nil:
		f := it.fin
		s := st(f.Status)
		glyph = seg{s.glyph + " ", s.style}
		project, task = f.Project, f.Label
		resumed := ""
		if len(f.ResumedFrom) > 0 {
			resumed = fmt.Sprintf("resumed %d×", len(f.ResumedFrom))
		}
		detail = seg{joinDot(s.label, commitCount(len(f.Commits)), resumed), s.style}
		if f.Status == "done" {
			ps, ts = sPlain, sSub
		}
		if sec := m.since(f.EndedAt); sec >= 0 {
			when = age(sec) + " ago"
		}
	default:
		s := it.intr
		glyph = seg{"‖ ", st("limit").style}
		project, task = s.Project, m.intrTitle(s)
		what := s.Account + " " + limitName(s.Limit)
		if r := resetClock(s.ResetsAt); r != "" {
			what += ", back " + r
		}
		if len(s.Workspaces) > 1 {
			what += fmt.Sprintf(" · %d folders", len(s.Workspaces))
		}
		detail = seg{what, sYellow}
		when = "at " + clockOf(s.LastEvent)
	}
	return agentRow{glyph: glyph, detail: detail, ctx: ctx, project: project, task: task, when: when, ps: ps, ts: ts}
}

func (r agentRow) line(c rowCols) line {
	l := line{r.glyph, {pad(r.project, c.project-1) + " ", r.ps}, {pad(r.task, c.task-1) + " ", r.ts},
		{pad(r.detail.text, c.detail-1) + " ", r.detail.style}, {padL(r.when, c.age), sSub}}
	if c.ctx > 0 {
		l = append(l, seg{padL(r.ctx.text, c.ctx), r.ctx.style})
	}
	return l
}

// agentList: the rows under group headings; lm maps each item to its line range for selection.
type listMap struct{ start, end []int }

func (m model) agentList(width int) ([]line, listMap) {
	var lines []line
	var lm listMap
	count := map[int]int{}
	for _, it := range m.items {
		count[it.group]++
	}
	heading := func(g int) {
		if len(lines) > 0 {
			lines = append(lines, line{})
		}
		extra := fmt.Sprint(count[g])
		switch g {
		case gNeed:
			if count[g] == 0 {
				extra = "nothing waiting on you"
			}
		case gWork:
			if m.snap != nil {
				extra = fmt.Sprintf("%d of %d run slots busy", m.snap.Slots.Busy, m.snap.Slots.Max)
			}
		}
		lines = append(lines, line{{groupNames[g], sAcc}, {"  " + extra, sSub}})
	}
	if m.snap != nil {
		heading(gNeed) // always shown: "nothing waiting on you" is an answer too
	}
	rows := make([]agentRow, len(m.items))
	for i, it := range m.items {
		rows[i] = m.itemRow(it)
	}
	c := agCols(width, rows)
	group := gNeed
	for i, it := range m.items {
		if it.group != group {
			group = it.group
			heading(group)
		}
		lm.start = append(lm.start, len(lines))
		lines = append(lines, rows[i].line(c))
		lm.end = append(lm.end, len(lines))
	}
	if len(m.items) == 0 {
		msg := "no agents"
		if m.err != nil {
			msg = "crow-runs failed: " + m.err.Error()
		} else if m.snap == nil {
			msg = "loading…"
		}
		lines = append(lines, line{{msg, sSub}})
	}
	return lines, lm
}

func (m model) detailLines(width int) []line {
	it := m.selected()
	if it == nil {
		return []line{{{"nothing selected", sSub}}}
	}
	var out []line
	wrap := func(text string, maxLines int) {
		ls := strings.Split(lipgloss.NewStyle().Width(width-2).Render(strings.TrimSpace(text)), "\n")
		for i, l := range ls {
			if i == maxLines {
				out = append(out, line{{"  …", sSub}})
				break
			}
			out = append(out, line{{"  " + strings.TrimRight(l, " "), sPlain}})
		}
	}
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
	if s := it.intr; s != nil {
		out = append(out, line{{"‖ stopped by the " + limitName(s.Limit) + "  ", st("limit").style}, {s.Project + "  ", sBold}, {m.intrTitle(s), sPlain}})
		meta := joinDot("session "+short(s.ID), "on "+s.Account, "stopped "+clockOf(s.LastEvent))
		if r := resetClock(s.ResetsAt); r != "" {
			meta += " · resets " + r
		}
		out = append(out, line{{meta, sSub}}, line{{joinDot(s.Cwd, s.Branch), sSub}})
		if len(s.Workspaces) > 1 {
			out = append(out, line{{fmt.Sprintf("ran in %d folders: cdx cannot hand it to another account as is", len(s.Workspaces)), sYellow}})
		}
		if s.LastPrompt != "" {
			out = append(out, line{}, line{{"Last prompt", sHead}})
			wrap(s.LastPrompt, 3)
		}
		out = append(out, line{}, line{{"Relaunch on another account", sHead}},
			line{{"  crow relaunch " + short(s.ID), sCyan}, {"   asks before it moves the session", sSub}})
		return out
	}
	if a := it.agent; a != nil {
		s := st(a.State)
		id := "session " + short(a.SessionID)
		if a.RunID != "" {
			id = "run " + short(a.RunID)
		}
		out = append(out, line{{s.glyph + " " + s.label + "  ", s.style}, {a.Project + "  ", sBold}, {cmp.Or(a.Label, a.Title), sPlain}})
		meta := fmt.Sprintf("%s · up %s · active %s ago", id, age(m.since(a.StartedAt)), age(float64(a.LastActivityS)))
		if a.Account != "" {
			meta += " · " + a.Account
		}
		if a.ContextTokens > 0 {
			meta += fmt.Sprintf(" · context %.0f%% used", float64(a.ContextTokens)*100/float64(contextWindow()))
		}
		if a.SubagentsActive > 0 {
			meta += fmt.Sprintf(" · %d subagents", a.SubagentsActive)
		}
		out = append(out, line{{meta, sSub}})
		if a.Cwd != "" {
			out = append(out, line{{a.Cwd, sSub}})
		}
		if a.LastPrompt != "" {
			out = append(out, line{}, line{{"Latest prompt", sHead}})
			wrap(a.LastPrompt, 3)
		}
		commits(a.Commits)
		if len(a.Recent) > 0 {
			out = append(out, line{}, line{{"Recent activity", sHead}})
		}
		for i := len(a.Recent) - 1; i >= 0; i-- { // newest first
			e := a.Recent[i]
			tool, rest, _ := strings.Cut(e.Action, ": ")
			ts := sCyan
			if tool == "says" || tool == "you" {
				ts = sMagenta
			}
			rest, _, _ = strings.Cut(rest, "\n")
			out = append(out, line{{clockOf(e.TS) + "  ", sSub}, {pad(tool, 16), ts}, {rest, sPlain}})
		}
		return out
	}
	f := it.fin
	s := st(f.Status)
	out = append(out, line{{s.glyph + " " + s.label + "  ", s.style}, {f.Project + "  ", sBold}, {f.Label, sPlain}})
	meta := fmt.Sprintf("run %s · ran %s · ended %s ago", short(f.RunID), age(float64(f.DurationS)), age(m.since(f.EndedAt)))
	if len(f.ResumedFrom) > 0 {
		meta += " · resumed after " + short(f.ResumedFrom[0])
	}
	out = append(out, line{{meta, sSub}}, line{}, line{{"Report", sHead}})
	rep, ok := m.reports[f.RunID]
	switch {
	case !ok:
		out = append(out, line{{"loading…", sSub}})
	case rep == "":
		out = append(out, line{{"no report", sSub}})
	default:
		for _, l := range strings.Split(lipgloss.NewStyle().Width(width).Render(rep), "\n") {
			out = append(out, line{{strings.TrimRight(l, " "), sPlain}})
		}
	}
	commits(f.Commits)
	return out
}

// timelineLines: one lane per session active today, 10-minute buckets, from the
// first activity to now. Interactive sessions blue, background runs cyan, live
// sessions green; a │ marks now.
func (m model) timelineLines(width, rows int) []line {
	u := m.usage
	if u == nil {
		return []line{{{"waiting for usage data…", sSub}}}
	}
	today := u.todayKey()
	type lane struct {
		s       *usageSession
		buckets []int
	}
	var lanes []lane
	first, last := 24*6, 0
	for i := range u.Sessions {
		s := &u.Sessions[i]
		if b := s.Activity[today]; len(b) > 0 {
			lanes = append(lanes, lane{s, b})
			first, last = min(first, b[0]), max(last, b[len(b)-1])
		}
	}
	if len(lanes) == 0 {
		return []line{{{"no activity today yet", sSub}}}
	}
	now := m.clock()
	nowB := now.Hour()*6 + now.Minute()/10
	startH, endH := first/6, max(last, nowB)/6+1
	slices.SortStableFunc(lanes, func(a, b lane) int { return a.buckets[0] - b.buckets[0] })
	if len(lanes) > rows-3 {
		lanes = lanes[len(lanes)-(rows-3):]
	}
	labelW := min(48, max(30, width*35/100))
	span := (endH - startH) * 6 // 10-minute buckets shown
	cells := max(span/6, width-labelW-1)
	bucketOf := func(cell int) int { return startH*6 + cell*span/cells } // first bucket under a cell
	cellOf := func(b int) int { return (b - startH*6) * cells / span }
	head := line{{strings.Repeat(" ", labelW), sPlain}}
	used := 0
	for h := startH; h < endH; h++ {
		at := cellOf(h * 6)
		if at < used || at+2 > cells {
			continue
		}
		head = append(head, seg{strings.Repeat(" ", at-used), sPlain}, seg{fmt.Sprintf("%02d", h), sSub})
		used = at + 2
	}
	out := []line{head}
	nowCell := cellOf(nowB)
	for _, ln := range lanes {
		on := make([]bool, cells)
		for _, b := range ln.buckets {
			for c := cellOf(b); c < cellOf(b+1) || c == cellOf(b); c++ {
				if c >= 0 && c < cells {
					on[c] = true
				}
			}
		}
		style := sBlueFg
		if ln.s.Kind == "run" {
			style = sCyan
		}
		if ln.s.Active {
			style = sOK
		}
		t := cmp.Or(ln.s.Title, "session "+short(ln.s.ID))
		l := line{{pad(ln.s.Project, 17) + " ", sBold}, {pad(t, labelW-18), sSub}}
		for i := 0; i < cells; i++ {
			switch {
			case on[i]:
				l = append(l, seg{"━", style})
			case i == nowCell:
				l = append(l, seg{"│", sSub})
			case bucketOf(i)%6 == 0 && (i == 0 || bucketOf(i-1)%6 != 0):
				l = append(l, seg{"·", sDim})
			default:
				l = append(l, seg{" ", sPlain})
			}
		}
		out = append(out, l)
	}
	return append(out, line{}, line{{"━", sBlueFg}, {" session  ", sSub}, {"━", sCyan}, {" background run  ", sSub}, {"━", sOK}, {" live now  ", sSub}, {"│", sSub}, {" now", sSub}})
}

func (m model) agentsView(h int) block {
	w := m.w
	wide := w >= 170
	listW := w
	if wide {
		listW = w * 60 / 100
	}
	list, lm := m.agentList(listW - 4)
	sel := -1
	if m.cursor < len(lm.start) {
		sel = lm.start[m.cursor]
	}
	listH := min(len(list)+2, max(10, h*60/100))
	off := 0
	if m.cursor < len(lm.end) && lm.end[m.cursor] > listH-2 {
		off = lm.end[m.cursor] - (listH - 2)
	}
	hint := line{{"o open in kitty · c copy id", sSub}}
	listBox := m.agentBox(list, lm, listW, listH, off, sel, hint)
	if wide {
		tl := m.timelineLines(listW-4, h-listH-2)
		left := append(listBox, box(title("Today", "who worked when"), nil, tl, listW, h-listH, 0, -1, false)...)
		det := m.detailLines(w - listW - 4)
		right := box(title("Details", ""), line{{"PgUp/PgDn scroll", sSub}}, det, w-listW, h, min(m.detailOff, max(0, len(det)-(h-2))), -1, false)
		return hcat([]int{listW, w - listW}, left, right)
	}
	// Details fit their content; the timeline only takes what is left once
	// there is room for a useful one.
	det := m.detailLines(w - 4)
	rest := h - len(listBox)
	detH := min(len(det)+2, rest)
	out := append(listBox, box(title("Details", ""), line{{"PgUp/PgDn scroll", sSub}}, det, w, detH, min(m.detailOff, max(0, len(det)-(detH-2))), -1, false)...)
	if left := rest - detH; left >= 8 {
		tl := m.timelineLines(w-4, left-2)
		out = append(out, box(title("Today", "who worked when"), nil, tl, w, min(len(tl)+2, left), 0, -1, false)...)
	}
	return out
}

// agentBox renders the list with the whole selected item (both its lines) highlighted.
func (m model) agentBox(list []line, lm listMap, w, h, off, sel int, hint line) block {
	b := box(title("Agents", ""), hint, list, w, h, off, -1, true)
	if sel < 0 || m.cursor >= len(lm.end) {
		return b
	}
	for i := lm.start[m.cursor]; i < lm.end[m.cursor]; i++ {
		row := i - off + 1 // +1: top border
		if row >= 1 && row < len(b)-1 {
			b[row] = sBlueFg.Render("│") + " " + list[i].render(w-4, true) + " " + sBlueFg.Render("│")
		}
	}
	return b
}
