"""item_229: crow-keep-awake per platform, the WSL sleep check of crow-afk-preflight, the download relay guard."""
import base64
import os
import shutil
import subprocess

from conftest import BIN


def _stub(d, name, code=0, out=""):
    d.mkdir(exist_ok=True)
    f = d / name
    f.write_text(f"#!/bin/sh\necho '{out}'\nexit {code}\n" if out else f"#!/bin/sh\nexit {code}\n")
    f.chmod(0o755)


def _proc(tmp_path, wsl):
    f = tmp_path / "version"
    f.write_text("Linux version 6.6.87-microsoft-standard-WSL2\n" if wsl else "Linux version 7.2.15-arch1-1\n")
    return str(f)


def _awake(tmp_path, *args, wsl=False, path=None):
    env = dict(os.environ, CROW_PROC_VERSION=_proc(tmp_path, wsl))
    if path is not None:
        env["PATH"] = path
    return subprocess.run([shutil.which("bash"), str(BIN / "crow-keep-awake"), *args], capture_output=True, text=True, env=env,
                          check=False)


def test_no_inhibitor_is_a_no_op(tmp_path):
    only = tmp_path / "only"
    only.mkdir()
    (only / "grep").symlink_to(shutil.which("grep"))
    r = _awake(tmp_path, "60", path=str(only))
    assert r.returncode == 0
    assert "nothing to do" in r.stdout


def test_linux_uses_systemd_inhibit(tmp_path):
    _stub(tmp_path / "bin", "systemd-inhibit")
    r = _awake(tmp_path, "--print", "60", path=f"{tmp_path / 'bin'}:{os.environ['PATH']}")
    assert r.returncode == 0
    assert r.stdout.strip() == ("systemd-inhibit --what=sleep:idle:handle-lid-switch --who=crow-afk "
                                "--why=afk-runs sleep 60")


def test_wsl_uses_an_encoded_powershell_command(tmp_path):
    r = _awake(tmp_path, "--print", "60", wsl=True)
    assert r.returncode == 0
    words = r.stdout.split()
    assert words[:4] == ["powershell.exe", "-NoProfile", "-NonInteractive", "-EncodedCommand"]
    script = base64.b64decode(words[4]).decode("utf-16-le")
    assert "SetThreadExecutionState([uint32]2147483651)" in script
    assert 'Write-Output "awake for 60 s"' in script


def test_bad_seconds_are_refused(tmp_path):
    assert _awake(tmp_path, "--print", "1h").returncode == 2


def _preflight(tmp_path, pgrep_code):
    _stub(tmp_path / "bin", "pgrep", pgrep_code)
    env = dict(os.environ, CROW_HOME=str(tmp_path), CROW_PROC_VERSION=_proc(tmp_path, True),
               PATH=f"{tmp_path / 'bin'}:{os.environ['PATH']}")
    return subprocess.run(["bash", str(BIN / "crow-afk-preflight")], capture_output=True, text=True, env=env,
                          check=False).stdout


def test_preflight_on_wsl_sees_keep_awake(tmp_path):
    assert "OK    Windows sleep blocked (crow-keep-awake)" in _preflight(tmp_path, 0)


def test_preflight_on_wsl_warns_without_keep_awake(tmp_path):
    out = _preflight(tmp_path, 1)
    assert "WARN  Windows sleep not blocked: run bin/crow-keep-awake" in out
    assert "systemd-inhibit" not in out


def test_relay_refuses_a_dest_outside_its_root(tmp_path):
    root = tmp_path / "run"
    root.mkdir()
    (root / "have.pdf").write_text("x")
    m = root / "manifest.tsv"
    m.write_text(f"https://example.invalid/a\t{tmp_path / 'outside.pdf'}\n"
                 f"https://example.invalid/b\t{root / 'have.pdf'}\n"
                 f"https://example.invalid/c\trelative.pdf\n")
    (root / "manifest.tsv.done").write_text("")
    r = subprocess.run(["bash", str(BIN / "crow-download-relay"), str(m)], capture_output=True, text=True,
                       check=False, timeout=30)
    log = (root / "manifest.download.log").read_text().splitlines()
    assert log == [f"REFUSED\t{tmp_path / 'outside.pdf'}", f"OK\t{root / 'have.pdf'}", "REFUSED\trelative.pdf"]
    assert "1 ok, 0 failed, 2 refused" in r.stdout
    assert not (tmp_path / "outside.pdf").exists()
