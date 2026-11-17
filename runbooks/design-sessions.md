# Design sessions

Image-heavy sessions hit the 150k auto-compact cap fast. The cap stays. The workflow
keeps every decision outside the context and keeps images small.

## Start
- The design skills and the figma/playwright MCP servers are off in the hub (they cost
  about 3.8k tokens on every call). Turn them on at the start of a design session:
  `/plugin enable crow-design@crow`, then `/reload-plugins`. Skills show as `crow-design:<name>`.
- Turn it off again before the session goes back to hub work: `/plugin disable crow-design@crow`.
- The plugin is built from `skills/ext.list` by `bin/crow-skills-ext link` (vendor/plugins).

## Notes file
- One `design-notes.md` per design item, in the item's vault research folder
  (`crow-state path research`/<topic>/<item>/).
- Sections, in this order: `## Decided`, `## Rejected`, `## Open`, `## Files`.
- Update it right after every owner answer, before the next render.
- Decided items are final. Never ask them again.

## After a compaction
- The project `SessionStart` hook (matcher `compact`) runs `bin/crow-design-notes hook`.
  It finds the last `design-notes.md` the session wrote (Edit/Write) and prints it into
  the fresh context (up to 8k chars). A session that only named or read one gets nothing.
- Check by hand: `bin/crow-design-notes find <transcript.jsonl>`.
- A new session on the same item reads the notes file first.

## Images
- Never read a full 2x screenshot back. Crop and downscale first:
  - `bin/crow-crop IMG --region WxH+X+Y --width 600`: one crop (source pixels).
  - `bin/crow-crop --sheet A.png B.png C.png [--region ...]`: options side by side,
    labelled, at most 800px wide. One read instead of three.
- Output goes to `local/state/crops/`.
- Zoom crops for contrast checks stay small too (`--width 400`).
- The owner compares full-size options in `bin/crow-compare` pages, not in the chat.

## Renders
- Render through scripts (`runbooks/nest-screenshots.md`, `runbooks/headless-webgl-render.md`).
  Never paste large render sources into the conversation.
- Keep render sources in files; edit them with small diffs.

## Split
- Past about 100k in a design session: update the notes file, then `/wrap` and start
  fresh from the notes and the item.
