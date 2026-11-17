"""crow_lib: helpers shared by the crow scripts."""
import functools
import glob
import json
import os
import pwd
import re
import shlex
import subprocess
import sys


def real_home():
    return pwd.getpwuid(os.getuid()).pw_dir


ENGINE = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))


def data_home(env=None):
    """Owner data root (holds local/): CROW_HOME, else the checkout when it has local/,
    else $XDG_CONFIG_HOME/crow (default ~/.config/crow)."""
    env = os.environ if env is None else env
    if env.get("CROW_HOME"):
        return env["CROW_HOME"]
    if os.path.isdir(os.path.join(ENGINE, "local")):
        return ENGINE
    xdg = env.get("XDG_CONFIG_HOME") or os.path.join(env.get("HOME") or real_home(), ".config")
    return os.path.join(xdg, "crow")


# Owner-facing notes: kind -> (name under the vault crow folder, legacy name under local/state).
NOTES = {
    "threads": ("Open Threads.md", "open-threads.md"),
    "status": ("Status.md", "status.md"),
    "decisions": ("Decisions", "decisions.md"),
    "rollups": ("Rollups", "weekly"),
    "drafts": ("Drafts", "drafts"),
    "research": ("Research", "research"),
    "retros": ("Retros", "retros"),
    "toolwatch": ("Tool updates", "tool-updates"),
}


def registry(home=None):
    """local/projects.yaml as a dict ({} when missing)."""
    import yaml
    path = os.path.join(home or data_home(), "local", "projects.yaml")
    try:
        with open(path) as f:
            return yaml.safe_load(f) or {}
    except FileNotFoundError:
        return {}


def machine_dir(home=None):
    """Machine state (JSON, caches, locks, queues, handoffs, renders): always local/state."""
    from pathlib import Path
    return Path(home or data_home()) / "local" / "state"


def crow_dir(reg=None, home=None):
    """Vault folder for owner-facing notes (vault.path / vault.crow_dir), or None when unset."""
    from pathlib import Path
    reg = registry(home) if reg is None else reg
    vault = reg.get("vault") or {}
    name = vault.get("crow_dir")
    if not name:
        return None
    path = Path(os.path.expanduser(str(name)))
    if not path.is_absolute() and vault.get("path"):
        path = Path(vault["path"]) / path
    return path


def crow_path(kind, reg=None, home=None):
    """Path of an owner-facing note kind: in the vault crow folder when set, else the legacy local/state name."""
    vault_name, legacy = NOTES[kind]
    notes = crow_dir(reg, home)
    return notes / vault_name if notes else machine_dir(home) / legacy


def rollup_path(week, reg=None, home=None):
    """Weekly rollup file for an ISO week label like 2026-W45."""
    root = crow_path("rollups", reg, home)
    return root / (f"{week} rollup.md" if crow_dir(reg, home) else f"{week}.md")


def profiles_dir(env=None):
    """cdx profiles dir: CDX_PROFILES, else CDX_HOME/profiles, else ~/.cdx/profiles."""
    env = os.environ if env is None else env
    if env.get("CDX_PROFILES"):
        return os.path.expanduser(env["CDX_PROFILES"])
    root = env.get("CDX_HOME") or os.path.join(real_home(), ".cdx")
    return os.path.join(os.path.expanduser(root), "profiles")


@functools.cache
def _cdx_sessions(all_profiles, path_env):
    """Rows of `cdx sessions [--all] --json`, or None when cdx is missing or fails (path_env keys the cache)."""
    cmd = ["cdx", "sessions", "--json"] + (["--all"] if all_profiles else [])
    try:
        r = subprocess.run(cmd, check=False, capture_output=True, text=True, timeout=20)
        doc = json.loads(r.stdout)
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return None
    rows = doc.get("sessions") if isinstance(doc, dict) and doc.get("ok") else None
    return tuple(rows) if isinstance(rows, list) else None


def cdx_sessions(all_profiles=False):
    """cdx session rows (session, provider, active, pid, cwd, conversation_id, profile_dir, transcripts_dir)."""
    return list(_cdx_sessions(all_profiles, os.environ.get("PATH", "")) or [])


def _layout_profile(profiles, name):
    """Fallback for cdx < 0.23 or no cdx: the claude-home layout cdx used so far."""
    return {"name": name, "provider": "claude", "profile_dir": os.path.join(profiles, name),
            "transcripts_dir": os.path.join(profiles, name, "claude-home", ".claude", "projects")}


def _layout_profiles(profiles):
    if not os.path.isdir(profiles):
        return []
    return [_layout_profile(profiles, n) for n in sorted(os.listdir(profiles))
            if not n.startswith(".") and os.path.isdir(os.path.join(profiles, n))]


def cdx_profiles(profiles=None):
    """cdx profiles under the profiles dir: name, provider, profile_dir, transcripts_dir.

    Read from `cdx sessions --all --json`. Only rows whose profile_dir sits in `profiles` count,
    so a temp profiles dir never mixes with the real ones; none at all falls back to the layout."""
    profiles = profiles or profiles_dir()
    root = os.path.realpath(profiles)
    out = [{"name": r["session"], "provider": r.get("provider") or "claude", "profile_dir": r["profile_dir"],
            "transcripts_dir": r["transcripts_dir"]}
           for r in cdx_sessions(all_profiles=True)
           if r.get("session") and r.get("profile_dir") and r.get("transcripts_dir")
           and os.path.realpath(os.path.dirname(r["profile_dir"])) == root]
    return sorted(out, key=lambda p: p["name"]) or _layout_profiles(profiles)


def account_transcripts_dir(account, profiles=None):
    """Transcripts dir of one account (the layout path when cdx does not list it, which may not exist yet)."""
    profiles = profiles or profiles_dir()
    p = next((p for p in cdx_profiles(profiles) if p["name"] == account), None)
    return (p or _layout_profile(profiles, account))["transcripts_dir"]


def transcript_dirs(profiles=None, provider="claude"):
    """(account, transcripts_dir) for every cdx profile of `provider` whose transcripts dir exists."""
    return [(p["name"], p["transcripts_dir"]) for p in cdx_profiles(profiles)
            if p["provider"] == provider and os.path.isdir(p["transcripts_dir"])]


