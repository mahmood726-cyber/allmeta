"""Shared definitions for the held-out Screen vs ASReview head-to-head (h2h).

Single source of truth for: dataset loading, the per-seed starting records given to BOTH tools,
and every outcome metric. Each tool only emits a screening ORDER (record indices, starting records
first); all metrics are computed here from that order, so the two tools cannot differ in definition.

Data: SYNERGY+ v3.0 CSVs built locally with `python -m synergy_dataset get -l` (plaintext abstracts are
reconstructed locally from OpenAlex inverted indexes and must not be redistributed; see PROTOCOL.md).
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import zlib
from pathlib import Path

import numpy as np
import pandas as pd

DATA_DIR = Path(os.environ.get("H2H_DATA", "E:/screen-h2h-data/synergy_plus_local"))
SEEDS = [101, 202, 303, 404, 505, 606, 707, 808, 909, 1010]
N_PRIOR_POS, N_PRIOR_NEG = 2, 2  # Screen's real training gate (mlTrainOn: 2 includes + 2 excludes)
RECALL_EFFORT_FRACS = (0.10, 0.20)  # recall at fixed screening effort (proportion of records screened)


def load_review(key: str, data_dir: Path = DATA_DIR):
    """Return (frame with title/abstract, labels int array, sha256 of the ordered OpenAlex IDs).

    The reference standard is `label_included` (inclusion after full-text screening). Labels must be exactly
    "0" or "1" and every record must have an OpenAlex ID; anything else is an error, never a silent exclusion."""
    df = pd.read_csv(Path(data_dir, f"{key}.csv"), dtype=str, keep_default_na=False)
    lab = df["label_included"].str.strip()
    bad = sorted(set(lab) - {"0", "1"})
    if bad:
        raise ValueError(f"{key}: label_included has values outside {{0,1}}: {bad[:5]}")
    if "openalex_id" not in df.columns or (df["openalex_id"].str.strip() == "").any():
        raise ValueError(f"{key}: every record needs an openalex_id")
    y = (lab == "1").astype(int).to_numpy()
    ids = df["openalex_id"].tolist()
    id_sha = hashlib.sha256("\n".join(ids).encode("utf-8")).hexdigest()
    return df[["title", "abstract"]].copy(), y, id_sha


def dataset_digest(key: str, data_dir: Path = DATA_DIR) -> str:
    """sha256 over ordered (openalex_id, label, title, abstract): freezes the exact analysis input."""
    df = pd.read_csv(Path(data_dir, f"{key}.csv"), dtype=str, keep_default_na=False)
    h = hashlib.sha256()
    for r in df[["openalex_id", "label_included", "title", "abstract"]].itertuples(index=False):
        h.update(("\x1f".join(r) + "\x1e").encode("utf-8"))
    return h.hexdigest()


def prior_records(key: str, y: np.ndarray, seed: int) -> list[int]:
    """Starting records for (review, seed): 2 random relevant + 2 random irrelevant record indices.

    Identical for both tools. Generator is keyed on (seed, crc32(review key)) so every review gets an
    independent stream and the draw does not depend on run order, process layout or platform."""
    rng = np.random.Generator(np.random.PCG64([seed, zlib.crc32(key.encode("utf-8"))]))
    inc, exc = np.flatnonzero(y == 1), np.flatnonzero(y == 0)
    if len(inc) < N_PRIOR_POS or len(exc) < N_PRIOR_NEG:
        raise ValueError(f"{key}: needs >= {N_PRIOR_POS} relevant and {N_PRIOR_NEG} irrelevant records")
    pos = rng.choice(inc, N_PRIOR_POS, replace=False)
    neg = rng.choice(exc, N_PRIOR_NEG, replace=False)
    return [int(i) for i in np.concatenate([pos, neg])]


def metrics_from_order(order: list[int], y: np.ndarray, n_prior: int = N_PRIOR_POS + N_PRIOR_NEG) -> dict:
    """All outcomes from one screening order. `order` = record indices in the order screened, starting
    records first. It must reach the last relevant record (both tools stop there).

    Starting records COUNT as screened (identically for both tools).
      wss95      = 0.95 - n95/N, n95 = records screened when ceil(0.95*R) relevant are found
      recall@f   = relevant found within the first ceil(f*N) screened records / R
      prop_last  = n100/N, proportion screened when the last relevant record is found (lower is better)
    """
    N, R = len(y), int(y.sum())
    if not all(isinstance(i, (int, np.integer)) and not isinstance(i, bool) for i in order):
        raise ValueError("order must contain integers")
    if any(i < 0 or i >= N for i in order):
        raise ValueError("order index out of range")
    if len(set(order)) != len(order):
        raise ValueError("order contains duplicates")
    labs = y[np.asarray(order, dtype=int)]
    cum = np.cumsum(labs)
    if cum[-1] < R:
        raise ValueError(f"order stops before the last relevant record ({cum[-1]}/{R})")
    if cum[-1] == R and len(order) > int(np.argmax(cum >= R)) + 1:
        raise ValueError("order continues past the last relevant record (both tools must stop there)")
    need95 = math.ceil(0.95 * R)
    n95 = int(np.argmax(cum >= need95)) + 1
    n100 = int(np.argmax(cum >= R)) + 1
    out = {"N": N, "R": R, "n95": n95, "n100": n100, "wss95": 0.95 - n95 / N, "prop_last": n100 / N,
           "wss95_equals_wss100": bool(need95 == R)}
    for f in RECALL_EFFORT_FRACS:
        lim = math.ceil(f * N)
        out[f"recall_at_{int(round(f * 100))}pct"] = float(cum[min(lim, len(cum)) - 1]) / R
    return out


def write_priors(keys: list[str], out_dir: Path, data_dir: Path = DATA_DIR) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    for k in keys:
        _, y, id_sha = load_review(k, data_dir)
        rec = {"review": k, "N": int(len(y)), "R": int(y.sum()), "ids_sha256": id_sha,
               "dataset_sha256": dataset_digest(k, data_dir),
               "prior_rule": f"{N_PRIOR_POS} relevant + {N_PRIOR_NEG} irrelevant, PCG64([seed, crc32(key)])",
               "priors": {str(s): prior_records(k, y, s) for s in SEEDS}}
        Path(out_dir, f"{k}.json").write_text(json.dumps(rec, indent=1))
