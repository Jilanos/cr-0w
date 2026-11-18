#!/usr/bin/env python3
"""crow_term: terminal actions behind one backend (open a window, focus or type into a session's window).

Backends, picked by CROW_TERMINAL (kitty, tmux, headless, print) or, when unset, the first that fits:
  kitty     kitty on PATH. Opens windows with `kitty`, focuses and types through remote control sockets.
  tmux      inside a tmux session ($TMUX). Opens tmux windows, focuses and types into panes.
  headless  only when named. Opens a detached tmux session (no window); types into its pane.
            `attach` opens a kitty window on it later. Used by the core for sessions started from Nest.
  print     anything else. Prints the command to run in a new terminal; cannot focus or type.

As a script (for shell callers such as bin/crow):
  crow_term.py backend
  crow_term.py open --title T [--cwd D] [--set K=V]... -- CMD...
      runs CMD detached from the calling session (clean_env plus the --set vars); on the print
      backend prints the line to run instead (the --set vars included); on the headless backend
      prints `tmux <session name>`.
"""
import glob
import json
import os
import pwd
import re
import shlex
import shutil
import subprocess
import sys
import time

BACKENDS = ("kitty", "tmux", "headless", "print")


class UnknownBackend(SystemExit):
    pass


def choose(env=None):
    """Backend name: CROW_TERMINAL when set, else kitty, tmux, print in that order."""
    env = os.environ if env is None else env
    name = env.get("CROW_TERMINAL", "").strip().lower()
    if name:
        if name not in BACKENDS:
            raise UnknownBackend(f"crow: CROW_TERMINAL={name} is not a backend ({', '.join(BACKENDS)})")
        return name
    if shutil.which("kitty"):
        return "kitty"
    if env.get("TMUX") and shutil.which("tmux"):
        return "tmux"
    return "print"


def clean_env(extra=None):
    """Detach from the calling session: real HOME, no inherited Claude/cdx variables, plus extra."""
    env = {k: v for k, v in os.environ.items() if not k.startswith(("CLAUDE", "ANTHROPIC_", "CDX_"))}
    env["HOME"] = pwd.getpwuid(os.getuid()).pw_dir
    env.update(extra or {})
    return env


def parent(pid, proc="/proc"):
    """Parent pid from /proc, else from `ps` (macOS), else None."""
    try:
        with open(f"{proc}/{pid}/stat") as fh:
            return int(fh.read().rsplit(")", 1)[1].split()[1])
    except (OSError, ValueError, IndexError):
        pass
    if os.path.isdir(proc):
        return None
    try:
        r = subprocess.run(["ps", "-o", "ppid=", "-p", str(pid)], check=False, capture_output=True, text=True, timeout=5)
        return int(r.stdout.strip())
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return None


def ancestors(pid, proc="/proc"):
    """pid and its parents, nearest first."""
    out = []
    while pid and pid > 1 and pid not in out:
        out.append(pid)
        pid = parent(pid, proc)
    return out


def env_changes(env):
    """(vars set or changed, vars removed) in env compared with this process."""
    if env is None:
        return {}, []
    added = {k: v for k, v in env.items() if os.environ.get(k) != v}
    return added, sorted(k for k in os.environ if k not in env)


def detach(argv, env, cwd=None):
    """Run argv in its own session, stdio closed; `setsid -f` where it exists (Linux)."""
    quiet = {"env": env, "cwd": cwd, "stdin": subprocess.DEVNULL, "stdout": subprocess.DEVNULL, "stderr": subprocess.DEVNULL}
    if shutil.which("setsid", path=(env or os.environ).get("PATH")):
        subprocess.run(["setsid", "-f", *argv], check=True, **quiet)
    else:
        subprocess.Popen(argv, start_new_session=True, **quiet)


# ---------- kitty ----------

def kitty_find_window(kitty_ls, pid, chain=None):
    """Id of the kitty window holding pid, else None. The nearest process wins: pid itself (own or
    foreground process), then its parent, and so on, so a child an agent spawns never resolves to
    the agent's window while its own window exists."""
    hit = kitty_nearest([(None, kitty_ls)], pid, chain)
    return hit[1] if hit else None


