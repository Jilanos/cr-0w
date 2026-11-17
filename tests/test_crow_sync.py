"""Exercise fork sync against local repositories without contacting a forge."""
import subprocess

import pytest
from conftest import BIN


def git(cwd, *args):
    return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True).stdout.strip()


def commit(cwd, name, text):
    (cwd / name).write_text(text)
    git(cwd, "add", name)
    git(cwd, "commit", "-m", "chg[TXT]: update fixture")


@pytest.fixture
def repos(tmp_path, monkeypatch):
    monkeypatch.setenv("GIT_AUTHOR_NAME", "Developer")
    monkeypatch.setenv("GIT_COMMITTER_NAME", "Developer")
    monkeypatch.setenv("GIT_AUTHOR_EMAIL", "dev@example.invalid")
    monkeypatch.setenv("GIT_COMMITTER_EMAIL", "dev@example.invalid")
    upstream, fork, seed, work = [tmp_path / p for p in ("upstream.git", "fork.git", "seed", "work")]
    git(tmp_path, "init", "--bare", str(upstream))
    git(tmp_path, "init", "--bare", str(fork))
    git(tmp_path, "init", "-b", "main", str(seed))
    commit(seed, "shared.txt", "base\n")
    git(seed, "remote", "add", "origin", str(upstream))
    git(seed, "push", "origin", "main")
    git(tmp_path, "clone", "--branch", "main", str(upstream), str(work))
    git(work, "switch", "-c", "personal")
    git(work, "remote", "add", "fork", str(fork))
    return seed, work, upstream, fork


def sync(work, *args, script=None):
    return subprocess.run([str(script or BIN / "crow-sync"), "--branch", "personal", *args],
                          check=False, cwd=work, capture_output=True, text=True)


def test_merge_upstream_without_pushing(repos):
    seed, work, upstream, fork = repos
    commit(work, "personal.txt", "personal\n")
    commit(seed, "upstream.txt", "new\n")
    git(seed, "push", "origin", "main")
    result = sync(work)
    assert result.returncode == 0, result.stderr
    assert (work / "upstream.txt").read_text() == "new\n"
    assert (work / "personal.txt").read_text() == "personal\n"
    assert len(git(work, "rev-list", "--parents", "-n", "1", "HEAD").split()) == 3
    assert git(upstream, "rev-parse", "main") == git(seed, "rev-parse", "HEAD")
    assert git(fork, "for-each-ref") == ""


def test_conflict_lists_files_and_leaves_merge_recoverable(repos):
    seed, work, _upstream, fork = repos
    commit(work, "shared.txt", "personal edit\n")
    commit(seed, "shared.txt", "upstream edit\n")
    git(seed, "push", "origin", "main")
    result = sync(work, "--push")
    assert result.returncode == 1
    assert "shared.txt" in result.stderr and "git merge --abort" in result.stderr
    assert git(work, "diff", "--name-only", "--diff-filter=U") == "shared.txt"
    assert git(fork, "for-each-ref") == ""
    git(work, "merge", "--abort")
    assert git(work, "status", "--porcelain") == ""


@pytest.mark.parametrize("state", ["dirty", "untracked", "wrong-branch", "detached"])
def test_refuses_unsafe_checkout(repos, state):
    _seed, work, _upstream, fork = repos
    if state == "dirty":
        (work / "shared.txt").write_text("uncommitted\n")
    elif state == "untracked":
        (work / "new.txt").write_text("untracked\n")
    elif state == "wrong-branch":
        git(work, "switch", "main")
    else:
        git(work, "switch", "--detach")
    before = git(work, "rev-parse", "HEAD")
    result = sync(work, "--push")
    assert result.returncode == 1
    assert git(work, "rev-parse", "HEAD") == before
    assert git(fork, "for-each-ref") == ""


@pytest.mark.parametrize("fork_url", ["https://example.invalid/team/repo.git", "git@example.invalid:team/repo.git"])
def test_rejects_upstream_push_alias_before_fetch(repos, fork_url):
    _seed, work, _upstream, _fork = repos
    git(work, "remote", "set-url", "origin", "https://example.invalid/team/repo.git")
    git(work, "remote", "set-url", "--push", "fork", fork_url)
    result = sync(work, "--push")
    assert result.returncode == 1
    assert "fork push URL points to upstream" in result.stderr


def test_push_checks_then_updates_only_fork(repos, tmp_path):
    _seed, work, upstream, fork = repos
    before = git(upstream, "rev-parse", "main")
    commit(work, "personal.txt", "personal\n")
    # A fixture checker records the required gate and can refuse a push.
    tools = tmp_path / "tools"
    tools.mkdir()
    script = tools / "crow-sync"
    script.write_bytes((BIN / "crow-sync").read_bytes())
    script.chmod(0o755)
    checker = tools / "crow-prepush-check"
    checker.write_text('#!/bin/sh\n[ "$1" = "--check" ] || exit 2\nexit 1\n')
    checker.chmod(0o755)
    assert sync(work, "--push", script=script).returncode == 1
    assert git(fork, "for-each-ref") == ""
    checker.write_text('#!/bin/sh\n[ "$1" = "--check" ] || exit 2\nexit 0\n')
    result = sync(work, "--push", script=script)
    assert result.returncode == 0, result.stderr
    assert git(fork, "rev-parse", "personal") == git(work, "rev-parse", "HEAD")
    assert git(work, "rev-parse", "--abbrev-ref", "@{upstream}") == "fork/personal"
    assert git(upstream, "rev-parse", "main") == before
