# -*- coding: utf-8 -*-
"""THE MECHANICAL RUBRIC. The LLM panel is removed from the scoring path entirely.

WHY THE JUDGE IS GONE (this belongs in the code, not in a chat)
  We argue our advantage is VERIFIABILITY, not authority. A panel of models choosing us is
  exactly the kind of evidence a reader cannot check -- the same thing we criticise
  Cochrane for. A published rubric, with both documents scored against it and this script
  available, is the version of the result that survives someone disagreeing with it.

  There is nothing to blind, because there is no judge.

CONTRACT
  * every criterion is computed from the two documents by THIS script, which a reader
    re-runs. If a criterion needs judgement it is NOT in this rubric -- it is listed in
    RUBRIC.md under NARRATIVE, explicitly not scored.
  * every score carries criterion, verdict, THE SPAN OF TEXT IT WAS DERIVED FROM, and
    file + offset, so a reader who disagrees can point at the sentence.
  * NOT_SCOREABLE_* states survive unchanged from SCORING-PROTOCOL.md.
  * the script's own sha256 is stamped on every row and in the result header. An
    unpublished rubric is an LLM panel with extra steps.

⛔ THE SIX CRITERIA AND THEIR PRISMA ANCHORS ARE UNCHANGED. Changing the criteria at the
   same moment as the scoring method would make both unfalsifiable.

Usage:
  python rubric.py --selftest    exercise every criterion on synthetic strings
  python rubric.py --score       REFUSED until explicitly released; scores no pair
"""
import hashlib
import io
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import opencompscore as S  # noqa: E402

RULE_VERSION = "rubric-1.0.0-2026-08-31"
OUTDIR = r"F:\claude-temp\pend"

# ------------------------------------------------------------------ frozen vocabulary
EFFECT_MEASURE = (r"\b(?:hazard ratios?|HRs?|risk ratios?|RRs?|relative risks?|"
                  r"odds ratios?|ORs?|rate ratios?|incidence rate ratios?|"
                  r"mean differences?|MDs?|standardi[sz]ed mean differences?|SMDs?|"
                  r"risk differences?|absolute risk reductions?)\b")
TIMEPOINT = (r"\b(?:at|by|over|through|to)\s+(?:week|month|year|day)s?\s*\d+|"
             r"\b\d+\s*(?:-|\s)?(?:week|month|year|day)s?\b|"
             r"\bmedian follow[- ]?up\b|\bfollow[- ]?up of\b|\btime[- ]to[- ]first\b")
COMPARATOR = (r"\b(?:versus|vs\.?|compared with|compared to|relative to|"
              r"placebo|control(?:s|\sgroup)?|usual care|standard of care)\b")
CI_NUM = r"\d+\.\d+\s*(?:\(|\[)\s*(?:95\s*%\s*(?:CI|CrI)\s*[:,]?\s*)?\d+\.\d+\s*(?:to|-|–|—|,)\s*\d+\.\d+"
EVENTS_N = r"\b\d{1,6}\s*/\s*\d{1,6}\b"

HET_STAT = r"\bI\s*[²2]\s*=?\s*\d|\btau\s*[²2]\b|\bτ\s*[²2]|\bI-squared\b"
HET_ESTIMATOR = (r"\bDerSimonian(?:\s*(?:and|&|-)\s*Laird)?\b|\bREML\b|"
                 r"\brestricted maximum likelihood\b|\bPaule[- ]Mandel\b|"
                 r"\bmaximum likelihood\b|\bSidik[- ]Jonkman\b|\bEmpirical Bayes\b|"
                 r"\bHartung[- ]?Knapp\b|\bHKSJ\b|\bMantel[- ]Haenszel\b|\bPeto\b|"
                 r"\binverse[- ]variance\b")
PRED_INTERVAL = (r"\bprediction interval\b|\bpredictive interval\b|\bPI\b\s*(?:\(|=|:)|"
                 r"\b95%\s*PI\b")
PRED_ABSENCE = (r"\bno prediction interval\b|\bprediction interval (?:was |is )?not\b|"
                r"\bprediction interval (?:is |was )?undefined\b|"
                r"\bcannot be (?:computed|calculated) for k\b")

