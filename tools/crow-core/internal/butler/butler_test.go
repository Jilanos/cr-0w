package butler

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// fake writes a script that acts as claude: an init event on start, then for each input
// line a tool call, a tool result, the echoed text and a result event.
func fake(t *testing.T, tools string) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), "claude.sh")
	script := `#!/bin/sh
echo '{"type":"system","subtype":"init","session_id":"S-'"$1"'","tools":` + tools + `}'
while IFS= read -r line; do
  text=$(printf '%s' "$line" | sed 's/.*"content":"\([^"]*\)".*/\1/')
  case "$text" in *slow*) sleep 0.3;; esac
  echo '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Sir"}}}'
  echo '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"mcp__core__mission_new","input":{"kind":"review","project":"api"}}]}}'
  echo '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","content":"{\"mission_id\":\"20261118-review-api-412\",\"inbox\":true}"}]}}'
  echo "{\"type\":\"assistant\",\"message\":{\"content\":[{\"type\":\"text\",\"text\":\"re: $1 $text\"}]}}"
  echo '{"type":"result","subtype":"success","session_id":"S-'"$1"'"}'
done
`
	if err := os.WriteFile(p, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	return p
}

type launch struct{ account, resume string }

func manager(t *testing.T, script string, calls *[]launch) *Manager {
	t.Helper()
	dir := t.TempDir()
	return New(Options{Dir: dir, Pick: func() (string, error) { return "auto1", nil },
		Launch: func(account, resume string) (*exec.Cmd, error) {
			*calls = append(*calls, launch{account, resume})
			return exec.Command(script, account), nil
		}})
}

func wait(t *testing.T, m *Manager, conv string, ok func(View) bool) View {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for {
		v, err := m.Get(conv, 0)
		if err != nil {
			t.Fatal(err)
		}
		if ok(v) {
			return v
		}
		if time.Now().After(deadline) {
			t.Fatalf("timeout; view %+v", v)
		}
		time.Sleep(20 * time.Millisecond)
	}
}

func crow(v View) []Msg {
	var out []Msg
	for _, m := range v.Messages {
		if m.Role == "crow" {
			out = append(out, m)
		}
	}
	return out
}

func TestTurnQueueAndChips(t *testing.T) {
	var calls []launch
	m := manager(t, fake(t, `["mcp__core__brief"]`), &calls)
	defer m.Close()
	if _, err := m.Say("main", "slow one", "nest"); err != nil {
		t.Fatal(err)
	}
	if _, err := m.Say("main", "two", "phone"); err != nil { // mid-turn: queued
		t.Fatal(err)
	}
	v := wait(t, m, "main", func(v View) bool { return len(crow(v)) == 2 && !v.Busy })
	c := crow(v)
	if !strings.Contains(c[0].Text, "[nest] slow one") || !strings.Contains(c[1].Text, "[phone] two") {
		t.Fatalf("replies %+v", c)
	}
	if len(c[1].Chips) != 2 || c[1].Chips[0].Href != "/missions/20261118-review-api-412" || c[1].Chips[1].Href != "/inbox" {
		t.Fatalf("chips %+v", c[1].Chips)
	}
	if len(calls) != 1 || calls[0] != (launch{"auto1", ""}) {
		t.Fatalf("launches %+v", calls)
	}
	meta, _ := m.Meta("main")
	if meta.SessionID != "S-auto1" || meta.Account != "auto1" {
		t.Fatalf("meta %+v", meta)
	}
	if v.Messages[1].Role != "you" || v.Messages[2].Role != "tool" || v.Messages[2].Text != "mission_new · review · api" {
		t.Fatalf("messages %+v", v.Messages)
	}
}

func TestResumeAfterIdleAndReload(t *testing.T) {
	var calls []launch
	script := fake(t, `["mcp__core__brief"]`)
	m := manager(t, script, &calls)
	m.o.Idle = 50 * time.Millisecond
	m.Say("main", "hello", "")
	wait(t, m, "main", func(v View) bool { return len(crow(v)) == 1 && !v.Running })
	m.Say("main", "again", "")
	wait(t, m, "main", func(v View) bool { return len(crow(v)) == 2 })
	if len(calls) != 2 || calls[1] != (launch{"auto1", "S-auto1"}) {
		t.Fatalf("launches %+v", calls)
	}
	m.Close()
	// A new manager on the same dir reads the transcript back (AC4).
	m2 := New(Options{Dir: m.o.Dir})
	v, _ := m2.Get("main", 2)
	if v.Last != len(v.Messages)+2 || v.Messages[0].Seq != 3 {
		t.Fatalf("reload %+v", v)
	}
}

func TestAccountChangeSeedsFreshSession(t *testing.T) {
	var calls []launch
	m := manager(t, fake(t, `["mcp__core__brief"]`), &calls)
	defer m.Close()
	m.Say("main", "first", "")
	wait(t, m, "main", func(v View) bool { return len(crow(v)) == 1 && !v.Busy })
	if err := m.SetAccount("main", "spare2"); err != nil {
		t.Fatal(err)
	}
	m.Say("main", "second", "")
	v := wait(t, m, "main", func(v View) bool { return len(crow(v)) == 2 && !v.Busy })
	if len(calls) != 2 || calls[1] != (launch{"spare2", ""}) {
		t.Fatalf("launches %+v", calls)
	}
	last := crow(v)[1].Text
	if !strings.HasPrefix(last, "re: spare2 [earlier in this conversation") || !strings.Contains(last, "owner: first") {
		t.Fatalf("seed %q", last)
	}
	if v.Account != "spare2" || crow(v)[1].Account != "spare2" {
		t.Fatalf("account %+v", v)
	}
}

func TestForeignToolStopsProcess(t *testing.T) {
	var calls []launch
	m := manager(t, fake(t, `["mcp__core__brief","Bash"]`), &calls)
	defer m.Close()
	m.Say("main", "hi", "")
	v := wait(t, m, "main", func(v View) bool { return !v.Busy && !v.Running && len(v.Messages) >= 2 })
	if len(crow(v)) != 0 || !strings.Contains(v.Messages[1].Text, "tool Bash outside the core tools") {
		t.Fatalf("view %+v", v)
	}
}

func TestBadInput(t *testing.T) {
	m := New(Options{Dir: t.TempDir()})
	if _, err := m.Get("../x", 0); err != ErrConv {
		t.Fatalf("conv: %v", err)
	}
	if _, err := m.Say("main", "  ", ""); err == nil {
		t.Fatal("empty text accepted")
	}
	if _, err := m.Say("main", "hi", ""); err == nil || !strings.Contains(err.Error(), "disabled") {
		t.Fatalf("no launcher: %v", err)
	}
	v, _ := m.Get("main", 0)
	if len(v.Messages) != 2 || v.Messages[1].Role != "note" {
		t.Fatalf("note %+v", v)
	}
}
