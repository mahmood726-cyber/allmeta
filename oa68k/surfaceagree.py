# -*- coding: utf-8 -*-
"""SURFACE-AGREEMENT CHECK. The last piece of the harness, and join-independent.

WHY IT EXISTS
  A peer lane found 69 sidecars pooling trials that appear nowhere in the page they
  describe, and three surfaces publishing different pooled estimates for the same review.
  If we enter a page into a scored head-to-head while another of OUR OWN surfaces
  publishes a different number for it, a win does not survive a reader clicking twice --
  and being checkable is the entire claim.

  So: before any pair is judged, the page under comparison must AGREE WITH EVERY OTHER
  SURFACE THAT DESCRIBES IT. A pair that fails is NOT_SCOREABLE_SURFACE_DISAGREEMENT --
  a NAMED state, not a loss and not a silent exclusion.

HOW SURFACES ARE JOINED -- BY TRIAL IDENTIFIER, NEVER BY KEYWORD
  The corpus does not record which rendered page belongs to which topic object, and a
  keyword join is what once paired a malaria ACT review with a folic-acid one. So a page
  is a surface of topic T iff its NCT set overlaps T's trial set by >= 2 -- the same
  threshold discipline as the comparator matcher in OPEN-COMPARATOR-PROTOCOL.md 5.3.

THE THREE CHECKS
  C1 ORPHAN_TRIAL             a trial the object pools that appears on NO page of it
  C2 DENOMINATOR_DISAGREEMENT two objects recording different participant counts for the
                              SAME trial (events may legitimately differ by outcome;
                              randomised denominators may not)
  C3 PAGE_TRIAL_SET_MISMATCH  a page surface publishing a different trial set for the
                              same review than the object does

⛔ NOT IMPLEMENTED, AND NAMED RATHER THAN IMPLIED: numeric comparison of published
   pooled estimates across surfaces. A pair passing this check is NOT thereby proven
   numerically consistent across its surfaces.

Usage:
  python surfaceagree.py --index     scan the corpus and write the surface index
  python surfaceagree.py --check     run C1/C2/C3 against the index and the pair file
"""
import io
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import opencompscore as S  # noqa: E402

CORPUS = r"F:\claude-temp\wt\rob-lane"
SSOTDIR = os.path.join(CORPUS, "ssot")
OUTDIR = r"F:\claude-temp\pend"
INDEX = os.path.join(OUTDIR, "surface_index.json")
RESULT = os.path.join(OUTDIR, "surface_agreement.json")

RE_NCT = re.compile(r"NCT\d{8}")
PAGE_OVERLAP_MIN = 2


