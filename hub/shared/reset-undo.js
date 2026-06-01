(function () {
  const _STYLE = `.alm-undo{display:inline-flex;gap:.5rem;font:13px/1.4 system-ui,sans-serif}.alm-undo button{padding:.3rem .6rem;border:1px solid var(--border,#cbd5e1);border-radius:6px;background:var(--panel,#fff);color:var(--ink,#15181d);cursor:pointer}.alm-undo button:disabled{opacity:.45;cursor:not-allowed}.alm-undo dialog{padding:1rem 1.2rem;border:1px solid var(--border,#cbd5e1);border-radius:8px;background:var(--panel,#fff);color:var(--ink,#15181d)}@media (prefers-color-scheme:dark){.alm-undo button{background:var(--panel,#23272c);color:var(--ink,#e7e4dc);border-color:var(--border,#3a4048)}.alm-undo dialog{background:var(--panel,#23272c);color:var(--ink,#e7e4dc);border-color:var(--border,#3a4048)}}`;
  let _stylesInjected = false;
  let _snapshotFn = null, _restoreFn = null, _capacity = 20, _stack = [], _btnUndo = null;

  function _ensureStyle() {
    if (_stylesInjected) return;
    const s = document.createElement('style'); s.textContent = _STYLE;
    document.head.appendChild(s);
    _stylesInjected = true;
  }

  function _updateUndoBtn() {
    if (_btnUndo) _btnUndo.disabled = _stack.length === 0;
  }

  function init(opts) {
    opts = opts || {};
    const target = typeof opts.target === 'string'
      ? document.querySelector(opts.target)
      : opts.target;
    if (!target) { console.warn('[alm.resetUndo] target not found'); return; }
    _snapshotFn = opts.snapshot;
    _restoreFn = opts.restore;
    _capacity = typeof opts.capacity === 'number' ? opts.capacity : 20;
    _stack = [];
    _ensureStyle();
    target.innerHTML = `
      <div class="alm-undo">
        <button type="button" data-action="undo" disabled>Undo</button>
        <button type="button" data-action="clear">Clear all</button>
        <dialog data-role="confirm-clear">
          <p>Clear all data? This cannot be undone.</p>
          <form method="dialog" style="margin-top:.6rem;display:flex;gap:.5rem;justify-content:flex-end">
            <button value="cancel">Cancel</button>
            <button value="confirm">Clear</button>
          </form>
        </dialog>
      </div>`;
    _btnUndo = target.querySelector('button[data-action="undo"]');
    const btnClear = target.querySelector('button[data-action="clear"]');
    const dlg = target.querySelector('dialog');
    _btnUndo.addEventListener('click', () => init.undo());
    btnClear.addEventListener('click', () => {
      if (typeof dlg.showModal === 'function') dlg.showModal();
      else if (confirm('Clear all data?')) init.clear();
    });
    dlg.addEventListener('close', () => {
      if (dlg.returnValue === 'confirm') init.clear();
    });
    _updateUndoBtn();
  }

  init.snapshot = function () {
    if (!_snapshotFn) return;
    _stack.push(_snapshotFn());
    while (_stack.length > _capacity) _stack.shift();
    _updateUndoBtn();
  };

  init.undo = function () {
    if (_stack.length === 0 || !_restoreFn) return;
    const snap = _stack.pop();
    _restoreFn(snap);
    _updateUndoBtn();
  };

  init.clear = function () {
    if (!_restoreFn) return;
    init.snapshot();
    _restoreFn({});  // app supplies its own empty-state shape on restore({})
  };

  init.size = function () { return _stack.length; };

  window.alm = window.alm || {};
  window.alm.resetUndo = init;
})();
