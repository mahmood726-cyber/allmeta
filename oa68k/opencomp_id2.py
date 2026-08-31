# -*- coding: utf-8 -*-
"""ID frame, WIDENED: 24 topics on the frozen protocol at fe1f2fd, unchanged.

⛔ THE CRITERION IS NOT ADJUSTED FOR THE NEW SPECIALTY OR FOR THE NEW TARGET. `opencomp.py`
is imported byte-for-byte and its sha256 is recorded in the frame provenance. A rule that
has to be retuned per specialty is not a rule, and retuning it to hit a number is exactly
what the pre-registration exists to prevent. If a criterion behaves badly here, that is a
FINDING and it is reported as one -- as the Cochrane/PROSPERO interaction already was.

⭐ SEEDS ARE PRINTED BESIDE THEIR HIT COUNTS. Every seed below is a hand-written frozen term
list, committed before the run. ⛔ Nothing in this frame derives a search seed from a title:
`topic_query()` reads TOPICS[t]["iv"] and ["pop"] only, and `title` appears in the builder
solely inside the design gates that judge a COMPARATOR's title. A plausible hit count is the
dangerous case, so the seed is emitted with the number rather than left implicit.

Usage: python opencomp_id2.py
"""
import hashlib
import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import opencomp as O  # noqa: E402
import opencomp_id as I1  # noqa: E402

NEW_TOPICS = {
    "anidulafungin-candida-auto-full-review": {
        "iv": ["anidulafungin", "echinocandin"],
        "pop": ["candidiasis", "Candida", "candidaemia", "candidemia",
                "invasive fungal"]},
    "raltegravir-hiv": {
        "iv": ["raltegravir"], "pop": ["HIV", "HIV-1", "antiretroviral"]},
    "bezlotoxumab-cdi": {
        "iv": ["bezlotoxumab"],
        "pop": ["Clostridioides difficile", "Clostridium difficile",
                "recurrent infection"]},
    "cvncov-covid19": {
        "iv": ["CVnCoV", "CureVac"], "pop": ["COVID-19", "SARS-CoV-2"]},
    "delamanid-tb": {
        "iv": ["delamanid", "OPC-67683"],
        "pop": ["tuberculosis", "multidrug-resistant"]},
    "doravirine-hiv": {
        "iv": ["doravirine", "MK-1439"], "pop": ["HIV", "HIV-1", "antiretroviral"]},
    "drotrecogin-sepsis": {
        "iv": ["drotrecogin", "activated protein C"],
        "pop": ["sepsis", "septic shock"]},
    "influenza-recombinant": {
        "iv": ["recombinant influenza vaccine", "RIV4", "Flublok"],
        "pop": ["influenza", "vaccine"]},
    "lenacapavir-hiv": {
        "iv": ["lenacapavir", "GS-6207"],
        "pop": ["HIV", "HIV-1", "heavily treatment-experienced"]},
    "lenacapavir-prep": {
        "iv": ["lenacapavir", "GS-6207"],
        "pop": ["HIV", "pre-exposure prophylaxis", "PrEP"]},
    "rifapentine-tb": {
        "iv": ["rifapentine"], "pop": ["tuberculosis", "latent tuberculosis"]},
    "sarilumab-covid": {
        "iv": ["sarilumab", "IL-6 receptor"], "pop": ["COVID-19", "SARS-CoV-2"]},
}

