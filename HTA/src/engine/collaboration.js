/**
 * Collaboration and Session Management for HTA
 * Multi-user session support with real-time collaboration
 *
 * Features:
 * - Session state management
 * - Real-time collaboration via WebRTC/WebSocket
 * - Session export/import
 * - Audit trail
 * - User permissions
 * - Conflict resolution
 * - Offline mode support
 *
 * References:
 * - Operational transformation for collaborative editing
 * - CRDT (Conflict-free Replicated Data Types)
 */

class HTACollaborationEngine {
    constructor(options = {}) {
        this.options = {
            autoSave: true,
            autoSaveInterval: 30000, // 30 seconds
            enableCollaboration: true,
            enableOfflineMode: true,
            maxSessionSize: 10485760, // 10MB
            ...options
        };

        this.session = null;
        this.collaborators = new Map();
        this.auditLog = [];
        this.changeHistory = [];
        this.offlineQueue = [];

        this.init();
    }

    // ============================================================
    // INITIALIZATION
    // ============================================================

    init() {
        // Setup auto-save
        if (this.options.autoSave) {
            this.startAutoSave();
        }

        // Setup offline mode detection
        if (this.options.enableOfflineMode) {
            this.setupOfflineMode();
        }

        // Load previous session if available
        this.loadSession();
    }

    // ============================================================
    // SESSION MANAGEMENT
    // ============================================================

    /**
     * Create new session
     */
    createSession(metadata = {}) {
        this.session = {
            id: this.generateId(),
            name: metadata.name || 'HTA Analysis Session',
            created: new Date().toISOString(),
            modified: new Date().toISOString(),
            owner: metadata.owner || 'anonymous',
            collaborators: [],
            data: {
                models: [],
                analyses: [],
                results: [],
                settings: {}
            },
            permissions: {
                read: ['*'],
                write: [metadata.owner || 'anonymous'],
                admin: [metadata.owner || 'anonymous']
            },
            version: 1
        };

        this.logAction('session_created', { sessionId: this.session.id });
        this.saveSession();

        return this.session;
    }

    /**
     * Load session from storage or file
     */
    async loadSession(sessionId = null) {
        if (sessionId) {
            // Load from server or file
            try {
                const response = await fetch(`/api/sessions/${sessionId}`);
                this.session = await response.json();
            } catch (error) {
                console.error('Failed to load session:', error);
            }
        } else {
            // Load from local storage
            const saved = localStorage.getItem('hta_session');
            if (saved) {
                try {
                    this.session = JSON.parse(saved);
                    this.logAction('session_loaded', { sessionId: this.session.id });
                } catch (error) {
                    console.error('Failed to parse saved session:', error);
                }
            }
        }

        return this.session;
    }

    /**
     * Save session to local storage
     */
    saveSession() {
        if (!this.session) return;

        this.session.modified = new Date().toISOString();

        try {
            localStorage.setItem('hta_session', JSON.stringify(this.session));
            this.logAction('session_saved');
        } catch (error) {
            console.error('Failed to save session:', error);
        }
    }

    /**
     * Export session to file
     */
    exportSession() {
        if (!this.session) return null;

        const exportData = {
            version: '1.0',
            exported: new Date().toISOString(),
            session: this.session,
            auditLog: this.auditLog,
            changeHistory: this.changeHistory
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], {
            type: 'application/json'
        });

