"""Accounts local/accounts.yaml does not list are tagged 'not in policy' in status views, not shown as errors."""
import importlib.machinery
import importlib.util
import sys
from datetime import UTC, datetime, timedelta

from conftest import BIN

sys.path.insert(0, str(BIN))
import crow_lib


def load(name, script):
    loader = importlib.machinery.SourceFileLoader(name, str(BIN / script))
    spec = importlib.util.spec_from_loader(name, loader)
    mod = importlib.util.module_from_spec(spec)
    loader.exec_module(mod)
    return mod


room = load("crow_room_np", "crow-room")
usage = load("crow_usage_np", "crow-usage")
NOW = datetime(2026, 11, 7, 12, 0, tzinfo=UTC)
# What cdx reports for an account it knows but crow never set up: no reading, a failed auth.
STRANGER = {"session_name": "stranger", "provider": "claude", "policy": None, "auth_status": "error 401",
            "remaining_5h_pct": None, "remaining_week_pct": None, "rate_limit_reached": None,
            "runs_out_at_iso": None, "updated_at": (NOW - timedelta(minutes=3)).isoformat()}


def test_policy_names_reads_accounts_yaml(tmp_path):
    p = tmp_path / "accounts.yaml"
    p.write_text("accounts:\n  - name: main\n    policy: use\n  - name: side\n")
    assert crow_lib.policy_names(str(p)) == {"main", "side"}
    assert crow_lib.policy_names(str(tmp_path / "missing.yaml")) is None


def test_room_tags_an_account_outside_the_policy():
    assert room.verdict(STRANGER, NOW, policy={"main"}) == (None, False, "not in policy")
    known = {**STRANGER, "session_name": "main"}
    assert room.verdict(known, NOW, policy={"main"})[2] == "no quota reading"
    assert room.verdict(known, NOW)[2] == "no quota reading"


def test_usage_limits_tag_an_account_outside_the_policy():
    rows = [STRANGER, {**STRANGER, "session_name": "main", "remaining_5h_pct": 70, "remaining_week_pct": 50,
                       "reset_5h_at": "17:00", "reset_week_at": "Nov 9"}]
    lims = usage.limit_rows(rows, {"main"})
    assert [lim["in_policy"] for lim in lims] == [False, True]
    assert usage.limit_line(lims[0]) == "stranger not in policy"
    assert "70% left" in usage.limit_line(lims[1])
    assert all(lim["in_policy"] for lim in usage.limit_rows(rows, None))
