## req_061_nest_scope_filter - Nest scope filter: all, work, perso
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 90
> Confidence: 85
> Complexity: Medium
> Theme: General
> Reminder: Update status/understanding/confidence and linked backlog/task references when you edit this doc.

# AI Context
- Summary: Nest gets the deck's all / work / perso filter, applied to the whole app and remembered per device.
- Keywords: nest, scope, filter, all, work, perso
- Use when: building or reviewing the Nest scope filter.
- Skip when: work outside Nest.

# Needs
- The owner can show only work or only personal projects in Nest, like the deck's `m` mode (all, work, perso).
- During the day the phone can stay on work; evenings on perso.

# Context
- Owner decisions 2026-11-13: the filter covers the whole app (hero, Desk, Missions, Inbox); Nest remembers the last choice per device.
- Deck reference: `tools/crow-deck/chrome.go` modeSegs (all, work, perso segments), `home.go` inMode.
- Scope source: `scope` in `local/projects.yaml`, served by `bin/crow-registry json`. Missions carry their own `scope` (work, personal, crow).

# Acceptance criteria
- AC1: One filter with all, work and perso filters every Nest screen.
- AC2: The choice survives a reload on the same device.
- AC3: The owner picks the control's look and place from mockups before the build.

# Definition of Ready (DoR)
- [x] Problem statement is explicit and user impact is clear.
- [x] Scope boundaries (in/out) are explicit.
- [x] Acceptance criteria are testable.
- [x] Dependencies and known risks are listed.

# Companion docs
- Product brief(s): (none yet)
- Architecture decision(s): (none yet)

# References
- `tools/crow-deck/chrome.go`
- `tools/nest/src/data/live.ts`
- `tools/nest/src/hero/model.ts`

# Backlog
- `item_206_nest_scope_filter_across_the_app`

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
