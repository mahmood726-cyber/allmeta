/**
 * Tests for src/ui/enhancedUI.js - ThemeManager, KeyboardShortcuts,
 * UndoRedoManager, ProgressManager, AutoSaveManager, I18n,
 * AccessibilityManager, NotificationManager
 */

'use strict';

// Prevent DOMContentLoaded listeners from firing
const dcListeners = [];
const origAddEventListener = document.addEventListener.bind(document);
document.addEventListener = jest.fn((event, handler) => {
    if (event === 'DOMContentLoaded') {
        dcListeners.push(handler);
        return;
    }
    origAddEventListener(event, handler);
});

// Mock window.matchMedia which jsdom does not implement
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
    })),
});

const {
    ThemeManager,
    KeyboardShortcuts,
    UndoRedoManager,
    ProgressManager,
    AutoSaveManager,
    I18n,
    AccessibilityManager,
    NotificationManager
} = require('../../src/ui/enhancedUI');

// ---- Tests ----

// ============== ThemeManager ==============

describe('ThemeManager', () => {
    let tm;

    beforeEach(() => {
        document.body.innerHTML = '';
        localStorage.clear();
        tm = new ThemeManager();
    });

    test('defaults to light theme', () => {
        expect(tm.currentTheme).toBe('light');
    });

    test('setTheme changes current theme', () => {
        const result = tm.setTheme('dark');
        expect(result).toBe(true);
        expect(tm.currentTheme).toBe('dark');
    });

    test('setTheme persists to localStorage', () => {
        tm.setTheme('dark');
        expect(localStorage.getItem('hta-theme')).toBe('dark');
    });

    test('setTheme sets data-theme attribute on body', () => {
        tm.setTheme('dark');
        expect(document.body.getAttribute('data-theme')).toBe('dark');
    });

    test('setTheme applies CSS custom properties', () => {
        tm.setTheme('dark');
        const root = document.documentElement;
        expect(root.style.getPropertyValue('--bg')).toBe('#0f172a');
    });

    test('setTheme returns false for invalid theme', () => {
        const result = tm.setTheme('nonexistent');
        expect(result).toBe(false);
    });

    test('toggle cycles through themes', () => {
        expect(tm.currentTheme).toBe('light');
        tm.toggle();
        expect(tm.currentTheme).toBe('dark');
        tm.toggle();
        expect(tm.currentTheme).toBe('highContrast');
        tm.toggle();
        expect(tm.currentTheme).toBe('light');
    });

    test('getTheme returns current theme', () => {
        tm.setTheme('highContrast');
        expect(tm.getTheme()).toBe('highContrast');
    });

    test('getAvailableThemes returns all theme names', () => {
        const themes = tm.getAvailableThemes();
        expect(themes).toContain('light');
        expect(themes).toContain('dark');
        expect(themes).toContain('highContrast');
    });

    test('loads saved theme from localStorage', () => {
        localStorage.setItem('hta-theme', 'dark');
        const tm2 = new ThemeManager();
        expect(tm2.currentTheme).toBe('dark');
    });

    test('dispatches themechange event', () => {
        const handler = jest.fn();
        window.addEventListener('themechange', handler);
        tm.setTheme('dark');
        expect(handler).toHaveBeenCalled();
        window.removeEventListener('themechange', handler);
    });
});

// ============== KeyboardShortcuts ==============

describe('KeyboardShortcuts', () => {
    let ks;

    beforeEach(() => {
        document.body.innerHTML = '';
        ks = new KeyboardShortcuts();
    });

    test('has default shortcuts registered', () => {
        const shortcuts = ks.getShortcuts();
        expect(shortcuts.length).toBeGreaterThan(0);
    });

    test('register adds a new shortcut', () => {
        const handler = jest.fn();
        ks.register('ctrl+k', 'Search', handler);
        const found = ks.getShortcuts().find(s => s.key === 'ctrl+k');
        expect(found).toBeDefined();
        expect(found.description).toBe('Search');
    });

    test('unregister removes a shortcut', () => {
        ks.register('ctrl+k', 'Search', jest.fn());
        ks.unregister('ctrl+k');
        const found = ks.getShortcuts().find(s => s.key === 'ctrl+k');
        expect(found).toBeUndefined();
    });

    test('enable and disable toggle shortcut processing', () => {
        ks.disable();
        expect(ks.enabled).toBe(false);
        ks.enable();
        expect(ks.enabled).toBe(true);
    });

    test('showHelp creates modal in DOM', () => {
        ks.showHelp();
        const modal = document.querySelector('.shortcuts-modal');
        expect(modal).not.toBeNull();
    });

    test('_normalizeKey produces correct key string', () => {
        const event = { ctrlKey: true, altKey: false, shiftKey: true, metaKey: false, key: 'S' };
        const key = ks._normalizeKey(event);
        expect(key).toBe('ctrl+shift+s');
    });
});