def kitty_nearest(listings, pid, chain=None):
    """(socket, window id) over several `kitty @ ls` results, nearest process in chain first."""
    chain = chain if chain is not None else ancestors(pid)
    owner = {}
    for sock, kitty_ls in listings:
        for osw in kitty_ls:
            for tab in osw.get("tabs", []):
                for win in tab.get("windows", []):
                    for p in {win.get("pid")} | {f.get("pid") for f in win.get("foreground_processes", [])}:
                        owner.setdefault(p, (sock, win["id"]))
    return next((owner[p] for p in chain if p in owner), None)


def multiline(text):
    """Text with LF line breaks and no trailing break, or None when it is one line."""
    t = text.replace("\r\n", "\n").replace("\r", "\n").rstrip("\n")
    return t if "\n" in t else None


def kitty_send_args(sock, wid, text):
    """kitten commands that type text, then press Enter, in window wid. Two writes: Claude Code
    reads one burst as a paste and turns its Enter into a newline. Several lines go as a
    bracketed paste so a line break never submits."""
    to = ["kitten", "@", "--to", sock]
    lines = multiline(text)
    paste = ["--bracketed-paste", "auto"] if lines else []
    return [[*to, "send-text", "--match", f"id:{wid}", *paste, "--", lines or text],
            [*to, "send-key", "--match", f"id:{wid}", "enter"]]


# Pause between the text and its Enter, so the Enter is not part of the paste burst.
SUBMIT_PAUSE = 0.3


def kitty_sockets():
    runtime = os.environ.get("XDG_RUNTIME_DIR") or f"/run/user/{os.getuid()}"
    return ["unix:" + s for s in sorted(glob.glob(f"{runtime}/kitty-*"))]


def kitty_locate(pid):
    """(socket, window id) of the window holding pid, else None. Reads every socket first so the
    nearest match wins across kitty instances."""
    listings = []
    for sock in kitty_sockets():
        try:
            r = subprocess.run(["kitten", "@", "--to", sock, "ls"], check=False, capture_output=True, text=True, timeout=5)
            listings.append((sock, json.loads(r.stdout) if r.returncode == 0 else []))
        except (OSError, ValueError, subprocess.TimeoutExpired):
            continue
    return kitty_nearest(listings, pid)


def kitty_open_args(argv, title, cwd=None):
    return ["kitty", "--title", title, *(["--directory", cwd] if cwd else []), *argv]


# ---------- tmux ----------

def tmux_find_pane(panes, chain):
    """Pane id from `list-panes -F '#{pane_id} #{pane_pid}'` lines holding the nearest process in chain, else None."""
    owner = {}
    for line in panes.splitlines():
        parts = line.split()
        if len(parts) == 2 and parts[1].isdigit():
            owner.setdefault(int(parts[1]), parts[0])
    return next((owner[p] for p in chain if p in owner), None)


def tmux_locate(pid):
    try:
        r = subprocess.run(["tmux", "list-panes", "-a", "-F", "#{pane_id} #{pane_pid}"], check=False,
                           capture_output=True, text=True, timeout=5)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return tmux_find_pane(r.stdout, ancestors(pid)) if r.returncode == 0 else None


def tmux_open_args(argv, title, cwd=None, env=None):
    """tmux new-window running argv; env changes go through `env` (the tmux server has its own env)."""
    added, removed = env_changes(env)
    added.pop("PATH", None)
    wrap = ["env", *(a for k in removed for a in ("-u", k)), *(f"{k}={v}" for k, v in sorted(added.items()))]
    return ["tmux", "new-window", "-n", title, *(["-c", cwd] if cwd else []),
            *(wrap + argv if len(wrap) > 1 else argv)]


# Prefix of the tmux sessions the headless backend opens.
HEADLESS_PREFIX = "crow-"


