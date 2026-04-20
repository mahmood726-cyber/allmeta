import re

# Read app.js
with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

changes = 0

# 1. Wrap updateAnalysis calls with debouncing
# Find event handlers that call updateAnalysis and wrap them

# Add debounced version after the performance module
debounced_funcs = '''

  // Debounced update functions for better performance
  const debouncedUpdateAnalysis = debounce(async () => {
    await updateAnalysis();
  }, 200);

  const throttledRenderPlots = throttle(() => {
    if (state.lastStats?.length) {
      renderForestPlot(state.lastStats);
      renderFunnelPlot(state.lastStats);
    }
  }, 100);

  const rafUpdateUI = rafDebounce(() => {
    if (state.lastStats?.length) {
      updateResultsDisplay(state.lastStats);
    }
  });

'''

# Insert after FastStats definition
pattern = r"(const FastStats = \{[\s\S]*?\n  \};)"
match = re.search(pattern, content)
if match:
    content = content[:match.end()] + debounced_funcs + content[match.end():]
    print('Added debounced functions!')
    changes += 1

# 2. Optimize renderForestPlot with document fragments
old_forest = '''function renderForestPlot(stats, options = {}) {
    // Performance: use plot cache
    const plotKey = 'forest:' + JSON.stringify(stats.slice(0, 2));
    const cached = plotCache.get(plotKey);
    if (cached && !options.force) {
      dom.forestCanvas.getContext('2d').putImageData(cached, 0, 0);
      return;
    }'''

new_forest = '''function renderForestPlot(stats, options = {}) {
    // Performance: use plot cache and offscreen rendering
    const plotKey = 'forest:' + JSON.stringify(stats.slice(0, 2));
    const cached = plotCache.get(plotKey);
    if (cached && !options.force) {
      try {
        dom.forestCanvas.getContext('2d').putImageData(cached, 0, 0);
        return;
      } catch (e) { /* cache miss, continue */ }
    }

    // Use offscreen canvas for smoother rendering
    const offscreen = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(dom.forestCanvas.width, dom.forestCanvas.height)
      : document.createElement('canvas');
    if (!(offscreen instanceof OffscreenCanvas)) {
      offscreen.width = dom.forestCanvas.width;
      offscreen.height = dom.forestCanvas.height;
    }
    const offCtx = offscreen.getContext('2d');'''

if old_forest in content:
    content = content.replace(old_forest, new_forest)
    print('Optimized forest plot with offscreen canvas!')
    changes += 1

# 3. Add requestIdleCallback for non-critical updates
idle_callback_wrapper = '''
  // Use requestIdleCallback for non-critical updates
  const scheduleIdleTask = (callback, timeout = 1000) => {
    if ('requestIdleCallback' in window) {
      return requestIdleCallback(callback, { timeout });
    }
    return setTimeout(callback, 1);
  };

  // Batch state updates
  const stateUpdater = {
    pending: {},
    scheduled: false,
    update(key, value) {
      this.pending[key] = value;
      if (!this.scheduled) {
        this.scheduled = true;
        queueMicrotask(() => {
          Object.assign(state, this.pending);
          this.pending = {};
          this.scheduled = false;
        });
      }
    }
  };

'''

# Insert after debounced functions
if 'const debouncedUpdateAnalysis' in content:
    pattern2 = r"(const rafUpdateUI = rafDebounce\(\(\) => \{[\s\S]*?\n  \}\);)"
    match2 = re.search(pattern2, content)
    if match2:
        content = content[:match2.end()] + idle_callback_wrapper + content[match2.end():]
        print('Added idle callback and state batching!')
        changes += 1

# 4. Optimize canvas operations with willReadFrequently hint
old_canvas = "const ctx = dom.forestCanvas.getContext('2d');"
new_canvas = "const ctx = dom.forestCanvas.getContext('2d', { willReadFrequently: true });"
if old_canvas in content:
    content = content.replace(old_canvas, new_canvas, 1)
    print('Optimized canvas context!')
    changes += 1

# 5. Add virtual scrolling hint for large study lists
virtual_scroll = '''
  // Virtual scrolling for large study lists
  function setupVirtualScroll(container, items, renderItem, itemHeight = 30) {
    const viewport = container.clientHeight;
    const buffer = 5;
    let scrollTop = 0;

    const content = document.createElement('div');
    content.style.height = items.length * itemHeight + 'px';
    content.style.position = 'relative';
    container.appendChild(content);

    const render = () => {
      scrollTop = container.scrollTop;
      const start = Math.max(0, Math.floor(scrollTop / itemHeight) - buffer);
      const end = Math.min(items.length, Math.ceil((scrollTop + viewport) / itemHeight) + buffer);

      content.innerHTML = '';
      const fragment = document.createDocumentFragment();
      for (let i = start; i < end; i++) {
        const el = renderItem(items[i], i);
        el.style.position = 'absolute';
        el.style.top = i * itemHeight + 'px';
        fragment.appendChild(el);
      }
      content.appendChild(fragment);
    };

    container.addEventListener('scroll', throttle(render, 16));
    render();
    return { update: render };
  }

'''

# Insert after idle callback
if 'scheduleIdleTask' in content:
    pattern3 = r"(this\.scheduled = false;\n      \}\);\n    \}\n  \};)"
    match3 = re.search(pattern3, content)
    if match3:
        content = content[:match3.end()] + virtual_scroll + content[match3.end():]
        print('Added virtual scrolling!')
        changes += 1

# 6. Optimize number formatting (avoid repeated Intl.NumberFormat creation)
number_format = '''
  // Cached number formatters for performance
  const numFmt = {
    int: new Intl.NumberFormat('en', { maximumFractionDigits: 0 }),
    dec2: new Intl.NumberFormat('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    dec3: new Intl.NumberFormat('en', { minimumFractionDigits: 3, maximumFractionDigits: 3 }),
    dec4: new Intl.NumberFormat('en', { minimumFractionDigits: 4, maximumFractionDigits: 4 }),
    pct: new Intl.NumberFormat('en', { style: 'percent', minimumFractionDigits: 1 }),
    formatEffect: (n) => n == null || isNaN(n) ? 'NA' : numFmt.dec3.format(n),
    formatSE: (n) => n == null || isNaN(n) ? 'NA' : numFmt.dec4.format(n),
    formatPct: (n) => n == null || isNaN(n) ? 'NA' : (n * 100).toFixed(1) + '%',
    formatP: (n) => n == null || isNaN(n) ? 'NA' : n < 0.001 ? '<0.001' : numFmt.dec3.format(n)
  };

'''

# Insert at the beginning of the performance section
if 'class LRUCache' in content and 'const numFmt' not in content:
    pattern4 = r"(class LRUCache \{)"
    match4 = re.search(pattern4, content)
    if match4:
        content = content[:match4.start()] + number_format + content[match4.start():]
        print('Added cached number formatters!')
        changes += 1

# Write back
with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print(f'Applied {changes} optimizations. app.js size: {len(content)} chars')
