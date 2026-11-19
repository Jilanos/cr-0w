"""Grouped search over published local data. Never launches an agent or fetches mail."""
import unicodedata

from .core import Problem, now


def folded(text):
    return "".join(c for c in unicodedata.normalize("NFKD", str(text or "")).casefold() if not unicodedata.combining(c))


def cell_text(cells):
    return " ".join(s.get("v", "") for segments in cells.values() for s in segments)


class Search:
    def __init__(self, app):
        self.app = app

    def view(self, query):
        text = query.get("q", [""])[0].strip()
        if len(text) > 200:
            raise Problem(400, "bad_request", "Recherche limitée à 200 caractères.")
        limit = int(query.get("limit", [20])[0])
        if not 1 <= limit <= 50:
            raise Problem(400, "bad_request", "Limite de résultats invalide.")
        groups = {kind: {"kind": kind, "label": label, "total": 0, "items": []} for kind, label in (
            ("mail", "Mails"), ("pending", "En attente"), ("decision", "Décisions"), ("dossier", "Dossiers"), ("run", "Runs"), ("conversation", "Conversations"))}
        result = {"generated_at": now(), "query": text, "groups": list(groups.values()), "sources": {}}
        terms = folded(text).split()
        if not terms:
            return result

        def add(kind, key, title, subtitle, view, search_text=""):
            haystack = folded(" ".join(str(v or "") for v in (title, subtitle, search_text)))
            if not all(term in haystack for term in terms):
                return
            group = groups[kind]
            group["total"] += 1
            if len(group["items"]) < limit:
                group["items"].append({"key": key, "title": title, "subtitle": subtitle or "", "view": view})

        mail = self.app.mail.raw()
        result["sources"]["mail"] = {"coverage": mail["coverage"]["status"], "synced_at": mail["synced_at"], "stale": self.app.mail.stale(mail)}
        # Search every published row, including those beyond the first mailbox page.
        for row in mail["items"]:
            sender = row["from"]
            add("mail", row["id"], row["subject"], sender.get("name"), "mail", " ".join((sender.get("address", ""), row.get("preview", ""))))
        pending = self.app.pending.view()
        for section in pending["sections"]:
            for row in section["items"]:
                decision = section["kind"] == "decisions"
                add("decision" if decision else "pending", row["id"], row["title"], section["title"],
                    "decisions" if decision else "pending", cell_text(row["cells"]))
        for row in self.app.readers.afk()["decisions"]:
            add("decision", "afk:" + str(row["n"]), row["question"], row.get("job"), "decisions",
                " ".join(row["options"] + [row.get("recommendation") or "", row.get("answer") or ""]))
        for row in self.app.readers.dossiers()["dossiers"]:
            add("dossier", row["slug"], row["title"], str(row["open_count"]) + " lignes", "dossiers")
        for topic in sorted(self.app.store.all("topics"), key=lambda t: t.get("last_message_at") or "", reverse=True):
            messages = self.app.store.get("messages", topic["topic_id"], [])
            transcript = " ".join(m.get("text", "") + " " + " ".join(s.get("v", "") for s in m.get("segments", [])) for m in messages)
            add("conversation", topic["topic_id"], topic["title"], "Réglé" if topic.get("settled") else "Conversation" if messages else "Sujet", "conversation", transcript)
        runs = self.app.readers.runs(24 * 365)
        result["sources"]["runs"] = runs["source_status"]
        for row in runs["runs"]:
            add("run", "run:" + row["run_id"], row["label"] or row["run_id"], row["status"], "jobs",
                " ".join(str(row.get(k) or "") for k in ("run_id", "project", "account", "model")))
        return result
