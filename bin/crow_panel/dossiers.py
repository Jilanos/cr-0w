"""Dossiers discovered from recent folder activity, linked to pending rows and mails."""
import datetime as dt
import fnmatch
import os
from pathlib import Path
import re
import threading
import time
import unicodedata

from .core import Problem, now

SKIP_DIRS = {".git", "node_modules", "__pycache__", ".venv", "venv", ".cache", "dist", "build", ".next", ".turbo"}
# Folder-name words too generic to link a row or a mail on their own.
GENERIC = {"analyse", "analysis", "dossier", "dossiers", "projet", "project", "test", "tests", "data", "donnees", "output", "outputs",
           "src", "docs", "doc", "notes", "draft", "final", "old", "new", "archive", "serie", "fichiers", "files", "rendu", "suivi",
           "les", "des", "une", "the", "and", "pour", "avec", "sur", "par", "dans", "version", "v1", "v2", "v3"}


def fold(text):
    text = unicodedata.normalize("NFKD", text or "")
    return "".join(c for c in text if not unicodedata.combining(c)).lower()


def keywords(name):
    spaced = re.sub(r'([a-z])([A-Z])', r'\1 \2', name)
    words = [w for w in re.split(r'[^0-9a-z]+', fold(spaced)) if w]
    return [w for w in dict.fromkeys(words) if len(w) >= 3 and w not in GENERIC and not w.isdigit()]


def slugify(text):
    return re.sub(r'[^a-z0-9]+', '-', fold(text)).strip('-')[:72]


def matches(words, text):
    """A strong word (6+ letters) is enough; shorter words must come in pairs, or alone when the folder has one."""
    if not words:
        return False
    folded = fold(text)
    score = sum(2 if len(w) >= 6 else 1 for w in words if re.search(r'(?<![0-9a-z])' + re.escape(w) + r'(?![0-9a-z])', folded))
    return score >= min(2, sum(2 if len(w) >= 6 else 1 for w in words))


