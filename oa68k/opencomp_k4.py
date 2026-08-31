# -*- coding: utf-8 -*-
"""THIRD FRAME: every unframed corpus topic with k >= 4. Rule frozen here, before the run.

⛔ THE CRITERION IS NOT TOUCHED. `opencomp.py` is imported byte-for-byte and its sha256 is
recorded in the frame provenance. This is a SELECTION decision about which of OUR reviews
enter -- not a change to how comparators are judged.

======================================================================================
THE SELECTION RULE, AND ITS JUSTIFICATION IS THE MECHANISM, NOT THE YIELD
======================================================================================
  Include every topic object in the corpus with k >= 4 that is not already in a frame.

  WHY k >= 4, stated as the mechanism because that is the whole justification:
    the frozen match rule is |overlap| >= 2 AND |overlap|/k >= 0.5.
      at k = 2 those two clauses coincide and demand BOTH our trials -- an effective
               requirement of 100% overlap;
      at k = 3 they demand 2 of 3 -- 67%;
      at k >= 4 the >= 2 clause is satisfied at or below the 50% clause, so the
               requirement stops being absolute and becomes exactly "half our trials".
    k >= 4 is the smallest k at which the threshold is NOT effectively 100%.

  ⛔ k >= 4 is chosen because that is where the threshold stops being absolute. It is NOT
     chosen because it yields more. A threshold chosen for its yield is the thing this
     project has spent the entire night refusing to do.

  ⛔ THE LIST IS DECLARED IN FULL, IN ADVANCE, AND RUN AS ONE BATCH. Nineteen topics, all
     named below before any of them was queried. No topic is added after looking at a
     result -- a stopping rule chosen by its results is the same defect as a threshold
     chosen by its yield.
======================================================================================

⚠️ NEAR-DUPLICATE FAMILIES ARE PRESENT AND ARE DECLARED, NOT HIDDEN. Six colchicine topics,
three dabigatran, three apixaban, three bosentan. They are genuinely different questions
(different populations and indications), but a comparator matching two members of one family
is closer to ONE independent demonstration than to two. The output therefore reports
comparators / independent topics / DISTINCT DRUG FAMILIES, and the family map is frozen here.

⚠️ `fcm-hf-review` overlaps `iv-iron-hf`, already framed: they share CONFIRM-HF and were
measured to record DIFFERENT randomised denominators for it. Included, with that declared.

Trial sets are read mechanically from the committed corpus enumeration; seeds are frozen
below by hand. Free sources only.

Usage: python opencomp_k4.py
"""
import hashlib
import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import opencomp as O  # noqa: E402
import opencomp_id2 as I2  # noqa: E402

ENUM = r"F:\claude-temp\pend\codexjob2\corpus_topics.json"
K_MIN = 4

SEEDS = {
    "colchicine-periprocedural": (["colchicine"],
        ["cardiac surgery", "percutaneous coronary intervention", "atrial fibrillation",
         "pericardiotomy", "ablation"]),
    "colchicine-stroke-prevention": (["colchicine"],
        ["stroke", "cerebrovascular", "ischaemic stroke", "ischemic stroke"]),
    "bosentan-ph-not-group1": (["bosentan"],
        ["pulmonary hypertension", "Eisenmenger", "pulmonary fibrosis"]),
    "dabigatran-vte-surgical": (["dabigatran"],
        ["thromboprophylaxis", "arthroplasty", "hip replacement", "knee replacement",
         "venous thromboembolism"]),
    "bosentan-pah-combination": (["bosentan"],
        ["pulmonary arterial hypertension", "combination therapy"]),
    "intensive-bp-review": (["intensive blood pressure", "blood-pressure target",
                             "intensive blood-pressure", "systolic target"],
        ["hypertension", "blood pressure"]),
    "apixaban-vte-prophylaxis": (["apixaban"],
        ["thromboprophylaxis", "venous thromboembolism", "arthroplasty"]),
    "colchicine-mixed-ascvd": (["colchicine"],
        ["atherosclerotic", "coronary artery disease", "cardiovascular"]),
    "colchicine-pericarditis": (["colchicine"], ["pericarditis", "pericardial"]),
    "dabigatran-vte-cerebral": (["dabigatran"],
        ["cerebral venous", "sinus thrombosis", "venous thrombosis"]),
    "dabigatran-vte-treatment": (["dabigatran"],
        ["venous thromboembolism", "deep vein thrombosis", "pulmonary embolism"]),
    "ablation-af-review": (["catheter ablation", "pulmonary vein isolation", "ablation"],
        ["atrial fibrillation"]),
    "acs-antiplatelet-review": (["ticagrelor", "prasugrel", "clopidogrel", "antiplatelet"],
        ["acute coronary syndrome", "myocardial infarction"]),
    "apixaban-af-review": (["apixaban"], ["atrial fibrillation", "stroke prevention"]),
    "apixaban-vte-treatment": (["apixaban"],
        ["venous thromboembolism", "deep vein thrombosis", "pulmonary embolism"]),
    "bosentan-pah-monotherapy": (["bosentan"], ["pulmonary arterial hypertension"]),
    "colchicine-intracerebral-haemorrhage": (["colchicine"],
        ["intracerebral haemorrhage", "intracerebral hemorrhage", "haemorrhagic stroke"]),
    "fcm-hf-review": (["ferric carboxymaltose"], ["heart failure", "iron deficiency"]),
    "rivaroxaban-vasc-review": (["rivaroxaban"],
        ["peripheral artery disease", "coronary artery disease", "vascular disease",
         "atherosclerotic"]),
}

