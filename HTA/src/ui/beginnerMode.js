/**
 * HTA Beginner Mode - Makes the app accessible to new users
 * Adds: Welcome tutorial, sample datasets, tooltips, data entry, result interpretation, help
 */

class BeginnerMode {
    constructor() {
        this.tutorialStep = 0;
        this.hasSeenTutorial = localStorage.getItem('hta_tutorial_seen') === 'true';
        this.init();
    }

    init() {
        this.injectStyles();
        this.createWelcomeModal();
        this.createHelpPanel();
        this.createDataEntryPanel();
        this.addTooltips();
        this.enhanceDropZone();

        // Show welcome on first visit
        if (!this.hasSeenTutorial) {
            setTimeout(() => this.showWelcome(), 500);
        }
    }

    // ============ STYLES ============
    injectStyles() {
        const styles = document.createElement('style');
        styles.textContent = `
            /* Welcome Modal */
            .welcome-modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.6);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                opacity: 0;
                visibility: hidden;
                transition: all 0.3s ease;
            }
            .welcome-modal-overlay.active {
                opacity: 1;
                visibility: visible;
            }
            .welcome-modal {
                background: var(--card-bg);
                border-radius: 16px;
                max-width: 700px;
                width: 90%;
                max-height: 85vh;
                overflow: hidden;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
                transform: scale(0.9);
                transition: transform 0.3s ease;
            }
            .welcome-modal-overlay.active .welcome-modal {
                transform: scale(1);
            }
            .welcome-header {
                background: linear-gradient(135deg, var(--primary), var(--primary-dark));
                color: white;
                padding: 32px;
                text-align: center;
            }
            .welcome-header h1 {
                font-size: 28px;
                margin-bottom: 8px;
            }
            .welcome-header p {
                opacity: 0.9;
                font-size: 16px;
            }
            .welcome-body {
                padding: 32px;
                max-height: 400px;
                overflow-y: auto;
            }
            .welcome-step {
                display: none;
            }
            .welcome-step.active {
                display: block;
                animation: fadeIn 0.3s ease;
            }
            .welcome-step h2 {
                font-size: 22px;
                margin-bottom: 16px;
                color: var(--text);
            }
            .welcome-step p {
                color: var(--text-muted);
                line-height: 1.7;
                margin-bottom: 16px;
            }
            .feature-grid {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 16px;
                margin: 20px 0;
            }
            .feature-card {
                background: var(--bg);
                padding: 16px;
                border-radius: 12px;
                text-align: center;
            }
            .feature-card .icon {
                font-size: 32px;
                margin-bottom: 8px;
            }
            .feature-card h3 {
                font-size: 14px;
                font-weight: 600;
                margin-bottom: 4px;
            }
            .feature-card p {
                font-size: 12px;
                color: var(--text-muted);
                margin: 0;
            }
            .welcome-footer {
                padding: 20px 32px;
                border-top: 1px solid var(--border);
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .step-dots {
                display: flex;
                gap: 8px;
            }
            .step-dot {
                width: 10px;
                height: 10px;
                border-radius: 50%;
                background: var(--border);
                transition: background 0.2s;
            }
            .step-dot.active {
                background: var(--primary);
            }
            .welcome-buttons {
                display: flex;
                gap: 12px;
            }

            /* Sample Datasets Grid */
            .sample-datasets {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 12px;
                margin-top: 20px;
            }
            .sample-dataset-card {
                background: var(--bg);
                border: 2px solid var(--border);
                border-radius: 12px;
                padding: 16px;
                cursor: pointer;
                transition: all 0.2s;
            }
            .sample-dataset-card:hover {
                border-color: var(--primary);
                transform: translateY(-2px);
                box-shadow: var(--shadow-md);
            }
            .sample-dataset-card h4 {
                font-size: 14px;
                margin-bottom: 4px;
            }
            .sample-dataset-card p {
                font-size: 12px;
                color: var(--text-muted);
                margin: 0;
            }
            .sample-dataset-card .meta {
                display: flex;
                gap: 12px;
                margin-top: 8px;
                font-size: 11px;
                color: var(--text-light);
            }

            /* Help Panel */
            .help-panel {
                position: fixed;
                top: 0;
                right: -400px;
                width: 400px;
                height: 100vh;
                background: var(--card-bg);
                box-shadow: -4px 0 20px rgba(0, 0, 0, 0.15);
                z-index: 9999;
                transition: right 0.3s ease;
                display: flex;
                flex-direction: column;
            }
            .help-panel.open {
                right: 0;
            }
            .help-panel-header {
                padding: 20px;
                border-bottom: 1px solid var(--border);
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .help-panel-header h2 {
                font-size: 18px;
            }
            .help-panel-body {
                flex: 1;
                overflow-y: auto;
                padding: 20px;
            }
            .help-section {
                margin-bottom: 24px;
            }
            .help-section h3 {
                font-size: 14px;
                font-weight: 600;
                margin-bottom: 12px;
                color: var(--primary);
            }
            .help-item {
                background: var(--bg);
                padding: 12px;
                border-radius: 8px;
                margin-bottom: 8px;
            }
            .help-item h4 {
                font-size: 13px;
                font-weight: 600;
                margin-bottom: 4px;
            }
            .help-item p {
                font-size: 12px;
                color: var(--text-muted);
                margin: 0;
                line-height: 1.5;
            }
            .help-btn {
                position: fixed;
                bottom: 24px;
                right: 24px;
                width: 56px;
                height: 56px;
                border-radius: 50%;
                background: linear-gradient(135deg, var(--primary), var(--primary-dark));
                color: white;
                border: none;
                cursor: pointer;
                font-size: 24px;
                box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4);
                z-index: 9998;
                transition: transform 0.2s, box-shadow 0.2s;
            }
            .help-btn:hover {
                transform: scale(1.1);
                box-shadow: 0 6px 16px rgba(37, 99, 235, 0.5);
            }

            /* Data Entry Panel */
            .data-entry-panel {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%) scale(0.9);
                width: 90%;
                max-width: 900px;
                max-height: 85vh;
                background: var(--card-bg);
                border-radius: 16px;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
                z-index: 10001;
                opacity: 0;
                visibility: hidden;
                transition: all 0.3s ease;
                display: flex;
                flex-direction: column;
            }
            .data-entry-panel.active {
                opacity: 1;
                visibility: visible;
                transform: translate(-50%, -50%) scale(1);
            }
            .data-entry-header {
                padding: 20px 24px;
                border-bottom: 1px solid var(--border);
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .data-entry-body {
                flex: 1;
                padding: 24px;
                overflow-y: auto;
            }
            .data-grid {
                width: 100%;
                border-collapse: collapse;
            }
            .data-grid th, .data-grid td {
                border: 1px solid var(--border);
                padding: 8px 12px;
                text-align: left;
            }
            .data-grid th {
                background: var(--bg);
                font-size: 12px;
                font-weight: 600;
            }
            .data-grid input {
                width: 100%;
                border: none;
                background: transparent;
                padding: 4px;
                font-size: 13px;
            }
            .data-grid input:focus {
                outline: 2px solid var(--primary);
                outline-offset: -2px;
            }
            .data-entry-footer {
                padding: 16px 24px;
                border-top: 1px solid var(--border);
                display: flex;
                justify-content: space-between;
            }

            /* Enhanced Tooltips */
            .tooltip-trigger {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 16px;
                height: 16px;
                background: var(--border);
                border-radius: 50%;
                font-size: 10px;
                color: var(--text-muted);
                cursor: help;
                margin-left: 4px;
            }
            .tooltip-trigger:hover {
                background: var(--primary);
                color: white;
            }

            /* Result Interpretation */
            .interpretation-box {
                background: linear-gradient(135deg, #eff6ff, #dbeafe);
                border-left: 4px solid var(--primary);
                padding: 16px 20px;
                border-radius: 0 8px 8px 0;
                margin: 16px 0;
            }
            .interpretation-box h4 {
                font-size: 14px;
                font-weight: 600;
                margin-bottom: 8px;
                color: var(--primary-dark);
            }
            .interpretation-box p {
                font-size: 13px;
                line-height: 1.6;
                color: var(--text);
                margin: 0;
            }

            /* Enhanced Drop Zone */
            .drop-zone-enhanced {
                margin-top: 24px;
                padding-top: 24px;
                border-top: 1px dashed var(--border);
            }
            .drop-zone-enhanced h3 {
                font-size: 14px;
                margin-bottom: 12px;
                color: var(--text-muted);
            }
            .quick-actions {
                display: flex;
                gap: 12px;
                flex-wrap: wrap;
                justify-content: center;
            }
            .quick-action-btn {
                padding: 12px 20px;
                border: 2px solid var(--border);
                border-radius: 8px;
                background: var(--card-bg);
                cursor: pointer;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .quick-action-btn:hover {
                border-color: var(--primary);
                color: var(--primary);
            }
            .quick-action-btn .icon {
                font-size: 18px;
            }
        `;
        document.head.appendChild(styles);
    }

