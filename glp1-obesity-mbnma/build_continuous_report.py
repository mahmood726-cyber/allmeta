"""Self-contained continuous dose-response NMA report (offline HTML, inline SVG).
Forest plot of pooled % weight loss (NUTS CrIs) + per-agent Emax dose-response curves
+ a GRADE-style Summary-of-Findings table. Reuses THIS repo's validated engine outputs
(pymc_ranking.json + contrasts_full.csv); no rapidmeta-kit dependency.
"""
import io, sys, json, math, html
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np, pandas as pd
from scipy.optimize import curve_fit

ROOT = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma'
B = json.load(open(f'{ROOT}/pymc_ranking.json'))         # NUTS: agents, sucra, poth, pred_median, pred_cri, order
cdf = pd.read_csv(f'{ROOT}/contrasts_full.csv')
agents = B['agents']; order = B['order']
pred = dict(zip(agents, B['pred_median']))
crilo = dict(zip(agents, B['pred_cri'][0])); crihi = dict(zip(agents, B['pred_cri'][1]))
sucra = dict(zip(agents, B['sucra']))
ntr = {a: int(cdf[cdf.agent == a]['nct'].nunique()) for a in agents}
maxd = {a: float(cdf[cdf.agent == a]['dose_wk'].max()) for a in agents}


def emax(d, E, ED): return E * d / (ED + d)


def fit(a):
    s = cdf[cdf.agent == a]
    d = s['dose_wk'].values.astype(float); y = s['loss'].values.astype(float)
    sig = np.sqrt(np.clip(s['var'].values.astype(float), 1e-6, None))
    if len(set(d)) < 2:
        return None
    try:
        p, _ = curve_fit(emax, d, y, p0=[max(y.max(), 1), np.median(d[d > 0])],
                         sigma=sig, absolute_sigma=True, bounds=([0, 1e-3], [200, 1e4]), maxfev=40000)
        return p
    except Exception:
        return None


# ---------- forest plot SVG (ranked nodes) ----------
W, rowH, padL, padR, padT = 820, 34, 230, 120, 50
xs = [0, max(crihi.values()) * 1.04]
n = len(order); H = padT + n * rowH + 60


def xpix(v): return padL + (v - xs[0]) / (xs[1] - xs[0]) * (W - padL - padR)


forest = [f'<svg width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="system-ui,Segoe UI,Arial">']
forest.append(f'<line x1="{xpix(0)}" y1="{padT-10}" x2="{xpix(0)}" y2="{padT+n*rowH}" stroke="#888" stroke-dasharray="3 3"/>')
for gx in range(0, int(xs[1]) + 1, 5):
    forest.append(f'<line x1="{xpix(gx)}" y1="{padT-10}" x2="{xpix(gx)}" y2="{padT+n*rowH}" stroke="#eee"/>')
    forest.append(f'<text x="{xpix(gx)}" y="{padT+n*rowH+18}" font-size="11" fill="#666" text-anchor="middle">{gx}</text>')
forest.append(f'<text x="{(padL+W-padR)/2}" y="{padT+n*rowH+38}" font-size="12" fill="#444" text-anchor="middle">% body-weight loss vs placebo at max studied dose (95% CrI)</text>')
for i, a in enumerate(order):
    y = padT + i * rowH + rowH / 2
    lo, hi, m = crilo[a], crihi[a], pred[a]
    forest.append(f'<text x="{padL-12}" y="{y+4}" font-size="13" fill="#111" text-anchor="end">{i+1}. {html.escape(a)} <tspan fill="#888" font-size="11">(k={ntr[a]})</tspan></text>')
    forest.append(f'<line x1="{xpix(lo)}" y1="{y}" x2="{xpix(hi)}" y2="{y}" stroke="#2563eb" stroke-width="2"/>')
    forest.append(f'<line x1="{xpix(lo)}" y1="{y-5}" x2="{xpix(lo)}" y2="{y+5}" stroke="#2563eb" stroke-width="2"/>')
    forest.append(f'<line x1="{xpix(hi)}" y1="{y-5}" x2="{xpix(hi)}" y2="{y+5}" stroke="#2563eb" stroke-width="2"/>')
    forest.append(f'<circle cx="{xpix(m)}" cy="{y}" r="5" fill="#1d4ed8"/>')
    forest.append(f'<text x="{xpix(hi)+8}" y="{y+4}" font-size="12" fill="#1d4ed8">{m:.1f} ({lo:.1f},{hi:.1f})</text>')
