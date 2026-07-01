# Contract: Config placeholder schema — `.specify/extensions/clickup-sync/config.yml`

Committed, secret-free. The only per-repo knobs an adopter sets.

## Shape

```yaml
space: "<your-space-name>"        # required — ClickUp space the shared list lives in
list:  "<your-shared-list-name>"  # required — the one shared list all feature-cards go into
```

## Rules

- Exactly two required string keys: `space`, `list`.
- MUST contain **no** workspace/space/list IDs and **no** credentials (FR-021, SC-012).
- Ships with the `<your-…>` placeholder values; provision refuses while they are unfilled.
- Retargeting to a different workspace/space/list is a config edit only — no code change
  (FR-022, SC-011).
- Auth is entirely the MCP server's concern; this file never references it.
