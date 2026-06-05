#!/usr/bin/env python
"""Sentinel-equivalent pre-merge lint for allmeta's shipped browser assets.

Encodes the repo's shipped-asset invariants (AGENTS.md "HTML apps" rules +
lessons.md): no external CDN resource loads, no hardcoded local paths, no BOM,
no unpopulated template placeholders, and balanced <div> nesting. Runs over
every catalog app's index.html (and shared JS/CSS), fails closed (exit 1) on
any violation with file:line, so it can gate a PR.

Usage:
  python scripts/lint_repo.py            # lint catalog apps + shared assets
  python scripts/lint_repo.py --report   # list findings, exit 0 (triage mode)

Scope: catalog entry points (from hub/projects.js) + authored shared/ JS/CSS,
excluding vendored libraries (shared/vendor/, r-shiny/shinylive/) and
non-catalog variant HTML.

Note on div balance: NOT checked here. Counting <div> vs </div> is confounded
by JS strings/regex (per AGENTS.md it stays a *manual* post-edit check), so it
is too false-positive-prone to gate a PR. This lint covers only the
unambiguous, high-signal invariants.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Dirs never linted (vendored third-party, deps, VCS, build caches, tests).
EXCLUDE_DIRS = {
    "node_modules", ".git", ".github", "__pycache__", ".pytest_cache",
    "vendor", "tests", "test-results", "playwright-report", "courses",
}
# A resource load to an external origin (CDN). <a href> navigation is fine;
# only <script src> and <link href> pull executable/style resources.
CDN_SCRIPT = re.compile(r"""<script\b[^>]*\bsrc\s*=\s*["']https?://""", re.I)
CDN_LINK = re.compile(r"""<link\b[^>]*\bhref\s*=\s*["']https?://""", re.I)
# Hardcoded local filesystem paths that must never ship.
LOCAL_PATH = re.compile(r"""[A-Za-z]:[\\/]Users[\\/]|/home/[a-z]|/Users/[A-Za-z]""")
# Unpopulated template tokens.
PLACEHOLDER = re.compile(r"\{\{[^}]*\}\}|REPLACE_ME|__PLACEHOLDER__|\bTODO_FILL\b")  # sentinel:skip-line P1-unpopulated-placeholder  (this IS the detector's own pattern, not an unpopulated token)
SCRIPT_OR_STYLE = re.compile(r"<(script|style)\b[^>]*>.*?</\1>", re.I | re.S)

# Accepted baseline (Sentinel-style allowlist): findings here are known and
# tolerated, so the gate blocks only NEW violations. Each entry is
# (relpath, rule-substring, reason). Keep this list shrinking, not growing.
# Currently EMPTY — focus-studio / kanban-lab fonts were vendored to
# shared/fonts/ (2026-06-03), so every catalog app is genuinely CDN-free.
ALLOWLIST = []

# --- P1-inline-meta-math (single-source enforcement, Phase 1a) --------------
# shared/ma-core.js (window.AlmMaCore) is the audited single source for the
# standard univariate τ² estimators (DL/PM/REML/ML/HE/HS/SJ), inverse-variance
# pool, I², HKSJ and prediction intervals — verified vs metafor to ≤1e-7. A
# catalog app that recomputes those *inline* risks silent drift from the
# audited core (e.g. gosh ships the deprecated Q-based I² 100·(Q−df)/Q, where
# ma-core uses the τ²-based form metafor reports). This pass inventories such
# reimplementations. It is WARN-ONLY (never gates) until a zero-false-positive
# sweep promotes it to BLOCK — the leaked-secret precedent (lessons.md).
#
# Signature: the closed-form DL τ² ( (Q−df)/denom ) and the Q-based I²
# ( 100·(Q−df)/Q ). Genuinely-different methods are NOT univariate IV and are
# exempt by app-dir prefix with a reason.
INLINE_META_MATH = re.compile(
    r"100\s*\*\s*\(\s*Q\w*\s*-\s*(?:df|\(?\s*k\s*-\s*1)"          # Q-based I²
    r"|\(\s*Q\w*\s*-\s*(?:df|\(?\s*k\s*-\s*1\s*\)?)\s*\)\s*/",    # DL τ² closed form
)
# app-dir → reason it legitimately does NOT delegate to ma-core's univariate IV.
INLINE_META_MATH_EXEMPT = {
    "nma": "NMA contrast-based pooling — not univariate inverse-variance",
    "bayesian-nma": "NMA (Bayesian) — not univariate inverse-variance",
    "component-nma": "additive component NMA — not univariate inverse-variance",
    "nma-inconsistency": "NMA inconsistency model — not univariate IV",
    "nma-global-inconsistency": "NMA design-inconsistency — not univariate IV",
    "nma-pro-v2": "NMA workbench — contrast-based pooling",
    "nma-dose-response-app": "dose-response NMA — bespoke",
    "nma-meta-reg": "network meta-regression — not univariate IV",
    "hsroc": "bivariate DTA (logit Se/Sp) — not univariate IV",
    "dta-sroc": "Moses SROC regression — not univariate IV",
    "limit-ma": "Rücker limit meta-analysis — bespoke base pool",
    "multilevel-ma": "three-level σ² decomposition — not two-level IV",
    "rve-meta": "cluster-robust variance — not standard IV",
    "multivariate-ma": "multivariate Sigma_between -- not univariate IV",
    "living-meta": "self-contained living bundle (vendored engine)",
    "gosh-metareg": "meta-regression residual I2 -- distinct quantity (needs moderator design matrix)",
    "dosehtml": "dose-response GLS slope heterogeneity -- not univariate IV",
    "dose-response-ma": "dose-response GLS slope -- not univariate IV",
}


