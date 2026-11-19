package main

// `crow-core mcp` is the butler's only tool server (item_176, req_032): an MCP stdio
// server whose tools call the core API over the trusted unix socket. It holds no outward
// action (push, merge, mail, inbox answers): what needs the owner lands in the inbox.

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const mcpProtocol = "2025-06-18"

// mcpMax caps one tool result so a large section does not flood the butler's context.
const mcpMax = 24 << 10

type mcpTool struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	InputSchema map[string]any `json:"inputSchema"`
	call        func(c *coreClient, in map[string]any) (string, error)
}

func obj(required []string, props map[string]any) map[string]any {
	if required == nil {
		required = []string{}
	}
	return map[string]any{"type": "object", "properties": props, "required": required, "additionalProperties": false}
}

func strProp(desc string) map[string]any {
	return map[string]any{"type": "string", "description": desc}
}

var briefSections = []string{"inbox", "missions", "runs", "sessions", "dispatch", "jobs", "today", "mrs", "checks", "projects", "work", "accounts"}

func mcpTools() []mcpTool {
	return []mcpTool{
		{Name: "brief", Description: "Read one section of the live crow state, as Nest shows it. inbox: what waits on the owner; missions and runs: core missions; sessions: live Claude sessions; dispatch: background runs; today: mail and calendar; mrs and checks: forge state; work: sprint tickets.",
			InputSchema: obj([]string{"section"}, map[string]any{"section": map[string]any{"type": "string", "enum": briefSections}}),
			call: func(c *coreClient, in map[string]any) (string, error) {
				return c.get("/api/state/" + url.PathEscape(arg(in, "section")))
			}},
		{Name: "usage", Description: "Quota used and left per account (5h and week windows).",
			InputSchema: obj(nil, map[string]any{}),
			call:        func(c *coreClient, in map[string]any) (string, error) { return c.get("/api/state/usage") }},
		{Name: "mission_get", Description: "One mission with its runs, gates, inbox rows and last report.",
			InputSchema: obj([]string{"mission_id"}, map[string]any{"mission_id": strProp("mission id, e.g. 20261118-review-api-412")}),
			call: func(c *coreClient, in map[string]any) (string, error) {
				return c.get("/api/missions/" + url.PathEscape(arg(in, "mission_id")))
			}},
		{Name: "mission_new", Description: "Create a core mission when the owner asks for one (review, plan, design, research). It is queued under its kind's gates and the core tick starts it within minutes: a plan or mockup gate waits in the owner's inbox before any work; the reply says so with inbox true. Kinds the tick does not start yet (build, repair, review-fix, write) are refused with the reason: use dispatch_run or session_new for them. Never create one the owner did not ask for.",
			InputSchema: obj([]string{"kind", "project", "goal", "end_state"}, map[string]any{
				"kind": strProp("review, plan, design or research"), "project": strProp("registry project name (see brief projects)"),
				"goal": strProp("one line, the owner's words"), "end_state": strProp("what done looks like"),
				"key": strProp("short id part, e.g. api-412; optional"),
			}),
			call: func(c *coreClient, in map[string]any) (string, error) {
				body := map[string]any{"kind": arg(in, "kind"), "project": arg(in, "project"), "goal": arg(in, "goal"), "end_state": arg(in, "end_state")}
				if k := arg(in, "key"); k != "" {
					body["key"] = k
				}
				out, err := c.post("/api/missions", body)
				if err != nil {
					return "", err
				}
				return markInbox(out), nil
			}},
		{Name: "session_new", Description: "Open a live Claude session in a project, only when the owner asks for a session.",
			InputSchema: obj([]string{"project"}, map[string]any{"project": strProp("registry project name"), "prompt": strProp("first message; optional")}),
			call: func(c *coreClient, in map[string]any) (string, error) {
				return c.post("/api/sessions", map[string]any{"project": arg(in, "project"), "prompt": arg(in, "prompt")})
			}},
		{Name: "dispatch_run", Description: "Start a background run in a project, only when the owner asks for one. crow picks an allowed account.",
			InputSchema: obj([]string{"project", "label", "prompt"}, map[string]any{"project": strProp("registry project name"), "label": strProp("short label"), "prompt": strProp("the run's task")}),
			call: func(c *coreClient, in map[string]any) (string, error) {
				return c.post("/api/dispatch", map[string]any{"project": arg(in, "project"), "label": arg(in, "label"), "prompt": arg(in, "prompt")})
			}},
	}
}