DATABASE = (r"\bMEDLINE\b|\bPubMed\b|\bEMBASE\b|\bEmbase\b|\bCENTRAL\b|\bCochrane Library\b|"
            r"\bWeb of Science\b|\bScopus\b|\bCINAHL\b|\bClinicalTrials\.gov\b|\bICTRP\b|"
            r"\bEurope PMC\b|\bAACT\b")
SEARCH_DATE = (r"\b(?:19|20)\d\d\b.{0,40}?\b(?:to|through|until|up to|-|–)\b.{0,40}?"
               r"\b(?:19|20)\d\d\b|\bsearched?\b.{0,60}?\b(?:19|20)\d\d\b|"
               r"\b\d{1,2}\s+\w+\s+20\d\d\b|\b20\d\d-\d\d-\d\d\b")
# a query AS EXECUTED: boolean operators plus a field tag or a registry parameter
SEARCH_STRING = (r"(?:\b(?:AND|OR|NOT)\b[^.]{0,200}){2,}"
                 r"(?:\[(?:tiab|ti|ab|mesh|MeSH Terms|All Fields|Title/Abstract|pt|"
                 r"Publication Type)\]|\bTS\s*=|\.mp\.|\bexp\b|condition=|intervention=)")
DEFER_TO_SUPPLEMENT = (r"\b(?:see|in|provided in|available in|given in|listed in)\b"
                       r"[^.]{0,40}\b(?:supplement\w*|appendix|additional file|"
                       r"online[- ]only|web[- ]?appendix|supporting information)\b")

ROB_TOOL = (r"\bRoB\s*2\b|\brisk[- ]of[- ]bias\s*2\b|\bCochrane risk[- ]of[- ]bias\b|"
            r"\bROBINS[- ]I\b|\bROBINS[- ]E\b|\bNewcastle[- ]Ottawa\b|\bJadad\b|"
            r"\bQUADAS[- ]?2\b|\bGRADE\b")
ROB_LEVEL = (r"\blow risk\b|\bsome concerns\b|\bhigh risk\b|\bunclear risk\b|"
             r"\bserious risk\b|\bcritical risk\b|\bmoderate risk\b")
ROB_PER_OUTCOME = (r"\bper[- ]outcome\b|\bfor each outcome\b|\bby outcome\b|"
                   r"\brisk of bias (?:was )?(?:assessed|judged|rated)[^.]{0,60}outcome|"
                   r"\boutcome[- ]level\b|\bresult[- ]level\b")

NOT_SCOREABLE = (
    "NOT_SCOREABLE_NO_STUDY_LIST", "NOT_SCOREABLE_INPUTS_ABSENT",
    "NOT_SCOREABLE_SINGLE_STUDY", "NOT_SCOREABLE_MATERIAL_NOT_RETRIEVED",
    "NOT_SCOREABLE_SOURCE_NOT_PUBLISHED", "NOT_SCOREABLE_NO_PROTOCOL_EXISTS",
    "NOT_SCOREABLE_SURFACE_DISAGREEMENT")

WINDOW = 900          # chars, the "one recoverable passage" window for S2
NEAR_LABEL = 600      # chars, how close a number must be to a study label for S3
NEAR_ROB = 400        # chars, how close a risk-of-bias level must be to a study label


# ------------------------------------------------------------------ evidence helpers
def _ev(text, m, file):
    """Every verdict must be able to point at the sentence it came from."""
    if m is None:
        return None
    s, e = (m.span() if hasattr(m, "span") else m)
    lo, hi = max(0, s - 120), min(len(text), e + 120)
    return {"file": file, "offset": s, "length": e - s,
            "span": re.sub(r"\s+", " ", text[lo:hi]).strip()}


def _first(pat, text, file, flags=re.I):
    m = re.search(pat, text, flags)
    return (bool(m), _ev(text, m, file))


def _windows_with_all(text, pats, file, window=WINDOW):
    """Find the first window of `window` chars containing a hit for EVERY pattern."""
    hits = []
    for p in pats:
        hits.append([m.start() for m in re.finditer(p, text, re.I)])
    if any(not h for h in hits):
        missing = [i for i, h in enumerate(hits) if not h]
        return False, None, missing
    anchors = sorted(hits[0])
    for a in anchors:
        lo, hi = a - window // 2, a + window // 2
        if all(any(lo <= x <= hi for x in h) for h in hits):
            s, e = max(0, lo), min(len(text), hi)
            return True, {"file": file, "offset": s, "length": e - s,
                          "span": re.sub(r"\s+", " ", text[s:e]).strip()}, []
    return False, None, []


