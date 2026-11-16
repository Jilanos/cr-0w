## item_214_nest_planet_type_per_project_kind - Nest planet type per project kind
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 95%
> Confidence: 90%
> Progress: 0%
> Complexity: Low
> Theme: General
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: Add a project kind to the registry and derive each hero planet's type (banded giant, terrain, rock, ice) from it.
- Keywords: nest, planet type, kind, registry, hero model
- Use when: wiring planet types into the data layer.
- Skip when: drawing the planets (item_216).

# Problem
- The locked planet types need a fixed, meaningful mapping per project. Owner rule 2026-11-16 (item_212 notes): by kind, not size or age.

# Scope
- In:
  - `local/projects.yaml`: new `kind` field (work, tool, world, notes) on every project; optional `planet:` (bands, terrain, rock, ice) override.
  - `bin/crow-registry json` serves `kind` and `planet`; documented in its header.
  - `RegProject` gets `kind`, `planet`; `HeroProject` gets `planet`.
  - Rule: scope work -> bands; kind tool -> rock; world -> terrain; notes -> ice; `planet:` wins; no kind -> rock.
  - System planet (item_200): type of its most urgent member.
- Out:
  - rendering; the size/age rule (rejected).

# Initial mapping
- Per-project list in `local/nest-planet-kinds.md` (private). Work projects: bands; personal tools: rock; setups and creative work: terrain; personal notes: ice.

# Acceptance criteria
- AC1: Every registered project resolves to one of the four types; unit tests cover each rule branch, the override and system planets.
- AC2: `crow-registry json` exposes `kind` and `planet`; Nest builds and tests pass.
- AC3: `local/projects.yaml` stays private; the engine code holds no project names.

# Dependencies
- None. Feeds item_216.

# Links
- Request: req_062. Design: item_212. Data: item_199/200.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
