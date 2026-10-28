"""Merge sharded held-out result dirs into the single dirs PROTOCOL 7.5 names (R/screen, R/asreview/elas_u4,
R/asreview/elas_u3). Only final <review>.json files are merged (never _per_seed partials). A review present in two
shard dirs must have byte-identical runs (deterministic per seed), else the merge stops. Every set review must be
present exactly once. Attempt logs are concatenated with their source dir recorded.

  python ho_merge.py <set.txt> <out_dir> <src_dir> [<src_dir> ...]
"""
import hashlib, json, sys
from pathlib import Path

st = [l.strip() for l in Path(sys.argv[1]).read_text().splitlines() if l.strip() and not l.startswith("#")]
out = Path(sys.argv[2]); srcs = [Path(p) for p in sys.argv[3:]]
if out.exists() and any(out.glob("*.json")):
    raise SystemExit(f"{out} already holds results; refusing to overwrite")
out.mkdir(parents=True, exist_ok=True)
got, origin = {}, {}
for s in srcs:
    for f in sorted(s.glob("*.json")):
        k = f.stem
        if k not in st:
            raise SystemExit(f"{f}: not a review of the set")
        d = json.loads(f.read_text())
        if k in got:
            if json.dumps(got[k]["runs"], sort_keys=True) != json.dumps(d["runs"], sort_keys=True):
                raise SystemExit(f"{k}: differing runs in {origin[k]} and {s}")
            print(f"duplicate (identical runs) {k}: {origin[k]} and {s}")
            continue
        got[k], origin[k] = d, s
missing = sorted(set(st) - set(got))
if missing:
    raise SystemExit(f"missing reviews: {missing}")
for k, d in got.items():
    (out / f"{k}.json").write_text(json.dumps(d))
with open(out / "_attempts.jsonl", "w") as fo:
    for s in srcs:
        p = s / "_attempts.jsonl"
        if p.exists():
            for line in p.read_text().splitlines():
                if line.strip():
                    fo.write(json.dumps({"shard_dir": str(s), **json.loads(line)}) + "\n")
(out / "_merge.json").write_text(json.dumps({"set": sys.argv[1], "sources": [str(s) for s in srcs],
    "origin": {k: str(v) for k, v in origin.items()},
    "sha256": {k: hashlib.sha256((out / f"{k}.json").read_bytes()).hexdigest() for k in sorted(got)}}, indent=1))
print(f"merged {len(got)} reviews into {out}")