# ------------------------------------------------------------------ THE SIX CRITERIA
def S2_estimand(text, file, topic_terms, **kw):
    """PRISMA 2020 items 5 + 20b. MECHANICAL: within one %d-character window, an
    intervention term, a population term, a comparator token, an effect-measure token and
    a timepoint token all occur. Uses the intervention/population vocabularies FROZEN in
    OPEN-COMPARATOR-PROTOCOL.md 5.2 -- no new list is introduced here.
    ⚠️ This tests whether the document STATES its estimand in one recoverable passage. It
    does not test whether the estimand is well chosen; that is judgement and is in the
    NARRATIVE section, unscored.""" % WINDOW
    iv = "|".join(re.escape(t) for t in topic_terms["iv"])
    pop = "|".join(re.escape(t) for t in topic_terms["pop"])
    ok, ev, _ = _windows_with_all(text, [EFFECT_MEASURE, TIMEPOINT, COMPARATOR, iv, pop],
                                 file)
    return ("SATISFIED" if ok else "NOT_SATISFIED"), ev


def S3_per_trial_inputs(text, file, study_labels, **kw):
    """PRISMA 2020 item 19. MECHANICAL: for EVERY enumerated included study, a numeric row
    -- arm events/total, or an estimate with an interval -- occurs within %d characters of
    that study's label. Strict on purpose: it refuses when a single study lacks one.""" \
        % NEAR_LABEL
    if not study_labels:
        return "NOT_SCOREABLE_NO_STUDY_LIST", None
    missing, ev = [], None
    for lab in study_labels:
        found = False
        for m in re.finditer(re.escape(lab), text, re.I):
            lo, hi = max(0, m.start() - NEAR_LABEL), min(len(text), m.end() + NEAR_LABEL)
            w = text[lo:hi]
            if re.search(EVENTS_N, w) or re.search(CI_NUM, w):
                found = True
                if ev is None:
                    ev = {"file": file, "offset": lo, "length": hi - lo,
                          "span": re.sub(r"\s+", " ", w).strip()[:400]}
                break
        if not found:
            missing.append(lab)
    if missing:
        return "NOT_SATISFIED", {"file": file, "offset": None, "length": None,
                                 "span": "no numeric row within %d chars of: %s"
                                         % (NEAR_LABEL, ", ".join(missing[:8]))}
    return "SATISFIED", ev


def S4_recomputable(text, file, study_labels, **kw):
    """OURS, NOT PRISMA -- declared as ours rather than dressed as a standard.
    MECHANICAL: recover >=2 per-study estimates with intervals, recover a stated pooled
    estimate, and recompute. Passes if the stated pooled value matches EITHER a
    fixed-effect inverse-variance pool OR a DerSimonian-Laird random-effects pool within
    0.05 on the log scale -- we cannot know which estimator the authors used, so matching
    either is the test, and which one matched is recorded.
    ⚠️ DL is used here to REPRODUCE what a paper is most likely to have done, not because
    it is the estimator we would choose; for k<10 it is biased and we say so."""
    if not study_labels:
        return "NOT_SCOREABLE_NO_STUDY_LIST", None
    per = []
    for lab in study_labels:
        for m in re.finditer(re.escape(lab), text, re.I):
            w = text[max(0, m.start() - NEAR_LABEL):m.end() + NEAR_LABEL]
            n = re.search(CI_NUM, w)
            if n:
                per.append((lab, n.group(0)))
                break
    if len(per) < 2:
        return "NOT_SCOREABLE_INPUTS_ABSENT", None
    pooled = re.search(r"(?:pooled|overall|summary|combined)[^.]{0,80}?(" + CI_NUM + ")",
                       text, re.I)
    if not pooled:
        return "NOT_SCOREABLE_INPUTS_ABSENT", None
    est = [_parse_ci(x[1]) for x in per]
    est = [e for e in est if e]
    tgt = _parse_ci(pooled.group(1))
    if len(est) < 2 or not tgt:
        return "NOT_SCOREABLE_INPUTS_ABSENT", None
    fe = _pool(est, tau2=0.0)
    tau2 = _dl_tau2(est)
    re_ = _pool(est, tau2=tau2)
    import math
    d = min(abs(math.log(fe) - math.log(tgt[0])), abs(math.log(re_) - math.log(tgt[0])))
    which = "fixed-effect IV" if abs(math.log(fe) - math.log(tgt[0])) <= \
        abs(math.log(re_) - math.log(tgt[0])) else "DerSimonian-Laird RE"
    ok = d <= 0.05
    return ("SATISFIED" if ok else "NOT_SATISFIED"), {
        "file": file, "offset": pooled.start(1), "length": len(pooled.group(1)),
        "span": "stated %s | recomputed FE %.4f, DL-RE %.4f (tau2=%.5f, k=%d) | "
                "closest %s, |log diff| %.4f, tolerance 0.05"
                % (pooled.group(1), fe, re_, tau2, len(est), which, d)}


