"""The PMID→NCT link layer (Phase 2) — AUTHORITATIVE, reference_type-filtered.

An OA meta's reference list IS (a superset of) its included-study list. BioC exposes
each reference as a REF passage carrying `<infon key="pub-id_pmid">`, so the cited
PMIDs come for free — no author-year fuzzy matching, no "accept first PubMed hit"
(whose FP rate was measured at 50% in the reconstruction loop).

## Why reference_type is not optional (measured root cause)

AACT's `study_references` carries a type per NCT↔PMID edge:

    DERIVED    - PubMed-derived: this PMID reports this trial      -> a REAL link
    RESULT     - a results publication of this trial               -> a REAL link
    BACKGROUND - the trial CITES this paper as background          -> NOT a link

**68% of the crosswalk is BACKGROUND** (744,555 of 1,087,352 rows; 511,402 distinct
PMIDs). A famous background paper — e.g. Huang 2020 COVID (PMID 31986264), cited as
BACKGROUND by hundreds of trials — otherwise maps to every NCT that cited it, so any
meta citing it inherits hundreds of FALSE trial links. Measured effect of filtering:

    ALL types        755,399 pmids   multi-NCT 18.6%   worst fan-out 301
    DERIVED+RESULT   294,480 pmids   multi-NCT  8.2%   worst fan-out 119

The derived `pico-map/aact_pmid_index.sqlite` is the ALL-types crosswalk, so it
over-links. It is retained only as a fallback and is flagged as `contaminated` when
used — never silently.

## Honesty boundary (do NOT overclaim)

Even filtered, this yields **cited trials**, not **included studies**: a review's
reference list contains background citations of its own. `cites_registry_linked_trial`
is therefore necessary-but-not-sufficient for mirror-readiness; the included-set comes
from the included-studies table (Phase 4).
"""
from __future__ import annotations

import os
import sqlite3

import config as C

REAL_LINK_TYPES = ("DERIVED", "RESULT")

_SQLITE_CANDIDATES = [
    os.environ.get("OA68K_PMID_NCT", ""),
    r"C:\Projects\pico-map\build\aact_pmid_index.sqlite",
]


def find_sqlite_index() -> str | None:
    for c in _SQLITE_CANDIDATES:
        if c and os.path.isfile(c):
            return c
    return None


class LinkMap:
    """PMID -> {NCT}, loaded once into a dict for O(1) lookup in the detect loop.

    source='aact_study_references' (authoritative, type-filtered) when the converted
    parquet is present; else 'pico_map_sqlite' with contaminated=True.
    """

    def __init__(self, path: str | None = None, strict: bool = True):
        self.map: dict[str, set[str]] = {}
        self.contaminated = False
        self.source = None
        ext = C.ext_table("study_references")
        if ext and not path:
            self._load_aact(ext, strict)
        else:
            p = path or find_sqlite_index()
            if not p:
                raise FileNotFoundError(
                    "No PMID->NCT source. Run `python aact_ext.py --only "
                    "study_references`, or set OA68K_PMID_NCT to the pico-map sqlite.")
            self._load_sqlite(p)

    def _load_aact(self, parquet: str, strict: bool) -> None:
        import duckdb
        con = duckdb.connect()
        where = ("WHERE pmid IS NOT NULL AND reference_type IN "
                 f"({','.join(repr(t) for t in REAL_LINK_TYPES)})") if strict \
            else "WHERE pmid IS NOT NULL"
        q = (f"SELECT pmid, nct_id FROM read_parquet('{parquet.replace(os.sep,'/')}') "
             f"{where}")
        for pmid, nct in con.execute(q).fetchall():
            self.map.setdefault(str(pmid).strip(), set()).add(str(nct).strip())
        con.close()
        self.source = "aact_study_references"
        self.contaminated = not strict
        self.strict = strict

    def _load_sqlite(self, path: str) -> None:
        con = sqlite3.connect(path)
        for nct, pmid in con.execute("SELECT nct_id, pmid FROM pmid_nct"):
            if pmid is None or nct is None:
                continue
            self.map.setdefault(str(pmid), set()).add(str(nct))
        con.close()
        self.source = "pico_map_sqlite"
        self.contaminated = True   # ALL-types crosswalk: includes BACKGROUND edges
        self.strict = False

    def __len__(self) -> int:
        return len(self.map)

    def ncts_for(self, pmids) -> set[str]:
        out: set[str] = set()
        for p in pmids:
            out |= self.map.get(str(p), set())
        return out

    def describe(self) -> str:
        tag = "CONTAMINATED (includes BACKGROUND edges)" if self.contaminated \
            else "type-filtered DERIVED+RESULT"
        return f"{len(self):,} PMIDs from {self.source} [{tag}]"
