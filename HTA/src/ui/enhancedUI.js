/**
 * HTA Artifact Standard - Enhanced UI Module
 * Dark mode, keyboard shortcuts, undo/redo, progress bars, auto-save, i18n
 * @version 0.6.0
 */

'use strict';

// ============================================================================
// SECTION 1: THEME MANAGER (Dark Mode)
// ============================================================================

class ThemeManager {
    constructor() {
        this.currentTheme = 'light';
        this.themes = {
            light: {
                '--primary': '#2563eb',
                '--primary-dark': '#1d4ed8',
                '--primary-light': '#3b82f6',
                '--success': '#16a34a',
                '--success-light': '#22c55e',
                '--warning': '#d97706',
                '--warning-light': '#f59e0b',
                '--error': '#dc2626',
                '--error-light': '#ef4444',
                '--bg': '#f8fafc',
                '--bg-secondary': '#f1f5f9',
                '--card-bg': '#ffffff',
                '--text': '#1e293b',
                '--text-secondary': '#475569',
                '--text-muted': '#64748b',
                '--border': '#e2e8f0',
                '--border-focus': '#3b82f6',
                '--shadow': '0 1px 3px rgba(0,0,0,0.1)',
                '--shadow-lg': '0 10px 15px -3px rgba(0,0,0,0.1)',
                '--code-bg': '#f1f5f9',
                '--selection': 'rgba(37, 99, 235, 0.2)',
                '--scrollbar': '#cbd5e1',
                '--scrollbar-hover': '#94a3b8'
            },
            dark: {
                '--primary': '#3b82f6',
                '--primary-dark': '#2563eb',
                '--primary-light': '#60a5fa',
                '--success': '#22c55e',
                '--success-light': '#4ade80',
                '--warning': '#f59e0b',
                '--warning-light': '#fbbf24',
                '--error': '#ef4444',
                '--error-light': '#f87171',
                '--bg': '#0f172a',
                '--bg-secondary': '#1e293b',
                '--card-bg': '#1e293b',
                '--text': '#f1f5f9',
                '--text-secondary': '#cbd5e1',
                '--text-muted': '#94a3b8',
                '--border': '#334155',
                '--border-focus': '#60a5fa',
                '--shadow': '0 1px 3px rgba(0,0,0,0.3)',
                '--shadow-lg': '0 10px 15px -3px rgba(0,0,0,0.4)',
                '--code-bg': '#0f172a',
                '--selection': 'rgba(59, 130, 246, 0.3)',
                '--scrollbar': '#475569',
                '--scrollbar-hover': '#64748b'
            },
            highContrast: {
                '--primary': '#0066ff',
                '--primary-dark': '#0052cc',
                '--primary-light': '#3385ff',
                '--success': '#00aa00',
                '--success-light': '#00cc00',
                '--warning': '#cc8800',
                '--warning-light': '#ffaa00',
                '--error': '#cc0000',
                '--error-light': '#ff0000',
                '--bg': '#000000',
                '--bg-secondary': '#1a1a1a',
                '--card-bg': '#1a1a1a',
                '--text': '#ffffff',
                '--text-secondary': '#e6e6e6',
                '--text-muted': '#cccccc',
                '--border': '#666666',
                '--border-focus': '#3385ff',
                '--shadow': '0 0 0 2px #666666',
                '--shadow-lg': '0 0 0 3px #666666',
                '--code-bg': '#1a1a1a',
                '--selection': 'rgba(0, 102, 255, 0.5)',
                '--scrollbar': '#666666',
                '--scrollbar-hover': '#888888'
            }
        };

        this._loadSavedTheme();
        this._watchSystemPreference();
    }

    _loadSavedTheme() {
        const saved = localStorage.getItem('hta-theme');
        if (saved && this.themes[saved]) {
            this.setTheme(saved);
        } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
            this.setTheme('dark');
        }
    }

    _watchSystemPreference() {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (!localStorage.getItem('hta-theme')) {
                this.setTheme(e.matches ? 'dark' : 'light');
            }
        });
    }

    setTheme(themeName) {
        if (!this.themes[themeName]) return false;

        const theme = this.themes[themeName];
        const root = document.documentElement;

        for (const [property, value] of Object.entries(theme)) {
            root.style.setProperty(property, value);
        }

        this.currentTheme = themeName;
        localStorage.setItem('hta-theme', themeName);
        document.body.setAttribute('data-theme', themeName);

        // Dispatch event for other components
        window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: themeName } }));

        return true;
    }

    toggle() {
        const themes = Object.keys(this.themes);
        const currentIndex = themes.indexOf(this.currentTheme);
        const nextIndex = (currentIndex + 1) % themes.length;
        this.setTheme(themes[nextIndex]);
    }

    getTheme() {
        return this.currentTheme;
    }

    getAvailableThemes() {
        return Object.keys(this.themes);
    }
}

