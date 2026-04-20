#!/usr/bin/env bash
set -euo pipefail

WIN_PY="/mnt/c/Users/user/AppData/Local/Programs/Python/Python313/python.exe"
SCRIPT_WIN='C:\\HTML apps\\Truthcert1_work\\test_truthcert_v2.py'

if [[ ! -x "$WIN_PY" ]]; then
  echo "Windows Python not found at: $WIN_PY" >&2
  exit 1
fi

TRUTHCERT_BROWSER=firefox TRUTHCERT_HEADLESS="${TRUTHCERT_HEADLESS:-1}" \
  "$WIN_PY" -u "$SCRIPT_WIN"
