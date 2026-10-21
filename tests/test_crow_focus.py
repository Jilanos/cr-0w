"""crow-focus: window matching and the dry run (no kitty is ever started)."""
import importlib.machinery
import importlib.util

from conftest import BIN, run

loader = importlib.machinery.SourceFileLoader("crow_focus", str(BIN / "crow-focus"))
spec = importlib.util.spec_from_loader("crow_focus", loader)
cf = importlib.util.module_from_spec(spec)
loader.exec_module(cf)

LS = [{"tabs": [{"windows": [
    {"id": 1, "pid": 100, "foreground_processes": [{"pid": 100}]},
    {"id": 2, "pid": 200, "foreground_processes": [{"pid": 250}]},
]}]}]


def test_window_found_by_ancestor_or_foreground_process():
    assert cf.find_window(LS, 999, chain=[999, 300, 200]) == 2
    assert cf.find_window(LS, 250, chain=[250]) == 2
    assert cf.find_window(LS, 999, chain=[999, 1]) is None


def test_ancestors_stop_at_init(tmp_path):
    for pid, ppid in ((30, 20), (20, 10), (10, 1)):
        d = tmp_path / str(pid)
        d.mkdir()
        (d / "stat").write_text(f"{pid} (a b) S {ppid} 0")
    assert cf.ancestors(30, proc=str(tmp_path)) == [30, 20, 10]


def test_dry_run_needs_account_and_cwd(hub):
    ok = run(hub, "crow-focus", "--pid", "5", "--account", "main", "--cwd", "/tmp", "--dry-run")
    assert ok.returncode == 0 and "cdx main --dir /tmp --resume" in ok.stdout
    assert run(hub, "crow-focus", "--pid", "5", "--dry-run").returncode != 0
