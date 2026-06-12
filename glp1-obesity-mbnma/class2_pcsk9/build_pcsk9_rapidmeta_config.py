"""Assemble the rapidmeta-kit config for the PCSK9 class from the harvested per-trial LDL %-change table
(pcsk9_trials.json). Writes pcsk9_rapidmeta_config.json, ready for
`python clone.py pcsk9_rapidmeta_config.json` in rapidmeta-kit. Continuous path: each trial carries a
continuous outcome (md/se) in allOutcomes (the kit's continuous forest slot), exactly like the incretin
flagship. Registry-native (AACT); AACT-native provenance, NOT a dual-screened SR. LDL-C is the validated CV
surrogate, but transport/league are of the LDL surrogate, NOT a CV-event claim."""
import io, sys, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

HERE = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma/class2_pcsk9'
th = json.load(open(f'{HERE}/pcsk9_trials.json', encoding='utf-8'))
trials = [{k: v for k, v in t.items() if not k.startswith('_')} for t in th['trials']]
scr = th['screening']

config = {
    'drug': 'PCSK9 inhibitors',
    'drug_lower': 'PCSK9 inhibitors',
    'slug': 'pcsk9_ldl_md_nma',
    'condition': 'hypercholesterolaemia',
    'comparator': 'Placebo or statin control',
    'title': 'PCSK9 inhibitors for LDL-C lowering - continuous mean-difference network meta-analysis',
    'hero_h2': 'Registry-native continuous NMA of PCSK9 monoclonals and siRNA for LDL-C percent reduction',
    'nyt_headline': 'Which PCSK9 inhibitors lower bad cholesterol the most?',
    'pico': {
        'pop': 'Adults with hypercholesterolaemia or elevated cardiovascular risk',
        'int': 'PCSK9 inhibitors (evolocumab, alirocumab, bococizumab monoclonals; inclisiran siRNA)',
        'comp': 'Placebo or statin background control',
        'out': 'LDL-C percent change from baseline (continuous mean difference, active - control)',
        'subgroup': 'By agent and by modality (monoclonal vs siRNA)',
    },
    'acronyms': {t['nct']: t['name'] for t in trials},
    'trials': trials,
    'provenance_note': (f"Registry-native cohort: AACT search returned {scr['search_hits']} PCSK9-inhibitor drug "
                        f"records; {scr['ldl_reporting']} trials posted an LDL-C percent-change result; "
                        f"{scr['included']} had a usable active-vs-control mean difference (LS-mean + posted "
                        f"dispersion -> per-arm SE; fail-closed on missing SE or implausible md). AACT-results-"
                        f"posted cohort, NOT a dual-screened systematic review; md = active - control LDL-C % "
                        f"change with se = sqrt(se_active^2 + se_control^2). Synthesis hierarchy: Bayesian LDL "
                        f"league (pcsk9_league_bayes.json), bococizumab lead. LDL-C is a validated CV surrogate, "
                        f"but this analysis ranks the LDL-lowering surrogate ONLY - it is NOT a cardiovascular-"
                        f"event claim."),
}
json.dump(config, open(f'{HERE}/pcsk9_rapidmeta_config.json', 'w', encoding='utf-8'), indent=1)
print(f"wrote pcsk9_rapidmeta_config.json: {len(trials)} trials (continuous md/se slots)")
print(f"  funnel: {scr['search_hits']} search -> {scr['ldl_reporting']} LDL-reporting -> {scr['included']} included")
