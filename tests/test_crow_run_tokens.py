"""item_213: mech kind, stop-and-report footer, transcript token figures."""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "bin"))
import crow_lib  # noqa: E402


def test_mech_kind_runs_sonnet_with_task_access():
    flags, _ = crow_lib.run_flags("mech", "claude", env={})
    assert flags[flags.index("--model") + 1] == "claude-sonnet-5-5"
    assert flags[flags.index("--budget") + 1] == "8"
    assert crow_lib.RUN_SANDBOX["mech"] == crow_lib.RUN_SANDBOX["task"]
    assert crow_lib.isolation_mode("mech") == "rw"


def test_run_brief_adds_footer_only_for_capped_kinds():
    assert "60 tool calls" in crow_lib.run_brief("task", "do X")
    assert "40 tool calls" in crow_lib.run_brief("mech", "do X")
    assert crow_lib.run_brief("review", "do X") == "do X"
    assert crow_lib.run_brief("retro", "do X") == "do X"


def _ev(mid, req, model, inp, read, write, out):
    return json.dumps({"type": "assistant", "requestId": req, "message": {
        "id": mid, "model": model, "usage": {"input_tokens": inp, "cache_read_input_tokens": read,
                                             "cache_creation_input_tokens": write, "output_tokens": out}}})


def test_transcript_tokens_dedups_and_counts_subagents(tmp_path):
    main = tmp_path / "s.jsonl"
    main.write_text("\n".join([
        _ev("m1", "r1", "claude-opus-5-5", 10, 1000, 0, 5),
        _ev("m1", "r1", "claude-opus-5-5", 10, 1000, 0, 5),  # duplicate event of one call
        _ev("m2", "r2", "claude-opus-5-5", 10, 2000, 100, 7),
        json.dumps({"type": "user", "message": {"content": "hi"}}),
        "not json",
    ]))
    sub = tmp_path / "s" / "subagents"
    sub.mkdir(parents=True)
    (sub / "a.jsonl").write_text(_ev("m3", "r3", "claude-sonnet-5-5", 5, 500, 0, 3))
    t = crow_lib.transcript_tokens(main)
    assert t == {"calls": 3, "context": 1010 + 2110 + 505, "peak": 2110, "output": 15,
                 "models": ["opus-5-5", "sonnet-5-5"]}


def test_fmt_tokens():
    assert crow_lib.fmt_tokens(15_040_000) == "15.0M"
    assert crow_lib.fmt_tokens(117_400) == "117k"
    assert crow_lib.fmt_tokens(900) == "900"
