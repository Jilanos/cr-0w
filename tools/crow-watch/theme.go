package main

// Styles, gauges and the block layout kit shared by every view.
//
// Colours are the terminal's 16 ANSI slots only (the board follows the terminal
// theme). Secondary text is slot 7, not 8: slot 8 is unreadable on a translucent
// terminal over a bright wallpaper, so it is kept for borders, leaders and tracks.
// Every glyph used here exists in FiraCode (no font fallback, so cells stay even).

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
	"github.com/mattn/go-runewidth"
)

var (
	cBlack   = lipgloss.Color("0")
	cRed     = lipgloss.Color("1")
	cGreen   = lipgloss.Color("2")
	cYellow  = lipgloss.Color("3")
	cBlue    = lipgloss.Color("4")
	cMagenta = lipgloss.Color("5")
	cCyan    = lipgloss.Color("6")
	cWhite   = lipgloss.Color("7")
	cDim     = lipgloss.Color("8")

	sPlain   = lipgloss.NewStyle()
	sBold    = lipgloss.NewStyle().Bold(true)
	sSub     = lipgloss.NewStyle().Foreground(cWhite)
	sDim     = lipgloss.NewStyle().Foreground(cDim)
	sHead    = lipgloss.NewStyle().Foreground(cWhite).Bold(true)
	sAcc     = lipgloss.NewStyle().Foreground(cMagenta).Bold(true)
	sCyan    = lipgloss.NewStyle().Foreground(cCyan)
	sYellow  = lipgloss.NewStyle().Foreground(cYellow)
	sMagenta = lipgloss.NewStyle().Foreground(cMagenta)
	sBlueFg  = lipgloss.NewStyle().Foreground(cBlue)
	sOK      = lipgloss.NewStyle().Foreground(cGreen)
	sErr     = lipgloss.NewStyle().Foreground(cRed).Bold(true)
	sSel     = lipgloss.NewStyle().Background(cBlue).Foreground(cBlack)
	sTabOn   = lipgloss.NewStyle().Background(cMagenta).Foreground(cBlack).Bold(true)
)

type stateStyle struct {
	glyph, label string
	style        lipgloss.Style
}

var states = map[string]stateStyle{
	"working": {"●", "working", lipgloss.NewStyle().Foreground(cGreen).Bold(true)},
	"quiet":   {"◌", "quiet", lipgloss.NewStyle().Foreground(cYellow)},
	"waiting": {"◆", "needs you", lipgloss.NewStyle().Foreground(cMagenta).Bold(true)},
	"idle":    {"○", "idle", sSub},
	"done":    {"✓", "done", lipgloss.NewStyle().Foreground(cGreen)},
	"failed":  {"✗", "failed", lipgloss.NewStyle().Foreground(cRed).Bold(true)},
	"limit":   {"‖", "usage limit", lipgloss.NewStyle().Foreground(cYellow).Bold(true)},
	"lost":    {"?", "lost", sSub},
}

func st(name string) stateStyle {
	if s, ok := states[name]; ok {
		return s
	}
	return stateStyle{"?", name, sSub}
}

// levelStyle colours a remaining percentage: green > 50, yellow 20–50, red < 20.
func levelStyle(pct int) lipgloss.Style {
	switch {
	case pct < 20:
		return lipgloss.NewStyle().Foreground(cRed).Bold(true)
	case pct <= 50:
		return lipgloss.NewStyle().Foreground(cYellow).Bold(true)
	default:
		return lipgloss.NewStyle().Foreground(cGreen).Bold(true)
	}
}

// ---------- segments and lines ----------

// seg is a run of text with one style; lines are built from segs so they can be
// truncated to a width before styling, and re-rendered plain when selected.
type seg struct {
	text  string
	style lipgloss.Style
}
type line []seg

func (l line) width() int {
	n := 0
	for _, s := range l {
		n += runewidth.StringWidth(s.text)
	}
	return n
}

// render truncates to width (… on the last visible cell) and pads to exactly width.
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
	rest := strings.Repeat(" ", max(0, width-used))
	if selected {
		return sSel.Render(b.String() + rest)
	}
	return b.String() + rest
}

func pad(s string, w int) string {
	s = runewidth.Truncate(s, w, "…")
	return s + strings.Repeat(" ", max(0, w-runewidth.StringWidth(s)))
}

func padL(s string, w int) string {
	s = runewidth.Truncate(s, w, "…")
	return strings.Repeat(" ", max(0, w-runewidth.StringWidth(s))) + s
}

// ---------- gauges ----------

// smoothBar: a solid bar with 1/8-cell precision on a dotted track (limits, charts).
func smoothBar(pct float64, cells int, style lipgloss.Style) []seg {
	eighths := []string{"", "▏", "▎", "▍", "▌", "▋", "▊", "▉"}
	x := max(0, min(100, pct)) * float64(cells) / 100
	full := int(x)
	part := int((x - float64(full)) * 8)
	bar := strings.Repeat("█", full) + eighths[part]
	used := full
	if part > 0 {
		used++
	}
	return []seg{{bar, style}, {strings.Repeat("·", max(0, cells-used)), sDim}}
}

// lineBar: a thin bar for small gauges in tables (context, slots).
func lineBar(pct float64, cells int, style lipgloss.Style) []seg {
	on := int(max(0, min(100, pct))*float64(cells)/100 + 0.5)
	return []seg{{strings.Repeat("━", on), style}, {strings.Repeat("━", cells-on), sDim}}
}

// ---------- blocks: fixed-width rendered lines ----------

type block []string

// box draws a rounded border with the title set into the top edge and an
// optional hint on the right of it. h <= 0 fits the content; body[sel] is
// highlighted (-1: none); body is shown from off.
func box(title line, right line, body []line, w, h, off, sel int, focused bool) block {
	border := sDim
	if focused {
		border = sBlueFg
	}
	inner := w - 4
	if h <= 0 {
		h = len(body) + 2
	}
	top := border.Render("╭─ ") + title.render(title.width(), false) + " "
	used := 3 + title.width() + 1
	r := ""
	if right != nil && used+right.width()+4 <= w {
		r = " " + right.render(right.width(), false) + border.Render(" ─╮")
		used += right.width() + 4
	} else {
		r = border.Render("╮")
		used++
	}
	top += border.Render(strings.Repeat("─", max(0, w-used))) + r
	out := block{top}
	for i := off; i < len(body) && len(out) < h-1; i++ {
		out = append(out, border.Render("│")+" "+body[i].render(inner, i == sel)+" "+border.Render("│"))
	}
	for len(out) < h-1 {
		out = append(out, border.Render("│")+strings.Repeat(" ", w-2)+border.Render("│"))
	}
	return append(out, border.Render("╰"+strings.Repeat("─", w-2)+"╯"))
}

// hcat puts blocks side by side; shorter ones are padded with blank lines.
func hcat(widths []int, blocks ...block) block {
	h := 0
	for _, b := range blocks {
		h = max(h, len(b))
	}
	out := make(block, h)
	for i := 0; i < h; i++ {
		var sb strings.Builder
		for j, b := range blocks {
			if i < len(b) {
				sb.WriteString(b[i])
			} else {
				sb.WriteString(strings.Repeat(" ", widths[j]))
			}
		}
		out[i] = sb.String()
	}
	return out
}

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

func money(v float64) string {
	if v >= 100 {
		return fmt.Sprintf("$%.0f", v)
	}
	return fmt.Sprintf("$%.2f", v)
}

func plural(n int, one, many string) string {
	if n == 1 {
		return one
	}
	return many
}
