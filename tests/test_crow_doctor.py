"""crow-doctor: identity, accounts and stale worktrees, read only."""
import json
import shutil
import subprocess

from conftest import run


def git(*args):
    subprocess.run(["git", *args], check=True, capture_output=True)


def make_repo(path, email):
    git("init", "-q", "-b", "main", str(path))
    git("-C", str(path), "config", "user.email", email)
    git("-C", str(path), "config", "user.name", "T")
    (path / "a.txt").write_text("x")
    git("-C", str(path), "add", "a.txt")
    git("-C", str(path), "commit", "-q", "-m", "first")


def registry(home, repo, identity="me@example.org"):
    (home / "local" / "projects.yaml").write_text(
        f"identities: {{work: {identity}}}\nprojects:\n"
        f"  - {{name: app, scope: work, path: {repo}, forge: none}}\n")


def checks(out):
    return {c["area"]: c for c in json.loads(out.stdout)["checks"]}


def test_doctor_flags_an_identity_mismatch(hub, tmp_path):
    home, _ = hub
    repo = tmp_path / "app"
    make_repo(repo, "other@example.org")
    registry(home, repo)
    out = run(hub, "crow-doctor", "--json")
    assert out.returncode == 1
    ident = checks(out)["identity"]
    assert ident["level"] == "fail" and "other@example.org" in ident["details"][0]


def test_doctor_passes_when_identity_matches(hub, tmp_path):
    home, _ = hub
    repo = tmp_path / "app"
    make_repo(repo, "me@example.org")
    registry(home, repo)
    out = run(hub, "crow-doctor", "--json")
    assert checks(out)["identity"]["level"] == "ok"
    assert checks(out)["worktrees"]["level"] == "ok"


def test_doctor_lists_a_merged_worktree(hub, tmp_path):
    home, _ = hub
    repo = tmp_path / "app"
    make_repo(repo, "me@example.org")
    git("-C", str(repo), "worktree", "add", "-q", "-b", "done", str(tmp_path / "app.wt" / "done"))
    registry(home, repo)
    wt = checks(run(hub, "crow-doctor", "--json"))["worktrees"]
    assert wt["level"] == "warn" and wt["details"] == ["app: done"]


def test_doctor_reads_the_default_account(hub, tmp_path):
    home, _ = hub
    registry(home, tmp_path / "missing")
    acc = checks(run(hub, "crow-doctor", "--json"))["accounts"]
    assert acc["level"] in ("ok", "fail")
    assert "main: use, memory permanent" in acc["details"]


def test_doctor_text_and_bad_argument(hub, tmp_path):
    home, _ = hub
    registry(home, tmp_path / "missing")
    out = run(hub, "crow-doctor")
    assert out.stdout.startswith(("ok", "warn", "FAIL")) and "identity" in out.stdout
    assert run(hub, "crow-doctor", "--nope").returncode != 0


def make_profile(home, profiles, name="main", complete=True):
    claude = profiles / name / "claude-home" / ".claude"
    (claude / "skills").mkdir(parents=True)
    (home / "skills" / "wrap").mkdir(parents=True)
    (home / "local" / "memory" / "-proj").mkdir(parents=True)
    if not complete:
        (claude / "settings.json").write_text("{}")
        return
    (claude / "projects" / "-proj").mkdir(parents=True)
    (claude / "projects" / "-proj" / "memory").symlink_to(home / "local" / "memory" / "-proj")
    (claude / "skills" / "wrap").symlink_to(home / "skills" / "wrap")
    (claude / "settings.json").write_text(json.dumps({
        "env": {"CROW_HOME": str(home), "CLAUDE_CODE_AUTO_COMPACT_WINDOW": "150000"},
        "hooks": {"Stop": [{"hooks": [{"command": "crow-ctx idle-hook"}]}],
                  "PreToolUse": [{"hooks": [{"command": "rtk-rewrite.sh"}]}],
                  "PermissionRequest": [{"hooks": [{"command": "/hub/bin/crow-prompt hook"}]}]},
        "attribution": {"commit": "", "pr": ""}}))