    // ============ WELCOME MODAL ============
    createWelcomeModal() {
        const modal = document.createElement('div');
        modal.className = 'welcome-modal-overlay';
        modal.id = 'welcome-modal';
        modal.innerHTML = `
            <div class="welcome-modal">
                <div class="welcome-header">
                    <h1>Welcome to HTA Meta-Analysis Engine</h1>
                    <p>Your complete toolkit for evidence synthesis and health technology assessment</p>
                </div>
                <div class="welcome-body">
                    <!-- Step 1: Introduction -->
                    <div class="welcome-step active" data-step="0">
                        <h2>What can you do here?</h2>
                        <p>This application helps you perform rigorous meta-analyses and health economic evaluations, all in your browser with no installation required.</p>
                        <div class="feature-grid">
                            <div class="feature-card">
                                <div class="icon">📊</div>
                                <h3>Pairwise Meta-Analysis</h3>
                                <p>Combine studies with fixed or random effects</p>
                            </div>
                            <div class="feature-card">
                                <div class="icon">🔗</div>
                                <h3>Network Meta-Analysis</h3>
                                <p>Compare multiple treatments simultaneously</p>
                            </div>
                            <div class="feature-card">
                                <div class="icon">📈</div>
                                <h3>Publication Bias</h3>
                                <p>Detect and adjust for missing studies</p>
                            </div>
                            <div class="feature-card">
                                <div class="icon">💰</div>
                                <h3>Cost-Effectiveness</h3>
                                <p>Run HTA models with PSA</p>
                            </div>
                        </div>
                    </div>

                    <!-- Step 2: Getting Started -->
                    <div class="welcome-step" data-step="1">
                        <h2>Getting Started</h2>
                        <p>There are three ways to begin your analysis:</p>
                        <div class="feature-grid">
                            <div class="feature-card">
                                <div class="icon">📁</div>
                                <h3>Upload Data</h3>
                                <p>Drop a CSV or JSON file with your study data</p>
                            </div>
                            <div class="feature-card">
                                <div class="icon">📝</div>
                                <h3>Enter Manually</h3>
                                <p>Use the data entry form to type in studies</p>
                            </div>
                            <div class="feature-card">
                                <div class="icon">📚</div>
                                <h3>Try Examples</h3>
                                <p>Load sample datasets to explore features</p>
                            </div>
                            <div class="feature-card">
                                <div class="icon">❓</div>
                                <h3>Get Help</h3>
                                <p>Click the ? button anytime for guidance</p>
                            </div>
                        </div>
                    </div>

                    <!-- Step 3: Key Concepts -->
                    <div class="welcome-step" data-step="2">
                        <h2>Key Concepts Explained</h2>
                        <p>New to meta-analysis? Here's what you need to know:</p>
                        <div class="help-item">
                            <h4>Effect Size</h4>
                            <p>A standardized measure of treatment effect (e.g., odds ratio, risk ratio, mean difference). This is what you're trying to estimate.</p>
                        </div>
                        <div class="help-item">
                            <h4>Heterogeneity (I²)</h4>
                            <p>Measures how much studies differ from each other. I² > 50% suggests substantial heterogeneity - consider random effects.</p>
                        </div>
                        <div class="help-item">
                            <h4>Random vs Fixed Effects</h4>
                            <p><strong>Fixed:</strong> Assumes one true effect. <strong>Random:</strong> Assumes effects vary across studies. When in doubt, use random effects.</p>
                        </div>
                        <div class="help-item">
                            <h4>Publication Bias</h4>
                            <p>Tendency for positive results to be published more often. We provide tests (Egger, Begg) and adjustments (trim-and-fill) to detect and correct this.</p>
                        </div>
                    </div>

                    <!-- Step 4: Sample Datasets -->
                    <div class="welcome-step" data-step="3">
                        <h2>Try a Sample Dataset</h2>
                        <p>Click any dataset below to load it and explore the features:</p>
                        <div class="sample-datasets" id="sample-datasets">
                            <div class="sample-dataset-card" data-dataset="bcg">
                                <h4>📊 BCG Vaccine Trials</h4>
                                <p>Classic meta-analysis of BCG vaccine effectiveness for TB prevention</p>
                                <div class="meta">
                                    <span>13 studies</span>
                                    <span>Odds Ratios</span>
                                </div>
                            </div>
                            <div class="sample-dataset-card" data-dataset="amlodipine">
                                <h4>💊 Amlodipine Hypertension</h4>
                                <p>Blood pressure reduction trials comparing amlodipine to placebo</p>
                                <div class="meta">
                                    <span>8 studies</span>
                                    <span>Mean Difference</span>
                                </div>
                            </div>
                            <div class="sample-dataset-card" data-dataset="smoking">
                                <h4>🚬 Smoking Cessation NMA</h4>
                                <p>Network meta-analysis comparing cessation interventions</p>
                                <div class="meta">
                                    <span>24 studies</span>
                                    <span>4 treatments</span>
                                </div>
                            </div>
                            <div class="sample-dataset-card" data-dataset="diabetes">
                                <h4>🩺 Diabetes DTA</h4>
                                <p>Diagnostic test accuracy for HbA1c screening</p>
                                <div class="meta">
                                    <span>10 studies</span>
                                    <span>Sensitivity/Specificity</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="welcome-footer">
                    <div class="step-dots">
                        <div class="step-dot active" data-step="0"></div>
                        <div class="step-dot" data-step="1"></div>
                        <div class="step-dot" data-step="2"></div>
                        <div class="step-dot" data-step="3"></div>
                    </div>
                    <div class="welcome-buttons">
                        <button class="btn btn-secondary" id="welcome-skip">Skip Tutorial</button>
                        <button class="btn btn-secondary" id="welcome-prev" style="display:none;">Previous</button>
                        <button class="btn btn-primary" id="welcome-next">Next</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        this.setupWelcomeEvents();
    }

    setupWelcomeEvents() {
        const modal = document.getElementById('welcome-modal');
        const nextBtn = document.getElementById('welcome-next');
        const prevBtn = document.getElementById('welcome-prev');
        const skipBtn = document.getElementById('welcome-skip');
        const dots = modal.querySelectorAll('.step-dot');
        const steps = modal.querySelectorAll('.welcome-step');
        const datasets = modal.querySelectorAll('.sample-dataset-card');

        nextBtn.addEventListener('click', () => {
            if (this.tutorialStep < 3) {
                this.tutorialStep++;
                this.updateTutorialStep(steps, dots, prevBtn, nextBtn);
            } else {
                this.closeWelcome();
            }
        });

        prevBtn.addEventListener('click', () => {
            if (this.tutorialStep > 0) {
                this.tutorialStep--;
                this.updateTutorialStep(steps, dots, prevBtn, nextBtn);
            }
        });

        skipBtn.addEventListener('click', () => this.closeWelcome());

        dots.forEach((dot, i) => {
            dot.addEventListener('click', () => {
                this.tutorialStep = i;
                this.updateTutorialStep(steps, dots, prevBtn, nextBtn);
            });
        });

        datasets.forEach(card => {
            card.addEventListener('click', () => {
                const dataset = card.dataset.dataset;
                this.loadSampleDataset(dataset);
                this.closeWelcome();
            });
        });

        // Close on overlay click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.closeWelcome();
        });
    }

    updateTutorialStep(steps, dots, prevBtn, nextBtn) {
        steps.forEach((step, i) => {
            step.classList.toggle('active', i === this.tutorialStep);
        });
        dots.forEach((dot, i) => {
            dot.classList.toggle('active', i === this.tutorialStep);
        });
        prevBtn.style.display = this.tutorialStep > 0 ? 'inline-flex' : 'none';
        nextBtn.textContent = this.tutorialStep === 3 ? 'Get Started' : 'Next';
    }

    showWelcome() {
        document.getElementById('welcome-modal').classList.add('active');
    }

    closeWelcome() {
        document.getElementById('welcome-modal').classList.remove('active');
        localStorage.setItem('hta_tutorial_seen', 'true');
        this.hasSeenTutorial = true;
    }

    // ============ SAMPLE DATASETS ============
    getSampleDatasets() {
        return {
            bcg: {
                name: 'BCG Vaccine Trials',
                description: 'BCG vaccine effectiveness for TB prevention (Colditz et al.)',
                type: 'pairwise',
                studies: [
                    { study: 'Aronson 1948', effect: -0.9387, se: 0.4151, year: 1948, latitude: 44 },
                    { study: 'Ferguson 1949', effect: -1.5854, se: 0.5765, year: 1949, latitude: 55 },
                    { study: 'Rosenthal 1960', effect: -1.3481, se: 0.3720, year: 1960, latitude: 42 },
                    { study: 'Hart 1977', effect: -0.2198, se: 0.2368, year: 1977, latitude: 52 },
                    { study: 'Frimodt 1973', effect: 0.0120, se: 0.4398, year: 1973, latitude: 13 },
                    { study: 'Stein 1953', effect: -1.6209, se: 0.5061, year: 1953, latitude: 44 },
                    { study: 'Vandiviere 1973', effect: -0.7861, se: 0.3538, year: 1973, latitude: 19 },
                    { study: 'TPT Madras 1980', effect: 0.0116, se: 0.3097, year: 1980, latitude: 13 },
                    { study: 'Coetzee 1968', effect: -0.4697, se: 0.3344, year: 1968, latitude: 27 },
                    { study: 'Rosenthal 1961', effect: -1.3713, se: 0.4008, year: 1961, latitude: 42 },
                    { study: 'Comstock 1974', effect: -0.3397, se: 0.2553, year: 1974, latitude: 33 },
                    { study: 'Comstock 1969', effect: 0.4459, se: 0.2228, year: 1969, latitude: 33 },
                    { study: 'Comstock 1976', effect: -0.0173, se: 0.1687, year: 1976, latitude: 18 }
                ]
            },
            amlodipine: {
                name: 'Amlodipine Blood Pressure',
                description: 'Systolic BP reduction with amlodipine vs placebo',
                type: 'pairwise',
                studies: [
                    { study: 'Trial A', effect: -8.2, se: 1.5, year: 2005 },
                    { study: 'Trial B', effect: -9.1, se: 1.8, year: 2006 },
                    { study: 'Trial C', effect: -7.5, se: 2.1, year: 2007 },
                    { study: 'Trial D', effect: -10.3, se: 1.6, year: 2008 },
                    { study: 'Trial E', effect: -8.8, se: 1.9, year: 2009 },
                    { study: 'Trial F', effect: -6.9, se: 2.3, year: 2010 },
                    { study: 'Trial G', effect: -9.5, se: 1.4, year: 2011 },
                    { study: 'Trial H', effect: -8.0, se: 1.7, year: 2012 }
                ]
            },
            smoking: {
                name: 'Smoking Cessation NMA',
                description: 'Network comparing cessation interventions',
                type: 'nma',
                studies: [
                    { study: 'S01', treatment: 'No contact', n: 80, events: 9 },
                    { study: 'S01', treatment: 'Self-help', n: 77, events: 23 },
                    { study: 'S02', treatment: 'No contact', n: 170, events: 11 },
                    { study: 'S02', treatment: 'Self-help', n: 168, events: 21 },
                    { study: 'S03', treatment: 'No contact', n: 65, events: 14 },
                    { study: 'S03', treatment: 'Individual counseling', n: 64, events: 20 },
                    { study: 'S04', treatment: 'Self-help', n: 50, events: 12 },
                    { study: 'S04', treatment: 'Individual counseling', n: 50, events: 18 },
                    { study: 'S05', treatment: 'No contact', n: 100, events: 8 },
                    { study: 'S05', treatment: 'Group counseling', n: 98, events: 19 },
                    { study: 'S06', treatment: 'Self-help', n: 85, events: 15 },
                    { study: 'S06', treatment: 'Group counseling', n: 88, events: 22 }
                ]
            },
            diabetes: {
                name: 'HbA1c Screening DTA',
                description: 'Diagnostic accuracy of HbA1c for diabetes',
                type: 'dta',
                studies: [
                    { study: 'Study 1', TP: 45, FP: 12, FN: 5, TN: 138 },
                    { study: 'Study 2', TP: 38, FP: 18, FN: 7, TN: 137 },
                    { study: 'Study 3', TP: 52, FP: 15, FN: 8, TN: 125 },
                    { study: 'Study 4', TP: 41, FP: 10, FN: 4, TN: 145 },
                    { study: 'Study 5', TP: 35, FP: 22, FN: 10, TN: 133 },
                    { study: 'Study 6', TP: 48, FP: 14, FN: 6, TN: 132 },
                    { study: 'Study 7', TP: 55, FP: 8, FN: 3, TN: 134 },
                    { study: 'Study 8', TP: 42, FP: 16, FN: 9, TN: 133 },
                    { study: 'Study 9', TP: 39, FP: 20, FN: 11, TN: 130 },
                    { study: 'Study 10', TP: 50, FP: 11, FN: 5, TN: 134 }
                ]
            }
        };
    }

    loadSampleDataset(datasetId) {
        const datasets = this.getSampleDatasets();
        const dataset = datasets[datasetId];
        if (!dataset) return;

        // Store in window for access
        window.currentDataset = dataset;

        // Show toast
        if (window.app && window.app.showToast) {
            window.app.showToast(`Loaded: ${dataset.name}`, 'success');
        }

        // Trigger analysis based on type
        if (dataset.type === 'pairwise') {
            this.runPairwiseAnalysis(dataset);
        } else if (dataset.type === 'nma') {
            this.runNMAAnalysis(dataset);
        } else if (dataset.type === 'dta') {
            this.runDTAAnalysis(dataset);
        }
    }

    runPairwiseAnalysis(dataset) {
        try {
            const ma = new MetaAnalysisMethods({ model: 'random' });
            const results = ma.calculatePooledEffect(dataset.studies);

            // Store results globally for export
            window.lastResults = results;

            // Show results with interpretation
            this.showResultsWithInterpretation(dataset, results);
        } catch (e) {
            console.error('Analysis error:', e);
        }
    }

    runNMAAnalysis(dataset) {
        try {
            const nma = new NetworkMetaAnalysis({ method: 'frequentist' });
            nma.setData(dataset.studies, 'binary');
            nma.run().then(() => {
                this.showNMAResults(dataset, nma.results);
            });
        } catch (e) {
            console.error('NMA error:', e);
        }
    }

    runDTAAnalysis(dataset) {
        if (typeof DTAMetaAnalysis === 'undefined') {
            console.log('DTA analysis would run here');
            return;
        }
        // DTA analysis logic
    }

    showResultsWithInterpretation(dataset, results) {
        // Create results modal
        const resultsModal = document.createElement('div');
        resultsModal.className = 'welcome-modal-overlay active';
        resultsModal.id = 'results-modal';

        const effect = results.random.effect;
        const ci = [results.random.ci_lower, results.random.ci_upper];
        const i2 = results.heterogeneity.I2;

        // Generate interpretation
        let interpretation = '';
        if (dataset.name.includes('BCG')) {
            const or = Math.exp(effect);
            interpretation = `The pooled odds ratio is ${or.toFixed(2)} (95% CI: ${Math.exp(ci[0]).toFixed(2)} to ${Math.exp(ci[1]).toFixed(2)}).
            This suggests BCG vaccination reduces TB risk by approximately ${((1 - or) * 100).toFixed(0)}%.
            ${i2 > 50 ? `The high heterogeneity (I²=${i2.toFixed(0)}%) suggests effects vary substantially across studies, possibly due to latitude differences.` : `Heterogeneity is ${i2 < 25 ? 'low' : 'moderate'} (I²=${i2.toFixed(0)}%).`}`;
        } else {
            interpretation = `The pooled effect is ${effect.toFixed(2)} (95% CI: ${ci[0].toFixed(2)} to ${ci[1].toFixed(2)}).
            ${ci[0] > 0 || ci[1] < 0 ? 'This effect is statistically significant.' : 'This effect is not statistically significant (CI crosses zero).'}
            ${i2 > 50 ? `High heterogeneity (I²=${i2.toFixed(0)}%) suggests considerable variation between studies.` : `Heterogeneity is ${i2 < 25 ? 'low' : 'moderate'} (I²=${i2.toFixed(0)}%).`}`;
        }

        resultsModal.innerHTML = `
            <div class="welcome-modal">
                <div class="welcome-header">
                    <h1>Analysis Results</h1>
                    <p>${dataset.name} - ${dataset.studies.length} studies</p>
                </div>
                <div class="welcome-body">
                    <div class="summary-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px;">
                        <div class="summary-card info" style="padding: 16px; background: #dbeafe; border-radius: 12px;">
                            <div style="font-size: 12px; color: var(--text-muted);">Pooled Effect</div>
                            <div style="font-size: 24px; font-weight: 600;">${effect.toFixed(4)}</div>
                        </div>
                        <div class="summary-card" style="padding: 16px; background: var(--bg); border-radius: 12px;">
                            <div style="font-size: 12px; color: var(--text-muted);">95% CI</div>
                            <div style="font-size: 18px; font-weight: 600;">[${ci[0].toFixed(3)}, ${ci[1].toFixed(3)}]</div>
                        </div>
                        <div class="summary-card ${i2 > 50 ? 'warning' : 'success'}" style="padding: 16px; background: ${i2 > 50 ? '#fef3c7' : '#dcfce7'}; border-radius: 12px;">
                            <div style="font-size: 12px; color: var(--text-muted);">Heterogeneity (I²)</div>
                            <div style="font-size: 24px; font-weight: 600;">${i2.toFixed(1)}%</div>
                        </div>
                    </div>

                    <div class="interpretation-box">
                        <h4>What does this mean?</h4>
                        <p>${interpretation}</p>
                    </div>

                    <h3 style="margin: 20px 0 12px;">Study Details</h3>
                    <table class="data-table" style="width: 100%;">
                        <thead>
                            <tr>
                                <th>Study</th>
                                <th>Effect</th>
                                <th>SE</th>
                                <th>Weight (%)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${dataset.studies.map((s, i) => {
                                const w = 1 / (s.se ** 2);
                                const totalW = dataset.studies.reduce((sum, st) => sum + 1/(st.se**2), 0);
                                return `<tr>
                                    <td>${s.study}</td>
                                    <td>${s.effect.toFixed(4)}</td>
                                    <td>${s.se.toFixed(4)}</td>
                                    <td>${((w/totalW)*100).toFixed(1)}%</td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
                <div class="export-bar" style="display: flex; gap: 8px; padding: 12px; background: var(--bg, #f9fafb); border-radius: 8px; margin-top: 16px; flex-wrap: wrap; justify-content: center;">
                    <button class="btn btn-secondary" onclick="beginnerMode.copyToClipboard('text')" style="font-size: 13px;">
                        Copy Results
                    </button>
                    <button class="btn btn-secondary" onclick="beginnerMode.exportToCSV()" style="font-size: 13px;">
                        Export CSV
                    </button>
                    <button class="btn btn-primary" onclick="beginnerMode.generateReport()" style="font-size: 13px;">
                        Generate Report
                    </button>
                </div>

                <div class="welcome-footer">
                    <div></div>
                    <div class="welcome-buttons">
                        <button class="btn btn-secondary" onclick="document.getElementById('results-modal').remove();">Close</button>
                        <button class="btn btn-primary" onclick="beginnerMode.runPublicationBias();">Check Publication Bias</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(resultsModal);
    }

    showNMAResults(dataset, results) {
        if (window.app && window.app.showToast) {
            window.app.showToast('NMA complete - check Network MA section', 'success');
        }
    }

    runPublicationBias() {
        if (!window.currentDataset) return;

        const modal = document.getElementById('results-modal');
        if (modal) modal.remove();

        const ma = new MetaAnalysisMethods();
        const studies = window.currentDataset.studies;

        const egger = ma.eggerTest(studies);
        const begg = ma.beggTest(studies);
        const trimFill = ma.trimAndFill(studies);

        let biasInterpretation = '';
        if (egger.pValue < 0.1 || begg.pValue < 0.1) {
            biasInterpretation = `Warning: There is evidence of publication bias (Egger p=${egger.pValue.toFixed(3)}, Begg p=${begg.pValue.toFixed(3)}).
            The trim-and-fill method estimates ${trimFill.nMissing} missing studies.
            The adjusted effect is ${trimFill.adjusted.effect.toFixed(4)} compared to the unadjusted ${trimFill.original.effect.toFixed(4)}.`;
        } else {
            biasInterpretation = `Good news: No significant evidence of publication bias was detected (Egger p=${egger.pValue.toFixed(3)}, Begg p=${begg.pValue.toFixed(3)}).
            The funnel plot appears symmetric and trim-and-fill estimates ${trimFill.nMissing} missing studies.`;
        }

        const biasModal = document.createElement('div');
        biasModal.className = 'welcome-modal-overlay active';
        biasModal.id = 'bias-modal';
        biasModal.innerHTML = `
            <div class="welcome-modal">
                <div class="welcome-header" style="background: ${egger.pValue < 0.1 ? 'linear-gradient(135deg, #d97706, #b45309)' : 'linear-gradient(135deg, #16a34a, #15803d)'}">
                    <h1>Publication Bias Assessment</h1>
                    <p>${window.currentDataset.name}</p>
                </div>
                <div class="welcome-body">
                    <div class="summary-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px;">
                        <div class="summary-card" style="padding: 16px; background: var(--bg); border-radius: 12px;">
                            <div style="font-size: 12px; color: var(--text-muted);">Egger's Test p-value</div>
                            <div style="font-size: 24px; font-weight: 600; color: ${egger.pValue < 0.1 ? 'var(--warning)' : 'var(--success)'}">${egger.pValue.toFixed(4)}</div>
                        </div>
                        <div class="summary-card" style="padding: 16px; background: var(--bg); border-radius: 12px;">
                            <div style="font-size: 12px; color: var(--text-muted);">Begg's Test p-value</div>
                            <div style="font-size: 24px; font-weight: 600; color: ${begg.pValue < 0.1 ? 'var(--warning)' : 'var(--success)'}">${begg.pValue.toFixed(4)}</div>
                        </div>
                        <div class="summary-card" style="padding: 16px; background: var(--bg); border-radius: 12px;">
                            <div style="font-size: 12px; color: var(--text-muted);">Trim-Fill Missing</div>
                            <div style="font-size: 24px; font-weight: 600;">${trimFill.nMissing}</div>
                        </div>
                    </div>

                    <div class="interpretation-box" style="background: ${egger.pValue < 0.1 ? 'linear-gradient(135deg, #fef3c7, #fde68a)' : 'linear-gradient(135deg, #dcfce7, #bbf7d0)'}; border-color: ${egger.pValue < 0.1 ? 'var(--warning)' : 'var(--success)'}">
                        <h4>What does this mean?</h4>
                        <p>${biasInterpretation}</p>
                    </div>

                    <h3 style="margin: 20px 0 12px;">Test Details</h3>
                    <div class="help-item">
                        <h4>Egger's Regression Test</h4>
                        <p>Intercept: ${egger.intercept.toFixed(4)}, t-statistic: ${egger.tStatistic.toFixed(3)}, p-value: ${egger.pValue.toFixed(4)}</p>
                    </div>
                    <div class="help-item">
                        <h4>Begg's Rank Correlation</h4>
                        <p>Kendall's tau: ${begg.tau.toFixed(4)}, p-value: ${begg.pValue.toFixed(4)}</p>
                    </div>
                    <div class="help-item">
                        <h4>Trim-and-Fill Adjustment</h4>
                        <p>Original effect: ${trimFill.original.effect.toFixed(4)}, Adjusted effect: ${trimFill.adjusted.effect.toFixed(4)}, Studies imputed: ${trimFill.nMissing}</p>
                    </div>
                </div>
                <div class="welcome-footer">
                    <div></div>
                    <button class="btn btn-primary" onclick="document.getElementById('bias-modal').remove();">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(biasModal);
    }

    // ============ HELP PANEL ============
    createHelpPanel() {
        // Help button
        const helpBtn = document.createElement('button');
        helpBtn.className = 'help-btn';
        helpBtn.innerHTML = '?';
        helpBtn.title = 'Help & Documentation';
        helpBtn.id = 'help-button';
        document.body.appendChild(helpBtn);

        // Help panel
        const helpPanel = document.createElement('div');
        helpPanel.className = 'help-panel';
        helpPanel.id = 'help-panel';
        helpPanel.innerHTML = `
            <div class="help-panel-header">
                <h2>Help & Documentation</h2>
                <button class="btn btn-secondary" id="close-help" style="padding: 6px 12px;">Close</button>
            </div>
            <div class="help-panel-body">
                <div class="help-section">
                    <h3>Getting Started</h3>
                    <div class="help-item">
                        <h4>Loading Data</h4>
                        <p>Drop a CSV or JSON file, or click "Try Examples" to load sample datasets.</p>
                    </div>
                    <div class="help-item">
                        <h4>Data Format</h4>
                        <p>For pairwise MA: Include 'study', 'effect', and 'se' columns. For NMA: Include 'study', 'treatment', 'n', 'events'.</p>
                    </div>
                </div>

                <div class="help-section">
                    <h3>Statistical Terms</h3>
                    <div class="help-item">
                        <h4>Effect Size</h4>
                        <p>The magnitude of treatment effect. Can be odds ratio (OR), risk ratio (RR), mean difference (MD), or standardized mean difference (SMD).</p>
                    </div>
                    <div class="help-item">
                        <h4>Standard Error (SE)</h4>
                        <p>Measures uncertainty in the effect estimate. Smaller SE = more precise estimate.</p>
                    </div>
                    <div class="help-item">
                        <h4>Heterogeneity (I²)</h4>
                        <p>Percentage of variation due to true differences between studies. <25% low, 25-50% moderate, 50-75% substantial, >75% considerable.</p>
                    </div>
                    <div class="help-item">
                        <h4>Tau² (τ²)</h4>
                        <p>Between-study variance in random effects models. Larger values = more heterogeneity.</p>
                    </div>
                    <div class="help-item">
                        <h4>Fixed vs Random Effects</h4>
                        <p><strong>Fixed:</strong> Assumes one true effect size. Use when studies are functionally identical.<br>
                        <strong>Random:</strong> Assumes effects vary. Use when studies differ in populations, interventions, or settings.</p>
                    </div>
                </div>

                <div class="help-section">
                    <h3>Publication Bias</h3>
                    <div class="help-item">
                        <h4>Egger's Test</h4>
                        <p>Tests for funnel plot asymmetry using regression. p < 0.10 suggests potential bias.</p>
                    </div>
                    <div class="help-item">
                        <h4>Begg's Test</h4>
                        <p>Rank correlation test for bias. Less sensitive than Egger's but useful for confirmation.</p>
                    </div>
                    <div class="help-item">
                        <h4>Trim-and-Fill</h4>
                        <p>Imputes "missing" studies to make funnel plot symmetric. Provides adjusted estimate.</p>
                    </div>
                </div>

                <div class="help-section">
                    <h3>Network Meta-Analysis</h3>
                    <div class="help-item">
                        <h4>What is NMA?</h4>
                        <p>Compares multiple treatments simultaneously using direct and indirect evidence. Creates a "network" of treatment comparisons.</p>
                    </div>
                    <div class="help-item">
                        <h4>SUCRA/P-scores</h4>
                        <p>Rankings of treatments. SUCRA 100% = best treatment, 0% = worst. P-scores are similar (frequentist version).</p>
                    </div>
                    <div class="help-item">
                        <h4>Consistency</h4>
                        <p>Tests if direct evidence agrees with indirect evidence. Inconsistency suggests the network may be unreliable.</p>
                    </div>
                </div>

                <div class="help-section">
                    <h3>Keyboard Shortcuts</h3>
                    <div class="help-item">
                        <h4>Navigation</h4>
                        <p><kbd>?</kbd> Toggle help panel<br>
                        <kbd>Esc</kbd> Close modals<br>
                        <kbd>Ctrl+O</kbd> Open file</p>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(helpPanel);

        // Events
        helpBtn.addEventListener('click', () => this.toggleHelp());
        document.getElementById('close-help').addEventListener('click', () => this.toggleHelp());

        // Keyboard shortcut
        document.addEventListener('keydown', (e) => {
            if (e.key === '?' && !e.ctrlKey && !e.altKey) {
                const active = document.activeElement;
                if (active.tagName !== 'INPUT' && active.tagName !== 'TEXTAREA') {
                    e.preventDefault();
                    this.toggleHelp();
                }
            }
            if (e.key === 'Escape') {
                document.getElementById('help-panel').classList.remove('open');
                document.querySelectorAll('.welcome-modal-overlay.active').forEach(m => m.remove());
            }
        });
    }

    toggleHelp() {
        document.getElementById('help-panel').classList.toggle('open');
    }

    // Alias for backward compatibility
    toggleHelpPanel() {
        this.toggleHelp();
    }

    // ============ DATA ENTRY ============
    createDataEntryPanel() {
        const panel = document.createElement('div');
        panel.className = 'data-entry-panel';
        panel.id = 'data-entry-panel';
        panel.innerHTML = `
            <div class="data-entry-header">
                <h2>Enter Study Data</h2>
                <button class="btn btn-secondary" onclick="beginnerMode.closeDataEntry()">Cancel</button>
            </div>
            <div class="data-entry-body">
                <p style="margin-bottom: 16px; color: var(--text-muted);">Enter your study data below. You can also paste from Excel (Ctrl+V).</p>
                <table class="data-grid" id="data-grid">
                    <thead>
                        <tr>
                            <th>Study Name</th>
                            <th>Effect Size <span class="tooltip-trigger" title="Log odds ratio, log risk ratio, or mean difference">?</span></th>
                            <th>Standard Error <span class="tooltip-trigger" title="SE of the effect size">?</span></th>
                            <th>Year (optional)</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody id="data-grid-body">
                        ${this.generateEmptyRows(5)}
                    </tbody>
                </table>
                <button class="btn btn-secondary" style="margin-top: 12px;" onclick="beginnerMode.addDataRow()">+ Add Row</button>
            </div>
            <div class="data-entry-footer">
                <div>
                    <button class="btn btn-secondary" onclick="beginnerMode.pasteFromClipboard()">Paste from Clipboard</button>
                </div>
                <div>
                    <button class="btn btn-secondary" onclick="beginnerMode.closeDataEntry()">Cancel</button>
                    <button class="btn btn-primary" onclick="beginnerMode.analyzeEnteredData()">Run Analysis</button>
                </div>
            </div>
        `;
        document.body.appendChild(panel);
    }

    generateEmptyRows(count) {
        let rows = '';
        for (let i = 0; i < count; i++) {
            rows += `
                <tr>
                    <td><input type="text" placeholder="Study ${i + 1}" data-col="study"></td>
                    <td><input type="number" step="any" placeholder="0.00" data-col="effect"></td>
                    <td><input type="number" step="any" placeholder="0.00" data-col="se"></td>
                    <td><input type="number" placeholder="2024" data-col="year"></td>
                    <td><button class="btn btn-secondary" style="padding: 4px 8px; font-size: 12px;" onclick="this.closest('tr').remove()">X</button></td>
                </tr>
            `;
        }
        return rows;
    }

    addDataRow() {
        const tbody = document.getElementById('data-grid-body');
        const rowCount = tbody.querySelectorAll('tr').length;
        tbody.insertAdjacentHTML('beforeend', this.generateEmptyRows(1).replace('Study 1', `Study ${rowCount + 1}`));
    }

    showDataEntry() {
        document.getElementById('data-entry-panel').classList.add('active');
    }

    // Alias for backward compatibility
    showDataEntryModal() {
        this.showDataEntry();
    }

    closeDataEntry() {
        document.getElementById('data-entry-panel').classList.remove('active');
    }

    /**
     * Interpret meta-analysis results in plain language
     * @param {string} effectType - 'OR', 'RR', 'MD', 'SMD'
     * @param {Object} results - Results object with pooled and heterogeneity
     * @returns {string} Plain language interpretation
     */
    interpretResults(effectType, results) {
        const effect = results.pooled?.effect || results.random?.effect || 0;
        const ci = results.pooled?.ci || [results.random?.ci_lower || 0, results.random?.ci_upper || 0];
        const i2 = results.heterogeneity?.I2 || 0;

        let interpretation = '';

        // Effect size interpretation
        if (effectType === 'OR' || effectType === 'RR') {
            const expEffect = Math.exp(effect);
            if (expEffect < 1) {
                interpretation += `The pooled ${effectType} is ${expEffect.toFixed(2)}, suggesting a ${((1 - expEffect) * 100).toFixed(0)}% reduction in risk. `;
            } else {
                interpretation += `The pooled ${effectType} is ${expEffect.toFixed(2)}, suggesting a ${((expEffect - 1) * 100).toFixed(0)}% increase in risk. `;
            }
        } else {
            interpretation += `The pooled effect is ${effect.toFixed(2)} (95% CI: ${ci[0].toFixed(2)} to ${ci[1].toFixed(2)}). `;
        }

        // Significance
        if ((ci[0] > 0 && ci[1] > 0) || (ci[0] < 0 && ci[1] < 0)) {
            interpretation += 'This effect is statistically significant. ';
        } else {
            interpretation += 'This effect is not statistically significant (CI crosses null). ';
        }

        // Heterogeneity
        if (i2 < 25) {
            interpretation += `Heterogeneity is low (I²=${i2.toFixed(0)}%), suggesting consistent effects across studies.`;
        } else if (i2 < 50) {
            interpretation += `Heterogeneity is moderate (I²=${i2.toFixed(0)}%), suggesting some variation between studies.`;
        } else if (i2 < 75) {
            interpretation += `Heterogeneity is substantial (I²=${i2.toFixed(0)}%), suggesting considerable variation between studies.`;
        } else {
            interpretation += `Heterogeneity is considerable (I²=${i2.toFixed(0)}%), suggesting major differences between studies that should be explored.`;
        }

        return interpretation;
    }

    async pasteFromClipboard() {
        try {
            const text = await navigator.clipboard.readText();
            const rows = text.split('\n').filter(r => r.trim());
            const tbody = document.getElementById('data-grid-body');
            tbody.innerHTML = '';

            rows.forEach((row, i) => {
                const cols = row.split('\t');
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><input type="text" value="${cols[0] || ''}" data-col="study"></td>
                    <td><input type="number" step="any" value="${cols[1] || ''}" data-col="effect"></td>
                    <td><input type="number" step="any" value="${cols[2] || ''}" data-col="se"></td>
                    <td><input type="number" value="${cols[3] || ''}" data-col="year"></td>
                    <td><button class="btn btn-secondary" style="padding: 4px 8px; font-size: 12px;" onclick="this.closest('tr').remove()">X</button></td>
                `;
                tbody.appendChild(tr);
            });

            if (window.app && window.app.showToast) {
                window.app.showToast(`Pasted ${rows.length} rows`, 'success');
            }
        } catch (e) {
            console.error('Paste error:', e);
        }
    }

