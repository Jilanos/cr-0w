"""Shared hub terminal, using the upstream tmux backend and crow-screen contract."""
import json
from pathlib import Path
import re
import shlex
import subprocess
import time

import crow_term
from .core import ENGINE, Problem, lock, read_json


class Terminal:
    def __init__(self, app):
        self.app, self.cfg = app, app.cfg

    def run(self, argv):
        try:
            return subprocess.run(argv, cwd=self.cfg.home, env=self.cfg.env, capture_output=True, text=True, timeout=30)
        except (OSError, subprocess.SubprocessError):
            raise Problem(503, "terminal_unavailable", "Terminal indisponible. Vérifie tmux.")

    def sessions(self):
        result = self.run(["tmux", "list-panes", "-a", "-F", "#{session_name}\t#{pane_pid}\t#{pane_current_path}"])
        rows = []
        for line in result.stdout.splitlines():
            fields = line.split("\t")
            if len(fields) != 3:
                continue
            name, pid, cwd = fields
            if (re.fullmatch(r"crow-[A-Za-z0-9_-]+", name) and pid.isdigit()
                    and Path(cwd).resolve() == self.cfg.home):
                rows.append({"session": name, "pid": int(pid), "attach": "tmux attach -t " + shlex.quote(name)})
        return sorted(rows, key=lambda row: row["session"])

    def status(self):
        rows = self.sessions()
        return {"running": bool(rows), "sessions": rows, "dry_run": self.cfg.dry}

    def target(self, body):
        row = next((r for r in self.sessions() if r["session"] == body.get("session") and r["pid"] == body.get("pid")), None)
        if not row:
            raise Problem(409, "hub_missing", "Cette session hub est arrêtée. Actualise le Terminal.")
        return row

    def screen(self, query):
        try:
            pid = int(query.get("pid", [0])[0])
        except (ValueError, TypeError):
            raise Problem(400, "bad_request", "PID invalide.")
        row = self.target({"session": query.get("session", [None])[0], "pid": pid})
        return {**row, **self.call("show", row)}

    def call(self, verb, row, *args):
        result = self.run([str(ENGINE / "bin/crow-screen"), verb, "--pid", str(row["pid"]), *args])
        try:
            value = json.loads(result.stdout)
        except ValueError:
            value = {}
        if result.returncode or not value.get("ok"):
            raise Problem(409, "terminal_unavailable", "Session inaccessible. Actualise le Terminal.")
        return value

    def start(self):
        if self.cfg.dry:
            raise Problem(422, "trial_mode", "Démarrage du hub disponible en mode réel.")
        with lock(self.cfg.locks, "panel-hub-start"):
            if self.sessions():
                return self.status()
            # crow term owns account selection, environment cleanup and detached tmux creation.
            argv = ["env", "CROW_TERMINAL=headless", str(ENGINE / "bin/crow"), "term", "--account", "claude", "--on-busy", "fail", "crow"]
            result = self.run(argv)
            if result.returncode:
                raise Problem(503, "hub_start_failed", "Démarrage refusé : " + result.stderr.strip()[-500:])
            for _ in range(40):
                status = self.status()
                if status["running"]:
                    return status
                time.sleep(.05)
            raise Problem(503, "hub_start_failed", "La session hub n’est pas encore visible. Actualise le Terminal avant de relancer.")

    def keys(self, body):
        row = self.target(body)
        keys = body.get("keys")
        try:
            crow_term.keys_args("%0", keys)
        except (ValueError, TypeError):
            raise Problem(400, "bad_request", "Touches invalides.")
        if self.cfg.dry:
            raise Problem(422, "trial_mode", "Saisie terminal disponible en mode réel.")
        return self.call("keys", row, "--keys", json.dumps(keys))

    def resize(self, body):
        row = self.target(body)
        cols, rows = body.get("cols"), body.get("rows")
        if type(cols) is not int or type(rows) is not int:
            raise Problem(400, "bad_request", "Dimensions invalides.")
        try:
            crow_term.resize_args("%0", cols, rows)
        except ValueError:
            raise Problem(400, "bad_request", "Dimensions invalides.")
        if self.cfg.dry:
            return {"ok": True, "dry_run": True}
        return self.call("resize", row, "--cols", str(cols), "--rows", str(rows))

    def handoff(self, body):
        topic = self.app.topic(body.get("topic_id"))
        context = self.app.store.get("contexts", topic["topic_id"], {})
        kind, ref = topic["kind"], topic["ref"]["id"]
        if kind == "pending":
            self.app.pending.view()
            context = self.app.store.get("contexts", topic["topic_id"], {})
            record = self.app.store.get("pending_index", ref, context)
            source = str(self.cfg["pending_md"]) + ":" + str(record.get("start", 0) + 1)
        elif kind == "mail":
            if body.get("message_id"):
                message = self.app.mail.find(body["message_id"])
                if message["topic_id"] != topic["topic_id"]:
                    raise Problem(409, "conflict", "Ce mail ne correspond plus au sujet.")
                topic = {**topic, "title": message["subject"]}
                context = {"message_id": message["id"]}
            body_path = self.app.mail.body_path(context.get("message_id", ref))
            cached = read_json(body_path, {})
            message_id = context.get("message_id", ref)
            native_link = "outlook:" + message_id if self.app.mail.raw().get("backend") == "outlook_com" and re.fullmatch(r"[0-9a-fA-F]{16,8192}", message_id) else None
            source = context.get("web_link") or cached.get("owa_link") or native_link or str(self.app.mail.snapshot_path) + ":1 · mail " + message_id
        elif kind == "dossier":
            source = context.get("folder_path") or "dossier " + ref
        else:
            source = ("run " + ref + " · " + str(context.get("report") or context.get("cwd") or "")) if kind == "run" else kind + " " + ref
        note = body.get("note", "")
        if not isinstance(note, str) or len(note) > 1500:
            raise Problem(400, "bad_request", "Note limitée à 1500 caractères.")
        # One literal line. Control characters cannot submit a command or inject terminal escapes.
        clean = lambda s: re.sub(r"[\x00-\x1f\x7f-\x9f\u2028\u2029]+", " ", str(s)).strip()
        text = clean(topic["title"])[:500] + " · " + clean(source)[:1500]
        if note.strip():
            text += " · Note : " + clean(note)
        self.keys({**body, "keys": [{"text": text}]})
        return {"ok": True, "text": text, "submitted": False}
