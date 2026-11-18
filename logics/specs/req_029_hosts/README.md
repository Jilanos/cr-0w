# req_029 spike: hosts, model sources, local AI

Date: 2026-11-07. Scope: the parts answerable without a GPU box and without installing anything. Local benchmarks are a protocol (`benchmark-protocol.md`), to be run by the owner.
Versions checked: cdx 0.26.6 (source at commit c3e861f, docs read in the checkout), Claude Code headless as in the request req_032 findings, `agy` 1.4.12 (receipt in the cdx runbook fragment of 2026-11-03).
Private specifics (accounts, machine names) are in the owner's private research notes, not here.

## Summary

| Need | Answer |
|---|---|
| 1 Host roles | Laptop stays control host for slices 1 to 5. A homelab control host gains lid-closed scheduling and phone answers; it costs a store move plus a long-lived Claude token on a second box. cdx already runs remote workers, so the worker side needs no new engine. Decision D1. |
| 2 Tower idle worker | Define idle as four signals (see below). A tower adds almost nothing for Claude missions (the model runs at the provider). Its value is local inference and builds. Short restartable jobs only. No wake-on-LAN in v1. Decisions D2, D3. |
| 3 Benchmarks | Protocol written. Needs the three machines. Not run. |
| 4 Need check | Measured volume of model calls that could go local is small. The case for local is privacy, not cost. Decision D4. |
| 5 Antigravity | One Google account, free weekly quota with no published number, interactions stored and human-reviewable unless opted out. Fits public personal code and non-private text. Decision D5. |
| 6 Quota probe | `cdx status --json` already gives both windows for Claude. No Haiku probe needed. Antigravity quota only appears after an interactive launch. Ollama has no quota, only reachability. |
| 7 Router table | Draft below. |

## 4. Need check: what would go local

Measured on 2026-11-07 (cdx 0.26.6):
- `cdx runs --since 7d`: 84 headless runs in 6 days, 12 to 22 per day (71 assistant runs, 13 retro runs). Median total tokens per run 223k, almost all cache reads; median output 1.9k tokens.
- Existing crow scripts that call a model: retro (Sonnet, about 2 runs a day, work transcripts, stays on Claude) and the usage titles (Haiku, one short request per title). The other `bin/` scripts (today, digest, note, tidy, changelog, activity) make no model call.
- Price of the bulk text, from the cost audit table (Haiku 0.10 USD input, 0.50 USD output per million tokens): 15 summaries a day at 4k input and 200 output tokens is 60k input and 3k output, about 0.008 USD a day. Subscription windows barely move.

Candidate local uses, from the product brief:

| Use | Data class | Volume per day | Basis | Verdict |
|---|---|---|---|---|
| Run summary (finished mission) | work or personal | 12 to 22 | measured run count; 4k input excerpt is an assumption | Haiku. Work runs must not go local-or-Google. Local only as a quality or offline choice |
| Mail triage label | personal mail | unmeasured | no count of personal mail exists; see owner needs | Local if the benchmark passes. Privacy driver |
| Bank line categorisation | bank | monthly batch, hundreds of lines | brief says exports only | Local only. Privacy driver. Batch, latency irrelevant |
| Memo to action | personal | a few | owner memos | Local if quality passes, else Haiku (memos carry no bank or mail data) |
| French short prose | any | a few | butler replies and digests | Quality test. Prose rules in the owner prefs are hard for small models |
| Sunday personal weekly review | personal mail, bank | 1 a week | brief | Local only. One run, so a 10 minute run is fine |
| News rank, titles | public | 2 batches, tens of titles | brief | Haiku or Antigravity. Never needs local |

Reading:
- Nothing crow does today needs a local model. Ultron's conclusion (no measured need) holds for cost.
- The need appears only when data class forbids a cloud call: bank, personal mail, health. Those jobs are low volume, batch, and tolerate slow output. This favours a slow model on the laptop CPU over a fast one on the tower.
- Consequence for benchmarks: run the private-data tasks first (bank, mail triage, weekly review, memo). Run summary and French prose are secondary.

Owner input needed (listed, not blocking): personal mail per day, bank lines per month, whether health data is in scope.

## 1. Host roles

