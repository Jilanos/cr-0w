## item_213_token_optimization_pass_two_cheaper_dispatched_runs_and_hub - Token optimization pass two: cheaper dispatched runs and hub
> From version: 1.0.0
> Schema version: 1.0
> Status: In progress
> Understanding: 95%
> Confidence: 85%
> Progress: 80%
> Complexity: Medium
> Theme: General
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: Cut tokens per dispatched run and in the hub, from the 2026-11-16 morning measurements.
- Keywords: tokens, model choice, dispatch, run scope, context pack, compaction
- Use when: changing crow dispatch defaults, run prompts or hub session habits.
- Skip when: feature work on Nest or core.

# Problem
- 2026-11-16 morning on rk1 read about 73M context tokens, all runs on Opus.
- The item_208 run alone read 30.2M (367 calls, peak 117k): six bugs in one run and a long static hunt on bug 4 that found nothing.
- Item_204 took three review rounds, each a fresh run re-reading the same context (12.8M + 7.4M + earlier).
- The boot cleanup (mechanical: delete A and C, add a replay flag) ran on Opus for 6.5M.
- The hub itself read 14.2M (screenshots, two compactions).

# Scope
- In:
  - Model per run kind in crow dispatch: Sonnet default for mechanical runs (cleanup, rename, wiring, recordings), Opus for design and debugging. Flag to override.
  - Run size rule: one bug or one AC group per run; a cap on calls or context per run that stops and reports instead of hunting.
  - Live diagnosis before a hunt: the hub captures the failing state (logs, API output, screenshot) and puts it in the prompt.
  - Review rounds batched: collect all decisions in one ask before re-dispatching.
  - Measure what --context day adds to each prompt; trim it to what the run needs.
  - Per-run token report in crow-runs report (context read, peak, output, model) so cost shows next to the result.
  - Hub habits: screenshots as zoom crops, not full frames; split sessions before the 120k mark.
- Out:
  - Changing accounts or plans.
  - Nest or core feature work.

# Acceptance criteria
- AC1: crow dispatch picks the model from the run kind and shows it; mechanical runs default to Sonnet.
- AC2: crow-runs report prints context read, peak context, output tokens and model for each run.
- AC3: the dispatch runbook states the one-scope-per-run rule and the live-capture-first rule; run prompts carry a stop-and-report budget.
- AC4: --context day size is measured and trimmed; the before and after numbers are in the notes.
- AC5: a comparable day after the change reads at least 40% fewer context tokens for similar work, measured with the same script.

# AC Traceability
- AC1 -> bin/crow_lib.py RUN_KINDS `mech` (Sonnet, $8, 60 min, task sandbox); crow-runs dispatch prints kind and model and records `model_id`. Proof: tests/test_crow_run_tokens.py, dry-run shows claude-sonnet-5-5.
- AC2 -> bin/crow-runs report ends with a token line (crow_lib.transcript_tokens). Proof: f470e845 prints `15.0M context read · peak 117k · 89k output · 181 calls · opus-5-5`.
- AC3 -> runbooks/dispatch-background-runs.md (steps 4-7: one scope, live capture, batched rounds, kind pick); crow_lib.run_brief adds the stop-and-report footer (task 60 calls, mech 40) to every task/mech prompt. Proof: dry-run wrapper file, tests.
- AC4 -> `--context day` adds nothing to a prompt (it is the usage-limit policy). Measured instead: run start context median 28k (7 runs), plus owner-prefs 6.6k read by every run; bin/crow-cost-audit now prints run start context. Trim not done: owner-prefs slicing saves about 5% on a long run, left as an owner choice. Proof: runbooks/cost-audit.md.
- AC5 -> bin/crow-cost-audit (context read totals per model and kind). Proof: pending, needs a comparable day after the change. Baseline 92.4M on 2026-11-16.

# Decision framing
- Product framing: Not needed
- Architecture framing: Not needed

# Links
- Product brief(s): (none yet)
- Architecture decision(s): (none yet)
- Request: (to be linked)
- Primary task(s): (none yet)

# Priority
- Priority: High
- Rationale: The morning burned most of the daily budget on rk1, the only dispatch account.

# Notes
- Measurements (2026-11-16, rk1, all claude-opus-5-5): item_208 run 30.2M, hub 14.2M, Inbox runs 12.8M and 7.4M, boot run 6.5M, other 2.0M.
- Recount with dedup on (message.id, requestId), 2026-11-16: item_208 run f470e845 15.0M over 181 calls (the first figures counted each call twice). Inbox runs 5.5M, 2.8M, 2.8M. Day 92.4M, $53.42, 99.6% Opus; hub start 55k, run start 28k.
- Denied Bash calls are a further leak: item_166 run had 6 denials in 40 calls (compound `cd && ...`, heredoc python, `rtk git -C`). Not in scope here.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |

