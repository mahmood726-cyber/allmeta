/**
 * Tests for src/engine/collaboration.js — session management, permissions,
 * snapshots, conflict resolution, offline queue, audit log, collaboration messages
 */

'use strict';

const HTACollaborationEngine = require('../../src/engine/collaboration');

// Mock localStorage
const localStorageMock = (() => {
    let store = {};
    return {
        getItem: jest.fn(key => store[key] ?? null),
        setItem: jest.fn((key, value) => { store[key] = String(value); }),
        removeItem: jest.fn(key => { delete store[key]; }),
        clear: jest.fn(() => { store = {}; }),
        get length() { return Object.keys(store).length; }
    };
})();

beforeEach(() => {
    localStorageMock.clear();
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
    Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true });
});

describe('HTACollaborationEngine — permissions', () => {
    let engine;

    beforeEach(() => {
        engine = new HTACollaborationEngine({
            autoSave: false, enableCollaboration: false, enableOfflineMode: false
        });
        engine.createSession({ name: 'Test', owner: 'alice' });
    });

    test('checkPermission returns true for owner on write', () => {
        expect(engine.checkPermission('alice', 'write')).toBe(true);
    });

    test('checkPermission returns true for wildcard on read', () => {
        expect(engine.checkPermission('anyone', 'read')).toBe(true);
    });

    test('checkPermission returns false for non-owner on write', () => {
        expect(engine.checkPermission('bob', 'write')).toBe(false);
    });

    test('checkPermission returns false when no session', () => {
        engine.session = null;
        expect(engine.checkPermission('alice', 'read')).toBe(false);
    });

    test('grantPermission adds user to permission list', () => {
        engine.grantPermission('bob', 'write');
        expect(engine.session.permissions.write).toContain('bob');
        expect(engine.checkPermission('bob', 'write')).toBe(true);
    });

    test('grantPermission returns false when no session', () => {
        engine.session = null;
        expect(engine.grantPermission('bob', 'write')).toBe(false);
    });

    test('grantPermission does not duplicate existing user', () => {
        engine.grantPermission('alice', 'write');
        const count = engine.session.permissions.write.filter(u => u === 'alice').length;
        expect(count).toBe(1);
    });

    test('revokePermission removes user', () => {
        engine.grantPermission('bob', 'write');
        engine.revokePermission('bob', 'write');
        expect(engine.checkPermission('bob', 'write')).toBe(false);
    });

    test('revokePermission returns false for invalid permission type', () => {
        expect(engine.revokePermission('bob', 'nonexistent')).toBe(false);
    });

    test('revokePermission returns true even if user not present', () => {
        // No error, just returns true (no-op revoke)
        expect(engine.revokePermission('charlie', 'write')).toBe(true);
    });
});

describe('HTACollaborationEngine — snapshots', () => {
    let engine;

    beforeEach(() => {
        engine = new HTACollaborationEngine({
            autoSave: false, enableCollaboration: false, enableOfflineMode: false
        });
        engine.createSession({ name: 'Snap Test', owner: 'alice' });
    });

    test('createSnapshot returns snapshot with id and name', () => {
        const snap = engine.createSnapshot('My Snapshot');
        expect(snap.id).toBeDefined();
        expect(snap.name).toBe('My Snapshot');
        expect(snap.sessionData).toBeDefined();
    });

    test('createSnapshot auto-names when name is null', () => {
        const snap = engine.createSnapshot();
        expect(snap.name).toContain('Snapshot');
    });

    test('createSnapshot adds to session.snapshots', () => {
        engine.createSnapshot('S1');
        engine.createSnapshot('S2');
        expect(engine.session.snapshots).toHaveLength(2);
    });

    test('createSnapshot returns null when no session', () => {
        engine.session = null;
        expect(engine.createSnapshot()).toBeNull();
    });

    test('restoreSnapshot restores session data and increments version', () => {
        const originalVersion = engine.session.version;
        const snap = engine.createSnapshot('Before Change');
        engine.session.name = 'Changed Name';

        const result = engine.restoreSnapshot(snap.id);
        expect(result).toBe(true);
        expect(engine.session.version).toBe(originalVersion + 1);
    });

    test('restoreSnapshot returns false for unknown snapshot ID', () => {
        engine.createSnapshot();
        expect(engine.restoreSnapshot('nonexistent')).toBe(false);
    });

    test('restoreSnapshot returns false when no snapshots', () => {
        expect(engine.restoreSnapshot('any')).toBe(false);
    });
});

