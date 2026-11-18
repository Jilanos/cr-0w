"""Lossless Markdown pending reader and targeted, journalled mutations."""
import base64
import datetime as dt
from pathlib import Path
import re
import secrets
import unicodedata

from .core import Problem, atomic, canonical, digest, lock, locked, now


def split_row(line):
    return [v.strip() for v in re.split(r'(?<!\\)\|', line.strip().strip("|"))]


def fold(value):
    return "".join(c for c in unicodedata.normalize("NFKD", value.lower()) if not unicodedata.combining(c) and (c.isalnum() or c.isspace())).strip()


def slug(value):
    return re.sub(r"[^a-z0-9]+", "-", fold(value)).strip("-") or "section"


def workdays_between(start, end):
    days = 0
    while start < end:
        start += dt.timedelta(days=1)
        days += start.weekday() < 5
    return days


def due_date(value):
    match = re.search(r'\b(\d{1,2})/(\d{1,2})(?:/(\d{4}))?\b', value or "")
    if not match:
        return None
    day, month, year = match.groups()
    today = dt.date.today()
    candidates = []
    for y in ([int(year)] if year else [today.year - 1, today.year, today.year + 1]):
        try:
            candidates.append(dt.date(y, int(month), int(day)))
        except ValueError:
            pass
    return min(candidates, key=lambda d: abs((d - today).days)).isoformat() if candidates else None


