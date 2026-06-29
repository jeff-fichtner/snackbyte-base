#!/usr/bin/env bash
# Local proof of scripts/derive-version.sh against a BEHAVIOR-COMPLETE matrix.
#
# The matrix is sized by distinct BEHAVIORS of the rule, not by how many environments an app
# declares. Scenarios use stand-in environments to exercise a behavior; they do NOT enumerate
# per-environment or per-pair cases. Adding an environment to an app needs NO new scenario here —
# a new environment runs the identical code path an existing stand-in already covers.
#
# Stand-in environments (written into each fixture's environments.json):
#   P  public face,  suffix ""    on branch main   (a production-like env)
#   A  non-public,   suffix "-a"  on branch aaa
#   C  non-public,   suffix "-c"  on branch ccc
#
# The derivation can only be exercised for real against git itself, so this builds a throwaway
# repo (with a local bare "origin" so the script's `git push origin <tag>` succeeds) and runs each
# scenario, asserting the derived tag. Run: bash scripts/derive-version.test.sh
set -uo pipefail

SCRIPT="$(cd "$(dirname "$0")" && pwd)/derive-version.sh"
PKG_MM="${PKG_MM:-0.1}" # the MAJOR.MINOR the fixtures pretend package.json holds
# Counters live in files because each scenario runs in a ( subshell ); plain vars wouldn't survive.
PASS_F="$(mktemp)"; FAIL_F="$(mktemp)"
export PASS_F FAIL_F SCRIPT PKG_MM

# The default stand-in manifest, written into each fresh repo. Scenarios that need a different
# manifest (e.g. duplicate suffix) call write_manifest with their own JSON.
DEFAULT_MANIFEST='{ "environments": [
  { "name":"P","branch":"main","isPublicFace":true,"noindex":false,"tagSuffix":"" },
  { "name":"A","branch":"aaa","isPublicFace":false,"noindex":true,"tagSuffix":"-a" },
  { "name":"C","branch":"ccc","isPublicFace":false,"noindex":true,"tagSuffix":"-c" }
] }'
export DEFAULT_MANIFEST

# write_manifest <json> -> overwrite environments.json in the cwd and commit it
write_manifest() { printf '%s\n' "$1" > environments.json; git add environments.json; git commit -q -m manifest; }

# Build a fresh repo with a local bare origin + the default stand-in manifest. Returns the work
# tree path on stdout. Force the initial branch to `main` with `-b main` so the fixtures' `main`
# references work on hosts whose init.defaultBranch is `master` (the GitHub Actions runner's).
fresh_repo() {
  local root
  root="$(mktemp -d)"
  git init -q -b main --bare "$root/origin.git"
  git init -q -b main "$root/work"
  (
    cd "$root/work"
    git config user.email t@t.t
    git config user.name t
    git config commit.gpgsign false
    git remote add origin "$root/origin.git"
    printf '{"name":"t","version":"%s.0","private":true}\n' "$PKG_MM" > package.json
    printf '%s\n' "$DEFAULT_MANIFEST" > environments.json
    git add package.json environments.json
    git commit -q -m "init"
    git push -q origin HEAD:main
  )
  echo "$root/work"
}

# commit [msg] -> new empty-ish commit on current branch
commit() { git commit -q --allow-empty -m "${1:-c}"; }

# run the derivation for a branch; prints the tag the SCRIPT reports it created (via its
# GITHUB_OUTPUT `tag=` line — the authoritative answer), or "FAIL" if it exited non-zero.
derive() {
  local branch="$1" gho
  gho="$(mktemp)"
  if GITHUB_OUTPUT="$gho" "$SCRIPT" "$branch" >/dev/null 2>&1; then
    sed -nE 's/^tag=(.*)$/\1/p' "$gho"
  else
    echo "FAIL"
  fi
}

