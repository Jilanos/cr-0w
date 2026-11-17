from pathlib import Path

"""Background run sandbox: per-kind allowlists, credential-free env, denials (item_077)."""
import json
import shlex
import sys

from conftest import BIN

sys.path.insert(0, str(BIN))
import crow_lib


def test_every_dispatch_kind_has_an_allowlist():
    for kind in ("review", "task", "retro", "oneshot"):
        assert kind in crow_lib.RUN_SANDBOX
        assert crow_lib.RUN_SANDBOX[kind]["mcp"] == []


def test_bash_rules_get_an_rtk_twin():
    allow = crow_lib.sandbox_allow("review")
    assert "Bash(git status:*)" in allow and "Bash(rtk git status:*)" in allow
    assert "Bash(rtk read:*)" in allow and "Bash(rtk cat:*)" not in allow
    assert "Bash(rtk grep:*)" in allow and "Bash(rtk rg:*)" in allow  # rg: rtk 0.x -> grep, 1.x -> rg
    assert len(allow) == len(set(allow))
    assert "Read" in allow and "Write" not in allow
    assert not any(a.startswith("mcp__") for a in allow)


def test_task_may_commit_but_never_push():
    allow = crow_lib.sandbox_allow("task")
    assert "Bash(git commit:*)" in allow and "Edit" in allow
    assert not any("push" in a for a in allow)
    assert "Bash(git push:*)" in crow_lib.RUN_DENY and "Bash(rtk git push:*)" in crow_lib.RUN_DENY


def test_sandbox_args_write_a_settings_file(tmp_path):
    import json
    args = crow_lib.sandbox_args("retro", tmp_path)
    assert args[:2] == ["--strict-mcp-config", "--settings"] and "--mcp-config" not in args
    perms = json.loads(Path(args[2]).read_text())["permissions"]
    assert perms["allow"] == crow_lib.sandbox_allow("retro")
    assert perms["deny"] == crow_lib.RUN_DENY and "WebFetch" in perms["deny"]


def test_listed_mcp_server_is_passed(monkeypatch, tmp_path):
    import json
    monkeypatch.setitem(crow_lib.RUN_SANDBOX, "retro", {**crow_lib.RUN_SANDBOX["retro"], "mcp": ["echo"]})
    monkeypatch.setattr(crow_lib, "MCP_SERVERS", {"echo": {"command": "echo"}})
    args = crow_lib.sandbox_args("retro", tmp_path)
    assert "mcp__echo" in json.loads(Path(args[2]).read_text())["permissions"]["allow"]
    assert json.loads(Path(args[args.index("--mcp-config") + 1]).read_text())["mcpServers"] == {"echo": {"command": "echo"}}


def test_run_flags_extra_args_fit_cdx_cap(tmp_path):
    for kind in crow_lib.RUN_SANDBOX:
        flags, _ = crow_lib.run_flags(kind, "claude", state=tmp_path)
        extra = flags[flags.index("--extra-args") + 1]
        assert len(extra) <= crow_lib.CDX_EXTRA_ARGS_MAX
        assert shlex.split(extra)[:2] == ["--strict-mcp-config", "--settings"]


def test_continue_run_keeps_the_permissions_only_settings(tmp_path):
    flags, _ = crow_lib.run_flags("task", "claude", continue_run="r1", state=tmp_path)
    extra = shlex.split(flags[flags.index("--extra-args") + 1])
    assert extra[:2] == ["--strict-mcp-config", "--settings"]
    assert set(json.loads(Path(extra[2]).read_text())) == {"permissions"}  # cdx 0.26.11 refuses any other key here
    assert "--extra-args" not in crow_lib.run_flags("task", "codex", state=tmp_path)[0]


def test_permission_is_default(tmp_path, monkeypatch):
    monkeypatch.setenv("CROW_HOME", str(tmp_path))
    assert crow_lib.permission("claude") == "default"
    assert crow_lib.permission("codex") == "default"


def test_sandbox_env_drops_credentials_keeps_config_dirs():
    env = {"GH_TOKEN": "x", "GITLAB_TOKEN": "x", "AWS_SECRET_ACCESS_KEY": "x", "AWS_PROFILE": "p",
           "FAKE_PROBE_TOKEN": "x", "OPENAI_API_KEY": "x", "SSH_AUTH_SOCK": "/s",
           "GH_CONFIG_DIR": "/c", "GLAB_CONFIG_DIR": "/c", "PATH": "/bin", "HOME": "/h",
           "CLAUDE_CODE_DISABLE_BACKGROUND_TASKS": "1"}
    clean, dropped = crow_lib.sandbox_env(env, "task")
    assert dropped == sorted(["GH_TOKEN", "GITLAB_TOKEN", "AWS_SECRET_ACCESS_KEY", "AWS_PROFILE",
                              "FAKE_PROBE_TOKEN", "OPENAI_API_KEY", "SSH_AUTH_SOCK"])
    assert set(clean) == {"GH_CONFIG_DIR", "GLAB_CONFIG_DIR", "PATH", "HOME", "CLAUDE_CODE_DISABLE_BACKGROUND_TASKS"}


