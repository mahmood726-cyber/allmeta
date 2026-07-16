"""Ingest agent-route vision output into the store, and score it.

THE ROUTE THAT WAS OPEN ALL ALONG. 2026-07-16: `ANTHROPIC_API_KEY` is unset, so
a Batch-API job is impossible. That is TRUE about ONE DOOR and was wrongly
reported as "vision is blocked". Claude Code's `Read` tool renders an image to
the model natively — no key, no SDK, billed to the subscription quota that was
already authorised. `route="agent_read"` is recorded on every call so the two
doors can be COMPARED later; a route difference is testable only if logged.

This module never calls a model. It ingests what an agent wrote and scores it
with the existing deterministic checks, so every number is reproducible.

Run: python ingest_agent.py            # ingest data/vision_agent_*.json + score
"""
from __future__ import annotations

import glob
import json
import os
import re
import sys

import config as C
import visionstore as vs

PARSER = "agent_read_structured@2026-07-16"
MODEL = "claude-opus-4-8[1m]"
PROMPT_V = "forestvision.SCHEMA@2026-07-16 + whole-plot capture (trials/weights/het/subtotals/arm-labels)"

# Keys we require. A figure missing them is a CONTRACT failure and is refused,
# not silently coerced — a silent-failure sentinel is worse than an exception.
REQ = ("image_path", "figure_kind", "rows", "reading_notes")


def _raw(fig):
    """The subagent's own JSON for this figure, VERBATIM. No paraphrase.

    ⚠️ WHY THIS IS NOT A RE-RENDERING. An earlier cut of this function
    reconstructed a prose-ish text from the parsed fields. That put a
    SUMMARISING LAYER between the model and the disk — which is precisely how
    HEADTOHEAD.md's "hand-simulated, do not cite as a real API call" disclosure
    got stripped on 2026-07-16: a paraphraser dropped a caveat stated THREE
    times. Never put a paraphraser between vision and disk.

    On this route the agent EMITS JSON as its output, so that JSON *is* the raw
    completion for this figure. We serialise the object exactly as received
    (sort_keys=False preserves the agent's own key order; ensure_ascii=False
    preserves its glyphs, e.g. I² vs I2, which is itself evidence of what it
    saw). Nothing is dropped, reordered, or reworded.
    """
    return json.dumps(fig, ensure_ascii=False, indent=1)


def checksum(fig):
    """N-column checksum, subgroup-scoped. Returns (ok_cols, mismatch, cells).

    Scoped to the row's OWN subgroup: comparing a panel-B total against panel
    A+B's studies manufactures mismatches on correctly-read figures (the bug
    forestscore.py already had and fixed).
    """
    rows = fig.get("rows") or []
    ok = mm = cells = 0
    subs = {r.get("subgroup") for r in rows}
    for sg in subs:
        st = [r for r in rows if r.get("row_type") == "study" and r.get("subgroup") == sg]
        tt = [r for r in rows if r.get("row_type") in ("subtotal", "total")
              and r.get("subgroup") == sg]
        if not st or not tt:
            continue
        for arm in ("n_t", "n_c"):
            vals = [r.get(arm) for r in st]
            if not vals or any(v is None for v in vals):
                continue          # partial column cannot luck into a pass
            tv = [t.get(arm) for t in tt if t.get(arm) is not None]
            if len(tv) != 1:
                continue
            if sum(vals) == tv[0]:
                ok += 1; cells += len(vals)
            else:
                mm += 1
    return ok, mm, cells


def main():
    figs = []
    for f in sorted(glob.glob(os.path.join(C.DATA, "vision_agent_*.json"))):
        try:
            d = json.load(open(f, encoding="utf-8"))
        except Exception as e:
            print("BAD JSON, skipped:", f, e); continue
        figs += d if isinstance(d, list) else [d]

    stored = dup = bad = 0
    tot_ok = tot_mm = tot_cells = 0
    from collections import Counter
    kinds, conf = Counter(), Counter()
    refused = []
    for fig in figs:
        miss = [k for k in REQ if k not in fig]
        if miss:
            print("CONTRACT FAIL, refused:", fig.get("image_path"), "missing", miss)
            bad += 1; continue
        ip = fig["image_path"]
        if not os.path.exists(ip):
            print("image missing, refused:", ip); bad += 1; continue

        kinds[fig["figure_kind"]] += 1
        for r in fig["rows"]:
            if r.get("row_type") == "study":
                conf[r.get("confidence")] += 1
        if fig["figure_kind"] in ("unreadable", "not_a_forest_plot"):
            refused.append((os.path.basename(ip), fig["figure_kind"]))
        o, m, c = checksum(fig)
        tot_ok += o; tot_mm += m; tot_cells += c

        rec = vs.record(image_path=ip, role="ANSWER_KEY", route="agent_read",
                        model_id=MODEL, prompt_version=PROMPT_V,
                        raw_response=_raw(fig), parsed=fig, parser_version=PARSER,
                        source_kind="forest_figure", source_id=fig.get("pmcid"),
                        notes="AGENT-ROUTE vision call via Read tool (no API key). "
                              "Whole-plot capture. tokens/cost unmeasurable on this route.")
        if rec:
            stored += 1
        else:
            dup += 1

    print("=== AGENT-ROUTE INGEST ===")
    print("figures seen     :", len(figs))
    print("stored           :", stored, "| already present:", dup, "| refused:", bad)
    print("figure_kind      :", dict(kinds))
    print("study-row conf   :", dict(conf), " <- the GRADIENT; must VARY")
    print("N checksum       : %d reconciling cols, %d mismatch, %d N cells validated"
          % (tot_ok, tot_mm, tot_cells))
    if refused:
        print("model REFUSED    :", refused, " <- abstention, a correct answer")
    return 0


if __name__ == "__main__":
    sys.exit(main())
