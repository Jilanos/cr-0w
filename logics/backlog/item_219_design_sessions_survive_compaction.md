## item_219_design_sessions_survive_compaction - Design sessions survive compaction
> From version: 1.0.0
> Schema version: 1.0
> Status: In progress
> Understanding: 90%
> Confidence: 85%
> Progress: 90%
> Complexity: Low
> Theme: General
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: Image-heavy design sessions hit the 150k auto-compact cap about hourly and lose decisions. Keep the cap; change the design workflow so nothing decided is lost and screenshots cost less context.
- Keywords: design, compaction, context cap, screenshots, crops, design notes, tokens
- Use when: building the design-session workflow, crow-ctx cap rules, screenshot review tooling.
- Skip when: non-visual work.

# Problem
- In the item_212/item_215 board session (2026-11-16) the session compacted several times in one afternoon. Each compaction dropped detail: an already decided colour (quiet = purple) was asked again.
- The main context cost is images: full 2x screenshots read back for review, plus large render sources.
- The owner chose to keep the 150k cap and change the workflow instead of raising it.

# Scope
- In:
  - A design-notes file convention: `design-notes.md` in the item's vault research folder, sections Decided / Rejected / Open / Files. Updated after every owner answer, read first after a compaction or in a new session.
  - Hook it in so it is automatic: the compaction summary or a post-compact step points to the notes file (check what crow-ctx and the hooks already offer first).
  - Cheap visual review: a helper (bin/) that makes downscaled review crops and contact sheets (magick crop + resize to a target width, several renders side by side) so the model never reads full 2x screenshots.
  - Runbook entry (runbooks/) for design sessions: notes file, crops only, render through scripts, compare pages via bin/crow-compare.
- Out:
  - Raising the auto-compact cap.
  - The board design itself (item_215).

# Acceptance criteria
- AC1: Runbook documents the design-session workflow and is indexed in runbooks/README.md.
- AC2: A bin/ helper produces downscaled crops/contact sheets from a list of PNGs and regions; default output is at most ~800px wide.
- AC3: After a compaction in a design session, the notes file is surfaced automatically (hook or crow-ctx), verified once by hand.
- AC4: The existing example `Research/nest-design/item_212/design-notes.md` follows the convention.

# AC Traceability
- AC1 -> runbooks/design-sessions.md, indexed in runbooks/README.md. Proof: file + index line.
- AC2 -> bin/crow-crop (crops and `--sheet` contact sheets, 800px default, out in local/state/crops). Proof: run on item_212/board-real laptop-a1..a3 (1304x1632 -> 800 crop, 798x347 sheet); tests/test_crow_design_notes.py.
- AC3 -> bin/crow-design-notes hook, project SessionStart matcher `compact`. Proof: on the real item_212 session transcript (37 MB) it prints the item_212 notes in 0.4s; silent on startup and when no notes exist (tests). Live check 2026-11-17: a real compaction of a hub session fired the hook, which surfaced the item_212 notes because the session had named them. Fixed: the hook now needs an Edit/Write of the notes file in the session (test added); the item_212 session still gets its notes, the hub session nothing. Pending: one live /compact in the next design session.
- AC4 -> vault Research/nest-design/item_212/design-notes.md already has Decided / Rejected / Open / Files. Proof: file review 2026-11-17.

# Decision framing
- Product framing: Not needed
- Architecture framing: Not needed

# Links
- Product brief(s): (none yet)
- Architecture decision(s): (none yet)
- Request: (none, from owner decision 2026-11-16)
- Primary task(s): (none yet)
- Related: item_212, item_215, memory design-notes-file

# Priority
- Priority: Medium
- Rationale: Cuts token spend and repeat questions in every design session.

# Notes
- Example notes file: vault `CR-0W/Research/nest-design/item_212/design-notes.md`.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |

