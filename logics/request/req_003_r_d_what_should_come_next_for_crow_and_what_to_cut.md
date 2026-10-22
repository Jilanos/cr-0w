## req_003_r_d_what_should_come_next_for_crow_and_what_to_cut - R&D what should come next for crow and what to cut
> From version: 1.0.0
> Schema version: 1.0
> Status: Draft
> Understanding: 85%
> Confidence: 70%
> Complexity: Medium
> Theme: Hub strategy
> Reminder: Update status/understanding/confidence and linked backlog/task references when you edit this doc.

# AI Context
- Summary: Research note ranking what crow should build after the UI/UX pass and account switching, and what to defer or cut. Proposals only, nothing here is a backlog item.
- Keywords: roadmap, priorities, crow, cut, research, competitors
- Use when: deciding what to build next in the hub.
- Skip when: implementing an existing task.

# Needs
- Decide what comes after req_000 (UI/UX pass) and req_001 (account switching) and which parts of the current surface to cut. No code and no backlog items come out of this note; every "proposal" below is for the owner to accept.

# Context
## Where the project stands (2026-10-22)
- Shipped on main: usage data fixes, session titles, per-project usage attribution, daily rollup store, account policy, interrupted-session registry, guarded relaunch (new kitty window), crow-focus, night runbook/preflight/page, retro loop, memory in `local/`.
- Built but not merged (branches `night/crow-ui`, `night/crow-ui-fixes`, `night/watch-ux`): the `crow watch` tabs (Agents, Usage, Savings, History), burn rate, triage board, both bar panels. They wait for the owner's per-view pick.
- Open on the owner: item_006 AC2 check, item_009 (interrupted-sessions view, folded into the panel design pass), cost in the agents panel (needs per-agent cost in `crow json`), the Haiku title command checked outside the sandbox.
- The surface is already wide: a launcher, 14 `bin/` helpers, a Go TUI, two QML panels, skills, runbooks. The biggest `bin/` files are `crow-usage` (47 KB) and `crow-runs` (21 KB).

## What similar tools do (vendor READMEs, not verified in depth)
- Usage analytics: ccusage (read-only per-day and per-session cost from local transcripts), ccboard (monitoring dashboard).
- Account switching with live 5h/7d bars: clauth, aimonitor (auto-swap past a threshold, default 80%, picks the account with most headroom), ccswap, cx (cross-account session resume).
- Parallel agent managers (Claude Squad, Conductor and similar) were not covered by the one search I ran; treat that as a gap.
- Where crow differs: it is a chief of staff (briefs, dailies, review ledgers, retros, overnight runs) with a policy layer (never/ask-first/use) and a memory shared across accounts. The usage and switching tools above are commodity and have faster-moving single-purpose competitors; the orchestration, review-learning and overnight loop have no real equivalent in them.

# Findings and proposed priorities
1. **Merge and settle what is already built (proposal, highest).** Three branches hold finished work behind a design pick. Every further feature added on top of unmerged branches raises rebase cost (this already caused conflicts in `crow-usage`). Reason: value is trapped, and the cheapest next step is the owner's A/B/C picks plus one merge. Needs: owner decision, not a build.
2. **Close the data-trust loop (proposal).** Titles, per-project attribution and savings numbers are only as useful as they are believed. Add a self-check command (`crow usage --verify`): totals from transcripts versus `cdx status`, versus rtk databases, flagging gaps. Small, non-visual, and it protects every screen built on `crow-usage`.
3. **Per-agent cost in `crow json` (proposal, already queued).** One data source, unblocks the panel line the owner wanted. Waits on the owner's OK for option 2 in `docs/crow-watch-ux-options.md`.
4. **Auto-pick of the target account (proposal, needs a rule from the owner).** The "next run goes best on X" line and a relaunch key both need one rule (most headroom, respecting policy). aimonitor's default of "most headroom under the threshold" is a reasonable starting point; keep ask-first accounts excluded from auto-pick. Do it after 1, because it needs the Usage view picked.
5. **Overnight loop as the flagship (proposal).** It is the most distinctive part: queue, preflight, report page, retro. Worth investing: per-run budget and floor stop rules, a morning page that links reports to commits, and a "paused items" ledger so paused work is not re-derived every night. Mostly runbook and script work, cheap in tokens.
6. **Review-ledger quality (proposal).** The pattern ledgers in `local/reviews/` are the other differentiator. Measure them: how many ledger patterns fired in a review, how many review comments repeat a known pattern. Without a count, nobody can tell if they work.

# Proposed cuts and deferrals
- **Defer item_009 as a separate view.** It is already folded into the Needs-you rows of the triage board; a fifth tab adds a surface to maintain for 11 sessions a month at most. Revisit only if relaunch is used weekly.
- **Defer further per-view redesigns** (Savings, History) until the Agents and Usage picks land; they were not reported as too dense.
- **Cut any plan to compete as a general usage tracker.** ccusage, clauth and aimonitor cover it; crow should read their kind of data, not widen its own parsing (`crow-usage` is already the largest file and the main risk).
- **Defer a cdx upstream change** for multi-workspace sessions until the owner decides to post it; six of eleven real interrupted sessions cannot hand off today, so this limits relaunch value. Not a build item for crow.
- **Do not add automatic account switching without a prompt.** The policy layer exists to prevent surprises; the competitors that auto-swap do not have a shared teammate account to protect.

# Risks
- Competitor claims come from READMEs and one search; verify before using them in public text.
- Priorities 2 and 5 assume the owner values trust and reliability over new screens; if not, priority 1 plus 4 is the shorter path.
- Splitting `crow-usage` is a likely maintenance need (47 KB, many concerns) but was not scoped here.

# Acceptance criteria
- AC1: The note ranks proposals and gives a reason for each.
- AC2: Cuts and deferrals are listed with reasons.
- AC3: Nothing here is a commitment: no backlog item or code was created from it.

# Definition of Ready (DoR)
- [x] Problem statement is explicit and user impact is clear.
- [x] Scope boundaries (in/out) are explicit.
- [x] Acceptance criteria are testable.
- [x] Dependencies and known risks are listed.

# Companion docs
- Product brief(s): `prod_001_crow_observability_surfaces`, `prod_002_keep_working_when_an_account_runs_out`
- Architecture decision(s): (none yet)

# References
- `docs/crow-watch-ux-options.md` (on branch `night/watch-ux`)
- Sources: [cx](https://pkg.go.dev/github.com/Mike-7777777/cx), [clauth](https://docs.rs/crate/clauth/0.7.3), [aimonitor](https://pkg.go.dev/github.com/japananh/aimonitor), [ccswap](https://pypi.org/project/ccswap/), [ccboard](https://docs.rs/crate/ccboard/0.6.3)

# Backlog
- none (proposals only)
