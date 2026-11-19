package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"testing"
)

// The cases are shared with the Python loader (tests/test_crow_modules.py).
var (
	repoRoot = filepath.Join("..", "..", "..", "..")
	cases    = filepath.Join(repoRoot, "tests", "fixtures", "modules")
)

type want struct {
	On     []string                  `json:"on"`
	Config map[string]map[string]any `json:"config"`
	Errors []string                  `json:"errors"`
}

func TestModulesMatchTheSharedFixtures(t *testing.T) {
	dirs, err := os.ReadDir(cases)
	if err != nil {
		t.Fatal(err)
	}
	for _, d := range dirs {
		if !d.IsDir() {
			continue
		}
		t.Run(d.Name(), func(t *testing.T) {
			st, err := LoadModules(filepath.Join(cases, d.Name(), "home"), repoRoot)
			if err != nil {
				t.Fatal(err)
			}
			got := want{On: []string{}, Config: map[string]map[string]any{}, Errors: []string{}}
			for n, m := range st.Modules {
				if m.On {
					got.On = append(got.On, n)
					got.Config[n] = m.Config
				}
			}
			sort.Strings(got.On)
			for _, e := range st.Errors {
				got.Errors = append(got.Errors, e.Key)
			}
			sort.Strings(got.Errors)

			raw, err := os.ReadFile(filepath.Join(cases, d.Name(), "want.json"))
			if err != nil {
				t.Fatal(err)
			}
			var exp, act any
			if err := json.Unmarshal(raw, &exp); err != nil {
				t.Fatal(err)
			}
			enc, _ := json.Marshal(got)
			_ = json.Unmarshal(enc, &act)
			if !reflect.DeepEqual(exp, act) {
				t.Errorf("got  %s\nwant %s", enc, raw)
			}
		})
	}
}

func TestModulesReturnsTheOnSet(t *testing.T) {
	on, err := Modules(t.TempDir(), repoRoot)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := on["design"]; ok {
		t.Error("design is off by default")
	}
	if got := on["nest"]["core_url"]; got != "http://127.0.0.1:8787" {
		t.Errorf("nest core_url = %v", got)
	}
}

func TestCrowYAMLAtTheRootWins(t *testing.T) {
	home := t.TempDir()
	if got := CrowYAMLPath(home); got != filepath.Join(home, "local", "crow.yaml") {
		t.Errorf("no file: %s", got)
	}
	if err := os.WriteFile(filepath.Join(home, "crow.yaml"), []byte("version: 1\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if got := CrowYAMLPath(home); got != filepath.Join(home, "crow.yaml") {
		t.Errorf("root file: %s", got)
	}
}
