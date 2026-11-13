## item_196_hero_head_turn_smoothing - Smooth head turn when following the pointer
> From version: 1.0.0
> Schema version: 1.0
> Status: Done
> Understanding: 90%
> Confidence: 85%
> Progress: 100%
> Complexity: Medium
> Theme: General
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: Ease the head turn when it follows the pointer so fast left-right moves do not jitter.
- Keywords: nest, hero, head, turn, pointer, easing
- Use when: building or reviewing the Nest hero after item_158.
- Skip when: work outside the Nest hero.

# Problem
- Moving the pointer quickly from left to right makes the head snap between directions. It feels brutal and jittery.

# Scope
- In:
  - Damped follow (spring or critically damped easing) on the head yaw and pitch.
  - Hysteresis so the head does not flip back and forth near the centre.
  - Respect reduced motion.
- Out:
  - New idle animations (item_198).

# Acceptance criteria
- AC1: A fast sweep across the hero gives one smooth turn, no flicker between frames (screen recording).
- AC2: Unit test on the follow step: bounded velocity, settles without overshoot past target.
- AC3: Idle paints stay at 0 with reduced motion (`scripts/hero-idle.mjs`).

# AC Traceability
- request-AC1 -> This backlog slice. Proof: owner OK on shots.
- request-AC2 -> This backlog slice. Proof: tests and perf scripts.

# Decision framing
- Product framing: Not needed
- Architecture framing: Not needed
- 2026-11-12: head brightness and eye colours fixed in e7194d5 (atlas weight 600 + stroke, INK_MIN 0.35).

# Links
- Product brief(s): (none yet)
- Architecture decision(s): (none yet)
- Request: `req_058_nest_hero_second_pass`
- Primary task(s): (none yet)
- Follows: `item_158_nest_hero_live_data_state_motions_and_actions`

# Priority
- Priority: High
- Rationale: owner feedback 2026-11-12 on the item_158 build.

# Notes
- Pure motion code in src/hero/motion.ts, testable like the spin step. No design pass.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |

# Outcome (2026-11-13)
- AC1: owner OK on the polish reels at 1440x900 and 368x812 (vault `Research/nest-design/item_198/hero-reel-polish-*.mp4`).
- AC2: `headCtl.test.ts` "a fast pointer sweep gives one smooth turn".
- AC3: `scripts/hero-idle.mjs` gives 0 paints/s and 0 GL frames/s with reduced motion.
