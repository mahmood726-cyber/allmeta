"""Assemble the rapidmeta-kit config for the SGLT2 class from the harvested per-trial HR table
(sglt2_trials.json). Writes sglt2_rapidmeta_config.json, ready for
`python clone.py sglt2_rapidmeta_config.json` in rapidmeta-kit. Survival/HR path: each trial carries
publishedHR/hrLCI/hrUCI (the kit's survival forest slots). Registry-native (AACT); AACT-native provenance,
NOT a dual-screened SR."""
import io, sys, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

HERE = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma/class3_sglt2'
th = json.load(open(f'{HERE}/sglt2_trials.json', encoding='utf-8'))
trials = [{k: v for k, v in t.items() if not k.startswith('_')} for t in th['trials']]
scr = th['screening']

config = {
    'drug': 'SGLT2 inhibitors',
    'drug_lower': 'SGLT2 inhibitors',
    'slug': 'sglt2_hf_hr_nma',
    'condition': 'heart failure and cardiovascular risk',
    'comparator': 'Placebo',
    'title': 'SGLT2 inhibitors for heart-failure outcomes - hazard-ratio network meta-analysis',
    'hero_h2': 'Registry-native survival NMA of SGLT2 inhibitors for the HF-hospitalisation / CV-death composite',
    'nyt_headline': 'Which SGLT2 inhibitors cut heart-failure hospitalisation the most?',
    'pico': {
        'pop': 'Adults at cardiovascular or heart-failure risk (CVOT / HF populations)',
        'int': 'SGLT2 inhibitors (empagliflozin, dapagliflozin, canagliflozin, ertugliflozin, sotagliflozin)',
        'comp': 'Placebo',
        'out': 'HF-hospitalisation / CV-death composite hazard ratio (time-to-event)',
        'subgroup': 'By agent',
    },
    'acronyms': {t['nct']: t['name'] for t in trials},
    'trials': trials,
    'provenance_note': (f"Registry-native cohort: AACT search returned {scr['search_hits']} SGLT2-inhibitor drug "
                        f"records; {scr['hr_reporting']} trials posted a HF/CV-composite hazard ratio; "
                        f"{scr['included']} had a usable HR + 95% CI (most-precise per trial, fail-closed on "
                        f"implausible HR or degenerate CI). AACT-results-posted cohort, NOT a dual-screened "
                        f"systematic review; the HR is the published time-to-event estimate. Synthesis hierarchy: "
                        f"single-endpoint Bayesian HF league (sglt2_league.json), canagliflozin lead; "
                        f"ertugliflozin k=1 -> INSUFFICIENT. This is a HF/surrogate-composite ranking, not a "
                        f"mortality claim."),
}
json.dump(config, open(f'{HERE}/sglt2_rapidmeta_config.json', 'w', encoding='utf-8'), indent=1)
print(f"wrote sglt2_rapidmeta_config.json: {len(trials)} trials (survival/HR slots)")
print(f"  funnel: {scr['search_hits']} search -> {scr['hr_reporting']} HR-reporting -> {scr['included']} included")
