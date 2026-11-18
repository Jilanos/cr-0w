import datetime as dt
import json
from pathlib import Path
import runpy

import pytest

from test_panel_api import panel
from crow_panel.calendar import Calendar, normalize, publish


def snapshot():
    current = dt.datetime.now(dt.timezone.utc)
    return {"synced_at": current.isoformat(), "time_zone": "UTC",
            "coverage": {"status": "complete", "window_start": (current - dt.timedelta(days=1)).isoformat(), "window_end": (current + dt.timedelta(days=16)).isoformat()},
            "events": [{"id": "event", "subject": "Project review", "start": (current + dt.timedelta(hours=2)).isoformat(),
                        "end": (current + dt.timedelta(hours=3)).isoformat(), "web_link": "https://example.org/calendar/event"}]}


def target(app, tmp_path):
    path = tmp_path / "calendar.json"
    app.cfg["calendar"] = {"snapshot": str(path), "stale_after_minutes": 120}
    return path


def test_calendar_deadlines_exclude_cancelled_and_finished_events(panel, tmp_path):
    app, _ = panel
    path = target(app, tmp_path)
    data = snapshot()
    now = dt.datetime.now(dt.timezone.utc)
    today = now.date()
    data["events"].extend([
        {**data["events"][0], "id": "cancelled", "cancelled": True},
        {**data["events"][0], "id": "old", "start": (now - dt.timedelta(hours=2)).isoformat(), "end": (now - dt.timedelta(hours=1)).isoformat()},
        {"id": "all-day", "subject": "All day", "start": today.isoformat(), "end": (today + dt.timedelta(days=1)).isoformat(), "all_day": True},
    ])
    publish(path, data)
    result = app.readers.dues()
    events = [r for r in result["items"] if r["kind"] == "calendar"]
    assert len(events) == 2 and any(r["all_day"] for r in events)
    assert all(not r["overdue"] for r in events)
    assert result["calendar"]["coverage"] == "complete" and not result["calendar"]["stale"]
    assert all("event" not in r["ref"]["id"] for r in events)
    assert not any(r["text"] == "Project review" and r["overdue"] for r in result["items"])


def test_calendar_partial_preserves_previous_and_marks_coverage(panel, tmp_path):
    app, _ = panel
    path = target(app, tmp_path)
    data = snapshot()
    publish(path, data)
    before = path.read_bytes()
    data["coverage"]["status"] = "partial"
    data["events"] = []
    assert publish(path, data)["published"] is False
    rows, meta = Calendar(app.cfg).view(14)
    assert path.read_bytes() == before and len(rows) == 1
    assert meta["coverage"] == "partial" and "partielle" in meta["note"]


def test_older_calendar_snapshot_cannot_replace_newer_one(panel, tmp_path):
    app, _ = panel
    path = target(app, tmp_path)
    data = snapshot()
    publish(path, data)
    before = path.read_bytes()
    data["synced_at"] = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=1)).isoformat()
    with pytest.raises(ValueError):
        publish(path, data)
    assert path.read_bytes() == before


def test_calendar_stale_missing_invalid_and_short_window_are_explicit(panel, tmp_path):
    app, _ = panel
    path = target(app, tmp_path)
    assert Calendar(app.cfg).view(14)[1]["coverage"] == "none"
    path.write_text("invalid")
    assert "invalide" in Calendar(app.cfg).view(14)[1]["note"]
    data = snapshot()
    data["synced_at"] = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=2)).isoformat()
    data["coverage"]["window_end"] = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=1)).isoformat()
    publish(path, data)
    rows, meta = Calendar(app.cfg).view(14)
    assert len(rows) == 1 and rows[0]["stale"]
    assert meta["stale"] and meta["coverage"] == "partial"


def test_calendar_occurrences_timezone_all_day_and_hostile_links(panel, tmp_path):
    app, _ = panel
    path = target(app, tmp_path)
    data = snapshot()
    data["events"][0].update(subject="<b>Project</b><script>evil()</script>", web_link="javascript:evil()")
    later = {**data["events"][0], "start": (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=2)).isoformat(),
             "end": (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=2, hours=1)).isoformat()}
    data["events"].append(later)
    publish(path, data)
    app.cfg["calendar"]["time_zone"] = "Etc/GMT+12"
    rows, meta = Calendar(app.cfg).view(14)
    assert len(rows) == 2 and rows[0]["ref"] != rows[1]["ref"]
    assert rows[0]["text"] == "Project" and rows[0]["url"] is None
    assert rows[0]["start"].endswith("-12:00")
    assert meta["time_zone"] == "Etc/GMT+12"


@pytest.mark.parametrize("invalid", ["naive", "backwards", "duplicate", "bad_flag"])
def test_invalid_calendar_does_not_replace_previous(panel, tmp_path, invalid):
    app, _ = panel
    path = target(app, tmp_path)
    data = snapshot()
    publish(path, data)
    before = path.read_bytes()
    if invalid == "naive":
        data["events"][0]["start"] = "2026-11-18T12:00:00"
    elif invalid == "backwards":
        data["events"][0]["end"] = data["coverage"]["window_start"]
    elif invalid == "duplicate":
        data["events"].append({**data["events"][0], "subject": "Conflicting occurrence"})
    else:
        data["events"][0]["cancelled"] = "false"
    with pytest.raises(ValueError):
        publish(path, data)
    assert path.read_bytes() == before


