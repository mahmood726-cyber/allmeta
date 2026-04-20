import re

# Read app.js
with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add DOM references for diagnostics elements
dom_additions = '''
    diagnosticsChart: document.getElementById("diagnosticsChart"),
    diagnosticPlotSelect: document.getElementById("diagnosticPlotSelect"),'''

# Find where to add (after diagnosticsChart if exists, or before chartTabs)
if 'diagnosticsChart' not in content:
    # Find chartTabs in DOM and add before it
    pattern = r'(chartTabs: document\.getElementById\("chartTabs"\))'
    match = re.search(pattern, content)
    if match:
        content = content[:match.start()] + dom_additions.strip() + '\n    ' + content[match.start():]
        print('Added diagnostics DOM references!')
    else:
        print('Could not find chartTabs DOM reference')

# 2. Add event handler for diagnosticPlotSelect
handler_code = '''
    // Diagnostics plot select handler
    if (dom.diagnosticPlotSelect) {
      dom.diagnosticPlotSelect.addEventListener("change", () => {
        if (state.lastStats && state.lastStats.length > 0) {
          updateDiagnosticsPlot(state.lastStats);
        }
      });
    }
'''

# Find where to add (after biasPlotSelect handler)
pattern = r'(if \(dom\.biasPlotSelect\) \{[^}]+\}[^}]+\})'
match = re.search(pattern, content)
if match:
    content = content[:match.end()] + handler_code + content[match.end():]
    print('Added diagnostics event handler!')
else:
    print('Could not find biasPlotSelect handler')

# 3. Add updateDiagnosticsPlot function
diagnostics_func = '''
  // Update diagnostics plot based on selection
  function updateDiagnosticsPlot(stats) {
    if (!dom.diagnosticsChart) return;
    const ctx = dom.diagnosticsChart.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const rect = dom.diagnosticsChart.parentElement.getBoundingClientRect();
    const width = rect.width || 600;
    const height = rect.height || 400;

    dom.diagnosticsChart.width = width * dpr;
    dom.diagnosticsChart.height = height * dpr;
    dom.diagnosticsChart.style.width = width + "px";
    dom.diagnosticsChart.style.height = height + "px";
    ctx.scale(dpr, dpr);

    const plotType = dom.diagnosticPlotSelect?.value || "residual";

    if (plotType === "residual") {
      const data = prepareResidualPlotData(stats);
      drawResidualPlot(ctx, data, width, height);
    } else if (plotType === "qq") {
      const data = prepareQQPlotData(stats);
      drawQQPlot(ctx, data, width, height);
    }
  }

'''

# Find where to add (before updateCharts function)
pattern = r'(  function updateCharts\()'
match = re.search(pattern, content)
if match:
    content = content[:match.start()] + diagnostics_func + content[match.start():]
    print('Added updateDiagnosticsPlot function!')
else:
    print('Could not find updateCharts function')

# 4. Add call to updateDiagnosticsPlot in updateCharts when diagnostics tab is active
update_call = '''
    // Update diagnostics plot if tab is active
    if (activeTab === "diagnostics") {
      updateDiagnosticsPlot(stats);
      return;
    }
'''

# Find the start of updateCharts and add after activeTab detection
pattern = r'(const activeTab = dom\.chartTabs\?\.querySelector\("\[data-tab-button\]\.active"\)\?\.dataset\.tabButton;)'
match = re.search(pattern, content)
if match:
    content = content[:match.end()] + '\n' + update_call + content[match.end():]
    print('Added diagnostics call in updateCharts!')
else:
    print('Could not find activeTab in updateCharts')

# Save
with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done!')
