# Download relay for Codex runs

Checked 2026-11-15: runs dispatched with `--permission full` have network
(`curl https://example.com` returns 200). Use this relay only when a run is started with a
restricted permission (`workspace-write`, `read-only`) or the sandbox blocks a host.

Original case: connector tools that "materialize" a file (e.g. a mail attachment
fetch) return a short-lived signed HTTPS URL (about 30 min) that the run cannot open.
The hub has network: let the run write URLs, and let the hub download them.

1. The job prompt tells the run to append `<download_url>\t<absolute dest>` to a `manifest.tsv`
   right after each fetch, re-fetch rows logged `ERR 403` (expired), then create `manifest.tsv.done`.
2. Before dispatching, start the hub-side loop in the background:
   `bin/crow-download-relay <manifest.tsv>`. It polls every 20 s, writes
   `OK\t<path>` or `ERR <code>\t<path>\ttryN` to `<manifest>.download.log`, and stops after `.done`.
3. The run polls the log at the end and records the local path of each file.

Pitfalls: start the loop before the run (URLs expire); keep both in the same session; a run can
only write under its project folder, so its report goes there too (read it with `crow-runs report`).

## Interactive hub gotcha (10/11/2026)
- Never start the relay with `nohup ... &` inside a Bash call: the process dies when the call returns, the run waits 10 minutes and the signed URLs expire (403). Start it as a tracked background task (`run_in_background`), then dispatch the job.
