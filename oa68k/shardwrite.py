"""SHARD-B WRITER — append vision calls to our own shard of the vision store.

WHY A SHARD AND NOT THE STORE. `data/visionstore/calls.jsonl` is owned by lane
local_b1c44062. Two lanes appending to one file interleave partial lines under
concurrency and there is no lock we both honour. So each lane writes its OWN
append-only file with the IDENTICAL schema and the owner merges. Merging N
append-only files with a stable idempotency key is trivial; un-corrupting one
interleaved file is not.

    owner   : calls.jsonl              (READ-ONLY to us)
    shard A : calls.shard-A.jsonl      (read for dedup, never written)
    shard B : calls.shard-B.jsonl      (ours)

IDEMPOTENCY IS CROSS-FILE. `seen_keys()` unions ALL shards, because the point of
the key is "never buy this call twice" and money does not care which file the
first copy landed in. Keyed on (sha, role): role IS the question, so one image
legitimately carries an ANSWER_KEY and a BEHAVIOURAL_RECORD record.

ONE CALL, TWO RECORDS — stated plainly so nobody double-counts throughput.
A single agent_read of a forest plot answers two different questions about the
same pixels. We write both records with the SAME verbatim raw_response and a
shared `call_group` id. The store's row count is therefore NOT a call count;
`call_group` is. Recording it as two calls would inflate our own denominator.

VERBATIM OR NOTHING. `raw_response` is written exactly as the subagent returned
it, before any parse. A summarising layer between vision and disk is how evidence
becomes folklore — the parse is a derived view and may be re-run; the raw cannot.

Usage:  python shardwrite.py --ingest batch.json      # [{...}, ...]
        python shardwrite.py --verify
"""
from __future__ import annotations

import argparse
import glob
import hashlib
import json
import os
import sys
from datetime import datetime, timezone

import config as C

STORE_DIR = os.path.join(C.DATA, "visionstore")
SHARD = os.path.join(STORE_DIR, "calls.shard-B.jsonl")
BLOBS = os.path.join(STORE_DIR, "blobs")

ROLES = ("ANSWER_KEY", "RECOVERY", "MIRROR", "BEHAVIOURAL_RECORD")
ROUTES = ("agent_read", "api_batch", "api_messages", "derived")
SCHEMA_VERSION = 1


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def all_ledgers() -> list:
    """Every shard, ours included. Order irrelevant — we only union keys."""
    return sorted(glob.glob(os.path.join(STORE_DIR, "calls*.jsonl")))


def seen_keys() -> set:
    """(sha, role) across ALL shards. A tolerant reader: one corrupt line in
    someone else's file must not blind us to the rest of it."""
    out = set()
    for led in all_ledgers():
        try:
            fh = open(led, "r", encoding="utf-8")
        except OSError:
            continue
        with fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    r = json.loads(line)
                    out.add((r["image_sha256"], r.get("role")))
                except Exception:
                    continue
    return out


def stash_blob(image_path: str, sha: str) -> str:
    os.makedirs(BLOBS, exist_ok=True)
    ext = os.path.splitext(image_path)[1].lower() or ".bin"
    dest = os.path.join(BLOBS, sha[:2], sha + ext)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    if not os.path.exists(dest):
        with open(image_path, "rb") as s, open(dest, "wb") as d:
            d.write(s.read())
    return os.path.relpath(dest, STORE_DIR)


def _confidences(parsed):
    """Surface the confidence GRADIENT as a first-class field.

    This is the field the whole run exists to produce. A parser we tested was
    47.1% wrong with EVERY error emitted at confidence="high": no gradient means
    no reject option, which makes the output unusable at any coverage. If vision
    abstains where that parser did not, that IS the finding — and it is only
    queryable later if it is extracted now.

    ⚠ THE FIRST VERSION COUNTED ONLY row_type=="study" AND WAS THEREFORE BLIND TO
    THE LARGEST ABSTENTION IN THE RUN. On a 545x268 figure a reader abstained on
    93 rows — every one typed `subtotal`, being pooled per-assay estimates rather
    than studies. That figure's emitted gradient contained NO abstentions, and the
    shard rate read 2.5% where the true all-row rate was 8.7%. A reject-option
    metric blind to the rows most likely to be rejected reports the number we
    would prefer to see. Count EVERY row; key by row_type so the shape stays
    visible. (The owner's visionstore.py has the same study-only narrowing —
    flag it there too.)
    """
    if not isinstance(parsed, dict):
        return None
    rows = parsed.get("rows")
    if not isinstance(rows, list):
        return None
    from collections import Counter
    overall, by_type = Counter(), {}
    for r in rows:
        if not isinstance(r, dict):
            continue
        conf = r.get("confidence")
        if conf is None:
            continue
        overall[conf] += 1
        by_type.setdefault(r.get("row_type") or "unknown", Counter())[conf] += 1
    if not overall:
        return None
    return {"all_rows": dict(overall),
            "by_row_type": {k: dict(v) for k, v in by_type.items()},
            # Retained so older readers of this field do not silently change
            # meaning — but it IS a subset, and it is now named as one.
            "study_rows_only": dict(by_type.get("study", {})) or None}


