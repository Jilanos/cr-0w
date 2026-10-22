"""Mixed-provider activity and session registry (item 2.4): native readers, a fake /proc with one
Claude and one Codex agent, identity without collisions, incremental Codex reads."""
import importlib.machinery
import importlib.util
import json
import os
import re
import sys

import pytest

from conftest import BIN, mixed, run, write_jsonl

sys.path.insert(0, str(BIN))
import crow_native  # noqa: E402

TS = "2026-10-22T10:00:00.000Z"
SID = "01a16410-0000-7d51-8db9-000000000001"


def codex_events(cwd="/work/alpha", sid=SID, first="fix the login", limit=False):
    ev = [
        {"timestamp": TS, "type": "session_meta", "payload": {"id": sid, "cwd": cwd, "timestamp": TS, "source": "cli"}},
        {"timestamp": TS, "type": "turn_context", "payload": {"model": "gpt-6.1-sol", "cwd": cwd}},
        {"timestamp": TS, "type": "response_item", "payload": {"type": "message", "role": "user", "content": [
            {"type": "input_text", "text": "<environment_context>x</environment_context>"}]}},
        {"timestamp": TS, "type": "event_msg", "payload": {"type": "item_completed", "item": {
            "type": "UserMessage", "content": [{"type": "text", "text": first}]}}},
        {"timestamp": TS, "type": "event_msg", "payload": {"type": "task_started", "model_context_window": 475000}},
        {"timestamp": TS, "type": "response_item", "payload": {"type": "custom_tool_call", "name": "exec",
                                                              "input": "rg login src"}},
        {"timestamp": TS, "type": "response_item", "payload": {"type": "function_call", "name": "shell",
                                                              "arguments": json.dumps({"cmd": "pytest -q"})}},
        {"timestamp": TS, "type": "event_msg", "payload": {"type": "token_count", "info": {
            "total_token_usage": {"input_tokens": 900, "cached_input_tokens": 600, "output_tokens": 50,
                                  "reasoning_output_tokens": 20, "total_tokens": 950},
            "last_token_usage": {"input_tokens": 400, "cached_input_tokens": 300, "output_tokens": 20,
                                 "reasoning_output_tokens": 5, "total_tokens": 420},
            "model_context_window": 475000}}},
        {"timestamp": TS, "type": "response_item", "payload": {"type": "message", "role": "assistant", "content": [
            {"type": "output_text", "text": "Fixed it.\nDetails follow."}]}},
        {"timestamp": TS, "type": "event_msg", "payload": {"type": "task_complete", "last_agent_message": "Fixed it."}},
        {"timestamp": TS, "type": "brand_new_event", "payload": {"whatever": 1}},
    ]
    if limit:
        ev.append({"timestamp": "2026-10-22T11:00:00Z", "type": "event_msg",
                   "payload": {"type": "error", "message": "You've hit your usage limit. Try again later."}})
    return ev


def claude_events(cwd="/work/alpha", sid="abc-123"):
    return [
        {"type": "user", "sessionId": sid, "cwd": cwd, "timestamp": TS, "message": {"role": "user", "content": "fix the login"}},
        {"type": "assistant", "sessionId": sid, "cwd": cwd, "timestamp": TS, "message": {
            "role": "assistant", "usage": {"input_tokens": 10, "cache_read_input_tokens": 390},
            "content": [{"type": "tool_use", "name": "Bash", "input": {"command": "pytest -q"}}]}},
        {"type": "assistant", "sessionId": sid, "cwd": cwd, "timestamp": TS, "message": {
            "role": "assistant", "content": [{"type": "text", "text": "Fixed it.\nDetails follow."}]}},
    ]


def test_codex_and_claude_readers_give_comparable_fields(tmp_path):
    cx = tmp_path / "rollout-x.jsonl"
    write_jsonl(cx, codex_events())
    st = crow_native.read_codex(str(cx))
    info = crow_native.codex_agent_info(st)
    assert (st["native_id"], st["cwd"], st["model"]) == (SID, "/work/alpha", "gpt-6.1-sol")
    assert info["last_prompt"] == "fix the login"           # injected <environment_context> skipped
    assert info["last_action"] == "says: Fixed it." and info["waiting_evidence"]
    assert [r["action"] for r in info["recent"]] == ["exec: rg login src", "shell: pytest -q", "says: Fixed it."]
    assert info["context_tokens"] == 400 and info["subagents_active"] is None   # unknown stays None


