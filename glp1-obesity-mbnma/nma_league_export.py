"""Render the multi-comparison league table (nma_league.json) as a panel-ready league SoF: a colour-coded
HTML matrix (offline) + Markdown, with the per-comparison certainty, the robust (Moderate) findings, and
the k=1 INSUFFICIENT flags made explicit. Decision-support DRAFT."""
import io, sys, json, html
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

ROOT = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma'
L = json.load(open(f'{ROOT}/nma_league.json'))
order = L['order']; med = L['median_target']; kper = L['kper']; N = len(order)
C = {(c['a'], c['b']): c for c in L['comparisons']}            # a higher-ranked than b
def cell(a, b):
    if (a, b) in C: return C[(a, b)], False
    c = C[(b, a)]; return c, True                              # reversed
COL = {'High': '#bfe3bf', 'Moderate': '#dff0d0', 'Low': '#fdebc0', 'Very low': '#f6c6c6'}
SYM = {'High': '⊕⊕⊕⊕', 'Moderate': '⊕⊕⊕○', 'Low': '⊕⊕○○', 'Very low': '⊕○○○'}

# ---------- Markdown ----------
md = ['# NMA league table — incretins for obesity (transported, target population)', '',
      '**DRAFT decision-support.** Diagonal = node (transported pp, k trials). Lower triangle = effect '
      'difference (row − col, pp). Upper triangle = per-comparison certainty (computable GRADE/CINeMA '
      'domains). RoB/values are the panel\'s; every cell re-runs from `nma_draws.npz`.', '',
      '| vs | ' + ' | '.join(o.replace('semaglutide', 'sema')[:12] for o in order) + ' |',
      '|' + '---|' * (N + 1)]
for a in range(N):
    ra = order[a]; cells = [f'**{ra.replace("semaglutide","sema")}** (k={kper[ra]})']
    for b in range(N):
        rb = order[b]
        if a == b:
            cells.append(f'**{med[ra]:.1f}**')
        elif b > a:                                            # upper: certainty
            c, _ = cell(ra, rb); cells.append(f'{c["certainty"]} {SYM[c["certainty"]]}')
        else:                                                  # lower: effect
            c, rev = cell(ra, rb); diff = -c['diff'] if rev else c['diff']
            cells.append(f'{diff:+.1f} [{(-c["cri"][1] if rev else c["cri"][0]):+.1f},{(-c["cri"][0] if rev else c["cri"][1]):+.1f}]')
    md.append('| ' + ' | '.join(cells) + ' |')
robust = [c for c in L['comparisons'] if c['certainty'] == 'Moderate']
md += ['', '## Robust findings (Moderate certainty — the only ones in the network)']
for c in robust:
    md.append(f"- **{c['a']} > {c['b']}** by {c['diff']:+.1f} pp (95% CrI {c['cri']}), P(superior)={c['p_sup']}")
md += ['', '## INSUFFICIENT evidence (k=1 — any comparison involving these is downgraded)',
       '- ' + ', '.join(L['k1_insufficient']),
       '', f"**Certainty across {sum(L['certainty_counts'].values())} ordered comparisons:** "
       + ', '.join(f'{k} {v}' for k, v in L['certainty_counts'].items()) + '.',
       '', '> Headline: the highest-*ranked* agents (mazdutide, retatrutide) have the **weakest** evidence '
       '(k=1); the only Moderate-certainty conclusions are that the established injectables (tirzepatide, '
       'sc-semaglutide) beat the oral/weaker agents. A naked ranking hides exactly this.']
open(f'{ROOT}/nma_league.md', 'w', encoding='utf-8').write('\n'.join(md))

# ---------- offline HTML ----------
def th(x): return f'<th>{html.escape(str(x))}</th>'
head = '<tr><th></th>' + ''.join(th(o.replace('semaglutide', 'sema')[:12]) for o in order) + '</tr>'
body = ''
for a in range(N):
    ra = order[a]; row = f'<tr><th style="text-align:left">{html.escape(ra.replace("semaglutide","sema"))} (k={kper[ra]})</th>'
    for b in range(N):
        rb = order[b]
        if a == b:
            row += f'<td style="background:#e8eef5;text-align:center"><b>{med[ra]:.1f}</b></td>'
        elif b > a:
            c, _ = cell(ra, rb); lvl = c['certainty']
            row += f'<td style="background:{COL[lvl]};text-align:center" title="{html.escape(c["note"])}">{lvl} {SYM[lvl]}</td>'
        else:
            c, rev = cell(ra, rb); diff = -c['diff'] if rev else c['diff']
            lo = (-c['cri'][1] if rev else c['cri'][0]); hi = (-c['cri'][0] if rev else c['cri'][1])
            row += f'<td style="text-align:center">{diff:+.1f}<br><span style="color:#777;font-size:11px">[{lo:+.1f}, {hi:+.1f}]</span></td>'
    body += row + '</tr>'
rob = ''.join(f"<li><b>{html.escape(c['a'])} &gt; {html.escape(c['b'])}</b> by {c['diff']:+.1f} pp "
              f"(95% CrI [{c['cri'][0]}, {c['cri'][1]}]), P(superior)={c['p_sup']}</li>" for c in robust)
page = f"""<!doctype html><html><head><meta charset="utf-8"><title>NMA league table — incretins (obesity)</title>
<style>body{{font:13px/1.5 system-ui,Arial,sans-serif;margin:22px;color:#1a1a1a;max-width:1200px}}
h1{{font-size:19px}} .banner{{background:#fff7e6;border:1px solid #f0c36d;padding:8px 12px;border-radius:6px}}
table{{border-collapse:collapse;margin:12px 0}} th,td{{border:1px solid #bbb;padding:5px 8px}}
.legend span{{display:inline-block;padding:2px 8px;border-radius:4px;margin-right:6px}}</style></head><body>
<h1>NMA league table &mdash; incretins for obesity (transported, target population)</h1>
<p class="banner"><b>DRAFT decision-support.</b> Diagonal = node (transported pp, k trials). Lower triangle = effect difference (row &minus; col, pp [95% CrI]). Upper triangle = per-comparison certainty. RoB/values are the panel's; every cell re-runs from the saved posterior.</p>
<p class="legend">Certainty:
<span style="background:{COL['Moderate']}">Moderate ⊕⊕⊕○</span>
<span style="background:{COL['Low']}">Low ⊕⊕○○</span>
<span style="background:{COL['Very low']}">Very low ⊕○○○</span></p>
<table><thead>{head}</thead><tbody>{body}</tbody></table>
<h2>Robust findings (Moderate certainty &mdash; the only ones in the network)</h2><ul>{rob}</ul>
<p><b>INSUFFICIENT (k=1, downgraded everywhere):</b> {html.escape(', '.join(L['k1_insufficient']))}.</p>
<p style="background:#eef4fb;border:1px solid #aac;padding:9px 13px;border-radius:6px"><b>Headline:</b> the highest-<i>ranked</i> agents (mazdutide, retatrutide) have the <b>weakest</b> evidence (k=1). The only Moderate-certainty conclusions are that the established injectables (tirzepatide, sc-semaglutide) beat the oral/weaker agents. A naked SUCRA ranking hides exactly this.</p>
</body></html>"""
open(f'{ROOT}/nma_league.html', 'w', encoding='utf-8').write(page)
print('wrote nma_league.md + nma_league.html')
print(f"league: {N} nodes, {sum(L['certainty_counts'].values())} comparisons, "
      f"certainty {L['certainty_counts']}; {len(robust)} Moderate (robust) findings; k=1: {L['k1_insufficient']}")
