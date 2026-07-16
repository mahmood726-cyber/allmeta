"""BENDLINK — link a forest-plot inclusion to the trial's OWN registry record.

MAHMOOD (2026-07-16): the three-way instrument is
    (1) what the meta SAYS its criteria are   [methods text  -> stated.py]
  x (2) what it ACTUALLY included             [forest plot   -> behaviour.py]
  x (3) what those trials ACTUALLY ARE        [CT.gov/AACT   -> THIS MODULE]

Layer (3) is the new use of CT.gov: not a data source, but an INDEPENDENT
CHARACTERISER of trials that somebody else chose to include. The registry never
saw the meta-analysis, so it cannot be argued with.

THE CHAIN, and it is only as strong as its weakest hop:

    forest label ("G H Koek 2003")
      -> that meta's OWN reference list      (JATS <ref>, surname+year match)
      -> PMID                                (<pub-id pub-id-type="pmid">)
      -> NCT                                 (AACT study_references, DERIVED|RESULT)
      -> phase / allocation / masking / N    (AACT trials store)

EVERY HOP LOSES ROWS AND THE LOSS IS REPORTED, NEVER IMPUTED. A label that does
not link is `unlinked`, not `no bend`. Treating unlinked as clean would build the
bias we are trying to measure straight into the instrument: old, small, obscure
and non-Western trials are exactly the ones that fail to link AND exactly the
ones a bend would use. `bendlink` therefore reports linkage as a COVERAGE
statistic and refuses to compute a bend rate over unlinked rows.

WHY reference_type MATTERS (this is the direction trap):
    DERIVED / RESULT  = publications OF this trial          <- what we want
    BACKGROUND        = papers this trial CITED             <- WRONG DIRECTION
A BACKGROUND match would link a meta's reference to any trial that happened to
cite it, which is not a trial-identity link at all. 744,555 of the 1,087,352
study_references rows are BACKGROUND -> using them would inflate linkage ~3x
with garbage. Only DERIVED|RESULT are used.

ROLE TAG: everything here is BEHAVIOURAL_RECORD. We are characterising a REVIEW's
conduct, not recovering a trial's data. No number from this module may enter a
recovery numerator (`reproduce-then-perturb`).

Run:  python bendlink.py            # measure the chain, report yield per hop
"""
from __future__ import annotations

import glob
import json
import os
import re
import sys
import unicodedata
from collections import Counter

import pandas as pd

VERSION = "bendlink/1.0@2026-07-16"

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
CACHE = os.path.join(DATA, "cache")
AACT_EXT = os.path.join(DATA, "aact_ext")
TRIALS = os.path.join(DATA, "store", "trials")

# A 4-digit year, anchored so it cannot backtrack (ReDoS rule).
_YEAR = re.compile(r"\b(19[5-9]\d|20[0-4]\d)\b")
_REF = re.compile(r"<ref\b.*?</ref>", re.S)
_SURNAME = re.compile(r"<surname[^>]*>(.*?)</surname>", re.S)
_PMID = re.compile(r'<pub-id[^>]*pub-id-type="pmid"[^>]*>\s*(\d+)\s*</pub-id>', re.S)
_REFYEAR = re.compile(r"<year[^>]*>\s*(\d{4})", re.S)
_TAG = re.compile(r"<[^>]+>")


def _fold(s: str) -> str:
    """Accent-fold to ASCII: 'Kyllonen' <- 'Kyllönen', 'Guzman' <- 'Guzmán'.

    NFKD splits a letter from its combining accent, then the Mn (nonspacing
    mark) drop removes the accent and KEEPS the letter. This must happen BEFORE
    any [A-Za-z] filtering: dropping non-ASCII first SEVERS the surname at the
    accent -- 'Kyllönen' became tokens ['Kyll','nen'] and the label matched on
    'nen', which matches nothing. Non-Anglophone surnames are exactly the rows a
    selection-bias instrument cannot afford to lose.
    """
    s = _TAG.sub("", s or "")
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return s


