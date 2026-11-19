"""crow-focus and the crow_term backends: window matching, the dry run and the print fallback.
No terminal is ever opened: kitty tests fake setsid, the rest use the print backend."""
import os
import sys

import pytest
from conftest import BIN, run

sys.path.insert(0, str(BIN))
import crow_term as ct

LS = [{"tabs": [{"windows": [
    {"id": 1, "pid": 100, "foreground_processes": [{"pid": 100}]},
    {"id": 2, "pid": 200, "foreground_processes": [{"pid": 250}]},
]}]}]


def test_window_found_by_ancestor_or_foreground_process():
    assert ct.kitty_find_window(LS, 999, chain=[999, 300, 200]) == 2
    assert ct.kitty_find_window(LS, 250, chain=[250]) == 2
    assert ct.kitty_find_window(LS, 999, chain=[999, 1]) is None


def test_nearest_window_wins_over_an_ancestor_window():
    # pid 999 runs in window 7 on socket b; its ancestor 100 holds window 1 on socket a
    other = [{"tabs": [{"windows": [{"id": 7, "pid": 400, "foreground_processes": [{"pid": 999}]}]}]}]
    assert ct.kitty_nearest([("a", LS), ("b", other)], 999, chain=[999, 400, 100]) == ("b", 7)
    assert ct.kitty_nearest([("a", LS), ("b", other)], 5, chain=[5, 100]) == ("a", 1)
    assert ct.tmux_find_pane("%1 100\n%2 400", [999, 400, 100]) == "%2"


def test_ancestors_stop_at_init(tmp_path):
    for pid, ppid in ((30, 20), (20, 10), (10, 1)):
        d = tmp_path / str(pid)
        d.mkdir()
        (d / "stat").write_text(f"{pid} (a b) S {ppid} 0")
    assert ct.ancestors(30, proc=str(tmp_path)) == [30, 20, 10]


def test_dry_run_needs_account_and_cwd(hub):
    ok = run(hub, "crow-focus", "--pid", "5", "--account", "main", "--cwd", "/tmp", "--dry-run")
    assert ok.returncode == 0 and "cdx resume main --project /tmp" in ok.stdout
    assert run(hub, "crow-focus", "--pid", "5", "--dry-run").returncode != 0


def test_dry_run_resumes_one_session_id(hub):
    ok = run(hub, "crow-focus", "--pid", "0", "--account", "main", "--cwd", "/tmp", "--session", "abc-1", "--dry-run")
    assert ok.returncode == 0 and "cdx resume main --project /tmp --conversation abc-1" in ok.stdout


def test_send_dry_run_and_command(hub):
    ok = run(hub, "crow-focus", "--pid", "5", "--send", "yes", "--dry-run", env={"CROW_TERMINAL": "kitty"})
    assert ok.returncode == 0 and "'yes'" in ok.stdout and "pid 5" in ok.stdout and "kitty" in ok.stdout
    assert ct.kitty_send_args("unix:/s", 7, "no") == [
        ["kitten", "@", "--to", "unix:/s", "send-text", "--match", "id:7", "--", "no"],
        ["kitten", "@", "--to", "unix:/s", "send-key", "--match", "id:7", "enter"],
    ]
    assert run(hub, "crow-focus", "--send", "yes", "--dry-run").returncode != 0


def load_focus():
    import importlib.machinery
    import importlib.util
    loader = importlib.machinery.SourceFileLoader("crow_focus", str(BIN / "crow-focus"))
    mod = importlib.util.module_from_spec(importlib.util.spec_from_loader("crow_focus", loader))
    loader.exec_module(mod)
    return mod


def test_send_refuses_while_the_session_waits_on_a_prompt(tmp_path, monkeypatch):
    # Text typed into an open question or permission dialog never reaches the session.
    cf = load_focus()
    d = tmp_path / "local/state/prompts"
    d.mkdir(parents=True)
    (d / "42.json").write_text('{"id": "p1", "session_id": "s1", "tool": "AskUserQuestion", "detail": "Pick?"}')
    asking = {"status": "waiting", "waitingFor": "input needed", "sessionId": "s1"}
    typed = []
    monkeypatch.setattr(cf.crow_term, "send", lambda *a: typed.append(a) or True)
    code, msg = cf.send(42, "hello", "tmux", False, home=tmp_path, meta=asking)
    assert code == 1 and "question" in msg and typed == []
    assert cf.send(42, "hello", "tmux", True, home=tmp_path, meta=asking)[0] == 1
    assert cf.send(42, "hello", "tmux", False, home=tmp_path, meta={"status": "idle", "sessionId": "s1"}) == (0, "sent")
    assert len(typed) == 1