def test_partial_trailing_line_and_unknown_events_do_not_break_reads(tmp_path):
    cx = tmp_path / "rollout-x.jsonl"
    write_jsonl(cx, codex_events()[:4])
    with cx.open("a") as fh:
        fh.write('{"timestamp": "T", "type": "response_item", "payload": {"type": "function_')
    cache = {}
    st = crow_native.read_codex(str(cx), cache)
    assert st["last_prompt"] == "fix the login" and st["recent"] == []
    with cx.open("a") as fh:
        fh.write('call", "name": "shell", "arguments": "{}"}}\n')
    st = crow_native.read_codex(str(cx), cache)
    assert [r["action"] for r in st["recent"]] == ["shell"]
    assert crow_native.read_codex(str(tmp_path / "gone.jsonl")) is None


def test_unchanged_rollout_is_not_read_again_and_growth_reads_only_the_tail(tmp_path):
    cx = tmp_path / "rollout-x.jsonl"
    write_jsonl(cx, codex_events())
    cache = {}
    crow_native.read_codex(str(cx), cache)
    first = cache[str(cx)]["read_bytes"]
    assert first == cx.stat().st_size
    cache[str(cx)]["state"]["marker"] = True        # a reread from scratch would drop this
    assert crow_native.read_codex(str(cx), cache)["marker"]
    extra = json.dumps({"timestamp": TS, "type": "response_item", "payload": {
        "type": "message", "role": "assistant", "content": [{"type": "output_text", "text": "more"}]}}) + "\n"
    with cx.open("a") as fh:
        fh.write(extra)
    st = crow_native.read_codex(str(cx), cache)
    assert st["marker"] and st["last_action"] == "says: more"
    assert cache[str(cx)]["read_bytes"] == len(extra.encode())


# ---------- live agents through a fake /proc ----------

def fake_proc(root, pid, argv, exe, cwd, env, fds=()):
    d = root / str(pid)
    (d / "fd").mkdir(parents=True)
    (d / "cmdline").write_bytes(b"\0".join(a.encode() for a in argv) + b"\0")
    (d / "environ").write_bytes(b"\0".join(f"{k}={v}".encode() for k, v in env.items()) + b"\0")
    os.symlink(exe, d / "exe")
    os.symlink(cwd, d / "cwd")
    for i, f in enumerate(fds):
        os.symlink(f, d / "fd" / str(i + 3))


@pytest.fixture
def board(hub, fake_cdx, tmp_path, monkeypatch):
    mixed(hub)
    home, profiles = hub
    work = tmp_path / "work" / "alpha"
    work.mkdir(parents=True)
    (home / "local/projects.yaml").write_text(f"projects:\n  - {{name: alpha, path: {work}}}\n")
    proc = tmp_path / "proc"
    # Claude interactive session on main
    chome = profiles / "main" / "claude-home"
    slug = re.sub(r"[^A-Za-z0-9]", "-", str(work))
    write_jsonl(chome / ".claude/projects" / slug / "abc-123.jsonl", claude_events(str(work)))
    (chome / ".claude/sessions").mkdir(parents=True)
    (chome / ".claude/sessions/101.json").write_text(json.dumps({"sessionId": "abc-123"}))
    fake_proc(proc, 101, ["claude"], "/opt/claude/versions/2/claude", str(work),
              {"HOME": str(chome), "CDX_SESSION_NAME": "main"})
    # Codex interactive session on cx: wrapper script, codex itself, a helper host
    rollout = profiles / "cx" / "sessions/2026/10/22" / f"rollout-2026-10-22T10-00-00-{SID}.jsonl"
    write_jsonl(rollout, codex_events(str(work)))
    cenv = {"HOME": "/home/u", "CODEX_HOME": str(profiles / "cx"), "CDX_SESSION_NAME": "cx"}
    fake_proc(proc, 200, ["/usr/bin/script", "-q", "-c", "codex --cd x"], "/usr/bin/script", str(work), cenv)
    fake_proc(proc, 201, ["codex", "--no-alt-screen"], "/opt/codex/bin/codex", str(work), cenv, [str(rollout)])
    fake_proc(proc, 202, ["/opt/codex/bin/codex-code-mode-host"], "/opt/codex/bin/codex-code-mode-host", str(work), cenv)
    # the same native id on another Codex account must not collide
    rollout2 = profiles / "cxshared" / "sessions/2026/10/22" / f"rollout-2026-10-22T10-00-00-{SID}.jsonl"
    write_jsonl(rollout2, codex_events(str(work)))
    cenv2 = {**cenv, "CODEX_HOME": str(profiles / "cxshared"), "CDX_SESSION_NAME": "cxshared"}
    fake_proc(proc, 301, ["codex", "exec", "--json"], "/opt/codex/bin/codex", str(work), cenv2, [str(rollout2)])

    env, _, _ = fake_cdx
    for k, v in {**env, "CROW_HOME": str(home), "CDX_PROFILES": str(profiles)}.items():
        monkeypatch.setenv(k, v)
    monkeypatch.delenv("CROW_ACCOUNT", raising=False)
    loader = importlib.machinery.SourceFileLoader("crow_runs_board", str(BIN / "crow-runs"))
    spec = importlib.util.spec_from_loader("crow_runs_board", loader)
    mod = importlib.util.module_from_spec(spec)
    loader.exec_module(mod)
    real = crow_native.procs
    monkeypatch.setattr(mod.crow_native, "procs", lambda: real(str(proc)))
    return mod


