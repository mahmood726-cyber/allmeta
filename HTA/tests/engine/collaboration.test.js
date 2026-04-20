/**
 * Tests for src/engine/collaboration.js
 * Covers HTACollaborationEngine: session management, user management,
 * change tracking, permissions, snapshots, audit log, and serialization.
 */

'use strict';

const HTACollaborationEngine = require('../../src/engine/collaboration');

// Mock localStorage for jsdom (may be partially available)
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

// Install mock before each test
beforeEach(() => {
    localStorageMock.clear();
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
    Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true });
});

describe('HTACollaborationEngine', () => {
    let engine;

    beforeEach(() => {
        // Disable autoSave interval to avoid timers leaking
        engine = new HTACollaborationEngine({
            autoSave: false,
            enableCollaboration: false,
            enableOfflineMode: false
        });
    });

    // ================================================================
    // SESSION CREATION
    // ================================================================

    describe('Session creation', () => {
        test('createSession returns a session object with expected fields', () => {
            const session = engine.createSession({ name: 'Test Session', owner: 'alice' });

            expect(session).toHaveProperty('id');
            expect(session.name).toBe('Test Session');
            expect(session.owner).toBe('alice');
            expect(session.version).toBe(1);
            expect(session.data).toHaveProperty('models');
            expect(session.data).toHaveProperty('analyses');
            expect(session.data).toHaveProperty('results');
            expect(session.data).toHaveProperty('settings');
        });

        test('createSession generates unique IDs', () => {
            const s1 = engine.createSession({ name: 'A' });
            const s2 = engine.createSession({ name: 'B' });
            expect(s1.id).not.toBe(s2.id);
        });

        test('createSession defaults to anonymous owner', () => {
            const session = engine.createSession();
            expect(session.owner).toBe('anonymous');
        });

        test('createSession sets timestamps', () => {
            const session = engine.createSession();
            expect(session.created).toBeTruthy();
            expect(session.modified).toBeTruthy();
            // Both should be valid ISO strings
            expect(() => new Date(session.created)).not.toThrow();
        });

        test('createSession saves to localStorage', () => {
            engine.createSession({ name: 'Saved' });
            expect(localStorageMock.setItem).toHaveBeenCalledWith(
                'hta_session',
                expect.any(String)
            );
        });
    });

    // ================================================================
    // SESSION ID GENERATION
    // ================================================================

    describe('ID generation', () => {
        test('generateId starts with session_ prefix', () => {
            const id = engine.generateId();
            expect(id).toMatch(/^session_/);
        });

        test('generateId produces unique values across calls', () => {
            const ids = new Set();
            for (let i = 0; i < 100; i++) {
                ids.add(engine.generateId());
            }
            expect(ids.size).toBe(100);
        });
    });

    // ================================================================
    // USER / COLLABORATOR MANAGEMENT
    // ================================================================

    describe('Collaborator management', () => {
        beforeEach(() => {
            engine.createSession({ name: 'Collab Test', owner: 'alice' });
        });

        test('handleCollaborationMessage user_joined adds to collaborators map', () => {
            engine.handleCollaborationMessage({
                type: 'user_joined',
                userId: 'bob',
                userName: 'Bob'
            });

            expect(engine.collaborators.has('bob')).toBe(true);
            expect(engine.collaborators.get('bob').name).toBe('Bob');
        });

        test('handleCollaborationMessage user_left removes from collaborators map', () => {
            engine.collaborators.set('bob', { name: 'Bob', joined: new Date(), cursor: null });

            engine.handleCollaborationMessage({
                type: 'user_left',
                userId: 'bob'
            });

            expect(engine.collaborators.has('bob')).toBe(false);
        });

        test('handleCollaborationMessage cursor_update updates cursor position', () => {
            engine.collaborators.set('bob', { name: 'Bob', joined: new Date(), cursor: null });

            engine.handleCollaborationMessage({
                type: 'cursor_update',
                userId: 'bob',
                position: { x: 100, y: 200 }
            });

            expect(engine.collaborators.get('bob').cursor).toEqual({ x: 100, y: 200 });
        });

        test('shareSession adds collaborators to session', () => {
            const result = engine.shareSession(['bob@example.com', 'carol@example.com']);
            expect(result).toBe(true);
            expect(engine.session.collaborators).toContain('bob@example.com');
            expect(engine.session.collaborators).toContain('carol@example.com');
        });

        test('shareSession does not add duplicates', () => {
            engine.shareSession('bob@example.com');
            engine.shareSession('bob@example.com');
            const count = engine.session.collaborators.filter(c => c === 'bob@example.com').length;
            expect(count).toBe(1);
        });

        test('shareSession returns false when no session', () => {
            engine.session = null;
            expect(engine.shareSession('someone@example.com')).toBe(false);
        });
    });

    // ================================================================
    // CHANGE TRACKING / CONFLICT RESOLUTION
    // ================================================================

    describe('Change tracking', () => {
        beforeEach(() => {
            engine.createSession({ name: 'Change Test', owner: 'alice' });
        });

        test('broadcastChange records change in history', () => {
            engine.broadcastChange({ path: 'settings.discount', operation: 'set', value: 0.035 });

            expect(engine.changeHistory).toHaveLength(1);
            expect(engine.changeHistory[0].path).toBe('settings.discount');
            expect(engine.changeHistory[0].userId).toBe('local');
        });

        test('applyRemoteChange with set operation updates session data', () => {
            engine.session.data.settings.discount = 0;

            engine.applyRemoteChange(
                { path: 'settings.discount', operation: 'set', value: 0.035 },
                'bob'
            );

            expect(engine.session.data.settings.discount).toBe(0.035);
        });

        test('applyRemoteChange with delete operation removes key', () => {
            engine.session.data.settings.tempKey = 'remove-me';

            engine.applyRemoteChange(
                { path: 'settings.tempKey', operation: 'delete' },
                'bob'
            );

            expect(engine.session.data.settings).not.toHaveProperty('tempKey');
        });

        test('applyRemoteChange with push operation appends to array', () => {
            engine.applyRemoteChange(
                { path: 'models', operation: 'push', value: { id: 'm1' } },
                'bob'
            );

            expect(engine.session.data.models).toHaveLength(1);
            expect(engine.session.data.models[0].id).toBe('m1');
        });
    });

    // ================================================================
    // STATE SERIALIZATION / EXPORT
    // ================================================================

    describe('State serialization', () => {
        test('exportSession returns null when no session exists', () => {
            engine.session = null;
            expect(engine.exportSession()).toBeNull();
        });

        test('exportSession returns blob and filename', () => {
            engine.createSession({ name: 'Export Test' });
            const exported = engine.exportSession();

            expect(exported).toHaveProperty('blob');
            expect(exported).toHaveProperty('filename');
            expect(exported.filename).toMatch(/^hta-session-.+-\d{4}-\d{2}-\d{2}\.json$/);
        });

        test('saveSession updates modified timestamp', () => {
            engine.createSession({ name: 'Save Test' });
            const first = engine.session.modified;

            // Small delay to ensure different timestamp
            engine.session.modified = '2020-01-01T00:00:00.000Z';
            engine.saveSession();

            expect(engine.session.modified).not.toBe('2020-01-01T00:00:00.000Z');
        });

        test('saveSession is a no-op when session is null', () => {
            engine.session = null;
            localStorageMock.setItem.mockClear();
            engine.saveSession();
            // setItem should not be called for session save (may have been called during init)
            expect(localStorageMock.setItem).not.toHaveBeenCalledWith('hta_session', expect.anything());
        });
    });

    // ================================================================
    // PERMISSIONS
    // ================================================================

    describe('Permissions', () => {
        beforeEach(() => {
            engine.createSession({ name: 'Perm Test', owner: 'alice' });
        });

        test('checkPermission returns true for wildcard read', () => {
            expect(engine.checkPermission('anyone', 'read')).toBe(true);
        });

        test('checkPermission returns true for owner write', () => {
            expect(engine.checkPermission('alice', 'write')).toBe(true);
        });

        test('checkPermission returns false for non-owner write', () => {
            expect(engine.checkPermission('bob', 'write')).toBe(false);
        });

        test('grantPermission adds user to permission list', () => {
            engine.grantPermission('bob', 'write');
            expect(engine.checkPermission('bob', 'write')).toBe(true);
        });

        test('revokePermission removes user from permission list', () => {
            engine.grantPermission('bob', 'write');
            engine.revokePermission('bob', 'write');
            expect(engine.checkPermission('bob', 'write')).toBe(false);
        });

        test('grantPermission returns false for null session', () => {
            engine.session = null;
            expect(engine.grantPermission('bob', 'write')).toBe(false);
        });

        test('revokePermission returns false for null session', () => {
            engine.session = null;
            expect(engine.revokePermission('bob', 'write')).toBe(false);
        });
    });

    // ================================================================
    // SNAPSHOTS / VERSION HISTORY
    // ================================================================

    describe('Snapshots', () => {
        beforeEach(() => {
            engine.createSession({ name: 'Snapshot Test', owner: 'alice' });
        });

        test('createSnapshot returns snapshot with id and name', () => {
            const snap = engine.createSnapshot('v1');
            expect(snap).toHaveProperty('id');
            expect(snap.name).toBe('v1');
            expect(snap).toHaveProperty('sessionData');
        });

        test('createSnapshot stores deep copy of session', () => {
            engine.session.data.settings.discount = 0.05;
            const snap = engine.createSnapshot();

            engine.session.data.settings.discount = 0.10;
            expect(snap.sessionData.data.settings.discount).toBe(0.05);
        });

        test('createSnapshot returns null when no session', () => {
            engine.session = null;
            expect(engine.createSnapshot()).toBeNull();
        });

        test('restoreSnapshot reverts session to snapshot state', () => {
            engine.session.data.settings.val = 'original';
            engine.createSnapshot('before');

            engine.session.data.settings.val = 'changed';
            const snapId = engine.session.snapshots[0].id;
            const result = engine.restoreSnapshot(snapId);

            expect(result).toBe(true);
            expect(engine.session.data.settings.val).toBe('original');
        });

        test('restoreSnapshot returns false for nonexistent id', () => {
            expect(engine.restoreSnapshot('fake_id')).toBe(false);
        });

        test('restoreSnapshot increments version', () => {
            engine.createSnapshot('snap1');
            const snapId = engine.session.snapshots[0].id;
            const versionBefore = engine.session.version;
            engine.restoreSnapshot(snapId);
            expect(engine.session.version).toBe(versionBefore + 1);
        });
    });

    // ================================================================
    // AUDIT LOG
    // ================================================================

    describe('Audit log', () => {
        beforeEach(() => {
            engine.createSession({ name: 'Audit Test', owner: 'alice' });
        });

        test('logAction adds entries to audit log', () => {
            const initialLen = engine.auditLog.length;
            engine.logAction('custom_action', { detail: 'test' });
            expect(engine.auditLog.length).toBe(initialLen + 1);

            const last = engine.auditLog[engine.auditLog.length - 1];
            expect(last.action).toBe('custom_action');
            expect(last.details.detail).toBe('test');
        });

        test('auditLog is capped at 1000 entries', () => {
            engine.auditLog = new Array(1001).fill(null).map((_, i) => ({
                timestamp: new Date().toISOString(),
                action: `action_${i}`,
                details: {},
                user: 'alice'
            }));

            engine.logAction('overflow_action');
            expect(engine.auditLog.length).toBeLessThanOrEqual(1001);
        });

        test('getAuditLog filters by action', () => {
            engine.logAction('type_a');
            engine.logAction('type_b');
            engine.logAction('type_a');

            const filtered = engine.getAuditLog({ action: 'type_a' });
            expect(filtered.length).toBe(2);
            filtered.forEach(e => expect(e.action).toBe('type_a'));
        });

        test('getAuditLog returns all when no filter', () => {
            const all = engine.getAuditLog();
            expect(Array.isArray(all)).toBe(true);
        });
    });

    // ================================================================
    // SESSION STATS
    // ================================================================

    describe('Session stats', () => {
        test('getSessionStats returns stats for active session', () => {
            engine.createSession({ name: 'Stats Test', owner: 'alice' });

            const stats = engine.getSessionStats();
            expect(stats.id).toBeTruthy();
            expect(stats.version).toBe(1);
            expect(stats.collaboratorCount).toBe(0);
            expect(stats.activeCollaborators).toBe(0);
            expect(stats.auditLogEntries).toBeGreaterThan(0);
            expect(stats.offlineQueueSize).toBe(0);
            expect(stats.isOnline).toBe(true);
        });

        test('getSessionStats handles null session gracefully', () => {
            engine.session = null;
            const stats = engine.getSessionStats();
            expect(stats.id).toBeUndefined();
            expect(stats.collaboratorCount).toBe(0);
        });
    });

    // ================================================================
    // EDGE CASES
    // ================================================================

    describe('Edge cases', () => {
        test('empty session has default data structure', () => {
            const session = engine.createSession();
            expect(session.data.models).toEqual([]);
            expect(session.data.analyses).toEqual([]);
            expect(session.data.results).toEqual([]);
            expect(session.data.settings).toEqual({});
        });

        test('offline queue starts empty', () => {
            expect(engine.offlineQueue).toEqual([]);
        });

        test('queueOfflineOperation adds to queue', () => {
            engine.queueOfflineOperation({ type: 'data_change', change: { path: 'a', operation: 'set', value: 1 } });
            expect(engine.offlineQueue).toHaveLength(1);
            expect(engine.offlineQueue[0]).toHaveProperty('timestamp');
        });
    });
});
