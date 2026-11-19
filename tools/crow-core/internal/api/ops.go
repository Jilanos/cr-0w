package api

import (
	"bufio"
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
	in := ops.Input{Now: now, Days: days, AFK: afkJobs(s.o.StateDir)}
	var stale []string
	var updated *string
	for _, name := range opsInputs {
		e := s.ext[name]
		if e == nil {
			continue
		}
		sec := s.readExt(e)
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
	if err != nil {
		return Section{}, err
	}
	o := ops.Build(in)
	o.Day, o.Week = out.Day, out.Week
	sec := Section{Section: OpsSection, Data: o, UpdatedAt: updated, Version: hash(o)}
	if len(stale) > 0 {
		sec.Stale, sec.Error = true, strings.Join(stale, "; ")
		sec.Version = hash([]any{sec.Version, sec.Error})
	}
	return sec, nil
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

// afkJobs lists the AFK job prompts waiting in <state>/afk (job-*.md, top level only).
// The title is the prompt's first line without its heading marks.
func afkJobs(state string) []contract.OpsQueued {
	if state == "" {
		return nil
	}
	paths, _ := filepath.Glob(filepath.Join(state, "afk", "job-*.md"))
	var out []contract.OpsQueued
	for _, p := range paths {
		out = append(out, contract.OpsQueued{Kind: "afk", ID: filepath.Base(p), Title: firstLine(p)})
	}
	return out
}

func firstLine(path string) string {
	f, err := os.Open(path)
	if err != nil {
		return ""
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		if t := strings.TrimSpace(strings.TrimLeft(sc.Text(), "# ")); t != "" {
			return t
		}
	}
	return ""
}
