"""Pending items: one schema over the Open Threads note and table-style pending files.

A pending file is Markdown. The parser cuts it into spans (title, heading, table header,
separator, item, text, blank) whose raw text joins back to the exact file, so a read never
loses a line. Each item span becomes one record of the schema below; runbooks/pending-items.md
documents it.

Two shapes are read:
  - checkbox lines `- [ ] YYYY-MM-DD [project] text → next` (Open Threads; `📅 YYYY-MM-DD`
    is an optional due date, the Obsidian Tasks marker);
  - tables and bullet lists under `##` / `###` headings, with the column and section
    names mapped to schema fields by the alias maps (config of the core brick).

Section kind says who acts: me, crow, waiting (someone else, an Inbox `followup`),
decision, draft, file, paused, note, settled, other.
"""
import datetime as dt
import hashlib
import os
import re
import tempfile
import unicodedata
from pathlib import Path

SETTLED_DAYS = 14
KINDS = ("me", "crow", "waiting", "decision", "draft", "file", "paused", "note", "settled", "other")
DEFAULT_SECTIONS = {
    "me": "me", "crow": "crow", "waiting": "waiting", "follow-ups": "waiting", "followups": "waiting",
    "decisions": "decision", "drafts": "draft", "files": "file", "paused": "paused", "notes": "note",
    "settled": "settled", "done": "settled",
}
DEFAULT_COLUMNS = {
    "subject": "title", "title": "title", "who": "who", "expected": "expected", "next": "next",
    "due": "due", "priority": "priority", "since": "since", "project": "project",
}
FIELDS = ("title", "who", "expected", "next", "project", "due", "priority", "since")
STATUS = {"🔴": "urgent", "🟠": "soon", "🟡": "review", "🟢": "go", "🔵": "action", "⏸️": "paused", "❓": "unsure"}

SEPARATOR = re.compile(r"^\s*\|?[\s:|-]+\|\s*$")
CHECKBOX = re.compile(r"^- \[([ xX])\] (\d{4}-\d{2}-\d{2}) (?:\[([^\]]*)\] )?(.*)$")
DUE_MARK = re.compile(r"📅 ?(\d{4}-\d{2}-\d{2})")
ISO = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b")
DMY = re.compile(r"\b(\d{1,2})/(\d{1,2})(?:/(\d{4}))?\b")
WEEK = re.compile(r"\b[SW](\d{1,2})\b")
LEAD_DATE = re.compile(r"^(\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}(?:/\d{4})?)\b")
WHO = re.compile(r"^([^:→|]{1,60}?) ?: ")


def fold(text):
    """Lower case, no accents, no emoji or punctuation at the ends: the alias match key."""
    text = unicodedata.normalize("NFKD", text.casefold())
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"^[^\w]+|[^\w)]+$", "", text).strip()


def parse_date(text, today):
    """First ISO, dd/mm[/yyyy] or week (S46, W46) date in text; a year-less date takes the nearest year."""
    text = text or ""
    m = ISO.search(text)
    if m:
        try:
            return dt.date(*map(int, m.groups()))
        except ValueError:
            pass
    m = DMY.search(text)
    if m:
        day, month, year = int(m.group(1)), int(m.group(2)), m.group(3)
        years = [int(year)] if year else [today.year - 1, today.year, today.year + 1]
        cands = []
        for y in years:
            try:
                cands.append(dt.date(y, month, day))
            except ValueError:
                pass
        if cands:
            return min(cands, key=lambda d: abs((d - today).days))
    m = WEEK.search(text)
    if m and 1 <= int(m.group(1)) <= 53:
        cands = []
        for y in (today.year - 1, today.year, today.year + 1):
            try:
                cands.append(dt.date.fromisocalendar(y, int(m.group(1)), 1))
            except ValueError:
                pass
        return min(cands, key=lambda d: abs((d - today).days))
    return None


def status_of(text):
    return next((v for k, v in STATUS.items() if k in text), None)


def split_row(line):
    return [c.strip() for c in re.split(r"(?<!\\)\|", line.strip().strip("|"))]


def section_kind(title, sections):
    key = fold(title)
    for prefix, kind in sections.items():
        if key.startswith(fold(prefix)):
            return kind
    return "other"


