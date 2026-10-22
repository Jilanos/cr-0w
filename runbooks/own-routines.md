# Your own routines (daily, weekly, ...)

Crow ships a generic `brief`. Routines tied to your team (stand-up format, wiki page, company meeting) are yours to write.
Examples live in `examples/skills/`.

1. Copy an example: `cp -r examples/skills/daily local/hub-skills/daily`.
2. Adapt it: language, format, where it posts, who must approve.
3. Link it so Claude finds it: `ln -s ../../local/hub-skills/daily .claude/skills/daily`, and add that path to `.gitignore`.
4. `local/` is its own private repo, so your routine stays private and survives updates of the hub.

Keep the rule: a routine drafts, you approve, then it posts.