def headless_name(title, now=None):
    """tmux session name for a headless open: crow-<title word>-<HHMMSS>, safe for tmux targets."""
    word = "".join(c if c.isalnum() or c == "-" else "-" for c in title.lower()).strip("-")
    word = "-".join(w for w in word.split("-") if w and w != "crow")[:24].strip("-") or "session"
    return f"{HEADLESS_PREFIX}{word}-{time.strftime('%H%M%S', time.localtime(now))}"


def headless_open_args(argv, name, cwd=None, env=None, cols=200, rows=50):
    """tmux new-session -d running argv. Under a systemd service (INVOCATION_ID set) it runs in its own
    user scope, so a tmux server it starts outlives a restart of the service."""
    added, removed = env_changes(env)
    added.pop("PATH", None)
    wrap = ["env", *(a for k in removed for a in ("-u", k)), *(f"{k}={v}" for k, v in sorted(added.items()))]
    cmd = ["tmux", "new-session", "-d", "-s", name, "-x", str(cols), "-y", str(rows), *(["-c", cwd] if cwd else []),
           *(wrap + argv if len(wrap) > 1 else argv)]
    return own_scope(cmd)


def own_scope(cmd):
    """Under a systemd service (INVOCATION_ID set), run cmd in its own user scope so it outlives a
    restart of the service (the core's cgroup is killed whole)."""
    if os.environ.get("INVOCATION_ID") and shutil.which("systemd-run"):
        return ["systemd-run", "--user", "--scope", "--quiet", "--collect", *cmd]
    return cmd


def tmux_session_of(pane):
    """tmux session name holding pane, else None."""
    try:
        r = subprocess.run(["tmux", "display-message", "-p", "-t", pane, "#{session_name}"], check=False,
                           capture_output=True, text=True, timeout=5)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return r.stdout.strip() or None if r.returncode == 0 else None


def tmux_sessions_by_pid():
    """{pane pid: tmux session name} over every pane of the default server; {} without one."""
    try:
        r = subprocess.run(["tmux", "list-panes", "-a", "-F", "#{pane_pid} #{session_name}"], check=False,
                           capture_output=True, text=True, timeout=5)
    except (OSError, subprocess.TimeoutExpired):
        return {}
    out = {}
    for line in r.stdout.splitlines() if r.returncode == 0 else []:
        pid, _, name = line.partition(" ")
        if pid.isdigit() and name:
            out.setdefault(int(pid), name)
    return out


def tmux_session_for(pid, panes=None, proc="/proc"):
    """tmux session holding pid or its nearest ancestor, else None. panes: tmux_sessions_by_pid()."""
    panes = tmux_sessions_by_pid() if panes is None else panes
    return next((panes[p] for p in ancestors(pid, proc) if p in panes), None) if panes else None


def tmux_send_args(pane, text):
    """tmux commands that type text, then press Enter. Several lines go through a paste buffer
    (bracketed when the app asked for it, LF kept) so a line break never submits."""
    lines = multiline(text)
    if not lines:
        return [["tmux", "send-keys", "-t", pane, "-l", text], ["tmux", "send-keys", "-t", pane, "Enter"]]
    buf = f"crow-send{pane}"
    return [["tmux", "set-buffer", "-b", buf, "--", lines], ["tmux", "paste-buffer", "-p", "-r", "-d", "-b", buf, "-t", pane],
            ["tmux", "send-keys", "-t", pane, "Enter"]]


# ---------- print ----------

def print_line(argv, cwd=None, env=None, show_env=()):
    """Shell line to run argv by hand: `cd DIR && K=V cmd...` (only the show_env vars)."""
    shown = [f"{k}={shlex.quote(env[k])}" for k in show_env if env and env.get(k)]
    return " ".join([*([f"cd {shlex.quote(cwd)} &&"] if cwd else []), *shown, shlex.join(argv)])


# ---------- the actions ----------

