# APP_NAME server

The server: C# on .NET 8, an ASP.NET Core minimal API (`src/Api`) tested with xUnit
(`tests/Api.Tests`). In production it serves the built web app from `wwwroot` beside the published
server, and the API under `/api`.

## Commands

Needs the .NET 8 SDK (see `global.json`). From this folder:

```bash
dotnet watch --project src/Api run   # the server, restarting on change
dotnet format --verify-no-changes    # formatting
dotnet build                         # warnings are errors
dotnet test
dotnet publish src/Api -c Release -o out
```

From the app root, `npm run dev`, `npm run check:all`, `npm run build` and `npm start` run these for
you, alongside the web part.

## How it fits

- **Environment identity.** The build reads `APP_ENV_NAME`, checks it names an entry in
  `environments.json`, and bakes it into the assembly; at startup `AppEnvironment` reads that entry,
  so the server reports the environment its image was built for: at `/api/version`, to server code
  through the injected `AppEnvironment` (`environment.Is("staging")`), and with
  `X-Robots-Tag: noindex` on every response when the entry says so. With no `APP_ENV_NAME` (local
  development and tests) it is the `local` identity.
- **`PORT`.** The port it listens on: injected by the platform in production, 8080 when unset, and
  anything that is not a port stops startup naming it (`Port.cs`).
- **`environments.json`** is read from this folder, or, when this is the `server/` part of a larger
  app, from the app's root (the folder above). This server reads no `.env`: the app's `npm run dev`
  passes it the app's environment, and run on its own it takes a secret through
  `op run --env-file=<file> -- dotnet run`.
- **Version.** `/api/version` reports `APP_VERSION`, `BUILD_GIT_COMMIT` and `BUILD_DATE`, which the
  deploy sets; outside a production host the number is `0.0.0-dev`.