def test_send_reports_a_failed_terminal_command(tmp_path, monkeypatch):
    import subprocess
    cf = load_focus()
    monkeypatch.setattr(cf.crow_term, "locate", lambda *a: ("tmux", "%7"))
    def fail(cmd, **kw):
        raise subprocess.CalledProcessError(1, cmd)
    monkeypatch.setattr(cf.crow_term.subprocess, "run", fail)
    code, msg = cf.send(42, "hello", "tmux", False, home=tmp_path, meta={"status": "idle"})
    assert code == 2 and "not sent" in msg


def test_multiline_send_is_one_bracketed_paste_then_enter():
    # A line break must not submit half the message: the text goes as a paste, Enter after.
    assert ct.kitty_send_args("unix:/s", 7, "a\r\nb") == [
        ["kitten", "@", "--to", "unix:/s", "send-text", "--match", "id:7", "--bracketed-paste", "auto", "--", "a\nb"],
        ["kitten", "@", "--to", "unix:/s", "send-key", "--match", "id:7", "enter"],
    ]
    assert ct.tmux_send_args("%7", "a\nb\n") == [
        ["tmux", "set-buffer", "-b", "crow-send%7", "--", "a\nb"],
        ["tmux", "paste-buffer", "-p", "-r", "-d", "-b", "crow-send%7", "-t", "%7"],
        ["tmux", "send-keys", "-t", "%7", "Enter"],
    ]


# ---------- backend choice ----------

def test_choice_order_and_override(monkeypatch):
    have = set()
    monkeypatch.setattr(ct.shutil, "which", lambda name, **_: f"/bin/{name}" if name in have else None)
    assert ct.choose({}) == "print"
    have.add("tmux")
    assert ct.choose({}) == "print" and ct.choose({"TMUX": "/s,1,0"}) == "tmux"
    have.add("kitty")
    assert ct.choose({"TMUX": "/s,1,0"}) == "kitty"
    assert ct.choose({"CROW_TERMINAL": "Print"}) == "print"
    with pytest.raises(SystemExit, match="not a backend"):
        ct.choose({"CROW_TERMINAL": "xterm"})


def test_clean_env_drops_session_markers(monkeypatch):
    monkeypatch.setenv("CLAUDECODE", "1")
    monkeypatch.setenv("CDX_SESSION_NAME", "main")
    monkeypatch.setenv("ANTHROPIC_MODEL", "x")
    env = ct.clean_env({"CROW_ACCOUNT": "spare"})
    assert not any(k.startswith(("CLAUDE", "CDX_", "ANTHROPIC_")) for k in env)
    assert env["CROW_ACCOUNT"] == "spare" and env["HOME"]


# ---------- tmux (commands only) ----------

def test_tmux_pane_match_and_commands(monkeypatch):
    panes = "%1 100\n%7 200\nbad line\n"
    assert ct.tmux_find_pane(panes, [999, 200]) == "%7"
    assert ct.tmux_find_pane(panes, [999]) is None
    assert ct.tmux_send_args("%7", "yes") == [["tmux", "send-keys", "-t", "%7", "-l", "yes"],
                                             ["tmux", "send-keys", "-t", "%7", "Enter"]]
    monkeypatch.setenv("CDX_SESSION_NAME", "main")
    env = ct.clean_env({"CROW_ACCOUNT": "spare"})
    args = ct.tmux_open_args(["crow", "open", "demo"], "crow · demo", "/w", env)
    assert args[:6] == ["tmux", "new-window", "-n", "crow · demo", "-c", "/w"]
    wrap = args[6:]
    assert wrap[0] == "env" and wrap[-3:] == ["crow", "open", "demo"]
    assert "-u" in wrap and "CDX_SESSION_NAME" in wrap and "CROW_ACCOUNT=spare" in wrap


# ---------- print fallback ----------

