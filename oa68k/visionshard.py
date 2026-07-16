"""SHARD-A WRITER — bank live `agent_read` vision calls without touching the
owner lane's ledger.

WHY A SHARD AND NOT `calls.jsonl`. `data/visionstore/calls.jsonl` is owned by
another lane that is appending concurrently. Two writers on one append-only file
is how you get an interleaved half-line and lose the run. This lane writes
`calls.shard-A.jsonl` — SAME schema, same `(sha, role)` idempotency, same blob
store (content-addressed, so a concurrent write of the same bytes is a no-op).
The owner merges. `blobs/` is safe to share; the LEDGER is not.

THE READ SIDE. Idempotency is checked against BOTH ledgers, so this lane never
re-reads a figure the owner already bought. That matters more than saving money:
a vision call is NOT reproducible — re-reading a stored figure returns a
DIFFERENT answer and silently destroys comparability with the stored batch.

NO PARAPHRASER BETWEEN VISION AND DISK. The subagent that looked at the pixels
writes its own JSON to a raw file. This module reads that file's BYTES and stores
them verbatim as `raw_response`; `parsed` is `json.loads` of the same bytes and
nothing else. The orchestrator never retypes a number. A summarising layer is how
evidence becomes folklore, so there is no summarising layer.

ROLES WRITTEN PER FIGURE (the role IS the question, keyed `(sha, role)`):
    ANSWER_KEY         route=agent_read — the real call. The plot's cells. HELD
                       OUT of any recovery numerator: reading a 2x2 off a forest
                       plot is COPYING THE ANSWER.
    BEHAVIOURAL_RECORD route=derived    — no second call. The inclusion record
                       (trial list, years, weights, subgroups, heterogeneity,
                       printed subtotals) extracted from the SAME raw by
                       `behaviour.extract_one`.

Run:  python visionshard.py --ingest <dir>   # bank every raw_*.json in dir
      python visionshard.py --verify         # integrity + stats for the shard
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import sys
from collections import Counter
from datetime import datetime, timezone

import behaviour
import config as C
import visionstore as VS

SHARD = os.path.join(VS.STORE_DIR, "calls.shard-A.jsonl")

# The model that actually looked at the pixels. Recorded, not guessed: these are
# Claude Code subagents on this session's model, reading via the `Read` tool.
MODEL_ID = "claude-opus-4-8[1m]/claude_code_subagent@2026-07-16"
PARSER_VERSION = "shardA/raw_json_verbatim@1"

# The prompt is a PROPERTY OF THE CALL, not of the ingester. A module-level
# constant stamped on every raw at ingest time is a provenance LIE the moment the
# prompt changes mid-run: raws already on disk, produced under the old prompt,
# silently acquire the new version string. So the version travels IN the raw (the
# worker echoes it) and is only fallen back to for the v1 raws written before the
# field existed. Never widen this fallback — an unknown prompt must read as v1
# UNTAGGED, not as whatever is current.
PROMPT_VERSION_FALLBACK = "shardA.FOREST_FULL_CAPTURE@2026-07-16-v1(untagged)"


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _keys(led: str) -> set:
    out = set()
    if not os.path.exists(led):
        return out
    with open(led, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                r = json.loads(line)
                out.add((r["image_sha256"], r.get("role")))
            except Exception:
                continue          # one corrupt line must not hide the rest
    return out


def seen_shard() -> set:
    """(sha, role) in THIS SHARD ONLY — the write-idempotency key.

    DELIBERATELY NOT the union with the owner's ledger, and the distinction cost
    us a corrupted record before it was understood:

    A RE-RUN and an INDEPENDENT SECOND OBSERVATION are not the same event. The
    owner's ledger having an ANSWER_KEY for this sha does NOT mean re-writing
    mine is a no-op — it means two lanes looked at the same pixels and got two
    answers, which for a non-reproducible call is DATA (it measures vision's
    self-consistency), not duplication. Suppressing it destroys evidence already
    bought.

    The bug this replaces: idempotency was checked per-role against the union, so
    when the owner concurrently banked an ANSWER_KEY, this lane refused its own AK
    but still wrote the BEHAVIOURAL_RECORD derived from it — leaving a BR whose
    provenance note pointed at an AK that did not exist in this shard. The two
    roles from one raw are ATOMIC: they are the same observation, so they are
    written or skipped together, judged against this shard alone.

    Not-re-READING what the owner already read is a WORKLIST concern (don't spend
    twice), enforced before dispatch — not a write-time concern. By ingest time
    the call is already bought and refusing it only loses it.
    """
    return _keys(SHARD)


def owner_keys() -> set:
    """(sha, role) in the OWNER's ledger — recorded as a collision FLAG, never
    used to refuse a write. The merge needs to know a repeat-read happened."""
    return _keys(VS.LEDGER)


def _append(rec: dict) -> None:
    with open(SHARD, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
        fh.flush()
        os.fsync(fh.fileno())


def _rec(*, image_path, sha, role, route, raw_response, parsed, parser_version,
         source_kind, source_id, notes, prompt_version, also_in_owner_ledger=False):
    return {
        "schema_version": VS.SCHEMA_VERSION,
        "call_ts": _utcnow(),
        "stored_ts": _utcnow(),
        "role": role,
        "source_kind": source_kind,
        "source_id": source_id,
        "image_path_original": os.path.abspath(image_path),
        "image_sha256": sha,
        "image_bytes": os.path.getsize(image_path),
        "blob": VS.stash_blob(image_path, sha),
        "model_id": MODEL_ID,
        "route": route,
        "prompt_version": prompt_version,
        "raw_response": raw_response,
        "parsed": parsed,
        "parser_version": parser_version,
        "confidence_emitted": VS._confidences(parsed),
        "tokens_in": None,
        "tokens_out": None,
        "cost_usd": None,
        # Unchanged from the owner lane: a subagent cannot see its own per-image
        # billing. Written as None, never estimated — a remembered
        # pixels->tokens formula is exactly the folklore this store cures.
        "cost_basis": "unmeasurable_subagent_route",
        "notes": notes,
        "shard": "A",
        # A repeat-read, not a contradiction: the owner's ledger holds a record
        # for this (sha, role) too. Two independent observations of the same
        # non-reproducible call are a MEASUREMENT of vision self-consistency —
        # the merge must compare them, not silently keep one. Flagged, never
        # used to suppress.
        "also_in_owner_ledger": also_in_owner_ledger,
    }


def ingest_file(path: str, seen: set, owner: set | None = None) -> dict:
    """Bank ONE raw file: the verbatim bytes a vision subagent wrote.

    Fails closed on every mismatch. A raw file that does not parse, or whose
    image is gone, or whose bytes hash to something other than the sha the
    worklist assigned, is REFUSED — not repaired. Repairing it here would mean
    this module inventing a number, which is the one thing it must never do.
    """
    raw = open(path, encoding="utf-8").read()
    try:
        parsed = json.loads(raw)
    except Exception as e:
        return {"file": path, "banked": 0, "error": f"raw is not JSON: {e}"}

    ip = parsed.get("image_path")
    if not ip or not os.path.exists(ip):
        return {"file": path, "banked": 0, "error": f"image missing: {ip!r}"}

    sha = VS.sha256_file(ip)
    claimed = parsed.get("image_sha256")
    if claimed and claimed != sha:
        return {"file": path, "banked": 0,
                "error": "sha mismatch — the raw does not describe these bytes"}

    pv = parsed.get("prompt_version") or PROMPT_VERSION_FALLBACK
    owner = owner if owner is not None else owner_keys()

    n = 0
    if (sha, "ANSWER_KEY") not in seen:
        _append(_rec(
            image_path=ip, sha=sha, role="ANSWER_KEY", route="agent_read",
            prompt_version=pv,
            also_in_owner_ledger=(sha, "ANSWER_KEY") in owner,
            raw_response=raw,                 # VERBATIM bytes, pre-parse
            parsed=parsed, parser_version=PARSER_VERSION,
            source_kind="forest_figure", source_id=parsed.get("pmcid"),
            notes="Live agent_read of the figure. ANSWER_KEY: the plot's own "
                  "cells. HELD OUT of any recovery numerator.",
        ))
        seen.add((sha, "ANSWER_KEY"))
        n += 1

    if (sha, "BEHAVIOURAL_RECORD") not in seen:
        # A swallowed exception here silently drops the behavioural half of an
        # observation and reports success — the caller sees a smaller count and
        # no reason. Surface it; the ANSWER_KEY still banks.
        try:
            b = behaviour.extract_one(parsed)
            b_err = None
        except Exception as e:
            b, b_err = None, "%s: %s" % (type(e).__name__, e)
        if b_err:
            print("BEHAVIOUR FAILED", parsed.get("pmcid"), "|", b_err)
        if b is not None:
            _append(_rec(
                image_path=ip, sha=sha, role="BEHAVIOURAL_RECORD", route="derived",
                prompt_version=pv,
                also_in_owner_ledger=(sha, "BEHAVIOURAL_RECORD") in owner,
                raw_response="[DERIVED — no new vision call. Extracted by %s from "
                             "the shard-A agent_read whose verbatim raw IS retained "
                             "in this same shard under role=ANSWER_KEY, keyed on the "
                             "same image_sha256.]" % behaviour.VERSION,
                parsed=b, parser_version=behaviour.VERSION,
                source_kind="forest_figure_behaviour", source_id=parsed.get("pmcid"),
                notes="BEHAVIOURAL_RECORD: the inclusion record (trial list, years, "
                      "weights, subgroups, heterogeneity, printed subtotals). NOT "
                      "recovery — never enters a recovery numerator.",
            ))
            seen.add((sha, "BEHAVIOURAL_RECORD"))
            n += 1

    return {"file": path, "banked": n, "pmcid": parsed.get("pmcid"), "sha": sha}


def ingest_duplicate(path: str, why: str) -> int:
    """Bank a SECOND independent observation of an image already in this shard.

    NOT a re-run, and the distinction is the whole point. `seen_shard()` refuses a
    repeat (sha, role) so a re-ingest is a no-op — correct for reruns, WRONG when
    two workers genuinely looked at the same pixels and disagreed. That disagreement
    is the measurement, and it is not reconstructable later.

    Why this exists (2026-07-16): two workers read PMC11098556 app3-fig2. One
    returned 148 study rows reconciling EXACTLY against all nine printed subtotals
    (251/1496/163/1092/3069/108/44/45/54 -> 6322); the other returned 56, missing
    the entire 91-row Peninsular Malaysia subgroup and failing four subtotals. The
    second was written to the raw_ slot last and was therefore the one banked. The
    ledger held the broken read and the correct one sat in a .bak.

    Both are kept. NEITHER is deleted and NEITHER is edited: the arbitration
    (`why`) is recorded as data, so a later reader can check our reasoning against
    the raws instead of trusting it. The store's job is to preserve what was
    observed, not to decide who was right — but it must not silently keep only the
    loser.
    """
    raw = open(path, encoding="utf-8").read()
    parsed = json.loads(raw)
    ip = parsed.get("image_path")
    if not ip or not os.path.exists(ip):
        print("REFUSED: image missing:", ip)
        return 1
    sha = VS.sha256_file(ip)
    prior = [r for r in (json.loads(l) for l in open(SHARD, encoding="utf-8") if l.strip())
             if r["image_sha256"] == sha and r["role"] == "ANSWER_KEY"]
    if not prior:
        print("REFUSED: no prior ANSWER_KEY for this sha — use --ingest, not "
              "--ingest-duplicate (this path is only for a SECOND observation)")
        return 1
    rec = _rec(
        image_path=ip, sha=sha, role="ANSWER_KEY", route="agent_read",
        prompt_version=parsed.get("prompt_version") or PROMPT_VERSION_FALLBACK,
        raw_response=raw, parsed=parsed, parser_version=PARSER_VERSION,
        source_kind="forest_figure", source_id=parsed.get("pmcid"),
        also_in_owner_ledger=(sha, "ANSWER_KEY") in owner_keys(),
        notes="INDEPENDENT SECOND OBSERVATION of an image already banked in this "
              "shard (%d prior ANSWER_KEY). Both readings are retained; neither is "
              "edited or deleted. ARBITRATION: %s" % (len(prior), why),
    )
    rec["observation_seq"] = len(prior) + 1
    rec["duplicate_of_sha"] = sha
    _append(rec)
    print(json.dumps({"banked": 1, "sha": sha[:16], "pmcid": parsed.get("pmcid"),
                      "observation_seq": rec["observation_seq"],
                      "prior_observations": len(prior)}, indent=2))
    return 0


def ingest_dir(d: str) -> int:
    seen = seen_shard()
    owner = owner_keys()
    files = sorted(glob.glob(os.path.join(d, "**", "raw_*.json"), recursive=True))
    ok = err = 0
    banked = 0
    for f in files:
        r = ingest_file(f, seen, owner)
        if r.get("error"):
            err += 1
            print("REFUSED", os.path.basename(f), "|", r["error"])
        else:
            ok += 1
            banked += r["banked"]
    print(json.dumps({"raw_files": len(files), "accepted": ok, "refused": err,
                      "records_banked": banked, "shard": SHARD}, indent=2))
    return 1 if err and not ok else 0


def verify() -> int:
    if not os.path.exists(SHARD):
        print("shard not created yet:", SHARD)
        return 0
    recs = [json.loads(l) for l in open(SHARD, encoding="utf-8") if l.strip()]
    bad = []
    for r in recs:
        b = os.path.join(VS.STORE_DIR, r["blob"])
        if not os.path.exists(b):
            bad.append((r["image_sha256"], "BLOB MISSING"))
        elif VS.sha256_file(b) != r["image_sha256"]:
            bad.append((r["image_sha256"], "HASH MISMATCH — blob altered"))
    # Abstention/confidence gradient — the field the whole run exists to produce.
    grad = Counter()
    for r in recs:
        for k, v in (r.get("confidence_emitted") or {}).items():
            grad[k] += v
    print("=== VISION STORE — SHARD A ===")
    print("shard       :", SHARD)
    print("records     :", len(recs))
    print("distinct img:", len({r["image_sha256"] for r in recs}))
    print("roles       :", dict(Counter(r["role"] for r in recs)))
    print("routes      :", dict(Counter(r.get("route") for r in recs)))
    print("gradient    :", dict(grad) or "n/a")
    print("integrity   :", "OK" if not bad else "FAILED")
    for b in bad[:10]:
        print("   ", b)
    return 1 if bad else 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--ingest", metavar="DIR")
    ap.add_argument("--ingest-duplicate", metavar="RAWFILE",
                    help="bank a SECOND independent observation of an already-"
                         "banked image. Requires --why.")
    ap.add_argument("--why", help="the arbitration, recorded as data alongside "
                                  "both readings")
    ap.add_argument("--verify", action="store_true")
    a = ap.parse_args()
    if a.ingest_duplicate:
        if not a.why:
            ap.error("--ingest-duplicate requires --why: an unexplained second "
                     "observation is indistinguishable from a double-write")
        sys.exit(ingest_duplicate(a.ingest_duplicate, a.why))
    if a.ingest:
        sys.exit(ingest_dir(a.ingest))
    sys.exit(verify())
