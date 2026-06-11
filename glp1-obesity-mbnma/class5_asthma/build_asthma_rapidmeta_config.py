"""Assemble the rapidmeta-kit config for the asthma class from the harvested per-trial exacerbation-IRR table
(asthma_trials.json). Writes asthma_rapidmeta_config.json, ready for
`python clone.py asthma_rapidmeta_config.json` in rapidmeta-kit. Count/rate path: each trial carries the
annualised-exacerbation IRR in the kit's ratio slots (publishedHR/hrLCI/hrUCI), labelled as an IRR everywhere
(it is NOT a hazard ratio). Registry-native (AACT); AACT-native provenance, NOT a dual-screened SR."""
import io, sys, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

HERE = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma/class5_asthma'
th = json.load(open(f'{HERE}/asthma_trials.json', encoding='utf-8'))
trials = [{k: v for k, v in t.items() if not k.startswith('_')} for t in th['trials']]
scr = th['screening']

config = {
    'drug': 'Asthma biologics',
    'drug_lower': 'asthma biologics',
    'slug': 'asthma_biologics_exac_irr_nma',
    'condition': 'severe eosinophilic and allergic asthma',
    'comparator': 'Placebo',
    'title': 'Biologics for severe asthma - annualised-exacerbation rate-ratio network meta-analysis',
    'hero_h2': 'Registry-native count/rate NMA of anti-IL-5 / anti-IL-5R / anti-TSLP biologics for asthma exacerbations',
    'nyt_headline': 'Which severe-asthma biologics prevent the most attacks?',
    'pico': {
        'pop': 'Adults and adolescents with severe eosinophilic or allergic asthma',
        'int': 'Biologics (anti-IL-5, anti-IL-5R, anti-TSLP, anti-IgE)',
        'comp': 'Placebo',
        'out': 'Annualised asthma-exacerbation incidence-rate ratio (IRR) - a count/rate outcome, NOT a hazard ratio',
        'subgroup': 'By agent and by mechanism class',
    },
    'acronyms': {t['nct']: t['name'] for t in trials},
    'trials': trials,
    'provenance_note': (f"Registry-native cohort: AACT search returned {scr['search_hits']} asthma-biologic drug "
                        f"records; {scr['irr_reporting']} trials posted an annualised-exacerbation rate ratio; "
                        f"{scr['included']} had a usable IRR + 95% CI (most-precise per trial, fail-closed on "
                        f"implausible IRR or degenerate CI). The effect measure is an incidence-RATE ratio (IRR), "
                        f"carried in the kit's ratio (publishedHR) slots because it shares the log-ratio forest "
                        f"math with a hazard ratio - it is labelled IRR throughout and is NOT a time-to-event HR. "
                        f"AACT-results-posted cohort, NOT a dual-screened systematic review. Synthesis hierarchy: "
                        f"Bayesian IRR league (asthma_league.json), tezepelumab lead; the engine flags the raw "
                        f"cross-agent ranking as baseline-rate / eosinophil effect modification (I^2 high), not a "
                        f"clean winner."),
}
json.dump(config, open(f'{HERE}/asthma_rapidmeta_config.json', 'w', encoding='utf-8'), indent=1)
print(f"wrote asthma_rapidmeta_config.json: {len(trials)} trials (IRR in ratio slots)")
print(f"  funnel: {scr['search_hits']} search -> {scr['irr_reporting']} IRR-reporting -> {scr['included']} included")