// ============================================================================
// SECTION 2: KEYBOARD SHORTCUTS MANAGER
// ============================================================================

class KeyboardShortcuts {
    constructor() {
        this.shortcuts = new Map();
        this.enabled = true;
        this.modalOpen = false;

        this._registerDefaults();
        this._attachListener();
    }

    _registerDefaults() {
        // File operations
        this.register('ctrl+s', 'Save project', () => this._emit('save'));
        this.register('ctrl+shift+s', 'Save as', () => this._emit('saveAs'));
        this.register('ctrl+o', 'Open project', () => this._emit('open'));
        this.register('ctrl+n', 'New project', () => this._emit('new'));

        // Edit operations
        this.register('ctrl+z', 'Undo', () => this._emit('undo'));
        this.register('ctrl+y', 'Redo', () => this._emit('redo'));
        this.register('ctrl+shift+z', 'Redo', () => this._emit('redo'));

        // Run operations
        this.register('ctrl+r', 'Run model', () => this._emit('run'));
        this.register('ctrl+shift+r', 'Run PSA', () => this._emit('runPSA'));
        this.register('f5', 'Run model', () => this._emit('run'));

        // View operations
        this.register('ctrl+1', 'Show model view', () => this._emit('viewModel'));
        this.register('ctrl+2', 'Show results view', () => this._emit('viewResults'));
        this.register('ctrl+3', 'Show validation view', () => this._emit('viewValidation'));
        this.register('ctrl+d', 'Toggle dark mode', () => this._emit('toggleTheme'));

        // Help
        this.register('f1', 'Show help', () => this._emit('help'));
        this.register('ctrl+/', 'Show shortcuts', () => this.showHelp());
        this.register('escape', 'Close modal', () => this._emit('closeModal'));
    }

