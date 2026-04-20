const HelpSystem = {

    // Quick Start Guide

    showQuickStart: function() {

        const content = `

            <div class="help-content">

                <h2>Quick Start Guide</h2>

                <div class="help-section">

                    <h3>Step 1: Import Your Data</h3>

                    <p>Click the <strong>Data</strong> tab and use one of these methods:</p>

                    <ul>

                        <li><strong>File Upload:</strong> Drag & drop CSV/Excel files</li>

                        <li><strong>Copy/Paste:</strong> Paste from spreadsheet</li>

                        <li><strong>Example Data:</strong> Load built-in datasets</li>

                    </ul>

                </div>

                <div class="help-section">

                    <h3>Step 2: Configure Variables</h3>

                    <p>Map your columns to required fields:</p>

                    <ul>

                        <li><strong>Outcome:</strong> The primary endpoint (e.g., survival time)</li>

                        <li><strong>Event:</strong> Event indicator (1=event, 0=censored)</li>

                        <li><strong>Treatment:</strong> Treatment group variable</li>

                        <li><strong>Study ID:</strong> Identifier for each study</li>

                    </ul>

                </div>

                <div class="help-section">

                    <h3>Step 3: Run Analysis</h3>

                    <ol>

                        <li>Choose estimator (REML recommended)</li>

                        <li>Select confidence interval method</li>

                        <li>Click "Run Meta-Analysis"</li>

                    </ol>

                </div>

                <div class="help-section">

                    <h3>Step 4: Interpret Results</h3>

                    <ul>

                        <li><strong>Forest Plot:</strong> Visualize study effects</li>

                        <li><strong>I² Statistic:</strong> Heterogeneity measure</li>

                        <li><strong>Publication Bias:</strong> Egger's test, funnel plot</li>

                    </ul>

                </div>

                <div class="alert alert-info">

                    <strong>💡 Tip:</strong> Press <kbd>Ctrl+S</kbd> to save your session at any time.

                </div>

            </div>

        `;

        this.showModal('Quick Start Guide', content);

    },



    // Interactive Tutorials

    showTutorials: function() {

        const content = `

            <div class="help-content">

                <h2>Interactive Tutorials</h2>

                <div class="tutorial-list">

                    <div class="tutorial-card" tabindex="0" role="button" onclick="HelpSystem.runTutorial('basic')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click();}">

                        <div class="tutorial-icon">📊</div>

                        <div class="tutorial-info">

                            <h4>Basic Meta-Analysis</h4>

                            <p>Learn the fundamentals with a step-by-step walkthrough</p>

                            <span class="badge badge-success">Beginner</span>

                        </div>

                    </div>

                    <div class="tutorial-card" tabindex="0" role="button" onclick="HelpSystem.runTutorial('heterogeneity')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click();}">

                        <div class="tutorial-icon">📈</div>

                        <div class="tutorial-info">

                            <h4>Understanding Heterogeneity</h4>

                            <p>I², Q statistic, and estimator selection</p>

                            <span class="badge badge-warning">Intermediate</span>

                        </div>

                    </div>

                    <div class="tutorial-card" tabindex="0" role="button" onclick="HelpSystem.runTutorial('pubBias')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click();}">

                        <div class="tutorial-icon">🔍</div>

                        <div class="tutorial-info">

                            <h4>Publication Bias Assessment</h4>

                            <p>Funnel plots, Egger's test, trim-and-fill</p>

                            <span class="badge badge-warning">Intermediate</span>

                        </div>

                    </div>

                    <div class="tutorial-card" tabindex="0" role="button" onclick="HelpSystem.runTutorial('bayesian')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click();}">

                        <div class="tutorial-icon">🎲</div>

                        <div class="tutorial-info">

                            <h4>Bayesian Meta-Analysis</h4>

                            <p>MCMC sampling, prior specification, diagnostics</p>

                            <span class="badge badge-danger">Advanced</span>

                        </div>

                    </div>

                    <div class="tutorial-card" tabindex="0" role="button" onclick="HelpSystem.runTutorial('nma')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click();}">

                        <div class="tutorial-icon">🔗</div>

                        <div class="tutorial-info">

                            <h4>Network Meta-Analysis</h4>

                            <p>Multiple treatment comparisons, SUCRA</p>

                            <span class="badge badge-danger">Advanced</span>

                        </div>

                    </div>

                </div>

            </div>

        `;

        this.showModal('Interactive Tutorials', content, 'large');

    },



    // Run specific tutorial

    runTutorial: function(type) {

        this.closeModal();

        const tutorials = {

            basic: [

                { target: '[data-panel="data"]', text: 'Start by clicking the Data tab to import your dataset.' },

                { target: '#fileInput', text: 'Upload a CSV or Excel file with your study data.' },

                { target: '#outcomeSelect', text: 'Select your outcome variable (e.g., effect size, hazard ratio).' },

                { target: '[data-panel="analysis"]', text: 'Go to the Analysis tab to configure your meta-analysis.' },

                { target: '#runMetaAnalysis', text: 'Click to run the analysis and generate results.' }

            ],

            heterogeneity: [

                { target: '#heterogeneityCard', text: 'Heterogeneity measures how much study results vary.' },

                { target: '#i2Display', text: 'I² shows % of variability due to heterogeneity (>75% = high).' },

                { target: '#estimatorSelect', text: 'REML is recommended for most cases; DL is faster for large datasets.' }

            ],

            pubBias: [

                { target: '[data-panel="publication-bias"]', text: 'Publication bias occurs when studies are selectively published.' },

                { target: '#funnelPlot', text: 'Funnel plot asymmetry suggests potential bias.' },

                { target: '#eggerTest', text: 'Egger\'s test p<0.05 indicates significant asymmetry.' }

            ],

            bayesian: [

                { target: '[data-panel="bayesian"]', text: 'Bayesian analysis provides probability distributions for parameters.' },

                { target: '#mcmcSettings', text: 'Configure MCMC: 10,000+ samples recommended.' },

                { target: '#priorSettings', text: 'Specify prior distributions for μ and τ.' }

            ],

            nma: [

                { target: '[data-panel="nma"]', text: 'Network meta-analysis compares multiple treatments.' },

                { target: '#networkGraph', text: 'Network graph shows treatment comparisons.' },

                { target: '#sucraTable', text: 'SUCRA ranks treatments by effectiveness.' }

            ]

        };



        if (tutorials[type]) {

            this.startGuidedTour(tutorials[type]);

        }

    },



    // Start guided tour

    startGuidedTour: function(steps) {

        let stepIndex = 0;



        const showStep = () => {

            if (stepIndex >= steps.length) {

                this.endTour();

                return;

            }



            const step = steps[stepIndex];

            const target = document.querySelector(step.target);



            // Create tooltip

            const tooltip = document.createElement('div');

            tooltip.className = 'tour-tooltip';

            tooltip.innerHTML = `

                <div class="tour-content">${step.text}</div>

                <div class="tour-footer">

                    <span class="tour-progress">${stepIndex + 1} / ${steps.length}</span>

                    <div class="tour-buttons">

                        ${stepIndex > 0 ? '<button class="btn btn-secondary btn-sm" onclick="HelpSystem.prevStep()">Back</button>' : ''}

                        <button class="btn btn-primary btn-sm" onclick="HelpSystem.nextStep()">

                            ${stepIndex === steps.length - 1 ? 'Finish' : 'Next'}

                        </button>

                    </div>

                </div>

            `;

            tooltip.style.cssText = `

                position: fixed; z-index: 10001; background: var(--bg-card);

                border: 2px solid var(--accent-primary); border-radius: 12px;

                padding: 1rem; max-width: 300px; box-shadow: var(--shadow-lg);

            `;



            // Remove existing tooltip

            document.querySelectorAll('.tour-tooltip').forEach(t => t.remove());

            document.querySelectorAll('.tour-highlight').forEach(h => h.classList.remove('tour-highlight'));



            if (target) {

                target.classList.add('tour-highlight');

                target.scrollIntoView({ behavior: 'smooth', block: 'center' });



                const rect = target.getBoundingClientRect();

                tooltip.style.top = (rect.bottom + 10) + 'px';

                tooltip.style.left = Math.max(10, rect.left) + 'px';

            } else {

                tooltip.style.top = '50%';

                tooltip.style.left = '50%';

                tooltip.style.transform = 'translate(-50%, -50%)';

            }



            document.body.appendChild(tooltip);

            this.currentStep = stepIndex;

            this.tourSteps = steps;

        };



        showStep();

    },



    nextStep: function() {

        if (this.tourSteps && this.currentStep < this.tourSteps.length - 1) {

            this.currentStep++;

            this.startGuidedTour(this.tourSteps.slice(this.currentStep));

        } else {

            this.endTour();

        }

    },



    prevStep: function() {

        if (this.tourSteps && this.currentStep > 0) {

            this.currentStep--;

            this.startGuidedTour(this.tourSteps.slice(this.currentStep));

        }

    },



    endTour: function() {

        document.querySelectorAll('.tour-tooltip').forEach(t => t.remove());

        document.querySelectorAll('.tour-highlight').forEach(h => h.classList.remove('tour-highlight'));

        showNotification('Tutorial completed!', 'success');

    },



    // Feature Guide

    showFeatureGuide: function() {

        const content = `

            <div class="help-content">

                <h2>&#x2B50; Feature Guide</h2>

                <div class="feature-grid">

                    <div class="feature-item">

                        <h4>🔄 Random-Effects Models</h4>

                        <p>7 estimators: REML, DL, PM, SJ, HE, ML, EB</p>

                    </div>

                    <div class="feature-item">

                        <h4>📊 Heterogeneity Analysis</h4>

                        <p>I², H², Q-test, prediction intervals, Q-profile CI</p>

                    </div>

                    <div class="feature-item">

                        <h4>🔍 Publication Bias</h4>

                        <p>Funnel plot, Egger's, Begg's, trim-and-fill, PET-PEESE</p>

                    </div>

                    <div class="feature-item">

                        <h4>🎲 Bayesian Analysis</h4>

                        <p>MCMC with Metropolis-Hastings, convergence diagnostics</p>

                    </div>

                    <div class="feature-item">

                        <h4>📈 Meta-Regression</h4>

                        <p>Moderator analysis with knot-based splines</p>

                    </div>

                    <div class="feature-item">

                        <h4>🔗 Network Meta-Analysis</h4>

                        <p>Multiple comparisons, SUCRA, league tables</p>

                    </div>

                    <div class="feature-item">

                        <h4>Data Guardian</h4>

                        <p>Automated data quality checks and validation</p>

                    </div>

                    <div class="feature-item">

                        <h4>🔧 MICE Imputation</h4>

                        <p>Multiple imputation for missing data (PMM method)</p>

                    </div>

                    <div class="feature-item">

                        <h4>↩️ Undo/Redo</h4>

                        <p>Full state history with Ctrl+Z / Ctrl+Y</p>

                    </div>

                    <div class="feature-item">

                        <h4>💾 Session Management</h4>

                        <p>Auto-save, export/import JSON sessions</p>

                    </div>

                    <div class="feature-item">

                        <h4>GRADE Assessment</h4>

                        <p>Evidence quality rating system</p>

                    </div>

                    <div class="feature-item">

                        <h4>📤 Export Options</h4>

                        <p>PDF reports, CSV, R code, publication-ready tables</p>

                    </div>

                </div>

            </div>

        `;

        this.showModal('Feature Guide', content, 'large');

    },



    // Keyboard Shortcuts

    showKeyboardShortcuts: function() {

        const content = `

            <div class="help-content">

                <h2>&#x2328;&#xFE0F; Keyboard Shortcuts</h2>

                <table class="shortcuts-table">

                    <thead>

                        <tr><th>Shortcut</th><th>Action</th></tr>

                    </thead>

                    <tbody>

                        <tr><td><kbd>Ctrl</kbd> + <kbd>Z</kbd></td><td>Undo last action</td></tr>

                        <tr><td><kbd>Ctrl</kbd> + <kbd>Y</kbd></td><td>Redo last action</td></tr>

                        <tr><td><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd></td><td>Redo (alternate)</td></tr>

                        <tr><td><kbd>Ctrl</kbd> + <kbd>S</kbd></td><td>Save session</td></tr>

                        <tr><td><kbd>Escape</kbd></td><td>Close modal / cancel edit</td></tr>

                        <tr><td><kbd>Enter</kbd></td><td>Confirm inline edit</td></tr>

                        <tr><td><kbd>Tab</kbd></td><td>Navigate between fields</td></tr>

                    </tbody>

                </table>

                <div class="alert alert-info" style="margin-top:1rem;">

                    <strong>💡 Tip:</strong> Double-click any data cell to edit it directly.

                </div>

            </div>

        `;

        this.showModal('Keyboard Shortcuts', content);

    },



    // Limitations & Caveats

    showLimitations: function() {

        const content = `

            <div class="help-content">

                <h2>&#x26A0;&#xFE0F; Limitations & Caveats</h2>



                <div class="limitation-section">

                    <h3>📊 Meta-Analysis Requirements</h3>

                    <ul>

                        <li><strong>Minimum Studies:</strong> k ≥ 3 recommended for reliable heterogeneity estimation. Results with k &lt; 3 should be interpreted with extreme caution.</li>

                        <li><strong>Effect Size Independence:</strong> Assumes independent effect sizes per study. Use robust variance estimation for multiple outcomes per study.</li>

                        <li><strong>Publication Bias:</strong> Statistical tests have low power with k &lt; 10 studies.</li>

                    </ul>

                </div>



                <div class="limitation-section">

                    <h3>🔧 MICE Imputation</h3>

                    <ul>

                        <li>Uses Predictive Mean Matching (PMM) - a simplified implementation</li>

                        <li>Assumes Missing At Random (MAR) mechanism</li>

                        <li>Not suitable for MNAR data without sensitivity analysis</li>

                        <li>Default m=5 imputations; increase for higher fraction missing</li>

                        <li>For production use, consider R's mice package or STATA's mi</li>

                    </ul>

                </div>



                <div class="limitation-section">

                    <h3>🔗 Network Meta-Analysis</h3>

                    <ul>

                        <li>Uses Bucher's method for indirect comparisons (frequentist)</li>

                        <li>Assumes transitivity and consistency</li>

                        <li>No automated inconsistency testing - interpret with caution</li>

                        <li>For complex networks, consider R's netmeta or gemtc packages</li>

                    </ul>

                </div>



                <div class="limitation-section">

                    <h3>🎲 Bayesian Analysis</h3>

                    <ul>

                        <li>MCMC uses Metropolis-Hastings with half-Cauchy prior for τ</li>

                        <li>Default burn-in (1,000) may be insufficient for complex models</li>

                        <li>Always check convergence diagnostics (trace plots, R-hat)</li>

                        <li>For sensitivity analysis, vary prior specifications</li>

                    </ul>

                </div>



                <div class="limitation-section">

                    <h3>⚡ Performance</h3>

                    <ul>

                        <li>Large datasets (n &gt; 10,000 IPD records) may slow down</li>

                        <li>MCMC with &gt; 50,000 samples uses Web Workers but still intensive</li>

                        <li>Consider data sampling for exploratory analysis</li>

                    </ul>

                </div>



                <div class="alert alert-warning">

                    <strong>Important:</strong> This tool is for research and educational purposes. Always validate results against established software (R metafor, Stata) for critical applications.

                </div>

            </div>

        `;

        this.showModal('Limitations & Caveats', content, 'large');

    },



    // About

    showAbout: function() {

        const content = `

            <div class="help-content about-content">

                <div class="about-header">

                    <div class="about-logo">IPD</div>

                    <div>

                        <h2>IPD Meta-Analysis Pro</h2>

                        <p class="version">Version 2.0 | January 2026</p>

                    </div>

                </div>



                <div class="about-section">

                    <h4>About</h4>

                    <p>A comprehensive Individual Patient Data meta-analysis tool implementing state-of-the-art statistical methods. Validated against R metafor package.</p>

                </div>



                <div class="about-section">

                    <h4>Features</h4>

                    <ul>

                        <li>7 heterogeneity estimators (REML, DL, PM, SJ, HE, ML, EB)</li>

                        <li>Bayesian MCMC with convergence diagnostics</li>

                        <li>Network meta-analysis with SUCRA</li>

                        <li>Publication bias suite (10+ methods)</li>

                        <li>Multiple imputation (MICE)</li>

                        <li>GRADE evidence assessment</li>

                    </ul>

                </div>



                <div class="about-section">

                    <h4>References</h4>

                    <ul class="references-list">

                        <li>Viechtbauer W. (2010). metafor: Meta-Analysis Package for R.</li>

                        <li>Higgins JPT, Thompson SG. (2002). Quantifying heterogeneity. Statistics in Medicine.</li>

                        <li>DerSimonian R, Laird N. (1986). Meta-analysis in clinical trials. Controlled Clinical Trials.</li>

                    </ul>

                </div>



                <div class="about-footer">

                    <p>© 2026 IPD Meta-Analysis Pro. For research use.</p>

                </div>

            </div>

        `;

        this.showModal('About IPD-MA Pro', content);

    },



    // Show modal helper

    showModal: function(title, content, size = 'medium') {

        const modalId = 'helpModal';

        // Save previously focused element for focus restoration
        this._previousFocus = document.activeElement;

        let modal = document.getElementById(modalId);



        if (!modal) {

            modal = document.createElement('div');

            modal.id = modalId;

            modal.className = 'modal-overlay';

            modal.setAttribute('role', 'dialog');

            modal.setAttribute('aria-modal', 'true');

            document.body.appendChild(modal);

        }



        const sizeClass = size === 'large' ? 'style="max-width:800px;"' : '';



        modal.innerHTML = `

            <div class="modal" ${sizeClass}>

                <div class="modal-header">

                    <h3 class="modal-title">${title}</h3>

                    <button class="modal-close" onclick="HelpSystem.closeModal()">&times;</button>

                </div>

                <div class="modal-body">

                    ${content}

                </div>

            </div>

        `;



        modal.classList.add('active');

        modal.setAttribute('aria-label', title);

        // Focus trap for help modal
        if (modal._trapFocusHandler) modal.removeEventListener('keydown', modal._trapFocusHandler);
        modal._trapFocusHandler = function(e) {
            if (e.key !== 'Tab') return;
            const focusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        };
        modal.addEventListener('keydown', modal._trapFocusHandler);

        // Focus first focusable element in modal
        const firstFocusable = modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (firstFocusable) firstFocusable.focus();

        // Add help-specific styles if not already added

        if (!document.getElementById('helpStyles')) {

            const styles = document.createElement('style');

            styles.id = 'helpStyles';

            styles.textContent = `

                .help-content{color:var(--text-primary)}

                .help-content h2{margin-bottom:1.5rem;color:var(--accent-primary)}

                .help-content h3{margin:1.5rem 0 0.75rem;font-size:1rem}

                .help-content h4{margin:1rem 0 0.5rem;font-size:0.95rem}

                .help-content ul,.help-content ol{margin-left:1.5rem;margin-bottom:1rem}

                .help-content li{margin-bottom:0.5rem;line-height:1.5}

                .help-content p{margin-bottom:0.75rem;line-height:1.6}

                .help-section{margin-bottom:1.5rem;padding:1rem;background:var(--bg-tertiary);border-radius:8px}

                .tutorial-list{display:grid;gap:1rem}

                .tutorial-card{display:flex;gap:1rem;padding:1rem;background:var(--bg-tertiary);border-radius:8px;cursor:pointer;transition:all 0.2s}

                .tutorial-card:hover{background:var(--bg-secondary);transform:translateX(5px)}

                .tutorial-icon{font-size:2rem;width:50px;height:50px;display:flex;align-items:center;justify-content:center;background:var(--bg-card);border-radius:8px}

                .tutorial-info h4{margin:0 0 0.25rem}

                .tutorial-info p{margin:0 0 0.5rem;font-size:0.85rem;color:var(--text-secondary)}

                .feature-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:1rem}

                .feature-item{padding:1rem;background:var(--bg-tertiary);border-radius:8px}

                .feature-item h4{margin:0 0 0.5rem;font-size:0.9rem}

                .feature-item p{margin:0;font-size:0.8rem;color:var(--text-secondary)}

                .shortcuts-table{width:100%;border-collapse:collapse}

                .shortcuts-table th,.shortcuts-table td{padding:0.75rem;text-align:left;border-bottom:1px solid var(--border-color)}

                .shortcuts-table th{background:var(--bg-tertiary);font-size:0.85rem}

                .shortcuts-table kbd{display:inline-block;padding:0.2rem 0.5rem;background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:4px;font-family:monospace;font-size:0.8rem}

                .limitation-section{margin-bottom:1.5rem;padding:1rem;background:var(--bg-tertiary);border-radius:8px}

                .limitation-section h3{margin-top:0}

                .limitation-section ul{margin-bottom:0}

                .about-header{display:flex;align-items:center;gap:1rem;margin-bottom:1.5rem}

                .about-logo{width:60px;height:60px;background:var(--gradient-1);border-radius:12px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1.5rem;color:white}

                .about-header h2{margin:0}

                .version{margin:0;color:var(--text-muted);font-size:0.85rem}

                .about-section{margin-bottom:1.5rem}

                .about-section h4{color:var(--accent-primary);margin-bottom:0.5rem}

                .references-list{font-size:0.85rem;color:var(--text-secondary)}

                .about-footer{text-align:center;padding-top:1rem;border-top:1px solid var(--border-color);color:var(--text-muted);font-size:0.8rem}

                .tour-highlight{position:relative;z-index:10000;box-shadow:0 0 0 4px var(--accent-primary),0 0 20px rgba(99,102,241,0.5)!important;border-radius:8px}

                .tour-content{margin-bottom:1rem;line-height:1.5}

                .tour-footer{display:flex;justify-content:space-between;align-items:center}

                .tour-progress{font-size:0.8rem;color:var(--text-muted)}

                .tour-buttons{display:flex;gap:0.5rem}

                .btn-sm{padding:0.35rem 0.75rem;font-size:0.8rem}

            `;

            document.head.appendChild(styles);

        }

    },



    // Close modal

    closeModal: function() {

        const modal = document.getElementById('helpModal');

        if (modal) {

            if (modal._trapFocusHandler) modal.removeEventListener('keydown', modal._trapFocusHandler);

            modal.classList.remove('active');

        }

        // Restore focus to previously focused element
        if (this._previousFocus && this._previousFocus.focus) {
            this._previousFocus.focus();
            this._previousFocus = null;
        }

    }

};



