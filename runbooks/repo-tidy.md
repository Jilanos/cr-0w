# Repo tidy

Keep every registered repo clean: default branch checked out, nothing uncommitted,
everything pushed, no leftover worktrees or merged branches.

## Daily (automatic)
The `brief` skill runs `bin/crow-tidy --apply --brief` and shows what is left under 🧹 Repos.

`--apply` only does safe moves: fetch, fast-forward the checked-out clean default branch,
remove clean worktrees whose branch is merged, delete merged branches, `git worktree prune`.
Work-scope repos are report only. `tidy: skip` in the registry excludes a repo
(the one the owner is actively working in).

## By hand ("clean up the repos")
1. `bin/crow-tidy` for the full report.
2. Uncommitted files: read the diff, commit on the branch it belongs to (commit format applies).
   A checkout off its default branch with a live session in it: fast-forward the default branch
   to that branch when it is ahead and not behind, instead of switching (switching would change
   the files under the running session).
3. Open branches: merge or delete only with the owner's OK (personal: merge allowed; work: never).
   Ask in one AskUserQuestion, grouped by repo.
4. Unpushed default branch: personal repos may push, unless an open thread says the push waits
   on an owner decision. Work: explicit OK every time.
5. `bin/crow-tidy --apply` to clear what became merged.

Never: commit/merge/push in a work repo without the usual approvals, touch a dirty worktree,
delete an unmerged branch on its own.
