"""INGEST — subagent vision returns (data/_visionraw/*.json) -> shard B.

THE POINT OF THIS FILE IS THAT IT IS DUMB. It parses and it maps; it never
rewrites, rounds, corrects, or "tidies" a value. Tonight a Claude summariser
stripped a disclosure its source stated three times: a summarising layer is how
evidence becomes folklore. So the pipeline is:

    subagent reads image (vision)
        -> subagent WRITES ITS OWN return to data/_visionraw/<batch>.json
        -> this script stores that FILE'S BYTES as raw_response
        -> shard B

The orchestrator never retypes a number. The subagent writing its own file (not
the orchestrator transcribing it out of a tool result) removes the last human-
shaped link where a paraphrase could enter, and keeps a 30KB payload out of the
orchestrator's context so the tokens buy figures instead of echo.

raw_response = THE ENTIRE FILE, VERBATIM, for every record derived from it.
Not the pretty-printed re-dump of one element: json.dumps(json.loads(x)) is NOT
x — it renames nothing but it reformats, and a reformat is an edit we would then
be calling "raw". `raw_batch_index` says which element of the array a record is
about. The duplication is deliberate and cheap; a re-buy is neither.

ONE CALL -> TWO RECORDS. A single read answers two different questions about the
same pixels, so we write both roles and give them a shared `call_group`. The
store's ROW count is therefore not a CALL count — `call_group` is. Recording it
as two calls would inflate our own denominator, which is the exact species of
error this project exists to find in other people's work.

`parsed` carries the WHOLE figure doc under BOTH roles, with `role_scope` naming
the rows that role actually claims. Splitting the doc per role would silently
drop data (a subtotal is both a pooled cell AND evidence of conduct), and a
lossy store is worth less than a duplicated one. The role tags THE QUESTION; it
is not a filter over the pixels.

Usage: python ingest_raw.py --dir data/_visionraw [--dry-run]
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import sys

import shardwrite as S

# The subagent cannot self-report its billing identity, so we record what we know
# and flag what we inferred rather than asserting a model id it never emitted.
MODEL_ID = ("claude-opus-4-8[1m]/general-purpose-subagent"
            "(inherited from session model; NOT self-reported by the subagent)")
# PIN THE SPEC VERSION INTO EVERY RECORD. v1 reads were taken at NATIVE
# resolution on a corpus that is 92.6% sub-800px; v2 mandates >=4x LANCZOS
# upscaling before transcription. A v1 and a v2 record of the same figure are NOT
# the same measurement and must never be pooled silently — a demonstrated v1
# failure (mean 12 misread as the SD, 7.7, at confidence "high") is invisible
# inside v1's own gradient. The version string is how a later reader tells them
# apart; without it the store looks homogeneous and is not.
PROMPT_VERSION = ("shardB/forest_full_capture@2026-07-16-v2"
                  "+abstain+per_field_conf+mandatory_zoom+no_checksum_backsolve")
PROMPT_VERSION_V1 = ("shardB/forest_full_capture@2026-07-16"
                     "+abstain+per_field_conf")   # native-res reads; see above
PARSER_VERSION = "ingest_raw/v1"

ANSWER_KEY_SCOPE = ["subtotal", "total", "heterogeneity"]
BEHAVIOURAL_SCOPE = ["study", "subgroup_header", "subtotal", "total",
                     "heterogeneity", "other"]


def load_index() -> dict:
    """(pmcid, image_file) -> on-disk figure record from the work list."""
    idx = {}
    for f in ("data/_worklist_all.json", "data/_worklist_todo.json"):
        if not os.path.exists(f):
            continue
        for r in json.load(open(f, encoding="utf-8")):
            idx[(r["pmcid"], r["fn"])] = r
    return idx


def ingest_file(path: str, idx: dict, dry: bool = False) -> tuple:
    raw_text = open(path, encoding="utf-8").read()   # THE evidence. Never re-dumped.
    try:
        docs = json.loads(raw_text)
    except json.JSONDecodeError as e:
        print("  !! UNPARSEABLE (raw kept on disk, nothing written):", path, e,
              file=sys.stderr)
        return (0, 0, 1)
    if isinstance(docs, dict):
        docs = [docs]
    batch = os.path.splitext(os.path.basename(path))[0]
    wrote = skipped = failed = 0
    for i, doc in enumerate(docs):
        pmcid = doc.get("pmcid")
        # Subagents return image_file as a basename OR a full path (the spec asks
        # for a basename; some answer with what they were handed). Normalise
        # rather than "fixing" the raw: the raw is evidence and stays untouched,
        # and a lookup that silently misses would DROP a bought call — the
        # expensive failure mode. Never let a cosmetic mismatch discard evidence.
        fn = os.path.basename((doc.get("image_file") or "").replace("\\", "/"))
        rec = idx.get((pmcid, fn))
        if rec is None:
            # Do not guess which image this was. An unattributable reading is not
            # evidence — it is a number with no referent, which is the disease.
            print("  !! NO IMAGE MATCH for %r / %r in %s — skipped"
                  % (pmcid, fn, path), file=sys.stderr)
            failed += 1
            continue
        call_group = "%s#%d" % (batch, i)
        # Version from EVIDENCE IN THE RECORD, not from when this script ran.
        # `read_method` only exists in the v2 spec, so its presence is the reading
        # itself testifying to how it was made. Stamping v2 on a batch merely
        # because the file is ingested after the spec changed would be a lie about
        # provenance — and the whole point of the store is that provenance is not
        # reconstructable after the fact.
        pv = PROMPT_VERSION if doc.get("read_method") else PROMPT_VERSION_V1
        for role, scope in (("ANSWER_KEY", ANSWER_KEY_SCOPE),
                            ("BEHAVIOURAL_RECORD", BEHAVIOURAL_SCOPE)):
            item = dict(
                image_path=rec["path"],
                role=role,
                model_id=MODEL_ID,
                prompt_version=pv,
                raw_response=raw_text,
                route="agent_read",
                parsed=doc,
                parser_version=PARSER_VERSION,
                source_kind="forest_figure",
                source_id="%s#%s" % (pmcid, fn),
                call_group=call_group,
                notes=json.dumps({
                    "raw_batch_file": os.path.basename(path),
                    "raw_batch_index": i,
                    "role_scope": scope,
                    "role_scope_note":
                        "parsed holds the WHOLE figure doc; role_scope names the "
                        "rows this role claims. ANSWER_KEY rows are HELD OUT of "
                        "any recovery numerator — reading a cell off the plot is "
                        "copying the answer, not recovering it.",
                    "call_group_note":
                        "Both roles come from ONE bought vision call. Count "
                        "call_group, not rows.",
                    "topic": rec.get("topic"),
                    "article_title": rec.get("title"),
                    "figscan_caption": (rec.get("caption") or "")[:400],
                }, ensure_ascii=False),
            )
            if dry:
                print("  DRY %s %s %s" % (role, pmcid, fn))
                continue
            try:
                if S.record(**item) is None:
                    skipped += 1
                else:
                    wrote += 1
            except Exception as e:
                print("  !! WRITE FAILED", pmcid, fn, role, e, file=sys.stderr)
                failed += 1
    return (wrote, skipped, failed)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default="data/_visionraw")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    idx = load_index()
    W = K = F = 0
    files = sorted(glob.glob(os.path.join(a.dir, "*.json")))
    for f in files:
        w, k, fl = ingest_file(f, idx, a.dry_run)
        W += w; K += k; F += fl
        print("%-52s wrote=%-3d skip=%-3d fail=%d" % (os.path.basename(f), w, k, fl))
    print("\nbatches=%d | records written=%d | idempotent skips=%d | failures=%d"
          % (len(files), W, K, F))
    return 1 if F else 0


if __name__ == "__main__":
    sys.exit(main())
