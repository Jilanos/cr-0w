package api

import (
	"context"
	"sync"
	"time"
)

// IdleAfter stops refreshing a section nobody requested for this long, so an idle phone
// costs no script runs.
const IdleAfter = 2 * time.Minute

// Source is a section read outside the store: a deck script's JSON or a systemd listing.
// Fetch runs off the request path, at most once at a time per section, when the last run
// is older than TTL and the section was requested in the last IdleAfter.
type Source struct {
	Name  string
	Fetch Fetch
	TTL   time.Duration
}

// ext holds one source's last good body and the state of its refresh.
type ext struct {
	src     Source
	mu      sync.Mutex
	running bool
	ran     time.Time // end of the last run, good or bad; zero before the first
	asked   time.Time // last request
	have    bool      // one run succeeded
	data    any
	hash    string
	updated string // when data last changed, RFC 3339
	err     string // last run's error, empty when it succeeded
}

// read marks the section requested, starts a refresh when one is due and returns the
// last good body at once. It never waits for a script.
func (s *Server) readExt(e *ext) Section { return s.extSection(e, true) }

// extSection returns the last good body. ask marks the section requested and starts a
// due refresh; without it the read changes nothing.
func (s *Server) extSection(e *ext, ask bool) Section {
	now := s.o.Now()
	e.mu.Lock()
	defer e.mu.Unlock()
	if ask {
		e.asked = now
		s.kick(e, now)
	}
	sec := Section{Section: e.src.Name, Data: e.data, Error: e.err}
	if !e.have {
		sec.Data, sec.Stale = []any{}, true
		if sec.Error == "" {
			sec.Error = "not loaded yet"
		}
		sec.Version = hash([]any{"empty", sec.Error})
		return sec
	}
	u := e.updated
	sec.UpdatedAt = &u
	sec.Version = e.hash
	if e.err != "" {
		sec.Stale = true
		sec.Version = hash([]any{e.hash, e.err})
	}
	return sec
}

// kick starts a run when the section is due. The caller holds e.mu.
func (s *Server) kick(e *ext, now time.Time) {
	if e.running || now.Sub(e.asked) >= IdleAfter {
		return
	}
	if !e.ran.IsZero() && now.Sub(e.ran) < e.src.TTL {
		return
	}
	e.running = true
	go s.run(e)
}

// run fetches once and stores the result. A failure keeps the last good body.
func (s *Server) run(e *ext) {
	var data any
	var err error
	if e.src.Fetch == nil {
		data = []any{}
	} else {
		data, err = e.src.Fetch()
	}
	now := s.o.Now()
	e.mu.Lock()
	defer e.mu.Unlock()
	e.running, e.ran = false, now
	if err != nil {
		e.err = err.Error()
		return
	}
	h := hash(data)
	if !e.have || h != e.hash {
		e.data, e.hash, e.updated = data, h, now.UTC().Format(time.RFC3339)
	}
	e.have, e.err = true, ""
}

// Refresh runs one section's fetch now and waits for it, whatever its TTL. Tests and a
// warm start use it.
func (s *Server) Refresh(name string) {
	e := s.ext[name]
	if e == nil {
		return
	}
	e.mu.Lock()
	if e.running {
		e.mu.Unlock()
		return
	}
	e.running = true
	e.mu.Unlock()
	s.run(e)
}

// tick starts every due refresh.
func (s *Server) tick() {
	now := s.o.Now()
	for _, name := range s.order {
		e := s.ext[name]
		if e == nil {
			continue
		}
		e.mu.Lock()
		s.kick(e, now)
		e.mu.Unlock()
	}
}

// Run keeps requested sections fresh in the background until ctx ends.
func (s *Server) Run(ctx context.Context) {
	t := time.NewTicker(time.Second)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			s.tick()
		}
	}
}
