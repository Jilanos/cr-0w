"""crow-docx-redline: argument parsing and the accept-all / reject-all round trip."""
import zipfile
from importlib.machinery import SourceFileLoader
from importlib.util import module_from_spec, spec_from_loader
from pathlib import Path
from xml.etree import ElementTree as ET

import pytest

docx = pytest.importorskip("docx")

BIN = Path(__file__).resolve().parents[1] / "bin" / "crow-docx-redline"
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def load_module():
    loader = SourceFileLoader("crow_docx_redline", str(BIN))
    mod = module_from_spec(spec_from_loader("crow_docx_redline", loader))
    loader.exec_module(mod)
    return mod


M = load_module()


def make(path, paras):
    d = docx.Document()
    for p in paras:
        d.add_paragraph(p)
    d.save(path)
    return str(path)


def para_texts(path, accept):
    """Paragraph texts after accepting (or rejecting) every tracked change."""
    root = ET.fromstring(zipfile.ZipFile(path).read("word/document.xml"))
    dropped = W + ("del" if accept else "ins")

    def walk(el, inside):
        for ch in el:
            if ch.tag in (W + "ins", W + "del"):
                yield from walk(ch, ch.tag)
            elif (ch.tag == W + "t" and inside != dropped) or (ch.tag == W + "delText" and not accept):
                yield ch.text or ""
            else:
                yield from walk(ch, inside)

    return ["".join(walk(p, None)) for p in root.iter(W + "p")
            if p.find(f"{W}pPr/{W}rPr/{dropped}") is None]


def test_parse_args():
    assert M.parse_args(["a", "b", "c", "Me"]) == ("a", "b", "c", "Me")
    assert M.parse_args(["a", "b", "c"]) is None
    assert M.parse_args(["a", "b", "c", " "]) is None
    assert M.parse_args(["a", "b", "c", "Me", "x"]) is None


def test_usage_error_exit_2(capsys):
    assert M.main(["only-one"]) == 2
    assert "usage: crow-docx-redline" in capsys.readouterr().err


def test_missing_input_exit_2(tmp_path, capsys):
    assert M.main([str(tmp_path / "a.docx"), str(tmp_path / "b.docx"), str(tmp_path / "o.docx"), "Me"]) == 2
    assert "no such file" in capsys.readouterr().err


def test_round_trip_accept_new_reject_old(tmp_path):
    old = ["Intro stays.", "The price is ten euros per month.", "This paragraph goes away."]
    new = ["Intro stays.", "The price is twelve euros per month.", "A brand new closing line."]
    out = tmp_path / "out.docx"
    assert M.main([make(tmp_path / "old.docx", old), make(tmp_path / "new.docx", new), str(out), "Reviewer"]) == 0
    assert para_texts(out, accept=True) == new
    assert para_texts(out, accept=False) == old
    xml = zipfile.ZipFile(out).read("word/document.xml").decode()
    assert 'w:author="Reviewer"' in xml
