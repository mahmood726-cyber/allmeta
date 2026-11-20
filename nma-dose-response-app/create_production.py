"""SUPERSEDED (2026-11-12): `npm run build` (build.js) now builds app.min.js and generates
index.prod.html and nma-studio-standalone.html from the current index.html.

This script produced an index.prod.html that drifted from index.html (an April-2026 page with
no ../shared/upper-tail.js or ../shared/ma-core.js tag), adds a Google Fonts preconnect the
offline/CSP policy removed, and its app.js -> app.min.js swap no longer matches index.html
(which loads app.js with `defer`), so it would ship the unminified script. It refuses to run.
"""
import sys

sys.exit("create_production.py is superseded: run `npm run build` in nma-dose-response-app/")

import re

# Read index.html
with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add performance meta tags
perf_meta = '''  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="theme-color" content="#0b1320" />
  <link rel="preconnect" href="https://fonts.googleapis.com" crossorigin />
  <link rel="dns-prefetch" href="https://fonts.googleapis.com" />'''

# Insert after viewport meta
content = content.replace(
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />\n' + perf_meta
)
print('Added performance meta tags')

# 2. Add CSS performance optimizations
css_perf = '''
    /* Performance optimizations */
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
      }
    }

    .panel, .control, button {
      contain: layout style;
    }

    canvas {
      will-change: contents;
      contain: strict;
    }

    .loading {
      opacity: 0.5;
      pointer-events: none;
    }
'''

# Insert before </style>
content = content.replace('</style>', css_perf + '  </style>')
print('Added CSS performance optimizations')

# 3. Change script tag to use minified version with defer
content = content.replace('<script src="app.js"></script>', '<script src="app.min.js" defer></script>')
print('Changed to minified script with defer')

# 4. Add loading indicator
loading_indicator = '''
  <div id="loadingOverlay" style="position:fixed;inset:0;background:var(--bg-1);display:flex;align-items:center;justify-content:center;z-index:9999;transition:opacity 0.3s">
    <div style="text-align:center">
      <div style="width:48px;height:48px;border:3px solid var(--accent);border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto"></div>
      <p style="margin-top:16px;color:var(--muted)">Loading NMA Studio...</p>
    </div>
  </div>
  <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
  <script>window.addEventListener('load',()=>{const o=document.getElementById('loadingOverlay');if(o){o.style.opacity='0';setTimeout(()=>o.remove(),300)}})</script>
'''

# Insert before closing body tag
content = content.replace('</body>', loading_indicator + '\n</body>')
print('Added loading indicator')

# 5. Add critical CSS inlining hint
critical_hint = '''
  <!-- Critical path optimization -->
  <style id="critical">
    .header{opacity:1}.panel{opacity:1}#dataTable{min-height:200px}
    #forestCanvas,#funnelCanvas{background:var(--panel)}
  </style>
'''

# Insert after opening head
content = content.replace('<head>', '<head>' + critical_hint)
print('Added critical CSS')

# Write production HTML
with open('index.prod.html', 'w', encoding='utf-8') as f:
    f.write(content)

print('Created index.prod.html')

# Also create a combined single-file version for offline use
with open('app.min.js', 'r', encoding='utf-8') as f:
    minified_js = f.read()

# Create standalone version with inline JS
standalone = content.replace('<script src="app.min.js" defer></script>',
    f'<script defer>\n{minified_js}\n</script>')

with open('nma-studio-standalone.html', 'w', encoding='utf-8') as f:
    f.write(standalone)

import os
standalone_size = os.path.getsize('nma-studio-standalone.html')
print(f'Created standalone HTML ({standalone_size / 1024:.1f} KB)')
