"""crow-runs summarize_tool: a tool call's own description wins over its raw command."""
import importlib.machinery
import importlib.util
import json

import pytest
from conftest import BIN


@pytest.fixture
def cr(tmp_path, monkeypatch):
    (tmp_path / "local").mkdir()
    (tmp_path / "local" / "projects.yaml").write_text("projects: {}\n")
    monkeypatch.setenv("CROW_HOME", str(tmp_path))
    monkeypatch.setenv("CROW_ACCOUNT", "main")
    loader = importlib.machinery.SourceFileLoader("crow_runs", str(BIN / "crow-runs"))
    spec = importlib.util.spec_from_loader("crow_runs", loader)
    mod = importlib.util.module_from_spec(spec)
    loader.exec_module(mod)
    return mod


def test_bash_description_wins(cr):
    inp = {"command": "cd /home/me/Projects/hub && git status", "description": "Show working tree status"}
    assert cr.summarize_tool("Bash", inp) == "Bash: Show working tree status"


def test_bare_command_is_shortened(cr):
    inp = {"command": "cd /home/me/Projects/hub/local; python3 /home/me/Projects/hub/bin/crow-usage --json\nmore"}
    assert cr.summarize_tool("Bash", inp) == "Bash: python3 …/crow-usage --json"


def test_other_tools_unchanged(cr):
    assert cr.summarize_tool("Edit", {"file_path": "/a/b.go"}) == "Edit: /a/b.go"
    assert cr.summarize_tool("Agent", {"description": "Find callers", "prompt": "long"}) == "Agent: Find callers"
    assert cr.summarize_tool("TodoWrite", {}) == "TodoWrite"


def _proc(root, pid, argv, exe, env="HOME=/h\0CDX_SESSION_NAME=acct\0"):
    d = root / str(pid)
    d.mkdir()
    (d / "cmdline").write_bytes("\0".join(argv).encode() + b"\0")
    (d / "environ").write_bytes(env.encode())
    (d / "exe").symlink_to(exe)
    (d / "cwd").symlink_to("/tmp")


def test_agent_procs_match_claude_and_codex(cr, tmp_path):
    _proc(tmp_path, 11, ["claude", "-p", "x"], "/usr/bin/claude")
    _proc(tmp_path, 12, ["/opt/codex", "exec", "x"], "/opt/codex")
    _proc(tmp_path, 13, ["python3", "x"], "/usr/bin/python3")
    got = {p["pid"]: p for p in cr.agent_procs(str(tmp_path))}
    assert {k: v["provider"] for k, v in got.items()} == {11: "claude", 12: "codex"}
    assert got[12]["account"] == "acct"


def test_is_headless_covers_p_print_and_exec(cr):
    assert cr.is_headless(["claude", "-p", "x"])
    assert cr.is_headless(["claude", "--print"])
    assert cr.is_headless(["codex", "exec", "x"])
    assert not cr.is_headless(["claude", "--resume", "id"])


def test_running_runs_come_from_cdx_running(cr, monkeypatch):
    calls = []

    def fake(*a, **k):
        calls.append(a)
        return '{"runs": [{"run_id": "a", "cwd": "/x"}]}'
    monkeypatch.setattr(cr, "sh", fake)
    assert [r["run_id"] for r in cr.running_runs()] == ["a"]
    assert calls == [("cdx", "runs", "--running", "--json")]


def test_report_prefers_the_final_message_from_cdx(cr, monkeypatch, tmp_path):
    out = tmp_path / "o.log"
    out.write_text("")
    row = {"run_id": "abc123", "ended_at": "t", "provider": "codex", "artifacts": {"stdout_path": str(out)}}
    monkeypatch.setattr(cr, "finished", lambda since: {"abc123": row})
    monkeypatch.setattr(cr, "sh", lambda *a, **k: '{"report": {"final_message": "Shipped: from cdx"}}')
    assert cr.report("abc") == "Shipped: from cdx"


def test_running_runs_fails_when_cdx_does(cr, monkeypatch):
    monkeypatch.setattr(cr, "sh", lambda *a, **k: "")
    with pytest.raises(SystemExit):
        cr.running_runs()


def test_final_command_reads_both_providers(tmp_path):
    import subprocess
    import sys

    from conftest import BIN, FIXTURES
    (tmp_path / "local").mkdir()
    (tmp_path / "local" / "projects.yaml").write_text("projects: []\n")
    for name, provider, want in (("run-claude.jsonl", "claude", "Shipped: claude report"),
                                 ("run-codex.jsonl", "codex", "Shipped: codex report")):
        out = subprocess.run([sys.executable, str(BIN / "crow-runs"), "final", str(FIXTURES / name), provider], check=False,
                             capture_output=True, text=True,
                             env={"CROW_HOME": str(tmp_path), "CROW_ACCOUNT": "main", "PATH": "/usr/bin:/bin"})
        assert out.stdout.strip() == want, out.stderr


def test_final_accepts_a_run_id(cr, monkeypatch):
    from conftest import FIXTURES
    row = {"run_id": "abc123", "provider": "codex", "artifacts": {"stdout_path": str(FIXTURES / "run-codex.jsonl")}}
    monkeypatch.setattr(cr, "finished_rows", lambda since: {"abc123": row})
    assert cr.final_of("abc") == "Shipped: codex report"


def test_final_refuses_an_unknown_id(cr, monkeypatch):
    monkeypatch.setattr(cr, "finished_rows", lambda since: {})
    with pytest.raises(SystemExit):
        cr.final_of("nope")


