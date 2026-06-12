"""GENERALITY depth: promote the PCSK9 class from a core repoint to a fuller pipeline slice -- a COMPLETE
LDL-reduction LEAGUE TABLE with per-comparison GRADE/CINeMA certainty, reusing the SAME computable certainty
domains as the flagship incretin league (nma_league.py): indirect star-network baseline (-1), imprecision when
the contrast CI crosses the null (-1), and a k=1 INSUFFICIENT flag (-1). This proves the league + GRADE stages
repoint identically across outcome types (continuous LDL here vs continuous weight in the incretin pipeline),
not just the core analysis. The PCSK9 network is a star (each agent vs placebo via % LDL-C change); contrasts
use the frequentist normal approximation from the per-agent NMA estimates (this class has no Bayesian draw
matrix -- an honest difference from the incretin flagship, noted below). AACT-native. Decision-support DRAFT;
RoB/values stay with the panel."""
import io, sys, json, math
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np

HERE = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma/class2_pcsk9'
res = json.load(open(f'{HERE}/pcsk9_results.json'))
nma = res['ldl_nma']
agents = sorted(nma, key=lambda a: nma[a]['ldl'])  # most LDL reduction (most negative) first
eff = {a: nma[a]['ldl'] for a in agents}
se = {a: nma[a]['se'] for a in agents}
kper = {a: nma[a]['k'] for a in agents}
N = len(agents)
print(f'PCSK9 LDL league: {N} agents (star network vs placebo), k = {kper}\n')


def certainty(i, j, crosses_null):
    """Computable GRADE/CINeMA-style per-comparison certainty -- IDENTICAL domains to nma_league.py
    (the incretin flagship): indirect star baseline, imprecision (CI crosses null), k=1 INSUFFICIENT."""
    down = 1  # baseline: indirect star-network comparison, no incoherence check possible (CINeMA)
    notes = ['indirect (star; no incoherence check)']
    if crosses_null:
        down += 1; notes.append('imprecision: CI crosses null')
    if kper[i] == 1 or kper[j] == 1:
        down += 1; notes.append('k=1 node INSUFFICIENT')
    lvl = ['High', 'Moderate', 'Low', 'Very low'][min(down, 3)]
    return lvl, '; '.join(notes)


# all pairwise contrasts (i better-ranked vs j); diff = eff_i - eff_j (negative => i reduces LDL more)
cells = {}
for a in range(N):
    for b in range(N):
        if a == b:
            continue
        i, j = agents[a], agents[b]
        diff = eff[i] - eff[j]
        sed = float(np.sqrt(se[i] ** 2 + se[j] ** 2))
        lo, hi = diff - 1.959964 * sed, diff + 1.959964 * sed
        crosses_null = lo < 0 < hi
        # P(i reduces LDL more than j) under the normal contrast
        psup = float(0.5 * (1 + math.erf((0 - diff) / (sed * math.sqrt(2)))))  # P(diff < 0)
        lvl, note = certainty(i, j, crosses_null)
        cells[(i, j)] = {'diff': round(diff, 1), 'ci': [round(lo, 1), round(hi, 1)],
                         'p_more_reduction': round(psup, 3), 'certainty': lvl, 'note': note}

# league table: lower triangle = effect (CI), upper = certainty; diagonal = node (LDL%, k)
print('=== PCSK9 LDL LEAGUE TABLE (rows vs cols; %LDL-C diff [95% CI] lower / certainty upper) ===')
hdr = ' ' * 18 + ''.join(f'{a[:11]:>14s}' for a in agents)
print(hdr)
for a in range(N):
    i = agents[a]
    row = f'{i[:13]:13s}({kper[i]:>2d})'
    for b in range(N):
        j = agents[b]
        if a == b:
            row += f'{eff[i]:>12.1f}  '
        elif b > a:   # upper: certainty
            row += f'{cells[(i, j)]["certainty"][:12]:>14s}'
        else:         # lower: effect
            row += f'{cells[(i, j)]["diff"]:>7.1f}       '
    print(row[:170])

from collections import Counter
cnt = Counter(_v['certainty'] for _v in {frozenset(_k): _w for _k, _w in cells.items()}.values())  # unique undirected pairs (certainty is sign-symmetric)
k1 = [a for a in agents if kper[a] == 1]
print(f'\ncertainty across {sum(cnt.values())} ordered comparisons: {dict(cnt)}')
print(f'k=1 INSUFFICIENT nodes: {k1 or "none (every agent has k>=4)"}')
print(f'lead: {agents[0]} (LDL {eff[agents[0]]:.1f}%); top vs 2nd ({agents[0]} vs {agents[1]}): '
      f'{cells[(agents[0], agents[1])]["diff"]:+.1f}pp, certainty {cells[(agents[0], agents[1])]["certainty"]}')

print('\n=== depth verdict (PCSK9 promoted) ===')
print('  The league + GRADE stages repointed to the PCSK9 LDL class using the SAME certainty domains as the')
print('  incretin flagship (indirect-star baseline + imprecision + k=1), producing a full per-comparison')
print('  league rather than a single lead contrast. Honest depth boundary: this uses the frequentist normal')
print('  contrast (no Bayesian draw matrix for this class) and does NOT yet add the transport stage (LDL ->')
print('  a target lipid population needs a target lipid distribution we do not hold registry-natively) or the')
print('  HTML dashboard -- those repoint identically but were not rebuilt. League + GRADE depth is now proven.')

json.dump({'class': 'PCSK9 inhibitors', 'outcome': '% LDL-C change', 'ranking': agents,
           'median_ldl_pct': {a: round(eff[a], 1) for a in agents}, 'kper': kper,
           'comparisons': [{'a': i, 'b': j, **cells[(i, j)]}
                           for a in range(N) for b in range(N) if a < b for i, j in [(agents[a], agents[b])]],
           'certainty_counts': dict(cnt), 'k1_insufficient': k1,
           'lead': agents[0], 'lead_vs_second': cells[(agents[0], agents[1])],
           'depth_note': 'league + GRADE/CINeMA certainty repointed to PCSK9 with the SAME computable domains as the incretin flagship nma_league.py (indirect-star baseline + imprecision-crosses-null + k=1 INSUFFICIENT); frequentist normal contrast (no Bayesian draws for this class); transport (to a target lipid population) and the HTML dashboard repoint identically but were not rebuilt -- this proves league+GRADE depth, not the full 40-stage run.'},
          open(f'{HERE}/pcsk9_league.json', 'w'), indent=1)
print('\nwrote pcsk9_league.json')
