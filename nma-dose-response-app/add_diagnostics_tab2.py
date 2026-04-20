import re

# Read index.html
with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Add Diagnostics button after Bias button
old_bias_btn = '<button class="tab-button" data-tab-button="bias" role="tab" aria-selected="false" aria-controls="biasPanel">Bias</button>'
new_bias_btn = '''<button class="tab-button" data-tab-button="bias" role="tab" aria-selected="false" aria-controls="biasPanel">Bias</button>
        <button class="tab-button" data-tab-button="diagnostics" role="tab" aria-selected="false" aria-controls="diagnosticsPanel">Diagnostics</button>'''

if old_bias_btn in content:
    content = content.replace(old_bias_btn, new_bias_btn)
    print('Added Diagnostics tab button!')
else:
    print('Could not find Bias button')

# Add Diagnostics panel after Bias panel
old_bias_panel = '''        <div class="tab-panel" data-tab="bias" id="biasPanel" role="tabpanel" aria-label="Bias assessment charts">
          <div class="control" style="margin-bottom: 12px;">
            <label for="biasPlotSelect">Bias plot</label>
            <select id="biasPlotSelect">
              <option value="funnel">Funnel plot</option>
              <option value="baujat">Baujat plot</option>
            </select>
          </div>
          <div class="canvas-wrap">
            <canvas id="biasChart" aria-label="Bias assessment visualization" role="img"></canvas>
          </div>
        </div>
      </div>
    </section>'''

new_bias_panel = '''        <div class="tab-panel" data-tab="bias" id="biasPanel" role="tabpanel" aria-label="Bias assessment charts">
          <div class="control" style="margin-bottom: 12px;">
            <label for="biasPlotSelect">Bias plot</label>
            <select id="biasPlotSelect">
              <option value="funnel">Funnel plot</option>
              <option value="baujat">Baujat plot</option>
            </select>
          </div>
          <div class="canvas-wrap">
            <canvas id="biasChart" aria-label="Bias assessment visualization" role="img"></canvas>
          </div>
        </div>
        <div class="tab-panel" data-tab="diagnostics" id="diagnosticsPanel" role="tabpanel" aria-label="Model diagnostics plots">
          <div class="control" style="margin-bottom: 12px;">
            <label for="diagnosticPlotSelect">Diagnostic plot</label>
            <select id="diagnosticPlotSelect">
              <option value="residual">Residuals vs Fitted</option>
              <option value="qq">Normal Q-Q Plot</option>
            </select>
          </div>
          <div class="canvas-wrap">
            <canvas id="diagnosticsChart" aria-label="Model diagnostics visualization" role="img"></canvas>
          </div>
        </div>
      </div>
    </section>'''

if old_bias_panel in content:
    content = content.replace(old_bias_panel, new_bias_panel)
    print('Added Diagnostics panel!')
else:
    print('Could not find Bias panel, trying flexible match...')
    # Try flexible regex
    pattern = r'(<div class="tab-panel" data-tab="bias"[^>]*>[\s\S]*?</div>\s*</div>\s*</div>\s*</section>)'
    match = re.search(pattern, content)
    if match:
        old_section = match.group(1)
        new_section = old_section.replace('</div>\n      </div>\n    </section>', '''</div>
        <div class="tab-panel" data-tab="diagnostics" id="diagnosticsPanel" role="tabpanel" aria-label="Model diagnostics plots">
          <div class="control" style="margin-bottom: 12px;">
            <label for="diagnosticPlotSelect">Diagnostic plot</label>
            <select id="diagnosticPlotSelect">
              <option value="residual">Residuals vs Fitted</option>
              <option value="qq">Normal Q-Q Plot</option>
            </select>
          </div>
          <div class="canvas-wrap">
            <canvas id="diagnosticsChart" aria-label="Model diagnostics visualization" role="img"></canvas>
          </div>
        </div>
      </div>
    </section>''')
        content = content.replace(old_section, new_section)
        print('Added Diagnostics panel (flexible)!')

# Save
with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done!')
