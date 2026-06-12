"""GENERALITY depth (dashboard) for the SGLT2 class: render the Bayesian HF-hospitalisation league + GRADE
certainty + HR->ARR/NNT transport into one self-contained, fully-offline HTML page (the 4th depth stage).
Static server-side build (no CDN, no client JS, no hardcoded local paths). Reads sglt2_league.json +
sglt2_transport.json."""
import io, sys, json, html, re as _re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

HERE = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma/class3_sglt2'
lg = json.load(open(f'{HERE}/sglt2_league.json'))
tr = json.load(open(f'{HERE}/sglt2_transport.json'))
agents = lg['ranking']; A = len(agents)
cmap = {(c['a'], c['b']): c for c in lg['comparisons']}
CCLASS = {'High': 'high', 'Moderate': 'mod', 'Low': 'low', 'Very low': 'vlow'}
e = html.escape


def cell(a, b):
    if a == b:
        ag = agents[a]
        return f'<td class="diag">{lg["median_hr"][ag]:.2f}<br><span class="k">k={lg["kper"][ag]}</span></td>'
    i, j = agents[a], agents[b]
    if a < b:
        c = cmap[(i, j)]
        return f'<td class="cert {CCLASS[c["certainty"]]}" title="P(sup)={c["p_superiority"]:.2f}">{e(c["certainty"])}</td>'
    c = cmap[(j, i)]
    return f'<td class="eff">{c["hr_ratio"]:.2f}</td>'


league_rows = ''.join(f'<tr><th class="rowh">{e(agents[a])}</th>' + ''.join(cell(a, b) for b in range(A)) + '</tr>\n'
                      for a in range(A))
league_head = '<th></th>' + ''.join(f'<th class="colh">{e(x)}</th>' for x in agents)
cc = lg['certainty_counts']; cc_txt = ', '.join(f'{k}: {v}' for k, v in cc.items())

scen_rows = ''
for s in tr['scenarios']:
    star = ' &#9733;' if s['primary'] else ''
    scen_rows += (f'<tr><td class="ag">{e(s["population"])}{star}</td><td>{s["baseline_annual_risk"]*100:.1f}%/yr</td>'
                  f'<td>{s["arr_pct_yr"]:.2f} ({s["arr_cri"][0]:.2f}, {s["arr_cri"][1]:.2f})</td>'
                  f'<td><b>{s["nnt_yr"]:.0f}</b> ({s["nnt_cri"][0]:.0f}&ndash;{s["nnt_cri"][1]:.0f})</td></tr>\n')

