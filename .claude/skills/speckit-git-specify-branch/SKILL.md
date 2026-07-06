---
name: speckit-git-specify-branch
description: Ensure a clean git working area and a dedicated feature branch before /speckit-specify
compatibility: Requires spec-kit project structure with .specify/ directory
metadata:
  author: snackbyte
  source: git-specify-branch:commands/speckit.git.specify-branch.md
---

# Prepare Specify Branch

Run as the `before_specify` hook. Goal: the working area is **clean and ready to
move on**, and the new feature is on **its own git branch** before
`/speckit-specify` writes any spec artifacts.

This skill drives the interactive decisions; a bundled script does the mechanical
git operations:

```
.specify/extensions/git-specify-branch/scripts/bash/prepare-specify-branch.sh <subcommand> --json
```

Subcommands: `status`, `commit -m "msg"`, `stash [label]`, `create-branch <name>`.

## Procedure

1. **Read state.** Run `prepare-specify-branch.sh status --json`.
   - If `in_git` is false: report "Not a git repository — skipping branch
     preparation." and finish (do not block specify).

2. **Handle a dirty working tree.** If `clean` is false:
   - Show the user the dirty files (from the `dirty` array / `dirty_count`).
   - **Ask** what to do — do not decide for them. Offer:
     - **Commit** — ask for a commit message, then run `commit -m "<message>"`.
     - **Stash** — run `stash` (changes can be restored later with `git stash pop`).
     - **Abort** — stop here and let the user handle it; do not proceed to specify.
   - Never run `commit` or `stash` without the user's explicit choice.
   - Re-run `status --json` afterward to confirm the tree is now clean.

3. **Ensure a feature branch.** Once the tree is clean:
   - If `on_default_branch` is true (currently on main/master), the new feature
     must get its own branch. Derive a branch name from the feature description the
     user gave with `/speckit-specify`:
     - Use the same convention `/speckit-specify` uses for the short name
       (2-4 word, action-noun, kebab-case), optionally prefixed with the next
       feature number. If you are unsure of the exact name the spec directory will
       use, ask the user to confirm the branch name, or use a clear provisional
       name they approve.
   - Run `create-branch <name>`. The script refuses on a dirty tree (handled in
     step 2) and is a no-op if already on `<name>`.
   - If `on_default_branch` is false, the user is already on a non-default branch;
     keep it unless the user wants a fresh one.

4. **Suggest a minor version bump (on the feature branch).** A new feature is a new
   minor version. Do this **after** the feature branch exists (never on the default
   branch). If the repo derives its version from `package.json` — a `"version"` of the
   form `MAJOR.MINOR` (e.g. `1.4`), with the patch derived by CI (see
   `scripts/derive-version.sh`):
   - Read `package.json` `"version"`. If it is `MAJOR.MINOR`, **suggest** bumping the
     minor by one (e.g. `1.4` → `1.5`) so the feature ships under its own minor line.
     State the current and proposed version; on the user's confirmation, update
     `package.json` and the root `"version"` in `package-lock.json`. Never write a patch
     (CI derives it).
   - It is a **suggestion, not automatic** — the user may confirm, skip, or pick a
     different bump (e.g. MAJOR for a breaking change).
   - Skip silently if there is no `MAJOR.MINOR` version or the repo doesn't use this scheme.

5. **Report.** State the final branch name, the version (bumped or unchanged), and that
   the working tree is clean, so `/speckit-specify` can proceed. If you created a branch,
   surface its name (the specify command notes `BRANCH_NAME` for reference; the spec
   directory name is chosen independently by specify).

## Notes

- This hook is **optional** in `.specify/extensions.yml`: `/speckit-specify`
  surfaces it and prompts before running.
- The spec directory name and the branch name are independent. This hook only
  guarantees you are *not specifying on top of the default branch with a dirty
  tree*; it does not dictate the spec directory.
