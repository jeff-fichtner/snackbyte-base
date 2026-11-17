# Contract: `template.json`

Every template folder has one. The hub reads it; nothing inside the template reads it.

## The `{dir}` rule

Commands are written from the root of whatever holds the template, with `{dir}` for the template's
folder. In snackbyte-base `{dir}` is `templates/<id>`; in a composed app it is the part's `folder`.
A command never names another template. A command that must run from inside a folder starts with
`cd {dir}/<path> &&`, which both `sh` and Windows `cmd` (the shells npm runs scripts in) accept.

## The four manifests

```json
{
  "id": "web-react",
  "role": "web",
  "folder": "web",
  "resolve": "node scripts/init.mjs",
  "choices": { "render": ["prerender", "dynamic"] },
  "hasApi": true,
  "setup": "npm ci --prefix {dir}",
  "dev": "npm --prefix {dir} run dev",
  "check": "npm --prefix {dir} run check:all",
  "build": "npm --prefix {dir} run build",
  "output": "{dir}/dist",
  "env": {},
  "appReadme": "README.app.md",
  "scaffolding": ["README.md", "template.json", "scripts/init.mjs", "tests/machinery"]
}
```

```json
{
  "id": "server-node",
  "role": "server",
  "folder": "server",
  "resolve": "node scripts/init.mjs",
  "hasApi": true,
  "image": "node",
  "setup": "npm ci --prefix {dir}",
  "dev": "npm --prefix {dir} run dev",
  "check": "npm --prefix {dir} run check:all",
  "build": "npm --prefix {dir} run build",
  "start": "npm --prefix {dir} start",
  "webRoot": "{dir}/public",
  "env": { "PORT": "8080" },
  "appReadme": "README.app.md",
  "scaffolding": ["README.md", "template.json", "scripts/init.mjs", "tests/machinery"]
}
```

(server-node's resolver deletes `dev` from its manifest when run with `--api=no`.)

server-dotnet's commands all start in its folder: `dotnet` finds `global.json` (which pins the SDK)
from the working directory up, never from the project, so a command run from an app's root would use
whatever SDK the machine has newest. `start` runs from the published folder because ASP.NET Core
takes its content root (where `wwwroot` is looked for) from the working directory. A composed app's
root runs each part's command as its own `npm run` script, so a `cd` never carries into the next.

```json
{
  "id": "server-dotnet",
  "role": "server",
  "folder": "server",
  "image": "dotnet",
  "setup": "cd {dir} && dotnet restore",
  "dev": "cd {dir} && dotnet watch --non-interactive --project src/Api run",
  "check": "cd {dir} && dotnet format --verify-no-changes && dotnet build && dotnet test --no-build",
  "build": "cd {dir} && dotnet publish src/Api -c Release -o out",
  "start": "cd {dir}/out && dotnet Api.dll",
  "webRoot": "{dir}/out/wwwroot",
  "env": { "PORT": "8080" },
  "appReadme": "README.app.md"
}",
  "dev": "dotnet watch --project {dir}/src/Api run",
  "check": "dotnet format {dir} --verify-no-changes && dotnet build {dir} && dotnet test {dir} --no-build",
  "build": "dotnet publish {dir}/src/Api -c Release -o {dir}/out",
  "start": "cd {dir}/out && dotnet Api.dll",
  "webRoot": "{dir}/out/wwwroot",
  "env": { "PORT": "8080" },
  "appReadme": "README.app.md",
  "scaffolding": ["README.md", "template.json"]
}
```

```json
{
  "id": "deploy-cloud-run",
  "role": "deploy",
  "folder": ".",
  "setup": "npm ci --prefix {dir}",
  "check": "npm --prefix {dir} run check:all",
  "ships": ["cloudbuild.yaml", "DEPLOY.md"]
}
```

A deploy template's `check` runs only in snackbyte-base (its tests are template machinery); the app
receives only `ships`.

## The API flag the hub passes

A template with `hasApi: true` accepts `--api=yes|no` from the hub (never from the person directly):
web-react keeps or drops its dev proxy; server-node keeps or drops its routes and dev process.