// ============== UndoRedoManager ==============

describe('UndoRedoManager', () => {
    let ur;

    beforeEach(() => {
        ur = new UndoRedoManager();
    });

    test('starts with empty history', () => {
        expect(ur.canUndo()).toBe(false);
        expect(ur.canRedo()).toBe(false);
    });

    test('push adds state to history', () => {
        ur.push({ value: 1 }, 'initial');
        ur.push({ value: 2 }, 'change');
        expect(ur.canUndo()).toBe(true);
    });

    test('undo returns previous state', () => {
        ur.push({ value: 1 }, 'initial');
        ur.push({ value: 2 }, 'change');
        const state = ur.undo();
        expect(state).toEqual({ value: 1 });
    });

    test('redo returns next state', () => {
        ur.push({ value: 1 }, 'initial');
        ur.push({ value: 2 }, 'change');
        ur.undo();
        const state = ur.redo();
        expect(state).toEqual({ value: 2 });
    });

    test('undo returns null when nothing to undo', () => {
        ur.push({ value: 1 });
        const result = ur.undo();
        expect(result).toBeNull();
    });

    test('redo returns null when nothing to redo', () => {
        ur.push({ value: 1 });
        const result = ur.redo();
        expect(result).toBeNull();
    });

    test('push after undo truncates redo history', () => {
        ur.push({ value: 1 });
        ur.push({ value: 2 });
        ur.push({ value: 3 });
        ur.undo();
        ur.push({ value: 4 });
        expect(ur.canRedo()).toBe(false);
    });

    test('respects maxHistory limit', () => {
        const limited = new UndoRedoManager({ maxHistory: 3 });
        limited.push({ v: 1 });
        limited.push({ v: 2 });
        limited.push({ v: 3 });
        limited.push({ v: 4 });
        expect(limited.getHistory().length).toBe(3);
    });

    test('getCurrentState returns current', () => {
        ur.push({ value: 42 });
        expect(ur.getCurrentState()).toEqual({ value: 42 });
    });

    test('getHistory returns all entries', () => {
        ur.push({ v: 1 }, 'first');
        ur.push({ v: 2 }, 'second');
        const hist = ur.getHistory();
        expect(hist.length).toBe(2);
        expect(hist[0].description).toBe('first');
        expect(hist[1].isCurrent).toBe(true);
    });

    test('clear resets history', () => {
        ur.push({ v: 1 });
        ur.push({ v: 2 });
        ur.clear();
        expect(ur.canUndo()).toBe(false);
        expect(ur.getHistory().length).toBe(0);
    });

    test('goto jumps to specific index', () => {
        ur.push({ v: 1 });
        ur.push({ v: 2 });
        ur.push({ v: 3 });
        const state = ur.goto(0);
        expect(state).toEqual({ v: 1 });
    });

    test('goto returns null for out-of-bounds', () => {
        ur.push({ v: 1 });
        expect(ur.goto(5)).toBeNull();
        expect(ur.goto(-1)).toBeNull();
    });

    test('onStateChange callback fires', () => {
        const cb = jest.fn();
        const manager = new UndoRedoManager({ onStateChange: cb });
        manager.push({ v: 1 });
        expect(cb).toHaveBeenCalledWith(expect.objectContaining({
            canUndo: false,
            canRedo: false,
            historyLength: 1
        }));
    });

    test('push during isApplying is ignored', () => {
        ur.push({ v: 1 });
        ur.isApplying = true;
        ur.push({ v: 2 });
        ur.isApplying = false;
        expect(ur.getHistory().length).toBe(1);
    });
});

// ============== ProgressManager ==============

