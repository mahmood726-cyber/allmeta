const IPD_FRONTIER_BENCHMARK_METHODS = new Set([
    'centeredOneStageInteractionIPD',
    'autoIPDMethodPathway',
    'autoIPDWorkflowRunner',
    'nonlinearSplineInteractionIPDMA',
    'piecewisePoissonIPDMA',
    'rmstIPDMetaFromData',
    'transportabilityIOWIPDMA',
    'transportabilitySensitivityIPDMA',
    'transportabilityOverlapStressIPDMA',
    'kmReconstructionUncertaintyIPDMA',
    'federatedPseudoObservationSurvivalIPDMA'
]);

const IPD_OPERATIONAL_METHODS = new Set([
    'batchIPDWorkflowRunner',
    'ipdSuperiorityDashboard',
    'exportIPDPublicationPackage'
]);

function ipdEvidenceEsc(value) {
    const text = String(value == null ? '' : value);
    if (typeof escapeHTML === 'function') return escapeHTML(text);
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getIPDMethodEvidenceDescriptor(method) {
    if (IPD_OPERATIONAL_METHODS.has(method)) {
        return {
            tier: 'operational',
            label: 'Operational',
            tone: {
                bg: '#ecfeff',
                fg: '#155e75',
                border: '#a5f3fc'
            },
            note: 'Validation, governance, and export tooling rather than a primary statistical method.'
        };
    }
    if (IPD_FRONTIER_BENCHMARK_METHODS.has(method)) {
        return {
            tier: 'frontier-benchmark',
            label: 'Frontier benchmark',
            tone: {
                bg: '#eff6ff',
                fg: '#1d4ed8',
                border: '#bfdbfe'
            },
            note: 'Frontier method with explicit benchmark or replication coverage in the current validation program.'
        };
    }
    return {
        tier: 'journal-backed',
        label: 'Journal-backed',
        tone: {
            bg: '#f8fafc',
            fg: '#475569',
            border: '#cbd5e1'
        },
        note: 'Implemented from peer-reviewed methods. Use as an advanced extension and externally revalidate for submission-grade work.'
    };
}

function renderIPDMethodEvidenceBadge(descriptor, options) {
    const desc = descriptor || getIPDMethodEvidenceDescriptor('');
    const compact = !!(options && options.compact);
    const pad = compact ? '2px 8px' : '4px 10px';
    const font = compact ? '11px' : '12px';
    return '<span style="display:inline-flex;align-items:center;white-space:nowrap;padding:' + pad +
        ';border-radius:999px;border:1px solid ' + desc.tone.border +
        ';background:' + desc.tone.bg +
        ';color:' + desc.tone.fg +
        ';font-size:' + font +
        ';font-weight:700;">' + ipdEvidenceEsc(desc.label) + '</span>';
}

function ipdMethodConfidencePct(value) {
    const n = Number(value);
    return Number.isFinite(n) ? (n * 100).toFixed(1) + '%' : 'NA';
}

function getIPDCurrentConfigValue(id, fallback) {
    const el = typeof document !== 'undefined' ? document.getElementById(id) : null;
    if (!el) return fallback;
    if (el.type === 'checkbox') return !!el.checked;
    return el.value || fallback;
}

function buildIPDMethodConfidenceState() {
    const cfg = APP && APP.config ? APP.config : {};
    const hasData = Array.isArray(APP && APP.data) && APP.data.length > 0;
    const outcomeType = getIPDCurrentConfigValue('outcomeType', cfg.outcomeType || 'survival');
    const analysisApproach = getIPDCurrentConfigValue('analysisApproach', cfg.analysisApproach || 'two-stage');
    const effectMeasure = getIPDCurrentConfigValue('effectMeasure', cfg.effectMeasure || 'HR');
    const reMethod = getIPDCurrentConfigValue('reMethod', cfg.reMethod || 'REML');
    const studyVar = getIPDCurrentConfigValue('varStudy', cfg.studyVar || '');
    const rowCount = hasData ? APP.data.length : 0;
    const studyCount = hasData && studyVar
        ? new Set(APP.data.map((row) => row && row[studyVar]).filter((value) => value !== '' && value != null)).size
        : null;
    const qcReport = APP && APP.lastStrictQCReport ? APP.lastStrictQCReport : null;

    let recommendationTitle = 'Load data to unlock pathway guidance';
    let recommendationText = 'The primary Run IPD Meta-Analysis workflow is the benchmark-backed starting point for defensible analyses in this app.';
    if (hasData && analysisApproach === 'one-stage') {
        recommendationTitle = 'Recommended: benchmark-backed one-stage workflow';
        recommendationText = 'Use the core one-stage path when patient-level adjustment or interaction modeling is central, then reserve frontier methods for targeted extensions.';
    } else if (hasData && analysisApproach === 'both') {
        recommendationTitle = 'Recommended: compare both benchmark-backed core workflows';
        recommendationText = 'Run both core workflows, inspect concordance, and only then move to frontier methods for sensitivity or specialty questions.';
    } else if (hasData) {
        recommendationTitle = 'Recommended: benchmark-backed two-stage workflow';
        recommendationText = 'Start with the core two-stage path for fast, defensible pooled estimation before using frontier or journal-backed extensions.';
    }

    if (hasData && outcomeType === 'survival') {
        recommendationText += ' Current configuration is survival-focused; treat RMST, transportability, and KM uncertainty as add-on methods when the question requires them.';
    } else if (hasData && outcomeType === 'binary') {
        recommendationText += ' Current configuration is binary; standard OR/RR/RD pooling remains the most validated starting point.';
    } else if (hasData && outcomeType === 'continuous') {
        recommendationText += ' Current configuration is continuous; start with MD/SMD pooling and escalate only for a specific methodological need.';
    }

    let qcTitle = 'QC not run yet';
    let qcText = 'Strict QC will populate after the dedicated QC gate or a workflow that triggers it.';
    let qcTone = {
        bg: '#f8fafc',
        fg: '#475569',
        border: '#cbd5e1'
    };
    if (!hasData) {
        qcTitle = 'No data loaded';
        qcText = 'Load a dataset to enable quality-control guidance and method gating.';
    } else if (qcReport && qcReport.pass) {
        qcTitle = 'Strict QC pass';
        qcText = 'The latest strict pre-analysis gate passed for the current dataset context.';
        qcTone = {
            bg: '#f0fdf4',
            fg: '#166534',
            border: '#bbf7d0'
        };
    } else if (qcReport && qcReport.pass === false) {
        qcTitle = 'QC attention needed';
        qcText = 'The latest strict QC gate reported blockers or warnings. Resolve those before relying on frontier methods.';
        qcTone = {
            bg: '#fff7ed',
            fg: '#9a3412',
            border: '#fdba74'
        };
    }

    let snapshot = APP && APP.beyondR40SuperioritySnapshot ? APP.beyondR40SuperioritySnapshot : null;
    if (!snapshot && typeof buildIPDSuperioritySnapshot === 'function') {
        try {
            const candidate = buildIPDSuperioritySnapshot();
            if (candidate && candidate.scorecards && Object.values(candidate.scorecards).some((value) => Number.isFinite(Number(value)))) {
                snapshot = candidate;
            }
        } catch (e) {}
    }

    const embeddedManifest = (typeof window !== 'undefined') ? (window.__IPD_EMBEDDED_VALIDATION_MANIFEST__ || null) : null;
    const embeddedDigest = embeddedManifest && embeddedManifest.integrity_signature
        ? String(embeddedManifest.integrity_signature.digest || '')
        : '';
    let runtimeNote = 'When companion benchmark artifacts are available, this panel also surfaces live validation scorecards for the current build.';
    if (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:') {
        if (embeddedManifest && embeddedManifest.app_build_id) {
            runtimeNote = 'Single-file mode is using the embedded validation manifest for build ' + embeddedManifest.app_build_id + (embeddedDigest ? ' (SHA-256 ' + embeddedDigest.slice(0, 12) + '...)' : '') + '.';
        } else {
            runtimeNote = 'Single-file mode could not find an embedded validation manifest for this build.';
        }
    }

    return {
        hasData,
        rowCount,
        studyCount,
        outcomeType,
        analysisApproach,
        effectMeasure,
        reMethod,
        recommendationTitle,
        recommendationText,
        qcTitle,
        qcText,
        qcTone,
        runtimeNote,
        snapshot
    };
}

function renderMethodConfidencePanelHTML() {
    const state = buildIPDMethodConfidenceState();
    const core = {
        tier: 'core-benchmark',
        label: 'Benchmark-backed',
        tone: {
            bg: '#ecfdf5',
            fg: '#166534',
            border: '#86efac'
        }
    };
    const frontier = getIPDMethodEvidenceDescriptor('centeredOneStageInteractionIPD');
    const journal = getIPDMethodEvidenceDescriptor('hksjPredictionInterval');
    const scorecards = state.snapshot && state.snapshot.scorecards ? state.snapshot.scorecards : null;
    const metricCards = [];
    if (scorecards && Object.values(scorecards).some((value) => Number.isFinite(Number(value)))) {
        metricCards.push(
            '<div style="padding:0.65rem;border:1px solid #c7d2fe;border-radius:10px;background:#eef2ff;">' +
            '<div style="font-size:12px;color:#4338ca;">Composite validated score</div>' +
            '<div style="font-size:20px;font-weight:700;color:#312e81;">' + ipdMethodConfidencePct(scorecards.compositeValidatedScore) + '</div>' +
            '</div>'
        );
        metricCards.push(
            '<div style="padding:0.65rem;border:1px solid #bfdbfe;border-radius:10px;background:#eff6ff;">' +
            '<div style="font-size:12px;color:#1d4ed8;">Loop 2 parity</div>' +
            '<div style="font-size:20px;font-weight:700;color:#1e3a8a;">' + ipdMethodConfidencePct(scorecards.loop2Score) + '</div>' +
            '</div>'
        );
        metricCards.push(
            '<div style="padding:0.65rem;border:1px solid #bae6fd;border-radius:10px;background:#ecfeff;">' +
            '<div style="font-size:12px;color:#0f766e;">Frontier score</div>' +
            '<div style="font-size:20px;font-weight:700;color:#115e59;">' + ipdMethodConfidencePct(scorecards.frontierScore) + '</div>' +
            '</div>'
        );
    }

    const qcBadge = '<span style="display:inline-flex;align-items:center;white-space:nowrap;padding:4px 10px;border-radius:999px;border:1px solid ' + state.qcTone.border +
        ';background:' + state.qcTone.bg + ';color:' + state.qcTone.fg + ';font-size:12px;font-weight:700;">' + ipdEvidenceEsc(state.qcTitle) + '</span>';

    let html = '';
    html += '<div style="padding:1rem;border:1px solid #cbd5e1;border-radius:14px;background:linear-gradient(135deg,#ffffff 0%,#f8fafc 100%);" data-panel="method-confidence">';
    html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.75rem;flex-wrap:wrap;">';
    html += '<div>';
    html += '<div style="font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#64748b;">Method Confidence</div>';
    html += '<div style="margin-top:0.2rem;font-size:18px;font-weight:700;color:#0f172a;">' + ipdEvidenceEsc(state.recommendationTitle) + '</div>';
    html += '<div style="margin-top:0.35rem;font-size:13px;line-height:1.5;color:#334155;">' + ipdEvidenceEsc(state.recommendationText) + '</div>';
    html += '</div>';
    html += '<div style="display:flex;gap:0.4rem;flex-wrap:wrap;align-items:flex-start;">';
    html += renderIPDMethodEvidenceBadge(core);
    html += renderIPDMethodEvidenceBadge(frontier);
    html += renderIPDMethodEvidenceBadge(journal);
    html += qcBadge;
    html += '</div>';
    html += '</div>';

    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:0.6rem;margin-top:0.9rem;">';
    html += '<div style="padding:0.7rem;border:1px solid #bbf7d0;border-radius:10px;background:#f0fdf4;">' +
        '<div style="font-size:12px;color:#166534;">Core workflow</div>' +
        '<div style="margin-top:0.2rem;font-size:16px;font-weight:700;color:#14532d;">Benchmark-backed</div>' +
        '<div style="margin-top:0.25rem;font-size:12px;line-height:1.45;color:#166534;">Two-stage and one-stage primary workflows are the safest starting path for publication-grade work.</div>' +
        '</div>';
    html += '<div style="padding:0.7rem;border:1px solid #bfdbfe;border-radius:10px;background:#eff6ff;">' +
        '<div style="font-size:12px;color:#1d4ed8;">Labeled advanced methods</div>' +
        '<div style="margin-top:0.2rem;font-size:16px;font-weight:700;color:#1e3a8a;">Frontier benchmark</div>' +
        '<div style="margin-top:0.25rem;font-size:12px;line-height:1.45;color:#1d4ed8;">Only methods carrying this badge in 40 Beyond R should be treated as benchmark-backed extensions.</div>' +
        '</div>';
    html += '<div style="padding:0.7rem;border:1px solid #cbd5e1;border-radius:10px;background:#f8fafc;">' +
        '<div style="font-size:12px;color:#475569;">Remaining advanced methods</div>' +
        '<div style="margin-top:0.2rem;font-size:16px;font-weight:700;color:#334155;">Journal-backed</div>' +
        '<div style="margin-top:0.25rem;font-size:12px;line-height:1.45;color:#475569;">Use these as sensitivity, exploratory, or specialist analyses and externally revalidate critical outputs.</div>' +
        '</div>';
    html += '<div style="padding:0.7rem;border:1px solid ' + state.qcTone.border + ';border-radius:10px;background:' + state.qcTone.bg + ';">' +
        '<div style="font-size:12px;color:' + state.qcTone.fg + ';">Current configuration</div>' +
        '<div style="margin-top:0.2rem;font-size:16px;font-weight:700;color:' + state.qcTone.fg + ';">' + ipdEvidenceEsc((state.outcomeType || 'NA').toUpperCase()) + ' / ' + ipdEvidenceEsc(state.effectMeasure || 'NA') + '</div>' +
        '<div style="margin-top:0.25rem;font-size:12px;line-height:1.45;color:' + state.qcTone.fg + ';">Approach: ' + ipdEvidenceEsc(state.analysisApproach || 'NA') + ' | RE: ' + ipdEvidenceEsc(state.reMethod || 'NA') + (state.hasData ? ' | Rows: ' + ipdEvidenceEsc(state.rowCount) + (state.studyCount !== null ? ' | Studies: ' + ipdEvidenceEsc(state.studyCount) : '') : '') + '</div>' +
        '</div>';
    html += '</div>';

    if (metricCards.length) {
        html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:0.6rem;margin-top:0.8rem;">' + metricCards.join('') + '</div>';
    }

    html += '<div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.85rem;">';
    if (typeof showValidationStudy === 'function') {
        html += '<button class="btn btn-secondary btn-sm" onclick="showValidationStudy()">Reference checks</button>';
    }
    html += '<button class="btn btn-secondary btn-sm" onclick="showAdvancedFeaturesMenu()">Open labeled advanced methods</button>';
    if (typeof showPersonaAdoptionPanel12 === 'function') {
        html += '<button class="btn btn-secondary btn-sm" onclick="showPersonaAdoptionPanel12()">Adoption forecast</button>';
    }
    html += '</div>';
    html += '<div style="margin-top:0.6rem;font-size:12px;line-height:1.45;color:#64748b;">' + ipdEvidenceEsc(state.runtimeNote) + ' ' + ipdEvidenceEsc(state.qcText) + '</div>';
    html += '</div>';
    return html;
}

function refreshMethodConfidencePanel() {
    const container = typeof document !== 'undefined' ? document.getElementById('methodConfidencePanel') : null;
    if (!container) return;
    const state = buildIPDMethodConfidenceState();
    container.innerHTML = renderMethodConfidencePanelHTML();
    container.dataset.methodConfidence = state.hasData ? 'loaded' : 'empty';
}

function bindMethodConfidenceControls() {
    const ids = ['outcomeType', 'analysisApproach', 'effectMeasure', 'reMethod', 'confLevel', 'useHKSJ', 'varStudy', 'varTreatment', 'varTime', 'varEvent'];
    ids.forEach((id) => {
        const el = document.getElementById(id);
        if (!el || el.dataset.methodConfidenceBound === '1') return;
        el.dataset.methodConfidenceBound = '1';
        el.addEventListener('change', () => {
            setTimeout(refreshMethodConfidencePanel, 0);
        });
    });
}

function decorateBeyondR40EvidenceLegend(modal) {
    if (!modal || modal.querySelector('#beyondR40EvidenceLegend')) return;
    const host = modal.querySelector('.modal');
    if (!host) return;
    const info = host.querySelector('.alert.alert-info');
    const legend = document.createElement('div');
    legend.id = 'beyondR40EvidenceLegend';
    legend.style.cssText = 'margin:0 0 1rem;padding:0.85rem;border:1px solid #cbd5e1;border-radius:12px;background:#f8fafc;';
    legend.innerHTML =
        '<div style="font-weight:700;color:#0f172a;margin-bottom:0.35rem;">Evidence legend</div>' +
        '<div style="font-size:13px;line-height:1.5;color:#334155;margin-bottom:0.55rem;">The main Run IPD Meta-Analysis button remains the benchmark-backed starting path. Use this panel to deliberately move into frontier or journal-backed extensions.</div>' +
        '<div style="display:flex;gap:0.45rem;flex-wrap:wrap;">' +
        renderIPDMethodEvidenceBadge(getIPDMethodEvidenceDescriptor('centeredOneStageInteractionIPD')) +
        renderIPDMethodEvidenceBadge(getIPDMethodEvidenceDescriptor('hksjPredictionInterval')) +
        renderIPDMethodEvidenceBadge(getIPDMethodEvidenceDescriptor('ipdSuperiorityDashboard')) +
        '</div>';
    if (info && info.parentNode) {
        info.parentNode.insertBefore(legend, info.nextSibling);
    } else {
        host.insertBefore(legend, host.children[1] || null);
    }
}

function decorateBeyondR40EvidenceButtons(modal) {
    if (!modal) return;
    const buttons = modal.querySelectorAll('button');
    buttons.forEach((btn) => {
        const onclick = btn.getAttribute('onclick') || '';
        let method = null;
        const runMatch = /runBeyondR40\('([^']+)'\)/.exec(onclick);
        if (runMatch) {
            method = runMatch[1];
        } else if (onclick.indexOf('exportIPDPublicationPackage') >= 0) {
            method = 'exportIPDPublicationPackage';
        }
        if (!method) return;
        const descriptor = getIPDMethodEvidenceDescriptor(method);
        const baseLabel = String(btn.dataset.baseLabel || btn.textContent || '').trim();
        btn.dataset.baseLabel = baseLabel;
        btn.dataset.evidenceTier = descriptor.tier;
        btn.dataset.baseTitle = descriptor.note;
        btn.dataset.evidenceDecorated = '1';
        btn.style.display = 'flex';
        btn.style.justifyContent = 'space-between';
        btn.style.alignItems = 'center';
        btn.style.gap = '0.6rem';
        btn.style.textAlign = 'left';
        btn.innerHTML =
            '<span style="display:block;flex:1;min-width:0;">' + ipdEvidenceEsc(baseLabel) + '</span>' +
            renderIPDMethodEvidenceBadge(descriptor, { compact: true });
        btn.title = descriptor.note;
    });
}

