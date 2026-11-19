"""The core contract (item_119): fixtures match their schemas and the Python sidecar answers them."""
import io
import json
import re
import subprocess
import sys

import pytest
from conftest import BIN, REPO
from schema_lite import Validator

sys.path.insert(0, str(BIN))
import crow_sidecar

SPEC = REPO / "logics" / "specs" / "core_contract"
SCHEMAS = SPEC / "schemas"
FIX = SPEC / "fixtures"
RUN_SPEC = REPO / "logics" / "specs" / "req_037_run_contract"
MESSAGE_FIXTURES = sorted((FIX / "messages").glob("*.request.json"))
ERROR_FIXTURES = sorted((FIX / "errors").glob("*.request.json"))
EVENT_FILES = sorted((FIX / "events").glob("*.jsonl")) + [RUN_SPEC / "examples" / "20261109-build-item-095" / "events.jsonl"]


def load(p):
    return json.loads(p.read_text())


def errors(schema, instance):
    return Validator(load(SCHEMAS / schema), SCHEMAS).errors(instance)


def reply_of(request_path):
    return request_path.with_name(request_path.name.replace(".request.", ".reply."))


def lines(p):
    return [json.loads(x) for x in p.read_text().splitlines() if x.strip()]


def test_every_schema_has_fixtures():
    assert {p.name for p in SCHEMAS.glob("*.json")} == {
        "request.schema.json", "reply.schema.json", "event.schema.json",
        "mission.schema.json", "run.schema.json", "inbox.schema.json", "live-action.schema.json",
        "work-item.schema.json"}


def test_work_record_fixture_valid():
    items = load(FIX / "records" / "work.json")
    assert items
    for it in items:
        assert not errors("work-item.schema.json", it), it["id"]


@pytest.mark.parametrize("path", MESSAGE_FIXTURES, ids=lambda p: p.name)
def test_message_pair_valid(path):
    assert not errors("request.schema.json", load(path)), path.name
    assert not errors("reply.schema.json", load(reply_of(path))), reply_of(path).name


@pytest.mark.parametrize("path", ERROR_FIXTURES, ids=lambda p: p.name)
def test_error_reply_valid(path):
    reply = load(reply_of(path))
    assert not errors("reply.schema.json", reply)
    assert reply["ok"] is False


def test_bad_data_request_fails_its_schema():
    errs = errors("request.schema.json", load(FIX / "errors" / "bad-data.request.json"))
    assert any("grace_s" in e for e in errs)


@pytest.mark.parametrize("path", MESSAGE_FIXTURES + ERROR_FIXTURES, ids=lambda p: p.parent.name + "/" + p.name)
def test_sidecar_answers_fixture(path):
    assert crow_sidecar.Sidecar().handle(load(path)) == load(reply_of(path))


def test_message_set_matches_everywhere():
    fixtures = {p.name.split(".")[0] for p in MESSAGE_FIXTURES}
    replies = {p.name.split(".")[0] for p in (FIX / "messages").glob("*.reply.json")}
    table = set(re.findall(r"^\| `([a-z_.]+)` \|", (SPEC / "README.md").read_text(), re.MULTILINE))
    schema = set(load(SCHEMAS / "request.schema.json")["$defs"])
    assert fixtures == replies == table == schema == set(crow_sidecar.Sidecar().messages)


def test_fixture_version_is_the_contract():
    for p in sorted(FIX.glob("*/*.json")):
        doc = load(p)
        if isinstance(doc, dict) and "v" in doc:
            assert doc["v"] == crow_sidecar.CONTRACT, p.name
    assert load(FIX / "messages" / "hello.reply.json")["data"]["contract"] == crow_sidecar.CONTRACT


@pytest.mark.parametrize("path", EVENT_FILES, ids=lambda p: p.parent.name + "/" + p.name)
def test_event_lines_valid(path):
    for i, line in enumerate(lines(path), 1):
        errs = errors("event.schema.json", line)
        assert not errs, f"{path.name}:{i}: " + "; ".join(errs)


