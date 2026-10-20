# Session retros

Every finished session gets a short retrospective, so lessons land in skills, runbooks and memories without the user repeating them.

## Pipeline
1. **Hook**: `SessionEnd` in the cdx profile's `.claude/settings.json` runs `bin/crow-retro hook`.
   It skips sessions with fewer than 2 user messages and any session started with `CROW_RETRO=1` (the retros themselves).
2. **Queue**: `local/state/retros/queue/<session>.json`. One worker at a time (`flock`), started detached by the hook.
3. **Digest**: `bin/crow-digest <transcript.jsonl>` cuts a multi-MB transcript to ~25 KB: user messages in full, trimmed assistant prose, one line per tool call, tool errors.
4. **Analysis**: `cdx run <account> --model sonnet` on `/retro digest=... transcript=... cwd=...` (skill: `.claude/skills/retro/`).
   Applies lessons to untracked files (project skills under gitignored `.claude/`, memories, hub runbooks/skills), proposes the rest in `local/state/retros/proposals.md`.
5. **Report**: `local/state/retros/YYYY-MM-DD-<project>-<session8>.md`; the brief's 🔁 section lists them.

## Operate
- `bin/crow-retro status`: queue size and the worker log.
- `bin/crow-retro add <transcript.jsonl>`: retro a session by hand (transcripts: `<profile>/.claude/projects/<cwd-slug>/<session>.jsonl`).
- Failed runs move to `local/state/retros/failed/`; move the file back to `queue/` and run `bin/crow-retro add` or `work` to retry.
- Model: `CROW_RETRO_MODEL` (default `sonnet`).

## Known gaps
- Sonnet tends to miss causes on the hub side (a vague handoff prompt). The report now has a mandatory "Hub handoff" line; spot-check it.
- cdx writes its own notify hooks into the same settings file. If retros stop appearing, check `jq .hooks.SessionEnd` there first.
- A provider failure (usage limit reached) drops the queue entry and the retro is lost. Re-run the digests from `local/state/retros/digests/` by hand with `/retro`.
- Retrying `claude -p` unsandboxed to test auth is blocked by the auto-mode classifier ([Safety Bypass Flag]). Test inside the sandbox or ask the user to run it with `!`.