| | A. Laptop only (Ultron shape) | B. Laptop control, homelab later | C. Homelab control, laptop and tower workers (Jarvis shape) |
|---|---|---|---|
| Always on | No. Lid closed stops timers and the watcher | No until the move | Yes |
| Phone answers while laptop sleeps | Answer stored, resume waits (queue message in nest) | Same until the move | Immediate for non-model work (inbox, status); model work still needs an account host |
| Store and credentials | One box | One box; paths already configurable | Store moves; accounts' tokens live on the control host; backups matter more |
| New moving parts | None | None now | Tailscale hops, SSH dispatch, version match of CLIs on both ends |
| Cost to build | 0 | 0 | Store migration, remote dispatch for every kind, secrets on a small box |

Facts:
- cdx `cdx run --remote SSH_TARGET` exists for Claude, Antigravity and Ollama profiles (cdx docs/cli.md, 0.26.6). Remote Claude needs `claude setup-token` output stored in the controller profile, matching CLI versions, Python 3, bubblewrap, pasta, nftables. Remote `--continue-run` is not supported (same doc). So a run parked on a worker cannot be resumed from another host through cdx today.
- The control host does not need to run models. It runs a scheduler, a watcher, a store and an API. Those fit a small box; the homelab's low RAM matters only for Ollama.
- Lid-closed scheduling (req_023) is the only hard gain. Alternative that keeps the laptop as the control host: keep the lid open on AC with suspend inhibited. Cheap, uses no new box.

Recommendation: B. Keep the config paths host-independent so a move later is a copy. Re-decide when slice 5 is done and the lid-closed gaps are counted. Decision D1.

## 2. Tower as idle worker

What a tower can do for crow:
- Claude missions: little. The model runs at the provider; the host runs git, tests and the CLI. A laptop does that fine. The gain is only parallel builds or heavy test suites.
- Local inference (Ollama) with a GPU: the real gain. Whether it has a GPU, how much VRAM and which OS are unknown to this spike (needs env).

Idle definition (all four must hold for N minutes, defaults in brackets):
1. No input on the seat for [15] minutes. Measured on this laptop's Wayland session: logind `IdleHint=no`, `IdleSinceHint=0`, so nothing sets the hint here. A desktop idle daemon must set it (swayidle can set the logind idle hint, man page: [swayidle(1)](https://man.archlinux.org/man/swayidle.1), read 2026-11-07), or a compositor implementing `ext-idle-notify` is queried. On X11, `xprintidle` is the usual tool; not checked.
2. No game process: Steam game children, Proton or Wine processes, or a client registered with GameMode. The `gamemoded` query commands are from memory and not verified (the README fetched on 2026-11-07 documents only `gamemoded -t`). Check on the tower.
3. GPU free: no compute or graphics client above [10] percent utilisation. `nvidia-smi` for NVIDIA, `/sys/class/drm` counters otherwise. Not present on the laptop; check on the tower.
4. Not in a time window the owner marks as play (config list, e.g. evenings).

