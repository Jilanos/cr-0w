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


def soon(minutes):
    """reset() args for a time `minutes` from now."""
    t = now + dt.timedelta(minutes=minutes)
    return ((t.date() - today).days, t.strftime("%H:%M"))


def iso(minutes_ago):
    t = dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=minutes_ago)
    return t.isoformat().replace("+00:00", "Z")


def limit(acct, h5, wk, active=False, r5=(0, "16:20"), rw=(4, "11:00"), burn=None, empty_in=None):
    empty = (now + dt.timedelta(minutes=empty_in)).astimezone().isoformat(timespec="seconds") if empty_in else None
    return {"account": acct, "remaining_5h_pct": h5, "reset_5h_at": reset(*r5),
            "remaining_week_pct": wk, "reset_week_at": reset(*rw), "active": active,
            "burn_5h_pct_per_h": burn, "empty_at": empty}


def split(tokens):
    return {"input_tokens": tokens // 1000, "output_tokens": tokens // 100, "cache_write_tokens": tokens // 25,
            "cache_read_tokens": tokens - tokens // 1000 - tokens // 100 - tokens // 25}


def slice_(cost, tokens):
    return {"cost_usd": cost, "tokens": tokens, **split(tokens),
            "cache_saved_usd": round(cost * 8.5, 2), "routing_saved_usd": 0}


def session(acct, project, kind, model, cost, tokens, ago, title, active=False, today_cost=None, today_tokens=None):
    """today_cost/today_tokens: the session's slice for today (defaults to all of it);
    pass 0 for a session that didn't run today (today = null)."""
    tc = cost if today_cost is None else today_cost
    tt = tokens if today_tokens is None else today_tokens
    return {"id": f"{project}-{ago}", "account": acct, "project": project, "title": title, "kind": kind,
            "models": [model], "start": iso(ago + 30), "end": iso(ago), "active": active,
            "user_messages": 3, "tokens": tokens, **split(tokens), "cache_pct": 95, "cost_usd": cost,
            "cache_saved_usd": round(cost * 8.5, 2), "routing_saved_usd": 0, "compactions": 0,
            "today": slice_(tc, tt) if tc else None}


def rollup(cost, tokens, sessions, runs=0, routed=0, compactions=0):
    return {"cost_usd": cost, "tokens": tokens, **split(tokens), "cache_saved_usd": round(cost * 8.7, 2),
            "routing_saved_usd": round(routed * 0.22, 2), "sessions": sessions, "unpriced": 0, "runs": runs,
            "routed_runs": routed, "compactions": compactions, "cache_pct": 96}


def days(costs, n=None):
    costs = costs if n is None else ([0.0] * (n - len(costs)) + costs)[-n:]
    return [{"date": (today - dt.timedelta(days=len(costs) - 1 - i)).isoformat(),
             **rollup(c, int(c * 2_500_000), int(c // 3))} for i, c in enumerate(costs)]


def payload(limits, costs, sessions, pending=0, routed=0, compactions=0):
    t = costs[-1]
    by_project, by_model = {}, {}
    for s in sessions:
        if not s["today"]:
            continue
        for key, acc in ((s["project"], by_project), (s["models"][0].replace("claude-", ""), by_model)):
            e = acc.setdefault(key, {"name": key, "cost_usd": 0, "tokens": 0, "sessions": 0})
            e["cost_usd"] = round(e["cost_usd"] + s["today"]["cost_usd"], 2)
            e["tokens"] += s["today"]["tokens"]
            e["sessions"] += 1
    tools = [{"name": "Bash", "calls": 839, "tokens": 360_659, "text_tokens": 360_659, "images": 0},
             {"name": "Read", "calls": 117, "tokens": 200_373, "text_tokens": 38_773, "images": 101}]
    todayr = {**rollup(t, int(t * 2_600_000), sum(1 for s in sessions if s["today"]),
                       runs=sum(1 for s in sessions if s["today"] and s["kind"] == "run"),
                       routed=routed, compactions=compactions),
              "by_project": sorted(by_project.values(), key=lambda e: -e["cost_usd"]),
              "by_model": sorted(by_model.values(), key=lambda e: -e["cost_usd"]), "tools": tools}
    week = {**rollup(round(sum(costs), 2), int(sum(costs) * 2_500_000), 40, runs=20, routed=routed,
                     compactions=compactions + 2), "by_project": [], "by_model": [], "tools": tools}
    return {"generated_at": now.isoformat(timespec="seconds"), "limits": limits,
            "today": todayr, "week": week, "month": week,
            "days": days(costs), "history": days(costs, 30), "sessions": sessions,
            "rtk": {"saved_tokens": 2_312_056, "input_tokens": 8_612_115, "commands": 6623, "saved_pct": 26.8,
                    "today_saved_tokens": 117_225, "today_input_tokens": 305_669, "today_commands": 476,
                    "today_saved_pct": 38.4, "failures": 954, "databases": 3},
            "retros": {"today": 2, "week": 9, "pending_proposals": pending}}


SESSIONS = [
    session("work", "billing-api", "interactive", "claude-opus-5-5", 8.27, 24_678_260, 2, "webhook retry dedupe", active=True),
    # started yesterday: only today's slice ($3.61 of $19.40) counts and shows
    session("work", "mobile-app", "interactive", "claude-opus-5-5", 19.40, 51_000_000, 40, "login crash on resume",
            today_cost=3.61, today_tokens=9_593_362),
    session("work", "hub", "run", "claude-opus-5-5", 0.74, 370_701, 4, "morning brief", active=True),
    session("work", "billing-api", "run", "claude-sonnet-5-5", 0.48, 392_463, 70, "pattern gate dry run"),
    session("work", "docs-site", "run", "claude-sonnet-5-5", 0.21, 146_371, 90, "fix broken anchors"),
    session("work", "hub", "run", "claude-haiku-5-5", 0.05, 24_070, 120, "session retro"),
    # yesterday: today = null, must not show in today's top sessions
    session("work", "old-thing", "interactive", "claude-opus-5-5", 40.0, 99_000_000, 60 * 30, "yesterday", today_cost=0),
]
fx = {
    "normal": payload([limit("spare", 100, 67), limit("work", 74, 96, active=True, rw=(6, "17:00")),
                       limit("side", 96, 41, r5=(0, "15:40"), rw=(0, "13:00"))],
                      [37.74, 7.01, 9.2, 0.0, 0.0, 49.23, 13.36], SESSIONS, routed=4),
    # current account burning fast: the 5h window runs out before its reset
    "low": payload([limit("spare", 35, 44), limit("work", 12, 18, active=True, r5=soon(95), rw=(1, "09:00"),
                                                  burn=31.0, empty_in=23)],
                   [12.5, 22.1, 31.0, 28.4, 45.9, 61.2, 58.77], SESSIONS[:3], pending=3, compactions=1),
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
