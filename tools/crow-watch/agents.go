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

// ctxCell: context as a thin bar + %, green < 70, yellow 70–85, red above.
func ctxCell(tokens int) []seg {
	if tokens == 0 {
		return []seg{{pad("–", 14), sSub}}
	}
	pct := float64(tokens) * 100 / float64(contextWindow())
	style := sOK
	switch {
	case pct >= 85:
		style = sErr
	case pct >= 70:
		style = lipgloss.NewStyle().Foreground(cYellow).Bold(true)
	}
	return append(lineBar(pct, 8, style), seg{padL(fmt.Sprintf("%.0f%%", pct), 5) + " ", style})
}

// agentCost: what the agent's session has cost so far, from the usage data.
func (m model) agentCost(sid string) string {
	if m.usage == nil {
		return ""
	}
	if s := m.usage.byID[sid]; s != nil && s.CostUSD != nil {
		return money(*s.CostUSD)
	}
	return ""
}

type agentCols struct{ project, task, state int }

func agCols(width int) agentCols {
	c := agentCols{project: 18, state: 15}
	c.task = max(12, width-2-c.project-c.state-14-8-8)
	return c
}

func (m model) agentHeader(width int) []line {
	c := agCols(width)
	h := "  " + pad("project", c.project) + pad("task / session", c.task) + pad("state", c.state) + pad("context", 14) + padL("cost", 8) + padL("commits", 8)
	return []line{{{h, sHead}}, {{"  " + strings.Repeat("─", width-2), sDim}}}
}

func (m model) itemLines(it item, width int) []line {
	c := agCols(width)
	if a := it.agent; a != nil {
		s := st(a.State)
		task := cmp.Or(a.Label, a.Title)
		if task == "" {
			task = map[bool]string{true: "session " + short(a.SessionID), false: "(not dispatched by crow)"}[a.Kind == "session"]
		}
		doing, dstyle := a.LastAction, sCyan
		if a.State == "waiting" {
			doing, dstyle = "waiting for your reply", sMagenta
		}
		stateStyle := s.style
		if a.State == "idle" {
			stateStyle = sSub
		}
		commits := ""
		if a.Kind == "run" {
			commits = fmt.Sprint(len(a.Commits))
		}
		row := line{{s.glyph + " ", s.style}, {pad(a.Project, c.project-1) + " ", sBold}, {pad(task, c.task-1) + " ", sPlain},
			{pad(s.label+" "+age(float64(a.LastActivityS)), c.state), stateStyle}}
		row = append(row, ctxCell(a.ContextTokens)...)
		row = append(row, seg{padL(m.agentCost(a.SessionID), 8), sYellow}, seg{padL(commits, 8), sCyan})
		return []line{row, {{"  ↳ ", sDim}, {doing, dstyle}}}
	}
	f := it.fin
	s := st(f.Status)
	extra := ""
	if len(f.ResumedFrom) > 0 {
		extra = fmt.Sprintf(" · resumed %d×", len(f.ResumedFrom))
	}
	return []line{{{s.glyph + " ", s.style}, {pad(f.Project, c.project-1) + " ", sPlain}, {pad(f.Label, c.task-1) + " ", sSub},
		{pad(s.label+ended(m.since(f.EndedAt))+extra, c.state+14), s.style}, {padL("", 8), sPlain},
		{padL(fmt.Sprint(len(f.Commits)), 8), sCyan}}}
}

// agentList: group headings and rows; lm maps each item to its line range for selection.
type listMap struct{ start, end []int }

