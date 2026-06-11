"""Assemble the rapidmeta-kit config for the RA class from the harvested per-trial ACR table (ra_trials.json).
Writes ra_rapidmeta_config.json, ready for `python clone.py ra_rapidmeta_config.json` in rapidmeta-kit.
Registry-native (AACT); the protocol/search/screen/extract framing reflects the AACT-native provenance, NOT a
fabricated dual-screen systematic review. (The harvester already enforces plausibility — control rate not >20pp
above active, arm N >= 10, events in [0,N] — so the config carries clean 2x2 cells.)"""
import io, sys, os, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

HERE = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma/class6_ra'
th = json.load(open(f'{HERE}/ra_trials.json', encoding='utf-8'))
trials_raw = th['trials']
scr = th['screening']

# strip private bookkeeping keys the kit schema does not expect
trials = []
for t in trials_raw:
    trials.append({k: v for k, v in t.items() if not k.startswith('_')})

config = {
    'drug': 'RA biologics & JAK inhibitors',
    'drug_lower': 'biologic and JAK-inhibitor DMARDs',
    'slug': 'ra_biologics_acr_nma',
    'condition': 'rheumatoid arthritis',
    'comparator': 'Placebo / control (on background DMARD)',
    'title': 'Biologic & JAK-inhibitor DMARDs for rheumatoid arthritis - ACR-response network meta-analysis',
    'hero_h2': 'Registry-native NMA of biologic and JAK DMARDs for ACR response in rheumatoid arthritis',
    'nyt_headline': 'Which rheumatoid-arthritis drugs get the most patients to a major response?',
    'pico': {
        'pop': 'Adults with rheumatoid arthritis',
        'int': 'Biologic DMARDs (TNF / IL-6 / T-cell / B-cell) and JAK inhibitors',
        'comp': 'Placebo or control on background conventional DMARD',
        'out': 'ACR20 / ACR50 / ACR70 response (ordered responder ladder)',
        'subgroup': 'By drug and by mechanism class',
    },
    'acronyms': {t['nct']: t['name'] for t in trials},
    'trials': trials,
    # provenance / honesty banner surfaced in the protocol tab
    'provenance_note': (f"Registry-native cohort: AACT search returned {scr['search_hits']} RA drug records; "
                        f"{scr['acr_reporting']} trials posted an ACR20/50/70 result; {scr['included']} had a "
                        f"usable active-vs-control responder pair (with per-arm N). This is an AACT-results-posted "
                        f"cohort, NOT a dual-screened full systematic review; responder counts are derived "
                        f"events = round(ACR% * N). Synthesis hierarchy: ordinal proportional-odds Bayesian "
                        f"league (ra_league.json), advanced-MoA >= TNF with heterogeneity flagged."),
}
json.dump(config, open(f'{HERE}/ra_rapidmeta_config.json', 'w', encoding='utf-8'), indent=1)
print(f"wrote ra_rapidmeta_config.json: {len(trials)} trials, "
      f"{sum(len(t['allOutcomes']) for t in trials)} ACR arm-outcomes")
print(f"  screening funnel: {scr['search_hits']} search -> {scr['acr_reporting']} ACR-reporting -> {scr['included']} included")
