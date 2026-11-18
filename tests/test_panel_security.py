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


def test_read_profile_cannot_extract_credentials_outside_document_roots(tmp_path):
    from crow_panel.core import Config
    from crow_panel.security import write_policy
    documents = tmp_path / "documents"
    documents.mkdir()
    preferences = documents / "preferences.md"
    preferences.write_text("Preferences")
    secrets = tmp_path / "credentials"
    secrets.mkdir()
    secret = secrets / "private-key"
    secret.write_text("fixture credential")
    (documents / "escape").symlink_to(secrets, target_is_directory=True)
    cfg = Config(overrides={"crow_home": str(documents), "state_dir": str(tmp_path / "state"), "files": {"roots": []}})
    write_policy(cfg, "read-probe")
    policy = json.loads((cfg.state / "ops/read-probe/policy.json").read_text())
    assert hook_input(policy, {"tool_name": "Read", "tool_input": {"file_path": str(preferences)}})
    for name, args in [
        ("Read", {"file_path": str(secret)}),
        ("Read", {"file_path": str(documents / "escape/private-key")}),
        ("Grep", {"path": str(secrets), "pattern": "."}),
        ("Glob", {"path": str(tmp_path), "pattern": "**/*"}),
        ("Glob", {"path": str(documents), "pattern": "../credentials/*"}),
    ]:
        assert not hook_input(policy, {"tool_name": name, "tool_input": args}), (name, args)


def test_reply_skeleton_is_bound_to_the_clicked_message():
    manifest = {"reply_message_id": "one"}
    assert tool_allowed("skeleton", "outlook_create_reply_all_draft", {"messageId": "one"}, manifest)
    assert not tool_allowed("skeleton", "outlook_create_reply_all_draft", {"messageId": "outside"}, manifest)
    assert not tool_allowed("skeleton", "outlook_create_reply_all_draft", {"messageId": "one", "cc": ["unrequested"]}, manifest)
    assert not tool_allowed("skeleton", "outlook_update_draft", {"draftId": "outside"}, manifest)
    assert not tool_allowed("skeleton", "outlook_create_reply_all_draft", {"messageId": "one"})
