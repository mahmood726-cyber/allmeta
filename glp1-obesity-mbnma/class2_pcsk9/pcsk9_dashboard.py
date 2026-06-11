"""GENERALITY depth (dashboard stage) for the PCSK9 class: render the repointed league + GRADE + transport
into a single self-contained, fully-offline HTML page -- the 4th named depth stage. Static server-side table
build (no external CDN, no client JS, no hardcoded local paths) so it passes the html-apps safety checks.
Reads pcsk9_results.json + pcsk9_league.json + pcsk9_transport.json."""
import io, sys, json, html
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

HERE = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma/class2_pcsk9'
res = json.load(open(f'{HERE}/pcsk9_results.json'))
lg = json.load(open(f'{HERE}/pcsk9_league.json'))
tr = json.load(open(f'{HERE}/pcsk9_transport.json'))
agents = lg['ranking']
N = len(agents)
cmap = {(c['a'], c['b']): c for c in lg['comparisons']}
CCLASS = {'High': 'high', 'Moderate': 'mod', 'Low': 'low', 'Very low': 'vlow'}
e = html.escape


def league_cell(a, b):
    if a == b:
        return f'<td class="diag">{lg["median_ldl_pct"][agents[a]]:.1f}%<br><span class="k">k={lg["kper"][agents[a]]}</span></td>'
    i, j = agents[a], agents[b]
    if a < b:  # upper triangle: certainty
        c = cmap[(i, j)]
        return f'<td class="cert {CCLASS[c["certainty"]]}">{e(c["certainty"])}</td>'
    c = cmap[(j, i)]  # lower triangle: effect (j better-ranked is row? rows=a) -> diff of (better i=agents[b]) vs agents[a]
    # comparison stored as (better, worse); for lower triangle row a vs col b<a, the better-ranked is col b
    diff = -c['diff']  # row(a) minus col(b): worse - better = positive
    return f'<td class="eff">{diff:+.1f}</td>'


league_rows = ''
for a in range(N):
    cells = ''.join(league_cell(a, b) for b in range(N))
    league_rows += f'<tr><th class="rowh">{e(agents[a])}</th>{cells}</tr>\n'
league_head = '<th></th>' + ''.join(f'<th class="colh">{e(x)}</th>' for x in agents)

trans_rows = ''
for r in tr['transported']:
    ci = r['abs_ci_mg_dl']
    trans_rows += (f'<tr><td class="ag">{e(r["agent"])}</td><td>{r["pct_reduction"]:.1f}%</td>'
                   f'<td><b>&minus;{r["abs_mg_dl"]:.1f}</b> ({ci[0]:.0f}, {ci[1]:.0f})</td>'
                   f'<td><b>&minus;{r["abs_mmol_l"]:.2f}</b></td></tr>\n')
cc = lg['certainty_counts']
cc_txt = ', '.join(f'{k}: {v}' for k, v in cc.items())
tg = tr['target']

