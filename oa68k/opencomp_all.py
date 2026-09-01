# -*- coding: utf-8 -*-
"""FOURTH FRAME: every remaining unframed corpus topic with k >= 2. Declared in full here.

⛔ CRITERION UNTOUCHED. `opencomp.py` imported byte-for-byte, sha256 recorded in the frame
provenance. This is a SELECTION decision about which of OUR reviews enter.

======================================================================================
THE RULE, AND IT LEAVES NO DISCRETION
======================================================================================
  Include EVERY remaining unframed topic object with k >= 2 -- the minimum k at which the
  frozen match rule (|overlap| >= 2) can ever be satisfied. Below k = 2 no comparator can
  match, by arithmetic.

  ⛔ THE LIST IS DECLARED IN FULL AND RUN AS ONE BATCH. 65 topics, all named below before
     any was queried. No topic is added after seeing a result: a stopping rule chosen by
     its results is the same defect as a threshold chosen by its yield.

  ⛔ THIS IS NOT A SPECIALTY SELECTION. It is "everything that remains", which is the only
     declaration that involves no choosing at all. Cardiology, infectious disease,
     ophthalmology, amyloidosis, haematology and pulmonary hypertension all enter together
     because the rule cannot see specialty.

  ⚠️ MEASURED BEFORE DECLARING, AND IT MATTERS: the corpus's k >= 4 population is
     EXHAUSTED. Of the 106 remaining unframed topics the k distribution is
     {0: 18, 1: 19, 2: 41, 3: 28} -- ZERO with k >= 4. So every topic in this frame sits in
     the band the k >= 4 run showed is hardest: at k = 2 the threshold demands BOTH our
     trials (100%), at k = 3 it demands 2 of 3 (67%). That is stated in advance as the
     reason to expect little, not discovered afterwards as an excuse.
======================================================================================

EXCLUDED BY NAME, on the objects' own declarations rather than on their yield:
  hiv-prep-injectable-review            its own title says "DUPLICATE PAGE -- see cab..."
  olmesartan-htn                        its own title says "RETIRED"
  malaria-vaccine                       near-duplicate of the framed malaria-vaccines
  menacyw-healthy-volunteers-auto-...   near-duplicate of the framed menacwy-booster

⚠️ NEAR-DUPLICATE FAMILIES ARE DENSE HERE AND ARE DECLARED: colchicine 3, dabigatran 4,
evolocumab 3, apixaban 2, bosentan 2, fidaxomicin 2, finerenone 2, ablation 1, attr 2,
sglt2 2. The frame reports COMPARATORS / INDEPENDENT TOPICS / DISTINCT FAMILIES.

Usage: python opencomp_all.py
"""
import hashlib
import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import opencomp as O  # noqa: E402
import opencomp_id2 as I2  # noqa: E402
import opencomp_k4 as K4  # noqa: E402

ENUM = r"F:\claude-temp\pend\codexjob2\corpus_topics.json"
K_MIN = 2
EXCLUDED = {
    "hiv-prep-injectable-review": "its own title says DUPLICATE PAGE",
    "olmesartan-htn": "its own title says RETIRED",
    "malaria-vaccine": "near-duplicate of the framed malaria-vaccines",
    "menacyw-healthy-volunteers-auto-full-review": "near-duplicate of menacwy-booster",
}

