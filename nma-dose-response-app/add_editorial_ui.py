import re

# Read index.html
with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the NMA Power Analysis section and add Editorial Standards section after it
# Look for the closing of the Beyond R panel
pattern = r'(<div class="hint" id="powerResult">Prospective NMA planning tool</div>\s*</div>\s*</div>)'
match = re.search(pattern, content)
if match:
    insert_pos = match.end()
    new_section = '''

      <div class="panel">
        <h2>Statistical Standards <span class="badge" style="background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);">RSM</span></h2>
        <div class="hint" style="margin-bottom: 16px;">Research Synthesis Methods editorial standards</div>

        <div class="control">
          <label>Tau-squared Estimation</label>
          <div class="inline-actions">
            <select id="tau2Estimator" class="dropdown" style="width:140px">
              <option value="REML" selected>REML (recommended)</option>
              <option value="DL">DerSimonian-Laird</option>
              <option value="PM">Paule-Mandel</option>
              <option value="EB">Empirical Bayes</option>
            </select>
            <label class="toggle-label" title="Show profile likelihood CI for tau-squared">
              <input type="checkbox" id="showTau2CI" />
              <span>Show tau² CI</span>
            </label>
          </div>
          <div class="hint" id="tau2Result">REML is the gold standard estimator</div>
        </div>

        <div class="control">
          <label>Robust Variance Estimation</label>
          <div class="inline-actions">
            <label class="toggle-label" title="Use cluster-robust standard errors (CR2)">
              <input type="checkbox" id="useRobustSE" />
              <span>Robust SE (CR2)</span>
            </label>
            <label class="toggle-label" title="Apply small-sample correction">
              <input type="checkbox" id="smallSampleCorrection" checked />
              <span>Small-sample correction</span>
            </label>
          </div>
          <div class="hint">Accounts for dependent effect sizes within studies</div>
        </div>

        <div class="control">
          <label>Inconsistency Assessment</label>
          <div class="inline-actions">
            <button class="secondary" id="runDesignByTreatment" title="Design-by-treatment interaction test">Design×Treatment</button>
            <button class="secondary" id="computeContribution" title="Compute contribution matrix">Contribution Matrix</button>
            <button class="secondary" id="runNetHeat" title="Generate net heat plot data">Net Heat Plot</button>
          </div>
          <div class="hint" id="inconsistencyResult">Gold-standard inconsistency detection methods</div>
        </div>

        <div class="control">
          <label>Model Comparison</label>
          <div class="inline-actions">
            <button class="secondary" id="compareModels" title="Compare contrast-based vs arm-based models">Contrast vs Arm-based</button>
            <button class="secondary" id="runMultivariate" title="Fit multivariate meta-analysis">Multivariate MA</button>
          </div>
          <div class="hint">Systematic model comparison per Hong et al. (2016)</div>
        </div>

        <div class="control">
          <label>Sensitivity Analysis</label>
          <div class="inline-actions">
            <button class="secondary" id="runLeaveOneOut" title="Leave-one-out analysis">Leave-One-Out</button>
            <button class="secondary" id="runCumulative" title="Cumulative meta-analysis">Cumulative MA</button>
            <button class="secondary" id="runInfluence" title="Influence diagnostics (DFBETAS, Cook's D)">Influence Diagnostics</button>
          </div>
          <div class="hint" id="sensitivityResult">Comprehensive sensitivity per Viechtbauer & Cheung (2010)</div>
        </div>

        <div class="control">
          <label>Export Standards</label>
          <div class="inline-actions">
            <button class="secondary" id="exportREMLReport" title="Export REML analysis report">REML Report</button>
            <button class="secondary" id="exportSensitivity" title="Export sensitivity analysis">Sensitivity Report</button>
            <button class="secondary" id="exportFullAudit" title="Export complete analysis audit trail">Full Audit Trail</button>
          </div>
        </div>
      </div>'''

    content = content[:insert_pos] + new_section + content[insert_pos:]
    print('Added Editorial Standards panel!')
else:
    print('Could not find insertion point')

# Write
with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done!')
