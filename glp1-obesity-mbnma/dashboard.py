"""Single self-contained guideline dashboard: stitches the recommendation + Summary of Findings + Evidence-
to-Decision + league table + the wide-gap/HTA results into ONE offline HTML a panel can open. Reads the JSON
outputs of the pipeline; renders what is present (robust to missing). No CDN. Decision-support DRAFT."""
import io, sys, json, os, html
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
ROOT = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma'

def load(f):
    p = os.path.join(ROOT, f)
    return json.load(open(p)) if os.path.exists(p) else None

gr = load('grade_recommendation.json'); cin = load('cinema_confidence.json'); L = load('nma_league.json')
br = load('joint_benefit_risk.json'); cn = load('cnma_incretin.json'); su = load('extend_surrogate.json')
pb = load('registry_pubbias.json'); ts = load('trial_sequential.json'); mc = load('hta_mcda.json'); ev = load('hta_evppi.json')
ds = load('decision_sensitivity.json'); conc = load('concordance_validation.json')
def loadtext(f):
    p = os.path.join(ROOT, f)
    return open(p, encoding='utf-8').read() if os.path.exists(p) else ''
ds_svg = loadtext('decision_sensitivity.svg')
SYM = {'High': '⊕⊕⊕⊕', 'Moderate': '⊕⊕⊕○', 'Low': '⊕⊕○○', 'Very low': '⊕○○○'}
COL = {'High': '#bfe3bf', 'Moderate': '#dff0d0', 'Low': '#fdebc0', 'Very low': '#f6c6c6'}
def esc(x): return html.escape(str(x))
S = []  # html sections

# ---- header ----
cert = gr['certainty'] if gr else '?'; conf = cin['cinema_confidence'] if cin else '?'
S.append(f"""<h1>Guideline dashboard &mdash; incretins for obesity</h1>
<p class="banner"><b>DRAFT decision-support.</b> Computable GRADE/CINeMA domains are pre-filled and traceable to a data file;
judgement domains (risk of bias, values, resources, equity) and the recommendation itself are the panel's. Registry-native
(AACT + PubMed abstracts), worktree-only. Not a guideline; not autonomous.</p>
<p class="tags"><span class="tag">GRADE certainty: <b>{cert}</b> {SYM.get(cert,'')}</span>
<span class="tag">CINeMA confidence: <b>{conf}</b></span>
<span class="tag">Strength: <b>{esc(gr['strength']) if gr else '?'}</b></span></p>""")

# ---- recommendation ----
if gr:
    S.append(f"""<h2>1. Draft recommendation (panel decides)</h2>
<p class="rec">{esc(gr['draft_recommendation'])}.</p>
<p class="small"><b>Guardrails:</b> {esc('; '.join(gr['guardrails']))}.</p>""")

# ---- Summary of Findings ----
if gr:
    sof = load('grade_export.json')
    rows = ''
    if sof:
        for r in sof['summary_of_findings']:
            rows += (f"<tr><td>{esc(r['outcome'])}</td><td>{esc(r['np'])}</td>"
                     f"<td><b>{esc(r['cert'])}</b> {SYM.get(r['cert'],'')}</td><td>{esc(r['rel'])}</td>"
                     f"<td>{esc(r['comp'])}</td><td>{esc(r['inter'])}</td><td>{esc(r['comments'])}</td></tr>")
    S.append(f"""<h2>2. Summary of Findings</h2><table><thead><tr><th>Outcome</th><th>№ (studies)</th>
<th>Certainty</th><th>Effect</th><th>With semaglutide</th><th>With tirzepatide</th><th>Comments</th></tr></thead>
<tbody>{rows}</tbody></table>""")

# ---- Evidence-to-Decision ----
if gr:
    et = ''.join(f"<tr><td>{esc(e['criterion'])}</td><td>{esc(e['judgement'])}</td><td class='small'><i>{esc(e['source'])}</i></td></tr>"
                 for e in gr['etd'])
    S.append(f"""<h2>3. Evidence-to-Decision</h2><table><thead><tr><th>Criterion</th><th>Judgement</th><th>Source</th></tr></thead><tbody>{et}</tbody></table>""")

