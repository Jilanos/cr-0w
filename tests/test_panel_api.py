import copy
import http.client
import json
from pathlib import Path
import sys
import threading

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "bin"))
from crow_panel.core import Config, Problem, canonical, lock
from crow_panel.server import App, Server
from test_panel_pending import DOCUMENT

FIXTURES = Path(__file__).parent / "fixtures/panel"


class FakeCdx:
    def __init__(self, root):
        self.root, self.active, self.calls, self.rows = root, 0, [], {}
        self.unavailable = False

    def __call__(self, argv):
        self.calls.append(argv)
        if self.unavailable:
            raise Problem(503, "upstream_unavailable", "cdx indisponible")
        if argv[1] == "runs":
            return {"ok": True, "runs": [{"run_id": str(i), "status": "running", "cwd": str(self.root)} for i in range(self.active)] if "--running" in argv else []}
        if argv[1] == "status":
            return {"ok": True, "rows": []}
        if argv[1] == "run":
            key = "fake" + str(len(self.rows))
            output = self.root / (key + ".jsonl")
            output.write_text(json.dumps({"type": "result", "result": "Réponse locale"}) + "\n")
            self.rows[key] = {"run_id": key, "status": "running", "started_at": "2026-11-18T00:00:00+00:00", "ended_at": None,
                              "artifacts": {"stdout_path": str(output)}, "model": "claude-sonnet-5-5", "exit_code": None}
            return {"ok": True, **self.rows[key]}
        if argv[1] == "run-status":
            return {"ok": True, "run": self.rows[argv[2]]}
        if argv[1] == "run-report":
            return {"ok": True, "final_message": "# Livré\nRéponse locale"}
        raise AssertionError(argv)


@pytest.fixture
def panel(tmp_path):
    pending = tmp_path / "pending.md"
    pending.write_text(DOCUMENT)
    fake = FakeCdx(tmp_path)
    cfg = Config(overrides={"crow_home": str(tmp_path), "state_dir": str(tmp_path / "state"), "locks_dir": str(tmp_path / "locks"),
                            "runs_registry": str(tmp_path / "runs.jsonl"), "pending_md": str(pending), "port": 0,
                            "files": {"roots": [str(tmp_path)]}, "routines": {"maj": {"argv": ["example-maj", "night"]}, "daily_update": {"argv": ["example-update"]}},
                            "accounts": {"claude": {"provider": "claude", "kinds": ["chat", "mail_read"]}, "workb": {"provider": "codex", "kinds": ["chat"], "models": ["gpt-5"]}}})
    app = App(cfg, fake)
    yield app, fake
    app.launcher.close()
    app.store.db.close()


def pending_item(app):
    return app.pending.view()["sections"][0]["items"][0]


def post(app, path, body):
    return app.mutate("POST", path, body)


def snapshot():
    mail = json.loads((FIXTURES / "mail-list.json").read_text())
    mail["folders"] = json.loads((FIXTURES / "mail-folders.json").read_text())["folders"]
    mail["exhausted"] = True
    mail["coverage"]["collected"] = len(mail["items"])
    return mail


def test_fixture_view_shapes_and_empty_example(panel):
    app, _ = panel
    for route, name in (("/api/config", "config-public.json"), ("/api/pending", "pending-empty.json"), ("/api/state", "state.json"),
                        ("/api/mail", "mail-list-empty.json"), ("/api/mail/folders", "mail-folders.json"), ("/api/runs", "runs.json"),
                        ("/api/drafts", "drafts.json"), ("/api/accounts", "accounts.json"), ("/api/dues", "dues.json"), ("/api/dossiers", "dossiers.json"),
                        ("/api/routines", "routines.json"), ("/api/afk", "afk.json"), ("/api/capabilities", "capabilities.json"), ("/api/topics", "topics.json")):
        result = app.get(route, {})
        expected = json.loads((FIXTURES / name).read_text())
        assert set(result) == set(expected), route
    public = canonical(app.public_config())
    assert str(app.cfg.state) not in public and "real_home" not in public


def test_idempotence_and_mismatch(panel):
    app, _ = panel
    item = pending_item(app)
    path = "/api/pending/" + item["id"] + "/done"
    body = {"request_id": "same", "item_rev": item["item_rev"]}
    status, op = post(app, path, body)
    assert status == 200 and op["status"] == "succeeded"
    assert post(app, path, body) == (status, op)
    with pytest.raises(Problem) as err:
        post(app, path, {**body, "note": "different"})
    assert err.value.body["error"]["code"] == "idempotency_mismatch"
    assert len(list((app.cfg.state / "backups").glob("*"))) == 1


def test_visit_checkpoint_is_explicit_durable_and_idempotent(panel):
    app, fake = panel
    assert app.readers.state()["since_last_visit"] is None
    body = {"request_id": "visit"}
    response = post(app, "/api/state/visit", body)
    baseline = app.store.get("meta", "visit")
    assert post(app, "/api/state/visit", body) == response
    assert app.readers.state()["since_last_visit"]["items"] == []
    item = pending_item(app)
    post(app, "/api/pending/" + item["id"] + "/done", {"request_id": "visited-done", "item_rev": item["item_rev"]})
    app.mail.publish(snapshot())
    changes = app.readers.state()["since_last_visit"]
    assert any(i["change"] == "removed" and i["text"] == item["title"] for i in changes["items"])
    assert any(i["ref"]["kind"] == "mail" for i in changes["items"])
    assert app.store.get("meta", "visit") == baseline
    restarted = App(app.cfg, fake)
    assert restarted.readers.state()["since_last_visit"] == changes
    restarted.store.db.close()


