"""Regenerate shared/build-info.js with the current git SHA + ISO timestamp.

Run this before a release / DOI mint:
    python scripts/regen_build_info.py

Reads version from CITATION.cff (the `version:` field) so version remains
single-sourced. Writes shared/build-info.js with the captured SHA, timestamp,
URL, and version.
"""
from __future__ import annotations

import datetime as dt
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "shared" / "build-info.js"
CFF = ROOT / "CITATION.cff"


def _read_version() -> str:
    text = CFF.read_text(encoding="utf-8")
    m = re.search(r'^version:\s*"?([^"\s]+)"?\s*$', text, flags=re.MULTILINE)
    if not m:
        raise SystemExit("CITATION.cff has no `version:` field")
    return m.group(1)


def _git_sha() -> str:
    sha = subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=str(ROOT), text=True
    ).strip()
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise SystemExit(f"unexpected SHA: {sha!r}")
    return sha


def _now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def main() -> int:
    version = _read_version()
    sha = _git_sha()
    builtAt = _now_iso()
    short = sha[:7]
    body = f'''/**
 * Build identity for allmeta — used to stamp TruthCert receipts and JSON
 * exports with the exact code that produced them.
 *
 * Regenerate with: python scripts/regen_build_info.py
 *
 * Why this is signed: when receipts get audited months later, the reviewer
 * needs to know which code path produced the numbers. Without a SHA, you
 * can't replay a v11.0 calculation on a v11.4 codebase and expect a match —
 * estimator defaults drift, edge-case handling improves, prior conventions
 * change. The SHA pins the receipt to its provenance.
 *
 * Field meanings:
 *   - app:     always "allmeta" (constant)
 *   - version: semver-ish tag (matches CITATION.cff)
 *   - sha:     full git commit SHA at build time
 *   - shortSha: 7-char prefix for display
 *   - builtAt: ISO-8601 UTC timestamp when this file was regenerated
 */
(function (global) {{
  'use strict';
  var info = {{
    app: "allmeta",
    version: "{version}",
    sha: "{sha}",
    shortSha: "{short}",
    builtAt: "{builtAt}",
    url: "https://mahmood726-cyber.github.io/allmeta/"
  }};
  global.AlmBuildInfo = info;
  if (typeof module !== 'undefined' && module.exports) module.exports = info;
}})(typeof window !== 'undefined' ? window : globalThis);
'''
    OUT.write_text(body, encoding="utf-8")
    print(f"wrote {OUT}")
    print(f"  version  = {version}")
    print(f"  sha      = {sha}")
    print(f"  builtAt  = {builtAt}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