// =============================================================================

// DROPDOWN MENU MANAGEMENT

// =============================================================================

function toggleDropdown(id) {

    const dropdown = document.getElementById(id);

    const wasOpen = dropdown.classList.contains('open');



    // Close all dropdowns and reset aria-expanded

    document.querySelectorAll('.dropdown').forEach(d => {
        d.classList.remove('open');
        const toggleBtn = d.querySelector('.dropdown-toggle');
        if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
    });



    // Toggle the clicked one

    if (!wasOpen) {

        dropdown.classList.add('open');

        const toggleBtn = dropdown.querySelector('.dropdown-toggle');
        if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');

    }

}



// Close dropdowns when clicking outside

document.addEventListener('click', function(e) {

    if (!e.target.closest('.dropdown')) {

        document.querySelectorAll('.dropdown').forEach(d => {
            d.classList.remove('open');
            const toggleBtn = d.querySelector('.dropdown-toggle');
            if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
        });

    }

});



// =============================================================================

// KEYBOARD SHORTCUTS

// =============================================================================

document.addEventListener('keydown', function(e) {

    // Ctrl+Z - Undo

    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {

        e.preventDefault();

        UndoManager.undo();

    }

    // Ctrl+Y or Ctrl+Shift+Z - Redo

    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {

        e.preventDefault();

        UndoManager.redo();

    }

    // Ctrl+S - Save Session

    if ((e.ctrlKey || e.metaKey) && e.key === 's') {

        e.preventDefault();

        SessionManager.saveSession();

    }

    // Escape - Close dropdowns and modals

    if (e.key === 'Escape') {

        document.querySelectorAll('.dropdown').forEach(d => {
            d.classList.remove('open');
            const toggleBtn = d.querySelector('.dropdown-toggle');
            if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
        });

        document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));

    }

});