def test_visit_recovers_a_lost_http_response_without_moving_checkpoint(panel):
    app, fake = panel
    body = {"request_id": "lost-visit"}
    op = app.visits.visit(body, "POST /api/state/visit")
    checkpoint = app.store.get("meta", "visit")
    op["status"] = "running"
    app.store.save_op(op)
    restarted = App(app.cfg, fake)
    status, recovered = post(restarted, "/api/state/visit", body)
    assert status == 200 and recovered["operation_id"] == op["operation_id"] and recovered["status"] == "succeeded"
    assert restarted.store.get("meta", "visit") == checkpoint
    assert len(restarted.store.all("operations")) == 1
    restarted.store.db.close()


def test_lock_blocks_display_and_mutation(panel):
    app, _ = panel
    item = pending_item(app)
    with lock(app.cfg.locks, "pending"):
        assert app.pending.view()["writable"] is False
        with pytest.raises(Problem) as err:
            post(app, "/api/pending/" + item["id"] + "/done", {"request_id": "locked", "item_rev": item["item_rev"]})
        assert err.value.status == 423


@pytest.mark.parametrize("action,extra", [("done", {}), ("snooze", {"workdays": 2})])
def test_pending_queue_survives_restart_then_applies_once(panel, action, extra):
    app, fake = panel
    item = next(i for s in app.pending.view()["sections"] for i in s["items"] if action in i["actions"])
    route = "/api/pending/" + item["id"] + "/" + action
    body = {"request_id": "queued-pending", "queue": True, "item_rev": item["item_rev"], **extra}
    before = Path(app.cfg["pending_md"]).read_bytes()
    with lock(app.cfg.locks, "pending"):
        status, op = post(app, route, body)
        assert status == 202 and op["status"] == "queued"
        assert post(app, route, body) == (status, op)
        assert app.readers.runs()["queue"][0]["waiting_for"] == "maj"
        restarted = App(app.cfg, fake)
        restarted.launcher.tick()
        assert restarted.operation(op["operation_id"])["status"] == "queued"
        assert Path(app.cfg["pending_md"]).read_bytes() == before
    restarted.launcher.tick()
    result = restarted.operation(op["operation_id"])
    assert result["status"] == "succeeded" and result["undo"]["available"]
    assert len(list((app.cfg.state / "backups").glob("*"))) == 1
    restarted.launcher.tick()
    post(restarted, result["links"]["status_url"] + "/undo", {"request_id": "queued-undo"})
    assert Path(app.cfg["pending_md"]).read_bytes() == before
    assert not any(c[1] == "run" for c in fake.calls)
    restarted.store.db.close()


@pytest.mark.parametrize("cancel", [False, True])
def test_queued_pending_cancels_or_conflicts_without_writing(panel, cancel):
    app, _ = panel
    item = pending_item(app)
    with lock(app.cfg.locks, "pending"):
        _, op = post(app, "/api/pending/" + item["id"] + "/done", {"request_id": "queued", "queue": True, "item_rev": item["item_rev"]})
    if cancel:
        post(app, op["links"]["status_url"] + "/cancel", {"request_id": "cancel-pending"})
    else:
        path = Path(app.cfg["pending_md"])
        path.write_text(path.read_text().replace(item["title"], "Edited subject"))
    before = Path(app.cfg["pending_md"]).read_bytes()
    app.launcher.tick()
    result = app.operation(op["operation_id"])
    assert result["status"] == ("cancelled" if cancel else "failed")
    assert Path(app.cfg["pending_md"]).read_bytes() == before
    assert not list((app.cfg.state / "backups").glob("*"))


def test_dossier_recent_files_sorted_bounded_and_rooted(panel, tmp_path):
    import os
    app, _ = panel
    root = tmp_path / "dossier"
    root.mkdir()
    for n in range(13):
        file = root / (str(n) + ".txt")
        file.write_text(str(n))
        os.utime(file, (1000 + n, 1000 + n))
    nested = root / "one/two"
    nested.mkdir(parents=True)
    (nested / "inside.txt").write_text("depth two")
    (nested / "three").mkdir()
    (nested / "three/excluded.txt").write_text("too deep")
    outside = tmp_path / "outside.txt"
    outside.write_text("another folder")
    (root / "escape.txt").symlink_to(outside)
    (root / "loop").symlink_to(root, target_is_directory=True)
    result, note = app.readers.recent_files(app.files.register(root), {"last_crow_at": "1970-01-01T00:16:49+00:00"})
    assert len(result) == 10 and result[0]["name"] == "one/two/inside.txt"
    assert [f["modified"] for f in result] == sorted((f["modified"] for f in result), reverse=True)
    assert all(f["name"] not in ("escape.txt", "loop") and "excluded" not in f["name"] for f in result)
    assert result[1]["modified_after_crow"] is True
    assert result[-1]["modified_after_crow"] is False
    assert all(app.files.resolve(f["file_id"]).is_relative_to(root) for f in result)
    unknown, note = app.readers.recent_files(app.files.register(root), {})
    assert all(f["modified_after_crow"] is None for f in unknown) and "inconnue" in note
    assert app.readers.recent_files(None, {})[0] is None


def test_dossier_detail_uses_private_folder_and_version_reference(panel, tmp_path):
    app, _ = panel
    root = tmp_path / "project"
    root.mkdir()
    version = root / "review.md"
    version.write_text("review")
    path = Path(app.cfg["pending_md"])
    path.write_text(path.read_text() + "\n## 📁 Dossiers\n### Example project\n- Open item\n")
    app.cfg["dossiers"] = {"example-project": {"path": str(root), "label": "Project", "crow_version_file": str(version)}}
    result = app.readers.dossier("example-project")
    assert result["recent_files"][0]["modified_after_crow"] is False
    assert str(root) not in canonical(result)
    version.unlink()
    result = app.readers.dossier("example-project")
    assert result["recent_files"] == [] and "inconnue" in result["recent_files_note"]


