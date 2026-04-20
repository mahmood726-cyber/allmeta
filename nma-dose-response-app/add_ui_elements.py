import re

# Read the HTML file
with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Find and replace the bootstrap control section
old_section = '''        <div class="control">
          <label for="bootstrapIter">Bootstrap iterations</label>
          <div class="inline-actions">
            <input type="number" id="bootstrapIter" min="50" max="1000" value="200" step="10" />
            <button class="secondary" id="runBootstrap">Run bootstrap</button>
            <button class="secondary" id="clearBootstrap">Clear</button>
          </div>
          <div class="hint" id="bootstrapStatus">Bootstrap not run.</div>
        </div>
      </div>'''

new_section = '''        <div class="control">
          <label for="bootstrapIter">Bootstrap iterations</label>
          <div class="inline-actions">
            <input type="number" id="bootstrapIter" min="50" max="1000" value="200" step="10" />
            <input type="number" id="bootstrapSeed" min="1" max="999999" value="" placeholder="Seed (optional)" title="Random seed for reproducibility" style="width:120px" />
            <button class="secondary" id="runBootstrap">Run bootstrap</button>
            <button class="secondary" id="clearBootstrap">Clear</button>
          </div>
          <div class="hint" id="bootstrapStatus">Bootstrap not run. Set seed for reproducible results.</div>
        </div>
        <div class="control">
          <label>Statistical Options</label>
          <div class="inline-actions">
            <label class="toggle-label" title="Use Hartung-Knapp-Sidik-Jonkman small-sample correction">
              <input type="checkbox" id="useKnappHartung" />
              <span>Knapp-Hartung correction</span>
            </label>
            <label class="toggle-label" title="Show prediction intervals (requires tau^2 > 0)">
              <input type="checkbox" id="showPredictionInterval" />
              <span>Prediction intervals</span>
            </label>
          </div>
        </div>
        <div class="control">
          <label>Reporting &amp; Assessment</label>
          <div class="inline-actions">
            <button class="secondary" id="exportPRISMA" title="Export PRISMA-NMA checklist as markdown">PRISMA Checklist</button>
            <button class="secondary" id="runCINeMA" title="Run CINeMA certainty assessment">CINeMA Assessment</button>
            <button class="secondary" id="exportNodeSplit" title="Node-splitting inconsistency test">Node-Split</button>
          </div>
        </div>
      </div>'''

if old_section in content:
    content = content.replace(old_section, new_section)
    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Successfully added UI elements!')
else:
    print('Could not find exact match, trying flexible approach...')
    # Try regex approach
    pattern = r'(<div class="control">\s*<label for="bootstrapIter">Bootstrap iterations</label>.*?<div class="hint" id="bootstrapStatus">Bootstrap not run\.</div>\s*</div>\s*</div>)'
    match = re.search(pattern, content, re.DOTALL)
    if match:
        content = content.replace(match.group(1), new_section)
        with open('index.html', 'w', encoding='utf-8') as f:
            f.write(content)
        print('Added UI elements using regex!')
    else:
        print('Failed to find section')