S = {
    "ablation-af-medical-therapy": (["catheter ablation", "ablation"], ["atrial fibrillation"]),
    "antimalarial-act": (["artemether", "lumefantrine", "artesunate", "amodiaquine",
                          "dihydroartemisinin", "piperaquine"], ["malaria", "falciparum"]),
    "attr-pn-review": (["patisiran", "vutrisiran", "eplontersen"],
                       ["transthyretin", "amyloidosis", "polyneuropathy"]),
    "cangrelor-pci-review": (["cangrelor"], ["percutaneous coronary intervention", "coronary"]),
    "ceftaroline-auto-full-review": (["ceftaroline"], ["pneumonia", "bacterial infection"]),
    "ceftolozane-infection-auto-full-review": (["ceftolozane", "tazobactam"],
                                               ["intra-abdominal", "urinary tract", "pneumonia"]),
    "colchicine-cvd-review": (["colchicine"], ["cardiovascular", "coronary"]),
    "colchicine-peripheral-arterial": (["colchicine"], ["peripheral arterial disease",
                                                        "peripheral artery"]),
    "doac-af-review": (["dabigatran", "apixaban", "edoxaban", "direct oral anticoagulant"],
                       ["atrial fibrillation"]),
    "doac-cancer-vte-review": (["edoxaban", "rivaroxaban", "apixaban",
                                "direct oral anticoagulant"], ["cancer", "venous thromboembolism"]),
    "enoxaparin-vte": (["enoxaparin"], ["venous thromboembolism", "thromboprophylaxis"]),
    "evolocumab-ascvd-auto2": (["evolocumab"], ["atherosclerotic cardiovascular", "LDL"]),
    "fidaxomicin-cdi-auto-full-review": (["fidaxomicin"], ["Clostridioides difficile",
                                                           "Clostridium difficile"]),
    "fidaxomicin-cdiff": (["fidaxomicin"], ["Clostridium difficile", "diarrhea"]),
    "finerenone-review": (["finerenone"], ["heart failure"]),
    "inclisiran-lipid-kidney-auto-full-review": (["inclisiran"],
                                                 ["low-density lipoprotein", "hypercholesterolaemia"]),
    "ivermectin-lf-auto-full-review": (["ivermectin"], ["lymphatic filariasis", "filariasis"]),
    "mavacamten-hcm-review": (["mavacamten"], ["hypertrophic cardiomyopathy"]),
    "meropenem-auto-full-review": (["meropenem"], ["bacterial infection", "pneumonia",
                                                   "intra-abdominal"]),
    "mipomersen-hofh": (["mipomersen"], ["homozygous familial hypercholesterolaemia",
                                          "hypercholesterolemia"]),
    "mitral-funcmr-review": (["transcatheter repair", "MitraClip", "edge-to-edge"],
                             ["mitral regurgitation"]),
    "netarsudil-ocular-hypertension-auto-full-review": (["netarsudil"],
                                                        ["ocular hypertension", "glaucoma",
                                                         "intraocular pressure"]),
    "plazomicin-infection-auto-full-review": (["plazomicin"], ["urinary tract infection",
                                                               "bacterial infection"]),
    "sglt2-ckd-review": (["canagliflozin", "dapagliflozin", "empagliflozin", "sglt2"],
                         ["chronic kidney disease", "kidney"]),
    "tigecycline-ciai": (["tigecycline"], ["intra-abdominal infection"]),
    "ablation-af-heart-failure": (["catheter ablation", "ablation"],
                                  ["atrial fibrillation", "heart failure"]),
    "amoxicillin-aom": (["amoxicillin"], ["acute otitis media", "otitis media"]),
    "anidulafungin-fungal-auto-full-review": (["anidulafungin"], ["invasive fungal",
                                                                  "candidiasis"]),
    "apixaban-acs-review": (["apixaban"], ["acute coronary syndrome"]),
    "apixaban-vte": (["apixaban"], ["venous thromboembolism"]),
    "attr-cm-review": (["tafamidis", "acoramidis"], ["transthyretin", "amyloid cardiomyopathy"]),
    "azilsartan-chlorthalidone-vs-olmesartan-hctz": (["azilsartan", "chlorthalidone"],
                                                     ["hypertension"]),
    "bosentan-pah": (["bosentan"], ["pulmonary arterial hypertension"]),
    "bosentan-pah-children": (["bosentan"], ["pulmonary hypertension", "children"]),
    "cefepime-taz-auto-full-review": (["cefepime", "taniborbactam", "tazobactam"],
                                      ["urinary tract infection", "bacterial infection"]),
    "ceftazidime-avibactam-auto-full-review": (["ceftazidime", "avibactam"],
                                               ["intra-abdominal", "urinary tract"]),
    "colchicine-cvd-coronary": (["colchicine"], ["coronary artery disease",
                                                 "major adverse cardiovascular"]),
    "dabigatran-af": (["dabigatran"], ["atrial fibrillation"]),
    "dabigatran-stroke": (["dabigatran"], ["stroke"]),
    "dabigatran-vte-extended": (["dabigatran"], ["venous thromboembolism"]),
    "doripenem": (["doripenem"], ["bacterial infection", "pneumonia"]),
    "edoxaban-vte": (["edoxaban"], ["venous thromboembolism"]),
    "empagliflozin-hf-auto-full-review": (["empagliflozin"], ["heart failure"]),
    "eravacycline-infection-auto-full-review": (["eravacycline"], ["intra-abdominal infection"]),
    "ertapenem-auto-full-review": (["ertapenem"], ["bacterial infection"]),
    "etripamil-psvt": (["etripamil"], ["supraventricular tachycardia"]),
    "evolocumab-dyslipidemia-review": (["evolocumab"], ["dyslipidaemia", "dyslipidemia"]),
    "evolocumab-mixed-dyslipidemia-auto-full-review": (["evolocumab"],
                                                       ["mixed dyslipidemia", "dyslipidaemia"]),
    "finerenone-cv": (["finerenone"], ["chronic kidney disease", "type 2 diabetes"]),
    "fondaparinux-vte": (["fondaparinux"], ["venous thromboembolism"]),
    "gepotidacin-urinary-tract-auto-full-review": (["gepotidacin"], ["urinary tract infection"]),
    "icosapent-lipid-auto-full-review": (["icosapent", "AMR101", "eicosapentaenoic"],
                                         ["triglyceride", "hypertriglyceridemia", "cardiovascular"]),
    "incretin-hfpef-review": (["semaglutide", "tirzepatide", "incretin", "GLP-1"],
                              ["heart failure", "preserved ejection fraction"]),
    "lefamulin-cabp-auto-full-review": (["lefamulin"], ["community-acquired bacterial pneumonia",
                                                        "pneumonia"]),
    "linezolid-mrsa": (["linezolid"], ["methicillin-resistant", "MRSA"]),
    "pcsk9-inhibitors-cv-review": (["PCSK9", "evolocumab", "alirocumab"],
                                   ["atherosclerotic cardiovascular"]),
    "pitavastatin-auto-full-review": (["pitavastatin"], ["hypercholesterolemia",
                                                         "hypercholesterolaemia"]),
    "posaconazole-fungal": (["posaconazole"], ["invasive fungal", "stem cell transplant"]),
    "riociguat-pah": (["riociguat"], ["pulmonary arterial hypertension"]),
    "rivaroxaban-acs-review": (["rivaroxaban"], ["acute coronary syndrome"]),
    "rosuvastatin-auto-full-review": (["rosuvastatin"], ["stroke"]),
    "sglt2-mace-cvot-review": (["sglt2", "empagliflozin", "canagliflozin", "dapagliflozin"],
                               ["cardiovascular outcome", "major adverse cardiovascular"]),
    "sotatercept-pah": (["sotatercept"], ["pulmonary arterial hypertension"]),
    "thiamine-sepsis": (["thiamine"], ["septic shock", "sepsis"]),
    "warfarin-af": (["warfarin"], ["atrial fibrillation"]),
}


