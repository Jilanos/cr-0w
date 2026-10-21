import os
import subprocess

from conftest import BIN


def _repo(path):
    path.mkdir()
    subprocess.run(["git", "init", "-q", str(path)], check=True)
    return path


def _preflight(home, repo):
    env = dict(os.environ, CROW_HOME=str(home))
    return subprocess.run([str(BIN / "crow-night-preflight"), str(repo)],
                          capture_output=True, text=True, env=env).stdout


def _registry(home, repo, scope):
    (home / "local").mkdir(parents=True)
    (home / "local" / "projects.yaml").write_text(
        f"projects:\n  - name: x\n    scope: {scope}\n    path: {repo}\n    forge: none\n")


def test_work_repo_skips_history_audit(tmp_path):
    repo = _repo(tmp_path / "my repo")
    _registry(tmp_path / "hub", repo, "work")
    assert "history audit skipped: registry scope is work" in _preflight(tmp_path / "hub", repo)


def test_personal_repo_keeps_history_audit(tmp_path):
    repo = _repo(tmp_path / "repo")
    _registry(tmp_path / "hub", repo, "personal")
    out = _preflight(tmp_path / "hub", repo)
    assert "history audit skipped" not in out
    assert "pushed history" in out
