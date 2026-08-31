# -*- coding: utf-8 -*-
"""Second frame: INFECTIOUS DISEASE, on the frozen protocol, unchanged.

⛔ `opencomp.py` IS NOT EDITED. Every criterion, gate, threshold and regex is imported from
it byte-for-byte; this module replaces only the two per-topic input tables the protocol's
sections 5.2 and 5.3 require for a new specialty, and redirects the output path. The
builder's own sha256 is recorded in the frame's provenance so a reader can verify the
criteria were not amended for the new specialty.

⛔ If a criterion behaves badly in infectious disease, THAT IS A FINDING ABOUT THE
CRITERION, to be recorded -- not an adjustment.

Inputs frozen in oa68k/OPEN-COMPARATOR-ID-ADDENDUM.md and committed before this ran.

Usage: python opencomp_id.py
"""
import hashlib
import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import opencomp as O  # noqa: E402

ID_TOPICS = {
    "malaria-vaccines": {
        "iv": ["RTS,S", "RTSS", "Mosquirix", "R21", "Matrix-M", "malaria vaccine"],
        "pop": ["malaria", "Plasmodium falciparum", "children"]},
    "malaria-act-review": {
        "iv": ["artemisinin", "artemether", "lumefantrine", "artesunate", "amodiaquine",
               "dihydroartemisinin", "piperaquine"],
        "pop": ["malaria", "falciparum"]},
    "prevnar15-pneumo": {
        "iv": ["V114", "15-valent pneumococcal", "PCV15", "Prevnar 13", "PCV13"],
        "pop": ["pneumococcal", "Streptococcus pneumoniae"]},
    "covid19-vaccines": {
        "iv": ["Gam-COVID-Vac", "Sputnik", "CVnCoV", "CoronaVac", "inactivated vaccine",
               "COVID-19 vaccine"],
        "pop": ["COVID-19", "SARS-CoV-2"]},
    "mdr-tb-shortened": {
        "iv": ["bedaquiline", "pretomanid", "linezolid", "BPaL"],
        "pop": ["tuberculosis", "drug-resistant", "multidrug-resistant"]},
    "rotavirus-vaccine-africa-review": {
        "iv": ["Rotarix", "RotaTeq", "Rotasiil", "rotavirus vaccine"],
        "pop": ["rotavirus", "gastroenteritis", "infants"]},
    "menacwy-booster": {
        "iv": ["MenACWY", "MenACYW", "meningococcal conjugate"],
        "pop": ["meningococcal", "Neisseria meningitidis"]},
    "cab-prep-hiv-review": {
        "iv": ["cabotegravir", "long-acting injectable"],
        "pop": ["HIV", "pre-exposure prophylaxis", "PrEP"]},
    "agyw-hiv-prep-review": {
        "iv": ["dapivirine", "vaginal ring"],
        "pop": ["HIV", "women"]},
    "nirsevimab-infant-rsv-review": {
        "iv": ["nirsevimab"],
        "pop": ["RSV", "respiratory syncytial virus", "infants"]},
    "covid-oral-antivirals": {
        "iv": ["molnupiravir", "nirmatrelvir", "PF-07321332", "Paxlovid"],
        "pop": ["COVID-19", "SARS-CoV-2"]},
    "hepatitis-b-taf-tdf-review": {
        "iv": ["tenofovir alafenamide", "TAF", "tenofovir disoproxil"],
        "pop": ["hepatitis B", "HBV", "chronic hepatitis"]},
}

# (nct, acronym_or_None, pmid_or_None). ⛔ Acronyms and PMIDs are None throughout: our ID
# trial names are descriptive and the SSOT holds no PMIDs for them, so matching rests on
# NCT identifiers ALONE. Declared in the addendum before this ran.
ID_TRIALS = {
    "malaria-vaccines": [(n, None, None) for n in
                         ["NCT00866619", "NCT03896724", "NCT04704830", "NCT03276962",
                          "NCT00436007", "NCT00380393", "NCT03143218"]],
    "malaria-act-review": [(n, None, None) for n in
                           ["NCT01704508", "NCT04565184", "NCT04767191", "NCT05192265",
                            "NCT06076213"]],
    "prevnar15-pneumo": [(n, None, None) for n in
                         ["NCT02547649", "NCT03547167", "NCT03950622", "NCT03620162",
                          "NCT03692871", "NCT03848065", "NCT03921424"]],
    "covid19-vaccines": [(n, None, None) for n in
                         ["NCT04530396", "NCT04652102", "NCT04510207"]],
    "mdr-tb-shortened": [(n, None, None) for n in
                         ["NCT02333799", "NCT02589782", "NCT03086486"]],
    "rotavirus-vaccine-africa-review": [(n, None, None) for n in
                                        ["NCT00241644", "NCT00362648", "NCT02145000"]],
    "menacwy-booster": [(n, None, None) for n in
                        ["NCT00454909", "NCT01359449", "NCT02810340"]],
    "cab-prep-hiv-review": [(n, None, None) for n in ["NCT02720094", "NCT03164564"]],
    "agyw-hiv-prep-review": [(n, None, None) for n in ["NCT01539226", "NCT01617096"]],
    "nirsevimab-infant-rsv-review": [(n, None, None) for n in
                                     ["NCT02878330", "NCT03979313"]],
    "covid-oral-antivirals": [(n, None, None) for n in ["NCT04575597", "NCT04960202"]],
    "hepatitis-b-taf-tdf-review": [(n, None, None) for n in
                                   ["NCT01940341", "NCT01940471"]],
}

assert set(ID_TOPICS) == set(ID_TRIALS), "topic tables disagree"
for _t, _v in ID_TRIALS.items():
    _n = [x[0] for x in _v]
    assert len(_n) == len(set(_n)), "duplicate registration in %s -- a trial contributing " \
                                    "two cohorts is ONE registration" % _t


def main():
    builder_sha = hashlib.sha256(io.open(O.__file__, "rb").read()).hexdigest()
    # replace ONLY the per-topic inputs; every criterion stays as imported
    O.TOPICS = ID_TOPICS
    O.OUR_TRIALS = ID_TRIALS
    O.OUT = os.path.join(O.OUTDIR, "opencomp_frame_id.jsonl")
    O.PROTOCOL = ("oa68k/OPEN-COMPARATOR-PROTOCOL.md (criteria, unchanged) + "
                  "oa68k/OPEN-COMPARATOR-ID-ADDENDUM.md (topic inputs, frozen "
                  "before this run); builder opencomp.py sha256 " + builder_sha)
    print("specialty      : infectious disease")
    print("topics         : %d" % len(ID_TOPICS))
    print("builder sha256 : %s  (opencomp.py, UNEDITED)" % builder_sha)
    print("criteria       : imported unchanged -- MIN_OVERLAP_N=%d MIN_OVERLAP_FRAC=%.2f"
          % (O.MIN_OVERLAP_N, O.MIN_OVERLAP_FRAC))
    print("")
    O.build()


if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8",
                                  errors="replace", line_buffering=True)
    main()
