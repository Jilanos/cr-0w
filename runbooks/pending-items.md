# Pending items

One schema for everything that waits: the `Open Threads.md` note and any pending file kept as Markdown tables and lists. `bin/crow_pending.py` reads both. `bin/crow-pending` is its CLI. The brief, the tidy step and the Inbox `followup` kind read through it.

## Sources
- The Open Threads note (`bin/crow-state path threads`), format in `runbooks/open-threads.md`.
- The files listed in `crow.yaml`, brick `core`:
```yaml
modules:
  core:
    pending_files: [/path/to/pending.md]   # or {path: ..., label: ...}
    pending_settled_days: 14                # settled rows older than this are purged
    pending_sections: {Follow-ups: waiting} # heading prefix -> kind, added to the defaults
    pending_columns: {Owner: who}           # column name -> field, added to the defaults
```
Alias matching ignores case, accents and leading emoji. Headings and columns in another language need their aliases here. The engine ships English defaults only.

## File shape
- `## Heading`: one section. Its kind comes from `pending_sections` (default: Me, Crow, Waiting, Follow-ups, Decisions, Drafts, Files, Paused, Notes, Settled, Done). Unknown headings read as `other`.
- `### Heading`: a block inside the section (`block` field).
- A table: consecutive `|` lines. The first line is the header, even when rows sit between it and the separator.
- A bullet (`- ` or `* `) plus its indented continuation lines: one item.
- Checkbox lines `- [ ] YYYY-MM-DD [project] text → next` read as in Open Threads. In a `waiting` section `Name: text` fills `who`. `📅 YYYY-MM-DD` (Obsidian Tasks) is the due date. `- [x]` is settled on its date.
- A settled bullet starts with its date: `- 2026-11-19 text` or `- 19/11 text`.
- Dates: ISO, `dd/mm[/yyyy]` (a year-less date takes the nearest year), ISO week `S46` or `W46` (its Monday).

## Item record
| Field | Meaning |
|---|---|
| `id` | hash of source, section and raw text (`-2`, `-3` for duplicates) |
| `source`, `line` | label of the file and first line (1-based) |
| `kind` | me, crow, waiting, decision, draft, file, paused, note, settled, other |
| `section`, `block` | `##` and `###` titles |
| `shape` | `row` (table) or `line` (bullet) |
| `title`, `who`, `expected`, `next`, `project`, `priority` | from columns or the checkbox line; a row without a title column takes `expected` |
| `due`, `since`, `touched`, `settled_on` | ISO dates; `due_raw`, `since_raw` keep the written text |
| `overdue_days` | days past `due`, open items only |
| `status` | first status emoji: urgent, soon, review, go, action, paused, unsure |
| `cells`, `raw` | the row by column name, the verbatim text |

## Commands
- `crow-pending check FILE...`: the loss check. The spans join back to the exact file. It prints counts only (lines, sections, spans, items per kind) and exits 1 on a loss.
- `crow-pending list [--kind K] [--json]`: items of every source.
- `crow-pending inbox`: open `waiting` items as Inbox `followup` rows (group `waiting`, most overdue first).
- `crow-pending brief`: what `crow-gather brief` puts under `pending`: items, waiting and rows to purge per source, plus the overdue lines.
- `crow-pending purge [--days N] [--apply]`: drop settled items older than N days. Dry run without `--apply`. Undated settled items stay. A file changed since the read is left for the next run. `crow-tidy --apply` runs the purge. `--skip pending` turns it off.