def test_chat_queue_cancel_admission_and_continuation(panel):
    app, fake = panel
    topic = pending_item(app)["topic_id"]
    path = "/api/topics/" + topic + "/messages"
    fake.active = 2
    _, op = post(app, path, {"request_id": "a", "text": "Un résumé"})
    app.launcher.tick()
    assert app.operation(op["operation_id"])["status"] == "queued"
    assert len(app.readers.runs()["queue"]) == 1
    _, cancelled = post(app, op["links"]["status_url"] + "/cancel", {"request_id": "cancel"})
    assert cancelled["status"] == "cancelled"
    fake.active = 0
    _, op = post(app, path, {"request_id": "b", "text": "Un résumé"})
    app.launcher.tick()
    live = app.operation(op["operation_id"])
    rid = live["steps"][0]["run_id"]
    assert rid
    fake.rows[rid].update(status="succeeded", ended_at="2026-11-18T00:01:00+00:00", exit_code=0)
    app.launcher.tick()
    assert app.operation(op["operation_id"])["status"] == "succeeded"
    _, second = post(app, path, {"request_id": "c", "text": "Encore"})
    app.launcher.tick()
    cmd = next(c for c in reversed(fake.calls) if c[1] == "run")
    assert cmd[cmd.index("--continue-run") + 1] == rid
    assert "--model" not in cmd  # cdx pins the measured parent model.
    import shlex
    extra = shlex.split(cmd[cmd.index("--extra-args") + 1])
    settings = json.loads(Path(extra[extra.index("--settings") + 1]).read_text())
    assert {"Read", "Grep", "Glob", "Bash", "Write"}.issubset(settings["permissions"]["deny"])
    assert "--strict-mcp-config" in extra
    registry = [json.loads(line) for line in Path(app.cfg["runs_registry"]).read_text().splitlines()]
    assert all(r["source"] == "panel" and r["operation_id"] and r["topic_id"] == topic for r in registry)


def test_upstream_suspends_new_runs_and_preserves_cache(panel):
    app, fake = panel
    app.launcher.running()
    fake.unavailable = True
    topic = pending_item(app)["topic_id"]
    with pytest.raises(Problem) as err:
        post(app, "/api/topics/" + topic + "/messages", {"request_id": "no", "text": "Hi"})
    assert err.value.status == 503
    assert app.launcher.running() == []
    assert app.get("/api/pending", {})["sections"]


def test_mail_policy_and_model_validation(panel):
    app, _ = panel
    topic = app.launcher.topic("mail", "conversation", "Example")
    with pytest.raises(Problem) as err:
        post(app, "/api/topics/" + topic + "/messages", {"request_id": "a", "text": "Hi", "account": "workb", "model": "gpt-5"})
    assert err.value.body["error"]["code"] == "policy_denied"
    with pytest.raises(Problem) as err:
        post(app, "/api/topics/" + topic + "/messages", {"request_id": "a", "text": "Hi", "model": "invalid"})
    assert err.value.body["error"]["code"] == "invalid_model"


def test_snapshot_pagination_partial_and_reintroduced_old_mail(panel):
    app, _ = panel
    value = snapshot()
    template = value["items"][0]
    value["items"] = [{**template, "id": "message" + str(i)} for i in range(1300)]
    assert app.mail.publish(value)["coverage"]["collected"] == 1300
    ids, cursor = [], ""
    while True:
        page = app.mail.list({"limit": ["50"], "cursor": [cursor]})
        ids.extend(i["id"] for i in page["items"])
        cursor = page["next_cursor"]
        if not cursor:
            break
    assert len(set(ids)) == 1300
    before = app.mail.snapshot_path.read_bytes()
    broken = copy.deepcopy(value)
    broken["coverage"]["status"] = "partial"
    broken["items"] = broken["items"][:100]
    assert app.mail.publish(broken)["published"] is False
    assert app.mail.snapshot_path.read_bytes() == before
    value["items"] = [{**template, "id": "old-restored", "received": "2024-01-01T00:00:00+00:00"}]
    app.mail.publish(value)
    assert app.mail.list({})["items"][0]["id"] == "old-restored"


def test_hostile_mail_is_text_and_missing_draft_not_sent(panel):
    app, _ = panel
    value = snapshot()
    value["items"][0]["preview"] = '<script>evil()</script><b>Hello</b>'
    value["items"][0]["body_text"] = '<img src=x onerror=evil()>Safe'
    value["items"][0]["owa_link"] = 'javascript:evil()'
    value["drafts"] = [{"id": "draft", "state": "sent", "subject": "Example"}]
    app.mail.publish(value)
    assert app.mail.list({})["items"][0]["preview"] == "Hello"
    detail = app.mail.detail(value["items"][0]["id"])
    assert detail["body_text"] == "Safe" and detail["owa_link"] is None
    assert app.mail.drafts()["items"][0]["state"] == "missing"


