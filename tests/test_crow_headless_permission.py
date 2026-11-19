"""item_229: headless permission from local/headless.json; no file keeps the default mode."""
import json
import shutil
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "bin"))
import crow_lib

ROOT = Path(__file__).resolve().parent.parent


def _home(tmp_path, body=None):
    (tmp_path / "local").mkdir(exist_ok=True)
    if body is not None:
        (tmp_path / "local" / "headless.json").write_text(body)
    return {"CROW_HOME": str(tmp_path)}


def test_absent_file_keeps_default(tmp_path):
    assert crow_lib.permission("claude", _home(tmp_path)) == "default"
    assert crow_lib.permission("codex", _home(tmp_path)) == "default"


def test_missing_key_keeps_default(tmp_path):
    assert crow_lib.permission("claude", _home(tmp_path, "{}")) == "default"


def test_full_applies_to_both_providers(tmp_path):
    env = _home(tmp_path, json.dumps({"permission": "full"}))
    assert crow_lib.permission("claude", env) == "full"
    assert crow_lib.permission("codex", env) == "full"


def test_example_file_is_the_default(tmp_path):
    env = _home(tmp_path)
    shutil.copy(ROOT / "examples" / "headless.json", tmp_path / "local" / "headless.json")
    assert crow_lib.permission("claude", env) == "default"


@pytest.mark.parametrize("body", ['{"permission": "bypass"}', "not json", "[1]"])
def test_bad_file_stops_the_launch(tmp_path, body):
    with pytest.raises(SystemExit) as e:
        crow_lib.permission("claude", _home(tmp_path, body))
    assert "headless.json" in str(e.value)


def test_dispatch_passes_the_configured_permission(tmp_path, monkeypatch, capsys):
    """crow dispatch --dry-run shows the cdx --permission taken from local/headless.json."""
    import argparse
    import importlib.machinery
    import importlib.util
    import subprocess
    loader = importlib.machinery.SourceFileLoader("crow_runs_perm", str(ROOT / "bin" / "crow-runs"))
    spec = importlib.util.spec_from_loader("crow_runs_perm", loader)
    cr = importlib.util.module_from_spec(spec)
    loader.exec_module(cr)
    _home(tmp_path, json.dumps({"permission": "full"}))
    monkeypatch.setenv("CROW_HOME", str(tmp_path))
    repo = tmp_path / "repo"
    repo.mkdir()
    monkeypatch.setattr(cr, "project", lambda name: {"name": "x", "path": str(repo)})
    monkeypatch.setattr(cr, "STATE", tmp_path / "state")
    monkeypatch.setattr(cr, "pick_account", lambda a: "main")
    monkeypatch.setattr(cr, "running_runs", list)
    monkeypatch.setattr(cr.crow_lib, "provider_of", lambda acct, status=None: "codex")
    monkeypatch.setattr(subprocess, "run", lambda *a, **k: subprocess.CompletedProcess(a, 0))
    a = argparse.Namespace(project="x", label="t", prompt="go", prompt_file=None, kind="task", power=None,
                           model=None, budget=None, context="day", dry_run=True, permission=None, force=False,
                           logics=None, resumes=None, cwd=None, account=None, isolate=False, continue_run=None,
                           write_dir=None, mission=None, end_state=None, timeout_min=None, json=False)
    cr.dispatch(a)
    cmd = capsys.readouterr().out.split()
    assert cmd[cmd.index("--permission") + 1] == "full"
