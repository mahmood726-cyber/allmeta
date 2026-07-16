"""Stage 3 (LAPTOP) — TIER-2 off-corpus extraction via agy→Gemini.

The true bottleneck: trials cited in the metas that have NO registry 2×2 (not
results-posted, or absent from the AACT snapshot). Their numbers live only in prose.
This module, run on the LAPTOP with the agy (Gemini 3.1 Pro) seat, extracts the 2×2
from the trial's abstract/OA full text.

Panel discipline (fail-closed): agy-Gemini is ONE family (google). A number ships
only on ≥2-family agreement. The laptop alone therefore produces **single-family
candidates**, written with `needs_second_family=true`; pc1 (Claude) or Codex (when
re-credited) supplies the second vote at merge. A lone agy number is NEVER shipped.

Fleet-auth (memory): Codex OUT OF CREDITS on both seats; agy-Gemini is the alive
non-Claude family. `agy --print` ignores --model; the model is pinned in
~/.gemini/antigravity-cli/settings.json (currently "Gemini 3.1 Pro (High)"). Confirm
liveness with a REAL exec that echoes the family before trusting a run.

Run (on laptop):  OA68K_NODE=laptop python tier2_extract.py --limit 100
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess

import config as C
from net import append_jsonl, load_done_keys

PROMPT = (
    "You are extracting a 2x2 for meta-analysis from a trial abstract. Return STRICT "
    "JSON only: {\"outcome\":str,\"events_t\":int|null,\"n_t\":int|null,"
    "\"events_c\":int|null,\"n_c\":int|null,\"present\":bool}. If the primary binary "
    "outcome 2x2 is not stated numerically, set present=false and all counts null. "
    "Do NOT infer. Abstract:\n\n")


def agy_liveness() -> tuple[bool, str]:
    """Real exec that must echo the model family (memory rule)."""
    try:
        out = subprocess.run(["agy", "--print",
                              "Reply with exactly: OK and name your model family."],
                             capture_output=True, text=True, timeout=120)
        txt = (out.stdout or "") + (out.stderr or "")
        alive = "gemini" in txt.lower()
        return alive, txt.strip()[:200]
    except Exception as e:
        return False, repr(e)[:200]


def targets() -> list[dict]:
    """Trials cited in metas that lack a registry 2×2 (need prose extraction)."""
    need = []
    for path in C.node_ledgers("preextract"):
        with open(path, encoding="utf-8") as f:
            for ln in f:
                if not ln.strip():
                    continue
                r = json.loads(ln)
                if not r.get("poolable_registry_2x2", False):
                    need.append({"nct_id": r["nct_id"]})
    return need


def extract_one(abstract: str) -> dict:
    p = subprocess.run(["agy", "--print", PROMPT + abstract[:6000]],
                       capture_output=True, text=True, timeout=180)
    txt = (p.stdout or "").strip()
    m = re.search(r"\{.*\}", txt, re.DOTALL)
    if not m:
        return {"present": False, "raw": txt[:300], "parse_error": True}
    try:
        return json.loads(m.group(0))
    except Exception:
        return {"present": False, "raw": txt[:300], "parse_error": True}


def run(limit: int, fetch_abstract) -> dict:
    alive, banner = agy_liveness()
    if not alive:
        raise SystemExit(f"[tier2] agy-Gemini seat not confirmed live: {banner}")
    print(f"[tier2] agy live: {banner}")
    done = load_done_keys(C.TIER2_LEDGER, "nct_id")
    n = shipped_candidate = 0
    for t in targets():
        if n >= limit:
            break
        if t["nct_id"] in done:
            continue
        abstract = fetch_abstract(t["nct_id"])   # injected: EPMC/PubMed abstract getter
        if not abstract:
            append_jsonl(C.TIER2_LEDGER, {"nct_id": t["nct_id"], "present": False,
                                          "reason": "no_abstract"})
            n += 1
            continue
        res = extract_one(abstract)
        res.update({"nct_id": t["nct_id"], "family": "google:gemini-3.1-pro",
                    "needs_second_family": True, "method": "tier2-prose-panel"})
        append_jsonl(C.TIER2_LEDGER, res)
        n += 1
        shipped_candidate += int(bool(res.get("present")))
    summary = {"processed": n, "with_2x2_candidate": shipped_candidate,
               "note": "single-family candidates; NOT shipped until 2nd family agrees"}
    print(f"[tier2] {summary}")
    return summary


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=100)
    ap.add_argument("--liveness-only", action="store_true")
    a = ap.parse_args()
    if a.liveness_only:
        print(agy_liveness())
    else:
        # abstract getter is wired on the laptop (EPMC/PubMed); kept injectable so
        # this module unit-tests offline and the laptop supplies the real fetcher.
        raise SystemExit("[tier2] provide a fetch_abstract() on the laptop node; see "
                         "LAPTOP-SHARD.md for the wiring.")
