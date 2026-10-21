import importlib.machinery
import importlib.util
import json
import os
import time

BIN = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "bin", "crow-retro")


def load(tmp_path):
    loader = importlib.machinery.SourceFileLoader("crow_retro", BIN)
    spec = importlib.util.spec_from_loader("crow_retro", loader)
    mod = importlib.util.module_from_spec(spec)
    loader.exec_module(mod)
    mod.STATE = str(tmp_path)
    mod.QUEUE = str(tmp_path / "queue")
    return mod


def put_failed(tmp_path, name, **entry):
    d = tmp_path / "failed"
    d.mkdir(exist_ok=True)
    (d / name).write_text(json.dumps(entry))
    return d / name


def test_limit_and_instant_provider_refusals_are_transient(tmp_path):
    mod = load(tmp_path)
    assert mod.transient("You've hit your session limit")
    assert mod.transient('{"duration_api_ms":0,"total_cost_usd":0,"usage":{}}')
    assert not mod.transient("digest failed: no such file")


def test_requeue_waits_then_stops_after_max_attempts(tmp_path):
    mod = load(tmp_path)
    f = put_failed(tmp_path, "a.json", session_id="a", transient=True, attempts=1)
    assert mod.requeue_failed() == 0  # too fresh
    os.utime(f, (time.time() - 3600,) * 2)
    assert mod.requeue_failed() == 1
    assert (tmp_path / "queue" / "a.json").exists()
    g = put_failed(tmp_path, "b.json", session_id="b", transient=True, attempts=mod.MAX_ATTEMPTS)
    os.utime(g, (time.time() - 3600,) * 2)
    assert mod.requeue_failed(force=True) == 0
    h = put_failed(tmp_path, "c.json", session_id="c", transient=False, attempts=1)
    assert mod.requeue_failed(force=True) == 0 and h.exists()