def find_transcripts(session_id, profiles=None, codex=False):
    """(account, path) of every Claude transcript named <session_id>.jsonl in any cdx profile.
    With codex, also the Codex rollouts (<sessions>/YYYY/MM/DD/rollout-<time>-<session_id>.jsonl)."""
    hits = []
    for acct, base in transcript_dirs(profiles):
        for slug in sorted(os.listdir(base)):
            path = os.path.join(base, slug, session_id + ".jsonl")
            if os.path.isfile(path):
                hits.append((acct, path))
    if codex and re.fullmatch(r"[A-Za-z0-9_-]+", session_id):
        for acct, base in transcript_dirs(profiles, "codex"):
            hits += [(acct, p) for p in sorted(glob.glob(os.path.join(base, "**", f"rollout-*-{session_id}.jsonl"),
                                                         recursive=True))]
    return hits


def claude_transcripts(profiles=None):
    """(account, path) for every top-level Claude transcript in every cdx profile."""
    for acct, base in transcript_dirs(profiles):
        for slug in sorted(os.listdir(base)):
            d = os.path.join(base, slug)
            if not os.path.isdir(d):
                continue
            for f in sorted(os.listdir(d)):
                if f.endswith(".jsonl"):
                    yield acct, os.path.join(d, f)


def _json_objects(text):
    """Objects from a JSON document, a JSON array or JSON lines; other lines are skipped."""
    try:
        doc = json.loads(text)
        docs = doc if isinstance(doc, list) else [doc]
    except ValueError:
        docs = []
        for line in text.splitlines():
            try:
                docs.append(json.loads(line))
            except ValueError:
                continue
    return [d for d in docs if isinstance(d, dict)]


def final_text(text, provider="claude"):
    """Final message of a cdx run's stdout. Claude: the `result` envelope. Codex: the last
    agent_message event (`item.completed` or the older `msg` shape). Other output: its tail."""
    objs = _json_objects(text)
    found = None
    for o in objs:
        if provider == "claude" and o.get("type") == "result":
            found = o.get("result")
        elif provider == "codex":
            item = o.get("item") if o.get("type") == "item.completed" else o.get("msg")
            if isinstance(item, dict) and item.get("type") == "agent_message":
                found = item.get("text") or item.get("message")
    return found if found else text[-4000:]


# ---------- providers ----------

PROVIDERS = ("claude", "codex")
CLAUDE_MODEL = re.compile(r"^(claude|opus|sonnet|haiku|fable)", re.IGNORECASE)
CODEX_MODEL = re.compile(r"^(gpt|o\d|codex)", re.IGNORECASE)
# Read first by a provider that does not load CLAUDE.md or @imports itself.
READ_FIRST = ("CLAUDE.md", "AGENTS.md", "LOGICS.md", "local/owner-prefs.md", "local/context.md",
              "local/memory/MEMORY.md")


def provider_of(account, status=None):
    """Provider of a cdx account (claude when cdx does not say)."""
    if status is None:
        try:
            r = subprocess.run(["cdx", "status", "--cached", "--json"], check=False, capture_output=True, text=True)
            status = json.loads(r.stdout).get("rows", [])
        except (OSError, ValueError):
            status = []
    row = next((x for x in status if x.get("session_name") == account), {})
    return row.get("provider") if row.get("provider") in PROVIDERS else "claude"


def check_model(provider, model):
    """Refuse a model name that belongs to the other provider; return None when fine."""
    if model and provider == "codex" and CLAUDE_MODEL.match(model):
        return f"model '{model}' is a Claude model; the account runs Codex"
    if model and provider == "claude" and CODEX_MODEL.match(model):
        return f"model '{model}' is a Codex model; the account runs Claude"
    return None


def read_first(hub, cwd=None):
    """Instruction files Codex must read first (it does not follow CLAUDE.md or @imports)."""
    refs = [os.path.join(hub, f) for f in READ_FIRST if os.path.exists(os.path.join(hub, f))]
    if cwd and os.path.realpath(cwd) != os.path.realpath(hub):
        refs += [os.path.join(cwd, f) for f in ("AGENTS.md", "CLAUDE.md") if os.path.exists(os.path.join(cwd, f))]
    return refs


def skill_file(hub, name):
    for d in (".claude/skills", "skills", "local/skills"):
        p = os.path.join(hub, d, name, "SKILL.md")
        if os.path.exists(p):
            return p
    return None


def oneshot_prompt(provider, hub, skill, args=""):
    """Prompt that runs a hub skill. Claude takes the slash command; Codex gets the skill file
    and the read-first list. Exits when Codex has no skill file to follow."""
    if provider == "claude":
        return f"/{skill} {args}".strip()
    path = skill_file(hub, skill)
    if not path:
        sys.exit(f"crow: no skill file for '{skill}' under {hub}; Codex cannot run it")
    refs = ", ".join(read_first(hub))
    return (f"Read these files first: {refs}. Then read {path} and follow it as the `{skill}` skill. "
            f"{args}").strip()


def permission(provider):
    """cdx permission for headless runs, fresh or continued: default mode. Claude then runs only the kind's
    sandbox allowlist; Codex keeps writes in the workspace, no network."""
    return "default"


def hub_session_refusal(provider):
    """Why an interactive hub session cannot run on this provider (None when it can)."""
    if provider == "codex":
        return ("the hub guard (crow-hub-guard) is a Claude hook; an interactive Codex hub session would run "
                "unguarded. Use a Claude account, or `crow open <project>` for repo work.")
    return None


# ---------- keyring (secret-tool, attributes service + user) ----------

def secret_lookup(service, user=None):
    """Value stored for service (and user), "" when missing or the keyring is unreachable."""
    args = ["secret-tool", "lookup", "service", service] + (["user", user] if user else [])
    try:
        r = subprocess.run(args, check=False, capture_output=True, text=True)
    except OSError:
        return ""
    return r.stdout.rstrip("\n") if r.returncode == 0 else ""


def secret_store(service, user, value, label):
    """Store value on stdin (never argv); True on success."""
    args = ["secret-tool", "store", "--label", label, "service", service, "user", user]
    try:
        return subprocess.run(args, check=False, input=value, capture_output=True, text=True).returncode == 0
    except OSError:
        return False