def test_triage_immutable_plan_consumption_expiry_undo_and_dry_reply(panel):
    app, fake = panel
    app.mail.publish(snapshot())
    rows = app.mail.list({})["items"]
    _, plan = post(app, "/api/mail/triage/plan", {"request_id": "plan", "snapshot_rev": app.mail.raw()["snapshot_rev"],
                    "items": [{"message_id": rows[0]["id"], "action": "archive"}, {"message_id": rows[1]["id"], "action": "trash"}]})
    assert plan["summary"]["rejected"] == 1
    body = {"request_id": "execute", "plan_id": plan["plan_id"], "plan_hash": plan["plan_hash"], "confirm": True}
    _, op = post(app, "/api/mail/triage/execute", body)
    with pytest.raises(Problem) as err:
        post(app, "/api/mail/triage/execute", {**body, "request_id": "again"})
    assert err.value.body["error"]["code"] == "plan_consumed"
    app.launcher.tick()
    op = app.operation(op["operation_id"])
    assert op["status"] == "succeeded" and op["result"]["simulated"]
    _, undo = post(app, op["links"]["status_url"] + "/undo", {"request_id": "undo"})
    app.launcher.tick()
    assert app.operation(undo["operation_id"])["status"] == "succeeded"
    _, reply = post(app, "/api/mail/" + rows[0]["id"] + "/reply-all", {"request_id": "reply", "instructions": "Réponse concise"})
    app.launcher.tick()
    reply = app.operation(reply["operation_id"])
    assert [s["name"] for s in reply["steps"]] == ["skeleton", "style", "verify"]
    assert reply["steps"][1]["account"] == "worka"
    assert all(s["run_id"] == "simulated" for s in reply["steps"])
    assert not any(c[1] == "run" for c in fake.calls)
    another = app.mail.plan({"snapshot_rev": app.mail.raw()["snapshot_rev"], "items": [{"message_id": rows[0]["id"], "action": "archive"}]})
    app.mail.publish(snapshot())
    with pytest.raises(Problem) as err:
        app.mail.execute({"plan_id": another["plan_id"], "plan_hash": another["plan_hash"], "confirm": True}, "/execute")
    assert err.value.body["error"]["code"] == "plan_expired"


def test_routine_dry_run_never_executes_command(panel):
    app, fake = panel
    _, op = post(app, "/api/routines/daily_update", {"request_id": "routine"})
    assert app.launcher.maintenance()
    app.launcher.tick()
    assert app.operation(op["operation_id"])["result"]["simulated"]
    assert not app.launcher.maintenance()
    assert not any(c[1] == "run" for c in fake.calls)


def test_file_escape_symlink_and_segments(panel, tmp_path):
    app, _ = panel
    outside = tmp_path.parent / "panel-outside"
    outside.write_text("private")
    symlink = tmp_path / "escape"
    symlink.symlink_to(outside)
    assert app.files.register(symlink) is None
    assert app.files.register(tmp_path / ".." / "panel-outside") is None
    allowed = tmp_path / "inside.html"
    allowed.write_text("<script>evil()</script>")
    key = app.files.register(allowed)
    allowed.unlink()
    allowed.symlink_to(outside)
    with pytest.raises(Problem):
        app.files.resolve(key)
    segments = app.files.segments("[bad](javascript:evil) [ok](https://example.org/)")
    assert all(s.get("href", "https:").startswith("https:") for s in segments)
    outside.unlink()


@pytest.fixture
def http_panel(panel):
    app, fake = panel
    server = Server(app)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield app, server
    server.shutdown()
    server.server_close()
    thread.join()


def request(server, method, path, data=None, headers=None):
    conn = http.client.HTTPConnection(*server.server_address, timeout=5)
    body = json.dumps(data) if data is not None else None
    conn.request(method, path, body, headers or {})
    response = conn.getresponse()
    status, hdr, raw = response.status, dict(response.getheaders()), response.read()
    conn.close()
    return status, hdr, raw


def auth(app):
    return {"Cookie": "crow_session=" + app.session, "X-Crow-Token": app.csrf, "Origin": "http://127.0.0.1:" + str(app.port), "Content-Type": "application/json"}


def test_http_security_cookie_csrf_host_origin_and_size(http_panel):
    app, server = http_panel
    status, headers, _ = request(server, "GET", "/")
    assert status == 200 and "HttpOnly; SameSite=Strict" in headers["Set-Cookie"]
    assert "frame-ancestors 'none'" in headers["Content-Security-Policy"]
    assert request(server, "GET", "/api/session")[0] == 403
    assert request(server, "GET", "/api/session", headers=auth(app))[0] == 200
    for changes in ({"Origin": "http://evil.example"}, {"Host": "evil.example"}, {"X-Crow-Token": "bad"}, {"Cookie": ""}, {"Origin": ""}):
        assert request(server, "POST", "/api/mail/sync", {"request_id": "x"}, {**auth(app), **changes})[0] == 403
    assert request(server, "POST", "/api/mail/sync", {"text": "x" * 300000}, auth(app))[0] == 413
    path = app.cfg.state / "test.html"
    path.write_text("<b>text</b>")
    key = app.files.register(path)
    assert request(server, "GET", "/api/files/" + key, headers=auth(app))[1]["Content-Type"].startswith("text/plain")
    assert request(server, "GET", "/api/files/../../etc/passwd", headers=auth(app))[0] == 404


def test_sse_persistent_replay_without_duplicates(http_panel):
    app, server = http_panel
    item = pending_item(app)
    _, op = post(app, "/api/pending/" + item["id"] + "/done", {"request_id": "sse", "item_rev": item["item_rev"]})
    key = op["operation_id"]
    events = app.store.events(key)
    assert events[-1]["event"] == "done"
    status, headers, raw = request(server, "GET", op["links"]["events_url"], headers=auth(app))
    assert status == 200 and b"event: done" in raw
    status, _, raw = request(server, "GET", op["links"]["events_url"], headers={**auth(app), "Last-Event-ID": str(events[-1]["id"])})
    assert status == 200 and raw == b""


def test_missing_result_unknown_never_relaunches(panel):
    app, fake = panel
    _, op = post(app, "/api/mail/sync", {"request_id": "sync"})
    app.launcher.tick()
    op = app.operation(op["operation_id"])
    rid = op["steps"][0]["run_id"]
    fake.rows[rid].update(ended_at="2026-11-18T00:01:00+00:00", exit_code=0, status="succeeded")
    app.launcher.tick()
    assert app.operation(op["operation_id"])["status"] == "unknown"
    count = len([c for c in fake.calls if c[1] == "run"])
    app.launcher.tick()
    assert len([c for c in fake.calls if c[1] == "run"]) == count


