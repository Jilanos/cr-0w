"""Every engine piece has a brick in the module inventory (adr_002, AC2)."""
import importlib.util
from pathlib import Path

SPEC = Path(__file__).resolve().parents[1] / "logics/specs/module_inventory/inventory.py"


def load():
    spec = importlib.util.spec_from_file_location("module_inventory", SPEC)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_every_piece_has_a_known_brick(capsys):
    rc = load().main(["--check"])
    out = capsys.readouterr().out
    assert rc == 0, out