@pytest.mark.parametrize("path", EVENT_FILES, ids=lambda p: p.parent.name + "/" + p.name)
def test_event_log_shape(path):
    evs = lines(path)
    assert evs[0]["type"] == "created" and len({e["mission"] for e in evs}) == 1
    assert [e["ts"] for e in evs] == sorted(e["ts"] for e in evs)
    state = "preflight"
    for e in evs:
        if e["type"] == "state":
            assert e["data"]["from"] == state, e
            state = e["data"]["to"]
    assert state == "done"


@pytest.mark.parametrize("name,schema", [("missions.json", "mission.schema.json"), ("runs.json", "run.schema.json"),
                                         ("inbox.json", "inbox.schema.json")])
def test_records_valid(name, schema):
    rows = load(FIX / "records" / name)
    assert rows
    for row in rows:
        errs = errors(schema, row)
        assert not errs, f"{name} {row.get('id', row.get('run'))}: " + "; ".join(errs)


def test_records_agree():
    missions = {m["id"]: m for m in load(FIX / "records" / "missions.json")}
    runs = load(FIX / "records" / "runs.json")
    assert [r for m in missions.values() for r in m["runs"]] == runs
    for row in load(FIX / "records" / "inbox.json"):
        assert row["mission"] in missions and row["kind"] == missions[row["mission"]]["kind"]
        assert row["id"].startswith(f"{row['mission']}/v{row['version']}")


def test_research_log_matches_its_record():
    m = next(x for x in load(FIX / "records" / "missions.json") if x["id"] == "20261109-research-android-push-options")
    evs = lines(FIX / "events" / f"{m['id']}.jsonl")
    created = evs[0]["data"]
    for k in ("kind", "project", "scope", "data_class", "goal", "end_state", "autonomy", "gates", "budget", "file_scope"):
        assert created[k] == m[k], k
    assert [e["data"]["run"] for e in evs if e["type"] == "run_start"] == [r["run"] for r in m["runs"]]
    assert evs[0]["ts"] == m["created"] and evs[-1]["ts"] == m["updated"]


def test_questions_fixture_is_the_research_mission():
    q = load(RUN_SPEC / "examples" / "gates" / "questions.json")
    row = next(x for x in load(FIX / "records" / "inbox.json") if x["source"] == "questions")
    assert row["id"] == f"{q['mission']}/v{q['version']}/{q['questions'][0]['id']}"
    assert row["ask"] == q["questions"][0]["text"]


@pytest.mark.parametrize("bad,where", [
    ({"surprise": 1}, "unknown field"),
    ({"verbs": ["merge"]}, "verbs"),
])
def test_inbox_schema_rejects(bad, where):
    row = dict(load(FIX / "records" / "inbox.json")[0], **bad)
    assert any(where in e for e in errors("inbox.schema.json", row))


def test_sidecar_handles_garbage():
    out = io.StringIO()
    crow_sidecar.Sidecar().serve(io.StringIO('not json\n[1]\n{"v":1,"id":"a","type":"health","data":{}}\n'), out)
    replies = [json.loads(x) for x in out.getvalue().splitlines()]
    assert [r["error"]["code"] for r in replies[:2]] == ["bad_request", "bad_request"]
    assert replies[2]["ok"] and replies[2]["id"] == "a"
    for r in replies:
        assert not errors("reply.schema.json", r)


def test_sidecar_process_runs_lifecycle():
    reqs = [load(FIX / "messages" / f"{t}.request.json") for t in ("hello", "health", "shutdown")]
    stdin = "".join(json.dumps(r) + "\n" for r in reqs) + json.dumps(reqs[1]) + "\n"
    p = subprocess.run([sys.executable, str(BIN / "crow_sidecar.py")], input=stdin, capture_output=True, text=True, check=False,
                       timeout=30)
    assert p.returncode == 0, p.stderr
    got = [json.loads(x) for x in p.stdout.splitlines()]
    assert got == [load(FIX / "messages" / f"{t}.reply.json") for t in ("hello", "health", "shutdown")]


# HTTP read API (item_144): the Go tests write these response fixtures; here they must
# keep the envelope and every row must match the record schemas.
API = FIX / "api"
API_FIXTURES = sorted(API.glob("*.json"))
SECTION_SCHEMA = {"inbox": "inbox.schema.json", "missions": "mission.schema.json", "runs": "run.schema.json"}