@pytest.mark.parametrize("ids", [[""], ["  "], ["abc", ""]])
def test_wait_refuses_an_empty_id(cr, monkeypatch, ids):
    cr.STATE.mkdir(parents=True, exist_ok=True)
    cr.LEDGER.write_text('{"run_id": "first", "project": "p", "label": "l"}\n')
    monkeypatch.setattr(cr, "finished", lambda since, ttl=8: pytest.fail("polled with an empty id"))
    monkeypatch.setattr(cr, "running_runs", lambda: pytest.fail("polled with an empty id"))
    with pytest.raises(SystemExit):
        cr.wait(ids, poll=0)
    with pytest.raises(SystemExit):
        cr.notify(ids, poll=0)


def test_list_marks_a_run_whose_worktree_is_gone(cr, monkeypatch, tmp_path):
    from datetime import datetime
    now = datetime.now().astimezone().isoformat(timespec="seconds")
    gone = str(tmp_path / "repo.wt" / "removed")
    cr.STATE.mkdir(parents=True, exist_ok=True)
    cr.LEDGER.write_text(json.dumps({"run_id": "r1", "project": "p", "label": "l", "cwd": gone,
                                     "started_at": now, "start_sha": "abc"}) + "\n")
    row = {"run_id": "r1", "ended_at": now, "exit_code": 0, "cwd": gone, "duration_seconds": 5}
    monkeypatch.setattr(cr, "finished_rows", lambda since, ttl=8: {"r1": row, "r2": {**row, "run_id": "r2"}})
    monkeypatch.setattr(cr, "running_runs", list)
    monkeypatch.setattr(cr, "agent_procs", lambda proc="/proc": [])
    data = cr.collect("today", include_unledgered=True)
    assert [f["worktree_removed"] for f in data["finished"]] == [True, True]
    assert "worktree removed" in "\n".join(cr.render(data, color=False))


REG = {"projects": [{"name": "acme-platform-lambda", "path": "/x/lambda", "scope": "work"},
                    {"name": "demo-shell", "path": "/x/shell", "scope": "personal", "aliases": ["shell"]}]}


@pytest.mark.parametrize(("typo", "hint"), [("lambda", "acme-platform-lambda"), ("demo-shel", "demo-shell"),
                                            ("hbu", "hub")])
def test_unknown_project_suggests_the_closest_name(cr, monkeypatch, typo, hint):
    monkeypatch.setattr(cr, "REG", REG)
    with pytest.raises(SystemExit) as e:
        cr.project(typo)
    assert f"did you mean '{hint}'" in str(e.value.code)


def test_alias_and_hub_resolve(cr, monkeypatch):
    monkeypatch.setattr(cr, "REG", REG)
    assert cr.project("shell")["name"] == "demo-shell"
    assert cr.project("hub") == {"name": "hub", "path": str(cr.HOME), "scope": "personal"}
    hub = {"name": "my-hub", "path": str(cr.HOME), "scope": "personal"}
    monkeypatch.setattr(cr, "REG", {"projects": [*REG["projects"], hub]})
    assert cr.project("hub") is hub


def test_dispatch_hub_runs_in_the_hub(cr, monkeypatch, capsys):
    import argparse
    import subprocess
    monkeypatch.setattr(cr, "REG", REG)
    monkeypatch.setattr(cr, "pick_account", lambda a: "main")
    monkeypatch.setattr(cr, "running_runs", list)
    monkeypatch.setattr(cr.crow_lib, "provider_of", lambda acct, status=None: "claude")
    monkeypatch.setattr(subprocess, "run", lambda *a, **k: subprocess.CompletedProcess(a, 0))
    a = argparse.Namespace(project="hub", label="t", prompt="do it", prompt_file=None, kind="task", power=None,
                           model=None, budget=None, context="day", dry_run=True, permission=None, force=False,
                           logics=None, resumes=None, cwd=None, account=None, isolate=False, continue_run=None,
                           write_dir=None, mission=None, end_state=None, timeout_min=None, json=False)
    cr.dispatch(a)
    cmd = capsys.readouterr().out.split()
    assert cmd[cmd.index("--cwd") + 1] == str(cr.HOME)
    assert cmd[cmd.index("--label") + 1] == "hub/t"


def _codex_log(path, *texts):
    lines = [{"type": "item.completed", "item": {"id": f"i{n}", "type": "agent_message", "text": t}}
             for n, t in enumerate(texts)]
    path.write_text("\n".join(json.dumps(x) for x in lines) + "\n")


@pytest.mark.parametrize(("texts", "want"), [
    (("Shipped:\n- a\n- b\nLeft: none", "Done."), "Shipped:\n- a\n- b\nLeft: none"),
    (("Report\n- a\n- b", "All set."), "Report\n- a\n- b"),
    (("one line",), "one line"),
])
def test_codex_report_skips_a_one_line_postscript(cr, monkeypatch, tmp_path, texts, want):
    out = tmp_path / "o.log"
    _codex_log(out, *texts)
    row = {"run_id": "abc123", "ended_at": "t", "provider": "codex", "artifacts": {"stdout_path": str(out)}}
    monkeypatch.setattr(cr, "finished", lambda since: {"abc123": row})
    monkeypatch.setattr(cr, "sh", lambda *a, **k: json.dumps({"report": {"final_message": texts[-1]}}))
    monkeypatch.setattr(cr, "mark_seen", lambda *a: None)
    assert cr.report("abc") == want
