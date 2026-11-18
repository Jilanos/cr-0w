"""Account choice for crow open, term and handoff: empty quotas are skipped, live sessions rank last."""
import json
import os
import sys
from datetime import UTC, datetime

import pytest
import yaml
from conftest import BIN, run

sys.path.insert(0, str(BIN))
import crow_lib

NOW = datetime(2026, 11, 3, 16, 0, tzinfo=UTC)
ACCTS = [{"name": "main", "policy": "use"}, {"name": "spare", "policy": "use"},
         {"name": "big", "policy": "use"}, {"name": "shared", "policy": "ask-first"},
         {"name": "mate", "policy": "never"}]


def row(name, left5=80, leftw=80):
    return {"session_name": name, "enabled": True, "auth_status": "authenticated", "remaining_5h_pct": left5,
            "remaining_week_pct": leftw, "reset_5h_at": "Nov 3 18:50"}


def pick(rows, busy=(), accts=ACCTS):
    st = crow_lib.pick_accounts(accts, {r["session_name"]: r for r in rows}, None, NOW)
    return crow_lib.launch_pick(st, set(busy), "main")


def test_default_stays_while_it_has_room():
    assert pick([row("main", 30), row("big", 90)])["account"] == "main"


def test_default_at_zero_moves_to_the_account_with_the_most_room():
    p = pick([row("main", 0), row("spare", 40), row("big", 70), row("shared", 100)])
    assert (p["account"], p["ask"], p["room"]) == ("big", False, 70)
    assert {"name": "main", "why": "5h limit (resets Nov 3 18:50)"} in p["skipped"]


def test_room_is_the_smaller_window():
    assert pick([row("main", 0), row("spare", 40, 90), row("big", 90, 10)])["account"] == "spare"


def test_default_nearly_out_moves_too():
    assert pick([row("main", 3), row("spare", 40)])["account"] == "spare"


def test_busy_default_moves_to_the_next_free_account():
    p = pick([row("main"), row("spare", 40), row("big", 20)], busy={"main"})
    assert p["account"] == "spare" and {"name": "main", "why": "live session"} in p["skipped"]


def test_busy_use_account_beats_ask_first():
    p = pick([row("main", 0), row("spare", 50), row("big", 0, 50), row("shared", 60)], busy={"spare"})
    assert (p["account"], p["ask"], p["busy"]) == ("spare", False, True)


def test_busy_default_is_used_when_no_other_use_account_has_room():
    p = pick([row("main", 57), row("spare", 0), row("big", 0), row("shared", 5)], busy={"main"})
    assert (p["account"], p["busy"]) == ("main", True)


def test_only_ask_first_left_asks():
    p = pick([row("main", 0), row("spare", 0), row("big", 0, 50), row("shared", 60)])
    assert (p["account"], p["ask"]) == ("shared", True)


def test_none_free_returns_no_account():
    p = pick([row("main", 0), row("spare", 0), row("big", 50, 0), row("shared", 0)], busy={"spare"})
    assert p["account"] is None
    assert [s["name"] for s in p["skipped"]] == ["main", "spare", "big", "shared"]


# ---------- the CLI against a fake cdx, setsid and kitty ----------

FAKE_CDX = r"""#!/usr/bin/env python3
import json, os, sys
argv = sys.argv[1:]
with open(os.environ["FAKE_LOG"], "a") as f:
    f.write(json.dumps({"argv": argv, "account": os.environ.get("CROW_ACCOUNT"),
                        "session": os.environ.get("CROW_SESSION_ACCOUNT")}) + "\n")
state = json.load(open(os.environ["FAKE_STATE"]))
if argv[:1] == ["status"]:
    print(json.dumps({"rows": state["rows"]}))
elif argv[:1] == ["sessions"]:
    print(json.dumps({"sessions": [{"session": s, "active": True} for s in state["busy"]]}))
elif argv[:1] == ["configs"]:
    print(json.dumps({"sessions": []}))
"""
# setsid -f kitty --title T <cmd...>: run <cmd...> in the foreground so the test sees the launch.
FAKE_SETSID = """#!/bin/sh
shift; shift; shift; shift
exec "$@"
"""