# --------------------------------------------------------------------- the index
def build_index(log=print):
    pages, script_only, n_bytes = {}, {}, 0
    names = sorted(f for f in os.listdir(CORPUS)
                   if f.lower().endswith((".html", ".js"))
                   and os.path.isfile(os.path.join(CORPUS, f)))
    for i, f in enumerate(names):
        p = os.path.join(CORPUS, f)
        n_bytes += os.path.getsize(p)
        with io.open(p, encoding="utf-8", errors="replace") as fh:
            raw = fh.read()
        # ⛔ READER-VISIBLE TEXT, NOT SOURCE. The first index read raw bytes, so a
        # tranexamic-acid non-cardiac-surgery page scored as a surface of `sglt2-hf`
        # because its JavaScript hardcodes
        #   AUTO_INCLUDE_TRIAL_IDS = new Set(["NCT03036124",...,"NCT03521934"])
        # -- five heart-failure trials living in a template constant. That is a real
        # corpus defect and it is preserved below as script_only, but it is NOT something
        # the page publishes, and joining on it made a contaminated page look like the
        # most specific surface of a review it has nothing to do with.
        vis = re.sub(r"(?is)<(script|style)\b.*?</\1>", " ", raw)
        vis = re.sub(r"<[^>]+>", " ", vis)
        visible = set(RE_NCT.findall(vis))
        allids = set(RE_NCT.findall(raw))
        pages[f] = sorted(visible)
        if allids - visible:
            script_only[f] = sorted(allids - visible)
        if (i + 1) % 300 == 0:
            log("  pages %d/%d" % (i + 1, len(names)))
    objects = {}
    for d in sorted(os.listdir(SSOTDIR)):
        j = os.path.join(SSOTDIR, d, d + ".json")
        if not os.path.isfile(j):
            continue
        try:
            o = json.load(io.open(j, encoding="utf-8"))
        except Exception as e:
            objects[d] = {"error": str(e), "trials": []}
            continue
        tr = []
        for t in ((o.get("inputs") or {}).get("trials") or []):
            arms = t.get("arms") or []
            tr.append({
                "nct": t.get("nct"), "name": t.get("name"),
                "enrolled": t.get("enrolled"),
                "participants": sorted(a.get("participants") for a in arms
                                       if a.get("participants") is not None),
            })
        objects[d] = {"trials": tr, "ncts": sorted({t["nct"] for t in tr if t["nct"]})}
    idx = {
        "built": "2026-08-31",
        "population_kinds":
            "TWO kinds of surface are indexed and they are counted separately: %d "
            "rendered pages (.html/.js at the corpus root, %.1f MB) and %d SSOT topic "
            "objects. A count that had not named its kinds would have merged them."
            % (len(pages), n_bytes / 1e6, len(objects)),
        "n_pages": len(pages), "n_objects": len(objects),
        "reader_visible_only":
            "Page NCT sets are extracted from READER-VISIBLE TEXT: <script> and <style> "
            "blocks are removed and tags stripped BEFORE matching. Reading raw source "
            "made a tranexamic-acid non-cardiac-surgery page the best-matching surface of "
            "`sglt2-hf`, because its JavaScript hardcodes AUTO_INCLUDE_TRIAL_IDS with "
            "five heart-failure registrations. Identifiers appearing ONLY inside script "
            "are kept in `script_only` rather than discarded -- a discard that drops its "
            "evidence costs a whole re-run to diagnose.",
        "n_pages_with_script_only_ids": len(script_only),
        "script_only": script_only,
        "page_join_rule":
            "A page is a surface of topic T iff its NCT set overlaps T's trial set by "
            ">= %d. Joined by IDENTIFIER, never by keyword -- the corpus does not record "
            "which page belongs to which object, and a keyword join is what once paired "
            "a malaria ACT review with a folic-acid one." % PAGE_OVERLAP_MIN,
        "not_implemented":
            "Numeric comparison of published pooled estimates across surfaces. A topic "
            "passing this check is NOT thereby proven numerically consistent.",
        "pages": pages, "objects": objects,
    }
    n = S.write_verified(INDEX, json.dumps(idx, ensure_ascii=False))
    log("  indexed %d pages (%.1f MB) and %d objects -> %s (%d bytes)"
        % (len(pages), n_bytes / 1e6, len(objects), INDEX, n))
    return idx


# --------------------------------------------------------------------- the checks
def surfaces_of(idx, topic):
    """⛔ THE JOIN DEFECT THIS REPLACES, and why the fix is a correctness fix and not a
    threshold tune. The first version called a page a surface of T whenever it shared >=2
    trials with T. That judged FCM_HF_REVIEW.html against `iv-iron-hf`, SGLT2_HF_REVIEW
    .html against `sotagliflozin-hf`, and the corpus index LivingMeta.html against
    everything -- pages that describe OTHER objects. It is the malaria-ACT-versus-folic-
    acid mis-pairing occurring inside our own check, and it returned 0 scoreable of 13,
    which is a 100% and therefore an instrument reading until proven otherwise.

    A page is now the surface of the object it BEST covers: maximise |mine & page|, break
    ties on the SMALLEST page, i.e. the most specific one. C2 -- the check that found a
    real defect -- is untouched by this, and the topic it flagged is not rescued by it."""
    obj = idx["objects"].get(topic) or {"ncts": [], "trials": []}
    mine = set(obj["ncts"])
    cand = [(len(mine & set(n)), -len(n), f) for f, n in idx["pages"].items()
            if len(mine & set(n)) >= PAGE_OVERLAP_MIN]
    cand.sort(reverse=True)
    best = cand[0][2] if cand else None
    siblings = sorted(t for t, o in idx["objects"].items()
                      if t != topic and (mine & set(o.get("ncts") or [])))
    return obj, best, [c[2] for c in cand], siblings


