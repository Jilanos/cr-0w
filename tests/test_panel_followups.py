import json
from pathlib import Path

import pytest

from test_panel_api import panel, pending_item, post
from crow_panel.core import Problem
from crow_panel.server import App
from crow_panel.security import hook_input


def submit(app, request_id="followup"):
    item = pending_item(app)
    return post(app, "/api/pending/" + item["id"] + "/followup", {
        "request_id": request_id, "item_rev": item["item_rev"], "instructions": "Ask for the status", "model": "sonnet"})


def check_result(status="ready", **changes):
    return {"status": status, "message_id": "latest-incoming", "conversation_id": "matching-thread", "subject": "Follow-up",
            "draft_id": "existing" if status == "existing_draft" else None, "draft_link": None,
            "sent_message_id": "sent-proof" if status == "already_sent" else None,
            "drafts_checked": True, "sent_checked": True, "evidence": ["read tool references"], **changes}


def finish_check(app, fake, op, output, proven=True):
    current = app.operation(op["operation_id"])
    job = app.store.get("jobs", current["operation_id"])
    rid = current["steps"][-1]["run_id"]
    Path(job["output"]).write_text(json.dumps(output))
    transcript = Path(fake.rows[rid]["artifacts"]["stdout_path"])
    transcript.write_text(json.dumps({"message": {"content": [{"type": "tool_use", "name": "mcp__M365__outlook_email_search" if proven else "mcp__M365__outlook_modify_labels", "input": {}}]}}) + "\n")
    fake.rows[rid].update(ended_at="2026-11-18T00:01:00+00:00", exit_code=0, status="succeeded")
    app.launcher.tick()
    return app.operation(op["operation_id"])


def test_followup_dry_run_has_four_steps_and_no_mail_run(panel):
    app, fake = panel
    status, op = submit(app)
    assert status == 202
    app.launcher.tick()
    op = app.operation(op["operation_id"])
    assert [s["name"] for s in op["steps"]] == ["check_followup", "skeleton", "style", "verify"]
    assert op["steps"][2]["account"] == "worka"
    assert op["result"]["simulated"] and op["status"] == "succeeded"
    assert not any(c[1] == "run" for c in fake.calls)


@pytest.mark.parametrize("result", [check_result("existing_draft"), check_result("already_sent"), check_result("ambiguous"),
                                  check_result(drafts_checked=False), check_result(draft_id="contradictory")])
def test_followup_stops_before_writing_for_duplicates_or_incomplete_check(panel, result):
    app, fake = panel
    app.cfg["mode"] = "live"
    _, op = submit(app)
    app.launcher.tick()
    final = finish_check(app, fake, op, result)
    assert final["status"] == "partial"
    assert len(final["steps"]) == 1 and final["result"]["reason"]
    assert len([c for c in fake.calls if c[1] == "run"]) == 1


def test_ready_followup_uses_read_profile_then_existing_skeleton_pipeline(panel, tmp_path):
    app, fake = panel
    app.cfg["mode"] = "live"
    app.cfg["mail"].update(draft_app_id="draft_only_example", style_rules=str(tmp_path / "style.md"))
    app.cfg["work_handoff_dir"] = str(tmp_path / "handoff")
    proof = {name: {k: {"ok": True} for k in ("schema", "headless_probe", "permissions", "live_trial")} for name in ("draft_skeleton", "draft_style")}
    (app.cfg.state / "capabilities.json").write_text(json.dumps(proof))
    _, op = submit(app)
    app.launcher.tick()
    job = app.store.get("jobs", op["operation_id"])
    assert job["account"] == "claude" and job["profile"] == "read"
    policy = json.loads((app.cfg.state / "ops" / op["operation_id"] / "policy.json").read_text())
    assert not hook_input(policy, {"tool_name": "mcp__M365__outlook_create_reply_all_draft", "tool_input": {}})
    final = finish_check(app, fake, op, check_result())
    assert final["status"] == "queued" and final["steps"][-1]["name"] == "skeleton"
    job = app.store.get("jobs", op["operation_id"])
    assert job["message_id"] == "latest-incoming" and job["profile"] == "skeleton"
    restarted = App(app.cfg, fake)
    restarted.launcher.tick()
    assert len([c for c in fake.calls if c[1] == "run"]) == 2
    assert restarted.operation(op["operation_id"])["steps"][-1]["name"] == "skeleton"
    restarted.store.db.close()


def test_changed_pending_row_stops_followup_after_read_check(panel):
    app, fake = panel
    app.cfg["mode"] = "live"
    _, op = submit(app)
    app.launcher.tick()
    path = Path(app.cfg["pending_md"])
    path.write_text(path.read_text().replace("Example", "Edited", 1))
    final = finish_check(app, fake, op, check_result())
    assert final["status"] == "partial" and "changé" in final["result"]["reason"]
    assert len(final["steps"]) == 1


def test_unproven_followup_never_retries_and_reconcile_is_read_only(panel):
    app, fake = panel
    app.cfg["mode"] = "live"
    _, op = submit(app)
    app.launcher.tick()
    final = finish_check(app, fake, op, check_result(), proven=False)
    assert final["status"] == "unknown"
    with pytest.raises(Problem) as err:
        submit(app, "duplicate-followup")
    assert err.value.body["error"]["code"] == "already_running"
    app.launcher.tick()
    assert len([c for c in fake.calls if c[1] == "run"]) == 1
    _, verification = post(app, op["links"]["status_url"] + "/reconcile", {"request_id": "check-only"})
    app.launcher.tick()
    job = app.store.get("jobs", verification["operation_id"])
    assert job["profile"] == "read" and job["reconciles"] == op["operation_id"]
    finish_check(app, fake, verification, check_result())
    assert app.operation(op["operation_id"])["status"] == "unknown"
    assert len([c for c in fake.calls if c[1] == "run"]) == 2
