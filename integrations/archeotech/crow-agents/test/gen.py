#!/usr/bin/env python3
"""Write crow-agents fixtures (busy, idle, error) and one shot.sh layout per fixture.

  gen.py OUT_DIR    → OUT_DIR/fx/<case>.json, OUT_DIR/layout-<case>.json
"""
import datetime as dt
import json
import os
import sys

out = sys.argv[1] if len(sys.argv) > 1 else "."
os.makedirs(os.path.join(out, "fx"), exist_ok=True)


def iso(minutes_ago):
    t = dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=minutes_ago)
    return t.isoformat().replace("+00:00", "Z")


def agent(kind, project, state, ctx, last_s, action, n, label=None, title=None, commits=0):
    return {"kind": kind, "pid": 1000 + n, "account": "work", "project": project, "cwd": f"/srv/{project}",
            "session_id": f"5e551011-aaaa-bbbb-cccc-00000000000{n}", "state": state,
            "started_at": iso(90), "last_activity_s": last_s, "last_action": action,
            "context_tokens": ctx, "subagents_active": 0, "recent": [],
            "run_id": f"c0ffee00{n}" if kind == "run" else None, "label": label, "title": title,
            "commits": [f"abc12{i}0 fix: thing" for i in range(commits)]}


def fin(n, project, label, status, ago, commits=0, resumed=0):
    return {"run_id": f"f1n{n}", "project": project, "label": label, "status": status, "duration_s": 600,
            "ended_at": iso(ago), "resumed_from": [f"r{i}" for i in range(resumed)],
            "commits": [f"def456{i} chg: x" for i in range(commits)]}


fx = {
    # sessions listed idle first: the panel must sort the waiting one to the top
    "busy": {"slots": {"busy": 2, "max": 2}, "agents": [
        agent("run", "billing-api", "working", 83_000, 4, "Bash: go test ./internal/webhooks/...", 1,
              label="dedupe retried webhooks", commits=1),
        agent("run", "mobile-app", "working", 742_000, 12, "Edit: src/cart/EmptyState.tsx", 2,
              label="checkout empty-cart state"),
        agent("session", "hub", "idle", 365_000, 47, "Bash: git status", 3, title="crow brief pastes raw json"),
        agent("session", "docs-site", "quiet", 120_000, 95, "Read: docs/anchors.md", 4, title="anchor audit"),
        agent("session", "billing-api", "waiting", 912_000, 30, "", 5, title="webhook retry design review"),
    ], "finished": [
        fin(1, "billing-api", "retry webhook deliveries", "done", 20, commits=2),
        fin(2, "docs-site", "fix broken anchors", "failed", 65, resumed=1),
        fin(3, "hub", "weekly rollup", "limit", 140),
    ]},
    "idle": {"slots": {"busy": 0, "max": 2}, "agents": [], "finished": []},
}
# Claude and Codex together: provider:account on every row, Codex context against its own window,
# a Codex run that failed and a Codex agent whose context is unknown (null, shows nothing).
mixed = json.loads(json.dumps(fx["busy"]))
for a in mixed["agents"]:
    a["provider"] = "claude"
codex = agent("session", "billing-api", "working", 300_000, 3, "exec: go test ./...", 6, title="codex: retry design")
codex.update(provider="codex", account="codex-work", context_window=400_000)
unknown = agent("run", "docs-site", "quiet", None, 80, "shell: npm run build", 7, label="codex build check")
unknown.update(provider="codex", account="codex-work", subagents_active=None)
mixed["agents"] += [codex, unknown]
for f in mixed["finished"]:
    f.update(provider="claude", account="work")
mixed["finished"].append({**fin(4, "billing-api", "codex pagination", "failed", 30), "provider": "codex",
                          "account": "codex-work"})
fx["mixed"] = mixed
for k, v in fx.items():
    with open(os.path.join(out, "fx", f"{k}.json"), "w") as fh:
        json.dump(v, fh, indent=1)

# crow sessions list --json: one session stopped by the 5h limit an hour ago
# (shown under NEEDS YOU), one already relaunched (hidden).
stops = {"sessions": [
    {"conversation_id": "5ab51b0c-0000-4000-8000-000000000001", "account": "work", "project": "notes-plugin",
     "cwd": "/srv/notes-plugin", "branch": "night/books-flow", "last_event": iso(60), "limit": "five_hour",
     "resets_at": int(dt.datetime.now(dt.timezone.utc).timestamp()) + 3 * 3600,
     "first_prompt": "0.2 books flow correctness", "workspaces": ["/srv/notes-plugin"], "relaunched": None},
    {"conversation_id": "5ab51b0c-0000-4000-8000-000000000002", "account": "work", "project": "hub",
     "cwd": "/srv/hub", "last_event": iso(30), "limit": "five_hour", "resets_at": 0,
     "first_prompt": "already moved", "workspaces": ["/srv/hub"], "relaunched": {"target": "spare"}},
    {"conversation_id": "01a16410-0000-7d51-8db9-000000000003", "provider": "codex", "account": "codex-work",
     "project": "billing-api", "cwd": "/srv/billing-api", "last_event": iso(20), "limit": None, "resets_at": None,
     "first_prompt": "codex: retry design", "workspaces": ["/srv/billing-api"], "relaunched": None},
]}
with open(os.path.join(out, "fx", "sessions.json"), "w") as fh:
    json.dump(stops, fh, indent=1)
sessions_cmd = f"cat {os.path.abspath(out)}/fx/sessions.json"

cmds = {k: f"cat {os.path.abspath(out)}/fx/{k}.json" for k in fx}
cmds["error"] = "echo 'crow: not found' >&2; exit 1"
for k, cmd in cmds.items():
    layout = {"sides": {
        "top": {"type": "bar", "size": 30, "content": [
            {"id": "workspaces", "config": {}, "align": "left"},
            {"id": "clock", "config": {}, "align": "center"},
            {"id": "plugin:crow-agents", "config": {"command": cmd, "sessionsCommand": sessions_cmd if k in ("busy", "mixed") else ""},
             "align": "right"},
            {"id": "battery", "config": {}, "align": "right"},
            {"id": "power", "config": {}, "align": "right"}]},
        "right": {"type": "strip", "size": 10, "expanded": 240, "content": [
            {"id": "plugin:crow-agents", "config": {}, "align": ""},
            {"id": "settings", "config": {}, "align": ""}]}}}
    with open(os.path.join(out, f"layout-{k}.json"), "w") as fh:
        json.dump(layout, fh, indent=1)
print("\n".join(sorted(cmds)))
