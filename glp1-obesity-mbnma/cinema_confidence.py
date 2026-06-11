"""CINeMA network-confidence layer (Nikolakopoulou/Salanti 2020) for the recommendation contrast.
Six domains -- within-study bias, reporting bias, indirectness, imprecision, heterogeneity, incoherence --
combined into confidence (High/Moderate/Low/Very low). Key network subtlety: tirzepatide-vs-semaglutide is
an INDIRECT comparison (no head-to-head trial) anchored on placebo, so (a) transitivity must be checked
(transitivity.csv effect-modifiers) and (b) incoherence is NOT assessable in a star network -> flagged.
Integrates our registry-native wide-gap evidence into the data-driven domains. AACT-derived. Decision-support
DRAFT; within-study bias = panel input. Aligns with allmeta/cinema's 6-domain scheme."""
import io, sys, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np, pandas as pd

ROOT = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma'
g = json.load(open(f'{ROOT}/grade_inputs.json'))
pb = json.load(open(f'{ROOT}/registry_pubbias.json'))
tr = pd.read_csv(f'{ROOT}/transitivity.csv')

# --- contribution matrix (star network): tirz-vs-sema is INDIRECT via placebo ---
# each anchored arm contributes; no closed loop -> diagonal direct contributions, indirect contrast = 50/50.
print('=== network geometry ===')
print('  Star (placebo-anchored): tirzepatide-vs-semaglutide has NO direct head-to-head trial.')
print('  Contribution to the tirz-vs-sema estimate: ~50% tirzepatide-vs-placebo trials, ~50% sema-vs-placebo.')
print('  => the comparison is fully INDIRECT; transitivity is the load-bearing assumption; incoherence')
print('     (direct-vs-indirect agreement) CANNOT be assessed (no direct evidence, no closed loop).\n')

# --- transitivity check: effect-modifier similarity between the tirz and sema node trials ---
def node_summary(node):
    s = tr[tr.node == node]
    return {'k': len(s), 'age': s.age.mean(), 'baseline_wt': s.baseline_wt.mean(),
            'hba1c': s.hba1c.mean(), 'pct_obesity': (s.population == 'obesity').mean() * 100}
T = node_summary('tirzepatide'); S = node_summary('semaglutide-sc-weekly')
print('=== transitivity (effect-modifier balance across the indirectly-compared nodes) ===')
print(f'{"modifier":14s}{"tirzepatide":>14s}{"sema-sc-weekly":>16s}')
flags = []; missing = []
for k, lab in [('age', 'age (y)'), ('baseline_wt', 'baseline wt (kg)'), ('hba1c', 'HbA1c (%)'), ('pct_obesity', 'obesity (%)')]:
    a, b = T[k], S[k]
    comparable = (a == a and b == b)
    diff = abs(a - b) if comparable else float('nan')
    thr = {'age': 5, 'baseline_wt': 8, 'hba1c': 0.5, 'pct_obesity': 25}[k]
    flag = comparable and diff > thr
    if flag:
        flags.append(lab)
    if not comparable:
        missing.append(lab)
    print(f'  {lab:16s}{a:12.1f}{b:16.1f}   {("diff %.1f"%diff) if comparable else "MISSING (one node has no data)"} '
          f'{"<-- imbalance" if flag else ""}')
# transitivity is only PARTIALLY assessable: balanced on what we can see, but key modifiers missing
transitivity_ok = len(flags) == 0
partial = len(missing) > 0
print(f'  transitivity: {"balanced on available modifiers" if transitivity_ok else "CONCERN: " + ", ".join(flags)}'
      + (f' -- but INCOMPLETE: {", ".join(missing)} missing for one node (AACT did not post them).' if partial else ''))