forest.append('</svg>')

# ---------- dose-response curves SVG ----------
CW, CH, cpadL, cpadB, cpadT = 820, 420, 60, 50, 30
alld = cdf['dose_wk']; ally = cdf['loss']
dmax = float(np.percentile(alld, 98)) * 1.05; ymax = float(ally.max()) * 1.12
palette = ['#1d4ed8', '#dc2626', '#059669', '#d97706', '#7c3aed', '#0891b2', '#be185d', '#4d7c0f', '#b91c1c']


def cx(d): return cpadL + d / dmax * (CW - cpadL - 30)
def cy(v): return CH - cpadB - max(0, v) / ymax * (CH - cpadB - cpadT)


dr = [f'<svg width="{CW}" height="{CH}" viewBox="0 0 {CW} {CH}" font-family="system-ui,Segoe UI,Arial">']
dr.append(f'<line x1="{cpadL}" y1="{CH-cpadB}" x2="{CW-30}" y2="{CH-cpadB}" stroke="#333"/>')
dr.append(f'<line x1="{cpadL}" y1="{cpadT}" x2="{cpadL}" y2="{CH-cpadB}" stroke="#333"/>')
for gy in range(0, int(ymax) + 1, 5):
    dr.append(f'<line x1="{cpadL}" y1="{cy(gy)}" x2="{CW-30}" y2="{cy(gy)}" stroke="#f0f0f0"/>')
    dr.append(f'<text x="{cpadL-8}" y="{cy(gy)+4}" font-size="11" fill="#666" text-anchor="end">{gy}</text>')
dr.append(f'<text x="18" y="{CH/2}" font-size="12" fill="#444" transform="rotate(-90 18 {CH/2})" text-anchor="middle">weight loss vs placebo (pp)</text>')
dr.append(f'<text x="{(cpadL+CW-30)/2}" y="{CH-12}" font-size="12" fill="#444" text-anchor="middle">weekly-equivalent dose (mg)</text>')
leg = []
ci = 0
for a in order:
    s = cdf[cdf.agent == a]; col = palette[ci % len(palette)]; ci += 1
    for _, r in s.iterrows():
        dr.append(f'<circle cx="{cx(r.dose_wk)}" cy="{cy(r.loss)}" r="3.2" fill="{col}" fill-opacity="0.75"/>')
    p = fit(a)
    if p is not None:
        pts = [f'{cx(dd):.1f},{cy(emax(dd,*p)):.1f}' for dd in np.linspace(0.01, min(maxd[a], dmax), 60)]
        dr.append(f'<polyline points="{" ".join(pts)}" fill="none" stroke="{col}" stroke-width="2"/>')
    leg.append((a, col))
lx = CW - 210
dr.append(f'<rect x="{lx-8}" y="{cpadT}" width="200" height="{len(leg)*16+10}" fill="#fff" fill-opacity="0.85" stroke="#ddd"/>')
for j, (a, col) in enumerate(leg):
    yy = cpadT + 14 + j * 16
    dr.append(f'<line x1="{lx}" y1="{yy-4}" x2="{lx+18}" y2="{yy-4}" stroke="{col}" stroke-width="2"/>')
    dr.append(f'<text x="{lx+24}" y="{yy}" font-size="11" fill="#222">{html.escape(a)}</text>')
dr.append('</svg>')