    analyzeEnteredData() {
        const tbody = document.getElementById('data-grid-body');
        const rows = tbody.querySelectorAll('tr');
        const studies = [];

        rows.forEach(row => {
            const study = row.querySelector('[data-col="study"]').value.trim();
            const effect = parseFloat(row.querySelector('[data-col="effect"]').value);
            const se = parseFloat(row.querySelector('[data-col="se"]').value);
            const year = parseInt(row.querySelector('[data-col="year"]').value) || null;

            if (study && !isNaN(effect) && !isNaN(se) && se > 0) {
                studies.push({ study, effect, se, year });
            }
        });

        if (studies.length < 2) {
            if (window.app && window.app.showToast) {
                window.app.showToast('Need at least 2 studies with valid data', 'error');
            }
            return;
        }

        this.closeDataEntry();

        const dataset = {
            name: 'Your Analysis',
            description: 'User-entered data',
            type: 'pairwise',
            studies
        };

        window.currentDataset = dataset;
        this.runPairwiseAnalysis(dataset);
    }

    // ============ ENHANCED DROP ZONE ============
    enhanceDropZone() {
        const dropZone = document.getElementById('drop-zone');
        if (!dropZone) return;

        const enhanced = document.createElement('div');
        enhanced.className = 'drop-zone-enhanced';
        enhanced.innerHTML = `
            <h3>Or get started quickly:</h3>
            <div class="quick-actions">
                <button class="quick-action-btn" id="btn-try-examples">
                    <span class="icon">📚</span>
                    Try Examples
                </button>
                <button class="quick-action-btn" id="btn-enter-data">
                    <span class="icon">📝</span>
                    Enter Data Manually
                </button>
                <button class="quick-action-btn" id="btn-show-tutorial">
                    <span class="icon">🎓</span>
                    View Tutorial
                </button>
            </div>
        `;
        dropZone.appendChild(enhanced);

        document.getElementById('btn-try-examples').addEventListener('click', () => {
            this.tutorialStep = 3;
            this.showWelcome();
            this.updateTutorialStep(
                document.querySelectorAll('.welcome-step'),
                document.querySelectorAll('.step-dot'),
                document.getElementById('welcome-prev'),
                document.getElementById('welcome-next')
            );
        });

        document.getElementById('btn-enter-data').addEventListener('click', () => this.showDataEntry());
        document.getElementById('btn-show-tutorial').addEventListener('click', () => {
            this.tutorialStep = 0;
            this.showWelcome();
        });
    }

