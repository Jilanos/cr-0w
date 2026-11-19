"""crow-prompt: the PermissionRequest hook record, the pending check and the answer refusals.
No window is touched: answers run dry or hit the refusal paths before any key press."""
import importlib.machinery
import importlib.util
import json

import pytest
from conftest import BIN

loader = importlib.machinery.SourceFileLoader("crow_prompt", str(BIN / "crow-prompt"))
spec = importlib.util.spec_from_loader("crow_prompt", loader)
cp = importlib.util.module_from_spec(spec)
loader.exec_module(cp)

PROJECTS = [
    {"name": "lambda", "scope": "work", "path": "/w/lambda", "remote": "git@gitlab.example:team/lambda.git"},
    {"name": "toy", "scope": "personal", "path": "/p/toy"},
]
WAITING = {"status": "waiting", "waitingFor": "permission prompt", "sessionId": "s1"}


def event(cmd, cwd="/p/toy", tool="Bash"):
    return {"hook_event_name": "PermissionRequest", "session_id": "s1", "cwd": cwd, "tool_name": tool,
            "tool_input": {"command": cmd, "description": "do it"} if tool == "Bash" else cmd}


def test_hook_records_the_exact_command_and_prints_nothing(tmp_path, capsys):
    assert cp.hook(json.dumps(event("date +%s > stamp.txt")), home=tmp_path, pid=42, projects=PROJECTS, now=1.0) == 0
    assert capsys.readouterr().out == ""
    p = json.loads((tmp_path / "local/state/prompts/42.json").read_text())
    assert (p["tool"], p["detail"], p["description"], p["work_approval"]) == ("Bash", "date +%s > stamp.txt", "do it", None)
    assert [o["key"] for o in p["options"]] == ["allow", "deny"]


def test_each_prompt_gets_a_new_id(tmp_path):
    cp.hook(json.dumps(event("ls")), home=tmp_path, pid=42, projects=PROJECTS, now=1.0)
    first = cp.pending(42, home=tmp_path, meta=WAITING)["id"]
    cp.hook(json.dumps(event("ls")), home=tmp_path, pid=42, projects=PROJECTS, now=2.0)
    assert cp.pending(42, home=tmp_path, meta=WAITING)["id"] != first


def test_hook_survives_garbage(tmp_path, capsys):
    assert cp.hook("not json", home=tmp_path, pid=42, projects=PROJECTS) == 0
    assert capsys.readouterr().out == ""


def test_detail_falls_back_to_file_then_raw_input():
    assert cp.detail_of("Edit", {"file_path": "/a/b.py", "old_string": "x"}) == "/a/b.py"
    assert cp.detail_of("mcp__x__y", {"n": 1}) == '{"n": 1}'


def test_work_push_or_mr_is_an_approval():
    assert cp.work_approval("Bash", {"command": "git push origin feat"}, "/w/lambda.wt/feat", PROJECTS) == "lambda"
    assert cp.work_approval("Bash", {"command": "glab mr create --fill"}, "/w/lambda", PROJECTS) == "lambda"
    assert cp.work_approval("Bash", {"command": "git -C /w/lambda push"}, "/p/toy", PROJECTS) == "lambda"
    assert cp.work_approval("Bash", {"command": "git push origin main"}, "/p/toy", PROJECTS) is None
    assert cp.work_approval("Bash", {"command": "git status"}, "/w/lambda", PROJECTS) is None
    rec = cp.record(event("git push", cwd="/w/lambda"), 42, PROJECTS, now=1.0)
    assert [o["key"] for o in rec["options"]] == ["deny"]


def test_pending_needs_the_session_waiting_on_a_permission(tmp_path):
    cp.hook(json.dumps(event("ls")), home=tmp_path, pid=42, projects=PROJECTS, now=1.0)
    assert cp.pending(42, home=tmp_path, meta=WAITING)
    assert cp.pending(42, home=tmp_path, meta={"status": "busy", "sessionId": "s1"}) is None
    assert cp.pending(42, home=tmp_path, meta={**WAITING, "sessionId": "other"}) is None
    assert cp.pending(43, home=tmp_path, meta=WAITING) is None


def test_answer_refuses_stale_or_work_allow_and_presses_nothing(tmp_path):
    cp.hook(json.dumps(event("ls")), home=tmp_path, pid=42, projects=PROJECTS, now=1.0)
    pid_ = cp.pending(42, home=tmp_path, meta=WAITING)["id"]
    assert cp.answer(42, "old", "allow", home=tmp_path, meta=WAITING)[0] == 1
    assert cp.answer(42, pid_, "allow", home=tmp_path, meta={"status": "idle"})[0] == 1
    assert cp.answer(42, pid_, "maybe", home=tmp_path, meta=WAITING)[0] == 2
    code, msg = cp.answer(42, pid_, "allow", dry=True, backend="tmux", home=tmp_path, meta=WAITING)
    assert code == 0 and "press 1" in msg
    assert cp.answer(42, pid_, "allow", backend="print", home=tmp_path, meta=WAITING)[0] == 1

    cp.hook(json.dumps(event("git push", cwd="/w/lambda")), home=tmp_path, pid=42, projects=PROJECTS, now=3.0)
    wid = cp.pending(42, home=tmp_path, meta=WAITING)["id"]
    code, msg = cp.answer(42, wid, "allow", home=tmp_path, meta=WAITING)
    assert code == 1 and "work approval on lambda" in msg
    assert cp.answer(42, wid, "deny", dry=True, backend="tmux", home=tmp_path, meta=WAITING)[0] == 0


def test_claude_pid_walks_up_to_the_claude_process(tmp_path):
    for pid, ppid, argv in ((30, 20, b"bash\0-c\0hook"), (20, 10, b"node\0/usr/bin/claude\0"), (10, 1, b"fish")):
        d = tmp_path / str(pid)
        d.mkdir()
        (d / "stat").write_text(f"{pid} (x) S {ppid} 0")
        (d / "cmdline").write_bytes(argv)
    assert cp.claude_pid(30, proc=str(tmp_path)) == 20


ASKS = {"questions": [
    {"question": "Pick a color?", "header": "Color", "multiSelect": False,
     "options": [{"label": "Red", "description": "warm"}, {"label": "Blue", "description": "cold"},
                 {"label": "Green", "description": "calm"}]},
    {"question": "Pick fruits?", "header": "Fruits", "multiSelect": True,
     "options": [{"label": "Apple"}, {"label": "Pear"}, {"label": "Kiwi"}]},
    {"question": "Pick a size?", "header": "Size", "multiSelect": False,
     "options": [{"label": "Small"}, {"label": "Large"}]}]}
ASKING = {"status": "waiting", "waitingFor": "input needed", "sessionId": "s1"}


def ask_event(inp=ASKS):
    return {"hook_event_name": "PermissionRequest", "tool_name": "AskUserQuestion", "tool_input": inp,
            "session_id": "s1", "cwd": "/p/toy"}


def test_hook_records_the_full_questions_and_offers_cancel_only(tmp_path):
    cp.hook(json.dumps(ask_event()), home=tmp_path, pid=42, projects=PROJECTS, now=1.0)
    p = cp.pending(42, home=tmp_path, meta=ASKING)
    assert p["detail"] == "Pick a color?"
    assert [o["key"] for o in p["options"]] == ["deny"]
    assert [q["header"] for q in p["questions"]] == ["Color", "Fruits", "Size"]
    assert p["questions"][0]["options"][1] == {"label": "Blue", "description": "cold"}
    assert p["questions"][1]["options"][0]["description"] is None
    assert cp.public(p)["questions"] == p["questions"]
    # a Bash prompt is never pending on "input needed"
    cp.hook(json.dumps(event("ls")), home=tmp_path, pid=43, projects=PROJECTS, now=1.0)
    assert cp.pending(43, home=tmp_path, meta=ASKING) is None
    assert cp.public(cp.pending(43, home=tmp_path, meta=WAITING))["questions"] is None


def test_ask_keys_follow_the_claude_code_menu():
    qs = cp.questions_of(ASKS)
    steps = cp.ask_keys(qs, [[1], [0, 2], {"other": "medium please"}])
    assert steps == [("key", "2"),
                     ("key", "1"), ("key", "3"), ("special", "down"), ("special", "down"), ("special", "down"),
                     ("special", "down"), ("special", "enter"),
                     ("key", "3"), ("text", "medium please"), ("special", "enter"),
                     ("key", "1")]
    multi_other = cp.ask_keys(qs[1:2], [{"options": [0], "other": "a hamster"}])
    assert multi_other == [("key", "1"), ("key", "4"), ("special", "down"), ("special", "down"),
                           ("special", "down"), ("text", "a hamster"), ("special", "down"),
                           ("special", "enter"), ("key", "1")]
    # one single-select question: the digit submits, no review step
    assert cp.ask_keys(qs[:1], [[2]]) == [("key", "3")]
    assert cp.ask_summary(qs, [[1], [0, 2], {"other": "medium please"}]) == \
        "Color → Blue; Fruits → Apple, Kiwi; Size → medium please"


def test_ask_keys_refuse_bad_answers():
    qs = cp.questions_of(ASKS)
    for bad in ([[1]], [[1, 2], [0], [0]], [[3], [0], [0]], [[1], [], [0]], [[1], [0], {"other": ""}],
                [[1], [0], {"other": "a\nb"}], [[True], [0], [0]], [[1], [0, 0], [0]], "x"):
        with pytest.raises(ValueError):
            cp.ask_keys(qs, bad)


def test_answer_questions_checks_the_prompt_and_presses_nothing_on_refusal(tmp_path):
    cp.hook(json.dumps(ask_event()), home=tmp_path, pid=42, projects=PROJECTS, now=1.0)
    pid_ = cp.pending(42, home=tmp_path, meta=ASKING)["id"]
    ans = [[1], [0, 2], {"other": "medium please"}]
    assert cp.answer(42, "old", answers=ans, home=tmp_path, meta=ASKING)[0] == 1
    assert cp.answer(42, pid_, "allow", home=tmp_path, meta=ASKING)[0] == 1
    assert cp.answer(42, pid_, answers=[[1]], dry=True, backend="tmux", home=tmp_path, meta=ASKING)[0] == 2
    code, msg = cp.answer(42, pid_, answers=ans, dry=True, backend="tmux", home=tmp_path, meta=ASKING)
    assert code == 0 and "'medium please'" in msg and "Size → medium please" in msg
    assert cp.answer(42, pid_, answers=ans, backend="print", home=tmp_path, meta=ASKING)[0] == 1
    assert cp.answer(42, pid_, "deny", dry=True, backend="tmux", home=tmp_path, meta=ASKING)[0] == 0
    cp.hook(json.dumps(event("ls")), home=tmp_path, pid=42, projects=PROJECTS, now=2.0)
    bid = cp.pending(42, home=tmp_path, meta=WAITING)["id"]
    assert cp.answer(42, bid, answers=[[0]], dry=True, backend="tmux", home=tmp_path, meta=WAITING)[0] == 2


def keyboard(monkeypatch):
    """Record the keys answer() presses instead of touching a window."""
    pressed = []
    monkeypatch.setattr(cp, "KEY_PAUSE", 0)
    monkeypatch.setattr(cp.crow_term, "send_key", lambda pid, k, b=None: pressed.append(k) or True)
    monkeypatch.setattr(cp.crow_term, "send_special", lambda pid, k, b=None: pressed.append(k) or True)
    monkeypatch.setattr(cp.crow_term, "send_escape", lambda pid, b=None: pressed.append("escape") or True)
    return pressed


def test_a_prompt_is_answered_once_and_a_second_answer_presses_nothing(tmp_path, monkeypatch):
    # Claude's status file lags the dialog: a second answer must not type digits into the input.
    pressed = keyboard(monkeypatch)
    cp.hook(json.dumps(ask_event()), home=tmp_path, pid=42, projects=PROJECTS, now=1.0)
    pid_ = cp.pending(42, home=tmp_path, meta=ASKING)["id"]
    ans = [[1], [0, 2], [0]]
    assert cp.answer(42, pid_, answers=ans, backend="tmux", home=tmp_path, meta=ASKING)[0] == 0
    first = list(pressed)
    assert first[-1] == "1"
    code, _msg = cp.answer(42, pid_, answers=ans, backend="tmux", home=tmp_path, meta=ASKING)
    assert code == 1 and pressed == first
    cp.hook(json.dumps(event("ls")), home=tmp_path, pid=42, projects=PROJECTS, now=2.0)
    bid = cp.pending(42, home=tmp_path, meta=WAITING)["id"]
    assert cp.answer(42, bid, "allow", backend="tmux", home=tmp_path, meta=WAITING)[0] == 0
    assert cp.answer(42, bid, "allow", backend="tmux", home=tmp_path, meta=WAITING)[0] == 1
    assert pressed == first + ["1"]


def test_keys_stop_when_the_dialog_closes(tmp_path, monkeypatch):
    # No key is pressed once the session stops waiting: it would land in the input line.
    pressed = keyboard(monkeypatch)
    cp.hook(json.dumps(ask_event()), home=tmp_path, pid=42, projects=PROJECTS, now=1.0)
    pid_ = cp.pending(42, home=tmp_path, meta=ASKING)["id"]
    states = iter([ASKING, ASKING, {"status": "idle", "sessionId": "s1"}])
    code, _ = cp.answer(42, pid_, answers=[[1], [0, 2], [0]], backend="tmux", home=tmp_path, meta=ASKING,
                        live=lambda: next(states, {"status": "idle"}))
    assert code == 0 and pressed == ["2", "1", "3"]


def test_a_prompt_left_by_a_missing_window_can_be_answered_again(tmp_path, monkeypatch):
    keyboard(monkeypatch)
    monkeypatch.setattr(cp.crow_term, "send_key", lambda *a: False)
    cp.hook(json.dumps(event("ls")), home=tmp_path, pid=42, projects=PROJECTS, now=1.0)
    bid = cp.pending(42, home=tmp_path, meta=WAITING)["id"]
    assert cp.answer(42, bid, "allow", backend="tmux", home=tmp_path, meta=WAITING)[0] == 1
    assert cp.pending(42, home=tmp_path, meta=WAITING)["id"] == bid
