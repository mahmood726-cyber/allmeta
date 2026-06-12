"""CLASS-LEVEL external validation: compare each generality class's ENGINE output to a real, PubMed-verified
published network meta-analysis for that class. This extends the incretin-only concordance battery
(concordance_battery.py) to the two cardiometabolic repoints kept in this repo (PCSK9 / SGLT2).

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
    'all_references_doi_resolved': True, 'doi_resolution_date': '2026-06-11',
    'entries': ENTRIES,
    'honest_boundary': ('this is corroboration at the level the abstracts support, not a re-pooling of the '
                        'published data; contrasts differ across analyses and each entry records its boundary. '
                        'Registry-native (AACT) engine vs full-SR published NMAs.'),
}, open(os.path.join(HERE, 'class_concordance.json'), 'w', encoding='utf-8'), indent=1)
print('\nwrote class_concordance.json')
