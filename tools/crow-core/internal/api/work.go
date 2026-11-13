package api

import (
	"slices"
	"strings"

	"crow-core/contract"
	"crow-core/internal/work"
)

// WorkSection is the work feed (item_202): built on read from the sections it joins, so
// it runs no script of its own and is as fresh as they are.
const WorkSection = "work"

// workInputs are the sections the feed reads besides the store.
var workInputs = []string{"projects", "dispatch", "sessions", "mrs"}

func (s *Server) work() (Section, error) {
	in := work.Input{Now: s.o.Now()}
	var stale []string
	var updated *string
	for _, name := range workInputs {
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
		case "projects":
			in.Projects = m
		case "dispatch":
			in.Dispatch = m
		case "sessions":
			in.Sessions = m
		case "mrs":
			in.MRs = m
		}
	}
	s.mu.Lock()
	err := s.syncStore()
	if err == nil {
		in.Missions = slices.Clone(s.storeMissions())
		in.Inbox = slices.Clone(s.storeInbox())
		if s.store.updated != nil && (updated == nil || *s.store.updated > *updated) {
			updated = s.store.updated
		}
	}
	s.mu.Unlock()
	if err != nil {
		return Section{}, err
	}
	items := work.Build(in)
	sec := Section{Section: WorkSection, Data: items, UpdatedAt: updated, Version: hash(items)}
	if len(stale) > 0 {
		sec.Stale, sec.Error = true, strings.Join(stale, "; ")
		sec.Version = hash([]any{sec.Version, sec.Error})
	}
	return sec, nil
}

// storeMissions and storeInbox read the last store sync. The caller holds mu.
func (s *Server) storeMissions() []contract.Mission {
	m, _ := s.store.data["missions"].([]contract.Mission)
	return m
}

func (s *Server) storeInbox() []contract.InboxItem {
	r, _ := s.store.data["inbox"].([]contract.InboxItem)
	return r
}
