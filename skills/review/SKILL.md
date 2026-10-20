---
name: review
description: Review an MR/PR or a diff with one system for everyone's code — someone else's MR (comments to post) or the user's own (self-review before asking a reviewer, also run as the pattern gate when the mr skill opens an MR). Applies the repo's review checklist and every known pattern from the review ledgers. Use for "review !N", "review this MR/PR", "self-review", "relire la MR", "check my MR before review".
---

# Review

Same checks whoever wrote the code. The ledgers hold what reviewers keep flagging on the user's MRs,
so applying them to every diff is how known patterns stop reaching reviewers.

## 0. Locate
- Hub = `readlink -f` of this skill's base directory, two levels up. Registry: `<hub>/local/projects.yaml`.
- Project from the MR's forge path or the current repo; work in its `path` (read branch files with `git show origin/<branch>:<path>`, no checkout needed).
- **Mode**: *self* when the MR author is the user (`forge_user` in the registry) or there is no MR yet; otherwise *peer*.
- Load and follow:
  1. the repo's review skill if any (`<repo>/.claude/skills/*review*/SKILL.md` or `<hub>/local/skills/<project>/*review*/`): checklist and writing style win;
  2. the ledgers `<hub>/local/reviews/common.md` and `<hub>/local/reviews/<project>.md`.

## 1. Gather
- MR: description, pipeline status (and failed job logs), target branch. Diff: `git fetch origin && git diff origin/<target>...origin/<branch>`.
- Read around each change, not only the hunks: sibling functions, the same pattern elsewhere, callers.
- If the repo has a code graph (`codebase-memory` MCP server: `detect_changes` against the target branch, `trace_path` inbound for callers of changed functions, `search_graph` across Python/Terraform/shell), use it for impact and callers instead of grepping blind.
- Other open MRs touching the same files or keys: note clashes.

## 2. Check
1. The repo checklist, item by item.
2. **Every ledger row**: run its "how to catch it" on the diff for real (the greps, the sibling comparison, docstring vs code). Mark each row hit / clean / n/a with one line of evidence. No row skipped silently.
3. Then the usual: correctness, failure paths, tests that prove the change, infra impact per environment (destroy/replace, data outside Terraform, permissions).

## 3. Output
First line: `Patterns: N checked, K hits, M n/a`.

**Peer mode**: comments ready to post, grouped blocking / suggestions / nits / questions, each `file:line` + text in the repo skill's style and the reviewer's usual language. One-line verdict. Post only when asked, as diff-line discussions, not one big note.
A hit that matches a ledger row on someone else's MR is not added to the user's ledger (it tracks the user's own MRs).

**Self mode**: a fix list, most important first: `file:line`, problem, pattern (ledger row or new), proposed fix. Questions that need the user's decision last.
On approval: fix on the branch, commit in the repo's convention, push. A new pattern found here (not in any ledger) gets a row in the project ledger with `self-review` as source, so it's checked next time too.

Never add AI attribution anywhere.