class Pending:
    def __init__(self, cfg, store, files, topics):
        self.cfg, self.store, self.files, self.topics = cfg, store, files, topics
        self.path = Path(cfg["pending_md"]) if cfg.get("pending_md") else None
        self.active_maj = lambda: None

    def lock_info(self):
        if locked(self.cfg.locks, "pending") or locked(self.cfg.locks, "maj"):
            return {"holder": "maj", "since": None, "run_id": None}
        return self.active_maj()

    def read_bytes(self):
        return self.path.read_bytes() if self.path and self.path.is_file() else b""

    def version(self):
        stat = self.path.stat() if self.path and self.path.is_file() else None
        return (stat.st_mtime_ns, stat.st_size, stat.st_ino) if stat else None

    def parse(self, data=None, hints=None):
        data = self.read_bytes() if data is None else data
        rev = digest(data, "d_")
        lines = data.decode("utf-8").splitlines(keepends=True)
        sections, entries, free, unparsed = [], [], [], []
        current, block, columns = None, None, None
        i = 0
        while i < len(lines):
            line = lines[i]
            if line.startswith("## "):
                title = line[3:].strip()
                mapping = next((s for s in self.cfg["pending"].get("sections", []) if fold(title).startswith(fold(s["prefix"]))), None)
                current = {"key": mapping["key"] if mapping else slug(title), "title": title,
                           "kind": mapping["kind"] if mapping else "other", "columns": None, "items": [], "_start": i, "_end": len(lines)}
                if sections:
                    sections[-1]["_end"] = i
                sections.append(current)
                if mapping is None:
                    unparsed.append({"section": current["key"], "line": i + 1, "reason": "section non reconnue"})
                block, columns = None, None
                i += 1
                continue
            if line.startswith("### "):
                block = slug(line[4:].strip())
                if current is not None:
                    current.setdefault("blocks", []).append({"key": block, "title": line[4:].strip(), "folder_file_id": None})
                columns = None
                i += 1
                continue
            if line.startswith("|") and i + 1 < len(lines) and re.match(r'^\s*\|?[\s:|-]+\|\s*$', lines[i + 1]):
                columns = split_row(line)
                if current is not None:
                    current["columns"] = columns
                i += 2
                continue
            is_table = line.startswith("|") and columns is not None
            is_list = line.startswith("- ")
            if current is not None and (is_table or is_list):
                end = i + 1
                if is_list:
                    while end < len(lines) and lines[end].startswith(("  ", "\t")):
                        end += 1
                raw = "".join(lines[i:end])
                cells = dict(zip(columns, split_row(line))) if is_table else {"text": raw[2:].rstrip()}
                title = cells.get("Qui", cells.get("Sujet", cells.get("text", next(iter(cells.values()), ""))))
                title_plain = "".join(s["v"] for s in self.files.segments(title))
                due_raw = cells.get("Échéance")
                due = due_date(due_raw)
                actions = ["chat"] if current["kind"] == "done" else ["done", "chat"]
                if due_raw is not None and current["kind"] == "followups":
                    actions.insert(1, "snooze")
                if current["kind"] == "followups":
                    actions.insert(-1, "followup")
                record = {"section": current["key"], "block": block, "raw": raw, "start": i, "end": end,
                          "prev": lines[i - 1] if i else None, "next": lines[end] if end < len(lines) else None,
                          "item_rev": digest(raw, "r_"), "doc_rev": rev, "raw_cells": cells, "section_kind": current["kind"]}
                item = {"id": None, "item_rev": record["item_rev"], "section": current["key"], "block": block,
                        "kind": "table_row" if is_table else "list_item", "columns": columns if is_table else None,
                        "cells": {k: self.files.segments(v) for k, v in cells.items()}, "title": title_plain,
                        "due": due, "due_raw": due_raw,
                        "overdue_workdays": workdays_between(dt.date.fromisoformat(due), dt.date.today()) if due and due < dt.date.today().isoformat() else None,
                        "prio": next((v for k, v in {"🔴": "red", "🟡": "yellow", "🟢": "green", "🔵": "blue"}.items() if k in raw), None),
                        "actions": actions, "topic_id": None, "source_line": i + 1}
                entries.append((record, item, current))
                i = end
                continue
            if line.strip() and not line.startswith(("# ", "---")):
                end = i + 1
                while end < len(lines) and lines[end].strip() and not lines[end].startswith(("#", "|", "- ")):
                    end += 1
                text = "".join(lines[i:end]).strip()
                key = digest(text, "b_")[:18]
                free.append({"id": key, "section": current["key"] if current else None, "title": text.splitlines()[0][:120],
                             "segments": self.files.segments(text), "topic_id": self.topics("pending", key, text[:120], {"text": text})})
                i = end
                continue
            i += 1
        old = self.store.all("pending_index")
        previous = self.store.get("meta", "pending", {})
        groups = {}
        for record, item, section in entries:
            key = (record["section"], record["block"], record["raw"])
            groups.setdefault(key, []).append(record)
        live_ids = set()
        for record, item, section in entries:
            group = groups[(record["section"], record["block"], record["raw"])]
            rank = group.index(record)
            record["rank"] = rank
            peers = [r for r in old if r.get("active") and (r["section"], r["block"], r["raw"]) == (record["section"], record["block"], record["raw"])]
            changed = previous.get("doc_rev") != rev and hints is None
            uncertain = changed and (len(peers) > 1 or len(group) > 1) and (
                len(peers) != len(group) or [(r["prev"], r["next"]) for r in peers] != [(r["prev"], r["next"]) for r in group])
            for peer in peers if uncertain else []:
                peer["ambiguous"] = True
                self.store.put("pending_index", peer["id"], peer)
            match = next((r for r in peers if r["rank"] == rank and not r.get("ambiguous")), None)
            key = (hints or {}).get(record["start"]) or (match["id"] if match and not uncertain else "p_" + base64.b32encode(secrets.token_bytes(5)).decode().lower())
            record.update(id=key, active=True, ambiguous=False)
            former = next((r for r in old if r["id"] == key), {})
            record["original_group_size"] = former.get("original_group_size", len(group))
            record["anchor_prev"] = former.get("anchor_prev", former.get("prev", record["prev"]))
            record["anchor_next"] = former.get("anchor_next", former.get("next", record["next"]))
            self.store.put("pending_index", key, record)
            item["id"] = key
            item["topic_id"] = None if section["kind"] == "done" else self.topics("pending", key, item["title"], record)
            live_ids.add(key)
            section["items"].append(item)
        for record in old:
            if record["id"] not in live_ids:
                saved = self.store.get("pending_index", record["id"])
                saved["active"] = False
                self.store.put("pending_index", record["id"], saved)
                topic_id = digest("pending:" + record["id"], "t_")[:26]
                topic = self.store.get("topics", topic_id)
                if topic:
                    topic["orphan"] = True
                    self.store.put("topics", topic_id, topic)
        self.store.put("meta", "pending", {"doc_rev": rev})
        return {"generated_at": now(), "file_label": self.cfg["pending"].get("label", "En attente"), "doc_rev": rev,
                "writable": bool(self.path and self.path.is_file()) and self.lock_info() is None, "lock": self.lock_info(),
                "updated_note": None, "sections": sections, "free_blocks": free, "unparsed": unparsed}, lines, entries

    def view(self):
        result, _, _ = self.parse()
        for section in result["sections"]:
            section.pop("_start", None)
            section.pop("_end", None)
        return result

    def check_lock(self):
        info = self.active_maj()
        if info or locked(self.cfg.locks, "maj"):
            raise Problem(423, "locked", "Mise à jour en cours.", info, True)

    def submit(self, key, action, body, route):
        try:
            return 200, self.mutate(key, action, body, route)
        except Problem as exc:
            if exc.status != 423 or body.get("queue") is not True:
                raise
        document = self.view()
        item = next((i for s in document["sections"] for i in s["items"] if i["id"] == key), None)
        if not item or item["item_rev"] != body.get("item_rev"):
            raise Problem(409, "conflict", "La ligne a changé depuis l'affichage.")
        if action not in item["actions"]:
            raise Problem(400, "bad_request", "Action indisponible sur cette ligne.")
        frozen = dict(body)
        if action == "snooze":
            frozen.pop("workdays", None)
            frozen["due"] = self.snooze_due(body).isoformat()
        self.validate_note(body.get("note"))
        op = self.store.operation("pending." + action, body, "En file : " + item["title"], item["topic_id"], self.cfg.dry)
        op["status"] = "queued"
        op["steps"] = [{"name": "wait_pending", "status": "queued", "run_id": None, "account": None, "model": None}]
        self.store.put("jobs", op["operation_id"], {"kind": "pending", "key": key, "action": action, "body": frozen, "route": route,
                       "accepted_mode": self.cfg["mode"], "pending_path": str(self.path.resolve())})
        self.store.put("intents", op["operation_id"], {"request_hash": digest(canonical([route, body]))})
        self.store.save_op(op)
        self.store.audit(op)
        self.store.event(op["operation_id"], "status", {"status": "queued", "at": now()})
        return 202, op

    def resume(self, op, job):
        try:
            if not self.path or job.get("pending_path") != str(self.path.resolve()):
                raise Problem(422, "policy_denied", "Le fichier cible a changé depuis ce clic. Relance l'action sur le fichier actuel.")
            self.mutate(job["key"], job["action"], job["body"], job["route"], op)
        except Problem as exc:
            if exc.status == 423:
                return
            op.update(status="failed", error=exc.body["error"])
            self.store.save_op(op)
            self.store.event(op["operation_id"], "done", {"status": "failed", "exit_code": None, "final_segments": []})

    @staticmethod
    def validate_note(note):
        if note is not None and (not isinstance(note, str) or "\n" in note or "\r" in note or len(note) > 2000):
            raise Problem(400, "bad_request", "Note invalide.")

    @staticmethod
    def snooze_due(body):
        if ("due" in body) == ("workdays" in body):
            raise Problem(400, "bad_request", "Choisis une date ou un nombre de jours ouvrés.")
        try:
            if "due" in body:
                return dt.date.fromisoformat(body["due"])
            count = body["workdays"]
            if type(count) is not int or not 1 <= count <= 366:
                raise ValueError()
            due = dt.date.today()
            for _ in range(count):
                due += dt.timedelta(days=1)
                while due.weekday() >= 5:
                    due += dt.timedelta(days=1)
            return due
        except (ValueError, TypeError):
            raise Problem(400, "bad_request", "Échéance invalide.")

    def mutate(self, key, action, body, route, queued_op=None):
        self.check_lock()
        with lock(self.cfg.locks, "pending", False):
            version = self.version()
            before = self.read_bytes()
            previous = self.store.get("pending_index", key)
            document, lines, entries = self.parse(before)
            saved = self.store.get("pending_index", key, {})
            if saved.get("ambiguous"):
                raise Problem(409, "ambiguous", "Deux lignes identiques après une modification externe. Rien n'a été écrit.", {"item_id": key})
            found = next(((r, i, s) for r, i, s in entries if r["id"] == key), None)
            if not previous or not found or body.get("item_rev") != previous["item_rev"]:
                raise Problem(409, "conflict", "La ligne a changé depuis l'affichage. Liste rechargée.", {"item_id": key})
            record, item, section = found
            if action not in item["actions"]:
                raise Problem(400, "bad_request", "Action indisponible sur cette ligne.")
            newline = "\r\n" if b"\r\n" in before else "\n"
            updated = list(lines)
            inserted = None
            if action == "done":
                cells = record["raw_cells"]
                title = cells.get("Qui", cells.get("Sujet", next(iter(cells.values()), "")))
                expected = cells.get("Attendu", " / ".join(v for v in cells.values() if v != title))
                text = title + " : " + expected if item["kind"] == "table_row" else record["raw"][2:].rstrip()
                note = body.get("note")
                self.validate_note(note)
                inserted = "- " + dt.date.today().strftime("%d/%m") + " " + text + (" (" + note + ")" if note else "") + newline
                del updated[record["start"]:record["end"]]
                done = next((s for s in document["sections"] if s["kind"] == "done"), None)
                if done:
                    position = done["_start"] + 1 - (record["end"] - record["start"] if record["start"] < done["_start"] else 0)
                else:
                    position = len(updated)
                    updated.extend([newline, "## ✅ Réglé récemment" + newline])
                    position += 2
                updated[position:position] = [inserted]
            else:
                due = self.snooze_due(body)
                parts = re.split(r'(?<!\\)\|', record["raw"])
                offset = 1 + item["columns"].index("Échéance")
                cell = parts[offset]
                parts[offset] = re.sub(r'\S.*\S|\S', due.strftime("%d/%m"), cell, count=1) if cell.strip() else cell + due.strftime("%d/%m")
                updated[record["start"]:record["end"]] = ["|".join(parts)]
            after = "".join(updated).encode()
            op = queued_op or self.store.operation("pending." + action, body, "", item["topic_id"], self.cfg.dry)
            op.update(status="running", summary=("Réglé : " if action == "done" else "Reporté : ") + item["title"])
            for step in op["steps"]:
                step.update(status="succeeded", ended_at=now())
            inverse = {"record": record, "inserted": inserted, "replacement": "".join(updated[record["start"]:record["end"]]) if action == "snooze" else None,
                       "original_count": record["original_group_size"]}
            op["items"] = [{"ref": {"kind": "pending", "id": key}, "status": "succeeded", "detail": "ligne déplacée dans Réglé récemment" if action == "done" else "échéance reportée"}]
            self.write(op, before, after, inverse, route, body, version)
            if action == "done":
                op["result"]["moved_to"] = {"section": "done", "item_id": key, "line_preview": inserted.rstrip()}
            else:
                op["result"]["item_rev_after"] = digest("|".join(parts), "r_")
            self.store.save_op(op)
            # Preserve the identities of every surviving line by its exact position after the splice.
            hints = {}
            if action == "done":
                hints[position] = key
            for old, _, _ in entries:
                if old["id"] == key:
                    if action == "snooze":
                        hints[old["start"]] = key
                    continue
                pos = old["start"]
                if action == "done":
                    if pos >= record["end"]:
                        pos -= record["end"] - record["start"]
                    if pos >= position:
                        pos += len(inserted.splitlines())
                hints[pos] = old["id"]
            self.parse(after, hints)
            return op

    def write(self, op, before, after, inverse, route, body, version=None):
        backup = "EN_ATTENTE." + dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%S%f") + ".md"
        result = {"doc_rev_before": digest(before, "d_"), "doc_rev_after": digest(after, "d_"), "backup": backup}
        op["result"] = result
        request_hash = self.store.get("intents", op["operation_id"], {}).get("request_hash", digest(canonical([route, body])))
        intent = {"request_hash": request_hash, "before": digest(before), "after": digest(after), "inverse": inverse,
                  "pending_path": str(self.path.resolve()), "accepted_mode": self.cfg["mode"]}
        self.store.put("intents", op["operation_id"], intent)
        self.store.save_op(op)
        atomic(self.cfg.state / "backups" / backup, before)
        for path in sorted((self.cfg.state / "backups").glob("*.md"))[:-200]:
            path.unlink()
        if self.read_bytes() != before or version is not None and self.version() != version:
            op["status"] = "failed"
            self.store.save_op(op)
            raise Problem(409, "conflict", "Le fichier a changé avant l'écriture. Rien n'a été écrit.")
        atomic(self.path, after)
        op["status"] = "succeeded"
        op["undo"] = {"available": op["kind"] != "pending.undo", "until": (dt.datetime.now(dt.timezone.utc) + dt.timedelta(seconds=10)).isoformat(), "reason": None}
        self.store.save_op(op)
        self.store.audit(op, result["doc_rev_before"], result["doc_rev_after"])
        self.store.event(op["operation_id"], "done", {"status": "succeeded", "exit_code": 0, "final_segments": []})

    def undo(self, original, body, route):
        intent = self.store.get("intents", original["operation_id"], {})
        if (not self.path or intent.get("pending_path") != str(self.path.resolve())
                or intent.get("accepted_mode") != self.cfg["mode"]):
            raise Problem(422, "policy_denied", "Le mode ou le fichier cible a changé depuis cette action. Sauvegarde disponible.")
        if original["undone_by"]:
            raise Problem(409, "conflict", "Cette action est déjà annulée.")
        until = original["undo"].get("until")
        if not until or dt.datetime.now(dt.timezone.utc) > dt.datetime.fromisoformat(until) + dt.timedelta(seconds=2):
            raise Problem(409, "undo_expired", "Fenêtre d'annulation de 10 s dépassée. Sauvegarde disponible.", {"operation_id": original["operation_id"], "backup": (original["result"] or {}).get("backup")})
        self.check_lock()
        with lock(self.cfg.locks, "pending", False):
            version = self.version()
            before = self.read_bytes()
            document, lines, entries = self.parse(before)
            intent = self.store.get("intents", original["operation_id"])
            inverse = intent["inverse"]
            record = inverse["record"]
            updated = list(lines)
            if original["kind"] == "pending.snooze":
                matches = [r for r, _, _ in entries if r["id"] == record["id"] and r["raw"] == inverse["replacement"]]
                if len(matches) != 1:
                    raise Problem(409, "conflict", "La ligne reportée a changé.")
                current = matches[0]
                updated[current["start"]:current["end"]] = [record["raw"]]
                hint = {current["start"]: record["id"]}
            else:
                inserted = inverse["inserted"]
                matches = [r for r, _, s in entries if r["id"] == record["id"] and r["raw"] == inserted and s["kind"] == "done"]
                count = sum(r["raw"] == record["raw"] and r["section"] == record["section"] and r["block"] == record["block"] for r, _, _ in entries)
                if len(matches) != 1 or count >= inverse["original_count"]:
                    raise Problem(409, "conflict", "La ligne réglée a changé ou l'original est déjà présent.")
                removed = matches[0]
                del updated[removed["start"]:removed["end"]]
                section = next((s for s in document["sections"] if s["key"] == record["section"]), None)
                if not section:
                    raise Problem(409, "conflict", "Section d'origine absente.")
                start = section["_start"] + 1
                end = section["_end"]
                if removed["start"] < start:
                    start -= removed["end"] - removed["start"]
                    end -= removed["end"] - removed["start"]
                if record["block"]:
                    headings = [i for i in range(start, min(end, len(updated))) if updated[i].startswith("### ")]
                    matches = [i for i in headings if slug(updated[i][4:].strip()) == record["block"]]
                    if len(matches) != 1:
                        raise Problem(409, "ambiguous", "Bloc d'origine absent ou ambigu.")
                    start = matches[0] + 1
                    end = next((i for i in headings if i > matches[0]), end)
                prev = [i for i in range(start, min(end, len(updated))) if updated[i] == record.get("anchor_prev", record["prev"])]
                nex = [i for i in range(start, min(end, len(updated))) if updated[i] == record.get("anchor_next", record["next"])]
                position = prev[-1] + 1 if len(prev) == 1 else nex[0] if len(nex) == 1 else end
                updated[position:position] = [record["raw"]]
                hint = {position: record["id"]}
            op = self.store.operation("pending.undo", body, "Annulé : ligne remise à sa place", original["topic_id"])
            op["items"] = original["items"]
            self.write(op, before, "".join(updated).encode(), {"undoes": original["operation_id"]}, route, body, version)
            op["result"]["undoes"] = original["operation_id"]
            self.store.save_op(op)
            original["undone_by"] = op["operation_id"]
            original["undo"]["available"] = False
            self.store.save_op(original)
            self.parse("".join(updated).encode(), hint)
            return op

    def recover(self):
        for op in self.store.all("operations"):
            if op["status"] != "running" or not op["kind"].startswith("pending."):
                continue
            intent = self.store.get("intents", op["operation_id"], {})
            data = self.read_bytes()
            inverse = intent.get("inverse", {})
            record = inverse.get("record", {})
            if digest(data) == intent.get("after"):
                status = "succeeded"
            elif digest(data) == intent.get("before"):
                status = "failed"
            elif inverse.get("inserted") and inverse["inserted"].encode() in data and record.get("raw", "").encode() not in data:
                status = "succeeded"
            else:
                status = "unknown"
            op["status"] = status
            op["result"] = {**(op["result"] or {}), "recovered": True}
            op["undo"] = {"available": False, "until": None, "reason": "fenêtre dépassée pendant le redémarrage"}
            self.store.save_op(op)
