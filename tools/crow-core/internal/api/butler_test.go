package api

import (
	"encoding/json"
	"net/http"
	"os/exec"
	"strings"
	"testing"
	"time"

	"crow-core/internal/butler"
)

func TestButlerRoutes(t *testing.T) {
	s, _, _ := liveServer(t, nil)
	var launched []string
	script := "#!/bin/sh\necho '{\"type\":\"system\",\"subtype\":\"init\",\"session_id\":\"S\",\"tools\":[]}'\nwhile read l; do echo '{\"type\":\"assistant\",\"message\":{\"content\":[{\"type\":\"text\",\"text\":\"Very good, Sir.\"}]}}'; echo '{\"type\":\"result\",\"subtype\":\"success\"}'; done\n"
	s.o.Butler = butler.New(butler.Options{Dir: t.TempDir(),
		Pick: func() (string, error) { return "main", nil },
		Launch: func(account, resume string) (*exec.Cmd, error) {
			launched = append(launched, account)
			return exec.Command("sh", "-c", script), nil
		}})
	defer s.o.Butler.Close()

	for name, c := range map[string]struct {
		call call
		code int
	}{
		"never account":   {post("/api/butler/main/say", `{"text":"hi","account":"locked"}`), 400},
		"unknown account": {post("/api/butler/main/say", `{"text":"hi","account":"ghost"}`), 400},
		"bad conv":        {post("/api/butler/Main!/say", `{"text":"hi"}`), 400},
		"bad surface":     {post("/api/butler/main/say", `{"text":"hi","surface":"tv"}`), 400},
		"empty text":      {post("/api/butler/main/say", `{"text":" "}`), 400},
		"no csrf":         {call{method: http.MethodPost, path: "/api/butler/main/say", body: `{"text":"hi"}`}, 403},
	} {
		if w := do(t, s, c.call); w.Code != c.code {
			t.Errorf("%s: %d %s", name, w.Code, w.Body)
		}
	}
	if len(launched) != 0 {
		t.Fatalf("refused calls launched %v", launched)
	}
	if w := do(t, s, post("/api/butler/main/say", `{"text":"What runs?","surface":"nest","account":"spare"}`)); w.Code != 202 {
		t.Fatalf("say: %d %s", w.Code, w.Body)
	}
	deadline := time.Now().Add(5 * time.Second)
	for {
		w := do(t, s, call{method: http.MethodGet, path: "/api/butler/main?after=1"})
		var v butler.View
		if err := json.Unmarshal(w.Body.Bytes(), &v); err != nil {
			t.Fatal(err)
		}
		if len(v.Messages) == 1 && v.Messages[0].Text == "Very good, Sir." && v.Account == "spare" {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("view %s", w.Body)
		}
		time.Sleep(20 * time.Millisecond)
	}
	if strings.Join(launched, ",") != "spare" {
		t.Fatalf("launched %v", launched)
	}
}
