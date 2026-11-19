"""Module inventory for adr_002: lists every engine piece and joins it with its brick tag.

Pieces: bin/ scripts, skills (.claude/skills and skills/), runbooks, Claude hooks, git hooks,
crow-core routes and script sections, tools/ apps, integrations.
Tags live in bricks.tsv next to this file (kind, name, brick).

Usage: python3 inventory.py [--check] [--markdown]  (tests/test_module_inventory.py runs --check)
  --check     exit 1 when a piece has no tag or a tag names no piece
  --markdown  print the ADR table (default: tab-separated rows)
"""
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
BRICKS = {
    "core", "git", "forge", "vault", "mail", "team", "afk", "retro", "design",
    "releases", "deck", "nest", "core-api", "integration-shell", "office",
}


def first_line(path):
    """First descriptive comment or docstring line of a script."""
    try:
        lines = path.read_text(errors="replace").splitlines()[:40]
    except (IsADirectoryError, UnicodeDecodeError):
        return ""
    for ln in lines[1:] if lines and lines[0].startswith("#!") else lines:
        s = ln.strip().strip('"').strip()
        if s.startswith("#"):
            s = s.lstrip("#").strip()
        if s and not s.startswith(("set -", "import", "from ", "-*-", "shellcheck")):
            return s[:90]
    return ""


def skill_desc(path):
    m = re.search(r"^description:\s*(.+)$", path.read_text(errors="replace"), re.MULTILINE)
    return (m.group(1).strip()[:90] if m else "")


def pieces():
    out = []
    for p in sorted((ROOT / "bin").iterdir()):
        if p.name.startswith("__") or p.is_dir():
            continue
        desc = f"alias of {p.resolve().name}" if p.is_symlink() else first_line(p)
        out.append(("script", p.name, desc))
    for d in (".claude/skills", "skills"):
        for p in sorted((ROOT / d).iterdir()):
            if p.resolve().is_relative_to(ROOT / "local"):
                continue  # private skill linked from local/, not an engine piece
            if p.is_dir() and (p / "SKILL.md").exists():
                out.append(("skill", p.name, skill_desc(p / "SKILL.md")))
    out.append(("skill-list", "skills/ext.list", "third-party design skills bundle"))
    for p in sorted((ROOT / "runbooks").glob("*.md")):
        if p.name != "README.md":
            out.append(("runbook", p.stem, ""))
    settings = json.loads((ROOT / ".claude/settings.json").read_text())
    seen = set()
    for event, groups in settings.get("hooks", {}).items():
        for g in groups:
            for h in g.get("hooks", []):
                cmd = h.get("command", "").replace('"$CLAUDE_PROJECT_DIR"/bin/', "")
                if cmd not in seen:
                    seen.add(cmd)
                    out.append(("claude-hook", cmd, event))
    for name in ("commit-msg", "pre-commit", "pre-push"):
        out.append(("git-hook", name, "installed per repo, runs bin/crow-*-check"))
    api = ROOT / "tools/crow-core/internal/api"
    for f in sorted(api.glob("*.go")):
        if f.name.endswith("_test.go"):
            continue
        for m in re.finditer(r'HandleFunc\("([A-Z]+ /api/[^"]+)"', f.read_text()):
            out.append(("core-route", m.group(1), f.name))
    serve = (ROOT / "tools/crow-core/serve_cmd.go").read_text()
    for m in re.finditer(r'\{"([a-z]+)", \d+ \* time\.Second, [^,]+, \[\]string\{"([a-z-]+)"', serve):
        out.append(("core-section", m.group(1), f"from bin/{m.group(2)}"))
    out.append(("core-section", "jobs", "systemd timers"))
    for p in sorted((ROOT / "tools").iterdir()):
        if p.is_dir():
            out.append(("app", f"tools/{p.name}", ""))
    for p in sorted((ROOT / "integrations").iterdir()):
        if p.is_dir():
            out.append(("integration", f"integrations/{p.name}", ""))
    return out


def tags():
    t = {}
    for ln in (HERE / "bricks.tsv").read_text().splitlines():
        if ln.strip() and not ln.startswith("#"):
            kind, name, brick = ln.split("\t")[:3]
            t[(kind, name)] = brick
    return t


def main(argv):
    ps, t = pieces(), tags()
    keys = {(k, n) for k, n, _ in ps}
    missing = [f"{k}\t{n}" for k, n, _ in ps if (k, n) not in t]
    stale = [f"{k}\t{n}" for (k, n) in t if (k, n) not in keys]
    unknown = [f"{k}\t{n}\t{b}" for (k, n), b in t.items() if b not in BRICKS]
    if "--check" in argv:
        for label, rows in (("untagged", missing), ("stale tag", stale), ("unknown brick", unknown)):
            for r in rows:
                print(f"{label}: {r}")
        print(f"{len(ps)} pieces, {len(missing)} untagged, {len(stale)} stale, {len(unknown)} unknown brick")
        return 1 if missing or stale or unknown else 0
    if "--markdown" in argv:
        print("| Brick | Kind | Piece | What it is |\n| --- | --- | --- | --- |")
        order = sorted(BRICKS)
        for k, n, d in sorted(ps, key=lambda r: (order.index(t.get((r[0], r[1]), "core")), r[0], r[1])):
            print(f"| {t.get((k, n), '?')} | {k} | `{n}` | {d.replace('|', '/')} |")
        return 0
    for k, n, d in ps:
        print(f"{k}\t{n}\t{t.get((k, n), '?')}\t{d}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
