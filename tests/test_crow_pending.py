"""crow-pending: one schema over Open Threads and table-style pending files (item_238)."""
import datetime as dt
import importlib.machinery
import importlib.util
import json
import sys

from conftest import BIN, FIXTURES, run

sys.path.insert(0, str(BIN))
import crow_pending as cp

TODAY = dt.date(2026, 11, 19)
TABLE = (FIXTURES / "pending" / "table.md").read_text(encoding="utf-8")
THREADS = (FIXTURES / "pending" / "threads.md").read_text(encoding="utf-8")
# The aliases a French pending file sets in crow.yaml (modules.core).
SECTIONS = {"Brouillons": "draft", "Relances": "waiting", "Décisions": "decision", "Dossiers": "file",
            "Rangement": "paused", "Boîte de réception": "note", "Réglé récemment": "settled"}
COLUMNS = {"Échéance": "due", "Prio": "priority", "Qui": "who", "Attendu": "expected",
           "Sujet": "title", "Depuis": "since"}


def table():
    return cp.parse(TABLE, "pending", SECTIONS, COLUMNS, TODAY)


def kinds(doc):
    out = {}
    for it in doc["items"]:
        out[it["kind"]] = out.get(it["kind"], 0) + 1
    return out


# --- AC1: both formats parse without loss ----------------------------------------------

def test_table_file_is_lossless_and_every_row_and_line_is_an_item():
    doc = table()
    rep = cp.report(doc)
    assert doc["lossless"] and rep["lossless"]
    assert rep["lines"] == len(TABLE.splitlines())
    rows = sum(1 for line in TABLE.splitlines() if line.startswith("|"))
    lists = sum(1 for line in TABLE.splitlines() if line.startswith("- "))
    assert rep["spans"]["row"] + rep["spans"]["table_header"] + rep["spans"]["separator"] == rows
    assert rep["spans"]["list"] == lists == rep["items"] - rep["spans"]["row"]
    assert rep["sections"] == 7
    assert kinds(doc) == {"other": 4, "draft": 2, "waiting": 4, "decision": 3, "file": 4,
                          "paused": 1, "note": 3, "settled": 6}


def test_threads_file_is_lossless_and_reads_who_due_and_next():
    doc = cp.parse(THREADS, "threads", today=TODAY)
    assert doc["lossless"]
    assert [h["title"] for h in doc["sections"]] == ["Me", "Crow", "Waiting"]
    waiting = [it for it in doc["items"] if it["kind"] == "waiting"]
    first = waiting[0]
    assert (first["who"], first["title"], first["next"], first["due"], first["project"], first["touched"]) == (
        "Person A", "review of the schema", "merge", "2026-11-10", "api", "2026-11-02")
    assert first["overdue_days"] == 9
    assert waiting[1]["who"] == "Person B" and waiting[1]["due"] is None
    settled = [it for it in doc["items"] if it["kind"] == "settled"]
    assert len(settled) == 1 and settled[0]["settled_on"] == "2026-10-20"
    me = next(it for it in doc["items"] if it["kind"] == "me")
    assert me["who"] is None and me["next"] == "ship it"


def test_rows_before_the_separator_stay_rows_of_the_same_table():
    doc = table()
    decisions = [it for it in doc["items"] if it["kind"] == "decision"]
    assert len(decisions) == 3
    assert all(it["cells"] and set(it["cells"]) == {"Sujet", "Attendu", "Depuis"} for it in decisions)
    assert decisions[0]["since"] == "2026-11-19"


def test_followup_rows_map_columns_and_dates():
    doc = table()
    rows = [it for it in doc["items"] if it["kind"] == "waiting"]
    assert [it["who"] for it in rows] == ["Vendor C via agent D", "Vendor E via agent D",
                                          "Contact A (Supplier A)", "Lab F"]
    assert [it["due"] for it in rows] == ["2026-11-09", "2026-11-19", "2026-11-17", "2026-11-30"]
    assert [it.get("overdue_days") for it in rows] == [10, None, 2, None]
    assert rows[0]["due_raw"] == "début S46" and rows[0]["priority"] == "🟠"


