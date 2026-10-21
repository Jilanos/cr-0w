import json

from conftest import run


def test_policy_of_known_unknown_and_mistyped_accounts(hub):
    assert run(hub, "crow-accounts", "policy", "main").stdout.strip() == "use"
    assert run(hub, "crow-accounts", "policy", "shared").stdout.strip() == "ask-first"
    assert run(hub, "crow-accounts", "policy", "mate").stdout.strip() == "never"
    assert run(hub, "crow-accounts", "policy", "nobody").stdout.strip() == "never"
    # a policy outside use / ask-first / never must never open an account
    assert run(hub, "crow-accounts", "policy", "typo").stdout.strip() == "never"


def test_allowed_lists_only_use_and_ask_first(hub):
    assert run(hub, "crow-accounts", "allowed").stdout.split() == ["main", "shared", "spare"]


def test_require_refuses_never_and_unknown(hub):
    assert run(hub, "crow-accounts", "require", "main").returncode == 0
    assert run(hub, "crow-accounts", "require", "shared").returncode == 0
    for name in ("mate", "typo", "nobody"):
        r = run(hub, "crow-accounts", "require", name)
        assert r.returncode == 1 and "not allowed" in r.stderr


def test_default_memory_and_json(hub):
    assert run(hub, "crow-accounts", "default").stdout.strip() == "main"
    assert run(hub, "crow-accounts", "memory", "shared").stdout.strip() == "session"
    assert run(hub, "crow-accounts", "memory", "mate").stdout.strip() == "none"
    data = json.loads(run(hub, "crow-accounts", "json").stdout)
    assert data["default"] == "main"
    assert [(a["name"], a["policy"]) for a in data["accounts"]] == [
        ("main", "use"), ("shared", "ask-first"), ("mate", "never"), ("typo", "never"),
        ("spare", "use")]


def test_missing_file_is_an_error(hub):
    (hub[0] / "local" / "accounts.yaml").unlink()
    r = run(hub, "crow-accounts", "default")
    assert r.returncode == 1 and "missing" in r.stderr


def test_crow_launcher_refuses_a_never_account(hub):
    r = run(hub, "crow", "hub", env={"CROW_ACCOUNT": "mate"})
    assert r.returncode == 1 and "not allowed" in r.stderr