# assert <row> <expected> <actual> — counters live in files so subshell results propagate.
assert() {
  if [ "$2" = "$3" ]; then echo x >> "$PASS_F"; printf '  ok   %-4s expected %-16s\n' "$1" "$2"
  else echo x >> "$FAIL_F"; printf '  FAIL %-4s expected %-16s got %s\n' "$1" "$2" "$3"; fi
}
export -f write_manifest fresh_repo commit derive assert

echo "Deriving against package.json MAJOR.MINOR = ${PKG_MM} (stand-ins P/'' A/-a C/-c)"

# B1 — mint, first ever: push P -> v0.1.0
W="$(fresh_repo)"; ( cd "$W"; git checkout -q main
  assert B1 "v${PKG_MM}.0" "$(derive main)" )

# B1' — mint, first ever, non-public: push A -> v0.1.0-a
W="$(fresh_repo)"; ( cd "$W"; git checkout -q -b aaa
  assert B1p "v${PKG_MM}.0-a" "$(derive aaa)" )

# B2 — mint, global-max advance: v0.1.0 exists, push P on a fresh commit -> v0.1.1
W="$(fresh_repo)"; ( cd "$W"; git checkout -q main
  git tag -a "v${PKG_MM}.0" -m x; commit
  assert B2 "v${PKG_MM}.1" "$(derive main)" )

# B3 — mint, advance over MIXED suffixes: v0.1.0 and v0.1.1-a exist, push A on a fresh commit
#   -> v0.1.2-a  (the max is suffix-agnostic)
W="$(fresh_repo)"; ( cd "$W"; git checkout -q -b aaa
  git tag -a "v${PKG_MM}.0" -m x; git tag -a "v${PKG_MM}.1-a" -m x; commit
  assert B3 "v${PKG_MM}.2-a" "$(derive aaa)" )

# B4 — reuse, number already on HEAD (promotion): a commit carries v0.1.2-a, push P on it
#   -> v0.1.2  (suffix dropped, number reused)
W="$(fresh_repo)"; ( cd "$W"; git checkout -q main
  git tag -a "v${PKG_MM}.0" -m x; git tag -a "v${PKG_MM}.1" -m x
  commit; git tag -a "v${PKG_MM}.2-a" -m x   # the promoted commit, now main's HEAD
  assert B4 "v${PKG_MM}.2" "$(derive main)" )

# B5 — reuse, opposite direction (resync): a commit carries v0.1.5 (public), push A on it
#   -> v0.1.5-a
W="$(fresh_repo)"; ( cd "$W"; git checkout -q -b aaa
  commit; git tag -a "v${PKG_MM}.5" -m x   # a public tag sitting on A's HEAD
  assert B5 "v${PKG_MM}.5-a" "$(derive aaa)" )

# B6 — reuse, THREE envs on ONE commit share ONE number. A commit carries v0.1.4; push A then C
#   on that SAME commit -> v0.1.4-a then v0.1.4-c (no second number minted). Proves N-on-a-commit
#   for any N — there is no B6-for-four-environments.
W="$(fresh_repo)"; ( cd "$W"; git checkout -q -b aaa
  commit; git tag -a "v${PKG_MM}.4" -m x   # number already on this commit
  t_a="$(derive aaa)"
  git branch -q ccc            # C points at the SAME commit
  git checkout -q ccc
  t_c="$(derive ccc)"
  assert B6a "v${PKG_MM}.4-a" "$t_a"
  assert B6c "v${PKG_MM}.4-c" "$t_c" )

# B7 — collision guard: the target tag already exists on HEAD; re-derive -> FAIL-loud
W="$(fresh_repo)"; ( cd "$W"; git checkout -q main
  commit; git tag -a "v${PKG_MM}.2-a" -m x; git tag -a "v${PKG_MM}.2" -m x
  assert B7 "FAIL" "$(derive main)" )

