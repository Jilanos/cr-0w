# Open threads

One note in the vault crow folder: `Open Threads.md` (`bin/crow-state path threads`; `local/state/open-threads.md` only while `vault.crow_dir` is unset). It lists open work by who acts. It stays a plain checkbox list that Obsidian Tasks can read.

## Format
```
## Me
- [ ] 2026-10-22 [project] text → next step
## Crow
- [ ] 2026-11-02 [project] item_047: text → next step
## Waiting
- [ ] 2026-11-02 [project] Person: text → next step
```
- Line shape: `- [ ] YYYY-MM-DD [project] text → next step`. The date is the last touch.
- `## Me`: the owner acts.
- `## Crow`: the hub or a project session acts. Point to the Logics item (`item_047`) when one exists instead of restating it.
- `## Waiting`: someone else acts. The text starts with the person's name, then a colon.
- Moving an item to another actor means moving the line and re-dating it.
- Optional due date: `📅 YYYY-MM-DD` at the end of the line (Obsidian Tasks marker). `crow-pending` reads it and the brief lists the line once it is past due (runbooks/pending-items.md).

## Rules
- Done means gone. A ticked item leaves the file in the same write and is logged with `bin/crow-log "[project] done: text"` (daily note, CR-0W section).
- Never write a status note here. Project state goes to `Status.md`, constraints and decisions to one note each in `Decisions/`.
- Stale: no touch for 14 days (date older than today minus 14). Readers list stale lines and ask keep, re-date or drop. Drop means the line leaves the file.
- One line per item. Update a line in place, never duplicate it.

## Grooming (when the file grows past ~30 lines)
1. Back up the file to the scratchpad first.
2. Drop lines already tracked by a Logics item or a ticket; the tracker is the source.
3. Ask the owner which lines are done, settled or still live (one prompt, grouped).
4. Important stale work: turn it into a ticket (dedupe first, draft shown) or a Logics request in the owning repo, then drop the line.
5. Low-value ideas: park them as a Logics request or in the project's decision note, not here.
6. Log each removal with `bin/crow-log`.

## Who reads and writes
| Skill | Access |
|---|---|
| `wrap`, `eod` | Write: add, update, move, remove done lines |
| `brief` | Read: Me first, then Waiting with age in days, then stale lines |
| `afk` | Read: the Crow section only |
| `crow-pending` | Read: every section through the pending schema; `crow-tidy --apply` purges `- [x]` lines older than `pending_settled_days` |

Any new writer follows this runbook and does not add other sections.
