import re

# Read index.html
with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the Tier 1 panel and add RSM panel after it
pattern = r'(<button class="secondary" id="exportGPCurve"[^>]*>GP Curve CSV</button>\s*</div>\s*</div>\s*</div>)'
match = re.search(pattern, content)

if match:
    insert_pos = match.end()
    new_panel = '''

      <div class="panel">
        <h2>Publication Bias <span class="badge" style="background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);">RSM</span></h2>
        <div class="hint" style="margin-bottom: 16px;">Research Synthesis Methods editorial standards</div>

        <div class="control">
          <label>Trim-and-Fill</label>
          <div class="inline-actions">
            <select id="tafEstimator" class="dropdown" style="width:70px">
              <option value="L0" selected>L0</option>
              <option value="R0">R0</option>
              <option value="Q0">Q0</option>
            </select>
            <select id="tafSide" class="dropdown" style="width:80px">
              <option value="auto" selected>Auto</option>
              <option value="left">Left</option>
              <option value="right">Right</option>
            </select>
            <button class="secondary" id="runTrimFill" title="Duval & Tweedie trim-and-fill">Run T&F</button>
          </div>
          <div class="hint" id="trimFillResult">Nonparametric bias adjustment (Duval & Tweedie 2000)</div>
        </div>

        <div class="control">
          <label>PET-PEESE</label>
          <div class="inline-actions">
            <button class="secondary" id="runPET" title="Precision-Effect Test">PET</button>
            <button class="secondary" id="runPEESE" title="Precision-Effect Estimate with SE">PEESE</button>
            <button class="secondary" id="runPETPEESE" title="Combined PET-PEESE">PET-PEESE</button>
          </div>
          <div class="hint" id="petpeeseResult">Stanley & Doucouliagos (2014) bias correction</div>
        </div>

        <div class="control">
          <label>Doi Plot & LFK Index</label>
          <div class="inline-actions">
            <button class="secondary" id="runDoiPlot" title="Generate Doi plot">Doi Plot</button>
            <button class="secondary" id="computeLFK" title="Compute LFK asymmetry index">LFK Index</button>
          </div>
          <div class="hint" id="lfkResult">Furuya-Kanamori asymmetry assessment</div>
        </div>

        <div class="control">
          <label>Selection Models</label>
          <div class="inline-actions">
            <button class="secondary" id="runVeveaHedges" title="Vevea-Hedges weight-function model">Vevea-Hedges</button>
            <button class="secondary" id="runSelectionSensitivity" title="Sensitivity to selection">Sensitivity</button>
          </div>
          <div class="hint" id="selectionResult">Weight-function selection model (1995)</div>
        </div>
      </div>

      <div class="panel">
        <h2>Diagnostics <span class="badge" style="background: linear-gradient(135deg, #9b59b6 0%, #8e44ad 100%);">QA</span></h2>
        <div class="hint" style="margin-bottom: 16px;">Model validation and outlier detection</div>

        <div class="control">
          <label>Outlier Diagnostics</label>
          <div class="inline-actions">
            <button class="secondary" id="computeCooksD" title="Cook's distance">Cook's D</button>
            <button class="secondary" id="computeDFFITS" title="Difference in fits">DFFITS</button>
            <button class="secondary" id="computeStudentized" title="Studentized residuals">Studentized</button>
          </div>
          <div class="hint" id="outlierResult">Viechtbauer & Cheung (2010) influence diagnostics</div>
        </div>

        <div class="control">
          <label>Cross-Validation</label>
          <div class="inline-actions">
            <button class="secondary" id="runLOOCV" title="Leave-one-out cross-validation">LOOCV</button>
            <button class="secondary" id="computeRMSE" title="Root mean squared error">RMSE</button>
          </div>
          <div class="hint" id="cvResult">Model validation metrics</div>
        </div>

        <div class="control">
          <label>Transitivity Assessment</label>
          <div class="inline-actions">
            <button class="secondary" id="runTransitivity" title="Assess NMA transitivity assumption">Assess Transitivity</button>
            <button class="secondary" id="exportTransitivity" title="Export transitivity report">Export Report</button>
          </div>
          <div class="hint" id="transitivityResult">Covariate balance across comparisons</div>
        </div>

        <div class="control">
          <label>Multivariate Outcomes</label>
          <div class="inline-actions">
            <input type="number" id="outcomeCorrelation" placeholder="rho" style="width:60px" value="0.5" step="0.1" min="-1" max="1" />
            <button class="secondary" id="runMultivariate" title="Multivariate meta-analysis">Pool Bivariate</button>
          </div>
          <div class="hint" id="multivariateResult">Correlated outcomes (Jackson et al. 2011)</div>
        </div>

        <div class="control">
          <label>Export</label>
          <div class="inline-actions">
            <button class="secondary" id="exportBiasReport" title="Export publication bias report">Bias Report</button>
            <button class="secondary" id="exportDiagnostics" title="Export diagnostics">Diagnostics CSV</button>
            <button class="secondary" id="exportRSMChecklist" title="RSM checklist">RSM Checklist</button>
          </div>
        </div>
      </div>'''

    content = content[:insert_pos] + new_panel + content[insert_pos:]
    print('Added RSM UI panels!')
else:
    print('Could not find Tier 1 panel ending')

# Write back
with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done adding RSM UI!')
