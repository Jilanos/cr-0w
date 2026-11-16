# Cost audit

Measure where hub tokens and money go, and re-measure after a change with the same method.

## Sources
- `crow usage --json --days 14`: per-session cost, kind, project, title.
- `cdx stats --by project`, `cdx runs --since 30d`: headless runs and their cost.
- Claude transcripts in every cdx profile: `<profiles>/*/claude-home/.claude/projects/*/*.jsonl`.

## Cost split (quick)
- `bin/crow-usage --split`: one line, last 14 days, cost by part: reload (cache writes), reread (cache reads), output, input, plus the runs' reload share.
- `bin/crow-usage --json`: `cost_split.by_kind` (all, interactive, run) for the same window; `sessions[].cost_split` and each `by_day` entry carry the parts too.
- The parts sum to the session cost. They use the same price table as the totals.

## Script
- `bin/crow-cost-audit --days N [--json] [--hub PATH]` runs the method below: dedup, context buckets by model, per project, per skill class, and the first-turn context of interactive hub sessions (`start_context`). Use it for the baseline and the re-measure (same `--days`).
- `bin/crow-usage` `by_model` gives each model its own turns (a multi-model session no longer lands on its first model); `tests/test_crow_usage_by_model.py` recounts a transcript.

## Method
1. Read assistant events from the transcripts of the window. Deduplicate on `(message.id, requestId)`: one API call is written as several lines and counting every line inflates cost about 2x.
2. Context size of a turn = `input_tokens + cache_read_input_tokens + cache_creation_input_tokens`.
3. Price each turn with list prices per model (input, output, cache read at 0.1x input, 1h cache write at 2x input, 5m write at 1.25x). Take prices from cdx's table (`cdx_manager.run_usage.token_prices`), as crow-usage does.
4. Bucket by model and context size: `<50k`, `50-100k`, `100-150k`, `>150k`. Report cost, share, turn count, median and p90 context for the top bucket, and the top bucket by project.
5. Skills and hooks: classify sessions from crow usage by first prompt (`/brief`, `/daily`, `/weekly`, retro digest, probe, other headless, interactive) and sum cost per class.
6. Report only computed numbers. Note the window, the price table and the dedup key in the report.

## Gotchas
- crow-usage's per-model split of multi-model sessions has been wrong before (Haiku inflated). Cross-check `by_model` against a transcript recount.
- Subagent transcripts live under `<session>/subagents/`; include them, they share the parent's project.
- A re-measure must use the same window length and the same price table as the baseline.

## Hub start context (item_029)
Baseline 2026-11-04, interactive sessions started in the hub, first-turn context (input + cache reads + cache writes), last 14 days, `bin/crow-cost-audit`-style recount:
- account with 2 plugins (ui-ux-pro-max, claude-hud) and the Atlassian MCP server: 42 sessions, median 48.8k, max 50.4k.
- account with 1 plugin (humanizer) and no MCP server: 11 sessions, median 42.6k, min 40.6k, max 43.1k.
- Difference about 6k tokens per session start: the plugin skill listings and the MCP tool names. The rest (about 42k) is Claude's own system prompt and tools, the hub CLAUDE.md (7 KB), the memory index (5 KB), the repo skills and hooks output.
- Last 7 days overall: 5533 turns, $277.54; 1080 turns past 150k context.
After the owner trims the profile (plugins or MCP are profile settings outside the repo), re-run the same measure with the same window and record the "after" line here.

## Context read per day (item_213)
`bin/crow-cost-audit --days 1` prints the context read (input + cache reads + cache writes, summed over deduplicated calls) per model and per kind, plus the first-turn context of hub sessions and of dispatched runs. `crow-runs report <id>` ends with the same figures for one run.
- Count calls deduplicated on (message.id, requestId). A raw event count doubles them: the 2026-11-16 item_208 run read 15.0M over 181 calls, not 30.2M over 367.
- Baseline 2026-11-16 (window 1d, ending 18:40 local): 92.4M context read, $53.42, 99.6% Opus. Interactive 62.9M, headless 29.4M. Hub start median 55k (6 sessions); run start median 28k (7 runs).
- A run's start (28k) is Claude's system prompt and tools, the hub CLAUDE.md, the memory index and the skill listing. Each run then reads `local/owner-prefs.md` (about 6.6k) and keeps it for every call.
- Biggest levers measured that day: run size (one 6-bug run read 15.0M), repeated review rounds (5.5M + 2.8M + 2.8M for one item), Opus on mechanical work, denied Bash calls (each one is a full call; the item_166 run had 6 in 40 calls).
- Hub habits: show screenshots as zoom crops, not full frames; split the session before 120k (runbooks/long-sessions.md).
- Re-measure a comparable day with the same command and window. Target: at least 40% less context read for similar work.
