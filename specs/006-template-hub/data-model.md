# Data Model: Template Hub

The "data" here is configuration files and the shape of a composed app.

## Template manifest (`templates/<id>/template.json`)

One per template. Full field contract: [contracts/template-manifest.md](contracts/template-manifest.md).

| Field | Type | Rule |
|-------|------|------|
| `id` | string | equals the template's folder name |
| `role` | `web` \| `server` \| `deploy` | which slot it fills in a composed app |
| `folder` | string | the part's folder in a composed app (`web`, `server`), or `.` for a deploy template whose files go to the root |
| `resolve` | string, optional | its resolver, run from inside the part's folder with `--name` and its choices |
| `choices` | object, optional | user-facing choices the template owns, each a list of accepted values (web-react: `render`) |
| `hasApi` | boolean, optional | the template accepts `--api=yes\|no` from the hub (web-react, server-node) |
| `setup`, `dev`, `check`, `build`, `start` | string, optional | root-relative commands with `{dir}` for the part's folder; `dev` absent means no dev process |
| `output` | string, web only | where its production build lands (`{dir}/dist`) |
| `webRoot` | string, server only | where the web build is placed for production (`{dir}/public`, `{dir}/out/wwwroot`) |
| `image` | string, server only | which hub container recipe the app gets (`node`, `dotnet`) |
| `ships` | string[], deploy only | files placed at the app root |
| `env` | object, optional | config keys (with values) the part needs in the app's root `.env` |
| `scaffolding` | string[] | paths removed after its resolver runs (always includes `template.json` and `README.md`) |
| `appReadme` | string, optional | the README the part keeps, renamed to `README.md` |

Validation (hub test): every field above follows its rule; every command that uses a folder uses
`{dir}`; no command names another template.

## Hub registry (`hub/registry.json`)

The one place the names a consuming developer types live (spec Decision 8).

```json
{
  "roles": {
    "web": { "flag": null, "options": { "react": { "template": "web-react" } } },
    "server": {
      "flag": "api",
      "options": {
        "node": { "template": "server-node", "hasApi": true },
        "dotnet": { "template": "server-dotnet", "hasApi": true },
        "none": { "template": "server-node", "hasApi": false }
      }
    },
    "deploy": { "flag": null, "options": { "cloud-run": { "template": "deploy-cloud-run" } } }
  }
}
```

Rules: a role with one option has `flag: null` and is filled without a flag; a role with several
options names its flag, which is required. The hub's required flags are every role flag, every
`choices` key of the templates chosen, and `name`.

## Composed app

| Path | From | Notes |
|------|------|-------|
| `web/` | web-react, resolved | its `.env`, `environments.json`, template-only tests, resolver, manifest removed |
| `server/` | server-node or server-dotnet, resolved | same removals |
| `package.json` | generated | `name`, `version: "0.1"`, `private`, `type: module`, `engines`, scripts below, no dependencies |
| `package-lock.json` | generated | lockfile v3 with only the root package |
| `scripts/` | `hub/files/scripts/` | `dev.mjs`, `copy-web.mjs`, `check-env-files.mjs`, `lib/env-guard.mjs` |
| `.env` | generated | header naming `<name>.local`, `# config:` line, `PORT=8080`, `API_URL=http://localhost:8080` when the app has an API |
| `environments.json` | the hub's root copy | unchanged shape |
| `Dockerfile` | `hub/files/Dockerfile.<image>` | per server stack |
| `.dockerignore`, `.gitignore` | `hub/files/dockerignore`, `gitignore` | |
| `.nvmrc` | the hub's root copy | |
| `cloudbuild.yaml`, `DEPLOY.md` | deploy-cloud-run's `ships` | |
| `README.md` | `hub/files/README.app.md` | `APP_NAME` and the part list filled in |
| `.template.json` | generated | `{ "template": "snackbyte-base", "version": … }` |

Root scripts (generated from the manifests, `{dir}` substituted):

| Script | Value |
|--------|-------|
| `setup` | each part's `setup`, joined with `&&` |
| `dev` | `node scripts/dev.mjs` |
| `dev:<role>` | each part's `dev`, when it has one |
| `build` | web `build` && server `build` && `node scripts/copy-web.mjs <web output> <server webRoot>` |
| `start` | the server's `start` |
| `check:env` | `node scripts/check-env-files.mjs` |
| `check:<role>` | each part's `check` |
| `check:all` | `npm run check:env && npm run check:web && npm run check:server` |

## Environment identity (unchanged entity, new reader)

`environments.json` entries: `name`, `branch`, `isPublicFace`, `noindex`, `tagSuffix`. The baked
identity a build resolves: `{ name, isPublicFace, noindex }`; `local` (`false`, `true`) when
`APP_ENV_NAME` is unset. Readers: web-react's `resolve-env.mjs` (build), server-node's
`resolve-env.mjs` (build → `env.generated.ts`), server-dotnet's `Directory.Build.props` (build check +
bake) and `AppEnvironment` (startup).

## Template stamp (unchanged)

`.template.json`: `{ "template": "snackbyte-base", "version": "<x.y.z>" | null }`.