def secret_clear(service, user):
    args = ["secret-tool", "clear", "service", service, "user", user]
    try:
        return subprocess.run(args, check=False, capture_output=True, text=True).returncode == 0
    except OSError:
        return False


def secret_items(service=None):
    """Keyring items as dicts (label, created, modified, service, user), values dropped.
    Without service: every generic item that carries a service attribute."""
    query = ["service", service] if service else ["xdg:schema", "org.freedesktop.Secret.Generic"]
    try:
        # secret-tool prints attributes on stderr: one pipe keeps each item's lines together.
        r = subprocess.run(["secret-tool", "search", "--all", *query], check=False, stdout=subprocess.PIPE,
                           stderr=subprocess.STDOUT, text=True)
    except OSError:
        return []
    items, cur = [], None
    for line in r.stdout.splitlines():
        if line.startswith("["):
            cur = {}
            items.append(cur)
            continue
        key, sep, val = line.partition(" = ")
        if cur is None or not sep or key == "secret":
            continue
        if key in ("label", "created", "modified"):
            cur[key] = val
        elif key.startswith("attribute."):
            cur[key[len("attribute."):]] = val
    return [i for i in items if i.get("service")]


# ---------- account picking (limits, policies, shared-account caps) ----------

NEARLY_OUT_PCT = 95   # 5h use at which crow stops starting new runs on an account
AUTO_FALLBACK_PCT = 90  # every `use` account past this: a `fallback: auto` account needs no OK


def used_pct(row, key):
    """Points used of a cdx status window (remaining_5h_pct / remaining_week_pct), None when unknown."""
    left = (row or {}).get(key)
    return None if left is None else 100 - left


def minutes_to(iso, now):
    if not iso:
        return None
    from datetime import datetime
    try:
        return (datetime.fromisoformat(iso) - now).total_seconds() / 60
    except ValueError:
        return None


def hard_block(row):
    """Why cdx cannot serve work on the account at all, else None."""
    if not row:
        return "unknown to cdx"
    if row.get("enabled") is False:
        return "disabled"
    if row.get("auth_status") not in (None, "authenticated"):
        return f"auth {row['auth_status']}"
    if row.get("remaining_5h_pct") == 0:
        return f"5h limit (resets {row.get('reset_5h_at')})"
    if row.get("remaining_week_pct") == 0:
        return f"weekly limit (resets {row.get('reset_week_at')})"
    return None


def cap_block(acct, row, now):
    """Why crow leaves a shared account alone (max_5h_pct / max_week_pct in accounts.yaml), else None.
    Past the 5h cap the account stays usable when its 5h window resets within free_5h_min minutes
    and the week is under its cap: nobody else is likely to need the rest of that window."""
    u5, uw = used_pct(row, "remaining_5h_pct"), used_pct(row, "remaining_week_pct")
    mx5, mxw = acct.get("max_5h_pct"), acct.get("max_week_pct")
    if mxw is not None and uw is not None and uw >= mxw:
        return f"week {uw}% used, crow's cap is {mxw}%"
    if mx5 is not None and u5 is not None and u5 >= mx5:
        left = minutes_to((row or {}).get("reset_5h_at_iso"), now)
        free = acct.get("free_5h_min")
        if free and left is not None and 0 <= left <= free:
            return None
        return f"5h {u5}% used, crow's cap is {mx5}% (resets {(row or {}).get('reset_5h_at')})"
    return None


DAY_MOVE_MIN = 60  # daytime: a reset further away than this moves the run to the next account


def limit_policy(context, left_min, has_target):
    """What to do with a run cut by a usage limit: ("wait", reason) or ("move", reason).
    afk (night batch): always wait for the reset on the same account, a long wait is fine.
    day (default): restart cold on the next allowed account when the reset is more than DAY_MOVE_MIN
    away and one is free; otherwise wait. left_min None means the reset time is unknown."""
    left = "unknown" if left_min is None else f"{round(left_min)} min"
    if context == "afk" and not (left_min is None and has_target):  # unknown reset (weekly limit): move if possible
        return "wait", f"afk run: waits for the reset ({left}) on the same account"
    if left_min is not None and left_min <= DAY_MOVE_MIN:
        return "wait", f"day run: reset in {left}, within {DAY_MOVE_MIN} min, waits"
    if has_target:
        return "move", f"day run: reset in {left}, over {DAY_MOVE_MIN} min, restarts on the next account"
    return "wait", f"day run: reset in {left} but no account is free, waits"


