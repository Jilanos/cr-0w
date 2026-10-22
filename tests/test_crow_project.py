import json
import subprocess

import pytest
import yaml

from conftest import run


@pytest.fixture
def repos(hub, tmp_path):
    """Two registered repos: a work one with skills, hooks and a deny rule, and a bare personal one."""
    home, _ = hub
    work = tmp_path / "repos" / "backend"
    (work / ".claude/skills/mr-review").mkdir(parents=True)
    (work / ".claude/skills/mr-review/SKILL.md").write_text(
        "---\nname: mr-review\ndescription: Review an MR\n  the repo's way.\n---\nbody\n")
    (work / ".claude/skills/debug.md").write_text("---\nname: Debug\ndescription: Debug issues\n---\n")
    (work / ".claude/settings.json").write_text(json.dumps({
        "hooks": {"PostToolUse": [{"matcher": "Edit", "hooks": [{"type": "command", "command": "graph update"}]}]},
        "permissions": {"deny": ["Bash(git push:*)"]}}))
    (work / "CLAUDE.md").write_text("# rules\n")
    subprocess.run(["git", "init", "-q", str(work)], check=True)
    hook = work / ".git/hooks/commit-msg"
    hook.write_text("#!/bin/sh\n"); hook.chmod(0o755)
    side = tmp_path / "repos" / "side"
    side.mkdir()
    (side / "AGENTS.md").write_text("# agents\n")
    (home / "local/skills/backend").mkdir(parents=True)
    (home / "local/skills/backend/notes.md").write_text("x")
    (home / "local/reviews").mkdir()
    (home / "local/reviews/backend.md").write_text("x")
    (home / "local/owner-prefs.md").write_text("x")
    (home / "local/projects.yaml").write_text(yaml.safe_dump({"projects": [
        {"name": "hub", "scope": "personal", "path": str(home), "forge": "none"},
        {"name": "backend", "scope": "work", "path": str(work), "forge": "gitlab", "remote": "corp/backend",
         "reviewers": ["rev1"], "aliases": ["be"]},
        {"name": "side", "scope": "personal", "path": str(side), "forge": "github"},
        {"name": "notes", "scope": "personal", "path": str(tmp_path / "notes"), "forge": "none"},
        {"name": "old", "scope": "personal", "path": str(tmp_path / "old"), "forge": "github", "status": "dormant"},
    ]}))
    return home, work, side


def test_work_index_lists_repo_tools_and_what_the_hub_cannot_run(hub, repos):
    home, work, _ = repos
    ix = json.loads(run(hub, "crow-project", "work", "be", "--json").stdout)
    assert ix["name"] == "backend"
    assert ix["instructions"] == [str(work / "CLAUDE.md")]
    assert {s["name"]: s["description"] for s in ix["skills"]} == {
        "Debug": "Debug issues", "mr-review": "Review an MR the repo's way."}
    assert ix["not_in_hub"]["hooks"][0]["command"] == "graph update"
    assert ix["not_in_hub"]["deny"] == ["Bash(git push:*)"]
    assert ix["not_in_hub"]["git_hooks"] == ["commit-msg"]
    assert ix["hub_notes"] == [str(home / "local/skills/backend/notes.md")]
    text = run(hub, "crow-project", "work", "backend").stdout
    assert "NOT active in a hub session" in text and "deny Bash(git push:*)" in text
    assert "Git hooks still run from here: commit-msg" in text


def test_unknown_project_and_the_hub_itself_are_refused(hub, repos):
    assert run(hub, "crow-project", "work", "nope").returncode != 0
    assert run(hub, "crow-project", "work", "hub").returncode != 0


def test_handoff_note_carries_task_end_state_repo_tools_and_hub_rules(hub, repos):
    home, work, _ = repos
    r = run(hub, "crow-project", "handoff", "backend", "--task", "Fix the review threads on !12",
            "--end-state", "after my OK: commit, push, reply, resolve")
    assert r.returncode == 0
    note = r.stdout
    assert "Task: Fix the review threads on !12" in note
    assert "End state: after my OK: commit, push, reply, resolve" in note
    assert "follow CLAUDE.md and use its skills by name when they match (Debug, mr-review)" in note
    assert "`mr` skill" in note and "reviewers: rev1" in note
    assert str(home / "local/reviews/backend.md") in note
    assert f"{work}.wt/<name>, never /tmp" in note
    assert "ask before every push, never merge" in note
    saved = list((home / "local/state/handoffs").glob("*-backend.md"))
    assert len(saved) == 1 and saved[0].read_text() == note


