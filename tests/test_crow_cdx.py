"""The cdx boundary and provider-aware account policy (item 2.1), against tests/fakecdx."""
import importlib
import json
import os
import sys

import pytest

from conftest import BIN, REPO, mixed, run

sys.path.insert(0, str(BIN))
import crow_cdx  # noqa: E402
from crow_cdx import CdxError  # noqa: E402


@pytest.fixture
def cdx_env(fake_cdx, monkeypatch, hub):
    env, calls, state = fake_cdx
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    monkeypatch.delenv("CROW_ACCOUNT", raising=False)
    monkeypatch.delenv("CROW_CDX", raising=False)
    crow_cdx._caps.clear()
    yield calls
    crow_cdx._caps.clear()


def resolve(hub, account=None, provider=None, env=None):
    cfg = crow_cdx.load_policy(str(hub[0]))
    return crow_cdx.resolve(account, provider, cfg=cfg, env=env or {})


def test_legacy_claude_only_config_resolves_the_same_default(hub, cdx_env):
    t = resolve(hub)
    assert (t["name"], t["provider"], t["policy"]) == ("main", "claude", "use")
    assert resolve(hub, env={"CROW_ACCOUNT": "spare"})["name"] == "spare"


def test_mixed_config_resolves_both_providers_and_explicit_wins(hub, cdx_env):
    mixed(hub)
    assert resolve(hub, provider="claude")["name"] == "main"       # default matches
    assert resolve(hub, provider="codex")["name"] == "cx"          # first `use` codex account
    assert resolve(hub, "cx")["provider"] == "codex"
    assert resolve(hub, "cx", env={"CROW_ACCOUNT": "main"})["name"] == "cx"   # argument over env
    assert resolve(hub, "cxshared", "codex")["policy"] == "ask-first"


@pytest.mark.parametrize("account,provider,code", [
    ("mate", None, "account_never"),
    ("typo", None, "account_never"),
    ("nobody", None, "account_unknown"),
    ("cxoff", None, "account_disabled"),
    ("ag", None, "provider_unsupported"),
    ("liar", None, "provider_mismatch"),      # declared codex, cdx says claude
    ("main", "codex", "provider_mismatch"),
    (None, "gemini", "provider_unknown"),
])
def test_bad_targets_fail_before_any_launch(hub, cdx_env, account, provider, code):
    mixed(hub)
    with pytest.raises(CdxError) as e:
        resolve(hub, account, provider)
    assert e.value.code == code
    assert not [c for c in cdx_env() if c["argv"][0] in ("run", "handoff") or c["argv"][0] in ("main", "cx")]


def test_provider_alone_never_picks_an_ask_first_account(hub, cdx_env):
    (hub[0] / "local/accounts.yaml").write_text(
        "default: main\naccounts:\n  - {name: main, policy: use}\n  - {name: cxshared, policy: ask-first}\n")
    with pytest.raises(CdxError) as e:
        resolve(hub, provider="codex")
    assert e.value.code == "no_allowed_account"


@pytest.mark.parametrize("mode,code", [
    ("notjson", "cdx_not_json"), ("oldschema", "cdx_schema_unsupported"), ("fail", "cdx_error")])
def test_broken_envelopes_are_actionable_errors(hub, cdx_env, monkeypatch, mode, code):
    monkeypatch.setenv("FAKE_CDX_MODE", mode)
    with pytest.raises(CdxError) as e:
        crow_cdx.inventory()
    assert e.value.code == code and "cdx status" in e.value.message


def test_missing_cli_timeout_and_old_version(hub, cdx_env, monkeypatch):
    monkeypatch.setenv("CROW_CDX", "/nonexistent/cdx")
    with pytest.raises(CdxError) as e:
        crow_cdx.inventory()
    assert e.value.code == "cdx_missing"
    monkeypatch.delenv("CROW_CDX")
    monkeypatch.setenv("FAKE_CDX_MODE", "sleep")
    with pytest.raises(CdxError) as e:
        crow_cdx.call("status", "--cached", timeout=1)
    assert e.value.code == "cdx_timeout"
    monkeypatch.delenv("FAKE_CDX_MODE")
    monkeypatch.setenv("FAKE_CDX_VERSION", "0.20.9")
    with pytest.raises(CdxError) as e:
        crow_cdx.capabilities()
    assert e.value.code == "cdx_too_old"


