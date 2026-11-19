"""Script JSON contract (item_173): every deck/core script prints a versioned payload that matches its schema.

Each script runs offline against a throwaway hub with a fake cdx on PATH; its output is validated against
logics/specs/script_contract/schemas. The committed fixtures match the same schemas, and renaming or removing
any required field of a fixture fails validation, so a script that drops a field the app reads fails here.
"""
import importlib.machinery
import importlib.util
import json
import os
import stat
import subprocess
import time

import pytest
from conftest import BIN, REPO, run
from schema_lite import Validator

SPEC = REPO / "logics" / "specs" / "script_contract"
SCHEMAS = SPEC / "schemas"
FIX = SPEC / "fixtures"
PAYLOADS = ["accounts", "checks", "mrs", "ready", "registry", "runs", "sessions", "today", "usage", "usage_summary"]

STATUS = {"rows": [
    {"session_name": "main", "provider": "claude", "remaining_5h_pct": 80, "reset_5h_at": "Jan 1 12:00",
     "remaining_week_pct": 60, "reset_week_at": "Jan 4 09:00", "active": True},
    {"session_name": "spare", "provider": "claude", "remaining_5h_pct": 100, "reset_5h_at": "Jan 1 14:00",
     "remaining_week_pct": 90, "reset_week_at": "Jan 6 09:00", "active": False},
]}


def load(p):
    return json.loads(p.read_text())


def errors(name, instance):
    return Validator(load(SCHEMAS / f"{name}.schema.json"), SCHEMAS).errors(instance)


@pytest.fixture
def env(tmp_path):
    """PATH with a fake cdx (status rows, no runs, no configs) and a failing rtk: no real account is read."""
    d = tmp_path / "fakebin"
    d.mkdir()
    cdx = d / "cdx"
    cdx.write_text("#!/bin/sh\ncase \"$1\" in\n"
                   f"  status) cat <<'EOF'\n{json.dumps(STATUS)}\nEOF\n;;\n"
                   "  runs) echo '{\"runs\": []}' ;;\n"
                   "  configs) echo '{\"sessions\": []}' ;;\n"
                   "  *) echo '{}' ;;\nesac\n")
    rtk = d / "rtk"
    rtk.write_text("#!/bin/sh\nexit 1\n")
    for f in (cdx, rtk):
        f.chmod(f.stat().st_mode | stat.S_IEXEC)
    return {"PATH": f"{d}:/usr/bin:/bin", "CROW_TITLES_PER_DAY": "0"}


def registered(hub, tmp_path):
    """One registered project: a git repo on a branch."""
    repo = tmp_path / "proj"
    repo.mkdir()
    for cmd in (["init", "-q", "-b", "main"], ["config", "user.email", "dev@example.com"],
                ["config", "user.name", "Dev"], ["commit", "-q", "--allow-empty", "-m", "init"]):
        subprocess.run(["git", "-C", str(repo), *cmd], check=True, capture_output=True)
    (hub[0] / "local" / "projects.yaml").write_text(
        "identities: {personal: dev@example.com}\n"
        f"projects:\n  - {{name: proj, scope: personal, forge: github, remote: dev/proj, path: {repo}}}\n")


def out_of(r):
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


def module(name, path):
    loader = importlib.machinery.SourceFileLoader(name, str(path))
    spec = importlib.util.spec_from_loader(name, loader)
    mod = importlib.util.module_from_spec(spec)
    loader.exec_module(mod)
    return mod


def test_every_payload_has_a_schema_and_a_fixture():
    assert sorted(p.name.removesuffix(".schema.json") for p in SCHEMAS.glob("*.schema.json")) == \
        sorted(PAYLOADS + ["action"])
    assert sorted(p.stem for p in FIX.glob("*.json")) == sorted(PAYLOADS + ["action_ok", "action_refused"])


@pytest.mark.parametrize("name", PAYLOADS)
def test_fixture_matches_schema(name):
    assert not errors(name, load(FIX / f"{name}.json"))


def required_paths(schema, instance, path=()):
    """(path, key) of every required field the fixture holds, nested objects and first array items included."""
    if isinstance(instance, list):
        if instance and "items" in schema:
            yield from required_paths(schema["items"], instance[0], path + (0,))
        return
    if not isinstance(instance, dict):
        return
    for k in schema.get("required", []):
        yield path, k
        sub = schema.get("properties", {}).get(k)
        if sub and k in instance:
            yield from required_paths(sub, instance[k], path + (k,))