def test_journal_recovers_lost_http_response_without_rewrite(panel):
    app, _ = panel
    item = pending_item(app)
    path = "/api/pending/" + item["id"] + "/done"
    body = {"request_id": "lost", "item_rev": item["item_rev"]}
    op = app.pending.mutate(item["id"], "done", body, "POST " + path)
    op["status"] = "running"
    app.store.save_op(op)
    before = Path(app.cfg["pending_md"]).read_bytes()
    app.pending.recover()
    _, same = post(app, path, body)
    assert same["operation_id"] == op["operation_id"]
    assert Path(app.cfg["pending_md"]).read_bytes() == before
    assert len(list((app.cfg.state / "backups").glob("*"))) == 1


def test_live_mail_is_blocked_without_proof(panel):
    app, fake = panel
    app.mail.publish(snapshot())
    app.cfg["mode"] = "live"
    key = app.mail.raw()["items"][0]["id"]
    with pytest.raises(Problem) as err:
        post(app, "/api/mail/" + key + "/reply-all", {"request_id": "live", "instructions": "reply"})
    assert err.value.body["error"]["code"] == "capability_unavailable"
    assert not any(c[1] == "run" for c in fake.calls)


def test_live_reply_pipeline_persists_draft_before_styling_and_restart(panel, tmp_path):
    app, fake = panel
    app.mail.publish(snapshot())
    app.cfg["mode"] = "live"
    app.cfg["mail"]["draft_app_id"] = "draft_only_example"
    app.cfg["mail"]["style_rules"] = str(tmp_path / "style.md")
    app.cfg["work_handoff_dir"] = str(tmp_path / "handoff")
    Path(app.cfg["mail"]["style_rules"]).write_text("Concise, no send.")
    (tmp_path / "local").mkdir(exist_ok=True)
    (tmp_path / "local/owner-prefs.md").write_text("Drafts only.")
    proof = {name: {k: {"ok": True, "at": "2026-11-18T00:00:00+00:00", "detail": "fixture proof"} for k in ("schema", "headless_probe", "permissions", "live_trial")} for name in ("draft_skeleton", "draft_style")}
    (app.cfg.state / "capabilities.json").write_text(json.dumps(proof))
    key = app.mail.raw()["items"][0]["id"]
    _, op = post(app, "/api/mail/" + key + "/reply-all", {"request_id": "live", "instructions": "Reply concisely"})
    app.launcher.tick()
    current = app.operation(op["operation_id"])
    rid = current["steps"][-1]["run_id"]
    job = app.store.get("jobs", op["operation_id"])
    Path(job["output"]).write_text(json.dumps({"draft_id": "draft-one", "replied_message_id": key, "to": [], "cc": [], "thread_text": "untrusted", "evidence": ["tool fixture"]}))
    Path(fake.rows[rid]["artifacts"]["stdout_path"]).write_text(json.dumps({"message": {"content": [{"type": "tool_use", "name": "mcp__M365__outlook_create_reply_all_draft", "input": {"messageId": key}}]}}) + "\n")
    fake.rows[rid].update(ended_at="2026-11-18T00:01:00+00:00", exit_code=0, status="succeeded")
    app.launcher.tick()
    saved = app.operation(op["operation_id"])
    assert saved["result"]["draft_id"] == "draft-one" and saved["steps"][-1]["name"] == "style"
    restarted = App(app.cfg, fake)
    restarted.launcher.tick()
    cmd = next(c for c in reversed(fake.calls) if c[1] == "run")
    assert cmd[2] == "worka" and "--power" in cmd
    assert 'apps._default.enabled=false' in cmd[cmd.index("--extra-args") + 1]
    saved = restarted.operation(op["operation_id"])
    rid = saved["steps"][-1]["run_id"]
    output = Path(fake.rows[rid]["artifacts"]["stdout_path"])
    output.write_text(json.dumps({"type": "result", "result": json.dumps({"draft_id": "draft-one", "updated": True, "evidence": ["fixture"]})}) + "\n")
    # Codex's final envelope differs from Claude's.
    output.write_text(json.dumps({"type": "item.completed", "item": {"type": "agent_message", "text": json.dumps({"draft_id": "draft-one", "updated": True, "evidence": ["fixture"]})}}) + "\n")
    fake.rows[rid].update(ended_at="2026-11-18T00:02:00+00:00", exit_code=0, status="succeeded")
    restarted.launcher.tick()
    assert restarted.operation(op["operation_id"])["steps"][-1]["name"] == "verify"
    assert len([c for c in fake.calls if c[1] == "run" and c[2] == "claude"]) == 1
    restarted.store.db.close()


def test_utf8_tail_waits_for_complete_line_and_redacts(panel, tmp_path):
    app, _ = panel
    op = app.store.operation("chat.message", {"request_id": "tail"}, "Example")
    path = tmp_path / "utf8.jsonl"
    line = json.dumps({"message": {"content": [{"type": "text", "text": "Été https://example.org/?sig=secret"}]}}, ensure_ascii=False).encode() + b"\n"
    path.write_bytes(line[:line.index("É".encode()) + 1])
    row = {"run_id": "tail", "stdout_path": str(path)}
    app.launcher.tail(op, row)
    assert app.store.events("tail") == []
    path.write_bytes(line)
    app.launcher.tail(op, row)
    events = app.store.events("tail")
    assert len(events) == 1 and "Été" in events[0]["data"]["text"] and "secret" not in canonical(events)
    app.launcher.tail(op, row)
    assert app.store.events("tail") == events


