package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// fakeAccounts writes engine/bin/crow-accounts that logs its args, then runs body.
func fakeAccounts(t *testing.T, body string) (engine, log string) {
	t.Helper()
	engine = t.TempDir()
	log = filepath.Join(engine, "args")
	bin := filepath.Join(engine, "bin")
	if err := os.MkdirAll(bin, 0o755); err != nil {
		t.Fatal(err)
	}
	script := "#!/bin/sh\necho \"$@\" > " + log + "\n" + body + "\n"
	if err := os.WriteFile(filepath.Join(bin, "crow-accounts"), []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	return engine, log
}

func TestButlerPickAsksForAClaudeAccount(t *testing.T) {
	engine, log := fakeAccounts(t, "echo 'crow: using cl' >&2; echo cl")
	got, err := butlerPick(engine)()
	if err != nil || got != "cl" {
		t.Fatalf("got %q %v", got, err)
	}
	args, _ := os.ReadFile(log)
	if !strings.Contains(string(args), "pick --on-busy fail --provider claude") {
		t.Fatalf("args %q", args)
	}
}

func TestButlerPickWithNoClaudeAccountSaysWhy(t *testing.T) {
	engine, _ := fakeAccounts(t, "echo 'crow: no allowed account runs claude (cx: runs codex).' >&2; exit 1")
	_, err := butlerPick(engine)()
	if err == nil || !strings.HasPrefix(err.Error(), "no account can run the butler: ") || !strings.Contains(err.Error(), "cx: runs codex") {
		t.Fatalf("err %v", err)
	}
}