def mutate(instance, path, key, rename):
    doc = json.loads(json.dumps(instance))
    node = doc
    for p in path:
        node = node[p]
    value = node.pop(key)
    if rename:
        node[key + "_renamed"] = value
    return doc


@pytest.mark.parametrize("name", PAYLOADS + ["action"])
def test_renamed_or_removed_field_fails(name):
    schema = load(SCHEMAS / f"{name}.schema.json")
    fixture = load(FIX / ("action_ok.json" if name == "action" else f"{name}.json"))
    paths = list(required_paths(schema, fixture))
    assert len(paths) >= 3
    for path, key in paths:
        for rename in (False, True):
            assert errors(name, mutate(fixture, path, key, rename)), f"{name}: {'/'.join(map(str, path + (key,)))}"


# ----- the scripts themselves, offline -----

def test_accounts(hub, env):
    d = out_of(run(hub, "crow-accounts", "json", env=env))
    assert d["schema"] == 1 and d["accounts"]
    assert not errors("accounts", d)


def test_ready(hub, env):
    d = out_of(run(hub, "crow-ready", "json", env=env))
    assert d["schema"] == 1 and d["items"] == []
    assert not errors("ready", d)


def test_registry(hub, tmp_path, env):
    registered(hub, tmp_path)
    d = out_of(run(hub, "crow-registry", "json", env=env))
    assert [p["name"] for p in d["projects"]] == ["proj"]
    assert not errors("registry", d)


def test_sessions(hub, env):
    d = out_of(run(hub, "crow-sessions", "list", "--json", env=env))
    assert d["schema"] == 1
    assert not errors("sessions", d)


def test_checks(hub, env):
    d = out_of(run(hub, "crow-checks", "json", "--now", "2026-01-05T09:00:00", env=env))
    assert not errors("checks", d)


def test_runs_reads_the_ledger(hub, env):
    led = hub[0] / "local" / "state" / "runs.jsonl"
    led.write_text("")
    d = out_of(run(hub, "crow-runs", "json", env=env))
    assert d["slots"]["busy"] == 0
    assert not errors("runs", d)
    assert "runs.jsonl" in (BIN / "crow-runs").read_text().split('"""')[1]


def test_usage_full_and_summary(hub, env):
    full = out_of(run(hub, "crow-usage", "--json", env=env))
    assert not errors("usage", full)
    r = run(hub, "crow-usage", "--json", "--summary", env=env)
    small = out_of(r)
    assert not errors("usage_summary", small)
    assert len(r.stdout.encode()) < 5000
    assert [(a["account"], a["remaining_5h_pct"], a["reset_5h_at"], a["remaining_week_pct"]) for a in small["accounts"]] \
        == [(lim["account"], lim["remaining_5h_pct"], lim["reset_5h_at"], lim["remaining_week_pct"]) for lim in full["limits"]]


def test_usage_summary_sums_today_per_account():
    cu = module("crow_usage_contract", BIN / "crow-usage")
    data = {"generated_at": "t", "limits": [{"account": "main", "remaining_5h_pct": 50}, {"account": "spare"}],
            "today": {"cost_usd": 3.0, "tokens": 30, "sessions": 2, "cache_pct": 90,
                      "by_model": [{"name": "big", "cost_usd": 2.5, "tokens": 20, "sessions": 1, "extra": 1}]},
            "sessions": [
                {"account": "main", "today": {"cost_usd": 2.5, "tokens": 20, "by_model": {"big": {"cost_usd": 2.5}}}},
                {"account": "main", "today": {"cost_usd": 0.5, "tokens": 10, "by_model": {"small": {"cost_usd": 0.5}}}},
                {"account": "main", "today": None}]}
    s = cu.summary(data)
    assert s["accounts"][0]["today"] == {"cost_usd": 3.0, "tokens": 30, "sessions": 2}
    assert s["accounts"][0]["model"] == "big"
    assert s["accounts"][1]["today"]["sessions"] == 0 and s["accounts"][1]["model"] is None
    assert s["today"]["by_model"] == [{"name": "big", "cost_usd": 2.5, "tokens": 20, "sessions": 1}]