def test_print_backend_prints_the_line():
    line = ct.open_window(["cdx", "main", "--dir", "/a b", "--resume"], "t", "/a b",
                          {"CROW_ACCOUNT": "spare"}, ["CROW_ACCOUNT"], backend="print")
    assert line == "cd '/a b' && CROW_ACCOUNT=spare cdx main --dir '/a b' --resume"
    assert ct.focus(5, backend="print") is None and ct.send(5, "yes", backend="print") is False


def test_focus_without_kitty_prints_the_resume_command(hub, tmp_path):
    env = {"CROW_TERMINAL": "print"}
    r = run(hub, "crow-focus", "--pid", "5", "--account", "main", "--cwd", str(tmp_path), env=env)
    assert r.returncode == 0, r.stderr
    assert f"cdx resume main --project {tmp_path}" in r.stdout and "new terminal" in r.stdout
    s = run(hub, "crow-focus", "--pid", "5", "--send", "yes", env=env)
    assert s.returncode == 1 and "cannot type into a window" in s.stderr


def test_script_open_prints_on_the_print_backend(tmp_path):
    import subprocess
    e = {**os.environ, "CROW_TERMINAL": "print", "CDX_SESSION_NAME": "x"}
    r = subprocess.run([sys.executable, str(BIN / "crow_term.py"), "open", "--title", "t", "--cwd", str(tmp_path),
                        "--set", "CROW_ACCOUNT=spare", "--", "crow", "open", "demo"], check=False, capture_output=True, text=True, env=e)
    assert r.returncode == 0, r.stderr
    assert r.stdout.strip() == f"cd {tmp_path} && CROW_ACCOUNT=spare crow open demo"
    b = subprocess.run([sys.executable, str(BIN / "crow_term.py"), "backend"], check=False, capture_output=True, text=True, env=e)
    assert b.stdout.strip() == "print"


def test_ancestors_use_ps_without_proc(tmp_path, monkeypatch):
    parents = {30: "20", 20: "1"}

    class R:
        def __init__(self, out):
            self.stdout = out
    monkeypatch.setattr(ct.subprocess, "run", lambda cmd, **_: R(parents.get(int(cmd[-1]), "")))
    assert ct.ancestors(30, proc=str(tmp_path / "no-proc")) == [30, 20]


def test_interrupt_and_stop_dry_run(hub, tmp_path):
    ok = run(hub, "crow-focus", "--pid", "5", "--interrupt", "--dry-run", env={"CROW_TERMINAL": "kitty"})
    assert ok.returncode == 0 and "Escape" in ok.stdout
    # pid 1 is never a claude session: stop refuses it, dry run or not
    no = run(hub, "crow-focus", "--pid", "1", "--stop", "--dry-run")
    assert no.returncode == 1 and "not a claude session" in no.stderr


def test_is_claude_reads_the_command_line(tmp_path):
    for pid, argv in ((10, [b"/usr/bin/claude", b"--resume"]), (11, [b"node", b"/opt/x/claude-code/cli.js"]),
                      (12, [b"bash", b"-c", b"claude"])):
        (tmp_path / str(pid)).mkdir()
        (tmp_path / str(pid) / "cmdline").write_bytes(b"\0".join(argv) + b"\0")
    assert ct.is_claude(10, proc=str(tmp_path)) and ct.is_claude(11, proc=str(tmp_path))
    assert not ct.is_claude(12, proc=str(tmp_path)) and not ct.is_claude(99, proc=str(tmp_path))


def test_locate_falls_back_to_tmux_from_kitty(monkeypatch):
    monkeypatch.setattr(ct, "kitty_locate", lambda pid: None)
    monkeypatch.setattr(ct, "tmux_locate", lambda pid: "%3")
    assert ct.locate(42, "kitty") == ("tmux", "%3")
    assert ct.locate(42, "print") is None
    monkeypatch.setattr(ct, "kitty_locate", lambda pid: ("unix:/s", 7))
    assert ct.locate(42, "kitty") == ("kitty", ("unix:/s", 7))


def test_headless_is_never_auto_picked_and_names_its_session(monkeypatch):
    monkeypatch.setattr(ct.shutil, "which", lambda name, **_: f"/bin/{name}")
    assert ct.choose({}) == "kitty" and ct.choose({"CROW_TERMINAL": "headless"}) == "headless"
    assert ct.headless_name("crow · cr-0w (hub)", now=0).startswith("crow-cr-0w-hub-")
    assert ct.headless_name("crow", now=0).startswith("crow-session-")


def test_headless_open_is_detached_and_scoped_under_a_service(monkeypatch):
    monkeypatch.setattr(ct.shutil, "which", lambda name, **_: f"/bin/{name}")
    monkeypatch.delenv("INVOCATION_ID", raising=False)
    cmd = ct.headless_open_args(["claude"], "crow-demo-1", cwd="/src/demo", env=dict(os.environ))
    assert cmd[:5] == ["tmux", "new-session", "-d", "-s", "crow-demo-1"] and "/src/demo" in cmd and cmd[-1] == "claude"
    monkeypatch.setenv("INVOCATION_ID", "abc")
    scoped = ct.headless_open_args(["claude"], "crow-demo-1", env=dict(os.environ))
    assert scoped[:5] == ["systemd-run", "--user", "--scope", "--quiet", "--collect"] and scoped[5] == "tmux"


def test_tmux_session_for_walks_ancestors(tmp_path):
    for pid, ppid in ((30, 20), (20, 10), (10, 1)):
        d = tmp_path / str(pid)
        d.mkdir()
        (d / "stat").write_text(f"{pid} (a) S {ppid} 0")
    assert ct.tmux_session_for(30, {20: "crow-demo-1"}, proc=str(tmp_path)) == "crow-demo-1"
    assert ct.tmux_session_for(30, {99: "other"}, proc=str(tmp_path)) is None
    assert ct.tmux_session_for(30, {}, proc=str(tmp_path)) is None


def test_attach_opens_kitty_on_the_tmux_session(monkeypatch):
    opened = []
    monkeypatch.setattr(ct, "kitty_locate", lambda pid: None)
    monkeypatch.setattr(ct, "tmux_locate", lambda pid: "%3" if pid == 42 else None)
    monkeypatch.setattr(ct, "tmux_session_of", lambda pane: "crow-demo-1")
    monkeypatch.setattr(ct, "detach", lambda argv, env, cwd=None: opened.append(argv))
    monkeypatch.setattr(ct.shutil, "which", lambda name, **_: f"/bin/{name}")
    monkeypatch.delenv("INVOCATION_ID", raising=False)
    assert ct.attach(42) == ("attached", "crow-demo-1")
    assert opened[0][0] == "kitty" and opened[0][-4:] == ["tmux", "attach-session", "-t", "crow-demo-1"]
    how, why = ct.attach(7)
    assert how is None and "no tmux session" in why


def test_attach_dry_run(hub):
    ok = run(hub, "crow-focus", "--pid", "5", "--attach", "--dry-run", "--json")
    assert ok.returncode == 0 and '"action": "attach"' in ok.stdout.replace('":"', '": "')


# item_240: Nest Terminal tab helpers.
def test_screen_of_reads_lines_and_cursor():
    class R:
        def __init__(self, out, rc=0):
            self.stdout, self.returncode = out, rc
    calls = []
    def run(cmd, **kw):
        calls.append(cmd)
        return R("\x1b[1m❯\x1b[0m hi\nnext\n") if "capture-pane" in cmd else R("3 1 80 24 1\n")
    scr = ct.screen_of("%4", run=run)
    assert scr == {"lines": ["\x1b[1m❯\x1b[0m hi", "next"], "cols": 80, "rows": 24, "cursor": {"x": 3, "y": 1, "shown": True}, "history": 0}
    assert "-S" in calls[0]
    assert calls[0][:4] == ["tmux", "capture-pane", "-p", "-e"] and calls[0][-2:] == ["-t", "%4"]
    assert ct.screen_of("%4", run=lambda cmd, **kw: R("", 1)) is None


def test_with_history_counts_lines_above_the_screen_and_caps_them():
    scr = ct.with_history({"rows": 2}, ["old", "a", "b"], 2)
    assert scr["history"] == 1 and scr["lines"] == ["old", "a", "b"]
    many = ct.with_history({"rows": 2}, [str(i) for i in range(ct.HISTORY + 10)], 2)
    assert many["history"] == ct.HISTORY and len(many["lines"]) == ct.HISTORY + 2


