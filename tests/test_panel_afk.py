import datetime as dt

import pytest

from test_panel_api import panel, post
from crow_panel.core import Problem
from crow_panel.server import App


DECISIONS = """# Decisions

## 1. Which trial?
- Job: example
- Option: Keep trial
- Option: Activate later
- Recommendation: Keep trial

## 2. Next review?
- Option: Morning
- Option: Evening
"""


def setup_decisions(app, tmp_path):
    root = tmp_path / "afk"
    root.mkdir()
    app.cfg["afk_dir"] = str(root)
    night = dt.date.today().isoformat()
    source = root / ("decisions-" + night + ".md")
    source.write_bytes(DECISIONS.replace("\n", "\r\n").encode())
    return source, night


def test_decision_answer_is_backed_up_isolated_and_idempotent(panel, tmp_path):
    app, fake = panel
    source, night = setup_decisions(app, tmp_path)
    before = source.read_bytes()
    row = app.readers.afk()["decisions"][0]
    body = {"request_id": "answer", "night": night, "item_rev": row["item_rev"], "answer": "Keep trial"}
    response = post(app, "/api/afk/decisions/1/answer", body)
    assert response[1]["status"] == "succeeded" and response[1]["dry_run"]
    assert post(app, "/api/afk/decisions/1/answer", body) == response
    assert source.read_bytes() == before
    overlay = app.cfg.state / "afk" / source.name
    after = overlay.read_bytes()
    assert b"- Answer: Keep trial\r\n" in after
    assert after.replace(b"- Answer: Keep trial\r\n", b"") == before
    backup = app.cfg.state / "afk/backups" / response[1]["result"]["backup"]
    assert backup.read_bytes() == before
    assert app.readers.afk()["decisions"][0]["answered"]
    assert app.readers.state()["counts"]["afk_decisions"] == 1
    assert not fake.calls or all(c[1] != "run" for c in fake.calls)
    op = app.operation(response[1]["operation_id"])
    op["status"] = "running"
    app.store.save_op(op)
    restarted = App(app.cfg, fake)
    assert restarted.operation(op["operation_id"])["status"] == "succeeded"
    assert overlay.read_bytes() == after
    restarted.store.db.close()


def test_decision_live_writes_only_selected_block_and_preserves_unrelated_edit(panel, tmp_path):
    app, _ = panel
    source, night = setup_decisions(app, tmp_path)
    row = app.decisions.view(night)[0]
    source.write_bytes(source.read_bytes().replace(b"Morning", b"Afternoon"))
    before = source.read_bytes()
    app.cfg["mode"] = "live"
    post(app, "/api/afk/decisions/1/answer", {"request_id": "live-answer", "night": night, "item_rev": row["item_rev"], "answer": "Activate later"})
    assert source.read_bytes().replace(b"- Answer: Activate later\r\n", b"") == before


@pytest.mark.parametrize("problem", ["changed", "invalid", "duplicate", "traversal"])
def test_decision_rejects_stale_ambiguous_and_invalid_choices(panel, tmp_path, problem):
    app, _ = panel
    source, night = setup_decisions(app, tmp_path)
    row = app.decisions.view(night)[0]
    body = {"request_id": "bad-answer", "night": night, "item_rev": row["item_rev"], "answer": "Keep trial"}
    if problem == "changed":
        source.write_bytes(source.read_bytes().replace(b"Which trial?", b"Different question?"))
    elif problem == "invalid":
        body["answer"] = "Unlisted choice\n- injected"
    elif problem == "duplicate":
        source.write_bytes(source.read_bytes() + b"\r\n## 1. Duplicate\r\n- Option: Keep trial\r\n")
    else:
        body["night"] = "../../escape"
    before = source.read_bytes()
    with pytest.raises(Problem):
        post(app, "/api/afk/decisions/1/answer", body)
    assert source.read_bytes() == before
    assert not (app.cfg.state / "afk/backups").exists()
