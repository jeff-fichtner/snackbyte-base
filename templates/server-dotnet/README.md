# server-dotnet

A server template: C# on .NET 11, an ASP.NET Core minimal API tested with xUnit. It serves a built
web app and an API under `/api`. It is one of the templates the snackbyte-base hub composes an app
from; in an app it becomes the `server/` folder, serving the `web/` part's build.

It meets the same contract as every server the hub offers, so an app's front end and its deploy
cannot tell which server it has:

- `GET /api/health` → `{ status, uptime, timestamp }`; `GET /api/version` →
  `{ number, commit, buildDate, environment }`.
- `X-Robots-Tag: noindex` on every response when the environment's entry in `environments.json`
  says so.
- Listens on `PORT`: 8080 when unset; anything that is not a port stops startup naming it.
- Serves the built web app from `wwwroot` beside the published server, with `index.html` for any
  path that is not a file or a route. An unknown path under `/api` answers 404
  (`{ "error": "Not found" }`), not the page.
- The environment is baked at build: `APP_ENV_NAME` names an entry in `environments.json` (this
  folder's, or the app root's one folder up); a name the manifest does not list fails the build.

It stands on its own: it restores, builds and passes its own gate without the hub or any other
template, so it can move into a repository of its own unchanged. It has no choices to resolve at
spin-up (the projects are `Api` and `Api.Tests` in every app). Used alone, remove `template.json`
and this README and rename `README.app.md` to `README.md`.

## Working on the template

Needs the .NET 11 SDK (`global.json` takes any 11.0 SDK).

```bash
dotnet restore
dotnet format --verify-no-changes   # formatting
dotnet build                        # warnings are errors
dotnet test
```

## The .NET release

The server targets one .NET release, set in one place: the SDK `version` in `global.json`
(`11.0.100` is .NET 11). Its major and minor are the release; the target framework and the test
host's version follow from it.

To run on another release, an older one a client requires for example, change that version, e.g. to
`8.0.100` for .NET 8, and install that SDK. The app's `Dockerfile` names the release for its images
in `DOTNET_RELEASE` (`11.0`): set it to the same major and minor. An image built with the two out of
step stops at restore, naming the SDK `global.json` asks for.

The template moves to each new .NET release when it ships.
