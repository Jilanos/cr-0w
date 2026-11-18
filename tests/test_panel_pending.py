import datetime as dt
from pathlib import Path
import sys

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "bin"))
from crow_panel.core import Config, Problem, Store
from crow_panel.pending import Pending, split_row
from crow_panel.security import Files

DOCUMENT = """# Pending

## 📌 Relances
| Échéance | Prio | Qui | Attendu |
|---|---|---|---|
| 20/11 | 🟡 | Example | Keep [link](https://example.org/) and escaped \\| pipe |
| 20/11 | 🟡 | Example | Second |

## 🎯 Décisions
- **Action** with [link](https://example.org/)
  continuation

Unstructured paragraph.

## ✅ Réglé récemment
- 10/11 Previous
"""


def setup(tmp_path):
    pending = tmp_path / "pending.md"
    pending.write_text(DOCUMENT)
    cfg = Config(overrides={"state_dir": str(tmp_path / "state"), "locks_dir": str(tmp_path / "locks"), "pending_md": str(pending)})
    store = Store(cfg)
    writer = Pending(cfg, store, Files(cfg, store), lambda *args: "t_example")
    return writer, store, cfg


def items(writer):
    return [i for s in writer.view()["sections"] for i in s["items"] if "done" in i["actions"]]


def test_done_undo_lossless_and_independent_changes(tmp_path):
    writer, store, cfg = setup(tmp_path)
    first, second, bullet = items(writer)
    op = writer.mutate(first["id"], "done", {"request_id": "one", "item_rev": first["item_rev"]}, "/done")
    result = writer.path.read_text()
    assert "- " + dt.date.today().strftime("%d/%m") + " Example : Keep [link](https://example.org/) and escaped \\| pipe" in result
    assert "| 20/11 | 🟡 | Example | Second |" in result
    assert (cfg.state / "backups" / op["result"]["backup"]).read_text() == DOCUMENT
    writer.path.write_text(result + "\nIndependent addition\n")
    writer.undo(op, {"request_id": "undo"}, "/undo")
    assert writer.path.read_text() == DOCUMENT + "\nIndependent addition\n"


def test_two_clicks_keep_identity_and_two_undos(tmp_path):
    writer, store, _ = setup(tmp_path)
    first, second, _ = items(writer)
    a = writer.mutate(first["id"], "done", {"request_id": "a", "item_rev": first["item_rev"]}, "/a")
    b = writer.mutate(second["id"], "done", {"request_id": "b", "item_rev": second["item_rev"]}, "/b")
    writer.undo(a, {"request_id": "ua"}, "/ua")
    writer.undo(b, {"request_id": "ub"}, "/ub")
    assert writer.path.read_text() == DOCUMENT


def test_stale_line_does_not_write(tmp_path):
    writer, _, _ = setup(tmp_path)
    first = items(writer)[0]
    changed = DOCUMENT.replace("Keep [link]", "Changed [link]")
    writer.path.write_text(changed)
    with pytest.raises(Problem) as err:
        writer.mutate(first["id"], "done", {"request_id": "a", "item_rev": first["item_rev"]}, "/a")
    assert err.value.body["error"]["code"] == "conflict"
    assert writer.path.read_text() == changed


def test_duplicate_ambiguity(tmp_path):
    writer, _, _ = setup(tmp_path)
    writer.path.write_text(DOCUMENT.replace("| Second |", "| Keep [link](https://example.org/) and escaped \\| pipe |"))
    first = items(writer)[0]
    writer.path.write_text(writer.path.read_text().replace("| 20/11", "| 21/11", 1))
    with pytest.raises(Problem) as err:
        writer.mutate(first["id"], "done", {"request_id": "a", "item_rev": first["item_rev"]}, "/a")
    assert err.value.body["error"]["code"] == "ambiguous"


def test_snooze_and_undo_preserve_escaped_cells(tmp_path):
    writer, _, _ = setup(tmp_path)
    first = items(writer)[0]
    op = writer.mutate(first["id"], "snooze", {"request_id": "a", "item_rev": first["item_rev"], "due": "2026-12-01"}, "/a")
    assert "| 01/12 | 🟡" in writer.path.read_text()
    assert items(writer)[0]["id"] == first["id"]
    writer.undo(op, {"request_id": "ua"}, "/ua")
    assert writer.path.read_text() == DOCUMENT
    assert split_row(r"| a | escaped \| cell |") == ["a", r"escaped \| cell"]


