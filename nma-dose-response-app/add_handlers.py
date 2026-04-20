import re

# Read app.js
with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add seeded random number generator after the PALETTE constant
seeded_rng_code = '''
  // Seeded pseudo-random number generator (Mulberry32)
  function createSeededRandom(seed) {
    let state = seed;
    return function() {
      state |= 0;
      state = state + 0x6D2B79F5 | 0;
      let t = Math.imul(state ^ state >>> 15, 1 | state);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // Global random function (can be seeded or Math.random)
  let seededRandom = null;
  function getRandom() {
    return seededRandom ? seededRandom() : Math.random();
  }

'''

# Find where to insert (after PALETTE)
palette_pattern = r'(const PALETTE = \[[\s\S]*?\];)'
match = re.search(palette_pattern, content)
if match:
    insert_pos = match.end()
    content = content[:insert_pos] + seeded_rng_code + content[insert_pos:]
    print('Added seeded RNG!')
else:
    print('Could not find PALETTE')

# 2. Add DOM element references for new controls
dom_pattern = r'(const dom = \{[\s\S]*?)(^\s*\};)'
dom_additions = '''
    bootstrapSeed: document.getElementById("bootstrapSeed"),
    useKnappHartung: document.getElementById("useKnappHartung"),
    showPredictionInterval: document.getElementById("showPredictionInterval"),
    exportPRISMA: document.getElementById("exportPRISMA"),
    runCINeMA: document.getElementById("runCINeMA"),
    exportNodeSplit: document.getElementById("exportNodeSplit"),
'''

# Find dom object and add new elements
dom_match = re.search(r'(const dom = \{[^}]+)(exportStatus:[^,}]+)', content, re.MULTILINE)
if dom_match:
    # Insert before the last element
    insert_at = dom_match.end()
    content = content[:insert_at] + ',\n' + dom_additions.strip() + content[insert_at:]
    print('Added DOM references!')
else:
    print('Could not find dom object')

# 3. Add event handlers for new buttons
handler_code = '''
    // PRISMA-NMA checklist export
    if (dom.exportPRISMA) {
      dom.exportPRISMA.addEventListener("click", () => {
        const analysisData = {
          treatments: state.parsedData?.treatments || [],
          pooledResult: state.lastStats?.length > 0,
          modelFit: state.lastStats?.some(s => s.selectedModel),
          tau2: state.lastStats?.find(s => s.tau2)?.tau2
        };
        const md = generatePRISMAChecklist(analysisData);
        const blob = new Blob([md], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "PRISMA-NMA-checklist.md";
        a.click();
        URL.revokeObjectURL(url);
        dom.exportStatus.textContent = "Exported PRISMA-NMA checklist.";
      });
    }

    // CINeMA certainty assessment
    if (dom.runCINeMA) {
      dom.runCINeMA.addEventListener("click", () => {
        if (!state.lastStats || state.lastStats.length === 0) {
          alert("Run analysis first to assess certainty of evidence.");
          return;
        }
        const assessments = {};
        for (const stat of state.lastStats) {
          const domainResults = {
            imprecision: assessCINeMADomain("imprecision", {
              effect: stat.pooledEffect,
              ci: [stat.pooledCI?.lower, stat.pooledCI?.upper]
            }),
            heterogeneity: assessCINeMADomain("heterogeneity", { I2: stat.I2 || 0 }),
            incoherence: assessCINeMADomain("incoherence", { inconsistencyP: stat.inconsistencyP })
          };
          const overall = computeOverallCertainty(domainResults);
          assessments[stat.treatment] = { domains: domainResults, overall };
        }

        let report = "# CINeMA Certainty Assessment\\n\\n";
        for (const [treatment, data] of Object.entries(assessments)) {
          report += `## ${treatment}\\n`;
          report += `**Overall Certainty**: ${data.overall.rating} ${data.overall.symbol}\\n\\n`;
          report += "| Domain | Rating |\\n|--------|--------|\\n";
          for (const [domain, rating] of Object.entries(data.domains)) {
            report += `| ${CINEMA_DOMAINS[domain]?.name || domain} | ${rating} |\\n`;
          }
          report += "\\n";
        }

        const blob = new Blob([report], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "CINeMA-assessment.md";
        a.click();
        URL.revokeObjectURL(url);
        dom.exportStatus.textContent = "Exported CINeMA assessment.";
      });
    }

    // Node-splitting export
    if (dom.exportNodeSplit) {
      dom.exportNodeSplit.addEventListener("click", () => {
        if (!state.parsedData || !state.parsedData.rows?.length) {
          alert("Load data first to perform node-splitting.");
          return;
        }
        const treatments = [...new Set(state.parsedData.rows.map(r => r.treatment))];
        const comparisons = [];
        for (let i = 0; i < treatments.length; i++) {
          for (let j = i + 1; j < treatments.length; j++) {
            comparisons.push([treatments[i], treatments[j]]);
          }
        }

        let report = "# Node-Splitting Inconsistency Assessment\\n\\n";
        report += "| Comparison | Direct Effect | Direct SE | Direct 95% CI | N Direct |\\n";
        report += "|------------|--------------|-----------|---------------|----------|\\n";

        for (const comp of comparisons) {
          const result = performNodeSplitting(state.parsedData.rows.map(r => ({
            study: r.study,
            treatment1: r.treatment,
            treatment2: "Placebo",
            effect: r.effect,
            se: r.se
          })), comp);

          if (!isNaN(result.direct)) {
            report += `| ${comp[0]} vs ${comp[1]} | ${result.direct.toFixed(3)} | ${result.directSE.toFixed(3)} | [${result.directCI[0].toFixed(3)}, ${result.directCI[1].toFixed(3)}] | ${result.nDirect} |\\n`;
          }
        }

        const blob = new Blob([report], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "node-splitting.md";
        a.click();
        URL.revokeObjectURL(url);
        dom.exportStatus.textContent = "Exported node-splitting results.";
      });
    }

    // Knapp-Hartung and prediction interval toggles
    if (dom.useKnappHartung) {
      dom.useKnappHartung.addEventListener("change", updateAnalysis);
    }
    if (dom.showPredictionInterval) {
      dom.showPredictionInterval.addEventListener("change", updateAnalysis);
    }

'''

# Find where to insert (after clearBootstrap handler)
clear_bootstrap_pattern = r'(dom\.clearBootstrap\.addEventListener\("click", \(\) => \{[^}]+\}[^}]+\}\);)'
match = re.search(clear_bootstrap_pattern, content)
if match:
    insert_pos = match.end()
    content = content[:insert_pos] + '\n' + handler_code + content[insert_pos:]
    print('Added event handlers!')
else:
    print('Could not find clearBootstrap handler')

# 4. Update runBootstrap to use seeded random
bootstrap_update = '''
    // Set up seeded random if seed is provided
    const seedVal = dom.bootstrapSeed?.value ? parseInt(dom.bootstrapSeed.value, 10) : null;
    if (seedVal && !isNaN(seedVal)) {
      seededRandom = createSeededRandom(seedVal);
      console.log("Using seed:", seedVal);
    } else {
      seededRandom = null;
    }
'''

# Find runBootstrap function and add seed setup at the start
run_bootstrap_pattern = r'(function runBootstrap\(\) \{)'
match = re.search(run_bootstrap_pattern, content)
if match:
    insert_pos = match.end()
    content = content[:insert_pos] + '\n' + bootstrap_update + content[insert_pos:]
    print('Added seed setup to runBootstrap!')
else:
    print('Could not find runBootstrap function')

# Write back
with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('All updates complete!')