def inline_math_inventory(paths) -> tuple[list[str], list[str]]:
    """Return (warn, info) findings for inline univariate τ²/I² arithmetic in
    catalog apps. warn = no AlmMaCore + not exempt (candidate reimplementation);
    info = has AlmMaCore alongside inline math (consolidation candidate)."""
    warn: list[str] = []
    info: list[str] = []
    for path in paths:
        rel = path.relative_to(ROOT).as_posix()
        app_dir = rel.split("/", 1)[0]
        if app_dir in INLINE_META_MATH_EXEMPT:
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        m = INLINE_META_MATH.search(text)
        if not m:
            continue
        ln = line_of(text, m.start())
        uses_core = "AlmMaCore" in text
        msg = f"{rel}:{ln}  P1-inline-meta-math: inline tau2/I2 ({m.group(0)[:32]!r})"
        (info if uses_core else warn).append(
            msg + (" -- alongside AlmMaCore, consolidate" if uses_core
                   else " -- no AlmMaCore; delegate or exempt with reason"))
    return warn, info


def is_allowlisted(finding: str) -> bool:
    for rel, rule, _reason in ALLOWLIST:
        if finding.startswith(rel) and rule in finding:
            return True
    return False


def line_of(text: str, idx: int) -> int:
    return text.count("\n", 0, idx) + 1


def strip_script_style(html: str) -> str:
    # Replace <script>/<style> bodies with blank lines (preserve line numbers)
    # so div-balance + placeholder checks ignore JS strings / regex / CSS.
    def blank(m: re.Match) -> str:
        return re.sub(r"[^\n]", " ", m.group(0))
    return SCRIPT_OR_STYLE.sub(blank, html)


def lint_file(path: Path) -> list[str]:
    findings: list[str] = []
    raw = path.read_bytes()
    rel = path.relative_to(ROOT).as_posix()
    if raw[:3] == b"\xef\xbb\xbf":
        findings.append(f"{rel}:1  BOM at start of shipped asset")
    text = raw.decode("utf-8", errors="replace")
    is_html = path.suffix == ".html"

    for rx, label in ((CDN_SCRIPT, "external CDN <script src>"),
                      (CDN_LINK, "external CDN <link href>")):
        if is_html:
            for m in rx.finditer(text):
                findings.append(f"{rel}:{line_of(text, m.start())}  {label}: {m.group(0)[:60]}")

    for m in LOCAL_PATH.finditer(text):
        findings.append(f"{rel}:{line_of(text, m.start())}  hardcoded local path: {m.group(0)}")

    scan = strip_script_style(text) if is_html else text
    for m in PLACEHOLDER.finditer(scan):
        findings.append(f"{rel}:{line_of(scan, m.start())}  unpopulated placeholder: {m.group(0)[:40]}")

    return findings


def catalog_entry_files() -> list[Path]:
    """Resolve every catalog app's entry point from hub/projects.js `path:`
    fields. A path ending in "/" implies index.html. These are the files
    actually served to users — the shipped surface the invariants protect.
    Vendored runtimes (r-shiny/shinylive, *.bundle) and non-catalog variant
    HTML are intentionally out of scope (third-party / not user-facing)."""
    proj = (ROOT / "hub" / "projects.js").read_text(encoding="utf-8", errors="replace")
    out: list[Path] = []
    for m in re.finditer(r'path:\s*"\./([^"]+)"', proj):
        rel = m.group(1)
        p = ROOT / rel
        if rel.endswith("/"):
            p = p / "index.html"
        if p.is_file():
            out.append(p)
    return out


def iter_assets():
    seen = set()
    # 1. Catalog entry points (the shipped, user-facing surface).
    for p in catalog_entry_files():
        if p not in seen:
            seen.add(p)
            yield p
    # 2. Authored shared modules/styles (loaded by many apps), minus vendored libs.
    for sub in ("shared", "hub/shared"):
        base = ROOT / sub
        if not base.is_dir():
            continue
        for p in sorted(base.rglob("*")):
            if p.is_dir() or p in seen:
                continue
            parts = p.relative_to(ROOT).parts
            if any(part in EXCLUDE_DIRS for part in parts):
                continue
            if p.suffix in (".js", ".css"):
                seen.add(p)
                yield p


def main() -> int:
    report = "--report" in sys.argv
    raw: list[str] = []
    n_files = 0
    for path in iter_assets():
        n_files += 1
        raw.extend(lint_file(path))
    gating = [f for f in raw if not is_allowlisted(f)]
    allowed = [f for f in raw if is_allowlisted(f)]

    # WARN-only single-source inventory (never gates; see INLINE_META_MATH).
    im_warn, im_info = inline_math_inventory(catalog_entry_files())
    if im_warn or im_info:
        print(f"lint_repo: P1-inline-meta-math inventory (WARN-only, non-gating): "
              f"{len(im_warn)} candidate(s), {len(im_info)} consolidation note(s):")
        for f in im_warn:
            print("  ! " + f)
        for f in im_info:
            print("  ~ " + f)
        print()

    if allowed:
        print(f"lint_repo: {len(allowed)} allowlisted finding(s) (accepted baseline):")
        for f in allowed:
            print("  ~ " + f)
        print()
    if gating:
        print(f"lint_repo: {len(gating)} NEW finding(s) across {n_files} assets:\n")
        for f in gating:
            print("  " + f)
        if report:
            print("\n(--report mode: exit 0)")
            return 0
        print(f"\nFAIL — {len(gating)} shipped-asset invariant violation(s). "
              "Fix, or (if genuinely accepted) add to ALLOWLIST in scripts/lint_repo.py.")
        return 1
    print(f"lint_repo: OK — {n_files} shipped assets clean "
          f"({len(allowed)} allowlisted).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
