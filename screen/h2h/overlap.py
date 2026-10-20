"""Cross-review record overlap (OpenAlex ID and normalised title) for PROTOCOL.md section 3.4.

Computed on record identity only (IDs, titles); no labels or tool outputs are used, so it can be run before
the protocol is committed without seeing any result.

  python h2h/overlap.py --out h2h/sets/overlap.json
"""
import argparse
import csv
import gzip
import itertools
import json
import re
from pathlib import Path

import pandas as pd

import core

ROOT = Path(__file__).resolve().parent.parent


def norm_title(t: str) -> str:
    t = re.sub(r"[^a-z0-9]+", " ", str(t).lower()).strip()
    return t if len(t) >= 30 else ""  # very short titles ("Editorial", "Reply") are not identifying


def synergy_sets(keys):
    out = {}
    for k in keys:
        df = pd.read_csv(Path(core.DATA_DIR, f"{k}.csv"), dtype=str, keep_default_na=False)
        ids = {x for x in df.get("openalex_id", []) if x}
        tit = {norm_title(x) for x in df["title"]} - {""}
        out[k] = (ids, tit)
    return out


def local_corpora():
    """Screen's historical tuning corpora shipped in this repo (Cohen 2006 + the 4 ASReview benchmark files)."""
    out = {}
    for f in sorted(Path(ROOT, "data", "corpora").glob("*.csv.gz")):
        with gzip.open(f, "rt", encoding="utf-8") as h:
            df = pd.read_csv(h, dtype=str, keep_default_na=False)
        out["local:" + f.name[:-7]] = (set(), {norm_title(x) for x in df.get("title", [])} - {""})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "h2h" / "sets" / "overlap.json"))
    a = ap.parse_args()
    inv = list(csv.DictReader(open(ROOT / "h2h" / "synergy_plus_v3.0_inventory.csv")))
    keys = [r["key"] for r in inv]
    S = synergy_sets(keys)
    L = local_corpora()
    pairs = []
    for x, y in itertools.combinations(keys, 2):
        ids = len(S[x][0] & S[y][0]); tit = len(S[x][1] & S[y][1])
        if ids or tit:
            nx, ny = len(S[x][1]), len(S[y][1])
            pairs.append({"a": x, "b": y, "shared_openalex_ids": ids, "shared_titles": tit,
                          "frac_of_smaller": round(max(ids, tit) / max(1, min(nx, ny)), 4)})
    vs_local = []
    for k in keys:
        for lk, (_, lt) in L.items():
            t = len(S[k][1] & lt)
            if t:
                vs_local.append({"review": k, "corpus": lk, "shared_titles": t, "frac_of_review": round(t / max(1, len(S[k][1])), 4)})
    pairs.sort(key=lambda p: -p["frac_of_smaller"])
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps({"pairs": pairs, "vs_local_corpora": vs_local}, indent=1))
    print(f"{len(pairs)} overlapping SYNERGY+ pairs; {len(vs_local)} review x local-corpus overlaps")
    for p in pairs[:40]:
        print(p)
    for v in sorted(vs_local, key=lambda v: -v["frac_of_review"])[:20]:
        print(v)


if __name__ == "__main__":
    main()
