#!/usr/bin/env python
"""Citation grounding gate — DOI-resolve every claimed citation (Phase 1c).

The "principles of truth" applied to references: a shipped citation a user will
copy into a manuscript (via the "Cite as" button) must point at a REAL paper
whose title matches what we claim. Our own lessons put LLM/hand-authored
citations at ~4% misattribution and ~1% fabrication, and a prior incident
(MAPriors) silently swapped seminal references for unrelated ones — wrong
citations are worse than wrong code on a submission-grade tool.

Source of truth scanned: shared/citation.js — the canonical CITATIONS registry
mapping each app to its method papers (Vancouver + BibTeX, DOI embedded). Every
DOI there is a genuine claimed citation (unlike DOIs in app HTML, which may be
example *input* data, e.g. citation-dedup's placeholder CSV).

Two layers:
  * resolve  — fetch Crossref metadata for each DOI, cache it offline in
               shared/citations.cache.json (committed, so the gate is network-
               free in CI), and flag any DOI whose resolved title does NOT
               overlap the claimed Vancouver string (a swap/fabrication signal).
  * gate     — default mode: every claimed DOI must be present in the cache and
               pass the title-overlap check. Fails closed (exit 1) otherwise.

Usage:
  python scripts/ground_citations.py            # offline gate (CI)
  python scripts/ground_citations.py --resolve  # fetch missing DOIs into cache
  python scripts/ground_citations.py --refresh  # re-fetch ALL DOIs
  python scripts/ground_citations.py --report   # list findings, exit 0
"""
from __future__ import annotations

import io
import json
import re
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CITATION_JS = ROOT / "shared" / "citation.js"
CACHE = ROOT / "shared" / "citations.cache.json"

# DOI capture. The Vancouver string is a clean JS string literal with the DOI at
# the end, so capture to whitespace — this preserves old Wiley SICI DOIs that
# legitimately contain angle brackets, e.g.
#   10.1002/(SICI)1097-0258(19961230)15:24<2733::AID-SIM562>3.0.CO;2-0
# (a naive [^<>]+ class truncates these and they then 404). Trailing sentence
# punctuation ("doi:10.x/y.") is trimmed before validation.
DOI_RE = re.compile(r"doi:\s*(10\.\d{4,9}/\S+)", re.I)
DOI_VALID = re.compile(r"^10\.\d{4,9}/\S+$")
VANCOUVER_RE = re.compile(r'vancouver:\s*"((?:[^"\\]|\\.)*)"')

_STOP = {
    "a", "an", "the", "of", "in", "for", "with", "and", "on", "to", "from",
    "by", "as", "at", "via", "using", "a", "study", "studies", "analysis",
    "meta", "metaanalysis", "data", "method", "methods", "model", "models",
}
TITLE_OVERLAP_MIN = 0.60  # fraction of resolved-title content words present


def _words(text: str) -> set[str]:
    toks = re.sub(r"[^a-z0-9]+", " ", (text or "").lower()).split()
    return {t for t in toks if len(t) >= 3 and t not in _STOP}


def _trim_doi(raw: str) -> str:
    return raw.rstrip(".,;)]}").strip()


def extract_claimed() -> list[dict]:
    """Every (doi, vancouver) claimed in shared/citation.js."""
    text = CITATION_JS.read_text(encoding="utf-8", errors="replace")
    out: list[dict] = []
    for m in VANCOUVER_RE.finditer(text):
        van = m.group(1)
        dm = DOI_RE.search(van)
        if not dm:
            continue  # not every cite carries a DOI (books, software) — skip
        out.append({"doi": _trim_doi(dm.group(1)), "vancouver": van})
    return out


