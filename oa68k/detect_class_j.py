# -*- coding: utf-8 -*-
"""CLASS J DETECTOR: does the abstract's headline survive the paper's OWN sensitivity analyses?

⭐ WHY THIS IS THE BEST DETECTOR WE HAVE. The refutation is a row the AUTHORS PUBLISHED. No
reconstruction, no extraction of trial data, no pooling -- read the sensitivity estimate and
compare its interval to the headline's. Same shape as class G (self-contradiction) and class
A (printed interaction p-value): a known-answer control sitting inside the document.

⛔ IT PARSES RATIO+INTERVAL TRIPLETS, WHICH IS PROSE PARSING, AND PROSE PARSING OF NUMBERS
HAS NEGATIVE VALUE UNLESS IT CAN CHECK ITSELF. So every parse must satisfy
    lo <= point <= hi
and any triplet that fails is REJECTED AND KEPT, never silently dropped -- a discard that
throws away its evidence costs a whole re-run to diagnose. Every accepted estimate is
returned with its offset and its sentence so a reader checks the comparison, not the parse.

⛔ THE CONTROL THAT MAKES THE FINDINGS CREDIBLE. SENSITIVITY_SUPPORTS_HEADLINE is a
first-class verdict. If every check overturned something the deflation would be
unfalsifiable, and a paper whose own sensitivity analyses hold is evidence FOR it.

⚠️ WHAT "SIGNIFICANT" MEANS HERE: the interval excludes the null (1.0 for a ratio). That is a
statement about the printed interval and nothing else. A headline that survives this
detector is NOT thereby correct, and one that fails is NOT thereby wrong -- the finding is
that the paper's abstract and its own sensitivity table disagree about significance.

Usage:
  python detect_class_j.py --selftest
  python detect_class_j.py <textfile> ...
"""
import io
import json
import os
import re
import sys

RULE_VERSION = "class-j-1.0.0-2026-09-02"
NULL_VALUE = 1.0

MEASURE = r"(?:IRR|RR|OR|HR|aOR|aHR|aRR|risk ratio|odds ratio|hazard ratio|rate ratio|incidence rate ratio)"
DASH = r"(?:-|--|‐|‑|‒|–|—|to|,)"
# X.XX (Y.YY to Z.ZZ) with an optional measure label and optional "95% CI"
RE_EST = re.compile(
    r"(?:(" + MEASURE + r")\s*[,:=]?\s*)?"
    r"(\d+\.\d+)\s*"
    r"[\(\[]\s*(?:95\s*%\s*(?:CI|CrI)\s*[:,]?\s*)?"
    r"(\d+\.\d+)\s*" + DASH + r"\s*(\d+\.\d+)\s*[\)\]]", re.I)

RE_SENSITIVITY_CUE = re.compile(
    r"sensitivity analys[ie]s|excluding (?:studies|trials) (?:at|with) high risk|"
    r"restricted to|restricting to|after exclusion of|leave[- ]one[- ]out|"
    r"when (?:studies|trials) at high risk|removing (?:studies|trials)|"
    r"drug[- ]attributable|per[- ]protocol analys[ie]s|"
    r"limited to (?:studies|trials|comparisons)", re.I)
RE_ABSTRACT_CUE = re.compile(r"\babstract\b|\bbackground\b|\bconclusions?\b", re.I)


def _sig(lo, hi, null=NULL_VALUE):
    """Interval excludes the null."""
    return (lo > null) or (hi < null)


def _sentence(text, i, span=220):
    lo, hi = max(0, i - span), min(len(text), i + span)
    return re.sub(r"\s+", " ", text[lo:hi]).strip()


def estimates(text):
    """Every ratio+interval triplet, ACCEPTED only if lo <= point <= hi."""
    ok, rejected = [], []
    for m in RE_EST.finditer(text):
        meas, p, lo, hi = m.group(1), float(m.group(2)), float(m.group(3)), float(m.group(4))
        rec = {"offset": m.start(), "measure": (meas or "").upper() or None,
               "point": p, "lo": lo, "hi": hi,
               "raw": re.sub(r"\s+", " ", m.group(0))[:80],
               "sentence": _sentence(text, m.start())}
        if lo <= p <= hi and lo < hi:
            rec["significant"] = _sig(lo, hi)
            ok.append(rec)
        else:
            rec["rejected_because"] = ("interval does not bracket the point estimate "
                                       "(lo<=point<=hi failed) -- almost always a mis-parse, "
                                       "kept so it can be inspected rather than discarded")
            rejected.append(rec)
    return ok, rejected


