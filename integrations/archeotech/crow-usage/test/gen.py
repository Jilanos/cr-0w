#!/usr/bin/env python3
"""Write crow-usage fixtures (normal, low, error) and one shot.sh layout per fixture.

  gen.py OUT_DIR    → OUT_DIR/fx/<case>.json, OUT_DIR/layout-<case>.json
"""
import datetime as dt
import json
import os
import sys

out = sys.argv[1] if len(sys.argv) > 1 else "."
os.makedirs(os.path.join(out, "fx"), exist_ok=True)
now = dt.datetime.now()
today = now.date()
MON = today.strftime("%b")


def reset(days, hhmm):
    d = today + dt.timedelta(days=days)
    return f"{d.strftime('%b')} {d.day} {hhmm}"


def iso(minutes_ago):
    t = dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=minutes_ago)
    return t.isoformat().replace("+00:00", "Z")


def limit(acct, h5, wk, active=False, r5=(0, "16:20"), rw=(4, "11:00")):
    return {"account": acct, "remaining_5h_pct": h5, "reset_5h_at": reset(*r5),
            "remaining_week_pct": wk, "reset_week_at": reset(*rw), "active": active}


def split(tokens):
    return {"input_tokens": tokens // 1000, "output_tokens": tokens // 100, "cache_write_tokens": tokens // 25,
            "cache_read_tokens": tokens - tokens // 1000 - tokens // 100 - tokens // 25}


def session(acct, project, kind, model, cost, tokens, ago, title, active=False):
    return {"id": f"{project}-{ago}", "account": acct, "project": project, "title": title, "kind": kind,
            "models": [model], "start": iso(ago + 30), "end": iso(ago), "active": active,
            "user_messages": 3, "tokens": tokens, **split(tokens), "cache_pct": 95, "cost_usd": cost}


def days(costs):
    return [{"date": (today - dt.timedelta(days=len(costs) - 1 - i)).isoformat(), "cost_usd": c,
             "tokens": int(c * 2_500_000), "sessions": int(c // 3), **split(int(c * 2_500_000))}
            for i, c in enumerate(costs)]


def payload(limits, costs, sessions, pending=0):
    t = costs[-1]
    return {"generated_at": now.isoformat(timespec="seconds"), "limits": limits,
            "today": {"cost_usd": t, "tokens": int(t * 2_600_000), "sessions": len(sessions), "cache_pct": 96,
                      "unpriced": 0, **split(int(t * 2_600_000))},
            "week": {"cost_usd": round(sum(costs), 2), "tokens": int(sum(costs) * 2_500_000)},
            "days": days(costs), "sessions": sessions,
            "rtk": {"saved_tokens": 2_177_937, "saved_pct": 29.2, "commands": 5873,
                    "today_saved_tokens": 58_000, "today_saved_pct": 28.1, "today_commands": 284},
            "retros": {"today": 2, "pending_proposals": pending}}


SESSIONS = [
    session("work", "billing-api", "interactive", "claude-opus-5-5", 8.27, 24_678_260, 2, "webhook retry dedupe", active=True),
    session("work", "mobile-app", "interactive", "claude-opus-5-5", 3.61, 9_593_362, 40, "login crash on resume"),
    session("work", "hub", "run", "claude-opus-5-5", 0.74, 370_701, 4, "morning brief", active=True),
    session("work", "billing-api", "run", "claude-sonnet-5-5", 0.48, 392_463, 70, "pattern gate dry run"),
    session("work", "docs-site", "run", "claude-sonnet-5-5", 0.21, 146_371, 90, "fix broken anchors"),
    session("work", "hub", "run", "claude-haiku-5-5", 0.05, 24_070, 120, "session retro"),
    # yesterday: must not show in today's top sessions
    session("work", "old-thing", "interactive", "claude-opus-5-5", 40.0, 99_000_000, 60 * 30, "yesterday"),
]
fx = {
    "normal": payload([limit("work", 74, 96, active=True, rw=(6, "17:00")), limit("spare", 100, 67),
                       limit("side", 96, 41, r5=(0, "15:40"), rw=(0, "13:00"))],
                      [37.74, 7.01, 9.2, 0.0, 0.0, 49.23, 13.36], SESSIONS),
    "low": payload([limit("work", 12, 18, r5=(0, "15:00"), rw=(1, "09:00")), limit("spare", 35, 44)],
                   [12.5, 22.1, 31.0, 28.4, 45.9, 61.2, 58.77], SESSIONS[:3], pending=3),
}
for k, v in fx.items():
    with open(os.path.join(out, "fx", f"{k}.json"), "w") as fh:
        json.dump(v, fh, indent=1)

cmds = {k: f"cat {os.path.abspath(out)}/fx/{k}.json" for k in fx}
cmds["error"] = "echo 'cdx: not authenticated' >&2; exit 1"
for k, cmd in cmds.items():
    layout = {"sides": {
        "top": {"type": "bar", "size": 30, "content": [
            {"id": "workspaces", "config": {}, "align": "left"},
            {"id": "clock", "config": {}, "align": "center"},
            {"id": "plugin:crow-usage", "config": {"command": cmd, "interval": 60}, "align": "right"},
            {"id": "battery", "config": {}, "align": "right"},
            {"id": "power", "config": {}, "align": "right"}]},
        "right": {"type": "strip", "size": 10, "expanded": 240, "content": [
            {"id": "plugin:crow-usage", "config": {}, "align": ""},
            {"id": "settings", "config": {}, "align": ""}]}}}
    with open(os.path.join(out, f"layout-{k}.json"), "w") as fh:
        json.dump(layout, fh, indent=1)
print("\n".join(sorted(cmds)))