def test_keep_list_lets_an_approved_token_through(monkeypatch):
    monkeypatch.setattr(crow_lib, "RUN_KEEP_ENV", {"review": ["GH_TOKEN"]})
    assert "GH_TOKEN" in crow_lib.sandbox_env({"GH_TOKEN": "x"}, "review")[0]
    assert "GH_TOKEN" not in crow_lib.sandbox_env({"GH_TOKEN": "x"}, "task")[0]


def test_run_env_strips_only_with_a_kind(monkeypatch):
    monkeypatch.setenv("GH_TOKEN", "secret")
    assert crow_lib.run_env({"A": "1"})["GH_TOKEN"] == "secret"
    env = crow_lib.run_env({"A": "1"}, "review")
    assert "GH_TOKEN" not in env and env["A"] == "1"


def test_run_profile_name():
    assert crow_lib.run_profile("acct") == "acct-runs"


def test_run_denials_from_cdx_warnings():
    run = {"final_payload": {"warnings": [
        {"code": "permission_denials", "permission_denials": [
            {"tool_name": "Bash", "tool_input": {"command": "touch x"}},
            {"tool_name": "Write", "tool_input": {"file_path": "/p/f"}},
            {"tool_name": "mcp__echo__ping", "tool_input": {}}]},
        {"code": "other"}]}}
    assert crow_lib.run_denials(run) == ["Bash: touch x", "Write: /p/f", "mcp__echo__ping"]
    assert crow_lib.run_denials({}) == [] and crow_lib.run_denials(None) == []


def test_dispatch_hands_cdx_a_credential_free_env(tmp_path, monkeypatch):
    """crow-runs dispatch starts cdx without the hub's tokens (the run inherits cdx's env)."""
    import importlib.machinery
    import importlib.util
    (tmp_path / "local").mkdir()
    (tmp_path / "local" / "projects.yaml").write_text(f"projects:\n  - {{name: demo, path: {tmp_path}}}\n")
    (tmp_path / "bin").mkdir()
    monkeypatch.setenv("CROW_HOME", str(tmp_path))
    monkeypatch.setenv("CROW_ACCOUNT", "main")
    monkeypatch.setenv("GH_TOKEN", "secret")
    loader = importlib.machinery.SourceFileLoader("crow_runs_sb", str(BIN / "crow-runs"))
    spec = importlib.util.spec_from_loader("crow_runs_sb", loader)
    cr = importlib.util.module_from_spec(spec)
    loader.exec_module(cr)
    seen = []

    class R:
        returncode = 0
        stdout = '{"ok": true, "run_id": "sb000001-full"}'

    monkeypatch.setattr(cr.subprocess, "run", lambda argv, **k: seen.append((argv, k.get("env"))) or R())
    monkeypatch.setattr(cr.subprocess, "Popen", lambda *a, **k: None)
    monkeypatch.setattr(cr, "running_runs", list)
    monkeypatch.setattr(cr.crow_lib, "provider_of", lambda acct: "claude")
    monkeypatch.setattr(cr, "sh", lambda *a, **k: "")
    monkeypatch.setattr(sys, "argv", ["crow-runs", "dispatch", "demo", "t-1", "--prompt", "p"])
    cr.main()
    _argv, env = next(x for x in seen if x[0][:2] == ["cdx", "run"])
    assert "GH_TOKEN" not in env and env["CLAUDE_CODE_DISABLE_BACKGROUND_TASKS"] == "1"


def test_crow_runs_lists_denials_under_a_finished_run():
    import importlib.machinery
    import importlib.util
    import os
    os.environ.setdefault("CROW_ACCOUNT", "test")
    loader = importlib.machinery.SourceFileLoader("crow_runs_dn", str(BIN / "crow-runs"))
    spec = importlib.util.spec_from_loader("crow_runs_dn", loader)
    cr = importlib.util.module_from_spec(spec)
    loader.exec_module(cr)
    row = {"run_id": "aaaaaaaa", "project": "p", "label": "l", "status": "done", "duration_s": 60, "ended_at": None,
           "commits": [], "cost_usd": None, "budget_usd": None, "denials": ["Bash: touch x"]}
    out = "\n".join(cr.render({"agents": [], "slots": {"busy": 0, "max": 2}, "finished": [row]}, color=False, width=200))
    assert "denied Bash: touch x" in out
    row["denials"] = []
    assert "denied" not in "\n".join(cr.render({"agents": [], "slots": {"busy": 0, "max": 2}, "finished": [row]},
                                                color=False, width=200))