        return {
            blob,
            filename: `hta-session-${this.session.id}-${new Date().toISOString().split('T')[0]}.json`
        };
    }

    /**
     * Import session from file
     */
    async importSession(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);

                    this.session = data.session;
                    this.auditLog = data.auditLog || [];
                    this.changeHistory = data.changeHistory || [];

                    this.logAction('session_imported', {
                        originalSessionId: this.session.id
                    });

                    resolve(this.session);
                } catch (error) {
                    reject(new Error('Failed to parse session file: ' + error.message));
                }
            };

            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    /**
     * Share session with collaborators
     */
    shareSession(collaboratorEmails, permissions = 'read') {
        if (!this.session) return false;

        const collaborators = Array.isArray(collaboratorEmails) ?
            collaboratorEmails : [collaboratorEmails];

        collaborators.forEach(email => {
            if (!this.session.collaborators.includes(email)) {
                this.session.collaborators.push(email);
            }

            if (permissions !== 'read') {
                this.session.permissions[permissions].push(email);
            }
        });

        this.logAction('session_shared', {
            collaborators,
            permissions
        });

        this.saveSession();

        // In a real implementation, this would send invitations
        return true;
    }

    // ============================================================
    // REAL-TIME COLLABORATION
    // ============================================================

    /**
     * Start collaboration session
     */
    async startCollaboration() {
        if (!this.session || !this.options.enableCollaboration) {
            return false;
        }

        // Initialize WebSocket connection
        // This is a placeholder for real WebSocket implementation
        this.ws = new WebSocket(`wss://hta-collab.example.com/sessions/${this.session.id}`);

        this.ws.onopen = () => {
            this.logAction('collab_connected');
        };

        this.ws.onmessage = (event) => {
            this.handleCollaborationMessage(JSON.parse(event.data));
        };

        this.ws.onclose = () => {
            this.logAction('collab_disconnected');
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };

        return true;
    }

    /**
     * Handle collaboration messages
     */
    handleCollaborationMessage(message) {
        switch (message.type) {
            case 'user_joined':
                this.collaborators.set(message.userId, {
                    name: message.userName,
                    joined: new Date(),
                    cursor: null
                });
                this.notifyCollaborators('user_joined', {
                    userId: message.userId,
                    userName: message.userName
                });
                break;

            case 'user_left':
                this.collaborators.delete(message.userId);
                break;

            case 'cursor_update':
                const user = this.collaborators.get(message.userId);
                if (user) {
                    user.cursor = message.position;
                }
                break;

            case 'data_change':
                this.applyRemoteChange(message.change, message.userId);
                break;

            case 'session_sync':
                this.handleSessionSync(message.data);
                break;
        }
    }

    /**
     * Broadcast change to collaborators
     */
    broadcastChange(change) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'data_change',
                sessionId: this.session.id,
                change,
                timestamp: new Date().toISOString()
            }));
        }

        // Record in change history
        this.changeHistory.push({
            ...change,
            timestamp: new Date().toISOString(),
            userId: 'local'
        });
    }

    /**
     * Apply remote change from collaborator
     */
    applyRemoteChange(change, userId) {
        // Operational transformation or CRDT logic would go here
        // For now, simple direct application
        const path = change.path.split('.');
        let target = this.session.data;

        for (let i = 0; i < path.length - 1; i++) {
            target = target[path[i]];
        }

        const lastKey = path[path.length - 1];

        switch (change.operation) {
            case 'set':
                target[lastKey] = change.value;
                break;
            case 'delete':
                delete target[lastKey];
                break;
            case 'push':
                if (Array.isArray(target[lastKey])) {
                    target[lastKey].push(change.value);
                }
                break;
            case 'splice':
                if (Array.isArray(target[lastKey])) {
                    target[lastKey].splice(change.index, change.removeCount, ...change.items);
                }
                break;
        }

        this.logAction('remote_change_applied', { userId, change });

        // Trigger update event
        this.dispatchEvent(new CustomEvent('sessionChanged', {
            detail: { change, userId }
        }));
    }

    /**
     * Notify all collaborators
     */
    notifyCollaborators(type, data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type,
                sessionId: this.session.id,
                data,
                timestamp: new Date().toISOString()
            }));
        }
    }

    // ============================================================
    // AUDIT LOG
    // ============================================================

    logAction(action, details = {}) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            action,
            details,
            user: this.session?.owner || 'unknown'
        };

        this.auditLog.push(logEntry);

        // Keep log size manageable
        if (this.auditLog.length > 1000) {
            this.auditLog = this.auditLog.slice(-1000);
        }

        this.dispatchEvent(new CustomEvent('auditLogEntry', {
            detail: logEntry
        }));
    }

    getAuditLog(filters = {}) {
        let log = [...this.auditLog];

        if (filters.action) {
            log = log.filter(entry => entry.action === filters.action);
        }

        if (filters.startDate) {
            log = log.filter(entry => entry.timestamp >= filters.startDate);
        }

        if (filters.endDate) {
            log = log.filter(entry => entry.timestamp <= filters.endDate);
        }

        return log;
    }

    // ============================================================
    // VERSION HISTORY
    // ============================================================

    createSnapshot(name = null) {
        if (!this.session) return null;

        const snapshot = {
            id: this.generateId(),
            name: name || `Snapshot ${new Date().toLocaleString()}`,
            created: new Date().toISOString(),
            sessionData: JSON.parse(JSON.stringify(this.session))
        };

        if (!this.session.snapshots) {
            this.session.snapshots = [];
        }

        this.session.snapshots.push(snapshot);

        this.logAction('snapshot_created', { snapshotId: snapshot.id });
        this.saveSession();

        return snapshot;
    }

    restoreSnapshot(snapshotId) {
        if (!this.session?.snapshots) return false;

        const snapshot = this.session.snapshots.find(s => s.id === snapshotId);
        if (!snapshot) return false;

        // Create snapshot of current state before restoring
        this.createSnapshot('Before restore');

        this.session = JSON.parse(JSON.stringify(snapshot.sessionData));
        this.session.version++;

        this.logAction('snapshot_restored', { snapshotId });
        this.saveSession();

        return true;
    }

    // ============================================================
    // OFFLINE MODE
    // ============================================================

    setupOfflineMode() {
        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());
    }

    handleOnline() {
        this.isOnline = true;
        this.logAction('came_online');

        // Process queued operations
        this.processOfflineQueue();
    }

    handleOffline() {
        this.isOnline = false;
        this.logAction('went_offline');
    }

    queueOfflineOperation(operation) {
        this.offlineQueue.push({
            ...operation,
            timestamp: new Date().toISOString()
        });

        // Save queue to localStorage
        localStorage.setItem('hta_offline_queue', JSON.stringify(this.offlineQueue));
    }

    async processOfflineQueue() {
        while (this.offlineQueue.length > 0 && this.isOnline) {
            const operation = this.offlineQueue.shift();

            try {
                await this.executeOperation(operation);
            } catch (error) {
                console.error('Failed to execute offline operation:', error);
                // Re-queue if failed
                this.offlineQueue.unshift(operation);
                break;
            }
        }

        localStorage.setItem('hta_offline_queue', JSON.stringify(this.offlineQueue));
    }

    async executeOperation(operation) {
        // Execute the operation
        switch (operation.type) {
            case 'data_change':
                this.applyRemoteChange(operation.change, operation.userId);
                break;
            case 'session_save':
                await this.saveSessionToServer();
                break;
        }
    }

    // ============================================================
    // PERMISSIONS
    // ============================================================

    checkPermission(userId, permission) {
        if (!this.session) return false;

        const userPermissions = this.session.permissions[permission];
        return userPermissions.includes(userId) || userPermissions.includes('*');
    }

    grantPermission(userId, permission) {
        if (!this.session || !this.session.permissions[permission]) {
            return false;
        }

        if (!this.session.permissions[permission].includes(userId)) {
            this.session.permissions[permission].push(userId);
            this.logAction('permission_granted', { userId, permission });
            this.saveSession();
        }

        return true;
    }

    revokePermission(userId, permission) {
        if (!this.session || !this.session.permissions[permission]) {
            return false;
        }

        const idx = this.session.permissions[permission].indexOf(userId);
        if (idx > -1) {
            this.session.permissions[permission].splice(idx, 1);
            this.logAction('permission_revoked', { userId, permission });
            this.saveSession();
        }

        return true;
    }

    // ============================================================
    // UTILITY FUNCTIONS
    // ============================================================

    generateId() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    startAutoSave() {
        setInterval(() => {
            this.saveSession();
        }, this.options.autoSaveInterval);
    }

    dispatchEvent(event) {
        // For browser environment
        if (typeof window !== 'undefined' && window.dispatchEvent) {
            window.dispatchEvent(event);
        }
    }

    // ============================================================
    // SESSION STATS
    // ============================================================

    getSessionStats() {
        return {
            id: this.session?.id,
            created: this.session?.created,
            modified: this.session?.modified,
            version: this.session?.version,
            collaboratorCount: this.session?.collaborators?.length || 0,
            activeCollaborators: this.collaborators.size,
            auditLogEntries: this.auditLog.length,
            changeHistoryEntries: this.changeHistory.length,
            snapshotCount: this.session?.snapshots?.length || 0,
            isOnline: this.isOnline !== false,
            offlineQueueSize: this.offlineQueue.length
        };
    }
}

// Export for use in main app
if (typeof module !== 'undefined' && module.exports) {
    module.exports = HTACollaborationEngine;
}