describe('HTACollaborationEngine — audit log', () => {
    let engine;

    beforeEach(() => {
        engine = new HTACollaborationEngine({
            autoSave: false, enableCollaboration: false, enableOfflineMode: false
        });
    });

    test('logAction appends to auditLog', () => {
        engine.logAction('test_action', { key: 'value' });
        expect(engine.auditLog.length).toBeGreaterThan(0);
        const last = engine.auditLog[engine.auditLog.length - 1];
        expect(last.action).toBe('test_action');
        expect(last.details.key).toBe('value');
    });

    test('auditLog truncates to 1000 entries', () => {
        engine.auditLog = new Array(1001).fill({ action: 'old', timestamp: '', details: {}, user: '' });
        engine.logAction('new_action');
        expect(engine.auditLog.length).toBe(1000);
    });

    test('getAuditLog returns all entries by default', () => {
        engine.logAction('a1');
        engine.logAction('a2');
        const log = engine.getAuditLog();
        expect(log.length).toBeGreaterThanOrEqual(2);
    });

    test('getAuditLog filters by action', () => {
        engine.logAction('save');
        engine.logAction('load');
        engine.logAction('save');
        const saves = engine.getAuditLog({ action: 'save' });
        expect(saves.every(e => e.action === 'save')).toBe(true);
    });
});

describe('HTACollaborationEngine — collaboration messages', () => {
    let engine;

    beforeEach(() => {
        engine = new HTACollaborationEngine({
            autoSave: false, enableCollaboration: false, enableOfflineMode: false
        });
        engine.createSession({ name: 'Collab', owner: 'alice' });
    });

    test('handleCollaborationMessage user_joined adds collaborator', () => {
        engine.handleCollaborationMessage({
            type: 'user_joined', userId: 'bob', userName: 'Bob'
        });
        expect(engine.collaborators.has('bob')).toBe(true);
        expect(engine.collaborators.get('bob').name).toBe('Bob');
    });

    test('handleCollaborationMessage user_left removes collaborator', () => {
        engine.collaborators.set('bob', { name: 'Bob', joined: new Date(), cursor: null });
        engine.handleCollaborationMessage({ type: 'user_left', userId: 'bob' });
        expect(engine.collaborators.has('bob')).toBe(false);
    });

    test('handleCollaborationMessage cursor_update updates position', () => {
        engine.collaborators.set('bob', { name: 'Bob', joined: new Date(), cursor: null });
        engine.handleCollaborationMessage({
            type: 'cursor_update', userId: 'bob', position: { x: 10, y: 20 }
        });
        expect(engine.collaborators.get('bob').cursor).toEqual({ x: 10, y: 20 });
    });
});

describe('HTACollaborationEngine — applyRemoteChange', () => {
    let engine;

    beforeEach(() => {
        engine = new HTACollaborationEngine({
            autoSave: false, enableCollaboration: false, enableOfflineMode: false
        });
        engine.createSession({ name: 'Remote', owner: 'alice' });
    });

    test('set operation updates value at path', () => {
        engine.applyRemoteChange({ path: 'settings.horizon', operation: 'set', value: 50 }, 'bob');
        expect(engine.session.data.settings.horizon).toBe(50);
    });

    test('delete operation removes key at path', () => {
        engine.session.data.settings.temp = 'x';
        engine.applyRemoteChange({ path: 'settings.temp', operation: 'delete' }, 'bob');
        expect(engine.session.data.settings.temp).toBeUndefined();
    });

    test('push operation appends to array', () => {
        engine.session.data.models = ['m1'];
        engine.applyRemoteChange({ path: 'models', operation: 'push', value: 'm2' }, 'bob');
        expect(engine.session.data.models).toContain('m2');
    });
});