describe('ProgressManager', () => {
    let pm;

    beforeEach(() => {
        document.body.innerHTML = '';
        pm = new ProgressManager();
    });

    test('creates container in DOM', () => {
        expect(document.querySelector('.progress-container')).not.toBeNull();
    });

    test('start creates a progress item', () => {
        pm.start('test', 'Running...');
        const item = document.getElementById('progress-test');
        expect(item).not.toBeNull();
    });

    test('update changes progress bar width', () => {
        pm.start('test', 'Running...');
        pm.update('test', 50, 'Halfway');
        const fill = document.querySelector('#progress-test .progress-bar-fill');
        expect(fill.style.width).toBe('50%');
    });

    test('complete marks progress as 100%', () => {
        pm.start('test', 'Running...');
        pm.complete('test', 'Done');
        const fill = document.querySelector('#progress-test .progress-bar-fill');
        expect(fill.style.width).toBe('100%');
    });

    test('error changes status text', () => {
        pm.start('test', 'Running...');
        pm.error('test', 'Something went wrong');
        const statusText = document.querySelector('#progress-test .progress-status');
        expect(statusText.textContent).toBe('Something went wrong');
    });

    test('start returns control object', () => {
        const ctrl = pm.start('test2', 'Test');
        expect(typeof ctrl.update).toBe('function');
        expect(typeof ctrl.complete).toBe('function');
        expect(typeof ctrl.error).toBe('function');
    });
});

// ============== AutoSaveManager ==============

describe('AutoSaveManager', () => {
    let asm;

    beforeEach(() => {
        document.body.innerHTML = '';
        localStorage.clear();
        jest.useFakeTimers();
        asm = new AutoSaveManager({
            key: 'test-autosave',
            interval: 1000,
            getState: () => ({ test: true })
        });
    });

    afterEach(() => {
        asm.stop();
        jest.useRealTimers();
    });

    test('save stores data in localStorage', () => {
        asm.save();
        const data = JSON.parse(localStorage.getItem('test-autosave'));
        expect(data).not.toBeNull();
        expect(data[0].state).toEqual({ test: true });
    });

    test('markDirty sets isDirty flag', () => {
        expect(asm.isDirty).toBe(false);
        asm.markDirty();
        expect(asm.isDirty).toBe(true);
    });

    test('markClean clears isDirty flag', () => {
        asm.markDirty();
        asm.markClean();
        expect(asm.isDirty).toBe(false);
    });

    test('clearBackups removes storage key', () => {
        asm.save();
        asm.clearBackups();
        expect(localStorage.getItem('test-autosave')).toBeNull();
    });

    test('recover returns saved state', () => {
        asm.save();
        const state = asm.recover(0);
        expect(state).toEqual({ test: true });
    });

    test('recover returns null for invalid index', () => {
        expect(asm.recover(0)).toBeNull();
    });

    test('getBackups returns backup list', () => {
        asm.save();
        asm.save();
        const backups = asm.getBackups();
        expect(backups.length).toBe(2);
        expect(backups[0]).toHaveProperty('timestamp');
        expect(backups[0]).toHaveProperty('date');
    });

    test('respects maxBackups', () => {
        const limited = new AutoSaveManager({
            key: 'test-limited',
            maxBackups: 2,
            getState: () => ({ v: Math.random() })
        });
        limited.save();
        limited.save();
        limited.save();
        const backups = limited.getBackups();
        expect(backups.length).toBe(2);
    });
});

// ============== I18n ==============

