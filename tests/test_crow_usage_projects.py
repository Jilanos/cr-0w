import datetime as dt
import json

from conftest import run, write_jsonl

PROJECTS = """\
projects:
  - {name: hub, path: /w/hub}
  - {name: lazytf, path: /w/lazytf}
  - {name: nested, path: /w/hub/nested}
"""


def day(back):
    return (dt.date.today() - dt.timedelta(days=back)).isoformat()


def turn(mid, back, blocks=(), out=100, cwd="/w/hub", model="m"):
    content = [{"type": "tool_use", "id": f"t-{mid}-{i}", "name": n, "input": inp}
               for i, (n, inp) in enumerate(blocks)] or [{"type": "text", "text": "ok"}]
    return {"type": "assistant", "cwd": cwd, "timestamp": f"{day(back)}T12:00:00.000Z",
            "message": {"id": mid, "role": "assistant", "model": model, "content": content,
                        "usage": {"input_tokens": 0, "output_tokens": out}}}


def setup(hub, sid, events, cwd="/w/hub"):
    home, profiles = hub
    (home / "local" / "projects.yaml").write_text(PROJECTS)
    write_jsonl(profiles / "main" / "claude-home" / ".claude" / "projects" / "-w-hub" / f"{sid}.jsonl",
                [{"type": "user", "cwd": cwd, "timestamp": f"{day(0)}T08:00:00.000Z",
                  "message": {"role": "user", "content": "go"}}, *events])


def usage(hub, *args):
    r = run(hub, "crow-usage", "--json", *args, env={"CROW_TITLES_OFF": "1", "PATH": "/usr/bin:/bin"})
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


def by_name(entries):
    return {e["name"]: e for e in entries}


def test_session_split_by_touched_paths(hub):
    setup(hub, "s1", [
        turn("a", 0, out=100),                                                     # no target → session cwd
        turn("b", 0, [("Read", {"file_path": "/w/lazytf/src/x.py"})], out=300),    # lazytf
        turn("c", 0, out=50),                                                      # text only → stays in lazytf
        turn("d", 0, [("Bash", {"command": "git -C /w/hub.wt/feat status"})], out=10),  # worktree → hub
        turn("e", 0, [("Bash", {"command": "cd /w/lazytf && ls"})], out=40),
        turn("f", 0, [("Edit", {"file_path": "/w/hub/nested/a.py"})], out=7),      # nested beats hub
        turn("g", 0, [("Read", {"file_path": "/elsewhere/y"})], out=3),            # unregistered → sticky
    ])
    s = usage(hub)["sessions"][0]
    assert s["multi_project"] is True
    tok = {p["name"]: p["tokens"] for p in s["projects"]}
    assert tok == {"hub": 110, "lazytf": 390, "nested": 10}
    assert sum(tok.values()) == s["tokens"]
    assert s["project"] == "hub"  # the cwd label is unchanged


def test_streamed_message_uses_tool_use_from_every_event(hub):
    first = turn("a", 0, out=60)
    later = turn("a", 0, [("Read", {"file_path": "/w/lazytf/f"})], out=60)  # same id, second streamed event
    setup(hub, "s2", [first, later])
    s = usage(hub)["sessions"][0]
    assert [(p["name"], p["tokens"]) for p in s["projects"]] == [("lazytf", 60)]
    assert s["multi_project"] is False


def test_rollup_by_project_marks_shared_sessions(hub):
    setup(hub, "s3", [turn("a", 0, [("Read", {"file_path": "/w/lazytf/f"})], out=500), turn("b", 0, out=1)])
    setup(hub, "s4", [turn("c", 0, out=20)])  # same file name differs by sid below
    home, profiles = hub
    write_jsonl(profiles / "main" / "claude-home" / ".claude" / "projects" / "-w-hub" / "s5.jsonl",
                [turn("z", 0, out=9)])
    today = by_name(usage(hub)["today"]["by_project"])
    assert today["lazytf"]["tokens"] == 501 and today["lazytf"]["shared_sessions"] == 0
    assert today["hub"]["sessions"] == 2


def test_hub_session_hopping_between_projects_is_shared(hub):
    setup(hub, "s6", [turn("a", 0, out=5), turn("b", 0, [("Read", {"file_path": "/w/lazytf/f"})], out=5)])
    today = by_name(usage(hub)["today"]["by_project"])
    assert today["hub"]["shared_sessions"] == 1 and today["lazytf"]["shared_sessions"] == 1


def test_crow_runs_json_carries_project_totals(hub):
    setup(hub, "s7", [turn("a", 0, [("Read", {"file_path": "/w/lazytf/f"})], out=5)])
    usage(hub)
    (hub[0] / "local" / "projects.yaml").write_text(PROJECTS)
    r = run(hub, "crow-runs", "json")
    assert r.returncode == 0, r.stderr
    assert by_name(json.loads(r.stdout)["usage_by_project"])["lazytf"]["tokens"] == 5


def test_frozen_days_stay_until_backfill(hub):
    home, _ = hub
    setup(hub, "s8", [turn("a", 3, [("Read", {"file_path": "/w/lazytf/f"})], out=40), turn("b", 3, out=10)])
    store = home / "local" / "state" / "usage-days.json"
    frozen = {"sessions": 1, "cost_usd": 1.0, "by_project": [{"name": "hub", "cost_usd": 1.0, "tokens": 50, "sessions": 1}]}
    store.write_text(json.dumps({day(3): frozen}))
    usage(hub)
    assert json.loads(store.read_text())[day(3)] == frozen  # untouched by a normal run
    r = run(hub, "crow-usage", "--backfill-projects", env={"CROW_TITLES_OFF": "1", "PATH": "/usr/bin:/bin"})
    assert r.returncode == 0 and day(3) in r.stdout, r.stdout + r.stderr
    new = json.loads(store.read_text())[day(3)]
    assert new["attribution"] == "touched" and new["cost_usd"] == 1.0
    assert by_name(new["by_project"])["lazytf"]["tokens"] == 50


def test_backfill_skips_days_whose_transcripts_are_gone(hub):
    home, _ = hub
    setup(hub, "s9", [turn("a", 0, out=1)])
    store = home / "local" / "state" / "usage-days.json"
    frozen = {"sessions": 4, "by_project": []}
    store.write_text(json.dumps({day(2): frozen}))
    run(hub, "crow-usage", "--backfill-projects", env={"CROW_TITLES_OFF": "1", "PATH": "/usr/bin:/bin"})
    assert json.loads(store.read_text())[day(2)] == frozen


def test_plain_table_in_text_output(hub):
    setup(hub, "s10", [turn("a", 0, [("Read", {"file_path": "/w/lazytf/f"})], out=5)])
    r = run(hub, "crow-usage", env={"CROW_TITLES_OFF": "1", "PATH": "/usr/bin:/bin"})
    assert "by project today" in r.stdout and "lazytf" in r.stdout
