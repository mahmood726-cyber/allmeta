#!/bin/sh
set -eu

fail() {
    printf '%s\n' "$1" >&2
    exit 1
}

[ "$#" -eq 1 ] || fail 'Usage: check-ci.sh <log-path>'
log=$1
[ -r "$log" ] || fail "Cannot read log: $log"

# Validate the reporting contract only; DEV accuracy is not a gate.
grep -Eq '^YUN DEV PC-EXACT binary=[0-9]+/[0-9]+ continuous=[0-9]+/[0-9]+ ' < "$log" ||
    fail 'Missing YUN DEV PC-EXACT line with binary and continuous counts'
count=$(grep -c '^YUN DEV PC-EXACT ' < "$log")
[ "$count" -eq 1 ] || fail "Expected exactly one YUN DEV PC-EXACT line; found $count"
grep -Eq '^YUN DEV RECALL binary=[0-9]+/[0-9]+ continuous=[0-9]+/[0-9]+ ' < "$log" ||
    fail 'Missing YUN DEV RECALL line with binary and continuous counts'
grep -Eq '^NOTES .* errors=0 ' < "$log" ||
    fail 'Missing NOTES line with errors=0'

printf '%s\n' 'YUN_CI_OK'