describe('I18n', () => {
    let i18n;

    beforeEach(() => {
        localStorage.clear();
        i18n = new I18n();
    });

    test('defaults to English', () => {
        expect(i18n.currentLocale).toBe('en');
    });

    test('t() returns translated string', () => {
        expect(i18n.t('app.title')).toBe('HTA Artifact Standard');
    });

    test('t() returns key when translation not found', () => {
        expect(i18n.t('nonexistent.key')).toBe('nonexistent.key');
    });

    test('t() replaces placeholders', () => {
        const result = i18n.t('app.version', { version: '2.0' });
        expect(result).toBe('Version 2.0');
    });

    test('setLocale changes current locale', () => {
        const result = i18n.setLocale('de');
        expect(result).toBe(true);
        expect(i18n.currentLocale).toBe('de');
    });

    test('setLocale persists to localStorage', () => {
        i18n.setLocale('fr');
        expect(localStorage.getItem('hta-locale')).toBe('fr');
    });

    test('setLocale returns false for unknown locale', () => {
        const result = i18n.setLocale('klingon');
        expect(result).toBe(false);
    });

    test('getLocale returns current locale', () => {
        i18n.setLocale('es');
        expect(i18n.getLocale()).toBe('es');
    });

    test('getAvailableLocales returns locale objects', () => {
        const locales = i18n.getAvailableLocales();
        expect(locales.length).toBeGreaterThan(0);
        expect(locales.find(l => l.code === 'en')).toBeDefined();
    });

    test('t() falls back to English', () => {
        i18n.setLocale('de');
        // 'action.open' is not in de, should fall back to en
        expect(i18n.t('action.open')).toBe('Open');
    });

    test('addTranslations adds new keys', () => {
        i18n.addTranslations('en', { 'custom.key': 'Custom Value' });
        expect(i18n.t('custom.key')).toBe('Custom Value');
    });

    test('formatNumber formats according to locale', () => {
        const formatted = i18n.formatNumber(1234.56);
        expect(formatted).toBeTruthy();
    });

    test('formatCurrency formats with currency symbol', () => {
        const formatted = i18n.formatCurrency(1234.56, 'GBP');
        expect(formatted).toBeTruthy();
    });
});

// ============== AccessibilityManager ==============

describe('AccessibilityManager', () => {
    let am;

    beforeEach(() => {
        document.body.innerHTML = '';
        am = new AccessibilityManager();
    });

    test('creates announcer element', () => {
        expect(am.announcer).not.toBeNull();
        expect(am.announcer.getAttribute('role')).toBe('status');
        expect(am.announcer.getAttribute('aria-live')).toBe('polite');
    });

    test('announce sets announcer text (after delay)', () => {
        jest.useFakeTimers();
        am.announce('Test announcement');
        jest.advanceTimersByTime(100);
        expect(am.announcer.textContent).toBe('Test announcement');
        jest.useRealTimers();
    });

    test('announce with assertive priority', () => {
        jest.useFakeTimers();
        am.announce('Urgent', 'assertive');
        expect(am.announcer.getAttribute('aria-live')).toBe('assertive');
        jest.useRealTimers();
    });

    test('setLabel sets aria-label', () => {
        const el = document.createElement('button');
        am.setLabel(el, 'Click me');
        expect(el.getAttribute('aria-label')).toBe('Click me');
    });

    test('setDescription creates hidden description', () => {
        const el = document.createElement('div');
        document.body.appendChild(el);
        am.setDescription(el, 'Detailed description');
        expect(el.getAttribute('aria-describedby')).toBeTruthy();
    });

    test('trapFocus returns cleanup function', () => {
        const container = document.createElement('div');
        container.innerHTML = '<button>A</button><button>B</button>';
        document.body.appendChild(container);
        const cleanup = am.trapFocus(container);
        expect(typeof cleanup).toBe('function');
    });
});

// ============== NotificationManager ==============

describe('NotificationManager', () => {
    let nm;

    beforeEach(() => {
        document.body.innerHTML = '';
        nm = new NotificationManager();
    });

    test('creates notification container', () => {
        expect(document.querySelector('.notification-container')).not.toBeNull();
    });

    test('show creates a notification element', () => {
        nm.show({ type: 'info', title: 'Test', message: 'Hello world' });
        const notifications = document.querySelectorAll('.notification');
        expect(notifications.length).toBe(1);
    });

    test('success creates success notification', () => {
        nm.success('It worked');
        const notification = document.querySelector('.notification.success');
        expect(notification).not.toBeNull();
    });

    test('error creates error notification', () => {
        nm.error('Something broke');
        const notification = document.querySelector('.notification.error');
        expect(notification).not.toBeNull();
    });

    test('warning creates warning notification', () => {
        nm.warning('Be careful');
        const notification = document.querySelector('.notification.warning');
        expect(notification).not.toBeNull();
    });

    test('notification has close button', () => {
        nm.show({ type: 'info', title: 'Test', message: 'msg', closable: true });
        const closeBtn = document.querySelector('.notification-close');
        expect(closeBtn).not.toBeNull();
    });
});
