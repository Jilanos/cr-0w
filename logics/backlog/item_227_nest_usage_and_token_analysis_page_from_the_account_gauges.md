## item_227_nest_usage_and_token_analysis_page_from_the_account_gauges - Nest usage and token analysis page from the account gauges
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
- Summary: Clicking an account gauge in the Nest header opens a Usage page: per account 5h and week windows, burn rate, reset times, cost per run, per project and per model, and the token savers (cache hit, hub start context) from crow-cost-audit.
- Keywords: nest, usage, tokens, accounts, gauges, cost, burn rate, crow-cost-audit
- Use when: building the Usage page.
- Skip when: account picking logic (item_027, item_095).

# Problem
- Deck usage features (item_003, item_019, item_061, item_075) are not in Nest. The header gauges (0a925df) show levels but open nothing.

# Scope
- In:
  - Route `/usage` and `/usage/<account>`; header gauge click opens it.
  - Per account: 5h and week windows with reset time, burn rate, projected end of window, floor lines (req_064 quota floors).
  - Analysis: tokens and cost per day, per project, per model, per run kind; top runs; cache hit; hub start context. Data from `/api/state/usage` and `bin/crow-cost-audit --json` (add the JSON output if missing).
  - Charts follow the dataviz rules; mockups first.
- Out:
  - Changing quotas or accounts from the page.

# Acceptance criteria
- AC1: Owner approved the Usage board first.
- AC2: Clicking a gauge opens that account's page; numbers match `cdx status` and crow-cost-audit for the same window.
- AC3: Charts readable on 368x812.

# AC Traceability
- req_063_nest_pages_and_inbox_as_the_home_for_everything_that_waits-AC -> This backlog slice. Proof: Owner approved the Usage board first.

# Dependencies
- Header gauges 0a925df. crow-cost-audit.

# Links
- Request: req_063_nest_pages_and_inbox_as_the_home_for_everything_that_waits.

# Priority
- Priority: Medium
- Rationale: Owner asked for it; helps the token work (item_213).

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
