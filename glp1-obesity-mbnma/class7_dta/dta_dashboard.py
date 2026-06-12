"""GENERALITY class 7 depth (dashboard): render the Bayesian bivariate DTA league (per-modality Se/Sp/Youden-J/
diagnostic-OR + GRADE certainty matrix) + the Se/Sp -> PPV/NPV transport into one self-contained, fully-offline
HTML page. Static server-side build (no CDN, no client JS, no hardcoded local paths). Reads dta_league.json +
dta_transport.json + dta_results.json."""
import io, sys, json, html, re as _re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

HERE = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma/class7_dta'
lg = json.load(open(f'{HERE}/dta_league.json', encoding='utf-8'))
tr = json.load(open(f'{HERE}/dta_transport.json', encoding='utf-8'))
rs = json.load(open(f'{HERE}/dta_results.json', encoding='utf-8'))
mods = lg['ranking']; M = len(mods)
cmap = {(c['a'], c['b']): c for c in lg['comparisons']}
CCLASS = {'High': 'high', 'Moderate': 'mod', 'Low': 'low', 'Very low': 'vlow'}
e = html.escape


def cell(a, b):
    if a == b:
        m = mods[a]
        return f'<td class="diag">J={lg["median_youden_j"][m]:.2f}<br><span class="k">k={lg["kper"][m]}</span></td>'
    i, j = mods[a], mods[b]
    if a < b:
        c = cmap[(i, j)]
        return f'<td class="cert {CCLASS[c["certainty"]]}" title="P(sup)={c["p_superiority"]:.2f}">{e(c["certainty"])}</td>'
    c = cmap[(j, i)]
    return f'<td class="eff">{c["j_diff"]:+.2f}</td>'


league_rows = ''.join(f'<tr><th class="rowh">{e(mods[a])}</th>' + ''.join(cell(a, b) for b in range(M)) + '</tr>\n'
                      for a in range(M))
league_head = '<th></th>' + ''.join(f'<th class="colh">{e(x)}</th>' for x in mods)
cc = lg['certainty_counts']; cc_txt = ', '.join(f'{k}: {v}' for k, v in cc.items())

acc_rows = ''
for m in mods:
    p = rs['pooled'][m]
    acc_rows += (f'<tr><td class="ag">{e(m)}</td><td>k={rs["kper"][m]}</td>'
                 f'<td>{p["sens"]:.2f} ({p["sens_cri"][0]:.2f}, {p["sens_cri"][1]:.2f})</td>'
                 f'<td>{p["spec"]:.2f} ({p["spec_cri"][0]:.2f}, {p["spec_cri"][1]:.2f})</td>'
                 f'<td><b>{p["youden_j"]:.2f}</b></td><td>{p["dor"]:.1f}</td></tr>\n')

scen_rows = ''
for s in tr['scenarios']:
    star = ' &#9733;' if s['primary'] else ''
    scen_rows += (f'<tr><td class="ag">{e(s["setting"])}{star}</td><td>{s["prevalence"]*100:.1f}%</td>'
                  f'<td><b>{s["ppv"]:.2f}</b> ({s["ppv_cri"][0]:.2f}&ndash;{s["ppv_cri"][1]:.2f})</td>'
                  f'<td>{s["npv"]:.2f} ({s["npv_cri"][0]:.2f}&ndash;{s["npv_cri"][1]:.2f})</td></tr>\n')

ppvs = [s['ppv'] for s in tr['scenarios']]
het = 'yes' if lg['heterogeneity_flag'] else 'no'
targets_txt = ', '.join(t for t in rs['targets'] if t != 'other')

