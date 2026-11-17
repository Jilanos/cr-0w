# Personal fork

Keep `origin` as the read-only upstream remote. Add your own repository as `fork`.
Create a personal branch in a separate worktree from `origin/main`.
Keep private paths, accounts and business context under the ignored `local/` directory.
Copy `examples/maj.json` and `examples/headless.json` there when using those features.
Set `CROW_HOME` to the checkout holding your private data when running another worktree.

## Sync

Run `bin/crow-sync` from the clean personal worktree. It fetches `origin/main`
and merges it into the current branch. The default personal branch is `paul`.
Use `--branch <name>`, `--upstream <remote>`, `--upstream-branch <name>` and
`--fork <remote>` to change the defaults.

Conflicts stop the merge and print the affected files. Resolve them and commit,
or run `git merge --abort`. Run the project tests after resolving conflicts.
The script refuses a dirty tree, a detached HEAD and an unfinished Git operation.

`bin/crow-sync --push` runs `crow-prepush-check --check` and pushes the personal
branch to `fork`, setting its upstream. It refuses a fork push URL that points
to the upstream repository, including HTTPS and SSH aliases. It never pushes
to the upstream remote. Set `HOME` to your real user home before authenticating
when your session uses a sandbox home.

## Move a dirty main checkout later

Back up local commits and uncommitted files before switching. An anonymised branch
can differ from the original files. Preserve those originals in a stash including
untracked files, excluding `local/`. Keep the stash until the new branch has been
verified. Reapplying it can restore private values and overwrite upstream changes.

A branch already checked out in a linked worktree must first be released there.
Check that worktree is clean, remove only a private `local` symlink if present,
then remove the worktree without `--force`. Switch the main checkout to the personal
branch and verify its tracking remote is `fork`.
