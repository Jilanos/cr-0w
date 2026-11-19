## item_248_laptop_home_left_column_readable_and_filling_its_height - Laptop Home left column readable and filling its height
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 90%
> Confidence: 85%
> Progress: 0%
> Complexity: Medium
> Theme: General
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.

# AI Context
- Summary: Rework the laptop Home left column (Needs you, Next, Running) so each row says what it needs and the cards use the full column height.
- Keywords: home, laptop, needs you, running, layout, mockup
- Use when: redesigning the laptop Home side column.
- Skip when: phone or Fold Home (item_176 boards).

# Problem
- Owner 2026-11-18: Needs you and Running rows are too small to understand what they need ("( <REPO> waits 8m", the session name cut off). The cards leave a large empty space under them.
- Owner choice: mockup first. Show 2-3 options side by side (bin/crow-compare) and wait for the pick before building.
- Already done (10377fe): the chat rail on Home folds (Ctrl+B), folded while the chat is empty, so the hologram takes the width.

# Scope
- In:
  - 2-3 annotated mockups from live data (screenshot of today in vault Research/nest-design/item_248/). Ideas: two-line rows (title, then project · what it asks); Needs and Running share the column height with their own scroll; the ask question or tool shown in the row; a compact Next.
  - Build the picked option, one screen, compare it to the board, wait for OK.
- Out:
  - Desk, phone and Fold layouts. The hologram.

# Acceptance criteria
- AC1: The owner picked an option from the side-by-side page.
- AC2: A Needs row shows who asks, the project and what it asks without truncating the key part at 1440 wide.
- AC3: No empty block under the cards when items exist; the column fills the height.
- AC4: Vitest and shots pass; the build matches the picked mockup.

# AC Traceability
- request-AC1 -> This backlog slice. Proof: bounded delivery slice.
- request-AC2 -> This backlog slice. Proof: promotable backlog item.
- request-AC3 -> This backlog slice. Proof: delivery chain includes a task-ready backlog item.

# Decision framing
- Product framing: Not needed
- Architecture framing: Not needed

# Links
- Product brief(s): (none yet)
- Architecture decision(s): (none yet)
- Request: (to be linked)
- Primary task(s): (none yet)

# Priority
- Priority: Medium
- Rationale: Owner feedback on the live app, 2026-11-18.

# Notes
- Generated locally by logics-manager.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |

