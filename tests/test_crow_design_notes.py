"""item_219: design-notes file surfaced after compaction, review crops."""
import json
import os
import shutil
import subprocess

import pytest

BIN = os.path.join(os.path.dirname(__file__), "..", "bin")


def _run(args, stdin=None, env=None):
    return subprocess.run([os.path.join(BIN, args[0]), *args[1:]], input=stdin, capture_output=True,
                          text=True, env={**os.environ, **(env or {})})


def _transcript(tmp_path, texts=(), writes=()):
    rows = [{"type": "user", "message": {"content": x}} for x in texts]
    rows += [{"type": "assistant", "message": {"content": [
        {"type": "tool_use", "name": tool, "input": {"file_path": str(p), "content": "x"}}]}}
        for tool, p in writes]
    t = tmp_path / "t.jsonl"
    t.write_text("\n".join(json.dumps(r, separators=(",", ":")) for r in rows))
    return t


def _notes(vault, *names):
    out = []
    for n, body in names:
        p = vault / n / "design-notes.md"
        p.parent.mkdir(parents=True)
        p.write_text(body)
        out.append(p)
    return out


def test_hook_prints_last_written_notes_after_compaction(tmp_path):
    vault = tmp_path / "Vault Dir" / "Research"
    old, new, other = _notes(vault, ("a", "old"), ("b", "## Decided\n- quiet = purple"), ("c", "other"))
    t = _transcript(tmp_path, [f"see {other}"], [("Write", old), ("Edit", new)])
    env = {"CROW_RESEARCH_DIR": str(vault)}
    out = _run(["crow-design-notes", "hook"], json.dumps({"source": "compact", "transcript_path": str(t)}), env)
    assert str(new) in out.stdout and "quiet = purple" in out.stdout
    start = _run(["crow-design-notes", "hook"], json.dumps({"source": "startup", "transcript_path": str(t)}), env)
    assert start.stdout == ""


def test_hook_silent_when_notes_only_mentioned(tmp_path):
    vault = tmp_path / "Research"
    (notes,) = _notes(vault, ("a", "decided"))
    t = _transcript(tmp_path, [f"the notes live in {notes}"])
    out = _run(["crow-design-notes", "hook"], json.dumps({"source": "compact", "transcript_path": str(t)}),
               {"CROW_RESEARCH_DIR": str(vault)})
    assert out.returncode == 0 and out.stdout == ""
    assert _run(["crow-design-notes", "find", str(t)]).stdout.strip() == str(notes)


def test_hook_silent_without_notes(tmp_path):
    t = _transcript(tmp_path, ["no design here, missing /x/design-notes.md"])
    out = _run(["crow-design-notes", "hook"], json.dumps({"source": "compact", "transcript_path": str(t)}),
               {"CROW_RESEARCH_DIR": str(tmp_path)})
    assert out.returncode == 0 and out.stdout == ""


@pytest.mark.skipif(not shutil.which("magick"), reason="needs ImageMagick")
def test_crop_and_sheet_stay_under_width(tmp_path):
    imgs = []
    for i in range(2):
        p = tmp_path / f"r{i}.png"
        subprocess.run(["magick", "-size", "1600x1200", "xc:gray", str(p)], check=True)
        imgs.append(str(p))
    out = _run(["crow-crop", *imgs, "--region", "800x600+0+0", "--width", "300", "--out", str(tmp_path / "c")])
    sheet = _run(["crow-crop", "--sheet", *imgs, "--out", str(tmp_path / "s.png")])
    sizes = [subprocess.run(["magick", "identify", "-format", "%w", p], capture_output=True, text=True).stdout
             for p in out.stdout.split() + sheet.stdout.split()]
    assert [int(s) <= w for s, w in zip(sizes, (300, 300, 800))] == [True, True, True]