    _attachListener() {
        document.addEventListener('keydown', (e) => {
            if (!this.enabled) return;

            // Don't trigger shortcuts when typing in inputs
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
                if (e.key !== 'Escape') return;
            }

            const key = this._normalizeKey(e);
            const shortcut = this.shortcuts.get(key);

            if (shortcut) {
                e.preventDefault();
                shortcut.handler();
            }
        });
    }

    _normalizeKey(e) {
        const parts = [];
        if (e.ctrlKey || e.metaKey) parts.push('ctrl');
        if (e.altKey) parts.push('alt');
        if (e.shiftKey) parts.push('shift');
        parts.push(e.key.toLowerCase());
        return parts.join('+');
    }

    _emit(action) {
        window.dispatchEvent(new CustomEvent('shortcut', { detail: { action } }));
    }

    register(keys, description, handler) {
        const normalizedKey = keys.toLowerCase().replace(/\s+/g, '');
        this.shortcuts.set(normalizedKey, { description, handler });
    }

    unregister(keys) {
        const normalizedKey = keys.toLowerCase().replace(/\s+/g, '');
        this.shortcuts.delete(normalizedKey);
    }

    enable() {
        this.enabled = true;
    }

    disable() {
        this.enabled = false;
    }

    showHelp() {
        const modal = document.createElement('div');
        modal.className = 'shortcuts-modal';
        modal.innerHTML = `
            <div class="shortcuts-content">
                <h2>Keyboard Shortcuts</h2>
                <button class="close-btn" onclick="this.closest('.shortcuts-modal').remove()">&times;</button>
                <div class="shortcuts-grid">
                    ${Array.from(this.shortcuts.entries()).map(([key, { description }]) => `
                        <div class="shortcut-item">
                            <kbd>${key.replace(/\+/g, ' + ').toUpperCase()}</kbd>
                            <span>${description}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            .shortcuts-modal {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
            }
            .shortcuts-content {
                background: var(--card-bg);
                border-radius: 12px;
                padding: 24px;
                max-width: 600px;
                max-height: 80vh;
                overflow-y: auto;
                position: relative;
            }
            .shortcuts-content h2 {
                margin-bottom: 16px;
            }
            .close-btn {
                position: absolute;
                top: 12px;
                right: 12px;
                background: none;
                border: none;
                font-size: 24px;
                cursor: pointer;
                color: var(--text-muted);
            }
            .shortcuts-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
                gap: 12px;
            }
            .shortcut-item {
                display: flex;
                align-items: center;
                gap: 12px;
            }
            .shortcut-item kbd {
                background: var(--bg-secondary);
                padding: 4px 8px;
                border-radius: 4px;
                font-family: monospace;
                font-size: 12px;
                min-width: 80px;
                text-align: center;
            }
        `;
        modal.appendChild(style);

        document.body.appendChild(modal);

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    }

    getShortcuts() {
        return Array.from(this.shortcuts.entries()).map(([key, { description }]) => ({
            key,
            description
        }));
    }
}

// ============================================================================
// SECTION 3: UNDO/REDO MANAGER
// ============================================================================

class UndoRedoManager {
    constructor(options = {}) {
        this.maxHistory = options.maxHistory || 100;
        this.history = [];
        this.currentIndex = -1;
        this.onStateChange = options.onStateChange || (() => {});
        this.isApplying = false;
    }

    push(state, description = '') {
        if (this.isApplying) return;

        // Remove any redo states
        if (this.currentIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.currentIndex + 1);
        }

        // Deep clone the state
        const clonedState = JSON.parse(JSON.stringify(state));

        this.history.push({
            state: clonedState,
            description,
            timestamp: Date.now()
        });

        // Limit history size
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        } else {
            this.currentIndex++;
        }

        this._notifyChange();
    }

    undo() {
        if (!this.canUndo()) return null;

        this.isApplying = true;
        this.currentIndex--;
        const entry = this.history[this.currentIndex];
        this.isApplying = false;

        this._notifyChange();
        return JSON.parse(JSON.stringify(entry.state));
    }

    redo() {
        if (!this.canRedo()) return null;

        this.isApplying = true;
        this.currentIndex++;
        const entry = this.history[this.currentIndex];
        this.isApplying = false;

        this._notifyChange();
        return JSON.parse(JSON.stringify(entry.state));
    }

    canUndo() {
        return this.currentIndex > 0;
    }

    canRedo() {
        return this.currentIndex < this.history.length - 1;
    }

    getCurrentState() {
        if (this.currentIndex >= 0 && this.currentIndex < this.history.length) {
            return JSON.parse(JSON.stringify(this.history[this.currentIndex].state));
        }
        return null;
    }

    getHistory() {
        return this.history.map((entry, index) => ({
            index,
            description: entry.description,
            timestamp: entry.timestamp,
            isCurrent: index === this.currentIndex
        }));
    }

    clear() {
        this.history = [];
        this.currentIndex = -1;
        this._notifyChange();
    }

    _notifyChange() {
        this.onStateChange({
            canUndo: this.canUndo(),
            canRedo: this.canRedo(),
            historyLength: this.history.length,
            currentIndex: this.currentIndex
        });
    }

    // Jump to a specific point in history
    goto(index) {
        if (index < 0 || index >= this.history.length) return null;

        this.isApplying = true;
        this.currentIndex = index;
        const entry = this.history[this.currentIndex];
        this.isApplying = false;

        this._notifyChange();
        return JSON.parse(JSON.stringify(entry.state));
    }
}

// ============================================================================
// SECTION 4: PROGRESS MANAGER
// ============================================================================

class ProgressManager {
    constructor() {
        this.activeProgress = new Map();
        this.container = null;
        this._createContainer();
    }

    _createContainer() {
        this.container = document.createElement('div');
        this.container.className = 'progress-container';
        this.container.innerHTML = `
            <style>
                .progress-container {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    z-index: 9999;
                    max-width: 350px;
                }
                .progress-item {
                    background: var(--card-bg);
                    border: 1px solid var(--border);
                    border-radius: 8px;
                    padding: 12px;
                    box-shadow: var(--shadow-lg);
                    animation: slideIn 0.3s ease;
                }
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                .progress-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 8px;
                }
                .progress-title {
                    font-weight: 500;
                    font-size: 14px;
                }
                .progress-percent {
                    font-size: 12px;
                    color: var(--text-muted);
                }
                .progress-bar-bg {
                    height: 6px;
                    background: var(--bg-secondary);
                    border-radius: 3px;
                    overflow: hidden;
                }
                .progress-bar-fill {
                    height: 100%;
                    background: var(--primary);
                    border-radius: 3px;
                    transition: width 0.3s ease;
                }
                .progress-bar-fill.indeterminate {
                    width: 30% !important;
                    animation: indeterminate 1.5s infinite linear;
                }
                @keyframes indeterminate {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(400%); }
                }
                .progress-status {
                    font-size: 12px;
                    color: var(--text-muted);
                    margin-top: 4px;
                }
                .progress-cancel {
                    background: none;
                    border: none;
                    color: var(--error);
                    cursor: pointer;
                    font-size: 12px;
                    padding: 4px 8px;
                    border-radius: 4px;
                }
                .progress-cancel:hover {
                    background: var(--error);
                    color: white;
                }
            </style>
        `;
        document.body.appendChild(this.container);
    }

    start(id, title, options = {}) {
        const {
            cancellable = false,
            onCancel = () => {},
            indeterminate = false
        } = options;

        const element = document.createElement('div');
        element.className = 'progress-item';
        element.id = `progress-${id}`;
        element.innerHTML = `
            <div class="progress-header">
                <span class="progress-title">${title}</span>
                <span class="progress-percent">${indeterminate ? '' : '0%'}</span>
                ${cancellable ? '<button class="progress-cancel">Cancel</button>' : ''}
            </div>
            <div class="progress-bar-bg">
                <div class="progress-bar-fill ${indeterminate ? 'indeterminate' : ''}" style="width: 0%"></div>
            </div>
            <div class="progress-status">Starting...</div>
        `;

        if (cancellable) {
            element.querySelector('.progress-cancel').addEventListener('click', () => {
                onCancel();
                this.complete(id);
            });
        }

        this.container.appendChild(element);
        this.activeProgress.set(id, { element, title, startTime: Date.now() });

        return {
            update: (percent, status) => this.update(id, percent, status),
            complete: (status) => this.complete(id, status),
            error: (message) => this.error(id, message)
        };
    }

    update(id, percent, status = '') {
        const progress = this.activeProgress.get(id);
        if (!progress) return;

        const fill = progress.element.querySelector('.progress-bar-fill');
        const percentText = progress.element.querySelector('.progress-percent');
        const statusText = progress.element.querySelector('.progress-status');

        fill.classList.remove('indeterminate');
        fill.style.width = `${Math.min(100, Math.max(0, percent))}%`;
        percentText.textContent = `${Math.round(percent)}%`;

        if (status) {
            statusText.textContent = status;
        }
    }

    complete(id, status = 'Complete') {
        const progress = this.activeProgress.get(id);
        if (!progress) return;

        const elapsed = Date.now() - progress.startTime;
        const statusText = progress.element.querySelector('.progress-status');
        statusText.textContent = `${status} (${(elapsed / 1000).toFixed(1)}s)`;

        this.update(id, 100);

        // Remove after delay
        setTimeout(() => {
            progress.element.style.animation = 'slideIn 0.3s ease reverse';
            setTimeout(() => {
                progress.element.remove();
                this.activeProgress.delete(id);
            }, 300);
        }, 2000);
    }

    error(id, message = 'Error occurred') {
        const progress = this.activeProgress.get(id);
        if (!progress) return;

        const fill = progress.element.querySelector('.progress-bar-fill');
        const statusText = progress.element.querySelector('.progress-status');

        fill.style.background = 'var(--error)';
        statusText.textContent = message;
        statusText.style.color = 'var(--error)';

        setTimeout(() => {
            progress.element.remove();
            this.activeProgress.delete(id);
        }, 5000);
    }

    clearAll() {
        for (const [id] of this.activeProgress) {
            this.complete(id, 'Cancelled');
        }
    }
}

// ============================================================================
// SECTION 5: AUTO-SAVE MANAGER
// ============================================================================

class AutoSaveManager {
    constructor(options = {}) {
        this.key = options.key || 'hta-autosave';
        this.interval = options.interval || 30000; // 30 seconds
        this.maxBackups = options.maxBackups || 5;
        this.onRecover = options.onRecover || (() => {});
        this.getState = options.getState || (() => null);

        this.timer = null;
        this.lastSave = null;
        this.isDirty = false;

        this._checkForRecovery();
    }

    start() {
        if (this.timer) return;

        this.timer = setInterval(() => {
            if (this.isDirty) {
                this.save();
            }
        }, this.interval);

        // Save on page unload
        window.addEventListener('beforeunload', (e) => {
            if (this.isDirty) {
                this.save();
                e.preventDefault();
                e.returnValue = 'You have unsaved changes.';
            }
        });

        // Save on visibility change (tab switch)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.isDirty) {
                this.save();
            }
        });
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    markDirty() {
        this.isDirty = true;
    }

    markClean() {
        this.isDirty = false;
    }

    save() {
        try {
            const state = this.getState();
            if (!state) return false;

            const backup = {
                state,
                timestamp: Date.now(),
                version: '0.6.0'
            };

            // Get existing backups
            const backups = this._getBackups();
            backups.unshift(backup);

            // Limit number of backups
            while (backups.length > this.maxBackups) {
                backups.pop();
            }

            localStorage.setItem(this.key, JSON.stringify(backups));
            this.lastSave = new Date();
            this.isDirty = false;

            return true;
        } catch (e) {
            console.error('AutoSave failed:', e);
            return false;
        }
    }

    _getBackups() {
        try {
            const data = localStorage.getItem(this.key);
            return data ? JSON.parse(data) : [];
        } catch {
            return [];
        }
    }

    _checkForRecovery() {
        const backups = this._getBackups();
        if (backups.length > 0) {
            const latest = backups[0];
            const age = Date.now() - latest.timestamp;

            // If backup is less than 1 hour old, offer recovery
            if (age < 3600000) {
                this._showRecoveryPrompt(latest);
            }
        }
    }

    _showRecoveryPrompt(backup) {
        const date = new Date(backup.timestamp);
        const modal = document.createElement('div');
        modal.className = 'recovery-modal';
        modal.innerHTML = `
            <div class="recovery-content">
                <h2>Recover Unsaved Work?</h2>
                <p>We found an auto-saved project from ${date.toLocaleString()}</p>
                <div class="recovery-actions">
                    <button class="btn btn-primary" id="recover-yes">Recover</button>
                    <button class="btn btn-secondary" id="recover-no">Start Fresh</button>
                </div>
            </div>
            <style>
                .recovery-modal {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0,0,0,0.5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 10000;
                }
                .recovery-content {
                    background: var(--card-bg);
                    border-radius: 12px;
                    padding: 24px;
                    text-align: center;
                }
                .recovery-content h2 {
                    margin-bottom: 12px;
                }
                .recovery-content p {
                    color: var(--text-muted);
                    margin-bottom: 20px;
                }
                .recovery-actions {
                    display: flex;
                    gap: 12px;
                    justify-content: center;
                }
            </style>
        `;

        document.body.appendChild(modal);

        modal.querySelector('#recover-yes').addEventListener('click', () => {
            this.onRecover(backup.state);
            modal.remove();
        });

        modal.querySelector('#recover-no').addEventListener('click', () => {
            this.clearBackups();
            modal.remove();
        });
    }

    getBackups() {
        return this._getBackups().map((b, i) => ({
            index: i,
            timestamp: b.timestamp,
            date: new Date(b.timestamp).toLocaleString()
        }));
    }

    recover(index = 0) {
        const backups = this._getBackups();
        if (index >= 0 && index < backups.length) {
            return backups[index].state;
        }
        return null;
    }

    clearBackups() {
        localStorage.removeItem(this.key);
    }
}

// ============================================================================
// SECTION 6: INTERNATIONALIZATION (i18n)
// ============================================================================

class I18n {
    constructor(options = {}) {
        this.currentLocale = options.defaultLocale || 'en';
        this.fallbackLocale = 'en';
        this.translations = {};

        this._loadBuiltInTranslations();
        this._detectLocale();
    }

    _loadBuiltInTranslations() {
        this.translations = {
            en: {
                // General
                'app.title': 'HTA Artifact Standard',
                'app.version': 'Version {version}',
                'app.subtitle': 'Frontier Edition',

                // Navigation
                'nav.model': 'Model',
                'nav.results': 'Results',
                'nav.validation': 'Validation',
                'nav.settings': 'Settings',

                // Actions
                'action.save': 'Save',
                'action.saveAs': 'Save As',
                'action.open': 'Open',
                'action.new': 'New Project',
                'action.run': 'Run Model',
                'action.runPSA': 'Run PSA',
                'action.export': 'Export',
                'action.import': 'Import',
                'action.cancel': 'Cancel',
                'action.confirm': 'Confirm',
                'action.delete': 'Delete',
                'action.edit': 'Edit',
                'action.undo': 'Undo',
                'action.redo': 'Redo',

                // Model types
                'model.markov': 'Markov Cohort',
                'model.microsim': 'Microsimulation',
                'model.psa': 'Probabilistic Sensitivity Analysis',
                'model.partitioned': 'Partitioned Survival',
                'model.des': 'Discrete Event Simulation',

                // States
                'state.alive': 'Alive',
                'state.dead': 'Dead',
                'state.healthy': 'Healthy',
                'state.sick': 'Sick',
                'state.progression': 'Progression',

                // Parameters
                'param.cost': 'Cost',
                'param.utility': 'Utility',
                'param.probability': 'Probability',
                'param.rate': 'Rate',
                'param.hazardRatio': 'Hazard Ratio',

                // Results
                'result.icer': 'ICER',
                'result.nmb': 'Net Monetary Benefit',
                'result.qaly': 'QALYs',
                'result.lys': 'Life Years',
                'result.totalCost': 'Total Cost',
                'result.incrementalCost': 'Incremental Cost',
                'result.incrementalEffect': 'Incremental Effect',

                // Validation
                'validation.passed': 'Validation Passed',
                'validation.failed': 'Validation Failed',
                'validation.warnings': '{count} Warning(s)',
                'validation.errors': '{count} Error(s)',

                // Messages
                'msg.loading': 'Loading...',
                'msg.saving': 'Saving...',
                'msg.running': 'Running simulation...',
                'msg.complete': 'Complete',
                'msg.error': 'An error occurred',
                'msg.unsavedChanges': 'You have unsaved changes',
                'msg.confirmDelete': 'Are you sure you want to delete this?',

                // Help
                'help.shortcuts': 'Keyboard Shortcuts',
                'help.documentation': 'Documentation',
                'help.about': 'About',

                // Time
                'time.seconds': '{n} seconds',
                'time.minutes': '{n} minutes',
                'time.hours': '{n} hours',
                'time.days': '{n} days'
            },

            de: {
                'app.title': 'HTA Artefakt Standard',
                'app.version': 'Version {version}',
                'nav.model': 'Modell',
                'nav.results': 'Ergebnisse',
                'nav.validation': 'Validierung',
                'nav.settings': 'Einstellungen',
                'action.save': 'Speichern',
                'action.run': 'Modell ausführen',
                'action.cancel': 'Abbrechen',
                'model.markov': 'Markov-Kohorte',
                'result.icer': 'ICER',
                'result.qaly': 'QALYs',
                'msg.loading': 'Laden...',
                'msg.complete': 'Fertig'
            },

            fr: {
                'app.title': 'Standard d\'Artefact HTA',
                'app.version': 'Version {version}',
                'nav.model': 'Modèle',
                'nav.results': 'Résultats',
                'nav.validation': 'Validation',
                'nav.settings': 'Paramètres',
                'action.save': 'Enregistrer',
                'action.run': 'Exécuter le modèle',
                'action.cancel': 'Annuler',
                'model.markov': 'Cohorte de Markov',
                'result.icer': 'RDCR',
                'result.qaly': 'QALY',
                'msg.loading': 'Chargement...',
                'msg.complete': 'Terminé'
            },

            es: {
                'app.title': 'Estándar de Artefactos HTA',
                'app.version': 'Versión {version}',
                'nav.model': 'Modelo',
                'nav.results': 'Resultados',
                'nav.validation': 'Validación',
                'nav.settings': 'Configuración',
                'action.save': 'Guardar',
                'action.run': 'Ejecutar modelo',
                'action.cancel': 'Cancelar',
                'model.markov': 'Cohorte de Markov',
                'result.icer': 'RCEI',
                'result.qaly': 'AVAC',
                'msg.loading': 'Cargando...',
                'msg.complete': 'Completado'
            },

            zh: {
                'app.title': 'HTA人工制品标准',
                'app.version': '版本 {version}',
                'nav.model': '模型',
                'nav.results': '结果',
                'nav.validation': '验证',
                'nav.settings': '设置',
                'action.save': '保存',
                'action.run': '运行模型',
                'action.cancel': '取消',
                'model.markov': '马尔可夫队列',
                'result.icer': '增量成本效果比',
                'result.qaly': '质量调整生命年',
                'msg.loading': '加载中...',
                'msg.complete': '完成'
            },

            ja: {
                'app.title': 'HTA成果物標準',
                'app.version': 'バージョン {version}',
                'nav.model': 'モデル',
                'nav.results': '結果',
                'nav.validation': '検証',
                'nav.settings': '設定',
                'action.save': '保存',
                'action.run': 'モデル実行',
                'action.cancel': 'キャンセル',
                'model.markov': 'マルコフコホート',
                'result.icer': 'ICER',
                'result.qaly': 'QALY',
                'msg.loading': '読み込み中...',
                'msg.complete': '完了'
            }
        };
    }

    _detectLocale() {
        // Check localStorage first
        const saved = localStorage.getItem('hta-locale');
        if (saved && this.translations[saved]) {
            this.currentLocale = saved;
            return;
        }

        // Try browser language
        const browserLang = navigator.language?.split('-')[0];
        if (browserLang && this.translations[browserLang]) {
            this.currentLocale = browserLang;
        }
    }

    setLocale(locale) {
        if (this.translations[locale]) {
            this.currentLocale = locale;
            localStorage.setItem('hta-locale', locale);
            window.dispatchEvent(new CustomEvent('localechange', { detail: { locale } }));
            return true;
        }
        return false;
    }

    getLocale() {
        return this.currentLocale;
    }

    getAvailableLocales() {
        return Object.keys(this.translations).map(code => ({
            code,
            name: new Intl.DisplayNames([code], { type: 'language' }).of(code)
        }));
    }

    t(key, params = {}) {
        let text = this.translations[this.currentLocale]?.[key]
            || this.translations[this.fallbackLocale]?.[key]
            || key;

        // Replace placeholders
        for (const [param, value] of Object.entries(params)) {
            text = text.replace(new RegExp(`\\{${param}\\}`, 'g'), value);
        }

        return text;
    }

    // Add custom translations
    addTranslations(locale, translations) {
        if (!this.translations[locale]) {
            this.translations[locale] = {};
        }
        Object.assign(this.translations[locale], translations);
    }

    // Format numbers according to locale
    formatNumber(value, options = {}) {
        return new Intl.NumberFormat(this.currentLocale, options).format(value);
    }

    // Format currency
    formatCurrency(value, currency = 'USD') {
        return new Intl.NumberFormat(this.currentLocale, {
            style: 'currency',
            currency
        }).format(value);
    }

    // Format dates
    formatDate(date, options = {}) {
        return new Intl.DateTimeFormat(this.currentLocale, options).format(date);
    }

    // Format relative time
    formatRelativeTime(value, unit) {
        const rtf = new Intl.RelativeTimeFormat(this.currentLocale, { numeric: 'auto' });
        return rtf.format(value, unit);
    }
}

// ============================================================================
// SECTION 7: ACCESSIBILITY MANAGER
// ============================================================================

class AccessibilityManager {
    constructor() {
        this.announcer = null;
        this.focusTrap = null;
        this._createAnnouncer();
        this._setupFocusIndicators();
    }

    _createAnnouncer() {
        this.announcer = document.createElement('div');
        this.announcer.setAttribute('role', 'status');
        this.announcer.setAttribute('aria-live', 'polite');
        this.announcer.setAttribute('aria-atomic', 'true');
        this.announcer.className = 'sr-only';
        this.announcer.style.cssText = `
            position: absolute;
            width: 1px;
            height: 1px;
            padding: 0;
            margin: -1px;
            overflow: hidden;
            clip: rect(0, 0, 0, 0);
            white-space: nowrap;
            border: 0;
        `;
        document.body.appendChild(this.announcer);
    }

    _setupFocusIndicators() {
        // Add visible focus indicators
        const style = document.createElement('style');
        style.textContent = `
            *:focus-visible {
                outline: 2px solid var(--border-focus);
                outline-offset: 2px;
            }
            .focus-ring {
                box-shadow: 0 0 0 3px var(--selection);
            }
            @media (prefers-reduced-motion: reduce) {
                *, *::before, *::after {
                    animation-duration: 0.01ms !important;
                    animation-iteration-count: 1 !important;
                    transition-duration: 0.01ms !important;
                }
            }
        `;
        document.head.appendChild(style);
    }

    announce(message, priority = 'polite') {
        this.announcer.setAttribute('aria-live', priority);
        this.announcer.textContent = '';
        // Small delay to ensure announcement
        setTimeout(() => {
            this.announcer.textContent = message;
        }, 50);
    }

    trapFocus(element) {
        const focusableElements = element.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        const handler = (e) => {
            if (e.key === 'Tab') {
                if (e.shiftKey && document.activeElement === firstElement) {
                    e.preventDefault();
                    lastElement.focus();
                } else if (!e.shiftKey && document.activeElement === lastElement) {
                    e.preventDefault();
                    firstElement.focus();
                }
            }
        };

        element.addEventListener('keydown', handler);
        firstElement?.focus();

        return () => element.removeEventListener('keydown', handler);
    }

    setLabel(element, label) {
        element.setAttribute('aria-label', label);
    }

    setDescription(element, description) {
        const id = `desc-${Math.random().toString(36).substr(2, 9)}`;
        const desc = document.createElement('span');
        desc.id = id;
        desc.className = 'sr-only';
        desc.textContent = description;
        element.appendChild(desc);
        element.setAttribute('aria-describedby', id);
    }
}

// ============================================================================
// SECTION 8: NOTIFICATION MANAGER
// ============================================================================

class NotificationManager {
    constructor() {
        this.container = null;
        this.queue = [];
        this.maxVisible = 5;
        this._createContainer();
    }

    _createContainer() {
        this.container = document.createElement('div');
        this.container.className = 'notification-container';
        this.container.innerHTML = `
            <style>
                .notification-container {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    z-index: 9998;
                    max-width: 400px;
                }
                .notification {
                    display: flex;
                    align-items: flex-start;
                    gap: 12px;
                    padding: 16px;
                    background: var(--card-bg);
                    border-radius: 8px;
                    box-shadow: var(--shadow-lg);
                    border-left: 4px solid var(--primary);
                    animation: notifyIn 0.3s ease;
                }
                .notification.success { border-left-color: var(--success); }
                .notification.warning { border-left-color: var(--warning); }
                .notification.error { border-left-color: var(--error); }
                @keyframes notifyIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes notifyOut {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(100%); opacity: 0; }
                }
                .notification-icon {
                    font-size: 20px;
                    flex-shrink: 0;
                }
                .notification-content {
                    flex: 1;
                }
                .notification-title {
                    font-weight: 600;
                    margin-bottom: 4px;
                }
                .notification-message {
                    font-size: 14px;
                    color: var(--text-muted);
                }
                .notification-close {
                    background: none;
                    border: none;
                    color: var(--text-muted);
                    cursor: pointer;
                    padding: 4px;
                    font-size: 16px;
                }
                .notification-actions {
                    display: flex;
                    gap: 8px;
                    margin-top: 12px;
                }
                .notification-actions button {
                    padding: 6px 12px;
                    border-radius: 4px;
                    font-size: 13px;
                    cursor: pointer;
                }
            </style>
        `;
        document.body.appendChild(this.container);
    }

    show(options) {
        const {
            type = 'info',
            title = '',
            message = '',
            duration = 5000,
            actions = [],
            closable = true
        } = options;

        const icons = {
            info: 'ℹ️',
            success: '✅',
            warning: '⚠️',
            error: '❌'
        };

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <span class="notification-icon">${icons[type]}</span>
            <div class="notification-content">
                ${title ? `<div class="notification-title">${title}</div>` : ''}
                <div class="notification-message">${message}</div>
                ${actions.length > 0 ? `
                    <div class="notification-actions">
                        ${actions.map(a => `<button data-action="${a.id}" class="btn ${a.primary ? 'btn-primary' : 'btn-secondary'}">${a.label}</button>`).join('')}
                    </div>
                ` : ''}
            </div>
            ${closable ? '<button class="notification-close">&times;</button>' : ''}
        `;

        // Handle actions
        actions.forEach(action => {
            notification.querySelector(`[data-action="${action.id}"]`)?.addEventListener('click', () => {
                action.handler?.();
                this._remove(notification);
            });
        });

        // Handle close
        notification.querySelector('.notification-close')?.addEventListener('click', () => {
            this._remove(notification);
        });

        this.container.appendChild(notification);

        // Auto-remove after duration
        if (duration > 0) {
            setTimeout(() => this._remove(notification), duration);
        }

        return notification;
    }

    _remove(notification) {
        notification.style.animation = 'notifyOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }

    success(message, title = 'Success') {
        return this.show({ type: 'success', title, message });
    }

    error(message, title = 'Error') {
        return this.show({ type: 'error', title, message, duration: 0 });
    }

    warning(message, title = 'Warning') {
        return this.show({ type: 'warning', title, message });
    }

    info(message, title = '') {
        return this.show({ type: 'info', title, message });
    }
}

// ============================================================================
// EXPORT
// ============================================================================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ThemeManager,
        KeyboardShortcuts,
        UndoRedoManager,
        ProgressManager,
        AutoSaveManager,
        I18n,
        AccessibilityManager,
        NotificationManager
    };
} else if (typeof window !== 'undefined') {
    window.ThemeManager = ThemeManager;
    window.KeyboardShortcuts = KeyboardShortcuts;
    window.UndoRedoManager = UndoRedoManager;
    window.ProgressManager = ProgressManager;
    window.AutoSaveManager = AutoSaveManager;
    window.I18n = I18n;
    window.AccessibilityManager = AccessibilityManager;
    window.NotificationManager = NotificationManager;
}