def test_blocks_and_continuation_lines():
    doc = table()
    files = [it for it in doc["items"] if it["kind"] == "file"]
    assert [it["block"] for it in files] == [None, "Harness check at the workshop", "Motor", "Motor"]
    note = [it for it in doc["items"] if it["kind"] == "note"][1]
    assert note["raw"].count("\n") == 2


def test_settled_dates_and_purge_keep_undated_and_recent_rows():
    doc = table()
    settled = [it for it in doc["items"] if it["kind"] == "settled"]
    assert [it["settled_on"] for it in settled] == ["2026-11-19", "2026-11-18", "2026-11-13", "2026-11-01",
                                                    "2026-10-20", None]
    drop = cp.purgeable(doc, 14, TODAY)
    assert [it["settled_on"] for it in drop] == ["2026-11-01", "2026-10-20"]
    text = cp.purge_text(doc, drop)
    assert "Old topic closed" not in text and "Older topic closed" not in text
    assert "Undated settled line stays" in text and "T4 report sent" in text
    assert len(text.splitlines()) == len(TABLE.splitlines()) - 2
    again = cp.parse(text, "pending", SECTIONS, COLUMNS, TODAY)
    assert again["lossless"] and cp.purgeable(again, 14, TODAY) == []
    assert len(cp.purgeable(doc, 30, TODAY)) == 0


def test_parse_date_forms():
    assert cp.parse_date("2026-01-02", TODAY) == dt.date(2026, 1, 2)
    assert cp.parse_date("05/01", TODAY) == dt.date(2027, 1, 5)
    assert cp.parse_date("28/10", TODAY) == dt.date(2026, 10, 28)
    assert cp.parse_date("31/12/2025", TODAY) == dt.date(2025, 12, 31)
    assert cp.parse_date("W47", TODAY) == dt.date(2026, 11, 16)
    assert cp.parse_date("soon", TODAY) is None


def test_unknown_sections_stay_readable_as_other():
    doc = cp.parse(TABLE, "pending", today=TODAY)
    assert doc["lossless"]
    assert kinds(doc)["decision"] == 3  # the English default matches the accented heading
    assert kinds(doc)["other"] == 4 + 2 + 4 + 4 + 1 + 3 + 6


# --- AC2: an overdue follow-up shows in brief and as an Inbox Waiting row -----------------

def test_brief_and_inbox_rows(tmp_path):
    (tmp_path / "pending.md").write_text(TABLE, encoding="utf-8")
    (tmp_path / "threads.md").write_text(THREADS, encoding="utf-8")
    cfg = {"files": [str(tmp_path / "pending.md")], "settled_days": 14, "sections": SECTIONS, "columns": COLUMNS}
    out = cp.brief(cfg, tmp_path / "threads.md", TODAY)
    assert out["overdue"] == [
        "10d late [pending/waiting] Vendor C via agent D: ♻️ 06/11: 3D files sent, waiting for the drawing.",
        "9d late [threads/waiting] Person A: review of the schema",
        "2d late [pending/waiting] Contact A (Supplier A): Quote for half of the vehicle, **000,00 € HT**; answer to give.",
    ]
    assert out["sources"] == [{"source": "threads", "items": 6, "waiting": 2, "to_purge": 1},
                              {"source": "pending", "items": 27, "waiting": 4, "to_purge": 2}]
    row = cp.to_inbox(next(it for it in cp.parse(THREADS, "threads", today=TODAY)["items"] if it["kind"] == "waiting"))
    assert row["kind"] == "followup" and row["group"] == "waiting"
    assert (row["who"], row["due"], row["overdue_days"], row["origin"]) == (
        "Person A", "2026-11-10", 9, {"source": "threads", "line": 11})


