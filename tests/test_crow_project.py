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
        {"name": "shell", "scope": "personal", "path": str(tmp_path / "shell"), "forge": "github",
         "planning": "side"},
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


def test_two_handoffs_in_a_row_keep_both_notes(hub, repos):
    home, _ = hub
    for task in ("first task", "second task"):
        assert run(hub, "crow-project", "handoff", "side", "--task", task, "--end-state", "x").returncode == 0
    notes = sorted((home / "local/state/handoffs").glob("*-side*.md"))
    assert len(notes) == 2
    assert {("first task" in n.read_text(), "second task" in n.read_text()) for n in notes} == {(True, False), (False, True)}


def test_handoff_requires_an_end_state(hub, repos):
    r = run(hub, "crow-project", "handoff", "side", "--task", "x")
    assert r.returncode != 0 and "--end-state" in r.stderr


def core_calls(home):
    f = home / "core-calls.jsonl"
    return [json.loads(l) for l in f.read_text().splitlines()] if f.exists() else []


# item_203 AC1: the end state creates or reuses the mission (the core keys it); the note and the
# first prompt of the session carry its id.
def test_handoff_links_its_mission_in_the_note(hub, repos):
    home, _, _ = repos
    r = run(hub, "crow-project", "handoff", "side", "--task", "Missions auto", "--end-state", "Commits on the branch.",
            "--logics", "item_203_missions_created")
    assert r.returncode == 0, r.stderr
    assert core_calls(home) == [["ensure", "--project", "side", "--end-state", "Commits on the branch.", "--json",
                                 "--logics", "item_203_missions_created", "--goal", "Missions auto"]]
    assert "\nLogics: item_203_missions_created\nMission: 20261113-build-side-item-203\n" in r.stdout
    cdx = run(hub, "crow-project", "handoff", "side", "--task", "Missions auto", "--end-state", "e",
              "--logics", "item_203", "--for-cdx").stdout
    assert cdx.startswith("Missions auto\n") and "Mission: 20261113-build-side-item-203" in cdx
    assert "End state:" not in cdx


def test_handoff_without_the_core_still_writes_its_note(hub, repos):
    home, _, _ = repos
    r = run(hub, "crow-project", "handoff", "side", "--task", "t", "--end-state", "e", env={"FAKE_CORE_FAIL": "store locked"})
    assert r.returncode == 0
    assert "warning: no mission linked (crow-core: store locked)" in r.stderr
    assert "Mission:" not in r.stdout and list((home / "local/state/handoffs").glob("*-side.md"))


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
    _home, _, _ = repos
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


def test_handoff_for_a_planning_project_goes_to_its_planning_repo(hub, repos):
    home, _, _side = repos
    r = run(hub, "crow-project", "handoff", "shell", "--task", "t", "--end-state", "e")
    assert r.returncode == 0, r.stderr
    assert "Project: shell, code in " in r.stdout and "planned and built from this repo" in r.stdout
    assert "follow AGENTS.md." in r.stdout
    assert list((home / "local/state/handoffs").glob("*-side.md"))
    assert core_calls(home)[0][:3] == ["ensure", "--project", "shell"]  # the mission is the requested project's


def test_handoff_to_the_hub_itself_opens_a_fresh_hub_session(hub, repos):
    home, _, _ = repos
    r = run(hub, "crow-project", "handoff", "hub", "--task", "Draft a reply to the flagged mail",
            "--end-state", "A reply draft; nothing sent.")
    assert r.returncode == 0, r.stderr
    assert any((home / "local/state/handoffs").glob("*-hub.md"))