def _spans(text):
    """Cut text into (type, start_line, raw, extra) spans; their raw joins back to text."""
    lines = text.splitlines(keepends=True)
    out, i = [], 0
    while i < len(lines):
        line = lines[i]
        s = line.strip()
        if not s:
            out.append(("blank", i, line, None))
        elif line.startswith("# "):
            out.append(("title", i, line, None))
        elif re.match(r"^#{2,6} ", line):
            out.append(("heading", i, line, len(line) - len(line.lstrip("#"))))
        elif s.startswith("|"):
            # One table = consecutive pipe lines. The first is the header even when rows come
            # before the separator; separators anywhere in the run stay separators.
            j = i
            while j < len(lines) and lines[j].strip().startswith("|"):
                j += 1
            out.append(("table_header", i, line, split_row(line)))
            for k in range(i + 1, j):
                out.append(("separator" if SEPARATOR.match(lines[k]) else "row", k, lines[k], None))
            i = j
            continue
        elif re.match(r"^[-*] ", line):
            j = i + 1
            while j < len(lines) and lines[j].strip() and lines[j].startswith(("  ", "\t")):
                j += 1
            out.append(("list", i, "".join(lines[i:j]), None))
            i = j
            continue
        else:
            j = i + 1
            while j < len(lines) and lines[j].strip() and not re.match(r"^(#|\||[-*] )", lines[j].lstrip()):
                j += 1
            out.append(("text", i, "".join(lines[i:j]), None))
            i = j
            continue
        i += 1
    return out


def _item_id(source, section, raw, seen):
    base = hashlib.sha1(f"{source}\0{section}\0{raw.strip()}".encode()).hexdigest()[:10]
    seen[base] = seen.get(base, 0) + 1
    return base if seen[base] == 1 else f"{base}-{seen[base]}"


def _checkbox(m, rec, kind):
    mark, date, project, body = m.groups()
    text, _, nxt = body.partition(" → ")
    due = DUE_MARK.search(body)
    text = DUE_MARK.sub("", text).strip()
    rec.update(project=project, touched=date, next=DUE_MARK.sub("", nxt).strip() or None,
               due=due.group(1) if due else None)
    if kind == "waiting":
        who = WHO.match(text)
        if who:
            rec["who"], text = who.group(1).strip(), text[who.end():]
    rec["title"] = text
    if mark != " ":
        rec["kind"], rec["settled_on"] = "settled", date


def parse(text, source="pending", sections=None, columns=None, today=None):
    """Parse one pending file. Returns {source, spans, items, sections, lossless}."""
    today = today or dt.date.today()
    sections = {**DEFAULT_SECTIONS, **(sections or {})}
    columns = {fold(k): v for k, v in {**DEFAULT_COLUMNS, **(columns or {})}.items()}
    spans = _spans(text)
    items, heads, seen = [], [], {}
    section, block, kind, header = None, None, "other", None
    for typ, start, raw, extra in spans:
        if typ == "heading":
            title = raw.strip().lstrip("#").strip()
            if extra == 2:
                section, block, kind = title, None, section_kind(title, sections)
                heads.append({"title": title, "kind": kind, "line": start + 1, "items": 0})
            else:
                block = title
            header = None
            continue
        if typ == "table_header":
            header = extra
            continue
        if typ not in ("row", "list"):
            continue
        rec = {"id": _item_id(source, section, raw, seen), "source": source, "line": start + 1,
               "kind": kind, "section": section, "block": block, "shape": "row" if typ == "row" else "line",
               "title": None, "who": None, "expected": None, "next": None, "project": None,
               "due": None, "priority": None, "since": None, "touched": None, "settled_on": None,
               "status": status_of(raw), "cells": None, "raw": raw}
        if typ == "row":
            cells = split_row(raw)
            named = dict(zip(header or [], cells))
            rec["cells"] = named
            for name, val in named.items():
                field = columns.get(fold(name))
                if field and val:
                    rec[field] = val
            rec["title"] = rec["title"] or rec["expected"] or rec["who"] or (cells[0] if cells else "")
            for field in ("due", "since"):
                if rec[field]:
                    d = parse_date(rec[field], today)
                    rec[f"{field}_raw"], rec[field] = rec[field], d.isoformat() if d else None
            if kind == "settled":
                d = parse_date(rec.get("since_raw") or raw, today)
                rec["settled_on"] = d.isoformat() if d else None
        else:
            body = raw[2:].strip()
            m = CHECKBOX.match(raw.split("\n", 1)[0])
            if m:
                _checkbox(m, rec, kind)
            else:
                rec["title"] = body
                lead = LEAD_DATE.match(body)
                if kind == "settled" and lead:
                    d = parse_date(lead.group(1), today)
                    rec["settled_on"] = d.isoformat() if d else None
        if rec["due"] and rec["kind"] != "settled" and rec["due"] < today.isoformat():
            rec["overdue_days"] = (today - dt.date.fromisoformat(rec["due"])).days
        if heads and section is not None:
            heads[-1]["items"] += 1
        items.append(rec)
    return {"source": source, "spans": spans, "items": items, "sections": heads,
            "lossless": "".join(s[2] for s in spans) == text}


