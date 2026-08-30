"""PUBLICATION YEAR for every ledger row -- as a SIDECAR, not an edit.

APPROVED: "put a publication year on the ledger row", to settle era-implausible
identity matches like SPICE -> PMID 8334878 (1993) and STRETCH -> PMID 1192554
(1975, a paper about canine and feline atrial myocardium).

⛔ BUT THE LEDGER IS NOW COMMITTED AND BYTE-VERIFIED AT A REMOTE, with a `-text`
rule so its hashes survive checkout. A file whose value is that its bytes are pinned
is not a file to rewrite in place as a convenience. So this emits a SEPARATE artefact
keyed by ledger id, which can be merged deliberately by whoever owns the ledger --
and if it is never merged, nothing has been damaged.

THE YEAR COMES FROM A TYPED FIELD, NEVER FROM PROSE. PubMed's <PubDate><Year> for
the row's own PMID. An earlier version of the identity report scraped the year out of
`pmid_note` text -- which records when the note was VERIFIED -- and returned 2026 for
US-Carvedilol (PMID 8614419, 1996), inverting the era split it existed to compute.

Rows with no PMID get `year: null` and a reason. Nothing is guessed.

Run:  python year_sidecar.py --ledger F:/E156/hfref-trial-ledger-v3.jsonl \
                            --out ../out/hfref_year_sidecar.json
"""
from __future__ import annotations

import argparse
import json
import os
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ICMJE_YEAR = 2005          # registration became a condition of publication
FDAAA_YEAR = 2007          # FDAAA 801: a US legal requirement


def build(ledger_path: str) -> dict:
    import net as N
    import trial_key_audit as TKA

    with open(ledger_path, encoding="utf-8") as f:
        rows = [json.loads(l) for l in f if l.strip()]
    body = [r for r in rows if not r.get("_record")]

    pmids, by_pmid = [], {}
    for r in body:
        pm = str(((r.get("identifiers") or {}).get("pmid")) or "").strip()
        if pm:
            pmids.append(pm)
            by_pmid.setdefault(pm, []).append(r.get("id"))

    sess = N.PoliteSession(min_interval=0.35, timeout=60)
    pub = TKA.fetch_pubmed(sess, pmids) if pmids else {}

    out, no_pmid, no_year = [], 0, 0
    for r in body:
        rid = r.get("id")
        pm = str(((r.get("identifiers") or {}).get("pmid")) or "").strip()
        rec = pub.get(pm) or {}
        yr = rec.get("year")
        year = int(yr) if str(yr or "").isdigit() else None
        if not pm:
            no_pmid += 1
            reason = "no PMID on the ledger row -- nothing to resolve a year from"
        elif year is None:
            no_year += 1
            reason = "PMID " + pm + " fetched but carries no <PubDate><Year>"
        else:
            reason = "PubMed " + pm + " <PubDate><Year>"
        out.append({
            "ledger_id": rid, "name": r.get("name"), "pmid": pm or None,
            "year": year, "source": reason,
            "pre_icmje_2005": (year < ICMJE_YEAR) if year else None,
            "pre_fdaaa_2007": (year < FDAAA_YEAR) if year else None,
        })

    resolved = [o for o in out if o["year"]]
    pre05 = [o for o in resolved if o["pre_icmje_2005"]]
    pre07 = [o for o in resolved if o["pre_fdaaa_2007"]]
    return {
        "ledger": ledger_path,
        "contract": ("SIDECAR ONLY -- keyed by ledger_id, merged deliberately or not "
                     "at all. The ledger's bytes are pinned at a remote and are not "
                     "edited here."),
        "year_source": "PubMed <PubDate><Year> for the row's own PMID; never scraped from prose",
        "n_rows": len(body),
        "n_with_pmid": len(body) - no_pmid,
        "n_year_resolved": len(resolved),
        "n_no_pmid": no_pmid,
        "n_pmid_but_no_year": no_year,
        "n_pre_icmje_2005": len(pre05),
        "n_pre_fdaaa_2007": len(pre07),
        "rows": out,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ledger", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    rep = build(a.ledger)
    print("YEAR SIDECAR for " + os.path.basename(a.ledger))
    print("  denominator is OF: the non-header records in that ledger")
    print("  rows                       " + str(rep["n_rows"]))
    print("  with a PMID                " + str(rep["n_with_pmid"]) + "/" + str(rep["n_rows"]))
    print("  YEAR RESOLVED              " + str(rep["n_year_resolved"]) + "/" + str(rep["n_rows"]))
    print("    no PMID to resolve from  " + str(rep["n_no_pmid"]))
    print("    PMID but no <PubDate>    " + str(rep["n_pmid_but_no_year"]))
    print("  pre-2005 (ICMJE)           " + str(rep["n_pre_icmje_2005"]) + "/" + str(rep["n_year_resolved"]))
    print("  pre-2007 (FDAAA)           " + str(rep["n_pre_fdaaa_2007"]) + "/" + str(rep["n_year_resolved"]))
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(rep, f, indent=1)
    print("\nwrote " + a.out + " (" + str(os.path.getsize(a.out)) + " bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