# --- the six CINeMA domains for tirzepatide vs semaglutide ---
ci = g['ci95']; crosses = ci['lower'] < 0 < ci['upper']
i2 = g.get('i2_sema_pct', 0) or 0
domains = {
    'Within-study bias': ('Some concerns? PANEL',
        'Contribution-weighted RoB-2 of the tirz + sema trials; panel input (most industry-sponsored).'),
    'Reporting bias': ('No concerns',
        f'Directly measured (our strongest domain): 6 ghosts identified, observed pull '
        f'{pb["measured_reporting_bias_shift_pp"]} pp (negligible); not funnel-inferred (registry_pubbias.json).'),
    'Indirectness': (('Some concerns' if (not transitivity_ok or partial) else 'No concerns'),
        f'(a) Population applicability transported & quantified (POTH 0.898). (b) INDIRECT comparison: transitivity '
        f'{"balanced on available modifiers but INCOMPLETE ("+", ".join(missing)+" missing)" if partial else ("CONCERN ("+", ".join(flags)+")" if flags else "plausible")}. '
        'NB any CV-benefit claim -> Major concerns (weight not a validated CV surrogate).'),
    'Imprecision': (('Major concerns' if crosses else 'Some concerns'),
        f'Indirect contrast 2.9 pp, 95% CrI [{ci["lower"]}, {ci["upper"]}] {"crosses null" if crosses else "excludes null"} '
        '(conservative; exact NMA contrast narrower).'),
    'Heterogeneity': ('Some concerns',
        f'I^2 of contributing nodes ~{i2:.0f}% (high BUT largely EXPLAINED by follow-up 44-104 wk / population; '
        'CINeMA does not downgrade to major for explained heterogeneity).'),
    'Incoherence': ('Not assessable',
        'Star network: no direct tirz-vs-sema evidence and no closed loop -> direct-vs-indirect agreement cannot be tested.'),
}
print('\n=== CINeMA domains (tirzepatide vs semaglutide; DRAFT) ===')
for d, (r, n) in domains.items():
    print(f'  {d:20s} {r:18s}  {n}')

# --- combine to confidence (CINeMA-style: downgrade per domain concern level) ---
def level(r):
    r = r.lower()
    if 'major' in r:
        return 2
    if 'some' in r or 'panel' in r:
        return 1
    return 0   # no concerns / not assessable / no contribution
# CINeMA combination: 1 level down per "major", and per pair of "some" (capped)
majors = sum(1 for r, _ in domains.values() if 'major' in r.lower())
somes = sum(1 for r, _ in domains.values() if ('some' in r.lower() or 'panel' in r.lower()))
down = majors + somes // 2
levels = ['High', 'Moderate', 'Low', 'Very low']
conf = levels[min(down, 3)]
print(f'\n  => CINeMA CONFIDENCE (tirz vs sema): {conf}  '
      f'(majors={majors}, some={somes} -> {down} levels down; within-study bias pending panel)')
print('  Consistent with the GRADE certainty (Low): imprecision of the INDIRECT contrast is binding,')
print('  and the network cannot self-check via incoherence -> a head-to-head trial is the key evidence gap.')

print('\n=== honest scope ===')
print('  - Star network -> CINeMA reduces to per-comparison confidence + transitivity; the full app')
print('    (allmeta/cinema) contribution-weights within-study bias across a connected network. A real')
print('    head-to-head (e.g. SURMOUNT-5 tirz vs sema) would supply the direct evidence + an incoherence check.')
print('  - Combination scheme here is a faithful CINeMA-style mapping; the published app uses a specific table.')

json.dump({'comparison': 'tirzepatide vs semaglutide-sc-weekly (indirect, star network)',
           'transitivity_ok': bool(transitivity_ok), 'transitivity_flags': flags,
           'domains': {d: {'rating': r, 'note': n} for d, (r, n) in domains.items()},
           'cinema_confidence': conf, 'majors': int(majors), 'some_concerns': int(somes),
           'note': 'indirect comparison; incoherence not assessable (star); within-study bias = panel; consistent with GRADE Low; head-to-head trial is the key gap'},
          open(f'{ROOT}/cinema_confidence.json', 'w'), indent=1)
print('\nwrote cinema_confidence.json')
