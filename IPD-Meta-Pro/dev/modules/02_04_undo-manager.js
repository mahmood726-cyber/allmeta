// Diff-based undo: stores only JSON-patch diffs instead of full deep-clones.

// This prevents memory explosion on large datasets (100K+ rows x 50 undo states).

const UndoManager = {

    history: [],       // Array of { action, timestamp, patch (forward diff), inversePatch (reverse diff) }

    future: [],

    maxHistory: 50,

    isRecording: true,

    _baseline: null,   // The full snapshot at position 0

    _current: null,    // Cached current state (avoids recomputing from patches)



    // Minimal JSON-patch diff engine (RFC 6902 subset: replace, add, remove)

    _diff: function(oldObj, newObj, path) {

        if (path === undefined) path = '';

        var patches = [];

        if (oldObj === newObj) return patches;

        if (oldObj === null || oldObj === undefined || newObj === null || newObj === undefined ||

            typeof oldObj !== typeof newObj || typeof oldObj !== 'object') {

            patches.push({ op: 'replace', path: path, value: newObj, old: oldObj });

            return patches;

        }

        if (Array.isArray(oldObj) && Array.isArray(newObj)) {

            // For large arrays (data rows), use length-aware diff

            if (oldObj.length !== newObj.length || oldObj.length > 500) {

                // Wholesale replace for large or resized arrays — still cheaper than full clone

                patches.push({ op: 'replace', path: path, value: newObj, old: oldObj });

                return patches;

            }

            for (var i = 0; i < Math.max(oldObj.length, newObj.length); i++) {

                var sub = this._diff(oldObj[i], newObj[i], path + '/' + i);

                patches = patches.concat(sub);

            }

            return patches;

        }

        // Object diff

        var allKeys = new Set(Object.keys(oldObj).concat(Object.keys(newObj)));

        allKeys.forEach(function(key) {

            var childPath = path + '/' + key.replace(/~/g, '~0').replace(/\//g, '~1');

            if (!(key in oldObj)) {

                patches.push({ op: 'add', path: childPath, value: newObj[key] });

            } else if (!(key in newObj)) {

                patches.push({ op: 'remove', path: childPath, old: oldObj[key] });

            } else {

                var sub = UndoManager._diff(oldObj[key], newObj[key], childPath);

                patches = patches.concat(sub);

            }

        });

        return patches;

    },



    _applyPatches: function(obj, patches) {

        var result = JSON.parse(JSON.stringify(obj));

        patches.forEach(function(p) {

            var parts = p.path.split('/').filter(Boolean).map(function(s) {

                return s.replace(/~1/g, '/').replace(/~0/g, '~');

            });

            if (parts.length === 0) {

                // Root-level replace

                result = typeof p.value === 'object' && p.value !== null ? JSON.parse(JSON.stringify(p.value)) : p.value;

                return;

            }

            var target = result;

            for (var i = 0; i < parts.length - 1; i++) {

                if (target === null || target === undefined) return;

                target = target[parts[i]];

            }

            var last = parts[parts.length - 1];

            if (target === null || target === undefined) return;

            if (p.op === 'remove') {

                if (Array.isArray(target)) {

                    var idx = parseInt(last, 10);

                    if (!isNaN(idx) && idx >= 0 && idx < target.length) target.splice(idx, 1);

                }

                else delete target[last];

            } else {

                target[last] = typeof p.value === 'object' && p.value !== null ? JSON.parse(JSON.stringify(p.value)) : p.value;

            }

        });

        return result;

    },



    _invertPatches: function(patches) {

        return patches.slice().reverse().map(function(p) {

            if (p.op === 'replace') return { op: 'replace', path: p.path, value: p.old, old: p.value };

            if (p.op === 'add') return { op: 'remove', path: p.path, old: p.value };

            if (p.op === 'remove') return { op: 'add', path: p.path, value: p.old };

            return p;

        });

    },



    _snapshot: function() {

        return {

            data: APP.data ? JSON.parse(JSON.stringify(APP.data)) : null,

            config: JSON.parse(JSON.stringify(APP.config)),

            results: APP.results ? JSON.parse(JSON.stringify(APP.results)) : null

        };

    },



    // Save current state as a diff from previous

    saveState: function(action) {

        if (action === undefined) action = 'edit';

        if (!this.isRecording) return;



        var now = this._snapshot();



        if (!this._baseline) {

            // First save — store full baseline

            this._baseline = now;

            this._current = now;

            this.history.push({ action: action, timestamp: Date.now(), patch: null, inversePatch: null });

        } else {

            var patch = this._diff(this._current, now, '');

            if (patch.length === 0) return; // No changes

            var inversePatch = this._invertPatches(patch);

            this.history.push({ action: action, timestamp: Date.now(), patch: patch, inversePatch: inversePatch });

            this._current = now;

        }



        this.future = [];



        if (this.history.length > this.maxHistory) {

            // Rebase: apply oldest patch to baseline and discard it

            var oldest = this.history.shift();

            if (oldest.patch) {

                this._baseline = this._applyPatches(this._baseline, oldest.patch);

            }

        }



        this.updateButtons();

        SessionManager.markUnsaved();

    },



    // Undo last action

    undo: function() {

        if (this.history.length <= 1) return;



        var current = this.history.pop();

        this.future.push(current);



        if (current.inversePatch) {

            this._current = this._applyPatches(this._current, current.inversePatch);

        }

        this._restoreFromCurrent();



        this.updateButtons();

        showNotification('Undo: ' + (current.action || 'action'), 'info');

    },



    // Redo last undone action

    redo: function() {

        if (this.future.length === 0) return;



        var next = this.future.pop();

        this.history.push(next);



        if (next.patch) {

            this._current = this._applyPatches(this._current, next.patch);

        }

        this._restoreFromCurrent();



        this.updateButtons();

        showNotification('Redo: ' + (next.action || 'action'), 'info');

    },



    // Restore APP state from _current cache

    _restoreFromCurrent: function() {

        this.isRecording = false;



        APP.data = this._current.data ? JSON.parse(JSON.stringify(this._current.data)) : null;

        APP.config = JSON.parse(JSON.stringify(this._current.config));

        APP.results = normalizeResultsSchema(this._current.results ? JSON.parse(JSON.stringify(this._current.results)) : null);



        if (APP.data) {

            updateDataPreview();

            updateCovariatePanel();

        }

        if (APP.results) {

            displayResults(APP.results);

        }



        this.isRecording = true;

    },



    // Legacy alias

    restoreState: function(state) {

        this._restoreFromCurrent();

    },



    // Update undo/redo button states

    updateButtons: function() {

        var undoBtn = document.getElementById('undoBtn');

        var redoBtn = document.getElementById('redoBtn');



        if (undoBtn) undoBtn.disabled = this.history.length <= 1;

        if (redoBtn) redoBtn.disabled = this.future.length === 0;

    },



    // Clear history

    clear: function() {

        this.history = [];

        this.future = [];

        this._baseline = null;

        this._current = null;

        this.saveState('initial');

        this.updateButtons();

    }

};



// =============================================================================

// SESSION MANAGER - Save/Load Analysis Sessions

// =============================================================================

const SessionManager = {

    storageKey: 'ipdMetaProSession',

    autoSaveInterval: 60000, // 1 minute

    autoSaveTimer: null,

    hasUnsavedChanges: false,



    // Initialize session manager

    init: function() {

        // Show one-time patient data privacy warning

        if (!localStorage.getItem('ipdMetaPro_privacyAcknowledged')) {

            this.showPrivacyWarning();

        }



        // Check for existing session

        const saved = localStorage.getItem(this.storageKey);

        if (saved) {

            this.showRecoveryPrompt();

        }



        // Setup autosave

        this.autoSaveTimer = setInterval(() => this.autoSave(), this.autoSaveInterval);



        // Warn before leaving with unsaved changes

        window.addEventListener('beforeunload', (e) => {

            if (this.hasUnsavedChanges) {

                e.preventDefault();

                e.returnValue = '';

            }

        });



        this.updateIndicator('ready');

    },



    // Show privacy warning about localStorage

    showPrivacyWarning: function() {

        var banner = document.createElement('div');

        banner.id = 'privacyBanner';

        banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:10000;background:linear-gradient(135deg,#f59e0b,#d97706);color:#000;padding:1rem 1.5rem;font-size:0.9rem;display:flex;align-items:center;justify-content:space-between;box-shadow:0 4px 12px rgba(0,0,0,0.3);';

        banner.innerHTML = '<div style="flex:1;"><strong>Privacy Notice:</strong> Session auto-save stores data (including any loaded patient data) in your browser\'s localStorage in <em>unencrypted</em> form. ' +

            'For sensitive/identifiable patient data, consider disabling auto-save or clearing your session after use. ' +

            'All processing is client-side — no data is transmitted to any server.</div>' +

            '<button id="privacyAckBtn" style="margin-left:1rem;padding:0.5rem 1rem;border:2px solid #000;border-radius:6px;background:transparent;color:#000;font-weight:700;cursor:pointer;white-space:nowrap;">I Understand</button>';

        document.body.prepend(banner);

        document.getElementById('privacyAckBtn').addEventListener('click', function() {

            localStorage.setItem('ipdMetaPro_privacyAcknowledged', 'true');

            banner.remove();

        });

    },



    // Save session to localStorage

    saveSession: function() {

        const session = {

            version: '1.0',

            savedAt: new Date().toISOString(),

            data: APP.data,

            config: APP.config,

            results: APP.results,

            bayesianResults: APP.bayesianResults,

            variables: APP.variables,

            aggregateData: window.aggregateData || null

        };



        try {

            localStorage.setItem(this.storageKey, JSON.stringify(session));

            this.hasUnsavedChanges = false;

            this.updateIndicator('saved');

            showNotification('Session saved successfully', 'success');

        } catch (e) {

            if (e.name === 'QuotaExceededError') {

                showNotification('Storage full. Export session to file instead.', 'warning');

            } else {

                showNotification('Failed to save session', 'error');

            }

        }

    },



    // Load session from localStorage

    loadSession: function() {

        const saved = localStorage.getItem(this.storageKey);

        if (!saved) {

            showNotification('No saved session found', 'warning');

            return;

        }



        try {

            const session = JSON.parse(saved);

            this.applySession(session);

            showNotification('Session loaded from ' + new Date(session.savedAt).toLocaleString(), 'success');

        } catch (e) {

            showNotification('Failed to load session', 'error');

        }

    },



    // Auto-save session

    autoSave: function() {

        if (APP.data || APP.results) {

            const session = {

                version: '1.0',

                savedAt: new Date().toISOString(),

                data: APP.data,

                config: APP.config,

                results: APP.results

            };

            try {

                localStorage.setItem(this.storageKey + '_autosave', JSON.stringify(session));

            } catch (e) {

                console.warn('Auto-save failed:', e);

            }

        }

    },



    // Export session to file

    exportSession: function() {

        const session = {

            version: '1.0',

            exportedAt: new Date().toISOString(),

            application: 'IPD Meta-Analysis Pro',

            data: APP.data,

            config: APP.config,

            results: APP.results,

            bayesianResults: APP.bayesianResults,

            variables: APP.variables

        };



        const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });

        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');

        a.href = url;

        a.download = 'ipd-meta-session-' + new Date().toISOString().slice(0,10) + '.json';

        a.click();

        URL.revokeObjectURL(url);

        showNotification('Session exported', 'success');

    },



    // Import session from file

    importSession: function() {

        const input = document.createElement('input');

        input.type = 'file';

        input.accept = '.json';

        input.onchange = (e) => {

            const file = e.target.files[0];

            if (!file) return;



            const reader = new FileReader();

            reader.onload = (ev) => {

                try {

                    const session = JSON.parse(ev.target.result);

                    if (session.application !== 'IPD Meta-Analysis Pro') {

                        showNotification('Invalid session file', 'error');

                        return;

                    }

                    this.applySession(session);

                    showNotification('Session imported successfully', 'success');

                } catch (e) {

                    showNotification('Failed to import session', 'error');

                }

            };

            reader.readAsText(file);

        };

        input.click();

    },



    // Apply session data

    applySession: function(session) {

        UndoManager.isRecording = false;



        APP.data = session.data;

        APP.config = session.config || APP.config;

        APP.results = normalizeResultsSchema(session.results);

        APP.bayesianResults = session.bayesianResults;

        APP.variables = session.variables || [];



        // Update UI

        if (APP.data) {

            document.getElementById('dataPreviewCard').style.display = 'block';

            document.getElementById('analysisSettingsCard').style.display = 'block';

            updateDataPreview();

            updateCovariatePanel();

        }



        if (APP.results) {

            displayResults(APP.results);

            switchPanel('results');

        }



        UndoManager.isRecording = true;

        UndoManager.clear();

        this.hasUnsavedChanges = false;

        this.updateIndicator('loaded');

    },



    // Show recovery prompt

    showRecoveryPrompt: function() {

        const saved = localStorage.getItem(this.storageKey);

        if (!saved) return;



        const session = JSON.parse(saved);

        const savedAt = new Date(session.savedAt).toLocaleString();



        if (confirm('Found saved session from ' + savedAt + '. Restore?')) {

            this.applySession(session);

        }

    },



    // Mark as having unsaved changes

    markUnsaved: function() {

        this.hasUnsavedChanges = true;

        this.updateIndicator('unsaved');

    },



    // Update session indicator

    updateIndicator: function(status) {

        const indicator = document.getElementById('sessionIndicator');

        const statusEl = document.getElementById('sessionStatus');

        const labelEl = document.getElementById('sessionLabel');



        if (!indicator) return;



        indicator.classList.remove('saved', 'unsaved');



        switch(status) {

            case 'saved':

                indicator.classList.add('saved');

                statusEl.textContent = '●';

                labelEl.textContent = 'Saved';

                break;

            case 'unsaved':

                indicator.classList.add('unsaved');

                statusEl.textContent = '○';

                labelEl.textContent = 'Unsaved';

                break;

            case 'loaded':

                indicator.classList.add('saved');

                statusEl.textContent = '●';

                labelEl.textContent = 'Loaded';

                break;

            default:

                statusEl.textContent = '●';

                labelEl.textContent = 'Ready';

        }

    }

};



// =============================================================================

// HELP SYSTEM - In-App Documentation & Tutorials

// =============================================================================

