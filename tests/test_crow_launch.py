"""Launch paths on both providers (items 2.2 and 2.3), against tests/fakecdx: guard, context,
memory leases, one-shot runs, dispatch slots and workspace ownership, reports, helper jobs."""
import json
import os
import subprocess
import sys
import threading

import pytest
import yaml

from conftest import BIN, PYTHON, mixed, run


@pytest.fixture
def env(hub, fake_cdx, tmp_path):
    """Mixed accounts, two registered projects with instructions, the fake cdx on PATH."""
    mixed(hub)
    home = hub[0]
    projects = []
    for name in ("alpha", "beta"):
        d = tmp_path / "work" / name
        d.mkdir(parents=True)
        (d / "AGENTS.md").write_text("@LOGICS.md\n")
        (d / "LOGICS.md").write_text("rules\n")
        projects.append({"name": name, "path": str(d), "scope": "personal", "status": "active"})
    (home / "local/projects.yaml").write_text(yaml.safe_dump({"projects": projects}))
    (home / "CLAUDE.md").write_text("hub rules\n")
    (home / "local/owner-prefs.md").write_text("prefs\n")
    skill = home / ".claude/skills/brief"
    skill.mkdir(parents=True)
    (skill / "SKILL.md").write_text("brief skill\n")
    for acct in ("main", "shared", "spare"):
        (hub[1] / acct / "claude-home" / ".claude" / "projects").mkdir(parents=True)
    for acct in ("cx", "cxshared"):
        (hub[1] / acct / "sessions").mkdir(parents=True)
    e, calls, state = fake_cdx
    return {"env": e, "calls": calls, "state": state, "home": home, "projects": projects, "hub": hub}


def launches(env):
    """Calls that would start a provider: interactive launches, runs, launching handoffs."""
    out = []
    for c in env["calls"]():
        a = c["argv"]
        if a and (a[0] == "run" or (a[0] == "handoff" and "--json" not in a) or
                  a[0] in ("main", "shared", "spare", "cx", "cxshared")):
            out.append(c)
    return out


def crow(env, *args, extra=None):
    return run(env["hub"], "crow", *args, env={**env["env"], **(extra or {})})


def plan(env, *args):
    r = run(env["hub"], "crow-accounts", "plan", *args, env=env["env"])
    return r, (json.loads(r.stdout) if r.returncode == 0 else None)


# ---------- guard and context (2.2) ----------

def test_codex_hub_session_is_unavailable_before_any_launch(env):
    r = crow(env, "--provider", "codex", "hub")
    assert r.returncode == 1 and "cannot enforce the hub guard" in r.stderr
    assert launches(env) == []


def test_claude_hub_session_still_launches(env):
    r = crow(env, "hub")
    assert r.returncode == 0, r.stderr
    (call,) = launches(env)
    assert call["argv"] == ["main", "--dir", str(env["home"])]


def test_both_providers_get_the_same_required_references(env, tmp_path):
    task = tmp_path / "task.md"
    task.write_text("the task\n")
    cwd = env["projects"][0]["path"]
    _, claude = plan(env, "--operation", "project-session", "--cwd", cwd, "--account", "main",
                     "--context", str(task), "--prompt", "go")
    _, codex = plan(env, "--operation", "project-session", "--cwd", cwd, "--account", "cx",
                    "--context", str(task), "--prompt", "go")
    assert str(task) in claude["prompt"] and str(task) in codex["prompt"]
    assert claude["prompt"].endswith("go") and codex["prompt"].endswith("go")
    # Codex also gets what Claude loads natively (CLAUDE.md is not a Codex file; AGENTS.md is)
    assert f"{cwd}/AGENTS.md" in codex["prompt"] and str(env["home"] / "local/owner-prefs.md") in codex["prompt"]
    assert "AGENTS.md" not in claude["prompt"]
    # without explicit references Claude's prompt is untouched
    _, plain = plan(env, "--operation", "project-session", "--cwd", cwd, "--account", "main", "--prompt", "go")
    assert plain["prompt"] == "go"


def test_missing_required_reference_fails_before_launch(env, tmp_path):
    r = crow(env, "open", "alpha", "x", extra={"CROW_ACCOUNT": "cx"})
    assert r.returncode == 0  # sanity: the open itself works
    r, _ = plan(env, "--operation", "project-session", "--cwd", env["projects"][0]["path"], "--account", "cx",
                "--context", str(tmp_path / "missing.md"))
    assert r.returncode == 1 and "required reference" in r.stderr


