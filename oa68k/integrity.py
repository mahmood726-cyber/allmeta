"""Stage R2 — trial-integrity signals: Retraction Watch + Crossref/OpenAlex.

Feeds two things: the fraud/integrity detector, and the answer key's NEGATIVE set
(a retracted trial is a known-bad label you cannot get any other way).

SOURCES — all openly licensed, all probed 2026-07-16:

  Retraction Watch  Crossref publishes the full RW database as open data
                    (CC0 via the Crossref/RW agreement). 65 MB CSV, one download.
                    Carries OriginalPaperPubMedID + OriginalPaperDOI, which is
                    exactly the join key into our PMID crosswalk -> NCT -> trial.
                    api.labs.crossref.org/data/retractionwatch also serves it.
  Crossref REST     184,542,499 works indexed; 73,610 carry update-type:retraction.
                    Open API, polite pool via mailto. No key.
  OpenAlex          319,662,677 works; 74,193 flagged is_retracted:true.
                    CC0. Open API, polite pool via mailto. No key.

Why all three rather than one: they disagree. RW is curated and carries the
REASON; Crossref sees the publisher's retraction notice; OpenAlex carries a
derived flag. Treating any one as ground truth would silently inherit its
coverage gaps, so we record each source's verdict separately and never collapse
them into a single "retracted" boolean. Disagreement is a signal, not noise.

Run:  python integrity.py --retraction-watch
      python integrity.py --link
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import os
from datetime import date

import config as C
from net import PoliteSession

INTEGRITY_DIR = os.path.join(C.STORE, "integrity")

# Crossref's open mirror of the Retraction Watch database.
RW_CSV = ("https://gitlab.com/crossref/retraction-watch-data/-/raw/main/"
          "retraction_watch.csv")
RW_LABS = "https://api.labs.crossref.org/data/retractionwatch"


def _norm_doi(d: str | None) -> str | None:
    if not d:
        return None
    d = d.strip().lower()
    for pre in ("https://doi.org/", "http://doi.org/", "doi:"):
        if d.startswith(pre):
            d = d[len(pre):]
    return d or None


def _norm_pmid(p: str | None) -> str | None:
    if not p:
        return None
    p = p.strip()
    # RW writes 0 for "no PMID" — a zero PMID is absence, not a record.
    return p if (p.isdigit() and p != "0") else None


def retraction_watch() -> dict:
    """One download of the open RW database -> parquet."""
    import pyarrow as pa
    import pyarrow.parquet as pq

    os.makedirs(INTEGRITY_DIR, exist_ok=True)
    sess = PoliteSession(min_interval=1.0, timeout=300)
    r = sess.get(RW_CSV)
    if r.status_code != 200 or len(r.content) < 1_000_000:
        raise RuntimeError(f"Retraction Watch fetch failed ({r.status_code}, "
                           f"{len(r.content)}B) — refusing a partial ingest")
    text = r.content.decode("utf-8", "replace")
    rows = list(csv.DictReader(io.StringIO(text)))
    today = date.today().isoformat()

    out = []
    for x in rows:
        opmid = _norm_pmid(x.get("OriginalPaperPubMedID"))
        out.append({
            "record_id": x.get("Record ID"),
            "title": (x.get("Title") or "")[:400],
            "journal": x.get("Journal"),
            "publisher": x.get("Publisher"),
            "country": x.get("Country"),
            "subject": x.get("Subject"),
            "article_type": x.get("ArticleType"),
            "reason": (x.get("Reason") or "")[:400],
            "retraction_nature": x.get("RetractionNature"),
            "retraction_date": x.get("RetractionDate"),
            "original_pmid": opmid,
            "original_doi": _norm_doi(x.get("OriginalPaperDOI")),
            "retraction_doi": _norm_doi(x.get("RetractionDOI")),
            "retraction_pmid": _norm_pmid(x.get("RetractionPubMedID")),
            "source_tier": "integrity",
            "source": "Retraction Watch (open via Crossref)",
            "licence": "CC0 (Crossref/Retraction Watch open release)",
            "locator": RW_LABS,
            "extracted_at": today,
        })
    dst = os.path.join(INTEGRITY_DIR, "retraction_watch.parquet")
    tmp = dst + ".tmp"
    pq.write_table(pa.Table.from_pylist(out), tmp, compression="zstd")
    os.replace(tmp, dst)

    res = {"rows": len(out),
           "with_original_pmid": sum(1 for x in out if x["original_pmid"]),
           "with_original_doi": sum(1 for x in out if x["original_doi"]),
           "retraction_nature": {},
           "licence": "CC0", "path": dst}
    for x in out:
        k = x["retraction_nature"] or "?"
        res["retraction_nature"][k] = res["retraction_nature"].get(k, 0) + 1
    print(f"[integrity:rw] {json.dumps(res, indent=2)[:900]}")
    return res


def link() -> dict:
    """Join retractions onto OUR trials, through the PMID crosswalk.

    Chain: RW.original_pmid -> papers.pmid -> trial_refs(DERIVED/RESULT) -> nct_id.
    Only DERIVED/RESULT links count: a retracted paper that a trial merely CITED
    says nothing about that trial's integrity, and treating it as if it did would
    smear retraction across hundreds of innocent trials (60.2% of links are
    BACKGROUND).
    """
    import duckdb
    import pyarrow as pa
    import pyarrow.parquet as pq
    import glob

    rw = os.path.join(INTEGRITY_DIR, "retraction_watch.parquet")
    if not os.path.isfile(rw):
        raise FileNotFoundError("run: python integrity.py --retraction-watch")
    papers = sorted(glob.glob(os.path.join(C.STORE, "papers", "*.parquet")))
    refs = sorted(glob.glob(os.path.join(C.STORE, "trial_refs", "*.parquet")))
    if not papers or not refs:
        raise FileNotFoundError("need papers + trial_refs — run crosswalk.py")

    def lst(fs):
        return "[" + ",".join("'" + f.replace(os.sep, "/") + "'" for f in fs) + "]"

    con = duckdb.connect()
    today = date.today().isoformat()
    rows = con.execute(f"""
        SELECT r.nct_id, w.original_pmid, w.original_doi, w.retraction_date,
               w.reason, w.retraction_nature, w.journal, w.title
        FROM read_parquet('{rw.replace(os.sep,'/')}') w
        JOIN read_parquet({lst(papers)}) p ON p.pmid = w.original_pmid
        JOIN read_parquet({lst(refs)}) r ON trim(r.pmid) = p.pmid
        WHERE upper(r.reference_type) IN ('DERIVED','RESULT')
          AND w.original_pmid IS NOT NULL
    """).fetchall()

    out = [{"nct_id": a, "retracted_pmid": b, "retracted_doi": c,
            "retraction_date": d, "reason": e, "retraction_nature": f,
            "journal": g, "title": (h or "")[:300],
            "method": "RW.original_pmid -> papers.pmid -> trial_refs"
                      "(DERIVED/RESULT) -> nct_id",
            "confidence": "candidate — a retracted report of this trial; "
                          "adjudicate before treating the TRIAL as retracted",
            "source_tier": "integrity",
            "licence": "CC0 (Retraction Watch via Crossref)",
            "locator": f"https://pubmed.ncbi.nlm.nih.gov/{b}/",
            "extracted_at": today}
           for a, b, c, d, e, f, g, h in rows]

    if out:
        dst = os.path.join(INTEGRITY_DIR, "retracted_trials.parquet")
        tmp = dst + ".tmp"
        pq.write_table(pa.Table.from_pylist(out), tmp, compression="zstd")
        os.replace(tmp, dst)
    res = {"retraction_to_trial_links": len(out),
           "distinct_trials_with_a_retracted_report":
               len({x["nct_id"] for x in out}),
           "note": "a retracted REPORT of a trial != a retracted trial; "
                   "flagged as candidate for adjudication"}
    print(f"[integrity:link] {json.dumps(res, indent=2)}")
    return res


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--retraction-watch", action="store_true")
    ap.add_argument("--link", action="store_true")
    a = ap.parse_args()
    if a.retraction_watch:
        retraction_watch()
    if a.link:
        link()
    if not (a.retraction_watch or a.link):
        ap.print_help()
