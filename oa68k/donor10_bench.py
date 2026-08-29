"""THE TEN DONOR-SUPPLEMENT TARGETS -- the benchmark that is actually well defined.

THE SET. `F:\\E156\\hfref-trial-ledger-v3.jsonl` fits 43 trials. Of their outcome
records, TEN carry `counts_source: "donor supplement"` or a variant of it -- meaning
their per-arm event counts were not read from the trial's own report at all, but
CARRIED FROM A PRIOR META-ANALYSIS'S SUPPLEMENT. That is rung 1, the rung Mahmood
rates highest, and these ten are the only place in the set where it is load-bearing.

    HF-005 Captopril-Digoxin 1988   HF-052 Colucci 1996
    HF-006 Beller 1995              HF-053 MOCHA
    HF-007 van Veldhuisen 1998      HF-054 PRECISE
    HF-008 SPICE                    HF-055 Cohn 1997
    HF-009 STRETCH                  HF-019 RESOLVD

THE QUESTION: can the ladder recover those ten unaided, by the route a human used?

⛔ AND THE ANSWER STARTS BEFORE ANY RUNG RUNS: ALL TEN HAVE `pmid: null`. Rung 3 has
no plan without one, rung 2 has no plan without an NCT, and none has an NCT either.
So the benchmark is TWO STAGES and they are reported separately, because collapsing
them would attribute an identity failure to the retrieval layer:

    STAGE 0  IDENTITY  -- can a PMID be DEMONSTRATED from the name alone?
    STAGE 1  RETRIEVAL -- given identity, can any rung recover the per-arm counts?

THE DATUM IS PER-ARM EVENT COUNTS, not an effect estimate, and it is scored EXACTLY.
Events and denominators are integers; there is no tolerance to hide in. A run that
gets 12/261 when the ledger says 12/261 has recovered it, and 12/260 has not.

⚠ DENOMINATOR: 43 TRIALS, not 44 rows. HF-021b is CARMEN's second contrast, and a
contrast is not a trial. Every figure below says which it counts.

Run:  python donor10_bench.py --targets ../out/donor10_targets.json
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import asdict

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

import ladder as L


def resolve_identity(req: L.Request, session) -> dict:
    """STAGE 0. Find a PMID that is DEMONSTRABLY the trial's own report.

    Reuses rung 3's machinery -- _esearch_pmids to widen, _rank_reports to keep only
    the trial's own reports and order them. Refuses to return a PMID that fails
    _is_primary_report, because an unverified identifier silently redirects every
    later rung to a different trial.
    """
    notes = []
    ids = L._esearch_pmids(session, req, notes)
    if not ids:
        return {"pmid": None, "why": "esearch returned no candidates", "notes": notes}
    r, secs, err = L._get(session, L.EFETCH,
                          {"db": "pubmed", "id": ",".join(ids[:120]), "retmode": "xml"})
    if r is None or r.status_code != 200:
        return {"pmid": None, "why": "efetch failed: " + (err or str(getattr(r, "status_code", "?"))),
                "notes": notes, "seconds": secs}
    ranked = L._rank_reports(r.text, req)
    if not ranked:
        return {"pmid": None, "notes": notes, "seconds": secs,
                "why": (str(len(ids)) + " candidates fetched, NONE is the trial's own "
                        "report (all name it only in the abstract, i.e. cite it)")}
    top = ranked[0]
    return {"pmid": top["pmid"], "year": top["year"], "title": top["title"][:120],
            "why": top["why"], "n_own_reports": len(ranked), "notes": notes,
            "seconds": secs}


def score_counts(truth_arms: list, got: dict) -> dict:
    """EXACT integer comparison, either orientation of the two arms."""
    if not got:
        return {"verdict": "NOT_FOUND", "why": "no counts extracted"}
    want = sorted((int(a["events"]), int(a["n"])) for a in truth_arms
                  if a.get("events") is not None and a.get("n") is not None)
    g = sorted([(got["arm1"]["events"], got["arm1"]["n"]),
                (got["arm2"]["events"], got["arm2"]["n"])])
    if want == g:
        return {"verdict": "MATCHED", "got": g, "want": want}
    return {"verdict": "MISMATCHED", "got": g, "want": want,
            "why": "counts differ from the ledger's"}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--targets", default=os.path.join(L.OUT_DIR, "donor10_targets.json"))
    ap.add_argument("--out", default=os.path.join(L.OUT_DIR, "donor10_result.json"))
    a = ap.parse_args(argv)

    with open(a.targets, encoding="utf-8") as f:
        targets = json.load(f)
    rx = L.extractor()
    print("extractor: " + (("rct-extractor-v2 v" + rx.__version__) if rx else "ABSENT"))
    if rx is None:
        print("REFUSING to run without the extractor.")
        return 2

    import requests
    s = requests.Session()
    recs, rows = [], []
    for t in sorted(targets, key=lambda x: x["id"]):
        name = (t.get("name") or "").split(" (")[0].strip()
        aliases = []
        raw = t.get("name") or ""
        if "(" in raw:
            aliases.append(raw[raw.find("(") + 1:raw.rfind(")")].strip())
        req = L.Request(trial=name, field_path="counts.all_cause_mortality",
                        nct=t.get("nct") or "", aliases=[x for x in aliases if x])
        print("\n=== " + t["id"] + " " + name + " ===")

        ident = resolve_identity(req, s)
        print("   R0 IDENTITY  " + ("pmid " + str(ident["pmid"]) + " (" + str(ident.get("why"))[:60] + ")"
                                    if ident.get("pmid") else "UNRESOLVED -- " + str(ident.get("why"))[:90]))
        if ident.get("pmid"):
            req.pmid = ident["pmid"]

        rec = L.climb(req, session=s, stop_at_first_hit=True)
        d = asdict(rec)
        sc = score_counts(t.get("arms") or [], d.get("value"))
        d["benchmark"] = {"truth": t, "identity": ident, "score": sc}
        recs.append(d)
        for at in d["attempts"]:
            print("   R" + str(at["rung"]) + " " + at["outcome"].ljust(19)
                  + ("%6.1fs " % at["seconds"]) + at["note"][:130])
        print("   -> " + sc["verdict"] + " via " + (d.get("supplying_rung_name") or "-"))
        rows.append({"id": t["id"], "name": name,
                     "identity": ident.get("pmid"),
                     "verdict": sc["verdict"],
                     "rung": d.get("supplying_rung_name") or "-",
                     "tier": d.get("provenance_tier") or "-",
                     "counts_source_in_ledger": t.get("counts_source")})

    rep = L.yield_report(recs)
    n = len(rows)
    ident_ok = sum(1 for r in rows if r["identity"])
    matched = sum(1 for r in rows if r["verdict"] == "MATCHED")
    mism = sum(1 for r in rows if r["verdict"] == "MISMATCHED")

    print("\n" + "=" * 78)
    print("DONOR-SUPPLEMENT TEN -- per-arm counts, scored EXACTLY")
    print("=" * 78)
    print("  id      trial                  identity   verdict      rung")
    for r in rows:
        print("  " + r["id"].ljust(8) + r["name"][:22].ljust(23)
              + (str(r["identity"]) or "-").ljust(11) + r["verdict"].ljust(13) + r["rung"])
    print("\n  STAGE 0  identity DEMONSTRATED   " + str(ident_ok) + "/" + str(n)
          + "   of the ten trials whose ledger row carries counts_source='donor supplement'")
    print("  STAGE 1  counts MATCHED exactly   " + str(matched) + "/" + str(n)
          + "   same denominator")
    print("           counts MISMATCHED        " + str(mism) + "/" + str(n))
    print("           not found                " + str(n - matched - mism) + "/" + str(n))
    L.print_yield(rep)

    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump({"summary": {"n": n, "identity_demonstrated": ident_ok,
                               "matched": matched, "mismatched": mism},
                   "denominator_of": ("the ten trials in hfref-trial-ledger-v3.jsonl "
                                      "whose outcome provenance is a donor supplement; "
                                      "the fitted set is 43 TRIALS (44 rows: HF-021b is "
                                      "CARMEN's second contrast)"),
                   "rows": rows, "yield": rep, "records": recs}, f, indent=1)
    print("\nwrote " + a.out + " (" + str(os.path.getsize(a.out)) + " bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