def pick_accounts(accts, rows, current, now, scope=None):
    """Every allowed account with its state and the targets crow may pick.

    scope (registry scope or `hub`): when any account carries a `scopes` map, an account without a rank
    for it, or under its `scope_min_room` for it, gets a `scope_skip` reason and is never picked.
    `min_room` (per account, default from the top of accounts.yaml) does the same for any scope.

    accts: crow-accounts json entries; rows: cdx status rows by name. Returns
    {current, current_blocked, accounts[], auto_target, recommended}: auto_target needs no OK
    (policy use, or `fallback: auto` once every use account is blocked or past AUTO_FALLBACK_PCT);
    recommended is the best unblocked account, ask-first included."""
    out = []
    scoped = bool(scope) and any(a.get("scopes") for a in accts)
    for a in accts:
        if a["policy"] == "never":
            continue
        row = rows.get(a["name"])
        rank, skip = 0, None
        left = min((row or {}).get("remaining_5h_pct") or 0, (row or {}).get("remaining_week_pct") or 0)
        if scoped:
            rank = (a.get("scopes") or {}).get(scope)
            floor = (a.get("scope_min_room") or {}).get(scope)
            if rank is None:
                skip = f"no rank for scope {scope}"
            elif floor is not None and left < floor:
                skip = f"{left}% left, under the {floor}% minimum for scope {scope}"
        # min_room: a floor for every scope (and no scope), so an account nearly out is never picked.
        floor = a.get("min_room")
        if not skip and row and floor is not None and left < floor:
            skip = f"{left}% left, under the {floor}% minimum"
        out.append({"name": a["name"], "policy": a["policy"], "fallback": a.get("fallback"),
                    "priority": a.get("priority") or 0, "rank": rank, "scope_skip": skip,
                    "current": a["name"] == current,
                    "blocked": hard_block(row) or cap_block(a, row, now),
                    "used_5h_pct": used_pct(row, "remaining_5h_pct"), "used_week_pct": used_pct(row, "remaining_week_pct"),
                    "remaining_5h_pct": (row or {}).get("remaining_5h_pct"),
                    "remaining_week_pct": (row or {}).get("remaining_week_pct"),
                    "reset_5h_at": (row or {}).get("reset_5h_at"), "reset_5h_at_iso": (row or {}).get("reset_5h_at_iso"),
                    "reset_week_at": (row or {}).get("reset_week_at")})
    uses = [a for a in out if a["policy"] == "use"]
    uses_spent = all(a["blocked"] or (a["used_5h_pct"] or 0) >= AUTO_FALLBACK_PCT for a in uses)
    for a in out:
        a["auto_ok"] = a["policy"] == "use" or (a["fallback"] == "auto" and a["policy"] == "ask-first" and uses_spent)
    usable = [a for a in out if not a["blocked"] and not a["current"] and not a["scope_skip"]]
    usable.sort(key=lambda a: (a["policy"] != "use", a["rank"], not a["auto_ok"], -a["priority"],
                               -min(a["remaining_5h_pct"] or 0, a["remaining_week_pct"] or 0)))
    cur = next((a for a in out if a["current"]), None)
    nearly_out = bool(cur and (cur["used_5h_pct"] or 0) >= NEARLY_OUT_PCT)
    return {"current": current, "current_blocked": (cur["blocked"] if cur else hard_block(rows.get(current)))
            or (f"5h {cur['used_5h_pct']}% used" if nearly_out else None),
            "accounts": out, "auto_target": next((a["name"] for a in usable if a["auto_ok"]), None),
            "recommended": usable[0]["name"] if usable else None}


def account_state(current=None, cached=False, scope=None):
    """pick_accounts on live data: crow-accounts json and `cdx status` (--cached for hooks)."""
    from datetime import datetime
    bin_dir = os.path.dirname(os.path.realpath(__file__))
    accts = json.loads(subprocess.run([os.path.join(bin_dir, "crow-accounts"), "json"], check=False, capture_output=True,
                                      text=True, timeout=30).stdout)
    current = current or os.environ.get("CDX_SESSION_NAME") or os.environ.get("CROW_SESSION_ACCOUNT") or os.environ.get("CROW_ACCOUNT") or accts.get("default")
    try:
        out = subprocess.run(["cdx", "status", *(["--cached"] if cached else []), "--json"], check=False,
                             capture_output=True, text=True, timeout=30).stdout
        rows = {r["session_name"]: r for r in json.loads(out).get("rows") or [] if r.get("session_name")}
    except (OSError, ValueError, subprocess.TimeoutExpired):
        rows = {}
    return pick_accounts(accts["accounts"], rows, current, datetime.now().astimezone(), scope)


def room(a):
    """Quota left on an account row of pick_accounts: the smaller of its 5h and weekly windows."""
    return min(a["remaining_5h_pct"] or 0, a["remaining_week_pct"] or 0)


PICK_FACTORS = ("policy", "scope rank", "live session", "policy", "priority", "room", "name")


def launch_pick(state, busy, default):
    """Account for an interactive launch (crow open, term, handoff).

    state: pick_accounts output with no current account; busy: names with a live cdx session.
    Returns {account, ask, busy, skipped, factor}: account is None when none has room; ask is True when
    it is an ask-first account the owner must OK; busy is True when it already runs a session; factor
    names what decided the pick. Order (same as `cdx select` without a scope): policy use first, scope
    rank (state built with a scope), free before live-session accounts to spread load, ask-first last,
    cdx priority, room. A live session is not a block (cdx runs several per account), only a lower rank.
    The default stays the pick while it is free, policy use, under NEARLY_OUT_PCT and not outranked by
    scope rank or cdx priority."""
    skipped, ok = [], []
    for a in state["accounts"]:
        why = a["blocked"] or a.get("scope_skip")
        if not why and a["policy"] == "use" and (a["used_5h_pct"] or 0) >= NEARLY_OUT_PCT:
            why = f"5h {a['used_5h_pct']}% used"
        (skipped.append({"name": a["name"], "why": why}) if why else ok.append(a))

    def parts(a):
        return (a["policy"] != "use", a.get("rank") or 0, a["name"] in busy, not a["auto_ok"],
                -(a.get("priority") or 0), -room(a), a["name"])
    ok.sort(key=parts)
    dflt = next((a for a in ok if a["name"] == default and a["policy"] == "use" and a["name"] not in busy
                 and parts(a)[:2] == parts(ok[0])[:2] and parts(a)[4] == parts(ok[0])[4]), None)
    top = dflt or (ok[0] if ok else None)
    factor = None
    if dflt:
        factor = "default"
    elif top:
        nxt = ok[1] if len(ok) > 1 else None
        factor = "only candidate" if not nxt else next(
            (PICK_FACTORS[i] for i, (x, y) in enumerate(zip(parts(top), parts(nxt))) if x != y), "name")
    return {"account": top and top["name"], "ask": bool(top and not top["auto_ok"]),
            "busy": bool(top and top["name"] in busy), "room": top and room(top), "factor": factor,
            "skipped": skipped + [{"name": n, "why": "live session"} for n in sorted(busy)
                                  if top and n != top["name"] and any(a["name"] == n for a in ok)]}


def live_sessions():
    """Names of cdx accounts with a live interactive session (`cdx sessions --json`)."""
    try:
        out = subprocess.run(["cdx", "sessions", "--json"], check=False, capture_output=True, text=True, timeout=30).stdout
        return {s["session"] for s in json.loads(out).get("sessions") or [] if s.get("active") and s.get("session")}
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return set()


# ---------- headless run flags (req_017 levers 3, 4, 7, 16) ----------

