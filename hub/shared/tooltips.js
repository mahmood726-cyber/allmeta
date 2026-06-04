(function () {
  // Method-help glossary tooltips, with optional multi-language support.
  // Non-English glossaries are machine-translated and carry a per-language
  // _meta.disclaimer that is appended to every tip; English stays authoritative.
  const _STYLE = `[data-gloss]{text-decoration:underline dotted;cursor:help}.alm-tooltip{position:absolute;background:#0f172a;color:#f8fafc;padding:.35rem .55rem;border-radius:4px;font:12px/1.4 system-ui,sans-serif;max-width:280px;z-index:9999;pointer-events:none;opacity:0;transition:opacity .12s}.alm-tooltip.is-visible{opacity:1}.alm-tooltip[dir=rtl]{text-align:right}.alm-tooltip .alm-disclaimer{display:block;margin-top:.25rem;font-size:11px;color:#cbd5e1;font-style:italic}.alm-lang-switch{position:fixed;bottom:8px;right:8px;z-index:9998;background:#fff;border:1px solid #cbd5e1;border-radius:6px;padding:1px 3px;opacity:.7;transition:opacity .12s}.alm-lang-switch:hover,.alm-lang-switch:focus-within{opacity:1}.alm-lang-switch select{font:12px system-ui,sans-serif;border:0;background:transparent;color:#0f172a;cursor:pointer}`;
  const _LANGS = { en: 'English', es: 'Español', ar: 'العربية', zh: '中文' };
  let _stylesInjected = false;
  let _glossary = {};
  let _baseSrc = null;     // original 'glossary.json' src, if init was given one
  let _lang = 'en';
  let _nextId = 0;
  let _tipLayer = null;

  function _storedLang() {
    try { const l = localStorage.getItem('alm-lang'); return _LANGS[l] ? l : 'en'; }
    catch (e) { return 'en'; }
  }
  function _persistLang(l) { try { localStorage.setItem('alm-lang', l); } catch (e) {} }

  // 'a/b/glossary.json' + 'es' -> 'a/b/glossary.es.json'. English keeps the base.
  function _variantSrc(src, lang) {
    if (!src || lang === 'en') return src;
    return src.replace(/glossary\.json/, 'glossary.' + lang + '.json');
  }

  function _disclaimer() {
    return _lang !== 'en' && _glossary._meta && _glossary._meta.disclaimer
      ? _glossary._meta.disclaimer : null;
  }

  function _ensureStyle() {
    if (_stylesInjected) return;
    const s = document.createElement('style'); s.textContent = _STYLE;
    document.head.appendChild(s);
    _stylesInjected = true;
  }
  // Tooltip spans must live inside a landmark or axe `region` (best-practice)
  // flags every one. Single named region container, display:contents so no
  // layout box is generated — absolutely-positioned tips keep the initial
  // containing block exactly as when they were direct <body> children.
  function _ensureLayer() {
    if (_tipLayer && _tipLayer.isConnected) return _tipLayer;
    _tipLayer = document.getElementById('alm-tip-layer');
    if (!_tipLayer) {
      _tipLayer = document.createElement('div');
      _tipLayer.id = 'alm-tip-layer';
      _tipLayer.setAttribute('role', 'region');
      _tipLayer.setAttribute('aria-label', 'Glossary tooltips');
      _tipLayer.style.display = 'contents';
      document.body.appendChild(_tipLayer);
    }
    return _tipLayer;
  }

  // Render a tip's content for the current language: definition text plus,
  // for machine-translated languages, a de-emphasised disclaimer line.
  function _fillTip(tip, abbr) {
    const term = abbr.getAttribute('data-gloss');
    const entry = _glossary[term];
    const body = entry ? entry.short + (entry.long ? ' — ' + entry.long : '')
                       : abbr.textContent.trim();
    tip.textContent = body;
    const disc = _disclaimer();
    if (disc) {
      const d = document.createElement('span');
      d.className = 'alm-disclaimer';
      d.textContent = disc;
      tip.appendChild(d);
    }
    tip.setAttribute('dir', _lang === 'ar' ? 'rtl' : 'ltr');
  }

  function _attach(abbr) {
    const id = 'alm-tip-' + (++_nextId);
    const tip = document.createElement('span');
    tip.id = id;
    tip.className = 'alm-tooltip';
    tip.setAttribute('role', 'tooltip');
    _fillTip(tip, abbr);
    _ensureLayer().appendChild(tip);
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

  // Re-render the text of already-attached tips (used after a language switch).
  function _refresh() {
    document.querySelectorAll('abbr[data-gloss][aria-describedby]').forEach((abbr) => {
      const tip = document.getElementById(abbr.getAttribute('aria-describedby'));
      if (tip) _fillTip(tip, abbr);
    });
  }

  function _loadAndRefresh(baseSrc, lang) {
    const url = _variantSrc(baseSrc, lang);
    if (!url) { _scan(); _refresh(); return Promise.resolve(); }
    return fetch(url)
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((g) => { _glossary = g; _scan(); _refresh(); })
      .catch((err) => {
        // A missing translation falls back to the authoritative English file.
        if (lang !== 'en' && baseSrc) {
          return fetch(baseSrc).then((r) => r.json())
            .then((g) => { _glossary = g; _scan(); _refresh(); })
            .catch((e2) => { console.warn('[alm.tooltips] glossary fetch failed:', e2); _scan(); });
        }
        console.warn('[alm.tooltips] glossary fetch failed:', err); _scan();
      });
  }

  function _injectSwitch() {
    if (document.querySelector('.alm-lang-switch')) return;        // idempotent
    if (!document.querySelector('abbr[data-gloss]')) return;       // only where method help exists
    const wrap = document.createElement('div');
    wrap.className = 'alm-lang-switch';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', 'Method-help language');
    const sel = document.createElement('select');
    sel.setAttribute('aria-label', 'Method-help language');
    Object.keys(_LANGS).forEach((code) => {
      const o = document.createElement('option');
      o.value = code; o.textContent = _LANGS[code];
      if (code === _lang) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => setLang(sel.value));
    wrap.appendChild(sel);
    document.body.appendChild(wrap);
  }

  function setLang(lang) {
    if (!_LANGS[lang] || lang === _lang) return Promise.resolve();
    _lang = lang;
    _persistLang(lang);
    document.documentElement.setAttribute('data-alm-lang', lang);
    const sel = document.querySelector('.alm-lang-switch select');
    if (sel && sel.value !== lang) sel.value = lang;
    if (_baseSrc) return _loadAndRefresh(_baseSrc, lang);
    // No src (glossary passed as an object) — can't fetch a variant; just re-render.
    _refresh();
    return Promise.resolve();
  }

  function init(opts) {
    opts = opts || {};
    _ensureStyle();
    _lang = _storedLang();
    document.documentElement.setAttribute('data-alm-lang', _lang);
    if (opts.glossary && typeof opts.glossary === 'object') {
      _glossary = opts.glossary; _scan(); _injectSwitch();
    } else if (opts.src) {
      _baseSrc = opts.src;
      _injectSwitch();                 // terms are authored in HTML, present before fetch resolves
      _loadAndRefresh(_baseSrc, _lang);
    } else {
      _scan(); _injectSwitch();        // textContent fallback
    }
  }
  init.rescan = function () { _scan(); };
  init.setLang = setLang;
  init.getLang = function () { return _lang; };

  window.alm = window.alm || {};
  window.alm.tooltips = init;
})();
