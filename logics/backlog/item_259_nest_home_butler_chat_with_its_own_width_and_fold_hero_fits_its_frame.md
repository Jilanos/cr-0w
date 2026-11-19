## item_259_nest_home_butler_chat_with_its_own_width_and_fold_hero_fits_its_frame - Nest Home butler chat with its own width and fold, hero fits its frame
> From version: 1.0.0
> Schema version: 1.0
> Status: Ready
> Understanding: 90%
> Confidence: 85%
> Progress: 15%
> Complexity: Medium
> Theme: Nest
> Reminder: Update status/understanding/confidence/progress and linked request/task references when you edit this doc.
> Indicators reviewed: 2026-11-19 17:32:08

# AI Context
- Summary: Nest Home in two parts: the hero takes about 2/3 of the screen, the right third is the butler chat with the old left column folded into a header above it. Home keeps its own chat width and fold state, and the hero fits its frame without clipping or a janky resize.
- Keywords: nest, home, butler, chat, rail, fold, width, hero, holo table, resize
- Use when: changing the butler rail on Home or the hero sizing.
- Skip when: the rail on other pages (item_256 done there).

# Problem
- Owner 2026-11-19: folding the chat on Home widens the hero and the holo table clips at the edges.
- The hero resize animates badly while the rail width changes.
- Home should be the most comfortable place to talk to the butler; today it is the same rail as every page.
- One fold key (`nest.rail`) and one width key (`nest.railw`) are shared by every page.
- Owner 2026-11-19: the Home left column is often quite empty. Merge it into a header above the chat and give the hero about 2/3 of the screen.

# Scope
- In:
  - Home layout: hero about 2/3 wide; right third = left-column facts as a compact header, chat below it.
  - Mockups first (laptop and Fold inner, both themes): owner picks the header content and density before the build.
  - Fold inner (about 707x691): redesign Home so it uses the panel space (owner 2026-11-19: the inner display wastes space). The mockups decide whether it takes the laptop split or its own layout.
  - Home keeps its own fold and width keys, separate from the other pages.
  - Home opens the chat wider by default (about 40% of the window, clamped like item_256).
  - The hero fits its frame at every width: the holo table never clips. No width tween on the hero; it refits once when the fold or drag ends.
  - Shots at rail open, folded and dragged, both themes, laptop sizes.
- Out:
  - Other pages' layout (they keep the item_256 rail).
  - Phone cover Home (keeps its own layout; item_228). Owner likes the cover hero size as is.

# Acceptance criteria
- AC0: Owner approved the Home mockup (hero 2/3, header plus chat) before the build.
- AC1: Folding or resizing on Home leaves the other pages' rail as it was, and the reverse.
- AC2: First visit to Home shows the wider chat.
- AC3: No clipping of the holo table in shots at 1280 and 1920, rail open and folded, both themes.
- AC5: Fold inner Home uses its space per the approved mockup; shots in both themes, hero not clipped.
- AC4: Fold and drag on Home show no stretched or jumping frames (recorded check or frame shots).

# AC Traceability
- `req_063_nest_pages_and_inbox_as_the_home_for_everything_that_waits` AC2 -> This backlog slice. Proof: Home chat works without clipping.

# Decision framing
- Product framing: Not needed
- Architecture framing: Not needed

# Links
- Request: `req_063_nest_pages_and_inbox_as_the_home_for_everything_that_waits`
- Builds on: `item_256_resizable_butler_chat_rail_in_nest`

# Priority
- Priority: Medium
- Rationale: Owner-visible glitch on the most used page; small build.

# Executions
| When | Runner | Run id | Title | State | PR | Notes |
| --- | --- | --- | --- | --- | --- | --- |

# Notes
- 2026-11-19, table fit done ahead of the layout: the table scale width is `min(w, 1.05 * h)` (`FIT` in `src/hero/scene.ts`). Wide, short heroes (Fold inner 683x420, laptop with the chat folded 1010x816, 1920 folded) keep the table and planets in the frame. Cover and laptop with the chat open are unchanged (width under 1.05x height). Shots: `scripts/hero-fit.mjs`, `local/state/shots/hero-fit/compare.png`.
- Still open: the Home layout itself (AC0-AC2) and AC4 (no jump on fold/drag).
