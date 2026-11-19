"""crow-mail-draft: draft file, signature rule, post-write checks, COM transport, graph and connector backends."""
import json
import shutil
import subprocess
from importlib.machinery import SourceFileLoader
from importlib.util import module_from_spec, spec_from_loader
from pathlib import Path
from types import SimpleNamespace

import pytest

REPO = Path(__file__).resolve().parents[1]
BIN = REPO / "bin" / "crow-mail-draft"
PS1 = REPO / "bin" / "crow-mail-draft-com.ps1"


def load_module():
    loader = SourceFileLoader("crow_mail_draft", str(BIN))
    mod = module_from_spec(spec_from_loader("crow_mail_draft", loader))
    loader.exec_module(mod)
    return mod


M = load_module()


@pytest.fixture
def cfg(tmp_path):
    return {"draft_backend": "com", "internal_domains": ["corp.test"], "state_dir": str(tmp_path / "state"),
            "signatures": {"internal": ["Best,", "Sam"], "external": ["Best regards,", "Sam", "Corp"]}}


def draft_file(tmp_path, **extra):
    data = {"message_id": "M1", "text": "Hello,\nThe report is attached.", **extra}
    path = tmp_path / "draft.json"
    path.write_text(json.dumps(data))
    return path


def readback(**extra):
    base = {"draft_id": "D1", "is_draft": True, "sent": False, "attachments": [],
            "html": '<html><body><div id="crow-reply">x</div><div>quoted</div></body></html>',
            "body_text": "Hello,\r\nThe report is attached.\r\n\r\nBest,\r\nSam\r\n\r\nFrom: A\r\nOld text",
            "quoted_text": "Old text"}
    return {**base, **extra}


EXPECTED = {"body_text": "Hello, The report is attached.", "signature": ["Best,", "Sam"], "signature_kind": "internal",
            "attachments": []}


def by_name(checks):
    return {c["name"]: c["ok"] for c in checks}


# --- draft file and signature rule -------------------------------------------

def test_draft_file_defaults_and_refusals(tmp_path):
    d = M.load_draft(draft_file(tmp_path))
    assert (d["mode"], d["signature"], d["cc"], d["attachments"]) == ("all", "auto", [], [])
    for bad in ({"message_id": ""}, {"html": "<div>x</div>"}, {"mode": "forward"}, {"signature": "maybe"},
                {"cc": ["not an address"]}, {"attachments": "a.pdf"}):
        with pytest.raises(M.Refused):
            M.load_draft(draft_file(tmp_path, **bad))


def test_attachments_resolve_next_to_the_draft_file_and_respect_roots(tmp_path, cfg):
    (tmp_path / "a.pdf").write_bytes(b"%PDF")
    d = M.load_draft(draft_file(tmp_path, attachments=["a.pdf"]))
    assert d["attachments"] == [str(tmp_path / "a.pdf")]
    M.check_attachments(d["attachments"], cfg)
    with pytest.raises(M.Refused):
        M.check_attachments(d["attachments"], {**cfg, "attachment_roots": [str(tmp_path / "elsewhere")]})
    with pytest.raises(M.Refused):
        M.check_attachments([str(tmp_path / "missing.pdf")], cfg)


def test_signature_auto_picks_external_for_an_outside_recipient(cfg):
    assert M.signature_lines("auto", ["a@corp.test", "b@CORP.test"], cfg) == ("internal", ["Best,", "Sam"])
    assert M.signature_lines("auto", ["a@corp.test", "c@other.test"], cfg)[0] == "external"
    assert M.signature_lines("none", None, cfg) == ("none", [])
    with pytest.raises(M.Refused):
        M.signature_lines("auto", None, cfg)
    with pytest.raises(M.Refused):
        M.signature_lines("internal", [], {**cfg, "signatures": {}})


def test_compose_escapes_text_and_appends_the_signature_once(tmp_path):
    d = M.load_draft(draft_file(tmp_path, text="a < b\nline 2"))
    html = M.compose(d, ["Best,", "Sam"])
    assert "a &lt; b" in html and html.count("Best,") == 1
    assert M.html_text(html) == "a < b line 2 Best, Sam"
    with pytest.raises(M.Refused):
        M.compose({"html": "<div> </div>"}, [])


# --- post-write checks --------------------------------------------------------

def test_checks_pass_on_a_clean_draft():
    assert all(by_name(M.run_checks(readback(), EXPECTED)).values())


def test_check_catches_a_duplicated_signature():
    # Classic Outlook ReplyAll adds its own closing next to the configured one.
    dup = readback(body_text="Hello,\nThe report is attached.\n\nBest,\nSam\n\nBest,\nSam\n\nFrom: A\nOld text")
    assert by_name(M.run_checks(dup, EXPECTED))["signature_once"] is False


def test_check_catches_the_native_signature_bookmark_even_with_other_text():
    native = readback(html='<body><div id="crow-reply">x</div><div><a name="_MailAutoSig">Corporate block</a></div></body>')
    assert by_name(M.run_checks(native, EXPECTED))["no_native_signature"] is False


def test_signature_in_the_quoted_thread_does_not_count():
    quoted = readback(body_text="Hello,\nThe report is attached.\nBest,\nSam\nFrom: Sam\nBest, Sam", quoted_text="Best, Sam")
    assert by_name(M.run_checks(quoted, EXPECTED))["signature_once"] is True


def test_checks_flag_missing_signature_body_attachment_and_sent():
    checks = by_name(M.run_checks(readback(body_text="Other text", is_draft=False, sent=True),
                                  {**EXPECTED, "attachments": ["a.pdf"]}))
    assert not any(checks[k] for k in ("body_visible", "signature_once", "attachments", "still_draft", "not_sent"))


def test_body_text_falls_back_to_the_html():
    rb = readback(body_text="", html="<body><div>Hello,</div><div>The report is attached.</div><div>Best,</div><div>Sam</div></body>")
    assert all(by_name(M.run_checks(rb, EXPECTED)).values())


# --- COM transport --------------------------------------------------------------

def test_com_transport_uses_a_json_file_and_fixed_argv(cfg):
    seen = []

    def runner(argv, **kw):
        path = Path(argv[-1])
        payload = json.loads(path.read_text())
        seen.append(path)
        assert payload == {"action": "body", "entry_id": "é; $(exit) `x`"}
        assert "-Command" not in argv and argv[argv.index("-File") + 1].endswith("crow-mail-draft-com.ps1")
        assert kw["encoding"] == "utf-8" and kw["timeout"] > 0
        return SimpleNamespace(returncode=0, stdout='﻿{"ok":true,"result":{"body_text":"été"}}')

    com = M.ComBackend(cfg, runner, str)
    assert com.call("body", entry_id="é; $(exit) `x`")["body_text"] == "été"
    assert not seen[0].exists()
    with pytest.raises(ValueError):
        com.call("send")


@pytest.mark.parametrize("action,uncertain", [("body", False), ("reply", True), ("delete_draft", True)])
def test_com_timeout_is_not_retried_and_marks_writes_uncertain(cfg, action, uncertain):
    calls = []

    def runner(argv, **kw):
        calls.append(argv)
        raise subprocess.TimeoutExpired(argv, 1)

    with pytest.raises(M.BackendError) as err:
        M.ComBackend(cfg, runner, str).call(action)
    assert err.value.uncertain is uncertain and len(calls) == 1


def test_com_save_end_to_end_with_a_fake_outlook(tmp_path, cfg):
    requests = []

    def runner(argv, **kw):
        req = json.loads(Path(argv[-1]).read_text())
        requests.append(req)
        if req["action"] == "body":
            result = {"from": {"address": "boss@corp.test"}, "to": [{"address": "me@corp.test"}], "cc": []}
        else:
            text = M.html_text(req["html"]) + " From: boss Old text"
            result = {"draft_id": "D9", "html": "<body>" + req["html"] + "</body>", "body_text": text,
                      "quoted_text": "Old text", "attachments": [], "is_draft": True, "sent": False}
        return SimpleNamespace(returncode=0, stdout=json.dumps({"ok": True, "result": result}))

    out = M.cmd_save(draft_file(tmp_path), cfg, M.ComBackend(cfg, runner, str))
    assert out["ok"] and out["draft_id"] == "D9" and out["signature"] == "internal"
    assert [r["action"] for r in requests] == ["body", "reply"] and requests[1]["mode"] == "all"
    assert list((Path(cfg["state_dir"]) / "drafts").glob("*-com.json"))


# --- graph and connector --------------------------------------------------------

class FakeGraph:
    def __init__(self):
        self.calls = []
        self.body = "<html><body><div>quoted</div></body></html>"

    def __call__(self, req, timeout):
        method, url = req.get_method(), req.full_url
        data = json.loads(req.data) if req.data else None
        self.calls.append((method, url.split("/v1.0")[1], data))
        if method == "POST" and url.endswith("/createReplyAll"):
            value = {"id": "D1", "body": {"content": self.body}}
        elif method == "PATCH":
            self.body = data["body"]["content"]
            value = {}
        elif "/attachments" in url:
            value = {"value": []}
        elif req.headers.get("Prefer"):
            value = {"body": {"content": M.html_text(self.body) if "D1" in url else "quoted"}}
        else:
            value = {"body": {"content": self.body}, "isDraft": True, "webLink": "https://example.test/d"}
        raw = json.dumps(value).encode()
        return SimpleNamespace(read=lambda: raw)


