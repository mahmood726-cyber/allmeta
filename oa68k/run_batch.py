"""The STANDING JOB — one batch: harvest -> parse+detect -> preextract -> ledger.

Idempotent + resumable end to end. Designed to be invoked repeatedly (scheduler /
cron / manual) to grind through the full 68k over time on pc1. Each run advances by
--batch un-harvested metas, then refreshes the pre-extract store and prints the
coverage ledger. A kill at any point resumes cleanly from the durable ledgers.

Prereq: seed.jsonl exists (run ingest.py once). If not, this fails loud.

Run:  python run_batch.py --batch 150
"""
from __future__ import annotations

import argparse
import json
import os

import config as C
import harvest
import parse_detect
import preextract
import ledger


def main(batch: int, skip_preextract: bool, shard_id: int, shard_count: int) -> None:
    if not os.path.exists(C.SEED):
        raise SystemExit("[run_batch] seed.jsonl missing — run `python ingest.py` first")
    print(f"=== oa68k standing batch: {batch} metas · node={C.NODE} "
          f"shard {shard_id}/{shard_count} ===")
    harvest.run(limit=batch, shard_id=shard_id, shard_count=shard_count)
    parse_detect.run(limit=batch)
    if not skip_preextract:
        if C.find_aact():
            preextract.run()
        else:
            print("[run_batch] AACT mirror absent — skipping preextract "
                  "(set OA68K_AACT to enable registry pre-extraction)")
    print("\n=== COVERAGE LEDGER ===")
    print(json.dumps(ledger.report(), indent=2))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--batch", type=int, default=150)
    ap.add_argument("--skip-preextract", action="store_true")
    ap.add_argument("--shard-id", type=int, default=0)
    ap.add_argument("--shard-count", type=int, default=1)
    a = ap.parse_args()
    main(a.batch, a.skip_preextract, a.shard_id, a.shard_count)
