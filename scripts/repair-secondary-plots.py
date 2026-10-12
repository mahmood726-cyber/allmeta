"""Temporary, source-hash-guarded adapter wiring; not retained after validation."""
from pathlib import Path
import hashlib
import sys


def once(s, old, new):
    assert s.count(old) == 1, (old[:100], s.count(old))
    return s.replace(old, new, 1)

if '--fixtures' in sys.argv:
    p = Path('tests/playwright/secondary-plot-fidelity.spec.mjs')
    t = p.read_text()
    t = once(t, "await page.locator('#mcmcChains').fill('2');", "await page.locator('#mcmcChains').selectOption('2');")
    t = once(t, "    APP.config.outcomeType = 'continuous';", "    Object.assign(APP.config, {outcomeType:'continuous',studyVar:study,treatmentVar:treatment,eventVar:outcome,outcomeVar:outcome});")
    p.write_text(t)
    print('Corrected dropdown interaction and explicit synthetic-data variable mapping; assertions unchanged.')
    raise SystemExit(0)

p = Path('IPD-Meta-Pro/ipd-meta-pro.html')
raw = p.read_bytes()
assert hashlib.sha1(f'blob {len(raw)}\0'.encode()+raw).hexdigest() == 'cfebcafafd4c446c1028138719a8aa4c60fc38bf', 'Audited source changed'
s = raw.decode('utf-8')
original = s

# Preserve the existing statistical and sampling implementation byte for byte.
a = s.index('function fitReferenceNetworkModel(')
b = s.index('\nfunction ', a+20)
protected_fit = s[a:b]
a = s.index('    rankProbabilityData: function(network, nSim = 1000)')
b = s.index('    // Feature 34:', a)
protected_ranks = s[a:b]

# Remove hard-coded exemplar ranking headline and the mislabelled SUCRA/100
# P-score column. The replacement table reports the actual rank matrix.
a = s.index('<div class="panel" id="panel-ranking">')
b = s.index('<div class="panel" id="panel-heterogeneity">', a)
card = s[a:b]
new = card.replace('Treatment Ranking (SUCRA/P-Score)', 'Treatment ranking — computed probabilities')
new = once(new, '<div class="stat-value">Treatment A</div>', '<div class="stat-value" id="ipdRankFirst">—</div>')
new = once(new, '<div class="stat-value">87.3%</div>', '<div class="stat-value" id="ipdRankSucra">—</div>')
new = new.replace('Best Treatment', 'First by selected numerical direction').replace('Best SUCRA', 'Highest SUCRA')
new = once(new, '<th scope="col">P-Score</th>', '')
new = new.replace('P(Best)', 'P(Rank 1)').replace('P(Worst)', 'P(Last rank)')
key = '<div class="data-table-container">'
new = once(new, key, '<p id="ipdRankingStatus" role="status">Run an eligible network analysis to obtain rank probabilities.</p>\n<label for="ipdRankDirection">Numerical ranking direction</label>\n<select id="ipdRankDirection" class="form-select"><option value="higher">Larger fitted effect first</option><option value="lower">Smaller fitted effect first</option></select>\n'+key)
s = once(s, card, new)

a = s.index('function runNetworkMetaAnalysis()')
b = s.index('\n class DecisionTree', a)
fn = s[a:b]
x = fn.index(' const rankResult = ')
y = fn.index('\n return {\n directEstimates:', x)
replacement = """ const rankIssue = IPDSecondaryPlots.rankingPrerequisite(pairwiseRows, treatments, outcomeType);
 const rankResult = !rankIssue && typeof BeyondR40 !== 'undefined' && typeof BeyondR40.rankProbabilityData === 'function'
   ? BeyondR40.rankProbabilityData(beyondNetwork, 2000) : null;
 IPDSecondaryPlots.setRanking(rankResult, rankIssue);
 const sucraScores = {};
 if (!rankIssue && rankResult && Array.isArray(rankResult.rankings)) {
   rankResult.rankings.forEach(r => { sucraScores[r.treatment] = r.SUCRA; });
 }
"""
fn = fn[:x]+replacement+fn[y:]
fn = once(fn, ' sucraScores: sucraScores,', ' sucraScores: sucraScores,\n rankingResult: rankResult,\n rankingUnavailableReason: rankIssue,')
s = s[:a]+fn+s[b:]

# Keep existing global entry points, but remove the broken/demonstration bodies.
a = s.index('function addSurvivalPlotInteractivity()')
b = s.index('function addNetworkInteractivity()', a)
s = s[:a]+'function addSurvivalPlotInteractivity() {\n IPDSecondaryPlots.bindSurvivalZoom();\n}\n\n'+s[b:]
for name in ['drawRankogram','drawCumulativeRankPlot']:
    a = s.index('function '+name+'(')
    b = s.index('\nfunction ', a+20)
    replacement = 'function '+name+'(treatments, rankResult) {\n if (arguments.length > 1) IPDSecondaryPlots.setRanking(rankResult);\n else IPDSecondaryPlots.renderRanking();\n}\n\n'
    s = s[:a]+replacement+s[b:]

module = Path('IPD-Meta-Pro/src/secondary-plot-adapters.js').read_text()
assert '</script' not in module.lower()
assert s.count('</body>') == 1
s = s.replace('</body>', '<script data-source="src/secondary-plot-adapters.js">\n'+module+'\n</script>\n</body>')
assert protected_fit in s and protected_ranks in s
p.write_bytes(s.encode('utf-8'))
print('Wired computed ranking matrices, cached survival zoom and Bayesian repaint. Network fit and ranking sampler unchanged.')