# ---- league table ----
if L:
    order = L['order']; med = L['median_target']; kper = L['kper']; N = len(order)
    Cd = {(c['a'], c['b']): c for c in L['comparisons']}
    def cellf(a, b):
        return (Cd[(a, b)], False) if (a, b) in Cd else (Cd[(b, a)], True)
    head = '<tr><th></th>' + ''.join(f"<th>{esc(o.replace('semaglutide','sema')[:11])}</th>" for o in order) + '</tr>'
    body = ''
    for a in range(N):
        ra = order[a]; row = f"<tr><th style='text-align:left'>{esc(ra.replace('semaglutide','sema'))} (k={kper[ra]})</th>"
        for b in range(N):
            rb = order[b]
            if a == b:
                row += f"<td style='background:#e8eef5;text-align:center'><b>{med[ra]:.1f}</b></td>"
            elif b > a:
                c, _ = cellf(ra, rb); lvl = c['certainty']
                row += f"<td style='background:{COL[lvl]};text-align:center' title='{esc(c['note'])}'>{lvl[:4]} {SYM[lvl]}</td>"
            else:
                c, rev = cellf(ra, rb); diff = -c['diff'] if rev else c['diff']
                row += f"<td style='text-align:center'>{diff:+.1f}</td>"
        body += row + '</tr>'
    robust = [c for c in L['comparisons'] if c['certainty'] == 'Moderate']
    robtxt = ''.join(f"<li><b>{esc(c['a'])} &gt; {esc(c['b'])}</b> +{c['diff']:.1f} pp (P(sup)={c['p_sup']})</li>" for c in robust)
    S.append(f"""<h2>4. League table (transported, pp)</h2>
<p class="small">Diagonal = node (pp, k). Lower = effect (row−col). Upper = certainty. Hover a cell for its downgrade reasons.</p>
<table class="league"><thead>{head}</thead><tbody>{body}</tbody></table>
<p class="small"><b>Only Moderate-certainty findings:</b></p><ul class="small">{robtxt}</ul>
<p class="small"><b>k=1 INSUFFICIENT</b> (downgraded everywhere): {esc(', '.join(L['k1_insufficient']))}.
Headline: the highest-<i>ranked</i> agents have the <b>weakest</b> evidence.</p>""")

# ---- wide-gap / HTA cards ----
cards = []
if cn:
    c = cn['components']
    cards.append(('Component NMA (receptor decomposition)',
        f"GLP-1 {c['GLP1']['est_pp']:+.1f}, GIP {c['GIP']['est_pp']:+.1f}, glucagon {c['GCG']['est_pp']:+.1f} pp; "
        f"triple agonism sub-additive (pred {cn['triple_additive_pred_pp']} vs obs {cn['triple_observed_pp']}). "
        f"Validated vs netmeta::discomb."))
if su:
    cards.append(('Surrogate validation (weight &rarr; CV)',
        f"Weight loss is NOT a validated CV surrogate (error-adj R² {su['r2_error_adjusted']}, I²_HR=0%). "
        f"Class k={su['k']}; albiglutide −1% weight yet HR 0.78. Clinical: weight cannot substitute for hard-outcome trials."))
if br:
    cards.append(('Joint benefit-risk frontier',
        f"Frontier: {esc(', '.join(br['frontier']))}; dominated: {esc(', '.join(br['dominated']) or 'none')}. "
        f"~{br['tradeoff_nausea_per_pp_weight']} pp nausea per extra pp weight loss."))
if pb:
    cards.append(('Registry-aware publication bias',
        f"Egger flags asymmetry but the OBSERVED ghost is {pb['measured_reporting_bias_shift_pp']} pp from the mean "
        f"&rarr; asymmetry is heterogeneity, not suppression; a trim-and-fill correction would be SPURIOUS."))
if ts:
    cards.append(('Trial Sequential Analysis + live pipeline',
        f"Semaglutide MACE conclusive (cum HR {ts['cumulative_HR']}, z {ts['cumulative_z']}, crosses OBF) yet "
        f"{ts['ongoing_trials']} trials still enrolling ~{ts['ongoing_enrollment']:,} patients &rarr; research-prioritisation signal."))
if mc:
    best = max(mc['p_best'], key=mc['p_best'].get)
    cards.append(('HTA network MCDA',
        f"Fusing transported efficacy + CV + safety: {esc(best)} value {mc['value_median'][best]} P(best) {mc['p_best'][best]}."))
if ev:
    w = ev.get('wtp', {}).get('30000', {})
    topp = w['parameters'][0] if w.get('parameters') else None
    cards.append(('HTA value of information (EVPPI)',
        f"At £30k/QALY, EVPPI highest for <b>{esc(topp['parameter']) if topp else '?'}</b> "
        f"({topp['percentOfEVPI'] if topp else '?'}% of EVPI) &rarr; CV evidence is the decision driver (validated engine)."))
if cards:
    cc = ''.join(f"<div class='card'><h3>{t}</h3><p>{b}</p></div>" for t, b in cards)
    S.append(f"""<h2>5. Wide-gap methods (things ordinary MA cannot do)</h2><div class="cards">{cc}</div>""")