def test_handoff_requires_an_end_state(hub, repos):
    r = run(hub, "crow-project", "handoff", "side", "--task", "x")
    assert r.returncode != 0 and "--end-state" in r.stderr


def test_handoff_for_a_personal_repo_names_its_agents_file(hub, repos):
    note = run(hub, "crow-project", "handoff", "side", "--task", "t", "--end-state", "e").stdout
    assert "follow AGENTS.md." in note and "never merge" not in note


def test_which_maps_worktrees_to_their_repo(hub, repos):
    _, work, _ = repos
    assert run(hub, "crow-project", "which", f"{work}.wt/fix/src").stdout.strip() == "backend"
    assert run(hub, "crow-project", "which", "/elsewhere").returncode == 1


def guard(hub, event):
    r = run(hub, "crow-hub-guard", input=json.dumps(event))
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)["hookSpecificOutput"] if r.stdout.strip() else None


def bash(home, command, cwd=None):
    return {"hook_event_name": "PreToolUse", "tool_name": "Bash", "tool_input": {"command": command},
            "cwd": str(cwd or home), "session_id": "s1"}


def test_guard_asks_before_repo_writes_from_the_hub(hub, repos):
    home, work, side = repos
    out = guard(hub, bash(home, f"git -C {work} push origin feat"))
    assert out["permissionDecision"] == "ask"
    assert "crow handoff backend" in out["permissionDecisionReason"]
    assert "every push needs the owner's OK" in out["permissionDecisionReason"]
    assert guard(hub, bash(home, f"cd {side}.wt/x && git commit -m y"))["permissionDecision"] == "ask"
    assert guard(hub, bash(home, "glab mr create --repo corp/backend --fill"))["permissionDecision"] == "ask"
    assert guard(hub, bash(home, "git rebase main", cwd=work))["permissionDecision"] == "ask"


def test_guard_lets_reads_hub_commits_and_forgeless_folders_through(hub, repos):
    home, work, _ = repos
    assert guard(hub, bash(home, f"git -C {work} log --oneline")) is None
    assert guard(hub, bash(home, "git commit -m 'chg[MD]: x'")) is None
    assert guard(hub, bash(home, f"git -C {home.parent / 'notes'} commit -m x")) is None
    assert guard(hub, bash(home, f"git -C {home.parent / 'old'} push")) is None
    assert guard(hub, {"hook_event_name": "PreToolUse", "tool_name": "Edit", "tool_input": {}}) is None


def test_guard_asks_before_a_worktree_in_tmp(hub, repos):
    home, work, _ = repos
    out = guard(hub, bash(home, f"git -C {work} worktree add -b fix /tmp/claude/scratch/fix main"))
    assert out["permissionDecision"] == "ask" and "/tmp" in out["permissionDecisionReason"]
    assert guard(hub, bash(home, f"git -C {work} worktree add {work}.wt/fix")) is None


def test_prompt_note_once_per_project_and_session(hub, repos):
    home, _, _ = repos
    ev = {"hook_event_name": "UserPromptSubmit", "session_id": "s1", "prompt": "fix the threads on BE !12, then side"}
    out = guard(hub, ev)
    assert out["hookEventName"] == "UserPromptSubmit"
    assert "crow handoff backend" in out["additionalContext"] and "crow work side" in out["additionalContext"]
    assert guard(hub, ev) is None
    assert guard(hub, {**ev, "session_id": "s2", "prompt": "the backend-api thing"}) is None
    assert guard(hub, {**ev, "session_id": "s2", "prompt": "notes and hub only"}) is None


def test_guard_can_be_turned_off(hub, repos):
    home, work, _ = repos
    r = run(hub, "crow-hub-guard", input=json.dumps(bash(home, f"git -C {work} push")), env={"CROW_HUB_GUARD": "off"})
    assert r.returncode == 0 and r.stdout == ""
