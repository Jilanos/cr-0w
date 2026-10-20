## task_002_deliver_account_switching_and_session_resume_in_three_steps - Deliver account switching and session resume in three steps
> From version: 1.0.0
> Schema version: 1.0
> Status: In progress
> Understanding: 90%
> Confidence: 85%
> Progress: 75%
> Complexity: Medium
> Theme: Implementation delivery
> Reminder: Update status/understanding/confidence/progress and linked request/backlog references when you edit this doc.
> Indicators reviewed: 2026-10-20 20:30:10
> Owner: crow

# AI Context
- Summary: (unfilled: replace before this doc is used)
- Keywords: deliver, account, switching, session, resume, three, steps
- Use when: (unfilled: replace before this doc is used)
- Skip when: (unfilled: replace before this doc is used)

# Context
- Orchestrate the scaffolded request chain and keep sibling implementation slices linked.

# Plan
- [ ] 1. 1.1: move memory into local/, wire profile access without copies, verify on the main and the shared account (ask first).
- [x] 2. 1.2: accounts file, helper and registry scanner with tests.
- [x] 3. 1.3: guarded relaunch command and block detection; verify with a dry run against cdx.
- [ ] 4. 1.4: crow watch view and no-model mode; render and show the owner before finishing.
- [ ] ADR 009 checkpoint: update affected Logics docs during each meaningful wave and leave the repo commit-ready.
- [ ] Keep commit creation under operator control; do not force one commit per micro-step.
- [ ] GATE: do not close until lint, audit, and scaffold validation pass.

# Backlog
- `item_006_1_1_memory_in_local_shared_by_every_allowed_profile`
- `item_007_1_2_account_policy_config_and_interrupted_session_registry`
- `item_008_1_3_guarded_relaunch_and_block_detection`
- `item_009_1_4_interrupted_sessions_view_and_no_model_mode`

# Definition of Done (DoD)
- [ ] Generated request, product, backlog, and task docs are present.
- [ ] Context-pack handoff is available when requested.
- [ ] Validation passes.
- [ ] Meaningful waves followed ADR 009: affected docs updated and the repo left commit-ready without automatic commits.

# AC Traceability
- request-AC8 -> `item_006_1_1_memory_in_local_shared_by_every_allowed_profile`. Proof deferred to slice closeout.
- request-AC1 -> `item_007_1_2_account_policy_config_and_interrupted_session_registry`. Proof deferred to slice closeout.
- request-AC2 -> `item_007_1_2_account_policy_config_and_interrupted_session_registry`. Proof deferred to slice closeout.
- request-AC7 -> `item_007_1_2_account_policy_config_and_interrupted_session_registry`. Proof deferred to slice closeout.
- request-AC3 -> `item_008_1_3_guarded_relaunch_and_block_detection`. Proof deferred to slice closeout.
- request-AC4 -> `item_008_1_3_guarded_relaunch_and_block_detection`. Proof deferred to slice closeout.
- request-AC7 -> `item_008_1_3_guarded_relaunch_and_block_detection`. Proof deferred to slice closeout.
- request-AC5 -> `item_009_1_4_interrupted_sessions_view_and_no_model_mode`. Proof deferred to slice closeout.
- request-AC6 -> `item_009_1_4_interrupted_sessions_view_and_no_model_mode`. Proof deferred to slice closeout.

# Validation
- 1.1 (item_006), checked locally with bin/crow-memory status on 2026-10-20: AC1 holds: in the main profile every project memory dir with content is a link into local/memory; each memory.premigrate copy matches its local/memory dir file for file; the hub session loads the 18-file cr-0w index from there. AC3 holds for the mechanism: the local/ repo has the 'memory: update' commit, and crow-memory commit runs from crow's exit trap and /wrap. Not verified: AC2. A shared-account session was active in the hub at check time (cdx status), so its links into local/memory are expected. Once that session ends, `crow-memory status` should list no links for the shared account. Its memory.premigrate dir (its own 2 original files) is still there.
- 1.2 (item_007), 2026-10-20: python3 -m pytest tests passes (12 tests). AC1: bin/crow-accounts is the one reader of local/accounts.yaml. bin/crow, crow-runs, crow-retro and crow-memory all call it. An unknown or mistyped policy now counts as never, and crow launches and dispatches refuse a never account. AC2: bin/crow-sessions writes interrupted-sessions.json, plus sessions-cache.json keyed by mtime_ns and size, to the state dir and prints a readable list. Retros and the /brief, /daily and /weekly one-shots are excluded. On the real profiles it found the same 11 sessions as the hand-built registry. The first scan of 115 transcripts took 0.39 s; a cached rescan took 0.05 s and read 0 files.
- 1.3 (item_008), 2026-10-20: python3 -m pytest tests passes (29 tests; relaunch is tested with a fake cdx on PATH, so no real handoff ran). AC1: bin/crow-relaunch refuses with no id, a malformed id, an ambiguous prefix or an unknown id. It also refuses a never or unknown target, a source sitting in a never profile, the source account itself, a transcript with more than one workspace, and a blocked or unresumable target. AC2: an ask-first account needs a typed 'yes' on a terminal every time. --yes and piped input are refused, and y, Y, no or empty cancel; this was tested on a pseudo-terminal. Dry run against the real cdx: 'crow relaunch <id> <shared account> --dry-run' called only cdx can-resume and cdx status, printed 'cdx handoff <main> <shared> --source-conversation <full id>', and launched nothing. The handoff runs from the session's workspace; cdx requires that. Block detection: 'crow relaunch status' reads cdx status --json and recommends an unblocked allowed account, use before ask-first. Finding: 6 of the 11 real interrupted sessions changed directory, so cdx will not hand them off; crow sessions flags them.

# Report
- Not started.

# Links
- Request: `req_001_crow_account_switching_and_session_resume`
- Product brief(s): `prod_002_keep_working_when_an_account_runs_out`
- Architecture decision(s): (none yet)
