#!/usr/bin/env bash
# Discover and run every *.test.sh under the repo (the shell-level gate for this
# spec-workflow template). Mirrors the *.test.sh convention used by the extension
# helpers (clickup-*.test.sh) and any future derive-version/add-env-style tests.
#
# Exit non-zero if any test file exits non-zero, so it can back `npm run check:all`
# / `npm run test:release` and any CI step. No external deps beyond bash + find.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/common.sh"

ROOT="$(find_specify_root "$SCRIPT_DIR")" || {
    echo "run-tests: could not locate .specify project root" >&2
    exit 1
}

# Collect test files (sorted, stable), excluding VCS and dependency dirs.
tests=()
while IFS= read -r f; do
    tests+=("$f")
done < <(
    find "$ROOT" \
        \( -path '*/.git/*' -o -path '*/node_modules/*' \) -prune -o \
        -name '*.test.sh' -type f -print | sort
)

if [ "${#tests[@]}" -eq 0 ]; then
    echo "run-tests: no *.test.sh files found under $ROOT" >&2
    exit 1
fi

pass=0
fail=0
failed_files=()

for t in "${tests[@]}"; do
    rel="${t#"$ROOT"/}"
    echo "=== $rel ==="
    if bash "$t"; then
        pass=$((pass + 1))
    else
        fail=$((fail + 1))
        failed_files+=("$rel")
    fi
    echo ""
done

echo "----------------------------------------"
echo "run-tests: $pass passed, $fail failed (${#tests[@]} files)"
if [ "$fail" -ne 0 ]; then
    printf 'FAILED: %s\n' "${failed_files[@]}" >&2
    exit 1
fi
echo "run-tests: ALL PASS"
