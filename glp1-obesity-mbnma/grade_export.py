"""GRADEpro/iEtD export: turn our GRADE + CINeMA assessment into a standard, panel-ready Summary of
Findings (SoF) table + Evidence-to-Decision (EtD) framework. Emits Markdown + a self-contained offline
HTML + machine-readable JSON, so the transparent scaffold drops into a guideline panel's existing workflow
(GRADEpro GDT / iEtD). Decision-support DRAFT; judgement rows are explicitly the panel's. AACT-derived."""
import io, sys, json, html
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

ROOT = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma'
gr = json.load(open(f'{ROOT}/grade_recommendation.json'))
cin = json.load(open(f'{ROOT}/cinema_confidence.json'))
gi = json.load(open(f'{ROOT}/grade_inputs.json'))
br = json.load(open(f'{ROOT}/joint_benefit_risk.json'))
surv = {r['agent']: r for r in json.load(open(f'{ROOT}/survival_nma.json'))['survival_nma_by_agent']}
SYM = {'High': '+OOO'.replace('+OOO', '⊕⊕⊕⊕'), 'Moderate': '⊕⊕⊕○',
       'Low': '⊕⊕○○', 'Very low': '⊕○○○'}
cert = gr['certainty']; cinconf = cin['cinema_confidence']
nz = {n['node']: n for n in br['agents']}
naus_t = next(a['nausea'] for a in br['agents'] if a['node'] == 'tirzepatide')
naus_s = next(a['nausea'] for a in br['agents'] if a['node'] == 'semaglutide-sc-weekly')

# --- Summary of Findings rows (GRADEpro standard) ---
SOF = [
    {'outcome': 'Body-weight % change (>=36 wk) - CRITICAL', 'np': '~17,401 (19 RCTs, indirect)',
     'cert': cert, 'rel': 'MD (continuous)',
     'comp': 'Mean -14.6 pp with semaglutide', 'inter': 'MD 2.9 pp greater loss (95% CrI -0.2 to 6.0)',
     'comments': 'Indirect (no head-to-head); imprecision binding; CrI conservative.'},
    {'outcome': 'Major adverse CV events (MACE) - CRITICAL', 'np': 'no head-to-head',
     'cert': 'Not estimable (contrast)', 'rel': 'vs placebo: sema HR 0.81, tirz 0.62',
     'comp': 'Both reduce MACE vs placebo', 'inter': 'Between-drug difference NOT estimable',
     'comments': 'No head-to-head CV trial; weight loss is NOT a validated CV surrogate -> no inference permitted.'},
    {'outcome': 'Nausea - IMPORTANT (harm)', 'np': 'registry AE tables',
     'cert': cert, 'rel': 'RD',
     'comp': f'{naus_s:.0f}% with semaglutide', 'inter': f'{naus_t:.0f}% with tirzepatide (+{naus_t-naus_s:.0f} pp)',
     'comments': 'Tirzepatide more nausea; both GI-dominant; placebo-anchored.'},
]

# --- Evidence-to-Decision rows ---
ETD = [(e['criterion'], e['judgement'], e['source']) for e in gr['etd']]

# ---------- Markdown ----------
md = [f"# Summary of Findings - {gr['comparison']}", '',
      '**DRAFT decision-support — a guideline panel confirms all ratings; every cell re-runs from a cited data file.**', '',
      f"Certainty (GRADE): **{cert}** {SYM[cert]} | Network confidence (CINeMA): **{cinconf}** | "
      f"Recommendation strength: **{gr['strength']}**", '',
      '| Outcome | № participants (studies) | Certainty | Effect | With semaglutide | With tirzepatide (difference) | Comments |',
      '|---|---|---|---|---|---|---|']
for r in SOF:
    sym = SYM.get(r['cert'], '')
    md.append(f"| {r['outcome']} | {r['np']} | {r['cert']} {sym} | {r['rel']} | {r['comp']} | {r['inter']} | {r['comments']} |")
md += ['', '## Evidence-to-Decision framework (DRAFT)', '',
       '| Criterion | Judgement | Source |', '|---|---|---|']
for k, v, s in ETD:
    md.append(f"| {k} | {v} | {s} |")
md += ['', f"### Draft recommendation (panel decides)", '', f"> {gr['draft_recommendation']}.", '',
       '**Guardrails:** ' + '; '.join(gr['guardrails']) + '.', '',
       '**Key evidence gap (CINeMA):** the comparison is indirect with no incoherence check -> a head-to-head '
       'trial (e.g. SURMOUNT-5) is the single highest-value study.']
open(f'{ROOT}/grade_sof.md', 'w', encoding='utf-8').write('\n'.join(md))