def test_maintenance_waits_then_streams_failed_script_and_legacy_reader(panel, tmp_path, monkeypatch):
    import runpy
    import time
    app, fake = panel
    app.cfg["mode"] = "live"
    app.cfg["routines"]["daily_update"]["argv"] = [sys.executable, "-u", "-c", 'print("script progress"); raise SystemExit(3)']
    fake.active = 1
    _, op = post(app, "/api/routines/daily_update", {"request_id": "maintenance-live"})
    app.launcher.tick()
    assert app.operation(op["operation_id"])["steps"][0]["status"] == "running"
    assert app.launcher.maintenance()
    fake.active = 0
    for _ in range(50):
        app.launcher.tick()
        op = app.operation(op["operation_id"])
        if op["status"] not in ("queued", "running"):
            break
        time.sleep(0.01)
    assert op["status"] == "failed" and op["result"]["exit_code"] == 3
    assert not app.launcher.maintenance()
    assert any("script progress" in e["data"].get("text", "") for e in app.store.events(op["operation_id"]))
    monkeypatch.setenv("CROW_ACCOUNT", "claude")
    monkeypatch.setenv("CROW_HOME", str(tmp_path))
    legacy = runpy.run_path(str(Path(__file__).resolve().parents[1] / "bin/crow-runs"), run_name="panel_reader_test")
    legacy["ledger"].__globals__["LEDGER"] = Path(app.cfg["runs_registry"])
    rows = legacy["ledger"]()
    assert rows[-1]["kind"] == "script" and rows[-1]["status"] == "failed"


def test_example_config_alone_and_non_loopback_rejected(tmp_path):
    fake = FakeCdx(tmp_path)
    cfg = Config(Path(__file__).resolve().parents[1] / "docs/panel.example.yaml", overrides={
        "crow_home": str(tmp_path), "state_dir": str(tmp_path / "state"), "locks_dir": str(tmp_path / "locks"), "runs_registry": str(tmp_path / "runs.jsonl")})
    app = App(cfg, fake)
    assert app.pending.view()["sections"] == []
    assert app.readers.state()["counts"]["pending"] == 0
    assert app.mail.list({})["coverage"]["status"] == "none"
    app.store.db.close()
    with pytest.raises(ValueError):
        Config(overrides={"host": "0.0.0.0"})


def test_real_transcript_shapes_and_intentional_probe_denial(panel):
    app, fake = panel
    _, op = post(app, "/api/mail/sync", {"request_id": "probe-shapes", "probe": True})
    app.launcher.tick()
    live = app.operation(op["operation_id"])
    job = app.store.get("jobs", op["operation_id"])
    rid = live["steps"][-1]["run_id"]
    log = Path(fake.rows[rid]["artifacts"]["stdout_path"])
    entries = [
        {"type": "user", "message": {"content": "The actual provider stores prompts as strings."}},
        {"type": "assistant", "message": {"content": [{"type": "tool_use", "name": "mcp__M365__outlook_email_search", "input": {}}]}},
        {"type": "assistant", "message": {"content": [{"type": "tool_use", "name": "mcp__M365__get_me", "input": {}}]}},
        {"type": "user", "message": {"content": [{"type": "tool_result", "content": "Panel action policy denied this tool."}]}},
        {"type": "assistant", "message": {"content": [{"type": "tool_use", "name": "ListMcpResourcesTool", "input": {"server": "M365"}}]}},
    ]
    log.write_text("".join(json.dumps(v) + "\n" for v in entries))
    value = snapshot()
    value["probe"] = {"tools": ["mcp__M365__outlook_email_search"], "denied_tool": {"name": "get_me", "blocked": True}}
    Path(job["output"]).write_text(json.dumps(value))
    fake.rows[rid].update(ended_at="2026-11-18T00:01:00+00:00", exit_code=0, status="succeeded")
    app.launcher.tick()
    assert app.operation(op["operation_id"])["status"] == "succeeded"
    caps = app.mail.capabilities()
    read = next(c for c in caps["capabilities"] if c["name"] == "mail_read")
    assert read["allowed"] and read["evidence"]["permissions"]["ok"]
    assert all("actual provider stores" not in e["data"].get("text", "") for e in app.store.events(rid))


def test_restart_marks_unfinished_acceptance_unknown(panel):
    app, fake = panel
    op = app.store.operation("mail.reply_all", {"request_id": "interrupted"}, "Example")
    restarted = App(app.cfg, fake)
    assert restarted.operation(op["operation_id"])["status"] == "unknown"
    assert not any(c[1] == "run" for c in fake.calls)
    restarted.store.db.close()


def test_repeated_pending_reads_do_not_rewrite_durable_state(panel):
    app, _ = panel
    before = app.pending.view()
    changes = app.store.db.total_changes
    after = app.pending.view()
    assert after["sections"] == before["sections"]
    assert app.store.db.total_changes == changes
    topic = app.topic(before["sections"][0]["items"][0]["topic_id"])
    topic["default_model"] = "haiku"
    app.store.put("topics", topic["topic_id"], topic)
    assert app.topic(topic["topic_id"])["default_model"] == "haiku"


def test_public_chat_models_match_account_policy(panel):
    app, _ = panel
    config = app.public_config()
    topic = app.topic(app.launcher.topic("project", "models-contract", "Model selection"))
    for account in config["chat"]["accounts"]:
        for model in account["models"]:
            selected = app.launcher.select(topic, {"account": account["name"], "model": model})
            assert selected[:2] == (account["name"], model)
    assert "pending_md" not in config and "real_home" not in config


