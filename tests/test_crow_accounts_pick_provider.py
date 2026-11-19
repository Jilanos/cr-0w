"""crow-accounts pick for the butler (item_268): auto must skip accounts whose runner cannot drive it."""
import json
import re

import pytest
import yaml
from conftest import BIN, run

FAKE_CDX = r"""#!/usr/bin/env python3
import json, os, sys
state = json.load(open(os.environ["FAKE_STATE"]))
cmd = sys.argv[1:2]
if cmd == ["status"]:
    print(json.dumps({"rows": state["rows"]}))
elif cmd == ["sessions"]:
    print(json.dumps({"sessions": []}))
elif cmd == ["configs"]:
    print(json.dumps({"sessions": []}))
"""


def butler_pick_args():
    """The crow-accounts arguments crow-core's butler runs for the auto account."""
    src = (BIN.parent / "tools/crow-core/butler_cmd.go").read_text()
    return re.findall(r'"([^"]+)"', re.search(r"butlerPickArgs = \[\]string\{([^}]*)\}", src).group(1))


def row(name, provider, left=80):
    return {"session_name": name, "provider": provider, "enabled": True, "auth_status": "authenticated",
            "remaining_5h_pct": left, "remaining_week_pct": left}


@pytest.fixture
def pick(hub, tmp_path):
    home, _ = hub
    d = tmp_path / "fakebin"
    d.mkdir()
    (d / "cdx").write_text(FAKE_CDX)
    (d / "cdx").chmod(0o755)
    state = tmp_path / "state.json"
    env = {"PATH": f"{d}:/usr/bin:/bin", "FAKE_STATE": str(state)}

    def go(accounts, rows, *args):
        (home / "local/accounts.yaml").write_text(yaml.safe_dump({"default": accounts[0], "accounts": [
            {"name": n, "policy": "use"} for n in accounts]}))
        state.write_text(json.dumps({"rows": rows}))
        return run(hub, "crow-accounts", *args, env=env)
    return go


def test_pick_without_a_provider_takes_the_codex_account_first(pick):
    r = pick(["cx", "cl"], [row("cx", "codex"), row("cl", "claude")], "pick", "--on-busy", "fail")
    assert r.returncode == 0, r.stderr
    assert r.stdout.split()[-1] == "cx"


def test_butler_pick_skips_a_codex_account_first_in_the_policy(pick):
    r = pick(["cx", "cl", "cl2"], [row("cx", "codex"), row("cl", "claude", 50), row("cl2", "claude", 40)],
             *butler_pick_args())
    assert r.returncode == 0, r.stderr
    assert r.stdout.split()[-1] == "cl"
    assert "cx: runs codex" in r.stderr


def test_butler_pick_keeps_policy_order_among_claude_accounts(pick):
    r = pick(["cl", "cx", "cl2"], [row("cl", "claude", 0), row("cx", "codex"), row("cl2", "claude")],
             *butler_pick_args())
    assert r.returncode == 0, r.stderr
    assert r.stdout.split()[-1] == "cl2"


def test_butler_pick_with_only_codex_accounts_fails_with_the_reason(pick):
    r = pick(["cx", "cx2"], [row("cx", "codex"), row("cx2", "codex")], *butler_pick_args())
    assert r.returncode == 1 and r.stdout == ""
    assert "no allowed account runs claude" in r.stderr and "cx2: runs codex" in r.stderr


def test_unknown_provider_is_a_usage_error(pick):
    r = pick(["cl"], [row("cl", "claude")], "pick", "--provider", "gemini")
    assert r.returncode == 1 and "crow-accounts pick" in r.stderr
