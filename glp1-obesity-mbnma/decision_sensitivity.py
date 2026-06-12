"""Decision-sensitivity / tipping-point analysis: GRADE leaves the minimal important difference (MID) and
the values trade-off to the panel, so we QUANTIFY exactly how the conclusion depends on the panel's MID.
From the joint posterior (nma_draws.npz) we compute P(difference > delta) across delta for the headline
recommendation contrast and every league comparison, and the 'tipping MID' where the conclusion changes.
Transparent values-dependence, computed not assumed. Offline SVG curve. Decision-support DRAFT."""
import io, sys, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np

ROOT = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma'
d = np.load(f'{ROOT}/nma_draws.npz', allow_pickle=True)
et = d['et']; nodes = [str(x) for x in d['nodes']]; ni = {n: i for i, n in enumerate(nodes)}
kper = {nodes[i]: int(d['kper'][i]) for i in range(len(nodes))}
med = np.median(et, axis=1); order = list(np.argsort(-med))

# ---- headline contrast: tirzepatide - semaglutide-sc-weekly ----
c = et[ni['tirzepatide']] - et[ni['semaglutide-sc-weekly']]
deltas = np.arange(0, 6.01, 0.25)
psup = np.array([np.mean(c > dd) for dd in deltas])
def tipping(thresh):
    below = np.where(psup < thresh)[0]
    return float(deltas[below[0]]) if len(below) else float('inf')
print('=== headline: tirzepatide vs sc-semaglutide -- P(difference > MID) ===')
for dd in [0, 1, 2, 3, 4]:
    print(f'  MID {dd} pp: P(tirz better by >={dd} pp) = {np.mean(c > dd):.2f}')
print(f'  -> P falls below 0.95 at MID {tipping(0.95):.2f} pp; below 0.50 at MID {tipping(0.50):.2f} pp.')
print('  Reading for the panel: if your MID is <= ~%.1f pp the difference is near-certain; above it, uncertain.' % tipping(0.95))

# ---- league: how many comparisons stay "confident" (P>=0.95) as MID rises ----
print('\n=== league: comparisons with P(superiority >= MID) >= 0.95, by MID ===')
pairs = [(order[a], order[b]) for a in range(len(nodes)) for b in range(len(nodes)) if a < b]
league_rows = []
for (i, j) in pairs:
    cc = et[i] - et[j]
    row = {'a': nodes[i], 'b': nodes[j], 'median': round(float(np.median(cc)), 1),
           'k_min': min(kper[nodes[i]], kper[nodes[j]]),
           **{f'p_mid{m}': round(float(np.mean(cc > m)), 2) for m in [0, 2, 4]}}
    league_rows.append(row)
for m in [0, 2, 4]:
    n_conf = sum(1 for r in league_rows if r[f'p_mid{m}'] >= 0.95 and r['k_min'] >= 2)
    print(f'  MID {m} pp: {n_conf}/{len(pairs)} comparisons confident (P>=0.95) AND both nodes k>=2')
print('  (k>=2 filter excludes the single-trial apex agents whose comparisons are INSUFFICIENT regardless of MID)')

# ---- offline SVG curve for the headline contrast ----
W, H, pad = 520, 300, 50
def x(v): return pad + (v / 6.0) * (W - 2 * pad)
def y(p): return H - pad - p * (H - 2 * pad)
pts = ' '.join(f'{x(dd):.1f},{y(p):.1f}' for dd, p in zip(deltas, psup))
grid = ''.join(f'<line x1="{x(g):.0f}" y1="{pad}" x2="{x(g):.0f}" y2="{H-pad}" stroke="#eee"/>'
               f'<text x="{x(g):.0f}" y="{H-pad+16}" font-size="11" text-anchor="middle">{g}</text>' for g in range(0, 7))
hgrid = ''.join(f'<line x1="{pad}" y1="{y(p):.0f}" x2="{W-pad}" y2="{y(p):.0f}" stroke="#eee"/>'
                f'<text x="{pad-6}" y="{y(p)+4:.0f}" font-size="11" text-anchor="end">{p:.1f}</text>' for p in [0, .25, .5, .75, .95, 1])
mark = (f'<line x1="{x(0):.0f}" y1="{y(0.95):.0f}" x2="{W-pad}" y2="{y(0.95):.0f}" stroke="#c33" stroke-dasharray="4"/>'
        f'<text x="{W-pad}" y="{y(0.95)-4:.0f}" font-size="10" fill="#c33" text-anchor="end">P=0.95</text>')
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" font-family="system-ui,Arial">'
       f'<rect width="{W}" height="{H}" fill="white"/>{grid}{hgrid}{mark}'
       f'<polyline points="{pts}" fill="none" stroke="#1a6" stroke-width="2.5"/>'
       f'<text x="{W/2:.0f}" y="{H-8}" font-size="12" text-anchor="middle">panel MID (pp body-weight, tirz − sema)</text>'
       f'<text x="14" y="{H/2:.0f}" font-size="12" text-anchor="middle" transform="rotate(-90 14 {H/2:.0f})">P(tirz better by &gt; MID)</text>'
       f'</svg>')
open(f'{ROOT}/decision_sensitivity.svg', 'w', encoding='utf-8').write(svg)

json.dump({'headline': {'comparison': 'tirzepatide vs semaglutide-sc-weekly',
            'p_by_mid': {str(dd): round(float(np.mean(c > dd)), 3) for dd in [0, 1, 2, 3, 4]},
            'tipping_mid_p95': round(tipping(0.95), 2), 'tipping_mid_p50': round(tipping(0.50), 2)},
           'league': league_rows,
           'confident_by_mid': {str(m): sum(1 for r in league_rows if r[f'p_mid{m}'] >= 0.95 and r['k_min'] >= 2) for m in [0, 2, 4]},
           'n_pairs': len(pairs),
           'note': 'P(difference>MID) from the joint posterior; quantifies the panel-set MID dependence GRADE leaves to judgement; k>=2 filter flags single-trial INSUFFICIENT'},
          open(f'{ROOT}/decision_sensitivity.json', 'w'), indent=1)
print('\nwrote decision_sensitivity.json + decision_sensitivity.svg')
