## item_207_nest_hero_marketing_reel - Nest hero marketing reel
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 90
> Confidence: 85
> Progress: 0%
> Complexity: Medium
> Theme: General
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: A short edited reel that sells what the Nest hero shows, with titles and motion graphics over real captures.
- Keywords: nest, hero, marketing, reel, video, motion graphics, titles
- Use when: the hero and planets work is finished and the owner wants a showcase video.
- Skip when: hero or planet items are still open; QA reels for owner OK (use `scripts/hero-reel.mjs`).

# Problem
- The current reels are QA captures: every beat, fixtures, no story. They show the hero works, not why it matters.

# Scope
- In:
  - A story first: what the hero says at a glance (one planet per project or system, state by colour and motion, the butler head reacting, asks waiting on the owner). Owner OKs the script and beat list before any capture.
  - Staged fixture data that tells the story (clean names, a run, an ask, a failure, a fix).
  - Captures at full quality from the existing reel tooling (`scripts/hero-reel.mjs`, `REEL_SET`, per-beat env), phone and laptop.
  - Edit: titles and short captions, motion graphics (callouts, zooms, transitions), pacing to 30 to 60 s; optional music bed.
  - Tooling picked when the item starts (ffmpeg filters, or a code-driven video tool); search the repo and runbooks first.
  - Exports: 16:9 for the portfolio and a vertical cut for the phone story.
- Out:
  - New hero features made only for the video.
  - Publishing (the owner decides where and when).

# Acceptance criteria
- AC1: Owner OKs the script and beat list before capture.
- AC2: Owner OKs a first cut, then the final export in 16:9 and vertical.
- AC3: The data shown is fixtures only, with no work names or private data.
- AC4: The recipe goes in `runbooks/nest-screenshots.md` so the reel can be rebuilt after hero changes.

# AC Traceability
- request-AC1 -> AC1, AC2. Proof: owner OK on script and cuts.

# Decision framing
- Product framing: Needed: script, tone, length and music (AC1).
- Architecture framing: Not needed.

# Links
- Product brief(s): (none yet)
- Architecture decision(s): (none yet)
- Request: `req_059_nest_hero_planets_from_projects` (hero showcase)
- Primary task(s): (none yet)
- Depends on: every open hero and planet item first, today `item_206` (scope filter), `item_204` and `item_202` (every kind of work on the table), `item_166` (boot sequence, a likely opening shot).

# Priority
- Priority: Low
- Rationale: owner request 2026-11-13; runs last, once the hero and planets settle.

# Notes
- 2026-11-16: owner defers the reel until more of the Nest functions and design are in (Desk item_210, Inbox reviews item_211, terminal item_209, holotable item_212).
- Start from the approved QA reels (vault `Research/nest-design/item_198/hero-reel-labels-*`) for the look.
- Output in the vault (`Research/nest-design/item_207/`).

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
