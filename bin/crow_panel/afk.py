"""Revision-checked answers to structured decisions in a dated Markdown file."""
import datetime as dt
from pathlib import Path
import re

from .core import Problem, atomic, canonical, digest, lock, now


class Decisions:
    def __init__(self, app):
        self.app, self.cfg, self.store = app, app.cfg, app.store

    def paths(self, night):
        try:
            if dt.date.fromisoformat(night).isoformat() != night:
                raise ValueError()
        except (ValueError, TypeError):
            raise Problem(400, "bad_request", "Date de nuit invalide.")
        name = "decisions-" + night + ".md"
        source = Path(self.cfg.get("afk_dir", self.cfg.home / "local/state/afk")) / name
        target = self.cfg.state / "afk" / name if self.cfg.dry else source
        return source, target

    def read(self, night):
        source, target = self.paths(night)
        path = target if target.is_file() else source
        data = path.read_bytes() if path.is_file() else b""
        text = data.decode("utf-8")
        headings = list(re.finditer(r'(?m)^## (\d+)\. (.+)\r?$', text))
        rows = []
        # Legacy decision logs record choices already made. They have no option buttons.
        legacy = text[:headings[0].start()] if headings else text
        rows = [{"n": n, "job": None, "question": line[2:], "options": [], "recommendation": None,
                 "answered": True, "topic_id": None} for n, line in enumerate((l for l in legacy.splitlines() if l.startswith("- ")), 1)]
        for index, heading in enumerate(headings):
            start = heading.start()
            end = headings[index + 1].start() if index + 1 < len(headings) else len(text)
            # An unrelated level-one or level-two section terminates the decision.
            boundary = re.search(r'(?m)^#{1,2} ', text[heading.end():end])
            if boundary:
                end = heading.end() + boundary.start()
            block = text[start:end]
            fields = {}
            options = []
            for line in block.splitlines()[1:]:
                match = re.fullmatch(r'- (Option|Recommendation|Recommandation|Answer|Réponse|Job)\s*:\s*(.+)', line)
                if not match:
                    continue
                name, value = match.groups()
                if name == "Option":
                    options.append(value)
                else:
                    fields[name] = value
            answer = fields.get("Answer", fields.get("Réponse"))
            rows.append({"n": int(heading[1]), "job": fields.get("Job"), "question": heading[2].strip(),
                         "options": list(dict.fromkeys(options)), "recommendation": fields.get("Recommendation", fields.get("Recommandation")),
                         "answered": answer is not None, "answer": answer, "topic_id": None, "item_rev": digest(block, "r_"),
                         "_start": start, "_end": end})
        return data, rows

    def view(self, night):
        _, rows = self.read(night)
        return [{k: v for k, v in row.items() if not k.startswith("_")} for row in rows]

    def answer(self, n, body, route):
        night = body.get("night")
        source, target = self.paths(night)
        with lock(self.cfg.locks, "afk", False):
            before, rows = self.read(night)
            matches = [r for r in rows if r["n"] == n and "item_rev" in r]
            if len(matches) != 1:
                raise Problem(409, "ambiguous", "Décision absente ou ambiguë. Recharge la liste.")
            row = matches[0]
            if row["item_rev"] != body.get("item_rev"):
                raise Problem(409, "conflict", "La décision a changé. Recharge la liste.")
            if row["answered"]:
                raise Problem(409, "already_answered", "Cette décision a déjà une réponse.")
            choice = body.get("answer")
            if not isinstance(choice, str) or choice not in row["options"]:
                raise Problem(400, "bad_request", "Choisis une des options affichées.")
            text = before.decode("utf-8")
            newline = "\r\n" if b"\r\n" in before else "\n"
            block = text[row["_start"]:row["_end"]]
            addition = ("" if block.endswith(newline) else newline) + "- Answer: " + choice + newline
            after = (text[:row["_end"]] + addition + text[row["_end"]:]).encode("utf-8")
            op = self.store.operation("afk.answer", body, "Décision enregistrée : " + row["question"], dry=self.cfg.dry)
            backup = target.stem + "." + dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%S%f") + ".md"
            op["result"] = {"night": night, "n": n, "answer": choice, "backup": backup, "simulated": self.cfg.dry}
            self.store.put("intents", op["operation_id"], {"request_hash": digest(canonical([route, body])),
                           "before": digest(before), "after": digest(after), "target": str(target)})
            self.store.save_op(op)
            backups = self.cfg.state / "afk/backups"
            atomic(backups / backup, before)
            if self.read(night)[0] != before:
                op.update(status="failed")
                self.store.save_op(op)
                raise Problem(409, "conflict", "Le fichier de décisions a changé avant l'écriture.")
            atomic(target, after)
            op.update(status="succeeded")
            self.store.save_op(op)
            self.store.audit(op, digest(before), digest(after))
            self.store.event(op["operation_id"], "done", {"status": "succeeded", "exit_code": 0, "final_segments": []})
            for path in sorted(backups.glob("*.md"))[:-200]:
                path.unlink()
            return op

    def recover(self):
        for op in self.store.all("operations"):
            if op["kind"] != "afk.answer" or op["status"] != "running":
                continue
            intent = self.store.get("intents", op["operation_id"], {})
            path = Path(intent.get("target", ""))
            actual = digest(path.read_bytes()) if path.is_file() else None
            op["status"] = "succeeded" if actual and actual == intent.get("after") else "failed" if actual and actual == intent.get("before") else "unknown"
            op["result"] = {**(op["result"] or {}), "recovered": True}
            self.store.save_op(op)
