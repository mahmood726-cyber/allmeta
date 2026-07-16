"""The standing job for the pre-extraction layer — one stream, priority order.

Runs the network stages in sequence, forever, resuming each from its own ledger.
Every stage here is idempotent, so this driver is safe to kill and re-invoke at
any moment; scheduling it IS the standing job.

WHY SEQUENTIAL, not parallel. The tempting thing is to run the OA full-text
corpora concurrently. Don't: they all hit NCBI eutils, whose guidance is ~3
req/s without an API key. Each PoliteSession self-limits to ~2.9 req/s, so two
streams is ~5.9 req/s — over the line. PoliteSession honours 429 with backoff so
it would not corrupt anything, but it would be rude and risks the host being
blocked, which costs far more than the parallelism gains. The crosswalk is the
exception and MAY overlap: it talks to EBI (Europe PMC), a different host.

Order is priority order, and it is deliberate:
  1. crosswalk      — cheap, fast (~3,900 pmids/min), and everything downstream
                      needs its OA flags to know what is even harvestable.
  2. linked_rct     — OA full text for papers reporting REGISTERED trials. These
                      are the highest-value records: registry + abstract + full
                      text on one trial means the three layers can cross-check
                      each other.
  3. dta            — diagnostic-accuracy candidates. Invisible to CT.gov, so
                      nothing else in the pipeline can reach them.
  4. oa_rct         — the widest net: OA RCT reports incl. unregistered trials.
  5. dta_detect     — cheap, offline, re-run after each dta slice.

Run:  python standing.py                 # one full cycle, bounded slices
      python standing.py --loop          # keep cycling until everything is done
      python standing.py --slice 2000
"""
from __future__ import annotations

import argparse
import json
import time
import traceback
from datetime import datetime

import config as C

SLICE = 5000          # papers per corpus per cycle — bounded so no stage starves


def _stamp() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _try(name: str, fn, *a, **kw) -> dict:
    """Run a stage; a stage failure must never kill the standing job."""
    print(f"\n=== [{_stamp()}] {name}", flush=True)
    try:
        return {"stage": name, "ok": True, "result": fn(*a, **kw)}
    except Exception as e:
        print(f"[standing] {name} FAILED: {e}", flush=True)
        traceback.print_exc()
        return {"stage": name, "ok": False, "error": str(e)[:300]}


def cycle(slice_n: int = SLICE) -> list[dict]:
    import crosswalk
    import dta_detect
    import fulltext

    out = []
    out.append(_try("crosswalk (EBI)", crosswalk.run, None, True))
    for corpus in ("linked_rct", "dta", "oa_rct"):
        out.append(_try(f"fulltext:{corpus} (NCBI)", fulltext.run,
                        slice_n, False, corpus))
    out.append(_try("dta_detect (offline)", dta_detect.run, "dta"))
    return out


def _remaining() -> int:
    """Papers still un-harvested across all corpora — the loop's exit test."""
    import fulltext
    from net import load_done_keys
    total = 0
    for corpus in ("linked_rct", "dta", "oa_rct"):
        try:
            cands = (fulltext.candidates() if corpus == "linked_rct"
                     else fulltext.seed_candidates(corpus))
            done = load_done_keys(fulltext.ft_ledger(corpus), "pmcid")
            total += sum(1 for c in cands if c["pmcid"] not in done)
        except FileNotFoundError:
            continue          # corpus not seeded yet — not an error
    return total


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--slice", type=int, default=SLICE)
    ap.add_argument("--loop", action="store_true")
    ap.add_argument("--max-cycles", type=int, default=1000)
    a = ap.parse_args()

    n = 0
    while True:
        n += 1
        res = cycle(a.slice)
        print(f"\n[standing] cycle {n} summary: "
              f"{json.dumps([{r['stage']: r['ok']} for r in res])}", flush=True)
        if not a.loop:
            break
        left = _remaining()
        print(f"[standing] {left} papers still un-harvested", flush=True)
        if left == 0:
            print("[standing] all corpora harvested — stopping.", flush=True)
            break
        if n >= a.max_cycles:
            print(f"[standing] hit --max-cycles {a.max_cycles}; stopping so an "
                  f"unnoticed no-progress loop cannot spin forever.", flush=True)
            break
        time.sleep(2)
