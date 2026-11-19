## item_222_nest_project_page_and_planet_click_routing - Nest project page and planet click routing
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
- Summary: Clicking a planet opens the one thing that waits (question or running session) when there is exactly one, else a new Project page. On a group planet (Circle) a moon opens its member project, a second click on the planet opens the group page.
- Keywords: nest, hero, planet click, project page, group planet, circle, moons, routing
- Use when: building the Project page or changing what a planet, moon or card click opens.
- Skip when: the Missions board (item_190), Inbox viewers.

# Problem
- Planet clicks open `/missions?project=<first member>` (`hero/Hero.tsx:72`, `:361`, `:428`). Missions is not built, so every click lands on an empty page.
- Group planets (`namesOf`, item_200) open `members[0]`, not the most urgent member, and give no way to pick a member.
- Owner decisions 2026-11-17: direct if one, else project page. Circle: click a member moon to go straight to that project; click the planet again for the group page.

# Scope
- In:
  - Routing rule in one function (`planetTarget`), unit tested:
    - exactly one item waits on the owner for that project: open it (question → its Inbox row open with the answer form, approval → its approval, running session with nothing waiting → Desk on that session);
    - otherwise → `/p/<project>`.
  - Group planet: first click focuses (as today), a member moon is clickable and opens that member with the same rule, a second click on the planet opens `/p/<group>`.
  - Project page `/p/<name>`: header (planet glyph, state, scope), What needs you (rows answerable inline, same components as Inbox), Live (sessions, runs with open-chat), MRs (with CI state), Missions, recent activity; actions: new session, dispatch, open repo session (crow handoff).
  - Group page: one row per member (state, counts), sorted by urgency, plus the merged What needs you list.
  - Hero card `open →`, keyboard Enter and the hero list use the same rule.
  - Mockups first: phone (cover, inner) and laptop, two options each, owner picks, then build one screen at a time.
- Out:
  - New core routes beyond filtering `/api/state/work` by project (add a `project` filter only if the client filter is too slow).
  - Missions board itself (item_190).

# Acceptance criteria
- AC1: Owner approved the Project page and group page boards before the build.
- AC2: With one waiting question on lambda, clicking the lambda planet opens that question; with two, it opens `/p/lambda`.
- AC3: On Circle, clicking a member moon opens that member; the second planet click opens `/p/circle` with one row per member.
- AC4: Every row on the page has an action (open, answer, chat, stop); counts match `/api/state/work`.
- AC5: tsc clean, vitest green, phone and laptop shots on the compare page.

# AC Traceability
- req_063_nest_pages_and_inbox_as_the_home_for_everything_that_waits-AC -> This backlog slice. Proof: Owner approved the Project page and group page boards before the build.

# Dependencies
- item_204 work feed (done). Moon hit-testing from item_221 placement.

# Links
- Request: req_063_nest_pages_and_inbox_as_the_home_for_everything_that_waits.

# Priority
- Priority: High
- Rationale: Every planet click today lands on an empty page.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
