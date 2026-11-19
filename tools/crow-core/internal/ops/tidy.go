package ops

import (
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"sort"
	"strings"
	"time"

	"crow-core/contract"
	"crow-core/internal/work"
)

// Tidy makes the lanes read the way the owner names the work:
//   - a project "<repo> (hub)" is the hub session of repo: project repo, title "hub";
//   - a project "<repo>-<role>" of a registered repo folds into repo, titled "<role>: title";
//   - worktree and file titles lose their dashes, extensions and dates (item-257-ops-2 is
//     "item_257 ops", reply-x-2026-11-19.md is "reply x", mr235-threads is "!235 threads");
//   - run lanes of one day with the same project and title merge into one lane;
//   - a done span is a short terminal mark: the run worked until then.
//
// Totals are summed again.
func Tidy(o contract.Ops, projects map[string]any) contract.Ops {
	reg := Names(work.Registry(projects))
	ls := make([]contract.OpsLane, 0, len(o.Lanes))
	for _, l := range o.Lanes {
		l.Spans = doneTail(l.Spans)
		l.Project, l.Title = name(l.Project, l.Title, reg)
		ls = append(ls, l)
	}
	o.Lanes = mergeSame(ls)
	o.Totals = Totals(o.Lanes)
	return o
}

// DoneTail is the longest a done span shows; the rest of it was work.
const DoneTail = 4 * time.Minute

func doneTail(sp []contract.OpsSpan) []contract.OpsSpan {
	var out []contract.OpsSpan
	for _, s := range sp {
		from, ok1 := parseTime(s.Start)
		to, ok2 := parseTime(s.End)
		if s.State != "done" || !ok1 || !ok2 {
			out = append(out, s)
			continue
		}
		tail := min(DoneTail, to.Sub(from)/2)
		cut := to.Add(-tail)
		if cut.After(from) {
			out = append(out, contract.OpsSpan{State: "working", Start: s.Start, End: cut.Format(time.RFC3339)})
		}
		out = append(out, contract.OpsSpan{State: "done", Start: cut.Format(time.RFC3339), End: s.End})
	}
	if out == nil {
		out = []contract.OpsSpan{}
	}
	return out
}

var (
	reDate  = regexp.MustCompile(`(^|[-_ ])\d{4}-\d{2}-\d{2}($|[-_ ])`)
	reItem  = regexp.MustCompile(`^item[-_](\d+)\b[-_ ]?`)
	reMR    = regexp.MustCompile(`^mr(\d+)\b[-_ ]?`)
	reCopy  = regexp.MustCompile(`[-_ ]\d{1,2}$`)
	reFile  = regexp.MustCompile(`^[\w.-]+\.[A-Za-z0-9]{1,5}$`)
	reSlug  = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)+$`)
	reWords = regexp.MustCompile(`[-_]+`)
)

func name(project, title string, reg Names) (string, string) {
	if base, ok := strings.CutSuffix(project, " (hub)"); ok {
		return reg.ShortName(base), "hub"
	}
	// "<project>: files" (a run label) or "<repo>: files" reads as the files.
	if head, rest, ok := strings.Cut(title, ": "); ok {
		if _, known := reg.find(head); known || head == project {
			title = rest
		}
	}
	title = cleanTitle(title)
	if _, ok := reg.find(project); !ok {
		if repo, ok := reg.worktreeOf(project); ok {
			return repo, cleanTitle(project) + titleTail(title, project)
		}
	}
	if i := strings.LastIndex(project, "-"); i > 0 {
		if _, ok := reg.find(project[:i]); ok {
			return reg.ShortName(project[:i]), project[i+1:] + ": " + title
		}
	}
	return project, title
}

// worktreeOf is the registered repo holding a worktree folder named name (<path>.wt/<name>).
func (n Names) worktreeOf(name string) (string, bool) {
	if name == "" || strings.ContainsAny(name, "/ ") {
		return "", false
	}
	for _, p := range n {
		if p.Path == "" {
			continue
		}
		if st, err := os.Stat(filepath.Join(p.Path+".wt", name)); err == nil && st.IsDir() {
			return or(p.Short, p.Name), true
		}
	}
	return "", false
}

// titleTail is ": title" unless the title only repeats the worktree name.
func titleTail(title, project string) string {
	if title == "" || title == cleanTitle(project) {
		return ""
	}
	return ": " + title
}

// cleanTitle turns a worktree slug or a list of edited files into words.
func cleanTitle(t string) string {
	t = strings.TrimSpace(t)
	parts := strings.Split(t, ", ")
	files := true
	for _, p := range parts {
		files = files && reFile.MatchString(p)
	}
	if files {
		var out []string
		for _, p := range parts {
			w := strings.ToLower(words(strings.TrimSuffix(p, p[strings.LastIndex(p, "."):])))
			if w != "" && !slices.Contains(out, w) {
				out = append(out, w)
			}
		}
		if len(out) > 0 {
			return strings.Join(out, ", ")
		}
		return t
	}
	if reSlug.MatchString(t) {
		return words(t)
	}
	return t
}

// words drops dates and copy suffixes from a slug and spaces it out.
func words(s string) string {
	s = reDate.ReplaceAllString(s, "$1")
	s = strings.Trim(s, "-_ ")
	prefix := ""
	if m := reItem.FindStringSubmatch(s); m != nil {
		prefix, s = "item_"+m[1], s[len(m[0]):]
	} else if m := reMR.FindStringSubmatch(s); m != nil {
		prefix, s = "!"+m[1], s[len(m[0]):]
	}
	if prefix != "" {
		s = reCopy.ReplaceAllString(s, "")
	}
	s = strings.TrimSpace(reWords.ReplaceAllString(s, " "))
	if prefix == "" {
		return s
	}
	return strings.TrimSpace(prefix + " " + s)
}

// mergeSame folds the run lanes of one day sharing project and title into the first.
func mergeSame(ls []contract.OpsLane) []contract.OpsLane {
	at := map[string]int{}
	var out []contract.OpsLane
	for _, l := range ls {
		k := l.Day + "\x00" + l.Project + "\x00" + l.Title
		i, ok := at[k]
		if l.Kind == "interactive" || !ok {
			if l.Kind != "interactive" {
				at[k] = len(out)
			}
			out = append(out, l)
			continue
		}
		m := &out[i]
		m.Spans = append(m.Spans, l.Spans...)
		sort.SliceStable(m.Spans, func(a, b int) bool { return m.Spans[a].Start < m.Spans[b].Start })
		for _, key := range l.Keys {
			if !slices.Contains(m.Keys, key) {
				m.Keys = append(m.Keys, key)
			}
		}
		m.ActiveS += l.ActiveS
		m.WaitS += l.WaitS
		m.CostUSD = round(m.CostUSD + l.CostUSD)
		m.Tokens += l.Tokens
		m.Commits += l.Commits
		m.Runs += max(1, l.Runs)
		if liveState(l.State) != "" || liveState(m.State) == "" {
			m.State = l.State
			if liveState(l.State) != "" {
				m.ID = l.ID
			}
		}
	}
	return out
}
