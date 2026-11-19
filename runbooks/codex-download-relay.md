# Download relay for runs without network

Runs dispatched with `full` permission (see `local/headless.json`) have network. Use this relay when a
run is started with a restricted permission (the `default` sandbox, `review`) or the sandbox blocks a host.

Typical case: connector tools that "materialize" a file (e.g. a mail attachment fetch) return a short-lived
signed HTTPS URL (about 30 min) that the run cannot open. The hub has network: the run writes URLs, the hub
downloads them.

1. The job prompt tells the run to append `<download_url>\t<absolute dest>` to a `manifest.tsv` right after
   each fetch, re-fetch rows logged `ERR 403` (expired), then create `manifest.tsv.done`.
2. Before dispatching, start the hub-side loop as a tracked background command:
   `bin/crow-download-relay <manifest.tsv> [dest-root]`. It polls every 20 s, writes `OK\t<path>`,
   `ERR <code>\t<path>\ttryN` or `REFUSED\t<path>` to `<manifest>.download.log`, and stops after `.done`.
3. The run polls the log at the end and records the local path of each file.

Rules the relay enforces: HTTPS only; a destination must be absolute and under dest-root (default: the
manifest's folder); an existing file is never overwritten.

Pitfalls:
- Start the loop before the run (URLs expire); keep both in the same session.
- A run can only write under its project folder, so the manifest and its report go there too (read the report
  with `crow-runs report`).
- Never start the relay with `nohup ... &` inside a one-shot shell call: the process dies when the call returns
  and the signed URLs expire (403). Use a tracked background task.
