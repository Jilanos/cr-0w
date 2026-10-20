"""crow-relaunch against a fake cdx on PATH: no real handoff is ever started."""
import json
import os
import pty
import subprocess

import pytest

from conftest import BIN, run
from test_crow_sessions import LIMIT, reply, transcript, user

FAKE_CDX = """#!/usr/bin/env python3
import json, os, sys
log = os.environ["FAKE_CDX_LOG"]
with open(log, "a") as fh:
    fh.write(json.dumps({"argv": sys.argv[1:], "cwd": os.getcwd(),
                         "account": os.environ.get("CROW_ACCOUNT")}) + "\\n")
cmd = sys.argv[1]
if cmd == "can-resume":
    print(json.dumps({"ok": True, "resumable": sys.argv[2] != "stuck", "reason": "supported"}))
elif cmd == "status":
    rows = [{"session_name": n, "enabled": True, "auth_status": "authenticated",
             "remaining_5h_pct": 0 if n in os.environ.get("FAKE_BLOCKED", "").split(",") else 60,
             "remaining_week_pct": 80, "reset_5h_at": "Oct 21 01:00"} for n in ("main", "shared", "mate", "spare")]
    print(json.dumps({"ok": True, "rows": rows}))
elif cmd == "handoff":
    print("handed off")
"""


@pytest.fixture
def cdx(hub, tmp_path):
    d = tmp_path / "fakebin"
    d.mkdir()
    (d / "cdx").write_text(FAKE_CDX)
    (d / "cdx").chmod(0o755)
    log = tmp_path / "cdx.log"
    env = {"PATH": f"{d}:{os.environ['PATH']}", "FAKE_CDX_LOG": str(log)}

    def calls():
        return [json.loads(l) for l in log.read_text().splitlines()] if log.exists() else []
    return env, calls


@pytest.fixture
def session(hub, tmp_path):
    ws = tmp_path / "ws"
    ws.mkdir()
    transcript(hub, "main", "abc-123", [user("ship it"), LIMIT], cwd=str(ws))
    return str(ws.resolve())


def relaunch(hub, cdx, *args, extra=None, input=None):
    return run(hub, "crow-relaunch", *args, env={**cdx[0], **(extra or {})}, input=input)


def handoffs(cdx):
    return [c for c in cdx[1]() if c["argv"][0] == "handoff"]


def test_refuses_without_a_conversation_id(hub, cdx, session):
    for args in (["shared"], ["", "shared"], ["../x", "shared"]):
        r = relaunch(hub, cdx, *args, "--yes")
        assert r.returncode == 1 and ("id is required" in r.stderr), r.stderr
    assert cdx[1]() == []


def test_refuses_never_and_unknown_targets(hub, cdx, session):
    for target in ("mate", "nobody", "typo"):
        r = relaunch(hub, cdx, "abc", target, "--yes")
        assert r.returncode == 1 and "not allowed" in r.stderr
    assert handoffs(cdx) == []


def test_refuses_unknown_ambiguous_and_same_account(hub, cdx, session):
    transcript(hub, "main", "abd-456", [user("x"), LIMIT], cwd=session)
    assert "2 interrupted sessions" in relaunch(hub, cdx, "ab", "spare", "--yes").stderr
    assert "matches 0 transcripts" in relaunch(hub, cdx, "zzz", "spare", "--yes").stderr
    assert "already belongs" in relaunch(hub, cdx, "abc", "main", "--yes").stderr
    assert handoffs(cdx) == []


def test_refuses_a_source_in_a_never_account(hub, cdx, session):
    transcript(hub, "mate", "theirs-1", [user("x"), LIMIT], cwd=session)
    r = relaunch(hub, cdx, "theirs-1", "spare", "--yes")
    assert r.returncode == 1 and "never uses" in r.stderr


def test_refuses_more_than_one_workspace(hub, cdx, tmp_path):
    a, b = tmp_path / "a", tmp_path / "b"
    a.mkdir(), b.mkdir()
    transcript(hub, "main", "multi", [user("x"), {**reply(), "cwd": str(b), "sessionId": "multi"}, LIMIT], cwd=str(a))
    r = relaunch(hub, cdx, "multi", "spare", "--yes")
    assert r.returncode == 1 and "2 workspaces" in r.stderr


