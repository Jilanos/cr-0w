"""Loopback-only HTTP API with session, CSRF and bounded SSE replay."""
import datetime as dt
import html
from http import cookies
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
from pathlib import Path
import re
import secrets
import subprocess
import threading
import time
from urllib.parse import parse_qs, unquote, urlsplit

from . import __version__
from .core import ACTIVE, ENGINE, Problem, Store, canonical, digest, lock, now, uid
from .launcher import Launcher
from .mail import Mail
from .pending import Pending
from .readers import Readers
from .security import CSP, Files
from .visits import Visits
from .afk import Decisions


class App:
    def __init__(self, cfg, command=None):
        self.cfg = cfg
        self.store = Store(cfg)
        self.files = Files(cfg, self.store)
        self.launcher = Launcher(cfg, self.store, command)
        self.pending = Pending(cfg, self.store, self.files, self.launcher.topic)
        self.pending.active_maj = self.launcher.maj
        self.launcher.pending = self.pending.resume
        self.mail = Mail(cfg, self.store, self.launcher)
        self.launcher.complete = self.mail.complete
        self.readers = Readers(self)
        self.visits = Visits(self)
        self.decisions = Decisions(self)
        self.pending.recover()
        self.decisions.recover()
        for op in self.store.all("operations"):
            if op["status"] in ACTIVE and not op["kind"].startswith("pending.") and not self.store.get("jobs", op["operation_id"]):
                op.update(status="unknown", error={"code": "interrupted_acceptance", "message": "Opération interrompue avant sa mise en file. Vérification requise.", "retryable": False, "details": {}})
                self.store.save_op(op)
        self.session = secrets.token_urlsafe(32)
        self.csrf = secrets.token_urlsafe(32)
        self.started = now()
        self.port = cfg["port"]
        self.streams = threading.BoundedSemaphore(8)
        self.pending.view()
        for name, project in cfg["projects"].items():
            self.launcher.topic("project", name, project.get("title", name), project)

    def public_config(self):
        # Values are an explicit allowlist. Private paths and action profiles never leave the server.
        return {"generated_at": now(), "mode": self.cfg["mode"], "chat": {
            "default_model": self.cfg["chat"].get("default_model", "sonnet"), "models": self.cfg["chat"].get("models", ["haiku", "sonnet", "opus"]),
            "default_account": self.cfg["chat"].get("default_account", "claude"), "accounts": [
                {"name": name, "provider": c.get("provider", "claude" if name == "claude" else "codex"), "kinds": c.get("kinds", []),
                 "models": self.cfg["chat"].get("models", ["haiku", "sonnet", "opus"]) if c.get("provider", "claude" if name == "claude" else "codex") == "claude"
                 else c.get("models", [c.get("model", "gpt-5")])} for name, c in self.cfg["accounts"].items()]},
            "undo_seconds": 10, "max_parallel": self.cfg["max_parallel"], "routines": [{"name": "maj", "label": "Mise à jour"}, {"name": "daily_update", "label": "Mise à jour machine"}],
            "views": ["today", "mail", "pending", "decisions", "drafts", "dossiers", "jobs", "accounts"],
            "shortcuts": {"j": "next", "k": "prev", "Enter": "open", "e": "pending_done", "r": "reply_all_box", "c": "focus_chat", "/": "filter", "x": "toggle_select", "?": "help", "Escape": "close"}}

    def topic(self, key):
        topic = self.store.get("topics", key)
        if not topic:
            raise Problem(404, "not_found", "Sujet introuvable.")
        return topic

    def operation(self, key):
        op = self.store.get("operations", key)
        if not op:
            raise Problem(404, "not_found", "Opération introuvable.")
        return op

    def get(self, path, query):
        if path == "/api/session":
            return {"generated_at": now(), "csrf_token": self.csrf, "mode": self.cfg["mode"], "version": __version__, "server_started_at": self.started, "port": self.port}
        routes = {"/api/config": self.public_config, "/api/state": self.readers.state, "/api/pending": self.pending.view,
                  "/api/capabilities": self.mail.capabilities, "/api/mail/folders": self.mail.folders, "/api/drafts": self.mail.drafts,
                  "/api/accounts": self.readers.accounts, "/api/routines": self.readers.routines, "/api/dossiers": self.readers.dossiers, "/api/afk": self.readers.afk}
        if path in routes:
            return routes[path]()
        if path == "/api/mail":
            return self.mail.list(query)
        if path == "/api/runs":
            return self.readers.runs(int(query.get("since_hours", [24])[0]))
        if path == "/api/dues":
            return self.readers.dues(int(query.get("days", [14])[0]))
        if path == "/api/topics":
            self.pending.view()
            return {"generated_at": now(), "topics": self.store.all("topics")}
        if path == "/api/operations":
            return {"operations": [o for o in self.store.all("operations") if query.get("active", ["0"])[0] != "1" or o["status"] in ACTIVE]}
        match = re.fullmatch(r'/api/(mail|runs|dossiers|operations)/([^/]+)', path)
        if match:
            kind, key = match.groups()
            return {"mail": self.mail.detail, "runs": self.readers.run, "dossiers": self.readers.dossier, "operations": self.operation}[kind](key)
        match = re.fullmatch(r'/api/topics/([^/]+)/messages', path)
        if match:
            topic = self.topic(match[1])
            return {"generated_at": now(), "topic_id": topic["topic_id"], "title": topic["title"], "ref": topic["ref"], "default_model": topic["default_model"],
                    "default_account": topic["default_account"], "orphan": topic["orphan"], "messages": self.store.get("messages", topic["topic_id"], [])}
        raise Problem(404, "not_found", "Route introuvable.")

    def mutate(self, method, path, body):
        if not isinstance(body, dict):
            raise Problem(400, "bad_request", "Objet JSON attendu.")
        if method == "PUT" and "request_id" not in body:
            body = {**body, "request_id": uid("req_")}
        route = method + " " + path
        with self.store.mutex:
            replay = self.store.replay(body.get("request_id"), route, body)
            if replay:
                return replay
            status, result = self._mutate(method, path, body, route)
            self.store.remember(body["request_id"], route, body, status, result)
            return status, result

    def _mutate(self, method, path, body, route):
        match = re.fullmatch(r'/api/topics/([^/]+)', path)
        if method == "PUT" and match:
            topic = self.topic(match[1])
            for field in ("default_model", "default_account"):
                if field in body:
                    topic[field] = body[field]
            self.launcher.select(topic, {})
            self.store.put("topics", topic["topic_id"], topic)
            return 200, topic
        if method != "POST":
            raise Problem(404, "not_found", "Route introuvable.")
        if path == "/api/state/visit":
            return 200, self.visits.visit(body)
        match = re.fullmatch(r'/api/afk/decisions/(\d+)/answer', path)
        if match:
            return 200, self.decisions.answer(int(match[1]), body, route)
        match = re.fullmatch(r'/api/pending/([^/]+)/(done|snooze)', path)
        if match:
            return self.pending.submit(match[1], match[2], body, route)
        match = re.fullmatch(r'/api/operations/([^/]+)/(undo|cancel|reconcile)', path)
        if match:
            op = self.operation(match[1])
            if match[2] == "cancel":
                result = self.launcher.cancel(op)
                self.store.audit(result)
                return 200, result
            if match[2] == "reconcile":
                return 202, self.mail.reconcile(op, body, route)
            if op["kind"].startswith("pending."):
                return 200, self.pending.undo(op, body, route)
            return 202, self.mail.undo(op, body, route)
        if path == "/api/mail/sync":
            return 202, self.mail.collect("mail.sync", body, route, probe=body.get("probe") is True)
        if path == "/api/mail/triage/plan":
            return 200, self.mail.plan(body)
        if path == "/api/mail/triage/execute":
            return 202, self.mail.execute(body, route)
        match = re.fullmatch(r'/api/mail/([^/]+)/(fetch|reply-all)', path)
        if match:
            return (202, self.mail.collect("mail.fetch", body, route, match[1])) if match[2] == "fetch" else (202, self.mail.reply(match[1], body, route))
        match = re.fullmatch(r'/api/topics/([^/]+)/messages', path)
        if match:
            return 202, self.launcher.chat(self.topic(match[1]), body, route)
        match = re.fullmatch(r'/api/routines/([^/]+)', path)
        if match:
            return 202, self.launcher.routine(match[1], body, route)
        match = re.fullmatch(r'/api/files/([^/]+)/open', path)
        if match:
            path = self.files.resolve(match[1])
            op = self.store.operation("file.open", body, "Ouvrir le document", dry=self.cfg.dry)
            if self.cfg.dry:
                opened = False
            else:
                try:
                    windows = subprocess.run(["wslpath", "-w", str(path)], capture_output=True, text=True, check=True, env=self.cfg.env, timeout=10).stdout.strip()
                    subprocess.Popen(["explorer.exe", windows], env=self.cfg.env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    opened = True
                except (OSError, subprocess.SubprocessError):
                    op.update(status="failed", error={"code": "open_failed", "message": "Ouverture Windows indisponible.", "retryable": False, "details": {}})
                    self.store.save_op(op)
                    raise Problem(422, "capability_unavailable", "Ouverture Windows indisponible.")
            result = {"file_id": match[1], "opened": opened, "dry_run": self.cfg.dry, "method": "windows_shell"}
            op.update(status="succeeded", result=result)
            self.store.save_op(op)
            self.store.audit(op)
            return 200, result
        raise Problem(404, "not_found", "Route introuvable.")


class Server(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, app):
        self.app = app
        super().__init__(("127.0.0.1", app.cfg["port"]), Handler)
        app.port = self.server_address[1]


class Handler(BaseHTTPRequestHandler):
    server_version = "CrowPanel/" + __version__

    @property
    def app(self):
        return self.server.app

    def log_message(self, *args):
        pass  # Mail ids and query terms do not belong in the access log.

    def headers_secure(self):
        self.send_header("Content-Security-Policy", CSP)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Cache-Control", "no-store")

    def send(self, status, data, content_type="application/json; charset=utf-8", session=False, attachment=None):
        encoded = canonical(data).encode() if content_type.startswith("application/json") else data.encode() if isinstance(data, str) else data
        self.send_response(status)
        self.headers_secure()
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(encoded)))
        if session:
            self.send_header("Set-Cookie", "crow_session=" + self.app.session + "; HttpOnly; SameSite=Strict; Path=/")
        if attachment:
            self.send_header("Content-Disposition", "attachment; filename=\"download\"")
        self.end_headers()
        self.wfile.write(encoded)

    def verify(self, mutation=False, session=True):
        valid = ("127.0.0.1:" + str(self.app.port), "localhost:" + str(self.app.port))
        if len(self.headers.get_all("Host", [])) != 1 or self.headers.get("Host") not in valid:
            raise Problem(403, "forbidden", "Hôte invalide.", {"reason": "host"})
        if session or mutation:
            cookie = cookies.SimpleCookie()
            try:
                cookie.load(self.headers.get("Cookie", ""))
                value = cookie["crow_session"].value if "crow_session" in cookie else ""
            except cookies.CookieError:
                value = ""
            if not secrets.compare_digest(value, self.app.session):
                raise Problem(403, "forbidden", "Session invalide.", {"reason": "csrf"})
        if mutation and (not secrets.compare_digest(self.headers.get("X-Crow-Token", ""), self.app.csrf) or self.headers.get("Origin") not in tuple("http://" + h for h in valid)):
            raise Problem(403, "forbidden", "Jeton ou origine invalide.", {"reason": "csrf"})

    def do_GET(self):
        try:
            parsed = urlsplit(self.path)
            path = unquote(parsed.path)
            self.verify(session=path.startswith("/api/"))
            if path == "/":
                root = ENGINE / "bin/panel_ui/index.html"
                if root.is_file() and root.resolve().is_relative_to((ENGINE / "bin/panel_ui").resolve()):
                    self.send(200, root.read_bytes(), "text/html; charset=utf-8", session=True)
                else:
                    routes = ["state", "pending", "mail", "runs", "accounts", "routines", "capabilities", "dossiers", "afk"]
                    links = "".join('<li><a href="/api/' + p + '">/api/' + p + '</a></li>' for p in routes)
                    self.send(200, '<!doctype html><html lang="fr"><meta charset="utf-8"><title>Crow</title><h1>Panneau local</h1><p>Interface en attente. Mode ' + html.escape(self.app.cfg["mode"]) + '.</p><ul>' + links + '</ul></html>', "text/html; charset=utf-8", session=True)
                return
            match = re.fullmatch(r'/api/(runs|operations)/([^/]+)/events', path)
            if match:
                self.sse(match[1], match[2])
                return
            match = re.fullmatch(r'/api/files/([^/]+)', path)
            if match:
                file = self.app.files.resolve(match[1])
                if not file.is_file():
                    raise Problem(404, "not_found", "Fichier introuvable.")
                mime = mimetypes.guess_type(file.name)[0] or "application/octet-stream"
                safe_image = mime in ("image/png", "image/jpeg", "image/gif", "image/webp")
                if file.suffix.lower() in (".md", ".txt", ".log", ".html", ".htm", ".svg"):
                    mime = "text/plain; charset=utf-8"
                self.send(200, file.read_bytes(), mime, attachment=not safe_image and not mime.startswith("text/plain"))
                return
            if path.startswith("/api/"):
                with self.app.store.mutex:
                    data = self.app.get(path, parse_qs(parsed.query))
                self.send(200, data)
                return
            root = (ENGINE / "bin/panel_ui").resolve()
            static = (root / path.lstrip("/")).resolve()
            if ".." in Path(path).parts or not static.is_relative_to(root) or not static.is_file():
                raise Problem(404, "not_found", "Fichier introuvable.")
            self.send(200, static.read_bytes(), mimetypes.guess_type(static.name)[0] or "application/octet-stream")
        except Problem as exc:
            self.send(exc.status, exc.body)
        except (ValueError, TypeError, UnicodeError):
            self.send(400, Problem(400, "bad_request", "Paramètre invalide.").body)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except OSError:
            self.send(503, Problem(503, "upstream_unavailable", "Source locale indisponible.", retryable=True).body)

    def do_POST(self):
        self.write_request()

    def do_PUT(self):
        self.write_request()

    def do_DELETE(self):
        self.write_request()

    def write_request(self):
        try:
            self.verify(mutation=True)
            if self.headers.get("Transfer-Encoding") or len(self.headers.get_all("Content-Length", [])) != 1:
                raise Problem(400, "bad_request", "Taille de requête invalide.")
            length = int(self.headers.get("Content-Length", "-1"))
            if not 0 <= length <= 256 * 1024:
                raise Problem(413, "bad_request", "Requête trop volumineuse.")
            if self.headers.get_content_type() != "application/json":
                raise Problem(400, "bad_request", "Content-Type application/json attendu.")
            self.connection.settimeout(10)
            raw = self.rfile.read(length)
            if len(raw) != length:
                raise ValueError()
            body = json.loads(raw)
            status, value = self.app.mutate(self.command, unquote(urlsplit(self.path).path), body)
            self.send(status, value)
        except Problem as exc:
            self.send(exc.status, exc.body)
        except (ValueError, TypeError, UnicodeError):
            self.send(400, Problem(400, "bad_request", "Corps JSON invalide.").body)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except OSError:
            self.send(503, Problem(503, "upstream_unavailable", "Source locale indisponible.", retryable=True).body)

    def sse(self, kind, key):
        if not re.fullmatch(r'[a-zA-Z0-9_-]{1,100}', key):
            raise Problem(404, "not_found", "Flux introuvable.")
        op = self.app.operation(key) if kind == "operations" else None
        row = self.app.store.get("runs", key) if kind == "runs" else None
        if kind == "runs" and not row:
            self.app.readers.run(key)  # Ensure the external id exists before opening a stream.
        try:
            after = max(0, int(self.headers.get("Last-Event-ID", "0")))
        except ValueError:
            raise Problem(400, "bad_request", "Last-Event-ID invalide.")
        if not self.app.streams.acquire(blocking=False):
            raise Problem(503, "upstream_unavailable", "Trop de flux ouverts.", retryable=True)
        try:
            self.send_response(200)
            self.headers_secure()
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Connection", "close")
            self.end_headers()
            last_ping = time.monotonic()
            while not self.app.launcher.stop_event.is_set():
                events = self.app.store.events(key, after)
                for event in events:
                    self.wfile.write(("id: " + str(event["id"]) + "\nevent: " + event["event"] + "\ndata: " + canonical(event["data"]) + "\n\n").encode())
                    after = event["id"]
                self.wfile.flush()
                if any(e["event"] == "done" for e in events):
                    break
                if kind == "operations":
                    if self.app.operation(key)["status"] not in ACTIVE:
                        break
                else:
                    row = self.app.store.get("runs", key, {})
                    if not row.get("operation_id"):
                        try:
                            row = self.app.launcher.cached("sse:" + key, ["cdx", "run-status", key, "--json"], ttl=2).get("run", {})
                            dummy = {"operation_id": key}
                            self.app.launcher.tail(dummy, row)
                            if row.get("ended_at"):
                                self.app.store.event(key, "done", {"status": row.get("status"), "exit_code": row.get("exit_code"), "final_segments": []})
                        except Problem:
                            break
                    elif row.get("ended_at") and not events:
                        break
                if time.monotonic() - last_ping >= 15:
                    self.wfile.write(b": ping\n\n")
                    self.wfile.flush()
                    last_ping = time.monotonic()
                self.app.launcher.stop_event.wait(0.5)
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            self.app.streams.release()
            self.close_connection = True
