"""crow_native: bounded, read-only readers of provider-native files, for what cdx does not publish
(live interactive sessions, what an agent is doing, interrupted conversations).

cdx stays the source for runs, accounts and usage totals. These readers are a fallback,
versioned per provider (PARSER_VERSION) so caches built by an older parser are rebuilt.
Every reader tolerates unreadable files, a partial last JSONL line and unknown event types:
an unknown field stays None, it never becomes zero, idle or finished.
"""
import json, os, re, time

PARSER_VERSION = {"claude": 1, "codex": 1}
RECENT_N = 30
CODEX_EXE = re.compile(r"(^|/)codex$")
CLAUDE_EXE = re.compile(r"(^|/)claude$|/claude/versions/")
CODE_CMD = re.compile(r'\b(?:cmd|command)\s*:\s*"((?:[^"\\]|\\.)*)"')
LIMIT_TEXT = re.compile(r"usage limit|rate limit|hit your .*limit|quota", re.I)
# Prompts crow itself sends for automatic jobs (titles, retros, briefs), on either provider.
AUTO_PROMPT = re.compile(r"^(/retro\b|/brief|/daily|/weekly|You name coding sessions\b)"
                         r"|follow it as the `(retro|brief|daily|weekly)` skill")


# ---------- processes ----------

def procs(proc="/proc"):
    """Live provider processes: pid, provider, argv, cwd, env subset, start time."""
    out = []
    try:
        entries = os.listdir(proc)
    except OSError:
        return out
    for name in entries:
        if not name.isdigit():
            continue
        d = os.path.join(proc, name)
        try:
            raw = open(os.path.join(d, "cmdline"), "rb").read().split(b"\0")
            argv = [a.decode(errors="replace") for a in raw if a]
            if not argv:
                continue
            try:
                exe = os.readlink(os.path.join(d, "exe"))
            except OSError:
                exe = ""
            if CODEX_EXE.search(argv[0]) or CODEX_EXE.search(exe):
                provider = "codex"
            elif CLAUDE_EXE.search(argv[0]) or CLAUDE_EXE.search(exe):
                provider = "claude"
            else:
                continue
            env = dict(l.split("=", 1) for l in open(os.path.join(d, "environ"), "rb").read()
                       .decode(errors="replace").split("\0") if "=" in l)
            out.append({"pid": int(name), "provider": provider, "argv": argv, "cwd": os.readlink(os.path.join(d, "cwd")),
                        "home": env.get("HOME", ""), "codex_home": env.get("CODEX_HOME"),
                        "account": env.get("CDX_SESSION_NAME"),
                        "started": os.stat(os.path.join(d, "cmdline")).st_mtime, "proc": d})
        except (OSError, ValueError):
            continue
    return out


def open_rollout(p):
    """The Codex rollout file a codex process holds open (its exact current conversation)."""
    fd = os.path.join(p["proc"], "fd")
    try:
        best = None
        for f in os.listdir(fd):
            try:
                t = os.readlink(os.path.join(fd, f))
            except OSError:
                continue
            if t.endswith(".jsonl") and "/sessions/" in t and os.path.basename(t).startswith("rollout-"):
                best = t
        return best
    except OSError:
        return None


def is_run(p):
    a = p["argv"]
    if p["provider"] == "codex":
        return len(a) > 1 and a[1] == "exec"
    return "--print" in a or "-p" in a


# ---------- JSONL ----------

def complete_lines(data):
    """Whole lines of a chunk and the byte count they cover (a partial last line waits)."""
    end = data.rfind(b"\n")
    if end < 0:
        return [], 0
    return data[:end].decode("utf-8", "replace").splitlines(), end + 1


def events(lines):
    for raw in lines:
        try:
            e = json.loads(raw)
        except ValueError:
            continue
        if isinstance(e, dict):
            yield e


def first_line(text):
    lines = (text or "").strip().splitlines()
    return lines[0] if lines else ""


# ---------- Codex rollouts ----------

def _codex_text(content):
    if isinstance(content, str):
        return content
    for c in content or []:
        if isinstance(c, dict):
            t = c.get("text")
            if isinstance(t, str) and t.strip():
                return t
    return ""


def _unquote(s):
    try:
        return json.loads(f'"{s}"')
    except ValueError:
        return s


def codex_action(p):
    """One line for a Codex response_item, like crow's Claude summaries; None when not an action."""
    t = p.get("type")
    if t in ("function_call", "custom_tool_call"):
        args = p.get("arguments") if t == "function_call" else p.get("input")
        detail = ""
        if isinstance(args, str):
            try:
                a = json.loads(args)
                if isinstance(a, dict):
                    detail = next((str(a[k]) for k in ("cmd", "command", "path", "query", "description") if a.get(k)), "")
            except ValueError:
                # code-mode tools wrap the call in JS: show the command, not the wrapper
                m = CODE_CMD.search(args)
                detail = _unquote(m[1]) if m else args
        return f"{p.get('name') or t}: {first_line(detail)}".rstrip(": ") if detail else (p.get("name") or t)
    if t == "local_shell_call":
        cmd = (p.get("action") or {}).get("command")
        return "shell: " + (" ".join(cmd) if isinstance(cmd, list) else str(cmd or ""))
    if t == "web_search_call":
        return "web search"
    if t == "message" and p.get("role") == "assistant":
        text = _codex_text(p.get("content"))
        return "says: " + first_line(text) if text.strip() else None
    return None