@pytest.mark.parametrize('violation', ['extra_id', 'wrong_folder', 'categories', 'conversation', 'unknown_tool', 'missing_hook'])
def test_triage_transcript_violation_is_partial_and_alerted(panel, tmp_path, violation):
    from crow_panel.security import write_policy
    app, fake = panel
    op = app.store.operation('mail.triage.execute', {'request_id': violation}, 'Confirmed batch')
    item = {'message_id': 'one', 'folder_id': 'target', 'source_folder_id': 'inbox', 'action': 'move'}
    job = app.mail.triage_job(op, {'items': [item]})
    op.update(status='succeeded', steps=[{'name': 'execute'}])
    write_policy(app.cfg, op['operation_id'], 'triage', Path(job['output']), job['manifest'])
    name, arguments = 'mcp__M365__outlook_modify_labels', {'messageId': 'one', 'moveToFolderId': 'target'}
    if violation == 'extra_id':
        arguments['messageId'] = 'outside'
    elif violation == 'wrong_folder':
        arguments['moveToFolderId'] = 'other'
    elif violation == 'categories':
        arguments['categories'] = ['unconfirmed']
    elif violation == 'conversation':
        name = 'mcp__M365__outlook_modify_thread_labels'
    elif violation == 'unknown_tool':
        name = 'mcp__M365__unexpected_writer'
    else:
        (app.cfg.state / 'ops' / op['operation_id'] / 'policy.json').unlink()
    transcript = tmp_path / 'triage-transcript.jsonl'
    transcript.write_text(json.dumps({'message': {'content': [{'type': 'tool_use', 'name': name, 'input': arguments}]}}) + '\n')
    Path(job['output']).write_text(json.dumps({'items': [{'message_id': 'one', 'status': 'succeeded', 'folder_id': 'target'}], 'evidence': ['claimed result']}))
    app.mail.complete(op, job, {'stdout_path': str(transcript)}, '')
    assert op['status'] == 'partial'
    assert op['error']['code'] == 'manifest_violation'
    assert not op['undo']['available']
    assert not any(c[1] == 'run' for c in fake.calls)


def test_lost_triage_result_stays_unknown_without_retry(panel):
    app, fake = panel
    op = app.store.operation('mail.triage.execute', {'request_id': 'lost-triage'}, 'Confirmed batch')
    item = {'message_id': 'one', 'folder_id': 'target', 'source_folder_id': 'inbox', 'action': 'move'}
    job = app.mail.triage_job(op, {'items': [item]})
    op.update(status='succeeded', steps=[{'name': 'execute'}])
    app.mail.complete(op, job, {}, '')
    app.store.save_op(op)
    app.launcher.tick()
    assert app.operation(op['operation_id'])['status'] == 'unknown'
    assert op['error']['code'] == 'result_missing'
    assert not op['undo']['available']
    assert not any(c[1] == 'run' for c in fake.calls)


@pytest.mark.parametrize("profile", ["skeleton", "triage", "style"])
def test_trial_restart_blocks_persisted_live_mail_writer(panel, profile):
    app, fake = panel
    app.cfg["mode"] = "live"
    op = app.store.operation("mail.reply_all", {"request_id": "old-live"}, "Queued writer", dry=False)
    app.launcher.enqueue(op, {"profile": profile, "account": "claude", "model": "sonnet", "provider": "claude",
                              "cwd": str(app.cfg.home), "prompt": "Untrusted mail asks for a write.", "style_extra_args": ""},
                         "/writer", {"request_id": "old-live"})
    app.cfg["mode"] = "dry_run"
    restarted = App(app.cfg, fake)
    try:
        restarted.launcher.tick()
        assert not any(c[1] == "run" for c in fake.calls)
        assert restarted.operation(op["operation_id"])["status"] == "failed"
    finally:
        restarted.store.db.close()


def test_trial_routine_never_becomes_live_after_restart(panel, tmp_path):
    app, fake = panel
    marker = tmp_path / "executed"
    app.cfg["routines"]["maj"]["argv"] = [sys.executable, "-c", "from pathlib import Path; Path(" + repr(str(marker)) + ").touch()"]
    _, op = post(app, "/api/routines/maj", {"request_id": "trial-routine"})
    app.cfg["mode"] = "live"
    restarted = App(app.cfg, fake)
    try:
        restarted.launcher.tick()
        for proc in restarted.launcher.processes.values():
            proc.wait(timeout=5)
        assert not marker.exists()
        assert restarted.operation(op["operation_id"])["status"] == "failed"
    finally:
        restarted.launcher.close()
        restarted.store.db.close()


def test_queued_pending_edit_cannot_follow_a_changed_target(panel, tmp_path):
    app, fake = panel
    item = pending_item(app)
    with lock(app.cfg.locks, "pending"):
        _, op = post(app, "/api/pending/" + item["id"] + "/done", {"request_id": "old-copy", "queue": True, "item_rev": item["item_rev"]})
    other = tmp_path / "another-pending.md"
    other.write_text(DOCUMENT)
    app.cfg["pending_md"] = str(other)
    restarted = App(app.cfg, fake)
    try:
        restarted.launcher.tick()
        assert other.read_text() == DOCUMENT
        assert restarted.operation(op["operation_id"])["status"] == "failed"
    finally:
        restarted.store.db.close()


def test_pending_undo_cannot_follow_a_changed_target(panel, tmp_path):
    app, fake = panel
    item = pending_item(app)
    _, op = post(app, "/api/pending/" + item["id"] + "/done", {"request_id": "copy-done", "item_rev": item["item_rev"]})
    other = tmp_path / "another-pending.md"
    data = app.pending.read_bytes()
    other.write_bytes(data)
    app.cfg["pending_md"] = str(other)
    restarted = App(app.cfg, fake)
    try:
        with pytest.raises(Problem) as err:
            post(restarted, op["links"]["status_url"] + "/undo", {"request_id": "copy-undo"})
        assert err.value.body["error"]["code"] == "policy_denied"
        assert other.read_bytes() == data
    finally:
        restarted.store.db.close()


