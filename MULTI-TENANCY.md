# Multi-tenant schema, single seeded tenant

**Every app is multi-user in its data model from the first commit. No app builds a
user-management interface until there is a second user.**

The schema half of multi-tenancy is nearly free when done at the start and is a
migration when done later. The product half — signup, onboarding, invites, user
admin — is expensive, and is not needed while there is one user.

## What this means concretely

- Every table carries a non-null owner/tenant id. No exceptions, including config
  and settings tables.
- Every query is scoped by it.
- Authentication resolves a real user identity; the app does not run "as nobody."
- The first user is **seeded** — a migration or seed script inserts one row. That
  is the entire onboarding story until it isn't.
- Adding user #2 is an insert, not a migration.

## The rule that actually matters

**No code path may assume there is exactly one user.** Always resolve the current
user from the session or request context, even when the answer is always the same
person. Hardcoding "the user" anywhere — a constant, a default, a shared
credential — converts a multi-tenant schema back into a single-tenant app with
unused columns, which is the worst of both: the cost of the columns, none of the
benefit.

The common failure is not the schema. It is a credential, a config value, or a
default that quietly belongs to one person and gets used for everyone. Watch the
credential layer especially — per-tenant secrets are worth little if the same
operator token is written into all of them.

## What is deliberately not built

Signup, invites, user administration, per-user onboarding, and starter/default
content. All of these wait for a real second user. Defaults in particular cannot be
chosen well until the app has been run long enough to learn what is universal
versus idiosyncratic to whoever designed it.
