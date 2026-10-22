"""crow-runs summarize_tool: a tool call's own description wins over its raw command."""
import importlib.machinery
import importlib.util

import pytest

from conftest import BIN


@pytest.fixture
def cr(tmp_path, monkeypatch):
    (tmp_path / "local").mkdir()
    (tmp_path / "local" / "projects.yaml").write_text("projects: {}\n")
    monkeypatch.setenv("CROW_HOME", str(tmp_path))
    monkeypatch.setenv("CROW_ACCOUNT", "main")
    loader = importlib.machinery.SourceFileLoader("crow_runs", str(BIN / "crow-runs"))
    spec = importlib.util.spec_from_loader("crow_runs", loader)
    mod = importlib.util.module_from_spec(spec)
    loader.exec_module(mod)
    return mod


def test_bash_description_wins(cr):
    inp = {"command": "cd /home/me/Projects/hub && git status", "description": "Show working tree status"}
    assert cr.summarize_tool("Bash", inp) == "Bash: Show working tree status"


def test_bare_command_is_shortened(cr):
    inp = {"command": "cd /home/me/Projects/hub/local; python3 /home/me/Projects/hub/bin/crow-usage --json\nmore"}
    assert cr.summarize_tool("Bash", inp) == "Bash: python3 …/crow-usage --json"


def test_other_tools_unchanged(cr):
    assert cr.summarize_tool("Edit", {"file_path": "/a/b.go"}) == "Edit: /a/b.go"
    assert cr.summarize_tool("Agent", {"description": "Find callers", "prompt": "long"}) == "Agent: Find callers"
    assert cr.summarize_tool("TodoWrite", {}) == "TodoWrite"
