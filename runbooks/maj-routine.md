# maj routine (end-of-night update)

One command that reads everything new and refreshes the owner's pending file. `brief` only displays its report.
Skill: `local/hub-skills/maj/SKILL.md` (private, linked as `.claude/skills/maj`). Config: `local/maj.json`. Copy `examples/maj.json` and set private paths and account names.
`CROW_HOME` selects the data root containing `local/`; executables come from the current checkout.

## Pieces
- `bin/crow-maj`: watermark (`since`/`mark`), handled-message registry (`seen has|add`), attachment staging folder (`stage`), `board`, `night`.
- `bin/crow-mailtxt <saved read_resource file>`: headers + body without the quoted history (avoids context blow-ups on long threads).
- `bin/crow-board <file.md>`: pending Markdown → self-contained HTML (collapsible sections, status filters, working-day ages, hover for long cells, path and mail links, auto-reload every 5 min). The Markdown stays the source.

## Night run
- Windows Task Scheduler task `crow-maj`, weekdays 06:30, `WakeToRun`, runs `wsl.exe -d <distro> -u <user> -- bash -lc "<hub>/bin/crow-maj night"`.
  Created with `schtasks.exe /Create /TN crow-maj /XML <task.xml> /F`; check with `schtasks.exe /Query /TN crow-maj /FO LIST`.
- Needs: a logged-in session (logon type interactive), the PC asleep not off, wake timers allowed on the current power source
  (`powercfg /q SCHEME_CURRENT SUB_SLEEP BD3B718A-0680-4D9D-8AB2-E1D2B4AC806D`; typical default: AC yes, battery no).
- `crow-maj night` runs `cdx run <account> --model sonnet --permission full --prompt "/maj mode=nuit"` with `CROW_RETRO=1`
  (no retro of the run), then renders the board. Log: `local/state/maj/night.log`.
- The night prompt also requests a read-only calendar snapshot for the next 16 days.
  After a successful run, the launcher validates and publishes it to
  `local/state/maj/calendar.json`. Set `calendar_time_zone` (IANA, default UTC) or
  `calendar_snapshot` in the private maj config when needed. Partial reads preserve
  the previous published snapshot. Invalid or missing output is reported in the log.
- For interactive `/maj`, request the same contract with `bin/crow-maj calendar schema`.
  Save the collected JSON to a private temporary file, then publish it with
  `bin/crow-maj calendar import <file>`. This command only validates local JSON.
- Headless connector check (tested): mail search, Teams chat list and SharePoint search all work in a `cdx run` Claude session.

## Guardrails
- Send/forward/delete/Teams-post tool names are in `permissions.deny` of the cdx Claude profile settings, on top of the skill's rules.
- SharePoint writes only in `maj range`, after the owner ticks rows in `a-ranger.md`; `sharepoint_copy_item` fails on name clashes (never overwrites).
- Work jobs are framed in `local/state/maj/jobs/` and listed as "go attendu"; never launched by maj.

## Open questions (update after the first runs)
- Attachment download from Claude (tested 03/11): images come back as a file saved under `tool-results/` (copyable); PDFs and other files return their extracted text only, no file and no URL. List them as "à télécharger à la main". Sourcing attachments are often already filed on SharePoint by the sender: check before listing.
- `chat_message_search` with `query: "*"` and `afterDateTime` returns 1:1, group, meeting chats and channel posts (tested 03/11); channel posts include bot cards (Workflows) to skip.
- Every open pending line is re-checked against mails (any thread), Teams, meetings (calendar + transcripts) and files; closed only with a proof link, a hint alone gives a ❓ to confirm.
