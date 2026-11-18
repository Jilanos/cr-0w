"""Validated read-only Outlook calendar snapshots shared by maj and the panel."""
import datetime as dt
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .core import atomic, canonical, digest, now, read_json
from .security import clean_text, https


def timestamp(value, zone=None):
    if zone and isinstance(value, str) and len(value) == 10:
        return dt.datetime.combine(dt.date.fromisoformat(value), dt.time(), zone)
    parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("timestamp requires an offset")
    return parsed


def normalize(value):
    if not isinstance(value, dict) or not isinstance(value.get("events"), list) or len(value["events"]) > 5000:
        raise ValueError("calendar events must be a bounded list")
    zone_name = value.get("time_zone", "UTC")
    zone = ZoneInfo(zone_name)
    synced = timestamp(value["synced_at"])
    coverage = value["coverage"]
    if coverage["status"] not in ("complete", "partial"):
        raise ValueError("invalid calendar coverage")
    start, end = timestamp(coverage["window_start"]), timestamp(coverage["window_end"])
    if end <= start:
        raise ValueError("invalid calendar window")
    events = {}
    for row in value["events"]:
        if not isinstance(row, dict) or not isinstance(row.get("id"), str) or not row["id"] or len(row["id"]) > 4096:
            raise ValueError("invalid calendar event")
        for flag in ("all_day", "cancelled"):
            if type(row.get(flag, False)) is not bool:
                raise ValueError("invalid calendar flag")
        begins = timestamp(row["start"], zone if row.get("all_day") else None)
        ends = timestamp(row["end"], zone if row.get("all_day") else None)
        if ends <= begins or not isinstance(row.get("subject"), str):
            raise ValueError("invalid event time or subject")
        event = {"id": row["id"], "subject": clean_text(row["subject"])[:4000], "start": begins.isoformat(), "end": ends.isoformat(),
                 "all_day": row.get("all_day", False), "cancelled": row.get("cancelled", False),
                 "location": clean_text(row.get("location"))[:4000], "web_link": https(row.get("web_link"))}
        key = (event["id"], event["start"])
        if key in events and events[key] != event:
            raise ValueError("conflicting calendar occurrences")
        events[key] = event
    return {"synced_at": synced.isoformat(), "time_zone": zone_name,
            "coverage": {"status": coverage["status"], "window_start": start.isoformat(), "window_end": end.isoformat()},
            "events": sorted(events.values(), key=lambda r: (r["start"], r["id"]))}


def publish(path, value):
    path = Path(path)
    data = normalize(value)
    status = {"checked_at": now(), "status": data["coverage"]["status"]}
    previous = read_json(path)
    if previous is not None:
        try:
            previous = normalize(previous)
        except (ValueError, KeyError, TypeError, AttributeError):
            previous = None
    if previous and timestamp(previous["synced_at"]) > timestamp(data["synced_at"]):
        raise ValueError("calendar snapshot is older than the published version")
    published = data["coverage"]["status"] == "complete" or previous is None
    if published:
        atomic(path, canonical(data))
    atomic(path.with_suffix(".attempt.json"), canonical(status))
    return {"published": published, **status}


class Calendar:
    def __init__(self, cfg):
        self.cfg = cfg
        self.path = Path(cfg.get("calendar", {}).get("snapshot") or cfg.home / "local/state/maj/calendar.json")

    def view(self, days):
        config = self.cfg.get("calendar", {})
        meta = {"synced_at": None, "stale": True, "coverage": "none", "time_zone": None, "note": "Calendrier absent. Lance une mise à jour pour le lire."}
        try:
            data = normalize(read_json(self.path))
            current = dt.datetime.now(dt.timezone.utc)
            zone = ZoneInfo(config.get("time_zone") or data["time_zone"])
            today = current.astimezone(zone).date()
            through = today + dt.timedelta(days=days)
            stale = (current - timestamp(data["synced_at"])).total_seconds() > config.get("stale_after_minutes", 120) * 60
            stale = stale or timestamp(data["synced_at"]) > current + dt.timedelta(minutes=5)
            attempt = read_json(self.path.with_suffix(".attempt.json"), {})
            request_end = dt.datetime.combine(through + dt.timedelta(days=1), dt.time(), zone)
            covered = timestamp(data["coverage"]["window_start"]) <= current and timestamp(data["coverage"]["window_end"]) >= request_end
            coverage = "complete" if covered and data["coverage"]["status"] == "complete" and attempt.get("status", "complete") == "complete" else "partial"
            meta.update(synced_at=data["synced_at"], stale=stale, coverage=coverage, time_zone=str(zone),
                        note="Calendrier : " + ("instantané ancien" if stale else "à jour") + (", couverture partielle." if coverage == "partial" else ", couverture complète."))
            items = []
            for event in data["events"]:
                begins, ends = timestamp(event["start"]), timestamp(event["end"])
                if event["cancelled"] or ends <= current or begins.astimezone(zone).date() > through:
                    continue
                key = digest(canonical([event["id"], event["start"]]), "cal_")[:28]
                items.append({"date": max(today, begins.astimezone(zone).date()).isoformat(), "kind": "calendar", "text": event["subject"], "overdue": False,
                              "ref": {"kind": "calendar", "id": key}, "start": begins.astimezone(zone).isoformat(), "end": ends.astimezone(zone).isoformat(),
                              "all_day": event["all_day"], "location": event["location"], "url": event["web_link"], "stale": stale})
            return items, meta
        except (OSError, ValueError, KeyError, TypeError, AttributeError, ZoneInfoNotFoundError):
            if self.path.exists():
                meta["note"] = "Instantané calendrier invalide ou indisponible. Lance une mise à jour."
            return [], meta


