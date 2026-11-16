## item_217_nest_holotable_board_build_behind_the_table_flag - Nest holotable board build behind the table flag
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 60%
> Confidence: 60%
> Progress: 0%
> Complexity: High
> Theme: General
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: Build the approved A and B boards under the lit planets behind `?table=a` and `?table=b`.
- Keywords: nest, holotable, board, war table, build, table flag
- Use when: building the boards after item_215 is approved.
- Skip when: the sketches are not approved yet.

# Problem
- The boards picked in item_215 need to run live with every data cue of the current table.

# Scope
- In:
  - Board A and board B as approved in item_215, beside scene.ts, sharing the planets module of item_216.
  - Every cue of the current table: priority height, state colour, ping beam, hover and select, labels (phone 1, laptop/web 3).
  - Build one board at a time; show it against the approved render and wait for an OK before the next (owner rule: UI rebuild one screen at a time).
- Out:
  - other themes until cyber is approved.

# Acceptance criteria
- AC1: `?table=a` and `?table=b` show the approved boards; default unchanged.
- AC2: Each data cue listed above works on both boards (checked against scene.ts behaviour).
- AC3: Owner OK on each board against its approved render.

# Dependencies
- item_215 approved; item_216 done.

# Links
- Request: req_062. Design: item_212, item_215.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |
