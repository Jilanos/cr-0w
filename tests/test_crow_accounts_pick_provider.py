"""crow-accounts pick for the butler (item_268): auto must skip accounts whose runner cannot drive it."""
import json

import pytest
import yaml
from conftest import run

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
        return run(hub, "crow-accounts", "pick", "--on-busy", "fail", *args, env=env)
    return go


def test_butler_pick_without_a_provider_takes_the_codex_account_first(pick):
    r = pick(["cx", "cl"], [row("cx", "codex"), row("cl", "claude")])
    assert r.returncode == 0, r.stderr
    assert r.stdout.split()[-1] == "cx"
