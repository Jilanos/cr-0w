import json
import os

from conftest import run, write_jsonl

LIMIT = {"type": "assistant", "isApiErrorMessage": True, "apiError": "usage_limit_reached",
         "error": "rate_limit", "timestamp": "2026-10-20T14:25:00.000Z",
         "quotaLimits": {"rateLimitType": "five_hour", "resetsAt": 1792414200},
         "message": {"role": "assistant", "content": [{"type": "text", "text": "You've hit your session limit"}]}}


def user(text):
    return {"type": "user", "message": {"role": "user", "content": text}}


def reply(text="done"):
    return {"type": "assistant", "timestamp": "2026-10-20T10:00:00.000Z",
            "message": {"role": "assistant", "content": [{"type": "text", "text": text}]}}


def transcript(hub, account, sid, events, cwd="/work/proj"):
    path = hub[1] / account / "claude-home" / ".claude" / "projects" / "-work-proj" / f"{sid}.jsonl"
    stamped = [{"sessionId": sid, "cwd": cwd, **e} if e.get("type") in ("user", "assistant") else e
               for e in events]
    write_jsonl(path, stamped)
    return path


def scan(hub):
    r = run(hub, "crow-sessions", "scan", "--json")
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


def ids(reg):
    return [s["conversation_id"] for s in reg["sessions"]]


def test_lists_limit_cut_sessions_only(hub):
    transcript(hub, "main", "cut", [user("fix the bug"), reply("working"), LIMIT,
                                    {"type": "last-prompt", "lastPrompt": "fix the bug"}])
    transcript(hub, "main", "finished", [user("fix the bug"), reply()])
    transcript(hub, "main", "limit-then-more", [user("a"), LIMIT, user("b"), reply()])
    reg = scan(hub)
    assert ids(reg) == ["cut"]
    s = reg["sessions"][0]
    assert (s["account"], s["first_prompt"], s["last_prompt"], s["limit"]) == \
        ("main", "fix the bug", "fix the bug", "five_hour")
    assert s["transcript"].endswith("cut.jsonl") and s["size"] > 0 and s["relaunched"] is None


def test_excludes_retros_and_automatic_jobs(hub):
    transcript(hub, "main", "retro", [user("/retro digest=x transcript=y"), LIMIT])
    transcript(hub, "main", "retro-cmd", [user("<command-message>retro</command-message>\n"
                                               "<command-name>/retro</command-name>\n"
                                               "<command-args>digest=x</command-args>"), LIMIT])
    for job in ("/brief", "/daily Draft only", "/weekly"):
        transcript(hub, "main", job.split()[0][1:], [user(job), LIMIT])
    transcript(hub, "main", "real", [user("<system-reminder>ctx</system-reminder>"),
                                     user("<command-name>/clear</command-name>"), user("ship it"), LIMIT])
    reg = scan(hub)
    assert ids(reg) == ["real"]
    assert reg["sessions"][0]["first_prompt"] == "ship it"


def test_reuses_cache_keyed_by_mtime_and_size(hub):
    p = transcript(hub, "main", "cut", [user("go"), LIMIT])
    transcript(hub, "shared", "other", [user("go"), reply()])
    assert scan(hub)["read"] == 2
    assert scan(hub)["read"] == 0
    with open(p, "a") as fh:  # the session resumed and finished: no longer interrupted
        fh.write(json.dumps({**reply(), "sessionId": "cut"}) + "\n")
    reg = scan(hub)
    assert reg["read"] == 1 and ids(reg) == []


def test_reads_only_the_tail_of_big_transcripts(hub):
    big = [user("go")] + [reply("x" * 2000) for _ in range(300)] + [LIMIT]
    p = transcript(hub, "main", "big", big)
    assert os.path.getsize(p) > 256_000
    reg = scan(hub)
    assert ids(reg) == ["big"] and reg["sessions"][0]["first_prompt"] == "go"


def test_project_comes_from_the_registry_and_relaunches_are_marked(hub):
    home = hub[0]
    (home / "local" / "projects.yaml").write_text(
        "projects:\n  - {name: track, path: /work/proj}\n  - {name: inner, path: /work/proj/sub}\n")
    transcript(hub, "main", "a", [user("go"), LIMIT], cwd="/work/proj/backend")
    transcript(hub, "main", "b", [user("go"), LIMIT], cwd="/work/proj/sub/x")
    transcript(hub, "main", "c", [user("go"), LIMIT], cwd="/elsewhere/tool")
    (home / "local" / "state" / "relaunches.jsonl").write_text(
        json.dumps({"conversation_id": "b", "target": "shared", "at": "2026-10-20T20:00:00+00:00"}) + "\n")
    reg = scan(hub)
    by = {s["conversation_id"]: s for s in reg["sessions"]}
    assert (by["a"]["project"], by["b"]["project"], by["c"]["project"]) == ("track", "inner", "tool")
    assert by["b"]["relaunched"]["target"] == "shared" and by["a"]["relaunched"] is None
    out = run(hub, "crow-sessions", "list").stdout
    assert "2 interrupted session(s), 1 already relaunched" in out
    assert " a " in out and " b " not in out
    assert (home / "local" / "state" / "interrupted-sessions.json").is_file()


def test_show_by_prefix(hub):
    transcript(hub, "main", "abc-123", [user("go"), LIMIT])
    transcript(hub, "main", "abd-456", [user("go"), LIMIT])
    assert json.loads(run(hub, "crow-sessions", "show", "abc").stdout)["conversation_id"] == "abc-123"
    r = run(hub, "crow-sessions", "show", "ab")
    assert r.returncode == 1 and "2 sessions match" in r.stderr


def test_flags_sessions_cdx_cannot_hand_off(hub):
    transcript(hub, "main", "one", [user("go"), LIMIT], cwd="/work/proj")
    transcript(hub, "main", "two", [user("go"), {**reply(), "cwd": "/work/proj/sub"}, LIMIT], cwd="/work/proj")
    by = {s["conversation_id"]: s for s in scan(hub)["sessions"]}
    assert by["one"]["workspaces"] == ["/work/proj"]
    assert by["two"]["workspaces"] == ["/work/proj", "/work/proj/sub"]
    out = run(hub, "crow-sessions", "list").stdout.splitlines()
    assert "cdx cannot hand off" in next(l for l in out if " two " in l)
    assert "cdx cannot hand off" not in next(l for l in out if " one " in l)