def scan(text, source="(text)"):
    if text is None:
        return {"source": source, "rule_version": RULE_VERSION,
                "verdict": "NOT_SCOREABLE_TEXT_NOT_RETRIEVED",
                "note": "no bytes obtained. A fact about OUR ACCESS, never about the paper."}
    ok, rejected = estimates(text)
    sens_spans = [m.start() for m in RE_SENSITIVITY_CUE.finditer(text)]
    # an estimate is a SENSITIVITY estimate if a sensitivity cue appears within 400 chars
    # before it -- the cue introduces the analysis, then the number follows.
    sens, head = [], []
    for e in ok:
        near = [s for s in sens_spans if 0 <= e["offset"] - s <= 400]
        (sens if near else head).append(e)

    out = {"source": source, "rule_version": RULE_VERSION, "null_value": NULL_VALUE,
           "n_estimates_accepted": len(ok), "n_estimates_rejected": len(rejected),
           "rejected_parses_kept": rejected[:6],
           "headline_candidates": head[:8], "sensitivity_estimates": sens[:12]}

    if not head:
        out["verdict"] = "NOT_SCOREABLE_NO_HEADLINE_EFFECT"
        out["note"] = ("no ratio+interval triplet was parsed outside a sensitivity context. "
                       "Read as 'this scan found none'.")
        return out
    if not sens:
        out["verdict"] = "NOT_SCOREABLE_NO_SENSITIVITY_REPORTED"
        out["note"] = ("no sensitivity analysis was detected in the text scanned. That is a "
                       "finding ABOUT THE PAPER -- a meta-analysis without one -- but it is "
                       "NOT proof of absence: it may sit in a table or supplement this scan "
                       "did not read.")
        return out

    sig_head = [e for e in head if e["significant"]]
    if not sig_head:
        out["verdict"] = "HEADLINE_NOT_SIGNIFICANT"
        out["note"] = "no significant headline estimate, so there is nothing for a "\
                      "sensitivity analysis to overturn."
        return out
    lost = [e for e in sens if not e["significant"]]
    if lost:
        out["verdict"] = "CLASS_J_FLAG"
        out["decisive"] = {"headline": sig_head[0], "sensitivity_losing_significance": lost}
        out["note"] = ("the abstract carries a significant headline while %d of the paper's "
                       "OWN sensitivity estimates have intervals crossing the null. Claim "
                       "and the authors' own sensitivity table disagree ABOUT "
                       "SIGNIFICANCE -- both are quoted with offsets. This does not make "
                       "the headline wrong; it makes it fragile in the authors' own hands."
                       % len(lost))
        return out
    out["verdict"] = "SENSITIVITY_SUPPORTS_HEADLINE"
    out["decisive"] = {"headline": sig_head[0], "sensitivity_all_significant": sens[:6]}
    out["note"] = ("⭐ CONTROL CASE. Every detected sensitivity estimate keeps significance, "
                   "so the paper's own robustness checks support its headline. Reported as "
                   "prominently as a flag: if every check overturned something, the "
                   "deflation would be unfalsifiable.")
    return out


RIFAMPIN = (
    "Abstract. Background. We assessed triple-dose rifampin. Results. The incidence of "
    "adverse events was higher with triple-dose rifampin (IRR 1.48 (1.12-1.96)). "
    "Conclusions. Triple-dose rifampin increased adverse events. "
    "Methods and sensitivity. In a sensitivity analysis excluding studies at high risk of "
    "bias, the estimate was 1.26 (0.73-2.07). Restricted to comparisons in which only "
    "rifampin differed, it was 1.51 (0.95-2.39). Limited to drug-attributable adverse "
    "events, it was 1.81 (0.70-4.70).")

CASES = [
    ("flag: the published rifampin specimen", RIFAMPIN, "CLASS_J_FLAG"),
    ("control: sensitivity keeps significance",
     "Results. The pooled risk ratio was 0.72 (0.61-0.85). In a sensitivity analysis "
     "excluding studies at high risk of bias, the estimate was 0.70 (0.58-0.84).",
     "SENSITIVITY_SUPPORTS_HEADLINE"),
    ("no sensitivity analysis reported",
     "Results. The pooled odds ratio was 1.90 (1.20-3.01) across eleven trials.",
     "NOT_SCOREABLE_NO_SENSITIVITY_REPORTED"),
    ("headline not significant",
     "Results. The pooled HR was 0.95 (0.80-1.13). A sensitivity analysis restricted to "
     "double-blind trials gave 0.97 (0.79-1.19).", "HEADLINE_NOT_SIGNIFICANT"),
    ("no parseable estimate",
     "Results. Treatment was associated with fewer events overall. A sensitivity analysis "
     "excluding studies at high risk of bias did not change the conclusion.",
     "NOT_SCOREABLE_NO_HEADLINE_EFFECT"),
    ("text not retrieved", None, "NOT_SCOREABLE_TEXT_NOT_RETRIEVED"),
]


def selftest():
    print("class J detector %s   null=%.1f" % (RULE_VERSION, NULL_VALUE))
    print("PLANTED CASES -- every verdict must be reachable\n")
    bad = 0
    for name, text, want in CASES:
        r = scan(text, source=name)
        ok = r["verdict"] == want
        bad += 0 if ok else 1
        print("  %-42s %-38s %s"
              % (name, r["verdict"], "OK" if ok else "** WANT %s **" % want))
        if ok and r.get("decisive", {}).get("sensitivity_losing_significance"):
            for e in r["decisive"]["sensitivity_losing_significance"]:
                print("       lost significance: %s  [offset %d]" % (e["raw"], e["offset"]))
    print("")
    print("=== %d/%d planted cases as specified ===" % (len(CASES) - bad, len(CASES)))
    print("")
    print("⛔ SELF-CHECK ON EVERY PARSE: a triplet is accepted only if lo <= point <= hi. "
          "Rejected triplets are KEPT and returned, never silently dropped.")
    print("⚠️ 'Significant' means the printed interval excludes the null and NOTHING MORE. "
          "A flagged headline is not thereby wrong -- it is fragile in the authors' own "
          "hands, which is a different and more defensible claim.")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8",
                                  errors="replace", line_buffering=True)
    if "--selftest" in sys.argv or len(sys.argv) == 1:
        sys.exit(selftest())
    for p in sys.argv[1:]:
        t = (io.open(p, encoding="utf-8", errors="replace").read()
             if os.path.exists(p) else None)
        print(json.dumps(scan(t, source=p), ensure_ascii=False, indent=1))
