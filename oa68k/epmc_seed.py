"""Parameterised Europe PMC corpus seeder (cursorMark, resumable).

`ingest.py` already does this for the one 68k meta corpus, but its query, seed
path and state path are module constants. Rather than refactor a stage the other
lane is actively running, this generalises the same proven pattern — cursorMark
paging, fsync'd atomic checkpoint after every page, resume from the saved cursor,
never hold the corpus in RAM — into a function any corpus can call.

CORPUS DEFINITIONS (each is live-reproducible; the hitCount is a probe, not a
claim, and drift between probe and crawl is recorded rather than hidden):

  DTA_QUERY      11,755 (probe 2026-07-16) — MeSH "Sensitivity and Specificity"
                 is the standard diagnostic-accuracy filter (the core of the
                 Cochrane DTA search filter).
  OA_RCT_QUERY  105,402 (probe 2026-07-16) — OA full-text RCT reports. This
                 deliberately overlaps the registry-linked set; the value is the
                 REMAINDER: trials that were never registered, or whose paper
                 carries no NCT, which the registry layer cannot see at all.

A NOTE ON EPMC FIELD SYNTAX — a measured trap. `MESH_TERMS:"Malaria"` returns
hitCount=0. It is not a valid field, and EPMC does NOT error on an unknown field:
it silently returns zero. A corpus seeded on it would come back empty and look
like "there are no such papers" rather than "the query is wrong". Always probe a
new field against a known-populated term before trusting a zero. Also note
`MESH:"Malaria"` is the EXACT descriptor and is NOT exploded — it returns 8,410
while free-text malaria returns 253,259, because it excludes "Malaria,
Falciparum" and friends. Use MeSH for precision, free text for recall; do not
assume either is "the" count.
"""
from __future__ import annotations

import json
import os

import config as C
from net import PoliteSession, append_jsonl, atomic_write_json, load_done_keys

PAGE = 1000  # EPMC max pageSize

DTA_QUERY = ('(SRC:MED) AND (OPEN_ACCESS:y) AND (HAS_FT:y) AND '
             '(MESH:"Sensitivity and Specificity")')

OA_RCT_QUERY = ('(SRC:MED) AND (OPEN_ACCESS:y) AND (HAS_FT:y) AND '
                '(PUB_TYPE:"Randomized Controlled Trial")')

# Free-text disease terms for priority ordering. Free text, not MeSH, precisely
# because MeSH here is unexploded and would drop Malaria, Falciparum etc.
PRIORITY_TERMS = ("malaria", "plasmodium", "tuberculosis", " tb ", "hiv",
                  "aids", "antiretroviral")


def seed_path(corpus: str) -> str:
    return os.path.join(C.DATA, f"seed_{corpus}.jsonl")


def state_path(corpus: str) -> str:
    return os.path.join(C.DATA, f"seed_{corpus}_state.json")


def _row(r: dict, corpus: str) -> dict:
    title = (r.get("title") or "")
    abstract = r.get("abstractText") or ""
    hay = (title + " " + abstract).lower()
    return {
        "pmid": r.get("pmid") or r.get("id"),
        "pmcid": r.get("pmcid"),
        "doi": (r.get("doi") or "").lower() or None,
        "source": r.get("source"),
        "year": r.get("pubYear"),
        "isOA": r.get("isOpenAccess") == "Y",
        "inPMC": r.get("inPMC") == "Y",
        "hasPDF": r.get("hasPDF") == "Y",
        "license": r.get("license"),
        "title": title[:300],
        "corpus": corpus,
        "priority": any(t.strip() in hay for t in PRIORITY_TERMS),
        "source_tier": "oa_fulltext",
        "locator": f"https://europepmc.org/article/MED/{r.get('pmid')}",
    }