def test_never_profiles_get_no_context(hub):
    sys.path.insert(0, str(BIN))
    import crow_cdx
    assert crow_cdx.context_refs({"name": "mate", "policy": "never", "memory": "permanent"}, str(hub[0])) == []


def test_codex_project_session_starts_with_references(env):
    r = crow(env, "--provider", "codex", "open", "beta", "fix the bug")
    assert r.returncode == 0, r.stderr
    (call,) = launches(env)
    a = call["argv"]
    assert a[:3] == ["cx", "--dir", env["projects"][1]["path"]] and a[3] == "--prompt"
    assert "AGENTS.md" in a[4] and a[4].endswith("fix the bug")


def test_unenforceable_guard_never_falls_back_to_full_access(hub):
    sys.path.insert(0, str(BIN))
    import crow_cdx
    assert crow_cdx.guard("codex", "hub-oneshot") == "default"
    assert crow_cdx.guard("codex", "helper-readonly") == "review"
    assert crow_cdx.guard("claude", "hub-session") is None
    with pytest.raises(crow_cdx.CdxError) as e:
        crow_cdx.guard("codex", "hub-session")
    assert e.value.code == "guard_unenforceable"
    assert "full" not in crow_cdx.DEFAULT_PERMISSION.values()


# ---------- shared memory leases (2.2) ----------

def memory(env, *args):
    return run(env["hub"], "crow-memory", *args, env=env["env"])


def link_of(env, acct):
    return env["hub"][1] / acct / "claude-home/.claude/projects/-w/memory"


def test_concurrent_sessions_keep_memory_until_the_last_one_ends(env):
    (env["home"] / "local/memory/-w").mkdir(parents=True)
    a = subprocess.Popen(["sleep", "30"])
    b = subprocess.Popen(["sleep", "30"])
    try:
        assert memory(env, "acquire", "shared", str(a.pid)).returncode == 0
        assert memory(env, "acquire", "shared", str(b.pid)).returncode == 0
        assert link_of(env, "shared").is_symlink()
        memory(env, "release", "shared", str(a.pid))
        assert link_of(env, "shared").is_symlink()          # b still runs
        memory(env, "release", "shared", str(a.pid))        # idempotent
        assert link_of(env, "shared").is_symlink()
        b.kill(); b.wait()
        memory(env, "acquire", "shared", str(a.pid))
        memory(env, "release", "shared", str(a.pid))        # b's lease died with it
        assert not link_of(env, "shared").exists()
    finally:
        for p in (a, b):
            p.kill()


def test_never_account_gets_no_memory_and_codex_lease_is_a_noop(env):
    (env["home"] / "local/memory/-w").mkdir(parents=True)
    r = memory(env, "acquire", "mate", "1")
    assert r.returncode == 1 and "not allowed" in r.stderr
    assert memory(env, "acquire", "cx", str(os.getpid())).returncode == 0
    assert not (env["hub"][1] / "cx" / "claude-home").exists()
    assert memory(env, "release", "cx", str(os.getpid())).returncode == 0


def test_session_memory_is_released_when_the_launch_fails(env):
    (env["home"] / "local/memory/-w").mkdir(parents=True)
    r = crow(env, "--account", "shared", "--confirm-account", "shared", "hub", extra={"FAKE_CDX_LAUNCH_RC": "3"})
    assert r.returncode == 3
    assert not link_of(env, "shared").exists()
    leases = json.loads((env["home"] / "local/state/memory-leases/shared.json").read_text())
    assert leases == []


# ---------- one-shot, dispatch, reports (2.3) ----------

def test_codex_brief_runs_the_skill_file_in_a_workspace_sandbox(env):
    r = crow(env, "--provider", "codex", "brief", extra={"FAKE_CDX_REPLY": "# Brief\nall good"})
    assert r.returncode == 0, r.stderr
    assert "# Brief" in r.stdout and "codex:cx" in r.stderr
    (call,) = launches(env)
    a = call["argv"]
    assert a[:2] == ["run", "cx"] and a[a.index("--permission") + 1] == "default"
    prompt = a[a.index("--prompt") + 1]
    assert ".claude/skills/brief/SKILL.md" in prompt and "CLAUDE.md" in prompt


