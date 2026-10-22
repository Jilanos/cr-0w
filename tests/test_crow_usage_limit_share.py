"""crow-usage: per-session share of the account's limit windows, and prices for models cdx lacks."""
import datetime as dt
import importlib.machinery
import importlib.util

import pytest

from conftest import BIN

loader = importlib.machinery.SourceFileLoader("crow_usage_ls", str(BIN / "crow-usage"))
spec = importlib.util.spec_from_loader("crow_usage_ls", loader)
cu = importlib.util.module_from_spec(spec)
loader.exec_module(cu)

NOW = dt.datetime(2026, 10, 22, 12, 30).astimezone()


def utc_hour(local_h, day=22):
    return dt.datetime(2026, 10, day, local_h, 0).astimezone().astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H")


def test_shares_split_used_window_by_cost():
    limits = [{"account": "main", "remaining_5h_pct": 60, "reset_5h_at": "Oct 22 15:00",
               "remaining_week_pct": 80, "reset_week_at": "Oct 27 12:00"}]
    sessions = [
        {"id": "a", "account": "main", "hours": {utc_hour(11): 3.0, utc_hour(9, day=21): 5.0}},
        {"id": "b", "account": "main", "hours": {utc_hour(12): 1.0}},
        {"id": "c", "account": "spare", "hours": {utc_hour(12): 9.0}},
    ]
    cu.limit_shares(sessions, limits, NOW)
    a, b, c = (s["limit_share"] for s in sessions)
    # 5h window opened 10:00: a spent 3 of 4, b 1 of 4, of 40 points used.
    assert a["five_hour_pct"] == 30.0 and b["five_hour_pct"] == 10.0
    # The week opened Oct 20 12:00: a spent 8 of 9, b 1 of 9, of 20 points used.
    assert a["week_pct"] == round(8 / 9 * 20, 1) and b["week_pct"] == round(1 / 9 * 20, 1)
    assert c == {"five_hour_pct": None, "week_pct": None}


def test_unknown_limits_give_none():
    sessions = [{"id": "a", "account": "main", "hours": {utc_hour(11): 3.0}}]
    cu.limit_shares(sessions, [{"account": "main", "remaining_5h_pct": None, "reset_5h_at": None}], NOW)
    assert sessions[0]["limit_share"] == {"five_hour_pct": None, "week_pct": None}


def test_haiku_5_5_is_priced():
    if cu.estimate_cost is None:
        pytest.skip("cdx_manager not installed")
    usage = {"input_tokens": 1_000_000, "output_tokens": 1_000_000, "cache_read_tokens": 0, "cache_creation_tokens": 0,
             "cache_1h_tokens": 0}
    assert cu.price(usage, "claude-haiku-5-5") == pytest.approx(0.60)