def test_graph_creates_reply_all_then_one_body_update_and_never_sends(tmp_path, cfg):
    fake = FakeGraph()

    class Ctx:
        def __init__(self, r):
            self.r = r

        def __enter__(self):
            return self.r

        def __exit__(self, *a):
            return False

    g = M.GraphBackend({**cfg, "draft_backend": "graph"}, token="t", opener=lambda req, timeout: Ctx(fake(req, timeout)))
    out = M.cmd_save(draft_file(tmp_path, signature="internal"), cfg, g)
    assert out["ok"], out["checks"]
    paths = [c[1] for c in fake.calls]
    assert any(p.endswith("/createReplyAll") for p in paths)
    assert not any("send" in p.lower() for p in paths)
    assert 'id="crow-reply"' in fake.body


def test_connector_queues_a_request_and_check_reads_the_readback(tmp_path, cfg):
    cfg = {**cfg, "draft_backend": "connector"}
    path = draft_file(tmp_path, recipients=["a@corp.test"])
    out = M.cmd_save(path, cfg, M.ConnectorBackend(cfg))
    req = json.loads(Path(out["request"]).read_text())
    assert out["pending"] and req["tool"] == "outlook_create_reply_all_draft"
    rb = tmp_path / "rb.json"
    rb.write_text(json.dumps(readback()))
    assert M.cmd_check(path, rb, cfg)["ok"]


def test_cli_refusals_and_config(tmp_path, cfg, capsys):
    conf = tmp_path / "mail.yaml"
    conf.write_text("draft_backend: smtp\n")
    assert M.main(["save", "x.json", "--config", str(conf)]) == 2
    assert M.main(["send", "x"]) == 2
    conf.write_text("draft_backend: graph\n")
    assert M.main(["probe", "--config", str(conf)]) == 1


# --- the PowerShell bridge ---------------------------------------------------------

def test_bridge_has_a_fixed_action_list_and_no_send():
    src = PS1.read_text(encoding="utf-8-sig")
    assert "$allowed = @('probe','inbox','body','conversation','reply','draft','delete_draft')" in src
    assert ".Send(" not in src and ".Send()" not in src
    assert set(M.ComBackend.ACTIONS) == {"probe", "inbox", "body", "conversation", "reply", "draft", "delete_draft"}


def run_ps(script, tmp_path):
    if not shutil.which("powershell.exe") or not shutil.which("wslpath"):
        pytest.skip("Windows PowerShell unavailable")
    path = tmp_path / "t.ps1"
    path.write_text(script, encoding="utf-8-sig")
    win = subprocess.run(["wslpath", "-w", str(path)], capture_output=True, text=True, check=True).stdout.strip()
    return subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", win],
                          capture_output=True, timeout=30)


def test_bridge_strips_only_the_automatic_signature(tmp_path):
    src = PS1.read_text(encoding="utf-8-sig")
    function = src[src.index("function QuotedThread("):src.index("\nfunction InlineCids")]
    result = run_ps(function + '''
$html = '<html><head></head><body><div class="WordSection1"><div><a name="_MailAutoSig">Default closing</a><img src="cid:auto"></div><div><div style="border-top:solid"><p><a name="_MailOriginal">From:</a> Original sender</p></div><p>Original thread</p><img src="cid:original"></div></div></body></html>'
$result = QuotedThread $html
if ($result.Contains('Default closing') -or $result.Contains('_MailAutoSig') -or $result.Contains('cid:auto') -or -not $result.Contains('Original thread') -or -not $result.Contains('cid:original')) { exit 1 }
''', tmp_path)
    assert result.returncode == 0, result.stderr.decode(errors="replace")


def test_bridge_refuses_an_unknown_action(tmp_path):
    if not shutil.which("powershell.exe") or not shutil.which("wslpath"):
        pytest.skip("Windows PowerShell unavailable")
    req = tmp_path / "r.json"
    req.write_text('{"action":"send"}')
    to_win = lambda p: subprocess.run(["wslpath", "-w", str(p)], capture_output=True, text=True, check=True).stdout.strip()
    r = subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", to_win(PS1),
                        "-RequestFile", to_win(req)], capture_output=True, encoding="utf-8", timeout=30)
    value = json.loads(r.stdout.lstrip("﻿"))
    assert r.returncode == 1 and value["ok"] is False and value["error"]["uncertain"] is False
