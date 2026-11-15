## item_166_boot_sequence_on_first_load_of_the_nest - Boot sequence on first load of the Nest
> From version: 1.0.0
> Schema version: 1.0
> Status: In progress
> Understanding: 90%
> Confidence: 85%
> Progress: 50%
> Complexity: Low
> Theme: nest
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.
> Indicators reviewed: 2026-11-15 10:12:53

# AI Context
- Summary: a boot sequence under 1.5 s on the first load of a session: frames draw, the hero resolves, the prompt types in; skipped with reduced motion.
- Keywords: nest, boot sequence, first load, motion, reduced motion
- Use when: building the Nest start-up animation.
- Skip when: sound, glitch effects, the hero itself.

# Problem
- The Home appears at once with no start-up moment.

# Scope
- In:
  - A short boot (under 1.5 s): panels draw their frames, the hero resolves, the prompt types in.
  - Once per session. Skipped with reduced motion.
- Out:
  - Sound
  - Glitch or matrix rain effects

# Acceptance criteria
- AC1: It runs at most once per session and finishes in under 1.5 s.
- AC2: It is skipped with prefers-reduced-motion.
- AC3: The owner approves a recording.

# AC Traceability
- request-AC3 -> This backlog slice. Proof: AC1: It runs at most once per session and finishes in under 1.5 s.

# Decision framing
- Product framing: Not needed
- Architecture framing: Not needed

# Links
- Product brief(s): `prod_007_nest_home_design_pass`
- Architecture decision(s): (none yet)
- Request: `req_053_nest_home_design_pass_netrunner_palette_holographic_hero_and_jarvis_chrome`
- Primary task(s): `task_019_orchestrate_the_nest_home_design_pass`

# Priority
- Priority: Low
- Rationale: Set by scaffold input or defaulted for grooming.

# Notes
- 2026-11-15: three boot options prototyped behind `?boot=a|b|c` (A trace, B scan line, C unfold), each planned under 1.5 s. The flag replays on every load; the real boot (`REAL_BOOT`, unset) runs once per session. Home is never hidden more than 1 s. Recordings not made yet (`npm run reel:boot`); pick pending.
- 2026-11-15: recordings made from the hub (runs cannot launch the browser): `Research/nest-design/item_166/{A,B,C}/`, compare page `spec.html`, timing 1.16 to 1.42 s. Pick pending (owner reviews at the laptop).

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-15T09:13:18.678237+00:00 | cdx | 03beba0f55004df589ee3714538ab02a | item_166 boot options (continue) | succeeded |  |  |
| 2026-11-15T08:48:47.829182+00:00 | cdx | 29d60d047eb94faf81066360609533f0 | item_166 boot options | succeeded |  |  |

