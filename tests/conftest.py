"""Shared fixtures: run bin/ scripts against a throwaway hub home and cdx profiles dir."""
import json
import os
import subprocess
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
    e = {k: v for k, v in os.environ.items() if k != "CROW_ACCOUNT"}
    e.update(CROW_HOME=str(home), CDX_PROFILES=str(profiles), **(env or {}))
    return subprocess.run([str(BIN / script), *args], capture_output=True, text=True,
                          input=input, env=e)


def write_jsonl(path, events):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(e) + "\n" for e in events))