def _clean(s: str) -> str:
    """Fold accents, drop non-alpha, casefold. Comparison key for surnames."""
    return re.sub(r"[^A-Za-z]", "", _fold(s)).casefold()


def parse_refs(pmcid: str) -> list[dict]:
    """Reference list of ONE meta, from its own JATS. Returns surnames, year, pmid."""
    p = os.path.join(CACHE, f"{pmcid}.xml")
    if not os.path.exists(p):
        return []
    t = open(p, encoding="utf-8", errors="replace").read()
    out = []
    for r in _REF.finditer(t):
        blk = r.group(0)
        pm = _PMID.search(blk)
        yr = _REFYEAR.search(blk)
        out.append({
            "surnames": [_clean(s) for s in _SURNAME.findall(blk)],
            "year": int(yr.group(1)) if yr else None,
            "pmid": pm.group(1) if pm else None,
        })
    return out


def label_key(label: str) -> tuple[str | None, int | None]:
    """A forest label -> (surname, year).

    Templates vary: 'Koek 2003', 'G H Koek 2003', 'Koek et al. 2003',
    'Koek 2003a'. The surname is taken as the LAST alphabetic token before the
    year, which is correct for all of these. 'et al' is dropped explicitly --
    without that, 'Koek et al 2003' yields surname 'al'.
    """
    if not label:
        return None, None
    label = _fold(label)  # MUST precede tokenising -- see _fold docstring
    m = _YEAR.search(label)
    yr = int(m.group(1)) if m else None
    head = label[: m.start()] if m else label
    toks = [t for t in re.findall(r"[A-Za-z][A-Za-z'\-]*", head)]
    toks = [t for t in toks if t.casefold() not in {"et", "al", "and", "the"}]
    # single-letter tokens are initials, not surnames
    toks = [t for t in toks if len(t) > 1]
    return (_clean(toks[-1]) if toks else None), yr


def match_ref(surname, year, refs, year_slack=1):
    """Match a forest label to a ref in the SAME meta's reference list.

    Match = surname appears among the ref's authors AND the year is within
    `year_slack`. Slack of 1 absorbs the real and common online-first/issue-year
    split (plot says 2016, ref says 2015). Slack is NOT widened beyond 1: at 2+
    the surname alone starts carrying the match and distinct trials by the same
    group collide.

    Returns (ref, n_candidates). n_candidates > 1 is an AMBIGUOUS match and the
    caller must drop it -- picking the first would silently fabricate a link.
    """
    if not surname:
        return None, 0
    cands = []
    for r in refs:
        if surname not in r["surnames"]:
            continue
        if year is not None and r["year"] is not None:
            if abs(r["year"] - year) > year_slack:
                continue
        cands.append(r)
    if len(cands) == 1:
        return cands[0], 1
    return None, len(cands)


def load_pmid2nct() -> dict[str, list[str]]:
    """PMID -> NCT, from AACT study_references. DERIVED|RESULT only (see docstring)."""
    p = os.path.join(AACT_EXT, "study_references.parquet")
    d = pd.read_parquet(p, columns=["nct_id", "pmid", "reference_type"])
    d = d[d["reference_type"].isin(["DERIVED", "RESULT"])]
    d = d[d["pmid"].notna()]
    m: dict[str, list[str]] = {}
    for pmid, nct in zip(d["pmid"].astype(str), d["nct_id"].astype(str)):
        m.setdefault(pmid, []).append(nct)
    return m


def load_trials() -> pd.DataFrame:
    fs = sorted(glob.glob(os.path.join(TRIALS, "*.parquet")))
    cols = ["nct_id", "study_type", "allocation", "intervention_model", "masking",
            "phase", "enrollment", "overall_status", "conditions", "brief_title",
            "lead_sponsor", "lead_sponsor_class", "start_date"]
    return pd.concat([pd.read_parquet(f, columns=cols) for f in fs], ignore_index=True)


