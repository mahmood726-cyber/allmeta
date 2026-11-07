"""Write shared/build-info.js, the identity stamped into receipts and JSON exports.

The copy in git is deliberately unstamped. A commit cannot contain its own SHA,
so a stamped copy in git always names some other commit: it names the parent at
best, and goes on naming that commit for every commit after it. Exports must
never claim a commit that is not the one served, so:

    python scripts/regen_build_info.py
        Rewrites the committed file, unstamped: the null SHA and the epoch. Run
        at a release so its version follows CITATION.cff.

    python scripts/regen_build_info.py --sha <40 hex> --out _site/shared/build-info.js
        Stamps a build output. pages.yml does this with the commit it deployed.
        Refuses to stamp the committed file.

Reads version from CITATION.cff (the `version:` field) so version remains
single-sourced.
"""
from __future__ import annotations

import argparse
import datetime as dt
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "shared" / "build-info.js"
CFF = ROOT / "CITATION.cff"
# Unstamped: git's null SHA and the epoch, so nothing downstream can mistake a
# source checkout for a deployed commit.
NULL_SHA = "0" * 40
EPOCH = "1970-01-01T00:00:00Z"


def _read_version() -> str:
    text = CFF.read_text(encoding="utf-8")
    m = re.search(r'^version:\s*"?([^"\s]+)"?\s*$', text, flags=re.MULTILINE)
    if not m:
        raise SystemExit("CITATION.cff has no `version:` field")
    return m.group(1)


def _now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Write the allmeta build identity.")
    parser.add_argument("--sha", help="commit being deployed (40 hex); requires --out")
    parser.add_argument("--out", type=Path, help="build output to stamp")
    args = parser.parse_args(argv)
    if bool(args.sha) != bool(args.out):
        raise SystemExit("--sha and --out go together: only a build output is stamped")
    if args.sha and not re.fullmatch(r"[0-9a-f]{40}", args.sha):
        raise SystemExit(f"unexpected SHA: {args.sha!r}")
    if args.sha == NULL_SHA:
        raise SystemExit("refusing to stamp the null SHA")
    if args.out and args.out.resolve() == OUT:
        raise SystemExit("refusing to stamp the committed file: a commit cannot contain its own SHA")
    version = _read_version()
    sha = args.sha or NULL_SHA
    builtAt = _now_iso() if args.sha else EPOCH
    out = args.out or OUT
    short = sha[:7]
    body = f'''/**
 * Build identity for allmeta — used to stamp TruthCert receipts and JSON
 * exports with the exact code that produced them.
 *
 * Written by scripts/regen_build_info.py. pages.yml stamps the deployed copy
 * with the commit it serves. The copy in git holds the null SHA and the epoch
 * because a commit cannot contain its own SHA.
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
 *   - sha:     full git commit SHA deployed; all zeros when not deployed
 *   - shortSha: 7-char prefix for display
 *   - builtAt: ISO-8601 UTC deploy time; the epoch when not deployed
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
    out.write_text(body, encoding="utf-8", newline="\n")
    print(f"wrote {out}")
    print(f"  version  = {version}")
    print(f"  sha      = {sha}")
    print(f"  builtAt  = {builtAt}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
