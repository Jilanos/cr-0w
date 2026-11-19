"""Scope-aware account pick: cdx order without a scope, ranks and room floors with one."""
import json
import sys
from datetime import UTC, datetime

from conftest import BIN, FIXTURES, run

sys.path.insert(0, str(BIN))
import crow_lib

NOW = datetime(2026, 11, 6, 16, 0, tzinfo=UTC)


def row(name, left5=80, leftw=80):
    return {"session_name": name, "enabled": True, "auth_status": "authenticated", "remaining_5h_pct": left5,
            "remaining_week_pct": leftw, "reset_5h_at": "Nov 7 01:30"}


def acct(name, policy="use", priority=0, scopes=None, floor=None, **extra):
    return {"name": name, "policy": policy, "priority": priority, "scopes": scopes or {},
            "scope_min_room": floor or {}, **extra}


def pick(accts, rows, scope=None, busy=(), default="work"):
    st = crow_lib.pick_accounts(accts, {r["session_name"]: r for r in rows}, None, NOW, scope)
    return crow_lib.launch_pick(st, set(busy), default)


# the owner shape: work account ranks work/hub first, personal ranks personal/hub first, shared is work only
RANKED = [acct("work", priority=80, scopes={"work": 1, "hub": 1, "personal": 2}, floor={"personal": 40}),
          acct("home", priority=60, scopes={"personal": 1, "hub": 1, "work": 2}),
          acct("shared", "ask-first", priority=20, scopes={"work": 3})]


# ---------- AC0: no scope = cdx order ----------

def test_no_scope_matches_the_recorded_cdx_select():
    fx = json.loads((FIXTURES / "cdx-select.json").read_text())
    accts = [acct(n, c["policy"], c["priority"]) for n, c in fx["configs"].items()]
    p = pick(accts, fx["rows"], default="a")
    assert p["account"] == fx["select"]["session"]
    assert p["room"] == fx["select"]["available_pct"]
    assert fx["select"]["usable_order"][:2] == ["usability", "priority"]


def test_no_scope_priority_beats_room_inside_a_class():
    accts = [acct("a", priority=20), acct("b", priority=60)]
    p = pick(accts, [row("a", 90), row("b", 40)], default="zzz")
    assert (p["account"], p["factor"]) == ("b", "priority")


def test_default_does_not_beat_a_higher_priority():
    accts = [acct("work", priority=20), acct("home", priority=60)]
    assert pick(accts, [row("work"), row("home", 30)])["account"] == "home"


# ---------- AC1: usability, then rank, then cdx order ----------

def test_rank_orders_the_scope():
    assert pick(RANKED, [row("work"), row("home"), row("shared")], "work", default="home")["account"] == "work"
    assert pick(RANKED, [row("work"), row("home"), row("shared")], "personal", default="work")["account"] == "home"
    assert pick(RANKED, [row("work"), row("home"), row("shared")], "hub", default="x")["account"] == "work"


def test_rank_never_beats_usability():
    p = pick(RANKED, [row("work", 0), row("home", 50), row("shared")], "work")
    assert (p["account"], p["ask"]) == ("home", False)
    assert {"name": "work", "why": "5h limit (resets Nov 7 01:30)"} in p["skipped"]


def test_rank_beats_priority_and_room_and_names_the_factor():
    accts = [acct("a", priority=80, scopes={"s": 2}), acct("b", priority=10, scopes={"s": 1})]
    p = pick(accts, [row("a", 100), row("b", 20)], "s")
    assert (p["account"], p["factor"]) == ("b", "scope rank")


def test_equal_rank_falls_back_to_the_cdx_order():
    accts = [acct("a", priority=10, scopes={"s": 1}), acct("b", priority=70, scopes={"s": 1})]
    p = pick(accts, [row("a"), row("b", 30)], "s")
    assert (p["account"], p["factor"]) == ("b", "priority")


# ---------- AC2: no rank, never picked ----------

def test_account_without_a_rank_is_never_picked_for_the_scope():
    p = pick(RANKED, [row("work", 0), row("home", 0), row("shared", 100)], "personal")
    assert p["account"] is None
    assert {"name": "shared", "why": "no rank for scope personal"} in p["skipped"]



# ---------- AC3: scope_min_room ----------

def test_min_room_skips_with_a_reason():
    p = pick(RANKED, [row("work", 30, 90), row("home", 0), row("shared", 0)], "personal")
    assert p["account"] is None
    assert {"name": "work", "why": "30% left, under the 40% minimum for scope personal"} in p["skipped"]


def test_min_room_lets_the_account_through_above_the_floor():
    p = pick(RANKED, [row("work", 70), row("home", 0), row("shared", 0)], "personal")
    assert p["account"] == "work"


# ---------- AC4: ask-first and fallback caps unchanged ----------

def test_ask_first_stays_ask_first_inside_a_scope():
    p = pick(RANKED, [row("work", 0), row("home", 0), row("shared", 60)], "work")
    assert (p["account"], p["ask"]) == ("shared", True)


def test_caps_still_block_inside_a_scope():
    capped = [acct("work", scopes={"work": 1}), acct("shared", "ask-first", scopes={"work": 2}, fallback="auto",
                                                      max_5h_pct=50, max_week_pct=50)]
    st = crow_lib.pick_accounts(capped, {"work": row("work", 0), "shared": row("shared", 30)}, "work", NOW, "work")
    assert st["auto_target"] is None  # 70% used is past the shared cap
    st = crow_lib.pick_accounts(capped, {"work": row("work", 0), "shared": row("shared", 80)}, "work", NOW, "work")
    assert st["auto_target"] == "shared"


# ---------- AC6: no scopes key = today ----------

