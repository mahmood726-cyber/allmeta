"""GENERALITY depth (dashboard) for the RA class: render the Bayesian proportional-odds ACR ordinal league +
GRADE certainty + predicted-ACR50 -> responders-gained/NNT transport into one self-contained, fully-offline
HTML page (the 4th depth stage of the FIFTH full-depth class, ordinal/ordered-categorical path). Static
server-side build (no CDN, no client JS, no hardcoded local paths). Reads ra_league.json + ra_transport.json."""
import io, sys, json, html, re as _re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

HERE = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma/class6_ra'
lg = json.load(open(f'{HERE}/ra_league.json'))
tr = json.load(open(f'{HERE}/ra_transport.json'))
agents = lg['ranking']; A = len(agents)
cmap = {(c['a'], c['b']): c for c in lg['comparisons']}
CCLASS = {'High': 'high', 'Moderate': 'mod', 'Low': 'low', 'Very low': 'vlow'}
e = html.escape


def cell(a, b):
    if a == b:
        ag = agents[a]
        cl = lg['agent_class'].get(ag, '?')
        return (f'<td class="diag">{lg["predicted_acr50_pct"][ag]:.0f}%<br>'
                f'<span class="k">{e(cl)} &middot; k={lg["kper_rows"][ag]}</span></td>')
    i, j = agents[a], agents[b]
    if a < b:
        c = cmap[(i, j)]
        return f'<td class="cert {CCLASS[c["certainty"]]}" title="P(sup)={c["p_superiority"]:.2f}">{e(c["certainty"])}</td>'
    c = cmap[(j, i)]
    # lower triangle = latent-efficacy log-OR, row minus column (negative: row less effective)
    return f'<td class="eff">{-c["logor"]:+.2f}</td>'


league_rows = ''.join(f'<tr><th class="rowh">{e(agents[a])}</th>' + ''.join(cell(a, b) for b in range(A)) + '</tr>\n'
                      for a in range(A))
league_head = '<th></th>' + ''.join(f'<th class="colh">{e(x)}</th>' for x in agents)
cc = lg['certainty_counts']; cc_txt = ', '.join(f'{k}: {v}' for k, v in cc.items())
avt = lg['adv_vs_tnf']; cut = lg['cutpoints_logit']

scen_rows = ''
for s in tr['placebo_scenarios']:
    star = ' &#9733;' if s['primary'] else ''
    scen_rows += (f'<tr><td class="ag">{e(s["placebo_background"])}{star}</td><td>{s["placebo_pct"]:.0f}%</td>'
                  f'<td><b>{s["responders_gained_per100"]:.0f}</b> ({s["gained_cri"][0]:.0f}, {s["gained_cri"][1]:.0f})</td>'
                  f'<td>{s["nnt"]:.2f} ({s["nnt_cri"][0]:.2f}, {s["nnt_cri"][1]:.2f})</td></tr>\n')

agent_rows = ''
for r in tr['per_agent_nnt_at_reference']:
    agent_rows += (f'<tr><td class="ag">{e(r["agent"])}</td><td>{r["acr50_pct"]:.0f}%</td>'
                   f'<td>{r["gained_per100"]:.0f}</td><td><b>{r["nnt"]:.2f}</b> ({r["nnt_cri"][0]:.2f}, {r["nnt_cri"][1]:.2f})</td></tr>\n')

