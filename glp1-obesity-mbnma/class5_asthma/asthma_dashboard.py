"""GENERALITY depth (dashboard) for the ASTHMA class: render the Bayesian exacerbation-IRR league + GRADE
certainty + IRR->exacerbations-averted transport into one self-contained, fully-offline HTML page (the 4th
depth stage of the THIRD full-depth class). Static server-side build (no CDN, no client JS, no hardcoded
local paths). Reads asthma_league.json + asthma_transport.json."""
import io, sys, json, html, re as _re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

HERE = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma/class5_asthma'
lg = json.load(open(f'{HERE}/asthma_league.json'))
tr = json.load(open(f'{HERE}/asthma_transport.json'))
agents = lg['ranking']; A = len(agents)
cmap = {(c['a'], c['b']): c for c in lg['comparisons']}
CCLASS = {'High': 'high', 'Moderate': 'mod', 'Low': 'low', 'Very low': 'vlow'}
e = html.escape


def cell(a, b):
    if a == b:
        ag = agents[a]
        return f'<td class="diag">{lg["median_irr"][ag]:.2f}<br><span class="k">k={lg["kper"][ag]}</span></td>'
    i, j = agents[a], agents[b]
    if a < b:
        c = cmap[(i, j)]
        return f'<td class="cert {CCLASS[c["certainty"]]}" title="P(sup)={c["p_superiority"]:.2f}">{e(c["certainty"])}</td>'
    c = cmap[(j, i)]
    return f'<td class="eff">{c["rr_ratio"]:.2f}</td>'


league_rows = ''.join(f'<tr><th class="rowh">{e(agents[a])}</th>' + ''.join(cell(a, b) for b in range(A)) + '</tr>\n'
                      for a in range(A))
league_head = '<th></th>' + ''.join(f'<th class="colh">{e(x)}</th>' for x in agents)
cc = lg['certainty_counts']; cc_txt = ', '.join(f'{k}: {v}' for k, v in cc.items())

scen_rows = ''
for s in tr['scenarios']:
    star = ' &#9733;' if s['primary'] else ''
    scen_rows += (f'<tr><td class="ag">{e(s["population"])}{star}</td><td>{s["baseline_annual_rate"]:.1f}/yr</td>'
                  f'<td><b>{s["averted_per_yr"]:.2f}</b> ({s["averted_cri"][0]:.2f}, {s["averted_cri"][1]:.2f})</td></tr>\n')