def _parse_ci(s):
    n = re.findall(r"\d+\.\d+", s)
    if len(n) < 3:
        return None
    p, lo, hi = float(n[0]), float(n[1]), float(n[2])
    import math
    if p <= 0 or lo <= 0 or hi <= 0 or hi <= lo:
        return None
    se = (math.log(hi) - math.log(lo)) / 3.919928              # 2 * 1.959964
    return (p, se) if se > 0 else None


def _pool(est, tau2):
    import math
    w = [1.0 / (e[1] ** 2 + tau2) for e in est]
    return math.exp(sum(wi * math.log(e[0]) for wi, e in zip(w, est)) / sum(w))


def _dl_tau2(est):
    import math
    w = [1.0 / (e[1] ** 2) for e in est]
    y = [math.log(e[0]) for e in est]
    mu = sum(wi * yi for wi, yi in zip(w, y)) / sum(w)
    Q = sum(wi * (yi - mu) ** 2 for wi, yi in zip(w, y))
    k = len(est)
    c = sum(w) - sum(wi ** 2 for wi in w) / sum(w)
    return max(0.0, (Q - (k - 1)) / c) if c > 0 else 0.0


def S5_heterogeneity(text, file, k, **kw):
    """PRISMA 2020 items 13e + 20c-d. MECHANICAL: a heterogeneity statistic with a number,
    AND the estimator named, AND (for k>=2) a prediction interval reported or its absence
    explicitly stated."""
    if k is not None and k < 2:
        return "NOT_SCOREABLE_SINGLE_STUDY", None
    has_stat, ev = _first(HET_STAT, text, file)
    has_est, ev2 = _first(HET_ESTIMATOR, text, file)
    has_pi = bool(re.search(PRED_INTERVAL, text, re.I) or
                  re.search(PRED_ABSENCE, text, re.I))
    ok = has_stat and has_est and has_pi
    return ("SATISFIED" if ok else "NOT_SATISFIED"), (ev or ev2)


def S6_search(text, file, **kw):
    """PRISMA 2020 item 7. MECHANICAL: a named database AND a search date AND at least one
    query AS EXECUTED (boolean operators with a field tag or registry parameter).
    ⛔ If no query is present but the text defers to material we did not retrieve, the
    verdict is NOT_SCOREABLE_MATERIAL_NOT_RETRIEVED -- 'we could not see it' is not 'it is
    not there', and this hazard is one-sided against the comparator."""
    has_db, ev_db = _first(DATABASE, text, file)
    has_date, ev_dt = _first(SEARCH_DATE, text, file)
    has_q, ev_q = _first(SEARCH_STRING, text, file, flags=0)
    if not has_q and re.search(DEFER_TO_SUPPLEMENT, text, re.I):
        m = re.search(DEFER_TO_SUPPLEMENT, text, re.I)
        return "NOT_SCOREABLE_MATERIAL_NOT_RETRIEVED", _ev(text, m, file)
    ok = has_db and has_date and has_q
    return ("SATISFIED" if ok else "NOT_SATISFIED"), (ev_q or ev_db or ev_dt)