def main():
    recs = json.load(open(os.path.join(DATA, "behaviour.json"), encoding="utf-8"))
    pmcids = sorted({r["pmcid"] for r in recs})

    print(f"=== BENDLINK {VERSION} ===")
    print(f"metas {len(pmcids)}  figures {len(recs)}")

    print("loading AACT pmid->nct (DERIVED|RESULT only) ...", flush=True)
    p2n = load_pmid2nct()
    print(f"  pmid->nct map: {len(p2n):,} pmids")
    print("loading AACT trials store ...", flush=True)
    tr = load_trials()
    tr = tr.drop_duplicates("nct_id").set_index("nct_id")
    print(f"  trials: {len(tr):,}")

    refs_by = {p: parse_refs(p) for p in pmcids}

    rows = []
    hop = Counter()
    for r in recs:
        pmcid = r["pmcid"]
        refs = refs_by.get(pmcid, [])
        for t in r.get("trials", []):
            hop["inclusions"] += 1
            sn, yr = label_key(t.get("label"))
            if not sn:
                hop["no_surname"] += 1
                continue
            hop["surname_parsed"] += 1
            ref, ncand = match_ref(sn, yr if yr else t.get("year"), refs)
            if ref is None:
                hop["ambiguous_ref" if ncand > 1 else "no_ref_match"] += 1
                continue
            hop["ref_matched"] += 1
            pmid = ref.get("pmid")
            if not pmid:
                hop["ref_no_pmid"] += 1
                continue
            hop["pmid"] += 1
            ncts = p2n.get(str(pmid))
            if not ncts:
                hop["pmid_no_nct"] += 1
                continue
            hop["nct" if len(set(ncts)) == 1 else "nct_multi"] += 1
            nct = sorted(set(ncts))[0]
            if len(set(ncts)) > 1:
                continue  # ambiguous trial identity -> drop, never guess
            if nct not in tr.index:
                hop["nct_not_in_store"] += 1
                continue
            hop["characterised"] += 1
            row = tr.loc[nct]
            rows.append({
                "pmcid": pmcid, "figure": os.path.basename(r.get("image_path", "")),
                "label": t.get("label"), "plot_year": t.get("year"),
                "weight_pct": t.get("weight_pct"), "subgroup": t.get("subgroup"),
                "pmid": pmid, "nct_id": nct,
                "study_type": row["study_type"], "allocation": row["allocation"],
                "intervention_model": row["intervention_model"], "masking": row["masking"],
                "phase": row["phase"], "enrollment": row["enrollment"],
                "conditions": row["conditions"], "lead_sponsor": row["lead_sponsor"],
                "lead_sponsor_class": row["lead_sponsor_class"],
                "start_date": str(row["start_date"]),
                "role": "BEHAVIOURAL_RECORD", "version": VERSION,
            })

    print("\n=== CHAIN YIELD (every hop, losses reported not imputed) ===")
    n = hop["inclusions"]
    for k in ["inclusions", "surname_parsed", "no_surname", "ref_matched",
              "ambiguous_ref", "no_ref_match", "pmid", "ref_no_pmid",
              "nct", "nct_multi", "pmid_no_nct", "characterised", "nct_not_in_store"]:
        v = hop.get(k, 0)
        print(f"  {k:22s} {v:5d}  {100*v/n:5.1f}%")

    out = os.path.join(DATA, "bendlink.json")
    json.dump(rows, open(out, "w", encoding="utf-8"), indent=1)
    print(f"\nlinked+characterised rows: {len(rows)}")
    print(f"wrote: {out}")

    if rows:
        d = pd.DataFrame(rows)
        print("\n=== WHAT THE REGISTRY SAYS THESE INCLUDED TRIALS ARE ===")
        for c in ["study_type", "allocation", "masking", "phase", "intervention_model"]:
            print(f"\n-- {c}")
            print(d[c].fillna("(null)").value_counts().to_string())


if __name__ == "__main__":
    main()