// =============================================================================

// INLINE DATA EDITOR

// =============================================================================

const InlineEditor = {

    editingCell: null,

    originalValue: null,



    // Initialize editor on data table

    init: function() {

        const table = document.getElementById('dataTableBody');

        if (!table) return;



        table.addEventListener('dblclick', (e) => {

            const td = e.target.closest('td');

            if (td && !td.classList.contains('editing')) {

                this.startEdit(td);

            }

        });

    },



    // Start editing a cell

    startEdit: function(td) {

        if (this.editingCell) {

            this.finishEdit();

        }



        const rowIndex = td.parentElement.dataset.rowIndex;

        const colIndex = td.cellIndex;

        const colName = getVarName(APP.variables[colIndex]);



        this.editingCell = td;

        this.originalValue = td.textContent;



        td.classList.add('editing');

        td.innerHTML = '';

        const input = document.createElement('input');

        input.type = 'text';

        input.value = this.originalValue;

        td.appendChild(input);

        input.focus();

        input.select();



        input.addEventListener('blur', () => this.finishEdit());

        input.addEventListener('keydown', (e) => {

            if (e.key === 'Enter') this.finishEdit();

            if (e.key === 'Escape') this.cancelEdit();

            if (e.key === 'Tab') {

                e.preventDefault();

                this.finishEdit();

                const nextCell = e.shiftKey ? td.previousElementSibling : td.nextElementSibling;

                if (nextCell) this.startEdit(nextCell);

            }

        });

    },



    // Finish editing

    finishEdit: function() {

        if (!this.editingCell) return;



        const input = this.editingCell.querySelector('input');

        const newValue = input ? input.value : this.originalValue;



        const rowIndex = parseInt(this.editingCell.parentElement.dataset.rowIndex);

        const colIndex = this.editingCell.cellIndex;



        // Guard: Skip if colIndex is out of bounds (e.g., Actions column)

        if (colIndex >= APP.variables.length) {

            this.editingCell.classList.remove('editing');

            this.editingCell = null;

            this.originalValue = null;

            return;

        }



        const colName = getVarName(APP.variables[colIndex]);



        // Update data

        if (APP.data && APP.data[rowIndex]) {

            const oldValue = APP.data[rowIndex][colName];



            // Parse value appropriately

            let parsedValue = newValue;

            if (!isNaN(parseFloat(newValue)) && isFinite(newValue)) {

                parsedValue = parseFloat(newValue);

            }



            if (oldValue !== parsedValue) {

                UndoManager.saveState('Edit cell [' + rowIndex + '][' + colName + ']');

                APP.data[rowIndex][colName] = parsedValue;

                this.editingCell.classList.add('cell-modified');

            }

        }



        this.editingCell.classList.remove('editing');

        this.editingCell.textContent = newValue;

        this.editingCell = null;

        this.originalValue = null;

    },



    // Cancel editing

    cancelEdit: function() {

        if (!this.editingCell) return;



        this.editingCell.classList.remove('editing');

        this.editingCell.textContent = this.originalValue;

        this.editingCell = null;

        this.originalValue = null;

    },



    // Add new row

    addRow: function() {

        if (!APP.data || !APP.variables.length) return;



        UndoManager.saveState('Add row');



        const newRow = {};

        APP.variables.forEach(v => {

            const name = getVarName(v);

            if (name) newRow[name] = '';

        });

        APP.data.push(newRow);



        updateDataPreview();

        showNotification('Row added', 'success');

    },



    // Delete row

    deleteRow: function(index) {

        if (!APP.data || index < 0 || index >= APP.data.length) return;



        UndoManager.saveState('Delete row ' + index);

        APP.data.splice(index, 1);



        updateDataPreview();

        showNotification('Row deleted', 'success');

    }

};



