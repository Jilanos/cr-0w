## item_198_hero_idle_follow_animations - Hero idle and follow animations, table spin
> From version: 1.0.0
> Schema version: 1.0
> Status: Done
> Understanding: 92%
> Confidence: 88%
> Progress: 100%
> Complexity: Medium
> Theme: General
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: Add life to the hero: idle animations, reactions while following the pointer, and possibly a slow table spin.
- Keywords: nest, hero, animation, idle, follow, table, spin
- Use when: building or reviewing the Nest hero after item_158.
- Skip when: work outside the Nest hero.

# Problem
- Spinning moves the planets but not the table, which looks detached.
- The hero has little motion at rest and few reactions when it follows the pointer or when planets move.

# Scope
- In:
  - Owner decision: does the table spin with the planets (rings, ticks) or stay fixed.
  - Idle loop for the head (breathing, blink, glance) within the paint budget.
  - Follow reactions: head and planets respond as the pointer moves.
  - All motion off with reduced motion; timers only while visible.
- Out:
  - Planet looks (item_197).

# Acceptance criteria
- AC1: Owner picks the table spin option and the idle set from a short motion mockup.
- AC2: Idle draw rate stays bounded (`scripts/hero-idle.mjs`), 0 with reduced motion.
- AC3: Draw time stays under 20 ms per frame on laptop.
- AC4: Owner OK on a screen recording per size.

# AC Traceability
- request-AC1 -> This backlog slice. Proof: owner OK on shots.
- request-AC2 -> This backlog slice. Proof: tests and perf scripts.

# Decision framing
- Product framing: Needed: owner picks the option
- Architecture framing: Not needed
- 2026-11-12: head ink floor INK_MIN 0.35 (desktop matched to small heads), fail/run eyes take red/cyan (e7194d5); labels trimmed, YOUR MOVE tag removed (5b63cd9). Perf AC (<20 ms/frame) fails on desktop table: 26 ms median, predates this work. Gaze during drag moved to item_201.

# Links
- Product brief(s): (none yet)
- Architecture decision(s): (none yet)
- Request: `req_058_nest_hero_second_pass`
- Primary task(s): (none yet)
- Follows: `item_158_nest_hero_live_data_state_motions_and_actions`

# Priority
- Priority: Medium
- Rationale: owner feedback 2026-11-12 on the item_158 build.

# Notes
- After item_196 (shared follow code) and item_197 (planets in the sky change what moves).

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |

# Notes from item_197 (2026-11-12)
- Decided: the table spins with the planets (bezel ticks and spokes follow the spin).
- Built as a first cut: a rim scan sweep (`SWEEP_MS` 12 s) on the 10 fps slow tick. The slow tick now runs whenever the page is visible (not only with a live project), off with reduced motion. Owner: smooth it out and expand it here.
- Rejected for now: a front-arc marker (reads too complex); hover link kept as the footprint brightening.
- AC2 baseline changes: idle paints are about 10/s at rest now; update `scripts/hero-idle.mjs` expectations.

# Outcome (2026-11-13)
- AC1: the table spins with the planets (item_197). Idle set: breathing, blink and glance. It is already in the lively preset (`headCtl.ts` CHARACTER.lively), so no new motion was added. Rim sweep kept as built, with no expansion (owner).
- AC2: idle runs at 11.3 2D paints/s and 22.3 GL frames/s, and at 0 with reduced motion (`scripts/hero-idle.mjs`).
- AC3: the live path takes 6.5 ms median for the table plus 3.9 ms for the head at 1440x900; bake fallback 15 ms (`scripts/hero-perf.mjs`, fixed for the new heroModel signature).
- AC4: owner OK on the polish reels at both sizes (vault `Research/nest-design/item_198/`).