def test_keys_args_take_named_keys_and_literal_text_only():
    assert ct.keys_args("%4", [{"text": "yes"}, {"key": "Enter"}, {"key": "C-c"}]) == [
        ["tmux", "send-keys", "-t", "%4", "-l", "yes"], ["tmux", "send-keys", "-t", "%4", "Enter"],
        ["tmux", "send-keys", "-t", "%4", "C-c"]]
    for bad in ([], [{"key": "run-shell"}], [{"text": ""}], [{"key": "Enter", "text": "x"}], ["Enter"], {"key": "Enter"}):
        with pytest.raises(ValueError):
            ct.keys_args("%4", bad)


def test_resize_args_bound_the_size():
    assert ct.resize_args("%4", 100, 30) == ["tmux", "resize-window", "-t", "%4", "-x", "100", "-y", "30"]
    for c, r in ((10, 30), (100, 2), (900, 30)):
        with pytest.raises(ValueError):
            ct.resize_args("%4", c, r)


def test_kitty_screen_of_reads_lines_and_strips_the_cursor():
    import json
    class R:
        def __init__(self, out, rc=0):
            self.stdout, self.returncode = out, rc
    ls = json.dumps([{"tabs": [{"windows": [{"id": 3, "columns": 114, "lines": 53}]}]}])
    def run(cmd, **kw):
        return R("a\n\x1b[31mb\x1b[m\n\x1b[?25h\x1b[2;5H\x1b[?12h\n") if "get-text" in cmd else R(ls)
    assert ct.kitty_screen_of("unix:s", 3, run=run) == {
        "lines": ["a", "\x1b[31mb\x1b[m"], "cols": 114, "rows": 53, "cursor": {"x": 4, "y": 1, "shown": True}, "history": 0}
    assert ct.kitty_screen_of("unix:s", 9, run=run) is None


def test_kitty_keys_args_map_names_and_keep_text_literal():
    to = ["kitten", "@", "--to", "unix:s"]
    assert ct.kitty_keys_args("unix:s", 3, [{"text": "a\\e"}, {"key": "Enter"}, {"key": "C-c"}, {"key": "BTab"}]) == [
        [*to, "send-text", "--match", "id:3", "--", "a\\\\e"], [*to, "send-key", "--match", "id:3", "enter"],
        [*to, "send-key", "--match", "id:3", "ctrl+c"], [*to, "send-key", "--match", "id:3", "shift+tab"]]
    assert set(ct.KITTY_KEYS) == ct.KEYS
    with pytest.raises(ValueError):
        ct.kitty_keys_args("unix:s", 3, [{"key": "run-shell"}])


def test_crow_screen_refuses_a_pid_without_a_window(tmp_path):
    import json
    import subprocess
    r = subprocess.run([sys.executable, str(BIN / "crow-screen"), "show", "--pid", "1"], capture_output=True, text=True,
                       env={**os.environ, "TMUX_TMPDIR": str(tmp_path), "XDG_RUNTIME_DIR": str(tmp_path)})
    assert r.returncode == 1 and json.loads(r.stdout)["ok"] is False


def test_resume_headless_prints_json_with_the_tmux_session(tmp_path):
    """item_240: core resumes with CROW_TERMINAL=headless; no window, one JSON line."""
    import json
    import subprocess
    fakebin, calls = tmp_path / "bin", tmp_path / "tmux.log"
    fakebin.mkdir()
    (fakebin / "tmux").write_text(f"#!/bin/sh\necho \"$@\" >> {calls}\n")
    (fakebin / "tmux").chmod(0o755)
    env = {**os.environ, "PATH": f"{fakebin}:{os.environ['PATH']}", "CROW_TERMINAL": "headless", "INVOCATION_ID": ""}
    r = subprocess.run([sys.executable, str(BIN / "crow-focus"), "--pid", "0", "--account", "main", "--cwd", str(tmp_path),
                        "--session", "abc"], capture_output=True, text=True, env=env)
    assert r.returncode == 0, r.stderr
    out = json.loads(r.stdout.strip().splitlines()[-1])
    assert out["ok"] and out["account"] == "main" and out["tmux"].startswith("crow-") and "no window" in out["message"]
    assert calls.read_text().startswith(f"new-session -d -s {out['tmux']} ") and "--conversation abc" in calls.read_text()
