"""Assemble the rapidmeta-kit config for the DTA class from the harvested per-trial 2x2 table (dta_trials.json).
Writes dta_rapidmeta_config.json, ready for `python clone.py dta_rapidmeta_config.json` in rapidmeta-kit. The
kit has no native DTA panel, so each study's accuracy is summarised as a DIAGNOSTIC ODDS RATIO (DOR =
TP*TN/(FP*FN)) carried in the kit's ratio slots (publishedHR/hrLCI/hrUCI) -- the DOR is a ratio measure that
shares the log-ratio forest math, and is labelled 'diagnostic OR' everywhere (NOT a hazard ratio). The index
test (PET/MRI/CT/ultrasound) is the 'agent'. 0.5 continuity correction applied ONLY when a cell is zero (per
the unconditional-correction-bias rule). Registry-native (AACT); AACT-reconstructed 2x2, NOT a dual-screened SR."""
import io, sys, json, math
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

HERE = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma/class7_dta'
th = json.load(open(f'{HERE}/dta_trials.json', encoding='utf-8'))
scr = th['screening']

trials = []
for t in th['trials']:
    tp, fp, fn, tn = t['tp'], t['fp'], t['fn'], t['tn']
    # add 0.5 to ALL cells only if >=1 cell is zero (conditional correction; avoids OR->1 bias otherwise)
    if min(tp, fp, fn, tn) == 0:
        a, b, c, d = tp + 0.5, fp + 0.5, fn + 0.5, tn + 0.5
    else:
        a, b, c, d = tp, fp, fn, tn
    log_dor = math.log((a * d) / (b * c))
    se = math.sqrt(1 / a + 1 / b + 1 / c + 1 / d)
    dor = math.exp(log_dor); lo = math.exp(log_dor - 1.959964 * se); hi = math.exp(log_dor + 1.959964 * se)
    mod = t['modality']
    trials.append({
        'nct': t['nct'], 'name': t['name'], 'year': t['year'],
        'group': f'{mod} ({t["target"]}) -- diagnostic OR',
        'publishedHR': round(dor, 3), 'hrLCI': round(lo, 3), 'hrUCI': round(hi, 3),
        'allOutcomes': [{'shortLabel': 'DOR', 'type': 'survival',
                         'title': f'Diagnostic odds ratio (DOR), {mod}: Se={t["sens"]:.2f} Sp={t["spec"]:.2f}',
                         'publishedHR': round(dor, 3), 'hrLCI': round(lo, 3), 'hrUCI': round(hi, 3)}],
        'rob': ['some-concerns'] * 5,
    })
trials.sort(key=lambda x: -x['publishedHR'])   # most discriminating (highest DOR) first

config = {
    'drug': 'Oncologic imaging modalities',
    'drug_lower': 'imaging index tests',
    'slug': 'oncologic_imaging_dta_nma',
    'condition': 'cancer lesion and nodal staging',
    'comparator': 'Histopathology or follow-up reference standard',
    'title': 'Imaging modalities for cancer detection - comparative diagnostic-test-accuracy network',
    'hero_h2': 'Registry-native comparative DTA of PET / MRI / CT / ultrasound for oncologic lesion and nodal detection',
    'nyt_headline': 'Which scan finds cancer most accurately?',
    'pico': {
        'pop': 'Patients undergoing imaging for cancer lesion / nodal / metastatic detection or staging',
        'int': 'Imaging modalities (PET, MRI, CT, ultrasound) as index tests',
        'comp': 'Histopathology or clinical follow-up reference standard',
        'out': 'Diagnostic accuracy - sensitivity, specificity, Youden J, diagnostic odds ratio (DOR). The forest '
               'shows the per-study DOR (a diagnostic ODDS RATIO), NOT a hazard ratio',
        'subgroup': 'By imaging modality and by cancer target site',
    },
    'acronyms': {t['nct']: t['name'] for t in trials},
    'trials': trials,
    'provenance_note': (f"Registry-native cohort: {scr['se_sp_reporting']} AACT trials posted both sensitivity and "
                        f"specificity as percentages; {scr['included']} had a usable modality + subgroup "
                        f"denominators to reconstruct a 2x2 (TP=round(Se%xn1), TN=round(Sp%xn0); fail-closed on "
                        f"implausible rate / tiny subgroup). The per-study summary is the DIAGNOSTIC ODDS RATIO "
                        f"(DOR=TP*TN/(FP*FN)), carried in the ratio slots and labelled 'diagnostic OR' - it is NOT "
                        f"a time-to-event hazard ratio. AACT-reconstructed 2x2, NOT 2x2 tables read from full text "
                        f"and NOT a dual-screened systematic review. Synthesis hierarchy: Bayesian bivariate "
                        f"(Reitsma) league (dta_league.json) ranked by Youden J; the engine flags the cross-"
                        f"modality ranking as cross-target heterogeneity (mixed cancer sites) -> not a clean winner."),
}
json.dump(config, open(f'{HERE}/dta_rapidmeta_config.json', 'w', encoding='utf-8'), indent=1)
print(f"wrote dta_rapidmeta_config.json: {len(trials)} trials (DOR in ratio slots)")
print(f"  funnel: {scr['se_sp_reporting']} Se&Sp-reporting -> {scr['included']} included")
print(f"  top DOR: {trials[0]['name'][:24]} {trials[0]['publishedHR']} ({trials[0]['hrLCI']},{trials[0]['hrUCI']})")
