"""Shared fixtures: run bin/ scripts against a throwaway hub home and cdx profiles dir."""
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent
BIN = REPO / "bin"

ACCOUNTS = """\
default: main
accounts:
  - {name: main,   policy: use,       memory: permanent}
  - {name: shared, policy: ask-first, memory: session}
  - {name: mate,   policy: never}
  - {name: typo,   policy: usee}
  - {name: spare,  policy: use,       memory: permanent}
"""

# Claude-only accounts above plus Codex ones (names match tests/fixtures/cdx-0.21.5/status.json).
MIXED_ACCOUNTS = ACCOUNTS + """\
  - {name: cx,       policy: use,       provider: codex}
  - {name: cxshared, policy: ask-first, provider: codex}
  - {name: cxoff,    policy: use}
  - {name: ag,       policy: use}
  - {name: liar,     policy: use,       provider: codex}
"""


def _python_with_yaml():
    """First interpreter that has PyYAML: the running one, then the system ones."""
    for cand in (sys.executable, shutil.which("python3"), "/usr/bin/python3"):
        if cand and subprocess.run([cand, "-c", "import yaml"], capture_output=True).returncode == 0:
            return cand
    return None


PYTHON = _python_with_yaml()


def _is_python_script(path):
    with open(path, "rb") as f:
        return b"python" in f.readline()


@pytest.fixture
def hub(tmp_path):
    """A hub home with local/accounts.yaml and an empty cdx profiles dir."""
    home = tmp_path / "hub"
    (home / "local" / "state").mkdir(parents=True)
    (home / "local" / "accounts.yaml").write_text(ACCOUNTS)
    (home / "bin").symlink_to(BIN)
    profiles = tmp_path / "profiles"
    profiles.mkdir()
    return home, profiles


def _default_fake_bin():
    """Every script run gets the fake cdx unless a test brings its own PATH: no test reads the
    machine's real cdx accounts."""
    import tempfile
    d = Path(tempfile.mkdtemp(prefix="crow-fakebin-"))
    (d / "cdx").symlink_to(REPO / "tests" / "fakecdx")
    return d


DEFAULT_FAKE_BIN = _default_fake_bin()


def run(hub, script, *args, input=None, env=None):
    home, profiles = hub
    e = {k: v for k, v in os.environ.items() if k != "CROW_ACCOUNT"}
    e.update({"CROW_HOME": str(home), "CDX_PROFILES": str(profiles), "PATH": f"{DEFAULT_FAKE_BIN}:{os.environ['PATH']}",
              "FAKE_CDX_STATE": str(home.parent / "fakecdx-default"), "FAKE_CDX_PROFILES": str(profiles)})
    e.update(env or {})
    cmd = [str(BIN / script), *args]
    if _is_python_script(BIN / script):
        if PYTHON is None:
            pytest.skip("no python with PyYAML found (pip install pyyaml)")
        cmd = [PYTHON, *cmd]
    return subprocess.run(cmd, capture_output=True, text=True,
                          input=input, env=e)


def write_jsonl(path, events):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(e) + "\n" for e in events))


FAKE_CDX = REPO / "tests" / "fakecdx"


@pytest.fixture
def fake_cdx(hub, tmp_path):
    """A fake cdx first on PATH (tests/fakecdx). Returns (env, calls, state dir)."""
    d = tmp_path / "fakebin"
    d.mkdir()
    (d / "cdx").symlink_to(FAKE_CDX)
    state = tmp_path / "fakecdx"
    env = {"PATH": f"{d}:{os.environ['PATH']}", "FAKE_CDX_STATE": str(state),
           "FAKE_CDX_PROFILES": str(hub[1])}

    def calls():
        f = state / "calls.jsonl"
        return [json.loads(l) for l in f.read_text().splitlines()] if f.exists() else []
    return env, calls, state


def mixed(hub):
    (hub[0] / "local" / "accounts.yaml").write_text(MIXED_ACCOUNTS)
