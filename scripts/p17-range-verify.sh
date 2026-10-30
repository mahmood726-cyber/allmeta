#!/usr/bin/env bash
# Deterministic P17 publication replay. Reconstruct only required source/data
# from the pre-fix Git parent, then compare byte-for-byte with the current head.
# Never use the corrected implementation to generate the original snapshot.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
BASE=66aeba6349060f5954e52b0c941495366f160e8a
test "$(git rev-parse "${BASE}^{commit}")" = "$BASE"
git merge-base --is-ancestor "$BASE" HEAD
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/original/scripts"
for path in \
  shared/ma-core.js \
  correlation-ma/plus-core.js \
  correlation-ma/validate/plus-corpus/reference-plus.json \
  correlation-ma/validate/corpus/reference.json
do
  mkdir -p "$tmp/original/$(dirname "$path")"
  git show "$BASE:$path" > "$tmp/original/$path"
done
# Only the replay instrument is copied. All imported code and inputs above
# come from the exact pre-fix Git tree, including fixed reference identities.
cp scripts/p17-range-replay.mjs "$tmp/original/scripts/p17-range-replay.mjs"
export P17_BASELINE_SNAPSHOT="$tmp/pre-fix.json"
P17_AUTHENTICATED_PRE_FIX_SHA="$BASE" node "$tmp/original/scripts/p17-range-replay.mjs" --capture-pre-fix
node scripts/p17-range-replay.mjs --compare