// Show inline data editor modal

function showInlineDataEditor() {

    if (!APP.data || APP.data.length === 0) {

        showNotification('Please load data first', 'warning');

        return;

    }



    const modal = document.createElement('div');

    modal.className = 'modal-overlay active';

    modal.id = 'inlineEditorModal';

    modal.innerHTML = `

        <div class="modal" style="max-width:95vw;max-height:90vh;width:1200px;">

            <div class="modal-header">

                <h3>Data Editor</h3>

                <div class="btn-group">

                    <button class="btn btn-success" onclick="InlineEditor.addRow()">+ Add Row</button>

                    <button class="btn btn-secondary" onclick="document.getElementById('inlineEditorModal').remove()">Close</button>

                </div>

            </div>

            <div class="alert alert-info" style="margin-bottom:1rem;">

                <strong>Tip:</strong> Double-click any cell to edit. Press Tab to move between cells. Changes are tracked for undo (Ctrl+Z).

            </div>

            <div class="data-table-container" style="max-height:60vh;overflow:auto;">

                <table class="data-table" id="editorTable">

                    <thead>

                        <tr>${APP.variables.map(v => '<th>' + escapeHTML(getVarName(v)) + '</th>').join('')}<th>Actions</th></tr>

                    </thead>

                    <tbody>

                        ${APP.data.map((row, i) => `

                            <tr data-row-index="${i}">

                                ${APP.variables.map(v => '<td class="editable">' + escapeHTML(row[getVarName(v)] ?? '') + '</td>').join('')}

                                <td><button class="btn btn-danger" onclick="InlineEditor.deleteRow(${i});document.getElementById('inlineEditorModal').remove();showInlineDataEditor();" style="padding:0.25rem 0.5rem;font-size:0.7rem;">&times;</button></td>

                            </tr>

                        `).join('')}

                    </tbody>

                </table>

            </div>

            <div style="margin-top:1rem;display:flex;justify-content:space-between;align-items:center;">

                <span style="color:var(--text-muted);font-size:0.85rem;">${APP.data.length} rows &times; ${APP.variables.length} columns</span>

                <button class="btn btn-primary" onclick="document.getElementById('inlineEditorModal').remove();updateDataPreview();">Done</button>

            </div>

        </div>

    `;



    document.body.appendChild(modal);



    // Initialize inline editor for this table

    const table = modal.querySelector('#editorTable tbody');

    table.addEventListener('dblclick', (e) => {

        const td = e.target.closest('td.editable');

        if (td) InlineEditor.startEdit(td);

    });

}



// =============================================================================

// MICE MULTIPLE IMPUTATION

// =============================================================================

const MICEImputation = {

    imputedDatasets: [],

    nImputations: 5,

    maxIterations: 10,



    // Check for missing data

    getMissingStats: function() {

        if (!APP.data || APP.data.length === 0) return null;



        const stats = {};

        APP.variables.forEach(v => {

            const name = getVarName(v);

            if (!name) return;

            const missing = APP.data.filter(row =>

                row[name] === null || row[name] === undefined || row[name] === '' ||

                (typeof row[name] === 'number' && isNaN(row[name]))

            ).length;

            stats[name] = {

                missing: missing,

                total: APP.data.length,

                percent: (missing / APP.data.length * 100).toFixed(1)

            };

        });

        return stats;

    },



    // Run MICE imputation

    runMICE: function(options = {}) {

        const nImp = options.nImputations || this.nImputations;

        const maxIter = options.maxIterations || this.maxIterations;

        const stats = this.getMissingStats();

        const varsToImpute = options.variables || APP.variables.map(v => getVarName(v)).filter(Boolean).filter(name => {

            return stats[name] && stats[name].missing > 0;

        });



        if (varsToImpute.length === 0) {

            showNotification('No missing data found', 'info');

            return [];

        }
        if (typeof SeededRNG !== 'undefined') SeededRNG.patchMathRandom(57);
        try {



        UndoManager.saveState('MICE Imputation');



        this.imputedDatasets = [];



        for (let m = 0; m < nImp; m++) {

            // Create copy of data

            let impData = JSON.parse(JSON.stringify(APP.data));



            // Initialize missing values with mean/mode

            impData = this.initializeMissing(impData, varsToImpute);



            // Iterate

            for (let iter = 0; iter < maxIter; iter++) {

                varsToImpute.forEach(varName => {

                    impData = this.imputeVariable(impData, varName, varsToImpute);

                });

            }



            this.imputedDatasets.push(impData);

        }



        showNotification('MICE completed: ' + nImp + ' datasets created', 'success');

        return this.imputedDatasets;
        } finally {
            if (typeof SeededRNG !== 'undefined') SeededRNG.restoreMathRandom();
        }

    },



    // Initialize missing values

    initializeMissing: function(data, vars) {

        vars.forEach(varName => {

            const observed = data

                .map(row => row[varName])

                .filter(v => v !== null && v !== undefined && v !== '' && !isNaN(v));



            const isNumeric = observed.every(v => typeof v === 'number');

            const fillValue = isNumeric

                ? observed.reduce((a, b) => a + b, 0) / observed.length

                : this.mode(observed);



            data.forEach(row => {

                if (row[varName] === null || row[varName] === undefined ||

                    row[varName] === '' || (typeof row[varName] === 'number' && isNaN(row[varName]))) {

                    row[varName] = fillValue;

                }

            });

        });

        return data;

    },



    // Impute single variable using predictive mean matching

    imputeVariable: function(data, targetVar, predictorVars) {

        const predictors = predictorVars.filter(v => v !== targetVar);

        const missingIndices = [];

        const observedIndices = [];



        // Find original missing (from APP.data)

        APP.data.forEach((row, i) => {

            if (row[targetVar] === null || row[targetVar] === undefined ||

                row[targetVar] === '' || (typeof row[targetVar] === 'number' && isNaN(row[targetVar]))) {

                missingIndices.push(i);

            } else {

                observedIndices.push(i);

            }

        });



        if (missingIndices.length === 0 || observedIndices.length < 3) return data;



        // Simple linear regression for numeric, mode matching for categorical

        const targetValues = observedIndices.map(i => data[i][targetVar]);

        const isNumeric = targetValues.every(v => typeof v === 'number');



        if (isNumeric) {

            // Predictive Mean Matching

            const X = observedIndices.map(i => predictors.map(p => parseFloat(data[i][p]) || 0));

            const y = targetValues;



            // Fit simple model (mean of predictors weighted)

            const meanY = y.reduce((a, b) => a + b, 0) / y.length;

            const sdY = Math.sqrt(y.reduce((s, v) => s + (v - meanY) ** 2, 0) / (y.length - 1)) || 1;



            // Impute missing values

            missingIndices.forEach(mi => {

                // Find k nearest donors

                const k = Math.min(5, observedIndices.length);

                const xMiss = predictors.map(p => parseFloat(data[mi][p]) || 0);



                // Calculate distances to all observed

                const distances = observedIndices.map((oi, idx) => {

                    const xObs = predictors.map(p => parseFloat(data[oi][p]) || 0);

                    const dist = Math.sqrt(xMiss.reduce((s, v, j) => s + (v - xObs[j]) ** 2, 0));

                    return { idx: oi, dist: dist, value: y[idx] };

                });



                // Sort by distance and pick random from k nearest

                distances.sort((a, b) => a.dist - b.dist);

                const donors = distances.slice(0, k);

                const donor = donors[Math.floor(Math.random() * donors.length)];



                // Add some noise

                data[mi][targetVar] = donor.value + (Math.random() - 0.5) * sdY * 0.1;

            });

        } else {

            // Categorical: sample from observed distribution

            const freq = {};

            targetValues.forEach(v => freq[v] = (freq[v] || 0) + 1);

            const total = targetValues.length;



            missingIndices.forEach(mi => {

                const rand = Math.random();

                let cumProb = 0;

                for (const [val, count] of Object.entries(freq)) {

                    cumProb += count / total;

                    if (rand <= cumProb) {

                        data[mi][targetVar] = val;

                        break;

                    }

                }

            });

        }



        return data;

    },



    // Helper: get mode

    mode: function(arr) {

        const freq = {};

        arr.forEach(v => freq[v] = (freq[v] || 0) + 1);

        return Object.keys(freq).reduce((a, b) => freq[a] > freq[b] ? a : b);

    },



    // Pool results using Rubin's rules

    poolResults: function(estimates, variances) {

        const m = estimates.length;

        const qBar = estimates.reduce((a, b) => a + b, 0) / m;

        const uBar = variances.reduce((a, b) => a + b, 0) / m;

        const b = estimates.reduce((s, q) => s + (q - qBar) ** 2, 0) / (m - 1);

        const totalVar = uBar + (1 + 1/m) * b;



        // Degrees of freedom (Barnard-Rubin)

        const lambda = (1 + 1/m) * b / totalVar;

        const dfOld = (m - 1) / (lambda ** 2);



        return {

            estimate: qBar,

            variance: totalVar,

            se: Math.sqrt(totalVar),

            df: dfOld,

            fmi: lambda, // Fraction of missing information

            riv: (1 + 1/m) * b / uBar // Relative increase in variance

        };

    },



    // Use first imputed dataset

    useImputedData: function(datasetIndex = 0) {

        if (this.imputedDatasets.length === 0) {

            showNotification('Run MICE first', 'warning');

            return;

        }



        UndoManager.saveState('Apply imputed data');

        APP.data = JSON.parse(JSON.stringify(this.imputedDatasets[datasetIndex]));

        updateDataPreview();

        showNotification('Applied imputed dataset ' + (datasetIndex + 1), 'success');

    }

};



