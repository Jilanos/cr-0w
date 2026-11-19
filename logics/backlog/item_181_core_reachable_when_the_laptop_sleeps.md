## item_181_core_reachable_when_the_laptop_sleeps - Core reachable when the laptop sleeps
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 60%
> Confidence: 50%
> Progress: 0%
> Complexity: Medium
> Theme: General
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.
> Indicators reviewed: 2026-11-18 11:14:28

# AI Context
- Summary: spike, then a decision: keep core and missions reachable from the phone while the laptop sleeps (tower as host, item_120) or write down the limit and show it in Nest.
- Keywords: always on, host, tower, laptop sleep, tailscale, mission host, spike
- Use when: deciding where core and missions run.
- Skip when: model or local AI choices (req_029 other parts).

# Problem
- core runs as a user unit on the laptop. Laptop asleep means Nest is dead and missions stop. A phone-first day needs core up.

# Scope
- In:
  - Spike (half a day): options are (a) tower runs core and missions (item_120), laptop syncs state; (b) laptop never sleeps on AC; (c) a small always-on proxy that queues asks and wakes the laptop (Wake-on-LAN). Measure cost, what breaks (paths, accounts, kitty sessions), data sync.
  - Owner picks with AskUserQuestion; record the decision here.
  - Nest shows "core offline since HH:MM" from the service worker when the origin fails.
- Out:
  - Building the chosen host (new item after the decision).

# Decision so far
- Owner 2026-11-18: core stays on the laptop for now. The Yoga is old (no battery); a small always-on PC may replace it, decided in the homelab repo. While the laptop sleeps, the fallback is Remote Control on the tower, woken through the Bbox WOL proxy (req_056 AC6).

# Acceptance criteria
- AC1: The spike note lists each option with cost and breakage, and the owner's pick.
- AC2: Nest shows an offline banner with the last seen time when core is down.

# AC Traceability
- request-AC5 -> AC1, AC2. Proof: decided limit or path.

# Decision framing
- Product framing: Not needed
- Architecture framing: Required. Host choice changes where state lives.

# Links
- Request: `req_055_a_work_day_from_nest_without_a_terminal`, `req_029_spike_hosts_model_sources_and_local_ai_benchmarks`
- Related: `item_120_tower_as_a_mission_host_for_claude_missions`
- Primary task(s): `task_021_orchestrate_a_work_day_from_nest`

# Priority
- Priority: Medium
- Rationale: can run in parallel; blocks only the "away from desk" day.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
