"""Why does rung 1 yield 0? Diagnose it -- do NOT report a bare zero.

Mahmood's premise names prior meta-analyses as the BEST source: "best source is
previous metas -- and that data is peer reviewed so easy to use." The benchmark
returns 0 hits from 8 reached. A zero against a stated premise has to be explained
before it is reported, and there are three completely different explanations:

  A. the OA metas that name this trial carry NO per-trial row for this outcome;
  B. they carry it, but in a FIGURE (a forest plot) rather than a table -- pixels;
  C. they carry it in a table and OUR TABLE READER MISSED IT.

Only C is our defect. A and B are facts about the corpus, and B is already the
established finding of the 68k lane (SHARDA-ANSWER-KEY-YIELD.md: 74.5% of forest
figures carry no per-arm data at all; the per-trial numbers live in figures, which
is why forestvision.py/visionshard.py exist).

This prints, per meta, per table: the caption, whether it scopes to the outcome,
whether any row NAMES the trial, and whether that row holds an effect+CI cell. Plus
a count of <fig> elements, which is the size of route B.

Run:  python rung1_diagnose.py --trial DAPA-HF --alias "DAPA HF"
"""
from __future__ import annotations

import argparse
import re
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

import ladder as L


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--trial", required=True)
    ap.add_argument("--alias", action="append", default=[])
    ap.add_argument("--field", default="all_cause_mortality")
    ap.add_argument("--limit", type=int, default=8)
    a = ap.parse_args()

    req = L.Request(trial=a.trial, field_path="effect." + a.field, aliases=a.alias)
    names = [a.trial] + a.alias
    q = ('(PUB_TYPE:"Meta-Analysis" OR PUB_TYPE:"Systematic Review") AND OPEN_ACCESS:y '
         'AND HAS_FT:y AND (' + " OR ".join('"' + n + '"' for n in names if n) + ')')
    r, secs, err = L._get(None, L.EPMC_SEARCH,
                          {"query": q, "format": "json", "pageSize": str(a.limit),
                           "resultType": "lite"})
    if r is None or r.status_code != 200:
        print("EPMC search failed: " + (err or str(r.status_code)))
        return 1
    hits = (r.json().get("resultList") or {}).get("result") or []
    print("OA metas naming " + a.trial + ": " + str(len(hits)) + " (of hitCount "
          + str(r.json().get("hitCount")) + ")\n")

    cues = L.OUTCOME_CUES.get(a.field, [])
    tot = {"metas": 0, "tables": 0, "scoped_tables": 0, "rows_naming_trial": 0,
           "rows_with_effect_cell": 0, "figures": 0, "fig_captions_scoped": 0}
    import jats
    for h in hits:
        pmcid = h.get("pmcid") or ""
        if not pmcid:
            continue
        url = L.EPMC_FULLTEXT.format(src="PMC", pid=pmcid)
        r2, s2, e2 = L._get(None, url, timeout=90)
        if r2 is None or r2.status_code != 200:
            print(pmcid + "  FULLTEXT FAILED " + (e2 or str(getattr(r2, "status_code", "?"))))
            continue
        tot["metas"] += 1
        xml = r2.content
        tables = jats.parse_tables(xml)
        figs = re.findall(r"<fig[ >].*?</fig>", r2.text, flags=re.S)
        tot["tables"] += len(tables)
        tot["figures"] += len(figs)
        for f in figs:
            if any(c in f.lower() for c in cues):
                tot["fig_captions_scoped"] += 1
        print(pmcid + "  " + str(len(tables)) + " tables, " + str(len(figs)) + " figures  "
              + (h.get("title") or "")[:70])
        for t in tables:
            head = " ".join(t.get("headers") or [])
            scope = (t.get("caption", "") + " " + head).lower()
            scoped = bool(cues) and any(c in scope for c in cues)
            rows_named = [row for row in (t.get("rows") or [])
                          if L._names_trial(" ".join(str(c) for c in row[:2]), req)]
            has_cell = any(L._CELL_EFFECT.search(str(c)) for row in rows_named for c in row)
            if scoped:
                tot["scoped_tables"] += 1
            tot["rows_naming_trial"] += len(rows_named)
            tot["rows_with_effect_cell"] += int(has_cell)
            if rows_named or scoped:
                print("     " + ("SCOPED " if scoped else "unscoped ")
                      + t.get("label", "?") + " | rows naming trial: " + str(len(rows_named))
                      + " | effect+CI cell: " + str(has_cell)
                      + " | " + (t.get("caption", "") or "")[:80])

    print("\nTOTALS over " + str(tot["metas"]) + " OA metas")
    for k in ("tables", "scoped_tables", "rows_naming_trial", "rows_with_effect_cell",
              "figures", "fig_captions_scoped"):
        print("  " + k.ljust(24) + str(tot[k]))
    print("\nREAD THIS AS:")
    print("  scoped_tables 0            -> route A/B: the metas do not TABULATE this outcome")
    print("  rows_naming_trial 0        -> the per-trial rows are not in tables at all")
    print("  figures >> tables          -> route B: the numbers are PIXELS (forestvision.py)")
    print("  rows_with_effect_cell > 0  -> route C: OUR reader missed it, and that is a defect")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
