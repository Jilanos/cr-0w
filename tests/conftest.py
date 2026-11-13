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
FIXTURES = REPO / "tests" / "fixtures"

TPL = """---
type: daily
created: <% tp.date.now("YYYY-MM-DD", 0, tp.file.title, "YYYY-MM-DD") %>
---

# <% tp.date.now("dddd D MMMM YYYY", 0, tp.file.title, "YYYY-MM-DD") %>

## 🎯 Focus
- [ ] <% tp.file.cursor() %>

## 📥 Capture (dump anything, triage later)
- 

## ✅ Tasks
```tasks
not done
```

## 📆 Meetings & notes
- 

## 🌙 End of day
- **Shipped:** 
- **Blocked / carry over:** 
"""


@pytest.fixture
def vault(tmp_path):
    v = tmp_path / "vault"
    (v / "90 Templates").mkdir(parents=True)
    (v / "90 Templates" / "Daily Note.md").write_text(TPL)
    (v / "40 Journal" / "Daily").mkdir(parents=True)
    (v / "00 Inbox").mkdir()
    (v / "10 Work").mkdir()
    return v


ACCOUNTS = """\
default: main
accounts:
  - {name: main,   policy: use,       memory: permanent}
  - {name: shared, policy: ask-first, memory: session}
  - {name: mate,   policy: never}
  - {name: typo,   policy: usee}
  - {name: spare,  policy: use,       memory: permanent}
"""


def _python_with_yaml():
    """First interpreter that has PyYAML: the running one, then the system ones."""
    for cand in (sys.executable, shutil.which("python3"), "/usr/bin/python3"):
        if cand and subprocess.run([cand, "-c", "import yaml"], check=False, capture_output=True).returncode == 0:
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


def run(hub, script, *args, input=None, env=None):
    home, profiles = hub
    e = {k: v for k, v in os.environ.items() if k not in ("CROW_ACCOUNT", "CROW_SESSION_ACCOUNT", "CROW_TERMINAL", "TMUX")}
    # The core is a fake by default: no test reaches a real `crow mission` (fixtures/fake_core.py).
    e.update(CROW_HOME=str(home), CDX_PROFILES=str(profiles),
             CROW_CORE_CMD=f"{PYTHON or sys.executable} {FIXTURES / 'fake_core.py'}", **(env or {}))
    cmd = [str(BIN / script), *args]
    if _is_python_script(BIN / script):
        if PYTHON is None:
            pytest.skip("no python with PyYAML found (pip install pyyaml)")
        cmd = [PYTHON, *cmd]
    return subprocess.run(cmd, check=False, capture_output=True, text=True,
                          input=input, env=e)


def write_jsonl(path, events):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(e) + "\n" for e in events))
