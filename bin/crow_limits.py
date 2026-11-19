"""Shared account admission for dispatch, panel chats and queued model jobs."""
import json
import os
from pathlib import Path

import yaml


def normalize(config, env=None):
    env = os.environ if env is None else env
    limits = config.get("limits", {})
    if not isinstance(limits, dict):
        raise ValueError("limits must be a mapping")
    if "total" in limits:
        total = limits["total"]
    elif "max_parallel" in config:
        total = config["max_parallel"]
    else:
        total = int(env.get("CROW_MAX_RUNS", "5"))
    accounts = config.get("accounts", {})
    result = {name: 3 if row.get("provider", "claude" if name == "claude" else "codex") == "claude" else 1
              for name, row in accounts.items()}
    result.update(limits)
    result["total"] = total
    if any(not isinstance(name, str) or not name or type(value) is not int or value < 1 for name, value in result.items()):
        raise ValueError("limits must contain positive integer capacities")
    return result


def load(home):
    path = Path(os.environ.get("CROW_PANEL_CONFIG", Path(home) / "local/panel.yaml"))
    try:
        config = yaml.safe_load(path.read_text()) or {}
    except FileNotFoundError:
        config = {}
    return normalize(config)


def read_registry(path):
    rows = []
    try:
        with Path(path).open() as stream:
            for line in stream:
                try:
                    row = json.loads(line)
                    if isinstance(row, dict):
                        rows.append(row)
                except ValueError:
                    continue
    except FileNotFoundError:
        pass
    return rows


def slots(runs, limits, registry=()):
    """Count each live cdx id once; registry supplies missing account metadata only."""
    known = {r["run_id"]: r for r in registry if r.get("run_id")}
    counts, capacities, seen, busy, unknown = {}, {}, set(), 0, 0
    for row in runs:
        if row.get("ended_at") or row.get("status") not in (None, "running", "queued", "starting"):
            continue
        key = row.get("run_id")
        if key and key in seen:
            continue
        if key:
            seen.add(key)
        busy += 1
        account = row.get("account") or row.get("session") or known.get(key, {}).get("account") or known.get(key, {}).get("session")
        if account:
            counts[account] = counts.get(account, 0) + 1
            provider = row.get("provider") or known.get(key, {}).get("provider")
            capacities[account] = 3 if provider == "claude" else 1
        else:
            unknown += 1
    names = dict.fromkeys([name for name in limits if name != "total"] + list(counts))
    return {"busy": busy, "max": limits["total"], "unknown": unknown,
            "accounts": {name: {"busy": counts.get(name, 0), "max": limits.get(name, capacities.get(name, 1))} for name in names}}


def available(account, usage, limits, provider=None):
    capacity = limits.get(account, 3 if provider == "claude" else 1)
    # Missing account metadata cannot safely be assigned to another account.
    return usage["busy"] < limits["total"] and usage["accounts"].get(account, {}).get("busy", 0) + usage["unknown"] < capacity
