"""item_229: crow dispatch --cwd runs in a project worktree only; --model lands in the run record."""
import argparse
import importlib.machinery
import importlib.util
import json
import subprocess

import pytest
from conftest import BIN


@pytest.fixture
def cr(tmp_path, monkeypatch):
    (tmp_path / "local").mkdir()
    (tmp_path / "local" / "projects.yaml").write_text("projects: {}\n")
    monkeypatch.setenv("CROW_HOME", str(tmp_path))
    monkeypatch.setenv("CROW_ACCOUNT", "main")
    loader = importlib.machinery.SourceFileLoader("crow_runs_cwd", str(BIN / "crow-runs"))
    spec = importlib.util.spec_from_loader("crow_runs_cwd", loader)
    mod = importlib.util.module_from_spec(spec)
    loader.exec_module(mod)
    repo = tmp_path / "repo"
    (tmp_path / "repo.wt" / "x").mkdir(parents=True)
    (tmp_path / "elsewhere").mkdir()
    repo.mkdir()
    monkeypatch.setattr(mod, "project", lambda name: {"name": "repo", "path": str(repo)})
    monkeypatch.setattr(mod, "pick_account", lambda a: "main")
    monkeypatch.setattr(mod, "running_runs", list)
    monkeypatch.setattr(mod.crow_lib, "provider_of", lambda acct, status=None: "claude")
    return mod


def _args(**kw):
    base = {"project": "repo", "label": "t", "prompt": "go", "prompt_file": None, "kind": "task", "power": None,
            "model": None, "budget": None, "context": "day", "dry_run": True, "permission": None, "force": False,
            "logics": None, "resumes": None, "cwd": None, "account": None, "isolate": False, "continue_run": None,
            "write_dir": None, "mission": None, "end_state": None, "timeout_min": None, "json": False}
    return argparse.Namespace(**{**base, **kw})


def test_cwd_in_a_project_worktree_runs_there(cr, tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(subprocess, "run", lambda *a, **k: subprocess.CompletedProcess(a, 0))
    cr.dispatch(_args(cwd=str(tmp_path / "repo.wt" / "x")))
    cmd = capsys.readouterr().out.split()
    assert cmd[cmd.index("--cwd") + 1] == str((tmp_path / "repo.wt" / "x").resolve())


@pytest.mark.parametrize("where", ["elsewhere", "repo.wt/missing", "repo"])
def test_cwd_outside_the_worktrees_is_refused(cr, tmp_path, monkeypatch, where):
    monkeypatch.setattr(subprocess, "run", lambda *a, **k: subprocess.CompletedProcess(a, 0))
    with pytest.raises(SystemExit) as e:
        cr.dispatch(_args(cwd=str(tmp_path / where)))
    assert "worktree under" in str(e.value)


def test_model_shows_in_the_run_record(cr, tmp_path, monkeypatch):
    def fake_run(cmd, *a, **k):
        out = json.dumps({"ok": True, "run_id": "r" * 32}) if cmd[:2] == ["cdx", "run"] else ""
        return subprocess.CompletedProcess(cmd, 0, stdout=out, stderr="")
    monkeypatch.setattr(subprocess, "run", fake_run)
    monkeypatch.setattr(subprocess, "Popen", lambda *a, **k: None)
    monkeypatch.setattr(cr, "record_run", lambda rec, state: None)
    monkeypatch.setattr(cr, "keep_prompt", lambda run_id, a: None)
    wt = tmp_path / "repo.wt" / "x"
    cr.dispatch(_args(dry_run=False, cwd=str(wt), model="sonnet"))
    rec = json.loads(cr.LEDGER.read_text().splitlines()[-1])
    assert rec["model"] == "sonnet"
    assert "sonnet" in rec["model_id"]
    assert rec["cwd"] == str(wt.resolve())