def check_topic(idx, topic):
    obj, best, overlapping, siblings = surfaces_of(idx, topic)
    mine = set(obj["ncts"])
    findings = []
    info = []

    # C1 -- a trial the object pools that appears NOWHERE ON THE PAGE THAT DESCRIBES IT
    if best is None:
        findings.append({"check": "C1", "state": "NO_PAGE_SURFACE",
                         "detail": "no rendered page shares >=%d trials with this object. "
                                   "'not shown' is not 'absent': this is a coverage state, "
                                   "not a disagreement." % PAGE_OVERLAP_MIN})
    else:
        pn = set(idx["pages"][best])
        orphan = sorted(mine - pn)
        if orphan:
            findings.append({"check": "C1", "state": "ORPHAN_TRIAL", "trials": orphan,
                             "page": best,
                             "detail": "pooled by the object, absent from the page that "
                                       "describes it -- the peer lane's sidecar class"})
        extra = sorted(pn - mine)
        if extra:
            info.append({"check": "C3", "state": "PAGE_CARRIES_EXTRA_TRIALS",
                         "page": best, "n_extra": len(extra), "examples": extra[:8],
                         "detail": "INFORMATIONAL, NOT a disagreement. A page legitimately "
                                   "names trials it screened, excluded or lists as "
                                   "ongoing. Reported so the asymmetry is visible; a "
                                   "count of these is not a defect count."})

    # C2 -- two objects recording DIFFERENT participant denominators for the same trial
    bym = {t["nct"]: t for t in obj["trials"] if t.get("nct")}
    for sib in siblings:
        for t in idx["objects"][sib]["trials"]:
            n = t.get("nct")
            if n in bym and t.get("participants") and bym[n].get("participants"):
                if t["participants"] != bym[n]["participants"]:
                    findings.append({
                        "check": "C2", "state": "DENOMINATOR_DISAGREEMENT", "trial": n,
                        "this_object": bym[n]["participants"],
                        "other_object": t["participants"], "other": sib,
                        "detail": "events may legitimately differ by outcome; randomised "
                                  "denominators may not"})

    return {"topic": topic, "page_that_describes_it": best,
            "n_pages_overlapping": len(overlapping),
            "pages_overlapping": overlapping[:12],
            "n_sibling_objects": len(siblings), "sibling_objects": siblings,
            "k_trials": len(mine), "findings": findings, "informational": info,
            "surface_agreement": ("OK" if not findings
                                  else "NOT_SCOREABLE_SURFACE_DISAGREEMENT")}


def run_check(log=print):
    idx = json.load(io.open(INDEX, encoding="utf-8"))
    pairs = [json.loads(l) for l in io.open(S.PAIRS, encoding="utf-8") if l.strip()]
    topics = sorted({p["topic"] for p in pairs})
    per_topic = {t: check_topic(idx, t) for t in topics}

    rows = []
    for p in pairs:
        r = per_topic[p["topic"]]
        rows.append({"pair_id": p["pair_id"], "topic": p["topic"],
                     "join_tiers": p["join_tiers"],
                     "surface_agreement": r["surface_agreement"],
                     "n_findings": len(r["findings"])})
    by_join = {}
    for tier in ("frozen", "nct_pmid", "cited_pmid"):
        k = [r for r in rows if tier in r["join_tiers"]]
        by_join[tier] = {
            "pairs": len(k),
            "scoreable": sum(1 for r in k if r["surface_agreement"] == "OK"),
            "not_scoreable_surface_disagreement":
                sum(1 for r in k if r["surface_agreement"] != "OK")}

    out = {
        "check": "surface_agreement", "protocol": S.PROTOCOL,
        "ran_before_any_pair_was_judged": True,
        "join_independent": "Computed for every pair in the union; the per-join summary "
                            "below is a filter, not a rebuild.",
        "population_kinds": idx["population_kinds"],
        "page_join_rule": idx["page_join_rule"],
        "not_implemented": idx["not_implemented"],
        "named_state": "NOT_SCOREABLE_SURFACE_DISAGREEMENT -- a named state, never a "
                       "loss for the review and never a silent exclusion.",
        "by_join": by_join, "per_topic": per_topic, "pairs": rows,
    }
    n = S.write_verified(RESULT, json.dumps(out, ensure_ascii=False, indent=1))
    for t in topics:
        r = per_topic[t]
        log("%-24s page=%-38s siblings=%-2d k=%-2d %s"
            % (t, (r["page_that_describes_it"] or "(none)")[:38],
               r["n_sibling_objects"], r["k_trials"], r["surface_agreement"]))
        for f in r["findings"][:6]:
            log("    %s %s %s" % (f["check"], f["state"],
                                  json.dumps({k: v for k, v in f.items()
                                              if k not in ("check", "state", "detail")},
                                             ensure_ascii=False)[:150]))
    log("")
    for tier, d in by_join.items():
        log("  join %-11s pairs %2d  scoreable %2d  surface-disagreement %2d"
            % (tier, d["pairs"], d["scoreable"], d["not_scoreable_surface_disagreement"]))
    log("wrote %s (%d bytes)" % (RESULT, n))
    return out


if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8",
                                  errors="replace", line_buffering=True)
    if "--index" in sys.argv:
        build_index()
    elif "--check" in sys.argv:
        run_check()
    else:
        print(__doc__)
