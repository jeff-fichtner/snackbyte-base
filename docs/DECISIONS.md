# Architecture Decisions — snackbyte.io platform

This document captures the decisions made while planning the snackbyte.io site
family. It is the durable record so the context survives across sessions and tools.
Spec-level detail for the template itself lives in
`specs/001-template-skeleton/spec.md`.

## The big picture

`snackbyte.io` is the main site. The home page is marketing. Beyond that, the domain
ghost-hosts a collection of unrelated one-off apps (e.g. a speaker rental tool), each
intended to feel like its own self-contained product.

### Routing strategy: subdomains, not paths

- **Path-based** (`snackbyte.io/speakers`) → same repo. Fine for closely related
  routes; Next.js-style monorepo handles it naturally.
- **Subdomain-based** (`speakers.snackbyte.io`) → **separate repo, separate
  deployment.** This is the chosen approach for the one-off apps.

**Rule: path = same repo; subdomain = separate repo.** Subdomains are separate
origins, so there is no technical benefit to coupling them. Each subdomain app is an
independent deployment with total freedom (deploy schedule, etc.).

A "hidden home" link (e.g. at the very bottom) back to the marketing site is
acceptable and planned.

## The template chain

Two tiers (two is the ceiling for a solo maintainer):

```
snackbyte-base (GitHub template)     ← pure technical skeleton, no visual opinions
  └── snackbyte-site (first real app, marketing home; also the extraction source)
        └── @snackbyte/ui (versioned npm package, extracted from snackbyte-site)
              └── consumed by every subdomain app for shared identity
```

- **snackbyte-base** — Express + Vite + React + TypeScript skeleton, tooling,
  folder conventions, the static/server mode switch. Reusable for any project, not
  just snackbyte. **This repo.**
- **snackbyte-site** — the actual marketing homepage, spun up *from* base; doubles
  as the live test of the template and the place where shared UI is first built.
- **@snackbyte/ui** — the snackbyte identity layer (theme tokens, Header/Footer,
  shared components, the hidden home link), **extracted later** from snackbyte-site
  once the components are real. Distributed as a **versioned npm package**, not via
  template copy.

### Why template for skeleton, package for identity

GitHub templates are a **one-time copy**, not a live link. Two kinds of change
propagate differently:

| What changed | Lives in | How it propagates |
|---|---|---|
| Toolchain, configs, folder conventions, the mode switch | `snackbyte-base` template | Manual backport (rare, acceptable — stabilizes and stops changing) |
| Theme, Header/Footer, shared components | `@snackbyte/ui` package | Version bump (frequent, automatic, no hand-copying) |

Styling changes often and must stay in sync across subdomains — that is exactly what
a copy-paste template is bad at, so styling lives in the package. The skeleton
stabilizes quickly, so manual backport is fine for it.

## Build order

1. **snackbyte-base** — skeleton + static/server mode switch (the genuinely new,
   unproven work; `tonic` did not prove this). **In progress.**
2. **snackbyte-site** — spin up from base = first real app + live test of template.
3. **@snackbyte/ui** — extract from snackbyte-site once styling is real, then have
   apps consume it.

Each step validates the previous: site proves base works; ui proves the shared
layer works. Building the package first would produce abstractions with nothing to
validate them against.

## Stack decisions

- **Language**: TypeScript (non-negotiable).
- **Build/dev**: Vite.
- **UI framework**: **React.** Chosen primarily because `@snackbyte/ui` (shared,
  versioned components across subdomains) is a component-library problem, and that
  pattern is most well-trodden in React. The majority of apps are backend/interactive
  (where a component model pays off), not pure-static.
