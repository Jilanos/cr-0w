## item_200_hero_planet_cap_and_quiet_projects - Hero planet cap and quiet projects
> From version: 1.0.0
> Schema version: 1.0
> Status: Done
> Understanding: 100%
> Confidence: 100%
> Progress: 100%
> Complexity: small
> Theme: nest
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: Decide and build how many project planets the hero table shows and how quiet projects appear.
- Keywords: hero, planets, cap, quiet, sleeping, layout
- Use when: building req_059 step 2.
- Skip when: deriving planet state (item_199).

# Problem
- 13 active projects do not fit the table at the current planet size; labels would collide with the head.

# Scope
- In:
  - Show every project with live activity, a mission or an ask; fill up to a cap with the most recent by `projects[].work` counts.
  - Quiet projects render small and dim (sleeping), no label until hover.
  - Overflow summarised on the rim (e.g. `+5 quiet`).
- Out:
  - State derivation (item_199).

# Decision framing
- Product framing: Needed. Ask the owner before building: cap value (6 / 8 / all), quiet look (small dim vs moons vs rim only). Show options side by side (bin/crow-compare) with real data.
- Architecture framing: Not needed

# Acceptance criteria
- AC1: The owner picked the cap and quiet look from side-by-side renders.
- AC2: Desktop 1440x900 and phone 368x812 renders show no label overlaps with the head or each other.
- AC3: Every live, failed or needs project is always on the table regardless of the cap.

# AC Traceability
- request-AC3 -> AC1, AC3. Proof: renders and model test.

# Links
- Product brief(s): (none yet)
- Architecture decision(s): (none yet)
- Request: req_059_nest_hero_planets_from_projects
- Primary task(s): (none yet)

# Priority
- Priority: Medium
- Rationale: Follows item_199.

# Notes
- Depends on item_199.

# Outcome (2026-11-13)
- Owner reframed the cap as systems: related projects share one planet. Registry field `system` in local/projects.yaml (circle: lambda, web, mobile, vault-work; archeotech: dotfiles, shell; obsidian: vault-personal, obsidian-stacks; the rest alone). `nest: false` hides a project (cdx-manager, an upstream fork). bin/crow-registry exports both.
- Look (pick B of five renders): members orbit their system planet as small moons, grey when quiet. Hover spreads them and names them, bare like the planet labels, no state glyph. A member label hides rather than move more than 40px from its moon (declutter `near`).
- A system takes its most urgent member's state; its card lists every member's missions, asks and runs and opens the most urgent member's missions.
- Live data gives 8 planets, under MAXP 9. Planets are ranked by state before the cap, so a live, failed or needs system is never cut (AC3).
- Renders: vault `Research/nest-design/item_200/systems/` (final.html). Later: a work/perso/all scope filter on Nest, like the deck.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |


# Progress note (2026-11-13)
- Quiet colour decided and built: grey quiet planets, working planet glows more (vault Research/nest-design/item_200/quiet-color). Still open: the 9-planet cap (live data has 14 projects).
- Working planets wear a tilted, turning ring (cbe324a). Owner OK on the motion clip (vault Research/nest-design/item_200/quiet-color/ring-motion.mp4).