def hub_with_pending(hub, settled_days=14):
    home, _ = hub
    today = dt.date.today()
    late, old = (today - dt.timedelta(days=3)).isoformat(), (today - dt.timedelta(days=40)).isoformat()
    recent = (today - dt.timedelta(days=2)).isoformat()
    (home / "local" / "projects.yaml").write_text("vault: {path: null, crow_dir: null}\nprojects: []\n")
    (home / "local" / "state" / "open-threads.md").write_text(
        f"# Open threads\n\n## Waiting\n- [ ] {old} [api] Person A: the review 📅 {late}\n")
    pending = home / "pending.md"
    pending.write_text(
        "# Pending\n\n## Follow-ups\n\n| Due | Who | Expected |\n|---|---|---|\n"
        f"| {late} | Vendor | the quote |\n\n## Settled\n- {recent} kept\n- {old} gone\n")
    (home / "local" / "crow.yaml").write_text(
        f"version: 1\nmodules:\n  core:\n    pending_files: [{pending}]\n"
        f"    pending_settled_days: {settled_days}\n")
    return pending


def test_cli_inbox_lists_overdue_followups_first(hub):
    hub_with_pending(hub)
    out = run(hub, "crow-pending", "inbox")
    assert out.returncode == 0, out.stderr
    rows = json.loads(out.stdout)
    assert [(r["who"], r["overdue_days"]) for r in rows] == [("Person A", 3), ("Vendor", 3)]
    assert all(r["kind"] == "followup" for r in rows)


def test_gather_brief_shows_the_overdue_followup(hub):
    hub_with_pending(hub)
    out = run(hub, "crow-gather", "brief", "--json", "--no-apply",
              env={"CROW_GATHER_OFFLINE": "1", "CROW_VAULT": str(hub[0] / "novault")})
    assert out.returncode == 0, out.stderr
    pending = json.loads(out.stdout)["pending"]
    assert pending["overdue"] == ["3d late [threads/waiting] Person A: the review",
                                  "3d late [pending/waiting] Vendor: the quote"]
    assert pending["sources"][1]["to_purge"] == 1


def test_cli_check_reports_counts_only(hub):
    out = run(hub, "crow-pending", "check", str(FIXTURES / "pending" / "table.md"))
    assert out.returncode == 0, out.stderr
    rep = json.loads(out.stdout)[0]
    assert rep["lossless"] and rep["items"] == 27
    assert "Supplier" not in out.stdout and "Contact" not in out.stdout


# --- AC3: the tidy step purges settled rows older than N days -----------------------------

def load_tidy():
    loader = importlib.machinery.SourceFileLoader("crow_tidy_pending", str(BIN / "crow-tidy"))
    spec = importlib.util.spec_from_loader("crow_tidy_pending", loader)
    mod = importlib.util.module_from_spec(spec)
    loader.exec_module(mod)
    return mod


def test_cli_purge_is_a_dry_run_until_apply(hub):
    pending = hub_with_pending(hub)
    before = pending.read_text()
    out = run(hub, "crow-pending", "purge")
    assert out.returncode == 0 and "would purge 1 settled row(s) older than 14 days" in out.stdout
    assert pending.read_text() == before
    out = run(hub, "crow-pending", "purge", "--apply")
    assert "pending: purged 1" in out.stdout
    assert "gone" not in pending.read_text() and "kept" in pending.read_text()


def test_settled_days_is_configurable(hub):
    pending = hub_with_pending(hub, settled_days=60)
    out = run(hub, "crow-pending", "purge", "--apply")
    assert "nothing settled older than 60 days" in out.stdout and "gone" in pending.read_text()


def test_tidy_step_purges_with_apply(tmp_path):
    ct = load_tidy()
    path = tmp_path / "pending.md"
    path.write_text("## Settled\n- 2000-01-01 gone\n- 2999-01-01 kept\n")
    cfg = {"files": [str(path)], "settled_days": 14, "sections": {}, "columns": {}}
    missing = tmp_path / "no-threads.md"
    assert ct.pending_lines(False, cfg, missing) == [
        "## pending", "- to purge: 1 settled row(s) older than 14 days in pending"]
    assert "gone" in path.read_text()
    assert ct.pending_lines(True, cfg, missing)[1].startswith("- ✔ purged 1")
    assert path.read_text() == "## Settled\n- 2999-01-01 kept\n"
    assert ct.pending_lines(True, cfg, missing) == []
