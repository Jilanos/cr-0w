## item_013_2_4_mixed_provider_activity_and_session_registry - 2.4 Mixed-provider activity and session registry
> From version: 1.0.0
> Schema version: 1.0
> Status: In progress
> Understanding: 90%
> Confidence: 85%
> Progress: 10%
> Complexity: Medium
> Theme: Claude and Codex orchestration
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.
> Indicators reviewed: 2026-10-22 16:51:43

# AI Context
Live discovery scans only Claude processes and session identity is not qualified by provider. Priority rationale: establish trustworthy common data before usage and UI; depends on 2.1 and 2.3.

# Problem
- Live discovery scans only Claude processes and session identity is not qualified by provider.

# Scope
- In:
  - Priority rationale: establish trustworthy common data before usage and UI; depends on 2.1 and 2.3.
  - Define additive normalized session records with provider, account, native id, cwd, source, timestamps, nullable metrics and capability/availability information. Use (provider, account, native id) identity and separate run_id lineage.
  - Prefer cdx history/run-status/report identity and artifact metadata. Keep bounded read-only Claude/Codex native adapters for prompts/tool activity and interactive session discovery unavailable in public payloads; resolve profile paths from supported metadata, not a fixed /home glob.
  - Normalize working/waiting/finished/failed/interrupted/unknown states conservatively; a quiet file does not prove waiting for a human. Version parsers/cache by provider and tolerate partial final JSONL records and unknown event variants.
  - Deduplicate interactive process, transcript and dispatched-run observations; exclude automatic retro/title work from user interrupted sessions without hiding genuine user jobs.
- Out:
  - Changing cdx or provider authentication internals.

# Acceptance criteria
- AC1: Synthetic simultaneous sessions from both providers appear once each; identical native ids under different providers/accounts do not collide.
- AC2: Claude message/tool events and Codex session_meta/response_item/event_msg fixtures yield comparable prompts, actions, identity and timestamps with unknown fields retained as null.
- AC3: Unreadable/deleted files, partial trailing JSONL, unknown events and inaccessible processes do not crash a snapshot or turn an unknown session into a completed job.
- AC4: Unchanged transcript fixtures reuse incremental caches; only newly appended content is parsed where supported.

# AC Traceability
- request-AC4 -> This backlog slice. Proof: AC1: Synthetic simultaneous sessions from both providers appear once each; identical native ids under different providers/accounts do not collide.
- request-AC5 -> This backlog slice. Proof: AC2: Claude message/tool events and Codex session_meta/response_item/event_msg fixtures yield comparable prompts, actions, identity and timestamps with unknown fields retained as null.

# Decision framing
- Product framing: Not needed
- Architecture framing: Not needed

# Links
- Product brief(s): `prod_003_one_crow_hub_for_claude_and_codex`
- Architecture decision(s): (none yet)
- Request: `req_004_run_claude_and_codex_together_through_cdx`
- Primary task(s): `task_003_deliver_joint_claude_and_codex_support_through_cdx`

# Priority
- Priority: High
- Rationale: establish trustworthy common data before usage and UI; depends on 2.1 and 2.3.
