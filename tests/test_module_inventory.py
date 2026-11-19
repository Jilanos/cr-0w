"""Every engine piece has a brick in the module manifests, modules/<brick>.yaml (adr_002, AC2)."""
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


def test_manifests_carry_the_adr_002_bricks_and_defaults():
    import yaml
    mods = Path(__file__).resolve().parents[1] / "modules"
    got = {f.stem: yaml.safe_load(f.read_text())["default"] for f in mods.glob("*.yaml")}
    off = {"design", "integration-shell"}
    want = {b: b not in off for b in (
        "core", "git", "forge", "vault", "mail", "team", "afk", "retro", "design",
        "releases", "core-api", "nest", "deck", "integration-shell")}
    assert got == want


def test_a_piece_missing_from_the_manifests_fails(tmp_path, monkeypatch, capsys):
    mod = load()
    (tmp_path / "core.yaml").write_text("name: core\nscripts: [crow]\n")
    monkeypatch.setattr(mod, "MODULES", tmp_path)
    assert mod.main(["--check"]) == 1
    assert "no brick: script\tcrow-doctor" in capsys.readouterr().out
