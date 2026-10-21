import json
import os

from conftest import run

TS = "2026-10-21T10:00:00.000Z"


def user(text, cwd="/work/proj"):
    return {"type": "user", "cwd": cwd, "gitBranch": "feat/x", "timestamp": TS,
            "message": {"role": "user", "content": text}}


def edit(path, n=1, cwd="/work/proj"):
    return {"type": "assistant", "cwd": cwd, "timestamp": TS, "message": {
        "id": f"m{path}{n}{cwd}", "role": "assistant", "model": "claude-haiku-4-5",
        "usage": {"input_tokens": 10, "output_tokens": 5},
        "content": [{"type": "tool_use", "id": f"t{path}{n}", "name": "Edit", "input": {"file_path": path}}]}}


USAGE = {"type": "assistant", "cwd": "/work/proj", "timestamp": TS, "message": {
    "id": "pad", "role": "assistant", "model": "claude-haiku-4-5", "usage": {"input_tokens": 1, "output_tokens": 1},
    "content": [{"type": "text", "text": "ok"}]}}


def session(hub, sid, events, account="main"):
    p = hub[1] / account / "claude-home" / ".claude" / "projects" / "-work-proj" / f"{sid}.jsonl"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text("".join(json.dumps(e, separators=(",", ":")) + "\n" for e in events + [USAGE]))  # real transcripts are compact


def titles_env(hub, tmp_path, reply="Fix session titles"):
    stub = tmp_path / "title-cmd"
    stub.write_text(f"#!/bin/sh\ncat > {tmp_path}/last-input\necho '{reply}' >> {tmp_path}/calls\necho '{reply}'\n")
    stub.chmod(0o755)
    return {"CROW_TITLE_CMD": str(stub), "CROW_TITLES_OFF": "1"}


def sessions(hub, env):
    r = run(hub, "crow-usage", "--json", env=env)
    assert r.returncode == 0, r.stderr
    return {s["id"]: s for s in json.loads(r.stdout)["sessions"]}


def stored(hub):
    return json.loads((hub[0] / "local/state/session-titles.json").read_text())


def test_fallback_names_project_and_main_files(hub, tmp_path):
    session(hub, "a", [user("quick question about tests"), edit("/w/bin/crow-usage"), edit("/w/bin/crow-usage", 2),
                       edit("/w/tests/t.py")])
    s = sessions(hub, titles_env(hub, tmp_path))["a"]
    assert s["title"] == "proj: crow-usage, t.py"


def test_fallback_without_edits_uses_first_prompt(hub, tmp_path):
    session(hub, "a", [user("explain the retry logic"), user("again")])
    assert sessions(hub, titles_env(hub, tmp_path))["a"]["title"] == "proj: explain the retry logic"


def test_context_weights_main_work_over_opening_prompt(hub, tmp_path):
    env = titles_env(hub, tmp_path)
    ev = [user("rename a variable")] + [edit("/w/bin/crow-usage", i) for i in range(3)] + \
         [user(f"next step {i}") for i in range(5)]
    session(hub, "a", ev)
    sessions(hub, env)
    assert run(hub, "crow-usage", "--titles", env=env).returncode == 0
    sent = (tmp_path / "last-input").read_text()
    assert "Most edited files: crow-usage (3)" in sent
    assert "Opening prompt (may be a side errand): rename a variable" in sent
    assert "Recent prompt 4: next step 4" in sent and "next step 0" not in sent
    assert sessions(hub, env)["a"]["title"] == "Fix session titles"


def test_retitle_only_after_growth_and_dispatch_label_kept(hub, tmp_path):
    env = titles_env(hub, tmp_path)
    session(hub, "a", [user(f"p{i}") for i in range(4)])
    session(hub, "d", [user(f"p{i}") for i in range(4)])
    sessions(hub, env)
    t = stored(hub)
    t["d"] = {"title": "night: ship thing", "source": "dispatch", "prompts": 10 ** 6}
    (hub[0] / "local/state/session-titles.json").write_text(json.dumps(t))
    run(hub, "crow-usage", "--titles", env=env)
    calls = lambda: len((tmp_path / "calls").read_text().split("\n")) - 1
    assert calls() == 1  # session a only
    session(hub, "a", [user(f"p{i}") for i in range(6)])
    session(hub, "d", [user(f"p{i}") for i in range(20)])
    sessions(hub, env)
    run(hub, "crow-usage", "--titles", env=env)
    assert calls() == 1  # +2 prompts: not due, dispatch label never due
    session(hub, "a", [user(f"p{i}") for i in range(8)])
    sessions(hub, env)
    run(hub, "crow-usage", "--titles", env=env)
    assert calls() == 2
    assert sessions(hub, env)["d"]["title"] == "night: ship thing"


def test_daily_budget_caps_model_calls(hub, tmp_path):
    env = {**titles_env(hub, tmp_path), "CROW_TITLES_PER_DAY": "2"}
    for i in range(4):
        session(hub, f"s{i}", [user("work")])
    sessions(hub, env)
    run(hub, "crow-usage", "--titles", env=env)
    assert len((tmp_path / "calls").read_text().split("\n")) - 1 == 2
    run(hub, "crow-usage", "--titles", env=env)
    assert len((tmp_path / "calls").read_text().split("\n")) - 1 == 2
    assert sum(1 for k, v in stored(hub).items() if not k.startswith("_") and v["source"] == "haiku") == 2
