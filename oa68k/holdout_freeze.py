"""FREEZE THE MALARIA/TB TRANSFER HOLDOUT — pre-specified, timestamped, never tuned on.

WHY THIS EXISTS, AND WHY IT MUST RUN BEFORE THE CARDIO PIVOT AND NOT AFTER.

The programme is pivoting to cardiology. Cardiology IS the productive shape, so
every metric will look excellent — and that is exactly the danger. A homogeneous
sample CANNOT FAIL A HOMOGENEITY TEST: the metric cannot see the axis it
collapsed. Develop only on cardio and we build a method that works on cardiology
and report it as a method. That is the third instance of the same pathology
(Pairwise70 = a convenience corpus reported as "modern meta-analyses"; our harvest
= 99.9% one era; now one specialty), and it is invisible from inside.

The cure is cheap and it has an expiry: a holdout chosen AFTER we have tuned on
cardio is post-hoc and worthless. Pre-specify, THEN look. So this list is frozen
tonight, before a single cardio figure is read, and the selection rule is written
down here rather than exercised by hand.

SELECTION RULE — fixed in advance, deterministic, reproducible:
  1. Disease is malaria or TB (title regex, same patterns as shardA_worklist).
  2. The paper has >=1 figure figscan typed `forest`.
  3. The paper is T1 (its methods text names RevMan / Review Manager).
     WHY T1 AND NOT A RANDOM SAMPLE: measured tonight, malaria/TB papers are only
     4.0%/7.7% productive — a random 20 would be ~19 single-arm prevalence plots
     and the transfer test would measure NOTHING, because the method would have no
     2x2 to produce. Restricting to T1 selects on the FILTER (frozen before the
     pivot, tuned on nothing), NOT on the outcome. This makes the holdout a
     transfer test OF THE METHOD, not an estimate of malaria/TB yield — a
     distinction that must survive into any write-up.
  4. Exclude anything already read in this shard or the owner's ledger. A figure
     we have already looked at cannot test transfer.
  5. Order by sha256(pmcid) — a stable pseudo-random order that cannot be nudged.
     Take the first N (default 20).

WHAT THE HOLDOUT IS FOR:
  transfers  -> we have earned the claim that the method generalises beyond cardio
  fails      -> we have found the BOUNDARY, which is a finding too, and a more
                honest one than a number that only ever saw one specialty

USE: `python holdout_freeze.py --freeze` once, tonight. After that the file is
evidence: do NOT regenerate it, and do NOT let a worker read anything in it for
development. `--check <pmcid>` is the guard other lanes call.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone

import config as C
import visionshard as SH

HOLDOUT = os.path.join(C.DATA, "holdout_malaria_tb.json")
FIGSCAN = os.path.join(C.DATA, f"figscan.{C.NODE}.jsonl")
SEEDS = ("seed.jsonl", "seed_dta.jsonl", "seed_oa_rct.jsonl")

MALARIA = re.compile(r"malaria|plasmodium|falciparum|artemisin|antimalarial|vivax", re.I)
TB = re.compile(r"tubercul|mycobacterium|rifampic|isoniazid|MDR-TB|bedaquiline", re.I)
REVMAN = re.compile(rb"RevMan|Review\s*Manager", re.I)


def _titles() -> dict:
    out = {}
    for name in SEEDS:
        p = os.path.join(C.DATA, name)
        if not os.path.exists(p):
            continue
        with open(p, encoding="utf-8") as fh:
            for ln in fh:
                ln = ln.strip()
                if not ln:
                    continue
                try:
                    r = json.loads(ln)
                except Exception:
                    continue
                if r.get("pmcid"):
                    out[r["pmcid"]] = r.get("title") or ""
    return out


def _forest_papers() -> dict:
    out = {}
    with open(FIGSCAN, encoding="utf-8") as fh:
        for ln in fh:
            ln = ln.strip()
            if not ln:
                continue
            r = json.loads(ln)
            n = sum(len(f.get("graphic_hrefs") or [])
                    for f in (r.get("figs") or []) if f.get("kind") == "forest")
            if n:
                out[r["pmcid"]] = n
    return out


def _is_t1(pmcid: str) -> bool:
    p = os.path.join(C.DATA, "cache", pmcid + ".xml")
    if not os.path.exists(p):
        return False
    with open(p, "rb") as fh:
        return bool(REVMAN.search(fh.read()))


def _already_read() -> set:
    """PMCIDs any figure of which is already in either ledger."""
    out = set()
    for led in (SH.SHARD, SH.VS.LEDGER):
        if not os.path.exists(led):
            continue
        with open(led, encoding="utf-8") as fh:
            for ln in fh:
                ln = ln.strip()
                if not ln:
                    continue
                try:
                    out.add(json.loads(ln).get("source_id"))
                except Exception:
                    continue
    return {x for x in out if x}


def freeze(n: int) -> int:
    if os.path.exists(HOLDOUT):
        print("REFUSED: holdout already frozen at", HOLDOUT)
        print("A holdout that can be regenerated is not a holdout. If it must")
        print("genuinely change, delete it by hand and say so in the commit.")
        return 1
    titles, forest, read = _titles(), _forest_papers(), _already_read()
    cand = []
    for pmcid in forest:
        t = titles.get(pmcid, "")
        d = "malaria" if MALARIA.search(t) else ("TB" if TB.search(t) else None)
        if not d or pmcid in read or not _is_t1(pmcid):
            continue
        cand.append({"pmcid": pmcid, "disease": d, "n_forest_figs": forest[pmcid],
                     "title": t,
                     "order": hashlib.sha256(pmcid.encode()).hexdigest()})
    cand.sort(key=lambda x: x["order"])
    picked = cand[:n]
    doc = {
        "frozen_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "frozen_before": "any cardiology figure was read for development",
        "rule": ("disease in {malaria,TB} by title regex AND >=1 figscan forest "
                 "figure AND T1 (methods text names RevMan) AND not already read "
                 "in either ledger; ordered by sha256(pmcid); first %d taken" % n),
        "why_t1": ("malaria/TB papers are 4.0%/7.7% productive (measured, paper "
                   "level, 2026-07-16). A random sample would be ~19/20 single-arm "
                   "prevalence plots and would test nothing. T1 selects on the "
                   "FILTER (frozen, tuned on nothing), NOT on the outcome. This is "
                   "a transfer test OF THE METHOD, not an estimate of malaria/TB "
                   "yield."),
        "contract": ("NEVER read for development. NEVER tuned on. Read ONCE, at the "
                     "end, as the transfer test. Transfers => the claim is earned. "
                     "Fails => we found the boundary, which is also a finding."),
        "n_candidates": len(cand),
        "n_frozen": len(picked),
        "papers": picked,
    }
    with open(HOLDOUT, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, indent=1)
        fh.flush()
        os.fsync(fh.fileno())
    print(json.dumps({k: v for k, v in doc.items() if k != "papers"}, indent=1))
    print()
    for p in picked:
        print("  %-8s %-12s %d figs  %s" % (p["disease"], p["pmcid"],
                                            p["n_forest_figs"], p["title"][:60]))
    return 0


def is_held_out(pmcid: str) -> bool:
    if not os.path.exists(HOLDOUT):
        return False
    with open(HOLDOUT, encoding="utf-8") as fh:
        return pmcid in {p["pmcid"] for p in json.load(fh)["papers"]}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--freeze", action="store_true")
    ap.add_argument("--n", type=int, default=20)
    ap.add_argument("--check", metavar="PMCID")
    a = ap.parse_args()
    if a.check:
        held = is_held_out(a.check)
        print("HELD OUT — do not read for development" if held else "not held out")
        sys.exit(1 if held else 0)
    if a.freeze:
        sys.exit(freeze(a.n))
    ap.print_help()