describe('HTACollaborationEngine — shareSession', () => {
    let engine;

    beforeEach(() => {
        engine = new HTACollaborationEngine({
            autoSave: false, enableCollaboration: false, enableOfflineMode: false
        });
        engine.createSession({ name: 'Share', owner: 'alice' });
    });

    test('shareSession adds collaborator emails', () => {
        engine.shareSession(['bob@test.com', 'carol@test.com']);
        expect(engine.session.collaborators).toContain('bob@test.com');
        expect(engine.session.collaborators).toContain('carol@test.com');
    });

    test('shareSession does not duplicate collaborators', () => {
        engine.shareSession('bob@test.com');
        engine.shareSession('bob@test.com');
        const count = engine.session.collaborators.filter(c => c === 'bob@test.com').length;
        expect(count).toBe(1);
    });

    test('shareSession with write permissions adds to write list', () => {
        engine.shareSession('bob@test.com', 'write');
        expect(engine.session.permissions.write).toContain('bob@test.com');
    });

    test('shareSession returns false when no session', () => {
        engine.session = null;
        expect(engine.shareSession('bob@test.com')).toBe(false);
    });
});

describe('HTACollaborationEngine — session stats', () => {
    let engine;

    beforeEach(() => {
        engine = new HTACollaborationEngine({
            autoSave: false, enableCollaboration: false, enableOfflineMode: false
        });
        engine.createSession({ name: 'Stats', owner: 'alice' });
    });

    test('getSessionStats returns expected fields', () => {
        const stats = engine.getSessionStats();
        expect(stats.id).toBeDefined();
        expect(stats.version).toBe(1);
        expect(stats.collaboratorCount).toBe(0);
        expect(stats.activeCollaborators).toBe(0);
        expect(typeof stats.auditLogEntries).toBe('number');
        expect(typeof stats.offlineQueueSize).toBe('number');
        expect(stats.isOnline).toBe(true);
    });

    test('stats reflect snapshot count', () => {
        engine.createSnapshot('S1');
        const stats = engine.getSessionStats();
        expect(stats.snapshotCount).toBe(1);
    });
});

describe('HTACollaborationEngine — offline queue', () => {
    let engine;

    beforeEach(() => {
        engine = new HTACollaborationEngine({
            autoSave: false, enableCollaboration: false, enableOfflineMode: false
        });
        engine.createSession({ name: 'Offline', owner: 'alice' });
    });

    test('queueOfflineOperation adds to queue', () => {
        engine.queueOfflineOperation({ type: 'data_change', change: { path: 'x', operation: 'set', value: 1 } });
        expect(engine.offlineQueue).toHaveLength(1);
    });

    test('queueOfflineOperation saves to localStorage', () => {
        engine.queueOfflineOperation({ type: 'test' });
        expect(localStorageMock.setItem).toHaveBeenCalledWith(
            'hta_offline_queue',
            expect.any(String)
        );
    });

    test('handleOnline sets isOnline to true', () => {
        engine.isOnline = false;
        engine.handleOnline();
        expect(engine.isOnline).toBe(true);
    });

    test('handleOffline sets isOnline to false', () => {
        engine.isOnline = true;
        engine.handleOffline();
        expect(engine.isOnline).toBe(false);
    });
});

describe('HTACollaborationEngine — exportSession / importSession', () => {
    let engine;

    beforeEach(() => {
        engine = new HTACollaborationEngine({
            autoSave: false, enableCollaboration: false, enableOfflineMode: false
        });
        engine.createSession({ name: 'Export', owner: 'alice' });
    });

    test('exportSession returns blob and filename', () => {
        const result = engine.exportSession();
        expect(result.blob).toBeDefined();
        expect(result.filename).toContain('hta-session-');
        expect(result.filename).toContain('.json');
    });

    test('exportSession returns null when no session', () => {
        engine.session = null;
        expect(engine.exportSession()).toBeNull();
    });
});
