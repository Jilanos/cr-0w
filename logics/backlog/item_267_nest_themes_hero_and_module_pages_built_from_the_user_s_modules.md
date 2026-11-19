## item_267_nest_themes_hero_and_module_pages_built_from_the_user_s_modules - Nest themes, hero and module pages built from the user's modules
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 75
> Confidence: 70
> Progress: 0%
> Complexity: Large
> Theme: General
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: A user shapes their own Nest: picks a theme or adds one as a token file, picks the hero, keeps only some of the owner's pages, and adds pages and sections from their bricks' `nest/` folders. Everything compiles in at Nest build time.
- Keywords: nest, theme, tokens, hero, pages, sections, modules, build time, vite
- Use when: a second user wants Nest to look and behave as their own.
- Skip when: turning engine bricks on or off (item_237 hides off bricks).

# Problem
- Nest has one set of pages, four built-in themes in `theme.css` and one hero. A second user can only change them by patching the engine.

# Scope
- In:
  - Themes: a theme is a token file (`themes/<name>.css` with one `[data-theme='<name>']` block). Built-in themes move to that form; a brick's `nest/themes/` adds more. `crow.yaml` `nest.theme` picks the default.
  - Hero: a slot with the built-in heroes (droid, planets, none) and a brick hero from `nest/hero/` that exports one component with the same props. `crow.yaml` `nest.hero` picks it.
  - Pages: `crow.yaml` `nest.pages` lists the pages in nav order; engine pages not listed are hidden. A brick's `nest/pages/<name>.tsx` adds a page and a route.
  - Sections: a brick's `nest/sections/` adds Home or Desk sections; generic list view stays for bricks with no code.
  - Build: a Vite plugin reads the on bricks (engine and user) and exposes `virtual:nest-modules`; `crow nest build` rebuilds after `crow modules` changes.
  - Brick pages read core only through `/api` and the existing data hooks.
  - Docs: how to write a theme, a hero and a page.
- Out:
  - Loading code at runtime.
  - A theme editor in Nest.

# Acceptance criteria
- AC1: A test brick with a theme, a hero and one page builds into Nest; the page shows in nav, the theme in the switcher, the hero on Home.
- AC2: `nest.pages: [home, inbox]` shows only those two pages; other routes fall back to Home.
- AC3: With no crow.yaml `nest:` block, Nest looks and behaves as today (screenshot diff on Home and Desk).
- AC4: A brick page that fails to compile fails `crow nest build` with the brick name in the error.
- AC5: Nest tests and crow-check pass.

# AC Traceability
- req_064_paul_s_feedback_and_a_modular_public_crow-AC1 -> This backlog slice. Proof: a second user has their own theme, hero and pages without engine patches.

# Dependencies
- `item_237_nest_and_crow_core_as_separate_front_and_back_bricks`.
- `item_265_user_modules_from_a_local_folder_or_a_git_url`.

# Links
- Request: `req_064_paul_s_feedback_and_a_modular_public_crow`
- Architecture decision(s): `adr_002_crow_bricks_module_manifest_and_project_kinds`

# Priority
- Priority: Medium
- Rationale: What a second user will change first.

# Notes
- Split candidate: themes and page list first, hero slot and brick pages second.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