@pytest.fixture
def fake(hub, tmp_path):
    home, _ = hub
    (home / "local/accounts.yaml").write_text(yaml.safe_dump({"default": "main", "accounts": [
        {"name": "main", "policy": "use"}, {"name": "spare", "policy": "use"},
        {"name": "shared", "policy": "ask-first"}]}))
    repo = tmp_path / "repo"
    repo.mkdir()
    (home / "local/projects.yaml").write_text(yaml.safe_dump({"projects": [
        {"name": "demo", "scope": "personal", "path": str(repo), "forge": "none"}]}))
    d = tmp_path / "fakebin"
    d.mkdir()
    for name, body in (("cdx", FAKE_CDX), ("setsid", FAKE_SETSID)):
        (d / name).write_text(body)
        (d / name).chmod(0o755)
    log, state = tmp_path / "cdx.log", tmp_path / "state.json"
    env = {"PATH": f"{d}:{os.environ['PATH']}", "FAKE_LOG": str(log), "FAKE_STATE": str(state),
           "CDX_SESSION_NAME": "", "CROW_ACCOUNT": "", "CROW_TERMINAL": "kitty"}

    def set_state(rows, busy=()):
        state.write_text(json.dumps({"rows": rows, "busy": list(busy)}))

    def launches():
        calls = [json.loads(l) for l in log.read_text().splitlines()] if log.exists() else []
        return [c for c in calls if c["argv"][:1] not in (["status"], ["sessions"], ["configs"])]
    return env, set_state, launches


def test_term_with_the_default_at_zero_launches_on_the_free_account(hub, fake):
    env, set_state, launches = fake
    set_state([row("main", 0), row("spare", 60), row("shared", 100)])
    r = run(hub, "crow", "term", "demo", "hello", env=env)
    assert r.returncode == 0, r.stderr
    assert "using 'spare'" in r.stderr and "main: 5h limit" in r.stderr
    (call,) = launches()
    assert call["argv"][0] == "spare" and call["argv"][-2:] == ["--prompt", "hello"]
    assert "--on-busy" in call["argv"]


def test_open_refuses_when_no_account_has_room(hub, fake):
    env, set_state, launches = fake
    set_state([row("main", 0), row("spare", 60, 0), row("shared", 0)])
    r = run(hub, "crow", "open", "--on-busy", "fail", "demo", env=env)
    assert r.returncode == 1 and "no allowed account is free" in r.stderr
    assert launches() == []


def test_handoff_refuses_on_ask_first_only_and_writes_no_note(hub, fake):
    env, set_state, launches = fake
    set_state([row("main", 0), row("spare", 0), row("shared", 80)])
    r = run(hub, "crow", "handoff", "demo", "--task", "fix it", "--end-state", "show the diff", env=env)
    assert r.returncode == 1 and "CROW_ACCOUNT=shared" in r.stderr
    assert launches() == [] and not (hub[0] / "local/state/handoffs").exists()


def test_handoff_passes_task_and_end_state_to_cdx(hub, fake):
    env, set_state, launches = fake
    set_state([row("main"), row("spare")], busy={"main"})
    r = run(hub, "crow", "handoff", "demo", "--task", "fix it", "--end-state", "show the diff", env=env)
    assert r.returncode == 0, r.stderr
    (call,) = launches()
    argv = call["argv"]
    assert argv[0] == "spare"
    task = argv[argv.index("--task") + 1]
    assert task.startswith("fix it\n\nHand-off from the crow hub") and "End state:" not in task
    assert argv[argv.index("--end-state") + 1] == "show the diff"


def test_an_explicit_account_wins(hub, fake):
    env, set_state, launches = fake
    set_state([row("main", 0), row("spare", 60)])
    r = run(hub, "crow", "open", "demo", env={**env, "CROW_ACCOUNT": "main"})
    assert r.returncode == 0, r.stderr
    assert launches()[0]["argv"][0] == "main"