class CalendarSync:
    """Read-only Outlook calendar collection through a guarded headless run."""

    KIND = "calendar.sync"

    def __init__(self, app):
        self.app = app
        self.cfg, self.store, self.launcher = app.cfg, app.store, app.launcher

    def window(self, days=14):
        zone = ZoneInfo(self.cfg.get("calendar", {}).get("time_zone") or "UTC")
        start = dt.datetime.combine(dt.datetime.now(zone).date(), dt.time(), zone)
        # The view needs coverage through the end of the last requested day.
        return start, start + dt.timedelta(days=days + 1), zone

    def active(self):
        return next((o for o in self.store.all("operations") if o["kind"] == self.KIND and o["status"] in ("queued", "running")), None)

    def sync(self, body, route, days=14):
        running = self.active()
        if running:
            return running
        self.launcher.running(fresh=True)  # Fail before accepting when admission cannot be measured.
        op = self.store.operation(self.KIND, body, "Lecture de l'agenda")
        output = self.cfg.state / "calendar/incoming" / (op["operation_id"] + ".json")
        output.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        start, end, zone = self.window(days)
        from .core import ENGINE
        prompt = (ENGINE / "bin/panel_prompts/calendar-sync.md").read_text() + "\nConfiguration: " + canonical({
            "output": str(output), "time_zone": str(zone), "window_start": start.isoformat(), "window_end": end.isoformat(),
            "contract": {"synced_at": "ISO timestamp with offset", "time_zone": str(zone),
                         "coverage": {"status": "complete|partial", "window_start": start.isoformat(), "window_end": end.isoformat()},
                         "events": [{"id": "stable Outlook event id", "subject": "text", "start": "ISO with offset, or YYYY-MM-DD when all_day",
                                     "end": "ISO with offset, or YYYY-MM-DD when all_day", "all_day": False, "cancelled": False,
                                     "location": "text or null", "web_link": "https link or null"}]}})
        self.launcher.enqueue(op, {"account": "claude", "model": "sonnet", "provider": "claude", "cwd": str(self.cfg.home), "profile": "calendar",
                                   "prompt": prompt, "output": str(output)}, route, body, "collect")
        return op

    def complete(self, op, job, row, text):
        if op["kind"] != self.KIND or op["status"] != "succeeded":
            return
        output = read_json(job.get("output", ""))
        if output is None:
            op.update(status="unknown", error={"code": "result_missing", "message": "Le run est terminé sans agenda validable.", "retryable": False, "details": {}})
            return
        if not self.app.mail.transcript_ok(op, job, row, require_remote=True):
            op.update(status="failed", error={"code": "unproven", "message": "Lecture de l'agenda non prouvée par le transcript.", "retryable": True, "details": {}})
            return
        try:
            result = publish(Calendar(self.cfg).path, output)
        except (ValueError, KeyError, TypeError, AttributeError, ZoneInfoNotFoundError) as exc:
            op.update(status="failed", error={"code": "invalid_snapshot", "message": "Agenda reçu invalide : " + str(exc)[:200], "retryable": True, "details": {}})
            return
        op["result"] = {**result, "events": len(output.get("events", []))}
        if not result["published"] or result["status"] != "complete":
            op["status"] = "partial"