def seed(corpus: str, query: str, max_rows: int | None = None) -> dict:
    """Page `query` into seed_<corpus>.jsonl. Idempotent; resumes on cursorMark."""
    C.ensure_dirs()
    sp, stp = seed_path(corpus), state_path(corpus)
    sess = PoliteSession()

    cursor, written = "*", 0
    if os.path.exists(stp) and os.path.exists(sp):
        st = json.load(open(stp, encoding="utf-8"))
        if st.get("complete"):
            print(f"[seed:{corpus}] already complete: {st.get('written')} rows")
            return st
        cursor = st.get("next_cursor", "*")
        written = st.get("written", 0)
        print(f"[seed:{corpus}] resuming ({written} rows so far)")

    hit_count = None
    while True:
        r = sess.get(C.EPMC_SEARCH, params={
            "query": query, "format": "json", "pageSize": PAGE,
            "cursorMark": cursor, "resultType": "core"})
        j = r.json()
        if hit_count is None:
            hit_count = j.get("hitCount")
            print(f"[seed:{corpus}] hitCount={hit_count:,}", flush=True)
            if not hit_count:
                # A zero hitCount is far more often a bad field name than an
                # empty corpus (MESH_TERMS: silently returns 0). Fail loud.
                raise ValueError(
                    f"query returned hitCount=0 — verify field syntax before "
                    f"trusting this as an empty corpus: {query}")
        results = j.get("resultList", {}).get("result", [])
        if not results:
            # An empty page IS the end of the corpus, so it must be checkpointed
            # as complete. Breaking straight out (the obvious way to write this)
            # leaves complete=false on disk forever: every later resume re-fetches
            # this same empty page and exits, so the corpus can never be declared
            # done and a scheduler would re-probe it on every firing.
            atomic_write_json(stp, {"corpus": corpus, "query": query,
                                    "hit_count": hit_count, "written": written,
                                    "next_cursor": cursor, "complete": True})
            break
        for res in results:
            append_jsonl(sp, _row(res, corpus))
            written += 1
            if max_rows and written >= max_rows:
                break
        nxt = j.get("nextCursorMark")
        # `complete` means THE CORPUS IS EXHAUSTED — never merely "this run
        # stopped". Hitting --max is a bounded run, not a finished corpus, and
        # marking it complete would make the next full run short-circuit on the
        # "already complete" check and silently never fetch the remainder.
        # Observed: oa_rct wrote 40,000 of hit_count=105,402 and recorded
        # complete=true — 65,402 rows would have been unreachable forever. Same
        # family as the empty-page bug fixed above: a flag that says "done" when
        # it means "stopped".
        exhausted = (not nxt or nxt == cursor)
        capped = bool(max_rows and written >= max_rows)
        atomic_write_json(stp, {"corpus": corpus, "query": query,
                                "hit_count": hit_count, "written": written,
                                "next_cursor": nxt or cursor,
                                "complete": bool(exhausted),
                                "stopped_at_max": capped and not exhausted})
        print(f"[seed:{corpus}] {written}/{hit_count} rows", flush=True)
        if exhausted or capped:
            break
        cursor = nxt

    st = json.load(open(stp, encoding="utf-8"))
    drift = (st.get("hit_count") or 0) - st.get("written", 0)
    if drift:
        # Index drift between probe and crawl is normal and is RECORDED, never
        # silently reconciled — the 68k lane logs the same (67,759 vs 67,771).
        print(f"[seed:{corpus}] index drift: hitCount={st['hit_count']} "
              f"crawled={st['written']} (delta {drift})")
    print(f"[seed:{corpus}] DONE: {st['written']} rows -> {sp}")
    return st


def load_seed(corpus: str, priority_first: bool = True) -> list[dict]:
    """Seed rows with a PMCID (harvestable), priority cohort first."""
    sp = seed_path(corpus)
    if not os.path.exists(sp):
        raise FileNotFoundError(f"no seed for '{corpus}' — run epmc_seed.py first")
    rows = []
    seen = set()
    with open(sp, encoding="utf-8") as f:
        for ln in f:
            if not ln.strip():
                continue
            r = json.loads(ln)
            pmcid = r.get("pmcid")
            if not pmcid or pmcid in seen:
                continue          # no PMCID => no OA full text to harvest
            seen.add(pmcid)
            rows.append(r)
    if priority_first:
        rows.sort(key=lambda r: (0 if r.get("priority") else 1,
                                 int(r.get("pmid") or 0)))
    return rows


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("corpus", choices=["dta", "oa_rct"])
    ap.add_argument("--max", type=int, default=None)
    a = ap.parse_args()
    q = DTA_QUERY if a.corpus == "dta" else OA_RCT_QUERY
    print(json.dumps(seed(a.corpus, q, a.max), indent=2))
