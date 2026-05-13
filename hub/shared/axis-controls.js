(function () {
  const _STYLE = `.alm-axis{display:grid;gap:.5rem;font:13px/1.4 system-ui,sans-serif}.alm-axis-row{display:grid;grid-template-columns:auto auto 1fr auto 1fr auto;gap:.4rem;align-items:center}.alm-axis input[type=number]{width:6rem;padding:.25rem .4rem;border:1px solid #cbd5e1;border-radius:4px;font:inherit}.alm-axis label{font-weight:600}.alm-axis [data-error]{color:#b91c1c;font-size:12px;grid-column:1/-1;min-height:1.2em}`;
  let _stylesInjected = false;

  function _ensureStyle() {
    if (_stylesInjected) return;
    const s = document.createElement('style'); s.textContent = _STYLE;
    document.head.appendChild(s);
    _stylesInjected = true;
  }

  function init(opts) {
    opts = opts || {};
    const target = typeof opts.target === 'string' ? document.querySelector(opts.target) : opts.target;
    if (!target) { console.warn('[alm.axisControls] target not found'); return; }
    const axes = (opts.axes || []).map(a => ({ ...a, range: a.range ? a.range.slice() : [null, null], log: !!a.log }));
    const onChange = typeof opts.onChange === 'function' ? opts.onChange : () => {};
    _ensureStyle();

    target.innerHTML = '<div class="alm-axis"></div>';
    const root = target.firstChild;
    const errEl = document.createElement('div'); errEl.setAttribute('data-error', '');

    function fmtState() {
      const state = { ticks: opts.ticks || 'auto' };
      for (const a of axes) {
        state[a.key] = a.range.slice();
        state[a.key + 'Log'] = !!a.log;
      }
      return state;
    }
    function validateAndEmit() {
      errEl.textContent = '';
      for (const a of axes) {
        if (a.range[0] != null && a.range[1] != null && a.range[0] >= a.range[1]) {
          errEl.textContent = a.label + ' min must be < max';
          return;
        }
      }
      onChange(fmtState());
    }
    for (const a of axes) {
      const row = document.createElement('div'); row.className = 'alm-axis-row';
      row.innerHTML = `
        <label>${a.label}</label>
        <span>min</span>
        <input type="number" data-axis="${a.key}" data-edge="min" value="${a.range[0] ?? ''}">
        <span>max</span>
        <input type="number" data-axis="${a.key}" data-edge="max" value="${a.range[1] ?? ''}">
        <label style="font-weight:400"><input type="checkbox" data-axis="${a.key}" data-edge="log" ${a.log ? 'checked' : ''}> log</label>`;
      row.querySelectorAll('input').forEach(inp => {
        inp.addEventListener('change', () => {
          if (inp.dataset.edge === 'min' || inp.dataset.edge === 'max') {
            const v = inp.value === '' ? null : Number(inp.value);
            const idx = inp.dataset.edge === 'min' ? 0 : 1;
            a.range[idx] = v;
          } else if (inp.dataset.edge === 'log') {
            a.log = inp.checked;
          }
          validateAndEmit();
        });
      });
      root.appendChild(row);
    }
    root.appendChild(errEl);
  }

  window.alm = window.alm || {};
  window.alm.axisControls = init;
})();