CLAUDE_MODEL_IDS = {"opus": "claude-opus-5-5", "sonnet": "claude-sonnet-5-5", "haiku": "claude-haiku-5-5",
                    "fable": "claude-fable-5-1"}
# kind: default model, effort, budget in USD, wall-clock cap in minutes. Env CROW_<KIND>_BUDGET / _TIMEOUT_MIN override.
RUN_KINDS = {
    "task": {"model": "opus", "power": "medium", "budget": 25.0, "timeout_min": 120, "isolate": "rw", "call_cap": 60},
    # mech: mechanical edits (cleanup, rename, wiring, recordings) on Sonnet; design and debugging stay on task.
    "mech": {"model": "sonnet", "power": "medium", "budget": 8.0, "timeout_min": 60, "isolate": "rw", "call_cap": 40},
    "review": {"model": "opus", "power": "high", "budget": 10.0, "timeout_min": 60, "isolate": "ro"},
    "retro": {"model": "sonnet", "power": "low", "budget": 2.0, "timeout_min": 45},
    "oneshot": {"model": "sonnet", "power": "medium", "budget": 3.0, "timeout_min": 20},
}
# "isolate": the kind may run under `cdx run --isolate-workspace` (rw tree, or ro for review). retro and oneshot
# read host data (transcripts, vault) and never isolate.
# crow kinds that map to a cdx --kind (cdx knows assistant|code-review|retro; the rest keep its default).
CDX_KINDS = {"retro": "retro"}
# Headless traps: no background tasks (phantom results), no claude.ai connectors (~40k tokens of tool defs per call).
HEADLESS_ENV = {"CLAUDE_CODE_DISABLE_BACKGROUND_TASKS": "1", "ENABLE_CLAUDEAI_MCP_SERVERS": "false"}

# Deny by default: a sandboxed run starts in Claude's default permission mode and may use only its kind's tools.
# Bash rules are prefixes (`Bash(git log:*)`). MCP servers load only when the kind lists them (none today).
_GIT_READ = ["git status", "git log", "git diff", "git show", "git branch", "git rev-parse", "git ls-files",
             "git blame", "git merge-base", "git remote -v"]
_SHELL_READ = ["ls", "cat", "head", "tail", "wc", "grep", "rg", "sort", "uniq", "cut", "jq", "pwd", "echo",
               "date", "diff"]
# Hub scripts that write the activity log, daily notes and state paths.
_CROW_LOG = ["bin/crow-log", "bin/crow-note", "bin/crow-state"]
RUN_SANDBOX = {
    "review": {"tools": ["Read", "Grep", "Glob", "TodoWrite"],
               "bash": _GIT_READ + _SHELL_READ + ["git fetch", "gh pr view", "gh pr diff", "gh pr checks",
                                                  "glab mr view", "glab mr diff", "logics-manager"],
               "mcp": []},
    "task": {"tools": ["Read", "Grep", "Glob", "Edit", "Write", "NotebookEdit", "TodoWrite"],
             "bash": _GIT_READ + _SHELL_READ + ["git add", "git commit", "git switch", "git checkout", "git restore",
                                                "git stash", "git rebase", "git mv", "git rm", "mkdir", "touch", "cp",
                                                "mv", "python3 -m pytest", "pytest", "go test", "go build",
                                                "go vet", "gofmt", "make", "npm test", "npm run", "logics-manager",
                                                # quality gate and Nest bench/typecheck (owner OK 2026-11-17)
                                                "bin/crow-check", "ruff check", "ruff format",
                                                "node scripts/hero-table.mjs", "node tools/nest/scripts/hero-table.mjs",
                                                "npx tsc", "npx vitest"],
             "mcp": []},
    "retro": {"tools": ["Read", "Grep", "Glob", "Edit", "Write", "TodoWrite", "Skill"],
              "bash": _SHELL_READ + _CROW_LOG + ["bin/crow-digest", "git status", "git diff", "git add",
                                                 "git check-ignore"], "mcp": []},
    # brief, daily, weekly: their skills allow bin/crow-gather and bin/crow-mrs themselves (allowed-tools).
    "oneshot": {"tools": ["Read", "Grep", "Glob", "Edit", "Write", "TodoWrite", "Skill"],
                "bash": _SHELL_READ + _GIT_READ + _CROW_LOG + ["git fetch"], "mcp": []},
}
RUN_SANDBOX["mech"] = RUN_SANDBOX["task"]  # same tree access as task; only the model and budget differ
# Denied for every kind (each also as `rtk <prefix>`); a deny rule beats an allow rule and a hook's allow.
_DENY_BASH = ["git push", "gh pr create", "gh pr merge", "gh pr comment", "gh issue", "gh api", "glab mr create",
              "glab mr merge", "glab mr note", "glab api", "curl", "wget"]
RUN_DENY = [f"Bash({p}:*)" for c in _DENY_BASH for p in (c, f"rtk {c}")] + ["WebFetch"]
# Env names a run never inherits: forge, cloud and other credentials. The provider login is cdx's own.
CREDENTIAL_ENV = re.compile(r"TOKEN|SECRET|PASSW|CREDENTIAL|API_?KEY|ACCESS_KEY|PRIVATE_KEY|^AWS_|^SSH_AUTH_SOCK$|"
                            r"^AZURE_CLIENT|^GOOGLE_APPLICATION_CREDENTIALS$")
# Env names a kind keeps although they match CREDENTIAL_ENV (owner-approved; none today).
RUN_KEEP_ENV = {}


# Commands the RTK hook rewrites under another name (`rtk rewrite "cat f"` -> `rtk read f`).
# rg: rtk 0.x rewrites it to `rtk grep`, 1.x to `rtk rg`.
_RTK_ALIAS = {"cat": ["read"], "head": ["read"], "rg": ["grep", "rg"]}


def sandbox_allow(kind):
    """The kind's allow rules. Each Bash prefix also appears as `rtk <prefix>`: the RTK hook rewrites commands first."""
    k = RUN_SANDBOX[kind]
    bash = list(dict.fromkeys(p for c in k["bash"] for p in (c, *(f"rtk {a}" for a in _RTK_ALIAS.get(c, [c])))))
    return list(k["tools"]) + [f"Bash({c}:*)" for c in bash] + [f"mcp__{s}" for s in k["mcp"]]