def test_one_agent_per_provider_account_and_native_id(board):
    data = board.collect()
    got = sorted((a["provider"], a["account"], a["native_id"], a["kind"]) for a in data["agents"])
    assert got == [("claude", "main", "abc-123", "session"), ("codex", "cx", SID, "session"),
                   ("codex", "cxshared", SID, "run")]
    cx = next(a for a in data["agents"] if a["account"] == "cx")
    assert cx["identity"] == f"codex:cx:{SID}" and cx["project"] == "alpha"
    assert cx["last_prompt"] == "fix the login" and cx["context_tokens"] == 400
    claude = next(a for a in data["agents"] if a["provider"] == "claude")
    assert claude["context_tokens"] == 400 and claude["last_action"] == "says: Fixed it."
    text = "\n".join(board.render(data, color=False, width=200))
    assert "codex:cx" in text and "claude:main" in text


def test_quiet_codex_session_without_turn_end_is_not_waiting(board, hub):
    rollout = next((hub[1] / "cx").rglob("rollout-*.jsonl"))
    write_jsonl(rollout, [e for e in codex_events() if (e.get("payload") or {}).get("type") != "task_complete"])
    os.utime(rollout, (1, 1))
    cx = next(a for a in board.collect()["agents"] if a["account"] == "cx")
    assert cx["state"] == "idle"


# ---------- interrupted registry ----------

def test_interrupted_codex_sessions_are_listed_with_provider_and_identity(hub):
    mixed(hub)
    root = hub[1]
    write_jsonl(root / "cx/sessions/2026/10/22/rollout-a.jsonl", codex_events(limit=True))
    write_jsonl(root / "cx/sessions/2026/10/22/rollout-b.jsonl",
                codex_events(sid="title-run", first="You name coding sessions. Reply with...", limit=True))
    write_jsonl(root / "cx/sessions/2026/10/22/rollout-c.jsonl", codex_events(sid="fine"))
    # the same id under a Claude account is another conversation
    write_jsonl(root / "main/claude-home/.claude/projects/-work-alpha" / f"{SID}.jsonl", [
        {"type": "user", "sessionId": SID, "cwd": "/work/alpha", "timestamp": TS,
         "message": {"role": "user", "content": "go"}},
        {"type": "assistant", "sessionId": SID, "cwd": "/work/alpha", "timestamp": TS, "isApiErrorMessage": True,
         "apiError": "usage_limit_reached", "message": {"role": "assistant", "content": [{"type": "text", "text": "limit"}]}}])
    reg = json.loads(run(hub, "crow-sessions", "scan", "--json").stdout)
    got = sorted((s["provider"], s["account"], s["conversation_id"]) for s in reg["sessions"])
    assert got == [("claude", "main", SID), ("codex", "cx", SID)]
    cx = next(s for s in reg["sessions"] if s["provider"] == "codex")
    assert cx["identity"] == f"codex:cx:{SID}" and cx["workspaces"] == [os.path.realpath("/work/alpha")]
    assert "usage limit" in cx["message"]