def test_claude_brief_keeps_its_old_invocation(env):
    r = crow(env, "brief", extra={"FAKE_CDX_REPLY": "hello"})
    assert r.returncode == 0 and r.stdout.strip() == "hello", r.stderr
    (call,) = launches(env)
    a = call["argv"]
    assert a[:2] == ["run", "main"] and a[a.index("--prompt") + 1] == "/brief"
    assert a[a.index("--permission") + 1] == "auto"


def test_failed_oneshot_is_reported_not_printed(env):
    r = crow(env, "brief", extra={"FAKE_CDX_RUN": "spawnfail"})
    assert r.returncode == 1 and "run failed on main" in r.stderr and "not found" in r.stderr


def dispatch(env, project, label, *args, extra=None):
    return run(env["hub"], "crow-runs", "dispatch", *args, project, label, "--prompt", "work",
               env={**env["env"], "FAKE_CDX_RUN": "running", **(extra or {})})


def ledger(env):
    f = env["home"] / "local/state/runs.jsonl"
    return [json.loads(l) for l in f.read_text().splitlines()] if f.exists() else []


def test_mixed_jobs_share_one_slot_budget(env):
    assert dispatch(env, "alpha", "a", "--provider", "claude").returncode == 0
    r = dispatch(env, "beta", "b", "--provider", "codex")
    assert r.returncode == 0 and "codex:cx" in r.stdout, r.stderr
    r = dispatch(env, "beta", "c", "--account", "spare", "--read-only")
    assert r.returncode == 1 and "2 runs already running (max 2, all providers)" in r.stderr
    assert [(x["provider"], x["account"]) for x in ledger(env)] == [("claude", "main"), ("codex", "cx")]
    runs = [c["argv"] for c in launches(env) if c["argv"][0] == "run"]
    assert runs[0][runs[0].index("--prompt") + 1] == "work"                      # Claude: unchanged
    pf = runs[1][runs[1].index("--prompt-file") + 1]                              # Codex: references first
    text = open(pf).read()
    assert "AGENTS.md" in text and text.endswith("work")