# ---------- SoF table ----------
rows = ''.join(
    f'<tr><td>{i+1}</td><td>{html.escape(a)}</td><td>{ntr[a]}</td>'
    f'<td>{pred[a]:.1f} ({crilo[a]:.1f}, {crihi[a]:.1f})</td><td>{sucra[a]:.3f}</td></tr>'
    for i, a in enumerate(order))

conv = 'NUTS-certified (Rhat={:.3f}, ESS={:.0f})'.format(B.get('rhat_max', float('nan')), B.get('ess_min', float('nan')))
HTML = f"""<!doctype html><html lang=en><meta charset=utf-8>
<title>Incretin agonists for obesity — dose-response NMA</title>
<style>
body{{font-family:system-ui,Segoe UI,Arial;margin:0;background:#fafafa;color:#111}}
.wrap{{max-width:880px;margin:0 auto;padding:24px}}
h1{{font-size:22px;margin:0 0 4px}} h2{{font-size:16px;margin:28px 0 8px;border-bottom:2px solid #1d4ed8;padding-bottom:4px}}
.sub{{color:#555;font-size:13px;margin-bottom:16px}}
.badge{{display:inline-block;background:#dbeafe;color:#1e40af;border-radius:10px;padding:2px 10px;font-size:12px;margin-right:6px}}
table{{border-collapse:collapse;width:100%;font-size:13px;margin-top:6px}}
th,td{{border:1px solid #e2e2e2;padding:6px 9px;text-align:left}} th{{background:#f1f5f9}}
.note{{font-size:12px;color:#555;margin-top:8px;line-height:1.5}}
.card{{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin-top:10px}}
</style>
<div class=wrap>
<h1>Incretin receptor agonists for obesity — dose-response network meta-analysis</h1>
<div class=sub>GLP-1 / GIP / glucagon agonists, all molecules developed after 2010, all RCTs on ClinicalTrials.gov.
Continuous endpoint: % change in body weight vs placebo.</div>
<span class=badge>AACT snapshot 2026-06-01</span><span class=badge>{cdf['nct'].nunique()} trials · {len(cdf)} contrasts</span>
<span class=badge>{conv}</span><span class=badge>POTH {B['poth']:.3f}</span>

<h2>Treatment hierarchy — pooled weight loss (forest plot)</h2>
<div class=card>{''.join(forest)}</div>
<div class=note>Posterior median % weight loss at each node's maximum studied dose, 95% credible interval,
from the NUTS-certified hierarchical Emax MBNMA. Ranked by SUCRA. POTH = {B['poth']:.3f}
(≫ 0.67 published median → an informative hierarchy).</div>

<h2>Dose-response surfaces (per agent)</h2>
<div class=card>{''.join(dr)}</div>
<div class=note>Points = observed within-trial contrasts vs placebo; curves = fitted Emax
(loss = Emax·dose/(ED50+dose)), same model form as allmeta's R-validated engine. Oral and
subcutaneous semaglutide are separate nodes (different bioavailability).</div>

<h2>Summary of findings</h2>
<table><tr><th>Rank</th><th>Node</th><th>Trials (k)</th><th>Weight loss pp (95% CrI)</th><th>SUCRA</th></tr>{rows}</table>
<div class=note>Three independent methods agree on the top-4 ordering (frequentist MC, emcee, NUTS).
Extraction externally validated against the published <i>NEJM</i> primaries (SURMOUNT-1, orforglipron,
retatrutide) — exact once the estimand is pinned. Top-2 nodes rest on single phase-2 trials
(low evidence, wide CrIs). τ (between-study) ≈ {B.get('tau_median',0):.1f} pp.
Continuous synthesis by this repo's engine; SR governance (screening/RoB-2/GRADE/PRISMA) via RapidMeta.</div>
</div></html>"""

open(f'{ROOT}/continuous_report.html', 'w', encoding='utf-8').write(HTML)
print(f'wrote continuous_report.html ({len(HTML)} bytes); nodes={len(order)}; POTH={B["poth"]:.3f}')