def report(doc):
    """Counts only, never content: the loss check of AC1."""
    by_type, by_kind = {}, {}
    for s in doc["spans"]:
        by_type[s[0]] = by_type.get(s[0], 0) + 1
    for it in doc["items"]:
        by_kind[it["kind"]] = by_kind.get(it["kind"], 0) + 1
    lines = sum(s[2].count("\n") + (0 if s[2].endswith("\n") else 1) for s in doc["spans"])
    covered = by_type.get("row", 0) + by_type.get("list", 0)
    return {"source": doc["source"], "lossless": doc["lossless"], "lines": lines,
            "sections": len(doc["sections"]), "spans": by_type, "items": len(doc["items"]),
            "items_in_sections": sum(h["items"] for h in doc["sections"]),
            "items_before_first_section": len(doc["items"]) - sum(h["items"] for h in doc["sections"]),
            "rows_and_lists": covered, "by_kind": by_kind}


def purgeable(doc, days=SETTLED_DAYS, today=None):
    """Settled items with a settled date older than `days` days. Undated settled items stay."""
    cutoff = ((today or dt.date.today()) - dt.timedelta(days=days)).isoformat()
    return [it for it in doc["items"] if it["kind"] == "settled" and it["settled_on"] and it["settled_on"] < cutoff]


def purge_text(doc, drop):
    """The file text without the dropped items' spans."""
    lines = {it["line"] - 1 for it in drop}
    return "".join(raw for typ, start, raw, _ in doc["spans"] if not (typ in ("row", "list") and start in lines))


def write_atomic(path, text):
    path = Path(path)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8", newline="") as f:
        f.write(text)
    os.replace(tmp, path)


def to_inbox(item):
    """An Inbox `followup` row (Waiting on others) from a waiting item; the shape item_223's adapter reads."""
    return {"id": f"followup:{item['source']}:{item['id']}", "kind": "followup", "group": "waiting",
            "project": item["project"], "who": item["who"], "ask": item["title"], "expected": item["expected"],
            "due": item["due"], "overdue_days": item.get("overdue_days"), "since": item["since"] or item["touched"],
            "origin": {"source": item["source"], "line": item["line"]}, "answer": "edit or remove the source line"}


# --- configured files ---------------------------------------------------------------

def config(mods=None):
    """The pending settings of the core brick, defaults filled in."""
    if mods is None:
        import crow_lib
        mods = crow_lib.modules()
    core = (mods or {}).get("core") or {}
    return {"files": list(core.get("pending_files") or []),
            "settled_days": int(core.get("pending_settled_days") or SETTLED_DAYS),
            "sections": dict(core.get("pending_sections") or {}),
            "columns": dict(core.get("pending_columns") or {})}


def sources(cfg, threads=None):
    """(label, path) of every pending source: the Open Threads note, then the configured files."""
    out = [("threads", Path(threads))] if threads else []
    for entry in cfg["files"]:
        path = Path(os.path.expanduser(entry["path"] if isinstance(entry, dict) else entry))
        label = entry.get("label") if isinstance(entry, dict) else None
        out.append((label or path.stem, path))
    return out


def load(cfg, threads=None, today=None):
    """Parsed docs of every readable source plus errors for the missing ones."""
    docs, errors = [], []
    for label, path in sources(cfg, threads):
        try:
            text = path.read_text(encoding="utf-8")
        except OSError as exc:
            errors.append(f"{label}: {exc.strerror or exc}")
            continue
        doc = parse(text, label, cfg["sections"], cfg["columns"], today)
        doc["path"] = str(path)
        docs.append(doc)
    return docs, errors


def overdue(docs):
    rows = [it for d in docs for it in d["items"] if it.get("overdue_days")]
    return sorted(rows, key=lambda it: -it["overdue_days"])


def brief(cfg, threads=None, today=None, width=160):
    """Compact summary for crow-gather brief: counts, overdue follow-ups, settled rows to purge."""
    docs, errors = load(cfg, threads, today)
    lines = []
    for it in overdue(docs):
        who = f"{it['who']}: " if it["who"] else ""
        text = (who + (it["title"] or "")).replace("\n", " ")
        lines.append(f"{it['overdue_days']}d late [{it['source']}/{it['kind']}] "
                     + (text[:width] + "…" if len(text) > width else text))
    out = {"sources": [{"source": d["source"], "items": len(d["items"]),
                        "waiting": sum(1 for it in d["items"] if it["kind"] == "waiting"),
                        "to_purge": len(purgeable(d, cfg["settled_days"], today))} for d in docs],
           "overdue": lines}
    if errors:
        out["errors"] = errors
    return out


def purge(cfg, threads=None, apply=False, today=None):
    """Drop settled rows older than settled_days from every source. Returns [(label, count)]."""
    docs, _ = load(cfg, threads, today)
    done = []
    for doc in docs:
        drop = purgeable(doc, cfg["settled_days"], today)
        if not drop:
            continue
        if apply:
            current = Path(doc["path"]).read_text(encoding="utf-8")
            if current != "".join(s[2] for s in doc["spans"]):
                continue  # changed since the read: leave it for the next run
            write_atomic(doc["path"], purge_text(doc, drop))
        done.append((doc["source"], len(drop)))
    return done