def test_simultaneous_dispatches_cannot_overbook(env, tmp_path):
    for i in range(3):
        (tmp_path / "work" / "alpha.wt" / f"w{i}").mkdir(parents=True)
    results = []

    def go(i):
        results.append(dispatch(env, "alpha", f"r{i}", "--cwd", str(tmp_path / "work/alpha.wt" / f"w{i}"),
                                "--provider", "codex" if i % 2 else "claude"))
    threads = [threading.Thread(target=go, args=(i,)) for i in range(3)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert sorted(r.returncode for r in results) == [0, 0, 1]
    assert len(ledger(env)) == 2


def test_same_workspace_writer_is_refused_and_worktrees_are_separate(env, tmp_path):
    alpha = env["projects"][0]["path"]
    assert dispatch(env, "alpha", "one").returncode == 0
    r = dispatch(env, "alpha", "two", "--provider", "codex")
    assert r.returncode == 1 and "already writes in" in r.stderr and ".wt/<name>" in r.stderr
    wt = tmp_path / "work" / "alpha.wt" / "two"
    wt.mkdir(parents=True)
    r = dispatch(env, "alpha", "two", "--provider", "codex", "--cwd", str(wt))
    assert r.returncode == 0, r.stderr
    assert [x["cwd"] for x in ledger(env)] == [alpha, str(wt)]
    r = dispatch(env, "alpha", "x", "--cwd", str(tmp_path))
    assert r.returncode == 1 and "worktrees" in r.stderr


def test_read_only_job_may_share_a_workspace(env):
    assert dispatch(env, "alpha", "one").returncode == 0
    r = dispatch(env, "alpha", "look", "--provider", "codex", "--read-only")
    assert r.returncode == 0, r.stderr
    run_call = [c for c in launches(env) if c["argv"][0] == "run"][-1]["argv"]
    assert run_call[run_call.index("--permission") + 1] == "review"


@pytest.mark.parametrize("args,extra,needle", [
    (("--provider", "codex", "--model", "Opus"), {}, "not a codex model"),
    (("--account", "main", "--model", "gpt-6.1-sol"), {}, "not a claude model"),
    (("--account", "mate"), {}, "policy never"),
    (("--account", "cxshared"), {}, "--confirm-account cxshared"),
    (("--provider", "codex"), {"FAKE_CDX_RUN": "spawnfail"}, "dispatch failed on cx"),
    (("--provider", "codex", "--permission", "sudo"), {}, "not one cdx accepts"),
])
def test_refused_or_failed_dispatch_leaves_no_ledger_entry_and_frees_its_slot(env, args, extra, needle):
    r = dispatch(env, "alpha", "x", *args, extra=extra)
    assert r.returncode == 1 and needle in r.stderr, r.stderr
    assert ledger(env) == []
    slots = env["home"] / "local/state/slots.json"
    assert not slots.exists() or json.loads(slots.read_text())["held"] == {}


def test_detached_run_report_and_wait_on_codex(env):
    r = dispatch(env, "beta", "b", "--provider", "codex", extra={"FAKE_CDX_RUN": "finish", "FAKE_CDX_REPLY": "Shipped: x"})
    assert r.returncode == 0
    rid = ledger(env)[0]["run_id"]
    rep = run(env["hub"], "crow-runs", "report", rid[:8], env=env["env"])
    assert rep.stdout.strip() == "Shipped: x"
    w = run(env["hub"], "crow-runs", "wait", rid[:8], env=env["env"])
    assert w.stdout.startswith(f"done {rid[:8]} beta")


def test_finished_run_frees_its_slot(env):
    assert dispatch(env, "alpha", "a", extra={"FAKE_CDX_RUN": "finish"}).returncode == 0
    assert dispatch(env, "beta", "b", extra={"FAKE_CDX_RUN": "finish"}).returncode == 0
    held = json.loads((env["home"] / "local/state/slots.json").read_text())["held"]
    assert len(held) <= 2
    # both finished: a third goes through once the 30 s grace for a fresh run is over
    data = json.loads((env["home"] / "local/state/slots.json").read_text())
    for v in data["held"].values():
        v["claimed_at"] = 0
    (env["home"] / "local/state/slots.json").write_text(json.dumps(data))
    assert dispatch(env, "alpha", "c", "--provider", "codex").returncode == 0


# ---------- helper jobs (2.3) ----------

def helper(env, kind, prompt, extra=None):
    code = (f"import sys,json; sys.path.insert(0,{str(BIN)!r}); import crow_cdx;"
            f"e,t=crow_cdx.helper_run({kind!r},{prompt!r},{{'claude':'haiku','codex':None}},"
            f"operation={'helper-readonly' if kind == 'title' else 'hub-oneshot'!r},cwd={str(env['home'])!r});"
            f"print(json.dumps([e.get('ok'),t['name'],crow_cdx.final_text(e.get('stdout_path'),t['provider'])]))")
    e = {k: v for k, v in os.environ.items() if k != "CROW_ACCOUNT"}
    e.update(env["env"], CROW_HOME=str(env["home"]), CDX_PROFILES=str(env["hub"][1]), **(extra or {}))
    return subprocess.run([PYTHON, "-c", code], capture_output=True, text=True, env=e)


def test_title_and_retro_jobs_on_each_provider(env):
    r = helper(env, "title", "name this", {"CROW_ACCOUNT": "cx", "FAKE_CDX_REPLY": "Fix Login"})
    assert json.loads(r.stdout) == [True, "cx", "Fix Login"], r.stderr
    title = launches(env)[-1]["argv"]
    assert title[title.index("--permission") + 1] == "review" and "--model" not in title
    r = helper(env, "retro", "/brief now", {"CROW_ACCOUNT": "main"})
    assert json.loads(r.stdout)[:2] == [True, "main"], r.stderr
    retro = launches(env)[-1]["argv"]
    assert retro[retro.index("--model") + 1] == "haiku" and retro[retro.index("--prompt") + 1] == "/brief now"
    kinds = [json.loads(l)["kind"] for l in (env["home"] / "local/state/helper-runs.jsonl").read_text().splitlines()]
    assert kinds == ["title", "retro"]


def test_helper_jobs_never_use_an_ask_first_account_unattended(env):
    r = helper(env, "title", "x", {"CROW_ACCOUNT": "cxshared"})
    assert r.returncode == 1 and "ask-first" in r.stderr
    assert launches(env) == []
