// =============================================================================
// APP RUNTIME READY SIGNAL
// =============================================================================

(function() {
    if (typeof APP !== 'object' || !APP) return;

    const runtime = APP.runtime = Object.assign({
        ready: false,
        phase: 'booting',
        signalVersion: 'ipd-runtime-v1',
        buildId: APP.buildId || null,
        domContentLoaded: false,
        coreInitComplete: false,
        readyAt: null,
        readyReason: null,
        lastUpdatedAt: null,
        missing: [],
        details: {}
    }, APP.runtime || {});

    function runtimeSnapshot() {
        return {
            ready: !!runtime.ready,
            phase: runtime.phase || 'unknown',
            signalVersion: runtime.signalVersion,
            buildId: APP.buildId || runtime.buildId || null,
            domContentLoaded: !!runtime.domContentLoaded,
            coreInitComplete: !!runtime.coreInitComplete,
            readyAt: runtime.readyAt || null,
            readyReason: runtime.readyReason || null,
            lastUpdatedAt: runtime.lastUpdatedAt || null,
            missing: Array.isArray(runtime.missing) ? runtime.missing.slice(0, 12) : [],
            details: Object.assign({}, runtime.details || {})
        };
    }

    function publishRuntimeState() {
        runtime.buildId = APP.buildId || runtime.buildId || null;
        runtime.lastUpdatedAt = new Date().toISOString();
        const snapshot = runtimeSnapshot();
        window.__IPD_META_PRO_READY__ = snapshot;
        if (document.documentElement) {
            document.documentElement.setAttribute('data-ipd-runtime-ready', snapshot.ready ? 'true' : 'false');
            document.documentElement.setAttribute('data-ipd-runtime-phase', snapshot.phase);
        }
        if (document.body) {
            document.body.setAttribute('data-ipd-runtime-ready', snapshot.ready ? 'true' : 'false');
            document.body.setAttribute('data-ipd-runtime-phase', snapshot.phase);
        }
        return snapshot;
    }

    APP.getRuntimeSnapshot = function() {
        return runtimeSnapshot();
    };

    APP.markRuntimePhase = function(phase, details) {
        runtime.phase = phase || runtime.phase || 'unknown';
        if (details && typeof details === 'object') {
            runtime.details = Object.assign({}, runtime.details || {}, details);
        }
        return publishRuntimeState();
    };

    APP.markRuntimeReady = function(reason, details) {
        runtime.ready = true;
        runtime.phase = 'ready';
        runtime.domContentLoaded = true;
        runtime.coreInitComplete = true;
        runtime.readyReason = reason || runtime.readyReason || 'runtime_contract';
        runtime.readyAt = runtime.readyAt || new Date().toISOString();
        runtime.missing = [];
        if (details && typeof details === 'object') {
            runtime.details = Object.assign({}, runtime.details || {}, details);
        }
        const snapshot = publishRuntimeState();
        if (!runtime._readyEventDispatched) {
            runtime._readyEventDispatched = true;
            try {
                window.dispatchEvent(new CustomEvent('ipd-meta-pro:ready', { detail: snapshot }));
            } catch (e) {
                // Ignore event dispatch issues in older browser contexts.
            }
        }
        return snapshot;
    };

    function computeRuntimeStatus() {
        const missing = [];
        const signalDetails = {
            requiredFunctions: ['loadExampleData', 'runAnalysis', 'switchPanel', 'showNotification', 'exportResults'],
            requiredObjects: ['APP', 'MetaAnalysis', 'MathUtils', 'Stats', 'Plots', 'SessionManager']
        };

        if (document.readyState === 'loading') missing.push('document.readyState');
        if (!document.body) missing.push('document.body');
        if (!document.getElementById('fileInput')) missing.push('#fileInput');
        if (!document.getElementById('sessionIndicator')) missing.push('#sessionIndicator');
        if (!document.querySelector('.nav-tab[data-panel="data"]')) missing.push('.nav-tab[data-panel="data"]');
        if (!document.querySelector('#panel-data')) missing.push('#panel-data');
        if (typeof loadExampleData !== 'function') missing.push('loadExampleData');
        if (typeof runAnalysis !== 'function') missing.push('runAnalysis');
        if (typeof switchPanel !== 'function') missing.push('switchPanel');
        if (typeof showNotification !== 'function') missing.push('showNotification');
        if (typeof exportResults !== 'function') missing.push('exportResults');
        if (typeof MetaAnalysis !== 'object' || !MetaAnalysis) missing.push('MetaAnalysis');
        if (typeof MathUtils !== 'object' || !MathUtils) missing.push('MathUtils');
        if (typeof Stats !== 'object' || !Stats) missing.push('Stats');
        if (typeof Plots !== 'object' || !Plots) missing.push('Plots');
        if (typeof SessionManager !== 'object' || !SessionManager) missing.push('SessionManager');
        if (!runtime.domContentLoaded) missing.push('runtime.domContentLoaded');
        if (!runtime.coreInitComplete) missing.push('runtime.coreInitComplete');

        signalDetails.missing = missing.slice(0, 12);

        let phase = 'runtime-dependencies-pending';
        if (document.readyState === 'loading') {
            phase = 'dom-loading';
        } else if (!runtime.domContentLoaded) {
            phase = 'dom-ready-pending';
        } else if (!runtime.coreInitComplete) {
            phase = 'core-init-pending';
        } else if (!missing.length) {
            phase = 'ready';
        }

        return {
            ready: missing.length === 0,
            phase,
            details: signalDetails
        };
    }

    function scheduleRuntimeProbe(delayMs) {
        if (runtime.ready) return;
        if (runtime._probeTimer) clearTimeout(runtime._probeTimer);
        runtime._probeTimer = setTimeout(checkRuntimeReady, Math.max(0, Number(delayMs) || 0));
    }

    function checkRuntimeReady() {
        runtime.domContentLoaded = runtime.domContentLoaded || document.readyState !== 'loading';
        const status = computeRuntimeStatus();
        runtime.missing = status.details.missing || [];

        if (status.ready) {
            APP.markRuntimeReady('core-init-complete', status.details);
            return;
        }

        APP.markRuntimePhase(status.phase, status.details);
        scheduleRuntimeProbe(status.phase === 'core-init-pending' ? 125 : 75);
    }

    publishRuntimeState();
    APP.markRuntimePhase('booting');

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            runtime.domContentLoaded = true;
            APP.markRuntimePhase('dom-content-loaded');
            scheduleRuntimeProbe(650);
        }, { once: true });
    } else {
        runtime.domContentLoaded = true;
        APP.markRuntimePhase('dom-already-ready');
        scheduleRuntimeProbe(650);
    }
})();
