import importlib.machinery
import importlib.util

import pytest

from conftest import BIN

pytest.importorskip("PIL")


def _load():
    loader = importlib.machinery.SourceFileLoader("ansi_shot", str(BIN / "ansi-shot"))
    spec = importlib.util.spec_from_loader("ansi_shot", loader)
    mod = importlib.util.module_from_spec(spec)
    loader.exec_module(mod)
    return mod


def test_reverse_video_on_default_background_renders(tmp_path):
    mod = _load()
    src = tmp_path / "in.ansi"
    src.write_text("\x1b[7mrev\x1b[0m plain\n")
    out = tmp_path / "out.png"
    import sys
    old = sys.argv
    sys.argv = ["ansi-shot", str(src), str(out)]
    try:
        mod.main()
    finally:
        sys.argv = old
    assert out.exists()
