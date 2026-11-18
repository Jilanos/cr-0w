"""Public view models built from local state and bounded cdx reads."""
import datetime as dt
import os
from pathlib import Path
import re

from .core import ACTIVE, Problem, now, read_json


class Readers:
    def __init__(self, app):
        self.app = app
        self.cfg, self.store, self.launcher = app.cfg, app.store, app.launcher

    def accounts(self):
        try:
            data = self.launcher.cached("accounts", ["cdx", "status", "--cached", "--json"], ttl=300)
            rows = data.get("rows", [])
            status = "stale" if self.launcher.cache.get("accounts_error") else "ok"
        except Problem:
            rows, status = [], "unavailable"
        accounts = []
        for name, config in self.cfg["accounts"].items():
            row = next((r for r in rows if r.get("session_name") == name), {})
            floor = self.cfg.get("floors", {}).get(name, {})
            h5, week = row.get("remaining_5h_pct"), row.get("remaining_week_pct")
            windows = row.get("quota_windows") or {}
            if windows.get("5h", {}).get("availability") in ("unavailable", "unknown"):
                h5 = None
            if windows.get("weekly", {}).get("availability") in ("unavailable", "unknown"):
                week = None
            known = h5 is not None or week is not None
            low = h5 is not None and h5 < floor.get("h5", 0) or week is not None and week < floor.get("week", 0)
            accounts.append({"name": name, "provider": row.get("provider") or config.get("provider", "claude"), "in_policy": True,
                             "kinds": config.get("kinds", []), "quota_status": "known" if known else "unknown",
                             "remaining_5h_pct": h5, "remaining_week_pct": week,
                             "reset_5h_at": row.get("reset_5h_at_iso"), "reset_week_at": row.get("reset_week_at_iso"),
                             "reset_credits": row.get("reset_credits_available"), "floor_5h_pct": floor.get("h5"), "floor_week_pct": floor.get("week"),
                             "state": "unknown" if not known else "near_floor" if low else "ok", "error": None if status == "ok" else "État cdx indisponible ou ancien."})
        return {"generated_at": now(), "cached_at": now() if rows else None, "source_status": status, "accounts": accounts,
                "out_of_policy": [{"name": r.get("session_name"), "error": r.get("auth_status")} for r in rows if r.get("session_name") not in self.cfg["accounts"]]}

    def registry(self):
        path = Path(self.cfg["runs_registry"])
        rows = []
        if path.is_file():
            with path.open() as f:
                for line in f:
                    try:
                        import json
                        value = json.loads(line)
                        if isinstance(value, dict) and value.get("run_id"):
                            rows.append(value)
                    except ValueError:
                        continue
        return rows

    def runs(self, hours=24):
        if not 1 <= hours <= 24 * 365:
            raise Problem(400, "bad_request", "Période invalide.")
        live = {r["run_id"]: r for r in self.launcher.rows(str(hours) + "h")}
        try:
            live.update({r["run_id"]: r for r in self.launcher.running()})
        except Problem:
            pass
        local = {r["run_id"]: r for r in self.registry()}
        local.update({r["run_id"]: {**local.get(r["run_id"], {}), **r} for r in self.store.all("runs")})
        ids = set(live) | set(local)
        cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=hours)
        result = []
        for key in ids:
            row = {**local.get(key, {}), **live.get(key, {})}
            try:
                if row.get("started_at") and dt.datetime.fromisoformat(row["started_at"].replace("Z", "+00:00")) < cutoff:
                    continue
            except ValueError:
                pass
            status = row.get("status", "unknown")
            if status == "completed":
                status = "succeeded" if row.get("exit_code") == 0 else "failed"
            result.append({"run_id": key, "kind": "script" if row.get("kind") == "script" else "agent", "label": row.get("label", ""),
                           "project": row.get("project"), "topic_id": row.get("topic_id"), "operation_id": row.get("operation_id"),
                           "account": row.get("account") or row.get("session"), "provider": row.get("provider"), "model": row.get("model"),
                           "status": status, "started_at": row.get("started_at"), "ended_at": row.get("ended_at"),
                           "duration_s": row.get("duration_seconds"), "cost_usd": row.get("cost_usd"), "cost_status": row.get("cost_status", "unknown"),
                           "tokens": (row.get("usage") or {}).get("total_tokens"), "report_file_id": None, "owned_by_panel": row.get("source") == "panel",
                           "exit_code": row.get("exit_code")})
        queue = [{"operation_id": op["operation_id"], "label": op["summary"], "account": op["steps"][0].get("account") if op["steps"] else None,
                  "waiting_for": "maj" if (self.store.get("jobs", op["operation_id"], {}).get("kind") == "pending") else "maintenance" if self.launcher.maintenance() else "slot", "position": n + 1,
                  "cancel_url": op["links"]["status_url"] + "/cancel"} for n, op in enumerate(o for o in self.store.all("operations") if o["status"] == "queued")]
        return {"generated_at": now(), "source_status": {"cdx_runs": "unavailable" if self.launcher.cache.get("running_error") or self.launcher.cache.get("runs:" + str(hours) + "h_error") else "ok", "registry": "ok"},
                "runs": sorted(result, key=lambda r: r["started_at"] or "", reverse=True), "queue": queue}

    def run(self, key):
        row = self.store.get("runs", key)
        if not row:
            row = next((r for r in self.launcher.rows("7d") if r["run_id"] == key), None)
        if not row:
            raise Problem(404, "not_found", "Run introuvable.")
        report = row.get("task_report")
        text = ""
        if isinstance(report, str) and Path(report).is_file():
            text = Path(report).read_text(errors="replace")[:100000]
        elif row.get("kind") != "script" and row.get("ended_at"):
            try:
                rep = self.launcher.cached("report:" + key, ["cdx", "run-report", key, "--json"], ttl=300)
                text = rep.get("final_message") or rep.get("final_text") or ""
            except Problem:
                pass
        sections = []
        for block in re.split(r'(?m)^#{1,3} ', text):
            if not block.strip():
                continue
            title, _, content = block.partition("\n")
            sections.append({"title": title.strip(), "segments": self.app.files.segments(content.strip())})
        log = (row.get("artifacts") or row).get("stdout_path")
        return {"generated_at": now(), "run_id": key, "kind": "script" if row.get("kind") == "script" else "agent", "label": row.get("label", ""),
                "status": row.get("status", "unknown"), "account": row.get("account") or row.get("session"), "model": row.get("model"),
                "started_at": row.get("started_at"), "ended_at": row.get("ended_at"), "duration_s": row.get("duration_seconds"), "exit_code": row.get("exit_code"),
                "cost_usd": row.get("cost_usd"), "cost_status": row.get("cost_status", "unknown"), "operation_id": row.get("operation_id"),
                "report_sections": sections, "shots": [], "log_file_id": self.app.files.register(log) if log else None, "events_url": "/api/runs/" + key + "/events"}

    def routines(self):
        result = []
        for name, label, description in (("maj", "Mise à jour", "Mails, brouillons, relances, fichier en attente"),
                                         ("daily_update", "Mise à jour machine", "Outils et dépôts. Attend la fin des runs.")):
            ops = [o for o in self.store.all("operations") if o["kind"] == "routine." + name]
            active = next((o for o in reversed(ops) if o["status"] in ACTIVE), None)
            last = next((o for o in reversed(ops) if o["status"] not in ACTIVE), None)
            blocked = "Mise à jour en cours." if self.app.pending.lock_info() else self.launcher.scheduled_reason() if name == "daily_update" else None
            if not self.cfg["routines"].get(name, {}).get("argv"):
                blocked = "Commande non configurée."
            result.append({"name": name, "label": label, "description": description, "running": bool(active), "operation_id": active["operation_id"] if active else None,
                           "blocked_reason": blocked, "last": {"at": last["updated_at"], "status": last["status"], "exit_code": (last["result"] or {}).get("exit_code"),
                           "run_id": last["steps"][-1].get("run_id")} if last else None, "dry_run": self.cfg.dry})
        return {"generated_at": now(), "routines": result}

    def dossiers(self):
        document = self.app.pending.view()
        dossiers = []
        for section in document["sections"]:
            if section["kind"] != "dossiers":
                continue
            for block in section.get("blocks", []):
                config = self.cfg.get("dossiers", {}).get(block["key"], {})
                folder = config.get("path")
                file_id = self.app.files.register(folder) if folder else block["folder_file_id"]
                items = [i for i in section["items"] if i["block"] == block["key"]]
                topic = self.launcher.topic("dossier", block["key"], block["title"], {"folder_path": folder, "items": items})
                dossiers.append({"slug": block["key"], "title": block["title"], "folder_file_id": file_id, "folder_label": config.get("label"),
                                 "item_ids": [i["id"] for i in items], "open_count": len(items), "topic_id": topic,
                                 "last_activity": self.store.get("topics", topic)["last_message_at"], "recent_files": None})
        return {"generated_at": now(), "dossiers": dossiers}

    def dossier(self, slug):
        row = next((r for r in self.dossiers()["dossiers"] if r["slug"] == slug), None)
        if not row:
            raise Problem(404, "not_found", "Dossier introuvable.")
        items = [i for s in self.app.pending.view()["sections"] for i in s["items"] if i["id"] in row["item_ids"]]
        recent, note = self.recent_files(row["folder_file_id"], self.cfg.get("dossiers", {}).get(slug, {}))
        return {"generated_at": now(), "slug": slug, "title": row["title"], "folder_file_id": row["folder_file_id"], "folder_label": row["folder_label"],
                "items": items, "topic_id": row["topic_id"], "recent_files": recent, "recent_files_note": note}

    def recent_files(self, file_id, config):
        if not file_id:
            return None, "Dossier local non configuré ou hors des racines autorisées."
        try:
            root = self.app.files.resolve(file_id)
        except Problem:
            return None, "Dossier local indisponible."
        if not root.is_dir():
            return None, "Le chemin configuré n'est pas un dossier."
        reference = None
        try:
            if config.get("last_crow_at"):
                stamp = dt.datetime.fromisoformat(config["last_crow_at"].replace("Z", "+00:00"))
                if stamp.tzinfo:
                    reference = stamp.timestamp()
            elif config.get("crow_version_file"):
                version = self.app.files.allowed(config["crow_version_file"])
                if version and version.is_file() and version.is_relative_to(root):
                    reference = version.stat().st_mtime
        except (OSError, ValueError, TypeError):
            pass
        candidates, pending, inspected, partial = [], [(root, 0)], 0, False
        while pending and inspected < 10000:
            folder, depth = pending.pop()
            try:
                with os.scandir(folder) as entries:
                    for entry in entries:
                        inspected += 1
                        if inspected > 10000:
                            partial = True
                            break
                        if entry.is_symlink():
                            continue
                        if entry.is_dir(follow_symlinks=False) and depth < 2:
                            pending.append((Path(entry.path), depth + 1))
                        elif entry.is_file(follow_symlinks=False):
                            stat = entry.stat(follow_symlinks=False)
                            candidates.append((stat.st_mtime_ns, Path(entry.path), stat.st_size))
            except OSError:
                partial = True
        partial = partial or bool(pending)
        files = []
        for modified_ns, path, size in sorted(candidates, key=lambda r: (-r[0], str(r[1])))[:10]:
            key = self.app.files.register(path)
            if key:
                modified = modified_ns / 1_000_000_000
                files.append({"file_id": key, "name": str(path.relative_to(root)),
                              "modified": dt.datetime.fromtimestamp(modified, dt.timezone.utc).isoformat(), "size": size,
                              "modified_after_crow": modified > reference if reference is not None else None})
        notes = ["10 fichiers au maximum, deux niveaux de sous-dossiers."]
        if reference is None:
            notes.append("Date de la dernière version crow inconnue.")
        else:
            notes.append("Dernière version crow : " + dt.datetime.fromtimestamp(reference, dt.timezone.utc).isoformat())
        if partial:
            notes.append("Lecture partielle : limite de parcours ou accès indisponible.")
        return files, " ".join(notes)

    def afk(self):
        root = Path(self.cfg.get("afk_dir", self.cfg.home / "local/state/afk"))
        date = dt.date.today().isoformat()
        summary = read_json(root / ("summary-" + date + ".json"), {})
        jobs = []
        for path in sorted((root / "reports").glob("*.md")) if (root / "reports").is_dir() else []:
            jobs.append({"name": path.stem, "account": None, "status": "reported", "run_id": None, "report_file_id": self.app.files.register(path), "decisions": None})
        decisions = self.app.decisions.view(date)
        return {"generated_at": now(), "night": date, "back_at": summary.get("back_at"), "jobs": jobs, "decisions": decisions}

    def dues(self, days=14):
        if not 1 <= days <= 366:
            raise Problem(400, "bad_request", "Période invalide.")
        today = dt.date.today()
        end = (today + dt.timedelta(days=days)).isoformat()
        rows = [{"date": i["due"], "kind": "pending", "text": i["title"], "overdue": i["due"] < today.isoformat(), "ref": {"kind": "pending", "id": i["id"]}}
                for s in self.app.pending.view()["sections"] if s["kind"] != "done" for i in s["items"] if i["due"] and i["due"] <= end]
        for account in self.accounts()["accounts"]:
            for field, label in (("reset_5h_at", "fenêtre 5 h"), ("reset_week_at", "semaine")):
                date = account[field]
                if date and today.isoformat() <= date[:10] <= end:
                    rows.append({"date": date[:10], "kind": "reset", "text": account["name"] + " : " + label, "overdue": False, "ref": {"kind": "account", "id": account["name"]}})
        return {"generated_at": now(), "days": days, "items": sorted(rows, key=lambda r: r["date"])}

    def state(self):
        pending = self.app.pending.view()
        items = [i for s in pending["sections"] if s["kind"] != "done" for i in s["items"]]
        decisions = [i for s in pending["sections"] if s["kind"] == "decisions" for i in s["items"]]
        overdue = [i for i in items if i["overdue_workdays"]]
        mail = self.app.mail.list({})
        try:
            active = len(self.launcher.running())
            admission = not self.launcher.cache.get("running_error") and not self.launcher.maintenance()
        except Problem:
            active, admission = None, False
        queued = sum(o["status"] == "queued" for o in self.store.all("operations"))
        limit = (dt.date.today() + dt.timedelta(days=7 - dt.date.today().weekday())).isoformat()
        afk = self.afk()
        counts = {"pending": len(items), "overdue": len(overdue), "due_week": sum(bool(i["due"] and dt.date.today().isoformat() <= i["due"] < limit) for i in items), "decisions": len(decisions),
                  "inbox": len(self.app.mail.raw()["items"]) if mail["snapshot_rev"] else None, "inbox_unread": sum(i["unread"] for i in self.app.mail.raw()["items"]) if mail["snapshot_rev"] else None,
                  "triage_proposals": sum(i["proposal"] is not None for i in self.app.mail.raw()["items"]), "drafts": sum(i["state"] == "draft" for i in self.app.mail.drafts()["items"]),
                  "runs_active": active, "runs_queued": queued, "afk_decisions": sum(not d["answered"] for d in afk["decisions"])}
        alerts = [{"level": "error", "text": "Relance dépassée : " + i["title"], "ref": {"kind": "pending", "id": i["id"]}} for i in overdue]
        if self.cfg.dry:
            alerts.append({"level": "info", "text": "Mode essai : aucune action mail réelle.", "ref": {"kind": "view", "id": "settings"}})
        if mail["stale"]:
            alerts.append({"level": "warn", "text": "Instantané mail absent ou ancien.", "ref": {"kind": "view", "id": "mail"}})
        return {"generated_at": now(), "mode": self.cfg["mode"], "counts": counts, "alerts": alerts,
                "locks": {"pending": pending["lock"], "maj": self.launcher.maj(), "maintenance": {"holder": "daily_update", "since": None, "run_id": None} if self.launcher.maintenance() else None},
                "admissions": {"open": bool(admission), "reason": None if admission else "Maintenance ou état cdx indisponible."},
                "mail": {"synced_at": mail["synced_at"], "stale": mail["stale"], "coverage": mail["coverage"]["status"]}, "since_last_visit": self.app.visits.changes()}
