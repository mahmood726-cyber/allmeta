# -*- coding: utf-8 -*-
"""Add hand-read PICO verdicts to OVERLAP_WITH_OUR_CORPUS.json.

The keyword shortlist proposed four overlaps. Reading OUR OWN DECLARED QUESTION for each
reduced it to one plausible match. That gap is the name-is-not-an-identity rule doing its
job, and it is recorded rather than smoothed away.
"""
import io
import json
import sys

P = r"F:\claude-temp\pend\OVERLAP_WITH_OUR_CORPUS.json"

HAND = {
    "#31": ("SHORTLIST_ONLY_DIFFERENT_PICO",
            "our icosapent topic asks AMR101 versus PLACEBO on triglyceride lowering; the "
            "candidate claims EPA versus EPA+DHA. Different comparator, therefore a "
            "different estimand -- adjacent, not matching."),
    "#32": ("NO_OVERLAP",
            "we hold sglt2-hf (SGLT2 inhibitors in chronic heart failure) and "
            "attr-cm-review / attr-pn-review (tafamidis or acoramidis in ATTR-CM; "
            "patisiran, vutrisiran and eplontersen in ATTR-PN). NO topic addresses SGLT2 "
            "IN AMYLOIDOSIS. Holding both drug families separately is NOT holding the "
            "PICO -- a name is not an identity."),
    "#33": ("NO_OVERLAP",
            "two independent reasons. (1) POPULATION: our acs-antiplatelet-review is "
            "ACUTE coronary syndrome, while the candidate claims STABLE / chronic CAD. "
            "(2) our object cannot be matched on its question at all -- see the metadata "
            "defect recorded in this file."),
    "#34": ("SHORTLIST_ONLY_DIFFERENT_PICO",
            "our cangrelor-pci-review asks cangrelor versus clopidogrel, a DRUG "
            "comparison at PCI; the candidate claims a STENT-STRATEGY network. Different "
            "intervention class."),
    "#35": ("NO_OVERLAP", "no diagnostic-accuracy topic exists in the store."),
    "#37": ("PLAUSIBLE_PICO_MATCH",
            "our inclisiran-lipid-kidney-auto-full-review is inclisiran for elevated "
            "LDL-C in HeFH, ASCVD or ASCVD-risk equivalents; the candidate claims "
            "inclisiran LDL lowering. Same drug, same outcome, same population family. "
            "k=3, one live pooled estimate, HOSTABLE NOW. STILL UNCONFIRMED: the "
            "candidate paper has never been resolved, so this is a shortlist agreeing "
            "with a DESCRIPTION, not a match to a document."),
    "#38": ("NO_OVERLAP",
            "too generic to match a PICO; meta-regression is a method, not a question."),
    "#40": ("NO_OVERLAP", "no adherence-proportion topic exists in the store."),
}

DEFECT = (
    "Several of our topics have NO USABLE DECLARED QUESTION, which makes question-based "
    "matching weaker BECAUSE OF US rather than because of the candidates. "
    "acs-antiplatelet-review's question field is a trial-declared OUTCOME STRING -- "
    "'In Multiple trial-declared outcomes: Participants With Any Event From the Composite "
    "of Death From Vascular Causes...' -- naming neither its intervention nor its "
    "population. attr-pn-review and inclisiran-lipid-kidney use the template "
    "'In [the title], what do the contributing trials show?', which restates the title "
    "instead of stating a PICO. A comparator hunt that matches on the question cannot "
    "find these topics. That is our metadata gap to fix, not a property of the literature."
)


def main():
    j = json.load(io.open(P, encoding="utf-8"))
    for r in j["candidates"]:
        v, w = HAND.get(r["candidate"], ("NOT_ASSESSED", ""))
        r["hand_read_verdict"] = {
            "value": v, "grade": "MEASURED -- I read our declared question", "why": w}
    g = lambda v: [r["candidate"] for r in j["candidates"]
                   if r["hand_read_verdict"]["value"] == v]
    j["_hand_read_summary"] = {
        "plausible_pico_match": g("PLAUSIBLE_PICO_MATCH"),
        "shortlist_only_different_pico": g("SHORTLIST_ONLY_DIFFERENT_PICO"),
        "no_overlap": g("NO_OVERLAP"),
        "_note": "The keyword shortlist proposed 4 overlaps. Reading OUR DECLARED QUESTION "
                 "reduced it to 1 plausible. That gap is the name-is-not-an-identity rule "
                 "doing its job, and it is why the shortlist licenses nothing.",
    }
    j["a_defect_in_OUR_store_surfaced_by_this"] = DEFECT
    io.open(P, "w", encoding="utf-8", newline="\n").write(
        json.dumps(j, ensure_ascii=False, indent=1))
    print("bytes", len(io.open(P, "rb").read()))
    print(json.dumps(j["_hand_read_summary"], ensure_ascii=False, indent=1))


if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8",
                                  errors="replace", line_buffering=True)
    main()
