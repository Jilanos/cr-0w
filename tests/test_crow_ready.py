"""crow-ready: Ready backlog items across registered repos, newest first."""
import importlib.machinery
import importlib.util
import os

from conftest import BIN


def _mod():
    loader = importlib.machinery.SourceFileLoader("crow_ready", str(BIN / "crow-ready"))
    spec = importlib.util.spec_from_loader("crow_ready", loader)
    mod = importlib.util.module_from_spec(spec)
    loader.exec_module(mod)
    return mod


def _repo(tmp_path, name, docs):
    root = tmp_path / name
    (root / "logics" / "backlog").mkdir(parents=True)
    for i, (ref, mtime) in enumerate(docs):
        f = root / "logics" / "backlog" / f"{ref}.md"
        f.write_text("x")
        os.utime(f, (mtime, mtime))
    return str(root)


def test_ready_items_newest_first_and_skips(tmp_path):
    cr = _mod()
    a = _repo(tmp_path, "a", [("item_1", 100), ("item_2", 300)])
    b = _repo(tmp_path, "b", [("item_9", 200)])
    entries = {
        a: [{"ref": "item_1", "path": "logics/backlog/item_1.md", "status": "Ready", "title": "One"},
            {"ref": "item_2", "path": "logics/backlog/item_2.md", "status": "Ready", "title": "Two"},
            {"ref": "item_3", "path": "logics/backlog/item_3.md", "status": "Done"}],
        b: [{"ref": "item_9", "path": "logics/backlog/item_9.md", "status": "Ready", "title": "Nine"}],
    }

    def lister(root):
        if root.endswith("/c"):
            raise RuntimeError("boom")
        return entries[root]
    c = _repo(tmp_path, "c", [])
    projects = [{"name": "a", "path": a}, {"name": "b", "path": b}, {"name": "c", "path": c},
                {"name": "old", "path": a, "status": "archived"}, {"name": "none", "path": str(tmp_path / "nope")}]
    items, skipped = cr.ready(projects, lister)
    assert [i["ref"] for i in items] == ["item_2", "item_9", "item_1"]
    assert items[0]["project"] == "a" and items[0]["title"] == "Two"
    assert skipped == {"c": "boom"}