// Show MICE imputation modal

function showMICEImputationModal() {

    if (!APP.data || APP.data.length === 0) {

        showNotification('Please load data first', 'warning');

        return;

    }



    const missingStats = MICEImputation.getMissingStats();

    const varsWithMissing = Object.entries(missingStats).filter(([k, v]) => v.missing > 0);



    const modal = document.createElement('div');

    modal.className = 'modal-overlay active';

    modal.id = 'miceModal';

    modal.innerHTML = `

        <div class="modal" style="max-width:700px;">

            <div class="modal-header">

                <h3>Multiple Imputation (MICE)</h3>

                <button class="modal-close" onclick="document.getElementById('miceModal').remove()">&times;</button>

            </div>



            <div class="alert alert-info" style="margin-bottom:1rem;">

                <strong>MICE</strong> (Multiple Imputation by Chained Equations) creates multiple complete datasets by imputing missing values using predictive mean matching. Results are pooled using Rubin's rules.

            </div>



            <h4>Missing Data Summary</h4>

            <div class="data-table-container" style="max-height:200px;margin-bottom:1rem;">

                <table class="results-table">

                    <thead>

                        <tr><th>Variable</th><th>Missing</th><th>Total</th><th>%</th></tr>

                    </thead>

                    <tbody>

                        ${varsWithMissing.length > 0 ? varsWithMissing.map(([v, s]) => `

                            <tr>

                                <td>${v}</td>

                                <td>${s.missing}</td>

                                <td>${s.total}</td>

                                <td><span class="badge ${parseFloat(s.percent) > 20 ? 'badge-danger' : parseFloat(s.percent) > 5 ? 'badge-warning' : 'badge-success'}">${s.percent}%</span></td>

                            </tr>

                        `).join('') : '<tr><td colspan="4" style="text-align:center;color:var(--accent-success);">No missing data detected!</td></tr>'}

                    </tbody>

                </table>

            </div>



            ${varsWithMissing.length > 0 ? `

                <div class="grid grid-2" style="margin-bottom:1rem;">

                    <div class="form-group">

                        <label class="form-label">Number of Imputations</label>

                        <select class="form-select" id="miceNImp">

                            <option value="5" selected>5 (Standard)</option>

                            <option value="10">10 (More stable)</option>

                            <option value="20">20 (High missing %)</option>

                            <option value="50">50 (Research grade)</option>

                        </select>

                    </div>

                    <div class="form-group">

                        <label class="form-label">Iterations</label>

                        <select class="form-select" id="miceIter">

                            <option value="5">5</option>

                            <option value="10" selected>10</option>

                            <option value="20">20</option>

                        </select>

                    </div>

                </div>



                <div style="text-align:center;">

                    <button class="btn btn-primary" onclick="runMICEFromModal()">Run MICE Imputation</button>

                </div>



                <div id="miceResults" style="margin-top:1rem;display:none;">

                    <h4>Imputed Datasets</h4>

                    <div id="miceDatasetList"></div>

                </div>

            ` : `

                <div class="alert alert-success">

                    <strong>Complete data!</strong> No imputation needed.

                </div>

            `}



            <div style="margin-top:1rem;padding:0.75rem;background:var(--bg-tertiary);border-radius:8px;font-size:0.8rem;color:var(--text-muted);">

                <strong>Reference:</strong> van Buuren S, Groothuis-Oudshoorn K (2011). mice: Multivariate Imputation by Chained Equations in R. Journal of Statistical Software, 45(3), 1-67.

            </div>

        </div>

    `;



    document.body.appendChild(modal);

}



function runMICEFromModal() {

    const nImp = parseInt(document.getElementById('miceNImp').value);

    const maxIter = parseInt(document.getElementById('miceIter').value);



    showNotification('Running MICE imputation...', 'info');



    setTimeout(() => {

        const datasets = MICEImputation.runMICE({ nImputations: nImp, maxIterations: maxIter });



        const listDiv = document.getElementById('miceDatasetList');

        listDiv.innerHTML = datasets.map((d, i) => `

            <button class="btn btn-secondary" style="margin:0.25rem;" onclick="MICEImputation.useImputedData(${i});document.getElementById('miceModal').remove();">

                Use Dataset ${i + 1}

            </button>

        `).join('') + `

            <div style="margin-top:0.5rem;color:var(--text-muted);font-size:0.8rem;">

                ${nImp} imputed datasets created. Click to apply one, or run analysis to pool results.

            </div>

        `;

        document.getElementById('miceResults').style.display = 'block';

    }, 100);

}



// =============================================================================

// WEB WORKER FOR HEAVY COMPUTATIONS (MCMC/CART)

// =============================================================================