    // ============ TOOLTIPS ============
    addTooltips() {
        // Add tooltip container for common statistical terms
        const tooltipData = {
            'I²': 'Heterogeneity measure: <25% low, 25-50% moderate, 50-75% substantial, >75% considerable',
            'τ²': 'Between-study variance in random effects model',
            'Q': 'Cochran Q statistic for heterogeneity',
            'HKSJ': 'Hartung-Knapp-Sidik-Jonkman adjustment for confidence intervals',
            'REML': 'Restricted Maximum Likelihood estimator for tau-squared',
            'DL': 'DerSimonian-Laird estimator (default random effects)',
            'SUCRA': 'Surface Under Cumulative Ranking curve (100% = best)',
            'P-score': 'Frequentist version of SUCRA ranking',
            'NMA': 'Network Meta-Analysis - compares multiple treatments',
            'PSA': 'Probabilistic Sensitivity Analysis',
            'ICER': 'Incremental Cost-Effectiveness Ratio',
            'QALY': 'Quality-Adjusted Life Year'
        };

        // Store tooltip data globally
        this.tooltipData = tooltipData;

        // Create tooltip elements for sidebar items with statistical terms
        this.createTooltipElements(tooltipData);

        // Add tooltips via MutationObserver to catch dynamic content
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) {
                        this.applyTooltipsToElement(node);
                    }
                });
            });
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    createTooltipElements(tooltipData) {
        // Add tooltip indicators next to sidebar labels containing statistical terms
        const sidebarLabels = document.querySelectorAll('.sidebar .nav-item span, .sidebar label, h2, h3, th');

        sidebarLabels.forEach(label => {
            const text = label.textContent;
            Object.keys(tooltipData).forEach(term => {
                if (text.includes(term)) {
                    // Only add if not already added
                    if (!label.querySelector('.stat-term-tooltip')) {
                        const tooltip = document.createElement('span');
                        tooltip.className = 'stat-term-tooltip';
                        tooltip.setAttribute('data-tooltip', tooltipData[term]);
                        tooltip.innerHTML = '?';
                        tooltip.style.cssText = `
                            display: inline-flex;
                            align-items: center;
                            justify-content: center;
                            width: 14px;
                            height: 14px;
                            background: var(--border, #ddd);
                            border-radius: 50%;
                            font-size: 9px;
                            color: var(--text-muted, #666);
                            cursor: help;
                            margin-left: 4px;
                            vertical-align: middle;
                        `;
                        tooltip.title = tooltipData[term];
                        label.appendChild(tooltip);
                    }
                }
            });
        });

        // Also add tooltips for common terms found in result displays
        const resultTerms = document.querySelectorAll('.result-label, .stat-label, .metric-label');
        resultTerms.forEach(elem => {
            this.applyTooltipsToElement(elem);
        });
    }

    applyTooltipsToElement(element) {
        if (!element || !element.textContent) return;

        const text = element.textContent;
        Object.keys(this.tooltipData || {}).forEach(term => {
            if (text.includes(term) && !element.querySelector('.stat-term-tooltip')) {
                const tooltip = document.createElement('span');
                tooltip.className = 'stat-term-tooltip';
                tooltip.setAttribute('data-tooltip', this.tooltipData[term]);
                tooltip.innerHTML = '?';
                tooltip.style.cssText = `
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 14px;
                    height: 14px;
                    background: var(--border, #ddd);
                    border-radius: 50%;
                    font-size: 9px;
                    color: var(--text-muted, #666);
                    cursor: help;
                    margin-left: 4px;
                    vertical-align: middle;
                `;
                tooltip.title = this.tooltipData[term];
                element.appendChild(tooltip);
            }
        });
    }

    // ============ EXPORT FEATURES ============

    /**
     * Export results to CSV file
     */
    exportToCSV(data, filename = 'meta_analysis_results.csv') {
        if (!data || !data.studies) {
            if (window.currentDataset) {
                data = window.currentDataset;
            } else {
                this.showToast('No data to export', 'error');
                return;
            }
        }

        let csv = 'Study,Effect,SE,Weight\n';
        const totalWeight = data.studies.reduce((sum, s) => sum + 1/(s.se**2), 0);

        data.studies.forEach(s => {
            const weight = ((1/(s.se**2)) / totalWeight * 100).toFixed(2);
            csv += `"${s.study}",${s.effect},${s.se},${weight}%\n`;
        });

        // Add summary if available
        if (window.lastResults) {
            csv += '\n\nSummary Results\n';
            csv += `Pooled Effect,${window.lastResults.random?.effect || ''}\n`;
            csv += `CI Lower,${window.lastResults.random?.ci_lower || ''}\n`;
            csv += `CI Upper,${window.lastResults.random?.ci_upper || ''}\n`;
            csv += `I-squared,${window.lastResults.heterogeneity?.I2 || ''}%\n`;
            csv += `Tau-squared,${window.lastResults.heterogeneity?.tau2 || ''}\n`;
        }

        this.downloadFile(csv, filename, 'text/csv');
        this.showToast('Exported to CSV', 'success');
    }

    /**
     * Export results to Excel-compatible format
     */
    exportToExcel(data, filename = 'meta_analysis_results.xlsx') {
        // For now, export as CSV with .xlsx extension (Excel can open it)
        // A full implementation would use a library like SheetJS
        this.exportToCSV(data, filename.replace('.xlsx', '.csv'));
    }

    /**
     * Copy results to clipboard
     */
    async copyToClipboard(format = 'text') {
        const data = window.currentDataset;
        const results = window.lastResults;

        if (!data && !results) {
            this.showToast('No results to copy', 'error');
            return;
        }

        let text = '';

        if (format === 'text') {
            text = `Meta-Analysis Results\n`;
            text += `${'='.repeat(40)}\n\n`;

            if (data) {
                text += `Dataset: ${data.name}\n`;
                text += `Studies: ${data.studies.length}\n\n`;
            }

            if (results) {
                text += `Pooled Effect: ${results.random?.effect?.toFixed(4) || 'N/A'}\n`;
                text += `95% CI: [${results.random?.ci_lower?.toFixed(4) || 'N/A'}, ${results.random?.ci_upper?.toFixed(4) || 'N/A'}]\n`;
                text += `I²: ${results.heterogeneity?.I2?.toFixed(1) || 'N/A'}%\n`;
                text += `τ²: ${results.heterogeneity?.tau2?.toFixed(4) || 'N/A'}\n`;
                text += `Q: ${results.heterogeneity?.Q?.toFixed(2) || 'N/A'} (p=${results.heterogeneity?.pValue?.toFixed(4) || 'N/A'})\n`;
            }
        } else if (format === 'table') {
            // Tab-separated for pasting into Excel/Word
            text = 'Study\tEffect\tSE\tWeight\n';
            if (data && data.studies) {
                const totalWeight = data.studies.reduce((sum, s) => sum + 1/(s.se**2), 0);
                data.studies.forEach(s => {
                    const weight = ((1/(s.se**2)) / totalWeight * 100).toFixed(2);
                    text += `${s.study}\t${s.effect}\t${s.se}\t${weight}%\n`;
                });
            }
        }

        try {
            await navigator.clipboard.writeText(text);
            this.showToast('Copied to clipboard', 'success');
        } catch (e) {
            console.error('Clipboard error:', e);
            this.showToast('Failed to copy', 'error');
        }
    }

    /**
     * Export chart/plot as PNG image
     */
    exportPlotAsPNG(canvasId, filename = 'forest_plot.png') {
        const canvas = document.getElementById(canvasId) || document.querySelector('canvas');
        if (!canvas) {
            this.showToast('No plot found to export', 'error');
            return;
        }

        const link = document.createElement('a');
        link.download = filename;
        link.href = canvas.toDataURL('image/png');
        link.click();
        this.showToast('Plot exported as PNG', 'success');
    }

    /**
     * Export chart/plot as SVG
     */
    exportPlotAsSVG(canvasId, filename = 'forest_plot.svg') {
        const canvas = document.getElementById(canvasId) || document.querySelector('canvas');
        if (!canvas) {
            this.showToast('No plot found to export', 'error');
            return;
        }

        // Convert canvas to SVG (simplified)
        const ctx = canvas.getContext('2d');
        const imgData = canvas.toDataURL('image/png');

        const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${canvas.width}" height="${canvas.height}">
    <image xlink:href="${imgData}" width="${canvas.width}" height="${canvas.height}"/>
</svg>`;

        this.downloadFile(svg, filename, 'image/svg+xml');
        this.showToast('Plot exported as SVG', 'success');
    }

    /**
     * Generate comprehensive summary report
     */
    generateReport() {
        const data = window.currentDataset;
        const results = window.lastResults;

        if (!data) {
            this.showToast('No analysis to report', 'error');
            return;
        }

        const interpretation = results ? this.interpretResults('OR', results) : '';
        const date = new Date().toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric'
        });

        let report = `
<!DOCTYPE html>
<html>
<head>
    <title>Meta-Analysis Report - ${data.name}</title>
    <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; }
        h1 { color: #1e40af; border-bottom: 3px solid #3b82f6; padding-bottom: 10px; }
        h2 { color: #1e40af; margin-top: 30px; }
        .meta { color: #6b7280; font-size: 14px; margin-bottom: 30px; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #e5e7eb; padding: 12px; text-align: left; }
        th { background: #f3f4f6; font-weight: 600; }
        tr:nth-child(even) { background: #f9fafb; }
        .summary-box { background: #eff6ff; border-left: 4px solid #3b82f6; padding: 20px; margin: 20px 0; border-radius: 0 8px 8px 0; }
        .interpretation { background: #f0fdf4; border-left: 4px solid #22c55e; padding: 20px; margin: 20px 0; border-radius: 0 8px 8px 0; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; }
        @media print { body { margin: 0; } }
    </style>
</head>
<body>
    <h1>Meta-Analysis Report</h1>
    <div class="meta">
        <strong>Dataset:</strong> ${data.name}<br>
        <strong>Date:</strong> ${date}<br>
        <strong>Studies:</strong> ${data.studies.length}
    </div>

    <h2>Summary Results</h2>
    <div class="summary-box">
        <table>
            <tr><th>Statistic</th><th>Value</th></tr>
            <tr><td>Pooled Effect (Random)</td><td>${results?.random?.effect?.toFixed(4) || 'N/A'}</td></tr>
            <tr><td>95% Confidence Interval</td><td>[${results?.random?.ci_lower?.toFixed(4) || 'N/A'}, ${results?.random?.ci_upper?.toFixed(4) || 'N/A'}]</td></tr>
            <tr><td>Heterogeneity (I²)</td><td>${results?.heterogeneity?.I2?.toFixed(1) || 'N/A'}%</td></tr>
            <tr><td>Between-study variance (τ²)</td><td>${results?.heterogeneity?.tau2?.toFixed(4) || 'N/A'}</td></tr>
            <tr><td>Cochran's Q</td><td>${results?.heterogeneity?.Q?.toFixed(2) || 'N/A'} (p = ${results?.heterogeneity?.pValue?.toFixed(4) || 'N/A'})</td></tr>
        </table>
    </div>

    <h2>Interpretation</h2>
    <div class="interpretation">
        <p>${interpretation || 'Run an analysis to generate interpretation.'}</p>
    </div>

    <h2>Individual Studies</h2>
    <table>
        <thead>
            <tr>
                <th>Study</th>
                <th>Effect</th>
                <th>SE</th>
                <th>Weight (%)</th>
            </tr>
        </thead>
        <tbody>
            ${data.studies.map(s => {
                const totalW = data.studies.reduce((sum, st) => sum + 1/(st.se**2), 0);
                const w = ((1/(s.se**2)) / totalW * 100).toFixed(1);
                return `<tr><td>${s.study}</td><td>${s.effect.toFixed(4)}</td><td>${s.se.toFixed(4)}</td><td>${w}%</td></tr>`;
            }).join('')}
        </tbody>
    </table>

    <div class="footer">
        Generated by HTA Meta-Analysis Engine | ${date}
    </div>
</body>
</html>`;

        // Open in new window for printing/saving
        const win = window.open('', '_blank');
        win.document.write(report);
        win.document.close();

        this.showToast('Report generated - use Ctrl+P to print/save as PDF', 'success');
    }

    /**
     * Download file helper
     */
    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
    }

    /**
     * Show toast notification
     */
    showToast(message, type = 'info') {
        if (window.app && window.app.showToast) {
            window.app.showToast(message, type);
        } else {
            // Fallback toast
            const toast = document.createElement('div');
            toast.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                padding: 12px 24px;
                background: ${type === 'success' ? '#22c55e' : type === 'error' ? '#ef4444' : '#3b82f6'};
                color: white;
                border-radius: 8px;
                font-size: 14px;
                z-index: 99999;
                animation: fadeIn 0.3s ease;
            `;
            toast.textContent = message;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
        }
    }

    /**
     * Add export buttons to results modal
     */
    addExportButtons(container) {
        const exportBar = document.createElement('div');
        exportBar.className = 'export-bar';
        exportBar.style.cssText = `
            display: flex;
            gap: 8px;
            padding: 12px;
            background: var(--bg, #f9fafb);
            border-radius: 8px;
            margin-top: 16px;
            flex-wrap: wrap;
        `;
        exportBar.innerHTML = `
            <button class="btn btn-secondary" onclick="beginnerMode.copyToClipboard('text')" style="font-size: 13px;">
                📋 Copy Results
            </button>
            <button class="btn btn-secondary" onclick="beginnerMode.copyToClipboard('table')" style="font-size: 13px;">
                📊 Copy Table
            </button>
            <button class="btn btn-secondary" onclick="beginnerMode.exportToCSV()" style="font-size: 13px;">
                💾 Export CSV
            </button>
            <button class="btn btn-secondary" onclick="beginnerMode.exportPlotAsPNG()" style="font-size: 13px;">
                🖼️ Export Plot
            </button>
            <button class="btn btn-primary" onclick="beginnerMode.generateReport()" style="font-size: 13px;">
                📄 Generate Report
            </button>
        `;
        container.appendChild(exportBar);
    }
}

// Initialize on load
let beginnerMode;
document.addEventListener('DOMContentLoaded', () => {
    beginnerMode = new BeginnerMode();
    window.beginnerMode = beginnerMode;
});

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BeginnerMode };
}
if (typeof window !== 'undefined') {
    window.BeginnerMode = BeginnerMode;
}
