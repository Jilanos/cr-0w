# Folder restructure

Reorganise a working folder (agents' scratch, a dossier tree) without losing files or breaking scripts.

## 1. Propose (no move)
- Inventory: `du -sh */ | sort -h`, recent files (`find -mtime -30`), git repos (`find -name .git -maxdepth 4`), venvs, `*:Zone.Identifier`, duplicates.
- Write `proposition.md`: target tree (numbered top level `00_`..`99_`), one line per move, then the open questions (deletions, personal files, secrets, duplicates). Ask them all at once.
- Never read or copy files that look like secrets; only decide where they live.

## 2. Migration script
- One bash script, dry-run by default, `--apply` to move. Only `mkdir -p` and `mv`. No deletion in the script.
- `mv_safe SRC DST`: skip and count when the source is missing or the destination exists (`MANQUANT` / `CONFLIT`), print a summary.
- If the script lives inside a folder it moves, re-exec from a temp copy on `--apply`.
- Keep `dry-run_vN.log` and `apply_vN.log` next to the script. Version the script when the owner's answers change it (`migration_v2.sh`).

## 3. Before applying
- Check no process runs inside the tree: `lsof +D <dir>` or `ps -eo pid,cwd` filtered on the path.
- Don't move a folder another task of the same session is writing to: finish that task first.
- Git repos with uncommitted changes that will be deleted: save `git diff` to a `.patch` inside the kept folder first.

## 4. Apply, then fix
- Run with `--apply`, check the summary shows 0 conflicts, then `rmdir` the emptied old folders (never `rm -r`).
- Hardcoded paths: `grep -rl '<old path>'` (also the `é`-escaped form of accented names) and rewrite with `sed -i` only in active folders; list the ones left in archives.
- Backup jobs: an rsync `--exclude` does not delete the copy already at the destination. Remove it by hand.
- Write a `README.md` at the root with the structure table.
- Tell the owner every path given earlier that changed.