def record(*, image_path, role, model_id, prompt_version, raw_response,
           route="agent_read", parsed=None, parser_version=None,
           source_kind=None, source_id=None, tokens_in=None, tokens_out=None,
           cost_usd=None, notes=None, call_ts=None, call_group=None,
           allow_duplicate=False):
    if role not in ROLES:
        raise ValueError("role must be one of %r; got %r" % (ROLES, role))
    if route not in ROUTES:
        raise ValueError("route must be one of %r; got %r" % (ROUTES, route))
    if not os.path.exists(image_path):
        raise FileNotFoundError(image_path)
    if raw_response is None:
        raise ValueError("raw_response is required — a parsed-only record "
                         "destroys the evidence the call was bought for")
    sha = sha256_file(image_path)
    if not allow_duplicate and (sha, role) in seen_keys():
        return None
    rec = {
        "schema_version": SCHEMA_VERSION,
        "call_ts": call_ts or _utcnow(),
        "stored_ts": _utcnow(),
        "role": role,
        "source_kind": source_kind,
        "source_id": source_id,
        "image_path_original": os.path.abspath(image_path),
        "image_sha256": sha,
        "image_bytes": os.path.getsize(image_path),
        "blob": stash_blob(image_path, sha),
        "model_id": model_id,
        "route": route,
        "prompt_version": prompt_version,
        "raw_response": raw_response,
        "parsed": parsed,
        "parser_version": parser_version,
        "confidence_emitted": _confidences(parsed),
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
        "cost_usd": cost_usd,
        # Not estimated. A subagent cannot see its own per-image billing, and a
        # remembered pixels->tokens formula is exactly the folklore being cured.
        "cost_basis": ("measured" if tokens_in is not None
                       else "unmeasurable_subagent_route"),
        "notes": notes,
        "shard": "B",
        "call_group": call_group,   # rows sharing this are ONE bought call
    }
    with open(SHARD, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
    return rec


def ingest(path: str) -> int:
    """Ingest a batch file of already-observed calls. Fails LOUDLY per row and
    keeps going: one malformed row must not discard the calls beside it."""
    batch = json.load(open(path, encoding="utf-8"))
    n = skip = err = 0
    for item in batch:
        try:
            r = record(**item)
            if r is None:
                skip += 1
            else:
                n += 1
        except Exception as e:
            err += 1
            print("  ROW FAILED:", item.get("image_path"), "->", e, file=sys.stderr)
    print("written:", n, "| already present (idempotent):", skip, "| failed:", err)
    return 1 if err else 0


def verify() -> int:
    from collections import Counter
    if not os.path.exists(SHARD):
        print("shard B: empty")
        return 0
    recs = [json.loads(l) for l in open(SHARD, encoding="utf-8") if l.strip()]
    bad = []
    for r in recs:
        b = os.path.join(STORE_DIR, r["blob"])
        if not os.path.exists(b):
            bad.append((r["image_sha256"], "BLOB MISSING")); continue
        if sha256_file(b) != r["image_sha256"]:
            bad.append((r["image_sha256"], "HASH MISMATCH — blob altered"))
    print("=== VISION STORE / SHARD B ===")
    print("shard       :", SHARD)
    print("records     :", len(recs))
    print("calls (grp) :", len({r.get("call_group") for r in recs}))
    print("distinct img:", len({r["image_sha256"] for r in recs}))
    print("roles       :", dict(Counter(r["role"] for r in recs)))
    print("models      :", dict(Counter(r.get("model_id") for r in recs)))
    # ONE PER call_group, NOT one per record. Both role records carry the whole
    # figure doc, so summing the gradient over RECORDS counts every study row
    # twice and reports 24 rows where 12 were read. Inflating your own
    # denominator by double-counting is the exact error class this project
    # exists to find in other people's work; it does not get a pass here.
    grad, grad_study = Counter(), Counter()
    seen_grp = set()
    for r in recs:
        g = r.get("call_group") or r["image_sha256"]
        if g in seen_grp:
            continue
        seen_grp.add(g)
        ce = r.get("confidence_emitted") or {}
        for k, v in (ce.get("all_rows") or {}).items():
            grad[k] += v
        for k, v in (ce.get("study_rows_only") or {}).items():
            grad_study[k] += v
    print("gradient    :", dict(grad) or "n/a", "(ALL rows, per call)")
    tot = sum(grad.values())
    if tot:
        ab = grad.get("ABSTAIN", 0) + grad.get("low", 0)
        print("abstain+low : %d/%d = %.1f%% of ALL rows" % (ab, tot, 100.0 * ab / tot))
    ts = sum(grad_study.values())
    if ts:
        abs_ = grad_study.get("ABSTAIN", 0) + grad_study.get("low", 0)
        # Reported SECOND and explicitly narrowed. Leading with the study-row rate
        # is how the 2.5% headline hid a 93-row abstention on pooled rows.
        print("            : %d/%d = %.1f%% of STUDY rows only (a subset)"
              % (abs_, ts, 100.0 * abs_ / ts))
    print("integrity   :", "OK" if not bad else "FAILED")
    for b in bad[:10]:
        print("   ", b)
    return 1 if bad else 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--ingest")
    ap.add_argument("--verify", action="store_true")
    a = ap.parse_args()
    if a.ingest:
        sys.exit(ingest(a.ingest))
    sys.exit(verify())
