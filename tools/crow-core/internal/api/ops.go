package api

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"

	"crow-core/contract"
	"crow-core/internal/ops"
)

// OpsSection is the ops timeline (item_257): built on read from the usage, dispatch,
// sessions, projects and jobs sections plus the store. ?day=YYYY-MM-DD or ?week=YYYY-Www
// picks the days; today when neither is set.
const OpsSection = "ops"

var opsInputs = []string{"usage", "dispatch", "sessions", "projects", "jobs"}

// badParam is a query parameter the section cannot read: a 400.
type badParam struct{ msg string }

func (e badParam) Error() string { return e.msg }

func (s *Server) ops(r *http.Request) (Section, error) {
	now := s.o.Now()
	out, days, err := opsDays(now, r.URL.Query().Get("day"), r.URL.Query().Get("week"))
	if err != nil {
		return Section{}, err
	}
	in, updated, stale, err := s.opsInput(now, days, true)
	if err != nil {
		return Section{}, err
	}
	o := ops.Build(in)
	if s.opsLog != nil {
		lines, err := ops.ReadLog(s.opsLog.Path)
		if err != nil {
			stale = append(stale, "state log: "+err.Error())
		}
		o = ops.Merge(o, lines, now)
	}
	o = ops.Tidy(o, in.Projects)
	o.Day, o.Week = out.Day, out.Week
	sec := Section{Section: OpsSection, Data: o, UpdatedAt: updated, Version: hash(o)}
	if len(stale) > 0 {
		sec.Stale, sec.Error = true, strings.Join(stale, "; ")
		sec.Version = hash([]any{sec.Version, sec.Error})
	}
	return sec, nil
}

// opsInput reads the ops inputs. ask marks the sections requested; the state log
// observer only peeks at the last good bodies, so an idle phone costs no script runs.
func (s *Server) opsInput(now time.Time, days []string, ask bool) (in ops.Input, updated *string, stale []string, err error) {
	in = ops.Input{Now: now, Days: days, AFK: afkJobs(s.o.StateDir)}
	for _, name := range opsInputs {
		e := s.ext[name]
		if e == nil {
			continue
		}
		sec := s.extSection(e, ask)
		if sec.Stale {
			stale = append(stale, name+": "+sec.Error)
		}
		if sec.UpdatedAt != nil && (updated == nil || *sec.UpdatedAt > *updated) {
			updated = sec.UpdatedAt
		}
		m, _ := sec.Data.(map[string]any)
		switch name {
		case "usage":
			in.Usage = m
		case "dispatch":
			in.Dispatch = m
		case "sessions":
			in.Sessions = m
		case "projects":
			in.Projects = m
		case "jobs":
			in.Jobs = sec.Data
		}
	}
	s.mu.Lock()
	err = s.syncStore()
	if err == nil {
		in.Missions = slices.Clone(s.storeMissions())
	}
	s.mu.Unlock()
	return in, updated, stale, err
}

// ObserveOps appends the state of today's live lanes to the ops state log, one line per
// state change. The serve tick calls it; it refreshes the dispatch section first. It does
// nothing without a state dir.
func (s *Server) ObserveOps() error {
	if s.opsLog == nil {
		return nil
	}
	s.Refresh("dispatch")
	now := s.o.Now()
	in, _, _, err := s.opsInput(now, []string{now.Format(time.DateOnly)}, false)
	if err != nil {
		return err
	}
	return s.opsLog.Observe(now, ops.Build(in).Lanes)
}

// opsDays reads ?day or ?week into the days to build, in now's location.
func opsDays(now time.Time, day, week string) (contract.Ops, []string, error) {
	switch {
	case day != "" && week != "":
		return contract.Ops{}, nil, badParam{"day and week are exclusive"}
	case week != "":
		mon, err := isoWeek(week, now.Location())
		if err != nil {
			return contract.Ops{}, nil, err
		}
		var days []string
		for i := range 7 {
			days = append(days, mon.AddDate(0, 0, i).Format(time.DateOnly))
		}
		return contract.Ops{Week: week}, days, nil
	case day == "":
		day = now.Format(time.DateOnly)
	}
	if _, err := time.ParseInLocation(time.DateOnly, day, now.Location()); err != nil {
		return contract.Ops{}, nil, badParam{"day must be YYYY-MM-DD"}
	}
	return contract.Ops{Day: day}, []string{day}, nil
}

