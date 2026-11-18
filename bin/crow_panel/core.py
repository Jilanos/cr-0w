"""Private configuration, durable operations and shared advisory locks."""
import contextlib
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import secrets
import sqlite3
import tempfile
import threading

import yaml
import crow_lib

ENGINE = Path(__file__).resolve().parents[2]
ACTIVE = ("queued", "running", "cancel_requested")


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds")


def uid(prefix):
    return prefix + secrets.token_hex(10)


def digest(value, prefix=""):
    if isinstance(value, str):
        value = value.encode()
    return prefix + hashlib.sha256(value).hexdigest()


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


class Problem(Exception):
    def __init__(self, status, code, message, details=None, retryable=False):
        self.status = status
        self.body = {"error": {"code": code, "message": message, "retryable": retryable, "details": details or {}}}
        super().__init__(message)


def atomic(path, data):
    path = Path(path)
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix=".panel-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data.encode() if isinstance(data, str) else data)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temp, path)
        directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def read_json(path, default=None):
    try:
        return json.loads(Path(path).read_text())
    except (OSError, ValueError):
        return default


def shared_locks(home):
    """Use the panel's configured locks for every participating command."""
    if os.environ.get("CROW_LOCKS_DIR"):
        return Path(os.environ["CROW_LOCKS_DIR"])
    try:
        path = Path(os.environ.get("CROW_PANEL_CONFIG", Path(home) / "local/panel.yaml"))
        value = yaml.safe_load(path.read_text()) or {}
    except (OSError, ValueError, yaml.YAMLError):
        value = {}
    return Path(value.get("locks_dir", Path(home) / "local/state/locks"))


class Config(dict):
    def __init__(self, path=None, overrides=None):
        home = Path(crow_lib.data_home()).resolve()
        explicit = path or os.environ.get("CROW_PANEL_CONFIG")
        path = Path(path or os.environ.get("CROW_PANEL_CONFIG") or home / "local/panel.yaml")
        if not path.exists():
            if explicit:
                raise ValueError("configuration file not found")
            path = ENGINE / "docs/panel.example.yaml"
        with path.open() as f:
            data = yaml.safe_load(f) or {}
        super().__init__(data)
        self.update(overrides or {})
        self.path = path.resolve()
        self.home = Path(self.get("crow_home", home)).resolve()
        self.setdefault("mode", "dry_run")
        self.setdefault("port", 8790)
        self.setdefault("host", "127.0.0.1")
        self.setdefault("state_dir", str(self.home / "local/state/panel"))
        self.setdefault("locks_dir", str(self.home / "local/state/locks"))
        self.setdefault("runs_registry", str(self.home / "local/state/runs.jsonl"))
        self.setdefault("max_parallel", int(os.environ.get("CROW_MAX_RUNS", "2")))
        self.setdefault("pending", {})
        self.setdefault("files", {"roots": []})
        self.setdefault("mail", {})
        self.setdefault("projects", {})
        self.setdefault("chat", {})
        self.setdefault("accounts", {"claude": {"provider": "claude", "kinds": ["chat", "mail_read"]}})
        self.setdefault("routines", {})
        self.setdefault("real_home", crow_lib.real_home())
        if self["host"] != "127.0.0.1" or self["mode"] not in ("dry_run", "live"):
            raise ValueError("host must be 127.0.0.1; mode must be dry_run or live")
        if not isinstance(self["port"], int) or not 0 <= self["port"] <= 65535:
            raise ValueError("invalid port")
        if not isinstance(self["max_parallel"], int) or self["max_parallel"] < 1:
            raise ValueError("invalid max_parallel")
        for name in ("maj", "daily_update"):
            argv = self["routines"].get(name, {}).get("argv", [])
            if not isinstance(argv, list) or any(not isinstance(x, str) or not x for x in argv):
                raise ValueError("routine argv must be a list of strings")
        self.state = Path(self["state_dir"]).resolve()
        self.locks = Path(self["locks_dir"]).resolve()

    def prepare(self):
        for path in (self.state, self.locks):
            path.mkdir(mode=0o700, parents=True, exist_ok=True)
            path.chmod(0o700)
        for name in ("backups", "events", "mail/bodies", "mail/plans", "mail/incoming", "ops", "topics", "scripts"):
            (self.state / name).mkdir(mode=0o700, parents=True, exist_ok=True)

    @property
    def dry(self):
        return self["mode"] == "dry_run"

    @property
    def env(self):
        return {**os.environ, "HOME": self["real_home"], "CROW_HOME": str(self.home),
                "CROW_LOCKS_DIR": str(self.locks), "CROW_PANEL_CONFIG": str(self.path)}


@contextlib.contextmanager
def lock(directory, name, blocking=True):
    directory = Path(directory)
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd = os.open(directory / (name + ".lock"), os.O_CREAT | os.O_RDWR, 0o600)
    try:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | (0 if blocking else fcntl.LOCK_NB))
        except BlockingIOError:
            raise Problem(423, "locked", "Une mise à jour est en cours. Réessaie après la fin.", {"holder": name}, True)
        yield fd
    finally:
        os.close(fd)