Yield when a signal flips back:
- Ollama jobs: stop admitting; let the running generation finish (seconds to minutes), then unload the model so VRAM frees (`keep_alive` 0 in the request, documented in the [Ollama API](https://docs.ollama.com/api), not re-verified).
- Short code jobs (tests, builds): SIGTERM, requeue with attempt count +1. Cap at 3, then run on the laptop.
- Long Claude missions: never start on the tower while remote `--continue-run` is unsupported. A kill would lose the work.
- Pausing with SIGSTOP is rejected: the provider connection times out while the process sleeps.
- Hysteresis: start only after 5 minutes of idle, stop within 10 seconds of a signal.

Wake-on-LAN:
- Mechanism: `ethtool -s <iface> wol g` enables the magic packet; `ethtool` options are listed in its [man page](https://man.archlinux.org/man/ethtool.8), read 2026-11-07, which does not say if the setting survives reboot (persist with a NetworkManager or systemd `.link` setting; not checked). BIOS must allow wake from the soft-off state. Wired only in practice.
- A magic packet is a link-layer broadcast. Something on the tower's LAN must send it: the homelab (always on) or the router.
- Superseded 2026-11-18 (owner, req_056): wake from sleep is in scope, sender the router's WOL proxy; see item_242 and item_243.
- Owner decision 2026-11-07: no wake-on-LAN in v1 (later, not a priority). The tower takes work only when already on and idle. Add WoL when the homelab exists and scheduled night jobs want the tower. Decision D3.

## 5. Antigravity and Google free usage

What cdx needs (cdx 0.26.6 docs/cli.md and source):
- `agy` CLI on PATH, a Google login in the OS keyring (local profile), registered with `cdx add antigravity <name>`. Headless runs use `agy -p --output-format json`.
- Remote Antigravity: the worker's own login, a mode-600 token file mounted read-only, bubblewrap, matching `agy` versions. The cdx docs state the egress list is not yet accepted against live inference.
- cdx reports no token usage for interactive Antigravity sessions and reads quota from a statusLine hook captured on interactive launches (readings older than 24 hours are stale). Headless runs give token counters in the JSON result.
- `agy` is not installed on this laptop; nothing here was run against Google.

Google terms (primary pages read 2026-11-07; none shows a revision date except where noted):
- Plans page, [antigravity.google/docs/plans](https://www.antigravity.google/docs/plans): users not on a paid plan get "a meaningful quota, refreshed weekly" and a weekly rate limit, no number; "Usage limits for this service are subject to modification"; individual accounts fall under "terms derived from Google's Terms of Service". Paid plans refresh every five hours.
- Antigravity terms, [antigravity.google/terms](https://antigravity.google/terms): Google records and stores interaction data while the service runs; uses interactions "to evaluate, develop, and improve Google and Alphabet research"; "Google employees and contractors may access, view, review and use Interactions"; opt-out in settings; "Please don't submit confidential information". Clause 6 forbids "using third party software, tools, or services to access the Service". The page has no clause on several accounts.
- Gemini API terms for unpaid use, [aistudio.google.com/docs/terms](https://aistudio.google.com/docs/terms) (effective 2026-03-23): submitted content and responses are used to improve products; human reviewers may read them; no retention period stated; no clause on several accounts or projects.
- Several accounts: no primary text found that allows or forbids it. A Google developer forum thread on rotating free keys cites the "API Limitations" clause of the Google APIs terms (do not circumvent limits) and gets no official answer: [discuss.ai.google.dev](https://discuss.ai.google.dev/t/is-it-allowed-to-use-friends-free-tier-api-keys-for-a-shared-project/190686). Spreading one person's load over several accounts to get past a limit reads as circumvention. The roadmap review already settled one account.
- Third-party reports (not primary, treat as unverified): free limits cut several times since the November 2025 launch; Gemini CLI stopped serving free individual accounts on 2026-06-18 ([cloudzero.com](https://www.cloudzero.com/blog/google-antigravity-pricing/)); a forum post claims 429 errors for free users ([discuss.ai.google.dev](https://discuss.ai.google.dev/t/feature-request-add-gemini-3-5-flash-minimal-lite-for-free-tier-antigravity-cli-and-app-workflows/168437)).

Fit:
- Fits: code for public personal repos (the code is already public), research on public material, cheap text on non-private input (titles, ranking of public news).
- Does not fit: work data, bank, mail, health, private repos. Rule stays.
- Unknown: the free weekly size. Measure it: one account, a fixed probe task, count tasks until the first limit error; repeat over two weeks (needs the owner's login).
- Risk: terms and limits change without notice; keep Antigravity as an overflow row with a Claude fallback, never the only path.
- Clause 6 check: cdx launches the official `agy` binary; it does not call Google endpoints itself. That reads as compliant. A tool that reused the token without `agy` would not.

## `cdx run --provider` options

| Provider | Headless via `cdx run` | Needs | Quota signal | Notes |
|---|---|---|---|---|
| claude | yes | CLI, login or long-lived token | 5h and week percentages | Remote needs token, bubblewrap, pasta, nftables |
| codex | yes | CLI, login | typed block reason, credits | Out of scope for this spike |
| antigravity | yes (`agy -p`) | `agy`, Google login | statusLine buckets after interactive launches | No usage in interactive sessions |
| ollama | remote only in the docs (`--remote`, text generation) | Ollama on the worker, model installed, no auth | none | Local `cdx run` with Ollama is not documented and was not tested; `cdx <name> --prompt` is refused for Ollama (source: `src/cli.py`) |

Ollama consequence: for crow's small local calls, the direct Ollama HTTP API ([docs.ollama.com/api](https://docs.ollama.com/api)) is simpler than cdx. cdx adds run records and the sandboxed relay. Decision D6.

## 6. Quota probe

What `cdx status --json` returns per account (measured 2026-11-07): `remaining_5h_pct`, `remaining_week_pct`, `available_pct` (equals the lower of the two in all five rows), `reset_5h_at_iso`, `reset_week_at_iso`, `runs_out_at_iso` (burn-rate projection, null when idle), `rate_limit_reached`, `policy` (use, ask-first, never), `priority`, `max_parallel`, `auth_status`, `updated_at`, `active`, `last_launched_at`. `--cached` skips the refresh, `--refresh` forces it. `cdx select --provider P --require-ready --json` ranks ready accounts.

Consequences:
- No Haiku probe for Claude. The one-token request is what Ultron needed without cdx. It would spend quota and needs headers that are not documented by the provider (third-party reports name `anthropic-ratelimit-unified-5h-utilization` and 7-day variants, see [claude-code issue 12829](https://github.com/anthropics/claude-code/issues/12829) and [55333](https://github.com/anthropics/claude-code/issues/55333); not checked against a live response).
- Freshness: check `updated_at`. In the sample, the reading was 3 minutes old. Refresh before admitting a long run.

Room (proposal for core):
- `room = min(remaining_5h_pct, remaining_week_pct)` (same as `available_pct`).
- Admit a background run when `policy == use`, `auth_status == authenticated`, `rate_limit_reached` is null, `room >= 20 + interactive_reserve`, and `runs_out_at_iso` is null or after the run's expected end.
- `interactive_reserve` per account, default 0 on accounts used only by core, 30 on the account the owner works in. Per-night overrides come from the AFK decisions file.
- Antigravity: use cdx's 5H and WEEK buckets when the reading is fresh (under 24 hours); otherwise treat as unknown, admit one small run, and read the JSON result or the error. Ollama: reachability and model present, no quota.
- Script outline (AC4): `bin/crow-room`: call `cdx status --json --cached`, refresh when `updated_at` is older than 10 minutes, print one row per account (name, provider, room, reset, admit yes/no and why). About 60 lines of Python on `crow_lib`. Not written in this spike (no product code).

## 7. Router table (draft, to paste into core config)

Columns: kind, scope, data class, then ordered choices. Effort and model come from the kind defaults in `crow_lib.RUN_KINDS` (task Opus medium, review Opus high, retro Sonnet low, oneshot Opus medium). Accounts are roles, resolved by the scope pick (req_025).

| Kind | Scope | Data class | 1st | 2nd | 3rd | Host |
|---|---|---|---|---|---|---|
| task, review, research | work | work | Claude, work account | Claude, personal account if policy allows | none (ask owner) | laptop |
| task, review, research | personal | personal-code, public repo | Claude, personal account | Antigravity (overflow) | Claude, shared account (ask first) | laptop, tower for builds |
| task | personal | personal-code, private repo | Claude, personal account | Claude, other personal account | none | laptop |
| retro, run summary | work | work | Claude Sonnet low | Haiku | none | laptop |
| run summary | personal | personal | Haiku | local (after benchmark) | Antigravity | laptop |
| mail triage, memo to action | personal | private | local | Claude Haiku only if the owner allows the class | none | tower or laptop |
| bank categorisation, weekly review | personal | private | local | none | none | tower or laptop |
| titles, news rank | any | public | Haiku | Antigravity | local | laptop |
| French prose for work artifacts | work | work | Claude | none | none | laptop |
| chat (butler) | per scope | per scope | Claude per scope row | none | none | laptop |

Rules:
- Work data never leaves Claude. Private data never leaves the owner's machines. A row with no fallback stops and asks.
- A data class is set by the source, not the kind (roadmap review).
- A failed row falls to the next only if the next allows the same class.

## Decisions (owner, 2026-11-07)

D1 Control host. Laptop now, homelab later when the gaps are counted (B). Keep config paths host-independent.

D2 Tower scope. Also Claude missions (B). The tower needs cdx config, accounts and worktrees, and run records are gathered from two hosts (item_120). Remote `--continue-run` is unsupported in cdx 0.26.6, so a resume on the tower is a cold run.

D3 Wake-on-LAN. Later, not a priority, none in v1. A magic packet from the homelab once it exists. Open point.

D4 Benchmarks first. Private-data tasks (A).

D5 Antigravity. One account as overflow after measuring the free weekly quota; public personal code and cheap text only (A, item_121).

D6 Local call path. Direct Ollama HTTP over tailscale (A).

Needs env: the benchmark protocol on three machines; the tower's OS, GPU and VRAM; `agy` installed with one login for the Antigravity weekly-size measurement; personal mail and bank volumes.
