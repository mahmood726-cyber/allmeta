"""GENERALITY depth (dashboard) for the PSORIASIS class: render the Bayesian PASI-90 responder league + GRADE
certainty + response->responders-gained/NNT transport into one self-contained, fully-offline HTML page (the 4th
depth stage of the FOURTH full-depth class, binary/responder path). Static server-side build (no CDN, no client
JS, no hardcoded local paths). Reads psoriasis_league.json + psoriasis_transport.json."""
import io, sys, json, html, re as _re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

HERE = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma/class4_psoriasis'
lg = json.load(open(f'{HERE}/psoriasis_league.json'))
tr = json.load(open(f'{HERE}/psoriasis_transport.json'))
agents = lg['ranking']; A = len(agents)
cmap = {(c['a'], c['b']): c for c in lg['comparisons']}
CCLASS = {'High': 'high', 'Moderate': 'mod', 'Low': 'low', 'Very low': 'vlow'}
e = html.escape


def cell(a, b):
    if a == b:
        ag = agents[a]
        cl = lg['agent_class'].get(ag, '?')
        return (f'<td class="diag">{lg["median_response_pct"][ag]:.0f}%<br>'
                f'<span class="k">{e(cl)} &middot; k={lg["kper_arms"][ag]}</span></td>')
    i, j = agents[a], agents[b]
    if a < b:
        c = cmap[(i, j)]
        return f'<td class="cert {CCLASS[c["certainty"]]}" title="P(sup)={c["p_superiority"]:.2f}">{e(c["certainty"])}</td>'
    c = cmap[(j, i)]
    # lower triangle = response-point difference, row minus column (negative: row lower than column)
    return f'<td class="eff">{-c["rd_pp"]:+.0f}</td>'


league_rows = ''.join(f'<tr><th class="rowh">{e(agents[a])}</th>' + ''.join(cell(a, b) for b in range(A)) + '</tr>\n'
                      for a in range(A))
league_head = '<th></th>' + ''.join(f'<th class="colh">{e(x)}</th>' for x in agents)
cc = lg['certainty_counts']; cc_txt = ', '.join(f'{k}: {v}' for k, v in cc.items())
ivt = lg['il17_23_vs_tnf']

scen_rows = ''
for s in tr['placebo_scenarios']:
    star = ' &#9733;' if s['primary'] else ''
    scen_rows += (f'<tr><td class="ag">{e(s["placebo_background"])}{star}</td><td>{s["placebo_pct"]:.0f}%</td>'
                  f'<td><b>{s["responders_gained_per100"]:.0f}</b> ({s["gained_cri"][0]:.0f}, {s["gained_cri"][1]:.0f})</td>'
                  f'<td>{s["nnt"]:.2f} ({s["nnt_cri"][0]:.2f}, {s["nnt_cri"][1]:.2f})</td></tr>\n')

agent_rows = ''
for r in tr['per_agent_nnt_at_reference']:
    agent_rows += (f'<tr><td class="ag">{e(r["agent"])}</td><td>{r["response_pct"]:.0f}%</td>'
                   f'<td>{r["gained_per100"]:.0f}</td><td><b>{r["nnt"]:.2f}</b> ({r["nnt_cri"][0]:.2f}, {r["nnt_cri"][1]:.2f})</td></tr>\n')

