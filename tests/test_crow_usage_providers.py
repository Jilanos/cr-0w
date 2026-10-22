"""Provider-aware usage accounting (item 2.5): Codex cumulative snapshots counted once, cached and
reasoning subsets never billed twice, unknown prices and quotas null with provenance."""
import datetime as dt
import json
import sys

import pytest

from conftest import BIN, mixed, run, write_jsonl

sys.path.insert(0, str(BIN))
import crow_prices  # noqa: E402

TODAY = dt.date.today().isoformat()


def ts(h, m=0):
    """Today at local hour h, as UTC Z (crow-usage files tokens under the local day)."""
    t = dt.datetime.combine(dt.date.today(), dt.time(h, m)).astimezone().astimezone(dt.timezone.utc)
    return t.strftime("%Y-%m-%dT%H:%M:%S.000Z")


def snap(t, inp, cached, out, reasoning):
    return {"timestamp": t, "type": "event_msg", "payload": {"type": "token_count", "info": {
        "total_token_usage": {"input_tokens": inp, "cached_input_tokens": cached, "output_tokens": out,
                              "reasoning_output_tokens": reasoning, "total_tokens": inp + out},
        "last_token_usage": {"input_tokens": 1, "cached_input_tokens": 0, "output_tokens": 1}}}}


def codex_rollout(hub, account, name, model, snaps, cwd="/w/hub", sid="01a1-cx"):
    write_jsonl(hub[1] / account / "sessions/2026/10/22" / f"rollout-{name}.jsonl", [
        {"timestamp": ts(9), "type": "session_meta", "payload": {"id": sid, "cwd": cwd, "source": "cli"}},
        {"timestamp": ts(9), "type": "turn_context", "payload": {"model": model, "cwd": cwd}},
        {"timestamp": ts(9), "type": "event_msg", "payload": {"type": "item_completed", "item": {
            "type": "UserMessage", "content": [{"type": "text", "text": "do it"}]}}},
        *snaps])


def claude_session(hub, sid="c1"):
    msg = {"id": "m1", "role": "assistant", "model": "claude-haiku-5-5", "content": [{"type": "text", "text": "ok"}],
           "usage": {"input_tokens": 1_000_000, "output_tokens": 1_000_000}}
    write_jsonl(hub[1] / "main/claude-home/.claude/projects/-w-hub" / f"{sid}.jsonl", [
        {"type": "user", "cwd": "/w/hub", "timestamp": ts(8), "message": {"role": "user", "content": "go"}},
        {"type": "assistant", "cwd": "/w/hub", "timestamp": ts(8, 1), "message": msg},
        {"type": "assistant", "cwd": "/w/hub", "timestamp": ts(8, 1), "message": msg},   # same response twice
    ])


def usage(hub, env=None):
    r = run(hub, "crow-usage", "--json", env={"CROW_TITLES_OFF": "1", **(env or {})})
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


@pytest.fixture
def mixed_usage(hub, fake_cdx):
    mixed(hub)
    (hub[0] / "local/projects.yaml").write_text("projects:\n  - {name: hub, path: /w/hub}\n")
    claude_session(hub)
    codex_rollout(hub, "cx", "a", "gpt-6.1-sol", [
        snap(ts(10), 1000, 600, 100, 40),
        snap(ts(10, 1), 1000, 600, 100, 40),          # repeated snapshot: adds nothing
        snap(ts(11), 3000, 2000, 300, 90),            # +2000 in (1400 cached), +200 out (50 reasoning)
    ])
    return hub, fake_cdx


def test_hand_calculated_mixed_totals_are_stable_across_collections(mixed_usage):
    hub, (env, calls, _) = mixed_usage
    first = usage(hub, env)
    again = usage(hub, env)
    for data in (first, again):
        s = {x["provider"]: x for x in data["sessions"]}
        cx, cl = s["codex"], s["claude"]
        # Codex: 3000 input of which 2000 cached -> 1000 uncached; 300 output of which 90 reasoning
        assert (cx["input_tokens"], cx["cache_read_tokens"], cx["output_tokens"]) == (1000, 2000, 300)
        assert cx["reasoning_tokens"] == 90 and cx["tokens"] == 3300
        assert cx["identity"] == "codex:cx:01a1-cx" and cx["account"] == "cx"
        assert cl["tokens"] == 2_000_000 and cl["reasoning_tokens"] is None   # the duplicate counted once
        today = data["today"]
        assert today["tokens"] == 2_003_300
        prov = {p["name"]: p for p in today["by_provider"]}
        assert prov["codex"]["tokens"] == 3300 and prov["claude"]["tokens"] == 2_000_000
        assert {p["name"]: p["tokens"] for p in today["by_project"]} == {"hub": 2_003_300}
    # Codex at gpt-6.1-sol list price: 1000*2 + 2000*0.1 + 300*10 per million
    assert cx["cost_usd"] == pytest.approx((1000 * 2 + 2000 * 0.1 + 300 * 10) / 1e6, abs=1e-4)
    assert cl["cost_usd"] == pytest.approx(0.60)