// isoWeek is the Monday of ISO week "YYYY-Www".
func isoWeek(s string, loc *time.Location) (time.Time, error) {
	var y, w int
	if n, err := fmt.Sscanf(s, "%4d-W%2d", &y, &w); err != nil || n != 2 || len(s) != 8 || w < 1 || w > 53 {
		return time.Time{}, badParam{"week must be YYYY-Www"}
	}
	jan4 := time.Date(y, 1, 4, 0, 0, 0, 0, loc)
	mon := jan4.AddDate(0, 0, -((int(jan4.Weekday())+6)%7)+(w-1)*7)
	if _, wk := mon.ISOWeek(); wk != w {
		return time.Time{}, badParam{"no week " + s}
	}
	return mon, nil
}

// afkJobs lists the AFK jobs still to run, in order:
//   - the rows of <state>/afk/queue.md (the only source of order) not yet done, skipped or
//     failed, whose job file exists; without a queue.md, every top-level job-*.md;
//   - then the jobs prepared for a next run in <state>/afk/queued/ (id "queued/<file>").
//
// The title is the file name without "job-" and ".md", order prefix and dashes dropped (job-01-crow-checks.md is "crow checks").
func afkJobs(state string) []contract.OpsQueued {
	if state == "" {
		return nil
	}
	dir := filepath.Join(state, "afk")
	var out []contract.OpsQueued
	add := func(id string) {
		if _, err := os.Stat(filepath.Join(dir, id)); err == nil {
			out = append(out, contract.OpsQueued{Kind: "afk", ID: id, Title: jobTitle(id)})
		}
	}
	if b, err := os.ReadFile(filepath.Join(dir, "queue.md")); err == nil {
		for _, row := range afkPending(string(b)) {
			add(row)
		}
	} else {
		paths, _ := filepath.Glob(filepath.Join(dir, "job-*.md"))
		for _, p := range paths {
			add(filepath.Base(p))
		}
	}
	paths, _ := filepath.Glob(filepath.Join(dir, "queued", "job-*.md"))
	for _, p := range paths {
		add("queued/" + filepath.Base(p))
	}
	return out
}

// afkPending is the job files of the queue.md table rows whose state is not final.
// The job file is the first cell ending in .md, the state the last cell.
func afkPending(md string) []string {
	var out []string
	for _, l := range strings.Split(md, "\n") {
		l = strings.TrimSpace(l)
		if !strings.HasPrefix(l, "|") {
			continue
		}
		cells := strings.Split(strings.Trim(l, "|"), "|")
		file := ""
		for _, c := range cells {
			if c = strings.TrimSpace(c); strings.HasSuffix(c, ".md") && !strings.ContainsAny(c, "/ ") {
				file = c
				break
			}
		}
		state := strings.ToLower(strings.TrimSpace(cells[len(cells)-1]))
		final := false
		for _, w := range []string{"done", "skipped", "skip", "failed", "superseded", "cancelled", "dropped"} {
			final = final || strings.HasPrefix(state, w)
		}
		if file != "" && !final {
			out = append(out, file)
		}
	}
	return out
}

func jobTitle(path string) string {
	n := strings.TrimSuffix(strings.TrimPrefix(filepath.Base(path), "job-"), ".md")
	if i := strings.IndexByte(n, '-'); i > 0 && strings.Trim(n[:i], "0123456789") == "" {
		n = n[i+1:] // job order prefix: "01-audit"
	}
	return strings.ReplaceAll(n, "-", " ")
}
