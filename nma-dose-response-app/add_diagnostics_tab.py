import re

# Read index.html
with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the chart tabs and add Diagnostics tab
old_tabs = '''<button data-tab-button="bias" role="tab" aria-selected="false" aria-controls="biasTab">Bias/Funnel</button>'''
new_tabs = '''<button data-tab-button="bias" role="tab" aria-selected="false" aria-controls="biasTab">Bias/Funnel</button>
          <button data-tab-button="diagnostics" role="tab" aria-selected="false" aria-controls="diagnosticsTab">Diagnostics</button>'''

if old_tabs in content:
    content = content.replace(old_tabs, new_tabs)
    print('Added Diagnostics tab button!')
else:
    print('Could not find tab buttons')

# Find bias plot select dropdown and add diagnostics dropdown after it
old_select = '''<option value="funnel">Funnel plot</option>
              <option value="egger">Egger regression</option>
            </select>
          </div>
        </div>'''

new_select = '''<option value="funnel">Funnel plot</option>
              <option value="egger">Egger regression</option>
            </select>
          </div>
          <div id="diagnosticsTab" class="tab-panel" role="tabpanel" aria-labelledby="diagnosticsTab" hidden>
            <select id="diagnosticPlotSelect" class="dropdown" aria-label="Select diagnostic plot type">
              <option value="residual">Residuals vs Fitted</option>
              <option value="qq">Normal Q-Q Plot</option>
            </select>
          </div>
        </div>'''

if old_select in content:
    content = content.replace(old_select, new_select)
    print('Added Diagnostics tab panel!')
else:
    print('Could not find select dropdown, trying alternative...')
    # Try without exact whitespace
    pattern = r'(<option value="egger">Egger regression</option>\s*</select>\s*</div>\s*</div>)'
    match = re.search(pattern, content)
    if match:
        replacement = '''<option value="egger">Egger regression</option>
            </select>
          </div>
          <div id="diagnosticsTab" class="tab-panel" role="tabpanel" aria-labelledby="diagnosticsTab" hidden>
            <select id="diagnosticPlotSelect" class="dropdown" aria-label="Select diagnostic plot type">
              <option value="residual">Residuals vs Fitted</option>
              <option value="qq">Normal Q-Q Plot</option>
            </select>
          </div>
        </div>'''
        content = content[:match.start()] + replacement + content[match.end():]
        print('Added Diagnostics tab panel (alternative)!')

# Save
with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done!')