def test_maj_calendar_import_uses_data_home_and_preserves_good_snapshot(tmp_path, monkeypatch):
    (tmp_path / "local").mkdir()
    (tmp_path / "local/maj.json").write_text('{}')
    monkeypatch.setenv("CROW_HOME", str(tmp_path))
    module = runpy.run_path(str(Path(__file__).resolve().parents[1] / "bin/crow-maj"), run_name="calendar_test")
    source = tmp_path / "incoming.json"
    source.write_text(json.dumps(snapshot()))
    assert module["main"](["calendar", "import", str(source)]) == 0
    path = tmp_path / "local/state/maj/calendar.json"
    before = path.read_bytes()
    source.write_text("invalid")
    assert module["main"](["calendar", "import", str(source)]) == 2
    assert path.read_bytes() == before
    assert json.loads(path.with_suffix(".attempt.json").read_text())["status"] == "failed"


def finish_calendar_run(app, fake, op, tools, value):
    app.launcher.tick()
    live = app.operation(op["operation_id"])
    job = app.store.get("jobs", op["operation_id"])
    assert job["profile"] == "calendar"
    rid = live["steps"][-1]["run_id"]
    log = Path(fake.rows[rid]["artifacts"]["stdout_path"])
    log.write_text("".join(json.dumps({"type": "assistant", "message": {"content": [{"type": "tool_use", "name": name, "input": args}]}}) + "\n" for name, args in tools))
    if value is not None:
        Path(job["output"]).write_text(json.dumps(value))
    fake.rows[rid].update(ended_at="2026-11-18T00:01:00+00:00", exit_code=0, status="succeeded")
    app.launcher.tick()
    return app.operation(op["operation_id"])


def test_mail_sync_also_collects_and_publishes_the_calendar(panel, tmp_path):
    app, fake = panel
    path = target(app, tmp_path)
    _, mail_op = app.mutate("POST", "/api/mail/sync", {"request_id": "sync-both"})
    ops = [o for o in app.store.all("operations") if o["kind"] == "calendar.sync"]
    assert len(ops) == 1 and ops[0]["request_id"] == "sync-both:calendar"
    _, again = app.mutate("POST", "/api/calendar/sync", {"request_id": "cal-again"})
    assert again["operation_id"] == ops[0]["operation_id"]
    value = snapshot()
    value["synced_at"] = "2020-01-01T08:00:00+01:00"
    op = finish_calendar_run(app, fake, ops[0], [("mcp__M365__outlook_calendar_search", {"query": "*"})], value)
    assert op["status"] == "succeeded" and op["result"]["published"] and op["result"]["events"] == 1
    assert json.loads(path.read_text())["events"][0]["subject"] == "Project review"
    dues = app.readers.dues(14)
    assert any(d["kind"] == "calendar" for d in dues["items"])
    assert json.loads(path.read_text())["synced_at"].startswith(op["created_at"][:16]) and not dues["calendar"]["stale"]


def test_calendar_sync_rejects_mail_tools_and_writes(panel, tmp_path):
    app, fake = panel
    path = target(app, tmp_path)
    _, op = app.mutate("POST", "/api/calendar/sync", {"request_id": "cal-guard"})
    op = finish_calendar_run(app, fake, op, [("mcp__M365__outlook_calendar_search", {}), ("mcp__M365__outlook_email_search", {})], snapshot())
    assert op["status"] == "failed" and not path.exists()
    _, op = app.mutate("POST", "/api/calendar/sync", {"request_id": "cal-write"})
    op = finish_calendar_run(app, fake, op, [("mcp__M365__outlook_calendar_search", {}), ("mcp__M365__outlook_update_event", {})], snapshot())
    assert op["status"] == "failed" and not path.exists()


def test_calendar_sync_invalid_or_missing_output(panel, tmp_path):
    app, fake = panel
    path = target(app, tmp_path)
    _, op = app.mutate("POST", "/api/calendar/sync", {"request_id": "cal-missing"})
    op = finish_calendar_run(app, fake, op, [("mcp__M365__outlook_calendar_search", {})], None)
    assert op["status"] == "unknown"
    _, op = app.mutate("POST", "/api/calendar/sync", {"request_id": "cal-invalid"})
    op = finish_calendar_run(app, fake, op, [("mcp__M365__outlook_calendar_search", {})], {"events": "nope"})
    assert op["status"] == "failed" and op["error"]["code"] == "invalid_snapshot" and not path.exists()


def test_calendar_profile_policy():
    from crow_panel.security import tool_allowed
    assert tool_allowed("calendar", "mcp__M365__outlook_calendar_search", {})
    for name in ("mcp__M365__outlook_email_search", "mcp__M365__outlook_update_event", "mcp__M365__outlook_delete_event", "Bash"):
        assert not tool_allowed("calendar", name, {})
    assert not tool_allowed("read", "mcp__M365__outlook_calendar_search", {})


def test_calendar_younger_than_thirty_minutes_skips_all_backends(panel, tmp_path):
    app, fake = panel
    path = target(app, tmp_path)
    data = snapshot(); publish(path, data)
    calls = len(fake.calls)
    op = app.calendar.sync({'request_id': 'fresh-calendar'}, '/calendar')
    assert op['status'] == 'succeeded' and op['result']['skipped']
    assert len(fake.calls) == calls and not app.store.get('jobs', op['operation_id'])
    data['synced_at'] = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=31)).isoformat()
    path.write_text(json.dumps(data))
    op = app.calendar.sync({'request_id': 'stale-calendar'}, '/calendar')
    assert op['status'] == 'queued'


def test_fresh_incomplete_calendar_is_collected_again(panel, tmp_path):
    app, _ = panel
    path = target(app, tmp_path)
    data = snapshot(); data['coverage']['status'] = 'partial'; publish(path, data)
    op = app.calendar.sync({'request_id': 'partial-calendar'}, '/calendar')
    assert op['status'] == 'queued'
