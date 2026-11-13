package api

import (
	"bytes"
	"encoding/json"
	"flag"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"crow-core/internal/mission"
	"crow-core/internal/project"
	"crow-core/internal/store"
	"crow-core/internal/testfix"
)

var update = flag.Bool("update", false, "rewrite the API response fixtures")

const owner = "owner@example.com"

// Fixtures is where the response fixtures live, shared with the Python tests.
var Fixtures = filepath.Join(testfix.CoreSpec, "fixtures", "api")

var clock = time.Date(2026, 11, 10, 9, 0, 0, 0, time.UTC)

// newServer serves the two fixture missions with their spec files, and fixed accounts
// and jobs.
func newServer(t *testing.T) (*Server, string) {
	t.Helper()
	root := testfix.MissionsRoot(t)
	build := filepath.Join(root, "20261109-build-item-095")
	src := filepath.Join(testfix.RunSpec, "examples", "20261109-build-item-095")
	copyTree(t, src, build)
	research := filepath.Join(root, "20261109-research-android-push-options")
	writeFile(t, filepath.Join(research, "outbox", "questions.json"),
		testfix.Read(t, filepath.Join(testfix.RunSpec, "examples", "gates", "questions.json")))
	kinds := project.KindDirs(testfix.KindsDir, "")
	s, err := store.Open(filepath.Join(t.TempDir(), "core.db"), root, kinds)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	env := mission.Env{Store: s, Kinds: kinds, Now: func() time.Time { return clock }}
	srv := New(Options{
		Env:   env,
		Owner: func() string { return owner },
		Nest:  nestDir(t),
		Sources: append(scriptSources(t), Source{Name: "jobs", Fetch: func() (any, error) {
			return ParseTimers([]byte(`[{"next":1794330227942489,"last":0,"unit":"crow-retro.timer","activates":"crow-retro.service"},
				{"next":1,"last":2,"unit":"other.timer","activates":"other.service"}]`))
		}}),
		Now: func() time.Time { return clock },
	})
	for _, name := range srv.Sections() {
		srv.Refresh(name)
	}
	return srv, root
}

// scriptPayloads maps each script section to its synthetic payload in the script
// contract (item_173), standing in for the bin/ script's stdout.
var scriptPayloads = []struct{ section, fixture string }{
	{"sessions", "sessions"}, {"dispatch", "runs"}, {"usage", "usage"}, {"today", "today"},
	{"mrs", "mrs"}, {"checks", "checks"}, {"projects", "registry"}, {"accounts", "accounts"},
}

func scriptSources(t *testing.T) []Source {
	var out []Source
	for _, p := range scriptPayloads {
		b := testfix.Read(t, filepath.Join(testfix.ScriptSpec, "fixtures", p.fixture+".json"))
		out = append(out, Source{Name: p.section, Fetch: func() (any, error) {
			var v any
			return v, json.Unmarshal(b, &v)
		}})
	}
	return out
}

func nestDir(t *testing.T) string {
	dir := t.TempDir()
	writeFile(t, filepath.Join(dir, "index.html"), []byte("<!doctype html><title>CR-0W</title>"))
	writeFile(t, filepath.Join(dir, "sw.js"), []byte("// sw"))
	writeFile(t, filepath.Join(dir, "assets", "app-1a2b.js"), []byte("// app"))
	return dir
}