def S7_risk_of_bias(text, file, study_labels, **kw):
    """PRISMA 2020 items 18 + 20. MECHANICAL: a named tool, AND a risk-of-bias level within
    %d characters of EVERY enumerated study label, AND an explicit outcome-level
    statement.""" % NEAR_ROB
    if not study_labels:
        return "NOT_SCOREABLE_NO_STUDY_LIST", None
    has_tool, ev = _first(ROB_TOOL, text, file)
    if not has_tool:
        return "NOT_SATISFIED", {"file": file, "offset": None, "length": None,
                                 "span": "no risk-of-bias tool named"}
    missing = []
    for lab in study_labels:
        hit = False
        for m in re.finditer(re.escape(lab), text, re.I):
            w = text[max(0, m.start() - NEAR_ROB):m.end() + NEAR_ROB]
            if re.search(ROB_LEVEL, w, re.I):
                hit = True
                break
        if not hit:
            missing.append(lab)
    per_outcome = bool(re.search(ROB_PER_OUTCOME, text, re.I))
    ok = (not missing) and per_outcome
    detail = []
    if missing:
        detail.append("no risk-of-bias level within %d chars of: %s"
                      % (NEAR_ROB, ", ".join(missing[:8])))
    if not per_outcome:
        detail.append("no outcome-level statement")
    if ok:
        return "SATISFIED", ev
    return "NOT_SATISFIED", {"file": file, "offset": (ev or {}).get("offset"),
                             "length": (ev or {}).get("length"),
                             "span": "; ".join(detail)}


CRITERIA = {
    "S2": (S2_estimand, "PRISMA 2020 items 5, 20b"),
    "S3": (S3_per_trial_inputs, "PRISMA 2020 item 19"),
    "S4": (S4_recomputable, "OURS -- declared, not PRISMA"),
    "S5": (S5_heterogeneity, "PRISMA 2020 items 13e, 20c-d"),
    "S6": (S6_search, "PRISMA 2020 item 7"),
    "S7": (S7_risk_of_bias, "PRISMA 2020 items 18, 20"),
}


def script_sha256():
    return hashlib.sha256(io.open(__file__, "rb").read()).hexdigest()


def derive(ours, theirs):
    """Same function as the judge protocol used. Unchanged."""
    if str(ours).startswith("NOT_SCOREABLE") or str(theirs).startswith("NOT_SCOREABLE"):
        return "NOT_SCOREABLE"
    a, b = ours == "SATISFIED", theirs == "SATISFIED"
    if a and not b:
        return "OURS_BETTER"
    if b and not a:
        return "COMPARATOR_BETTER"
    return "TIE_BOTH_SATISFY" if a else "TIE_NEITHER_SATISFIES"