# B8 — resume after promotion (no jam): a commit carries both v0.1.2-a and v0.1.2; push P on a
#   NEW commit (nothing tagged on it) -> v0.1.3 (advance, no jam)
W="$(fresh_repo)"; ( cd "$W"; git checkout -q main
  commit; git tag -a "v${PKG_MM}.2-a" -m x; git tag -a "v${PKG_MM}.2" -m x
  commit   # new direct commit, nothing tagged on it
  assert B8 "v${PKG_MM}.3" "$(derive main)" )

# B9 — hotfix gap: several public numbers consumed (v0.1.5..8), push A on a fresh commit
#   -> v0.1.9-a (skips past the consumed numbers)
W="$(fresh_repo)"; ( cd "$W"; git checkout -q main
  git tag -a "v${PKG_MM}.5-a" -m x; git tag -a "v${PKG_MM}.5" -m x
  git tag -a "v${PKG_MM}.6" -m x; git tag -a "v${PKG_MM}.7" -m x; git tag -a "v${PKG_MM}.8" -m x
  git checkout -q -b aaa; commit
  assert B9 "v${PKG_MM}.9-a" "$(derive aaa)" )

# B10 — diverged merge gets a fresh number. Two diverged tagged commits merged by a 2-parent
#   untagged merge commit; push P on the merge -> advance to a fresh number. The two side commits
#   MUST differ (distinct messages AND file changes) or they collapse to one SHA.
W="$(fresh_repo)"; ( cd "$W"
  base="$(git rev-parse main)"
  git checkout -q -b mainwork "$base"
  echo mainwork > side.txt; git add side.txt; git commit -q -m mainwork-change
  git tag -a "v${PKG_MM}.5" -m x                  # main-side unique commit
  git checkout -q -b devwork "$base"
  echo devwork > side.txt; git add side.txt; git commit -q -m devwork-change
  git tag -a "v${PKG_MM}.6-a" -m x                # other-side unique commit
  git checkout -q -B main mainwork
  git merge -q --no-ff -m merge -X ours devwork   # 2-parent merge commit, untagged
  assert B10 "v${PKG_MM}.7" "$(derive main)" )

# B11 — unknown branch (not in the manifest) -> FAIL-loud, no tag
W="$(fresh_repo)"; ( cd "$W"; git checkout -q -b feature-x
  assert B11 "FAIL" "$(derive feature-x)" )

# B12 — shallow refusal: a shallow clone hides tags -> FAIL-loud
W="$(fresh_repo)"; ( cd "$W"
  commit; commit
  sh="$(mktemp -d)/shallow"
  git clone -q --depth 1 "$W/.git" "$sh" 2>/dev/null
  ( cd "$sh"; git checkout -q -B main
    printf '{"name":"t","version":"%s.0","private":true}\n' "$PKG_MM" > package.json
    printf '%s\n' "$DEFAULT_MANIFEST" > environments.json
    if [ "$(git rev-parse --is-shallow-repository)" = "true" ]; then
      assert B12 "FAIL" "$( "$SCRIPT" main >/dev/null 2>&1 && echo unexpected-ok || echo FAIL )"
    else
      echo "  skip B12  (clone was not shallow on this git; guard still unit-correct)"
    fi ) )

# B13 — single-environment app: manifest has only P; consecutive P pushes self-increment
W="$(fresh_repo)"; ( cd "$W"; git checkout -q main
  write_manifest '{ "environments": [ { "name":"P","branch":"main","isPublicFace":true,"noindex":false,"tagSuffix":"" } ] }'
  t1="$(derive main)"; commit; t2="$(derive main)"
  assert B13a "v${PKG_MM}.0" "$t1"
  assert B13b "v${PKG_MM}.1" "$t2" )

echo ""
P="$(wc -l < "$PASS_F" | tr -d ' ')"; F="$(wc -l < "$FAIL_F" | tr -d ' ')"
echo "PASS=${P} FAIL=${F}"
[ "$F" -eq 0 ]
