"""Assemble the rapidmeta-kit config for the psoriasis class from the harvested per-trial PASI table
(psoriasis_trials.json). Writes psoriasis_rapidmeta_config.json, ready for
`python clone.py psoriasis_rapidmeta_config.json` in rapidmeta-kit. Registry-native (AACT); AACT-native
provenance, NOT a dual-screened SR. The harvester enforces plausibility, so the config carries clean 2x2 cells."""
import io, sys, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

HERE = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma/class4_psoriasis'
th = json.load(open(f'{HERE}/psoriasis_trials.json', encoding='utf-8'))
trials = [{k: v for k, v in t.items() if not k.startswith('_')} for t in th['trials']]
scr = th['screening']

config = {
    'drug': 'Psoriasis biologics',
    'drug_lower': 'biologic systemic agents',
    'slug': 'psoriasis_biologics_pasi_nma',
    'condition': 'moderate-to-severe plaque psoriasis',
    'comparator': 'Placebo',
    'title': 'Biologics for moderate-to-severe plaque psoriasis - PASI-response network meta-analysis',
    'hero_h2': 'Registry-native NMA of IL-17 / IL-23 / IL-12-23 / TNF biologics for PASI response in psoriasis',
    'nyt_headline': 'Which psoriasis biologics clear the most skin?',
    'pico': {
        'pop': 'Adults with moderate-to-severe plaque psoriasis',
        'int': 'Biologics (IL-17, IL-23, IL-12/23, TNF inhibitors)',
        'comp': 'Placebo',
        'out': 'PASI-75 / PASI-90 / PASI-100 response (ordered responder ladder)',
        'subgroup': 'By drug and by mechanism class',
    },
    'acronyms': {t['nct']: t['name'] for t in trials},
    'trials': trials,
    'provenance_note': (f"Registry-native cohort: AACT search returned {scr['search_hits']} psoriasis drug "
                        f"records; {scr['acr_reporting']} trials posted a PASI-75/90/100 result; {scr['included']} "
                        f"had a usable active-vs-control responder pair (per-arm N, single controlled timepoint). "
                        f"AACT-results-posted cohort, NOT a dual-screened systematic review; responder counts are "
                        f"derived events = round(PASI% * N) with fail-closed plausibility. Synthesis hierarchy: "
                        f"Bayesian PASI-90 league (psoriasis_league.json), IL-17/IL-23 > TNF (P=1.000)."),
}
json.dump(config, open(f'{HERE}/psoriasis_rapidmeta_config.json', 'w', encoding='utf-8'), indent=1)
print(f"wrote psoriasis_rapidmeta_config.json: {len(trials)} trials, "
      f"{sum(len(t['allOutcomes']) for t in trials)} PASI arm-outcomes")
print(f"  funnel: {scr['search_hits']} search -> {scr['acr_reporting']} PASI-reporting -> {scr['included']} included")