def test_refuses_blocked_or_unresumable_targets(hub, cdx, session):
    r = relaunch(hub, cdx, "abc", "spare", "--yes", extra={"FAKE_BLOCKED": "spare"})
    assert r.returncode == 1 and "blocked: 5h limit" in r.stderr
    assert handoffs(cdx) == []


def test_dry_run_checks_cdx_and_launches_nothing(hub, cdx, session):
    r = relaunch(hub, cdx, "abc", "shared", "--dry-run")
    assert r.returncode == 0, r.stderr
    assert "cdx handoff main shared --source-conversation abc-123" in r.stdout
    assert "nothing launched" in r.stdout
    assert [c["argv"][0] for c in cdx[1]()] == ["can-resume", "status"]
    assert not (hub[0] / "local" / "state" / "relaunches.jsonl").exists()


def test_use_account_hands_off_with_the_id_from_the_workspace(hub, cdx, session):
    r = relaunch(hub, cdx, "abc", "spare", "--yes")
    assert r.returncode == 0, r.stderr
    (h,) = handoffs(cdx)
    assert h["argv"] == ["handoff", "main", "spare", "--source-conversation", "abc-123"]
    assert h["cwd"] == session and h["account"] == "spare"
    rec = json.loads((hub[0] / "local" / "state" / "relaunches.jsonl").read_text())
    assert (rec["conversation_id"], rec["source"], rec["target"]) == ("abc-123", "main", "spare")
    out = run(hub, "crow-sessions", "list").stdout
    assert "0 interrupted session(s), 1 already relaunched" in out


def test_use_account_without_tty_needs_yes(hub, cdx, session):
    r = relaunch(hub, cdx, "abc", "spare", input="y\n")
    assert r.returncode == 1 and "--yes" in r.stderr
    assert handoffs(cdx) == []


def test_ask_first_ignores_yes_flag_without_a_terminal(hub, cdx, session):
    r = relaunch(hub, cdx, "abc", "shared", "--yes", input="yes\n")
    assert r.returncode == 1 and "typed yes on a terminal" in r.stderr
    assert handoffs(cdx) == []


def on_tty(hub, cdx, answer, *args):
    """Run crow-relaunch on a pseudo-terminal and type an answer at its prompt."""
    home, profiles = hub
    env = {**os.environ, **cdx[0], "CROW_HOME": str(home), "CDX_PROFILES": str(profiles)}
    env.pop("CROW_ACCOUNT", None)
    pid, fd = pty.fork()
    if pid == 0:
        os.execve(str(BIN / "crow-relaunch"), [str(BIN / "crow-relaunch"), *args], env)
    out = b""
    sent = False
    while True:
        try:
            chunk = os.read(fd, 1024)
        except OSError:
            break
        if not chunk:
            break
        out += chunk
        if not sent and b"hand off" in out.lower():
            os.write(fd, answer.encode() + b"\n")
            sent = True
    _, status = os.waitpid(pid, 0)
    return os.waitstatus_to_exitcode(status), out.decode(errors="replace")


@pytest.mark.parametrize("answer", ["y", "Y", "no", ""])
def test_ask_first_rejects_anything_but_yes(hub, cdx, session, answer):
    code, out = on_tty(hub, cdx, answer, "abc", "shared", "--yes")
    assert code == 1 and "cancelled" in out
    assert handoffs(cdx) == []


def test_ask_first_hands_off_after_a_typed_yes(hub, cdx, session):
    code, out = on_tty(hub, cdx, "yes", "abc", "shared")
    assert code == 0, out
    (h,) = handoffs(cdx)
    assert h["argv"] == ["handoff", "main", "shared", "--source-conversation", "abc-123"]


def test_status_recommends_an_unblocked_allowed_account(hub, cdx):
    def status(blocked, fmt=("--json",)):
        return relaunch(hub, cdx, "status", *fmt, extra={"FAKE_BLOCKED": blocked, "CROW_ACCOUNT": "main"}).stdout
    st = json.loads(status("main"))
    assert st["current_blocked"].startswith("5h limit")
    assert st["recommended"] == "spare"  # use accounts before ask-first ones
    assert "mate" not in [a["name"] for a in st["accounts"]]
    assert json.loads(status("main,spare"))["recommended"] == "shared"
    assert json.loads(status("main,spare,shared"))["recommended"] is None
    text = status("main,spare", fmt=())
    assert "main is blocked" in text and "Recommended target: shared (ask-first)" in text
