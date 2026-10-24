(function () {
  'use strict';
  // Shared method help. English is authoritative; locale files remain untouched.
  const LANGS = { en: 'English', es: 'Español', ar: 'العربية', zh: '中文' };
  const STYLE = `[data-gloss]{text-decoration:underline dotted;cursor:help;text-underline-offset:.16em}
[data-gloss]:focus-visible{outline:2px solid currentColor;outline-offset:3px;border-radius:2px}
.alm-tooltip{position:fixed;box-sizing:border-box;background:#0f172a;color:#f8fafc;border:1px solid #94a3b8;padding:.5rem .65rem;border-radius:5px;font:14px/1.45 system-ui,sans-serif;width:max-content;max-width:min(320px,calc(100vw - 16px));z-index:2147483647;visibility:hidden;pointer-events:none;overflow-wrap:anywhere}
.alm-tooltip.is-visible{visibility:visible;pointer-events:auto}
.alm-tooltip .alm-disclaimer{display:block;margin-top:.3rem;font-size:12px;color:#e2e8f0}
.alm-lang-switch{position:fixed;bottom:8px;right:8px;z-index:9998;background:#fff;color:#0f172a;border:1px solid #64748b;border-radius:6px;padding:4px}
.alm-lang-switch select{font:13px system-ui,sans-serif;background:#fff;color:#0f172a;border:0}
[data-alm-choice]{display:block;font-size:.85em;margin:.25em 0}
@media(prefers-color-scheme:dark){.alm-tooltip{background:#f8fafc;color:#0f172a;border-color:#475569}.alm-tooltip .alm-disclaimer{color:#334155}}
[data-theme=dark] .alm-tooltip{background:#f8fafc;color:#0f172a;border-color:#475569}
[data-theme=dark] .alm-tooltip .alm-disclaimer{color:#334155}`;
  let glossary = {}, english = {}, translated = {}, terms = {}, src = null, lang = 'en';
  let nextId = 0, generation = 0, observer = null, active = null, queued = false, hideTimer;
  const attached = new Map(), choices = new Map(), requests = new Map();
  const SKIP = 'script,style,textarea,input,button,a,option,select,pre,kbd,samp,[contenteditable],[aria-hidden="true"],[inert],.gloss-skip,[data-gloss-skip],.alm-tooltip,.alm-lang-switch,[data-gloss]';

  function mergeGlossaries(base, locale) {
    const merged = { ...base };
    Object.keys(locale || {}).forEach(key => {
      if (key === '_meta' || (typeof locale[key]?.short === 'string' && locale[key].short.trim())) merged[key] = locale[key];
    });
    return merged;
  }
  function buildMatcher(map) {
    const keys = Object.keys(map).filter(Boolean).sort((a, b) => b.length - a.length);
    const escaped = keys.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return new RegExp('(?<![\\p{L}\\p{N}_])(?:' + (escaped.join('|') || '(?!)') + ')(?![\\p{L}\\p{N}_])', 'gu');
  }
  function ensureUI() {
    if (!document.getElementById('alm-tooltip-style')) {
      const style = document.createElement('style'); style.id = 'alm-tooltip-style'; style.textContent = STYLE;
      document.head.append(style);
    }
    let layer = document.getElementById('alm-tip-layer');
    if (!layer) {
      layer = document.createElement('div'); layer.id = 'alm-tip-layer';
      layer.setAttribute('role', 'region'); layer.setAttribute('aria-label', 'Glossary tooltips');
      layer.style.display = 'contents'; document.body.append(layer);
    }
    return layer;
  }
  function fill(tip, el) {
    const key = el.getAttribute('data-gloss'), entry = glossary[key];
    const localized = lang !== 'en' && translated[key] && translated[key] === entry;
    tip.textContent = entry ? entry.short + (entry.long ? ' — ' + entry.long : '') : el.textContent.trim();
    tip.lang = localized ? lang : 'en'; tip.dir = localized && lang === 'ar' ? 'rtl' : 'ltr';
    if (localized && translated._meta?.disclaimer) {
      const note = document.createElement('span'); note.className = 'alm-disclaimer';
      note.textContent = translated._meta.disclaimer; tip.append(note);
    }
  }
  function hide() {
    clearTimeout(hideTimer);
    if (active) active.tip.classList.remove('is-visible');
    active = null;
  }
  function position() {
    if (!active) return;
    const r = active.el.getBoundingClientRect(), tip = active.tip;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
    tip.style.top = Math.max(8, Math.min(r.bottom + 6 + h <= window.innerHeight ? r.bottom + 6 : r.top - h - 6, window.innerHeight - h - 8)) + 'px';
  }
  function show(el, tip) {
    hide(); active = { el, tip }; tip.classList.add('is-visible'); position();
  }
  function attach(el) {
    if (attached.has(el)) return;
    const tip = document.createElement('span'); tip.id = 'alm-tip-' + (++nextId);
    tip.className = 'alm-tooltip'; tip.setAttribute('role', 'tooltip'); fill(tip, el);
    ensureUI().append(tip); attached.set(el, tip);
    const descriptions = new Set((el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
    // Restored result HTML can contain a stale ID from a prior render.
    for (const id of descriptions) if (/^alm-tip-\d+$/.test(id) && !document.getElementById(id)) descriptions.delete(id);
    descriptions.add(tip.id); el.setAttribute('aria-describedby', [...descriptions].join(' '));
    el.dataset.almTip = tip.id; el.tabIndex = 0;
    el.addEventListener('mouseenter', () => show(el, tip));
    el.addEventListener('mouseleave', () => { hideTimer = setTimeout(() => { if (document.activeElement !== el) hide(); }, 160); });
    tip.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    tip.addEventListener('mouseleave', () => { if (document.activeElement !== el) hide(); });
    el.addEventListener('focus', () => show(el, tip));
    el.addEventListener('blur', hide);
    // pointerdown precedes touch-generated focus, so a first tap always opens.
    let wasOpen = false;
    el.addEventListener('pointerdown', () => { wasOpen = active?.el === el; });
    el.addEventListener('click', e => {
      e.preventDefault(); // A help term inside a label must not toggle its input.
      if (wasOpen) hide(); else show(el, tip);
      wasOpen = false;
    });
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(el, tip); }
    });
  }
  function mark(root) {
    if (!Object.keys(terms).length) return;
    const re = buildMatcher(terms);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const p = node.parentElement;
        if (!p || !node.nodeValue.trim() || p.closest(SKIP)) return NodeFilter.FILTER_REJECT;
        // Leave code/formula blocks intact; a code-styled standalone method name
        // can itself receive help without altering its text or markup.
        if (p.closest('code')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = []; let node;
    while ((node = walker.nextNode())) nodes.push(node);
    for (const n of nodes) {
      // A selected option often spells out an acronym ("Maximum likelihood
      // (ML)"). Keep its full text, but offer only one tab stop per concept.
      // Include existing marks so rescans and split text nodes stay idempotent.
      const choice = n.parentElement.closest('[data-alm-choice]');
      const seen = new Set(choice ? Array.from(choice.querySelectorAll('[data-gloss]'), el => el.getAttribute('data-gloss')) : []);
      const text = n.nodeValue, hits = [...text.matchAll(re)].filter(m => {
        const key = terms[m[0]];
        if (!glossary[key]) return false;
        if (choice && seen.has(key)) return false;
        seen.add(key); return true;
      });
      if (!hits.length) continue;
      const frag = document.createDocumentFragment(); let offset = 0;
      for (const m of hits) {
        frag.append(document.createTextNode(text.slice(offset, m.index)));
        const svg = n.parentElement.namespaceURI === 'http://www.w3.org/2000/svg';
        const el = svg ? document.createElementNS('http://www.w3.org/2000/svg', 'tspan') : document.createElement('span');
        el.setAttribute('data-gloss', terms[m[0]]); el.textContent = m[0]; frag.append(el);
        offset = m.index + m[0].length;
      }
      frag.append(document.createTextNode(text.slice(offset))); n.replaceWith(frag);
    }
    root.querySelectorAll('code').forEach(el => {
      if (!el.closest(SKIP) && terms[el.textContent.trim()] && glossary[terms[el.textContent.trim()]]) el.setAttribute('data-gloss', terms[el.textContent.trim()]);
    });
  }
  function updateChoices() {
    document.querySelectorAll('select:not(.alm-lang-switch select)').forEach(select => {
      const text = Array.from(select.selectedOptions, o => o.textContent).join('; ');
      const hits = [...text.matchAll(buildMatcher(terms))].filter(m => glossary[terms[m[0]]]);
      let record = choices.get(select);
      if (!hits.length) { if (record) { record.node.remove(); choices.delete(select); } return; }
      if (!record || !record.node.isConnected) {
        const node = document.createElement('span'); node.setAttribute('data-alm-choice', '');
        select.after(node); record = { node, text: null }; choices.set(select, record);
      }
      if (record.text !== text) { record.node.textContent = 'Method help: ' + text; record.text = text; }
    });
    for (const [select, record] of choices) if (!select.isConnected) { record.node.remove(); choices.delete(select); }
  }
  function scan() {
    if (!document.body) return;
    // Disconnect during our own mutations to avoid scan-observer feedback loops.
    if (observer) observer.disconnect();
    updateChoices(); mark(document.body);
    for (const [el, tip] of attached) {
      if (!el.isConnected) { if (active?.el === el) hide(); tip.remove(); attached.delete(el); }
    }
    document.querySelectorAll('[data-gloss]').forEach(el => {
      // Resolve authored legacy marks using an exact, app-specific display
      // alias (for example τ²_within is not between-study variance).
      const key = terms[el.textContent.trim()];
      if (key && glossary[key] && key !== el.getAttribute('data-gloss')) {
        el.setAttribute('data-gloss', key);
        if (attached.has(el)) fill(attached.get(el), el);
      }
      attach(el);
    });
    if (observer) observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    injectSwitch();
  }
  function schedule() {
    if (queued) return; queued = true;
    queueMicrotask(() => { queued = false; scan(); });
  }
  function injectSwitch() {
    if (document.querySelector('.alm-lang-switch') || !document.querySelector('[data-gloss]')) return;
    const wrap = document.createElement('div'); wrap.className = 'alm-lang-switch';
    wrap.setAttribute('role', 'group'); wrap.setAttribute('aria-label', 'Method-help language');
    const select = document.createElement('select'); select.setAttribute('aria-label', 'Method-help language');
    for (const [code, label] of Object.entries(LANGS)) {
      const option = document.createElement('option'); option.value = code; option.textContent = label;
      option.selected = code === lang; select.append(option);
    }
    select.addEventListener('change', () => setLang(select.value)); wrap.append(select); document.body.append(wrap);
  }
  function fetchJSON(url) {
    if (!requests.has(url)) requests.set(url, fetch(url).then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status); return r.json();
    }).catch(error => { requests.delete(url); throw error; }));
    return requests.get(url);
  }
  async function load() {
    const version = ++generation, requestedLang = lang;
    try {
      const [base, locale] = await Promise.all([
        fetchJSON(src),
        requestedLang === 'en' ? Promise.resolve({}) : fetchJSON(src.replace(/glossary\.json(?=$|[?#])/, 'glossary.' + requestedLang + '.json')).catch(() => ({}))
      ]);
      if (version !== generation) return;
      english = base; translated = locale; glossary = mergeGlossaries(english, translated);
      scan(); attached.forEach((tip, el) => fill(tip, el)); position();
      if (Object.keys(terms).length) document.documentElement.setAttribute('data-alm-glossary-ready', 'true');
    } catch (error) { console.warn('[alm.tooltips] glossary fetch failed:', error); }
  }
  function setLang(value) {
    if (!LANGS[value]) return Promise.resolve();
    lang = value; try { localStorage.setItem('alm-lang', lang); } catch (_) {}
    document.documentElement.setAttribute('data-alm-lang', lang);
    const select = document.querySelector('.alm-lang-switch select'); if (select) select.value = lang;
    if (src) return load();
    translated = {}; glossary = english; attached.forEach((tip, el) => fill(tip, el)); return Promise.resolve();
  }
  function init(opts = {}) {
    ensureUI();
    if (opts.terms) terms = { ...terms, ...opts.terms };
    if (!observer) {
      try { const stored = localStorage.getItem('alm-lang'); if (LANGS[stored]) lang = stored; } catch (_) {}
      observer = new MutationObserver(schedule);
      document.addEventListener('change', schedule);
      document.addEventListener('click', e => { if (active && !active.el.contains(e.target) && !active.tip.contains(e.target)) hide(); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
      window.addEventListener('resize', position); window.addEventListener('scroll', position, true);
    }
    document.documentElement.setAttribute('data-alm-lang', lang);
    if (opts.glossary) { english = opts.glossary; translated = {}; glossary = english; scan(); return Promise.resolve(); }
    if (opts.src) src = opts.src;
    if (src) return load();
    scan(); return Promise.resolve();
  }
  init.rescan = scan; init.setLang = setLang; init.getLang = () => lang;
  init.mergeGlossaries = mergeGlossaries; init.buildMatcher = buildMatcher;
  window.alm = window.alm || {}; window.alm.tooltips = init;
})();
