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
for k, v in fx.items():
    with open(os.path.join(out, "fx", f"{k}.json"), "w") as fh:
        json.dump(v, fh, indent=1)

cmds = {k: f"cat {os.path.abspath(out)}/fx/{k}.json" for k in fx}
cmds["error"] = "echo 'crow: not found' >&2; exit 1"
for k, cmd in cmds.items():
    layout = {"sides": {
        "top": {"type": "bar", "size": 30, "content": [
            {"id": "workspaces", "config": {}, "align": "left"},
            {"id": "clock", "config": {}, "align": "center"},
            {"id": "plugin:crow-agents", "config": {"command": cmd}, "align": "right"},
            {"id": "battery", "config": {}, "align": "right"},
            {"id": "power", "config": {}, "align": "right"}]},
        "right": {"type": "strip", "size": 10, "expanded": 240, "content": [
            {"id": "plugin:crow-agents", "config": {}, "align": ""},
            {"id": "settings", "config": {}, "align": ""}]}}}
    with open(os.path.join(out, f"layout-{k}.json"), "w") as fh:
        json.dump(layout, fh, indent=1)
print("\n".join(sorted(cmds)))
