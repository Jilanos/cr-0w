"""crow-usage resolve_days: finished days come from the store, only today and yesterday recompute."""
import importlib.machinery
import importlib.util

from conftest import BIN

loader = importlib.machinery.SourceFileLoader("crow_usage", str(BIN / "crow-usage"))
spec = importlib.util.spec_from_loader("crow_usage", loader)
cu = importlib.util.module_from_spec(spec)
loader.exec_module(cu)

WINDOW = ["d1", "d2", "d3", "d4"]  # d3 yesterday, d4 today


def day(n):
    return {"sessions": n, "cost_usd": float(n)}


def test_frozen_days_ignore_recomputation():
    live = {"d1": day(5), "d2": day(0), "d3": day(2), "d4": day(1)}
    store = {"d1": day(3), "d2": day(4)}
    days, changed = cu.resolve_days(WINDOW, live, store)
    assert days["d1"] == day(3) and days["d2"] == day(4)
    assert not changed or store["d3"] == day(2)


def test_recent_days_recomputed_and_yesterday_saved():
    live = {"d1": day(0), "d2": day(0), "d3": day(2), "d4": day(1)}
    store = {"d3": day(1)}
    days, changed = cu.resolve_days(WINDOW, live, store)
    assert days["d3"] == day(2) and days["d4"] == day(1)
    assert changed and store["d3"] == day(2) and "d4" not in store


def test_missing_finished_day_is_frozen_once():
    live = {"d1": day(3), "d2": day(0), "d3": day(0), "d4": day(0)}
    store = {}
    days, changed = cu.resolve_days(WINDOW, live, store)
    assert changed and store == {"d1": day(3)} and days["d1"] == day(3)


def test_cleaned_transcripts_keep_stored_yesterday():
    live = {"d1": day(0), "d2": day(0), "d3": day(0), "d4": day(0)}
    store = {"d3": day(2)}
    days, changed = cu.resolve_days(WINDOW, live, store)
    assert days["d3"] == day(2) and not changed