def test_bullet_and_expiry_and_recovery(tmp_path):
    writer, store, cfg = setup(tmp_path)
    bullet = items(writer)[2]
    op = writer.mutate(bullet["id"], "done", {"request_id": "a", "item_rev": bullet["item_rev"]}, "/a")
    op["undo"]["until"] = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(seconds=3)).isoformat()
    with pytest.raises(Problem) as err:
        writer.undo(op, {"request_id": "ua"}, "/ua")
    assert err.value.body["error"]["code"] == "undo_expired"
    op["status"] = "running"
    store.save_op(op)
    before = writer.read_bytes()
    writer.recover()
    recovered = store.get("operations", op["operation_id"])
    assert recovered["status"] == "succeeded" and recovered["result"]["recovered"]
    assert writer.read_bytes() == before


def test_exact_duplicates_keep_ids_and_independent_undo(tmp_path):
    writer, _, _ = setup(tmp_path)
    document = DOCUMENT.replace("| Second |", "| Keep [link](https://example.org/) and escaped \\| pipe |")
    writer.path.write_text(document)
    first, second, _ = items(writer)
    a = writer.mutate(first["id"], "done", {"request_id": "a", "item_rev": first["item_rev"]}, "/a")
    assert items(writer)[0]["id"] == second["id"]
    b = writer.mutate(second["id"], "done", {"request_id": "b", "item_rev": second["item_rev"]}, "/b")
    writer.undo(a, {"request_id": "ua"}, "/ua")
    writer.undo(b, {"request_id": "ub"}, "/ub")
    assert writer.path.read_text() == document


def test_crlf_and_dossier_restore_stay_in_original_block(tmp_path):
    writer, _, _ = setup(tmp_path)
    data = '# Pending\n\n## Dossiers\n### First\n- One\n\n### Second\n- Two\n\n## ✅ Réglé récemment\n'.replace('\n', '\r\n').encode()
    writer.path.write_bytes(data)
    first = items(writer)[0]
    op = writer.mutate(first["id"], "done", {"request_id": "a", "item_rev": first["item_rev"]}, "/a")
    writer.undo(op, {"request_id": "ua"}, "/ua")
    assert writer.path.read_bytes() == data


def test_same_bytes_with_concurrent_mtime_change_are_rejected(tmp_path, monkeypatch):
    import os
    import crow_panel.pending as module
    writer, _, _ = setup(tmp_path)
    item = items(writer)[0]
    original = module.atomic
    def racing_backup(path, data):
        original(path, data)
        if Path(path).parent.name == "backups":
            stamp = writer.path.stat()
            os.utime(writer.path, ns=(stamp.st_atime_ns, stamp.st_mtime_ns + 1000000))
    monkeypatch.setattr(module, "atomic", racing_backup)
    with pytest.raises(Problem) as err:
        writer.mutate(item["id"], "done", {"request_id": "race", "item_rev": item["item_rev"]}, "/done")
    assert err.value.body["error"]["code"] == "conflict"
    assert writer.path.read_text() == DOCUMENT


def test_undo_preserves_the_other_duplicate_row_identity(tmp_path):
    writer, _, _ = setup(tmp_path)
    document = DOCUMENT.replace("| Second |", "| Keep [link](https://example.org/) and escaped \\| pipe |")
    writer.path.write_text(document)
    first, second, _ = items(writer)
    op = writer.mutate(first["id"], "done", {"request_id": "first", "item_rev": first["item_rev"]}, "/done")
    writer.undo(op, {"request_id": "undo-first"}, "/undo")
    assert [i["id"] for i in items(writer)[:2]] == [first["id"], second["id"]]
    writer.mutate(second["id"], "done", {"request_id": "second", "item_rev": second["item_rev"]}, "/done")
    assert items(writer)[0]["id"] == first["id"]


def test_rows_written_above_the_separator_keep_the_first_header(tmp_path):
    writer, store, cfg = setup(tmp_path)
    writer.path.write_text("# Pending\n\n## 🎯 Décisions\n\n| Sujet | Attendu | Depuis |\n| First | One | 17/11 |\n| Second | Two | 16/11 |\n"
                           "|---|---|---|\n| Third | Three | 15/11 |\n\n## ✅ Réglé récemment\n- 10/11 Previous\n")
    rows = items(writer)
    assert [r["title"] for r in rows] == ["First", "Second", "Third"]
    assert all(r["columns"] == ["Sujet", "Attendu", "Depuis"] for r in rows)
    op = writer.mutate(rows[0]["id"], "done", {"request_id": "above", "item_rev": rows[0]["item_rev"]}, "/done")
    result = writer.path.read_text()
    assert "| First |" not in result and "| Second | Two | 16/11 |\n|---|---|---|\n| Third |" in result
    writer.undo(op, {"request_id": "undo-above"}, "/undo")
    assert "| Sujet | Attendu | Depuis |\n| First | One | 17/11 |\n| Second |" in writer.path.read_text()
