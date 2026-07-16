"""VISION STORE — the evidence ledger for non-reproducible model calls.

MAHMOOD (2026-07-16): "we need to store all this data as well."

WHY THIS EXISTS. A vision call is expensive and NON-REPRODUCIBLE: re-running a
model does not return the same answer. That puts every vision output in the same
category as the git lane's blind verdicts and the Codex transcripts — EVIDENCE,
not logs. "Ignore what a committed script regenerates; store what was observed
once and cannot be re-run to the same answer."

THE DISEASE THIS CURES. On 2026-07-16 the question "has Claude vision ever
actually run?" took an audit to answer, because nobody stored the calls. The
312/312 was recoverable only because `vision_out_*.json` happened to survive
alongside the images. An unstored run at scale manufactures numbers with no
provenance — the 0.67 problem, industrialised. THE STORE IS THE DELIVERABLE;
the numbers are a by-product.

=============================================================================
WHAT THIS STORE CAN AND CANNOT RECORD — read before trusting a cost number.
=============================================================================
Measured in this environment (`visioncost.py` FINDING 0, re-verified 2026-07-16):
    ANTHROPIC_API_KEY   UNSET      anthropic SDK   NOT INSTALLED
    ANTHROPIC_AUTH_TOKEN UNSET     ant CLI         NOT INSTALLED

=> There is NO API credential here, so vision calls are made by Claude Code
   SUBAGENTS reading an image, not by a batch script. Consequences, stated
   plainly rather than faked:

   CAPTURABLE : image identity, content hash, image bytes, prompt version,
                raw response verbatim, model id, timestamp, emitted confidence,
                parsed output, parser version, role tag.
   NOT CAPTURABLE VIA THIS ROUTE : per-image input/output TOKEN COUNTS and
                COST. A subagent cannot see its own per-image billing. Those
                fields are written as None and `cost_basis="unmeasurable_
                subagent_route"`. They are NOT estimated. A remembered
                pixels->tokens formula is exactly the folklore we are curing.

   If an API key is ever provisioned, `record()` takes real `tokens_in/out` and
   the same schema carries them. The gap is the route, not the store.

=============================================================================
ROLE TAG — MANDATORY, and it cannot be reconstructed later.
=============================================================================
`reproduce-then-perturb` discipline. A forest plot IS the answer key: reading a
2x2 off the plot and counting it as "recovered" is COPYING THE ANSWER.

    ANSWER_KEY  cells read off a forest plot. HELD OUT of any recovery
                numerator. Defines the target; never scores it.
    RECOVERY    a cell recovered from an independent source (paper table, FDA
                review) that is scored AGAINST an ANSWER_KEY.
    MIRROR      a datum harvested for the Tier-1 mirror; not part of any
                head-to-head.
    BEHAVIOURAL_RECORD
                the plot read as a RECORD OF WHAT THE AUTHORS DID, not as data:
                the trial list (names+years), weights, subgroup structure,
                heterogeneity, printed subtotals, model, measure.
                MAHMOOD's insight: YOU CANNOT HIDE AN INCLUSION. An excluded
                trial vanishes silently, but every INCLUDED trial is named,
                dated, weighted and printed. So the plot is evidence of the
                authors' conduct — checkable against the meta's stated criteria
                and against CT.gov. This is NOT recovery and must never enter a
                recovery numerator: it is a different question about a
                different object (the review, not the trial).

Tagged at WRITE time. Intent is not reconstructable after the fact, which is
why this is a required argument with no default.

Run:  python visionstore.py --verify        # integrity + stats, re-runnable
      python visionstore.py --backfill      # import existing vision_out_*.json
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

# ---- Where the evidence lives. NOT regenerable => must NOT be gitignored as
# "derived data". Coordinate with the git decision: the DBs are ignored because
# a script rebuilds them; NOTHING rebuilds this.
STORE_DIR = os.path.join(C.DATA, "visionstore")
LEDGER = os.path.join(STORE_DIR, "calls.jsonl")     # append-only, one row per call
BLOBS = os.path.join(STORE_DIR, "blobs")            # content-addressed images

ROLES = ("ANSWER_KEY", "RECOVERY", "MIRROR", "BEHAVIOURAL_RECORD")
SCHEMA_VERSION = 1


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _ensure() -> None:
    os.makedirs(BLOBS, exist_ok=True)


def seen_keys() -> set:
    """(image_sha256, role) pairs already in the ledger => idempotency.

    Never pay twice for the same figure. With three targets at maximum volume
    that is real money, and re-calling also silently CHANGES the answer.

    KEYED ON (sha, role), NOT sha alone. One image legitimately carries several
    records because ROLE IS THE QUESTION, not a label: a forest plot is both an
    ANSWER_KEY (its 2x2 cells) and a BEHAVIOURAL_RECORD (its inclusion list).
    Those are different questions about the same pixels and both must be
    storable — while a re-run of EITHER must still be a no-op. Keying on sha
    alone silently refused the second role; keying on nothing double-writes.
    """
    out = set()
    if not os.path.exists(LEDGER):
        return out
    with open(LEDGER, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                r = json.loads(line)
                out.add((r["image_sha256"], r.get("role")))
            except Exception:
                continue          # a corrupt line must not hide the rest
    return out


def stash_blob(image_path: str, sha: str) -> str:
    """Content-addressed copy of the image. The call is worthless without the
    exact bytes it saw — a refetched image may differ."""
    _ensure()
    ext = os.path.splitext(image_path)[1].lower() or ".bin"
    dest = os.path.join(BLOBS, sha[:2], sha + ext)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    if not os.path.exists(dest):
        with open(image_path, "rb") as s, open(dest, "wb") as d:
            d.write(s.read())
    return os.path.relpath(dest, STORE_DIR)


ROUTES = ("agent_read", "api_batch", "api_messages", "derived")


def record(*, image_path, role, model_id, prompt_version, raw_response,
           route="agent_read",
           parsed=None, parser_version=None, source_kind=None, source_id=None,
           tokens_in=None, tokens_out=None, cost_usd=None, notes=None,
           call_ts=None, allow_duplicate=False):
    """Append ONE observed call. Returns the record, or None if already stored.

    `raw_response` is the model's verbatim text BEFORE any parsing. This is the
    load-bearing field: if the parse is wrong we RE-PARSE from raw, we do not
    RE-BUY the call. A parser bug must never destroy the evidence.
    """
    if role not in ROLES:
        raise ValueError("role must be one of %r (tagged at write time, not "
                         "reconstructable later); got %r" % (ROLES, role))
    if route not in ROUTES:
        raise ValueError("route must be one of %r; got %r" % (ROUTES, route))
    if not os.path.exists(image_path):
        raise FileNotFoundError(image_path)
    if raw_response is None:
        raise ValueError("raw_response is required — a parsed-only record "
                         "destroys the evidence the call was bought for")
    _ensure()
    sha = sha256_file(image_path)
    if not allow_duplicate and (sha, role) in seen_keys():
        return None                      # idempotent: never pay twice

    rec = {
        "schema_version": SCHEMA_VERSION,
        "call_ts": call_ts or _utcnow(),
        "stored_ts": _utcnow(),
        "role": role,
        "source_kind": source_kind,      # forest_figure | paper_table | fda_page
        "source_id": source_id,          # PMCID/figure id, or NDA/page
        "image_path_original": os.path.abspath(image_path),
        "image_sha256": sha,
        "image_bytes": os.path.getsize(image_path),
        "blob": stash_blob(image_path, sha),
        "model_id": model_id,
        # WHICH DOOR the call came through. The store must not CARE, but it must
        # RECORD it: the route may affect the answer (an agent reading via a tool
        # has different context and reasoning budget than a one-shot batch call),
        # and that is testable later ONLY if logged now. 2026-07-16: treating the
        # missing API key as "vision is blocked" cost hours — the agent_read door
        # was open the whole time. Never let one route's ceiling stand for all.
        "route": route,
        "prompt_version": prompt_version,
        "raw_response": raw_response,    # VERBATIM, pre-parse
        "parsed": parsed,
        "parser_version": parser_version,
        "confidence_emitted": _confidences(parsed),
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
        "cost_usd": cost_usd,
        "cost_basis": ("measured" if tokens_in is not None
                       else "unmeasurable_subagent_route"),
        "notes": notes,
    }
    with open(LEDGER, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
    return rec


def _confidences(parsed):
    """Pull emitted confidences out so the GRADIENT is queryable without
    re-parsing. The gradient is what converts a big run into an instrument
    instead of a pile — it must be a first-class field."""
    if not isinstance(parsed, dict):
        return None
    rows = parsed.get("rows")
    if not isinstance(rows, list):
        return None
    from collections import Counter
    c = Counter(r.get("confidence") for r in rows
                if isinstance(r, dict) and r.get("row_type") == "study")
    return dict(c) or None


def read_all():
    if not os.path.exists(LEDGER):
        return []
    out = []
    with open(LEDGER, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                out.append(json.loads(line))
    return out


def verify():
    """Integrity: every blob present and hashing to its key. Fails closed."""
    recs = read_all()
    bad = []
    for r in recs:
        b = os.path.join(STORE_DIR, r["blob"])
        if not os.path.exists(b):
            bad.append((r["image_sha256"], "BLOB MISSING")); continue
        if sha256_file(b) != r["image_sha256"]:
            bad.append((r["image_sha256"], "HASH MISMATCH — blob altered"))
    from collections import Counter
    print("=== VISION STORE ===")
    print("ledger      :", LEDGER)
    print("records     :", len(recs))
    print("distinct img:", len({r["image_sha256"] for r in recs}))
    print("roles       :", dict(Counter(r["role"] for r in recs)))
    print("source_kind :", dict(Counter(r.get("source_kind") for r in recs)))
    print("models      :", dict(Counter(r.get("model_id") for r in recs)))
    print("cost_basis  :", dict(Counter(r.get("cost_basis") for r in recs)))
    grad = Counter()
    for r in recs:
        for k, v in (r.get("confidence_emitted") or {}).items():
            grad[k] += v
    print("gradient    :", dict(grad) or "n/a")
    print("integrity   :", "OK" if not bad else "FAILED")
    for b in bad[:10]:
        print("   ", b)
    return 1 if bad else 0


def backfill():
    """Import the surviving 2026-07-16 forest batch as ANSWER_KEY evidence.

    These calls were REAL (audit: C:\\Projects\\VISION-PROVENANCE-2026-07-16.md)
    but were stored as bare parsed JSON with no provenance. We can still recover
    image identity + hash + parsed output. What we CANNOT recover is stated as
    None rather than invented:
      raw_response  -> the pre-parse text was never kept. Marked explicitly.
      tokens/cost   -> never observable on this route.
      call_ts       -> file mtime is the best available; flagged as such.
    """
    n = skip = miss = 0
    for f in sorted(glob.glob(os.path.join(C.DATA, "vision_out_*.json"))):
        mtime = datetime.fromtimestamp(os.path.getmtime(f), timezone.utc).isoformat(timespec="seconds")
        for fig in json.load(open(f, encoding="utf-8")):
            ip = fig.get("image_path")
            if not ip or not os.path.exists(ip):
                miss += 1
                continue
            r = record(
                image_path=ip,
                role="ANSWER_KEY",           # forest plot == the answer key
                model_id="unrecorded_claude_code_subagent_2026-07-16",
                prompt_version="forestvision.PROMPT@2026-07-16(unpinned)",
                raw_response="[NOT RETAINED — pre-parse text was not stored by "
                             "the original batch. Parsed output survives; the "
                             "raw does not. This is the exact gap visionstore "
                             "exists to close.]",
                parsed=fig,
                parser_version="backfill/vision_out_json",
                source_kind="forest_figure",
                source_id=fig.get("pmcid"),
                call_ts=mtime,
                notes="BACKFILL of the 2026-07-16 batch from %s. call_ts is the "
                      "FILE MTIME, not an observed call time. Provenance audited "
                      "in C:\\Projects\\VISION-PROVENANCE-2026-07-16.md — calls "
                      "verified REAL (pixel-only details in reading_notes; batch "
                      "beat a live re-read on Carydias 1/84)." % os.path.basename(f),
            )
            if r is None:
                skip += 1
            else:
                n += 1
    print("backfilled:", n, "| already present (idempotent):", skip,
          "| image missing:", miss)
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--verify", action="store_true")
    ap.add_argument("--backfill", action="store_true")
    a = ap.parse_args()
    if a.backfill:
        sys.exit(backfill())
    sys.exit(verify())
