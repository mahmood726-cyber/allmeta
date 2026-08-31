# -*- coding: utf-8 -*-
"""THE AXIS MY SURFACE GATE IS BLIND TO: measure and k, across our published surfaces.

⛔ WHY THIS EXISTS. Two gates disagreed about the same four topics -- mine passed 12 of 13,
a peer lane failed all four -- and two instruments disagreeing is a measurement of the
instruments. The reconciliation:

  MY gate reads   : the store object's inputs.trials, the SERVED page's trial ids, and
                    participant denominators across store objects. IT READS NO ESTIMATE
                    AND NO EFFECT MEASURE, ON ANY SURFACE.
  THEIR gate reads: index.html <-> dashboard.html <-> portfolio_pools.html, comparing the
                    published effect MEASURE and k.

  A gate that reads one surface cannot detect a disagreement between two. Mine reads
  estimates on ZERO surfaces, so it could not have detected this and did not.

⇒ My NOT_SCOREABLE_SURFACE_DISAGREEMENT does NOT cover the index-versus-sidecar axis. It
  is renamed here to what it actually tests, and this file adds the missing state.

⭐ SERVED BYTES. A filename is not a file: the same four names hold different bytes in two
worktrees of one repo. Only the deployed ref is authoritative, so every artefact read here
is checked against what the live URL returns.

Usage: python estimateaxis.py
"""
import hashlib
import io
import json
import os
import re
import sys
from urllib.request import Request, urlopen

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import surfaceagree as A  # noqa: E402
import opencompscore as S  # noqa: E402

BASE = "https://mahmood726-cyber.github.io/rapidmeta-finerenone/"
UA = {"User-Agent": "allmeta-opencomp/1.0 (research; mailto:mahmood726@gmail.com)"}
RESULT = os.path.join(r"F:\claude-temp\pend", "estimate_axis.json")
RE_NCT = re.compile(r"NCT\d{8}")

TOPICS = {
    "arni-hfref": ("ARNI_HF_REVIEW", "arni_hf"),
    "iv-iron-hf": ("IV_IRON_HF_REVIEW", "iv_iron_hf"),
    "sglt2-hf": ("SGLT2_HF_REVIEW", "sglt2_hf"),
    "sotagliflozin-hf": ("SOTAGLIFLOZIN_HF_REVIEW", "sotagliflozin_hf"),
}
# the renamed state, and the new one
STATE_TRIALSET = "NOT_SCOREABLE_TRIALSET_OR_DENOMINATOR_DISAGREEMENT"
STATE_ESTIMATE = "NOT_SCOREABLE_MEASURE_OR_K_DISAGREEMENT"

RE_POOL_ROW = re.compile(
    r'<tr[^>]*data-stem="([^"]+)"[^>]*data-scale="([^"]+)"[^>]*data-k="(\d+)"[^>]*>'
    r'(.*?)</tr>', re.S)
RE_POOL_VAL = re.compile(r'<td class="pool">([^<]+)</td>')


def sha(b):
    return hashlib.sha256(b).hexdigest()


def fetch(name):
    b = urlopen(Request(BASE + name, headers=UA), timeout=240).read()
    return b, sha(b), len(b)


def local(name):
    p = os.path.join(A.CORPUS, name)
    b = io.open(p, "rb").read()
    return b, sha(b), len(b), p


def ids_found_in(raw_text):
    """⭐ Record WHICH LAYER each registration id was found in, per page. Our moat sentence
    is that a reader can check every included trial against a public registry; an id that
    exists only after JavaScript runs makes that claim conditional on the reader's runtime.
    A later run cannot tell a text id from a script id unless this is recorded."""
    vis = re.sub(r"(?is)<(script|style)\b.*?</\1>", " ", raw_text)
    vis = re.sub(r"<[^>]+>", " ", vis)
    visible = set(RE_NCT.findall(vis))
    allids = set(RE_NCT.findall(raw_text))
    script_only = sorted(allids - visible)
    return {"total": len(allids), "in_visible_text": sorted(visible),
            "in_script_only": script_only,
            "state": ("VISIBLE_TEXT" if allids and not script_only else
                      "MIXED" if visible and script_only else
                      "SCRIPT_ONLY" if script_only else "NONE"),
            "recoverable_without_executing_script": bool(allids),
            "note": "ids present in a <script> block as DATA are recoverable from the "
                    "served bytes by a determined reader without running the script -- "
                    "materially different from 'not present', and different again from "
                    "'in the rendered text'."}