def family(n):
    for f in ("colchicine", "dabigatran", "apixaban", "evolocumab", "bosentan", "fidaxomicin",
              "finerenone", "ablation", "attr", "sglt2", "doac", "ceft", "anidulafungin",
              "rivaroxaban", "edoxaban", "pcsk9"):
        if n.startswith(f) or ("-%s" % f) in n:
            return f
    return n.split("-")[0]


def main():
    enum = json.load(io.open(ENUM, encoding="utf-8"))
    framed = set(O.TOPICS) | set(I2.TOPICS24) | set(K4.SEEDS)
    by = {(t.get("app_id") or t.get("dir")): t for t in enum["topics"]}
    selected = sorted(n for n, t in by.items()
                      if (t.get("k") or 0) >= K_MIN and n not in framed and n not in EXCLUDED)
    if set(selected) != set(S):
        raise SystemExit("REFUSING: the k>=%d population changed since the rule was frozen."
                         "\n  only in corpus: %s\n  only in rule  : %s"
                         % (K_MIN, sorted(set(selected) - set(S))[:8],
                            sorted(set(S) - set(selected))[:8]))
    topics, trials = {}, {}
    for n in selected:
        iv, pop = S[n]
        topics[n] = {"iv": iv, "pop": pop}
        seen, rows = set(), []
        for tr in by[n]["trials"]:
            nct = tr.get("nct")
            if not nct or nct in seen:
                continue
            seen.add(nct)
            pm = tr.get("pmid")
            rows.append((nct, None, str(pm) if pm else None))
        trials[n] = rows
        assert len(rows) >= K_MIN, "%s fell below k>=%d after dedup" % (n, K_MIN)

    fams = sorted({family(n) for n in selected})
    kdist = {}
    for n in selected:
        kdist[len(trials[n])] = kdist.get(len(trials[n]), 0) + 1
    print("FOURTH FRAME -- every remaining unframed topic with k >= %d" % K_MIN)
    print("  topics selected      : %d   (declared in full, ONE batch)" % len(selected))
    print("  excluded by name     : %d   %s" % (len(EXCLUDED), sorted(EXCLUDED)))
    print("  distinct families    : %d" % len(fams))
    print("  k distribution       : %s  <- ZERO at k>=4; that population is exhausted"
          % dict(sorted(kdist.items())))
    print("  registrations        : %d, with a PMID key: %d"
          % (sum(len(v) for v in trials.values()),
             sum(1 for v in trials.values() for (_n, _a, p) in v if p)))
    print("")
    print("SEED TABLE -- printed with each topic BEFORE any count exists")
    for n in selected:
        print("  k=%d %-46s fam=%-13s iv=%s"
              % (len(trials[n]), n[:46], family(n), " | ".join(topics[n]["iv"])[:40]))
    print("")
    sha = hashlib.sha256(io.open(O.__file__, "rb").read()).hexdigest()
    O.TOPICS = topics
    O.OUR_TRIALS = trials
    O.OUT = os.path.join(O.OUTDIR, "opencomp_frame_all.jsonl")
    O.PROTOCOL = ("oa68k/OPEN-COMPARATOR-PROTOCOL.md (criteria UNCHANGED, fe1f2fd); "
                  "selection rule k>=%d over ALL remaining unframed topics, frozen in "
                  "oa68k/opencomp_all.py before the run; builder sha256 %s" % (K_MIN, sha))
    print("builder sha256 : %s  (UNEDITED)" % sha)
    print("")
    O.build()


if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8",
                                  errors="replace", line_buffering=True)
    main()
