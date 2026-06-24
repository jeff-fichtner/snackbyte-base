---
description: "Ensure a clean git working area and a dedicated feature branch before specifying"
---

# Prepare Specify Branch

Run before `/speckit-specify` to make sure the working area is clean and ready to
move on, and that the new feature will live on its own git branch.

This command has a **mechanical** half (a bash script) and an **interactive** half
(driven by the running agent). See the `speckit-git-specify-branch` skill for the
full agent-driven procedure.

## Mechanical operations (script)

`.specify/extensions/git-specify-branch/scripts/bash/prepare-specify-branch.sh <subcommand> [--json]`

- `status` — report working-tree state as JSON (clean/dirty, current branch,
  default branch, dirty file list, ahead-of-remote count). Run this first.
- `commit -m "msg"` — `git add -A` and commit.
- `stash [label]` — stash all changes (including untracked).
- `create-branch <name>` — create-and-switch (or switch) to `<name>`. Refuses when
  the tree is dirty.

## Interactive procedure (agent)

1. Run `status --json`. If not in a git repo, report and skip.
2. If the tree is **dirty**, show the changes and ask the user whether to
   **commit** (prompt for a message), **stash**, or **abort**. Never commit or
   stash without the user's choice.
3. Once clean, if currently on the **default branch** (main/master), create/switch
   to the feature branch for the work about to be specified.
4. Report the final branch and clean state so `/speckit-specify` can proceed.