def write_dir_allow(write_dir):
    """Allow rules that let a run edit files under write_dir only (Claude's //abs/path rule syntax)."""
    d = "/" + os.path.realpath(write_dir).rstrip("/")
    return [f"Edit({d}/**)", f"Write({d}/**)"]


def sandbox_settings(kind, write_dir=None):
    """Claude settings for a sandboxed run of this kind: its allow rules and the shared denials.
    With write_dir, edits are also allowed under that folder (a mission run's own folder)."""
    allow = sandbox_allow(kind) + (write_dir_allow(write_dir) if write_dir else [])
    return {"permissions": {"allow": allow, "deny": list(RUN_DENY)}}


def sandbox_args(kind, state=None, write_dir=None):
    """Claude CLI arguments for a sandboxed run of this kind: --settings with the allowlist and denials, no MCP
    server it does not list. The rules go in files under <state>/run-sandbox/: cdx caps --extra-args at
    CDX_EXTRA_ARGS_MAX characters and the lists are longer. With write_dir, the run may also edit under that
    folder: its rules go in a file of their own (named by the folder) and the folder is added with --add-dir."""
    import hashlib
    from pathlib import Path
    d = Path(state or machine_dir()) / "run-sandbox"
    d.mkdir(parents=True, exist_ok=True)
    name = kind
    if write_dir:
        name += "-" + hashlib.sha256(os.path.realpath(write_dir).encode()).hexdigest()[:10]
    f = d / f"{name}.json"
    f.write_text(json.dumps(sandbox_settings(kind, write_dir), indent=1) + "\n")
    args = ["--strict-mcp-config", "--settings", str(f)]
    if write_dir:
        args += ["--add-dir", os.path.realpath(write_dir)]
    servers = RUN_SANDBOX[kind]["mcp"]
    if servers:
        m = d / f"{kind}.mcp.json"
        m.write_text(json.dumps({"mcpServers": {s: MCP_SERVERS[s] for s in servers}}, indent=1) + "\n")
        args += ["--mcp-config", str(m)]
    return args


CDX_EXTRA_ARGS_MAX = 512


# MCP server definitions a kind may list in RUN_SANDBOX[kind]["mcp"] (name -> .mcp.json server entry).
MCP_SERVERS = {}


def sandbox_env(env, kind):
    """env without credential variables (except the kind's RUN_KEEP_ENV), and the names it dropped."""
    keep = set(RUN_KEEP_ENV.get(kind, ()))
    dropped = sorted(n for n in env if CREDENTIAL_ENV.search(n.upper()) and n not in keep)
    return {n: v for n, v in env.items() if n not in dropped}, dropped


def model_id(model):
    """Exact Claude model id for an alias (opus -> claude-opus-5-5); other values pass through."""
    return CLAUDE_MODEL_IDS.get((model or "").strip().lower(), model)


def run_flags(kind, provider="claude", model=None, power=None, continue_run=None, env=None, budget=None, state=None,
              write_dir=None):
    """cdx run arguments and environment every headless launch carries.
    With continue_run, cdx pins the parent's model, effort and account, so none of them nor --failover is passed.
    --failover moves a run stopped by a usage limit to another allowed account. cdx run has no --fallback-model
    flag: the fallback model is a per-account setting (`cdx set <account> --fallback-model M`).
    budget (USD) overrides the kind's budget for this run; Claude only.
    write_dir lets the run edit files under that folder too (Claude only, see sandbox_args).
    A Claude run, fresh or continued, carries the kind's sandbox (sandbox_args) through --extra-args: since
    cdx 0.26.11 --continue-run accepts a --settings that only sets permissions."""
    env = os.environ if env is None else env
    k = RUN_KINDS[kind]
    budget = float(budget if budget is not None else env.get(f"CROW_{kind.upper()}_BUDGET") or k["budget"])
    timeout = int(env.get(f"CROW_{kind.upper()}_TIMEOUT_MIN") or k["timeout_min"])
    args = []
    if not continue_run:
        m = model or (k["model"] if provider == "claude" else None)
        args += (["--model", model_id(m) if provider == "claude" else m] if m else []) + ["--power", power or k["power"]]
    args += ["--timeout-seconds", str(timeout * 60)] + ([] if continue_run else ["--failover"])
    if kind in CDX_KINDS:
        args += ["--kind", CDX_KINDS[kind]]
    if provider == "claude":  # cdx measures spend from Claude usage; Codex budgets fail as unverifiable without model evidence
        args += ["--budget", f"{budget:g}"]
        extra = shlex.join(sandbox_args(kind, state, write_dir))
        if len(extra) > CDX_EXTRA_ARGS_MAX:
            raise ValueError(f"sandbox args for {kind} exceed cdx's {CDX_EXTRA_ARGS_MAX}-character --extra-args cap")
        args += ["--extra-args", extra]
    return args, (dict(HEADLESS_ENV) if provider == "claude" else {})


RUN_FOOTER = ("\n\n---\nRun budget: one scope per run (one bug or one acceptance-criteria group). "
              "If {cap} tool calls pass without a confirmed cause or a passing step, stop: report what you checked, "
              "what you ruled out and the next probe, then end the run. Do not hunt further.\n")


def run_brief(kind, text):
    """The prompt a run gets: the brief plus the kind's stop-and-report footer (kinds with a call_cap)."""
    cap = RUN_KINDS.get(kind, {}).get("call_cap")
    return text.rstrip() + RUN_FOOTER.format(cap=cap) if cap else text


