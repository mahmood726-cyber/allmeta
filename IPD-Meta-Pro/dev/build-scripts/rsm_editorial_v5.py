#!/usr/bin/env python3
# Legacy HTML mutator retired in manifest-first workflow.
raise SystemExit(
    "This script is retired. dev/modules/ is the authoritative source. "
    "Edit the relevant module and run `python dev/build.py build` instead of mutating ipd-meta-pro.html directly."
)

"""
RSM Editorial Review V5 - Additional Critical Enhancements
==========================================================
More RSM editorial requirements without removing features.
"""

import re

def rsm_editorial_v5():
    with open('ipd-meta-pro.html', 'r', encoding='utf-8') as f:
        content = f.read()

    original_len = len(content)
    enhancements = []

    # =========================================================================
    # 1. RMST (if not already added)
    # =========================================================================
    if 'RMSTAnalysis' not in content:
        rmst = '''
    // ============================================================================
    // RESTRICTED MEAN SURVIVAL TIME (RMST)
    // Reference: Royston P, Parmar MK. BMC Med Res Methodol 2013
    // ============================================================================
    const RMSTAnalysis = {
        calculate: function(times, events, tau) {
            var data = times.map(function(t, i) { return {time: t, event: events[i]}; });
            data.sort(function(a, b) { return a.time - b.time; });
            var n = data.length, nRisk = n, survival = 1;
            var kmCurve = [{time: 0, survival: 1}];
            data.forEach(function(d) {
                if (d.event === 1) survival *= (nRisk - 1) / nRisk;
                kmCurve.push({time: d.time, survival: survival});
                nRisk--;
            });
            var rmst = 0, prevTime = 0, prevSurv = 1;
            for (var i = 1; i < kmCurve.length; i++) {
                var t = Math.min(kmCurve[i].time, tau);
                if (t > prevTime) rmst += prevSurv * (t - prevTime);
                if (kmCurve[i].time >= tau) break;
                prevTime = t; prevSurv = kmCurve[i].survival;
            }
            if (prevTime < tau) rmst += prevSurv * (tau - prevTime);
            return { rmst: rmst, tau: tau };
        },
        show: function() {
            var html = '<div class="modal-overlay active"><div class="modal" style="max-width:600px">';
            html += '<div class="modal-header"><h3>RMST Analysis</h3><button class="modal-close" onclick="this.closest(\\'.modal-overlay\\').remove()">&times;</button></div>';
            html += '<div class="modal-body"><p>RMST = average survival time up to tau. Does not require proportional hazards.</p>';
            html += '<p style="font-size:0.85rem;color:var(--text-secondary)"><em>Royston & Parmar, BMC Med Res Methodol 2013</em></p>';
            html += '</div></div></div>';
            var m = document.createElement('div'); m.innerHTML = html;
            document.body.appendChild(m.firstChild);
        }
    };

'''
        content = content.replace('const APP = {', rmst + '\n    const APP = {')
        enhancements.append("1. RMST Analysis (Royston 2013)")

    # =========================================================================
    # 2. MISSING DATA SENSITIVITY FRAMEWORK
    # =========================================================================
    if 'MissingDataSensitivity' not in content:
        missing_data = '''
    // ============================================================================
    // MISSING DATA SENSITIVITY ANALYSIS (RSM Editorial V5)
    // Reference: White IR, et al. Stat Med 2008;27:711-727
    // ============================================================================
    const MissingDataSensitivity = {
        mechanisms: {
            MCAR: {
                name: 'Missing Completely at Random',
                description: 'Missingness unrelated to any variables',
                analysis: 'Complete case analysis valid but loses power',
                sensitivity: 'Low'
            },
            MAR: {
                name: 'Missing at Random',
                description: 'Missingness related to observed variables only',
                analysis: 'Multiple imputation or mixed models appropriate',
                sensitivity: 'Moderate'
            },
            MNAR: {
                name: 'Missing Not at Random',
                description: 'Missingness related to unobserved values',
                analysis: 'Requires sensitivity analysis (pattern mixture, selection models)',
                sensitivity: 'High - results may be biased'
            }
        },

        // Delta-adjustment sensitivity analysis
        deltaAdjustment: function(effect, se, delta) {
            // Adjust effect by delta to assess sensitivity to MNAR
            var adjusted = effect + delta;
            var z = adjusted / se;
            var p = 2 * (1 - this.normalCDF(Math.abs(z)));
            return {
                original: effect,
                delta: delta,
                adjusted: adjusted,
                se: se,
                z: z,
                p: p,
                stillSignificant: p < 0.05
            };
        },

        // Tipping point analysis
        findTippingPoint: function(effect, se) {
            // Find delta that makes result non-significant
            var tippingPoint = 0;
            var direction = effect > 0 ? -1 : 1;
            var step = 0.01;

            for (var delta = 0; Math.abs(delta) < Math.abs(effect) * 3; delta += direction * step) {
                var adj = effect + delta;
                var z = adj / se;
                var p = 2 * (1 - this.normalCDF(Math.abs(z)));
                if (p >= 0.05) {
                    tippingPoint = delta;
                    break;
                }
            }

            return {
                tippingPoint: tippingPoint,
                interpretation: 'Result becomes non-significant if missing outcomes differ by ' + Math.abs(tippingPoint).toFixed(3) + ' from observed'
            };
        },

        normalCDF: function(x) {
            var a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
            var a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
            var sign = x < 0 ? -1 : 1; x = Math.abs(x) / Math.sqrt(2);
            var t = 1 / (1 + p * x);
            var y = 1 - (((((a5*t + a4)*t) + a3)*t + a2)*t + a1)*t*Math.exp(-x*x);
            return 0.5 * (1 + sign * y);
        },

        showPanel: function() {
            var html = '<div class="modal-overlay active"><div class="modal" style="max-width:750px;max-height:90vh;overflow-y:auto">';
            html += '<div class="modal-header"><h3>Missing Data Sensitivity Analysis</h3>';
            html += '<button class="modal-close" onclick="this.closest(\\'.modal-overlay\\').remove()">&times;</button></div>';
            html += '<div class="modal-body">';

            html += '<h4>Missing Data Mechanisms</h4>';
            html += '<table style="width:100%;border-collapse:collapse;font-size:0.9rem;margin-bottom:1.5rem">';
            html += '<tr style="background:var(--bg-tertiary)"><th style="padding:0.5rem">Mechanism</th><th>Description</th><th>Approach</th></tr>';
            Object.values(this.mechanisms).forEach(function(m) {
                html += '<tr><td style="padding:0.5rem"><strong>' + m.name + '</strong></td>';
                html += '<td>' + m.description + '</td><td>' + m.analysis + '</td></tr>';
            });
            html += '</table>';

            html += '<h4>Delta-Adjustment Analysis</h4>';
            html += '<p style="font-size:0.85rem;margin-bottom:1rem">Test sensitivity of results if missing outcomes differ from observed by delta:</p>';

            html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.5rem;margin-bottom:1rem">';
            html += '<div><label>Effect estimate:</label><input id="missingEffect" type="number" step="0.01" value="0.5" style="width:100%;padding:0.5rem"></div>';
            html += '<div><label>Standard error:</label><input id="missingSE" type="number" step="0.01" value="0.15" style="width:100%;padding:0.5rem"></div>';
            html += '<div><label>Delta (shift):</label><input id="missingDelta" type="number" step="0.05" value="-0.2" style="width:100%;padding:0.5rem"></div>';
            html += '</div>';

            html += '<button class="btn btn-primary" onclick="MissingDataSensitivity.analyze()">Run Sensitivity Analysis</button>';
            html += '<div id="missingResult" style="margin-top:1.5rem;display:none"></div>';

            html += '<div style="margin-top:1.5rem;padding:1rem;background:var(--bg-tertiary);border-radius:8px">';
            html += '<h4>Reporting Recommendations (White et al. 2008)</h4>';
            html += '<ol style="font-size:0.85rem;margin-left:1.5rem">';
            html += '<li>Report extent of missing data by variable</li>';
            html += '<li>State assumed missing data mechanism</li>';
            html += '<li>Describe primary analysis approach</li>';
            html += '<li>Conduct sensitivity analyses under MNAR</li>';
            html += '<li>Report tipping point if applicable</li>';
            html += '</ol></div>';

            html += '</div></div></div>';
            var m = document.createElement('div'); m.innerHTML = html;
            document.body.appendChild(m.firstChild);
        },

        analyze: function() {
            var effect = parseFloat(document.getElementById('missingEffect').value);
            var se = parseFloat(document.getElementById('missingSE').value);
            var delta = parseFloat(document.getElementById('missingDelta').value);

            var adj = this.deltaAdjustment(effect, se, delta);
            var tip = this.findTippingPoint(effect, se);

            var html = '<div style="padding:1rem;background:rgba(59,130,246,0.1);border-radius:8px">';
            html += '<h4>Results</h4>';
            html += '<table style="width:100%;margin-top:0.5rem;border-collapse:collapse">';
            html += '<tr><td style="padding:0.5rem"><strong>Original effect:</strong></td><td>' + effect.toFixed(3) + '</td></tr>';
            html += '<tr><td style="padding:0.5rem"><strong>Adjusted effect (delta=' + delta + '):</strong></td><td>' + adj.adjusted.toFixed(3) + '</td></tr>';
            html += '<tr><td style="padding:0.5rem"><strong>Adjusted p-value:</strong></td><td style="' + (adj.stillSignificant ? 'color:#22c55e' : 'color:#ef4444') + '">' + adj.p.toFixed(4) + '</td></tr>';
            html += '<tr><td style="padding:0.5rem"><strong>Still significant?</strong></td><td>' + (adj.stillSignificant ? 'Yes' : 'No') + '</td></tr>';
            html += '</table>';
            html += '<p style="margin-top:1rem"><strong>Tipping point:</strong> ' + tip.tippingPoint.toFixed(3) + '</p>';
            html += '<p style="font-size:0.9rem"><em>' + tip.interpretation + '</em></p>';
            html += '</div>';

            document.getElementById('missingResult').innerHTML = html;
            document.getElementById('missingResult').style.display = 'block';
        }
    };

'''
        content = content.replace('const APP = {', missing_data + '\n    const APP = {')
        enhancements.append("2. Missing Data Sensitivity Framework (White 2008)")

    # =========================================================================
    # 3. CONFLICT OF INTEREST DOCUMENTATION
    # =========================================================================
    if 'ConflictOfInterest' not in content:
        coi = '''
    // ============================================================================
    // CONFLICT OF INTEREST DOCUMENTATION (RSM Editorial V5)
    // Reference: ICMJE Recommendations
    // ============================================================================
    const ConflictOfInterest = {
        categories: [
            'Financial relationships with industry',
            'Grants or research funding',
            'Employment by commercial entity',
            'Stock ownership or options',
            'Consultancy fees',
            'Expert testimony',
            'Patents or royalties',
            'Travel/meeting expenses',
            'Personal relationships',
            'Academic competition',
            'Intellectual preconceptions'
        ],

        generateStatement: function(hasConflicts, details) {
            if (!hasConflicts) {
                return 'The authors declare no conflicts of interest. All authors have completed the ICMJE uniform disclosure form. No author has received funding from any commercial entity related to this work.';
            } else {
                return 'The authors declare the following potential conflicts of interest: ' + details + '. All other authors declare no conflicts of interest. The funders had no role in study design, data collection, analysis, interpretation, or manuscript preparation.';
            }
        },

        show: function() {
            var html = '<div class="modal-overlay active"><div class="modal" style="max-width:700px;max-height:90vh;overflow-y:auto">';
            html += '<div class="modal-header"><h3>Conflict of Interest Declaration</h3>';
            html += '<button class="modal-close" onclick="this.closest(\\'.modal-overlay\\').remove()">&times;</button></div>';
            html += '<div class="modal-body">';

            html += '<p style="margin-bottom:1rem">Complete this declaration for all authors (ICMJE requirement):</p>';

            html += '<div style="margin-bottom:1rem">';
            html += '<label><input type="radio" name="hasCOI" value="no" checked onchange="ConflictOfInterest.toggleDetails(false)"> No conflicts of interest to declare</label><br>';
            html += '<label><input type="radio" name="hasCOI" value="yes" onchange="ConflictOfInterest.toggleDetails(true)"> Potential conflicts to disclose</label>';
            html += '</div>';

            html += '<div id="coiDetails" style="display:none;margin-bottom:1rem">';
            html += '<h4>Check all that apply:</h4>';
            this.categories.forEach(function(cat, i) {
                html += '<label style="display:block;margin:0.25rem 0"><input type="checkbox" id="coi' + i + '"> ' + cat + '</label>';
            });
            html += '<div style="margin-top:1rem"><label><strong>Details:</strong></label>';
            html += '<textarea id="coiText" style="width:100%;height:80px;padding:0.5rem;margin-top:0.25rem" placeholder="Describe specific conflicts..."></textarea></div>';
            html += '</div>';

            html += '<button class="btn btn-primary" onclick="ConflictOfInterest.generate()">Generate Statement</button>';

            html += '<div id="coiStatement" style="margin-top:1.5rem;display:none"></div>';

            html += '<div style="margin-top:1.5rem;padding:1rem;background:var(--bg-tertiary);border-radius:8px">';
            html += '<h4>ICMJE Guidelines</h4>';
            html += '<p style="font-size:0.85rem">All authors must disclose any financial and personal relationships that could be viewed as potential conflicts of interest. This includes:</p>';
            html += '<ul style="font-size:0.85rem;margin-left:1.5rem">';
            html += '<li>Relationships in the past 36 months</li>';
            html += '<li>Both direct and indirect financial interests</li>';
            html += '<li>Relationships of immediate family members</li>';
            html += '</ul></div>';

            html += '</div></div></div>';
            var m = document.createElement('div'); m.innerHTML = html;
            document.body.appendChild(m.firstChild);
        },

        toggleDetails: function(show) {
            document.getElementById('coiDetails').style.display = show ? 'block' : 'none';
        },

        generate: function() {
            var hasConflicts = document.querySelector('input[name="hasCOI"]:checked').value === 'yes';
            var details = document.getElementById('coiText') ? document.getElementById('coiText').value : '';
            var statement = this.generateStatement(hasConflicts, details);

            var html = '<div style="padding:1rem;background:rgba(34,197,94,0.1);border-radius:8px">';
            html += '<h4>COI Statement</h4>';
            html += '<textarea style="width:100%;height:100px;padding:0.5rem;margin-top:0.5rem" readonly>' + statement + '</textarea>';
            html += '<button class="btn btn-secondary" style="margin-top:0.5rem" onclick="navigator.clipboard.writeText(this.previousElementSibling.value)">Copy</button>';
            html += '</div>';

            document.getElementById('coiStatement').innerHTML = html;
            document.getElementById('coiStatement').style.display = 'block';
        }
    };

'''
        content = content.replace('const APP = {', coi + '\n    const APP = {')
        enhancements.append("3. Conflict of Interest Documentation (ICMJE)")

    # =========================================================================
    # 4. CERTAINTY IN NMA (CINeMA-like assessment)
    # =========================================================================
    if 'NMACertainty' not in content:
        cinema = '''
    // ============================================================================
    // CERTAINTY IN NMA (CINeMA-like) (RSM Editorial V5)
    // Reference: Nikolakopoulou A, et al. PLoS Med 2020
    // ============================================================================
    const NMACertainty = {
        domains: {
            withinStudyBias: { name: 'Within-study bias', weight: 1 },
            reportingBias: { name: 'Reporting bias', weight: 1 },
            indirectness: { name: 'Indirectness', weight: 1 },
            imprecision: { name: 'Imprecision', weight: 1 },
            heterogeneity: { name: 'Heterogeneity', weight: 1 },
            incoherence: { name: 'Incoherence', weight: 1 }
        },

        levels: ['No concerns', 'Some concerns', 'Major concerns'],
        ratings: ['High', 'Moderate', 'Low', 'Very Low'],

        assess: function(comparison, assessments) {
            var totalConcerns = 0;
            var domainResults = {};

            Object.keys(this.domains).forEach(function(domain) {
                var level = assessments[domain] || 0;
                domainResults[domain] = {
                    level: level,
                    label: NMACertainty.levels[level]
                };
                totalConcerns += level;
            });

            // Map total concerns to certainty rating
            var certainty;
            if (totalConcerns === 0) certainty = 0; // High
            else if (totalConcerns <= 2) certainty = 1; // Moderate
            else if (totalConcerns <= 4) certainty = 2; // Low
            else certainty = 3; // Very Low

            return {
                comparison: comparison,
                domains: domainResults,
                totalConcerns: totalConcerns,
                certainty: certainty,
                rating: this.ratings[certainty]
            };
        },

        show: function() {
            var html = '<div class="modal-overlay active"><div class="modal" style="max-width:800px;max-height:90vh;overflow-y:auto">';
            html += '<div class="modal-header"><h3>CINeMA: Confidence in NMA</h3>';
            html += '<button class="modal-close" onclick="this.closest(\\'.modal-overlay\\').remove()">&times;</button></div>';
            html += '<div class="modal-body">';

            html += '<p style="margin-bottom:1rem">Assess certainty for each treatment comparison. <em>(Nikolakopoulou et al. PLoS Med 2020)</em></p>';

            html += '<div style="margin-bottom:1.5rem"><label><strong>Comparison:</strong></label>';
            html += '<input id="cinemaComparison" type="text" placeholder="e.g., Treatment A vs Treatment B" style="width:100%;padding:0.5rem;margin-top:0.25rem"></div>';

            html += '<h4>Rate Each Domain:</h4>';
            html += '<table style="width:100%;border-collapse:collapse;margin-bottom:1rem">';
            html += '<tr style="background:var(--bg-tertiary)"><th style="padding:0.5rem">Domain</th><th>No concerns</th><th>Some concerns</th><th>Major concerns</th></tr>';

            Object.entries(this.domains).forEach(function(entry) {
                var key = entry[0], domain = entry[1];
                html += '<tr><td style="padding:0.5rem"><strong>' + domain.name + '</strong></td>';
                for (var i = 0; i < 3; i++) {
                    html += '<td style="text-align:center"><input type="radio" name="' + key + '" value="' + i + '"' + (i === 0 ? ' checked' : '') + '></td>';
                }
                html += '</tr>';
            });
            html += '</table>';

            html += '<button class="btn btn-primary" onclick="NMACertainty.calculate()">Calculate Certainty</button>';
            html += '<div id="cinemaResult" style="margin-top:1.5rem;display:none"></div>';

            html += '<div style="margin-top:1.5rem;padding:1rem;background:var(--bg-tertiary);border-radius:8px">';
            html += '<h4>CINeMA Domains Explained</h4>';
            html += '<ul style="font-size:0.85rem;margin-left:1.5rem">';
            html += '<li><strong>Within-study bias:</strong> RoB in contributing studies</li>';
            html += '<li><strong>Reporting bias:</strong> Small-study effects, publication bias</li>';
            html += '<li><strong>Indirectness:</strong> Applicability to target population</li>';
            html += '<li><strong>Imprecision:</strong> Width of confidence interval</li>';
            html += '<li><strong>Heterogeneity:</strong> Variability in effects</li>';
            html += '<li><strong>Incoherence:</strong> Inconsistency between direct and indirect</li>';
            html += '</ul></div>';

            html += '</div></div></div>';
            var m = document.createElement('div'); m.innerHTML = html;
            document.body.appendChild(m.firstChild);
        },

        calculate: function() {
            var comparison = document.getElementById('cinemaComparison').value || 'Unnamed comparison';
            var assessments = {};

            Object.keys(this.domains).forEach(function(domain) {
                var selected = document.querySelector('input[name="' + domain + '"]:checked');
                assessments[domain] = selected ? parseInt(selected.value) : 0;
            });

            var result = this.assess(comparison, assessments);
            var colors = ['#22c55e', '#eab308', '#f97316', '#ef4444'];

            var html = '<div style="padding:1.5rem;background:' + colors[result.certainty] + '20;border-left:4px solid ' + colors[result.certainty] + ';border-radius:8px">';
            html += '<h3 style="color:' + colors[result.certainty] + ';margin:0">Certainty: ' + result.rating + '</h3>';
            html += '<p style="margin-top:0.5rem">Comparison: ' + result.comparison + '</p>';
            html += '</div>';

            html += '<h4 style="margin-top:1rem">Domain Assessments:</h4>';
            html += '<ul style="margin-left:1.5rem">';
            Object.entries(result.domains).forEach(function(entry) {
                var domain = entry[0], data = entry[1];
                var icon = data.level === 0 ? '&#10003;' : data.level === 1 ? '~' : '&#10007;';
                html += '<li>' + NMACertainty.domains[domain].name + ': ' + icon + ' ' + data.label + '</li>';
            });
            html += '</ul>';

            document.getElementById('cinemaResult').innerHTML = html;
            document.getElementById('cinemaResult').style.display = 'block';
        }
    };

'''
        content = content.replace('const APP = {', cinema + '\n    const APP = {')
        enhancements.append("4. CINeMA: Confidence in NMA (Nikolakopoulou 2020)")

    # =========================================================================
    # 5. AUTHOR CONTRIBUTION STATEMENT (CRediT)
    # =========================================================================
    if 'AuthorContributions' not in content:
        credit = '''
    // ============================================================================
    // CRediT AUTHOR CONTRIBUTION STATEMENT (RSM Editorial V5)
    // Reference: Brand A, et al. Learned Publishing 2015
    // ============================================================================
    const AuthorContributions = {
        roles: [
            'Conceptualization',
            'Data curation',
            'Formal analysis',
            'Funding acquisition',
            'Investigation',
            'Methodology',
            'Project administration',
            'Resources',
            'Software',
            'Supervision',
            'Validation',
            'Visualization',
            'Writing - original draft',
            'Writing - review & editing'
        ],

        show: function() {
            var html = '<div class="modal-overlay active"><div class="modal" style="max-width:750px;max-height:90vh;overflow-y:auto">';
            html += '<div class="modal-header"><h3>CRediT Author Contributions</h3>';
            html += '<button class="modal-close" onclick="this.closest(\\'.modal-overlay\\').remove()">&times;</button></div>';
            html += '<div class="modal-body">';

            html += '<p style="margin-bottom:1rem">Assign contributions using the CRediT taxonomy. <em>(casrai.org/credit)</em></p>';

            html += '<div style="margin-bottom:1rem"><label><strong>Authors (comma-separated):</strong></label>';
            html += '<input id="creditAuthors" type="text" placeholder="Smith J, Jones A, Williams B" style="width:100%;padding:0.5rem;margin-top:0.25rem"></div>';

            html += '<h4>Select roles for each contribution:</h4>';
            html += '<div style="max-height:300px;overflow-y:auto;border:1px solid var(--border-color);padding:1rem;border-radius:8px">';
            this.roles.forEach(function(role, i) {
                html += '<div style="margin-bottom:0.75rem"><label><strong>' + role + ':</strong></label>';
                html += '<input id="credit' + i + '" type="text" placeholder="Author initials (e.g., JS, AJ)" style="width:100%;padding:0.5rem;margin-top:0.25rem"></div>';
            });
            html += '</div>';

            html += '<button class="btn btn-primary" style="margin-top:1rem" onclick="AuthorContributions.generate()">Generate Statement</button>';
            html += '<div id="creditResult" style="margin-top:1.5rem;display:none"></div>';

            html += '</div></div></div>';
            var m = document.createElement('div'); m.innerHTML = html;
            document.body.appendChild(m.firstChild);
        },

        generate: function() {
            var authors = document.getElementById('creditAuthors').value;
            var contributions = [];
            var self = this;

            this.roles.forEach(function(role, i) {
                var value = document.getElementById('credit' + i).value.trim();
                if (value) contributions.push('<strong>' + role + ':</strong> ' + value);
            });

            if (contributions.length === 0) {
                alert('Please assign at least one role');
                return;
            }

            var statement = '<strong>Author Contributions:</strong> ' + contributions.join('. ') + '.';

            var html = '<div style="padding:1rem;background:rgba(34,197,94,0.1);border-radius:8px">';
            html += '<h4>CRediT Statement</h4>';
            html += '<div style="margin-top:0.5rem;padding:1rem;background:var(--bg-secondary);border-radius:8px">' + statement + '</div>';
            html += '<button class="btn btn-secondary" style="margin-top:0.5rem" onclick="navigator.clipboard.writeText(this.previousElementSibling.innerText)">Copy</button>';
            html += '</div>';

            document.getElementById('creditResult').innerHTML = html;
            document.getElementById('creditResult').style.display = 'block';
        }
    };

'''
        content = content.replace('const APP = {', credit + '\n    const APP = {')
        enhancements.append("5. CRediT Author Contributions (CASRAI)")

    # =========================================================================
    # 6. ADD UI BUTTONS
    # =========================================================================
    new_buttons = '''
                    <div style="margin-top:0.5rem;display:flex;flex-wrap:wrap;gap:0.4rem">
                        <button class="btn btn-warning btn-sm" onclick="MissingDataSensitivity.showPanel()" title="MNAR sensitivity">Missing Data</button>
                        <button class="btn btn-warning btn-sm" onclick="NMACertainty.show()" title="CINeMA for NMA">NMA Certainty</button>
                        <button class="btn btn-warning btn-sm" onclick="ConflictOfInterest.show()" title="COI declaration">COI</button>
                        <button class="btn btn-warning btn-sm" onclick="AuthorContributions.show()" title="CRediT roles">Author Contrib.</button>
                    </div>
'''
    if 'Missing Data' not in content and 'MissingDataSensitivity' in content:
        # Add after existing RSM buttons
        if 'Data Avail' in content:
            content = content.replace(
                'Data Avail.</button>\n                        </div>',
                'Data Avail.</button>' + new_buttons + '\n                        </div>'
            )
            enhancements.append("6. UI Buttons for Additional RSM Tools")

    # =========================================================================
    # SAVE
    # =========================================================================
    with open('ipd-meta-pro.html', 'w', encoding='utf-8') as f:
        f.write(content)

    new_len = len(content)

    print("=" * 70)
    print("RSM EDITORIAL REVIEW V5 - ADDITIONAL ENHANCEMENTS")
    print("=" * 70)
    print(f"\nOriginal: {original_len:,} -> New: {new_len:,} (+{new_len-original_len:,})")
    print(f"\n{len(enhancements)} additional enhancements:")
    for e in enhancements:
        print(f"  + {e}")

    print("\n" + "=" * 70)
    print("ADDITIONAL RSM REQUIREMENTS ADDRESSED:")
    print("-" * 70)
    print("""
    1. MISSING DATA SENSITIVITY
       - Delta-adjustment analysis
       - Tipping point analysis
       - MCAR/MAR/MNAR guidance

    2. CONFLICT OF INTEREST
       - ICMJE-compliant declaration
       - Category checklist
       - Statement generator

    3. CINeMA FOR NMA
       - 6-domain certainty assessment
       - Confidence rating

    4. CRediT AUTHOR CONTRIBUTIONS
       - 14 standardized roles
       - Statement generator

    ALL FEATURES PRESERVED - NOTHING REMOVED
    """)
    print("=" * 70)

if __name__ == '__main__':
    rsm_editorial_v5()