PAGE = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rheumatoid-arthritis biologics/JAK - Bayesian ordinal ACR league, GRADE certainty &amp; transported NNT</title>
<meta property="og:title" content="RA biologics/JAK Bayesian proportional-odds ACR ladder league, GRADE certainty & transported ACR50 NNT">
<meta property="og:description" content="Registry-native (AACT) RA ACR20/50/70 ordered-response ladder fit by a Bayesian proportional-odds graded-response model, with GRADE certainty and predicted-ACR50-to-NNT transport across placebo backgrounds. Decision-support DRAFT.">
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
<h1>Rheumatoid arthritis (biologics/JAK) &mdash; Bayesian ordinal ACR league, GRADE certainty &amp; transported benefit</h1>
<p class="sub">Registry-native (AACT) generality repoint &middot; <b>fifth full-depth class</b> (ordinal / ordered-categorical path) &middot; <b>decision-support DRAFT</b> &mdash; RoB &amp; values stay with the panel. League fit by a Bayesian <b>proportional-odds graded-response</b> model on the ACR20&gt;ACR50&gt;ACR70 ladder (one latent efficacy per agent + three shared ordered cutpoints; nutpie, R&#770;={lg['rhat']:.3f}); contrasts from posterior draws.</p>

<div class="card">
<h2>ACR-ladder latent-efficacy league &amp; per-comparison certainty</h2>
<p class="sub">Diagonal = posterior median predicted <b>ACR50</b> response% (drug class &middot; k arm&times;threshold rows). Lower triangle = latent-efficacy <b>log-odds</b> difference, row minus column (negative: row less effective). Upper triangle = computable GRADE/CINeMA certainty (indirect-star baseline + imprecision when the contrast CrI crosses the null + k=1 INSUFFICIENT) &mdash; identical domains to <code>nma_league.py</code>; hover a cell for P(superiority). Shared cutpoints (logit): &tau;<sub>20</sub>={cut['tau_20']:.2f}, &tau;<sub>50</sub>={cut['tau_50']:.2f}, &tau;<sub>70</sub>={cut['tau_70']:.2f}.</p>
<table>
<thead><tr>{league_head}</tr></thead>
<tbody>
{league_rows}</tbody>
</table>
<p class="legend"><span><i class="sw" style="background:#0e3a1e"></i>High</span><span><i class="sw" style="background:#3a360e"></i>Moderate</span><span><i class="sw" style="background:#3a1f0e"></i>Low</span><span><i class="sw" style="background:#3a0e12"></i>Very low</span></p>
<p class="note">Across {sum(cc.values())} ordered comparisons: <b>{e(cc_txt)}</b>. Lead <b>{e(lg['lead'])}</b> (predicted ACR50 {lg['predicted_acr50_pct'][lg['lead']]:.0f}%). At the class level the expected advanced-MoA &ge; TNF pattern holds in the draws: IL-6/JAK mean &theta; {avt['adv_median_theta']:+.2f} vs TNF mean &theta; {avt['tnf_median_theta']:+.2f} &rarr; P(IL-6/JAK &gt; TNF) = {avt['p_adv_gt_tnf']:.3f}. <span class="flag">Heterogeneity flag:</span> the cross-agent ranking is confounded by arm-level heterogeneity (ACR pooled per agent across timepoints/doses/background-MTX) &mdash; the proportional-odds residual RMSE (logit) = {lg['proportional_odds_rmse_logit']:.2f} is large and the within-class spread exceeds the between-class (a TNF agent leads while the class-mean still favours advanced-MoA), so this is <b>not</b> a clean &ldquo;best agent&rdquo;, the same self-flagging behaviour as the asthma class (I&sup2;=96%).</p>
</div>

<div class="card">
<h2>Transported absolute benefit &mdash; predicted ACR50 &rarr; responders gained per 100 &amp; NNT vs placebo</h2>
<p class="sub">A latent ordinal efficacy is not a decision quantity; the absolute ACR50 benefit and NNT depend on the target's placebo (background) ACR50 rate. Lead <b>{e(tr['lead'])}</b> predicted-ACR50 draws ({tr['lead_acr50_pct']:.0f}%) &times; documented placebo backgrounds, full posterior credible intervals.</p>
<table>
<thead><tr><th class="colh">Placebo background</th><th class="colh">Placebo ACR50</th><th class="colh">Responders gained/100 (95% CrI)</th><th class="colh">NNT (95% CrI)</th></tr></thead>
<tbody>
{scen_rows}</tbody>
</table>
<p class="note flag">Unlike psoriasis, RA placebo ACR50 is non-trivial and background-MTX-dependent (~5&ndash;15%), so the baseline <b>moves the NNT</b> &mdash; the ordinal echo of the SGLT2/asthma baseline-risk story. Placebo rates are reference-distribution values; this is ACR50 response benefit only, not a structural-damage/safety claim.</p>
<h2 style="margin-top:18px">Per-agent ACR50 NNT at the reference placebo ({tr['reference_placebo_pct']:.0f}%)</h2>
<table>
<thead><tr><th class="colh">Agent</th><th class="colh">ACR50%</th><th class="colh">Gained/100</th><th class="colh">NNT (95% CrI)</th></tr></thead>
<tbody>
{agent_rows}</tbody>
</table>
</div>

<div class="card">
<h2>Honest scope</h2>
<p class="sub">RA is the <b>fifth full-depth</b> generality class and the <b>fifth outcome type</b> &mdash; <b>ordinal / ordered-categorical</b> (ACR20&gt;50&gt;70) &mdash; after PCSK9 (continuous biomarker), SGLT2 (survival/HR), asthma (count/rate), and psoriasis (binary responder). The proportional-odds graded-response model (one latent &theta; per agent + shared ordered cutpoints) is the honest ordinal form for aggregate threshold %s; its single-&theta; assumption is recorded by the residual RMSE above. Star network (each agent vs placebo &rarr; indirect contrasts). Registry-native (AACT); placebo rates are an authoritative reference distribution; no IPD, no full text.</p>
</div>

<footer>Generated by <code>class6_ra/ra_dashboard.py</code> from <code>ra_league.json</code> + <code>ra_transport.json</code>. Fully offline &middot; no external assets. Decision-support DRAFT, not a guideline.</footer>
</div>
</body>
</html>
"""

with open(f'{HERE}/ra_dashboard.html', 'w', encoding='utf-8') as f:
    f.write(PAGE)
nopen = len(_re.findall(r'<div[\s>]', PAGE)); nclose = PAGE.count('</div>')
assert nopen == nclose, f'div imbalance {nopen}!={nclose}'
assert 'http://' not in PAGE and 'cdn' not in PAGE.lower(), 'no external assets'
assert 'C:/' not in PAGE and 'C:\\\\' not in PAGE, 'no local paths'
assert '</script>' not in PAGE
print(f'wrote ra_dashboard.html (div {nopen}={nclose}, offline OK, no local paths)')