- **Backend**: Express, present in the skeleton; deployed only in **server** mode.
- **Tests**: **Vitest** (reuses `vite.config`, ESM-native, faster than Jest;
  replaces tonic's Jest + ts-jest + jsdom).
- **Node**: **22 LTS**, pinned (tonic ran on non-LTS v23; pin for production).
- **Lint/format**: ESLint (typescript-eslint) + Prettier, adapted from tonic's
  configs.

## Hosting: GCP / Cloud Run

**Host: Google Cloud Platform.** "Industrial, not cheap" — reliability/SLA, owning
the infrastructure, ecosystem gravity, and future scale all mattered. GCP chosen
over Azure (the only other contender) because:

- **Google gravity.** Gmail + the school's Google Workspace, and `tonic` already
  authenticates against Google APIs (`google-auth-library`, `googleapis`, Sheets).
  Staying in GCP means one identity/IAM/service-account model, not straddling two
  clouds. User also simply prefers GCP.
- **Cloud Run fits the model.** One self-contained Express app per subdomain maps
  1:1 to one Cloud Run service. Scale-to-zero means idle one-off apps cost ~nothing.
  "Container in, HTTPS URL out" is the near-zero-ops tier wanted (no VM/cluster
  babysitting).

Azure Container Apps is equivalent tech and would have won only with strong
Microsoft enterprise gravity (Entra ID, M365) — which is absent here.

**Ops appetite: managed PaaS, not Kubernetes.** Hand the platform a container; it
runs/scales/TLS-terminates. GKE is in the same cloud if ever genuinely needed.

### Deploy mapping baked into the template

| Concern | GCP service |
|---|---|
| Server-mode app | Cloud Run service (containerized Express) |
| Static-mode app | Cloud Storage bucket + Cloud CDN (or Cloud Run for uniformity) |
| Container images | Artifact Registry |
| Subdomain → app | Cloud Run domain mapping (load balancer for wildcard later) |
| Build/deploy | `Dockerfile` + `gcloud run deploy`, optionally Cloud Build CI |

The template therefore ships a `Dockerfile`, `.dockerignore`, and a deploy
script/`cloudbuild.yaml`. The static/server mode switch decides whether spin-up
wires toward Cloud Run (server) or Storage+CDN (static).

### Future phase (OUT OF SCOPE for v1): host friends' apps

Ambition to host other people's apps under snackbyte subdomains, like
`x.azurewebsites.net`-style. Two shapes:

- **You deploy them** (they hand you code) → just "more Cloud Run services." No new
  infrastructure. This is the assumed near-term path if it happens.
- **They self-serve** (push-to-deploy, own dashboard) → a real platform product:
  build pipeline, per-tenant isolation, automated wildcard-subdomain provisioning,
  resource/billing limits. A separate project; do NOT build until there's demand.

Cloud Run does not box this out — it's container-based and fully programmable, so it
scales from "my few apps" toward a mini-hosting-platform without re-platforming.

### Render strategy vs deploy mode — two independent knobs

- **Deploy mode**: `static` (CDN, no server) vs `server` (Express runs).
- **Render strategy**: prerender (build-time HTML) / CSR (client-side) / SSR.

They compose freely. Defaults: **static mode prerenders** build-time-known content;
**CSR is correct only for runtime-driven content** (games, interactive tools, or a
page about to become dynamic) — never for static content. React supports all three
from the same skeleton; React does NOT force server mode (a React app can be 100%
static/prerendered).

The "React is too heavy for static" concern was examined and dismissed:
React+ReactDOM ≈ 45KB gzipped (invisible at this scale), and prerendering removes
the blank-shell first-paint/SEO cost. The real anti-pattern is CSR-ing static
content, not using React.

## Reference

- Toolchain conventions adapted from the existing **tonic** app:
  `~/Snackbyte/clients/mcds/forte/tonic` (Express + Vite + TypeScript). tonic proved
  the toolchain; it did NOT prove the static/server mode switch, a stripped skeleton,
  or the shared-UI layer — those are the new work here.
- Spec-driven development via **Spec Kit** (installed, targeting Claude Code).
  Workflow: `/speckit-constitution` → `/speckit-specify` → `/speckit-plan` →
  `/speckit-tasks` → `/speckit-implement`.
