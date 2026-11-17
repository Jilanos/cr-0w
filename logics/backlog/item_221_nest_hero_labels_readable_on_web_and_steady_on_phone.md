## item_221_nest_hero_labels_readable_on_web_and_steady_on_phone - Nest hero labels readable on the web and steady on the phone
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 85
> Confidence: 80
> Progress: 0%
> Complexity: Medium
> Theme: Nest
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: Planet labels are too small on the laptop/web table, hover shows only some moon labels and they are too small, and moon labels on the phone jump around. One label placement pass, moons first.
- Keywords: nest, hero, labels, moons, planets, placement, hover, phone, web
- Use when: changing label size, hover labels or label placement on the holotable.
- Skip when: the table look (item_217 locks), planet click routing (project page item).

# Problem
- Owner 2026-11-17 on the laptop web Nest: planet labels are way too small; on hover not every moon label shows and the ones shown are too small.
- Owner 2026-11-17 on the phone: moon labels keep moving around a lot.
- Labels B were picked in item_217 (phone 1 label, laptop/web 3). The placement pass then did not cover moons with the lit table.

# Scope
- In:
  - Planet label size on laptop/web scaled to the table (target: readable at arm's length on 1440x900 and 1920x1080), phone size unchanged unless the shots say otherwise.
  - Hover on a planet shows every moon label (all moons, members included), at a readable size, placed without overlap (leader lines when crowded).
  - Phone: moon labels stop jumping. Placement is sticky: a label keeps its side and slot until it would overlap, with hysteresis and a minimum hold time instead of a re-solve each frame.
  - Before/after shots at 368x812, 707x691, 1440x900 with injected sessions, on a compare page (bin/crow-compare) in the vault, owner picks before commit.
- Out:
  - Planet or board look, new label content.

# Acceptance criteria
- AC1: Laptop/web planet labels readable on the compare shots; owner OK.
- AC2: Hovering a planet with N moons shows N moon labels, none overlapping, none clipped.
- AC3: On a 30 s phone recording with live sessions spinning, no moon label changes side more than once unless its moon crosses the head or another label.
- AC4: Default table (no flag) unchanged; tsc clean, vitest green.

# AC Traceability
- req_063_nest_pages_and_inbox_as_the_home_for_everything_that_waits-AC -> This backlog slice. Proof: Laptop/web planet labels readable on the compare shots; owner OK.

# Dependencies
- item_217 board build (labels B). Can start now.

# Links
- Request: req_063_nest_pages_and_inbox_as_the_home_for_everything_that_waits.

# Priority
- Priority: High
- Rationale: Daily annoyance on both devices; small and isolated.

# Notes
- Label code: `tools/nest/src/hero/scene.ts` and the labels module used by the lit table.
- Zoom crops for contrast before showing (owner rule).

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