if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8",
                                  errors="replace", line_buffering=True)
    if "--score" in sys.argv:
        # RELEASED 2026-09-01. The refusal's condition was that the criteria be published as
        # readable code BEFORE any pair was scored; that held, and it is released in the same
        # commit as SCORING-HARNESS.md, which freezes what the criteria SEE. The refusal was
        # correct and is retired rather than deleted: it stopped a scoring run that would
        # have used an unfrozen harness, and a frozen criterion fed by an unfrozen harness is
        # not a frozen rubric.
        print("RELEASED. This module is the CRITERIA LIBRARY and scores no pair by itself: "
              "it exposes the six criteria and derive().")
        print("A scoring run supplies study_labels, k and topic_terms per "
              "SCORING-HARNESS.md (scoring-harness-1.0.0-2026-09-01), whose binding clause "
              "is that THE SAME RULE EXTRACTS BOTH SIDES.")
        print("Reproduce the published scores with the runner named in the result header; "
              "it stamps this file's sha256 on every row: %s" % script_sha256())
        sys.exit(0)
    print("rubric %s  sha256 %s" % (RULE_VERSION, script_sha256()))
    for k, v in CRITERIA.items():
        print("  %s  %s" % (k, v[1]))
    if "--selftest" not in sys.argv:
        sys.exit(0)

    # Synthetic strings only. NO PAIR IS TOUCHED. This proves the criteria RUN and that
    # each can return SATISFIED, NOT_SATISFIED and its NOT_SCOREABLE state.
    T = {"iv": ["dapagliflozin"], "pop": ["heart failure"]}
    F = "synthetic"
    good_s2 = ("In adults with heart failure, dapagliflozin versus placebo gave a hazard "
               "ratio for cardiovascular death at 18 months of 0.74.")
    good_s3 = ("DAPA-HF randomised 386/2373 in the treatment arm and 502/2371 in the "
               "placebo arm. EMPEROR-Reduced reported 0.75 (95% CI 0.65 to 0.86).")
    good_s4 = ("DAPA-HF 0.74 (0.65 to 0.85). EMPEROR-Reduced 0.75 (0.65 to 0.86). "
               "The pooled estimate was 0.75 (0.68 to 0.82).")
    good_s5 = ("Heterogeneity was low, I2 = 0%, with tau2 estimated by REML; the "
               "prediction interval was 0.55 to 1.02.")
    good_s6 = ('We searched MEDLINE and Embase from 2000 to 2024 using ("heart failure"'
               '[tiab] AND dapagliflozin[tiab] OR empagliflozin[tiab]).')
    good_s7 = ("Risk of bias was assessed with RoB 2 for each outcome. DAPA-HF was rated "
               "low risk. EMPEROR-Reduced was rated low risk.")
    cases = [
        ("S2 satisfied", S2_estimand, (good_s2, F), {"topic_terms": T}, "SATISFIED"),
        ("S2 not", S2_estimand, ("A meta-analysis was performed.", F),
         {"topic_terms": T}, "NOT_SATISFIED"),
        ("S3 satisfied", S3_per_trial_inputs, (good_s3, F),
         {"study_labels": ["DAPA-HF", "EMPEROR-Reduced"]}, "SATISFIED"),
        ("S3 not", S3_per_trial_inputs, ("DAPA-HF and EMPEROR-Reduced were included.", F),
         {"study_labels": ["DAPA-HF", "EMPEROR-Reduced"]}, "NOT_SATISFIED"),
        ("S3 no list", S3_per_trial_inputs, (good_s3, F), {"study_labels": []},
         "NOT_SCOREABLE_NO_STUDY_LIST"),
        ("S4 satisfied", S4_recomputable, (good_s4, F),
         {"study_labels": ["DAPA-HF", "EMPEROR-Reduced"]}, "SATISFIED"),
        ("S4 inputs absent", S4_recomputable, ("Two trials were pooled.", F),
         {"study_labels": ["DAPA-HF"]}, "NOT_SCOREABLE_INPUTS_ABSENT"),
        ("S5 satisfied", S5_heterogeneity, (good_s5, F), {"k": 4}, "SATISFIED"),
        ("S5 no estimator", S5_heterogeneity, ("I2 = 0%.", F), {"k": 4}, "NOT_SATISFIED"),
        ("S5 single study", S5_heterogeneity, (good_s5, F), {"k": 1},
         "NOT_SCOREABLE_SINGLE_STUDY"),
        ("S6 satisfied", S6_search, (good_s6, F), {}, "SATISFIED"),
        ("S6 deferred", S6_search, ("The full strategy is provided in the supplement.", F),
         {}, "NOT_SCOREABLE_MATERIAL_NOT_RETRIEVED"),
        ("S7 satisfied", S7_risk_of_bias, (good_s7, F),
         {"study_labels": ["DAPA-HF", "EMPEROR-Reduced"]}, "SATISFIED"),
        ("S7 no per-outcome", S7_risk_of_bias,
         ("Risk of bias used RoB 2. DAPA-HF low risk. EMPEROR-Reduced low risk.", F),
         {"study_labels": ["DAPA-HF", "EMPEROR-Reduced"]}, "NOT_SATISFIED"),
    ]
    bad = 0
    for name, fn, args, kw, want in cases:
        got, ev = fn(*args, **kw)
        ok = got == want
        bad += 0 if ok else 1
        print("  %-22s %-32s %s" % (name, got, "OK" if ok else "** WANT %s **" % want))
        if ok and ev and ev.get("span"):
            print("      evidence: %s" % ev["span"][:110])
    print("")
    print("derive(): %s %s %s %s" % (
        derive("SATISFIED", "NOT_SATISFIED"), derive("NOT_SATISFIED", "SATISFIED"),
        derive("SATISFIED", "SATISFIED"), derive("NOT_SATISFIED", "NOT_SATISFIED")))
    print("=== %d/%d criterion cases as specified ===" % (len(cases) - bad, len(cases)))
    sys.exit(1 if bad else 0)
