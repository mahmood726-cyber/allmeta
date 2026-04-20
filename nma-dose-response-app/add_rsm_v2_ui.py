import re

# Read index.html
with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the Diagnostics QA panel ending and add new panel after it
# Look for the RSM Checklist button at the end of the Diagnostics panel
pattern = r'(<button class="secondary" id="exportRSMChecklist"[^>]*>RSM Checklist</button>\s*</div>\s*</div>\s*</div>)'
match = re.search(pattern, content)

if match:
    insert_pos = match.end()
    new_panel = '''

      <div class="panel">
        <h2>Evidential Value <span class="badge" style="background: linear-gradient(135deg, #16a085 0%, #1abc9c 100%);">RSM-2</span></h2>
        <div class="hint" style="margin-bottom: 16px;">P-curve, Failsafe N, Excess Significance</div>

        <div class="control">
          <label>P-Curve Analysis</label>
          <div class="inline-actions">
            <button class="secondary" id="runPCurve" title="Simonsohn et al. (2014)">P-Curve</button>
            <button class="secondary" id="exportPCurve" title="Export p-curve results">Export</button>
          </div>
          <div class="hint" id="pcurveResult">Tests for evidential value vs p-hacking</div>
        </div>

        <div class="control">
          <label>Failsafe N</label>
          <div class="inline-actions">
            <button class="secondary" id="runRosenthal" title="Rosenthal (1979)">Rosenthal</button>
            <button class="secondary" id="runOrwin" title="Orwin (1983)">Orwin</button>
            <button class="secondary" id="runRosenberg" title="Rosenberg (2005)">Rosenberg</button>
          </div>
          <div class="hint" id="failsafeResult">Null studies needed to nullify effect</div>
        </div>

        <div class="control">
          <label>Excess Significance</label>
          <div class="inline-actions">
            <button class="secondary" id="runExcessSig" title="Ioannidis & Trikalinos (2007)">Run Test</button>
          </div>
          <div class="hint" id="excessSigResult">Detects excess significant findings</div>
        </div>

        <div class="control">
          <label>Permutation Test</label>
          <div class="inline-actions">
            <input type="number" id="permutations" placeholder="5000" style="width:70px" value="5000" step="1000" min="1000" max="10000" />
            <button class="secondary" id="runPermutation" title="Non-parametric bias test">Permutation</button>
          </div>
          <div class="hint" id="permutationResult">Kendall tau permutation test</div>
        </div>
      </div>

      <div class="panel">
        <h2>Advanced Bias <span class="badge" style="background: linear-gradient(135deg, #8e44ad 0%, #9b59b6 100%);">RSM-2</span></h2>
        <div class="hint" style="margin-bottom: 16px;">Selection models, Galbraith plot, Harbord</div>

        <div class="control">
          <label>3PSM Selection Model</label>
          <div class="inline-actions">
            <button class="secondary" id="run3PSM" title="McShane et al. (2016)">Run 3PSM</button>
          </div>
          <div class="hint" id="threepsmResult">Three-parameter selection model</div>
        </div>

        <div class="control">
          <label>Radial Plot</label>
          <div class="inline-actions">
            <button class="secondary" id="runRadialPlot" title="Galbraith (1988)">Galbraith Plot</button>
            <button class="secondary" id="identifyOutliers" title="Flag outliers on plot">Outliers</button>
          </div>
          <div class="hint" id="radialResult">Standardized effect vs precision</div>
        </div>

        <div class="control">
          <label>Harbord's Test</label>
          <div class="inline-actions">
            <button class="secondary" id="runHarbord" title="Harbord et al. (2006)">Run Harbord</button>
          </div>
          <div class="hint" id="harbordResult">Modified Egger for binary outcomes</div>
        </div>
      </div>

      <div class="panel">
        <h2>Statistical Inference <span class="badge" style="background: linear-gradient(135deg, #2980b9 0%, #3498db 100%);">RSM-2</span></h2>
        <div class="hint" style="margin-bottom: 16px;">Heterogeneity CIs, finite-sample, MR diagnostics</div>

        <div class="control">
          <label>I&sup2; Confidence Interval</label>
          <div class="inline-actions">
            <button class="secondary" id="runQProfile" title="Q-profile method">Q-Profile</button>
            <button class="secondary" id="runBootstrapI2" title="Bootstrap CI">Bootstrap</button>
          </div>
          <div class="hint" id="i2ciResult">Higgins & Thompson (2002) heterogeneity CI</div>
        </div>

        <div class="control">
          <label>Finite-Sample Corrections</label>
          <div class="inline-actions">
            <button class="secondary" id="runSatterthwaite" title="Satterthwaite df">Satterthwaite</button>
            <button class="secondary" id="runKenwardRoger" title="Kenward-Roger">KR</button>
          </div>
          <div class="hint" id="finiteSampleResult">Small-sample inference adjustments</div>
        </div>

        <div class="control">
          <label>Meta-Regression QA</label>
          <div class="inline-actions">
            <button class="secondary" id="runVIF" title="Variance inflation factors">VIF</button>
            <button class="secondary" id="runMRResiduals" title="Studentized residuals">Residuals</button>
          </div>
          <div class="hint" id="mrDiagResult">Multicollinearity & outlier detection</div>
        </div>

        <div class="control">
          <label>Export</label>
          <div class="inline-actions">
            <button class="secondary" id="exportRSMv2Report" title="Full RSM v2 report">Bias Report</button>
            <button class="secondary" id="exportRSMv2Checklist" title="RSM v2 checklist">Checklist</button>
          </div>
        </div>
      </div>'''

    content = content[:insert_pos] + new_panel + content[insert_pos:]
    print('Added RSM v2 UI panels!')
else:
    print('Could not find insertion point for RSM v2 UI')
    # Try alternative - after Tier 1 panel
    pattern2 = r'(<button class="secondary" id="exportGPCurve"[^>]*>GP Curve CSV</button>\s*</div>\s*</div>\s*</div>)'
    match2 = re.search(pattern2, content)
    if match2:
        insert_pos = match2.end()
        print('Found alternative insertion point after Tier 1 panel')

# Write back
with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)

print(f'index.html updated. New size: {len(content)} chars')