def test_the_inherited_account_of_the_calling_session_is_not_a_choice(hub, fake):
    env, set_state, launches = fake
    set_state([row("main"), row("spare", 60)], busy={"main"})
    r = run(hub, "crow", "term", "demo", env={**env, "CROW_ACCOUNT": "main", "CDX_SESSION_NAME": "main"})
    assert r.returncode == 0, r.stderr
    assert launches()[0]["argv"][0] == "spare"


def test_an_explicit_own_account_wins_in_a_session_crow_started(hub, fake):
    env, set_state, launches = fake
    set_state([row("main"), row("spare", 60)], busy={"main"})
    r = run(hub, "crow", "term", "demo", env={**env, "CROW_ACCOUNT": "main", "CDX_SESSION_NAME": "main",
                                              "CROW_SESSION_ACCOUNT": "main"})
    assert r.returncode == 0, r.stderr
    assert launches()[0]["argv"][0] == "main"


def test_the_session_gets_its_account_as_crow_session_account_only(hub, fake):
    env, set_state, launches = fake
    set_state([row("main"), row("spare")])
    r = run(hub, "crow", "open", "demo", env=env)
    assert r.returncode == 0, r.stderr
    (call,) = launches()
    assert (call["argv"][0], call["account"], call["session"]) == ("main", None, "main")


def test_handoff_in_an_older_session_picks_the_account_once(hub, fake):
    env, set_state, launches = fake
    set_state([row("main"), row("spare")])
    r = run(hub, "crow", "handoff", "demo", "--task", "t", "--end-state", "e", env={**env, "CDX_SESSION_NAME": "main"})
    assert r.returncode == 0, r.stderr
    assert r.stderr.count("crow: using") <= 1
    assert launches()[0]["argv"][0] == "main"


def test_a_planning_project_opens_in_its_planning_repo(hub, fake, tmp_path):
    env, set_state, launches = fake
    home, _ = hub
    plan = tmp_path / "plan"
    plan.mkdir()
    reg = yaml.safe_load((home / "local/projects.yaml").read_text())
    reg["projects"] += [{"name": "shell", "aliases": ["sh"], "planning": "dots", "scope": "personal",
                         "path": str(tmp_path / "shell"), "forge": "none"},
                        {"name": "dots", "scope": "personal", "path": str(plan), "forge": "none"}]
    (home / "local/projects.yaml").write_text(yaml.safe_dump(reg))
    set_state([row("main"), row("spare")])
    r = run(hub, "crow", "open", "sh", env=env)
    assert r.returncode == 0, r.stderr
    assert "shell is worked from dots" in r.stderr
    argv = launches()[0]["argv"]
    assert argv[argv.index("--dir") + 1] == str(plan)


def test_term_without_kitty_prints_the_command_and_launches_nothing(hub, fake):
    env, set_state, launches = fake
    set_state([row("main"), row("spare")])
    r = run(hub, "crow", "term", "demo", "hello", env={**env, "CROW_TERMINAL": "print"})
    assert r.returncode == 0, r.stderr
    assert "run this in a new terminal" in r.stderr
    assert r.stdout.startswith("CROW_ACCOUNT=main ") and r.stdout.rstrip().endswith("open --on-busy ask demo hello")
    assert launches() == []


def test_term_headless_starts_a_detached_tmux_session_and_prints_json(hub, fake, tmp_path):
    env, set_state, launches = fake
    set_state([row("main"), row("spare")])
    tmux, calls = tmp_path / "fakebin/tmux", tmp_path / "tmux.log"
    tmux.write_text(f"#!/bin/sh\necho \"$@\" >> {calls}\n")
    tmux.chmod(0o755)
    r = run(hub, "crow", "term", "demo", "hello", env={**env, "CROW_TERMINAL": "headless", "INVOCATION_ID": ""})
    assert r.returncode == 0, r.stderr
    out = json.loads(r.stdout.strip().splitlines()[-1])
    assert out["ok"] and out["account"] == "main" and out["tmux"].startswith("crow-demo-") and "no window" in out["message"]
    call = calls.read_text()
    assert call.startswith(f"new-session -d -s {out['tmux']} ") and "open --on-busy ask demo hello" in call
    assert launches() == []