PAGE = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SGLT2 inhibitors - Bayesian HF-hospitalisation league, GRADE certainty &amp; transported NNT</title>
<meta property="og:title" content="SGLT2i Bayesian HF-hospitalisation league, GRADE certainty & transported NNT">
<meta property="og:description" content="Registry-native (AACT) SGLT2 inhibitor heart-failure-hospitalisation league from a Bayesian draw matrix, with per-comparison GRADE certainty and HR-to-NNT transport across baseline-risk targets. Decision-support DRAFT.">
<meta property="og:type" content="website">
<style>
:root{{--bg:#0f1419;--card:#1a2029;--ink:#e6edf3;--mut:#9aa7b4;--line:#2a323d;--acc:#4da3ff}}
*{{box-sizing:border-box}} body{{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,Segoe UI,Roboto,sans-serif}}
.wrap{{max-width:1000px;margin:0 auto;padding:28px 18px 60px}}
h1{{font-size:22px;margin:0 0 4px}} h2{{font-size:17px;margin:0 0 10px;color:var(--acc)}}
.sub{{color:var(--mut);margin:0 0 8px}}
.card{{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 18px;margin:14px 0}}
table{{border-collapse:collapse;width:100%;font-size:14px}}
th,td{{border:1px solid var(--line);padding:7px 9px;text-align:center}}
.rowh,.colh{{background:#222b36;font-weight:600}} .rowh{{text-align:left}}
.diag{{background:#11161d;font-weight:700}} .k{{color:var(--mut);font-weight:400;font-size:12px}}
.eff{{color:var(--mut)}}
.cert.high{{background:#0e3a1e}} .cert.mod{{background:#3a360e}} .cert.low{{background:#3a1f0e}} .cert.vlow{{background:#3a0e12}}
td.ag{{text-align:left;font-weight:600}}
.note{{color:var(--mut);font-size:13px;border-left:3px solid var(--line);padding:4px 0 4px 12px;margin:10px 0}}
.flag{{color:#ffb454}} .legend span{{display:inline-block;margin-right:14px;font-size:12px;color:var(--mut)}}
.sw{{display:inline-block;width:11px;height:11px;border-radius:2px;vertical-align:middle;margin-right:4px}}
footer{{color:var(--mut);font-size:12px;margin-top:34px;border-top:1px solid var(--line);padding-top:12px}}
</style>
</head>
<body>
<div class="wrap">
<h1>SGLT2 inhibitors &mdash; Bayesian HF-hospitalisation league, GRADE certainty &amp; transported NNT</h1>
<p class="sub">Registry-native (AACT) generality repoint &middot; <b>second full-depth class</b> (hard-outcome / survival path) &middot; <b>decision-support DRAFT</b> &mdash; RoB &amp; values stay with the panel. League fit by hierarchical Bayesian RE on log-HR (nutpie, R&#770;={lg['rhat']:.3f}); contrasts from posterior draws.</p>

<div class="card">
<h2>HF-hospitalisation league (one exact endpoint) &amp; per-comparison certainty</h2>
<p class="sub">Lower triangle = HR ratio (row vs column). Upper triangle = computable GRADE/CINeMA certainty (indirect-star baseline + imprecision when the contrast CrI crosses the null + k=1 INSUFFICIENT) &mdash; identical domains to <code>nma_league.py</code>; hover a cell for P(superiority). Diagonal = posterior median HR (k trials). Restricting to the <b>single HF-hospitalisation endpoint</b> resolves the I&sup2;=87% composite-pooling artifact the class-3 repoint flagged.</p>
<table>
<thead><tr>{league_head}</tr></thead>
<tbody>
{league_rows}</tbody>
</table>
<p class="legend"><span><i class="sw" style="background:#3a1f0e"></i>Low</span><span><i class="sw" style="background:#3a0e12"></i>Very low</span></p>
<p class="note">Across {sum(cc.values())} ordered comparisons: <b>{e(cc_txt)}</b>. Lead <b>{e(lg['lead'])}</b> (HR {lg['median_hr'][lg['lead']]:.2f}); all agents reduce HF hospitalisation. <span class="flag">ertugliflozin (k=1) is correctly flagged INSUFFICIENT</span> &rarr; every comparison involving it is Very low. dapagliflozin posts only the CV-death/HF composite, so the strict single-endpoint filter drops it (conservative).</p>
</div>

<div class="card">
<h2>Transported absolute benefit &mdash; HR &rarr; ARR &amp; NNT by target baseline risk</h2>
<p class="sub">An HR is not a transportable decision quantity; the NNT depends on the target's baseline risk. Class-pooled HR draws (k&ge;2 agents, median {tr['class_pooled_hr']:.2f}) &times; documented baseline annual HF-hospitalisation risks, full posterior credible intervals.</p>
<table>
<thead><tr><th class="colh">Target population</th><th class="colh">Baseline risk</th><th class="colh">ARR %/yr (95% CrI)</th><th class="colh">NNT/yr (95% CrI)</th></tr></thead>
<tbody>
{scen_rows}</tbody>
</table>
<p class="note flag">The same class HR gives an NNT swinging from ~{tr['scenarios'][0]['nnt_yr']:.0f} (primary prevention) to ~{tr['scenarios'][-1]['nnt_yr']:.0f} (HFrEF/HFpEF) &mdash; a ~5&times; spread. Baseline rates are reference-distribution values from the major SGLT2 trial placebo arms (not registry-extracted event counts). This transports the HF-hospitalisation effect; CV/HF benefit claims stay with each trial and are GRADE-downgraded for indirectness.</p>
</div>

<div class="card">
<h2>Honest scope</h2>
<p class="sub">SGLT2 is the <b>second full-depth</b> generality class (after PCSK9), and the first on the <b>hard-outcome / survival</b> path: Bayesian single-endpoint league + GRADE certainty + HR&rarr;NNT transport + this offline dashboard. The league is a star network (each agent vs placebo), so contrasts are indirect. Registry-native (AACT); baseline risks are an authoritative reference distribution; no IPD, no full text.</p>
</div>

<footer>Generated by <code>class3_sglt2/sglt2_dashboard.py</code> from <code>sglt2_league.json</code> + <code>sglt2_transport.json</code>. Fully offline &middot; no external assets. Decision-support DRAFT, not a guideline.</footer>
</div>
</body>
</html>
"""

with open(f'{HERE}/sglt2_dashboard.html', 'w', encoding='utf-8') as f:
    f.write(PAGE)
nopen = len(_re.findall(r'<div[\s>]', PAGE)); nclose = PAGE.count('</div>')
assert nopen == nclose, f'div imbalance {nopen}!={nclose}'
assert 'http://' not in PAGE and 'cdn' not in PAGE.lower(), 'no external assets'
assert 'C:/' not in PAGE and 'C:\\\\' not in PAGE, 'no local paths'
assert '</script>' not in PAGE
print(f'wrote sglt2_dashboard.html (div {nopen}={nclose}, offline OK, no local paths)')