def codex_user_prompt(e):
    p = e.get("payload") or {}
    if e.get("type") == "event_msg" and p.get("type") == "user_message":
        return p.get("message")
    if e.get("type") == "event_msg" and p.get("type") == "item_completed":
        it = p.get("item") or {}
        if it.get("type") in ("UserMessage", "user_message"):
            return _codex_text(it.get("content"))
    if e.get("type") == "response_item" and p.get("type") == "message" and p.get("role") == "user":
        text = _codex_text(p.get("content"))
        return None if text.lstrip().startswith("<") else text
    return None


def new_codex_state():
    return {"native_id": None, "cwd": None, "started_at": None, "source": None, "last_action": None,
            "ends_on_text": False, "turn_done": None, "context_tokens": None, "context_window": None,
            "recent": [], "last_prompt": None, "first_prompt": None, "last_ts": None,
            "limit_error": None, "usage": [], "model": None}


def fold_codex(st, e):
    """Apply one rollout event to the reader state."""
    t, p, ts = e.get("type"), e.get("payload") or {}, e.get("timestamp")
    if ts:
        st["last_ts"] = ts
    if t == "session_meta":
        st["native_id"] = st["native_id"] or p.get("id") or p.get("session_id")
        st["cwd"] = st["cwd"] or p.get("cwd")
        st["started_at"] = st["started_at"] or p.get("timestamp") or ts
        st["source"] = st["source"] or p.get("source") or p.get("originator")
        return
    if t == "turn_context":
        st["model"] = p.get("model") or st["model"]
        return
    prompt = codex_user_prompt(e)
    if prompt and prompt.strip():
        st["last_prompt"] = prompt.strip()[:400]
        st["first_prompt"] = st["first_prompt"] or prompt.strip()[:400]
        st["last_action"] = "you: " + first_line(prompt)
        st["ends_on_text"] = False
        st["turn_done"] = False
        st["limit_error"] = None
        return
    if t == "response_item":
        act = codex_action(p)
        if act:
            st["recent"] = (st["recent"] + [{"ts": ts, "action": act}])[-RECENT_N:]
            st["last_action"] = act
            st["ends_on_text"] = act.startswith("says: ")
        return
    if t == "event_msg":
        k = p.get("type")
        if k == "task_started":
            st["turn_done"] = False
            st["context_window"] = p.get("model_context_window") or st["context_window"]
        elif k in ("task_complete", "turn_aborted"):
            st["turn_done"] = True
        elif k == "token_count":
            info = p.get("info") or {}
            last = info.get("last_token_usage") or {}
            if last.get("input_tokens") is not None:
                st["context_tokens"] = last["input_tokens"]  # OpenAI input counts cached input too
            st["context_window"] = info.get("model_context_window") or st["context_window"]
            total = info.get("total_token_usage")
            if total:
                # cumulative snapshot: usage keeps the latest per turn, never a sum of snapshots
                st["usage"] = (st["usage"] + [{"ts": ts, "total": total, "model": st["model"]}])[-1:]
        elif k == "error" and LIMIT_TEXT.search(str(p.get("message") or "")):
            st["limit_error"] = {"message": str(p.get("message"))[:200], "ts": ts}


def read_codex(path, cache=None):
    """Reader state of a rollout. With a cache dict, unchanged files are not read again and a
    grown file is read from where the last read stopped (append-only JSONL)."""
    try:
        stt = os.stat(path)
    except OSError:
        return None
    key = path
    hit = (cache or {}).get(key)
    if hit and hit.get("v") == PARSER_VERSION["codex"] and hit.get("ino") == stt.st_ino \
            and hit.get("offset", 0) <= stt.st_size:
        if hit["size"] == stt.st_size:
            return hit["state"]
        st, offset = hit["state"], hit["offset"]
    else:
        st, offset = new_codex_state(), 0
    try:
        with open(path, "rb") as fh:
            fh.seek(offset)
            data = fh.read()
    except OSError:
        return hit["state"] if hit else None
    lines, used = complete_lines(data)
    for e in events(lines):
        fold_codex(st, e)
    if cache is not None:
        cache[key] = {"v": PARSER_VERSION["codex"], "ino": stt.st_ino, "size": stt.st_size,
                      "offset": offset + used, "state": st, "read_bytes": len(data)}
    return st


def codex_rollouts(root):
    """Top-level rollout files of a Codex profile (sessions/YYYY/MM/DD/rollout-*.jsonl)."""
    base = os.path.join(root, "sessions")
    for dirpath, _, files in os.walk(base):
        for f in files:
            if f.startswith("rollout-") and f.endswith(".jsonl"):
                yield os.path.join(dirpath, f)


def codex_agent_info(st):
    """The crow-runs agent fields from a Codex reader state."""
    if not st:
        return {"last_action": None, "ends_on_text": False, "context_tokens": None, "subagents_active": None,
                "recent": [], "last_prompt": None, "waiting_evidence": False, "context_window": None}
    return {"last_action": st["last_action"], "ends_on_text": st["ends_on_text"],
            "context_tokens": st["context_tokens"], "subagents_active": None, "recent": list(st["recent"]),
            "last_prompt": st["last_prompt"], "waiting_evidence": bool(st["turn_done"]),
            "context_window": st["context_window"]}


def load_cache(path):
    try:
        data = json.load(open(path))
        return data.get("files", {}) if data.get("v") == PARSER_VERSION else {}
    except (OSError, ValueError):
        return {}


def save_cache(path, files):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = f"{path}.{os.getpid()}.tmp"
    with open(tmp, "w") as fh:
        json.dump({"v": PARSER_VERSION, "files": files, "saved_at": time.time()}, fh)
    os.replace(tmp, path)
