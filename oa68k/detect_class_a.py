# -*- coding: utf-8 -*-
"""CLASS A DETECTOR: subgroup significance presented as an interaction.

⭐ WHY A DETECTOR AND NOT A RE-ANALYSIS. The standing bar is "would this apply to the NEXT
paper without being redone?" A hand re-analysis of one paper fails it. This passes it on
every meta-analysis ever published, because the check is: THE PAPER USUALLY PRINTS THE
INTERACTION P-VALUE ITSELF, so the test is read it and compare it to the claim. No
reconstruction, no pooling, no data extraction.

⭐ IT IS A KNOWN-ANSWER CONTROL SITTING INSIDE THE DOCUMENT -- same shape as a text-versus-
figure contradiction, or a caption saying "5 RCTs" while a parser says 10.

⛔ WHAT IT DOES NOT DO. It does not parse effect estimates out of prose. Prose regex over
numbers has negative value -- four wrong cells per right one, confident and well-formed. The
ONLY number it reads is the interaction p-value, which journals print in a stereotyped form,
and it returns that number WITH ITS OFFSET AND SURROUNDING SENTENCE so the comparison is
made against quoted text rather than against a parse.

⛔ THE CONTROL THAT MAKES THE FINDINGS CREDIBLE. Papers whose interaction test SUPPORTS the
authors are reported as prominently as those where it does not. If every check overturned
something, the deflation would be unfalsifiable. INTERACTION_SUPPORTS_AUTHORS is a
first-class verdict, never a silent pass.

⛔ THREE DEFECTS THIS FILE ALREADY SURVIVED, each caught by a planted case and each recorded
because they are the same class the detector exists to catch:
  1. `[^.]` as a sentence proxy BREAKS ON DECIMAL POINTS. The canonical class-A sentence --
     "significant in women (HR 0.72, 95% CI 0.58-0.90) but not in men" -- has periods inside
     every number, so the span could never reach the negation and the detector missed the
     exact sentence it exists to find. Fixed by masking decimals (length-preserving).
  2. After masking, the interaction regex could no longer see its own p-value. Fixed by
     matching interactions on the RAW text and claims on the MASKED text; offsets align
     because the mask preserves length.
  3. Requiring an operator missed "P for interaction WAS 0.07". The operator is optional.

Usage:
  python detect_class_a.py --selftest        planted cases, no paper needed
  python detect_class_a.py <textfile> ...    scan retrieved full texts
"""
import io
import json
import os
import re
import sys

RULE_VERSION = "class-a-1.1.0-2026-09-02"
ALPHA = 0.05
DOT = ""          # private-use sentinel; NEVER \x00 -- Python refuses NUL in source

# --- the interaction test, in the forms journals actually print. Operator OPTIONAL. ------
RE_INTERACTION = re.compile(
    r"(?:"
    r"\bP[\s\-]*(?:value)?[\s\-]*(?:for|of)?[\s\-]*interaction\b"
    r"|\binteraction[\s\-]*P[\s\-]*(?:value)?\b"
    r"|\bP[\s_-]?int(?:eraction)?\b"
    r"|\btest(?:s)? for subgroup differences?\b"
    r"|\bsubgroup difference(?:s)?\b"
    r"|\bQ[\s\-]*between\b"
    r")"
    r"[^.\n]{0,60}?"
    r"((?:[<>=]|≥|≤)?\s*0?\.\d+)", re.I)

# --- a DIFFERENTIAL claim: an effect asserted in one stratum and denied in another -------
SUBGROUP = (r"wom[ae]n|m[ae]n\b|male|female|older|younger|elderly|"
            r"diabet\w*|non[- ]diabet\w*|HFrEF|HFpEF|preserved|reduced ejection|"
            r"Asian|white|black|obese|non[- ]obese|smoker|primary prevention|"
            r"secondary prevention|high[- ]risk|low[- ]risk")
RE_DIFFERENTIAL = re.compile(
    r"(?:significant\w*|benefit\w*|effective\w*|reduc\w*|improv\w*)[^.]{0,140}"
    r"\b(?:in|among|for|within)\b[^.]{0,40}(?:" + SUBGROUP + r")"
    r"[^.]{0,220}?"
    r"(?:but not|but was not|whereas|while no|no significant|not significant|"
    r"did not|was not observed|absent)", re.I)
RE_DIFFERENTIAL_2 = re.compile(
    r"(?:no significant|not significant|no benefit|did not)[^.]{0,140}"
    r"\b(?:in|among|for|within)\b[^.]{0,40}(?:" + SUBGROUP + r")"
    r"[^.]{0,220}?"
    r"(?:whereas|while|but)[^.]{0,140}(?:significant\w*|benefit\w*|reduc\w*)", re.I)


def _mask_decimals(text):
    """Length-preserving: a period then means END OF SENTENCE and nothing else."""
    return re.sub(r"(?<=\d)\.(?=\d)", DOT, text)


def _unmask(s):
    return s.replace(DOT, ".")


def _sentence(text, i, span=260):
    lo, hi = max(0, i - span), min(len(text), i + span)
    return _unmask(re.sub(r"\s+", " ", text[lo:hi]).strip())


def _pnum(tok):
    m = re.search(r"0?\.\d+", _unmask(tok or ""))
    if not m:
        return None
    try:
        return float(m.group(0))
    except ValueError:
        return None


