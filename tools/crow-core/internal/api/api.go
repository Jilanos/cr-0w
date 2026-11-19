// Package api is the core HTTP service (item_144, writes in actions.go for item_147): the state sections,
// one mission, its outbox files and the event feed under /api, and the built Nest app
// at /. Every route answers the owner only (req_031): requests on the TCP listener need
// the owner's tailnet login in Tailscale-User-Login, which tailscale serve sets and
// strips from clients. The unix socket is trusted. No route ever sends CORS headers.
package api

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"crow-core/contract"
	"crow-core/internal/butler"
	"crow-core/internal/eventlog"
	"crow-core/internal/mission"
	"crow-core/internal/work"
)

// IdentityHeader is the header tailscale serve sets to the caller's tailnet login.
const IdentityHeader = "Tailscale-User-Login"

// CSRFHeader must be "1" on every request that is not GET or HEAD.
const CSRFHeader = "X-Crow"

// StoreSections are the parts of GET /api/state built from the mission store. The
// sources in Options follow them, in their order.
var StoreSections = []string{"inbox", "missions", "runs"}

// Fetch reads a section that lives outside the store (accounts, jobs, deck scripts).
type Fetch func() (any, error)

// Options builds a Server.
type Options struct {
	Env       mission.Env
	Owner     func() string // tailnet login allowed on the TCP listener; empty refuses all
	Nest      string        // built Nest dir served at /; empty serves no app
	Sources   []Source      // sections outside the store, refreshed in the background
	Now       func() time.Time
	Script    Script          // runs the bin/ scripts of the live actions (live.go); nil refuses them
	ActionLog string          // core action log the live actions append to
	StateDir  string          // machine state dir (local/state): AFK jobs for ops; empty skips them
	Butler    *butler.Manager // butler chat (item_176); nil disables it
}

// Server answers the routes. It is safe for concurrent use.
type Server struct {
	o     Options
	mu    sync.Mutex // one store reader at a time
	store struct {
		version string
		updated *string
		data    map[string]any
	}
	ext   map[string]*ext
	order []string // every section, in response order
}

// Section is one part of the state with its change marks.
type Section struct {
	Section   string  `json:"section"`
	Version   string  `json:"version"`         // hash of data, also the ETag
	UpdatedAt *string `json:"updated_at"`      // last change seen, RFC 3339
	Stale     bool    `json:"stale,omitempty"` // the last refresh failed or none ran yet
	Error     string  `json:"error,omitempty"` // why it is stale
	Data      any     `json:"data"`
}

// State is GET /api/state.
type State struct {
	Version  string             `json:"version"`
	Sections map[string]Section `json:"sections"`
}

// New returns a server over the options.
func New(o Options) *Server {
	if o.Now == nil {
		o.Now = time.Now
	}
	if o.Owner == nil {
		o.Owner = func() string { return "" }
	}
	s := &Server{o: o, ext: map[string]*ext{}, order: slices.Clone(StoreSections)}
	for _, src := range o.Sources {
		if src.TTL <= 0 {
			src.TTL = 30 * time.Second
		}
		s.ext[src.Name] = &ext{src: src}
		s.order = append(s.order, src.Name)
	}
	s.order = append(s.order, WorkSection, OpsSection)
	return s
}

// Sections lists every section in response order.
func (s *Server) Sections() []string { return slices.Clone(s.order) }

// Handler is the route table. trusted is true on the unix socket, where the identity
// header is not required.
func (s *Server) Handler(trusted bool) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/state", s.state)
	mux.HandleFunc("GET /api/state/{section}", s.section)
	mux.HandleFunc("GET /api/missions/{id}", s.mission)
	mux.HandleFunc("GET /api/missions/{id}/artifacts/{path...}", s.artifact)
	mux.HandleFunc("GET /api/events", s.events)
	s.routeActions(mux)
	s.routeLive(mux)
	s.routeConversation(mux)
	s.routeTerminal(mux)
	s.routeButler(mux)
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		fail(w, http.StatusNotFound, "no route")
	})
	mux.HandleFunc("/", s.static)
	return s.guard(trusted, mux)
}

