#!/usr/bin/env bash
# Proves the core promise: adding an environment is a one-row edit to environments.json, and the
# reusable release tooling picks it up with no other change. Run: bash scripts/add-env.test.sh
#
# Builds a throwaway repo seeded from the real template files (derive-version.sh + environments.json),
# adds a `qa` row, and asserts:
#   1. the env-addition commit touched ONLY environments.json (the diff guard);
#   2. the derivation produces a `-qa` tag for the qa branch (suffix from the manifest);
#   3. the resolve-env lookup (the CI short-circuit) recognizes qa and rejects a non-env branch.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Counters in a file so subshell results survive.
FAIL_F="$(mktemp)"
ok()  { printf '  ok   %s\n' "$1"; }
bad() { echo x >> "$FAIL_F"; printf '  FAIL %s — %s\n' "$1" "$2"; }
export FAIL_F

# resolve-env lookup, the exact expression the CI resolve-env job uses (is the branch an env?).
is_env() { node -e "process.exit(require('./environments.json').environments.some(e => e.branch === process.argv[1]) ? 0 : 1)" "$1"; }
export -f ok bad is_env

root="$(mktemp -d)"; work="$root/work"; mkdir -p "$work/scripts"
git init -q -b main --bare "$root/origin.git"
git init -q -b main "$work"
(
  cd "$work"
  git config user.email t@t.t; git config user.name t; git config commit.gpgsign false
  git remote add origin "$root/origin.git"
  cp "$ROOT/scripts/derive-version.sh" scripts/
  cp "$ROOT/environments.json" environments.json
  printf '{"name":"t","version":"0.1.0","private":true}\n' > package.json
  git add -A; git commit -q -m init; git push -q origin HEAD:main
  base="$(git rev-parse HEAD)"

  # --- add the qa environment: ONE row in environments.json (a real maintainer edit) ---
  node -e '
    const fs = require("fs");
    const m = JSON.parse(fs.readFileSync("environments.json","utf8"));
    m.environments.push({ name:"qa", branch:"qa", isPublicFace:false, noindex:true, tagSuffix:"-qa" });
    fs.writeFileSync("environments.json", JSON.stringify(m, null, 2) + "\n");
  '
  git add environments.json; git commit -q -m "add qa environment"

  # 1. diff guard: the env-addition commit changed ONLY environments.json.
  changed="$(git diff --name-only "${base}" HEAD)"
  if [ "$changed" = "environments.json" ]; then ok "add-env touched only environments.json"
  else bad "diff-guard" "expected only environments.json, got: ${changed}"; fi

  # 2. derivation produces a -qa tag for the qa branch.
  git checkout -q -b qa
  gho="$(mktemp)"
  if GITHUB_OUTPUT="$gho" bash scripts/derive-version.sh qa >/dev/null 2>&1; then
    tag="$(sed -nE 's/^tag=(.*)$/\1/p' "$gho")"
    [ "$tag" = "v0.1.0-qa" ] && ok "qa derives v0.1.0-qa" || bad "qa-derive" "expected v0.1.0-qa, got ${tag}"
  else bad "qa-derive" "derivation failed for qa"; fi

  # 3. resolve-env recognizes qa, and rejects a non-environment branch.
  if is_env qa; then ok "resolve-env recognizes qa"; else bad "resolve-qa" "qa not recognized"; fi
  if is_env feature-x; then bad "resolve-nonenv" "feature-x wrongly recognized"; else ok "resolve-env rejects non-env branch"; fi
)

rm -rf "$root"
F="$(wc -l < "$FAIL_F" | tr -d ' ')"
echo ""
echo "add-env verification: FAIL=${F}"
[ "$F" -eq 0 ]