PAGE = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Oncologic imaging modalities - Bayesian bivariate DTA league, GRADE certainty &amp; transported PPV/NPV</title>
<meta property="og:title" content="Comparative DTA: PET/MRI/CT/ultrasound Bayesian bivariate league + PPV/NPV transport">
<meta property="og:description" content="Registry-native (AACT) comparative diagnostic-test-accuracy league of oncologic imaging modalities from a Bayesian bivariate (Reitsma) model, with per-comparison GRADE certainty and Se/Sp-to-PPV/NPV transport across prevalence targets. Decision-support DRAFT.">
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
<h1>Oncologic imaging modalities &mdash; Bayesian bivariate DTA league, GRADE certainty &amp; transported PPV/NPV</h1>
<p class="sub">Registry-native (AACT) generality repoint &middot; <b>sixth outcome type = diagnostic test accuracy</b> (paired Se/Sp, bivariate) &middot; <b>decision-support DRAFT</b> &mdash; RoB &amp; values stay with the panel. League fit by a hierarchical Bayesian bivariate (Reitsma) model on (logit-Se, logit-Sp) with a 2&times;2 between-study covariance (nutpie, R&#770;={lg['rhat']:.3f}, between-study corr {lg['between_study_corr']:+.2f}); contrasts from posterior draws.</p>

<div class="card">
<h2>Pooled accuracy by index test (bivariate posterior)</h2>
<table>
<thead><tr><th class="colh">Index test</th><th class="colh">studies</th><th class="colh">Sensitivity (95% CrI)</th><th class="colh">Specificity (95% CrI)</th><th class="colh">Youden J</th><th class="colh">DOR</th></tr></thead>
<tbody>
{acc_rows}</tbody>
</table>
<p class="note">Pooled Se/Sp are posterior medians from the bivariate model; Youden J = Se+Sp&minus;1; DOR = diagnostic odds ratio. Lead by Youden J: <b>{e(lg['lead'])}</b>.</p>
</div>

<div class="card">
<h2>Comparative league &amp; per-comparison certainty</h2>
<p class="sub">Lower triangle = Youden-J difference (row minus column). Upper triangle = computable GRADE/CINeMA certainty (indirect baseline + imprecision when the J-difference CrI crosses 0 + k=1 INSUFFICIENT + threshold-effect downgrade) &mdash; hover a cell for P(superiority). Diagonal = posterior median Youden J (k studies).</p>
<table>
<thead><tr>{league_head}</tr></thead>
<tbody>
{league_rows}</tbody>
</table>
<p class="legend"><span><i class="sw" style="background:#3a1f0e"></i>Low</span><span><i class="sw" style="background:#3a0e12"></i>Very low</span></p>
<p class="note flag">Across {sum(cc.values())} comparisons: <b>{e(cc_txt)}</b>. <b>This is NOT a clean winner.</b> Every cross-modality J-difference CrI crosses 0, and the network mixes cancer sites ({e(targets_txt)}) &rarr; cross-target effect modification (heterogeneity flag: {het}). The nominal lead ({e(lg['lead'])}) is the DTA echo of the asthma I&sup2;=96% / RA proportional-odds flags &mdash; the engine reports the hesitation, it does not crown a winner.</p>
</div>

<div class="card">
<h2>Transported predictive values &mdash; Se/Sp &rarr; PPV &amp; NPV by target prevalence</h2>
<p class="sub">A Se/Sp pair is not a transportable decision quantity; PPV/NPV depend on the target's disease prevalence. Lead-modality ({e(tr['lead'])}) bivariate Se/Sp draws &times; documented prevalence settings, full posterior credible intervals.</p>
<table>
<thead><tr><th class="colh">Clinical setting</th><th class="colh">Prevalence</th><th class="colh">PPV (95% CrI)</th><th class="colh">NPV (95% CrI)</th></tr></thead>
<tbody>
{scen_rows}</tbody>
</table>
<p class="note flag">The same Se/Sp gives a PPV swinging from ~{min(ppvs):.2f} (population screening) to ~{max(ppvs):.2f} (symptomatic/staging) &mdash; so a Se/Sp pair alone is not a transportable decision quantity, the DTA analogue of the SGLT2 baseline-risk dependence. Prevalences are reference-distribution values, not registry-extracted.</p>
</div>

<div class="card">
<h2>Honest scope</h2>
<p class="sub">DTA is the <b>sixth outcome type</b> (paired Se/Sp with a between-study correlation &mdash; the bivariate structure), with a full-depth Bayesian bivariate league + GRADE certainty + PPV/NPV transport + this offline dashboard. 2&times;2 cells are <b>registry-reconstructed</b> (round(Se% &times; n1), round(Sp% &times; n0) from AACT-posted percentages + subgroup denominators), NOT full-text 2&times;2 tables. The comparative network mixes cancer target sites, so the cross-modality ranking is indirect and GRADE-downgraded. Registry-native (AACT); prevalences are an authoritative reference distribution; no IPD, no full text.</p>
</div>

<footer>Generated by <code>class7_dta/dta_dashboard.py</code> from <code>dta_league.json</code> + <code>dta_transport.json</code> + <code>dta_results.json</code>. Fully offline &middot; no external assets. Decision-support DRAFT, not a guideline.</footer>
</div>
</body>
</html>
"""

with open(f'{HERE}/dta_dashboard.html', 'w', encoding='utf-8') as f:
    f.write(PAGE)
nopen = len(_re.findall(r'<div[\s>]', PAGE)); nclose = PAGE.count('</div>')
assert nopen == nclose, f'div imbalance {nopen}!={nclose}'
assert 'http://' not in PAGE and 'cdn' not in PAGE.lower(), 'no external assets'
assert 'C:/' not in PAGE and 'C:\\\\' not in PAGE, 'no local paths'
assert '</script>' not in PAGE
print(f'wrote dta_dashboard.html (div {nopen}={nclose}, offline OK, no local paths)')