def transcript_tokens(path):
    """Token figures of one Claude session file plus its subagents, deduplicated on (message.id, requestId):
    {calls, context, peak, output, models}. context = input + cache reads + cache writes, summed over calls."""
    seen, out = set(), {"calls": 0, "context": 0, "peak": 0, "output": 0, "models": []}
    path = str(path)
    for fpath in [path] + sorted(glob.glob(os.path.join(path[:-6], "subagents", "*.jsonl"))):
        try:
            fh = open(fpath, encoding="utf-8", errors="replace")  # noqa: SIM115 (closed by the with below)
        except OSError:
            continue
        with fh:
            for raw in fh:
                try:
                    ev = json.loads(raw)
                except ValueError:
                    continue
                msg = ev.get("message") or {}
                u = msg.get("usage") if isinstance(msg, dict) else None
                if ev.get("type") != "assistant" or not u or str(msg.get("model", "")).startswith("<"):
                    continue
                key = (msg.get("id"), ev.get("requestId"))
                if key in seen:
                    continue
                seen.add(key)
                ctx = sum(u.get(k) or 0 for k in ("input_tokens", "cache_read_input_tokens",
                                                  "cache_creation_input_tokens"))
                out["calls"] += 1
                out["context"] += ctx
                out["peak"] = max(out["peak"], ctx)
                out["output"] += u.get("output_tokens") or 0
                m = (msg.get("model") or "?").replace("claude-", "")
                if m not in out["models"]:
                    out["models"].append(m)
    return out


def fmt_tokens(n):
    """1234567 -> '1.2M', 45600 -> '46k'."""
    return f"{n / 1e6:.1f}M" if n >= 1e6 else f"{n / 1e3:.0f}k" if n >= 1e3 else str(n)


def run_env(extra, kind=None):
    """os.environ plus the headless overrides, for subprocess calls. With a kind, credentials are dropped."""
    env = {**os.environ, **extra}
    return sandbox_env(env, kind)[0] if kind else env


RUN_PROFILE_SUFFIX = "-runs"


def run_profile(account):
    """cdx profile for isolated runs of this account (`<account>-runs`, a setup-token login)."""
    return f"{account}{RUN_PROFILE_SUFFIX}"


def run_denials(run):
    """Tool calls a finished cdx run had denied, as short 'Tool: input' strings (cdx permission_denials warnings)."""
    payload = (run or {}).get("final_payload") or run or {}
    out = []
    for w in payload.get("warnings") or []:
        for d in (w.get("permission_denials") or []) if isinstance(w, dict) else []:
            inp = d.get("tool_input") or {}
            what = inp.get("command") or inp.get("file_path") or inp.get("url") or ""
            out.append(f"{d.get('tool_name', '?')}: {what}"[:120].rstrip(": "))
    return out


# ---------- isolated runs (item_100, req_030) ----------

# Tools cdx needs for an isolated online run: bwrap for the sandbox, pasta + nft + python3 for its network.
ISOLATION_TOOLS = {"bwrap": "bubblewrap", "pasta": "passt", "nft": "nftables", "python3": "python"}


def isolation_mode(kind):
    """"rw" or "ro" when the kind may run isolated, else None."""
    return RUN_KINDS.get(kind, {}).get("isolate")


def isolated_state_dir(cwd):
    """<worktree>/.crow-run: run files an isolated run must read (the sandbox mounts only the worktree).
    Listed in the repo's info/exclude, so neither git status nor the host commit of a run picks it up."""
    from pathlib import Path
    common = subprocess.run(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], check=False, cwd=cwd,
                            capture_output=True, text=True).stdout.strip()
    exclude = Path(common or Path(cwd) / ".git") / "info" / "exclude"
    lines = exclude.read_text().splitlines() if exclude.exists() else []
    if "/.crow-run/" not in lines:
        exclude.parent.mkdir(parents=True, exist_ok=True)
        exclude.write_text("\n".join(lines + ["/.crow-run/"]) + "\n")
    return Path(cwd) / ".crow-run"


def stored_setup_token(account, env=None):
    """True when the cdx profile stores a setup token (<profile>/claude-home/credentials/default.json).
    Since cdx 0.26.10 a full-login profile with one runs isolated: only the setup token enters the sandbox."""
    return os.path.isfile(os.path.join(profiles_dir(env), account, "claude-home", "credentials", "default.json"))


def isolation_preflight(provider, auth_type, path=None, kind=None, account=None):
    """Why an isolated run cannot start (with the fix), or None. Never a fallback to a shared network."""
    import shutil
    if kind is not None and not isolation_mode(kind):
        return f"kind {kind} cannot run isolated (it reads host data); isolated kinds: " + \
            ", ".join(k for k in RUN_KINDS if isolation_mode(k))
    missing = [t for t in ISOLATION_TOOLS if not shutil.which(t, path=path)]
    if missing:
        pkgs = " ".join(dict.fromkeys(ISOLATION_TOOLS[t] for t in missing))
        return f"isolated runs need {', '.join(missing)}: install with `sudo pacman -S {pkgs}`; no shared-network fallback"
    if provider == "claude" and auth_type != "setup-token" and not (account and stored_setup_token(account)):
        return (f"isolated Claude runs need a cdx setup token (this profile is {auth_type or 'unknown'} and stores none): "
                "save one under <profile>/claude-home/credentials/default.json (cdx 0.26.10+), or "
                "`cdx add <account>-runs` then `cdx login <account>-runs`, and dispatch with --account <account>-runs")
    return None


def cdx_rows():
    """`cdx status --json` rows, or [] when cdx cannot answer."""
    try:
        return json.loads(subprocess.run(["cdx", "status", "--json"], check=False, capture_output=True, text=True,
                                         timeout=60).stdout).get("rows") or []
    except (OSError, ValueError, subprocess.SubprocessError):
        return []


def account_auth(account, rows=None):
    """cdx auth type of an account (full-login, setup-token...), or None when cdx does not list it."""
    rows = cdx_rows() if rows is None else rows
    return next((r.get("auth_type") for r in rows if r.get("session_name") == account), None)


def isolation_account(account, rows):
    """The account an isolated run uses: its `<account>-runs` profile when cdx has one, else the account."""
    names = {r.get("session_name") for r in rows}
    return run_profile(account) if run_profile(account) in names else account


_SHEBANG_KINDS = {"python": "PY", "bash": "SH", "sh": "SH", "zsh": "SH", "node": "JS"}
_EXT_KINDS = {"yml": "YAML", "markdown": "MD", "bash": "SH"}


