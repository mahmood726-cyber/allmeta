#!/usr/bin/env python
"""Claim/code drift sweep (Phase 1e) — keep what the repo *says* in sync with
what it *ships*.

The other gates already cover their own surfaces: lint_repo.py guards shipped-
asset invariants, ground_citations.py grounds every claimed DOI, and the parity
ledger is *generated* (so its content cannot lead the evidence). What remains
un-gated is the slow rot between the human-facing claims and the filesystem:

  A. catalog <-> filesystem bijection
       Every internal catalog entry (hub/projects.js) must resolve to a real
       app directory, and every shipped app directory must be reachable — either
       catalogued, linked from another page, or on an explicit pilot exempt list
       (with a reason). Catches "shipped an app, forgot to list it" and "deleted
       an app, left it in the catalog".
  B. declared counts
       README's "N catalog entries — M repository-hosted ... E externally hosted"
       and manifest.json's "X+ tools" floor must match the actual catalog. These
       are hand-typed numbers that drift the moment an app is added or removed.
  C. parity-ledger freshness
       The committed parity/parity-ledger.js must equal what build-parity-ledger
       .mjs produces *today* — modulo its volatile "generated" date stamp.
       Catches "added a parity spec, forgot to regenerate the ledger". Skipped
       (not failed) when node is unavailable.

Pure stdlib + an optional `node` for check C. Fails closed (exit 1) on any drift
with a specific message, so it can gate a PR alongside lint_repo.py.

Usage:
  python scripts/drift_sweep.py            # gate (exit 1 on drift)
  python scripts/drift_sweep.py --report   # list findings, exit 0 (triage)
"""
from __future__ import annotations

import io
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROJECTS_JS = ROOT / "hub" / "projects.js"
README = ROOT / "README.md"
MANIFEST = ROOT / "manifest.json"
LEDGER = ROOT / "parity" / "parity-ledger.js"
LEDGER_GEN = ROOT / "scripts" / "build-parity-ledger.mjs"

# Dirs at repo root that are never standalone catalog apps.
NON_APP_DIRS = {
    "hub", "shared", "scripts", "docs", "parity", "audit", "courses",
    "node_modules", "__pycache__", ".git", ".github", ".pytest_cache",
}

# Internal app dirs that are intentionally NOT catalogued and NOT reachable as a
# normal page — kept on disk as a deliberate record. Each needs a reason; keep
# this list shrinking, not growing.
EXEMPT_ORPHANS = {
    "webr-pilot": "documented dead-end SharedWorker capability probe "
                  "(README explains the negative result); retained as a record, "
                  "not a live app (commit 0681d74).",
}

INTERNAL_PREFIX = "allmeta/"


# --------------------------------------------------------------------------
# Catalog parsing — entry-by-entry from the next `name:` boundary, so a missing
# folder/path inside one entry is reported rather than silently misaligning a
# naive zip of all-folders vs all-paths.
# --------------------------------------------------------------------------
def parse_catalog() -> list[dict]:
    txt = PROJECTS_JS.read_text(encoding="utf-8", errors="replace")
    name_iter = list(re.finditer(r'\bname:\s*"((?:[^"\\]|\\.)*)"', txt))
    entries = []
    for i, m in enumerate(name_iter):
        start = m.end()
        end = name_iter[i + 1].start() if i + 1 < len(name_iter) else len(txt)
        slab = txt[start:end]
        fm = re.search(r'folder:\s*"([^"]+)"', slab)
        pm = re.search(r'path:\s*"([^"]+)"', slab)
        entries.append({
            "name": m.group(1),
            "folder": fm.group(1) if fm else None,
            "path": pm.group(1) if pm else None,
        })
    return entries


def is_internal(e: dict) -> bool:
    return bool(e["folder"]) and e["folder"].startswith(INTERNAL_PREFIX)


