"""crow_lib.modules and `crow modules`: adr_002 defaults, crow.yaml switches and config, errors.

The cases in fixtures/modules are shared with the Go loader (config.Modules)."""
import json
import os
import sys
from pathlib import Path

import pytest
from conftest import BIN, run

sys.path.insert(0, str(BIN))
import crow_lib

ROOT = BIN.parent
CASES = Path(__file__).parent / "fixtures" / "modules"


def result(home):
    st = crow_lib.load_modules(str(home), str(ROOT))
    on = sorted(n for n, m in st["modules"].items() if m["on"])
    return {"on": on, "config": {n: st["modules"][n]["config"] for n in on},
            "errors": sorted(e["key"] for e in st["errors"])}


@pytest.mark.parametrize("case", sorted(p.name for p in CASES.iterdir() if p.is_dir()))
def test_shared_fixture_cases(case):
    want = json.loads((CASES / case / "want.json").read_text())
    assert result(CASES / case / "home") == want


def test_modules_returns_the_config_of_on_bricks(tmp_path):
    on = crow_lib.modules(str(tmp_path), str(ROOT))
    assert "design" not in on and "integration-shell" not in on
    assert on["nest"] == {"core_url": "http://127.0.0.1:8787"}


def test_errors_name_the_file_and_key():
    home = CASES / "errors" / "home"
    st = crow_lib.load_modules(str(home), str(ROOT))
    by_key = {e["key"]: e for e in st["errors"]}
    assert by_key["modules.billing"]["file"] == os.path.join(str(home), "crow.yaml")
    assert "unknown brick" in by_key["modules.billing"]["error"]
    assert "requires core-api" in by_key["modules.nest"]["error"]
    assert "core is always on" in by_key["modules.core"]["error"]


def test_crow_modules_json_lists_the_defaults_without_crow_yaml(hub):
    out = run(hub, "crow", "modules", "json")
    assert out.returncode == 0, out.stderr
    r = json.loads(out.stdout)
    assert r["exists"] is False and r["errors"] == []
    assert r["file"].endswith(os.path.join("local", "crow.yaml"))
    state = {m["name"]: m["on"] for m in r["modules"]}
    assert state["core"] and state["git"] and not state["design"] and not state["integration-shell"]


def test_crow_modules_text_marks_a_switched_brick(hub):
    home, _ = hub
    (home / "crow.yaml").write_text("version: 1\nmodules:\n  design: true\n  billing: true\n")
    out = run(hub, "crow", "modules")
    assert out.returncode == 0
    assert "(none, defaults)" not in out.stdout
    line = next(l for l in out.stdout.splitlines() if " design " in l)
    assert line.startswith("on ") and line.endswith("(default off)")
    assert "modules.billing: unknown brick" in out.stderr


def test_crow_modules_rejects_other_arguments(hub):
    out = run(hub, "crow", "modules", "yaml")
    assert out.returncode != 0
    assert "crow-modules json" in out.stderr
