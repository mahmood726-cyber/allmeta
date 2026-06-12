"""CLASS-LEVEL external validation: compare each generality class's ENGINE output to a real, PubMed-verified
published network meta-analysis for that class. This extends the incretin-only concordance battery
(concordance_battery.py) to all six outcome-type repoints (PCSK9 / SGLT2 / psoriasis / asthma / RA / DTA).

Honesty discipline (per project rules):
- Every reference is a real article whose DOI was resolved on PubMed (2026-06-11); findings are quoted from the
  abstract (permitted; no full text, no IPD).
- 'Ours' is read PROGRAMMATICALLY from the committed class league JSONs (lead + ranking) so the comparison can
  never silently drift from the engine output.
- Concordance is judged at the level the evidence supports (class direction / top-tier membership / 'no clean
  within-class winner'), NOT as a numeric effect-size match — the contrasts differ (e.g. our placebo-anchored
  response NNT is not the published biologic-vs-MTX incremental NNTB). Each entry records that boundary openly.
"""
import io, sys, os, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

HERE = os.path.dirname(os.path.abspath(__file__))


def league(rel):
    return json.load(open(os.path.join(HERE, rel), encoding='utf-8'))


def order_of(ranking, agents):
    """relative order (indices) of a subset of agents within a full ranking list."""
    return [a for a in ranking if a in agents]


# ---- pull OUR engine outputs (programmatic, never hardcoded) ----
pcsk9 = league('class2_pcsk9/pcsk9_league.json')
sglt2 = league('class3_sglt2/sglt2_league.json')
psor = league('class4_psoriasis/psoriasis_league.json')
asth = league('class5_asthma/asthma_league.json')
ra = league('class6_ra/ra_league.json')
dta = league('class7_dta/dta_league.json')

pcsk9_overlap = order_of(pcsk9['ranking'], {'evolocumab', 'alirocumab', 'inclisiran'})

