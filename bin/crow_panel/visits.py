"""Durable visit checkpoints. Reading state never acknowledges changes."""
from .core import canonical, digest, now


class Visits:
    def __init__(self, app):
        self.app, self.store = app, app.store

    def snapshot(self):
        pending = self.app.pending.view()
        rows = {"pending:" + i["id"]: {"text": i["title"], "rev": i["item_rev"],
                "ref": {"kind": "pending", "id": i["id"]}}
                for s in pending["sections"] if s["kind"] != "done" for i in s["items"]}
        for i in self.app.mail.raw()["items"]:
            rows["mail:" + i["id"]] = {"text": i["subject"], "rev": i["id"], "ref": {"kind": "mail", "id": i["id"]}}
        for op in self.store.all("operations"):
            if op["kind"] == "state.visit" or op["status"] in ("queued", "running", "cancel_requested"):
                continue
            rows["operation:" + op["operation_id"]] = {"text": op["summary"], "rev": op["status"],
                "ref": {"kind": "view", "id": "jobs"}}
        return {"visited_at": now(), "rows": rows}

    def changes(self):
        previous = self.store.get("meta", "visit")
        if previous is None:
            return None
        current = self.snapshot()["rows"]
        old = previous["rows"]
        changes = [{"change": "added" if key not in old else "changed", "text": row["text"], "ref": row["ref"]}
                   for key, row in current.items() if key not in old or old[key]["rev"] != row["rev"]]
        # A missing mail is not evidence of a sent draft or a resolved subject.
        changes.extend({"change": "removed", "text": row["text"], "ref": {"kind": "view", "id": "pending"}}
                       for key, row in old.items() if key.startswith("pending:") and key not in current)
        return {"visited_at": previous["visited_at"], "total": len(changes), "items": changes[:100], "truncated": len(changes) > 100}

    def visit(self, body, route):
        snapshot = self.snapshot()
        op = self.store.operation("state.visit", body, "Visite enregistrée", dry=self.app.cfg.dry)
        op["result"] = {"visited_at": snapshot["visited_at"]}
        self.store.put("intents", op["operation_id"], {"request_hash": digest(canonical([route, body])), "checkpoint": digest(canonical(snapshot))})
        self.store.save_op(op)
        self.store.put("meta", "visit", snapshot)
        op["status"] = "succeeded"
        self.store.save_op(op)
        return op

    def recover(self):
        checkpoint = digest(canonical(self.store.get("meta", "visit")))
        for op in self.store.all("operations"):
            if op["kind"] == "state.visit" and op["status"] == "running":
                intent = self.store.get("intents", op["operation_id"], {})
                op["status"] = "succeeded" if checkpoint == intent.get("checkpoint") else "unknown"
                self.store.save_op(op)
