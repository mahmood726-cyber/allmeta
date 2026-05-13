(function () {
  const _STYLE = `[data-gloss]{text-decoration:underline dotted;cursor:help}.alm-tooltip{position:absolute;background:#0f172a;color:#f8fafc;padding:.35rem .55rem;border-radius:4px;font:12px/1.4 system-ui,sans-serif;max-width:280px;z-index:9999;pointer-events:none;opacity:0;transition:opacity .12s}.alm-tooltip.is-visible{opacity:1}`;
  let _stylesInjected = false;
  let _glossary = {};
  let _nextId = 0;

  function _ensureStyle() {
    if (_stylesInjected) return;
    const s = document.createElement('style'); s.textContent = _STYLE;
    document.head.appendChild(s);
    _stylesInjected = true;
  }
  function _attach(abbr) {
    const term = abbr.getAttribute('data-gloss');
    const entry = _glossary[term];
    const id = 'alm-tip-' + (++_nextId);
    const tip = document.createElement('span');
    tip.id = id;
    tip.className = 'alm-tooltip';
    tip.setAttribute('role', 'tooltip');
    tip.textContent = entry
      ? entry.short + (entry.long ? ' — ' + entry.long : '')
      : abbr.textContent.trim();
    document.body.appendChild(tip);
    abbr.setAttribute('aria-describedby', id);
    abbr.tabIndex = 0;
    const show = () => {
      const r = abbr.getBoundingClientRect();
      tip.style.top = (window.scrollY + r.bottom + 6) + 'px';
      tip.style.left = (window.scrollX + r.left) + 'px';
      tip.classList.add('is-visible');
    };
    const hide = () => tip.classList.remove('is-visible');
    abbr.addEventListener('mouseenter', show);
    abbr.addEventListener('mouseleave', hide);
    abbr.addEventListener('focus', show);
    abbr.addEventListener('blur', hide);
    abbr.addEventListener('click', show);
    document.addEventListener('click', (e) => { if (e.target !== abbr) hide(); });
  }
  function _scan() {
    document.querySelectorAll('abbr[data-gloss]:not([aria-describedby])').forEach(_attach);
  }

  function init(opts) {
    opts = opts || {};
    _ensureStyle();
    if (opts.glossary && typeof opts.glossary === 'object') {
      _glossary = opts.glossary; _scan();
    } else if (opts.src) {
      fetch(opts.src).then(r => r.json()).then(g => { _glossary = g; _scan(); })
        .catch(err => { console.warn('[alm.tooltips] glossary fetch failed:', err); _scan(); });
    } else {
      _scan();  // attach with textContent fallback
    }
  }
  init.rescan = function () { _scan(); };

  window.alm = window.alm || {};
  window.alm.tooltips = init;
})();