# --------------------------------------------------------------------------
# Reachability — is there any inbound link to `/<dir>/` from a page outside that
# dir? Mirrors the manual recon grep; pure stdlib so it runs in CI.
# --------------------------------------------------------------------------
def _linkable_files() -> list[Path]:
    out = []
    for p in ROOT.rglob("*"):
        if not p.is_file() or p.suffix.lower() not in (".html", ".js"):
            continue
        parts = set(p.relative_to(ROOT).parts)
        if parts & {"node_modules", "__pycache__", ".git", "vendor"}:
            continue
        out.append(p)
    return out


def reachable_dirs(candidate_dirs: set[str], all_files: list[Path]) -> set[str]:
    """Dirs with >=1 inbound link from a file outside that dir."""
    pats = {d: re.compile(r'["\'/]' + re.escape(d) + r'/(?:index\.html)?["\'#]')
            for d in candidate_dirs}
    found: set[str] = set()
    for f in all_files:
        owner = f.relative_to(ROOT).parts[0]
        text = f.read_text(encoding="utf-8", errors="replace")
        for d, pat in pats.items():
            if d == owner or d in found:
                continue
            if pat.search(text):
                found.add(d)
    return found


# --------------------------------------------------------------------------
# Check A — catalog <-> filesystem bijection
# --------------------------------------------------------------------------
def check_catalog_bijection(entries: list[dict]) -> tuple[list[str], list[str]]:
    findings, notes = [], []
    internal = [e for e in entries if is_internal(e)]

    # A1. every catalogued internal path resolves on disk.
    catalog_dirs: set[str] = set()
    for e in internal:
        if not e["path"]:
            findings.append(f"A: catalog entry {e['name']!r} (internal) has no `path:`")
            continue
        rel = e["path"].lstrip("./")
        catalog_dirs.add(rel.split("/")[0])  # top segment, for the A2 orphan set
        target = ROOT / rel  # resolve the FULL path (apps may nest, e.g. r-shiny/<x>/)
        ok = target.is_file() if rel.endswith(".html") else (target / "index.html").is_file()
        if not ok:
            findings.append(
                f"A: catalogued app {e['name']!r} -> {e['path']} does not resolve "
                f"to a shipped page (missing file / index.html)")

    # A2. every shipped app dir is catalogued, reachable, or an exempt pilot.
    disk_apps = {p.name for p in ROOT.iterdir()
                 if p.is_dir() and p.name not in NON_APP_DIRS
                 and not p.name.startswith(".")
                 and (p / "index.html").is_file()}
    uncatalogued = disk_apps - catalog_dirs
    # Resolve the cheap way first; only compute reachability for the remainder.
    to_resolve = {d for d in uncatalogued if d not in EXEMPT_ORPHANS}
    reach = reachable_dirs(to_resolve, _linkable_files()) if to_resolve else set()
    for d in sorted(uncatalogued):
        if d in EXEMPT_ORPHANS:
            notes.append(f"A: {d}/ — exempt non-catalog page ({EXEMPT_ORPHANS[d]})")
        elif d in reach:
            notes.append(f"A: {d}/ — not a catalog card but reachable via an inbound link (OK)")
        else:
            findings.append(
                f"A: shipped app {d}/ is ORPHANED — not in the catalog, not linked "
                f"from any page, and not an exempt pilot. List it in hub/projects.js, "
                f"link it, or add it to EXEMPT_ORPHANS with a reason.")
    notes.append(f"A: {len(internal)} internal + "
                 f"{len(entries) - len(internal)} external catalog entries; "
                 f"{len(disk_apps)} app dirs on disk.")
    return findings, notes