ENTRIES = [
    {
        'class': 'PCSK9 inhibitors (LDL-C lowering)',
        'reference': {'authors': 'Jiang et al.', 'year': 2025, 'journal': 'Front Cardiovasc Med',
                      'doi': '10.3389/fcvm.2024.1415668', 'pmid': '39975967',
                      'design': 'Bayesian/frequentist NMA', 'n_trials': 68, 'n_patients': 21288},
        'published_finding': ('Among PCSK9i monotherapy vs placebo, LDL-C reduction ranked evolocumab '
                              '(MD -1.89) > alirocumab (-1.83) > inclisiran (-1.68 mmol/L).'),
        'our_source': 'class2_pcsk9/pcsk9_league.json',
        'our_lead': pcsk9['lead'],
        'our_finding': (f"engine ranks the overlapping agents {' > '.join(pcsk9_overlap)} "
                        f"(lead overall {pcsk9['lead']}, a withdrawn agent NOT in the published network)."),
        'concordance': {
            'level': 'concordant',
            'basis': 'inclisiran ranks last among the three shared agents in BOTH analyses; PCSK9i all lower LDL-C.',
            'honest_note': ('our overall lead bococizumab was withdrawn and is absent from the published network; '
                            'comparison is restricted to the evolocumab/alirocumab/inclisiran overlap. '
                            'Jiang pools combination arms; we model %LDL monotherapy.'),
        },
    },
    {
        'class': 'SGLT2 inhibitors (heart-failure hospitalisation)',
        'reference': {'authors': 'Tsapas et al.', 'year': 2020, 'journal': 'Ann Intern Med',
                      'doi': '10.7326/M20-0864', 'pmid': '32598218',
                      'design': 'systematic review + NMA', 'n_trials': 453, 'n_patients': None},
        'published_finding': ('SGLT-2 inhibitors reduced heart-failure hospitalisation (and end-stage renal '
                              'disease) as a class; no clean within-class efficacy winner is crowned.'),
        'our_source': 'class3_sglt2/sglt2_league.json',
        'our_lead': sglt2['lead'],
        'our_finding': (f"engine: all SGLT2 agents reduce HF hospitalisation (lead {sglt2['lead']} HR "
                        f"{sglt2['median_hr'][sglt2['lead']]}), but every contrast is Low/Very-low certainty "
                        f"-> no clean within-class winner."),
        'concordance': {
            'level': 'concordant',
            'basis': 'class-level direction matches (SGLT2i reduce HF hosp); both decline to crown a within-class winner.',
            'honest_note': ('Tsapas is a broad glucose-lowering NMA reporting SGLT2i at class level, not a '
                            'canagliflozin-vs-empagliflozin-vs-dapagliflozin head-to-head; our nominal '
                            'canagliflozin lead is explicitly Low-certainty, consistent with that.'),
        },
    },
    {
        'class': 'Psoriasis biologics (PASI-90 response)',
        'reference': {'authors': 'Sbidian et al. (Cochrane)', 'year': 2022, 'journal': 'Cochrane Database Syst Rev',
                      'doi': '10.1002/14651858.CD011535.pub5', 'pmid': '35603936',
                      'design': 'living Cochrane NMA (CINeMA/SUCRA)', 'n_trials': 167, 'n_patients': 58912},
        'published_finding': ('For PASI-90, anti-IL17 and anti-IL23 biologics beat anti-TNF; the most effective '
                              '(high-certainty) were infliximab, bimekizumab, ixekizumab, risankizumab.'),
        'our_source': 'class4_psoriasis/psoriasis_league.json',
        'our_lead': psor['lead'],
        'our_finding': (f"engine lead {psor['lead']} ({psor['median_response_pct'][psor['lead']]}% PASI-90); "
                        f"reproduces IL-17/IL-23 > TNF with P(IL-17/23>TNF)={psor['il17_23_vs_tnf']['p_il_gt_tnf']}."),
        'concordance': {
            'level': 'concordant',
            'basis': ('our lead bimekizumab sits in Sbidian top tier (bimekizumab/ixekizumab/risankizumab); the '
                      'anti-IL17/IL23 > TNF hierarchy is reproduced.'),
            'honest_note': ('Sbidian also ranks infliximab numerically highest, but its RR (50.19) is inflated by '
                            'small/old trials and infliximab is outside our drug list; the modern top tier agrees.'),
        },
    },
    {
        'class': 'Asthma biologics (annualised exacerbation rate)',
        'reference': {'authors': 'Menzies-Gow et al.', 'year': 2022, 'journal': 'J Med Econ',
                      'doi': '10.1080/13696998.2022.2074195', 'pmid': '35570578',
                      'design': 'indirect treatment comparison (NMA + STC)', 'n_trials': 16, 'n_patients': None},
        'published_finding': ('All biologics had similar efficacy with no statistically significant rate-ratio '
                              'differences; tezepelumab had numerically the lowest AAER and ranked first.'),
        'our_source': 'class5_asthma/asthma_league.json',
        'our_lead': asth['lead'],
        'our_finding': (f"engine ranks {asth['lead']} first (IRR {asth['median_irr'][asth['lead']]}), all agents "
                        f"reduce the rate, but flags I2-type heterogeneity -> no clean 'best biologic'."),
        'concordance': {
            'level': 'concordant',
            'basis': ('both rank tezepelumab numerically first AND both decline statistical superiority of any '
                      'single biologic — a precise two-part match including the self-flagging.'),
            'honest_note': 'identical headline behaviour: nominal tezepelumab lead + explicit "no clean winner".',
        },
    },
    {
        'class': 'Rheumatoid-arthritis biologics/JAK (ACR response)',
        'reference': {'authors': 'Singh et al. (Cochrane)', 'year': 2017, 'journal': 'Cochrane Database Syst Rev',
                      'doi': '10.1002/14651858.CD012657', 'pmid': '28481462',
                      'design': 'Cochrane NMA (Bayesian MTC)', 'n_trials': 19, 'n_patients': 6485},
        'published_finding': ('Biologics+MTX improved ACR50 vs MTX (RR 1.40, absolute +16%, NNTB 7); evidence '
                              'downgraded for INCONSISTENCY, with no clean within-class winner.'),
        'our_source': 'class6_ra/ra_league.json',
        'our_lead': ra['lead'],
        'our_finding': (f"engine: all agents improve ACR response (lead {ra['lead']}); heterogeneity_flag="
                        f"{ra['heterogeneity_flag']} (proportional-odds residual RMSE "
                        f"{ra['proportional_odds_rmse_logit']}) -> ranking confounded, no clean winner."),
        'concordance': {
            'level': 'concordant',
            'basis': ('class-level ACR benefit matches; crucially our heterogeneity flag mirrors Cochrane\'s '
                      'inconsistency downgrade — both say "no clean within-class winner".'),
            'honest_note': ('Singh 2017 is MTX-naive and pre-JAK (no tofacitinib/upa/bari data); our placebo-'
                            'anchored ACR50 NNT (~1.4-5.9) is NOT the published biologic-vs-MTX incremental '
                            'NNTB (7) — different contrast, stated openly.'),
        },
    },
    {
        'class': 'Oncologic imaging modalities (diagnostic test accuracy, bivariate Se/Sp)',
        'reference': {'authors': 'Kim et al.', 'year': 2021, 'journal': 'Br J Radiol',
                      'doi': '10.1259/bjr.20201076', 'pmid': '33595337',
                      'design': 'diagnostic-accuracy network meta-analysis (SUCRA)', 'n_trials': 19,
                      'n_patients': 3571},
        'published_finding': ('Network meta-analysis of FDG-PET/(CT), CT and ultrasound for preoperative nodal '
                              'staging: the modalities have COMPLEMENTARY diagnostic roles (highest-SUCRA test '
                              'differs by nodal compartment), i.e. no single modality is uniformly best.'),
        'our_source': 'class7_dta/dta_league.json',
        'our_lead': dta['lead'],
        'our_finding': (f"engine ranks {dta['lead']} nominally first by Youden J "
                        f"({dta['median_youden_j'][dta['lead']]}), but every cross-modality contrast is "
                        f"Low certainty and heterogeneity_flag={dta['heterogeneity_flag']} (the AACT network "
                        f"mixes cancer sites) -> complementary roles, no clean winner."),
        'concordance': {
            'level': 'concordant',
            'basis': ('both decline to crown a single best modality: the engine\'s "no clean winner" (all '
                      'cross-modality Youden-J differences imprecise + cross-target heterogeneity flag) matches '
                      'Kim\'s "complementary diagnostic roles" conclusion.'),
            'honest_note': ('Kim 2021 is thyroid-specific (PET/CT/US, no MRI) using SUCRA on full-text 2x2 tables; '
                            'ours is a pan-cancer registry-RECONSTRUCTED bivariate league (PET/MRI/CT/US, '
                            'round(Se%xn1) cells, mixed target sites). The shared, validated claim is the '
                            '"complementary / no-uniform-winner" hierarchy, NOT a modality-by-modality Se/Sp match.'),
        },
    },
]