FAMILY = {
    "colchicine-periprocedural": "colchicine", "colchicine-stroke-prevention": "colchicine",
    "colchicine-mixed-ascvd": "colchicine", "colchicine-pericarditis": "colchicine",
    "colchicine-intracerebral-haemorrhage": "colchicine",
    "bosentan-ph-not-group1": "bosentan", "bosentan-pah-combination": "bosentan",
    "bosentan-pah-monotherapy": "bosentan",
    "dabigatran-vte-surgical": "dabigatran", "dabigatran-vte-cerebral": "dabigatran",
    "dabigatran-vte-treatment": "dabigatran",
    "apixaban-vte-prophylaxis": "apixaban", "apixaban-af-review": "apixaban",
    "apixaban-vte-treatment": "apixaban",
    "intensive-bp-review": "bp-target", "ablation-af-review": "ablation",
    "acs-antiplatelet-review": "antiplatelet", "fcm-hf-review": "iv-iron",
    "rivaroxaban-vasc-review": "rivaroxaban",
}


def main():
    enum = json.load(io.open(ENUM, encoding="utf-8"))
    framed = set(O.TOPICS) | set(I2.TOPICS24)
    by = {(t.get("app_id") or t.get("dir")): t for t in enum["topics"]}
    selected = sorted(n for n, t in by.items()
                      if (t.get("k") or 0) >= K_MIN and n not in framed)

    # ⛔ The population is PINNED. If the corpus changes under us, this fails loudly rather
    # than silently running on a different set than the rule declared.
    if set(selected) != set(SEEDS):
        raise SystemExit("REFUSING: the k>=%d population has changed since the rule was "
                         "frozen.\n  only in corpus: %s\n  only in rule  : %s"
                         % (K_MIN, sorted(set(selected) - set(SEEDS)),
                            sorted(set(SEEDS) - set(selected))))

    topics, trials = {}, {}
    for n in selected:
        iv, pop = SEEDS[n]
        topics[n] = {"iv": iv, "pop": pop}
        seen, rows = set(), []
        for tr in by[n]["trials"]:
            nct = tr.get("nct")
            if not nct or nct in seen:
                continue          # a trial contributing two cohorts is ONE registration
            seen.add(nct)
            pm = tr.get("pmid")
            rows.append((nct, None, str(pm) if pm else None))
        trials[n] = rows
        assert len(rows) >= K_MIN, "%s fell below k>=%d after dedup" % (n, K_MIN)

    n_reg = sum(len(v) for v in trials.values())
    n_pmid = sum(1 for v in trials.values() for (_n, _a, p) in v if p)
    fams = sorted({FAMILY[n] for n in selected})
    print("THIRD FRAME -- selection rule: every unframed corpus topic with k >= %d" % K_MIN)
    print("  justification is the MECHANISM: at k=2 the >=2 clause demands BOTH trials")
    print("  (100%%); at k>=4 the threshold becomes exactly half. NOT chosen for yield.")
    print("")
    print("  topics selected      : %d  (declared in full, run as ONE batch)" % len(selected))
    print("  distinct drug families: %d  %s" % (len(fams), fams))
    print("  registrations        : %d, of which with a PMID key: %d" % (n_reg, n_pmid))
    print("  acronym keys         : 0 (the ruled nct_pmid join ignores acronyms)")
    print("")
    print("SEED TABLE -- printed with each topic BEFORE any count exists")
    for n in selected:
        print("  k=%-2d %-38s fam=%-12s iv=%s"
              % (len(trials[n]), n[:38], FAMILY[n], " | ".join(topics[n]["iv"])[:44]))
    print("")
    sha = hashlib.sha256(io.open(O.__file__, "rb").read()).hexdigest()
    O.TOPICS = topics
    O.OUR_TRIALS = trials
    O.OUT = os.path.join(O.OUTDIR, "opencomp_frame_k4.jsonl")
    O.PROTOCOL = ("oa68k/OPEN-COMPARATOR-PROTOCOL.md (criteria UNCHANGED, fe1f2fd); "
                  "selection rule k>=%d frozen in oa68k/opencomp_k4.py before the run; "
                  "trial sets read from the committed corpus enumeration; "
                  "builder opencomp.py sha256 %s" % (K_MIN, sha))
    print("builder sha256 : %s  (UNEDITED)" % sha)
    print("criteria       : MIN_OVERLAP_N=%d MIN_OVERLAP_FRAC=%.2f -- imported, not set here"
          % (O.MIN_OVERLAP_N, O.MIN_OVERLAP_FRAC))
    print("")
    O.build()


if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8",
                                  errors="replace", line_buffering=True)
    main()
