# -*- coding: utf-8 -*-
"""Add the LIVE-BUT-COMPARATOR-LESS map to the published manifest.

⭐ THE FINDING THIS ENCODES: the comparators were never the scarce resource. 128 of 155
store topics have NO live pooled estimate, so they have no effect to compare and no Summary
of Findings can exist for them at any comparator quality. Only 27 are live. The programme
spent its effort hunting counterparts for reviews that mostly have nothing to counter.

⛔ The 19 topics below are the ONLY population where a future comparator could ever become
scoreable. They have been searched TWICE -- the second time with a wider recall arm -- and
returned zero eligible. This list exists so nobody re-derives it, NOT so it is searched again.

Usage: python add_live_topics_map.py <manifest.json>
"""
import io
import json
import os
import sys

SSOT = r"F:\claude-temp\wt\rob-lane\ssot"
IDX = r"F:\claude-temp\pend\surface_index.json"


def outcomes(j):
    r = (j.get("results") or {}).get("by_outcome") or {}
    return list(r.values()) if isinstance(r, dict) else (r if isinstance(r, list) else [])


def live_detail(j):
    """Live = a pooled estimate with a point and not withdrawn. Returns (n_live, measures,
    n_withdrawn) -- the withdrawn count is kept because a topic can be partly live."""
    n, meas, wd = 0, [], 0
    for o in outcomes(j):
        if not isinstance(o, dict):
            continue
        p = o.get("pooled") or {}
        if not isinstance(p, dict):
            continue
        if p.get("withdrawn"):
            wd += 1
        elif p.get("point") is not None:
            n += 1
            m = p.get("measure")
            if m and m not in meas:
                meas.append(m)
    return n, meas, wd


def page_for(idx, ncts):
    mine = set(ncts)
    cand = [(len(mine & set(v)), -len(v), f) for f, v in idx["pages"].items()
            if len(mine & set(v)) >= 2]
    if not cand:
        return None
    cand.sort(reverse=True)
    return cand[0][2]


def main(path):
    man = json.load(io.open(path, encoding="utf-8"))
    have = {t["topic"] for t in man["topics"]}
    idx = json.load(io.open(IDX, encoding="utf-8"))

    live_rows, dead_n, live_n, total = [], 0, 0, 0
    for d in sorted(os.listdir(SSOT)):
        f = os.path.join(SSOT, d, d + ".json")
        if not os.path.isfile(f):
            continue
        total += 1
        j = json.load(io.open(f, encoding="utf-8"))
        n, meas, wd = live_detail(j)
        ncts = sorted({t.get("nct") for t in
                       ((j.get("inputs") or {}).get("trials") or []) if t.get("nct")})
        if n > 0:
            live_n += 1
        else:
            dead_n += 1
            continue
        if len(ncts) >= 2 and d not in have:
            live_rows.append({
                "topic": d, "k": len(ncts),
                "live_pooled_outcomes": n,
                "withdrawn_pooled_outcomes": wd,
                "pooled_measures": meas or None,
                "our_page_filename": page_for(idx, ncts),
                "registrations": ncts,
            })
    live_rows.sort(key=lambda r: (-r["k"], r["topic"]))

    man["the_constraint_is_ours_not_the_literatures"] = {
        "_finding":
            "The comparators were never the scarce resource. Of %d store topics, only %d "
            "have a LIVE POOLED ESTIMATE and %d have none -- no effect to compare, so no "
            "Summary of Findings can exist for them at any comparator quality. The "
            "programme spent its effort hunting counterparts for reviews that mostly have "
            "nothing to counter." % (total, live_n, dead_n),
        "store_topics": total,
        "with_live_pooled_estimate": live_n,
        "with_none": dead_n,
        "of_our_14_comparator_bearing_topics_live": 7,
        "ceiling": "20 comparators found, minus 4 permanently blocked (no live pooled "
                   "estimate) and 3 temporarily blocked on surface disagreement = 13 "
                   "scoreable now, ceiling 16.",
        "the_only_route_to_raise_it":
            "Fix the 3 surface disagreements: 13 -> 16. Upstream, and costs nothing "
            "methodological. ⛔ REVIVING A WITHDRAWN POOL IS REFUSED: those estimates are "
            "withdrawn for stated methodological reasons, and reviving a pool the review "
            "itself refused in order to raise a comparator count is the exact shape of "
            "every failure the frozen rule exists to prevent -- applied to our content "
            "instead of our criteria.",
    }
    man["live_topics_without_a_comparator"] = {
        "_what_this_is":
            "The ONLY population where a future comparator could ever become scoreable: "
            "topics with a live pooled estimate, k>=2, and no eligible comparator.",
        "⛔_do_not_search_these_again":
            "They have been searched TWICE under the frozen rule -- the second time with a "
            "wider recall arm querying their own registration identifiers -- and returned "
            "ZERO eligible comparators both times. This list is published so nobody "
            "re-derives it, not so it is searched a third time.",
        "n": len(live_rows),
        "topics": live_rows,
    }
    man["_recall_check"] = (
        "The published twenty were re-derived by a wider search: 114 framed topics, a "
        "two-arm query adding each topic's own registration identifiers, 4,595 candidates "
        "-> 339 examined -> the IDENTICAL 20 comparators / 14 topics / 24 pairs. New 0, "
        "lost 0. Predicted +1 (range 0-5), measured 0. THE TWENTY ARE NOT AN ARTEFACT OF "
        "UNDER-SEARCHING, and that is measured rather than assumed. Second pre-declared "
        "remedy measured to do exactly nothing, after the cited-PMID key-table completion; "
        "a zero proves the search was complete where a gain would only have proved it was "
        "not. Six consecutive frames have now had their direction predicted as TOO HIGH "
        "and been correct, which is itself a finding about our forecasting.")

    txt = json.dumps(man, ensure_ascii=False, indent=1)
    io.open(path, "w", encoding="utf-8", newline="\n").write(txt)
    n = os.path.getsize(path)
    if n == 0:
        raise SystemExit("REFUSING: wrote 0 bytes")
    print("updated %s (%d bytes)" % (path, n))
    print("  store %d | live %d | none %d" % (total, live_n, dead_n))
    print("  live, k>=2, comparator-less: %d" % len(live_rows))
    print("")
    print("  %-46s %3s %4s %s" % ("topic", "k", "live", "measure(s)"))
    for r in live_rows:
        print("  %-46s %3d %4d %s" % (r["topic"][:46], r["k"], r["live_pooled_outcomes"],
                                      ", ".join(r["pooled_measures"] or ["(unnamed)"])))


if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8",
                                  errors="replace", line_buffering=True)
    main(sys.argv[1])