def scan(text, source="(text)"):
    if text is None:
        return {"source": source, "verdict": "NOT_SCOREABLE_TEXT_NOT_RETRIEVED",
                "rule_version": RULE_VERSION,
                "note": "no bytes were obtained. A fact about OUR ACCESS, never about the "
                        "paper. 'We could not get it' is not 'it is not there'."}
    masked = _mask_decimals(text)
    inter = []
    for m in RE_INTERACTION.finditer(text):
        inter.append({"offset": m.start(), "p": _pnum(m.group(1)),
                      "raw": re.sub(r"\s+", " ", m.group(0))[:90],
                      "sentence": _sentence(text, m.start())})
    diffs = []
    for rx in (RE_DIFFERENTIAL, RE_DIFFERENTIAL_2):
        for m in rx.finditer(masked):
            diffs.append({"offset": m.start(),
                          "claim": _unmask(re.sub(r"\s+", " ", m.group(0))[:240]),
                          "sentence": _sentence(text, m.start())})
    diffs.sort(key=lambda d: d["offset"])

    out = {"source": source, "rule_version": RULE_VERSION, "alpha": ALPHA,
           "n_interaction": len(inter), "n_differential_claims": len(diffs),
           "interaction_tests_found": inter, "differential_claims_found": diffs}

    if not diffs:
        out["verdict"] = "NO_DIFFERENTIAL_CLAIM_DETECTED"
        out["note"] = ("no sentence asserting an effect in one stratum and its absence in "
                       "another was found. Read as 'THIS SCAN found none', not as 'the "
                       "paper makes none': the claim detector is prose-based and is the "
                       "weak half of this check.")
        return out
    if not inter:
        out["verdict"] = "NOT_SCOREABLE_NO_INTERACTION_REPORTED"
        out["note"] = ("a differential claim is made and NO formal interaction test was "
                       "found in the text scanned. A finding about the paper, but NOT "
                       "proof of absence -- the test may sit in a figure, a table or a "
                       "supplement this scan did not read.")
        return out
    withp = [i for i in inter if i["p"] is not None]
    if not withp:
        out["verdict"] = "NOT_SCOREABLE_INTERACTION_P_NOT_NUMERIC"
        return out
    best, worst = min(withp, key=lambda i: i["p"]), max(withp, key=lambda i: i["p"])
    if best["p"] < ALPHA:
        out["verdict"] = "INTERACTION_SUPPORTS_AUTHORS"
        out["decisive"] = best
        out["note"] = ("⭐ CONTROL CASE. A reported interaction p-value is < %.2f, so the "
                       "paper's own formal test supports its differential claim. Reported "
                       "as prominently as a flag: if every check overturned something, the "
                       "deflation would be unfalsifiable." % ALPHA)
        return out
    out["verdict"] = "CLASS_A_FLAG"
    out["decisive"] = worst
    out["note"] = ("the paper asserts a differential effect across strata while its own "
                   "reported interaction p-value is >= %.2f. Claim and test disagree, and "
                   "BOTH ARE QUOTED with offsets so a reader checks the comparison rather "
                   "than trusting a parse." % ALPHA)
    return out


CASES = [
    ("flag: claim + non-significant interaction, no operator",
     "Semaglutide reduced the primary outcome significantly in women (HR 0.72, 95% CI "
     "0.58-0.90) but not in men (HR 0.95, 95% CI 0.80-1.13). The P value for interaction "
     "was 0.07.", "CLASS_A_FLAG"),
    ("control: claim + SIGNIFICANT interaction",
     "The benefit was significant in patients with diabetes but not in those without "
     "diabetes; P for interaction = 0.004, indicating true effect modification.",
     "INTERACTION_SUPPORTS_AUTHORS"),
    ("no interaction reported at all",
     "Treatment was effective in women but not in men across the pooled analysis. No "
     "formal test of effect modification is presented anywhere in this report.",
     "NOT_SCOREABLE_NO_INTERACTION_REPORTED"),
    ("no differential claim",
     "The pooled hazard ratio was 0.81 (0.74-0.89). Heterogeneity was low, I2 = 12%. "
     "P for interaction = 0.44 across prespecified subgroups.",
     "NO_DIFFERENTIAL_CLAIM_DETECTED"),
    ("mirror ordering: absent-then-present",
     "There was no significant reduction in men, whereas a significant benefit was seen "
     "in the other stratum. Test for subgroup differences P = 0.22.", "CLASS_A_FLAG"),
    ("text not retrieved", None, "NOT_SCOREABLE_TEXT_NOT_RETRIEVED"),
]


def selftest():
    print("class A detector %s   alpha=%.2f" % (RULE_VERSION, ALPHA))
    print("PLANTED CASES -- no paper needed; every verdict must be reachable\n")
    bad = 0
    for name, text, want in CASES:
        r = scan(text, source=name)
        ok = r["verdict"] == want
        bad += 0 if ok else 1
        print("  %-52s %-38s %s"
              % (name, r["verdict"], "OK" if ok else "** WANT %s **" % want))
        d = r.get("decisive")
        if ok and d:
            print("      p=%-6s offset %-5d %s" % (d["p"], d["offset"], d["raw"]))
    print("")
    print("=== %d/%d planted cases as specified ===" % (len(CASES) - bad, len(CASES)))
    print("")
    print("⛔ WHAT A GREEN SELF-TEST DOES NOT PROVE: that the CLAIM half fires on real "
          "prose. The interaction half is stereotyped and reliable; the claim half is "
          "prose-based and is the weak one. On a real paper "
          "NO_DIFFERENTIAL_CLAIM_DETECTED means 'this scan found none'.")
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
