import re

# Read index.html
with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the Statistical Standards panel (RSM) and add Tier 1 panel after it
# Look for the closing of the Statistical Standards panel
pattern = r'(<button class="secondary" id="exportFullAudit"[^>]*>Full Audit Trail</button>\s*</div>\s*</div>\s*</div>)'
match = re.search(pattern, content)

if match:
    insert_pos = match.end()
    new_panel = '''

      <div class="panel">
        <h2>Beyond R: Tier 1 <span class="badge" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">AI</span></h2>
        <div class="hint" style="margin-bottom: 16px;">High-impact features not available in R packages</div>

        <div class="control">
          <label>Gaussian Process Dose-Response</label>
          <div class="inline-actions">
            <select id="gpKernel" class="dropdown" style="width:120px">
              <option value="rbf" selected>RBF (Smooth)</option>
              <option value="matern32">Matern 3/2</option>
              <option value="matern52">Matern 5/2</option>
            </select>
            <button class="secondary" id="fitGP" title="Fit Gaussian Process model">Fit GP</button>
            <button class="secondary" id="sampleGPPosterior" title="Draw posterior samples">Sample Posterior</button>
          </div>
          <div class="hint" id="gpResult">Non-parametric Bayesian dose-response with uncertainty</div>
        </div>

        <div class="control">
          <label>Quantile Meta-Analysis</label>
          <div class="inline-actions">
            <button class="secondary" id="poolMedians" title="Pool study medians">Pool Medians</button>
            <button class="secondary" id="poolIQRs" title="Pool interquartile ranges">Pool IQRs</button>
            <button class="secondary" id="estimateMeanSD" title="Convert median/IQR to mean/SD">Estimate Mean/SD</button>
          </div>
          <div class="hint" id="quantileResult">Meta-analysis when only medians/IQR reported</div>
        </div>

        <div class="control">
          <label>Personalized Dose Optimizer</label>
          <div class="inline-actions">
            <input type="number" id="patientAge" placeholder="Age" style="width:60px" value="50" />
            <input type="number" id="patientWeight" placeholder="Weight" style="width:70px" value="70" />
            <select id="patientRenal" class="dropdown" style="width:80px">
              <option value="90" selected>Normal</option>
              <option value="60">Mild CKD</option>
              <option value="30">Moderate CKD</option>
              <option value="15">Severe CKD</option>
            </select>
            <button class="secondary" id="optimizeDose" title="Find optimal dose for patient">Optimize</button>
          </div>
          <div class="hint" id="personalizedResult">Patient-specific dose recommendations</div>
        </div>

        <div class="control">
          <label>Interactive 3D Surface</label>
          <div class="inline-actions">
            <button class="secondary" id="generate3DSurface" title="Generate 3D dose-response surface">Generate 3D</button>
            <button class="secondary" id="export3DData" title="Export for Three.js">Export for Three.js</button>
            <label class="toggle-label">
              <input type="checkbox" id="show3DWireframe" checked />
              <span>Wireframe</span>
            </label>
          </div>
          <div class="hint">WebGL 3D visualization with dose × covariate × effect</div>
        </div>

        <div class="control">
          <label>Data Quality Tests</label>
          <div class="inline-actions">
            <button class="secondary" id="runGRIME" title="GRIME test for means">GRIME</button>
            <button class="secondary" id="runSPRITE" title="SPRITE sample reconstruction">SPRITE</button>
            <button class="secondary" id="runRIVETS" title="RIVETS rounding test">RIVETS</button>
            <button class="secondary" id="runBenford" title="Benford's Law test">Benford</button>
          </div>
          <div class="hint" id="dataQualityResult">Detect fabrication, errors, and suspicious patterns</div>
        </div>

        <div class="control">
          <label>Live Meta-Analysis</label>
          <div class="inline-actions">
            <button class="secondary" id="startLiveMA" title="Start live monitoring">Start Monitoring</button>
            <button class="secondary" id="stopLiveMA" title="Stop monitoring" disabled>Stop</button>
            <button class="secondary" id="exportLiveReport" title="Export update report">Export Report</button>
          </div>
          <div class="hint" id="liveMAStatus">Real-time updating meta-analysis with sequential monitoring</div>
        </div>

        <div class="control">
          <label>Export</label>
          <div class="inline-actions">
            <button class="secondary" id="exportTier1Report" title="Export comprehensive Tier 1 analysis">Full Tier 1 Report</button>
            <button class="secondary" id="exportGPCurve" title="Export GP predictions as CSV">GP Curve CSV</button>
          </div>
        </div>
      </div>'''

    content = content[:insert_pos] + new_panel + content[insert_pos:]
    print('Added Tier 1 UI panel!')
else:
    print('Could not find Statistical Standards panel, trying alternative...')
    # Try finding after the Beyond R badge panel
    pattern2 = r'(<button class="secondary" id="runLivingReview"[^>]*>Living Review</button>\s*</div>\s*</div>\s*</div>)'
    match2 = re.search(pattern2, content)
    if match2:
        insert_pos = match2.end()
        # Add panel here too...
        print('Would insert after Beyond R panel')

# Write back
with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done adding Tier 1 UI!')