def test_term_refuses_an_unknown_backend(hub, fake):
    env, set_state, launches = fake
    set_state([row("main")])
    r = run(hub, "crow", "term", "demo", env={**env, "CROW_TERMINAL": "xterm"})
    assert r.returncode != 0 and "not a backend" in r.stderr
    assert launches() == []


# ---------- scope routing (req_025) ----------

def ranked(home, tmp_path):
    (home / "local/accounts.yaml").write_text(yaml.safe_dump({"default": "main", "accounts": [
        {"name": "main", "policy": "use", "scopes": {"work": 1, "hub": 1, "personal": 2}, "scope_min_room": {"personal": 40}},
        {"name": "spare", "policy": "use", "scopes": {"personal": 1, "hub": 2}},
        {"name": "shared", "policy": "ask-first", "scopes": {"work": 2}}]}))
    reg = yaml.safe_load((home / "local/projects.yaml").read_text())
    reg["projects"].append({"name": "job", "scope": "work", "path": str(tmp_path / "repo"), "forge": "none"})
    (home / "local/projects.yaml").write_text(yaml.safe_dump(reg))


def test_a_personal_project_goes_to_the_personal_rank(hub, fake, tmp_path):
    env, set_state, launches = fake
    ranked(hub[0], tmp_path)
    set_state([row("main"), row("spare"), row("shared")])
    r = run(hub, "crow", "open", "demo", env=env)
    assert r.returncode == 0, r.stderr
    assert launches()[0]["argv"][0] == "spare"
    assert "scope personal" in r.stderr and "decided by scope rank" in r.stderr


def test_a_work_project_goes_to_the_work_rank_and_overflows(hub, fake, tmp_path):
    env, set_state, launches = fake
    ranked(hub[0], tmp_path)
    set_state([row("main"), row("spare"), row("shared")])
    assert run(hub, "crow", "open", "job", env=env).returncode == 0
    assert launches()[-1]["argv"][0] == "main"
    set_state([row("main", 0), row("spare"), row("shared", 50)])
    r = run(hub, "crow", "open", "--on-busy", "fail", "job", env=env)
    assert r.returncode == 1 and "CROW_ACCOUNT=shared" in r.stderr and "spare: no rank for scope work" in r.stderr


def test_the_hub_passes_the_hub_scope(hub, fake, tmp_path):
    env, set_state, launches = fake
    ranked(hub[0], tmp_path)
    set_state([row("main", 0), row("spare"), row("shared")])
    r = run(hub, "crow", "hub", env=env)
    assert r.returncode == 0, r.stderr
    assert launches()[0]["argv"][0] == "spare" and "scope hub" in r.stderr


def test_an_explicit_account_beats_the_scope(hub, fake, tmp_path):
    env, set_state, launches = fake
    ranked(hub[0], tmp_path)
    set_state([row("main"), row("spare"), row("shared")])
    assert run(hub, "crow", "open", "job", env={**env, "CROW_ACCOUNT": "spare"}).returncode == 0
    assert launches()[0]["argv"][0] == "spare"


def test_the_hub_keeps_the_default_without_scopes(hub, fake):
    env, set_state, launches = fake
    set_state([row("main"), row("spare", 90)])
    assert run(hub, "crow", "hub", env=env).returncode == 0
    assert launches()[0]["argv"][0] == "main"


def test_the_account_flag_forces_the_calling_sessions_own_account(hub, fake):
    env, set_state, launches = fake
    set_state([row("main"), row("spare", 60)], busy={"main"})
    r = run(hub, "crow", "term", "--account", "main", "demo",
            env={**env, "CROW_ACCOUNT": "main", "CDX_SESSION_NAME": "main"})
    assert r.returncode == 0, r.stderr
    assert launches()[0]["argv"][0] == "main"


def test_handoff_takes_the_account_flag(hub, fake):
    env, set_state, launches = fake
    set_state([row("main"), row("spare", 60)], busy={"main"})
    r = run(hub, "crow", "handoff", "--account", "main", "demo", "--task", "t", "--end-state", "e",
            env={**env, "CDX_SESSION_NAME": "main"})
    assert r.returncode == 0, r.stderr
    assert "crow: using" not in r.stderr
    assert launches()[0]["argv"][0] == "main"
