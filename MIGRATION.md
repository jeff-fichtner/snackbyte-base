# Migration: spinning up a new app and onboarding ClickUp sync

This is the end-to-end path for taking `snackbyte-base` into a **new app** and getting the
ClickUp task-sync extension working there. It complements [SPIN-UP.md](SPIN-UP.md) (the
mechanical resolver steps) with the parts specific to _migrating into a fresh project_ and
turning on ClickUp tracking.

This path is validated end-to-end (spin-up → a real feature → the clickup-sync helper
pipeline) against a throwaway app; only the live ClickUp MCP round-trip is manual (it needs
your workspace).

## 1. Create the new app

Create a repo from the template (GitHub "Use this template", or copy the tree), then resolve
it. **The resolver mutates and self-deletes in the repo it runs in — run it in the new app,
never in the template.**

```bash
node --version                 # expect v24.x
npm install
# Deploy mode + render strategy are identity decisions — see SPIN-UP.md. Pick deliberately:
node scripts/init.mjs --mode=<static|server> --render=<prerender|dynamic> --name=<your-app>
```

After the resolver runs, the repo is your app: `package.json` renamed, `SPIN-UP.md` and
`init.mjs` removed, the template guard gone, and `.github/workflows/ci-cd.yml` active.

**What carries over vs. what is reset:**

- **Carries over**: the Spec Kit machinery under `.specify/` and `.claude/`, including **all
  installed extensions** — `clickup-sync` travels with the template and stays registered in
  `.specify/extensions.yml`.
- **Reset**: the template's own `specs/` development history is stripped. Your new app starts
  with an empty `specs/` and no active feature — a clean slate for your first spec.

If you are not putting the app at the repo root, read [SUBDIR-LAYOUT.md](SUBDIR-LAYOUT.md)
first.

## 2. Start your first feature

Run the normal flow (`/speckit-specify` → `/speckit-plan` → `/speckit-tasks`), or hand-author
`specs/NNN-*/spec.md` + `plan.md` + `tasks.md` and point `.specify/feature.json` at the
feature dir. Use real user stories with priorities — the ClickUp sync turns each user story
into a subtask and derives the dependency links (US2 waits-on US1, US3 waits-on US1+US2, …)
from the user-story numbering.

## 3. Onboard ClickUp sync

The extension ships installed but **inert until configured** — its committed code carries no
credentials or account IDs, so you point it at your workspace (the config names your space/list;
runtime IDs land in each feature's manifest):

1. **Connect the ClickUp MCP server** in your agent environment (the extension does all ClickUp
   work through MCP — it has no API client or credentials of its own).
2. **Fill the config** at `.specify/extensions/clickup-sync/config.yml` — replace the two
   placeholders with real names (no IDs, no secrets):

   ```yaml
   space: 'My Space'
   list: 'My Project Tasks'
   ```

3. **Provision** (once per repo — reused by every later feature):

   ```
   /speckit-clickup-provision
   ```

   Finds-or-creates the shared list under your space, resolves the not-started/in-progress/done
   status mapping onto your list's real statuses, and records the target IDs into the feature's
   manifest (`specs/<feature>/.clickup-sync.json`). It **stops and tells you** if the space is
   missing or ambiguous, or if the list's statuses can't represent the three states — it never
   guesses. If your list has a rich workflow (e.g. backlog / in development / in review /
   shipped …), the three logical states map onto the closest real statuses — for example
   not-started → `ready for development`, in-progress → `in development`, done → `shipped`; the
   unused statuses are simply not targeted by this version.

4. **Sync** (safe to run often — a no-op run makes zero ClickUp writes):

   ```
   /speckit-clickup-sync
   ```

   Creates/updates one ClickUp card for the feature (verbose body + a feature-wide derived
   status), a subtask per user story (with dependency links and a markdown checkbox list of the
   tasks), and keeps it matching the repo. **Each user-story subtask also derives its own
   status** from that story's task completion — so finished stories read `done`/shipped while
   the feature card stays in-progress until the whole feature (including any manual verification
   task) is complete. It refuses (and points you to provision) if the manifest has no target.

The extension also registers optional hooks — `after_plan` offers provision, `after_tasks` and
`after_implement` offer sync — so tracking can ride the normal flow once configured.

### Installing into an existing app (not a fresh spin-up)

If the app already exists (has `.specify/`) and you are adding clickup-sync to it, you don't
run the resolver — you copy the extension in:

1. Copy `.specify/extensions/clickup-sync/` and the `.claude/skills/speckit-clickup-*` skill
   mirrors from the template into the app.
2. Register it in the app's `.specify/extensions.yml`: add `clickup-sync` under `installed:`
   and add its hook rows (`after_plan` → provision; `after_tasks` + `after_implement` → sync).
3. Fill the app's `config.yml` (§3 above), then provision + sync.

## Upgrading clickup-sync in an app that already has it

Until this lives in a versioned package, propagation is a **manual re-copy** (Constitution IV,
two-tier propagation). To move a newer version (e.g. the 005 additions) into an app:

1. **Re-copy only the logic**: overwrite the app's `.specify/extensions/clickup-sync/`
   (commands + `scripts/bash/` + `extension.yml`) and the `.claude/skills/speckit-clickup-*`
   mirrors from the template. Bump the `extension.yml` `version`.
2. **Keep the app's state as-is**: do **not** overwrite the app's `config.yml`, and never touch
   any feature's `specs/<feature>/.clickup-sync.json`. The schema is additive and
   `schemaVersion`-gated (see `contracts/manifest.schema.md`), so an older manifest keeps
   working with the newer logic — no migration unless `schemaVersion` bumped (which ships its
   own steps).
3. Re-run `/speckit-clickup-sync` on active features; new behavior applies, existing cards are
   updated in place (one-way, toward the repo).

This is deliberately a copy-and-bump while the extension is still being built. When it moves
into a versioned `@snackbyte/*`-style package, this manual step is replaced by a version bump.

## 4. What to commit

- **Do** commit each feature's `.clickup-sync.json` manifest — it is the shared dedup index and
  target locator, and it must travel with the feature so collaborators update the same ClickUp
  card rather than creating duplicates. It is the only place runtime ClickUp IDs live; it holds
  no secrets.
- The `config.yml` you filled in is committed too (space/list names, no secrets).

## Notes & guarantees

- **One-way**: the repo is the source of truth. Sync overwrites ClickUp toward the repo; a
  hand-edit in ClickUp is reverted on the next sync. Nothing flows back into `tasks.md`.
- **No remote required**: none of this needs a GitHub remote — provision/sync operate on the
  local repo + your ClickUp workspace.
- **Scaffolding-only**: ClickUp lives entirely under `.specify/`/`.claude/` + per-feature
  manifests. Your shipped app source, docs, and CI never reference it.
- **Deferred**: richer lifecycle states (planning/review/testing), human-testing handoff, and a
  manual/one-off mode are a separate future feature — this version derives only
  not-started/in-progress/done.