def open_window(argv, title, cwd=None, env=None, show_env=(), backend=None):
    """Run argv in a new terminal window. Returns 'opened' or, on the print backend, the line to run."""
    backend = backend or choose()
    if backend == "kitty":
        detach(kitty_open_args(argv, title, cwd), env, cwd)
        return "opened"
    if backend == "tmux":
        subprocess.run(tmux_open_args(argv, title, cwd, env), check=True, env=env,
                       stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return "opened"
    if backend == "headless":
        name = headless_name(title)
        subprocess.run(headless_open_args(argv, name, cwd, env), check=True, env=env,
                       stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        return f"tmux {name}"
    return print_line(argv, cwd, env, show_env)


def attach(pid):
    """Open a kitty window attached to the tmux session holding pid. Closing the window detaches;
    the session keeps running. ("attached", session), ("kitty", None) when pid already has a kitty
    window (focused instead), else (None, reason)."""
    if hit := kitty_locate(pid):
        subprocess.run(["kitten", "@", "--to", hit[0], "focus-window", "--match", f"id:{hit[1]}"], check=True)
        return "kitty", None
    pane = tmux_locate(pid)
    name = tmux_session_of(pane) if pane else None
    if not name:
        return None, f"no tmux session holds pid {pid}"
    if not shutil.which("kitty"):
        return None, "kitty is not on PATH"
    # Nest's Terminal tab may have fixed the size; let the attached window size it again.
    subprocess.run(["tmux", "set-option", "-w", "-t", name, "window-size", "latest"], check=False, capture_output=True, timeout=5)
    detach(own_scope(kitty_open_args(["tmux", "attach-session", "-t", name], f"crow · {name}")), clean_env())
    return "attached", name


# Nest Terminal tab (item_240): the screen of the tmux pane holding a session, keys typed into
# it, and its size. Keys are named tmux keys from KEYS or literal text, nothing else.
KEYS = {"Enter", "Escape", "BSpace", "Tab", "BTab", "Up", "Down", "Left", "Right", "Home", "End",
        "PPage", "NPage", "DC", "IC", "Space", *(f"C-{c}" for c in "abcdefghijklmnopqrstuvwxyz")}
SCREEN_FMT = "#{cursor_x} #{cursor_y} #{pane_width} #{pane_height} #{cursor_flag}"


# Scrollback lines the Terminal tab gets above the screen.
HISTORY = 500


def with_history(scr, lines, rows):
    """scr with lines cut to HISTORY lines of scrollback plus the screen, and history = how many
    lines come before the screen (the cursor y counts from the screen's top)."""
    lines = lines[-(HISTORY + rows):] if rows else lines
    return {**scr, "lines": lines, "history": max(0, len(lines) - rows)}


def screen_of(pane, run=subprocess.run):
    """{lines (ANSI), history, cols, rows, cursor: {x, y, shown}} of a tmux pane, else None."""
    cap = run(["tmux", "capture-pane", "-p", "-e", "-N", "-S", f"-{HISTORY}", "-t", pane], capture_output=True, text=True, timeout=5)
    meta = run(["tmux", "display-message", "-p", "-t", pane, SCREEN_FMT], capture_output=True, text=True, timeout=5)
    if cap.returncode or meta.returncode:
        return None
    x, y, cols, rows, shown = (int(v) for v in meta.stdout.split())
    lines = cap.stdout.split("\n")
    if lines and lines[-1] == "":
        lines.pop()
    return with_history({"cols": cols, "rows": rows, "cursor": {"x": x, "y": y, "shown": bool(shown)}}, lines, rows)


def keys_args(pane, keys):
    """tmux commands for keys: a list of {"key": name} (from KEYS) or {"text": str}. ValueError on others."""
    if not isinstance(keys, list) or not keys or len(keys) > 200:
        raise ValueError("keys: a list of 1 to 200 items")
    out = []
    for k in keys:
        if isinstance(k, dict) and set(k) == {"key"} and k["key"] in KEYS:
            out.append(["tmux", "send-keys", "-t", pane, k["key"]])
        elif isinstance(k, dict) and set(k) == {"text"} and isinstance(k["text"], str) and 0 < len(k["text"]) <= 4000:
            out.append(["tmux", "send-keys", "-t", pane, "-l", k["text"]])
        else:
            raise ValueError(f"keys: bad item {k!r}")
    return out


def resize_args(pane, cols, rows):
    """tmux command sizing the window of pane to cols x rows (Nest's Terminal tab)."""
    if not (20 <= cols <= 400 and 5 <= rows <= 200):
        raise ValueError("size: cols 20 to 400, rows 5 to 200")
    return ["tmux", "resize-window", "-t", pane, "-x", str(cols), "-y", str(rows)]


# kitty windows (sessions started from a terminal): same screen and keys, read with
# `kitten @ get-text` and typed with send-text / send-key. The window keeps its own size.
KITTY_KEYS = {"Enter": "enter", "Escape": "escape", "BSpace": "backspace", "Tab": "tab", "BTab": "shift+tab",
              "Up": "up", "Down": "down", "Left": "left", "Right": "right", "Home": "home", "End": "end",
              "PPage": "page_up", "NPage": "page_down", "DC": "delete", "IC": "insert", "Space": "space",
              **{f"C-{c}": f"ctrl+{c}" for c in "abcdefghijklmnopqrstuvwxyz"}}
# --add-cursor ends the text with the cursor shown/hidden, its position (1-based) and its blink mode.
KITTY_CURSOR = re.compile(r"\x1b\[\?25([hl])\x1b\[(\d+);(\d+)H(?:\x1b\[\?12[hl])?\n?$")


def kitty_screen_of(sock, wid, run=subprocess.run):
    """{lines (ANSI), history, cols, rows, cursor: {x, y, shown}} of a kitty window, else None."""
    to = ["kitten", "@", "--to", sock]
    txt = run([*to, "get-text", "--match", f"id:{wid}", "--ansi", "--add-cursor", "--extent", "all"],
              capture_output=True, text=True, timeout=5)
    ls = run([*to, "ls", "--match", f"id:{wid}"], capture_output=True, text=True, timeout=5)
    if txt.returncode or ls.returncode:
        return None
    try:
        win = next(w for o in json.loads(ls.stdout) for t in o.get("tabs", []) for w in t.get("windows", []) if w.get("id") == wid)
    except (ValueError, StopIteration):
        return None
    text, cursor = txt.stdout, {"x": 0, "y": 0, "shown": False}
    if m := KITTY_CURSOR.search(text):
        text = text[:m.start()]
        cursor = {"x": int(m.group(3)) - 1, "y": int(m.group(2)) - 1, "shown": m.group(1) == "h"}
    lines = text.split("\n")
    if lines and lines[-1] == "":
        lines.pop()
    rows = win.get("lines", 0)
    return with_history({"cols": win.get("columns", 0), "rows": rows, "cursor": cursor}, lines, rows)


def kitty_keys_args(sock, wid, keys):
    """kitten commands for keys (same items as keys_args). Text is sent literally: send-text reads
    Python escapes, so backslashes are doubled."""
    to = ["kitten", "@", "--to", sock]
    out = []
    for k in keys_args("-", keys):
        if k[-2] == "-l":
            out.append([*to, "send-text", "--match", f"id:{wid}", "--", k[-1].replace("\\", "\\\\")])
        else:
            out.append([*to, "send-key", "--match", f"id:{wid}", KITTY_KEYS[k[-1]]])
    return out


def focus(pid, backend=None):
    """Bring the window holding pid to the front. A short description of it, else None."""
    backend = backend or choose()
    if backend == "kitty" and (hit := kitty_locate(pid)):
        subprocess.run(["kitten", "@", "--to", hit[0], "focus-window", "--match", f"id:{hit[1]}"], check=True)
        return f"window {hit[1]}"
    if backend == "tmux" and (pane := tmux_locate(pid)):
        for cmd in (["select-window", "-t", pane], ["select-pane", "-t", pane], ["switch-client", "-t", pane]):
            subprocess.run(["tmux", *cmd], check=False, capture_output=True, timeout=5)
        return f"pane {pane}"
    return None


def locate(pid, backend=None):
    """("kitty", (socket, wid)) or ("tmux", pane) holding pid, else None. A kitty desktop still
    reaches sessions running in tmux (hidden test sessions, ssh)."""
    backend = backend or choose()
    if backend == "kitty" and (hit := kitty_locate(pid)):
        return "kitty", hit
    if backend in ("kitty", "tmux", "headless") and (pane := tmux_locate(pid)):
        return "tmux", pane
    return None


def _run_all(cmds):
    for i, cmd in enumerate(cmds):
        if i:
            time.sleep(SUBMIT_PAUSE)
        subprocess.run(cmd, check=True, timeout=5)
    return True


def send(pid, text, backend=None):
    """Type text and Enter into the window holding pid. True when a window took it."""
    where = locate(pid, backend)
    if not where:
        return False
    kind, t = where
    return _run_all(kitty_send_args(*t, text) if kind == "kitty" else tmux_send_args(t, text))


def send_escape(pid, backend=None):
    """Press Escape in the window holding pid (interrupts a Claude turn). True when a window took it."""
    where = locate(pid, backend)
    if not where:
        return False
    kind, t = where
    return _run_all([["kitten", "@", "--to", t[0], "send-key", "--match", f"id:{t[1]}", "escape"]] if kind == "kitty"
                    else [["tmux", "send-keys", "-t", t, "Escape"]])


def send_key(pid, key, backend=None):
    """Press one key (no Enter) in the window holding pid, e.g. "1" on a Claude menu. True when a window took it."""
    where = locate(pid, backend)
    if not where:
        return False
    kind, t = where
    return _run_all([["kitten", "@", "--to", t[0], "send-text", "--match", f"id:{t[1]}", "--", key]] if kind == "kitty"
                    else [["tmux", "send-keys", "-t", t, "-l", key]])


TMUX_KEYS = {"down": "Down", "enter": "Enter", "tab": "Tab", "escape": "Escape"}


def send_special(pid, key, backend=None):
    """Press a named key (down, enter, tab, escape) in the window holding pid. True when a window took it."""
    where = locate(pid, backend)
    if not where or key not in TMUX_KEYS:
        return False
    kind, t = where
    return _run_all([["kitten", "@", "--to", t[0], "send-key", "--match", f"id:{t[1]}", key]] if kind == "kitty"
                    else [["tmux", "send-keys", "-t", t, TMUX_KEYS[key]]])


def is_claude(pid, proc="/proc"):
    """True when pid runs the claude CLI (its command line names it)."""
    try:
        with open(f"{proc}/{pid}/cmdline", "rb") as fh:
            argv = fh.read().split(b"\0")
    except OSError:
        return False
    return any(os.path.basename(a.decode(errors="replace")) == "claude" or a.endswith(b"/claude")
               or b"claude-code" in a for a in argv[:2])


def main(argv):
    try:
        if argv[:1] == ["backend"]:
            print(choose())
            return 0
        if argv[:1] != ["open"] or "--" not in argv:
            sys.exit(__doc__)
        i = argv.index("--")
        opts, cmd = argv[1:i], argv[i + 1:]
        title, cwd, extra = "crow", None, {}
        while opts:
            key, val, opts = opts[0], opts[1] if len(opts) > 1 else sys.exit(__doc__), opts[2:]
            if key == "--title":
                title = val
            elif key == "--cwd":
                cwd = val
            elif key == "--set" and "=" in val:
                k, v = val.split("=", 1)
                extra[k] = v
            else:
                sys.exit(__doc__)
        if not cmd:
            sys.exit(__doc__)
        out = open_window(cmd, title, cwd, clean_env(extra), list(extra))
    except (OSError, subprocess.CalledProcessError) as e:
        sys.exit(f"crow: could not open a window ({e})")
    if out != "opened":
        print(out)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