def locked(directory, name):
    try:
        with lock(directory, name, False):
            return False
    except Problem:
        return True


class Store:
    def __init__(self, cfg):
        self.cfg = cfg
        cfg.prepare()
        self.mutex = threading.RLock()
        self.db = sqlite3.connect(cfg.state / "panel.db", check_same_thread=False)
        os.chmod(cfg.state / "panel.db", 0o600)
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA synchronous=FULL")
        self.db.executescript("""
          CREATE TABLE IF NOT EXISTS objects (bucket TEXT, id TEXT, data TEXT, PRIMARY KEY(bucket,id));
          CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, hash TEXT, status INTEGER, response TEXT);
          CREATE TABLE IF NOT EXISTS events (stream TEXT, seq INTEGER, event TEXT, data TEXT, PRIMARY KEY(stream,seq));
        """)
        self.db.commit()

    def get(self, bucket, key, default=None):
        with self.mutex:
            row = self.db.execute("SELECT data FROM objects WHERE bucket=? AND id=?", (bucket, key)).fetchone()
            return json.loads(row[0]) if row else default

    def put(self, bucket, key, data):
        encoded = canonical(data)
        with self.mutex:
            previous = self.db.execute("SELECT data FROM objects WHERE bucket=? AND id=?", (bucket, key)).fetchone()
            if previous and previous[0] == encoded:
                return data
            with self.db:
                self.db.execute("INSERT OR REPLACE INTO objects VALUES(?,?,?)", (bucket, key, encoded))
        return data

    def all(self, bucket):
        with self.mutex:
            return [json.loads(r[0]) for r in self.db.execute("SELECT data FROM objects WHERE bucket=? ORDER BY rowid", (bucket,))]

    def replay(self, request_id, route, body):
        if not isinstance(request_id, str) or not 1 <= len(request_id) <= 128:
            raise Problem(400, "bad_request", "request_id est obligatoire.")
        hashed = digest(canonical([route, body]))
        with self.mutex:
            row = self.db.execute("SELECT hash,status,response FROM requests WHERE id=?", (request_id,)).fetchone()
            if row:
                if row[0] != hashed:
                    raise Problem(409, "idempotency_mismatch", "Même request_id avec un contenu différent.", {"request_id": request_id})
                return row[1], json.loads(row[2])
            # An operation is journalled before its effect, even if the HTTP response was lost.
            op = next((o for o in self.all("operations") if o["request_id"] == request_id), None)
            if op:
                intent = self.get("intents", op["operation_id"], {})
                if intent.get("request_hash") != hashed:
                    raise Problem(409, "idempotency_mismatch", "Même request_id avec un contenu différent.")
                synchronous = op["kind"] in ("state.visit", "afk.answer") or op["kind"].startswith("pending.") and op["status"] != "queued"
                return (200 if synchronous else 202), op
        return None

    def remember(self, request_id, route, body, status, response):
        with self.mutex, self.db:
            self.db.execute("INSERT INTO requests VALUES(?,?,?,?)", (request_id, digest(canonical([route, body])), status, canonical(response)))

    def operation(self, kind, body, summary, topic=None, dry=False):
        key = uid("op_")
        return self.put("operations", key, {
            "operation_id": key, "kind": kind, "status": "running", "request_id": body["request_id"],
            "created_at": now(), "updated_at": now(), "summary": summary, "topic_id": topic, "dry_run": dry,
            "steps": [], "items": [], "result": None, "undo": {"available": False, "until": None, "reason": None},
            "undone_by": None, "error": None,
            "links": {"status_url": "/api/operations/" + key, "events_url": "/api/operations/" + key + "/events"}})

    def save_op(self, op):
        op["updated_at"] = now()
        return self.put("operations", op["operation_id"], op)

    def event(self, stream, event, data):
        # SQLite is authoritative. JSONL is a replayable on-disk mirror.
        from .security import redact_data
        data = redact_data(data)
        with self.mutex, self.db:
            seq = self.db.execute("SELECT COALESCE(MAX(seq),0)+1 FROM events WHERE stream=?", (stream,)).fetchone()[0]
            self.db.execute("INSERT INTO events VALUES(?,?,?,?)", (stream, seq, event, canonical(data)))
            path = self.cfg.state / "events" / (stream + ".jsonl")
            with path.open("a") as f:
                f.write(canonical({"id": seq, "event": event, "data": data}) + "\n")
            path.chmod(0o600)
        return seq

    def events(self, stream, after=0):
        with self.mutex:
            return [{"id": r[0], "event": r[1], "data": json.loads(r[2])} for r in self.db.execute(
                "SELECT seq,event,data FROM events WHERE stream=? AND seq>? ORDER BY seq", (stream, after))]

    def audit(self, op, before=None, after=None, run_id=None):
        with self.mutex:
            path = self.cfg.state / "audit.jsonl"
            with path.open("a") as f:
                f.write(canonical({"at": now(), "op": op["operation_id"], "kind": op["kind"], "before": before,
                                   "after": after, "run_id": run_id}) + "\n")
            path.chmod(0o600)