def file_kind(path, root="."):
    """Commit SCOPE kind of a file: its extension (PY, MD, GO...), else its shebang interpreter, else TXT."""
    base = os.path.basename(path)
    if "." in base.lstrip("."):
        ext = base.rsplit(".", 1)[1].lower()
        return _EXT_KINDS.get(ext, ext.upper())
    try:
        with open(os.path.join(root, path), "rb") as f:
            line = f.readline(200).decode("utf-8", "replace")
    except OSError:
        line = ""
    if line.startswith("#!"):
        words = line[2:].split()
        interp = os.path.basename(words[-1] if words and words[0].endswith("env") else (words or [""])[0])
        interp = re.sub(r"[\d.]+$", "", interp)
        return _SHEBANG_KINDS.get(interp, "SH")
    return "TXT"


def commit_scope(paths, root="."):
    """`PY/MD` style scope, most touched kind first, alphanumeric only."""
    counts = {}
    for p in paths:
        k = re.sub(r"[^A-Z0-9]", "", file_kind(p, root).upper()) or "TXT"
        counts[k] = counts.get(k, 0) + 1
    return "/".join(sorted(counts, key=lambda k: (-counts[k], k)))


def run_commit_message(label, run_id, statuses, root="."):
    """`new|chg[SCOPE]: <label> (run <id8>)` for a run's staged changes ({path: git status letter})."""
    kind = "new" if statuses and all(s == "A" for s in statuses.values()) else "chg"
    text = re.sub(r"\s+", " ", label or "").strip()[:72] or "isolated run"
    return f"{kind}[{commit_scope(statuses, root)}]: {text} (run {str(run_id)[:8]})"


def commit_run_diff(cwd, label, run_id):
    """Commit what an isolated run left in its worktree, from the host (the sandbox cannot write git).
    Returns {"sha", "message", "files"}, else {"sha": None, "reason"} (no changes, message refused, git failed)."""
    git = lambda *a, **k: subprocess.run(["git", "-C", cwd, *a], check=False, capture_output=True, text=True, **k)
    if git("add", "-A").returncode:
        return {"sha": None, "reason": "git add failed"}
    rows = [r.split("\t") for r in git("diff", "--cached", "--name-status", "--no-renames").stdout.splitlines() if r]
    statuses = {r[-1]: r[0][0] for r in rows}
    if not statuses:
        return {"sha": None, "reason": "no changes"}
    msg = run_commit_message(label, run_id, statuses, cwd)
    check = subprocess.run([os.path.join(ENGINE, "bin", "crow-commit-msg-check"), "-"], check=False, input=msg, text=True,
                           capture_output=True)
    if check.returncode:
        git("reset", "-q")
        return {"sha": None, "reason": "message refused: " + check.stderr.strip(), "message": msg}
    c = git("commit", "-q", "-m", msg)
    if c.returncode:
        return {"sha": None, "reason": "git commit failed: " + (c.stderr or c.stdout).strip()[-300:], "message": msg}
    return {"sha": git("rev-parse", "HEAD").stdout.strip(), "message": msg, "files": sorted(statuses)}


SCRIPT_SCHEMA = 1  # "schema" of every deck/core script JSON output (logics/specs/script_contract)
ACTION_SCHEMA = 1  # logics/specs/script_contract/schemas/action.schema.json


PROMPT_FIELDS = ("id", "tool", "detail", "description", "work_approval", "options", "questions")


def session_meta(pid, proc="/proc"):
    """Claude's own status file for pid: <HOME of pid>/.claude/sessions/<pid>.json (as crow-runs reads it)."""
    from pathlib import Path
    try:
        env = dict(l.split("=", 1) for l in Path(f"{proc}/{pid}/environ").read_bytes().decode(errors="replace")
                   .split("\0") if "=" in l)
        return json.loads((Path(env.get("HOME", "")) / ".claude/sessions" / f"{pid}.json").read_text())
    except (OSError, ValueError):
        return None


def pending_prompt(pid, meta, home=None):
    """The permission prompt pid waits on now (written by `crow-prompt hook`), else None.

    Pending while Claude's own status file (meta) says waiting on a permission prompt (or on
    input, for AskUserQuestion) for the session the hook recorded."""
    from pathlib import Path
    try:
        p = json.loads((Path(home or data_home()) / "local/state/prompts" / f"{int(pid)}.json").read_text())
    except (OSError, ValueError, TypeError):
        return None
    waiting_for = str((meta or {}).get("waitingFor") or "")
    asks = p.get("tool") == "AskUserQuestion" and "input" in waiting_for
    if not meta or meta.get("status") != "waiting" or not ("permission" in waiting_for or asks):
        return None
    if p.get("session_id") and meta.get("sessionId") and p["session_id"] != meta["sessionId"]:
        return None
    return p


MISSION_LINE = re.compile(r"^Mission: (\S+)$", re.MULTILINE)


def ensure_mission(project, end_state, logics="", goal=""):
    """Linked mission of a handoff or a dispatch (item_203): `crow mission ensure` reuses the
    mission of the same project and Logics ref (else end state) or creates it. Returns its id,
    or None with a warning on stderr: work never waits on the core. CROW_CORE_CMD replaces
    `crow mission` (tests)."""
    if not (end_state or "").strip():
        return None
    base = shlex.split(os.environ["CROW_CORE_CMD"]) if os.environ.get("CROW_CORE_CMD") else \
        [os.path.join(ENGINE, "bin", "crow"), "mission"]
    cmd = base + ["ensure", "--project", project, "--end-state", end_state, "--json"]
    cmd += ["--logics", logics] if logics else []
    cmd += ["--goal", goal] if goal else []
    try:
        r = subprocess.run(cmd, check=False, capture_output=True, text=True, timeout=120)
        if r.returncode == 0:
            return json.loads(r.stdout)["id"]
        why = (r.stderr or r.stdout).strip()[-300:]
    except (OSError, ValueError, KeyError, TypeError, subprocess.TimeoutExpired) as e:
        why = str(e)
    print(f"crow: warning: no mission linked ({why})", file=sys.stderr)
    return None


def action_result(ok, action, target, message, code=None):
    """Print the --json result of an action script and return its exit code: 0 ok, 1 refused, 2 error."""
    code = 0 if ok else (code or 1)
    print(json.dumps({"schema": ACTION_SCHEMA, "ok": ok, "action": action, "target": str(target), "message": message,
                      "code": code}))
    return code