// markInbox adds "inbox": true to a created mission whose first gate waits on the owner.
func markInbox(out string) string {
	var m map[string]any
	if json.Unmarshal([]byte(out), &m) != nil {
		return out
	}
	gates, _ := m["gates"].([]any)
	for _, g := range gates {
		if g == "plan" || g == "mockup" {
			m["inbox"] = true
		}
	}
	b, _ := json.Marshal(m)
	return string(b)
}

func arg(in map[string]any, k string) string {
	s, _ := in[k].(string)
	return strings.TrimSpace(s)
}

type coreClient struct{ http *http.Client }

func newCoreClient(socket string) *coreClient {
	return &coreClient{http: &http.Client{Timeout: 60 * time.Second, Transport: &http.Transport{
		DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
			return (&net.Dialer{}).DialContext(ctx, "unix", socket)
		}}}}
}

func (c *coreClient) get(path string) (string, error) { return c.do("GET", path, nil) }

func (c *coreClient) post(path string, body any) (string, error) {
	b, _ := json.Marshal(body)
	return c.do("POST", path, b)
}

func (c *coreClient) do(method, path string, body []byte) (string, error) {
	req, err := http.NewRequest(method, "http://core"+path, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("X-Crow", "1")
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return "", fmt.Errorf("core unreachable: %w", err)
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if resp.StatusCode >= 300 {
		var e struct{ Error string }
		if json.Unmarshal(b, &e) == nil && e.Error != "" {
			return "", fmt.Errorf("%s", e.Error)
		}
		return "", fmt.Errorf("core: %s", resp.Status)
	}
	if len(b) > mcpMax {
		return string(b[:mcpMax]) + "\n[cut: result over 24 KB]", nil
	}
	return string(b), nil
}

type rpcReq struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

// mcpServe answers JSON-RPC lines on stdin until it closes.
func mcpServe(socket string, stdin io.Reader, stdout io.Writer) error {
	return mcpLoop(newCoreClient(socket), mcpTools(), stdin, stdout)
}

func mcpLoop(c *coreClient, tools []mcpTool, stdin io.Reader, stdout io.Writer) error {
	byName := map[string]mcpTool{}
	for _, t := range tools {
		byName[t.Name] = t
	}
	sc := bufio.NewScanner(stdin)
	sc.Buffer(make([]byte, 64<<10), 8<<20)
	enc := json.NewEncoder(stdout)
	for sc.Scan() {
		var r rpcReq
		if err := json.Unmarshal(sc.Bytes(), &r); err != nil {
			_ = enc.Encode(map[string]any{"jsonrpc": "2.0", "id": nil, "error": map[string]any{"code": -32700, "message": "parse error"}})
			continue
		}
		if len(r.ID) == 0 { // notification
			continue
		}
		res, rerr := mcpHandle(c, byName, tools, r)
		out := map[string]any{"jsonrpc": "2.0", "id": r.ID}
		if rerr != nil {
			out["error"] = rerr
		} else {
			out["result"] = res
		}
		if err := enc.Encode(out); err != nil {
			return err
		}
	}
	return sc.Err()
}

func mcpHandle(c *coreClient, byName map[string]mcpTool, tools []mcpTool, r rpcReq) (any, map[string]any) {
	switch r.Method {
	case "initialize":
		var p struct {
			ProtocolVersion string `json:"protocolVersion"`
		}
		_ = json.Unmarshal(r.Params, &p)
		v := p.ProtocolVersion
		if v == "" {
			v = mcpProtocol
		}
		return map[string]any{"protocolVersion": v, "capabilities": map[string]any{"tools": map[string]any{}},
			"serverInfo": map[string]any{"name": "core", "version": version}}, nil
	case "ping":
		return map[string]any{}, nil
	case "tools/list":
		return map[string]any{"tools": tools}, nil
	case "tools/call":
		var p struct {
			Name      string         `json:"name"`
			Arguments map[string]any `json:"arguments"`
		}
		if err := json.Unmarshal(r.Params, &p); err != nil {
			return nil, map[string]any{"code": -32602, "message": err.Error()}
		}
		t, ok := byName[p.Name]
		if !ok {
			return nil, map[string]any{"code": -32602, "message": "unknown tool " + p.Name}
		}
		text, err := t.call(c, p.Arguments)
		if err != nil {
			return map[string]any{"content": []any{map[string]any{"type": "text", "text": err.Error()}}, "isError": true}, nil
		}
		return map[string]any{"content": []any{map[string]any{"type": "text", "text": text}}}, nil
	}
	return nil, map[string]any{"code": -32601, "message": "no method " + r.Method}
}
