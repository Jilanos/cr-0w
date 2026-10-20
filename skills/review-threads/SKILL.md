---
name: review-threads
description: Address the review threads reviewers left on the user's own MR/PR, in any project or from the hub — check each comment, match it against the known-pattern ledgers, fix, report in a decision table, then commit, push, reply and resolve on approval. Use when the user says "fix the review comments", "address the threads on !N", "answer the review", "the MR got reviewed".
---

# Review threads

The user doesn't read the threads first. Your output must let them decide without opening the forge,
and every comment must make the next MR better: each one is matched against the known patterns.

## 0. Locate
- Hub = `readlink -f` of this skill's base directory, two levels up. Registry: `<hub>/local/projects.yaml`.
- Find the project from the MR (forge path or the current repo). Work in its `path`.
- Load, in this order, and follow them:
  1. the repo's own review skill if any (`<repo>/.claude/skills/*review*/SKILL.md`): its style rules and checks win;
  2. the ledgers: `<hub>/local/reviews/common.md` and `<hub>/local/reviews/<project>.md` (create from `common.md`'s header if missing).
- Auth/CLI: forge CLIs may need the real HOME (`HOME=<user home> glab ...`) in sandboxed sessions.
- Branch already checked out elsewhere? Use that worktree. A new worktree goes next to the repo (`<repo>-<ticket>`), never in a temp or scratchpad dir.

## 1. Gather
- Unresolved threads: GitLab `glab api --paginate "projects/:id/merge_requests/<iid>/discussions?per_page=100"`, keep `resolvable && !resolved`; GitHub `gh api repos/{o}/{r}/pulls/<n>/comments` + review threads via GraphQL `isResolved`.
- Failing pipeline: read the failed jobs' logs before believing or dismissing a "job is red" comment.

## 2. For each thread
1. Check the claim in the code (neighbouring code too) before agreeing. Disagree when the reviewer is wrong, and say why.
2. **Match it against the ledgers.** Known pattern → it's a *Repeat*, the worst case: note which "how to catch it" rule failed and sharpen it. New → add a row (project ledger; also `common.md` when it isn't specific to this repo's stack).
3. Fix in the style of the repo's skill and code. Fix every other occurrence of the same problem in the MR, not only the flagged line.

## 3. Report (before any commit)
**Table**, one row per thread:

| # | File:line | Reviewer said (short) | Problem | Agree? | Fix | Pattern |
|---|---|---|---|---|---|---|

- Problem: what was actually wrong, one sentence. Agree?: Yes / No / Partly + reason.
- Fix: what changed, or "Reply only".
- Pattern: `New: <name>` or `Repeat ×N: <name>`, plus why our gate didn't catch it (rule missing, rule too vague, gate skipped).

**Questions**: each question as the reviewer wrote it, then the answer (short, precise, human). Mark the ones that get posted.

**Ledger changes**: rows added, counts bumped, rules sharpened, and any pattern promoted to `common.md` or to the repo skill's checklist (at 2 occurrences).

Then the diff, test/lint results, the commit message, and what gets posted.

## 4. On approval ("go", "yes", "ok")
Do everything without asking again: commit (short `review fixes` message in the repo's convention), push, post replies, resolve the fixed threads.
- Fixed threads: resolve, no reply. Never post "done"/"fait".
- Reply only when the answer comes without a change (disagreement, explanation) or adds something the diff doesn't show. Reply in the reviewer's language, 1–3 sentences.
- Resolve after the push. Leave a thread open only when its fix is a manual step not done yet, and say which.
- Never add AI attribution anywhere.