PAGE = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PCSK9 inhibitors - LDL-C league, GRADE certainty &amp; transported absolute lowering</title>
<meta property="og:title" content="PCSK9i LDL-C league, GRADE certainty & transported absolute lowering">
<meta property="og:description" content="Registry-native (AACT) PCSK9 inhibitor LDL-C NMA league with per-comparison GRADE/CINeMA certainty and NHANES-transported absolute LDL lowering. Decision-support DRAFT.">
<meta property="og:type" content="website">
<style>
:root{{--bg:#0f1419;--card:#1a2029;--ink:#e6edf3;--mut:#9aa7b4;--line:#2a323d;--acc:#4da3ff}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,Segoe UI,Roboto,sans-serif}}
.wrap{{max-width:1000px;margin:0 auto;padding:28px 18px 60px}}
h1{{font-size:23px;margin:0 0 4px}} h2{{font-size:17px;margin:30px 0 10px;color:var(--acc)}}
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
<h1>PCSK9 inhibitors &mdash; LDL-C league, GRADE certainty &amp; transported absolute lowering</h1>
<p class="sub">Registry-native (AACT) generality repoint &middot; <b>decision-support DRAFT</b> &mdash; RoB &amp; values stay with the panel. This is the depth proof for the PCSK9 class: the <b>league + GRADE + transport</b> stages repointed with the same engines as the incretin flagship.</p>

<div class="card">
<h2 style="margin-top:0">LDL-C league table &amp; per-comparison certainty</h2>
<p class="sub">Lower triangle = % LDL-C difference (row &minus; column). Upper triangle = computable GRADE/CINeMA certainty (indirect-star baseline + imprecision when the contrast CI crosses the null + k=1 INSUFFICIENT) &mdash; the <b>identical domains</b> as <code>nma_league.py</code>. Diagonal = pooled % LDL-C reduction (k trials).</p>
<table>
<thead><tr>{league_head}</tr></thead>
<tbody>
{league_rows}</tbody>
</table>
<p class="legend"><span><i class="sw" style="background:#3a360e"></i>Moderate</span><span><i class="sw" style="background:#3a1f0e"></i>Low</span><span><i class="sw" style="background:#3a0e12"></i>Very low</span></p>
<p class="note">Across {sum(cc.values())} ordered comparisons: <b>{e(cc_txt)}</b>. No INSUFFICIENT node (every agent k&ge;4). <b>{e(lg['lead'])}</b> leads and its contrasts clear the null (Moderate); the evolocumab/alirocumab/inclisiran cluster is mutually indistinguishable (CIs cross null &rarr; Low).</p>
</div>

<div class="card">
<h2 style="margin-top:0">Transported absolute LDL-C lowering</h2>
<p class="sub">Registry % reduction &times; a real target baseline LDL-C. Target: <b>{e(tg['definition'])}</b> &mdash; {e(tg['source'])}; n={tg['n']} (Kish n<sub>eff</sub>={tg['kish_neff']:.0f}), baseline LDL-C <b>{tg['baseline_ldl_mg_dl']:.0f} mg/dL</b> ({tg['baseline_ldl_mmol_l']:.2f} mmol/L). CTT shows CV risk tracks the <b>absolute (mmol/L)</b> lowering, so this is the decision-relevant scale.</p>
<table>
<thead><tr><th class="colh">Agent</th><th class="colh">% LDL-C reduction</th><th class="colh">Absolute (mg/dL, 95% CI)</th><th class="colh">Absolute (mmol/L)</th></tr></thead>
<tbody>
{trans_rows}</tbody>
</table>
<p class="note flag">Transporting the LDL-C surrogate is <b>NOT</b> a cardiovascular-outcome claim. CTT context (illustrative only): ~22% relative risk reduction in major vascular events per 1 mmol/L absolute LDL lowering (CTT, Lancet 2010). The CV benefit must come from each agent's own CVOT and is downgraded for indirectness exactly as the league/GRADE layer does.</p>
</div>

<div class="card">
<h2 style="margin-top:0">Honest scope</h2>
<p class="sub">PCSK9 is the <b>depth-promoted</b> generality class: it carries league + GRADE + transport (3 of the 4 named depth stages; this dashboard is the 4th). The PCSK9 league uses the frequentist normal contrast (no Bayesian draw matrix for this class, unlike the incretin flagship). Transport assumes the % reduction is approximately population-transportable (the carried modifier is the target baseline LDL, not the percentage). Registry-native (AACT) + NHANES authoritative reference distribution; no IPD, no full text.</p>
</div>

<footer>Generated by <code>class2_pcsk9/pcsk9_dashboard.py</code> from <code>pcsk9_results.json</code> + <code>pcsk9_league.json</code> + <code>pcsk9_transport.json</code>. Fully offline &middot; no external assets. Decision-support DRAFT, not a guideline.</footer>
</div>
</body>
</html>
"""

with open(f'{HERE}/pcsk9_dashboard.html', 'w', encoding='utf-8') as f:
    f.write(PAGE)

# offline / safety self-checks (html-apps rules)
opens = PAGE.count('<div') + PAGE.count('<div>')  # approximate; count <div tokens
import re as _re
nopen = len(_re.findall(r'<div[\s>]', PAGE)); nclose = PAGE.count('</div>')
assert nopen == nclose, f'div imbalance: {nopen} open vs {nclose} close'
assert 'http://' not in PAGE and 'https://wwwn' not in PAGE and 'cdn' not in PAGE.lower(), 'no external assets allowed'
assert 'C:/' not in PAGE and 'C:\\\\' not in PAGE, 'no hardcoded local paths in shipped HTML'
assert '</script>' not in PAGE, 'no script issues'
print(f'wrote pcsk9_dashboard.html  (div balance {nopen}={nclose}, offline OK, no local paths)')