func copyTree(t *testing.T, src, dst string) {
	t.Helper()
	err := filepath.WalkDir(src, func(p string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		rel, _ := filepath.Rel(src, p)
		writeFile(t, filepath.Join(dst, rel), testfix.Read(t, p))
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

func writeFile(t *testing.T, p string, b []byte) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(p), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, b, 0o600); err != nil {
		t.Fatal(err)
	}
}

type call struct {
	method, path string
	header       map[string]string
	trusted      bool
	body         string
}

func do(t *testing.T, s *Server, c call) *httptest.ResponseRecorder {
	t.Helper()
	if c.method == "" {
		c.method = http.MethodGet
	}
	r := httptest.NewRequest(c.method, "http://core.example"+c.path, strings.NewReader(c.body))
	if !c.trusted {
		r.Header.Set(IdentityHeader, owner)
	}
	for k, v := range c.header {
		if v == "" {
			r.Header.Del(k)
		} else {
			r.Header.Set(k, v)
		}
	}
	w := httptest.NewRecorder()
	s.Handler(c.trusted).ServeHTTP(w, r)
	return w
}

// TestResponseFixtures checks every endpoint against its fixture (AC4). Run with
// -update to rewrite them after a deliberate shape change.
func TestResponseFixtures(t *testing.T) {
	s, _ := newServer(t)
	cases := map[string]call{
		"state":               {path: "/api/state"},
		"state-inbox":         {path: "/api/state/inbox"},
		"state-inbox-all":     {path: "/api/state/inbox?all=1"},
		"state-missions":      {path: "/api/state/missions"},
		"state-runs":          {path: "/api/state/runs"},
		"state-accounts":      {path: "/api/state/accounts"},
		"state-jobs":          {path: "/api/state/jobs"},
		"state-sessions":      {path: "/api/state/sessions"},
		"state-dispatch":      {path: "/api/state/dispatch"},
		"state-usage":         {path: "/api/state/usage"},
		"state-today":         {path: "/api/state/today"},
		"state-mrs":           {path: "/api/state/mrs"},
		"state-checks":        {path: "/api/state/checks"},
		"state-projects":      {path: "/api/state/projects"},
		"state-work":          {path: "/api/state/work"},
		"mission":             {path: "/api/missions/20261109-build-item-095"},
		"mission-questions":   {path: "/api/missions/20261109-research-android-push-options"},
		"events":              {path: "/api/events?limit=3"},
		"error-no-identity":   {path: "/api/state/inbox", header: map[string]string{IdentityHeader: ""}},
		"error-no-mission":    {path: "/api/missions/20261109-build-nothing"},
		"error-no-section":    {path: "/api/state/secrets"},
		"error-write-no-csrf": {method: http.MethodPost, path: "/api/state", trusted: true},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			w := do(t, s, c)
			if w.Header().Get("Access-Control-Allow-Origin") != "" {
				t.Fatal("CORS header sent")
			}
			got := indent(t, w.Body.Bytes())
			p := filepath.Join(Fixtures, name+".json")
			if *update {
				writeFile(t, p, got)
				return
			}
			if want := testfix.Read(t, p); !bytes.Equal(got, want) {
				t.Errorf("%s: response differs from %s (go test -update to rewrite)\n%s", c.path, p, got)
			}
			if strings.HasPrefix(name, "error-") == (w.Code == http.StatusOK) {
				t.Errorf("%s: status %d", c.path, w.Code)
			}
		})
	}
}

func indent(t *testing.T, b []byte) []byte {
	var buf bytes.Buffer
	if err := json.Indent(&buf, bytes.TrimSpace(b), "", "  "); err != nil {
		t.Fatalf("not JSON: %s", b)
	}
	buf.WriteByte('\n')
	return buf.Bytes()
}

// TestIdentity refuses a TCP request without the owner login and serves the socket (AC2).
func TestIdentity(t *testing.T) {
	s, _ := newServer(t)
	for _, c := range []struct {
		call
		code int
	}{
		{call{path: "/api/state/inbox"}, 200},
		{call{path: "/api/state/inbox", header: map[string]string{IdentityHeader: ""}}, 403},
		{call{path: "/api/state/inbox", header: map[string]string{IdentityHeader: "someone@example.com"}}, 403},
		{call{path: "/", header: map[string]string{IdentityHeader: ""}}, 403},
		{call{path: "/api/state/inbox", trusted: true}, 200},
	} {
		if w := do(t, s, c.call); w.Code != c.code {
			t.Errorf("%s %v: %d, want %d", c.path, c.header, w.Code, c.code)
		}
	}
	none := New(Options{Env: s.o.Env})
	r := httptest.NewRequest("GET", "/api/state/inbox", nil)
	r.Header.Set(IdentityHeader, "")
	w := httptest.NewRecorder()
	none.Handler(false).ServeHTTP(w, r)
	if w.Code != 403 {
		t.Errorf("no owner configured: %d, want 403", w.Code)
	}
}

// TestCSRF refuses writes without X-Crow or from a foreign origin.
func TestCSRF(t *testing.T) {
	s, _ := newServer(t)
	for _, c := range []struct {
		call
		code int
	}{
		{call{method: "POST", path: "/api/state"}, 403},
		{call{method: "POST", path: "/api/state", header: map[string]string{CSRFHeader: "1"}}, 403},
		{call{method: "POST", path: "/api/state", header: map[string]string{CSRFHeader: "1", "Origin": "https://evil.example"}}, 403},
		{call{method: "POST", path: "/api/state", header: map[string]string{CSRFHeader: "1", "Origin": "https://core.example"}}, 404},
		{call{method: "POST", path: "/api/state", trusted: true, header: map[string]string{CSRFHeader: "1"}}, 404},
	} {
		if w := do(t, s, c.call); w.Code != c.code {
			t.Errorf("%v: %d, want %d", c.header, w.Code, c.code)
		}
	}
}

// TestETag answers 304 until the store version moves (AC3).
func TestETag(t *testing.T) {
	s, root := newServer(t)
	w := do(t, s, call{path: "/api/state/missions"})
	etag := w.Header().Get("ETag")
	if etag == "" || w.Header().Get("Cache-Control") != "no-cache" {
		t.Fatalf("headers = %v", w.Header())
	}
	inm := map[string]string{"If-None-Match": etag}
	if w := do(t, s, call{path: "/api/state/missions", header: inm}); w.Code != http.StatusNotModified {
		t.Fatalf("repeat: %d, want 304", w.Code)
	}
	// A new mission log moves the store version.
	src := testfix.Logs()["20261109-research-android-push-options"]
	first := strings.SplitN(string(testfix.Read(t, src)), "\n", 2)[0]
	first = strings.ReplaceAll(first, "20261109-research-android-push-options", "20261110-research-etag-test")
	writeFile(t, filepath.Join(root, "20261110-research-etag-test", "events.jsonl"), []byte(first+"\n"))
	if w := do(t, s, call{path: "/api/state/missions", header: inm}); w.Code != http.StatusOK || w.Header().Get("ETag") == etag {
		t.Fatalf("after an event: %d %s, want 200 and a new ETag", w.Code, w.Header().Get("ETag"))
	}
}