func (m model) agentList(width int) ([]line, listMap) {
	lines := m.agentHeader(width)
	var lm listMap
	runs, sess, nfin := 0, 0, 0
	for _, it := range m.items {
		switch {
		case it.fin != nil:
			nfin++
		case it.agent.Kind == "run":
			runs++
		default:
			sess++
		}
	}
	slots := ""
	if m.snap != nil {
		slots = fmt.Sprintf("%d of %d slots busy", m.snap.Slots.Busy, m.snap.Slots.Max)
	}
	heading := func(name, extra string) {
		if len(lines) > 2 {
			lines = append(lines, line{})
		}
		lines = append(lines, line{{name, sAcc}, {"  " + extra, sSub}})
	}
	group := ""
	for _, it := range m.items {
		g := "fin"
		if it.agent != nil {
			g = it.agent.Kind
		}
		if g != group {
			if g == "session" && group == "" {
				heading("Runs", slots)
				lines = append(lines, line{{"  none", sSub}})
			}
			switch g {
			case "run":
				heading("Runs", slots)
			case "session":
				heading("Sessions", fmt.Sprintf("%d open · waiting first", sess))
			default:
				heading("Finished today", fmt.Sprint(nfin))
			}
			group = g
		}
		lm.start = append(lm.start, len(lines))
		lines = append(lines, m.itemLines(it, width)...)
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
		out = append(out, line{{s.glyph + " " + s.label + "  ", s.style}, {a.Project + "  ", sBold}, {cmp.Or(a.Label, a.Title), sPlain}})
		meta := fmt.Sprintf("%s · up %s · active %s ago", id, age(m.since(a.StartedAt)), age(float64(a.LastActivityS)))
		if a.Account != "" {
			meta += " · " + a.Account
		}
		if a.ContextTokens > 0 {
			meta += fmt.Sprintf(" · context %.0f%%", float64(a.ContextTokens)*100/float64(contextWindow()))
		}
		if c := m.agentCost(a.SessionID); c != "" {
			meta += " · " + c + " so far"
		}
		if a.SubagentsActive > 0 {
			meta += fmt.Sprintf(" · %d subagents", a.SubagentsActive)
		}
		out = append(out, line{{meta, sSub}}, line{{a.Cwd, sSub}})
		if a.LastPrompt != "" {
			out = append(out, line{}, line{{"Latest prompt", sHead}})
			for _, l := range strings.Split(lipgloss.NewStyle().Width(width-2).Render(a.LastPrompt), "\n") {
				out = append(out, line{{"  " + strings.TrimRight(l, " "), sPlain}})
			}
		}
		out = append(out, line{}, line{{"Recent activity", sHead}})
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
		commits(a.Commits)
		return out
	}
	f := it.fin
	s := st(f.Status)
	out = append(out, line{{s.glyph + " " + s.label + "  ", s.style}, {f.Project + "  ", sBold}, {f.Label, sPlain}})
	meta := fmt.Sprintf("run %s · ran %s · ended %s ago", short(f.RunID), age(float64(f.DurationS)), age(m.since(f.EndedAt)))
	if len(f.ResumedFrom) > 0 {
		meta += " · resumed after " + short(f.ResumedFrom[0])
	}
	out = append(out, line{{meta, sSub}})
	commits(f.Commits)
	out = append(out, line{}, line{{"Report", sHead}})
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
	listH := min(len(list)+2, max(10, h*55/100))
	off := 0
	if m.cursor < len(lm.end) && lm.end[m.cursor] > listH-2 {
		off = lm.end[m.cursor] - (listH - 2)
	}
	hint := line{{"o open in kitty · c copy id", sSub}}
	// box highlights one line; the selected item spans two, so mark both by rendering them plain.
	listBox := m.agentBox(list, lm, listW, listH, off, sel, hint)
	if wide {
		tl := m.timelineLines(listW-4, h-listH-2)
		left := append(listBox, box(title("Today", "who worked when"), nil, tl, listW, h-listH, 0, -1, false)...)
		det := m.detailLines(w - listW - 4)
		right := box(title("Details", ""), line{{"PgUp/PgDn scroll", sSub}}, det, w-listW, h, min(m.detailOff, max(0, len(det)-(h-2))), -1, false)
		return hcat([]int{listW, w - listW}, left, right)
	}
	det := m.detailLines(w - 4)
	rest := h - len(listBox)
	tl := m.timelineLines(w-4, max(6, rest/2))
	detH := min(len(det)+2, rest-len(tl)-2) // details fit their content; the timeline follows
	if detH < 10 {                          // short terminal: details only, no timeline
		detH, tl = rest, nil
	}
	out := append(listBox, box(title("Details", ""), line{{"PgUp/PgDn scroll", sSub}}, det, w, detH, min(m.detailOff, max(0, len(det)-(detH-2))), -1, false)...)
	if tl != nil {
		out = append(out, box(title("Today", "who worked when"), nil, tl, w, len(tl)+2, 0, -1, false)...)
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