function decorateBeyondR40EvidenceUI(modal) {
    if (!modal) return;
    decorateBeyondR40EvidenceLegend(modal);
    decorateBeyondR40EvidenceButtons(modal);
    if (typeof refreshBeyondR40MethodStatesIfOpen === 'function') {
        refreshBeyondR40MethodStatesIfOpen();
    }
}

(function installBeyondR40EvidenceDecorator() {
    if (typeof window === 'undefined') return;
    const wrap = function() {
        if (typeof window.showBeyondR40Panel !== 'function' || window.showBeyondR40Panel.__ipdEvidenceWrapped) return;
        const original = window.showBeyondR40Panel;
        const wrapped = function() {
            const result = original.apply(this, arguments);
            try {
                decorateBeyondR40EvidenceUI(document.getElementById('beyondR40Modal'));
            } catch (e) {
                console.warn('[IPD] Beyond-R evidence decoration failed:', e);
            }
            return result;
        };
        wrapped.__ipdEvidenceWrapped = true;
        window.showBeyondR40Panel = wrapped;
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(wrap, 0));
    } else {
        setTimeout(wrap, 0);
    }
})();

(function installMethodConfidenceHooks() {
    if (typeof window === 'undefined') return;
    const wrap = function(name, afterDelay) {
        const original = window[name];
        if (typeof original !== 'function' || original.__ipdMethodConfidenceWrapped) return;
        const wrapped = function() {
            try {
                return original.apply(this, arguments);
            } finally {
                setTimeout(refreshMethodConfidencePanel, afterDelay);
            }
        };
        wrapped.__ipdMethodConfidenceWrapped = true;
        window[name] = wrapped;
    };
    const install = function() {
        wrap('clearData', 0);
        wrap('runAnalysis', 50);
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(install, 0));
    } else {
        setTimeout(install, 0);
    }
})();

document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        bindMethodConfidenceControls();
        refreshMethodConfidencePanel();
    }, 650);
});

if (typeof window !== 'undefined') {
    window.refreshMethodConfidencePanel = refreshMethodConfidencePanel;
    window.decorateBeyondR40EvidenceUI = decorateBeyondR40EvidenceUI;
}
