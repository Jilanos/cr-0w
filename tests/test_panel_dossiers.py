import json
import os
from pathlib import Path
import time

import pytest

from test_panel_api import FakeCdx, panel, snapshot  # noqa: F401
from crow_panel.core import Problem
from crow_panel.dossiers import keywords, matches
from crow_panel.server import App

PENDING = """# En attente

## 📌 Relances : retours attendus

| Échéance | Prio | Qui | Attendu |
|---|---|---|---|
| 20/11 | 🟡 | Example Partner | Bus identifiers: report in [rapport](../70_Code/bus_conflicts_check/report.md). |
| 21/11 | 🟡 | Other Partner | Review the conflicts list for the network. |
| 22/11 | 🟢 | Third Partner | Unrelated harness drawing. |
"""


def touch(path, age_days=0.0):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("x")
    stamp = time.time() - age_days * 86400
    os.utime(path, (stamp, stamp))


@pytest.fixture
def work(panel, tmp_path):
    app, fake = panel
    root = tmp_path / "WORK"
    touch(root / "70_Code/bus_conflicts_check/report.md", 0.01)
    touch(root / "70_Code/bus_conflicts_check/sub/data.csv", 0.5)
    touch(root / "30_Procurement/Suppliers/Vendor/offer.pdf", 2)
    touch(root / "30_Procurement/Suppliers/Other/old.pdf", 40)
    touch(root / "00_Orga/mails-2026-11-18/draft.md", 0.001)
    touch(root / "90_Archive/old/file.txt", 60)
    touch(root / "70_Code/.git/HEAD", 0)
    Path(app.cfg["pending_md"]).write_text(PENDING)
    app.cfg["dossiers_discover"] = {"roots": [str(root)], "depth": [2, 3], "days": 14, "exclude": ["00_Orga/mails-*"]}
    app.dossiers.cache = None
    return app, fake, root


def test_keywords_and_matching():
    assert keywords("analyse_conflits_id_CAN") == ["conflits", "can"]
    assert keywords("BatteriesProd") == ["batteries", "prod"]
    assert matches(["conflits", "can"], "Tableau des ID CAN, conflits")
    assert matches(["conflits", "can"], "les conflits restants")
    assert not matches(["conflits", "can"], "trace CAN seule")
    assert matches(["seg"], "LOI SEG v7") and not matches(["seg"], "segment")


def test_discovery_ranks_recent_folders_and_links_rows_and_mails(work):
    app, _, root = work
    value = snapshot()
    value["items"][0]["subject"] = "Bus conflicts: updated list"
    app.mail.publish(value)
    rows = app.readers.dossiers()["dossiers"]
    auto = [d for d in rows if d["source"] == "auto"]
    labels = [d["folder_label"] for d in auto]
    assert labels == ["WORK/70_Code/bus_conflicts_check/", "WORK/30_Procurement/Suppliers/Vendor/"]
    can = auto[0]
    assert can["recent_count"] == 2 and can["files_active_at"]
    titles = {i["id"]: i["title"] for s in app.pending.view()["sections"] for i in s["items"]}
    linked = {titles[i]: why for i, why in can["links"].items()}
    assert linked == {"Example Partner": "chemin", "Other Partner": "mots-clés"}
    assert can["mail_count"] == 1 and can["mail_ids"] == [value["items"][0]["id"]]
    detail = app.readers.dossier(can["slug"])
    assert detail["mails"][0]["subject"] == "Bus conflicts: updated list" and len(detail["items"]) == 2
    assert all(not k.startswith("_") for k in can) and can["active"]
    assert rows[0]["slug"] == can["slug"]
    assert str(root) not in json.dumps(rows)


def test_pin_hide_persist_and_create_from_directory(work):
    app, fake, root = work
    slug = next(d["slug"] for d in app.readers.dossiers()["dossiers"] if d["source"] == "auto" and "Vendor" in d["folder_label"])
    status, row = app.mutate("POST", "/api/dossiers/" + slug + "/pin", {"request_id": "pin", "on": True})
    assert status == 200 and row["pinned"]
    assert app.readers.dossiers()["dossiers"][0]["slug"] == slug
    app.mutate("POST", "/api/dossiers/" + slug + "/hide", {"request_id": "hide", "on": True})
    restarted = App(app.cfg, fake)
    try:
        restarted.cfg["dossiers_discover"] = app.cfg["dossiers_discover"]
        listed = restarted.readers.dossiers()
        assert slug not in [d["slug"] for d in listed["dossiers"]] and listed["discovery"]["hidden_count"] == 1
        hidden = next(d for d in restarted.readers.dossiers(include_hidden=True)["dossiers"] if d["slug"] == slug)
        assert hidden["hidden"] and not hidden["pinned"]
        found = restarted.get("/api/dossiers/directories", {"q": ["archive old"]})["directories"]
        assert [d["label"] for d in found] == ["WORK/90_Archive/old/"]
        _, created = restarted.mutate("POST", "/api/dossiers/create", {"request_id": "create", "file_id": found[0]["file_id"], "title": "Archive"})
        assert created["source"] == "custom" and created["pinned"] and created["title"] == "Archive"
        assert restarted.readers.dossier(created["slug"])["folder_label"] == "WORK/90_Archive/old/"
        with pytest.raises(Problem):
            restarted.mutate("POST", "/api/dossiers/missing/pin", {"request_id": "missing", "on": True})
        with pytest.raises(Problem):
            restarted.mutate("POST", "/api/dossiers/" + slug + "/pin", {"request_id": "bad", "on": "yes"})
    finally:
        restarted.launcher.close()
        restarted.store.db.close()


def test_create_rejects_files_and_paths_outside_roots(work, tmp_path):
    app, _, root = work
    file_id = app.files.register(root / "70_Code/bus_conflicts_check/report.md")
    with pytest.raises(Problem) as err:
        app.mutate("POST", "/api/dossiers/create", {"request_id": "file", "file_id": file_id})
    assert err.value.status == 422
    with pytest.raises(Problem) as err:
        app.mutate("POST", "/api/dossiers/create", {"request_id": "unknown", "file_id": "f_unknown"})
    assert err.value.status == 404


def test_discovery_disabled_without_roots(panel):
    app, _ = panel
    listed = app.readers.dossiers()
    assert listed["discovery"]["enabled"] is False
    assert all(d["source"] == "pending" for d in listed["dossiers"])