PAGE = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Psoriasis biologics - Bayesian PASI-90 responder league, GRADE certainty &amp; transported NNT</title>
<meta property="og:title" content="Psoriasis biologics Bayesian PASI-90 responder league, GRADE certainty & transported absolute benefit">
<meta property="og:description" content="Registry-native (AACT) psoriasis-biologic PASI-90 responder league from a Bayesian draw matrix, with GRADE certainty and response-to-responders-gained/NNT transport across placebo backgrounds. Decision-support DRAFT.">
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
<h1>Psoriasis biologics &mdash; Bayesian PASI-90 responder league, GRADE certainty &amp; transported benefit</h1>
<p class="sub">Registry-native (AACT) generality repoint &middot; <b>fourth full-depth class</b> (binary/responder path) &middot; <b>decision-support DRAFT</b> &mdash; RoB &amp; values stay with the panel. League fit by hierarchical Bayesian RE on the logit of the per-arm PASI-90 response (nutpie, R&#770;={lg['rhat']:.3f}); contrasts from posterior draws.</p>

<div class="card">
<h2>PASI-90 responder league &amp; per-comparison certainty</h2>
<p class="sub">Diagonal = posterior median PASI-90 response% (drug class &middot; k arms). Lower triangle = response-point difference, row minus column (negative: row responds less). Upper triangle = computable GRADE/CINeMA certainty (indirect-star baseline + imprecision when the contrast CrI crosses the null + k=1 INSUFFICIENT) &mdash; identical domains to <code>nma_league.py</code>; hover a cell for P(superiority).</p>
<table>
<thead><tr>{league_head}</tr></thead>
<tbody>
{league_rows}</tbody>
</table>
<p class="legend"><span><i class="sw" style="background:#0e3a1e"></i>High</span><span><i class="sw" style="background:#3a360e"></i>Moderate</span><span><i class="sw" style="background:#3a1f0e"></i>Low</span><span><i class="sw" style="background:#3a0e12"></i>Very low</span></p>
<p class="note">Across {sum(cc.values())} ordered comparisons: <b>{e(cc_txt)}</b>. Lead <b>{e(lg['lead'])}</b> ({lg['median_response_pct'][lg['lead']]:.0f}% PASI-90). The established <b>IL-17/IL-23 &gt; TNF</b> hierarchy is reproduced with posterior probability: IL-17/23 mean {ivt['il_median_pct']:.0f}% vs TNF mean {ivt['tnf_median_pct']:.0f}% &rarr; P(IL-17/23 &gt; TNF) = {ivt['p_il_gt_tnf']:.3f}.</p>
</div>

<div class="card">
<h2>Transported absolute benefit &mdash; response &rarr; responders gained per 100 &amp; NNT vs placebo</h2>
<p class="sub">A response rate alone is not a decision quantity; the absolute benefit and NNT depend on the target's placebo (background) PASI-90 rate. Lead <b>{e(tr['lead'])}</b> response draws ({tr['lead_response_pct']:.0f}%) &times; documented placebo backgrounds, full posterior credible intervals.</p>
<table>
<thead><tr><th class="colh">Placebo background</th><th class="colh">Placebo PASI-90</th><th class="colh">Responders gained/100 (95% CrI)</th><th class="colh">NNT (95% CrI)</th></tr></thead>
<tbody>
{scen_rows}</tbody>
</table>
<p class="note flag">Honest contrast with SGLT2/asthma: PASI-90 placebo response is low and stable (~2&ndash;7%), so the NNT is dominated by the (very high) active response, not the baseline &mdash; the top biologics gain tens of responders/100 at an NNT near 1&ndash;2. Placebo rates are reference-distribution values; this is PASI-90 response benefit only, not a comorbidity/safety claim.</p>
<h2 style="margin-top:18px">Per-agent NNT at the reference placebo ({tr['reference_placebo_pct']:.0f}%)</h2>
<table>
<thead><tr><th class="colh">Agent</th><th class="colh">Response%</th><th class="colh">Gained/100</th><th class="colh">NNT (95% CrI)</th></tr></thead>
<tbody>
{agent_rows}</tbody>
</table>
</div>

<div class="card">
<h2>Honest scope</h2>
<p class="sub">Psoriasis is the <b>fourth full-depth</b> generality class (after PCSK9 continuous-biomarker, SGLT2 survival/HR, and asthma count/rate), on the <b>binary/responder</b> path: Bayesian PASI-90 league + GRADE certainty + response&rarr;NNT transport + this offline dashboard. Logit hierarchical-means model (AACT posts the response %, not per-arm responder counts here; per-agent SD absorbs arm-size + between-arm spread). Star network (each agent vs placebo &rarr; indirect contrasts). Registry-native (AACT); placebo rates are an authoritative reference distribution; no IPD, no full text.</p>
</div>

<footer>Generated by <code>class4_psoriasis/psoriasis_dashboard.py</code> from <code>psoriasis_league.json</code> + <code>psoriasis_transport.json</code>. Fully offline &middot; no external assets. Decision-support DRAFT, not a guideline.</footer>
</div>
</body>
</html>
"""

with open(f'{HERE}/psoriasis_dashboard.html', 'w', encoding='utf-8') as f:
    f.write(PAGE)
nopen = len(_re.findall(r'<div[\s>]', PAGE)); nclose = PAGE.count('</div>')
assert nopen == nclose, f'div imbalance {nopen}!={nclose}'
assert 'http://' not in PAGE and 'cdn' not in PAGE.lower(), 'no external assets'
assert 'C:/' not in PAGE and 'C:\\\\' not in PAGE, 'no local paths'
assert '</script>' not in PAGE
print(f'wrote psoriasis_dashboard.html (div {nopen}={nclose}, offline OK, no local paths)')