def test_doctor_passes_a_set_up_profile(hub, tmp_path):
    home, profiles = hub
    registry(home, tmp_path / "missing")
    make_profile(home, profiles)
    assert checks(run(hub, "crow-doctor", "--json"))["profiles"]["level"] == "ok"


def test_doctor_lists_what_a_bare_profile_misses(hub, tmp_path):
    home, profiles = hub
    registry(home, tmp_path / "missing")
    make_profile(home, profiles, complete=False)
    prof = checks(run(hub, "crow-doctor", "--json"))["profiles"]
    assert prof["level"] == "warn"
    for gap in ("memory not linked: -proj", "env CROW_HOME missing", "hook rtk-rewrite missing", "hook crow-prompt hook missing",
                "attribution commit/pr not empty", "skill wrap not linked"):
        assert f"main: {gap}" in prof["details"]


def test_doctor_warns_on_a_data_dir_without_git(hub):
    data = checks(run(hub, "crow-doctor", "--json"))["data"]
    assert data["level"] == "warn" and "not a git repo" in data["summary"]


def test_doctor_flags_the_data_repo_gaps(hub, tmp_path):
    home, _ = hub
    local = home / "local"
    make_repo(local, "me@example.org")
    data = checks(run(hub, "crow-doctor", "--json"))["data"]
    assert data["level"] == "warn"
    assert any("no remote" in d for d in data["details"])
    assert any("uncommitted" in d for d in data["details"])  # accounts.yaml and state/ are untracked

    git("-C", str(local), "add", "-A")
    git("-C", str(local), "commit", "-q", "-m", "data")
    origin = tmp_path / "data.git"
    git("init", "-q", "--bare", str(origin))
    git("-C", str(local), "remote", "add", "origin", str(origin))
    git("-C", str(local), "push", "-q", "-u", "origin", "main")
    assert checks(run(hub, "crow-doctor", "--json"))["data"]["level"] == "ok"

    (local / "b.txt").write_text("y")
    git("-C", str(local), "add", "b.txt")
    git("-C", str(local), "commit", "-q", "-m", "more")
    data = checks(run(hub, "crow-doctor", "--json"))["data"]
    assert data["level"] == "warn" and data["details"] == ["1 commit(s) not pushed"]


def test_doctor_modules_does_not_fail_without_crow_yaml(hub):
    out = run(hub, "crow-doctor", "--json")
    mods = checks(out)["modules"]
    assert mods["level"] in ("ok", "warn")
    assert not any("crow.yaml" in d for d in mods["details"])


def test_doctor_modules_fails_naming_file_and_key(hub):
    home, _ = hub
    (home / "crow.yaml").write_text(
        "version: 1\nmodules:\n  billing: true\n  forge:\n    token: x\n  core-api: false\n")
    out = run(hub, "crow-doctor", "--json")
    assert out.returncode == 1
    mods = checks(out)["modules"]
    path = str(home / "crow.yaml")
    assert mods["level"] == "fail"
    assert any(d.startswith(f"{path}: modules.billing: unknown brick") for d in mods["details"])
    assert any(d.startswith(f"{path}: modules.forge.token: unknown key") for d in mods["details"])
    assert any(d.startswith(f"{path}: modules.nest: requires core-api") for d in mods["details"])


def test_doctor_modules_fails_on_a_parse_error(hub):
    home, _ = hub
    (home / "local" / "crow.yaml").write_text("modules: [design\n")
    mods = checks(run(hub, "crow-doctor", "--json"))["modules"]
    assert mods["level"] == "fail" and ": (file): does not parse" in mods["details"][0]


def test_doctor_modules_warns_on_a_missing_tool(hub, tmp_path):
    only_git = tmp_path / "bin-git"
    only_git.mkdir()
    (only_git / "git").symlink_to(shutil.which("git"))
    mods = checks(run(hub, "crow-doctor", "--json", env={"PATH": str(only_git)}))["modules"]
    assert mods["level"] == "warn"
    assert "core: cdx is not on PATH" in mods["details"]
    assert "forge: none of glab, gh is on PATH" in mods["details"]
    assert not any(d.startswith("git:") for d in mods["details"])
