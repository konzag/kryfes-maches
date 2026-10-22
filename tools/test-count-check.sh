#!/usr/bin/env bash
# Test-count floor (TEST-STANDARD v1 §R-JS, Playwright-only fallback): the game is one inline <script>, so no
# coverage tool can see it and the ratchet is the number of listed Playwright tests instead of a percentage.
#
# Usage: tools/test-count-check.sh        (from anywhere; needs `npm ci` first)
#   count = `npx playwright test --list`, line `Total: N tests in M files` (every project, skipped ones included)
#   fails when count < the floor in .coverage-floor, or when the count cannot be read (fail closed).
# The floor itself only goes up: tools/coverage-floor-check.sh compares .coverage-floor with the base branch.
set -euo pipefail
cd "$(dirname "$0")/.."

floor=$(grep -oE '^[0-9]+' .coverage-floor | head -1 || true)
[ -n "$floor" ] || { echo "::error::test-count-check: no number in .coverage-floor"; exit 2; }

out=$(npx playwright test --list 2>&1 || true)
count=$(sed -nE 's/^Total: ([0-9]+) tests? in .*/\1/p' <<<"$out" | tail -1)
if [ -z "$count" ]; then
  echo "::error::test-count-check: could not count the tests"
  printf '%s\n' "$out" | tail -5
  exit 2
fi

echo "test count: ${count} listed (floor ${floor})"
if [ "$count" -lt "$floor" ]; then
  echo "::error::test count ${count} is below the floor ${floor} (.coverage-floor): a test was removed"
  exit 1
fi