const ComputeWorker = {

    worker: null,

    callbacks: {},

    callbackId: 0,



    // Create inline Web Worker

    init: function() {

        const workerCode = `

            // Seeded RNG for deterministic worker computations
            var _workerSeed = [42 >>> 0, (42 * 2654435761) >>> 0, (42 * 2246822519) >>> 0, (42 * 3266489917) >>> 0];
            var _origRandom = Math.random;
            Math.random = function() {
                var r = (((_workerSeed[1] * 5) << 7 | (_workerSeed[1] * 5) >>> 25) * 9) >>> 0;
                var t = _workerSeed[1] << 9;
                _workerSeed[2] ^= _workerSeed[0]; _workerSeed[3] ^= _workerSeed[1]; _workerSeed[1] ^= _workerSeed[2]; _workerSeed[0] ^= _workerSeed[3];
                _workerSeed[2] ^= t; _workerSeed[3] = (_workerSeed[3] << 11 | _workerSeed[3] >>> 21);
                return (r >>> 0) / 4294967296;
            };

            // Web Worker for heavy computations

            self.onmessage = function(e) {

                const { id, type, data } = e.data;

                let result;



                try {

                    switch(type) {

                        case 'mcmc':

                            result = runMCMCSampling(data);

                            break;

                        case 'cart':

                            result = runCARTAnalysis(data);

                            break;

                        case 'bootstrap':

                            result = runBootstrap(data);

                            break;

                        default:

                            result = { error: 'Unknown computation type' };

                    }

                } catch(err) {

                    result = { error: err.message };

                }



                self.postMessage({ id, result });

            };



            // MCMC Sampling (Metropolis-Hastings)

            function runMCMCSampling(params) {

                const { nSamples, burnin, effects, variances, priorMean, priorVar } = params;

                const k = effects.length;

                const samples = [];



                let mu = priorMean || 0;

                let tau2 = 0.1;



                for (let i = 0; i < nSamples + burnin; i++) {

                    // Update mu

                    const weights = variances.map(v => 1 / (v + tau2));

                    const sumW = weights.reduce((a, b) => a + b, 0);

                    const muPost = effects.reduce((s, e, j) => s + weights[j] * e, 0) / sumW;

                    const muVar = 1 / sumW;

                    mu = muPost + Math.sqrt(muVar) * randn();



                    // Update tau2 (half-Cauchy prior approximation)

                    const ssq = effects.reduce((s, e, j) => s + (e - mu) ** 2 / variances[j], 0);

                    const shape = (k - 1) / 2;

                    const scale = ssq / 2;

                    tau2 = Math.max(0.0001, 1 / rgamma(shape, 1/scale));



                    if (i >= burnin) {

                        samples.push({ mu, tau2, tau: Math.sqrt(tau2) });

                    }



                    // Progress update every 1000 iterations

                    if (i % 1000 === 0) {

                        self.postMessage({ id: params.id, progress: i / (nSamples + burnin) });

                    }

                }



                return {

                    samples,

                    summary: {

                        muMean: samples.reduce((s, x) => s + x.mu, 0) / samples.length,

                        muSD: Math.sqrt(samples.reduce((s, x) => s + x.mu ** 2, 0) / samples.length -

                              (samples.reduce((s, x) => s + x.mu, 0) / samples.length) ** 2),

                        tauMean: samples.reduce((s, x) => s + x.tau, 0) / samples.length

                    }

                };

            }



            // CART Analysis

            function runCARTAnalysis(params) {

                const { data, outcome, predictors, minNodeSize } = params;

                // Simplified CART implementation

                const tree = buildTree(data, outcome, predictors, minNodeSize || 30, 0, 5);

                return { tree, nLeaves: countLeaves(tree) };

            }



            function buildTree(data, outcome, predictors, minSize, depth, maxDepth) {

                if (data.length < minSize * 2 || depth >= maxDepth) {

                    return { type: 'leaf', n: data.length, mean: mean(data.map(d => d[outcome])) };

                }



                let bestSplit = null;

                let bestGain = 0;



                predictors.forEach(pred => {

                    const values = [...new Set(data.map(d => d[pred]))].sort((a,b) => a-b);

                    values.slice(0, -1).forEach((val, i) => {

                        const splitVal = (val + values[i+1]) / 2;

                        const left = data.filter(d => d[pred] <= splitVal);

                        const right = data.filter(d => d[pred] > splitVal);



                        if (left.length >= minSize && right.length >= minSize) {

                            const gain = variance(data.map(d => d[outcome])) -

                                (left.length * variance(left.map(d => d[outcome])) +

                                 right.length * variance(right.map(d => d[outcome]))) / data.length;



                            if (gain > bestGain) {

                                bestGain = gain;

                                bestSplit = { predictor: pred, value: splitVal, left, right };

                            }

                        }

                    });

                });



                if (!bestSplit) {

                    return { type: 'leaf', n: data.length, mean: mean(data.map(d => d[outcome])) };

                }



                return {

                    type: 'split',

                    predictor: bestSplit.predictor,

                    value: bestSplit.value,

                    left: buildTree(bestSplit.left, outcome, predictors, minSize, depth + 1, maxDepth),

                    right: buildTree(bestSplit.right, outcome, predictors, minSize, depth + 1, maxDepth)

                };

            }



            function countLeaves(node) {

                return node.type === 'leaf' ? 1 : countLeaves(node.left) + countLeaves(node.right);

            }



            // Bootstrap

            function runBootstrap(params) {

                const { data, nBoot, statFn, statFnName } = params;

                const stats = [];

                const statFnKey = typeof statFnName === 'string' ? statFnName : (typeof statFn === 'string' ? statFn : null);

                const statFns = { mean, median, variance };

                const fn = statFnKey ? statFns[statFnKey] : statFns.mean;

                if (!fn) throw new Error('Invalid statFn for bootstrap');

                for (let b = 0; b < nBoot; b++) {

                    const sample = [];

                    for (let i = 0; i < data.length; i++) {

                        sample.push(data[Math.floor(Math.random() * data.length)]);

                    }

                    stats.push(fn(sample));

                }

                stats.sort((a, b) => a - b);

                return {

                    mean: mean(stats),

                    se: Math.sqrt(variance(stats)),

                    ci: [stats[Math.floor(nBoot * 0.025)], stats[Math.floor(nBoot * 0.975)]]

                };

            }



            // Helpers

            function mean(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }

            function median(arr) {

                const sorted = arr.slice().sort((a, b) => a - b);

                const mid = Math.floor(sorted.length / 2);

                return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

            }

            function variance(arr) { const m = mean(arr); return arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1); }

            function randn() { const u = Math.max(1e-10, Math.random()); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random()); }

            function rgamma(shape, scale) {

                if (shape < 1) return rgamma(shape + 1, scale) * Math.pow(Math.random(), 1/shape);

                const d = shape - 1/3, c = 1/Math.sqrt(9*d);

                while (true) {

                    let x, v;

                    do { x = randn(); v = 1 + c*x; } while (v <= 0);

                    v = v*v*v;

                    const u = Math.random();

                    if (u < 1 - 0.0331*(x*x)*(x*x)) return d*v*scale;

                    if (Math.log(u) < 0.5*x*x + d*(1-v+Math.log(v))) return d*v*scale;

                }

            }

        `;



        const blob = new Blob([workerCode], { type: 'application/javascript' });

        this.worker = new Worker(URL.createObjectURL(blob));



        this.worker.onmessage = (e) => {

            const { id, result, progress } = e.data;

            if (progress !== undefined) {

                // Handle progress update

                this.updateProgressUI(id, progress);

                return;

            }

            if (this.callbacks[id]) {

                this.hideProgressUI(id);

                this.callbacks[id](result);

                delete this.callbacks[id];

            }

        };



        this.worker.onerror = (e) => {

            console.error('[ComputeWorker] Error:', e.message);

            ErrorHandler.handle(new Error(e.message), {

                category: ErrorHandler.CATEGORY.WORKER,

                severity: ErrorHandler.SEVERITY.ERROR,

                context: { filename: e.filename, lineno: e.lineno }

            });

        };

    },



    // Show progress UI

    showProgressUI: function(id, label = 'Processing...') {

        // Create overlay if not exists

        let overlay = document.getElementById(`worker-progress-${id}`);

        if (!overlay) {

            overlay = document.createElement('div');

            overlay.id = `worker-progress-${id}`;

            overlay.className = 'worker-progress-overlay';

            overlay.innerHTML = `

                <div class="worker-progress-modal">

                    <div class="worker-progress-spinner"></div>

                    <div class="worker-progress-label">${label}</div>

                    <div class="worker-progress-bar-container">

                        <div class="worker-progress-bar" style="width: 0%"></div>

                    </div>

                    <div class="worker-progress-text">0%</div>

                    <button class="btn btn-secondary worker-cancel-btn" onclick="ComputeWorker.cancel(${id})">Cancel</button>

                </div>

            `;

            overlay.style.cssText = `

                position: fixed; top: 0; left: 0; right: 0; bottom: 0;

                background: rgba(0,0,0,0.7); z-index: 10000;

                display: flex; align-items: center; justify-content: center;

                backdrop-filter: blur(4px);

            `;

            const modal = overlay.querySelector('.worker-progress-modal');

            modal.style.cssText = `

                background: var(--bg-card); padding: 2rem; border-radius: 16px;

                text-align: center; min-width: 300px;

                box-shadow: var(--shadow-lg); border: 1px solid var(--border-color);

            `;

            const spinner = overlay.querySelector('.worker-progress-spinner');

            spinner.style.cssText = `

                width: 50px; height: 50px; margin: 0 auto 1rem;

                border: 4px solid var(--border-color);

                border-top-color: var(--accent-primary);

                border-radius: 50%; animation: spin 1s linear infinite;

            `;

            const labelEl = overlay.querySelector('.worker-progress-label');

            labelEl.style.cssText = `

                font-size: 1rem; font-weight: 600; margin-bottom: 1rem;

                color: var(--text-primary);

            `;

            const barContainer = overlay.querySelector('.worker-progress-bar-container');

            barContainer.style.cssText = `

                width: 100%; height: 8px; background: var(--bg-tertiary);

                border-radius: 4px; overflow: hidden; margin-bottom: 0.5rem;

            `;

            const bar = overlay.querySelector('.worker-progress-bar');

            bar.style.cssText = `

                height: 100%; background: var(--gradient-1);

                transition: width 0.3s ease; border-radius: 4px;

            `;

            const text = overlay.querySelector('.worker-progress-text');

            text.style.cssText = `

                font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 1rem;

            `;

            document.body.appendChild(overlay);

        }

        return overlay;

    },



    // Update progress UI

    updateProgressUI: function(id, progress) {

        const overlay = document.getElementById(`worker-progress-${id}`);

        if (overlay) {

            const bar = overlay.querySelector('.worker-progress-bar');

            const text = overlay.querySelector('.worker-progress-text');

            const pct = Math.round(progress * 100);

            if (bar) bar.style.width = pct + '%';

            if (text) text.textContent = pct + '%';

        }

    },



    // Hide progress UI

    hideProgressUI: function(id) {

        const overlay = document.getElementById(`worker-progress-${id}`);

        if (overlay) {

            overlay.style.opacity = '0';

            overlay.style.transition = 'opacity 0.3s';

            setTimeout(() => overlay.remove(), 300);

        }

    },



    // Cancel computation

    cancel: function(id) {

        this.hideProgressUI(id);

        if (this.callbacks[id]) {

            this.callbacks[id]({ cancelled: true });

            delete this.callbacks[id];

        }

        // Recreate worker to cancel ongoing computation

        this.terminate();

        this.init();

    },



    // Run computation in worker with progress

    compute: function(type, data, options = {}) {

        return new Promise((resolve, reject) => {

            if (!this.worker) this.init();



            const id = ++this.callbackId;

            const { showProgress = true, label = `Running ${type}...` } = options;



            if (showProgress) {

                this.showProgressUI(id, label);

            }



            this.callbacks[id] = (result) => {

                if (result && result.error) {

                    ErrorHandler.handle(new Error(result.error), {

                        category: ErrorHandler.CATEGORY.WORKER,

                        severity: ErrorHandler.SEVERITY.ERROR,

                        context: { type, id }

                    });

                    reject(new Error(result.error));

                } else {

                    resolve(result);

                }

            };



            this.worker.postMessage({ id, type, data: { ...data, id } });

        });

    },



    // Terminate worker

    terminate: function() {

        if (this.worker) {

            this.worker.terminate();

            this.worker = null;

        }

    }

};



