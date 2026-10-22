"""crow-relaunch against a fake cdx on PATH: no real handoff is ever started."""
import json
import os
import pty
import subprocess

import pytest

from conftest import BIN, mixed, run, write_jsonl
from test_crow_sessions import LIMIT, reply, transcript, user

@pytest.fixture
def cdx(fake_cdx):
    env, calls, _ = fake_cdx
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
    """Handoff preparations (cdx handoff ... --json)."""
    return [c for c in cdx[1]() if c["argv"][0] == "handoff"]


def launches(cdx):
    """Provider launches: `cdx <account> --dir ...` and `cdx resume <account>`."""
    return [c for c in cdx[1]() if c["argv"][0] == "resume" or (len(c["argv"]) > 1 and c["argv"][1] == "--dir")]


def records(hub):
    f = hub[0] / "local" / "state" / "relaunches.jsonl"
    return [json.loads(l) for l in f.read_text().splitlines()] if f.exists() else []


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
    # same account: only an exact native resume, never cdx's fallback to the last conversation
    assert "cannot resume abc-123 exactly" in relaunch(hub, cdx, "abc", "main", "--yes").stderr
    assert handoffs(cdx) == [] and launches(cdx) == []


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
    assert "cdx handoff main shared --source-native-transcript" in r.stdout and "account-transfer" not in r.stdout
    assert "transfer to another claude account" in r.stdout
    assert "nothing launched or prepared" in r.stdout
    assert handoffs(cdx) == [] and launches(cdx) == []
    assert not (hub[0] / "local" / "state" / "relaunches.jsonl").exists()


def test_use_account_prepares_checks_then_launches_from_the_workspace(hub, cdx, session):
    r = relaunch(hub, cdx, "abc", "spare", "--yes", "--here")
    assert r.returncode == 0, r.stderr
    (h,) = handoffs(cdx)
    assert h["argv"][:4] == ["handoff", "main", "spare", "--source-native-transcript"]
    assert h["argv"][4].endswith("abc-123.jsonl") and h["cwd"] == session
    (l,) = launches(cdx)
    assert l["argv"][:4] == ["spare", "--dir", session, "--prompt"] and "Recover work" in l["argv"][4]
    assert l["cwd"] == session and l["account"] == "spare"
    prepared, launched = records(hub)
    assert (prepared["status"], launched["status"]) == ("prepared", "launched")
    assert (launched["conversation_id"], launched["source"], launched["target"]) == ("abc-123", "main", "spare")
    assert launched["source_provider"] == launched["target_provider"] == "claude"
    assert launched["mode"] == "account-transfer" and launched["transcript"].endswith("abc-123.jsonl")
    out = run(hub, "crow-sessions", "list").stdout
    assert "0 interrupted session(s), 1 already relaunched" in out


def test_failed_launch_leaves_the_session_interrupted(hub, cdx, session):
    r = relaunch(hub, cdx, "abc", "spare", "--yes", "--here", extra={"FAKE_CDX_LAUNCH_RC": "1"})
    assert r.returncode == 1
    assert [x["status"] for x in records(hub)] == ["prepared", "failed"]
    assert "1 interrupted session(s)" in run(hub, "crow-sessions", "list").stdout


@pytest.mark.parametrize("mode,needle", [("mismatch", "does not match what was confirmed"),
                                         ("unresolved", "could not prepare the handoff")])
def test_bad_preparation_launches_nothing(hub, cdx, session, mode, needle):
    r = relaunch(hub, cdx, "abc", "spare", "--yes", "--here", extra={"FAKE_CDX_HANDOFF": mode})
    assert r.returncode == 1 and needle in r.stderr and "nothing launched" in r.stderr
    assert launches(cdx) == [] and records(hub) == []


def test_changed_or_deleted_source_is_refused(hub, cdx, session):
    path = hub[1] / "main/claude-home/.claude/projects/-work-proj/abc-123.jsonl"
    reg = json.loads(run(hub, "crow-sessions", "scan", "--json").stdout)
    assert reg["sessions"]
    path.unlink()
    r = relaunch(hub, cdx, "abc-123", "spare", "--yes", "--here")
    assert r.returncode == 1 and "matches 0 transcripts" in r.stderr
    assert launches(cdx) == []