class Dossiers:
    def __init__(self, app):
        self.app = app
        self.cfg, self.store = app.cfg, app.store
        self.cache = None
        self.mutex = threading.Lock()

    # ---------------------------------------------------------------- configuration

    def settings(self):
        value = self.cfg.get("dossiers_discover") or {}
        depth = value.get("depth", [2, 3])
        if isinstance(depth, int):
            depth = [depth, depth]
        roots = [Path(p) for p in value.get("roots", [])]
        return {"roots": [r for r in roots if self.app.files.allowed(r) and r.is_dir()], "min_depth": max(1, int(depth[0])),
                "max_depth": min(4, max(int(depth[0]), int(depth[-1]))), "days": int(value.get("days", 14)),
                "limit": int(value.get("limit", 40)), "exclude": [str(p) for p in value.get("exclude", [])],
                "budget": int(value.get("max_entries", 60000))}

    def label(self, path):
        for root in self.settings()["roots"]:
            if path == root or path.is_relative_to(root):
                return (root.name + "/" + str(path.relative_to(root))).rstrip("/.") + "/"
        return path.name + "/"

    # ---------------------------------------------------------------- scan

    def excluded(self, rel, patterns):
        return any(fnmatch.fnmatch(rel, p) or fnmatch.fnmatch(rel + "/", p) for p in patterns)

    def candidates(self, root, s):
        """Folders between min and max depth; a folder with only subfolders expands one level."""
        out, stack = [], [(root, 0)]
        while stack:
            folder, depth = stack.pop()
            try:
                entries = [e for e in os.scandir(folder) if not e.name.startswith(".") and not e.is_symlink()]
            except OSError:
                continue
            dirs = [e for e in entries if e.is_dir(follow_symlinks=False) and e.name not in SKIP_DIRS]
            has_files = any(e.is_file(follow_symlinks=False) for e in entries)
            if depth >= s["min_depth"] and (has_files or not dirs or depth >= s["max_depth"]):
                out.append(folder)
                continue
            for e in dirs:
                rel = str(Path(e.path).relative_to(root))
                if not self.excluded(rel, s["exclude"]):
                    stack.append((Path(e.path), depth + 1))
        return out

    def activity(self, folder, cutoff, budget):
        latest, recent, seen, partial = 0.0, 0, 0, False
        for dirpath, dirnames, filenames in os.walk(folder):
            dirnames[:] = [d for d in dirnames if not d.startswith(".") and d not in SKIP_DIRS]
            for name in filenames:
                seen += 1
                if seen > budget:
                    return latest, recent, seen, True
                try:
                    stat = os.stat(os.path.join(dirpath, name), follow_symlinks=False)
                except OSError:
                    partial = True
                    continue
                latest = max(latest, stat.st_mtime)
                recent += stat.st_mtime >= cutoff
        return latest, recent, seen, partial

    def scan(self, force=False):
        with self.mutex:
            if self.cache and not force and time.monotonic() - self.cache[0] < 60:
                return self.cache[1]
            s = self.settings()
            cutoff = time.time() - s["days"] * 86400
            budget, rows, partial = s["budget"], [], False
            for root in s["roots"]:
                for folder in self.candidates(root, s):
                    if budget <= 0:
                        partial = True
                        break
                    latest, recent, seen, cut = self.activity(folder, cutoff, budget)
                    budget -= seen
                    partial = partial or cut
                    rows.append({"path": folder, "root": root, "rel": str(folder.relative_to(root)), "latest": latest, "recent": recent})
            result = {"rows": rows, "scanned_at": now(), "partial": partial, "days": s["days"], "cutoff": cutoff, "limit": s["limit"]}
            self.cache = (time.monotonic(), result)
            return result

    # ---------------------------------------------------------------- preferences

    def prefs(self):
        value = self.store.get("dossier_prefs", "prefs", {})
        return {"pinned": list(value.get("pinned", [])), "hidden": list(value.get("hidden", []))}

    def set_pref(self, slug, field, on):
        if type(on) is not bool:
            raise Problem(400, "bad_request", "Valeur on attendue (booléen).")
        if not any(d["slug"] == slug for d in self.app.readers.dossiers(include_hidden=True)["dossiers"]):
            raise Problem(404, "not_found", "Dossier introuvable.")
        prefs = self.prefs()
        values = [s for s in prefs[field] if s != slug] + ([slug] if on else [])
        prefs[field] = values
        if on and field == "hidden":
            prefs["pinned"] = [s for s in prefs["pinned"] if s != slug]
        if on and field == "pinned":
            prefs["hidden"] = [s for s in prefs["hidden"] if s != slug]
        self.store.put("dossier_prefs", "prefs", prefs)
        return next(d for d in self.app.readers.dossiers(include_hidden=True)["dossiers"] if d["slug"] == slug)

    def create(self, body):
        file_id, title = body.get("file_id"), body.get("title")
        if not isinstance(file_id, str) or title is not None and (not isinstance(title, str) or len(title) > 200):
            raise Problem(400, "bad_request", "Répertoire invalide.")
        path = self.app.files.resolve(file_id)
        if not path.is_dir():
            raise Problem(422, "bad_request", "Le chemin choisi n'est pas un répertoire.")
        existing = next((d for d in self.app.readers.dossiers(include_hidden=True)["dossiers"] if d.get("_path") == str(path)), None)
        slug = existing["slug"] if existing else "dir-" + slugify(self.label(path))
        if not existing:
            self.store.put("dossier_custom", slug, {"slug": slug, "path": str(path), "title": (title or "").strip() or path.name, "created_at": now()})
        prefs = self.prefs()
        prefs["pinned"] = [s for s in prefs["pinned"] if s != slug] + [slug]
        prefs["hidden"] = [s for s in prefs["hidden"] if s != slug]
        self.store.put("dossier_prefs", "prefs", prefs)
        return next(d for d in self.app.readers.dossiers(include_hidden=True)["dossiers"] if d["slug"] == slug)

    def directories(self, query, limit=40):
        """Directory search for "Créer un dossier depuis un répertoire". Paths stay server-side."""
        words = [w for w in fold(query or "").split() if w]
        s = self.settings()
        roots = s["roots"] or [r for r in self.app.files.roots if r.is_dir()]
        found, inspected = [], 0
        for root in roots:
            stack = [(root, 0)]
            while stack and inspected < 20000:
                folder, depth = stack.pop()
                try:
                    entries = sorted((e for e in os.scandir(folder) if e.is_dir(follow_symlinks=False) and not e.name.startswith(".") and e.name not in SKIP_DIRS),
                                     key=lambda e: e.name)
                except OSError:
                    continue
                for e in entries:
                    inspected += 1
                    path = Path(e.path)
                    label = self.label(path) if s["roots"] else str(path)
                    if all(w in fold(label) for w in words):
                        found.append((label, path))
                    if depth < 3:
                        stack.append((path, depth + 1))
        found.sort(key=lambda r: (r[0].count("/"), r[0]))
        return {"generated_at": now(), "query": query or "", "truncated": len(found) > limit,
                "directories": [{"file_id": self.app.files.register(p), "label": label} for label, p in found[:limit]]}

    # ---------------------------------------------------------------- merge

    def linked(self, path, label, items, mails):
        words = keywords(path.name)
        rel = label.split("/", 1)[1].rstrip("/") if "/" in label else path.name
        pattern = re.compile(r'(?<![0-9A-Za-z_])' + re.escape(fold(rel)) + r'(?![0-9a-z_])') if rel else None
        rows = []
        for item in items:
            record = self.store.get("pending_index", item["id"], {})
            raw = record.get("raw") or item["title"]
            by_path = bool(pattern and pattern.search(fold(raw)))
            if by_path or matches(words, raw):
                rows.append((item["id"], "chemin" if by_path else "mots-clés"))
        mail_ids = [m["id"] for m in mails if matches(words, " ".join(str(m.get(k) or "") for k in ("subject", "preview")))]
        return rows, mail_ids, words

    def extend(self, base, items):
        """Adds pending-block activity, custom and discovered dossiers. base rows come from the pending file."""
        scan = self.scan()
        prefs = self.prefs()
        try:
            mails = self.app.mail.raw()["items"]
        except (OSError, ValueError, KeyError, TypeError):
            mails = []
        by_path = {str(r["path"]): r for r in scan["rows"]}
        result, seen = [], set()

        def activity(path):
            row = by_path.get(str(path))
            if row:
                return row["latest"], row["recent"]
            if path and path.is_dir():
                latest, recent, _, _ = self.activity(path, scan["cutoff"], 5000)
                return latest, recent
            return 0.0, 0

        def stamp(value):
            return dt.datetime.fromtimestamp(value, dt.timezone.utc).isoformat() if value else None

        def decorate(row, path, source):
            latest, recent = activity(path) if path else (0.0, 0)
            links, mail_ids, words = self.linked(path, self.label(path), items, mails) if path else ([], [], [])
            ids = list(dict.fromkeys(row.get("item_ids", []) + [i for i, _ in links]))
            row.update(source=source, item_ids=ids, open_count=len(ids), mail_ids=mail_ids[:50], mail_count=len(mail_ids),
                       keywords=words, links={i: why for i, why in links}, files_active_at=stamp(latest), recent_count=recent,
                       pinned=row["slug"] in prefs["pinned"], hidden=row["slug"] in prefs["hidden"], _path=str(path) if path else None,
                       _latest=latest)
            if path:
                seen.add(str(path))
            return row

        for row in base:
            config = self.cfg.get("dossiers", {}).get(row["slug"], {})
            path = Path(config["path"]).resolve() if config.get("path") else None
            result.append(decorate(row, path if path and self.app.files.allowed(path) else None, "pending"))
        for custom in sorted(self.store.all("dossier_custom"), key=lambda c: c["slug"]):
            slug = custom["slug"]
            path = self.app.files.allowed(custom["path"])
            if not path or not path.is_dir() or str(path) in seen:
                continue
            topic = self.app.launcher.topic("dossier", slug, custom["title"], {"folder_path": str(path)})
            row = {"slug": slug, "title": custom["title"], "folder_file_id": self.app.files.register(path), "folder_label": self.label(path),
                   "item_ids": [], "topic_id": topic, "last_activity": self.store.get("topics", topic)["last_message_at"], "recent_files": None}
            result.append(decorate(row, path, "custom"))
        auto = [r for r in scan["rows"] if r["latest"] >= scan["cutoff"] and str(r["path"]) not in seen]
        auto.sort(key=lambda r: -r["latest"])
        for r in auto[:scan["limit"]]:
            label = self.label(r["path"])
            slug = "auto-" + slugify(label)
            topic = self.app.launcher.topic("dossier", slug, r["path"].name, {"folder_path": str(r["path"])})
            row = {"slug": slug, "title": r["path"].name, "folder_file_id": self.app.files.register(r["path"]), "folder_label": label,
                   "item_ids": [], "topic_id": topic, "last_activity": self.store.get("topics", topic)["last_message_at"], "recent_files": None}
            result.append(decorate(row, r["path"], "auto"))
        # Pinned first, then every dossier active in the window by newest file, then the other pending blocks in file order.
        for row in result:
            row["active"] = row["_latest"] >= scan["cutoff"]
        result.sort(key=lambda d: (not d["pinned"], not d["active"] if not d["pinned"] else False, -d["_latest"] if d["pinned"] or d["active"] else 0))
        meta = {"roots": [self.label(r) for r in self.settings()["roots"]], "days": scan["days"], "scanned_at": scan["scanned_at"],
                "partial": scan["partial"], "hidden_count": sum(d["hidden"] for d in result), "enabled": bool(self.settings()["roots"])}
        return result, meta