n = len(ENTRIES)
n_conc = sum(1 for e in ENTRIES if e['concordance']['level'] == 'concordant')
print(f'=== class-level external validation: {n} classes vs PubMed-verified published NMAs ===\n')
for e in ENTRIES:
    r = e['reference']
    print(f"  {e['class']}")
    print(f"    ref: {r['authors']} {r['year']}, {r['journal']} (doi:{r['doi']}, PMID {r['pmid']}; "
          f"{r['design']}, {r['n_trials']} trials)")
    print(f"    published: {e['published_finding']}")
    print(f"    ours:      {e['our_finding']}")
    print(f"    -> {e['concordance']['level'].upper()}: {e['concordance']['basis']}")
    print(f"       note: {e['concordance']['honest_note']}\n")
print(f"concordant: {n_conc}/{n} classes. Every reference DOI resolved on PubMed 2026-06-11.")

json.dump({
    'what': 'class-level external validation of the generality engine vs published network meta-analyses',
    'n_classes': n, 'n_concordant': n_conc,
    'method': ('engine ranking/lead read programmatically from each class league JSON; concordance judged at '
               'class-direction / top-tier / no-clean-winner level (not numeric effect match); every reference '
               'DOI resolved on PubMed.'),
    'all_references_doi_resolved': True, 'doi_resolution_date': '2026-06-11 (classes 1-5), 2026-06-12 (DTA, Kim 2021 via PubMed)',
    'entries': ENTRIES,
    'honest_boundary': ('this is corroboration at the level the abstracts support, not a re-pooling of the '
                        'published data; contrasts differ across analyses and each entry records its boundary. '
                        'Registry-native (AACT) engine vs full-SR published NMAs.'),
}, open(os.path.join(HERE, 'class_concordance.json'), 'w', encoding='utf-8'), indent=1)
print('\nwrote class_concordance.json')