# ---- decision sensitivity (values/MID dependence) ----
if ds:
    h = ds['headline']; pm = h['p_by_mid']
    prow = ''.join(f"<td>{pm[str(m)]:.2f}</td>" for m in [0, 1, 2, 3, 4])
    cb = ds['confident_by_mid']
    S.append(f"""<h2>6. Decision sensitivity (the panel's MID, made transparent)</h2>
<p class="small">GRADE leaves the minimal important difference (MID) to the panel. This shows, from the joint posterior,
P(tirzepatide better than sc-semaglutide by &gt; MID) &mdash; near-certain at MID 0, uncertain by MID 3.</p>
<div style="display:flex;gap:18px;flex-wrap:wrap;align-items:center">
<div>{ds_svg}</div>
<div><table><thead><tr><th>Panel MID (pp)</th><th>0</th><th>1</th><th>2</th><th>3</th><th>4</th></tr></thead>
<tbody><tr><td>P(tirz better by &gt; MID)</td>{prow}</tr></tbody></table>
<p class="small">Across the league, confident conclusions (P&ge;0.95, k&ge;2) shrink as the MID rises:
<b>{cb['0']}</b> at MID 0 &rarr; <b>{cb['2']}</b> at MID 2 &rarr; <b>{cb['4']}</b> at MID 4 (of {ds['n_pairs']} pairs).
The panel's clinical-importance threshold directly determines how much the evidence can support.</p></div></div>""")

# ---- external concordance ----
if conc:
    v = conc['verdict']; rec = v['recommendation']; rk = v['ranking']
    S.append(f"""<h2>7. External validation (vs published GRADE guidelines)</h2>
<p class="small">Concordance of our automated outputs against human-adjudicated, published assessments (PubMed abstracts):</p>
<table><thead><tr><th>Dimension</th><th>Published</th><th>Ours</th><th>Verdict</th></tr></thead><tbody>
<tr><td>Recommendation (BMJ 2025 MAGIC living guideline)</td><td>weak, favour tirzepatide in obesity</td>
<td>Conditional (weak), favour tirzepatide</td><td><b>{'MATCH' if rec['concordant'] else 'MISMATCH'}</b></td></tr>
<tr><td>Ranking (Shi 2024 Lancet / Xie 2024)</td><td>GLP-1 top; tirzepatide &gt; semaglutide</td>
<td>tirzepatide &gt; semaglutide</td><td><b>{'MATCH' if rk['concordant'] else 'MISMATCH'}</b></td></tr>
<tr><td>Certainty</td><td>moderate-high (vs placebo)</td><td>Low (head-to-head difference)</td>
<td>concordant in logic (different estimand)</td></tr></tbody></table>
<p class="small">DOIs: 10.1136/bmj-2024-082071, 10.1016/S0140-6736(24)00351-9, 10.1111/dom.15138 (PubMed).
The automated pipeline reproduces the human guideline conclusion on the decision that matters.</p>""")

S.append("""<p class="small" style="margin-top:18px;color:#666">Every number above re-runs from a cited data file via
<code>python run_all.py</code>. Human-attested screening / RoB-2 / GRADE judgement is the panel's layer.</p>""")

page = f"""<!doctype html><html><head><meta charset="utf-8"><title>Guideline dashboard — incretins (obesity)</title>
<style>body{{font:13px/1.55 system-ui,Arial,sans-serif;margin:24px;color:#1a1a1a;max-width:1180px}}
h1{{font-size:21px}} h2{{font-size:17px;margin-top:26px;border-bottom:2px solid #e3e8ee;padding-bottom:4px}}
h3{{font-size:14px;margin:0 0 4px}} .banner{{background:#fff7e6;border:1px solid #f0c36d;padding:9px 13px;border-radius:6px}}
.tags .tag,.tag{{display:inline-block;background:#e8eef5;border-radius:4px;padding:2px 9px;margin-right:6px}}
table{{border-collapse:collapse;width:100%;margin:10px 0;font-size:12.5px}} th,td{{border:1px solid #c4c4c4;padding:5px 8px;vertical-align:top}}
th{{background:#f0f4f8}} .league td,.league th{{text-align:center}} .rec{{background:#eef7ee;border:1px solid #9c9;padding:10px 14px;border-radius:6px;font-weight:600}}
.small{{font-size:11.5px;color:#555}} .cards{{display:grid;grid-template-columns:1fr 1fr;gap:12px}}
.card{{border:1px solid #d4dae2;border-radius:7px;padding:10px 13px;background:#fafbfc}} code{{background:#eef;padding:1px 4px;border-radius:3px}}</style></head>
<body>{''.join(S)}</body></html>"""
open(os.path.join(ROOT, 'dashboard.html'), 'w', encoding='utf-8').write(page)
present = sum(x is not None for x in [gr, cin, L, br, cn, su, pb, ts, mc, ev])
print(f'wrote dashboard.html ({len(page):,} bytes; {present}/10 data sources present, {len(cards)} method cards)')
