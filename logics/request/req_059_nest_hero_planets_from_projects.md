## req_059_nest_hero_planets_from_projects - Nest hero planets from registered projects
> From version: 1.0.0
> Schema version: 1.0
> Status: Draft
> Understanding: 90%
> Confidence: 85%
> Complexity: medium
> Theme: nest
> Reminder: Update status/understanding/confidence and linked backlog/task references when you edit this doc.

# AI Context
- Summary: The Nest hero table shows one planet per mission, so the owner sees only cr-0w (marked done) while several projects are live. Planets must come from the registered projects and their live sessions and dispatch agents, with missions and asks layered on top.
- Keywords: nest, hero, planets, projects, sessions, dispatch, missions
- Use when: changing what the hero table shows or how a planet state is derived.
- Skip when: head animation, labels styling, or the phone Home line.

# Needs
- One planet per registered project worth showing, not per mission.
- A project reads `working` while a live session or dispatch agent runs in its repo, even with no mission.
- Missions and inbox asks keep their weight: failed and needs-you win over working.
- 14 projects are registered (13 active): the table cannot show them all at full size.

# Context
- Today `tools/nest/src/hero/model.ts` `heroModel(missions, inbox)` groups missions by project. Core holds one mission (cr-0w, done), so the hero shows a single done planet during a live cr-0w session.
- Core already serves the inputs: `projects` (registry, status, path, short, daily work counts), `dispatch.agents[]` (cwd, projects[] with share_pct, last_activity_s), `sessions.sessions[]` (cwd, last_event).
- Observed 2026-11-12 from the live core socket.

# Acceptance criteria
- AC1: With the live core, a project with a running session or dispatch agent shows as a working planet (cr-0w during a hub session).
- AC2: Planet state precedence: failed > needs (mission waiting or inbox ask) > working (mission or live agent) > queued > done/sleeping.
- AC3: Registered projects with no live activity still appear per the cap rule (item_200), so the owner sees their other projects.
- AC4: The reel fixtures and unit tests cover project-only, agent-only and mission-backed planets.

# Definition of Ready (DoR)
- [x] Problem statement is explicit and user impact is clear.
- [x] Scope boundaries (in/out) are explicit.
- [x] Acceptance criteria are testable.
- [x] Dependencies and known risks are listed.

# Scope
- In: hero model inputs and state derivation, planet cap rule, fixtures, tests.
- Out: head, label styling (done in 5b63cd9), Missions screen, core feed changes unless a field is missing.

# Risks
- Hub sessions span several projects (`multi_project`, `projects[].share_pct`): attribute by cwd first, share second.
- Sessions feed may list stale sessions: use `last_event` / `last_activity_s` freshness.

# Companion docs
- Product brief(s): (none yet)
- Architecture decision(s): (none yet)

# References
- `tools/nest/src/hero/model.ts`
- `tools/nest/src/hero/scene.ts`
- `tools/nest/src/hero/Hero.tsx`
- `tools/nest/fixtures/states/live.json`
- `tools/nest/scripts/hero-reel.mjs`

# Backlog
- item_199_hero_planets_from_projects_and_live_activity (first)
- item_200_hero_planet_cap_and_quiet_projects (after item_199)
- item_207_nest_hero_marketing_reel (last, after every hero and planet item)

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |

