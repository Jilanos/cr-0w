package main

import (
	"bytes"
	"encoding/json"
	"net"
	"net/http"
	"path/filepath"
	"strings"
	"testing"
)

func TestMCPLoop(t *testing.T) {
	sock := filepath.Join(t.TempDir(), "core.sock")
	l, err := net.Listen("unix", sock)
	if err != nil {
		t.Fatal(err)
	}
	var got []string
	srv := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = append(got, r.Method+" "+r.URL.Path+" "+r.Header.Get("X-Crow"))
		if r.Method == "POST" {
			w.Write([]byte(`{"id":"20261118-build-x","gates":["plan","report"]}`))
			return
		}
		if strings.HasSuffix(r.URL.Path, "/ghost") {
			w.WriteHeader(404)
			w.Write([]byte(`{"error":"no section ghost"}`))
			return
		}
		w.Write([]byte(`{"section":"runs"}`))
	})}
	go srv.Serve(l)
	defer srv.Close()

	in := strings.Join([]string{
		`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26"}}`,
		`{"jsonrpc":"2.0","method":"notifications/initialized"}`,
		`{"jsonrpc":"2.0","id":2,"method":"tools/list"}`,
		`{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"brief","arguments":{"section":"runs"}}}`,
		`{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"brief","arguments":{"section":"ghost"}}}`,
		`{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"mission_new","arguments":{"kind":"build","project":"x","goal":"g","end_state":"e"}}}`,
		`{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"push"}}`,
	}, "\n")
	var out bytes.Buffer
	if err := mcpServe(sock, strings.NewReader(in), &out); err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(strings.TrimSpace(out.String()), "\n")
	if len(lines) != 6 {
		t.Fatalf("replies %q", lines)
	}
	var r []map[string]any
	for _, l := range lines {
		var m map[string]any
		json.Unmarshal([]byte(l), &m)
		r = append(r, m)
	}
	if r[0]["result"].(map[string]any)["protocolVersion"] != "2025-03-26" {
		t.Fatalf("init %v", r[0])
	}
	if n := len(r[1]["result"].(map[string]any)["tools"].([]any)); n != 6 {
		t.Fatalf("tools %d", n)
	}
	if !strings.Contains(lines[3], `"isError":true`) || !strings.Contains(lines[3], "no section ghost") {
		t.Fatalf("error result %s", lines[3])
	}
	if !strings.Contains(lines[4], `\"inbox\":true`) {
		t.Fatalf("mission_new %s", lines[4])
	}
	if !strings.Contains(lines[5], `"error"`) {
		t.Fatalf("unknown tool %s", lines[5])
	}
	if strings.Join(got, "|") != "GET /api/state/runs 1|GET /api/state/ghost 1|POST /api/missions 1" {
		t.Fatalf("calls %v", got)
	}
}