def test_unknown_model_cost_stays_null_and_marks_partial_coverage(hub, fake_cdx):
    mixed(hub)
    claude_session(hub)
    codex_rollout(hub, "cx", "u", "gpt-unreleased", [snap(ts(10), 500, 0, 50, 0)])
    data = usage(hub, fake_cdx[0])
    cx = next(s for s in data["sessions"] if s["provider"] == "codex")
    assert cx["cost_usd"] is None and cx["tokens"] == 550
    today = data["today"]
    assert today["unpriced"] == 1 and today["cost_complete"] is False
    assert today["cost_usd"] == pytest.approx(0.60)                       # the priced part, flagged partial
    assert {p["name"]: p["cost_usd"] for p in today["by_provider"]} == {"claude": 0.6, "codex": None}
    assert data["week"]["cost_complete"] is False


def test_a_day_with_only_unpriced_usage_has_unknown_cost_not_zero(hub, fake_cdx):
    mixed(hub)
    codex_rollout(hub, "cx", "u", "gpt-unreleased", [snap(ts(10), 500, 0, 50, 0)])
    data = usage(hub, fake_cdx[0])
    assert data["today"]["cost_usd"] is None and data["today"]["tokens"] == 550


def test_codex_never_gets_claude_routing_or_prices():
    assert crow_prices.rates("gpt-unreleased") is None
    assert crow_prices.estimate_cost({"input_tokens": 1}, "gpt-unreleased") is None
    assert crow_prices.provider_of("claude-opus-5-5[1m]") == "claude"
    assert crow_prices.provider_of("gpt-6.1-sol") == "codex"
    u = crow_prices.codex_usage({"input_tokens": 100, "cached_input_tokens": 70, "output_tokens": 20,
                                 "reasoning_output_tokens": 5})
    assert u == {"input_tokens": 30, "cache_read_tokens": 70, "cache_creation_tokens": 0, "output_tokens": 20,
                 "reasoning_tokens": 5}


def test_counter_reset_counts_from_zero_and_repeats_add_nothing():
    a = {"input_tokens": 100, "cached_input_tokens": 0, "output_tokens": 10}
    assert crow_prices.codex_delta(a, a)["input_tokens"] == 0
    assert crow_prices.codex_delta(a, {"input_tokens": 40, "output_tokens": 4})["input_tokens"] == 40
    assert crow_prices.codex_delta(None, a)["output_tokens"] == 10


def test_limits_carry_provider_window_labels_and_cached_provenance(mixed_usage):
    hub, (env, calls, _) = mixed_usage
    data = usage(hub, env)
    lim = {l["account"]: l for l in data["limits"]}
    assert lim["cx"]["provider"] == "codex" and lim["main"]["provider"] == "claude"
    assert lim["cx"]["windows"] == {"five_hour": "codex 5h", "week": "codex week"}
    assert lim["cx"]["source"] == "cdx status --cached" and lim["cx"]["updated_at"]
    assert "ag" not in lim                                     # a provider crow does not drive
    status_calls = [c["argv"] for c in calls() if c["argv"][0] == "status"]
    assert status_calls and all("--cached" in a for a in status_calls)
    assert not [c for c in calls() if c["argv"][0] in ("auth", "login") or "--refresh" in c["argv"]]
    assert data["schema_version"] == 2 and data["prices"]["kind"].startswith("list-price")


def test_legacy_frozen_days_are_kept_and_not_relabelled(hub, fake_cdx):
    mixed(hub)
    claude_session(hub)
    old = (dt.date.today() - dt.timedelta(days=3)).isoformat()
    legacy = {"cost_usd": 1.5, "tokens": 900, "sessions": 2, "unpriced": 0, "by_project": [], "by_model": [],
              "tools": [], "attribution": "touched"}
    store = hub[0] / "local/state/usage-days.json"
    store.parent.mkdir(parents=True, exist_ok=True)
    store.write_text(json.dumps({old: legacy}))
    data = usage(hub, fake_cdx[0])
    day = next(d for d in data["days"] if d["date"] == old)
    assert day["tokens"] == 900 and "by_provider" not in day
    assert data["week"]["legacy_days"] == 1
    assert {p["name"] for p in data["week"]["by_provider"]} == {"claude"}   # today's Claude only, legacy not relabelled
    assert json.loads(store.read_text())[old] == legacy