// guard checks identity and the CSRF header before any route.
func (s *Server) guard(trusted bool, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !trusted {
			owner := s.o.Owner()
			if owner == "" {
				fail(w, http.StatusForbidden, "owner login unknown: set serve.owner_login or log in to tailscale")
				return
			}
			if r.Header.Get(IdentityHeader) != owner {
				fail(w, http.StatusForbidden, "owner only")
				return
			}
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			if r.Header.Get(CSRFHeader) != "1" || !sameOrigin(r, trusted) {
				fail(w, http.StatusForbidden, "missing "+CSRFHeader+" header or foreign origin")
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

// sameOrigin accepts an Origin whose host is the request host. A browser always sends
// one on a write; only the trusted socket may leave it out.
func sameOrigin(r *http.Request, trusted bool) bool {
	o := r.Header.Get("Origin")
	if o == "" {
		return trusted
	}
	u, err := url.Parse(o)
	return err == nil && u.Host == r.Host
}

func (s *Server) state(w http.ResponseWriter, r *http.Request) {
	out := State{Sections: map[string]Section{}}
	h := sha256.New()
	for _, name := range s.order {
		sec, err := s.read(name, r)
		if err != nil {
			fail(w, http.StatusInternalServerError, name+": "+err.Error())
			return
		}
		out.Sections[name] = sec
		h.Write([]byte(name + "=" + sec.Version + ";"))
	}
	out.Version = hex.EncodeToString(h.Sum(nil))[:16]
	reply(w, r, out.Version, out)
}

func (s *Server) section(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("section")
	if !slices.Contains(s.order, name) {
		fail(w, http.StatusNotFound, "no section "+name)
		return
	}
	sec, err := s.read(name, r)
	var bad badParam
	if errors.As(err, &bad) {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	reply(w, r, sec.Version, sec)
}

// read builds one section. The store sections are rebuilt when the store version
// moves; the others answer their last refresh at once, without the store lock.
func (s *Server) read(name string, r *http.Request) (Section, error) {
	if e := s.ext[name]; e != nil {
		return s.readExt(e), nil
	}
	if name == WorkSection {
		return s.work()
	}
	if name == OpsSection {
		return s.ops(r)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.syncStore(); err != nil {
		return Section{}, err
	}
	data := s.store.data[name]
	if name == "inbox" && r.URL.Query().Get("all") == "1" {
		all, err := s.o.Env.Inbox(true)
		if err != nil {
			return Section{}, err
		}
		data = all
	}
	return Section{Section: name, Version: hash(data), UpdatedAt: s.store.updated, Data: data}, nil
}

// Locked runs fn on the store under the server lock, then rebuilds the store sections
// (inbox, missions, runs). The serve tick runs through it.
func (s *Server) Locked(fn func(mission.Env) error) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	err := fn(s.o.Env)
	if serr := s.syncStore(); err == nil {
		err = serr
	}
	return err
}

// syncStore applies new events and rebuilds the store sections when the version moved.
// The caller holds mu.
func (s *Server) syncStore() error {
	env := s.o.Env
	if _, err := env.Store.SyncAll(); err != nil {
		return err
	}
	v, err := env.Store.Version()
	if err != nil {
		return err
	}
	if v == s.store.version && s.store.data != nil {
		return nil
	}
	d, err := env.Store.Dump()
	if err != nil {
		return err
	}
	inbox, err := env.Inbox(false)
	if err != nil {
		return err
	}
	runs := slices.Clone(d.Runs)
	slices.SortStableFunc(runs, func(a, b contract.Run) int { return strings.Compare(b.Started, a.Started) })
	var updated *string
	for _, m := range d.Missions {
		if updated == nil || m.Updated > *updated {
			u := m.Updated
			updated = &u
		}
	}
	for i := range d.Missions {
		d.Missions[i].Linked = work.IsLinked(d.Missions[i])
	}
	s.store.version, s.store.updated = v, updated
	s.store.data = map[string]any{"inbox": inbox, "missions": d.Missions, "runs": runs}
	return nil
}

func (s *Server) mission(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	d, err := s.o.Env.Detail(r.PathValue("id"))
	s.mu.Unlock()
	if errors.Is(err, mission.ErrNotFound) {
		fail(w, http.StatusNotFound, "no mission")
		return
	}
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	reply(w, r, hash(d), d)
}

func (s *Server) artifact(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	full, err := s.o.Env.Artifact(r.PathValue("id"), r.PathValue("path"))
	s.mu.Unlock()
	if err != nil {
		fail(w, http.StatusNotFound, "no artifact")
		return
	}
	f, err := os.Open(full)
	if err != nil {
		fail(w, http.StatusNotFound, "no artifact")
		return
	}
	defer f.Close()
	fi, err := f.Stat()
	if err != nil {
		fail(w, http.StatusNotFound, "no artifact")
		return
	}
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Security-Policy", "sandbox")
	http.ServeContent(w, r, filepath.Base(full), fi.ModTime(), f)
}

// Event is one line of a mission log with its feed id.
type Event struct {
	ID string `json:"id"`
	contract.Event
}

// Events is GET /api/events.
type Events struct {
	Events []Event `json:"events"`
	Next   string  `json:"next"` // pass as after to read on
	More   bool    `json:"more"` // the limit cut the feed
}

// events lists the events of every mission after a cursor, oldest first. An id is
// <ts>~<mission>~<end offset>, so it sorts in feed order across missions.
func (s *Server) events(w http.ResponseWriter, r *http.Request) {
	after := r.URL.Query().Get("after")
	limit := 500
	if n, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && n > 0 && n < limit {
		limit = n
	}
	root := s.o.Env.Store.Root()
	ids, err := eventlog.Missions(root)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	var all []Event
	for _, id := range ids {
		recs, err := eventlog.Read(eventlog.Path(root, id), 0)
		if err != nil {
			fail(w, http.StatusInternalServerError, err.Error())
			return
		}
		for _, rec := range recs {
			e := Event{ID: eventID(rec.Event.TS, id, rec.End), Event: rec.Event}
			if after == "" || compareIDs(e.ID, after) > 0 {
				all = append(all, e)
			}
		}
	}
	slices.SortFunc(all, func(a, b Event) int { return compareIDs(a.ID, b.ID) })
	out := Events{Events: all, Next: after}
	if len(all) > limit {
		out.Events, out.More = all[:limit], true
	}
	if out.Events == nil {
		out.Events = []Event{}
	}
	if n := len(out.Events); n > 0 {
		out.Next = out.Events[n-1].ID
	}
	reply(w, r, hash(out), out)
}

func eventID(ts, mission string, end int64) string {
	if t, err := time.Parse(time.RFC3339Nano, ts); err == nil {
		ts = t.UTC().Format("2006-01-02T15:04:05.000000Z")
	}
	return ts + "~" + mission + "~" + strconv.FormatInt(end, 10)
}

func compareIDs(a, b string) int {
	pa, pb := strings.SplitN(a, "~", 3), strings.SplitN(b, "~", 3)
	for i := 0; i < 3; i++ {
		var x, y string
		if i < len(pa) {
			x = pa[i]
		}
		if i < len(pb) {
			y = pb[i]
		}
		if i == 2 {
			nx, _ := strconv.ParseInt(x, 10, 64)
			ny, _ := strconv.ParseInt(y, 10, 64)
			if nx != ny {
				if nx < ny {
					return -1
				}
				return 1
			}
			continue
		}
		if c := strings.Compare(x, y); c != 0 {
			return c
		}
	}
	return 0
}

// static serves the built Nest. A path with no file falls back to index.html so client
// routes load. index.html and sw.js are never cached; hashed assets are.
func (s *Server) static(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		fail(w, http.StatusMethodNotAllowed, "read only")
		return
	}
	if s.o.Nest == "" {
		fail(w, http.StatusNotFound, "no app configured")
		return
	}
	p := path.Clean("/" + r.URL.Path)
	full := filepath.Join(s.o.Nest, filepath.FromSlash(p))
	fi, err := os.Stat(full)
	if err != nil || fi.IsDir() {
		if path.Ext(p) != "" && p != "/" {
			http.NotFound(w, r)
			return
		}
		p, full = "/index.html", filepath.Join(s.o.Nest, "index.html")
	}
	switch {
	case p == "/index.html" || p == "/sw.js":
		w.Header().Set("Cache-Control", "no-cache")
	case strings.HasPrefix(p, "/assets/"):
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	default:
		w.Header().Set("Cache-Control", "no-cache")
	}
	f, err := os.Open(full)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		http.NotFound(w, r)
		return
	}
	http.ServeContent(w, r, filepath.Base(full), st.ModTime(), f)
}

// reply writes v as JSON with an ETag, or 304 when the client already has it.
func reply(w http.ResponseWriter, r *http.Request, version string, v any) {
	etag := `"` + version + `"`
	w.Header().Set("ETag", etag)
	w.Header().Set("Cache-Control", "no-cache")
	if match := r.Header.Get("If-None-Match"); match != "" && etagMatch(match, etag) {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(v)
}

func etagMatch(header, etag string) bool {
	for _, t := range strings.Split(header, ",") {
		t = strings.TrimPrefix(strings.TrimSpace(t), "W/")
		if t == etag || t == "*" {
			return true
		}
	}
	return false
}

// Error is the body of every refusal.
type Error struct {
	Error string `json:"error"`
}

func fail(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(Error{msg})
}

func hash(v any) string {
	b, _ := json.Marshal(v)
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])[:16]
}
