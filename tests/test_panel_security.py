import json
from pathlib import Path
import subprocess
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "bin"))
from crow_panel.security import hook_input, redact, tool_allowed


def test_guard_rejects_extra_id_folder_categories_conversation_and_shell():
    manifest = {"items": [{"message_id": "one", "folder_id": "folder"}]}
    assert tool_allowed("triage", "outlook_modify_labels", {"messageId": "one", "moveToFolderId": "folder"}, manifest)
    for name, args in [
        ("outlook_modify_labels", {"messageId": "other", "moveToFolderId": "folder"}),
        ("outlook_modify_labels", {"messageId": "one", "moveToFolderId": "other"}),
        ("outlook_modify_labels", {"messageId": "one", "moveToFolderId": "folder", "categories": []}),
        ("outlook_modify_thread_labels", {"messageId": "one", "moveToFolderId": "folder"}),
        ("Bash", {"command": "anything"}), ("unknown", {}),
    ]:
        assert not tool_allowed("triage", name, args, manifest)
    assert not tool_allowed("triage", "outlook_modify_labels", {"messageId": "one", "moveToFolderId": "folder"}, None)
    assert not tool_allowed("read", "mcp__M365__outlook_modify_labels", {"messageId": "one"})
    assert not tool_allowed("skeleton", "outlook_send_email", {})
    assert not hook_input({"profile": "read", "write_paths": ["/allowed/result.json"]}, {"tool_name": "Write", "tool_input": {"file_path": "/elsewhere"}})


def test_hook_cli_missing_manifest_fails_closed(tmp_path):
    tool = Path(__file__).resolve().parents[1] / "bin/crow-triage-guard"
    result = subprocess.run([sys.executable, str(tool), str(tmp_path / "absent.json")], input="{}", text=True, capture_output=True)
    assert result.returncode == 2


def test_redaction_before_event_persistence():
    text = redact('Bearer SECRET https://example.org/?sig=abc&x=1 {"access_token":"private"}')
    assert "SECRET" not in text and "abc" not in text and "private" not in text


def test_m365_resource_reads_are_bounded_to_mail():
    assert tool_allowed("read", "mcp__M365__read_resource", {"uri": "mail:///messages/example"})
    assert tool_allowed("read", "mcp__M365__read_resource", {"uri": "mail:///folders/inbox"})
    assert not tool_allowed("read", "mcp__M365__read_resource", {"uri": "file:///etc/passwd"})
    assert not tool_allowed("triage", "mcp__M365__read_resource", {"uri": "mail:///folders/inbox"}, {"items": []})


def test_triage_guard_rejects_null_targets_and_unchecked_batch_arguments():
    manifest = {"items": [{"message_id": "one", "folder_id": "folder"}]}
    allowed = {"messageId": "one", "moveToFolderId": "folder"}
    assert not tool_allowed("triage", "outlook_modify_labels", {"messageId": "outside", "moveToFolderId": None}, manifest)
    assert not tool_allowed("triage", "outlook_batch_modify_labels", {"modifications": [allowed], "categories": ["unconfirmed"]}, manifest)
    assert not tool_allowed("triage", "outlook_batch_modify_labels", {"modifications": [allowed], "messages": [allowed]}, manifest)
    assert tool_allowed("triage", "outlook_batch_modify_labels", {"modifications": [allowed]}, manifest)
