"""ERA RE-SEED — page the FULL id list per era stratum. Checkpointed, resumable.

§0c: "Harvest ORDER is a sampling frame. Nobody chose recency; cursorMark did."

⭐ SO THIS SEEDS **ALL** OF EACH ERA, NOT THE FIRST N. That is the whole point.
Taking the first 1,000 of each era by cursorMark would move the defect down a
level instead of fixing it — the same convenience sample, one nesting deeper.
Only once the FULL id list per era exists can a downstream draw be random.

`resultType=core` returns licence + pubYear + journal + pmcid in the search
response, so 68 pages characterise all 67,762 metas WITHOUT fetching one JATS.

CHECKPOINTING (the brief's standing rule: a run that dies at 80% with nothing on
disk has spent the budget and bought nothing): every page is appended to
data/eraseed.<node>.jsonl immediately and fsync'd; the cursorMark per era is
persisted to data/eraseed_state.json. Re-running resumes.

Run:  python eraseed.py            # seeds all four eras, resumable
      python eraseed.py --summary  # counts from the ledger, no network
Out:  data/eraseed.<node>.jsonl, data/eraseed_state.json
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter

import config as C

BASE = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
Q = '(SRC:MED) AND (PUB_TYPE:"Meta-Analysis") AND (OPEN_ACCESS:y) AND (HAS_FT:y)'
ERAS = [("le2014", 1990, 2014), ("2015-19", 2015, 2019),
        ("2020-22", 2020, 2022), ("2023-26", 2023, 2026)]
PAGE = 1000
LEDGER = os.path.join(C.DATA, f"eraseed.{C.NODE}.jsonl")
STATE = os.path.join(C.DATA, "eraseed_state.json")
UA = "oa68k-goldset/1.0 (mailto:mahmood726@gmail.com)"


def fetch(q, cursor):
    u = BASE + "?" + urllib.parse.urlencode(
        {"query": q, "format": "json", "pageSize": PAGE,
         "cursorMark": cursor, "resultType": "core"})
    req = urllib.request.Request(u, headers={"User-Agent": UA})
    for a in range(5):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)
        except Exception as e:
            if a == 4:
                raise RuntimeError(f"EPMC failed after 5 tries: {e}")
            time.sleep(2 ** a)


def load_state():
    if os.path.exists(STATE):
        return json.load(open(STATE, encoding="utf-8"))
    return {}


def save_state(s):
    tmp = STATE + ".tmp"
    json.dump(s, open(tmp, "w", encoding="utf-8"), indent=2)
    os.replace(tmp, STATE)


def seen_ids():
    s = set()
    if os.path.exists(LEDGER):
        with open(LEDGER, encoding="utf-8") as f:
            for ln in f:
                try:
                    s.add(json.loads(ln)["id"])
                except Exception:
                    pass
    return s


def run():
    state = load_state()
    have = seen_ids()
    print(f"resuming: {len(have):,} records already on disk\n")
    out = open(LEDGER, "a", encoding="utf-8")
    for era, lo, hi in ERAS:
        st = state.setdefault(era, {"cursor": "*", "done": False, "n": 0})
        if st["done"]:
            print(f"{era:8s} already complete ({st['n']:,})")
            continue
        q = f"{Q} AND (FIRST_PDATE:[{lo}-01-01 TO {hi}-12-31])"
        while not st["done"]:
            d = fetch(q, st["cursor"])
            res = d["resultList"]["result"]
            nxt = d.get("nextCursorMark")
            new = 0
            for r in res:
                if r["id"] in have:
                    continue
                have.add(r["id"])
                out.write(json.dumps({
                    "id": r["id"], "pmid": r.get("pmid"), "pmcid": r.get("pmcid"),
                    "era": era, "pubYear": r.get("pubYear"),
                    "firstPublicationDate": r.get("firstPublicationDate"),
                    "license": r.get("license"),
                    "journal": ((r.get("journalInfo") or {}).get("journal") or {}).get("title"),
                    "isOpenAccess": r.get("isOpenAccess"), "inPMC": r.get("inPMC"),
                }, ensure_ascii=False) + "\n")
                new += 1
            out.flush()
            os.fsync(out.fileno())
            st["n"] += new
            if not res or nxt == st["cursor"] or not nxt:
                st["done"] = True
            else:
                st["cursor"] = nxt
            save_state(state)
            print(f"  {era:8s} +{new:4d}  total {st['n']:6,d}  hits {d['hitCount']:,}",
                  flush=True)
            time.sleep(0.25)
        print(f"{era:8s} DONE {st['n']:,}\n")
    out.close()


def summary():
    if not os.path.exists(LEDGER):
        raise SystemExit("no ledger — run `python eraseed.py` first")
    era = Counter()
    lic = Counter()
    pmc = Counter()
    n = 0
    with open(LEDGER, encoding="utf-8") as f:
        for ln in f:
            r = json.loads(ln)
            n += 1
            era[r["era"]] += 1
            lic[(r.get("license") or "NONE")] += 1
            if r.get("pmcid"):
                pmc[r["era"]] += 1
    print("=" * 74)
    print("ERA RE-SEED — ledger summary (no network)")
    print("=" * 74)
    print(f"\nrecords seeded: {n:,}\n")
    print(f"{'era':10s} {'seeded':>8s} {'%':>7s} {'has PMCID':>10s} {'%':>7s}")
    print("-" * 74)
    for e, _, _ in ERAS:
        v = era[e]
        if not v:
            continue
        print(f"{e:10s} {v:8,d} {100*v/n:6.1f}% {pmc[e]:10,d} {100*pmc[e]/v:6.1f}%")
    print("-" * 74)
    print("\nlicence classes present in the seeded ledger:")
    for k, v in lic.most_common(9):
        print(f"   {k:22s} {v:7,d}  ({100*v/n:5.1f}%)")
    print(f"""
⭐ THE §0c CHECK — the era axis must STOP reading as a single value.
   Before re-seed our corpus was 99.9% one era; the skew metric read a PERFECT
   1.00x BECAUSE the corpus was degenerate. If this ledger still shows one era
   dominating, the re-seed has NOT worked and the metric is still blind.
""")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--summary", action="store_true")
    a = ap.parse_args()
    if not a.summary:
        run()
    summary()
