"""RUNG 0 -- IDENTITY. It is not a data rung, and its cost is counted separately.

THE SIBLING LANE'S RULING, adopted: identity sits BEFORE retrieval, and a retrieval
layer cannot be evaluated on a corpus that cannot name what to retrieve. Its ladder
recorded "EMPTY -- no plan: missing identifier" for 38 of 44 subjects at rung 2 and
44 of 44 at rung 3, which is a fact about the IDENTIFIERS, not about the registry.

⛔ THE RULE THAT GOVERNS THIS FILE: DO NOT GUESS AN IDENTIFIER TO UNBLOCK A RUNG.
An unverified NCT does not fail loudly -- it silently redirects every later rung to
a different trial, and every downstream number then describes that other trial. So a
resolution is written only when it is DEMONSTRATED, and otherwise the field stays
null WITH A RECORDED REASON.

TWO ROUTES COUNT AS DEMONSTRATION, and they are asymmetric in strength:

  D1  THE PAPER'S OWN DECLARATION. PubMed records the registration of the trial a
      paper REPORTS in <DataBank><AccessionNumber>. That is the trial's own report
      naming its own registration -- not a search ranking, not a name match. It also
      names NON-CT.gov registries explicitly (ISRCTN / ChiCTR / CTRI / EudraCT),
      which a CT.gov-only resolver cannot reach at all.
  D2  THE REGISTRY'S OWN LABEL. CT.gov's identificationModule.acronym equal to the
      trial's name, case-folded. The register applying the name itself.

Anything weaker -- "first hit for a text query", "the title looks right" -- is a
GUESS and is refused. A search ranking is not an identity.

⚠ AND ABSENCE OF A REGISTRATION IS USUALLY NOT A DEFECT. Registration became an
ICMJE publication condition in 2005 and a US legal requirement under FDAAA 801 in
2007. A trial that reported before then has no registration to find, and recording
that as NOT_YET_FOUND with its year is honest; recording it as
GENUINELY_UNOBTAINABLE would NOT be, because "no mandate existed" is a structural
argument, not a register's own answer about that trial.

REUSE, not reimplementation: trial_key_audit.fetch_pubmed already batches <=200
PMIDs and parses <DataBank> with ElementTree. It is called here as-is.

Run:  python identity.py --trials ../out/hfref_trials_extracted.json
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
FDAAA_YEAR = 2007          # FDAAA 801: US legal requirement


def _same_accession(a, b) -> bool:
    """Do two strings name the SAME registration?

    ⚠ A REGISTRY PREFIX IS NOT A DISAGREEMENT. The corpus writes
    "EudraCT 2013-005326-38" and "ChiCTR1900021929"; PubMed's <DataBank> stores the
    bare accession with the registry name in a sibling element. A raw string compare
    reported both as CONFLICTS -- two accusations of data disagreement manufactured
    entirely by formatting. Compare the accession, not the label around it.
    """
    import re

    def norm(x: str) -> str:
        x = str(x or "").strip().lower()
        x = re.sub(r"^(eudract|euctr|chictr|isrctn|ctri|nct|actrn|jprn|drks|"
                   r"pactr|irct|tctr|rbr|ntr|kct|slctr|per|ricn)[\s:\-/]*", "", x)
        return re.sub(r"[^a-z0-9]", "", x)

    na, nb = norm(a), norm(b)
    if not na or not nb:
        return False
    return na == nb or na.endswith(nb) or nb.endswith(na)


def _year_of(t: dict, pubmed_year=None) -> int | None:
    """Publication year, from a TYPED FIELD, never scraped out of prose.

    ⚠ THE FIRST VERSION SCRAPED IT AND LIED. It regexed the first 4-digit year out
    of `pmid_note` / `name` / `doi`, and those notes carry the date they were
    VERIFIED on. Every one of the six trials it classified as "2005 or later -- the
    real gaps" came back as 2026, including US-Carvedilol (PMID 8614419, 1996). The
    era split is the whole point of this report, so scraping it inverted the finding.
    PubMed's <PubDate><Year> was already in hand from fetch_pubmed.
    """
    if str(pubmed_year or "").isdigit():
        return int(pubmed_year)
    for k in ("year", "pub_year"):
        v = t.get(k)
        if isinstance(v, int) and 1940 < v < 2100:
            return v
    return None


def resolve(trials: list, verbose: bool = True) -> dict:
    """Resolve registrations for a trial set. Writes nothing it cannot demonstrate."""
    import net as N
    import trial_key_audit as TKA

    sess = N.PoliteSession(min_interval=0.35, timeout=60)
    pmids = [str(t["pmid"]) for t in trials if t.get("pmid")]
    pub = TKA.fetch_pubmed(sess, pmids) if pmids else {}

    rows = []
    for t in trials:
        pmid = str(t.get("pmid") or "")
        rec = pub.get(pmid) or {}
        banks = rec.get("databanks") or {}
        declared = []
        for reg, accs in banks.items():
            for a in accs:
                if a:
                    declared.append({"registry": reg, "accession": a})
        year = _year_of(t, rec.get("year"))
        held = t.get("nct")
        row = {
            "id": t.get("id"), "name": t.get("name"), "pmid": pmid or None,
            "year": year, "held_identifier": held,
            "declared_by_own_report": declared,
            "resolution": None, "method": None, "evidence": None, "note": "",
        }
        if declared:
            row["resolution"] = declared[0]["accession"]
            row["method"] = "D1_own_report_databank"
            row["evidence"] = ("PubMed " + pmid + " <DataBank>" + declared[0]["registry"]
                               + "</DataBank> = " + declared[0]["accession"])
            if held and str(held).strip() and not _same_accession(held, row["resolution"]):
                row["note"] = ("CONFLICT: the corpus holds " + str(held) + " and the "
                               "paper declares " + row["resolution"] + " -- neither is "
                               "overwritten; a conflict is a finding, not a merge")
        elif held:
            row["resolution"] = held
            row["method"] = "held_by_corpus_UNVERIFIED"
            row["evidence"] = None
            row["note"] = ("the corpus holds this identifier; the paper's own record "
                           "declares no registration, so it is carried forward "
                           "UNVERIFIED rather than promoted")
        else:
            row["note"] = "no registration declared by the paper and none held"
            if year and year < ICMJE_YEAR:
                row["note"] += ("; reported " + str(year) + ", before registration was "
                                "a publication condition (2005) or a US legal "
                                "requirement (2007) -- absence here is EXPECTED and is "
                                "NOT a demonstration that none exists")
        rows.append(row)

    n = len(rows)
    demo = [r for r in rows if r["method"] == "D1_own_report_databank"]
    unver = [r for r in rows if r["method"] == "held_by_corpus_UNVERIFIED"]
    none_ = [r for r in rows if r["resolution"] is None]
    conflicts = [r for r in rows if "CONFLICT" in r["note"]]
    pre = [r for r in none_ if r["year"] and r["year"] < ICMJE_YEAR]
    post = [r for r in none_ if r["year"] and r["year"] >= ICMJE_YEAR]
    unknown_year = [r for r in none_ if not r["year"]]

    rep = {
        "n_trials": n,
        "pmid_present": sum(1 for r in rows if r["pmid"]),
        "demonstrated": len(demo),
        "held_unverified": len(unver),
        "unresolved": len(none_),
        "conflicts": len(conflicts),
        "unresolved_pre_2005": len(pre),
        "unresolved_2005_or_later": len(post),
        "unresolved_year_unknown": len(unknown_year),
        "rows": rows,
    }

    if verbose:
        print("IDENTITY -- rung 0, over " + str(n) + " trials")
        print("  denominator is OF: the trials carried in the corpus's own trials[] array")
        print("  PMID held by the corpus            " + str(rep["pmid_present"]) + "/" + str(n))
        print("  DEMONSTRATED registration (D1)     " + str(len(demo)) + "/" + str(n)
              + "   -- the paper's own <DataBank> declaration")
        print("  held but UNVERIFIED                " + str(len(unver)) + "/" + str(n))
        print("  unresolved                         " + str(len(none_)) + "/" + str(n))
        print("     of which reported pre-2005      " + str(len(pre))
              + "   <- absence EXPECTED, no mandate existed")
        print("     of which 2005 or later          " + str(len(post))
              + "   <- these are the real gaps")
        print("     of which year unknown           " + str(len(unknown_year)))
        print("  CONFLICTS (held != declared)       " + str(len(conflicts)))
        if conflicts:
            for r in conflicts:
                print("     " + str(r["name"]) + ": held " + str(r["held_identifier"])
                      + " vs declared " + str(r["resolution"]))
        if post:
            print("\n  THE REAL GAPS -- 2005 or later, no registration demonstrated:")
            for r in post:
                print("     " + str(r["name"]).ljust(22) + "pmid " + str(r["pmid"])
                      + "  (" + str(r["year"]) + ")")
        print("\n  newly demonstrated where the corpus held nothing:")
        got = [r for r in demo if not r["held_identifier"]]
        for r in got:
            print("     " + str(r["name"]).ljust(22) + str(r["resolution"]).ljust(18)
                  + "(" + str(r["evidence"])[:70] + ")")
        print("     " + str(len(got)) + " trials gained a DEMONSTRATED identifier they "
              "did not have")
    return rep


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--trials", required=True)
    ap.add_argument("--out", default="")
    a = ap.parse_args()
    with open(a.trials, encoding="utf-8") as f:
        trials = json.load(f)
    rep = resolve(trials)
    if a.out:
        os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
        with open(a.out, "w", encoding="utf-8") as f:
            json.dump(rep, f, indent=1)
        print("\nwrote " + a.out + " (" + str(os.path.getsize(a.out)) + " bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