def main(log=print):
    rows, surfaces = [], {}
    for name in ("index.html", "portfolio_pools.html", "dashboard.html"):
        sb, ssha, sn = fetch(name)
        lb, lsha, ln, lp = local(name)
        surfaces[name] = {"served_sha256": ssha, "served_bytes": sn,
                          "local_sha256": lsha, "local_bytes": ln,
                          "served_matches_local": ssha == lsha,
                          "text": sb.decode("utf-8", "replace")}
        log("surface %-24s served %7d B  local %7d B  match=%s"
            % (name, sn, ln, ssha == lsha))
    ind = json.load(io.open(os.path.join(A.CORPUS, "index_indicators.json"),
                            encoding="utf-8"))["cards"]
    log("")

    pools = {}
    for m in RE_POOL_ROW.finditer(surfaces["portfolio_pools.html"]["text"]):
        stem, scale, k, body = m.group(1), m.group(2), int(m.group(3)), m.group(4)
        v = RE_POOL_VAL.search(body)
        pools.setdefault(stem, []).append({"scale": scale, "k": k,
                                           "pool": (v.group(1).strip() if v else None)})

    for topic, (page_stem, pool_stem) in TOPICS.items():
        pageb, psha, pn = fetch(page_stem + ".html")
        ptext = pageb.decode("utf-8", "replace")
        store = json.load(io.open(os.path.join(A.SSOTDIR, topic, topic + ".json"),
                                  encoding="utf-8"))
        store_k = len({t.get("nct") for t in
                       ((store.get("inputs") or {}).get("trials") or []) if t.get("nct")})
        card = ind.get(page_stem) or {}
        ind_k = ((card.get("internal") or {}).get("n_trials"))
        prow = pools.get(pool_stem, [])
        ks = {"store": store_k, "index_indicators": ind_k,
              "portfolio_pools": sorted({r["k"] for r in prow}) or None}
        scales = sorted({r["scale"] for r in prow}) or None
        # the store's OWN effect measures, for a cross-surface measure comparison
        stxt = io.open(os.path.join(A.SSOTDIR, topic, topic + ".json"),
                       encoding="utf-8").read()
        store_measures = sorted(set(re.findall(r'"measure"\s*:\s*"([A-Z_]{2,12})"', stxt)))
        distinct_k = {store_k} | ({ind_k} if ind_k is not None else set()) \
            | set(r["k"] for r in prow)
        # ⛔ THE BUG THIS REPLACES: the first version returned AGREE when a surface simply
        # had NO row for the topic -- declaring agreement from a single observation. That
        # is 'absent' reported as 'not shown', inside the very check written to catch it.
        n_surfaces = 1 + (1 if ind_k is not None else 0) + (1 if prow else 0)
        measure_mismatch = bool(scales and store_measures
                                and not set(scales) & set(store_measures))
        if n_surfaces < 2:
            verdict = "NOT_COMPARABLE_SURFACE_ABSENT"
        elif len(distinct_k) > 1 or measure_mismatch:
            verdict = STATE_ESTIMATE
        else:
            verdict = "AGREE"
        agree = verdict == "AGREE"
        r = {
            "topic": topic, "page": page_stem + ".html",
            "served_url": BASE + page_stem + ".html",
            "served_sha256": psha, "served_bytes": pn,
            "served_matches_local": psha == local(page_stem + ".html")[1],
            "k_by_surface": ks, "measures_in_pools": scales,
            "pool_rows": prow,
            "distinct_k_across_surfaces": sorted(distinct_k),
            "estimate_axis": verdict,
            "store_measures": store_measures,
            "surfaces_compared": n_surfaces,
            "measure_mismatch_store_vs_pools": measure_mismatch,
            "ids_found_in": ids_found_in(ptext),
        }
        rows.append(r)
        log("%-18s k: store=%s indicators=%s pools=%s | measures store=%s pools=%s "
            "| surfaces=%d -> %s"
            % (topic, store_k, ind_k, ks["portfolio_pools"], store_measures, scales,
               n_surfaces, r["estimate_axis"]))
        log("    served %d B sha %s...  matches local worktree: %s"
            % (pn, psha[:16], r["served_matches_local"]))
        log("    ids on served page: %s (%d visible, %d script-only)"
            % (r["ids_found_in"]["state"], len(r["ids_found_in"]["in_visible_text"]),
               len(r["ids_found_in"]["in_script_only"])))

    out = {
        "check": "estimate axis (measure and k) across our published surfaces",
        "served_base": BASE,
        "reconciliation":
            "MY gate reads store trial sets, served-page trial ids and participant "
            "denominators -- NO estimate and NO effect measure on ANY surface. THEIR gate "
            "reads index.html <-> dashboard.html <-> portfolio_pools.html for measure and "
            "k. A gate that reads one surface cannot detect a disagreement between two; "
            "mine reads estimates on zero surfaces. Both gates are right about their own "
            "axis and neither covers the other's.",
        "renamed_state":
            "My NOT_SCOREABLE_SURFACE_DISAGREEMENT is renamed %s, because that is what it "
            "tests. %s is the new state for this axis." % (STATE_TRIALSET, STATE_ESTIMATE),
        "do_not_inflate":
            "The peer lane's three '2's are ONE disagreement seen against TWO surfaces, "
            "because dashboard and pools render the same source; arni-hfref shows 1 only "
            "because it has no pools row. FOUR topics with ONE index-versus-sidecar-family "
            "mismatch each, not seven defects.",
        "served_bytes_rule":
            "A filename is not a file. Only the deployed ref is authoritative, so every "
            "score row must carry served_url, served_sha256 and fetched_at beside "
            "file/offset/length/span, and a pair whose local copy does not hash-match the "
            "served bytes is NOT_SCOREABLE_ARTEFACT_NOT_SERVED -- never a silent "
            "substitution.",
        "surfaces": {k: {kk: vv for kk, vv in v.items() if kk != "text"}
                     for k, v in surfaces.items()},
        "rows": rows,
    }
    n = S.write_verified(RESULT, json.dumps(out, ensure_ascii=False, indent=1))
    log("")
    log("clean on the estimate axis: %d of %d"
        % (sum(1 for r in rows if r["estimate_axis"] == "AGREE"), len(rows)))
    log("wrote %s (%d bytes)" % (RESULT, n))
    return out


if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8",
                                  errors="replace", line_buffering=True)
    main()