// TestArtifacts serves outbox files and answers 404 outside the mission outbox (AC5).
func TestArtifacts(t *testing.T) {
	s, root := newServer(t)
	dir := filepath.Join(root, "20261109-build-item-095")
	writeFile(t, filepath.Join(root, "secret.txt"), []byte("no"))
	if err := os.Symlink(filepath.Join(root, "secret.txt"), filepath.Join(dir, "outbox", "link.txt")); err != nil {
		t.Fatal(err)
	}
	ok := do(t, s, call{path: "/api/missions/20261109-build-item-095/artifacts/outbox/checks.log"})
	if ok.Code != 200 || ok.Header().Get("Content-Security-Policy") != "sandbox" {
		t.Fatalf("outbox file: %d %v", ok.Code, ok.Header())
	}
	b, _ := io.ReadAll(ok.Body)
	if want := testfix.Read(t, filepath.Join(dir, "outbox", "checks.log")); !bytes.Equal(b, want) {
		t.Error("outbox file body differs")
	}
	for _, p := range []string{
		"/api/missions/20261109-build-item-095/artifacts/brief.md",
		"/api/missions/20261109-build-item-095/artifacts/outbox/../brief.md",
		"/api/missions/20261109-build-item-095/artifacts/outbox/%2e%2e/brief.md",
		"/api/missions/20261109-build-item-095/artifacts/outbox/%2e%2e/%2e%2e/secret.txt",
		"/api/missions/20261109-build-item-095/artifacts/outbox/link.txt",
		"/api/missions/20261109-build-item-095/artifacts/outbox/missing.txt",
		"/api/missions/20261109-build-item-095/artifacts/outbox",
		"/api/missions/..%2f..%2fetc/artifacts/outbox/passwd",
		"/api/missions/20261109-build-nothing/artifacts/outbox/checks.log",
	} {
		// The mux answers dot segments with a redirect to the cleaned path.
		if w := do(t, s, call{path: p}); w.Code != http.StatusNotFound && !redirect(w.Code) {
			t.Errorf("%s: %d, want 404", p, w.Code)
		} else if redirect(w.Code) && !strings.Contains(w.Header().Get("Location"), "/artifacts/") {
			t.Errorf("%s: redirect out of artifacts to %s", p, w.Header().Get("Location"))
		}
	}
}

func redirect(code int) bool {
	return code == http.StatusMovedPermanently || code == http.StatusTemporaryRedirect
}

// TestStatic serves Nest with the index fallback and the cache rules.
func TestStatic(t *testing.T) {
	s, _ := newServer(t)
	for _, c := range []struct {
		path, cache string
		code        int
		body        string
	}{
		{"/", "no-cache", 200, "CR-0W"},
		{"/inbox/abc", "no-cache", 200, "CR-0W"},
		{"/sw.js", "no-cache", 200, "// sw"},
		{"/assets/app-1a2b.js", "public, max-age=31536000, immutable", 200, "// app"},
		{"/assets/missing.js", "", 404, ""},
		{"/../../etc/passwd", "", 404, ""},
		{"/etc/passwd", "no-cache", 200, "CR-0W"},
	} {
		w := do(t, s, call{path: c.path})
		if redirect(w.Code) && c.code == 404 {
			continue
		}
		if w.Code != c.code || w.Header().Get("Cache-Control") != c.cache && c.code == 200 || !strings.Contains(w.Body.String(), c.body) {
			t.Errorf("%s: %d %q %q", c.path, w.Code, w.Header().Get("Cache-Control"), w.Body.String())
		}
	}
}

func TestEventCursor(t *testing.T) {
	s, _ := newServer(t)
	var all Events
	json.Unmarshal(do(t, s, call{path: "/api/events"}).Body.Bytes(), &all)
	if len(all.Events) < 4 || all.More {
		t.Fatalf("events = %d more=%v", len(all.Events), all.More)
	}
	var page Events
	json.Unmarshal(do(t, s, call{path: "/api/events?limit=2&after=" + all.Events[1].ID}).Body.Bytes(), &page)
	if len(page.Events) != 2 || page.Events[0].ID != all.Events[2].ID || !page.More {
		t.Fatalf("page after %s = %+v", all.Events[1].ID, page)
	}
	var end Events
	json.Unmarshal(do(t, s, call{path: "/api/events?after=" + all.Next}).Body.Bytes(), &end)
	if len(end.Events) != 0 || end.Next != all.Next {
		t.Fatalf("after the last = %+v", end)
	}
}
