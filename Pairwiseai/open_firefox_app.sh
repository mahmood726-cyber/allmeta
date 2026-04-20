#!/usr/bin/env bash
set -euo pipefail

APP_PATH="${1:-C:\\HTML apps\\Truthcert1_work\\TruthCert-PairwisePro-v1.0.html}"
FIREFOX_EXE="/mnt/c/Program Files/Mozilla Firefox/firefox.exe"

if [[ ! -x "$FIREFOX_EXE" ]]; then
  echo "Firefox not found at: $FIREFOX_EXE" >&2
  exit 1
fi

if [[ "$APP_PATH" =~ ^[A-Za-z]:\\ ]]; then
  FILE_URL="file:///$(echo "$APP_PATH" | sed 's#\\#/#g' | sed 's# #%20#g')"
else
  FILE_URL="$APP_PATH"
fi

"$FIREFOX_EXE" "$FILE_URL"