def test_api_fixture_set():
    names = {p.stem for p in API_FIXTURES}
    for want in ("state", "state-inbox", "state-missions", "state-runs", "state-accounts", "state-jobs",
                 "mission", "events", "error-no-identity"):
        assert want in names, want


def check_section(sec):
    assert {"section", "version", "updated_at", "data"} <= set(sec) <= {
        "section", "version", "updated_at", "data", "stale", "error"}, sec.keys()
    assert sec.get("stale", False) == bool(sec.get("error")), "stale and error go together"
    schema = SECTION_SCHEMA.get(sec["section"])
    if not schema:
        return
    assert isinstance(sec["data"], list)
    for row in sec["data"]:
        errs = errors(schema, row)
        assert not errs, f"{sec['section']}: " + "; ".join(errs)


@pytest.mark.parametrize("path", [p for p in API_FIXTURES if p.stem.startswith("state-")], ids=lambda p: p.name)
def test_api_section_fixture(path):
    sec = load(path)
    assert path.stem.split("-")[1] == sec["section"]
    check_section(sec)


def test_api_state_fixture():
    st = load(API / "state.json")
    assert set(st) == {"version", "sections"}
    assert set(st["sections"]) == {
        "inbox", "missions", "runs", "sessions", "dispatch", "usage", "today",
        "mrs", "checks", "projects", "accounts", "jobs", "work", "ready"}
    for name, sec in st["sections"].items():
        assert sec["section"] == name
        check_section(sec)


@pytest.mark.parametrize("path", [API / "mission.json", API / "mission-questions.json"], ids=lambda p: p.name)
def test_api_mission_fixture(path):
    d = load(path)
    assert set(d) == {"mission", "versions", "runs"}
    assert not errors("mission.schema.json", d["mission"])
    assert [v["version"] for v in d["versions"]] == list(range(1, d["mission"]["version"] + 1))
    for r in d["runs"]:
        assert not errors("run.schema.json", r)


def test_api_events_fixture():
    ev = load(API / "events.json")
    assert set(ev) == {"events", "next", "more"}
    ids = [e["id"] for e in ev["events"]]
    assert ids == sorted(ids) and ev["next"] == ids[-1]
    for e in ev["events"]:
        body = {k: v for k, v in e.items() if k != "id"}
        assert not errors("event.schema.json", body), e["id"]


@pytest.mark.parametrize("path", [p for p in API_FIXTURES if p.stem.startswith("error-")], ids=lambda p: p.name)
def test_api_error_fixture(path):
    body = load(path)
    assert list(body) == ["error"] and body["error"]


# HTTP actions (item_147): request fixtures feed the Go tests; the replies they write
# must match the record schemas.
ACTION_MISSIONS = ("action-dispatch", "action-stop", "action-cancel")


def test_api_action_fixture_set():
    names = {p.stem for p in API_FIXTURES}
    for want in (*ACTION_MISSIONS, "action-answer", "action-hide", "error-answer-stale"):
        assert want in names, want
    assert {p.stem for p in (API / "requests").glob("*.json")} == {
        "dispatch", "answer", "answer-stale", "cancel", "send", "run", "session", "prompt-answer"}


@pytest.mark.parametrize("name", ACTION_MISSIONS)
def test_api_action_mission_fixture(name):
    assert not errors("mission.schema.json", load(API / f"{name}.json"))


def test_api_action_hide_and_answer_fixtures():
    hidden = load(API / "action-hide.json")
    assert not errors("inbox.schema.json", hidden) and hidden["state"] == "dropped"
    ans = load(API / "action-answer.json")
    assert set(ans) == {"item", "verb", "file", "points", "state", "validations", "dropped"}
    assert ans["state"] == "queued" and ans["file"] == "answers.v1.md"


# Live actions (item_170): replies are action log lines.
@pytest.mark.parametrize("path", sorted(API.glob("live-*.json")), ids=lambda p: p.name)
def test_api_live_action_fixture(path):
    assert not errors("live-action.schema.json", load(path))


def test_api_live_fixture_set():
    names = {p.stem for p in API_FIXTURES}
    for want in ("live-send", "live-dispatch", "live-start", "live-dispatch-refused", "error-send-unknown-pid",
                 "live-prompt-answer", "error-prompt-stale"):
        assert want in names, want
    assert load(API / "live-dispatch-refused.json")["code"] == 1