# --------------------------------------------------------------------------
# Check B — declared counts vs actual catalog
# --------------------------------------------------------------------------
def check_declared_counts(entries: list[dict]) -> tuple[list[str], list[str]]:
    findings, notes = [], []
    total = len(entries)
    internal = sum(1 for e in entries if is_internal(e))
    external = total - internal

    rd = README.read_text(encoding="utf-8", errors="replace")
    m = re.search(
        r"hub lists\s+(\d+)\s+catalog entries\s*[—\-–]\s*(\d+)\s+repository-hosted"
        r".*?and\s+(\d+)\s+externally hosted",
        rd, re.S)
    if not m:
        findings.append(
            "B: README's 'hub lists N catalog entries — M repository-hosted ... "
            "and E externally hosted' sentence not found (drifted phrasing?). "
            "Keep it parseable so the counts stay pinned.")
    else:
        rt, rm, re_ = (int(g) for g in m.groups())
        if (rt, rm, re_) != (total, internal, external):
            findings.append(
                f"B: README count drift — README says {rt} entries / {rm} internal "
                f"/ {re_} external; catalog actually has {total} / {internal} / {external}.")
        else:
            notes.append(f"B: README counts pinned ({total}/{internal}/{external}).")

    mf = MANIFEST.read_text(encoding="utf-8", errors="replace")
    fm = re.search(r"(\d+)\+\s*tools", mf)
    if fm:
        floor = int(fm.group(1))
        if internal < floor:
            findings.append(
                f"B: manifest claims '{floor}+ tools' but only {internal} internal "
                f"apps are catalogued — the floor is now a lie.")
        else:
            notes.append(f"B: manifest '{floor}+ tools' floor holds ({internal} internal).")
    return findings, notes


# --------------------------------------------------------------------------
# Check C — parity ledger freshness (modulo the volatile generated date)
# --------------------------------------------------------------------------
def _norm_ledger(text: str) -> str:
    text = text.replace("\r\n", "\n")
    return re.sub(r'"generated":\s*"[^"]*"', '"generated": "<DATE>"', text)


def check_parity_freshness() -> tuple[list[str], list[str]]:
    findings, notes = [], []
    node = shutil.which("node")
    if not node:
        notes.append("C: SKIP — node not on PATH; cannot regenerate the parity "
                     "ledger to check freshness (runs locally / in node-enabled CI).")
        return findings, notes
    if not LEDGER.is_file() or not LEDGER_GEN.is_file():
        findings.append("C: parity ledger or its generator is missing.")
        return findings, notes

    before = LEDGER.read_bytes()
    try:
        proc = subprocess.run([node, str(LEDGER_GEN)], cwd=str(ROOT),
                              capture_output=True, text=True, timeout=120)
        if proc.returncode != 0:
            findings.append(f"C: build-parity-ledger.mjs failed: {proc.stderr.strip()[:200]}")
            return findings, notes
        after = LEDGER.read_bytes()
    finally:
        LEDGER.write_bytes(before)  # restore byte-exact; never leave churn

    if _norm_ledger(before.decode("utf-8", "replace")) != \
       _norm_ledger(after.decode("utf-8", "replace")):
        findings.append(
            "C: parity/parity-ledger.js is STALE — its content differs from a fresh "
            "`node scripts/build-parity-ledger.mjs` (ignoring the generated date). "
            "Regenerate and commit it.")
    else:
        notes.append("C: parity ledger is fresh (content matches the generator, "
                     "modulo its date stamp).")
    return findings, notes


def main(argv: list[str]) -> int:
    report = "--report" in argv
    entries = parse_catalog()

    findings: list[str] = []
    notes: list[str] = []
    for fn in (lambda: check_catalog_bijection(entries),
               lambda: check_declared_counts(entries),
               check_parity_freshness):
        f, n = fn()
        findings += f
        notes += n

    if notes:
        print("drift_sweep: context —")
        for n in notes:
            print("  ~ " + n)
        print()

    if findings:
        print(f"drift_sweep: {len(findings)} drift finding(s):\n")
        for f in findings:
            print("  " + f)
        if report:
            print("\n(--report mode: exit 0)")
            return 0
        print("\nFAIL — claim/code drift detected. Fix the source of truth above.")
        return 1

    print("drift_sweep: OK — catalog, declared counts, and parity ledger all in sync.")
    return 0


if __name__ == "__main__":
    # Windows console is cp1252; app names / em-dashes need UTF-8. Done here (not
    # at import) so importing the module under pytest can't corrupt capture.
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    raise SystemExit(main(sys.argv[1:]))