# (nct, acronym, pmid) -- acronyms and PMIDs are None throughout, as in the first ID frame:
# our ID trial names are descriptive and the SSOT holds no PMIDs, so matching rests on NCT
# identifiers ALONE. Declared before the run, not discovered after it.
NEW_TRIALS = {
    "anidulafungin-candida-auto-full-review": ["NCT00761267", "NCT00805740", "NCT00806351"],
    "raltegravir-hiv": ["NCT00042289", "NCT01618305", "NCT01989910"],
    "bezlotoxumab-cdi": ["NCT01241552", "NCT01513239"],
    "cvncov-covid19": ["NCT04652102", "NCT04674189"],
    "delamanid-tb": ["NCT01424670", "NCT02619994"],
    "doravirine-hiv": ["NCT02397096", "NCT02652260"],
    "drotrecogin-sepsis": ["NCT00386425", "NCT00604214"],
    "influenza-recombinant": ["NCT02285998", "NCT05144945"],
    "lenacapavir-hiv": ["NCT03739866", "NCT04811040"],
    "lenacapavir-prep": ["NCT04994509", "NCT04925752"],
    "rifapentine-tb": ["NCT00814671", "NCT01582711"],
    "sarilumab-covid": ["NCT04315298", "NCT04359901"],
}

# ⛔ EXCLUDED, by name, so the widening cannot smuggle in near-duplicates:
#   hiv-prep-injectable-review    -- its own title says DUPLICATE PAGE -- see cab...
#   malaria-vaccine (k=3)         -- near-duplicate of malaria-vaccines (k=7); larger kept
#   menacyw-healthy-volunteers... -- near-duplicate of menacwy-booster
# ⚠️ SHARED REGISTRATION, recorded rather than hidden: cvncov-covid19 and covid19-vaccines
#   both hold NCT04652102. Legitimate (one is the single-vaccine question inside the other),
#   but a comparator may be proposed for both, so they are NOT two independent
#   demonstrations on that trial.
SHARED = {"NCT04652102": ["cvncov-covid19", "covid19-vaccines"]}

TOPICS24 = dict(I1.ID_TOPICS)
TOPICS24.update(NEW_TOPICS)
TRIALS24 = dict(I1.ID_TRIALS)
TRIALS24.update({t: [(n, None, None) for n in v] for t, v in NEW_TRIALS.items()})

assert set(TOPICS24) == set(TRIALS24), "topic tables disagree"
assert len(TOPICS24) == 24, "expected 24 topics, got %d" % len(TOPICS24)
for _t, _v in TRIALS24.items():
    _n = [x[0] for x in _v]
    assert len(_n) == len(set(_n)), "duplicate registration in %s" % _t
    # all([]) is True -- so the SIZE of the set is asserted, not just the property
    assert len(_n) >= 2, "%s has k=%d; the frozen rule needs >=2 and can never match" % (
        _t, len(_n))


def main():
    builder_sha = hashlib.sha256(io.open(O.__file__, "rb").read()).hexdigest()
    O.TOPICS = TOPICS24
    O.OUR_TRIALS = TRIALS24
    O.OUT = os.path.join(O.OUTDIR, "opencomp_frame_id24.jsonl")
    O.PROTOCOL = ("oa68k/OPEN-COMPARATOR-PROTOCOL.md (criteria, UNCHANGED, frozen fe1f2fd) "
                  "+ oa68k/OPEN-COMPARATOR-ID-ADDENDUM.md + oa68k/ID-EXPANSION.md; "
                  "builder opencomp.py sha256 " + builder_sha)
    print("specialty       : infectious disease, WIDENED")
    print("topics          : %d  (12 from the first ID frame + 12 added)" % len(TOPICS24))
    print("builder sha256  : %s   (opencomp.py, UNEDITED)" % builder_sha)
    print("criteria        : MIN_OVERLAP_N=%d  MIN_OVERLAP_FRAC=%.2f  -- imported, not set here"
          % (O.MIN_OVERLAP_N, O.MIN_OVERLAP_FRAC))
    print("shared registrations across topics: %s" % SHARED)
    print("")
    print("SEED TABLE -- the seed is printed with the topic, before any count exists")
    for t in sorted(TOPICS24):
        print("  %-40s k=%d  iv=%s" % (t, len(TRIALS24[t]),
                                       " | ".join(TOPICS24[t]["iv"])[:70]))
    print("")
    O.build()


if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8",
                                  errors="replace", line_buffering=True)
    main()
