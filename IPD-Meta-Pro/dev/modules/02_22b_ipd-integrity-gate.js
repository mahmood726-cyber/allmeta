// ============================================================================
// 02_22b_ipd-integrity-gate.js  —  Unified IPD Integrity Gate
// Bridges runDataGuardian (basic) + runStrictPreAnalysisQCGate (comprehensive)
// into one entry point.  Adds outlier detection, duplicate detection, and
// treatment-balance checks that neither function previously computed.
// ============================================================================

(function () {
    'use strict';

    // ------------------------------------------------------------------
    //  Utility: safe escapeHTML
    // ------------------------------------------------------------------
    var esc = (typeof escapeHTML === 'function') ? escapeHTML : function (x) {
        return String(x == null ? '' : x)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    // ------------------------------------------------------------------
    //  Outlier detection (IQR method — robust to skew)
    //  Uses floor(n*p) quantile approximation (conservative: tighter fences
    //  than Hyndman-Fan type 1 for typical clinical sample sizes).
    //  Not used for survival timeVar (long survivors are expected, not errors).
    // ------------------------------------------------------------------
    function detectOutliers(data, field) {
        if (!field || !data || !data.length) return { count: 0, indices: [] };
        var vals = [];
        for (var i = 0; i < data.length; i++) {
            var v = Number(data[i][field]);
            if (Number.isFinite(v)) vals.push(v);
        }
        // Need n>=6 for reliable Q1/Q3 separation (at n=4-5 Q3 equals or
        // nearly equals the max, making upper outlier detection impossible)
        if (vals.length < 6) return { count: 0, indices: [] };

        vals.sort(function (a, b) { return a - b; });
        var q1 = vals[Math.floor(vals.length * 0.25)];
        var q3 = vals[Math.floor(vals.length * 0.75)];
        var iqr = q3 - q1;
        var lower = q1 - 1.5 * iqr;
        var upper = q3 + 1.5 * iqr;

        var outlierIndices = [];
        // Re-scan original data (not sorted) to get correct row indices
        for (var j = 0; j < data.length; j++) {
            var val = Number(data[j][field]);
            if (Number.isFinite(val) && (val < lower || val > upper)) {
                outlierIndices.push(j);
            }
        }
        return { count: outlierIndices.length, indices: outlierIndices, lower: lower, upper: upper, q1: q1, q3: q3, iqr: iqr };
    }

    // ------------------------------------------------------------------
    //  Duplicate detection (requires patient-ID column for reliable results;
    //  falls back to key-column hashing with a prominent caveat)
    // ------------------------------------------------------------------
    function detectDuplicates(data, keyFields, hasPatientId) {
        if (!data || !data.length || !keyFields.length) return { count: 0, indices: [], reliable: false };
        var seen = Object.create(null);
        var duplicateIndices = [];
        for (var i = 0; i < data.length; i++) {
            var parts = [];
            for (var k = 0; k < keyFields.length; k++) {
                var v = data[i][keyFields[k]];
                // Strip \x1F from values to prevent separator-injection collisions
                parts.push(v == null ? '__NULL__' : String(v).replace(/\x1F/g, ''));
            }
            var key = parts.join('\x1F');
            if (key in seen) {
                duplicateIndices.push(i);
                // Also mark the first occurrence if not already
                if (seen[key] >= 0) {
                    duplicateIndices.push(seen[key]);
                    seen[key] = -1; // sentinel: already pushed
                }
            } else {
                seen[key] = i;
            }
        }
        // Deduplicate and sort
        var unique = Object.create(null);
        for (var d = 0; d < duplicateIndices.length; d++) unique[duplicateIndices[d]] = true;
        var result = Object.keys(unique).map(Number).sort(function (a, b) { return a - b; });
        return { count: result.length, indices: result, reliable: !!hasPatientId };
    }

    // ------------------------------------------------------------------
    //  Treatment balance per study
    // ------------------------------------------------------------------
    function assessTreatmentBalance(data, studyVar, treatmentVar) {
        if (!studyVar || !treatmentVar || !data || !data.length) return { balanced: true, details: [] };
        var byStudy = Object.create(null);
        for (var i = 0; i < data.length; i++) {
            var s = data[i][studyVar];
            var t = data[i][treatmentVar];
            if (s == null || s === '' || t == null || t === '') continue;
            var sk = String(s);
            if (!byStudy[sk]) byStudy[sk] = Object.create(null);
            var tk = String(t);
            byStudy[sk][tk] = (byStudy[sk][tk] || 0) + 1;
        }
        var details = [];
        var studyIds = Object.keys(byStudy);
        for (var j = 0; j < studyIds.length; j++) {
            var arms = byStudy[studyIds[j]];
            var armKeys = Object.keys(arms);
            if (armKeys.length < 2) {
                // Store only sanitized summary, not raw user strings
                details.push({ study: esc(studyIds[j]), issue: 'single-arm', armCount: 1 });
                continue;
            }
            var counts = armKeys.map(function (k) { return arms[k]; });
            var maxN = counts.reduce(function (a, b) { return a > b ? a : b; }, 0);
            var minN = counts.reduce(function (a, b) { return a < b ? a : b; }, Infinity);
            // P2-7: flag studies where any arm has <5 participants (likely mapping error)
            if (minN < 5) {
                details.push({ study: esc(studyIds[j]), issue: 'tiny-arm', minN: minN, armCount: armKeys.length });
                continue;
            }
            var ratio = maxN / Math.max(1, minN);
            if (ratio > 3) {
                details.push({ study: esc(studyIds[j]), issue: 'severe-imbalance', ratio: ratio.toFixed(1), armCount: armKeys.length });
            } else if (ratio > 2) {
                details.push({ study: esc(studyIds[j]), issue: 'moderate-imbalance', ratio: ratio.toFixed(1), armCount: armKeys.length });
            }
        }
        return { balanced: details.length === 0, details: details };
    }

    // ------------------------------------------------------------------
    //  Chronology check (time variable: no negatives, no zero-time events)
    // ------------------------------------------------------------------
    function checkChronology(data, timeVar, eventVar) {
        if (!timeVar || !data || !data.length) return { ok: true, negativeCount: 0, zeroTimeEventCount: 0 };
        var negCount = 0;
        var zeroEventCount = 0;
        for (var i = 0; i < data.length; i++) {
            var v = Number(data[i][timeVar]);
            if (Number.isFinite(v) && v < 0) negCount++;
            if (eventVar && Number.isFinite(v) && v === 0) {
                var ev = Number(data[i][eventVar]);
                if (ev === 1) zeroEventCount++;
            }
        }
        return { ok: negCount === 0 && zeroEventCount === 0, negativeCount: negCount, zeroTimeEventCount: zeroEventCount };
    }

    // ------------------------------------------------------------------
    //  Compute missing rate over mapped analysis variables only
    // ------------------------------------------------------------------
    function computeAnalysisMissingRate(data, vars) {
        var fields = [vars.studyVar, vars.treatmentVar, vars.eventVar, vars.timeVar].filter(Boolean);
        if (!fields.length || !data || !data.length) return 0;
        var totalCells = data.length * fields.length;
        var missing = 0;
        for (var i = 0; i < data.length; i++) {
            var row = data[i];
            for (var j = 0; j < fields.length; j++) {
                var v = row[fields[j]];
                if (v == null || v === '' || (typeof v === 'number' && isNaN(v))) missing++;
            }
        }
        return totalCells > 0 ? missing / totalCells : 0;
    }

    // ------------------------------------------------------------------
    //  Build the integrity findings HTML
    // ------------------------------------------------------------------
    function buildIntegrityFindingsHTML(report) {
        var r = report;
        var html = '';

        // Header row with badge + score + timestamp
        var badgeColor = r.pass ? '#10b981' : (r.blockers.length ? '#ef4444' : '#f59e0b');
        var badgeText = r.pass ? 'PASS' : (r.blockers.length ? 'FAIL' : 'WARN');
        html += '<div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;margin-bottom:0.75rem;">';
        html += '<span class="badge" style="background:' + badgeColor + ';color:#fff;">' + badgeText + '</span>';
        html += '<span><strong>Score:</strong> ' + Number(r.qualityScore != null ? r.qualityScore : 0).toFixed(0) + '%</span>';
        html += '<span><strong>Generated:</strong> ' + esc(new Date(r.generatedAt || Date.now()).toLocaleString()) + '</span>';
        html += '</div>';

        // Blockers
        if (r.blockers.length) {
            html += '<div class="alert alert-danger" style="margin-bottom:0.5rem;">';
            html += '<strong>Blockers (' + r.blockers.length + ')</strong><ul style="margin:0.3rem 0 0;padding-left:1.2rem;">';
            for (var b = 0; b < r.blockers.length; b++) html += '<li>' + esc(r.blockers[b]) + '</li>';
            html += '</ul></div>';
        }

        // Warnings
        if (r.warnings.length) {
            html += '<div class="alert alert-warning" style="margin-bottom:0.5rem;">';
            html += '<strong>Warnings (' + r.warnings.length + ')</strong><ul style="margin:0.3rem 0 0;padding-left:1.2rem;">';
            for (var w = 0; w < r.warnings.length; w++) html += '<li>' + esc(r.warnings[w]) + '</li>';
            html += '</ul></div>';
        }

        // Integrity-specific findings
        var extras = r.integrityExtras || {};
        var hasExtraFindings = false;

        if (extras.outliers && extras.outliers.count > 0) {
            hasExtraFindings = true;
            html += '<div class="alert alert-info" style="margin-bottom:0.5rem;">';
            html += '<strong>Outliers:</strong> ' + extras.outliers.count + ' observation(s) outside IQR fences';
            html += ' [Q1=' + (extras.outliers.q1 != null ? extras.outliers.q1.toFixed(2) : '?') +
                    ', Q3=' + (extras.outliers.q3 != null ? extras.outliers.q3.toFixed(2) : '?') +
                    ', IQR=' + (extras.outliers.iqr != null ? extras.outliers.iqr.toFixed(2) : '?') + ']';
            html += '</div>';
        }

        if (extras.duplicates && extras.duplicates.count > 0) {
            hasExtraFindings = true;
            html += '<div class="alert alert-warning" style="margin-bottom:0.5rem;">';
            html += '<strong>Duplicates:</strong> ' + extras.duplicates.count + ' rows share identical key column values';
            if (!extras.duplicates.reliable) {
                html += ' <em>(no patient-ID column mapped — detection may include false positives)</em>';
            }
            html += '</div>';
        }

        if (extras.balance && !extras.balance.balanced) {
            hasExtraFindings = true;
            html += '<div class="alert alert-warning" style="margin-bottom:0.5rem;">';
            html += '<strong>Treatment balance:</strong> ';
            var issues = extras.balance.details;
            var singleArm = issues.filter(function (d) { return d.issue === 'single-arm'; });
            var tinyArm = issues.filter(function (d) { return d.issue === 'tiny-arm'; });
            var imbalanced = issues.filter(function (d) { return d.issue === 'severe-imbalance' || d.issue === 'moderate-imbalance'; });
            var parts = [];
            if (singleArm.length) parts.push(singleArm.length + ' single-arm stud' + (singleArm.length === 1 ? 'y' : 'ies'));
            if (tinyArm.length) parts.push(tinyArm.length + ' stud' + (tinyArm.length === 1 ? 'y' : 'ies') + ' with <5 participants per arm');
            if (imbalanced.length) parts.push(imbalanced.length + ' stud' + (imbalanced.length === 1 ? 'y' : 'ies') + ' with arm-size ratio >2:1 (verify planned allocation)');
            html += esc(parts.join(', '));
            html += '</div>';
        }

        if (extras.chronology && !extras.chronology.ok) {
            hasExtraFindings = true;
            html += '<div class="alert alert-warning" style="margin-bottom:0.5rem;">';
            html += '<strong>Chronology:</strong> ';
            var chronParts = [];
            if (extras.chronology.negativeCount > 0) chronParts.push(extras.chronology.negativeCount + ' negative time value(s)');
            if (extras.chronology.zeroTimeEventCount > 0) chronParts.push(extras.chronology.zeroTimeEventCount + ' event(s) at time=0 (verify baseline coding)');
            html += chronParts.join('; ');
            html += '</div>';
        }

        // Success — only if truly no findings at all
        if (!r.blockers.length && !r.warnings.length && !hasExtraFindings) {
            html += '<div class="alert alert-success">All integrity checks passed. No blockers or warnings detected.</div>';
        }

        return html;
    }

    // ------------------------------------------------------------------
    //  Main: runIPDIntegrityGate
    // ------------------------------------------------------------------
    function runIPDIntegrityGate() {
        if (!APP.data || !APP.data.length) {
            showNotification('Please load data first', 'warning');
            return;
        }

        var data = APP.data;
        var vars = (typeof ipd80GetCurrentVars === 'function') ? ipd80GetCurrentVars() : {};

        // 1) Run the comprehensive strict QC gate
        var report;
        if (typeof runStrictPreAnalysisQCGate === 'function') {
            report = runStrictPreAnalysisQCGate({ silent: true, mode: 'integrity_gate' });
        } else {
            report = {
                mode: 'integrity_gate',
                generatedAt: new Date().toISOString(),
                pass: true,
                blockers: [],
                warnings: [],
                metrics: { rows: data.length },
                vars: vars,
                qualityScore: 100
            };
        }

        // P0-3 fix: clone blocker/warning arrays to avoid aliasing the
        // object already stored at APP.lastStrictQCReport by the QC gate
        report.blockers = report.blockers.slice();
        report.warnings = report.warnings.slice();

        // 2) Outlier detection — NOT used for survival timeVar because
        // right-skewed survival times routinely exceed IQR fences and
        // long-term survivors are clinically meaningful, not errors.
        // For continuous outcomes, IQR on eventVar is appropriate.
        var outliers = { count: 0, indices: [] };
        if (vars.outcomeType !== 'survival') {
            var outcomeField = vars.eventVar || '';
            outliers = detectOutliers(data, outcomeField);
            if (outliers.count > 0 && outliers.count > data.length * 0.1) {
                report.warnings.push('High outlier rate: ' + outliers.count + ' of ' + data.length + ' observations (' + (outliers.count / data.length * 100).toFixed(1) + '%) are outside IQR fences.');
            }
        }

        // 3) Duplicate detection — use patient-ID if mapped, else key columns
        //    with a caveat that results may include false positives
        var patientIdVar = (vars.patientIdVar || (APP.config && APP.config.patientIdVar) || '');
        var keyFields;
        var hasPatientId = false;
        if (patientIdVar) {
            keyFields = [patientIdVar];
            hasPatientId = true;
        } else {
            // Fallback: all available key columns (study + treatment + outcome + time)
            keyFields = [vars.studyVar, vars.treatmentVar, vars.eventVar].filter(Boolean);
            if (vars.timeVar) keyFields.push(vars.timeVar);
        }
        var duplicates = detectDuplicates(data, keyFields, hasPatientId);
        if (duplicates.count > 0) {
            var dupPct = (duplicates.count / data.length * 100).toFixed(1);
            if (hasPatientId) {
                // With patient-ID, any duplicate is serious
                if (duplicates.count > 1) {
                    report.blockers.push('Duplicate patient IDs: ' + duplicates.count + ' rows (' + dupPct + '%) share identical patient identifiers.');
                } else {
                    report.warnings.push('Possible duplicate: ' + duplicates.count + ' row shares an identical patient identifier.');
                }
            } else if (duplicates.count >= data.length * 0.05) {
                report.warnings.push('Possible duplicates: ' + duplicates.count + ' rows (' + dupPct + '%) share identical key values (no patient-ID column mapped — consider mapping one for reliable detection).');
            }
        } else if (!hasPatientId && keyFields.length > 0) {
            // No duplicates found but detection is unreliable
            // (silent — no warning needed when count is zero)
        }

        // 4) Treatment balance
        var balance = assessTreatmentBalance(data, vars.studyVar, vars.treatmentVar);
        if (!balance.balanced) {
            var severeCount = balance.details.filter(function (d) { return d.issue === 'severe-imbalance'; }).length;
            var moderateCount = balance.details.filter(function (d) { return d.issue === 'moderate-imbalance'; }).length;
            var singleArmCount = balance.details.filter(function (d) { return d.issue === 'single-arm'; }).length;
            if (severeCount > 0) {
                report.warnings.push(severeCount + ' stud' + (severeCount === 1 ? 'y has' : 'ies have') + ' arm-size ratio >3:1 — verify this matches planned allocation.');
            }
            if (moderateCount > 0) {
                report.warnings.push(moderateCount + ' stud' + (moderateCount === 1 ? 'y has' : 'ies have') + ' arm-size ratio >2:1 — verify this matches planned allocation (common in oncology trials).');
            }
            if (singleArmCount > 0) {
                report.warnings.push(singleArmCount + ' single-arm stud' + (singleArmCount === 1 ? 'y' : 'ies') + ' detected — IPD-MA requires at least 2 arms per study.');
            }
            var tinyArmCount = balance.details.filter(function (d) { return d.issue === 'tiny-arm'; }).length;
            if (tinyArmCount > 0) {
                report.warnings.push(tinyArmCount + ' stud' + (tinyArmCount === 1 ? 'y has' : 'ies have') + ' an arm with <5 participants — possible variable-mapping error.');
            }
        }

        // 5) Event rate plausibility (binary/survival — 0% or 100% in any arm
        //    almost always indicates a mapping error, not a real finding)
        if (vars.eventVar && vars.studyVar && vars.treatmentVar &&
            (vars.outcomeType === 'binary' || vars.outcomeType === 'survival')) {
            var armRates = Object.create(null);
            for (var ei = 0; ei < data.length; ei++) {
                var eStudy = data[ei][vars.studyVar];
                var eTrt = data[ei][vars.treatmentVar];
                var eVal = Number(data[ei][vars.eventVar]);
                if (eStudy == null || eTrt == null || !Number.isFinite(eVal)) continue;
                var armKey = String(eStudy) + '\x1F' + String(eTrt);
                if (!armRates[armKey]) armRates[armKey] = { sum: 0, n: 0 };
                armRates[armKey].sum += eVal;
                armRates[armKey].n += 1;
            }
            var extremeArms = 0;
            var armRateKeys = Object.keys(armRates);
            for (var ek = 0; ek < armRateKeys.length; ek++) {
                var arm = armRates[armRateKeys[ek]];
                if (arm.n >= 5) {
                    var rate = arm.sum / arm.n;
                    if (rate <= 0 || rate >= 1) extremeArms++;
                }
            }
            if (extremeArms > 0) {
                report.warnings.push(extremeArms + ' study-arm(s) have 0% or 100% event rate — verify outcome column mapping.');
            }
        }

        // 6) Chronology (survival only — check negatives + zero-time events)
        var chronology = { ok: true, negativeCount: 0, zeroTimeEventCount: 0 };
        if (vars.outcomeType === 'survival' && vars.timeVar) {
            chronology = checkChronology(data, vars.timeVar, vars.eventVar);
            if (chronology.negativeCount > 0) {
                report.warnings.push(chronology.negativeCount + ' negative time value(s) detected — check data coding.');
            }
            if (chronology.zeroTimeEventCount > 0) {
                report.warnings.push(chronology.zeroTimeEventCount + ' event(s) at time=0 — verify baseline event coding.');
            }
        }

        // Attach extras to the report for the HTML renderer
        report.integrityExtras = {
            outliers: outliers,
            duplicates: duplicates,
            balance: balance,
            chronology: chronology
        };

        // Recompute score with the new findings
        report.qualityScore = Math.max(0, 100 - (report.blockers.length * 25) - (report.warnings.length * 7));
        report.pass = report.blockers.length === 0;

        // Store on APP for method-confidence and other consumers
        APP.lastStrictQCReport = report;
        APP.lastIntegrityReport = report;

        // ------------------------------------------------------------------
        //  Update DOM: stat boxes
        // ------------------------------------------------------------------
        var setText = function (id, val) {
            var el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        // Missing rate over mapped analysis variables only (not all columns)
        var missingRate = computeAnalysisMissingRate(data, vars);

        setText('qualityScore', report.qualityScore.toFixed(0) + '%');
        setText('missingRate', (missingRate * 100).toFixed(1) + '%');
        setText('outlierCount', String(outliers.count));
        setText('duplicateCount', String(duplicates.count));
        setText('guardianConfirmatoryStatus', report.pass ? 'PASS' : 'FAIL');

        // Badge (with aria-label for screen readers)
        var badge = document.getElementById('qualityBadge');
        if (badge) {
            if (report.pass) {
                badge.textContent = 'PASS';
                badge.className = 'badge badge-success';
                badge.setAttribute('aria-label', 'Gate status: pass');
            } else if (report.blockers.length) {
                badge.textContent = 'FAIL';
                badge.className = 'badge badge-danger';
                badge.setAttribute('aria-label', 'Gate status: fail — ' + report.blockers.length + ' blocker(s)');
            } else {
                badge.textContent = 'WARN';
                badge.className = 'badge badge-warning';
                badge.setAttribute('aria-label', 'Gate status: warnings present');
            }
        }

        // ------------------------------------------------------------------
        //  Update DOM: qualityChecks findings container
        // ------------------------------------------------------------------
        var checksEl = document.getElementById('qualityChecks');
        if (checksEl) {
            checksEl.innerHTML = buildIntegrityFindingsHTML(report);
        }

        // ------------------------------------------------------------------
        //  Legacy calls: missingness plot + panel switch
        // ------------------------------------------------------------------
        if (typeof switchPanel === 'function') switchPanel('guardian');
        if (typeof drawMissingnessPlot === 'function') drawMissingnessPlot(data);

        // Refresh method-confidence panel so it picks up the new report
        if (typeof refreshMethodConfidencePanel === 'function') {
            requestAnimationFrame(refreshMethodConfidencePanel);
        }

        showNotification('IPD Integrity Gate complete' + (report.pass ? ' — PASS' : ' — ' + report.blockers.length + ' blocker(s)'), report.pass ? 'success' : 'error');

        return report;
    }

    // ------------------------------------------------------------------
    //  Override: replace the old runDataGuardian with the unified gate.
    //  Wrapped in DOMContentLoaded to guarantee this runs after all
    //  modules are parsed, regardless of manifest ordering.
    // ------------------------------------------------------------------
    function installOverride() {
        window.runDataGuardian = runIPDIntegrityGate;
        window.runIPDIntegrityGate = runIPDIntegrityGate;
    }

    // Install immediately (for current manifest order) and also on
    // DOMContentLoaded (as a safety net if load order changes)
    installOverride();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', installOverride);
    } else {
        // Already loaded — ensure override wins
        setTimeout(installOverride, 0);
    }

})();
