# Specify Branch Preparation Extension

Runs as the `before_specify` hook for `/speckit-specify`. It makes sure the
working area is **clean and ready to move on**, and that the feature is on **its
own git branch**, before any spec artifacts are written.

## Why an extension?

`/speckit-specify` declares a `before_specify` hook point and already expects a
"git extension" to put the feature on its own branch (see the specify skill's
Branch creation step). Core `create-new-feature.sh` only creates directories and
files — it does **not** create or switch a git branch. This extension fills that
gap and adds the "clean the working area first" guard.

## What it does

1. Reports git working-tree state (clean/dirty, current vs default branch).
2. If dirty, **asks** whether to commit (with a message), stash, or abort — never
   acting without the user's choice.
3. Once clean, if on the default branch, creates/switches to the feature branch.

## Commands

| Command | Description |
|---------|-------------|
| `speckit.git.specify-branch` | Clean the working area and switch to the feature branch. |

Invoked as `/speckit-git-specify-branch`. The interactive procedure lives in the
`speckit-git-specify-branch` skill; the mechanical git operations live in
`scripts/bash/prepare-specify-branch.sh` (`status` / `commit` / `stash` /
`create-branch`).

## Hook wiring

Registered in `.specify/extensions.yml` under `hooks.before_specify` as an
**optional** hook. To make it run automatically, set `optional: false` (with
`settings.auto_execute_hooks: true`).

## Disable

Remove (or set `enabled: false` on) the `before_specify` entry for
`git-specify-branch` in `.specify/extensions.yml`.
