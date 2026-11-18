"""Classic Outlook bridge. Only a fixed action list crosses the process boundary."""
import datetime as dt
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import threading
import time

from .core import ENGINE, Problem, atomic, canonical, now, read_json


class ComError(Problem):
    def __init__(self, code, message, uncertain=False):
        self.uncertain = uncertain
        super().__init__(503, code, message, {"uncertain": uncertain}, not uncertain)


class OutlookCom:
    ACTIONS = frozenset({"probe", "folders", "inbox", "calendar", "body", "conversation", "history", "move", "reply_all", "draft", "delete_draft"})
    WRITES = frozenset({"move", "reply_all", "delete_draft"})
    _lock = threading.Lock()

    def __init__(self, cfg, runner=None):
        self.cfg = cfg
        self.options = cfg["mail"].get("outlook_com", {})
        self.runner = runner or subprocess.run
        self._probe = None

    def windows_path(self, path):
        if re.match(r"^[A-Za-z]:[\\/]", str(path)) or str(path).startswith("\\\\"):
            return str(path)
        return subprocess.run(["wslpath", "-w", str(Path(path).resolve())], capture_output=True,
                              text=True, check=True, timeout=5).stdout.strip()

    def call(self, action, **args):
        if action not in self.ACTIONS:
            raise ValueError("unsupported Outlook action")
        directory = self.cfg.state / "mail/com-requests"
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        fd, path = tempfile.mkstemp(suffix=".json", dir=directory)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as stream:
                json.dump({"action": action, **args}, stream, ensure_ascii=False)
            command = [self.options.get("powershell_exe", "powershell.exe"), "-NoProfile", "-NonInteractive", "-STA",
                       "-ExecutionPolicy", "Bypass", "-File", self.windows_path(ENGINE / "bin/crow_panel/outlook_com.ps1"),
                       "-RequestFile", self.windows_path(path)]
            with self._lock:
                result = self.runner(command, capture_output=True, encoding="utf-8", errors="replace",
                                     timeout=self.options.get("timeout_seconds", 90))
            value = json.loads(result.stdout.lstrip("\ufeff"))
            if not isinstance(value, dict) or value.get("ok") is not True:
                error = value.get("error", {}) if isinstance(value, dict) else {}
                raise ComError(error.get("code", "com_failed"), error.get("message", "Outlook classique ne répond pas. Ouvre-le puis synchronise."),
                               action in self.WRITES and error.get("uncertain", True))
            if result.returncode:
                raise ValueError("process failed")
            return value["result"]
        except (OSError, ValueError, subprocess.SubprocessError):
            raise ComError("com_result_missing", "Réponse Outlook classique absente. Vérifie Outlook avant toute nouvelle action.", action in self.WRITES)
        finally:
            Path(path).unlink(missing_ok=True)

    def probe(self, fresh=False, folders=()):
        if self.options.get("enabled", True) is False:
            return {"connected": False, "folders_resolvable": False}
        if not fresh and not folders and self._probe and time.monotonic() - self._probe[0] < 10:
            return self._probe[1]
        try:
            result = self.call("probe", folders=list(folders))
        except ComError as exc:
            result = {"connected": False, "folders_resolvable": False, "reason": str(exc)}
        if not folders:
            self._probe = (time.monotonic(), result)
        return result

    def body(self, entry_id, store_id=None):
        return self.call("body", entry_id=entry_id, store_id=store_id)

    def conversation(self, entry_id, store_id=None):
        return self.call("conversation", entry_id=entry_id, store_id=store_id, limit=2000)

    def move(self, entry_id, source_id, folder_id, store_id=None, folder_store_id=None):
        return self.call("move", entry_id=entry_id, source_id=source_id, folder_id=folder_id,
                         store_id=store_id, folder_store_id=folder_store_id)

    def scan_history(self, folders):
        """Bounded round-robin scan; retain a timestamp and boundary ids per folder."""
        path = self.cfg.state / "mail/com-history.json"
        saved = read_json(path, {"messages": {}, "checkpoints": {}, "next_folder": 0})
        targets = [f for f in folders if f.get("allowed_target")]
        valid = {f["id"] for f in targets}
        saved["messages"] = {k: v for k, v in saved["messages"].items() if v["folder_id"] in valid}
        remaining = max(1, int(self.options.get("history_scan_cap", 500)))
        start = saved.get("next_folder", 0) % max(1, len(targets))
        ordered = targets[start:] + targets[:start]
        for index, folder in enumerate(ordered):
            checkpoint = saved["checkpoints"].get(folder["id"], {})
            # A periodic full scan removes stale moved/deleted messages.
            full_at = checkpoint.get("full_at")
            if full_at and (dt.datetime.now(dt.timezone.utc) - dt.datetime.fromisoformat(full_at)).total_seconds() > 604800 and not checkpoint.get("sweep"):
                checkpoint = {}
            if not checkpoint:
                checkpoint = {"sweep": now()}
            page = self.call("history", folder_id=folder["id"], store_id=folder.get("store_id"), cursor=checkpoint, limit=remaining)
            for row in page["messages"]:
                saved["messages"][row["id"]] = {**row, "folder_id": folder["id"], "sweep": checkpoint.get("sweep")}
            cursor = page["cursor"]
            if page["complete"]:
                if checkpoint.get("sweep"):
                    saved["messages"] = {k: v for k, v in saved["messages"].items()
                                         if v["folder_id"] != folder["id"] or v.get("sweep") == checkpoint["sweep"]}
                cursor["full_at"] = now() if checkpoint.get("sweep") else checkpoint.get("full_at", now())
                cursor.pop("sweep", None)
            saved["checkpoints"][folder["id"]] = cursor
            remaining -= page["scanned"]
            saved["next_folder"] = (start + index + (1 if page["complete"] else 0)) % max(1, len(targets))
            if remaining <= 0:
                break
        cap = max(1, int(self.options.get("history_index_cap", 100000)))
        if len(saved["messages"]) > cap:
            saved["messages"] = dict(sorted(saved["messages"].items(), key=lambda p: p[1].get("modified", ""), reverse=True)[:cap])
        saved["updated_at"] = now()
        atomic(path, canonical(saved))
        # Publish the current bounded index as a complete replacement, not an invented mailbox total.
        return {"folders": [{"folder_id": f["id"], "messages": [v for v in saved["messages"].values() if v["folder_id"] == f["id"]],
                              "complete": True, "reset": True, "watermark": saved["checkpoints"].get(f["id"])} for f in targets]}

    def reply_all(self, entry_id, html, store_id=None, cc=(), attachments=(), inline_images=()):
        files = []
        roots = [Path(p).resolve() for p in self.cfg.get("files", {}).get("roots", [])]
        for item in [*attachments, *inline_images]:
            item = {"path": item} if isinstance(item, str) else dict(item)
            path = Path(item["path"]).resolve(strict=True)
            if not path.is_file() or not any(path.is_relative_to(root) for root in roots):
                raise ValueError("attachment outside allowed roots")
            if item.get("cid") and not re.fullmatch(r"[A-Za-z0-9_.@-]{1,120}", item["cid"]):
                raise ValueError("invalid content id")
            files.append({**item, "path": self.windows_path(path)})
        return self.call("reply_all", entry_id=entry_id, store_id=store_id, html=html, cc=list(cc), files=files)
