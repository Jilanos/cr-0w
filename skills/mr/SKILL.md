---
name: mr
description: Open a merge request (GitLab) or pull request (GitHub) the user's way — repo template, title validated first, user assigned, reviewer asked. Use whenever you are about to create an MR/PR, from the hub or from a repo session, or when the user says "open the MR", "create a PR", "mr".
---

# MR

Every MR/PR you open for the user follows this flow. Never skip a step to save time.

## 1. Prepare (no forge writes yet)
- Branch is pushed or ready to push, never `main`; commits follow the repo's message convention.
- Find the repo's MR/PR template: `.gitlab/merge_request_templates/Default.md` (GitLab) or `.github/pull_request_template.md` (GitHub). Fill it in. Keep every heading; in checklists keep only the sections that apply, tick only what is actually true.
- Write the description in the language recent MRs of the repo use (`glab mr list --merged -P 5` + `glab mr view <n>`). The template and past MRs win over generic language rules.
- Reference the ticket the way recent MRs do (e.g. `Closes KEY-123`).
- Title: match recent merged MRs (same convention as commits, one ticket key, short).

## 2. Validate with the user
Show the **title** and the **description** and wait for an explicit OK. Adjust and show again if asked.

## 3. Ask for the reviewer
Read the project's `reviewers` list in the hub registry (`<hub>/local/projects.yaml`; hub path from `$CROW_HOME`, else ask). Ask which one with AskUserQuestion. Personal repos with no reviewers: skip.

## 4. Create
- GitLab: `glab mr create --source-branch <b> --target-branch main --title ... --description ... --assignee <user's forge username> --reviewer <chosen> --yes` (add `--draft` if the user wants it or if pre-merge steps are pending).
- GitHub: `gh pr create --title ... --body ... --assignee @me [--reviewer <chosen>]`.
- The user's forge username is the project's `forge_user` in the registry.
- Never merge a work MR. Never add AI attribution anywhere.

## 5. Update the tickets
For every ticket the MR closes, move it to the tracker's review status (e.g. Jira "Merge Review"). A ticket the MR only partly covers stays in progress. Do the same when an existing MR changes state (ready, merged → the post-merge status the team uses).

## 6. Report
Give the link, the reviewer and any pre-merge steps left.