// =============================================================================

// COMPATIBILITY FUNCTIONS

// =============================================================================



// Alias for data preview update

function updateDataPreview() {

    if (typeof displayData === 'function') {

        displayData();

    }

}



// Update covariate panel

function updateCovariatePanel() {

    if (!APP.data || !APP.variables) return;



    const availableDiv = document.getElementById('availableCovariates');

    const summaryBody = document.getElementById('covariateSummaryBody');



    if (availableDiv && APP.variables) {

        availableDiv.innerHTML = '';

        APP.variables.forEach(v => {

            const name = getVarName(v);

            if (!name) return;

            const isNumeric = APP.data.some(row => typeof row[name] === 'number');

            const type = isNumeric ? 'num' : 'cat';

            const chip = document.createElement('span');

            chip.className = 'var-chip';

            chip.dataset.var = name;

            chip.textContent = name + ' ';

            const typeSpan = document.createElement('span');

            typeSpan.className = 'type';

            typeSpan.textContent = type;

            chip.appendChild(typeSpan);

            availableDiv.appendChild(chip);

        });

    }



    if (summaryBody && APP.variables) {

        summaryBody.innerHTML = APP.variables.slice(0, 20).map(v => {

            const name = getVarName(v);

            const values = APP.data.map(row => row[name]).filter(x => x !== null && x !== undefined && x !== '');

            const missing = APP.data.length - values.length;

            const isNumeric = values.every(x => typeof x === 'number' || !isNaN(parseFloat(x)));



            if (isNumeric) {

                const nums = values.map(x => parseFloat(x)).filter(x => !isNaN(x));

                const mean = nums.length > 0 ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2) : '-';

                const sd = nums.length > 1 ? Math.sqrt(nums.reduce((s, x) => s + (x - mean) ** 2, 0) / (nums.length - 1)).toFixed(2) : '-';

                const min = nums.length > 0 ? Math.min(...nums).toFixed(1) : '-';

                const max = nums.length > 0 ? Math.max(...nums).toFixed(1) : '-';

                return `<tr><td>${escapeHTML(name)}</td><td>Numeric</td><td>${values.length}</td><td>${missing}</td><td>${mean}</td><td>${sd}</td><td>${min}-${max}</td></tr>`;

            } else {

                const freq = {};

                values.forEach(x => freq[x] = (freq[x] || 0) + 1);

                const mode = Object.keys(freq).reduce((a, b) => freq[a] > freq[b] ? a : b, '');

                const cats = Object.keys(freq).length;

                return `<tr><td>${escapeHTML(name)}</td><td>Categorical</td><td>${values.length}</td><td>${missing}</td><td>${escapeHTML(mode)}</td><td>${cats} levels</td><td>-</td></tr>`;

            }

        }).join('');

    }

}



// Display results

function displayResults(results) {

    if (!results) return;



    // Update stats

    const pooledEl = document.getElementById('pooledEffect');

    const ciEl = document.getElementById('pooledCI');

    const i2El = document.getElementById('i2Value');

    const tau2El = document.getElementById('tau2Value');



    if (results.pooledEffect !== undefined) {

        const isLog = APP.config.outcomeType !== 'continuous';

        const effect = isLog ? Math.exp(results.pooledEffect) : results.pooledEffect;

        const lower = isLog ? Math.exp(results.lower) : results.lower;

        const upper = isLog ? Math.exp(results.upper) : results.upper;



        if (pooledEl) pooledEl.textContent = effect.toFixed(3);

        if (ciEl) ciEl.textContent = lower.toFixed(2) + '-' + upper.toFixed(2);

    }



    if (i2El && results.I2 !== undefined) i2El.textContent = results.I2.toFixed(1) + '%';

    if (tau2El && results.tau2 !== undefined) tau2El.textContent = results.tau2.toFixed(4);



    // Switch to results panel

    switchPanel('results');

}



// Switch panel

function switchPanel(panelName) {

    // Hide all panels

    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));



    // Show target panel

    const panel = document.getElementById('panel-' + panelName);

    if (panel) panel.classList.add('active');



    // Update nav tabs

    document.querySelectorAll('.nav-tab').forEach(tab => {

        tab.classList.remove('active');

        if (tab.dataset.panel === panelName) tab.classList.add('active');

    });

}



function drawMissingnessPlot(data) {

    const canvas = document.getElementById('missingPlot');

    if (!canvas || !data || data.length === 0) return;



    const ctx = canvas.getContext('2d');

    const width = canvas.clientWidth || 700;

    const height = 280;

    canvas.width = width;

    canvas.height = height;



    const styles = getComputedStyle(document.body);

    const bg = styles.getPropertyValue('--bg-secondary') || '#111';

    const text = styles.getPropertyValue('--text-primary') || '#fff';

    const muted = styles.getPropertyValue('--text-muted') || '#888';

    const accent = styles.getPropertyValue('--accent-primary') || '#6366f1';



    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = bg;

    ctx.fillRect(0, 0, width, height);



    const columns = Object.keys(data[0] || {});

    if (columns.length === 0) return;



    const missingStats = columns.map(col => {

        let missing = 0;

        for (let i = 0; i < data.length; i++) {

            const v = data[i][col];

            if (v == null || v === '' || (typeof v === 'number' && isNaN(v))) missing++;

        }

        return { col, rate: missing / data.length };

    }).sort((a, b) => b.rate - a.rate).slice(0, Math.min(10, columns.length));



    if (missingStats.every(s => s.rate === 0)) {

        ctx.fillStyle = muted;

        ctx.font = '14px system-ui';

        ctx.textAlign = 'center';

        ctx.fillText('No missing data detected', width / 2, height / 2);

        return;

    }



    const left = 60;

    const right = 20;

    const top = 30;

    const bottom = 40;

    const plotW = width - left - right;

    const plotH = height - top - bottom;

    const barW = Math.max(8, plotW / missingStats.length - 10);



    ctx.fillStyle = text;

    ctx.font = 'bold 12px system-ui';

    ctx.textAlign = 'center';

    ctx.fillText('Missingness by Variable (Top 10)', width / 2, 18);



    ctx.strokeStyle = muted;

    ctx.lineWidth = 1;

    ctx.beginPath();

    ctx.moveTo(left, top);

    ctx.lineTo(left, top + plotH);

    ctx.lineTo(left + plotW, top + plotH);

    ctx.stroke();



    missingStats.forEach((s, i) => {

        const x = left + i * (barW + 10) + 5;

        const barH = s.rate * plotH;

        const y = top + plotH - barH;



        ctx.fillStyle = accent;

        ctx.fillRect(x, y, barW, barH);



        ctx.fillStyle = text;

        ctx.font = '10px system-ui';

        ctx.textAlign = 'center';

        ctx.fillText((s.rate * 100).toFixed(1) + '%', x + barW / 2, Math.max(12, y - 4));



        ctx.fillStyle = muted;

        ctx.save();

        ctx.translate(x + barW / 2, top + plotH + 12);

        ctx.rotate(-Math.PI / 6);

        ctx.fillText(s.col, 0, 0);

        ctx.restore();

    });

}