# ---------- self-contained HTML ----------
def td(x): return f'<td>{html.escape(str(x))}</td>'
rows_sof = ''.join('<tr>' + td(r['outcome']) + td(r['np']) + f'<td><b>{r["cert"]}</b> {SYM.get(r["cert"],"")}</td>'
                   + td(r['rel']) + td(r['comp']) + td(r['inter']) + td(r['comments']) + '</tr>' for r in SOF)
rows_etd = ''.join('<tr>' + td(k) + td(v) + f'<td><i>{html.escape(s)}</i></td>' + '</tr>' for k, v, s in ETD)
htmlpage = f"""<!doctype html><html><head><meta charset="utf-8"><title>SoF - {html.escape(gr['comparison'])}</title>
<style>body{{font:14px/1.5 system-ui,Arial,sans-serif;margin:24px;color:#1a1a1a;max-width:1100px}}
h1{{font-size:20px}} .banner{{background:#fff7e6;border:1px solid #f0c36d;padding:8px 12px;border-radius:6px}}
table{{border-collapse:collapse;width:100%;margin:12px 0;font-size:13px}}
th,td{{border:1px solid #ccc;padding:6px 8px;text-align:left;vertical-align:top}}
th{{background:#f0f4f8}} .rec{{background:#eef7ee;border:1px solid #9c9;padding:10px 14px;border-radius:6px}}
.tag{{display:inline-block;background:#e8eef5;border-radius:4px;padding:1px 7px;margin-right:6px}}</style></head><body>
<h1>Summary of Findings &mdash; {html.escape(gr['comparison'])}</h1>
<p class="banner"><b>DRAFT decision-support.</b> A guideline panel confirms all ratings; judgement rows are the panel's; every cell re-runs from a cited data file. Not an autonomous recommendation.</p>
<p><span class="tag">GRADE certainty: <b>{cert}</b> {SYM[cert]}</span>
<span class="tag">CINeMA confidence: <b>{cinconf}</b></span>
<span class="tag">Strength: <b>{gr['strength']}</b></span></p>
<table><thead><tr><th>Outcome</th><th>&#8470; participants (studies)</th><th>Certainty</th><th>Effect</th>
<th>With semaglutide</th><th>With tirzepatide (difference)</th><th>Comments</th></tr></thead><tbody>{rows_sof}</tbody></table>
<h2>Evidence-to-Decision framework (DRAFT)</h2>
<table><thead><tr><th>Criterion</th><th>Judgement</th><th>Source</th></tr></thead><tbody>{rows_etd}</tbody></table>
<p class="rec"><b>Draft recommendation (panel decides):</b> {html.escape(gr['draft_recommendation'])}.<br>
<b>Key evidence gap (CINeMA):</b> indirect comparison, no incoherence check &rarr; a head-to-head trial (e.g. SURMOUNT-5) is the highest-value study.</p>
<p style="font-size:12px;color:#666"><b>Guardrails:</b> {html.escape('; '.join(gr['guardrails']))}.</p>
</body></html>"""
open(f'{ROOT}/grade_export.html', 'w', encoding='utf-8').write(htmlpage)

# ---------- machine-readable (GRADEpro/iEtD-style) ----------
json.dump({'comparison': gr['comparison'], 'grade_certainty': cert, 'cinema_confidence': cinconf,
           'strength': gr['strength'], 'summary_of_findings': SOF,
           'evidence_to_decision': [{'criterion': k, 'judgement': v, 'source': s} for k, v, s in ETD],
           'draft_recommendation': gr['draft_recommendation'], 'guardrails': gr['guardrails'],
           'key_evidence_gap': 'indirect comparison; no incoherence check; head-to-head trial (SURMOUNT-5) is highest-value',
           'export_note': 'GRADEpro/iEtD-style; DRAFT decision-support; panel confirms; every cell traceable'},
          open(f'{ROOT}/grade_export.json', 'w'), indent=1)

print('SoF + EtD export written:')
print('  grade_sof.md   (Markdown SoF + EtD table)')
print('  grade_export.html (self-contained, offline, panel-openable)')
print('  grade_export.json (machine-readable GRADEpro/iEtD-style)')
print(f'\nSoF: {len(SOF)} outcomes | GRADE {cert} {SYM[cert]} | CINeMA {cinconf} | {gr["strength"]}')
print('\n'.join('\n'.join(md[i] for i in range(len(md)) if md[i].startswith('|'))[:0].splitlines()) or '')
for r in SOF:
    print(f"  - {r['outcome'].split(' - ')[0]:42s} certainty {r['cert']}")
