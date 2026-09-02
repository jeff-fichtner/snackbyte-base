# Brand is a surface, not an identifier

**Every app is choosing two names, not one: a descriptive name for the code, and a
brand name for the people who use it. They are different registers and they never mix
in a single string.**

The descriptive name says what the thing does and outlives any rebrand. The brand name
is a UX surface — it lives in one branding module and is rendered from there.

## The line

The test is **"does a human ever read or type this string while using the product?"**

That is not the same question as "is this code or infrastructure," and confusing the
two is how this rule gets misapplied.

- **A human reads or types it → BRAND, and brand only.** Rendered copy, page title,
  wordmark, public domain, logo — **and any identifier a person is asked to handle.**
- **Only developers and machines ever see it → DESCRIPTIVE, no brand.** Repos,
  packages, databases, secrets, registries, env vars, module and component names, CSS
  classes, routes, log prefixes, service names, container image repositories.

## The leak table

An identifier can be **both infrastructure and user-facing**, and when it is, brand
wins. This is the class that gets missed, because the stock examples of "a user sees
it" are all _rendering_ surfaces — which quietly excludes every string a person
copies, pastes, or grants access to.

| Identifier                                     | Who reads it                                      | Register    |
| ---------------------------------------------- | ------------------------------------------------- | ----------- |
| Repo, package name                             | developers                                        | descriptive |
| Database, schema, table                        | developers                                        | descriptive |
| Secret / env var name                          | developers, CI                                    | descriptive |
| Container image repository                     | developers, CI                                    | descriptive |
| Deployed service name                          | developers, CI                                    | descriptive |
| Route, log prefix, CSS class                   | developers                                        | descriptive |
| Page `<title>`, wordmark, copy                 | users                                             | **brand**   |
| Public domain                                  | users                                             | **brand**   |
| **Service account email**                      | **pasted into a share dialog and granted access** | **brand**   |
| **OAuth consent screen app name**              | **users, at the moment they authorize**           | **brand**   |
| **Sender address / display name on mail**      | **every recipient**                               | **brand**   |
| **Bot or app username in someone's workspace** | **everyone in that workspace**                    | **brand**   |
| **Webhook / callback URL a user copies**       | **the person wiring it up**                       | **brand**   |
| **Anything created in a user's own account**   | **the owner of that account**                     | **brand**   |
| **Support and contact addresses**              | **users**                                         | **brand**   |

## A user-facing name carries the brand and nothing else

Not brand plus internal vocabulary. `prod`, `staging`, `runtime`, `svc`, `worker`, and
`v2` mean something to us and nothing to the reader.

A service account named `slate-prod-runtime@…` appearing in a share dialog shows a
stranger our deployment topology and leaves them wondering whether there is a non-prod
one they should have picked instead. `slate@…` is the whole of what they need. The
environment is already carried by the project, account, or domain — do not say it
twice.

## The rebrand test, for the internal half

**"If the product were rebranded tomorrow, would this name have to change?"** If yes,
and nobody outside ever reads it, the name is wrong.

Watch for brands minted from the product's own vocabulary. They read as descriptive
and still fail the test: a name built from the domain's language is still the brand,
and still has to change. Prefer a name that states the function.

## Why the care is symmetrical

Product names change; what the code does doesn't. The two failure modes cost
differently, but both are real:

- **A brand in an internal identifier** hardens into registry paths, service names,
  secret prefixes, and CI conditions. Renaming means recreating cloud resources.
- **A functional name on a user-facing identifier** costs a migration the moment
  anyone notices — and service accounts cannot be renamed. That means a _new_
  principal, every role re-granted, and every existing user re-authorizing it.

The second one has been measured: a single service-account rename cost exactly that,
and broke an existing share in the process. Neither direction is the cheap one.

## Fixing an existing violation

Do not rename opportunistically — a rename is a migration. When one is deliberately
undertaken, the order is:

1. **Extract the brand slot** — get the displayed name reading from one branding
   module, so copy changes stop being code changes.
2. **Code identifiers** — packages, modules, variables. Cheap, reversible, local.
3. **Infrastructure** — services, registries, secrets, service accounts. Expensive,
   outward-facing, and the step that needs re-authorization.

## The grep check

Before the first deploy, and any time a new identifier is introduced, grep for the
brand where only descriptive names belong:

```bash
# Substitute the brand name for <brand>.
grep -rIn --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist -i '<brand>' \
  package.json Dockerfile cloudbuild.yaml environments.json .env.example \
  .github/ scripts/ src/ 2>/dev/null
```

Every hit must be one of:

- the branding module (the one legitimate home for the displayed name), or
- a genuinely user-facing string from the leak table above.

Anything else — an image repository, a service name, a secret, a database, an env var
— is the brand leaking into an identifier. Fix it while it is still a find-replace.