def test_mrs_cache(hub, monkeypatch, tmp_path):
    monkeypatch.setenv("CROW_HOME", str(hub[0]))
    cm = module("crow_mrs_contract", BIN / "crow-mrs")
    calls = []
    payload = load(FIX / "mrs.json")
    payload.pop("schema")

    def build():
        calls.append(1)
        return payload

    first = json.loads(cm.cached_list(build=build))
    assert first["schema"] == 1 and not errors("mrs", first)
    t = time.perf_counter()
    assert json.loads(cm.cached_list(build=build)) == first
    assert time.perf_counter() - t < 0.2
    assert len(calls) == 1
    cm.cached_list(force=True, build=build)
    assert len(calls) == 2
    old = time.time() - cm.CACHE_TTL - 1
    os.utime(cm.cache_file(), (old, old))
    cm.cached_list(build=build)
    assert len(calls) == 3


def test_mrs_cached_call_is_fast(hub, env):
    state = hub[0] / "local" / "state"
    (state / "mrs.json").write_text(json.dumps(load(FIX / "mrs.json")))
    t = time.perf_counter()
    d = out_of(run(hub, "crow-mrs", "json", env=env))
    assert time.perf_counter() - t < 1.0  # whole process start; the cache read itself is checked above
    assert not errors("mrs", d)


def test_today_json_carries_the_schema(hub, monkeypatch):
    monkeypatch.setenv("CROW_HOME", str(hub[0]))
    ct = module("crow_today_contract", BIN / "crow-today")
    body = load(FIX / "today.json")
    body.pop("schema")
    monkeypatch.setattr(ct, "conf", dict)
    monkeypatch.setattr(ct, "fetch", lambda c: body)
    monkeypatch.setattr(ct.sys, "argv", ["crow-today", "json", "-f"])
    printed = []
    monkeypatch.setattr("builtins.print", lambda s, *a, **k: printed.append(s))
    ct.main()
    assert not errors("today", json.loads(printed[0]))


# ----- action results -----

def action_of(r, code):
    assert r.returncode == code, (r.stdout, r.stderr)
    d = json.loads(r.stdout)
    assert not errors("action", d), d
    assert d["code"] == code and d["ok"] is (code == 0)
    return d


def test_focus_stop_refuses_a_pid_that_is_not_claude(hub, env):
    d = action_of(run(hub, "crow-focus", "--pid", "1", "--stop", "--json", env=env), 1)
    assert d["action"] == "stop" and d["target"] == "1"


def test_focus_without_pid_is_an_error(hub, env):
    d = action_of(run(hub, "crow-focus", "--interrupt", "--json", env=env), 2)
    assert d["action"] == "interrupt"


def test_focus_send_dry_run(hub, env):
    r = run(hub, "crow-focus", "--pid", "1", "--send", "hello", "--dry-run", "--json",
            env={**env, "CROW_TERMINAL": "print"})
    d = json.loads(r.stdout.splitlines()[-1])
    assert not errors("action", d) and d["action"] == "send"


def test_runs_stop_unknown_run_is_refused(hub, env):
    d = action_of(run(hub, "crow-runs", "stop", "nope", "--json", env=env), 1)
    assert d["action"] == "stop" and "0 running runs" in d["message"]


def test_runs_stop_plain_call_still_works_for_core(hub, env):
    r = run(hub, "crow-runs", "stop", "nope", env=env)
    assert r.returncode == 1 and "0 running runs" in r.stderr


def test_prompt_answer_without_a_pending_prompt_is_refused(hub, env):
    d = action_of(run(hub, "crow-prompt", "answer", "--pid", "1", "--prompt", "x", "--option", "allow", "--json",
                      env=env), 1)
    assert d["action"] == "answer" and d["target"] == "1"

def test_today_action_without_graph_is_an_error(hub, env):
    d = action_of(run(hub, "crow-today", "done", "m1", "--json", env=env), 2)
    assert d["action"] == "done" and d["target"] == "m1"
    d = action_of(run(hub, "crow-today", "snooze", "--json", env=env), 1)
    assert d["action"] == "snooze"


@pytest.mark.parametrize("name", ["action_ok", "action_refused"])
def test_action_fixtures(name):
    assert not errors("action", load(FIX / f"{name}.json"))
