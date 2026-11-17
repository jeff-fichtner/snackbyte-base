# Contract: the hub resolver

```text
npm run init -- --api=<node|dotnet|none> --render=<prerender|dynamic> --name=<repo-slug>
```

(`npm run init` is `node hub/init.mjs`; it needs no `npm install` first.)

| Flag | Values | Owner | Required |
|------|--------|-------|----------|
| `--api` | `node`, `dotnet`, `none` | hub registry, server role | yes |
| `--render` | `prerender`, `dynamic` | web-react's `choices` | yes |
| `--name` | kebab-case repo slug | hub | yes |

No flag has a default. A role with one template (web: react; deploy: cloud-run) takes no flag; when a
role gains a second template its flag joins this table as required.

## Behavior

1. Parse and validate every flag, read the registry and every chosen template's manifest, and check
   every chosen template folder exists. Any failure: print what is missing or invalid and the usage
   line (listing accepted values), exit non-zero, change nothing.
2. Find the template version for the stamp (before anything moves, from the untouched tree).
3. Move each chosen template to its folder (`web/`, `server/`); place the deploy template's `ships`
   at the root.
4. In each part, run its `resolve` with `--name=<name>`, its `choices`, and `--api=yes|no` when the
   manifest has `hasApi`.
5. Read each part's (possibly resolver-edited) manifest; write the root files (data-model "Composed
   app"); remove each part's `scaffolding`, its `.env` and `environments.json`; rename its
   `appReadme` to `README.md`.
6. Remove the hub: `templates/`, `hub/`, the hub's root tooling and docs, the spec workflow, `.github/`
   (only the files the template owns; directories only once empty), the template's git tags.
7. Print the next steps (setup, verify, commit, CI pointer, where a secret goes).

## Exit

`0` composed; non-zero refused (nothing changed). A failure after step 3 is a bug in the hub (every
input was validated in step 1), reported with the step that failed.