def test_no_scopes_anywhere_ignores_the_scope():
    plain = [acct("a"), acct("b")]
    p = pick(plain, [row("a", 0), row("b", 50)], "personal")
    assert p["account"] == "b" and p["skipped"][0]["name"] == "a"


def test_busy_free_account_still_comes_first_inside_a_rank():
    accts = [acct("a", scopes={"s": 1}), acct("b", scopes={"s": 1})]
    p = pick(accts, [row("a", 90), row("b", 40)], "s", busy={"a"}, default="zzz")
    assert (p["account"], p["factor"]) == ("b", "live session")


# ---------- AC7: json and doctor ----------

SCOPED = """\
default: main
accounts:
  - {name: main, policy: use, memory: permanent, scopes: {work: 1, hub: 1, personal: 2}, scope_min_room: {personal: 40}}
  - {name: spare, policy: use, memory: permanent, scopes: {personal: 1}}
"""


def test_json_and_doctor_show_priority_and_scopes(hub):
    (hub[0] / "local" / "accounts.yaml").write_text(SCOPED)
    data = json.loads(run(hub, "crow-accounts", "json").stdout)
    main = data["accounts"][0]
    assert main["scopes"] == {"work": 1, "hub": 1, "personal": 2}
    assert main["scope_min_room"] == {"personal": 40} and main["priority"] == 0
    assert run(hub, "crow-accounts", "scoped").returncode == 0
    doc = json.loads(run(hub, "crow-doctor", "--json").stdout)
    details = next(c for c in doc["checks"] if c["area"] == "accounts")["details"] if "checks" in doc else []
    assert any("scopes work=1 hub=1 personal=2" in d and "min room personal=40%" in d for d in details)


def test_scoped_is_false_without_scopes(hub):
    assert run(hub, "crow-accounts", "scoped").returncode == 1


# ---------- AC8: dispatch ----------

def _dispatch(tmp_path, monkeypatch, extra=(), state=None):
    import importlib.machinery
    import importlib.util
    (tmp_path / "local").mkdir(exist_ok=True)
    (tmp_path / "local" / "projects.yaml").write_text(
        f"projects:\n  - {{name: demo, scope: personal, path: {tmp_path}}}\n")
    (tmp_path / "bin").mkdir(exist_ok=True)
    monkeypatch.setenv("CROW_HOME", str(tmp_path))
    monkeypatch.setenv("CROW_ACCOUNT", "work")
    loader = importlib.machinery.SourceFileLoader("crow_runs_scope", str(BIN / "crow-runs"))
    spec = importlib.util.spec_from_loader("crow_runs_scope", loader)
    cr = importlib.util.module_from_spec(spec)
    loader.exec_module(cr)
    seen = []

    class R:
        returncode = 0
        stdout = '{"ok": true, "run_id": "r1"}'

    monkeypatch.setattr(cr.subprocess, "run", lambda argv, **k: seen.append(argv) or R())
    monkeypatch.setattr(cr.subprocess, "Popen", lambda *a, **k: None)
    monkeypatch.setattr(cr, "running_runs", list)
    monkeypatch.setattr(cr.crow_lib, "provider_of", lambda acct: "claude")
    monkeypatch.setattr(cr, "sh", lambda *a, **k: "")
    if state:
        monkeypatch.setattr(cr.crow_lib, "account_state",
                            lambda cur, scope=None: crow_lib.pick_accounts(
                                RANKED, {r["session_name"]: r for r in state}, None, NOW, scope))
    monkeypatch.setattr(sys, "argv", ["crow-runs", "dispatch", "demo", "l1", "--prompt", "p", *extra])
    cr.main()
    return next(a for a in seen if a[:2] == ["cdx", "run"])


def test_dispatch_pins_the_admitted_account(tmp_path, monkeypatch):
    assert "--failover" not in _dispatch(tmp_path, monkeypatch)


def test_dispatch_routes_by_the_project_scope(tmp_path, monkeypatch):
    cmd = _dispatch(tmp_path, monkeypatch, state=[row("work"), row("home"), row("shared")])
    assert cmd[2] == "home"  # personal project: the personal rank beats the default account


# ---------- min_room: a floor for every account, scoped or not ----------

def test_min_room_skips_a_nearly_out_account_without_a_scope():
    accts = [acct("rk", priority=90, min_room=10), acct("other", priority=10, min_room=10)]
    p = pick(accts, [row("rk", 80, 4), row("other", 50)], default="rk")
    assert p["account"] == "other"
    assert {"name": "rk", "why": "4% left, under the 10% minimum"} in p["skipped"]


def test_min_room_applies_inside_a_scope_too():
    accts = [acct("rk", scopes={"hub": 1}, min_room=10), acct("other", scopes={"hub": 2}, min_room=10)]
    assert pick(accts, [row("rk", 4), row("other", 50)], "hub")["account"] == "other"


def test_min_room_lets_an_account_at_the_floor_through():
    assert pick([acct("a", min_room=10)], [row("a", 10, 90)])["account"] == "a"


def test_json_carries_min_room_with_the_top_level_default(hub):
    (hub[0] / "local" / "accounts.yaml").write_text(
        "min_room: 10\ndefault: main\naccounts:\n"
        "  - {name: main, policy: use, memory: permanent}\n"
        "  - {name: spare, policy: use, memory: permanent, min_room: 25}\n"
        "  - {name: bad, policy: use, memory: permanent, min_room: lots}\n")
    rooms = {a["name"]: a["min_room"] for a in json.loads(run(hub, "crow-accounts", "json").stdout)["accounts"]}
    assert rooms == {"main": 10, "spare": 25, "bad": None}