def load_cache() -> dict:
    if CACHE.is_file():
        try:
            return json.loads(CACHE.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def save_cache(cache: dict) -> None:
    CACHE.write_text(json.dumps(cache, indent=2, ensure_ascii=False, sort_keys=True) + "\n",
                     encoding="utf-8")


def resolve_crossref(doi: str) -> dict | None:
    """Fetch Crossref metadata. Returns {title, container, year} or None (404/err)."""
    url = "https://api.crossref.org/works/" + urllib.request.quote(doi, safe="")
    req = urllib.request.Request(url, headers={
        # Crossref "polite pool" — identify the client.
        "User-Agent": "allmeta-citation-grounding/1.0 (https://github.com/mahmood726-cyber/allmeta; mailto:mahmood726@gmail.com)",
    })
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            msg = json.load(r).get("message", {})
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise
    title = (msg.get("title") or [""])[0]
    container = (msg.get("container-title") or [""])[0]
    year = None
    for k in ("published-print", "published-online", "issued"):
        parts = (msg.get(k) or {}).get("date-parts") or [[None]]
        if parts and parts[0] and parts[0][0]:
            year = parts[0][0]
            break
    return {"title": title, "container": container, "year": year,
            "source": "crossref"}


def title_overlap(resolved_title: str, vancouver: str) -> float:
    rt = _words(resolved_title)
    if not rt:
        return 0.0
    van = _words(vancouver)
    return len(rt & van) / len(rt)


def main(argv: list[str]) -> int:
    report = "--report" in argv
    do_resolve = "--resolve" in argv or "--refresh" in argv
    refresh = "--refresh" in argv

    claimed = extract_claimed()
    cache = load_cache()
    by_doi: dict[str, str] = {}
    for c in claimed:
        by_doi.setdefault(c["doi"], c["vancouver"])

    # ---- resolve layer (network) ----
    if do_resolve:
        fetched = 0
        for doi in sorted(by_doi):
            if not refresh and doi in cache and cache[doi].get("title"):
                continue
            meta = resolve_crossref(doi)
            time.sleep(0.2)  # be gentle on the API
            if meta is None:
                cache[doi] = {"title": None, "unresolved": True, "source": "crossref"}
            else:
                cache[doi] = meta
            fetched += 1
            print(f"  resolved {doi} -> {(meta or {}).get('title', 'UNRESOLVED')!s:.70}")
        # Prune cache entries no longer claimed anywhere — stale wrong DOIs must
        # not linger (they are exactly the forgery templates a fix removes).
        pruned = [d for d in cache if d not in by_doi]
        for d in pruned:
            del cache[d]
        save_cache(cache)
        print(f"ground_citations: resolved {fetched}, pruned {len(pruned)} stale; "
              f"cache has {len(cache)} entries.\n")

    # ---- gate layer (offline) ----
    bad_syntax, missing, unresolved, mismatch = [], [], [], []
    for doi in sorted(by_doi):
        van = by_doi[doi]
        if not DOI_VALID.match(doi):
            bad_syntax.append(doi)
            continue
        entry = cache.get(doi)
        if entry is None:
            missing.append(doi)
            continue
        if entry.get("unresolved") or not entry.get("title"):
            unresolved.append(doi)
            continue
        ov = title_overlap(entry["title"], van)
        if ov < TITLE_OVERLAP_MIN:
            mismatch.append((doi, round(ov, 2), entry["title"]))

    total = len(by_doi)
    findings = []
    for d in bad_syntax:
        findings.append(f"  BAD-SYNTAX  {d}  (not a valid DOI)")
    for d in missing:
        findings.append(f"  UNGROUNDED  {d}  (not in cache — run --resolve)")
    for d in unresolved:
        findings.append(f"  UNRESOLVED  {d}  (Crossref 404 — fabricated or wrong DOI?)")
    for d, ov, title in mismatch:
        findings.append(f"  TITLE-MISMATCH  {d}  overlap={ov}  resolved=\"{title[:70]}\"")

    if findings:
        print(f"ground_citations: {len(findings)} issue(s) across {total} claimed DOI(s):\n")
        print("\n".join(findings))
        if report:
            print("\n(--report mode: exit 0)")
            return 0
        print("\nFAIL — every claimed citation must DOI-resolve with a matching title. "
              "Fix the citation or DOI in shared/citation.js, then re-run --resolve.")
        return 1

    print(f"ground_citations: OK — {total} claimed DOI(s) grounded "
          f"(cache: {len(cache)} entries, title-overlap >= {TITLE_OVERLAP_MIN}).")
    return 0


if __name__ == "__main__":
    # Windows console is cp1252; citation/journal titles carry en-dashes and
    # accents, so force UTF-8 stdout (lessons.md). Done HERE, not at import time,
    # so importing the module (tests) can't corrupt pytest's capture machinery.
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    raise SystemExit(main(sys.argv[1:]))