def test_default_opens_a_new_kitty_window(hub, cdx, session, tmp_path):
    d = tmp_path / "winbin"
    d.mkdir()
    log = tmp_path / "setsid.log"
    (d / "setsid").write_text('#!/bin/sh\necho "$@" >> "$SETSID_LOG"\n')
    (d / "setsid").chmod(0o755)
    r = relaunch(hub, cdx, "abc", "spare", "--yes",
                 extra={"PATH": f"{d}:{cdx[0]['PATH']}", "SETSID_LOG": str(log), "CDX_SESSION_NAME": "x"})
    assert r.returncode == 0, r.stderr
    line = log.read_text().split()
    assert line[:4] == ["-f", "kitty", "--title", "crow"] and f"{session}" in line
    assert line[-2] == "_run" and line[-1].endswith(".json")
    assert launches(cdx) == []  # the launch runs inside the window, not here
    assert [x["status"] for x in records(hub)] == ["prepared"]
    # the window runner launches the prepared entry from the workspace
    r = relaunch(hub, cdx, "_run", line[-1])
    assert r.returncode == 0, r.stderr
    (l,) = launches(cdx)
    assert l["cwd"] == session and l["account"] == "spare"
    assert [x["status"] for x in records(hub)] == ["prepared", "launched"]


def test_native_resume_only_for_the_exact_conversation(hub, cdx, session):
    r = relaunch(hub, cdx, "abc", "main", "--yes", "--here", extra={"FAKE_CDX_RESUME_ID": "abc-123"})
    assert r.returncode == 0, r.stderr
    (l,) = launches(cdx)
    assert l["argv"] == ["resume", "main", "--dir", session] and handoffs(cdx) == []
    assert records(hub)[-1]["mode"] == "native-resume"


def test_cross_provider_transfer_both_ways(hub, cdx, tmp_path):
    mixed(hub)
    ws = tmp_path / "ws"
    ws.mkdir()
    wsr = str(ws.resolve())
    transcript(hub, "main", "abc-123", [user("ship it"), LIMIT], cwd=wsr)
    r = relaunch(hub, cdx, "abc-123", "cx", "--yes", "--here")
    assert r.returncode == 0, r.stderr
    assert "cross-provider transfer claude → codex" in r.stdout
    assert launches(cdx)[-1]["argv"][:3] == ["cx", "--dir", wsr]
    sid = "01a1-cx-1"
    write_jsonl(hub[1] / "cx/sessions/2026/10/22" / f"rollout-x-{sid}.jsonl", [
        {"timestamp": "2026-10-22T10:00:00Z", "type": "session_meta", "payload": {"id": sid, "cwd": wsr}},
        {"timestamp": "2026-10-22T10:00:00Z", "type": "event_msg", "payload": {"type": "user_message", "message": "go"}},
        {"timestamp": "2026-10-22T10:01:00Z", "type": "event_msg",
         "payload": {"type": "error", "message": "You've hit your usage limit."}}])
    r = relaunch(hub, cdx, sid, "spare", "--yes", "--here")
    assert r.returncode == 0, r.stderr
    assert "cross-provider transfer codex → claude" in r.stdout
    h = handoffs(cdx)[-1]
    assert h["argv"][:3] == ["handoff", "cx", "spare"] and h["argv"][4].endswith(f"{sid}.jsonl")
    rec = records(hub)[-1]
    assert (rec["source_provider"], rec["target_provider"], rec["status"]) == ("codex", "claude", "launched")


def test_same_id_under_two_accounts_needs_the_source(hub, cdx, session):
    transcript(hub, "spare", "abc-123", [user("other"), LIMIT], cwd=session)
    r = relaunch(hub, cdx, "abc-123", "shared", "--dry-run")
    assert r.returncode == 1 and "--source ACCOUNT" in r.stderr
    r = relaunch(hub, cdx, "abc-123", "shared", "--dry-run", "--source", "spare")
    assert r.returncode == 0 and "claude:spare:abc-123" in r.stdout, r.stderr


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
    code, out = on_tty(hub, cdx, "yes", "abc", "shared", "--here")
    assert code == 0, out
    (h,) = handoffs(cdx)
    assert h["argv"][:3] == ["handoff", "main", "shared"]
    consent = json.loads((hub[0] / "local/state/consents.jsonl").read_text().splitlines()[-1])
    assert (consent["account"], consent["action"], consent["how"]) == ("shared", "relaunch", "typed")


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