def test_capabilities_through_a_node_entrypoint(hub, cdx_env, monkeypatch, tmp_path):
    """cdx-manager ships a Node launcher: the boundary only runs it, never imports it."""
    if not any(os.access(os.path.join(p, "node"), os.X_OK) for p in os.environ["PATH"].split(":")):
        pytest.skip("node not installed")
    monkeypatch.setenv("CROW_CDX", str(REPO / "tests" / "fakecdx-node"))
    caps = crow_cdx.capabilities()
    assert caps["version"] == "0.21.5" and {"claude", "codex"} <= set(caps["providers"])
    assert "cdx_manager" not in sys.modules
    for script in ("crow_cdx.py", "crow-usage", "crow-runs", "crow-retro", "crow-relaunch"):
        assert "import cdx_manager" not in (BIN / script).read_text() and "from cdx_manager" not in (BIN / script).read_text()


def test_ask_first_consent_names_the_exact_account_and_is_never_reused(hub, cdx_env, tmp_path):
    mixed(hub)
    t = resolve(hub, "cxshared")
    state = str(tmp_path / "st")
    with pytest.raises(CdxError) as e:
        crow_cdx.consent(t, "dispatch", assume="shared", state=state)
    assert e.value.code == "consent_mismatch"
    with pytest.raises(CdxError) as e:
        crow_cdx.consent(t, "dispatch", ask=lambda p: None, state=state)
    assert e.value.code == "consent_required"
    with pytest.raises(CdxError):
        crow_cdx.consent(t, "dispatch", ask=lambda p: "y", state=state)
    assert crow_cdx.consent(t, "dispatch", ask=lambda p: "yes\n", state=state)
    log = [json.loads(l) for l in open(os.path.join(state, "consents.jsonl"))]
    assert log == [dict(log[0], account="cxshared", provider="codex", action="dispatch", how="typed")]
    # a grant is not remembered: the next launch asks again
    with pytest.raises(CdxError):
        crow_cdx.consent(t, "dispatch", ask=lambda p: None, state=state)
    assert crow_cdx.consent(resolve(hub, "cx"), "dispatch", ask=lambda p: None, state=state)


def test_resolve_cli(hub, fake_cdx):
    env = fake_cdx[0]
    mixed(hub)
    r = run(hub, "crow-accounts", "resolve", "--provider", "codex", "--shell", env=env)
    assert r.returncode == 0 and r.stdout.split() == ["cx", "codex", "none"], r.stderr
    r = run(hub, "crow-accounts", "resolve", "--account", "mate", env=env)
    assert r.returncode == 1 and "policy never" in r.stderr
    r = run(hub, "crow-accounts", "resolve", "--account", "cxshared", env=env)
    assert r.returncode == 1 and "--confirm-account cxshared" in r.stderr
    r = run(hub, "crow-accounts", "resolve", "--account", "cxshared", "--confirm-account", "cxshared", env=env)
    assert r.returncode == 0 and json.loads(r.stdout)["provider"] == "codex"
    data = json.loads(run(hub, "crow-accounts", "providers", env=env).stdout)
    ag = next(a for a in data["accounts"] if a["name"] == "ag")
    assert ag["supported"] is False


def test_model_names_do_not_cross_providers():
    assert crow_cdx.check_model("codex", "gpt-6.1-sol") == "gpt-6.1-sol"
    assert crow_cdx.check_model("claude", "Opus") == "Opus"
    for prov, model in (("codex", "Opus"), ("codex", "claude-haiku-5-5"), ("claude", "gpt-6.1-sol")):
        with pytest.raises(CdxError) as e:
            crow_cdx.check_model(prov, model)
        assert e.value.code == "model_provider_mismatch"


def test_example_accounts_file_parses_and_declares_both_providers(tmp_path):
    home = tmp_path / "h"
    (home / "local").mkdir(parents=True)
    (home / "local/accounts.yaml").write_text((REPO / "docs/accounts.example.yaml").read_text())
    cfg = crow_cdx.load_policy(str(home))
    assert {a["provider"] for a in cfg["accounts"]} >= {"claude", "codex"}
