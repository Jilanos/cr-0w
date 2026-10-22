package main

import (
	"encoding/json"
	"os"
	"slices"
	"strings"
	"testing"
)

func mixedUsage(t *testing.T) *usage {
	b, err := os.ReadFile("testdata/usage-mixed.json")
	if err != nil {
		t.Fatal(err)
	}
	u, err := parseUsage(b)
	if err != nil {
		t.Fatal(err)
	}
	return u
}

// A Claude agent, a Codex agent with its own context window, a Codex run that finished and a
// Codex session stopped by its limit: every row names its provider once the board is mixed.
func mixedModel(t *testing.T) model {
	s := sample()
	s.Agents = append(s.Agents, agent{Kind: "session", Provider: "codex", Account: "cx", Project: "billing-api",
		State: "working", LastActivityS: 3, ContextTokens: 300000, ContextWindow: 400000, Title: "codex fixes the webhook retry",
		SessionID: "01a16410-0000-7d51-8db9-000000000001", StartedAt: "2026-10-20T11:00:00+00:00", LastAction: "shell: go test ./..."})
	for i := range s.Agents {
		if s.Agents[i].Provider == "" {
			s.Agents[i].Provider, s.Agents[i].Account = "claude", "main"
		}
	}
	s.Finished = append(s.Finished, finished{RunID: "c0dex000", Provider: "codex", Account: "cx", Project: "billing-api",
		Label: "pagination", Status: "failed", DurationS: 300, EndedAt: "2026-10-20T09:07:00+00:00"})
	intr := sampleIntr()
	for i := range intr {
		intr[i].Provider = "claude"
	}
	intr[0].Provider, intr[0].Account = "codex", "cx"
	s.Finished[0].Provider, s.Finished[0].Account = "claude", "main"
	m := model{w: 160, h: 45, snap: s, intr: intr, usage: mixedUsage(t), now: fixtureNow(), reports: map[string]string{}}
	m.rebuild()
	return m
}

func TestMixedAgentsNameProviders(t *testing.T) {
	m := mixedModel(t)
	contains(t, "mixed board", m.View(), []string{"codex:cx 5h limit", "codex:cx", "ctx 75%"}, []string{"?:"})
	m.selKey = "01a16410-0000-7d51-8db9-000000000001"
	m.rebuild()
	contains(t, "codex details", m.View(), []string{"codex:cx", "context 75% used"}, nil)
	m.selKey = "5ab51b0c-0000"
	m.rebuild()
	contains(t, "relaunch wording", m.View(), []string{"on codex:cx", "native resume of this exact conversation",
		"transfer to a new conversation", "asks before anything moves"}, nil)
}

// Claude-only payloads (no provider fields, or all claude) render exactly as before.
func TestClaudeOnlyBoardHasNoProviderTags(t *testing.T) {
	m := triageModel(t)
	contains(t, "legacy board", m.View(), []string{"main 5h limit"}, []string{"claude:", "codex", "?:"})
	u := model{w: 160, h: 45, usage: fixtureUsage(t), view: vUsage, period: "w", now: fixtureNow()}
	contains(t, "legacy usage", u.View(), []string{"Limits"}, []string{"claude:", "$?"})
}

func TestMixedUsageShowsProvidersAndUnknownCost(t *testing.T) {
	u := mixedUsage(t)
	if !u.mixed {
		t.Fatal("payload with a codex session is mixed")
	}
	m := model{w: 240, h: 62, usage: u, view: vUsage, period: "d", now: fixtureNow()}
	out := m.View()
	contains(t, "mixed usage", out, []string{"codex:cx", "claude:", "1 unpriced"}, nil)
	if !strings.Contains(out, "+ today") {
		t.Error("partially priced today must be marked with +")
	}
	if u.Days[0].CostKnown || u.Days[0].cost() != "$?" {
		t.Errorf("a day with no priced usage is unknown, got %q", u.Days[0].cost())
	}
	var zero rollup
	if err := json.Unmarshal([]byte(`{"cost_usd": 0, "sessions": 1}`), &zero); err != nil || zero.cost() != "$0.00" {
		t.Errorf("a measured zero stays $0.00, got %q (%v)", zero.cost(), err)
	}
}

func TestMixedViewsFitTerminal(t *testing.T) {
	for _, size := range sizes {
		for v := range viewNames {
			m := mixedModel(t)
			m.w, m.h, m.view, m.period = size[0], size[1], v, "w"
			m.rebuild()
			lines := strings.Split(m.View(), "\n")
			if len(lines) != size[1] {
				t.Errorf("mixed %s %dx%d: %d lines", viewNames[v], size[0], size[1], len(lines))
			}
		}
	}
}

func TestRelaunchUsesTheSharedGuardedCommand(t *testing.T) {
	a := relaunchArgs(interrupted{ID: "01a1-x", Provider: "codex", Account: "cx"})
	i := slices.Index(a, "relaunch")
	if i < 0 || !slices.Equal(a[i:], []string{"relaunch", "01a1-x", "auto", "--source", "cx", "--here"}) {
		t.Fatalf("relaunch argv %v", a)
	}
}
