# crow watch and the bar panels: design options (2026-10-21)

What the board is for, in priority order (see task_001 notes): who needs me, what is
working, what finished while I was away, how much account headroom is left. Cost is a
figure to glance at, not a section. Token splits, model names, tool weights, savings prose
and the timeline are analysis: they belong on the History tab or in the selected row's
details.

Renders (fixtures, 160x45 for the TUI, 1920x1080 for the shell) are in
`local/state/night/shots/watch-ux-1021/`: `watch/<view>-<option>.png` for the options,
`before/` and `after/` for the board at four terminal sizes and both panels.
Option A of each view is **built** on branch `night/watch-ux`; B and C are mockups only
(the mockup source is kept next to the renders, `scratch/src/mockups_test.go`).

## Agents view (TUI)

| Option | What changes | Good | Costs |
|---|---|---|---|
| **A, triage list** (built) | One box, groups by what each agent asks of you: Needs you (waiting, failed or limit-stopped runs, sessions stopped by a limit), Working, Finished, Idle. One line per agent: project, task, what is happening, age, `ctx NN%` only from 70 %, cost. No column header, no commits column, no `↳` second line. Details fit their content; the timeline only takes what is left. | Answers the first question on the first line. Half the height of the old list for the same agents. Nothing hidden: commits move into the finished row ("done · 2 commits"), the context % still shows when it matters. | Context below 70 % is only in the details. The timeline drops out on a laptop when the details are long. |
| B, attention band + table | A banner box lists what needs you; below it the old Runs / Sessions / Finished table, one line per row, context bars kept. | Closest to today's board; the table columns stay comparable. | The attention rows show twice (banner and table). Still a column header and a context bar on every row. |
| C, now / while you were away | Two columns: Now (needs you, working, idle) on the left; finished runs with the first lines of their reports on the right. | The morning read sits next to the live board, no selection needed. | Halves the width of the live rows (task and action truncate on a laptop). The report column is empty during the day. |

**Picked A**: it is the only option where the first line answers "who needs me", for any
terminal size, and it removes rows and columns instead of adding a box.

## Usage view (TUI)

| Option | What changes | Good | Costs |
|---|---|---|---|
| **A, headroom first** (built) | Limits as before (one row per account, burn and run-out line). Spend on one line with today's session count; the 7-day bars only when the session list still fits. Sessions without the models column (back from 180 columns). Savings as one line. The History box leaves Usage (it has its own tab); the in/out/cache split moves to History. | The sessions list gets the height back; every figure on the old first screen is still on some tab. | The model per session is only on very wide terminals. |
| B, account cards + recommendation | Wide 5h and week gauges per account and a line "next run goes best on spare", then spend and sessions. | Turns headroom into a decision. | The recommendation rule is a product choice (tightest window? policy?). Wide gauges cost a column of text. |
| C, two columns | Limits, spend and savings on the left; sessions on the right. | Everything on one laptop screen, no scrolling. | Session titles truncate; the split repeats crow watch's wide grid on a laptop. |

**Picked A**: same information order as the Agents view, and no new product rule. B's
recommendation line is worth adding later if the owner wants it (decision below).

**Revised 2026-10-22: picked C, extended** (built on `chg/watch-usage-c`):
- Two columns from 140 wide. Left: Limits, Spend (the 7-day bars as the big figure, $ and
  tokens under each day), Savings today (value, rate, a short note). Right: Sessions, full
  height. A tall left column adds the week's projects under the bars. Narrower terminals
  stack the same boxes.
- Each session row shows its account and the points of that account's current 5h and
  weekly windows it used (`crow-usage` `sessions[].limit_share`: its cost in the window over
  the account's, times the share used; hour granularity). Shown on the session's newest row.
- Day dividers in Sessions are a quiet rule (slot 8) with the day and totals in slot 7.
- The Savings tab is gone (tabs: 1 Agents, 2 Usage, 3 History). History carries the full
  savings table for the period, with the explanations wrapped, and the day table gains
  cache saved, routing and compactions. The "how measured" prose moved to `?`.
- Gauges draw `━` on a `━` track in slot 8.

## Agents view, revised 2026-10-22

- Cost leaves the Agents rows and details (Usage has it per session).
- Project, age and context columns size to their content: "12h01 ago" shows in full.
- "What is happening" and Recent activity show a tool call's own description (Bash
  `description`, Agent `description`); a bare command loses its leading `cd` and long paths.

## Interrupted sessions (item_009)

| Option | What changes | Good | Costs |
|---|---|---|---|
| **A, rows in Needs you** (built, read only) | Sessions stopped by a limit in the last 24 h (from `crow sessions list --json`, not relaunched, not open again) show as `‖` rows under Needs you: "main 5h limit, back 19:46", "· N folders" when cdx cannot hand them off. The details show the last prompt and `crow relaunch <id>`. | Blocked work is where the owner already looks. No new tab. | The relaunch itself still runs from a terminal (decision 2 of item_009 is open). |
| B, a Resume tab | item_009's option A: a fifth tab with the registry, accounts and the exact cdx command. | Room for the account choice and a dry run. | One more place to look; blocked work hides behind a key. |
| C, banner only | A one-line banner with the count; the list stays in `crow sessions`. | Smallest change. | The sessions themselves are not on the board. |

## Bar panels

- **Agents panel A** (built): the same groups as the TUI (NEEDS YOU / WORKING / FINISHED /
  IDLE), one line per row, no table header, context % only from 70 %, the footnote gone;
  the pill's `◆N` now counts everything under Needs you. Interrupted sessions come from a
  second, once-a-minute poll (`sessionsCommand`). Panel width 620 → 680 px.
- Agents panel B: only Needs you and Working rows, the rest as a count line. Shorter, but
  finished runs disappear from the morning glance.
- **Usage panel A** (built): the in/out/cache line and the five savings rows with their
  explanations become one savings line; a waiting retro suggestion gets its own accent
  line. Limits, today, the 7-day bars and the top sessions stay.
- Usage panel B: limits, today and top sessions only. Tightest, but savings leave the bar.

## Where cost could show in the agents panel

1. **TUI row, last column** (built in A): the session's cost so far, from the usage data
   crow watch already loads. Blank for runs without a session id.
2. **Panel row, after the age**: needs the usage numbers in the agents store. Either the
   agents module reads `crow usage --json` too (a second, heavier poll every minute), or
   `crow json` adds `cost_usd` per agent (crow-runs reads the same transcripts). The
   second is cheaper and keeps one source; it is a crow-runs change, not built tonight.
3. **Panel title**: today's total next to the slot gauge. Cheap, but repeats the usage pill.
