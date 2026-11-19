"""crow panel start/stop/status: background control around crow-panel serve."""
import os
from pathlib import Path
import subprocess

CTL = Path(__file__).resolve().parents[1] / "bin/crow-panel-ctl"


def run(home, *args):
    env = {**os.environ, "CROW_HOME": str(home)}
    return subprocess.run([str(CTL), *args], env=env, capture_output=True, text=True, timeout=30)


def test_status_without_server(tmp_path):
    result = run(tmp_path, "status")
    assert result.returncode == 3
    assert "not running" in result.stdout


def test_stale_pid_is_not_trusted(tmp_path):
    state = tmp_path / "local/state"
    state.mkdir(parents=True)
    # PID 1 exists but is not a panel server: never signalled.
    (state / "panel-server.pid").write_text("1\n")
    assert "not running" in run(tmp_path, "status").stdout
    result = run(tmp_path, "stop")
    assert result.returncode == 0 and "not running" in result.stdout
    assert not (state / "panel-server.pid").exists()


def test_start_requires_config(tmp_path):
    result = run(tmp_path, "start")
    assert result.returncode == 1
    assert "config not found" in result.stderr


def test_unknown_command(tmp_path):
    assert run(tmp_path, "bogus").returncode == 1
