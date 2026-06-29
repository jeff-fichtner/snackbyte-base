#!/usr/bin/env bash
# Derive this push's version tag from git tags — the release flow never commits anything.
#
# The version PATCH is not stored in package.json (which holds only MAJOR.MINOR); it is a
# global, monotonic build id derived from the tags that already exist. The pushed branch
# selects the environment; environments.json maps the branch to the tag suffix:
#   - a branch whose environment has suffix ""      -> tag vMAJOR.MINOR.PATCH
#   - a branch whose environment has suffix "-dev"  -> tag vMAJOR.MINOR.PATCH-dev
#   - any other environment's suffix                -> tag vMAJOR.MINOR.PATCH<suffix>
#
# One rule, every environment (no per-branch special case):
#   1. If ANY version number is already tagged on THIS exact commit — regardless of which
#      environment's suffix it bears — reuse that number. This covers a fast-forward promotion
#      or resync: the commit ends up carrying this environment's suffix for the same number.
#   2. Otherwise advance to (highest patch among ALL vMM.* tags) + 1. Taking the max over every
#      tag (every suffix, every environment) makes two distinct commits sharing a number
#      impossible. The cost is gaps (a hotfix consumes a number, so another environment's next
#      number skips ahead); that is correct for a build id.
# The branch is used only as DATA (its suffix, looked up in environments.json). There is no
# per-environment code path: the same reuse-or-mint runs for every environment.
#
# Output: prints nothing to stdout except, when GITHUB_OUTPUT is set, writes `version=` and
# `tag=` for the workflow. The tag is created and pushed here; no commit, no branch push.
#
# Usage: scripts/derive-version.sh <branch>   (branch defaults to $GITHUB_REF_NAME)
set -euo pipefail

BRANCH="${1:-${GITHUB_REF_NAME:-}}"

# Resolve the pushing branch's environment from environments.json. An unknown branch cannot be
# tagged (we wouldn't know which suffix to stamp) — fail loudly. node -p prints the suffix, or
# the sentinel __UNKNOWN__ when the branch is not an environment, mirroring the package.json read.
suffix="$(node -p "
  const m = require('./environments.json').environments;
  const e = m.find(x => x.branch === process.argv[1]);
  e ? e.tagSuffix : '__UNKNOWN__';
" "$BRANCH")"
if [ "$suffix" = "__UNKNOWN__" ]; then
  echo "Branch '${BRANCH}' is not an environment in environments.json — nothing to derive." >&2
  exit 1
fi

# Non-blocking warning: two environments sharing a tag suffix is allowed (it cannot corrupt the
# version line — distinct numbers keep tags distinct) but makes their tags indistinguishable.
dupe="$(node -p "
  const s = require('./environments.json').environments.map(e => e.tagSuffix);
  const seen = new Set(), dups = new Set();
  for (const x of s) { if (seen.has(x)) dups.add(x); seen.add(x); }
  [...dups].map(d => JSON.stringify(d)).join(', ');
")"
if [ -n "$dupe" ]; then
  echo "Warning: environments.json has duplicate tagSuffix(es): ${dupe} — those environments' tags will be indistinguishable." >&2
fi

# A shallow checkout would hide existing tags and mis-derive a number that already exists.
# Test the clone directly rather than guessing from history length: zero tags on a COMPLETE
# clone is a legitimate first push (which mints vMM.0), but zero tags on a shallow clone is a
# truncation we must refuse.
if [ "$(git rev-parse --is-shallow-repository)" = "true" ]; then
  echo "Shallow checkout — tags may be hidden; refusing to derive. Use a full clone (fetch-depth: 0)." >&2
  exit 1
fi

# MAJOR.MINOR from package.json; the patch field there is ignored.
MM="$(node -p "require('./package.json').version.split('.').slice(0,2).join('.')")"
MME="${MM//./\\.}" # regex-escape the dots for anchored matching

# The read-back parser is generated from the tag-format parts (prefix 'v', then MM., then the
# integer patch, then ANY suffix or none). One regex serves both reuse and mint — it is
# suffix-agnostic by construction, so it never needs to know which environments exist.
patch_re="^v${MME}\.([0-9]+)(-[A-Za-z0-9._-]+)?\$"

# Step 1 — reuse: if any number is already tagged on THIS commit (any suffix), take it.
patch="$(git tag --points-at HEAD | sed -nE "s/${patch_re}/\1/p" | sort -n | tail -1)"

# Step 2 — otherwise advance to the global max patch + 1 (empty set => -1 => 0 => first tag).
if [ -z "$patch" ]; then
  max="$(git tag -l "v${MM}.*" | sed -nE "s/${patch_re}/\1/p" | sort -n | tail -1)"
  patch="$(( ${max:--1} + 1 ))"
fi

version="${MM}.${patch}"
tag="v${version}${suffix}"

# Never overwrite or silently reuse a tag. If the target already exists this is a re-run or a
# race (or an attempt to re-tag an already-released number) — fail loudly so no tag is produced
# and the deploy that depends on the tag is skipped rather than silently re-run.
if git rev-parse "$tag" >/dev/null 2>&1; then
  echo "Tag ${tag} already exists — refusing to overwrite (re-run, race, or already released)." >&2
  exit 1
fi

git tag -a "$tag" -m "Release ${tag}"
git push origin "$tag" # push the TAG only — never a commit, never a branch

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  {
    echo "version=${version}"
    echo "tag=${tag}"
  } >> "$GITHUB_OUTPUT"
fi
echo "Derived ${tag} on ${BRANCH} (no commit pushed)." >&2
