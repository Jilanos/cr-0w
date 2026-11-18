"""Read-only mailbox snapshots and confirmed immutable triage manifests."""
import base64
import datetime as dt
import json
from pathlib import Path

from .core import ENGINE, Problem, atomic, canonical, digest, now, read_json, uid
from .launcher import step
from .security import clean_text, https, tool_allowed


class Mail:
    def __init__(self, cfg, store, launcher):
        self.cfg, self.store, self.launcher = cfg, store, launcher
        self.snapshot_path = cfg.state / "mail/snapshot.json"

    def raw(self):
        return read_json(self.snapshot_path, {"snapshot_rev": None, "synced_at": None, "items": [], "folders": [], "drafts": [],
                         "coverage": {"status": "none", "collected": 0, "total_known": None, "started_at": None, "ended_at": None, "oldest": None, "errors": []}})

    def folders(self):
        snapshot = self.raw()
        allowed = self.cfg["mail"].get("allowed_folders", [])
        folders = []
        for row in snapshot.get("folders", []):
            permitted = row.get("well_known") not in ("inbox", "drafts", "sentitems", "deleteditems", "outbox", "junkemail") and (not allowed or row["id"] in allowed)
            folders.append({"id": row["id"], "path": row["path"], "well_known": row.get("well_known"), "allowed_target": permitted})
        return {"generated_at": now(), "synced_at": snapshot["synced_at"], "folders": folders}

    def stale(self, snapshot):
        try:
            return (dt.datetime.now(dt.timezone.utc) - dt.datetime.fromisoformat(snapshot["synced_at"])).total_seconds() > self.cfg["mail"].get("stale_after_minutes", 120) * 60
        except (TypeError, ValueError):
            return True

    def list(self, query):
        snapshot = self.raw()
        limit = min(200, max(1, int(query.get("limit", [50])[0])))
        cursor = query.get("cursor", [""])[0]
        offset = 0
        if cursor:
            try:
                rev, offset, saved_query = json.loads(base64.urlsafe_b64decode(cursor).decode())
                if rev != snapshot["snapshot_rev"] or saved_query != query.get("q", [""])[0] or type(offset) is not int or offset < 0:
                    raise ValueError()
            except (ValueError, TypeError):
                raise Problem(409, "conflict", "La boîte a changé. Recharge la liste.")
        text = query.get("q", [""])[0].casefold()
        items = [row for row in snapshot["items"] if text in (row["subject"] + " " + row["from"]["name"] + " " + row["preview"]).casefold()]
        end = offset + limit
        active = next((o["operation_id"] for o in self.store.all("operations") if o["kind"] == "mail.sync" and o["status"] in ("queued", "running")), None)
        return {"generated_at": now(), "snapshot_rev": snapshot["snapshot_rev"], "synced_at": snapshot["synced_at"],
                "stale": self.stale(snapshot), "stale_after_minutes": self.cfg["mail"].get("stale_after_minutes", 120),
                "sync_operation_id": active, "coverage": snapshot["coverage"], "folder": "inbox", "items": items[offset:end],
                "next_cursor": base64.urlsafe_b64encode(canonical([snapshot["snapshot_rev"], end, query.get("q", [""])[0]]).encode()).decode() if end < len(items) else None}

    def find(self, key):
        row = next((r for r in self.raw()["items"] if r["id"] == key), None)
        if row is None:
            raise Problem(404, "not_found", "Mail absent de l'instantané.")
        return row

    def body_path(self, key):
        return self.cfg.state / "mail/bodies" / (digest(key) + ".json")

    def detail(self, key):
        row = self.find(key)
        body = read_json(self.body_path(key), {})
        body_text = body.get("body_text")
        return {"generated_at": now(), "id": key, "conversation_id": row["conversation_id"], "snapshot_rev": self.raw()["snapshot_rev"],
                "subject": row["subject"], "from": row["from"], "to": body.get("to", []), "cc": body.get("cc", []),
                "received": row["received"], "owa_link": https(body.get("owa_link")), "body_status": "cached" if body_text is not None else "not_fetched",
                "body_text": clean_text(body_text) if body_text is not None else None,
                "body_truncated": body.get("body_truncated") if body_text is not None else None,
                "body_chars": len(body_text) if body_text is not None else None, "attachments": body.get("attachments", []),
                "thread": body.get("thread", []), "proposal": row["proposal"], "pending_ref": row["pending_ref"], "draft_ref": row["draft_ref"],
                "topic_id": row["topic_id"], "actions": (["fetch_body"] if body_text is None else []) + ["reply_all", "triage", "chat", "open_owa"]}

    def publish(self, value):
        if not isinstance(value, dict) or not isinstance(value.get("items"), list) or not isinstance(value.get("coverage"), dict):
            raise ValueError("invalid snapshot")
        coverage = value["coverage"]
        if coverage.get("status") not in ("complete", "partial", "none"):
            raise ValueError("invalid coverage")
        for field in ("started_at", "ended_at"):
            if coverage.get(field):
                stamp = dt.datetime.fromisoformat(coverage[field])
                if stamp.tzinfo is None:
                    raise ValueError("timezone required")
        folders = value.get("folders", self.raw().get("folders", []))
        if not isinstance(folders, list) or any(not isinstance(f, dict) or not isinstance(f.get("id"), str) or not isinstance(f.get("path"), str) for f in folders):
            raise ValueError("invalid folders")
        folder_map = {f["id"]: f for f in folders}
        if len(folder_map) != len(folders):
            raise ValueError("duplicate folder")
        items, seen, bodies, invalid = [], set(), {}, 0
        for row in value["items"]:
            if not isinstance(row, dict) or any(not isinstance(row.get(k), str) or not row[k] for k in ("id", "conversation_id", "subject", "received")):
                raise ValueError("invalid message")
            if row["id"] in seen:
                continue
            seen.add(row["id"])
            received = dt.datetime.fromisoformat(row["received"])
            if received.tzinfo is None or not isinstance(row.get("from"), dict):
                raise ValueError("invalid sender/date")
            proposal = row.get("proposal")
            if proposal:
                if proposal.get("action") not in ("reply", "keep", "move", "archive", "trash") or proposal.get("confidence") not in ("low", "medium", "high") or proposal.get("folder_id") and proposal["folder_id"] not in folder_map:
                    proposal, invalid = None, invalid + 1
                else:
                    proposal = {"action": proposal["action"], "folder_id": proposal.get("folder_id"),
                                "folder_path": folder_map.get(proposal.get("folder_id"), {}).get("path"),
                                "reason": clean_text(proposal.get("reason", "")), "confidence": proposal["confidence"],
                                "allowed": proposal["action"] != "trash", "disabled_reason": "Corbeille indisponible : outil absent." if proposal["action"] == "trash" else None}
            topic = self.launcher.topic("mail", row["conversation_id"], clean_text(row["subject"]), {"message_id": row["id"], "subject": clean_text(row["subject"]), "preview": clean_text(row.get("preview", ""))})
            items.append({"id": row["id"], "conversation_id": row["conversation_id"], "from": {"name": clean_text(row["from"].get("name", "")), "address": clean_text(row["from"].get("address", ""))},
                          "to_count": row.get("to_count"), "subject": clean_text(row["subject"]), "received": row["received"],
                          "preview": clean_text(row.get("preview", ""))[:1000], "preview_truncated": bool(row.get("preview_truncated", False)),
                          "has_attachments": bool(row.get("has_attachments", False)), "unread": bool(row.get("unread", False)), "proposal": proposal,
                          "pending_ref": None, "draft_ref": None, "topic_id": topic})
            if row.get("body_text") is not None:
                bodies[row["id"]] = self.validate_body(row)
        coverage = {"status": coverage["status"], "collected": len(items), "total_known": coverage.get("total_known"),
                    "started_at": coverage.get("started_at"), "ended_at": coverage.get("ended_at"),
                    "oldest": min((r["received"] for r in items), default=None), "errors": coverage.get("errors", [])}
        if coverage["status"] == "complete" and (coverage["errors"] or not value.get("exhausted", False)):
            coverage["status"] = "partial"
            coverage["errors"].append({"code": "coverage_unproven", "message": "Fin de parcours non prouvée.", "at": now()})
        if coverage["status"] != "complete" and self.raw()["snapshot_rev"]:
            self.store.put("meta", "last_mail_attempt", coverage)
            return {"published": False, "coverage": coverage, "invalid_proposals": invalid}
        snapshot = {"snapshot_rev": digest(canonical([items, folders, now()]), "s_"), "synced_at": now(), "coverage": coverage,
                    "items": sorted(items, key=lambda r: r["received"], reverse=True), "folders": folders,
                    "drafts": self.valid_drafts(value.get("drafts", []))}
        for key, body in bodies.items():
            atomic(self.body_path(key), canonical(body))
        atomic(self.snapshot_path, canonical(snapshot))
        atomic(self.cfg.state / "mail/folders.json", canonical(self.folders()))
        return {"published": True, "coverage": coverage, "invalid_proposals": invalid}

    def validate_body(self, value):
        if not isinstance(value.get("body_text"), str):
            raise ValueError("body_text required")
        # Mail HTML is never returned to the browser.
        return {"body_text": clean_text(value["body_text"]), "body_truncated": bool(value.get("body_truncated", False)),
                "to": value.get("to", []), "cc": value.get("cc", []), "owa_link": https(value.get("owa_link")),
                "attachments": [{"name": clean_text(a.get("name", "")), "size": a.get("size"), "type": a.get("type")} for a in value.get("attachments", [])],
                "thread": [{"id": t.get("id"), "from": clean_text(t.get("from", "")), "date": t.get("date"), "kind": t.get("kind"), "subject": clean_text(t.get("subject", ""))} for t in value.get("thread", [])]}

    def valid_drafts(self, rows):
        result = []
        for row in rows:
            if not isinstance(row, dict) or not isinstance(row.get("id"), str):
                continue
            state = row.get("state")
            if state not in ("draft", "sent", "missing"):
                state = "missing"
            if state == "sent" and not (row.get("sent_proof") or {}).get("message_id"):
                state = "missing"
            result.append({"id": row["id"], "subject": clean_text(row.get("subject", "")), "to": row.get("to", []), "cc": row.get("cc", []),
                           "updated": row.get("updated"), "state": state, "signature_ok": row.get("signature_ok"),
                           "attachments_missing": row.get("attachments_missing", []), "owa_link": https(row.get("owa_link")), "pending_ref": None,
                           "topic_id": self.launcher.topic("mail", row.get("conversation_id", row["id"]), clean_text(row.get("subject", ""))),
                           "evidence": clean_text(row.get("evidence", "État incertain."))})
        return result

    def drafts(self):
        snapshot = self.raw()
        return {"generated_at": now(), "snapshot_rev": snapshot["snapshot_rev"], "items": snapshot.get("drafts", [])}

    def capabilities(self):
        proof = read_json(self.cfg.state / "capabilities.json", {})
        caps = []
        labels = {"mail_read": "Lire la boîte de réception", "mail_move": "Ranger un mail", "mail_archive": "Archiver un mail", "mail_trash": "Corbeille",
                  "mail_triage_undo": "Annuler un rangement", "draft_skeleton": "Créer une réponse à tous", "draft_style": "Mise en forme du brouillon", "run_stop": "Arrêter un run", "tool_deny_passthrough": "Refus d'outils"}
        for name, label in labels.items():
            evidence = proof.get(name, {k: {"ok": None, "at": None, "detail": None} for k in ("schema", "headless_probe", "permissions", "live_trial")})
            required = all(evidence.get(k, {}).get("ok") is True for k in ("schema", "headless_probe", "permissions"))
            simulated = self.cfg.dry and name in ("mail_move", "mail_archive", "mail_triage_undo", "draft_skeleton", "draft_style")
            forbidden = name in ("mail_trash", "run_stop")
            allowed = not forbidden and (required or simulated)
            caps.append({"name": name, "label": label, "state": "unavailable" if forbidden else "available" if required and evidence.get("live_trial", {}).get("ok") is True else "limited",
                         "allowed": allowed, "mode": self.cfg["mode"], "evidence": evidence,
                         "reason": "Outil par message non prouvé." if forbidden else "Mode essai : actions simulées." if simulated else None if required else "Sonde et permissions à vérifier."})
        return {"generated_at": now(), "probed_at": proof.get("probed_at"), "capabilities": caps}

    def require(self, name):
        cap = next(c for c in self.capabilities()["capabilities"] if c["name"] == name)
        if not cap["allowed"]:
            raise Problem(422, "capability_unavailable", cap["reason"] or "Capacité indisponible.", {"capability": name})

    def collect(self, kind, body, route, key=None, probe=False):
        if kind == "mail.sync" and any(o["kind"] == kind and o["status"] in ("queued", "running") for o in self.store.all("operations")):
            raise Problem(409, "already_running", "Une synchronisation est déjà en cours.")
        if key:
            self.find(key)
        self.launcher.running(fresh=True)
        op = self.store.operation(kind, body, "Synchronisation de la boîte" if not key else "Lecture du mail")
        output = self.cfg.state / "mail/incoming" / (op["operation_id"] + ".json")
        prompt_file = ENGINE / "bin/panel_prompts" / ("mail-sync.md" if kind == "mail.sync" else "mail-fetch.md")
        prompt = prompt_file.read_text() + "\nConfiguration: " + canonical({"output": str(output), "message_id": key, "probe": probe,
                 "body_prefetch": self.cfg["mail"].get("body_prefetch", 50), "proposals_per_sync": self.cfg["mail"].get("proposals_per_sync", 100),
                 "triage_rules": self.cfg["mail"].get("triage_rules"), "preferences": str(self.cfg.home / "local/owner-prefs.md")})
        self.launcher.enqueue(op, {"account": "claude", "model": "sonnet", "provider": "claude", "cwd": str(self.cfg.home), "profile": "read",
                                  "prompt": prompt, "output": str(output), "message_id": key, "probe": probe}, route, body, "collect" if not key else "fetch")
        return op

    def plan(self, body):
        snapshot = self.raw()
        if not snapshot["snapshot_rev"] or snapshot["snapshot_rev"] != body.get("snapshot_rev"):
            raise Problem(409, "conflict", "La boîte a changé. Recharge la liste.")
        rows = body.get("items")
        if not isinstance(rows, list) or not 1 <= len(rows) <= 500:
            raise Problem(400, "bad_request", "Sélection invalide.")
        folders = {f["id"]: f for f in self.folders()["folders"]}
        source = next((f["id"] for f in folders.values() if f["well_known"] == "inbox"), None)
        items, rejected, seen = [], [], set()
        for selected in rows:
            if not isinstance(selected, dict) or not isinstance(selected.get("message_id"), str):
                raise Problem(400, "bad_request", "Message invalide dans le lot.")
            key, action = selected["message_id"], selected.get("action")
            if key in seen:
                raise Problem(400, "bad_request", "Un message apparaît deux fois dans le lot.")
            seen.add(key)
            row = self.find(key)
            target = selected.get("folder_id")
            if action == "archive":
                target = next((f["id"] for f in folders.values() if f["well_known"] == "archive"), None)
            if action not in ("move", "archive") or not source or target not in folders or not folders[target]["allowed_target"]:
                rejected.append({"message_id": key, "action": action, "code": "capability_unavailable", "message": "Corbeille indisponible : outil absent." if action == "trash" else "Action ou dossier non autorisé."})
                continue
            items.append({"message_id": key, "subject": row["subject"], "from": row["from"]["name"], "received": row["received"], "action": action,
                          "source_folder_id": source, "folder_id": target, "folder_path": folders[target]["path"]})
        plan = {"plan_id": uid("plan_"), "plan_hash": None, "snapshot_rev": snapshot["snapshot_rev"], "created_at": now(),
                "expires_at": (dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=15)).isoformat(), "status": "ready", "dry_run": self.cfg.dry,
                "summary": {"move": sum(i["action"] == "move" for i in items), "archive": sum(i["action"] == "archive" for i in items), "trash": 0, "rejected": len(rejected)},
                "items": items, "rejected": rejected}
        plan["plan_hash"] = "sha256:" + digest(canonical(plan))
        self.store.put("plans", plan["plan_id"], plan)
        atomic(self.cfg.state / "mail/plans" / (plan["plan_id"] + ".json"), canonical(plan))
        return plan

    def execute(self, body, route):
        plan = self.store.get("plans", body.get("plan_id", ""))
        if not plan:
            raise Problem(404, "not_found", "Lot introuvable.")
        if plan["status"] != "ready":
            raise Problem(409, "plan_consumed", "Ce lot a déjà été exécuté.", {"plan_id": plan["plan_id"], "operation_id": plan.get("operation_id")})
        if plan["expires_at"] < now() or plan["snapshot_rev"] != self.raw()["snapshot_rev"]:
            raise Problem(409, "plan_expired", "Lot expiré ou boîte resynchronisée depuis. Refaire la sélection.")
        if body.get("confirm") is not True or body.get("plan_hash") != plan["plan_hash"] or not plan["items"]:
            raise Problem(400, "bad_request", "Confirmation du manifeste requise.")
        self.require("mail_move")
        if not self.cfg.dry:
            # Live activation also needs the verified message-level guard and reconciliation.
            self.require("tool_deny_passthrough")
            raise Problem(422, "capability_unavailable", "Exécution réelle en attente du contrôle du connecteur et de la garde.", {"capability": "mail_move"})
        op = self.store.operation("mail.triage.execute", body, "Rangement de " + str(len(plan["items"])) + " mails", dry=self.cfg.dry)
        plan.update(status="consumed", operation_id=op["operation_id"])
        self.store.put("plans", plan["plan_id"], plan)
        self.launcher.enqueue(op, {"simulated": True, "manifest": plan}, route, body, "execute")
        return op

    def reply(self, key, body, route):
        row = self.find(key)
        if not isinstance(body.get("instructions"), str) or not body["instructions"].strip():
            raise Problem(400, "bad_request", "Consigne de réponse obligatoire.")
        model = body.get("model", "sonnet")
        if model not in self.cfg["chat"].get("models", ["haiku", "sonnet", "opus"]):
            raise Problem(422, "invalid_model", "Modèle invalide.")
        if not self.cfg.dry:
            self.require("draft_skeleton")
            self.require("draft_style")
            raise Problem(422, "capability_unavailable", "Brouillons réels en attente du contrôle du profil de mise en forme.", {"capability": "draft_style"})
        op = self.store.operation("mail.reply_all", body, "Réponse à tous : " + row["subject"], row["topic_id"], self.cfg.dry)
        self.launcher.enqueue(op, {"simulated": True, "message_id": key, "instructions": body["instructions"]}, route, body)
        op["steps"] = [step("skeleton", "claude", model), step("style", "worka", self.cfg["accounts"].get("worka", {}).get("model", "gpt-5")), step("verify", "claude", "sonnet")]
        self.store.save_op(op)
        return op

    def undo(self, original, body, route):
        if original["undone_by"] or not original["undo"]["available"]:
            raise Problem(409, "conflict", "Ce lot ne peut pas être annulé.")
        if not self.cfg.dry or not original["dry_run"]:
            raise Problem(422, "capability_unavailable", "Contrôle distant requis avant l'annulation.")
        rows = [i for i in original["items"] if i["status"] == "succeeded" and i.get("new_message_id")]
        op = self.store.operation("mail.triage.undo", body, "Annulation du rangement", dry=True)
        self.launcher.enqueue(op, {"simulated": True, "undoes": original["operation_id"], "manifest": {"items": [
            {"message_id": i["new_message_id"], "folder_id": i["source_folder_id"], "source_folder_id": i["folder_id"], "action": "move", "folder_path": None} for i in rows]}}, route, body, "undo")
        original["undone_by"] = op["operation_id"]
        original["undo"]["available"] = False
        self.store.save_op(original)
        return op

    def reconcile(self, original, body, route):
        if original["status"] != "unknown":
            raise Problem(409, "conflict", "Seule une opération incertaine peut être vérifiée.")
        self.launcher.running(fresh=True)
        op = self.store.operation("mail.triage.reconcile", body, "Vérification en lecture seule")
        output = self.cfg.state / "mail/incoming" / (op["operation_id"] + ".json")
        prompt = "Read-only reconciliation. Never change or retry the original action. Find each message by id and compare its actual folder with the frozen manifest. Write {items:[{message_id,folder_id,found}], evidence:[...]} to " + str(output) + ".\n" + canonical(original)
        self.launcher.enqueue(op, {"account": "claude", "model": "sonnet", "provider": "claude", "cwd": str(self.cfg.home),
                                  "profile": "read", "output": str(output), "prompt": prompt, "reconciles": original["operation_id"]}, route, body, "reconcile")
        return op

    def complete(self, op, job, row, text):
        if not op["kind"].startswith("mail."):
            return
        if job.get("simulated"):
            op["status"] = "succeeded"
            for s in op["steps"]:
                s.update(status="succeeded", started_at=now(), ended_at=now(), run_id="simulated", output={"simulated": True})
            if op["kind"] == "mail.reply_all":
                op["steps"][0]["output"].update(draft_id=None, replied_message_id=job["message_id"], to=[], cc=[], existing_draft=None, sent_check="non exécuté : mode essai")
                op["result"] = {"draft_link": None, "checks": [{"name": name, "ok": None, "detail": "simulation, aucune écriture distante"} for name in ("body_present", "signature", "size", "attachments", "no_send")], "simulated": True}
            else:
                manifest = job["manifest"]
                for item in manifest["items"]:
                    assert tool_allowed("triage", "outlook_modify_labels", {"messageId": item["message_id"], "moveToFolderId": item["folder_id"]}, manifest)
                    op["items"].append({"ref": {"kind": "mail", "id": item["message_id"]}, "status": "succeeded", "action": item["action"],
                                        "source_folder_id": item["source_folder_id"], "folder_id": item["folder_id"], "folder_path": item.get("folder_path"),
                                        "new_message_id": item["message_id"], "detail": "simulation, aucun déplacement réel"})
                op["result"] = {"plan_id": manifest.get("plan_id"), "succeeded": len(op["items"]), "failed": 0, "unknown": 0, "simulated": True}
                if op["kind"] == "mail.triage.execute":
                    op["undo"] = {"available": True, "until": None, "reason": "Annuler le lot simulé."}
            return
        if op["status"] != "succeeded":
            return
        output = read_json(job.get("output", ""))
        if output is None:
            op.update(status="unknown", error={"code": "result_missing", "message": "Le run est terminé sans résultat validable.", "retryable": False, "details": {}})
            return
        try:
            if op["kind"] == "mail.sync":
                op["result"] = self.publish(output)
                if op["result"]["coverage"]["status"] != "complete":
                    op["status"] = "partial"
            elif op["kind"] == "mail.fetch":
                atomic(self.body_path(job["message_id"]), canonical(self.validate_body(output)))
                op["result"] = {"message_id": job["message_id"], "body_status": "cached"}
            elif op["kind"] == "mail.triage.reconcile":
                if not isinstance(output.get("items"), list) or not output.get("evidence"):
                    raise ValueError("unproven reconciliation")
                op["result"] = output
                original = self.store.get("operations", job["reconciles"])
                original["result"] = {"reconciliation_operation_id": op["operation_id"], "observations": output["items"]}
                self.store.save_op(original)
        except (ValueError, KeyError, TypeError):
            op.update(status="failed", error={"code": "invalid_result", "message": "Résultat invalide. Instantané précédent conservé.", "retryable": False, "details": {}})
