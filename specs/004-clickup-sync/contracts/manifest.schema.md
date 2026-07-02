# Contract: Sync manifest schema — `specs/<feature>/.clickup-sync.json`

Committed per-feature file. Target locator + dedup index. Written by provision (targets) and
sync (element IDs + hashes).

## Shape

```jsonc
{
  "schemaVersion": "1",
  "feature": "004-clickup-sync",
  "workspaceId": "9012345",
  "spaceId": "90123456",
  "listId": "901234567",
  "statusMapping": {
    "not-started": "to do",
    "in-progress": "in progress",
    "done": "complete"
  },
  "card": {
    "id": "86abcd123",
    "hash": "sha256:…"            // hash of derived card body + status
  },
  "userStories": [
    {
      "us": "US1",
      "id": "86abcd201",
      "hash": "sha256:…",          // hash of the US-subtask body incl. its checkbox list
      "dependsOn": []
    },
    {
      "us": "US3",
      "id": "86abcd203",
      "hash": "sha256:…",
      "dependsOn": ["US1", "US2"]  // waiting_on edges
    }
  ]
}
```

## Rules

- `schemaVersion`, `feature`, `workspaceId`, `spaceId`, `listId`, `statusMapping` — required
  after provision. Sync refuses if `listId`/`statusMapping` absent.
- `card`, `userStories` — populated by sync; absent before first sync.
- `statusMapping` values are the target list's **actual** status names (portable; FR-010).
- Contains **runtime ClickUp IDs** — this is the ONLY place committed IDs are allowed
  (FR-021 exempts the runtime manifest). Contains **no credentials**.
- Hashes are stable over identical derived content so a no-op run rewrites nothing (SC-002).
- Parser tolerance: read with `jq` when available, documented fallback otherwise (mirrors
  `common.sh` conventions).

## Schema stability (upgrade contract)

The extension is template-copied into apps (Constitution IV), so a manifest written by one
version must survive a later re-copy of the extension. Therefore:

- **Changes are additive.** Later versions MAY add new fields; they MUST NOT rename or remove
  existing ones or change their meaning. A reader ignores fields it does not know.
- **`schemaVersion` bumps only on a breaking change.** An additive change keeps `schemaVersion`
  the same; a breaking change bumps it AND ships a documented migration. Absent a bump, any
  version reads any manifest.
- **Per-app state is never clobbered by an upgrade.** Re-copying the extension's logic
  (commands, helpers, skills) leaves each feature's `.clickup-sync.json` and the repo's
  `config.yml` untouched — only the code is replaced. This is what makes propagating a new
  version (e.g. the 005 additions) a safe re-copy rather than a migration.