PAGE = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Asthma biologics - Bayesian exacerbation-rate league, GRADE certainty &amp; transported exacerbations averted</title>
<meta property="og:title" content="Asthma biologics Bayesian exacerbation-IRR league, GRADE certainty & transported absolute benefit">
<meta property="og:description" content="Registry-native (AACT) asthma-biologic annualised-exacerbation rate-ratio league from a Bayesian draw matrix, with GRADE certainty and IRR-to-absolute-averted transport across severity targets. Decision-support DRAFT.">
<meta property="og:type" content="website">
<style>
:root{{--bg:#0f1419;--card:#1a2029;--ink:#e6edf3;--mut:#9aa7b4;--line:#2a323d;--acc:#4da3ff}}
*{{box-sizing:border-box}} body{{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,Segoe UI,Roboto,sans-serif}}
.wrap{{max-width:1000px;margin:0 auto;padding:28px 18px 60px}}
h1{{font-size:21px;margin:0 0 4px}} h2{{font-size:17px;margin:0 0 10px;color:var(--acc)}}
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
<h1>Asthma biologics &mdash; Bayesian exacerbation-rate league, GRADE certainty &amp; transported benefit</h1>
<p class="sub">Registry-native (AACT) generality repoint &middot; <b>third full-depth class</b> (count/rate path) &middot; <b>decision-support DRAFT</b> &mdash; RoB &amp; values stay with the panel. League fit by hierarchical Bayesian RE on log-rate-ratio (nutpie, R&#770;={lg['rhat']:.3f}); contrasts from posterior draws.</p>

<div class="card">
<h2>Annualised-exacerbation IRR league &amp; per-comparison certainty</h2>
<p class="sub">Lower triangle = rate-ratio (row vs column). Upper triangle = computable GRADE/CINeMA certainty (indirect-star baseline + imprecision when the contrast CrI crosses the null + k=1 INSUFFICIENT) &mdash; identical domains to <code>nma_league.py</code>; hover a cell for P(superiority). Diagonal = posterior median IRR (k trials).</p>
<table>
<thead><tr>{league_head}</tr></thead>
<tbody>
{league_rows}</tbody>
</table>
<p class="legend"><span><i class="sw" style="background:#3a360e"></i>Moderate</span><span><i class="sw" style="background:#3a1f0e"></i>Low</span><span><i class="sw" style="background:#3a0e12"></i>Very low</span></p>
<p class="note">Across {sum(cc.values())} ordered comparisons: <b>{e(cc_txt)}</b>. Lead <b>{e(lg['lead'])}</b> (IRR {lg['median_irr'][lg['lead']]:.2f}); all agents reduce the exacerbation rate (class IRR {tr['class_pooled_irr']:.2f}). <span class="flag">The cross-agent ranking is confounded by baseline-rate / eosinophil effect modification</span> &mdash; not a clean &ldquo;best biologic&rdquo;; the transport below makes the baseline-rate dependence explicit.</p>
</div>

<div class="card">
<h2>Transported absolute benefit &mdash; IRR &rarr; exacerbations averted per patient-year</h2>
<p class="sub">A rate ratio is not a transportable decision quantity; the absolute benefit depends on the target's baseline exacerbation rate. Class IRR draws (median {tr['class_pooled_irr']:.2f}) &times; documented baseline annual rates by severity, full posterior credible intervals.</p>
<table>
<thead><tr><th class="colh">Target population</th><th class="colh">Baseline rate</th><th class="colh">Exacerbations averted/yr (95% CrI)</th></tr></thead>
<tbody>
{scen_rows}</tbody>
</table>
<p class="note flag">The same class IRR averts ~{tr['scenarios'][0]['averted_per_yr']:.2f}/yr (moderate) vs ~{tr['scenarios'][-1]['averted_per_yr']:.2f}/yr (frequent-exacerbator) &mdash; a ~4&times; spread. For asthma the baseline rate IS the effect-modifier the league caveat flagged (severity / eosinophil enrichment), so transport makes the confounder explicit. Baseline rates are reference-distribution values; this is exacerbation-rate benefit, not a mortality/hospitalisation claim.</p>
</div>

<div class="card">
<h2>Honest scope</h2>
<p class="sub">Asthma is the <b>third full-depth</b> generality class (after PCSK9 continuous-biomarker and SGLT2 survival/HR), on the <b>count/rate</b> path: Bayesian IRR league + GRADE certainty + IRR&rarr;averted transport + this offline dashboard. Star network (each agent vs placebo &rarr; indirect contrasts). Registry-native (AACT); baseline rates are an authoritative reference distribution; no IPD, no full text.</p>
</div>

<footer>Generated by <code>class5_asthma/asthma_dashboard.py</code> from <code>asthma_league.json</code> + <code>asthma_transport.json</code>. Fully offline &middot; no external assets. Decision-support DRAFT, not a guideline.</footer>
</div>
</body>
</html>
"""

with open(f'{HERE}/asthma_dashboard.html', 'w', encoding='utf-8') as f:
    f.write(PAGE)
nopen = len(_re.findall(r'<div[\s>]', PAGE)); nclose = PAGE.count('</div>')
assert nopen == nclose, f'div imbalance {nopen}!={nclose}'
assert 'http://' not in PAGE and 'cdn' not in PAGE.lower(), 'no external assets'
assert 'C:/' not in PAGE and 'C:\\\\' not in PAGE, 'no local paths'
assert '</script>' not in PAGE
print(f'wrote asthma_dashboard.html (div {nopen}={nclose}, offline OK, no local paths)')
