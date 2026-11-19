"""crow-mailtxt: argument parsing, input loading and the quoted-history cut."""
import json
from importlib.machinery import SourceFileLoader
from importlib.util import module_from_spec, spec_from_loader
from pathlib import Path

BIN = Path(__file__).resolve().parents[1] / "bin" / "crow-mailtxt"


def load_module():
    loader = SourceFileLoader("crow_mailtxt", str(BIN))
    mod = module_from_spec(spec_from_loader("crow_mailtxt", loader))
    loader.exec_module(mod)
    return mod


M = load_module()


def test_parse_args_defaults_and_flags():
    assert M.parse_args(["m.json"]) == ("m.json", False, 6000)
    assert M.parse_args(["m.json", "--full", "--max", "50"]) == ("m.json", True, 50)
    assert M.parse_args(["--max", "10", "m.json"]) == ("m.json", False, 10)


def test_parse_args_rejects_bad_input():
    assert M.parse_args([]) is None
    assert M.parse_args(["--full"]) is None
    assert M.parse_args(["m.json", "--max"]) is None
    assert M.parse_args(["m.json", "--max", "ten"]) is None
    assert M.parse_args(["a.json", "b.json"]) is None
    assert M.parse_args(["m.json", "--bogus"]) is None


def test_usage_error_exit_2(capsys):
    assert M.main(["m.json", "--max"]) == 2
    assert "usage: crow-mailtxt" in capsys.readouterr().err


def test_missing_file_exit_2(tmp_path, capsys):
    assert M.main([str(tmp_path / "nope.json")]) == 2
    assert "crow-mailtxt:" in capsys.readouterr().err


def test_load_json_with_header_line(tmp_path):
    f = tmp_path / "m.txt"
    f.write_text("Resource result:\n" + json.dumps({"subject": "Hi", "body": {"content": "<p>x</p>"}}))
    assert M.load(str(f))["subject"] == "Hi"


def test_load_raw_html(tmp_path):
    f = tmp_path / "m.html"
    f.write_text("<p>hello</p>")
    assert M.load(str(f)) == {"body": {"content": "<p>hello</p>"}}


def test_cut_drops_quoted_history():
    h = '<p>New text</p><div id="divRplyFwdMsg">From: someone</div><p>old</p>'
    assert M.to_text(M.cut(h)) == "New text"
    assert M.to_text(M.cut("<p>top</p><hr><p>old</p>")) == "top"
    plain = "Reply here\nFrom: A <a@example.org>\nSent: Monday\nold text"
    assert M.cut(plain).strip() == "Reply here"


def test_main_prints_english_headers_and_truncates(tmp_path, capsys):
    mail = {
        "subject": "Quarterly report",
        "sender": {"name": "Ann", "address": "ann@example.org"},
        "receivedDateTime": "2026-01-02T10:00:00Z",
        "toRecipients": [{"name": "Bob", "address": "bob@example.org"}],
        "attachments": [{"name": "r.pdf", "size": 4096}, {"name": "logo.png", "isInline": True}],
        "body": {"content": "<p>" + "a" * 40 + "</p><hr><p>quoted</p>"},
    }
    f = tmp_path / "m.json"
    f.write_text(json.dumps(mail))
    assert M.main([str(f), "--max", "10"]) == 0
    out = capsys.readouterr().out
    assert "Subject: Quarterly report" in out
    assert "From: Ann <ann@example.org>" in out
    assert "To: Bob <bob@example.org>" in out
    assert "Attachment: r.pdf (4 KB)" in out
    assert "logo.png" not in out
    assert "quoted" not in out
    assert "[…truncated]" in out