def test_unavailable_maj_status_blocks_pending_writes(panel):
    app, fake = panel
    item = pending_item(app)
    fake.unavailable = True
    app.launcher.cache.clear()
    before = app.pending.read_bytes()
    with pytest.raises(Problem) as err:
        post(app, "/api/pending/" + item["id"] + "/done", {"request_id": "unknown-maj", "item_rev": item["item_rev"]})
    assert err.value.status == 423
    assert not app.pending.view()["writable"]
    assert app.pending.read_bytes() == before


def test_nested_log_secrets_are_redacted_before_persistence(panel):
    app, _ = panel
    payload = {"text": 'Tool response: {"refresh_token":"refresh-secret","api_key":"key-secret"}',
               "nested": {"authorization": "Basic basic-secret", "text": "X-Crow-Token: csrf-secret"}}
    app.store.event("safe-stream", "text", payload)
    persisted = canonical(app.store.events("safe-stream")) + (app.cfg.state / "events/safe-stream.jsonl").read_text()
    assert all(secret not in persisted for secret in ("refresh-secret", "key-secret", "basic-secret", "csrf-secret"))


def test_run_reports_do_not_expose_credentials(panel, tmp_path):
    app, _ = panel
    report = tmp_path / "report.md"
    report.write_text('# Result\nAuthorization: Basic credential-secret\nX-Crow-Token: cookie-secret\n')
    app.store.put("runs", "report-run", {"run_id": "report-run", "task_report": str(report)})
    rendered = canonical(app.readers.run("report-run"))
    assert "credential-secret" not in rendered and "cookie-secret" not in rendered



def test_worker_failure_closes_the_operation_event_stream(panel):
    app, _ = panel
    app.cfg["mode"] = "live"
    app.cfg["routines"]["maj"]["argv"] = ["missing-panel-review-executable"]
    _, op = post(app, "/api/routines/maj", {"request_id": "missing-command"})
    app.launcher.tick()
    assert app.operation(op["operation_id"])["status"] == "unknown"
    events = app.store.events(op["operation_id"])
    assert events[-1]["event"] == "done" and events[-1]["data"]["status"] == "unknown"


@pytest.mark.parametrize("evidence", ["none", "error", "wrapped_error", "success"])
def test_triage_success_requires_a_completed_tool_call(panel, tmp_path, evidence):
    from crow_panel.security import write_policy
    app, _ = panel
    op = app.store.operation("mail.triage.execute", {"request_id": "triage-proof"}, "Confirmed batch")
    item = {"message_id": "one", "folder_id": "target", "source_folder_id": "inbox", "action": "move"}
    job = app.mail.triage_job(op, {"items": [item]})
    write_policy(app.cfg, op["operation_id"], "triage", Path(job["output"]), job["manifest"])
    op.update(status="succeeded", steps=[{"name": "execute"}])
    entries = []
    if evidence != "none":
        entries = [
            {"type": "assistant", "message": {"content": [{"type": "tool_use", "id": "tool-one", "name": "mcp__M365__outlook_modify_labels",
                                                             "input": {"messageId": "one", "moveToFolderId": "target"}}]}},
            {"type": "user", "message": {"content": [{"type": "tool_result", "tool_use_id": "tool-one", "is_error": evidence == "error",
                                                        "content": '{"isError":true,"error":"access denied"}' if evidence == "wrapped_error" else "access denied" if evidence == "error" else '{"success":true}'}]}},
        ]
    transcript = tmp_path / "proof.jsonl"
    transcript.write_text("".join(json.dumps(e) + "\n" for e in entries))
    Path(job["output"]).write_text(json.dumps({"items": [{"message_id": "one", "status": "succeeded", "folder_id": "target", "new_message_id": "new-one"}],
                                               "evidence": ["claimed by final output"]}))
    app.mail.complete(op, job, {"stdout_path": str(transcript)}, "")
    if evidence == "success":
        assert op["status"] == "succeeded" and op["items"][0]["status"] == "succeeded"
    else:
        assert op["status"] == "unknown" and op["items"][0]["status"] == "unknown"
        assert not op["undo"]["available"]


@pytest.mark.parametrize("state", ["queued", "unknown"])
def test_reply_pipeline_cannot_be_repeated_while_a_draft_is_uncertain(panel, state):
    app, _ = panel
    app.mail.publish(snapshot())
    key = app.mail.raw()["items"][0]["id"]
    _, op = post(app, "/api/mail/" + key + "/reply-all", {"request_id": "first-reply", "instructions": "Reply"})
    if state == "unknown":
        op["status"] = "unknown"
        app.store.save_op(op)
    with pytest.raises(Problem) as err:
        post(app, "/api/mail/" + key + "/reply-all", {"request_id": "second-reply", "instructions": "Another reply"})
    assert err.value.body["error"]["code"] == "already_running"


def test_mail_chat_context_uses_the_latest_message_independent_of_snapshot_order(panel):
    app, _ = panel
    value = snapshot()
    newest = copy.deepcopy(value["items"][0])
    oldest = copy.deepcopy(newest)
    newest.update(id="newest", conversation_id="same-thread", received="2026-11-18T10:00:00+00:00", body_text="Latest body")
    oldest.update(id="oldest", conversation_id="same-thread", received="2026-11-17T10:00:00+00:00", body_text="Old body")
    for rows in ([newest, oldest], [oldest, newest]):
        value["items"] = rows
        app.mail.publish(value)
        context = app.store.get("contexts", app.mail.find("newest")["topic_id"])
        assert context["message_id"] == "newest" and context["body_text"] == "Latest body"