// Run data guardian check

function runDataGuardian() {

    if (!APP.data) {

        showNotification('Please load data first', 'warning');

        return;

    }

    const columns = Object.keys(APP.data[0] || {});

    const totalCells = APP.data.length * columns.length;

    let missing = 0;

    for (let i = 0; i < APP.data.length; i++) {

        const row = APP.data[i];

        for (let j = 0; j < columns.length; j++) {

            const v = row[columns[j]];

            if (v == null || v === '' || (typeof v === 'number' && isNaN(v))) missing++;

        }

    }

    const missingRate = totalCells > 0 ? missing / totalCells : 0;



    const missingRateEl = document.getElementById('missingRate');

    if (missingRateEl) missingRateEl.textContent = (missingRate * 100).toFixed(1) + '%';



    const qualityScore = Math.max(0, Math.min(100, 100 - missingRate * 100));

    const qualityScoreEl = document.getElementById('qualityScore');

    if (qualityScoreEl) qualityScoreEl.textContent = qualityScore.toFixed(0) + '%';



    const badge = document.getElementById('qualityBadge');

    if (badge) {

        if (qualityScore >= 90) {

            badge.textContent = 'PASS';

            badge.className = 'badge badge-success';

        } else if (qualityScore >= 75) {

            badge.textContent = 'WARN';

            badge.className = 'badge badge-warning';

        } else {

            badge.textContent = 'FAIL';

            badge.className = 'badge badge-danger';

        }

    }



    switchPanel('guardian');

    drawMissingnessPlot(APP.data);

    showNotification('IPD Integrity Gate check complete', 'success');

}



// =============================================================================

// INITIALIZATION

// =============================================================================

document.addEventListener('DOMContentLoaded', function() {

    // Initialize managers
    if (APP && typeof APP.markRuntimePhase === 'function') {
        APP.markRuntimePhase('core-init-scheduled');
    }

    setTimeout(() => {
        try {
            SessionManager.init();

            UndoManager.saveState('initial');

            InlineEditor.init();

            ComputeWorker.init();

            if (APP && APP.runtime) APP.runtime.coreInitComplete = true;
            if (APP && typeof APP.markRuntimePhase === 'function') {
                APP.markRuntimePhase('core-init-complete');
            }

            console.log('[IPD-MA Pro] Enhanced features loaded: Undo/Redo, Session Management, MICE, Web Workers');
        } catch (error) {
            if (APP && typeof APP.markRuntimePhase === 'function') {
                APP.markRuntimePhase('core-init-failed', {
                    initError: error && error.message ? error.message : String(error)
                });
            }
            throw error;
        }

    }, 500);



    // Setup nav tab click handlers

    document.querySelectorAll('.nav-tab').forEach(tab => {

        tab.addEventListener('click', () => {

            const panelName = tab.dataset.panel;

            if (panelName) switchPanel(panelName);

        });

    });

});



// =============================================================================
// METHOD GUIDE — helps users choose the right analysis
// =============================================================================

function showMethodGuide() {
    const categories = [
        {
            icon: '&#x1F4CF;',
            title: 'Continuous Outcomes',
            desc: 'Mean differences, standardized mean differences',
            methods: [
                { name: 'Two-Stage (DL)', tag: 'Default', tip: 'DerSimonian-Laird random effects &mdash; fast, widely used' },
                { name: 'Two-Stage (REML)', tag: 'Recommended', tip: 'Restricted ML &mdash; less biased tau-squared, preferred for k&gt;5' },
                { name: 'Two-Stage (HKSJ)', tag: 'Conservative', tip: 'Hartung-Knapp-Sidik-Jonkman &mdash; wider CIs, better coverage for small k' },
                { name: 'One-Stage LMM', tag: 'Advanced', tip: 'Linear mixed model on raw IPD &mdash; avoids information loss from aggregation' },
                { name: 'Bayesian', tag: 'Advanced', tip: 'Full posterior with credible intervals &mdash; handles sparse data and informative priors' }
            ]
        },
        {
            icon: '&#x1F522;',
            title: 'Binary Outcomes',
            desc: 'Odds ratios, risk ratios, risk differences, NNT',
            methods: [
                { name: 'Two-Stage (DL/REML)', tag: 'Default', tip: 'Log-OR or log-RR pooled with random effects' },
                { name: 'One-Stage GLMM', tag: 'Recommended', tip: 'Generalized linear mixed model &mdash; exact binomial likelihood, no continuity correction' },
                { name: 'NNT', tag: 'Clinical', tip: 'Number needed to treat &mdash; derived from pooled RD' }
            ]
        },
        {
            icon: '&#x23F1;',
            title: 'Survival / Time-to-Event',
            desc: 'Hazard ratios, survival curves, restricted mean survival',
            methods: [
                { name: 'Two-Stage (pooled HR)', tag: 'Default', tip: 'Study-level Cox/log-rank HRs pooled with DL/REML' },
                { name: 'Shared Frailty Cox', tag: 'Advanced', tip: 'One-stage Cox with study-level frailty &mdash; accounts for clustering' },
                { name: 'Stratified Cox', tag: 'Advanced', tip: 'Stratified by study &mdash; separate baseline hazards per study' },
                { name: 'RMST', tag: 'Clinical', tip: 'Restricted mean survival time &mdash; model-free, interpretable in months/years' }
            ]
        },
        {
            icon: '&#x1F500;',
            title: 'Interactions &amp; Effect Modification',
            desc: 'Subgroup effects, treatment-covariate interactions',
            methods: [
                { name: 'Subgroup Analysis', tag: 'Basic', tip: 'Stratified pooling with interaction test (Q-between)' },
                { name: 'Centered Interaction', tag: 'Recommended', tip: 'Study-centered covariate interaction &mdash; avoids ecological bias' },
                { name: 'Multi-Covariate Screening', tag: 'Exploratory', tip: 'CART-based subgroup detection across multiple covariates' }
            ]
        },
        {
            icon: '&#x1F9EC;',
            title: 'Advanced Methods',
            desc: 'Joint models, dose-response, Bayesian meta-regression',
            methods: [
                { name: 'Joint Models', tag: 'Specialist', tip: 'Simultaneously model longitudinal + survival outcomes' },
                { name: 'Dose-Response', tag: 'Specialist', tip: 'Non-linear dose-response curves with restricted cubic splines' },
                { name: 'Bayesian Meta-Regression', tag: 'Advanced', tip: 'Covariate-adjusted pooling with full posterior inference' }
            ]
        }
    ];

    const tagColors = {
        'Default': 'badge-info',
        'Recommended': 'badge-success',
        'Conservative': 'badge-warning',
        'Advanced': 'badge-warning',
        'Clinical': 'badge-success',
        'Basic': 'badge-info',
        'Exploratory': 'badge-warning',
        'Specialist': 'badge-danger'
    };

    let html = '<div style="display:flex;flex-direction:column;gap:1.25rem;">';

    html += '<div class="alert alert-info" style="margin:0;"><strong>Which method should I use?</strong> Start with Two-Stage REML for most analyses. Use One-Stage methods when you have few studies (k&lt;5) or sparse events. Use Bayesian when you need informative priors or full uncertainty quantification.</div>';

    categories.forEach(function(cat) {
        html += '<div style="border:1px solid var(--border-color);border-radius:10px;overflow:hidden;">';
        html += '<div style="background:var(--bg-tertiary);padding:0.75rem 1rem;display:flex;align-items:center;gap:0.5rem;border-bottom:1px solid var(--border-color);">';
        html += '<span style="font-size:1.25rem;">' + cat.icon + '</span>';
        html += '<div><strong>' + cat.title + '</strong><div style="font-size:0.75rem;color:var(--text-muted);">' + cat.desc + '</div></div>';
        html += '</div>';
        html += '<div style="padding:0.5rem;">';
        cat.methods.forEach(function(m) {
            html += '<div style="display:flex;align-items:center;gap:0.75rem;padding:0.5rem 0.75rem;border-radius:6px;">';
            html += '<span class="badge ' + (tagColors[m.tag] || 'badge-info') + '" style="min-width:90px;justify-content:center;">' + m.tag + '</span>';
            html += '<div><strong style="font-size:0.85rem;">' + m.name + '</strong><div style="font-size:0.75rem;color:var(--text-secondary);">' + m.tip + '</div></div>';
            html += '</div>';
        });
        html += '</div></div>';
    });

    html += '</div>';

    if (typeof ModalManager !== 'undefined' && ModalManager && typeof ModalManager.create === 'function') {
        ModalManager.create('Method Guide', html, { maxWidth: '720px' });
    } else {
        HelpSystem.showModal('Method Guide', html, 'large');
    }
}


