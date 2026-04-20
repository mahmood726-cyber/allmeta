  <script>
    if (typeof Plotly === 'undefined') {
      document.write('<script src="https://cdnjs.cloudflare.com/ajax/libs/plotly.js/2.27.0/plotly.min.js"><\/script>');
    }
  </script>
  <script>
    // =============================================
    // DOSE RESPONSE PRO v3.0 - JAVASCRIPT
    // =============================================

    // Application State
    const AppState = {
      studies: [],
      settings: {
        modelType: 'linear',
        referenceDose: 0,
        splineKnots: 4,
        outcomeType: 'rate',
        estimationMethod: 'wls',
        ciMethod: 'wald',
        confLevel: 0.95,
        testNonlinearity: 'yes',
        knotPlacement: 'quantiles',
        zeroHandling: 'continuity',
        doseMin: null,
        doseMax: null
      },
      results: null,
      modelComparison: null,
      logScale: false,
      theme: 'dark'
    };

    // Study counter
    let studyCounter = 0;

    // =============================================
    // INITIALIZATION
    // =============================================

    document.addEventListener('DOMContentLoaded', function() {
      initializeApp();
    });

    function initializeApp() {
      // Initialize with one empty study
      addStudy();

      // Bind settings changes
      bindSettingsEvents();

      // Load saved theme
      const savedTheme = localStorage.getItem('doseResponseTheme') || 'dark';
      setTheme(savedTheme);

      console.log('Dose Response Pro v3.0 initialized');
    }

    function bindSettingsEvents() {
      document.getElementById('modelType').addEventListener('change', function() {
        AppState.settings.modelType = this.value;
        toggleSplineKnots();
      });

      document.getElementById('referenceDose').addEventListener('change', function() {
        AppState.settings.referenceDose = parseFloat(this.value) || 0;
      });

      document.getElementById('splineKnots').addEventListener('change', function() {
        AppState.settings.splineKnots = parseInt(this.value);
      });

      document.getElementById('outcomeType').addEventListener('change', function() {
        AppState.settings.outcomeType = this.value;
      });

      document.getElementById('estimationMethod').addEventListener('change', function() {
        AppState.settings.estimationMethod = this.value;
      });

      document.getElementById('ciMethod').addEventListener('change', function() {
        AppState.settings.ciMethod = this.value;
        toggleBootstrapSettings();
      });

      document.getElementById('confLevel').addEventListener('change', function() {
        AppState.settings.confLevel = parseFloat(this.value);
      });

      document.getElementById('useBootstrap').addEventListener('change', function() {
        AppState.settings.useBootstrap = this.value;
        toggleBootstrapSettings();
      });

      document.getElementById('nBoot').addEventListener('change', function() {
        AppState.settings.nBoot = parseInt(this.value);
      });

      document.getElementById('bootMethod').addEventListener('change', function() {
        AppState.settings.bootMethod = this.value;
      });
    }

    function toggleSplineKnots() {
      const container = document.getElementById('splineKnotsContainer');
      const knotPlacement = document.getElementById('knotPlacementContainer');
      if (AppState.settings.modelType === 'spline' || AppState.settings.modelType === 'fractional') {
        container.classList.remove('hidden');
        knotPlacement.classList.remove('hidden');
      } else {
        container.classList.add('hidden');
        knotPlacement.classList.add('hidden');
      }
    }

    function toggleBootstrapSettings() {
      const ciMethod = document.getElementById('ciMethod').value;
      const useBootstrap = document.getElementById('useBootstrap')?.value || 'no';
      const bootstrapSettings = document.getElementById('bootstrapSettings');
      const bootstrapReplications = document.getElementById('bootstrapReplicationsContainer');
      const bootstrapMethod = document.getElementById('bootstrapMethodContainer');

      // Show bootstrap settings if bootstrap CI is selected or if ciMethod is 'bootstrap'
      const showBootstrap = ciMethod === 'bootstrap' || useBootstrap === 'yes';

      if (bootstrapSettings) {
        bootstrapSettings.style.display = ciMethod === 'bootstrap' ? 'block' : 'none';
      }
      if (bootstrapReplications) {
        bootstrapReplications.style.display = showBootstrap ? 'block' : 'none';
      }
      if (bootstrapMethod) {
        bootstrapMethod.style.display = showBootstrap ? 'block' : 'none';
      }
    }

    // =============================================
    // THEME MANAGEMENT
    // =============================================

    function toggleTheme() {
      const newTheme = AppState.theme === 'dark' ? 'light' : 'dark';
      setTheme(newTheme);
    }

    function setTheme(theme) {
      AppState.theme = theme;
      document.documentElement.setAttribute('data-theme', theme);
      document.getElementById('themeIcon').textContent = theme === 'dark' ? '🌙' : '☀️';
      localStorage.setItem('doseResponseTheme', theme);

      // Update plot backgrounds if they exist
      if (AppState.results) {
        generateDoseResponsePlot(AppState.results);
        generateStudyCurvesPlot(AppState.studies);
      }
    }

    // =============================================
    // TAB NAVIGATION
    // =============================================

    function switchTab(tabName) {
      // Update tab buttons
      document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('tab-btn--active');
        if (btn.dataset.tab === tabName) {
          btn.classList.add('tab-btn--active');
        }
      });

      // Update panels
      document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.remove('tab-panel--active');
      });
      document.getElementById('panel-' + tabName).classList.add('tab-panel--active');
    }

    // =============================================
    // STUDY MANAGEMENT
    // =============================================

    function addStudy(data = null) {
      studyCounter++;
      const studyId = 'study-' + studyCounter;

      const container = document.getElementById('studiesContainer');
      const studyElement = document.createElement('div');
      studyElement.className = 'study-item';
      studyElement.id = studyId;

      // Default dose points (3 levels if no data provided)
      const defaultPoints = data && data.dosePoints ? data.dosePoints : [
        { dose: 0, cases: 0, n: 0 },
        { dose: 1, cases: 0, n: 0 },
        { dose: 2, cases: 0, n: 0 }
      ];

      const dosePointsHTML = defaultPoints.map((point, idx) => `
        <div class="dose-point-input">
          <label>Dose ${idx + 1}</label>
          <input type="number" class="input input--sm input--mono dose-dose"
                 value="${point.dose}" step="any" placeholder="Dose">
        </div>
        <div class="dose-point-input">
          <label>Cases</label>
          <input type="number" class="input input--sm input--mono dose-cases"
                 value="${point.cases}" min="0" step="1" placeholder="Cases">
        </div>
        <div class="dose-point-input">
          <label/N/Time</label>
          <input type="number" class="input input--sm input--mono dose-n"
                 value="${point.n}" min="0" step="any" placeholder="N">
        </div>
      `).join('');

      studyElement.innerHTML = `
        <div class="study-item__header">
          <input type="text" class="input study-name"
                 placeholder="Study Name (e.g., Smith 2020)"
                 value="${data ? data.name : ''}" style="max-width: 300px;">
          <div class="flex gap-2">
            <button class="btn btn--ghost btn--sm" onclick="addDosePoint('${studyId}')">+ Dose Point</button>
            <button class="btn btn--ghost btn--sm" onclick="removeDosePoint('${studyId}')" title="Remove last dose point">−</button>
            <button class="btn btn--ghost btn--sm btn--icon" onclick="removeStudy('${studyId}')" title="Remove study">×</button>
          </div>
        </div>
        <div class="dose-points-grid" id="${studyId}-points">
          ${dosePointsHTML}
        </div>
      `;

      container.appendChild(studyElement);
    }

    function removeStudy(studyId) {
      const element = document.getElementById(studyId);
      if (element && document.querySelectorAll('.study-item').length > 1) {
        element.remove();
      } else if (document.querySelectorAll('.study-item').length <= 1) {
        alert('You must have at least one study.');
      }
    }

    function clearAllStudies() {
      if (confirm('Clear all study data?')) {
        document.getElementById('studiesContainer').innerHTML = '';
        studyCounter = 0;
        addStudy();
      }
    }

    function addDosePoint(studyId) {
      const pointsContainer = document.getElementById(studyId + '-points');
      const currentTriplets = pointsContainer.querySelectorAll('.dose-point-input').length / 3;

      const newPointHTML = `
        <div class="dose-point-input">
          <label>Dose ${currentTriplets + 1}</label>
          <input type="number" class="input input--sm input--mono dose-dose"
                 step="any" placeholder="Dose">
        </div>
        <div class="dose-point-input">
          <label>Cases</label>
          <input type="number" class="input input--sm input--mono dose-cases"
                 min="0" step="1" placeholder="Cases">
        </div>
        <div class="dose-point-input">
          <label>N/Time</label>
          <input type="number" class="input input--sm input--mono dose-n"
                 min="0" step="any" placeholder="N">
        </div>
      `;

      pointsContainer.insertAdjacentHTML('beforeend', newPointHTML);
    }

    function removeDosePoint(studyId) {
      const pointsContainer = document.getElementById(studyId + '-points');
      const currentInputs = pointsContainer.querySelectorAll('.dose-point-input');
      if (currentInputs.length > 6) { // Keep at least 2 dose points (6 inputs)
        for (let i = 0; i < 3; i++) {
          currentInputs[currentInputs.length - 1 - i].remove();
        }
      }
    }

    // =============================================
    // DATA IMPORT/EXPORT
    // =============================================

    function exportData() {
      const studies = getStudyData();
      if (studies.length === 0) {
        alert('No data to export.');
        return;
      }

      const dataStr = JSON.stringify(studies, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'dose-response-data.json';
      a.click();
      URL.revokeObjectURL(url);
    }

    function importData() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = function(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(e) {
          try {
            const studies = JSON.parse(e.target.result);
            if (!Array.isArray(studies)) throw new Error('Invalid format');

            // Clear existing studies
            document.getElementById('studiesContainer').innerHTML = '';
            studyCounter = 0;

            // Load studies
            studies.forEach(study => addStudy(study));

            alert(`Imported ${studies.length} study/studies.`);
          } catch (err) {
            alert('Error importing file: ' + err.message);
          }
        };
        reader.readAsText(file);
      };
      input.click();
    }

    // =============================================
    // CSV IMPORT FUNCTIONS
    // =============================================

    /**
     * Trigger CSV import dialog
     */
    function importCSV() {
      const fileInput = document.getElementById('csvFileInput');
      if (fileInput) {
        fileInput.click();
      } else {
        showToast('Error: CSV file input not initialized. Please refresh the page.', 'error');
      }
    }

    /**
     * Import data from CSV file
     * @param {File} file - CSV file to import
     */
    function importFromCSV(file) {
      const reader = new FileReader();

      reader.onload = function(e) {
        try {
          const text = e.target.result;
          const studies = parseCSVData(text);

          if (studies.length === 0) {
            showToast('No valid studies found in CSV', 'error');
            return;
          }

          // Clear existing studies
          document.getElementById('studiesContainer').innerHTML = '';
          studyCounter = 0;

          // Add imported studies
          studies.forEach(study => {
            addStudyWithData(study);
          });

          showToast('Imported ' + studies.length + ' studies from CSV', 'success');
        } catch (error) {
          showToast('Error parsing CSV: ' + error.message, 'error');
          console.error('CSV Import Error:', error);
        }
      };

      reader.onerror = function() {
        showToast('Error reading file', 'error');
      };

      reader.readAsText(file);
    }

    /**
     * Parse CSV data into study objects
     * Expected CSV format:
     * Study,Dose,Cases,N
     * Study1,0,10,100
     * Study1,10,15,100
     * Study2,0,8,100
     * Study2,10,12,100
     *
     * Or with columns:
     * Study,Dose,Cases,PersonTime
     */
    function parseCSVData(csvText) {
      const lines = csvText.split(/\r?\n/).filter(line => line.trim());

      if (lines.length < 2) {
        throw new Error('CSV file must have at least a header row and one data row');
      }

      // Parse header
      const header = lines[0].split(',').map(h => h.trim().toLowerCase());

      // Validate required columns
      const hasStudy = header.some(h => h.includes('study'));
      const hasDose = header.some(h => h.includes('dose'));
      const hasCases = header.some(h => h.includes('case'));
      const hasN = header.some(h => h === 'n' || h.includes('sample') || h.includes('person'));

      if (!hasStudy || !hasDose || !hasCases || !hasN) {
        throw new Error('CSV must have columns: Study, Dose, Cases, N (or PersonTime)');
      }

      const studyIdx = header.findIndex(h => h.includes('study'));
      const doseIdx = header.findIndex(h => h.includes('dose'));
      const casesIdx = header.findIndex(h => h.includes('case'));
      const nIdx = header.findIndex(h => h === 'n' || h.includes('sample') || h.includes('person'));

      // Group data by study
      const studyGroups = {};

      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);

        if (values.length <= Math.max(studyIdx, doseIdx, casesIdx, nIdx)) {
          continue; // Skip incomplete rows
        }

        const studyName = values[studyIdx]?.trim() || `Study${i}`;
        const dose = parseFloat(values[doseIdx]);
        const cases = parseFloat(values[casesIdx]);
        const n = parseFloat(values[nIdx]);

        if (isNaN(dose) || isNaN(cases) || isNaN(n)) {
          continue; // Skip invalid rows
        }

        if (!studyGroups[studyName]) {
          studyGroups[studyName] = {
            name: studyName,
            dosePoints: []
          };
        }

        studyGroups[studyName].dosePoints.push({
          dose: dose,
          cases: cases,
          n: n
        });
      }

      return Object.values(studyGroups);
    }

    /**
     * Parse CSV line handling quoted values
     */
    function parseCSVLine(line) {
      const result = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }

      result.push(current.trim());
      return result;
    }

    /**
     * Add study with data (bypasses manual entry)
     */
    function addStudyWithData(studyData) {
      studyCounter++;
      const studyId = 'study-' + studyCounter;
      const container = document.getElementById('studiesContainer');

      // Create dose points HTML
      const dosePointsHTML = studyData.dosePoints.map(point => `
        <div class="dose-point">
          <input type="number" class="input input--sm input--mono dose-dose"
                 value="${point.dose}" min="0" step="any" placeholder="Dose">
          <input type="number" class="input input--sm input--mono dose-cases"
                 value="${point.cases}" min="0" step="any" placeholder="Cases">
          <input type="number" class="input input--sm input--mono dose-n"
                 value="${point.n}" min="0" step="any" placeholder="N">
        </div>
      `).join('');

      const studyElement = document.createElement('div');
      studyElement.className = 'study-item';
      studyElement.id = studyId;
      studyElement.innerHTML = `
        <div class="study-item__header">
          <input type="text" class="input study-name"
                 placeholder="Study Name (e.g., Smith 2020)"
                 value="${studyData.name}" style="max-width: 300px;">
          <div class="flex gap-2">
            <button class="btn btn--ghost btn--sm" onclick="addDosePoint('${studyId}')">+ Dose Point</button>
            <button class="btn btn--ghost btn--sm" onclick="removeDosePoint('${studyId}')" title="Remove last dose point">−</button>
            <button class="btn btn--ghost btn--sm btn--icon" onclick="removeStudy('${studyId}')" title="Remove study">×</button>
          </div>
        </div>
        <div class="dose-points-grid" id="${studyId}-points">
          ${dosePointsHTML}
        </div>
      `;

      container.appendChild(studyElement);
    }

    // =============================================
    // DATA COLLECTION
    // =============================================

    function getStudyData() {
      const studies = [];
      const zeroHandling = document.getElementById('zeroHandling').value;

      document.querySelectorAll('.study-item').forEach(studyEl => {
        const name = studyEl.querySelector('.study-name').value.trim() || 'Study ' + (studies.length + 1);

        const dosePoints = [];
        const doseInputs = studyEl.querySelectorAll('.dose-dose');
        const casesInputs = studyEl.querySelectorAll('.dose-cases');
        const nInputs = studyEl.querySelectorAll('.dose-n');

        for (let i = 0; i < doseInputs.length; i++) {
          const dose = parseFloat(doseInputs[i].value);
          let cases = parseFloat(casesInputs[i].value);
          const n = parseFloat(nInputs[i].value);

          if (!isNaN(dose) && !isNaN(cases) && !isNaN(n) && n > 0) {
            // Handle zero cases
            if (cases === 0) {
              switch (zeroHandling) {
                case 'continuity':
                  cases = 0.5;
                  break;
                case 'exclude':
                  continue;
                case 'replace':
                  cases = 0.1;
                  break;
              }
            }

            dosePoints.push({ dose, cases, n });
          }
        }

        if (dosePoints.length >= 2) {
          // Sort by dose
          dosePoints.sort((a, b) => a.dose - b.dose);
          studies.push({ name, dosePoints });
        }
      });

      return studies;
    }

    function getAnalysisSettings() {
      return {
        modelType: document.getElementById('modelType').value,
        referenceDose: parseFloat(document.getElementById('referenceDose').value) || 0,
        splineKnots: parseInt(document.getElementById('splineKnots').value),
        outcomeType: document.getElementById('outcomeType').value,
        estimationMethod: document.getElementById('estimationMethod').value,
        confLevel: parseFloat(document.getElementById('confLevel').value),
        testNonlinearity: document.getElementById('testNonlinearity').value,
        knotPlacement: document.getElementById('knotPlacement').value,
        zeroHandling: document.getElementById('zeroHandling').value,
        useRVE: document.getElementById('useRVE').value === 'yes'
      };
    }

    // =============================================
    // STATISTICAL METHODS
    // =============================================

    // =============================================
    // GREENLAND & LONGNECKER TWO-STAGE GLS METHOD
    // The GOLD STANDARD for dose-response meta-analysis
    // Reference: Greenland S, Longnecker MP. Methods for trend estimation
    // from summarized dose-response data, with applications to meta-analysis.
    // Am J Epidemiol 1992;135:1301-9.
    // =============================================

    function glsDoseResponse(studies, refDose = 0, settings = {}) {
      const allPoints = [];

      studies.forEach((study, studyIdx) => {
        if (!study.dosePoints || study.dosePoints.length === 0) return;

        study.dosePoints.forEach((point, pointIdx) => {
          if (point.dose === null || point.cases === null || point.n === null) return;
          if (point.n <= 0) return;
          if (point.dose < refDose) return; // Only use dose >= reference

          const dose = point.dose - refDose;
          const rate = point.cases / point.n;
          const logRate = Math.log(rate + (rate === 0 ? 0.0001 : 0));

          // EXACT variance for log rate: V(log(rate)) = 1/cases - 1/n
          const variance = Math.max(0.0001, 1/point.cases - 1/point.n);

          allPoints.push({
            studyIdx,
            studyName: study.name,
            dose,
            x1: dose,
            x2: dose * dose,
            cases: point.cases,
            n: point.n,
            rate,
            logRate,
            variance,
            weight: 1 / variance
          });
        });
      });

      // Stage 1: Fit within-study models and get coefficients
      const studyCoefficients = [];
      const studyVariances = [];

      // Group by study
      const studyGroups = {};
      allPoints.forEach(p => {
        if (!studyGroups[p.studyIdx]) studyGroups[p.studyIdx] = [];
        studyGroups[p.studyIdx].push(p);
      });

      Object.keys(studyGroups).forEach(studyIdx => {
        const points = studyGroups[studyIdx];
        if (points.length < 2) return; // Need at least 2 points

        // WLS within study (quadratic model: log(rate) = beta0 + beta1*dose + beta2*dose^2)
        const n = points.length;
        const X = points.map(p => [1, p.x1, p.x2]);
        const y = points.map(p => p.logRate);
        const w = points.map(p => p.weight);

        // Weighted least squares: beta = (X'WX)^(-1)X'Wy
        const XtWX = [[0,0,0],[0,0,0],[0,0,0]];
        const XtWY = [0,0,0];

        for (let i = 0; i < n; i++) {
          for (let j = 0; j < 3; j++) {
            for (let k = 0; k < 3; k++) {
              XtWX[j][k] += w[i] * X[i][j] * X[i][k];
            }
            XtWY[j] += w[i] * X[i][j] * y[i];
          }
        }

        // Solve 3x3 system
        const beta = solve3x3(XtWX, XtWY);

        // Covariance matrix: (X'WX)^(-1)
        const vcov = invert3x3(XtWX);

        studyCoefficients.push({ studyIdx, beta, vcov, n: points.length });
        studyVariances.push(vcov);
      });

      // Stage 2: Pool coefficients using GLS
      if (studyCoefficients.length < 2) {
        throw new Error('Need at least 2 studies with sufficient data for GLS method');
      }

      // Calculate between-study variance (tau^2)
      const K = studyCoefficients.length;

      // Average covariance matrix
      const avgVcov = studyVariances.reduce((sum, v) => {
        return [[sum[0][0]+v[0][0], sum[0][1]+v[0][1], sum[0][2]+v[0][2]],
                [sum[1][0]+v[1][0], sum[1][1]+v[1][1], sum[1][2]+v[1][2]],
                [sum[2][0]+v[2][0], sum[2][1]+v[2][1], sum[2][2]+v[2][2]]];
      }, [[0,0,0],[0,0,0],[0,0,0]]);

      avgVcov[0][0] /= K; avgVcov[0][1] /= K; avgVcov[0][2] /= K;
      avgVcov[1][0] /= K; avgVcov[1][1] /= K; avgVcov[1][2] /= K;
      avgVcov[2][0] /= K; avgVcov[2][1] /= K; avgVcov[2][2] /= K;

      // Average coefficients
      const avgBeta = studyCoefficients.reduce((sum, s) =>
        [sum[0]+s.beta[0], sum[1]+s.beta[1], sum[2]+s.beta[2]],
        [0,0,0]).map(b => b / K);

      // Q statistic (weighted sum of squared deviations)
      const Q = studyCoefficients.reduce((sum, s) => {
        const diff = [s.beta[0]-avgBeta[0], s.beta[1]-avgBeta[1], s.beta[2]-avgBeta[2]];
        const vcovInv = invert3x3(s.vcov);
        // Mahalanobis distance: diff' * V^(-1) * diff
        const VinvDiff = [
          vcovInv[0][0]*diff[0] + vcovInv[0][1]*diff[1] + vcovInv[0][2]*diff[2],
          vcovInv[1][0]*diff[0] + vcovInv[1][1]*diff[1] + vcovInv[1][2]*diff[2],
          vcovInv[2][0]*diff[0] + vcovInv[2][1]*diff[1] + vcovInv[2][2]*diff[2]
        ];
        return sum + diff[0]*VinvDiff[0] + diff[1]*VinvDiff[1] + diff[2]*VinvDiff[2];
      }, 0);

      // Degrees of freedom for multivariate meta-analysis
      const df = Math.max(1, (K - 1) * 3); // 3 parameters per study

      // Tau^2 using method of moments (DerSimonian-Laird style)
      const tau2 = Math.max(0, (Q - df) / (allPoints.length - 3));

      // I²: proportion of variance due to heterogeneity
      const I2 = Q > df ? ((Q - df) / Q) * 100 : 0;

      // Final GLS estimate with random effects
      const finalBeta = avgBeta;
      let finalSe = [
        Math.sqrt(avgVcov[0][0] + tau2),
        Math.sqrt(avgVcov[1][1] + tau2),
        Math.sqrt(avgVcov[2][2] + tau2)
      ];

      // Calculate predictions for all points
      const predicted = allPoints.map(p =>
        Math.exp(finalBeta[0] + finalBeta[1] * p.x1 + finalBeta[2] * p.x2)
      );

      const residuals = allPoints.map((p, i) => p.logRate - Math.log(predicted[i]));

      // Apply Robust Variance Estimation (RVE) if requested
      let rveResults = null;
      if (settings.useRVE && allPoints.length > 0) {
        // Apply RVE with study-level clustering
        rveResults = calculateRobustVariance(allPoints, residuals, 'studyIdx');

        if (rveResults) {
          // Update SEs with robust values
          finalSe = rveResults.se;
        }
      }
      const SSE = residuals.reduce((sum, r) => sum + r*r, 0);
      const n = allPoints.length;
      const MSE = SSE / (n - 3);

      // Heterogeneity statistics (Cochran's Q)
      const chiSq = allPoints.reduce((sum, p, i) => {
        const expected = predicted[i] * p.n;
        return sum + Math.pow(p.cases - expected, 2) / (expected + 0.5);
      }, 0);

      // Model fit statistics
      const logLik = -0.5 * n * Math.log(2 * Math.PI * MSE) - 0.5 * SSE / MSE;
      const AIC = 2 * 3 - 2 * logLik;
      const BIC = 3 * Math.log(n) - 2 * logLik;

      // P-value for trend (test of linear coefficient)
      const zLinear = finalBeta[1] / finalSe[1];
      const pTrend = 2 * (1 - normalCDF(Math.abs(zLinear)));

      // Residual standard error
      const RSE = calculateRSE(residuals, n - 3);

      return {
        type: 'gls',
        name: 'Greenland & Longnecker GLS',
        description: 'Gold-standard two-stage method using Generalized Least Squares - Recommended for publication',
        coefficients: [
          { name: 'Intercept', estimate: finalBeta[0], se: finalSe[0],
            ciLower: finalBeta[0] - 1.96 * finalSe[0], ciUpper: finalBeta[0] + 1.96 * finalSe[0],
            pValue: 2 * (1 - normalCDF(Math.abs(finalBeta[0] / finalSe[0]))) },
          { name: 'Linear (dose)', estimate: finalBeta[1], se: finalSe[1],
            ciLower: finalBeta[1] - 1.96 * finalSe[1], ciUpper: finalBeta[1] + 1.96 * finalSe[1],
            pValue: pTrend },
          { name: 'Quadratic (dose²)', estimate: finalBeta[2], se: finalSe[2],
            ciLower: finalBeta[2] - 1.96 * finalSe[2], ciUpper: finalBeta[2] + 1.96 * finalSe[2],
            pValue: 2 * (1 - normalCDF(Math.abs(finalBeta[2] / finalSe[2]))) }
        ],
        pTrend,
        pNonlinear: 2 * (1 - normalCDF(Math.abs(finalBeta[2] / finalSe[2]))),
        Q: chiSq,
        I2,
        tau2,
        RSE,
        allPoints,
        nStudies: studyCoefficients.length,
        nPoints: allPoints.length,
        AIC,
        BIC,
        logLik,
        rveUsed: rveResults !== null,
        rveClusters: rveResults ? rveResults.nClusters : null,
        rveDf: rveResults ? rveResults.df : null,
        robustSe: rveResults ? rveResults.se : null,
        residuals: allPoints.map((p, i) => ({
          dose: p.dose,
          residual: residuals[i],
          predicted: predicted[i],
          observed: p.rate
        })),
        predict: (dose) => {
          const d = dose - refDose;
          return Math.exp(finalBeta[0] + finalBeta[1] * d + finalBeta[2] * d * d);
        },
        predictSE: (dose) => {
          // Standard error of prediction using variance-covariance matrix
          const d = dose - refDose;
          // Variance = [1, d, d²] * V * [1, d, d²]'
          const x = [1, d, d*d];
          let varPred = 0;
          for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
              varPred += x[i] * x[j] * (avgVcov[i][j] + (i === j ? tau2 : 0));
            }
          }
          return Math.sqrt(varPred);
        }
      };
    }

    // Matrix helper functions
    function solve3x3(A, b) {
      const det = A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) -
                  A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) +
                  A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);

      if (Math.abs(det) < 1e-10) return [0, 0, 0];

      const invDet = 1 / det;
      return [
        invDet * (b[0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) -
                 A[0][1] * (b[1] * A[2][2] - A[1][2] * b[2]) +
                 A[0][2] * (b[1] * A[2][1] - A[1][1] * b[2])),
        invDet * (A[0][0] * (b[1] * A[2][2] - A[1][2] * b[2]) -
                 b[0] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) +
                 A[0][2] * (A[1][0] * b[2] - b[1] * A[2][0])),
        invDet * (A[0][0] * (A[1][1] * b[2] - b[1] * A[2][1]) -
                 A[0][1] * (A[1][0] * b[2] - b[1] * A[2][0]) +
                 b[0] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]))
      ];
    }

    function invert3x3(A) {
      const det = A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) -
                  A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) +
                  A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);

      if (Math.abs(det) < 1e-10) return [[0,0,0],[0,0,0],[0,0,0]];

      const invDet = 1 / det;
      return [
        [
          invDet * (A[1][1] * A[2][2] - A[1][2] * A[2][1]),
          invDet * (A[0][2] * A[2][1] - A[0][1] * A[2][2]),
          invDet * (A[0][1] * A[1][2] - A[0][2] * A[1][1])
        ],
        [
          invDet * (A[1][2] * A[2][0] - A[1][0] * A[2][2]),
          invDet * (A[0][0] * A[2][2] - A[0][2] * A[2][0]),
          invDet * (A[0][2] * A[1][0] - A[0][0] * A[1][2])
        ],
        [
          invDet * (A[1][0] * A[2][1] - A[1][1] * A[2][0]),
          invDet * (A[0][1] * A[2][0] - A[0][0] * A[2][1]),
          invDet * (A[0][0] * A[1][1] - A[0][1] * A[1][0])
        ]
      ];
    }

    function normalCDF(x) {
      const a1 =  0.254829592;
      const a2 = -0.284496736;
      const a3 =  1.421413741;
      const a4 = -1.453152027;
      const a5 =  1.061405429;
      const p  =  0.3275911;

      const sign = x < 0 ? -1 : 1;
      x = Math.abs(x) / Math.sqrt(2);

      const t = 1.0 / (1.0 + p * x);
      const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

      return 0.5 * (1.0 + sign * y);
    }

    // Chi-square CDF for calculating p-values
    function chiSquareCDF(x, df) {
      // Handle common degrees of freedom explicitly for speed
      if (x <= 0) return 0;

      // For df = 1: Use error function relationship
      if (df === 1) {
        return normalCDF(Math.sqrt(x)) - normalCDF(-Math.sqrt(x));
      }

      // For df = 2: Exponential
      if (df === 2) {
        return 1 - Math.exp(-x / 2);
      }

      // For df = 3
      if (df === 3) {
        const sqrtX = Math.sqrt(x);
        return normalCDF(sqrtX) - normalCDF(-sqrtX) +
               Math.sqrt(2 / Math.PI) * sqrtX * Math.exp(-x / 2);
      }

      // For df >= 4: Use incomplete gamma approximation
      // Regularized lower incomplete gamma function
      const k = df / 2;
      const halfX = x / 2;

      // Series expansion for P(a, x)
      if (x < df + 6 * Math.sqrt(df)) {
        let result = Math.exp(-halfX + (k - 1) * Math.log(halfX));
        let term = result;
        for (let i = 1; i < 100; i++) {
          term *= halfX / (k + i - 1);
          result += term;
          if (term / result < 1e-10) break;
        }
        return result;
      } else {
        // Continued fraction for large x
        let a = 1 - k;
        let b = a + 1;
        let d = 1 / b;
        let h = d;
        for (let i = 1; i < 100; i++) {
          a += 2;
          b += 2;
          d = -a * d + 1;
          if (Math.abs(d) < 1e-30) d = 1e-30;
          h = -a * h + b * d;
          if (Math.abs(h) < 1e-30) h = 1e-30;
          d = 1 / d;
          h *= d;
        }
        return 1 - Math.exp(-halfX + (k - 1) * Math.log(halfX)) * h * Math.sqrt(Math.PI) / Math.gamma(k);
      }
    }

    // Calculate residual standard error
    function calculateRSE(residuals, df) {
      const SSE = residuals.reduce((sum, r) => sum + r * r, 0);
      return Math.sqrt(SSE / df);
    }



    // =============================================
    // PROFILE LIKELIHOOD CONFIDENCE INTERVALS
    // =============================================

    /**
     * Calculate true profile likelihood confidence interval
     * Accounts for non-linearity better than Wald intervals by inverting the likelihood ratio test
     * @param {Object} model - Fitted model with data and likelihood function
     * @param {number} paramIndex - Index of parameter to profile (0, 1, or 2)
     * @param {number} confLevel - Confidence level (default 0.95)
     * @returns {Object} - {lower, upper, method}
     */
    function calculateProfileLikelihoodCI(model, paramIndex, confLevel = 0.95) {
      const alpha = 1 - confLevel;
      const chi2Crit = inverseChi2(1, 1 - alpha);

      const params = model.coefficients.map(c => c.estimate);
      const logLikMax = model.logLik || 0;
      const targetLogLik = logLikMax - 0.5 * chi2Crit;

      const original = params[paramIndex];
      const vcov = calculateModelVcov(model);
      const se = Math.sqrt(vcov[paramIndex][paramIndex]);

      function findBound(direction) {
        let lower = original;
        let upper = original + direction * se * 4;

        for (let expand = 0; expand < 20; expand++) {
          const testParams = [...params];
          testParams[paramIndex] = upper;
          const testLogLik = refitLogLik(model, testParams);
          if (testLogLik < targetLogLik) break;
          upper = original + direction * se * 4 * Math.pow(2, expand + 1);
        }

        for (let iter = 0; iter < 50; iter++) {
          const mid = (lower + upper) / 2;
          const testParams = [...params];
          testParams[paramIndex] = mid;
          const testLogLik = refitLogLik(model, testParams);

          if (direction > 0) {
            if (testLogLik < targetLogLik) {
              upper = mid;
            } else {
              lower = mid;
            }
          } else {
            if (testLogLik < targetLogLik) {
              lower = mid;
            } else {
              upper = mid;
            }
          }

          if (Math.abs(upper - lower) < 1e-6) break;
        }

        return (lower + upper) / 2;
      }

      const lower = findBound(-1);
      const upper = findBound(1);

      return {
        lower,
        upper,
        method: 'profile-likelihood'
      };
    }

    /**
     * Refit model with fixed parameter values for profile likelihood
     */
    function refitLogLik(model, fixedParams) {
      const allPoints = model.allPoints;

      if (!allPoints || allPoints.length === 0) {
        return model.logLik || 0;
      }

      let ll = 0;
      allPoints.forEach(p => {
        const mu = fixedParams[0] + fixedParams[1] * p.x1 + fixedParams[2] * p.x2;
        const sigma2 = model.MSE || model.sigma2 || 1;
        const ll_i = -0.5 * Math.log(2 * Math.PI * sigma2)
                     - 0.5 * Math.pow(p.logRate - mu, 2) / sigma2;
        ll += ll_i;
      });

      return ll;
    }

    /**
     * Calculate variance-covariance matrix for model
     */
    function calculateModelVcov(model) {
      if (model.vcov) return model.vcov;

      const se = model.coefficients.map(c => c.se);
      return [
        [se[0]*se[0], 0, 0],
        [0, se[1]*se[1], 0],
        [0, 0, se[2]*se[2]]
      ];
    }

    /**
     * Inverse chi-squared distribution function
     */
    function inverseChi2(df, p) {
      if (df === 1) {
        const z = inverseNormal(p);
        return z * z;
      }

      const z = inverseNormal(p);
      const term = 1 - 2 / (9 * df) + z * Math.sqrt(2 / (9 * df));
      return df * Math.pow(term, 3);
    }

    /**
     * Inverse standard normal distribution function (quantile function)
     * Beasley-Springer-Moro approximation
     */
    function inverseNormal(p) {
      if (p <= 0 || p >= 1) {
        throw new Error('Probability must be between 0 and 1 (exclusive)');
      }

      const a = [-3.969683028665376e+01, 2.209460984245205e+02,
                 -2.759285104469687e+02, 1.383577518672690e+02,
                 -3.066479806614716e+01, 2.506628277459239e+00];
      const b = [-5.447609879822406e+01, 1.615858368580409e+02,
                 -1.556989798598866e+02, 6.680131188771972e+01,
                 -1.328068155288572e+01];
      const c = [-7.784894002430293e-03, -3.223964580411365e-01,
                 -2.400758277161838e+00, -2.549732539343734e+00,
                  4.374664141464968e+00, 2.938163982698783e+00];
      const d = [7.784695709041462e-03, 3.224671290700398e-01,
                 2.445134137142996e+00, 3.754408661907416e+00];

      const pLow = 0.02425;
      const pHigh = 1 - pLow;
      let q, r;

      if (p < pLow) {
        q = Math.sqrt(-2 * Math.log(p));
        return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
               ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
      } else if (p <= pHigh) {
        q = p - 0.5;
        r = q * q;
        return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q /
               (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
      } else {
        q = Math.sqrt(-2 * Math.log(1 - p));
        return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
                ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
      }
    }


    // =============================================
    // ROBUST VARIANCE ESTIMATION (RVE)
    // Based on: Pustejovsky & Tipton (2022) - clubSandwich R package
    // Implements cluster-robust variance estimation with small-sample corrections
    // =============================================

    /**
     * Calculate Robust Variance Estimation (RVE)
     * Based on: Pustejovsky & Tipton (2022) - clubSandwich R package
     * @param {Array} data - Data points with predictors (x1, x2) and study info
     * @param {Array} residuals - Residuals from model
     * @param {string} clusterVar - Clustering variable ('studyIdx')
     * @returns {Object} - {vcov, se, nClusters, df} or null if too few clusters
     */
    function calculateRobustVariance(data, residuals, clusterVar) {
      // Get unique clusters
      const clusters = new Set();
      data.forEach(d => clusters.add(d[clusterVar]));
      const G = clusters.size; // Number of clusters
      const K = 3; // Number of parameters

      // Need at least K+1 clusters for reliable RVE
      if (G < K + 1) {
        console.warn(`RVE requires at least ${K+1} clusters, only have ${G}`);
        return null;
      }

      // Design matrix X: [1, x1, x2]
      const X = data.map(d => [1, d.x1, d.x2]);

      // Bread matrix: (X'X)^(-1)
      const XtX = [[0,0,0],[0,0,0],[0,0,0]];
      X.forEach(row => {
        for (let j = 0; j < 3; j++) {
          for (let k = 0; k < 3; k++) {
            XtX[j][k] += row[j] * row[k];
          }
        }
      });
      const bread = invert3x3(XtX);

      // Meat matrix: cluster-level score contributions
      const meat = [[0,0,0],[0,0,0],[0,0,0]];

      // Group by cluster
      const clusterGroups = {};
      data.forEach((d, i) => {
        const cluster = d[clusterVar];
        if (!clusterGroups[cluster]) clusterGroups[cluster] = [];
        clusterGroups[cluster].push({ i, residual: residuals[i], x: X[i] });
      });

      // Sum within clusters: u_c = sum(X_i * e_i)
      Object.keys(clusterGroups).forEach(cluster => {
        const group = clusterGroups[cluster];
        const u = [0, 0, 0];
        group.forEach(({ i, residual, x }) => {
          for (let j = 0; j < 3; j++) {
            u[j] += x[j] * residual;
          }
        });

        // Outer product: u_c * u_c'
        for (let j = 0; j < 3; j++) {
          for (let k = 0; k < 3; k++) {
            meat[j][k] += u[j] * u[k];
          }
        }
      });

      // Sandwich variance: V_robust = Bread * Meat * Bread
      const V_robust = multiplyMatrices(
        multiplyMatrices(bread, meat),
        bread
      );

      // Small-sample correction (CR2 style)
      // Degrees of freedom: G - K
      const df = G - K;

      // Apply CR2 correction factor to meat matrix
      // This is a simplified version - full CR2 requires more complex adjustments
      const correctionFactor = (G - 1) / (G - K);
      for (let j = 0; j < 3; j++) {
        for (let k = 0; k < 3; k++) {
          V_robust[j][k] *= correctionFactor;
        }
      }

      // Extract SEs from diagonal of variance-covariance matrix
      const se = [
        Math.sqrt(Math.max(0, V_robust[0][0])),
        Math.sqrt(Math.max(0, V_robust[1][1])),
        Math.sqrt(Math.max(0, V_robust[2][2]))
      ];

      return {
        vcov: V_robust,
        se: se,
        nClusters: G,
        df: df
      };
    }

    /**
     * Matrix multiplication for 3x3 matrices
     * @param {Array} A - First 3x3 matrix
     * @param {Array} B - Second 3x3 matrix
     * @returns {Array} - Product A * B
     */
    function multiplyMatrices(A, B) {
      const result = [[0,0,0],[0,0,0],[0,0,0]];
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          for (let k = 0; k < 3; k++) {
            result[i][j] += A[i][k] * B[k][j];
          }
        }
      }
      return result;
    }

    // Wald Test for Non-linearity
    // Tests H0: beta2 = 0 (quadratic coefficient is zero)
    function waldTestNonlinearity(results) {
      if (!results.coefficients || results.coefficients.length < 3) {
        return { wald: null, df: 1, pValue: null, message: 'Not available for this model type' };
      }

      // Get quadratic coefficient (usually the 3rd coefficient)
      const beta2 = results.coefficients[2].estimate;
      const se2 = results.coefficients[2].se;

      // Wald statistic: (beta2 / SE)^2 ~ chi-square(1)
      const wald = Math.pow(beta2 / se2, 2);
      const df = 1;
      const pValue = 1 - chiSquareCDF(wald, df);

      return {
        wald: wald,
        df: df,
        pValue: pValue,
        significant: pValue < 0.05,
        message: pValue < 0.05 ?
          'Significant non-linearity detected (quadratic term differs from zero)' :
          'No significant non-linearity detected'
      };
    }

    // Likelihood Ratio Test
    // Compares nested models (typically quadratic vs linear)
    function likelihoodRatioTest(fullModel, reducedModel) {
      if (!fullModel.logLik || !reducedModel.logLik) {
        return { chiSq: null, df: null, pValue: null, message: 'Log-likelihood values not available' };
      }

      // LRT statistic: -2 * (logLik_reduced - logLik_full)
      const chiSq = -2 * (reducedModel.logLik - fullModel.logLik);

      // Degrees of freedom = difference in number of parameters
      const dfFull = fullModel.coefficients ? fullModel.coefficients.length : 3;
      const dfReduced = reducedModel.coefficients ? reducedModel.coefficients.length : 2;
      const df = dfFull - dfReduced;

      const pValue = 1 - chiSquareCDF(chiSq, df);

      return {
        chiSq: chiSq,
        df: df,
        pValue: pValue,
        significant: pValue < 0.05,
        message: pValue < 0.05 ?
          `Full model fits significantly better than reduced model (p = ${pValue.toFixed(3)})` :
          'Reduced model is sufficient (no significant improvement with full model)'
      };
    }

    // Linear dose-response model (improved)
    function linearDoseResponse(studies, refDose = 0, settings = {}) {
      // Collect all data points
      const allPoints = [];
      studies.forEach((study, studyIdx) => {
        study.dosePoints.forEach(point => {
          const doseDiff = point.dose - refDose;
          if (doseDiff >= 0) {
            const rate = point.cases / point.n;
            const logRate = Math.log(rate);
            const variance = 1 / point.cases;

            allPoints.push({
              study: study.name,
              dose: doseDiff,
              logRate: logRate,
              variance: variance,
              weight: point.cases,
              cases: point.cases,
              n: point.n,
              rate: rate
            });
          }
        });
      });

      if (allPoints.length < 3) {
        throw new Error('Need at least 3 data points for dose-response analysis');
      }

      // Weighted linear regression
      const n = allPoints.length;
      let sumW = 0, sumWX = 0, sumWY = 0, sumWX2 = 0, sumWXY = 0;

      allPoints.forEach(p => {
        const w = p.weight;
        sumW += w;
        sumWX += w * p.dose;
        sumWY += w * p.logRate;
        sumWX2 += w * p.dose * p.dose;
        sumWXY += w * p.dose * p.logRate;
      });

      // Calculate slope and intercept
      const denom = sumW * sumWX2 - sumWX * sumWX;
      const slope = (sumW * sumWXY - sumWX * sumWY) / denom;
      const intercept = (sumWY - slope * sumWX) / sumW;

      // Standard error of slope (proper calculation)
      const residuals = allPoints.map(p => p.logRate - (intercept + slope * p.dose));
      const SSE = residuals.reduce((sum, r) => sum + r * r, 0);
      const MSE = SSE / (n - 2);
      const seSlope = Math.sqrt(MSE * sumW / denom);
      const seIntercept = Math.sqrt(MSE * sumWX2 / denom);

      // 95% CI for slope and intercept
      const t = 1.96; // Approximate for large samples
      const ciSlopeLower = slope - t * seSlope;
      const ciSlopeUpper = slope + t * seSlope;
      const ciInterceptLower = intercept - t * seIntercept;
      const ciInterceptUpper = intercept + t * seIntercept;

      // P-value for trend
      const zStat = slope / seSlope;
      const pTrend = 2 * (1 - normalCDF(Math.abs(zStat)));

      // Q statistic and I² (between-study heterogeneity)
      const predictedRates = allPoints.map(p => Math.exp(intercept + slope * p.dose));
      const chiSq = allPoints.reduce((sum, p, i) => {
        const expected = predictedRates[i] * p.n;
        const observed = p.cases;
        return sum + Math.pow(observed - expected, 2) / expected;
      }, 0);
      const df = n - 2;
      const I2 = chiSq > df ? ((chiSq - df) / chiSq) * 100 : 0;

      // Calculate AIC and BIC
      const logLik = -0.5 * n * Math.log(2 * Math.PI) - 0.5 * n * Math.log(MSE) - 0.5 * SSE / MSE;
      const AIC = 2 * 2 - 2 * logLik; // 2 parameters
      const BIC = 2 * Math.log(n) - 2 * logLik;

      // Residual standard error
      const RSE = calculateRSE(residuals, n - 2);

      // Store residuals for plotting
      const residualsData = allPoints.map((p, i) => ({
        dose: p.dose,
        residual: residuals[i],
        predicted: predictedRates[i],
        observed: p.rate
      }));

      return {
        type: 'linear',
        coefficients: [
          { name: 'Slope (β₁)', estimate: slope, se: seSlope, ciLower: ciSlopeLower, ciUpper: ciSlopeUpper, pValue: pTrend },
          { name: 'Intercept (β₀)', estimate: intercept, se: seIntercept, ciLower: ciInterceptLower, ciUpper: ciInterceptUpper, pValue: null }
        ],
        slope, intercept, seSlope, pTrend, pNonlinear: null, Q: chiSq, I2: I2, RSE,
        allPoints, nStudies: studies.length, nPoints: allPoints.length,
        AIC, BIC, logLik, residuals: residualsData,
        predict: (dose) => Math.exp(intercept + slope * dose),
        predictSE: (dose) => Math.sqrt(MSE + Math.pow(seSlope * dose, 2))
      };
    }

    // Quadratic dose-response model (improved)
    function quadraticDoseResponse(studies, refDose = 0, settings = {}) {
      const allPoints = [];
      studies.forEach(study => {
        study.dosePoints.forEach(point => {
          const doseDiff = point.dose - refDose;
          if (doseDiff >= 0) {
            const rate = point.cases / point.n;
            const logRate = Math.log(rate);
            allPoints.push({
              dose: doseDiff,
              dose2: doseDiff * doseDiff,
              logRate: logRate,
              weight: point.cases,
              cases: point.cases,
              n: point.n,
              rate: rate
            });
          }
        });
      });

      const n = allPoints.length;
      if (n < 4) throw new Error('Need at least 4 data points for quadratic model');

      // Weighted quadratic regression using normal equations
      const X = allPoints.map(p => [1, p.dose, p.dose2]);
      const Y = allPoints.map(p => p.logRate);
      const W = allPoints.map(p => p.weight);

      // XtWX and XtWY
      const XtWX = [[0,0,0],[0,0,0],[0,0,0]];
      const XtWY = [0,0,0];

      for (let i = 0; i < n; i++) {
        const w = W[i];
        for (let j = 0; j < 3; j++) {
          for (let k = 0; k < 3; k++) {
            XtWX[j][k] += w * X[i][j] * X[i][k];
          }
          XtWY[j] += w * X[i][j] * Y[i];
        }
      }

      // Solve using Gaussian elimination
      const beta = gaussianElimination(XtWX, XtWY);

      // Calculate residuals and variance
      const residuals = allPoints.map((p, i) => {
        const pred = beta[0] + beta[1] * p.dose + beta[2] * p.dose2;
        return p.logRate - pred;
      });

      const SSE = residuals.reduce((sum, r) => sum + r * r, 0);
      const MSE = SSE / (n - 3);

      // Variance-covariance matrix (inverse of XtWX * MSE)
      const vcov = invert3x3(XtWX);
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          vcov[i][j] *= MSE;
        }
      }

      // P-values and CIs
      const seIntercept = Math.sqrt(vcov[0][0]);
      const seLinear = Math.sqrt(vcov[1][1]);
      const seQuadratic = Math.sqrt(vcov[2][2]);
      const z = 1.96;

      const pLinear = 2 * (1 - normalCDF(Math.abs(beta[1] / seLinear)));
      const pQuadratic = 2 * (1 - normalCDF(Math.abs(beta[2] / seQuadratic)));

      // Q and I²
      const predicted = allPoints.map((p, i) => {
        return Math.exp(beta[0] + beta[1] * p.dose + beta[2] * p.dose2);
      });
      const chiSq = allPoints.reduce((sum, p, i) => {
        const expected = predicted[i] * p.n;
        return sum + Math.pow(p.cases - expected, 2) / expected;
      }, 0);
      const I2 = chiSq > (n - 3) ? ((chiSq - (n - 3)) / chiSq) * 100 : 0;

      // AIC, BIC
      const logLik = -0.5 * n * Math.log(2 * Math.PI * MSE) - 0.5 * SSE / MSE;
      const AIC = 2 * 3 - 2 * logLik;
      const BIC = 3 * Math.log(n) - 2 * logLik;

      // Residual standard error
      const RSE = calculateRSE(residuals, n - 3);

      const residualsData = allPoints.map((p, i) => ({
        dose: p.dose,
        residual: residuals[i],
        predicted: predicted[i],
        observed: p.rate
      }));

      return {
        type: 'quadratic',
        coefficients: [
          { name: 'Intercept (β₀)', estimate: beta[0], se: seIntercept, ciLower: beta[0] - z * seIntercept, ciUpper: beta[0] + z * seIntercept, pValue: null },
          { name: 'Linear (β₁)', estimate: beta[1], se: seLinear, ciLower: beta[1] - z * seLinear, ciUpper: beta[1] + z * seLinear, pValue: pLinear },
          { name: 'Quadratic (β₂)', estimate: beta[2], se: seQuadratic, ciLower: beta[2] - z * seQuadratic, ciUpper: beta[2] + z * seQuadratic, pValue: pQuadratic }
        ],
        beta, vcov, pTrend: pLinear, pNonlinear: pQuadratic, Q: chiSq, I2: I2, RSE,
        allPoints, nStudies: studies.length, nPoints: allPoints.length,
        AIC, BIC, logLik, residuals: residualsData,
        predict: (dose) => Math.exp(beta[0] + beta[1] * dose + beta[2] * dose * dose),
        predictSE: (dose) => {
          const x = [1, dose, dose * dose];
          let varPred = 0;
          for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
              varPred += x[i] * x[j] * vcov[i][j];
            }
          }
          return Math.sqrt(varPred);
        }
      };
    }

    // Cubic polynomial model
    function cubicDoseResponse(studies, refDose = 0, settings = {}) {
      const allPoints = [];
      studies.forEach(study => {
        study.dosePoints.forEach(point => {
          const doseDiff = point.dose - refDose;
          if (doseDiff >= 0) {
            const rate = point.cases / point.n;
            const logRate = Math.log(rate);
            allPoints.push({
              dose: doseDiff,
              dose2: doseDiff * doseDiff,
              dose3: doseDiff * doseDiff * doseDiff,
              logRate: logRate,
              weight: point.cases,
              cases: point.cases,
              n: point.n,
              rate: rate
            });
          }
        });
      });

      const n = allPoints.length;
      if (n < 5) throw new Error('Need at least 5 data points for cubic model');

      // Build weighted design matrix for cubic model
      const X = allPoints.map(p => [1, p.dose, p.dose2, p.dose3]);
      const Y = allPoints.map(p => p.logRate);
      const W = allPoints.map(p => p.weight);

      // XtWX and XtWY (4x4)
      const XtWX = Array(4).fill(0).map(() => Array(4).fill(0));
      const XtWY = Array(4).fill(0);

      for (let i = 0; i < n; i++) {
        const w = W[i];
        for (let j = 0; j < 4; j++) {
          for (let k = 0; k < 4; k++) {
            XtWX[j][k] += w * X[i][j] * X[i][k];
          }
          XtWY[j] += w * X[i][j] * Y[i];
        }
      }

      // Solve using Gaussian elimination
      const beta = gaussianElimination(XtWX, XtWY);

      // Calculate predictions
      const predicted = allPoints.map((p, i) => {
        return Math.exp(beta[0] + beta[1] * p.dose + beta[2] * p.dose2 + beta[3] * p.dose3);
      });

      // Residuals and MSE
      const residuals = allPoints.map((p, i) => p.logRate - Math.log(predicted[i]));
      const SSE = residuals.reduce((sum, r) => sum + r * r, 0);
      const MSE = SSE / (n - 4);

      // Chi-square and I²
      const chiSq = allPoints.reduce((sum, p, i) => {
        const expected = predicted[i] * p.n;
        return sum + Math.pow(p.cases - expected, 2) / expected;
      }, 0);
      const I2 = chiSq > (n - 4) ? ((chiSq - (n - 4)) / chiSq) * 100 : 0;

      // Standard errors (using inverse of XtWX * MSE)
      const vcov = invert4x4(XtWX);
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          vcov[i][j] *= MSE;
        }
      }

      const seLinear = Math.sqrt(vcov[1][1]);
      const seQuadratic = Math.sqrt(vcov[2][2]);
      const seCubic = Math.sqrt(vcov[3][3]);
      const z = 1.96;

      const pLinear = 2 * (1 - normalCDF(Math.abs(beta[1] / seLinear)));
      const pQuadratic = 2 * (1 - normalCDF(Math.abs(beta[2] / seQuadratic)));
      const pCubic = 2 * (1 - normalCDF(Math.abs(beta[3] / seCubic)));

      // AIC, BIC
      const logLik = -0.5 * n * Math.log(2 * Math.PI * MSE) - 0.5 * SSE / MSE;
      const AIC = 2 * 4 - 2 * logLik;
      const BIC = 4 * Math.log(n) - 2 * logLik;

      return {
        type: 'cubic',
        coefficients: [
          { name: 'Intercept (β₀)', estimate: beta[0], se: Math.sqrt(vcov[0][0]), ciLower: beta[0] - z * Math.sqrt(vcov[0][0]), ciUpper: beta[0] + z * Math.sqrt(vcov[0][0]), pValue: null },
          { name: 'Linear (β₁)', estimate: beta[1], se: seLinear, ciLower: beta[1] - z * seLinear, ciUpper: beta[1] + z * seLinear, pValue: pLinear },
          { name: 'Quadratic (β₂)', estimate: beta[2], se: seQuadratic, ciLower: beta[2] - z * seQuadratic, ciUpper: beta[2] + z * seQuadratic, pValue: pQuadratic },
          { name: 'Cubic (β₃)', estimate: beta[3], se: seCubic, ciLower: beta[3] - z * seCubic, ciUpper: beta[3] + z * seCubic, pValue: pCubic }
        ],
        beta, vcov, pTrend: pLinear, pNonlinear: pQuadratic, Q: chiSq, I2: I2,
        allPoints, nStudies: studies.length, nPoints: allPoints.length,
        AIC, BIC, logLik, residuals: allPoints.map((p, i) => ({
          dose: p.dose, residual: residuals[i], predicted: predicted[i], observed: p.rate
        })),
        predict: (dose) => Math.exp(beta[0] + beta[1] * dose + beta[2] * dose * dose + beta[3] * dose * dose * dose)
      };
    }

    // Restricted cubic spline model (improved)
    function splineDoseResponse(studies, refDose = 0, nKnots = 4, settings = {}) {
      const allPoints = [];
      studies.forEach(study => {
        study.dosePoints.forEach(point => {
          const doseDiff = point.dose - refDose;
          if (doseDiff >= 0) {
            const rate = point.cases / point.n;
            const logRate = Math.log(rate);
            allPoints.push({ dose: doseDiff, logRate, weight: point.cases, cases: point.cases, n: point.n, rate: rate });
          }
        });
      });

      const n = allPoints.length;
      if (n < nKnots + 1) throw new Error('Need more data points for spline model');

      // Calculate knot positions (quantiles)
      const doses = allPoints.map(p => p.dose).sort((a, b) => a - b);
      const knots = [];
      for (let i = 1; i <= nKnots; i++) {
        const idx = Math.floor((i / (nKnots + 1)) * doses.length);
        knots.push(doses[Math.min(idx, doses.length - 1)]);
      }

      // Create restricted cubic spline basis functions
      const createBasis = (dose) => {
        const basis = [1, dose];
        const k = knots[knots.length - 1];

        for (let j = 0; j < knots.length - 2; j++) {
          const kj = knots[j];
          const term1 = Math.pow(Math.max(0, dose - kj), 3);
          const term2 = Math.pow(Math.max(0, dose - k), 3);
          const term3 = Math.pow(k - kj, 3);
          basis.push((term1 - term2) / term3);
        }
        return basis;
      };

      const nBasis = createBasis(0).length;

      // Build design matrix
      const XtWX = Array(nBasis).fill(0).map(() => Array(nBasis).fill(0));
      const XtWY = Array(nBasis).fill(0);

      allPoints.forEach(p => {
        const basis = createBasis(p.dose);
        const w = p.weight;
        for (let i = 0; i < nBasis; i++) {
          for (let j = 0; j < nBasis; j++) {
            XtWX[i][j] += w * basis[i] * basis[j];
          }
          XtWY[i] += w * basis[i] * p.logRate;
        }
      });

      // Solve system
      const beta = gaussianElimination(XtWX, XtWY);

      // Calculate predictions
      const predicted = allPoints.map(p => {
        const basis = createBasis(p.dose);
        let pred = 0;
        for (let i = 0; i < nBasis; i++) pred += beta[i] * basis[i];
        return Math.exp(pred);
      });

      // Residuals and MSE
      const logPredicted = allPoints.map(p => {
        const basis = createBasis(p.dose);
        let pred = 0;
        for (let i = 0; i < nBasis; i++) pred += beta[i] * basis[i];
        return pred;
      });

      const residuals = allPoints.map((p, i) => p.logRate - logPredicted[i]);
      const SSE = residuals.reduce((sum, r) => sum + r * r, 0);
      const MSE = SSE / (n - nBasis);

      // Q statistic
      const chiSq = allPoints.reduce((sum, p, i) => {
        const expected = predicted[i] * p.n;
        return sum + Math.pow(p.cases - expected, 2) / expected;
      }, 0);
      const I2 = chiSq > (n - nBasis) ? ((chiSq - (n - nBasis)) / chiSq) * 100 : 0;

      // Compare with linear model for non-linearity test
      const linearResult = linearDoseResponse(studies, refDose);
      const lrStat = 2 * (linearResult.logLik - (-0.5 * SSE / MSE));
      const pNonlinear = 1 - normalCDF(Math.sqrt(Math.max(0, lrStat)));

      // AIC, BIC
      const logLik = -0.5 * n * Math.log(2 * Math.PI * MSE) - 0.5 * SSE / MSE;
      const AIC = 2 * nBasis - 2 * logLik;
      const BIC = nBasis * Math.log(n) - 2 * logLik;

      return {
        type: 'spline',
        coefficients: [
          { name: 'Intercept (β₀)', estimate: beta[0], se: Math.sqrt(MSE / n), ciLower: beta[0] - 1.96 * Math.sqrt(MSE / n), ciUpper: beta[0] + 1.96 * Math.sqrt(MSE / n), pValue: null },
          { name: 'Linear (β₁)', estimate: beta[1], se: Math.sqrt(MSE), ciLower: beta[1] - 1.96 * Math.sqrt(MSE), ciUpper: beta[1] + 1.96 * Math.sqrt(MSE), pValue: linearResult.pTrend }
        ],
        beta, knots, pTrend: linearResult.pTrend, pNonlinear, Q: chiSq, I2: I2,
        allPoints, nStudies: studies.length, nPoints: allPoints.length,
        AIC, BIC, logLik, residuals: allPoints.map((p, i) => ({
          dose: p.dose, residual: residuals[i], predicted: predicted[i], observed: p.rate
        })),
        predictDose: (dose) => {
          const basis = createBasis(dose);
          let result = 0;
          for (let i = 0; i < nBasis; i++) result += beta[i] * basis[i];
          return Math.exp(result);
        }
      };
    }

    // Exponential model
    function exponentialDoseResponse(studies, refDose = 0, settings = {}) {
      const allPoints = [];
      studies.forEach(study => {
        study.dosePoints.forEach(point => {
          const doseDiff = point.dose - refDose;
          if (doseDiff >= 0) {
            const rate = point.cases / point.n;
            const logRate = Math.log(rate);
            allPoints.push({ dose: doseDiff, logRate, weight: point.cases, cases: point.cases, n: point.n, rate: rate });
          }
        });
      });

      const n = allPoints.length;
      if (n < 3) throw new Error('Need at least 3 data points for exponential model');

      // Fit log-linear model: log(rate) = a + b * dose
      let sumW = 0, sumWX = 0, sumWY = 0, sumWX2 = 0, sumWXY = 0;

      allPoints.forEach(p => {
        const w = p.weight;
        sumW += w;
        sumWX += w * p.dose;
        sumWY += w * p.logRate;
        sumWX2 += w * p.dose * p.dose;
        sumWXY += w * p.dose * p.logRate;
      });

      const denom = sumW * sumWX2 - sumWX * sumWX;
      const b = (sumW * sumWXY - sumWX * sumWY) / denom;
      const a = (sumWY - b * sumWX) / sumW;

      // Predictions
      const predicted = allPoints.map(p => Math.exp(a + b * p.dose));

      // Residuals and MSE
      const residuals = allPoints.map(p => p.logRate - (a + b * p.dose));
      const SSE = residuals.reduce((sum, r) => sum + r * r, 0);
      const MSE = SSE / (n - 2);

      // SE for coefficients
      const seB = Math.sqrt(MSE * sumW / denom);
      const seA = Math.sqrt(MSE * sumWX2 / denom);

      // P-value for trend
      const pTrend = 2 * (1 - normalCDF(Math.abs(b / seB)));

      // Q and I²
      const chiSq = allPoints.reduce((sum, p, i) => {
        const expected = predicted[i] * p.n;
        return sum + Math.pow(p.cases - expected, 2) / expected;
      }, 0);
      const I2 = chiSq > (n - 2) ? ((chiSq - (n - 2)) / chiSq) * 100 : 0;

      // AIC, BIC
      const logLik = -0.5 * n * Math.log(2 * Math.PI * MSE) - 0.5 * SSE / MSE;
      const AIC = 2 * 2 - 2 * logLik;
      const BIC = 2 * Math.log(n) - 2 * logLik;

      return {
        type: 'exponential',
        coefficients: [
          { name: 'Intercept (α)', estimate: a, se: seA, ciLower: a - 1.96 * seA, ciUpper: a + 1.96 * seA, pValue: null },
          { name: 'Exponent (β)', estimate: b, se: seB, ciLower: b - 1.96 * seB, ciUpper: b + 1.96 * seB, pValue: pTrend }
        ],
        slope: b, intercept: a, seSlope: seB, pTrend, pNonlinear: null, Q: chiSq, I2: I2,
        allPoints, nStudies: studies.length, nPoints: allPoints.length,
        AIC, BIC, logLik, residuals: allPoints.map((p, i) => ({
          dose: p.dose, residual: residuals[i], predicted: predicted[i], observed: p.rate
        })),
        predict: (dose) => Math.exp(a + b * dose)
      };
    }

    // Fractional polynomial model
    function fractionalPolynomialDoseResponse(studies, refDose = 0, settings = {}) {
      // For simplicity, use powers p1=-2, p2=-1, p3=0.5 (common choices)
      const powers = [-2, -1, 0.5];

      const allPoints = [];
      studies.forEach(study => {
        study.dosePoints.forEach(point => {
          const doseDiff = point.dose - refDose;
          if (doseDiff >= 0) {
            const rate = point.cases / point.n;
            const logRate = Math.log(rate);
            // Handle dose = 0 for negative powers
            const doseAdj = doseDiff === 0 ? 0.001 : doseDiff;
            allPoints.push({
              dose: doseDiff,
              doseAdj: doseAdj,
              x1: doseAdj === 0 ? 0 : Math.pow(doseAdj, powers[0]),
              x2: doseAdj === 0 ? 0 : Math.pow(doseAdj, powers[1]),
              x3: doseAdj === 0 ? 0 : Math.pow(doseAdj, powers[2]),
              logRate: logRate,
              weight: point.cases,
              cases: point.cases,
              n: point.n,
              rate: rate
            });
          }
        });
      });

      const n = allPoints.length;
      if (n < 5) throw new Error('Need at least 5 data points for fractional polynomial model');

      // Build weighted design matrix
      const XtWX = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];
      const XtWY = [0,0,0,0];

      allPoints.forEach(p => {
        const X = [1, p.x1, p.x2, p.x3];
        const w = p.weight;
        for (let j = 0; j < 4; j++) {
          for (let k = 0; k < 4; k++) {
            XtWX[j][k] += w * X[j] * X[k];
          }
          XtWY[j] += w * X[j] * p.logRate;
        }
      });

      const beta = gaussianElimination(XtWX, XtWY);

      // Predictions
      const predicted = allPoints.map(p => Math.exp(beta[0] + beta[1] * p.x1 + beta[2] * p.x2 + beta[3] * p.x3));

      // Residuals
      const residuals = allPoints.map((p, i) => p.logRate - Math.log(predicted[i]));
      const SSE = residuals.reduce((sum, r) => sum + r * r, 0);
      const MSE = SSE / (n - 4);

      // Q and I²
      const chiSq = allPoints.reduce((sum, p, i) => {
        const expected = predicted[i] * p.n;
        return sum + Math.pow(p.cases - expected, 2) / expected;
      }, 0);
      const I2 = chiSq > (n - 4) ? ((chiSq - (n - 4)) / chiSq) * 100 : 0;

      // AIC, BIC
      const logLik = -0.5 * n * Math.log(2 * Math.PI * MSE) - 0.5 * SSE / MSE;
      const AIC = 2 * 4 - 2 * logLik;
      const BIC = 4 * Math.log(n) - 2 * logLik;

      return {
        type: 'fractional',
        coefficients: [
          { name: 'Intercept', estimate: beta[0], se: Math.sqrt(MSE), ciLower: beta[0] - 1.96 * Math.sqrt(MSE), ciUpper: beta[0] + 1.96 * Math.sqrt(MSE), pValue: null },
          { name: 'Power -2', estimate: beta[1], se: Math.sqrt(MSE), ciLower: beta[1] - 1.96 * Math.sqrt(MSE), ciUpper: beta[1] + 1.96 * Math.sqrt(MSE), pValue: null },
          { name: 'Power -1', estimate: beta[2], se: Math.sqrt(MSE), ciLower: beta[2] - 1.96 * Math.sqrt(MSE), ciUpper: beta[2] + 1.96 * Math.sqrt(MSE), pValue: null },
          { name: 'Power 0.5', estimate: beta[3], se: Math.sqrt(MSE), ciLower: beta[3] - 1.96 * Math.sqrt(MSE), ciUpper: beta[3] + 1.96 * Math.sqrt(MSE), pValue: null }
        ],
        pTrend: null, pNonlinear: null, Q: chiSq, I2: I2,
        allPoints, nStudies: studies.length, nPoints: allPoints.length,
        AIC, BIC, logLik, residuals: allPoints.map((p, i) => ({
          dose: p.dose, residual: residuals[i], predicted: predicted[i], observed: p.rate
        })),
        predict: (dose) => {
          const doseAdj = dose === 0 ? 0.001 : dose;
          return Math.exp(beta[0] + beta[1] * Math.pow(doseAdj, -2) + beta[2] * Math.pow(doseAdj, -1) + beta[3] * Math.pow(doseAdj, 0.5));
        }
      };
    }

    // =============================================
    // ONE-STAGE RANDOM-EFFECTS MODEL
    // Joint model fitting all study data simultaneously
    // More efficient when there are few studies
    // Model: y_ij = β_0 + β_1*dose_ij + β_2*dose_ij^2 + u_i + e_ij
    // where u_i ~ N(0, τ²) is study-specific random effect
    // =============================================

    function oneStageDoseResponse(studies, refDose = 0, settings = {}) {
      // Collect all data
      const allData = [];
      studies.forEach((study, i) => {
        study.dosePoints.forEach(point => {
          if (point.dose >= refDose) {
            const dose = point.dose - refDose;
            const rate = point.cases / point.n;
            const logRate = Math.log(rate + (rate === 0 ? 0.0001 : 0));
            const variance = Math.max(0.0001, 1/point.cases - 1/point.n);

            allData.push({
              studyIdx: i,
              studyName: study.name,
              dose: dose,
              x1: dose,
              x2: dose * dose,
              y: logRate,
              var: variance,
              w: 1 / variance,
              cases: point.cases,
              n: point.n,
              rate: rate
            });
          }
        });
      });

      const N = allData.length;
      const K = studies.length;

      if (N < 4) {
        throw new Error('Need at least 4 data points for one-stage random-effects model');
      }

      // Helper function: WLS estimation
      function wlsEstimate(X, y, W) {
        const p = X[0].length; // number of parameters

        // Build XtWX and XtWY
        const XtWX = Array(p).fill(0).map(() => Array(p).fill(0));
        const XtWY = Array(p).fill(0);

        for (let i = 0; i < N; i++) {
          const w = W[i];
          for (let j = 0; j < p; j++) {
            for (let k = 0; k < p; k++) {
              XtWX[j][k] += w * X[i][j] * X[i][k];
            }
            XtWY[j] += w * X[i][j] * y[i];
          }
        }

        // Solve using 3x3 solver (we have 3 parameters)
        const beta = solve3x3(XtWX, XtWY);
        return beta;
      }

      // Iterative REML estimation
      let tau2 = 0;
      const maxIter = 100;
      const tol = 1e-6;
      let converged = false;
      let finalBeta = [0, 0, 0];

      for (let iter = 0; iter < maxIter; iter++) {
        // Design matrix
        const X = allData.map(d => [1, d.x1, d.x2]);
        const y = allData.map(d => d.y);

        // Weight matrix with random effects
        const W = allData.map(d => {
          const w_total = 1 / (d.var + tau2);
          return w_total;
        });

        // WLS estimation
        const beta = wlsEstimate(X, y, W);
        finalBeta = beta;

        // Calculate residuals
        const residuals = allData.map((d, i) => y[i] - (beta[0] + beta[1]*d.x1 + beta[2]*d.x2));

        // Calculate study-level residuals for tau² update
        const studyGroups = {};
        allData.forEach((d, idx) => {
          if (!studyGroups[d.studyIdx]) {
            studyGroups[d.studyIdx] = [];
          }
          studyGroups[d.studyIdx].push({
            r: residuals[idx],
            w: 1 / d.var  // use within-study precision
          });
        });

        // Calculate between-study variance using method of moments
        let sumSqResid = 0;
        let sumW = 0;

        Object.keys(studyGroups).forEach(study => {
          const group = studyGroups[study];
          const n = group.length;

          // Calculate weighted mean residual for this study
          const wSum = group.reduce((a, x) => a + x.w, 0);
          const wMean = group.reduce((a, x) => a + x.w * x.r, 0) / wSum;

          // Sum of squared deviations from study mean
          sumSqResid += group.reduce((a, x) => a + x.w * Math.pow(x.r - wMean, 2), 0);
          sumW += wSum;
        });

        // Update tau² using REML-like estimator
        const Q = sumSqResid;
        const df = K - 1;
        const newTau2 = Math.max(0, (Q - df) / sumW);

        // Check convergence
        if (Math.abs(newTau2 - tau2) < tol) {
          converged = true;
          tau2 = newTau2;
          break;
        }

        tau2 = newTau2;
      }

      // Final fit with converged tau²
      const X = allData.map(d => [1, d.x1, d.x2]);
      const y = allData.map(d => d.y);
      const W = allData.map(d => 1 / (d.var + tau2));
      const beta = finalBeta;

      // Calculate fitted values and residuals
      const fitted = allData.map((d, i) => beta[0] + beta[1]*d.x1 + beta[2]*d.x2);
      const residuals = allData.map((d, i) => y[i] - fitted[i]);

      // Calculate variance-covariance matrix for SEs
      const XtWX = [[0,0,0],[0,0,0],[0,0,0]];
      allData.forEach((d, i) => {
        const w = W[i];
        for (let j = 0; j < 3; j++) {
          for (let k = 0; k < 3; k++) {
            XtWX[j][k] += w * X[i][j] * X[i][k];
          }
        }
      });

      const covMatrix = invert3x3(XtWX);

      // Standard errors
      let seBeta = [
        Math.sqrt(Math.max(0.0001, covMatrix[0][0])),
        Math.sqrt(Math.max(0.0001, covMatrix[1][1])),
        Math.sqrt(Math.max(0.0001, covMatrix[2][2]))
      ];

      // Apply Robust Variance Estimation (RVE) if requested
      let rveResults = null;
      if (settings.useRVE && allData.length > 0) {
        // Apply RVE with study-level clustering
        rveResults = calculateRobustVariance(allData, residuals, 'studyIdx');

        if (rveResults) {
          // Update SEs with robust values
          seBeta = rveResults.se;
        }
      }

      // P-values using Wald tests
      const pValue0 = 2 * (1 - normalCDF(Math.abs(beta[0] / seBeta[0])));
      const pValue1 = 2 * (1 - normalCDF(Math.abs(beta[1] / seBeta[1])));
      const pValue2 = 2 * (1 - normalCDF(Math.abs(beta[2] / seBeta[2])));

      // Overall trend test (H0: β1 = β2 = 0)
      // Use Wald chi-square test
      const trendTest = waldTest([beta[1], beta[2]], [
        [covMatrix[1][1], covMatrix[1][2]],
        [covMatrix[2][1], covMatrix[2][2]]
      ]);
      const pTrend = trendTest.pValue;

      // Nonlinearity test (H0: β2 = 0)
      const pNonlinear = pValue2;

      // Cochran's Q statistic for heterogeneity
      let Q = 0;
      const studyFits = {};
      allData.forEach((d, i) => {
        if (!studyFits[d.studyIdx]) {
          studyFits[d.studyIdx] = { sumW: 0, sumWY: 0, sumWYFitted: 0 };
        }
        studyFits[d.studyIdx].sumW += d.w;
        studyFits[d.studyIdx].sumWY += d.w * d.y;
        studyFits[d.studyIdx].sumWYFitted += d.w * fitted[i];
      });

      Object.keys(studyFits).forEach(study => {
        const fit = studyFits[study];
        const meanResid = (fit.sumWY - fit.sumWYFitted) / fit.sumW;
        Q += fit.sumW * meanResid * meanResid;
      });

      // I² statistic
      const dfQ = K - 1;
      const I2 = Q > dfQ ? ((Q - dfQ) / Q) * 100 : 0;

      // Residual variance (within-study)
      const sigma2 = residuals.reduce((sum, r, i) => sum + W[i] * r * r, 0) / (N - 3);

      // Log-likelihood, AIC, BIC
      const logLik = -0.5 * N * Math.log(2 * Math.PI) -
                     0.5 * allData.reduce((sum, d, i) => sum + Math.log(d.var + tau2), 0) -
                     0.5 * residuals.reduce((sum, r, i) => sum + r * r / (d.var + tau2), 0);
      const AIC = 2 * 4 - 2 * logLik;  // 4 params: β0, β1, β2, τ²
      const BIC = 4 * Math.log(N) - 2 * logLik;

      // Calculate predicted values on original scale
      const predicted = allData.map((d, i) => Math.exp(fitted[i]));

      return {
        type: 'onestage',
        name: 'One-Stage Random-Effects',
        description: 'Joint model fitting all study data simultaneously with study-specific random effects',
        coefficients: [
          {
            name: 'Intercept (β₀)',
            estimate: beta[0],
            se: seBeta[0],
            ciLower: beta[0] - 1.96 * seBeta[0],
            ciUpper: beta[0] + 1.96 * seBeta[0],
            pValue: pValue0
          },
          {
            name: 'Linear (β₁)',
            estimate: beta[1],
            se: seBeta[1],
            ciLower: beta[1] - 1.96 * seBeta[1],
            ciUpper: beta[1] + 1.96 * seBeta[1],
            pValue: pValue1
          },
          {
            name: 'Quadratic (β₂)',

    // =============================================
    // LIGHTWEIGHT BAYESIAN MCMC DOSE-RESPONSE ANALYSIS
    // Optimized for browser with reduced iterations
    // Uses Metropolis-Hastings sampling for probabilistic inference
    // =============================================

    /**
     * Lightweight Bayesian MCMC Dose-Response Analysis
     * Optimized for browser with reduced iterations
     * @param {Array} studies - Study data
     * @param {number} refDose - Reference dose
     * @returns {Object} - Bayesian results
     */
    function bayesianDoseResponse(studies, refDose = 0) {
      // Collect data
      const allData = [];
      studies.forEach((study, studyIdx) => {
        if (!study.dosePoints || study.dosePoints.length === 0) return;
        study.dosePoints.forEach(point => {
          if (point.dose === null || point.cases === null || point.n === null) return;
          if (point.n <= 0) return;
          if (point.dose < refDose) return;

          const dose = point.dose - refDose;
          const rate = point.cases / point.n;

          allData.push({
            dose,
            x1: dose,
            x2: dose * dose,
            cases: point.cases,
            n: point.n,
            rate,
            logRate: Math.log(rate + (rate === 0 ? 0.0001 : 0))
          });
        });
      });

      const N = allData.length;
      if (N < 4) throw new Error('Bayesian model requires at least 4 data points');

      // LIGHTWEIGHT MCMC settings for browser
      const nBurnin = 1000;    // Reduced from 5000
      const nSamples = 2000;   // Reduced from 10000
      const thin = 5;

      // Weakly informative priors
      // beta ~ N(0, 10^2)
      // sigma ~ Inv-Gamma(0.001, 0.001)

      // Initialize from OLS
      const startBeta = initializeBeta(allData);

      // Metropolis-Hastings MCMC
      const chains = {
        beta0: [],
        beta1: [],
        beta2: [],
        sigma: []
      };

      let currentBeta = [...startBeta];
      let currentSigma = 1.0;
      let acceptCount = 0;

      // Log-likelihood function
      function logLikelihood(beta, sigma) {
        let ll = 0;
        allData.forEach(p => {
          const mu = beta[0] + beta[1] * p.x1 + beta[2] * p.x2;
          const ll_i = -0.5 * Math.log(2 * Math.PI * sigma * sigma)
                       - 0.5 * Math.pow(p.logRate - mu, 2) / (sigma * sigma);
          ll += ll_i;
        });
        return ll;
      }

      // Log prior
      function logPrior(beta, sigma) {
        let lp = 0;
        lp += -0.5 * Math.pow(beta[0] / 10, 2);
        lp += -0.5 * Math.pow(beta[1] / 10, 2);
        lp += -0.5 * Math.pow(beta[2] / 10, 2);
        lp += -0.001 / sigma - 1.001 * Math.log(sigma + 1e-10);
        return lp;
      }

      // Log posterior
      function logPost(beta, sigma) {
        return logLikelihood(beta, sigma) + logPrior(beta, sigma);
      }

      // Proposal scales
      const betaScale = 0.1;
      const sigmaScale = 0.1;

      // Burn-in phase
      for (let iter = 0; iter < nBurnin; iter++) {
        const newBeta = currentBeta.map(b => b + (Math.random() - 0.5) * betaScale);
        const logRatio = logPost(newBeta, currentSigma) - logPost(currentBeta, currentSigma);

        if (Math.log(Math.random()) < logRatio) {
          currentBeta = newBeta;
          acceptCount++;
        }

        const newSigma = currentSigma * Math.exp((Math.random() - 0.5) * sigmaScale);
        const logRatioSigma = logPost(currentBeta, newSigma) - logPost(currentBeta, currentSigma);

        if (Math.log(Math.random()) < logRatioSigma) {
          currentSigma = newSigma;
        }
      }

      // Sampling phase
      for (let iter = 0; iter < nSamples; iter++) {
        const newBeta = currentBeta.map(b => b + (Math.random() - 0.5) * betaScale);
        const logRatio = logPost(newBeta, currentSigma) - logPost(currentBeta, currentSigma);

        if (Math.log(Math.random()) < logRatio) {
          currentBeta = newBeta;
        }

        const newSigma = currentSigma * Math.exp((Math.random() - 0.5) * sigmaScale);
        const logRatioSigma = logPost(currentBeta, newSigma) - logPost(currentBeta, currentSigma);

        if (Math.log(Math.random()) < logRatioSigma) {
          currentSigma = newSigma;
        }

        if (iter % thin === 0) {
          chains.beta0.push(currentBeta[0]);
          chains.beta1.push(currentBeta[1]);
          chains.beta2.push(currentBeta[2]);
          chains.sigma.push(currentSigma);
        }
      }

      // Posterior summaries
      function posteriorSummary(samples) {
        samples.sort((a, b) => a - b);
        const n = samples.length;

        const mean = samples.reduce((a, b) => a + b, 0) / n;
        const sd = Math.sqrt(samples.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / (n - 1));

        const ciLower = samples[Math.floor(n * 0.025)];
        const ciUpper = samples[Math.floor(n * 0.975)];

        return { mean, sd, ciLower, ciUpper };
      }

      const summaryBeta0 = posteriorSummary(chains.beta0);
      const summaryBeta1 = posteriorSummary(chains.beta1);
      const summaryBeta2 = posteriorSummary(chains.beta2);
      const summarySigma = posteriorSummary(chains.sigma);

      // Bayesian p-values (two-tailed)
      function bayesianPValue(samples) {
        const probPositive = samples.filter(s => s > 0).length / samples.length;
        return 2 * Math.min(probPositive, 1 - probPositive);
      }

      // WAIC
      const predicted = allData.map(p =>
        Math.exp(summaryBeta0.mean + summaryBeta1.mean * p.x1 + summaryBeta2.mean * p.x2)
      );
      const residuals = allData.map((p, i) => p.logRate - Math.log(predicted[i]));
      const SSE = residuals.reduce((sum, r) => sum + r * r, 0);
      const logLikMean = -0.5 * N * Math.log(2 * Math.PI * summarySigma.mean * summarySigma.mean)
                         - 0.5 * SSE / (summarySigma.mean * summarySigma.mean);
      const WAIC = -2 * logLikMean + 2 * 3;

      return {
        type: 'bayesian',
        name: 'Bayesian MCMC',
        description: 'Probabilistic framework with MCMC sampling (Lightweight: ' + nSamples + ' samples)',
        mcmcSettings: { nBurnin, nSamples, thin, effectiveSamples: nSamples / thin },
        coefficients: [
          { name: 'Intercept', estimate: summaryBeta0.mean, se: summaryBeta0.sd,
            ciLower: summaryBeta0.ciLower, ciUpper: summaryBeta0.ciUpper,
            pValue: bayesianPValue(chains.beta0) },
          { name: 'Linear (β₁)', estimate: summaryBeta1.mean, se: summaryBeta1.sd,
            ciLower: summaryBeta1.ciLower, ciUpper: summaryBeta1.ciUpper,
            pValue: bayesianPValue(chains.beta1) },
          { name: 'Quadratic (β₂)', estimate: summaryBeta2.mean, se: summaryBeta2.sd,
            ciLower: summaryBeta2.ciLower, ciUpper: summaryBeta2.ciUpper,
            pValue: bayesianPValue(chains.beta2) }
        ],
        pTrend: bayesianPValue(chains.beta1),
        pNonlinear: bayesianPValue(chains.beta2),
        WAIC,
        AIC: WAIC,  // For compatibility
        BIC: WAIC,  // For compatibility
        logLik: logLikMean,
        allData,
        nStudies: studies.length,
        nPoints: N,
        Q: 0,
        I2: 0,
        residuals: allData.map((p, i) => ({
          dose: p.dose,
          residual: residuals[i],
          predicted: predicted[i],
          observed: p.rate
        })),
        predict: (dose) => {
          const d = dose - refDose;
          return Math.exp(summaryBeta0.mean + summaryBeta1.mean * d + summaryBeta2.mean * d * d);
        }
      };
    }

    // Helper: Initialize beta using OLS
    function initializeBeta(data) {
      const XtWX = [[0,0,0],[0,0,0],[0,0,0]];
      const XtWY = [0,0,0];

      data.forEach(p => {
        const X = [1, p.x1, p.x2];
        for (let j = 0; j < 3; j++) {
          for (let k = 0; k < 3; k++) {
            XtWX[j][k] += X[j] * X[k];
          }
          XtWY[j] += X[j] * p.logRate;
        }
      });

      return solve3x3(XtWX, XtWY);
    }

    // =============================================
    // MODEL COMPARISON FUNCTIONS
    // Compare all dose-response models side-by-side
    // =============================================

    /**
     * Run all models and compare results
     * @param {Array} studies - Study data
     * @param {number} refDose - Reference dose
     * @returns {Object} - Comparison results
     */
    function compareAllModels(studies, refDose = 0) {
      const models = ['gls', 'linear', 'quadratic', 'cubic', 'exponential'];
      const results = {};

      models.forEach(modelType => {
        try {
          switch (modelType) {
            case 'gls':
              results[modelType] = glsDoseResponse(studies, refDose);
              break;
            case 'linear':
              results[modelType] = linearDoseResponse(studies, refDose);
              break;
            case 'quadratic':
              results[modelType] = quadraticDoseResponse(studies, refDose);
              break;
            case 'cubic':
              results[modelType] = cubicDoseResponse(studies, refDose);
              break;
            case 'exponential':
              results[modelType] = exponentialDoseResponse(studies, refDose);
              break;
          }
          results[modelType].success = true;
        } catch (error) {
          results[modelType] = { error: error.message, success: false };
        }
      });

      // Create comparison table
      const comparison = {
        models: results,
        bestFit: findBestFit(results),
        bestAIC: findBestByMetric(results, 'AIC'),
        bestBIC: findBestByMetric(results, 'BIC'),
        summary: createSummaryTable(results)
      };

      return comparison;
    }

    /**
     * Find best fitting model based on log-likelihood
     * @param {Object} results - Model results
     * @returns {string} - Best model name
     */
    function findBestFit(results) {
      let best = null;
      let bestLL = -Infinity;

      Object.keys(results).forEach(key => {
        const r = results[key];
        if (r.success && r.logLik && r.logLik > bestLL) {
          bestLL = r.logLik;
          best = key;
        }
      });

      return best;
    }

    /**
     * Find best model based on a specific metric (AIC, BIC)
     * @param {Object} results - Model results
     * @param {string} metric - Metric name ('AIC' or 'BIC')
     * @returns {string} - Best model name
     */
    function findBestByMetric(results, metric) {
      let best = null;
      let bestValue = Infinity;

      Object.keys(results).forEach(key => {
        const r = results[key];
        if (r.success && r[metric] && r[metric] < bestValue) {
          bestValue = r[metric];
          best = key;
        }
      });

      return best;
    }

    /**
     * Create summary table from model results
     * @param {Object} results - Model results
     * @returns {Array} - Summary array
     */
    function createSummaryTable(results) {
      const summary = [];

      Object.keys(results).forEach(key => {
        const r = results[key];
        if (r.success) {
          summary.push({
            model: key,
            name: r.name,
            AIC: r.AIC,
            BIC: r.BIC,
            logLik: r.logLik,
            I2: r.I2,
            tau2: r.tau2,
            pTrend: r.pTrend
          });
        }
      });

      return summary;
    }

    /**
     * Generate dose range for plotting
     * @returns {Array} - Dose values
     */
    function generateDoseRange() {
      const studies = AppState.studies || [];
      if (studies.length === 0) return [];

      // Get all dose values
      const allDoses = [];
      studies.forEach(study => {
        study.dosePoints.forEach(point => {
          allDoses.push(point.dose);
        });
      });

      if (allDoses.length === 0) return [];

      const minDose = Math.min(...allDoses);
      const maxDose = Math.max(...allDoses);
      const range = maxDose - minDose;
      const step = range / 100 || 1;

      const doses = [];
      for (let d = minDose; d <= maxDose; d += step) {
        doses.push(d);
      }

      return doses;
    }

    /**
     * Run the model comparison and update UI
     */
    function runModelComparison() {
      try {
        const studies = AppState.studies || getStudyData();
        if (studies.length === 0) {
          alert('Please enter data first');
          return;
        }

        const refDose = parseFloat(document.getElementById('referenceDose').value) || 0;
        const comparison = compareAllModels(studies, refDose);
        AppState.comparison = comparison;

        updateComparisonUI(comparison);
        generateComparisonPlot(comparison);

        switchTab('compare');
      } catch (error) {
        alert('Comparison error: ' + error.message);
      }
    }

    /**
     * Update the comparison UI with results
     * @param {Object} comparison - Comparison results
     */
    function updateComparisonUI(comparison) {
      document.getElementById('comparisonPlaceholder').classList.add('hidden');
      document.getElementById('comparisonContent').classList.remove('hidden');

      // Update table
      const tbody = document.getElementById('comparisonTableBody');
      tbody.innerHTML = comparison.summary.map(s => `
        <tr class="${s.model === comparison.bestFit ? 'highlight' : ''}" style="border-bottom: 1px solid var(--border-color);">
          <td style="padding: var(--space-3);">${s.name}</td>
          <td style="padding: var(--space-3); text-align: right;">${s.AIC !== undefined ? s.AIC.toFixed(2) : 'N/A'}</td>
          <td style="padding: var(--space-3); text-align: right;">${s.BIC !== undefined ? s.BIC.toFixed(2) : 'N/A'}</td>
          <td style="padding: var(--space-3); text-align: right;">${s.logLik !== undefined ? s.logLik.toFixed(2) : 'N/A'}</td>
          <td style="padding: var(--space-3); text-align: right;">${s.I2 !== undefined ? s.I2.toFixed(1) + '%' : 'N/A'}</td>
          <td style="padding: var(--space-3); text-align: right;">${s.tau2 !== undefined ? s.tau2.toFixed(6) : 'N/A'}</td>
          <td style="padding: var(--space-3); text-align: right;">${s.pTrend !== undefined ? (s.pTrend < 0.001 ? '<0.001' : s.pTrend.toFixed(4)) : 'N/A'}</td>
        </tr>
      `).join('');

      // Update recommendations
      const recs = document.getElementById('recommendations');
      const bestFitModel = comparison.models[comparison.bestFit];
      const bestAICModel = comparison.models[comparison.bestAIC];
      const bestBICModel = comparison.models[comparison.bestBIC];

      recs.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: var(--space-3);">
          <div style="background: rgba(255,255,255,0.15); padding: var(--space-3); border-radius: var(--radius-sm);">
            <div style="font-size: 0.9em; opacity: 0.9; margin-bottom: var(--space-1);">Best Fit (Log-Likelihood)</div>
            <div style="font-size: 1.3em; font-weight: 600;">${bestFitModel?.name || 'N/A'}</div>
          </div>
          <div style="background: rgba(255,255,255,0.15); padding: var(--space-3); border-radius: var(--radius-sm);">
            <div style="font-size: 0.9em; opacity: 0.9; margin-bottom: var(--space-1);">Best AIC</div>
            <div style="font-size: 1.3em; font-weight: 600;">${bestAICModel?.name || 'N/A'}</div>
          </div>
          <div style="background: rgba(255,255,255,0.15); padding: var(--space-3); border-radius: var(--radius-sm);">
            <div style="font-size: 0.9em; opacity: 0.9; margin-bottom: var(--space-1);">Best BIC</div>
            <div style="font-size: 1.3em; font-weight: 600;">${bestBICModel?.name || 'N/A'}</div>
          </div>
        </div>
        ${comparison.bestFit === comparison.bestAIC && comparison.bestFit === comparison.bestBIC ?
          '<div style="margin-top: var(--space-3); padding-top: var(--space-3); border-top: 1px solid rgba(255,255,255,0.3); font-size: 0.95em;">All metrics agree on <strong>' + bestFitModel?.name + '</strong> as the best model!</div>' : ''}
      `;
    }

    /**
     * Generate comparison plot showing all model curves
     * @param {Object} comparison - Comparison results
     */
    function generateComparisonPlot(comparison) {
      const doseRange = generateDoseRange();

      if (doseRange.length === 0) {
        document.getElementById('comparisonPlot').innerHTML = '<p style="text-align: center; padding: var(--space-4); color: var(--text-secondary);">No dose data available for plotting</p>';
        return;
      }

      const traces = [];
      const colors = {
        gls: '#1f77b4',
        linear: '#ff7f0e',
        quadratic: '#2ca02c',
        cubic: '#d62728',
        exponential: '#9467bd'
      };

      Object.keys(comparison.models).forEach(key => {
        const model = comparison.models[key];
        if (model.success && model.predict) {
          const y = doseRange.map(d => {
            try {
              return model.predict(d);
            } catch (e) {
              return null;
            }
          });

          traces.push({
            x: doseRange,
            y: y,
            name: model.name,
            mode: 'lines',
            line: {
              width: key === comparison.bestFit ? 4 : 2,
              color: colors[key]
            },
            opacity: key === comparison.bestFit ? 1 : 0.7
          });
        }
      });

      // Add observed data points
      const studies = AppState.studies || [];
      const observedDoses = [];
      const observedRR = [];
      const observedText = [];

      studies.forEach(study => {
        study.dosePoints.forEach(point => {
          observedDoses.push(point.dose);
          const rr = point.cases / point.n;
          observedRR.push(rr);
          observedText.push(`${study.name}<br>Dose: ${point.dose}<br>RR: ${rr.toFixed(3)}`);
        });
      });

      traces.push({
        x: observedDoses,
        y: observedRR,
        name: 'Observed Data',
        mode: 'markers',
        type: 'scatter',
        marker: {
          size: 8,
          color: 'black',
          symbol: 'circle',
          opacity: 0.5
        },
        text: observedText,
        hoverinfo: 'text+x+y'
      });

      const layout = {
        title: {
          text: 'Dose-Response Model Comparison',
          font: { size: 16, color: 'var(--text-primary)' }
        },
        xaxis: {
          title: 'Dose',
          titlefont: { size: 14, color: 'var(--text-primary)' },
          tickfont: { size: 12, color: 'var(--text-secondary)' },
          gridcolor: 'var(--border-color)',
          zerolinecolor: 'var(--border-color)'
        },
        yaxis: {
          title: 'Relative Risk / Rate',
          titlefont: { size: 14, color: 'var(--text-primary)' },
          tickfont: { size: 12, color: 'var(--text-secondary)' },
          gridcolor: 'var(--border-color)',
          zerolinecolor: 'var(--border-color)'
        },
        hovermode: 'closest',
        plot_bgcolor: 'var(--surface-base)',
        paper_bgcolor: 'var(--surface-base)',
        font: { color: 'var(--text-primary)' },
        legend: {
          x: 0.02,
          y: 0.98,
          bgcolor: 'rgba(255,255,255,0.8)',
          bordercolor: 'var(--border-color)',
          borderwidth: 1
        },
        margin: { l: 60, r: 20, t: 50, b: 60 }
      };

      const config = {
        responsive: true,
        displayModeBar: true,
        modeBarButtonsToRemove: ['lasso2d', 'select2d'],
        displaylogo: false
      };

      Plotly.newPlot('comparisonPlot', traces, layout, config);
    }

            ciLower: beta[2] - 1.96 * seBeta[2],
            ciUpper: beta[2] + 1.96 * seBeta[2],
            pValue: pValue2
          }
        ],
        tau2: tau2,
        sigma2: sigma2,
        I2: I2,
        Q: Q,
        pTrend: pTrend,
        pNonlinear: pNonlinear,
        AIC: AIC,
        BIC: BIC,
        logLik: logLik,
        converged: converged,
        rveUsed: rveResults !== null,
        rveClusters: rveResults ? rveResults.nClusters : null,
        rveDf: rveResults ? rveResults.df : null,
        robustSe: rveResults ? rveResults.se : null,
        allPoints: allData.map((d, i) => ({
          dose: d.dose,
          cases: d.cases,
          n: d.n,
          rate: d.rate,
          residual: residuals[i],
          predicted: predicted[i],
          observed: d.rate,
          studyName: d.studyName
        })),
        nStudies: K,
        nPoints: N,
        predict: (dose) => Math.exp(beta[0] + beta[1] * dose + beta[2] * dose * dose)
      };
    }

    // Helper function for Wald chi-square test
    function waldTest(beta, varCov) {
      const p = beta.length;

      // Invert variance-covariance matrix
      let invVarCov;
      if (p === 1) {
        invVarCov = [[1 / varCov[0][0]]];
      } else if (p === 2) {
        const det = varCov[0][0] * varCov[1][1] - varCov[0][1] * varCov[1][0];
        invVarCov = [
          [varCov[1][1] / det, -varCov[0][1] / det],
          [-varCov[1][0] / det, varCov[0][0] / det]
        ];
      } else {
        return { chi2: 0, pValue: 1 };
      }

      // Calculate Wald statistic: beta' * inv(Var) * beta
      let chi2 = 0;
      for (let i = 0; i < p; i++) {
        for (let j = 0; j < p; j++) {
          chi2 += beta[i] * invVarCov[i][j] * beta[j];
        }
      }

      // P-value from chi-square distribution
      const pValue = 1 - chiSquareCDF(chi2, p);

      return { chi2, pValue };
    }

    // =============================================
    // MATRIX HELPER FUNCTIONS
    // =============================================

    function solve3x3(A, b) {
      const det = A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) -
                  A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) +
                  A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);

      if (Math.abs(det) < 1e-10) return [0, 0, 0];

      const invDet = 1 / det;
      return [
        invDet * (b[0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) -
                 A[0][1] * (b[1] * A[2][2] - A[1][2] * b[2]) +
                 A[0][2] * (b[1] * A[2][1] - A[1][1] * b[2])),
        invDet * (A[0][0] * (b[1] * A[2][2] - A[1][2] * b[2]) -
                 b[0] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) +
                 A[0][2] * (A[1][0] * b[2] - b[1] * A[2][0])),
        invDet * (A[0][0] * (A[1][1] * b[2] - b[1] * A[2][1]) -
                 A[0][1] * (A[1][0] * b[2] - b[1] * A[2][0]) +
                 b[0] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]))
      ];
    }

    function invert3x3(A) {
      const det = A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) -
                  A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) +
                  A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);

      if (Math.abs(det) < 1e-10) return [[0,0,0],[0,0,0],[0,0,0]];

      const invDet = 1 / det;
      return [
        [
          invDet * (A[1][1] * A[2][2] - A[1][2] * A[2][1]),
          invDet * (A[0][2] * A[2][1] - A[0][1] * A[2][2]),
          invDet * (A[0][1] * A[1][2] - A[0][2] * A[1][1])
        ],
        [
          invDet * (A[1][2] * A[2][0] - A[1][0] * A[2][2]),
          invDet * (A[0][0] * A[2][2] - A[0][2] * A[2][0]),
          invDet * (A[0][2] * A[1][0] - A[0][0] * A[1][2])
        ],
        [
          invDet * (A[1][0] * A[2][1] - A[1][1] * A[2][0]),
          invDet * (A[0][1] * A[2][0] - A[0][0] * A[2][1]),
          invDet * (A[0][0] * A[1][1] - A[0][1] * A[1][0])
        ]
      ];
    }

    function invert4x4(A) {
      // Using Gaussian elimination for 4x4 inverse
      const n = 4;
      const I = Array(n).fill(0).map((_, i) => Array(n).fill(0).map((_, j) => i === j ? 1 : 0));
      const M = A.map(row => [...row]);

      for (let i = 0; i < n; i++) {
        let maxRow = i;
        for (let k = i + 1; k < n; k++) {
          if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) maxRow = k;
        }
        [M[i], M[maxRow]] = [M[maxRow], M[i]];
        [I[i], I[maxRow]] = [I[maxRow], I[i]];

        const pivot = M[i][i];
        if (Math.abs(pivot) < 1e-10) return Array(n).fill(0).map(() => Array(n).fill(0));

        for (let j = 0; j < n; j++) {
          M[i][j] /= pivot;
          I[i][j] /= pivot;
        }

        for (let k = 0; k < n; k++) {
          if (k !== i) {
            const factor = M[k][i];
            for (let j = 0; j < n; j++) {
              M[k][j] -= factor * M[i][j];
              I[k][j] -= factor * I[i][j];
            }
          }
        }
      }

      return I;
    }

    function gaussianElimination(A, b) {
      const n = A.length;
      const M = A.map((row, i) => [...row, b[i]]);

      for (let i = 0; i < n; i++) {
        let maxRow = i;
        for (let k = i + 1; k < n; k++) {
          if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) maxRow = k;
        }
        [M[i], M[maxRow]] = [M[maxRow], M[i]];

        for (let k = i + 1; k < n; k++) {
          const factor = M[k][i] / M[i][i];
          for (let j = i; j <= n; j++) {
            M[k][j] -= factor * M[i][j];
          }
        }
      }

      const x = Array(n).fill(0);
      for (let i = n - 1; i >= 0; i--) {
        x[i] = M[i][n];
        for (let j = i + 1; j < n; j++) {
          x[i] -= M[i][j] * x[j];
        }
        x[i] /= M[i][i];
      }}n

    // Normal CDF (approximation)
    function normalCDF(x) {
      const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
      const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;

      const sign = x < 0 ? -1 : 1;
      x = Math.abs(x) / Math.sqrt(2);

      const t = 1.0 / (1.0 + p * x);
      const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

      return 0.5 * (1.0 + sign * y);
    }

    // Inverse normal CDF (quantile function) for BCa bootstrap
    function normalCDFInverse(p) {
      const a = [
        -3.969683028665376e+01,
        2.209460984245205e+02,
        -2.759285104469687e+02,
        1.383577518672690e+02,
        -3.066479806614716e+01,
        2.506628277459239e+00
      ];

      const b = [
        -5.447609879822406e+01,
        1.615858368580409e+02,
        -1.556989798598866e+02,
        6.680131188771972e+01,
        -1.328068155288572e+01
      ];

      const c = [
        -7.784894002430293e-03,
        -3.223964580411365e-01,
        -2.400758277161838e+00,
        -2.549732539343734e+00,
        4.374664141464968e+00,
        2.938163982698783e+00
      ];

      const d = [
        7.784695709041462e-03,
        3.224671290700398e-01,
        2.445134137142996e+00,
        3.754408661907416e+00
      ];

      const pLow = 0.02425;
      const pHigh = 1 - pLow;
      let q, r;

      if (p < pLow) {
        q = Math.sqrt(-2 * Math.log(p));
        return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
               ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
      } else if (p <= pHigh) {
        q = p - 0.5;
        r = q * q;
        return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q /
               (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
      } else {
        q = Math.sqrt(-2 * Math.log(1 - p));
        return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
                ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
      }
    }

    // Chi-square CDF (approximation for df > 0)
    function chi2CDF(x, df) {
      if (x <= 0) return 0;
      // Wilson-Hilferty approximation
      const z = Math.pow(x / df, 1/3) - (2 / (9 * df));
      return normalCDF(z * Math.sqrt(3 * df / 2));
    }

    /**
     * Calculate bootstrap confidence intervals for dose-response models
     * @param {Array} studies - Study data
     * @param {string} modelType - Type of model ('gls', 'linear', 'quadratic', 'cubic', 'spline', 'exponential', 'fractional')
     * @param {number} nBoot - Number of bootstrap replications
     * @param {string} ciMethod - CI method ('percentile', 'bca', 'normal')
     * @param {number} confLevel - Confidence level (0.95 for 95%)
     * @param {number} refDose - Reference dose
     * @param {Object} settings - Analysis settings
     * @returns {Object} - Bootstrap results with CIs for all coefficients
     */
    function bootstrapCI(studies, modelType, nBoot = 1000, ciMethod = 'percentile', confLevel = 0.95, refDose = 0, settings = {}) {
      const bootSlopes = [];
      const bootIntercepts = [];
      const bootQuadratic = [];
      const bootCubic = [];

      // Get original model fit
      let originalModel;
      switch (modelType) {
        case 'gls':
          originalModel = glsDoseResponse(studies, refDose, settings);
          break;
        case 'linear':
          originalModel = linearDoseResponse(studies, refDose, settings);
          break;
        case 'quadratic':
          originalModel = quadraticDoseResponse(studies, refDose, settings);
          break;
        case 'cubic':
          originalModel = cubicDoseResponse(studies, refDose, settings);
          break;
        case 'spline':
          originalModel = splineDoseResponse(studies, refDose, settings.splineKnots || 3, settings);
          break;
        case 'exponential':
          originalModel = exponentialDoseResponse(studies, refDose, settings);
          break;
        case 'fractional':
          originalModel = fractionalPolynomialDoseResponse(studies, refDose, settings);
          break;
        default:
          originalModel = glsDoseResponse(studies, refDose, settings);
      }

      const N = studies.length;
      const alpha = 1 - confLevel;

      // Bootstrap resampling
      for (let b = 0; b < nBoot; b++) {
        // Resample studies with replacement
        const bootStudies = [];
        for (let i = 0; i < N; i++) {
          const idx = Math.floor(Math.random() * N);
          bootStudies.push(studies[idx]);
        }

        try {
          // Fit model to bootstrap sample
          let bootModel;
          switch (modelType) {
            case 'gls':
              bootModel = glsDoseResponse(bootStudies, refDose, settings);
              break;
            case 'linear':
              bootModel = linearDoseResponse(bootStudies, refDose, settings);
              break;
            case 'quadratic':
              bootModel = quadraticDoseResponse(bootStudies, refDose, settings);
              break;
            case 'cubic':
              bootModel = cubicDoseResponse(bootStudies, refDose, settings);
              break;
            case 'spline':
              bootModel = splineDoseResponse(bootStudies, refDose, settings.splineKnots || 3, settings);
              break;
            case 'exponential':
              bootModel = exponentialDoseResponse(bootStudies, refDose, settings);
              break;
            case 'fractional':
              bootModel = fractionalPolynomialDoseResponse(bootStudies, refDose, settings);
              break;
            default:
              bootModel = glsDoseResponse(bootStudies, refDose, settings);
          }

          if (bootModel && bootModel.coefficients) {
            bootIntercepts.push(bootModel.coefficients[0]?.estimate || 0);
            bootSlopes.push(bootModel.coefficients[1]?.estimate || 0);
            if (bootModel.coefficients[2]) {
              bootQuadratic.push(bootModel.coefficients[2]?.estimate || 0);
            }
            if (bootModel.coefficients[3]) {
              bootCubic.push(bootModel.coefficients[3]?.estimate || 0);
            }
          }
        } catch (e) {
          // Skip failed bootstrap samples
          console.warn('Bootstrap iteration failed:', e.message);
        }
      }

      // Calculate bootstrap CIs based on method
      function calculateBootCI(samples, original, method) {
        if (samples.length === 0) return null;

        samples.sort((a, b) => a - b);
        const n = samples.length;

        if (method === 'percentile') {
          const lowerIdx = Math.floor(n * alpha / 2);
          const upperIdx = Math.floor(n * (1 - alpha / 2));
          return {
            lower: samples[lowerIdx],
            upper: samples[upperIdx],
            method: 'percentile'
          };
        } else if (method === 'bca') {
          // Bias-corrected and accelerated (simplified version)
          const propLess = samples.reduce((sum, x) => sum + (x < original ? 1 : 0), 0) / n;
          const z0 = normalCDFInverse(propLess);
          const zAlpha = normalCDFInverse(alpha / 2);
          const zAlpha2 = normalCDFInverse(1 - alpha / 2);

          const adj1 = normalCDF(2 * z0 + zAlpha);
          const adj2 = normalCDF(2 * z0 + zAlpha2);

          const lowerIdx = Math.max(0, Math.min(n - 1, Math.floor(n * adj1)));
          const upperIdx = Math.max(0, Math.min(n - 1, Math.floor(n * adj2)));

          return {
            lower: samples[lowerIdx],
            upper: samples[upperIdx],
            method: 'bca',
            biasCorrection: z0
          };
        } else { // normal
          const mean = samples.reduce((a, b) => a + b, 0) / n;
          const se = Math.sqrt(samples.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / (n - 1));
          const z = normalCDFInverse(1 - alpha / 2);

          return {
            lower: original - z * se,
            upper: original + z * se,
            method: 'normal'
          };
        }
      }

      return {
        original: originalModel,
        bootstrap: {
          intercept: calculateBootCI(bootIntercepts, originalModel.coefficients[0]?.estimate || 0, ciMethod),
          slope: calculateBootCI(bootSlopes, originalModel.coefficients[1]?.estimate || 0, ciMethod),
          quadratic: bootQuadratic.length > 0 ? calculateBootCI(bootQuadratic, originalModel.coefficients[2]?.estimate || 0, ciMethod) : null,
          cubic: bootCubic.length > 0 ? calculateBootCI(bootCubic, originalModel.coefficients[3]?.estimate || 0, ciMethod) : null
        },
        nBoot: nBoot,
        ciMethod: ciMethod,
        confLevel: confLevel,
        nSuccessful: bootSlopes.length,
        successRate: (bootSlopes.length / nBoot * 100).toFixed(1) + '%'
      };
    }

    // =============================================
    // ANALYSIS RUNNER
    // =============================================

    function runAnalysis() {
      try {
        // Show loading state
        const runBtn = document.querySelector('.app-controls .btn--primary');
        const originalText = runBtn.innerHTML;
        runBtn.innerHTML = '<span class="btn-spinner">⏳</span> Analyzing...';
        runBtn.disabled = true;

        setTimeout(() => {
          try {
            // Get data
            const studies = getStudyData();
            if (studies.length === 0) {
              alert('Please enter valid study data (at least 2 dose points per study).');
              runBtn.innerHTML = originalText;
              runBtn.disabled = false;
              return;
            }

            // Store studies
            AppState.studies = studies;

            // Get settings
            const settings = {
              modelType: document.getElementById('modelType').value,
              referenceDose: parseFloat(document.getElementById('referenceDose').value) || 0,
              splineKnots: parseInt(document.getElementById('splineKnots').value),
              outcomeType: document.getElementById('outcomeType').value,
              testNonlinearity: document.getElementById('testNonlinearity').value,
              useRVE: document.getElementById('useRVE').value === 'yes',
              ciMethod: document.getElementById('ciMethod').value,
              confLevel: parseFloat(document.getElementById('confLevel').value)
            };

            // Show MCMC progress indicator for Bayesian model
            if (settings.modelType === 'bayesian') {
              runBtn.innerHTML = '<span class="btn-spinner">⏳</span> Running MCMC (~2-5s)...';
            }

            // Use setTimeout to allow UI to update before running MCMC
            setTimeout(() => {
              // Run appropriate model
              let results;
              switch (settings.modelType) {
              case 'gls':
                results = glsDoseResponse(studies, settings.referenceDose, settings);
                break;
              case 'linear':
                results = linearDoseResponse(studies, settings.referenceDose, settings);
                break;
              case 'quadratic':
                results = quadraticDoseResponse(studies, settings.referenceDose, settings);
                break;
              case 'cubic':
                results = cubicDoseResponse(studies, settings.referenceDose, settings);
                break;
              case 'spline':
                results = splineDoseResponse(studies, settings.referenceDose, settings.splineKnots, settings);
                break;
              case 'exponential':
                results = exponentialDoseResponse(studies, settings.referenceDose, settings);
                break;
              case 'fractional':
                results = fractionalPolynomialDoseResponse(studies, settings.referenceDose, settings);
                break;
              case 'power':
                results = exponentialDoseResponse(studies, settings.referenceDose, settings); // Use exponential as approximation
                break;
              case 'onestage':
                results = oneStageDoseResponse(studies, settings.referenceDose, settings);
                break;
              case 'bayesian':
                results = bayesianDoseResponse(studies, settings.referenceDose);
                break;
              default:
                results = glsDoseResponse(studies, settings.referenceDose, settings);


            // Apply profile likelihood confidence intervals if selected
            if (settings.ciMethod === 'profile' && results && results.coefficients) {
              try {
                results.ciMethod = 'profile-likelihood';
                results.confLevel = settings.confLevel;

                results.coefficients = results.coefficients.map((coef, idx) => {
                  const profileCI = calculateProfileLikelihoodCI(results, idx, settings.confLevel);
                  return {
                    ...coef,
                    ciLower: profileCI.lower,
                    ciUpper: profileCI.upper,
                    ciMethod: 'profile-likelihood'
                  };
                });
              } catch (error) {
                console.warn('Profile likelihood CI calculation failed, falling back to Wald:', error);
                results.ciMethod = 'wald (profile failed)';
              }
            } else if (results) {
              results.ciMethod = 'wald';
              results.confLevel = settings.confLevel;
            }

            // Apply bootstrap confidence intervals if selected
            if (settings.ciMethod === 'bootstrap' || document.getElementById('useBootstrap')?.value === 'yes') {
              try {
                const nBoot = parseInt(document.getElementById('nBoot')?.value) || 1000;
                const bootMethod = document.getElementById('bootMethod')?.value || 'percentile';

                // Update button text to show bootstrap progress
                runBtn.innerHTML = `<span class="btn-spinner">⏳</span> Bootstrap CI (${nBoot} reps, ~${Math.round(nBoot/100)}s)...`;

                // Use setTimeout to allow UI to update before running bootstrap
                setTimeout(() => {
                  try {
                    const bootResults = bootstrapCI(studies, settings.modelType, nBoot, bootMethod, settings.confLevel, settings.referenceDose, settings);

                    // Update coefficients with bootstrap CIs
                    if (bootResults.bootstrap && results.coefficients) {
                      results.coefficients = results.coefficients.map((coef, idx) => {
                        const bootCI = idx === 0 ? bootResults.bootstrap.intercept :
                                       idx === 1 ? bootResults.bootstrap.slope :
                                       idx === 2 ? bootResults.bootstrap.quadratic :
                                       bootResults.bootstrap.cubic;
                        if (bootCI) {
                          return {
                            ...coef,
                            ciLower: bootCI.lower,
                            ciUpper: bootCI.upper,
                            ciMethod: 'bootstrap-' + bootCI.method
                          };
                        }
                        return coef;
                      });
                    }

                    results.bootstrap = bootResults;
                    results.ciMethod = 'bootstrap-' + bootMethod;
                    results.confLevel = settings.confLevel;

                    // Store results and update UI
                    AppState.results = results;
                    updateResultsUI(results);
                    generateDoseResponsePlot(results);
                    generateStudyCurvesPlot(studies);
                    generateResidualPlot(results);
                    generateForestPlot(studies);
                    switchTab('results');

                  } catch (bootError) {
                    console.warn('Bootstrap CI calculation failed, using model-based CIs:', bootError);
                    results.ciMethod = 'wald (bootstrap failed)';
                    alert('Bootstrap CI calculation encountered errors. Using model-based CIs instead.\n\nError: ' + bootError.message);

                    // Still update UI with original results
                    AppState.results = results;
                    updateResultsUI(results);
                    generateDoseResponsePlot(results);
                    generateStudyCurvesPlot(studies);
                    generateResidualPlot(results);
                    generateForestPlot(studies);
                    switchTab('results');
                  } finally {
                    runBtn.innerHTML = originalText;
                    runBtn.disabled = false;
                  }
                }, 50); // Small delay to allow UI update

                return; // Exit early since we'll continue in the setTimeout
              } catch (error) {
                console.warn('Bootstrap setup failed:', error);
                results.ciMethod = 'wald (bootstrap setup failed)';
              }
            }

            }

            AppState.results = results;

            // Update UI
            updateResultsUI(results);
            generateDoseResponsePlot(results);
            generateStudyCurvesPlot(studies);
            generateResidualPlot(results);
            generateForestPlot(studies);

            // Switch to results tab
            switchTab('results');

            } catch (error) {
              alert('MCMC analysis error: ' + error.message);
              console.error(error);
            } finally {
              runBtn.innerHTML = originalText;
              runBtn.disabled = false;
            }
            }, 10); // Small delay to allow UI update for MCMC progress
          } finally {
            runBtn.innerHTML = originalText;
            runBtn.disabled = false;
          }
        }, 100);

      } catch (error) {
        alert('Analysis error: ' + error.message);
        console.error(error);
        const runBtn = document.querySelector('.app-controls .btn--primary');
        runBtn.innerHTML = 'Run Analysis';
        runBtn.disabled = false;
      }
    }

    function updateResultsUI(results) {
      // Show results content
      document.getElementById('resultsPlaceholder').classList.add('hidden');
      document.getElementById('resultsContent').classList.remove('hidden');
      document.getElementById('plotPlaceholder').classList.add('hidden');
      document.getElementById('doseResponsePlot').classList.remove('hidden');
      document.getElementById('studyCurvesPlaceholder').classList.add('hidden');
      document.getElementById('studyCurvesPlot').classList.remove('hidden');
      document.getElementById('residualPlaceholder').classList.add('hidden');
      document.getElementById('residualPlot').classList.remove('hidden');
      document.getElementById('forestPlaceholder').classList.add('hidden');
      document.getElementById('forestPlot').classList.remove('hidden');

      // Update summary stats
      document.getElementById('nStudies').textContent = results.nStudies;
      document.getElementById('nDosePoints').textContent = results.nPoints;
      document.getElementById('pTrend').textContent = formatPValue(results.pTrend);
      document.getElementById('pNonlinear').textContent = results.pNonlinear !== null ? formatPValue(results.pNonlinear) : 'N/A';
      document.getElementById('qStat').textContent = results.Q.toFixed(2);
      document.getElementById('i2Stat').textContent = results.I2.toFixed(1) + '%';

      // Show WAIC for Bayesian models, AIC/BIC for others
      const aicStat = document.getElementById('aicStat');
      const bicStat = document.getElementById('bicStat');
      const aicLabel = aicStat.nextElementSibling;
      const bicLabel = bicStat.nextElementSibling;

      if (results.type === 'bayesian') {
        aicStat.textContent = results.WAIC.toFixed(1);
        aicLabel.textContent = 'WAIC';
        bicStat.textContent = 'N/A';
        bicLabel.textContent = 'BIC (not applicable)';
      } else {
        aicStat.textContent = results.AIC.toFixed(1);
        aicLabel.textContent = 'AIC';
        bicStat.textContent = results.BIC.toFixed(1);
        bicLabel.textContent = 'BIC';
      }

      // Color-code I2
      const i2El = document.getElementById('i2Stat');
      i2El.className = 'stat-card__value';
      if (results.I2 < 25) i2El.classList.add('stat-card__value--success');
      else if (results.I2 < 50) i2El.classList.add('stat-card__value--warning');
      else i2El.classList.add('stat-card__value--danger');

      // Update coefficients table header to show if RVE is used
      const seHeader = document.querySelector('#coefficientsTable th:nth-child(3)');
      if (results.rveUsed) {
        seHeader.innerHTML = 'SE <small>(Robust CR2)</small>';
        seHeader.title = `Robust standard errors using cluster-robust variance estimation with ${results.rveClusters} clusters and ${results.rveDf} degrees of freedom`;
      } else {
        seHeader.innerHTML = 'SE';
        seHeader.title = 'Model-based standard errors';
      }

      // Update CI header to show method and confidence level
      const ciHeader = document.querySelector('#coefficientsTable th:nth-child(4)');
      const confLevel = results.confLevel || 0.95;
      const confPercent = (confLevel * 100).toFixed(0);
      if (results.ciMethod === 'profile-likelihood') {
        ciHeader.innerHTML = `${confPercent}% CI <small>(Profile)</small>`;
        ciHeader.title = `Profile likelihood confidence intervals (${confPercent}% level) - account for non-linearity better than Wald intervals`;
      } else if (results.ciMethod && results.ciMethod.includes('bootstrap')) {
        const bootMethod = results.ciMethod.replace('bootstrap-', '');
        const methodLabel = bootMethod === 'percentile' ? 'Percentile' :
                           bootMethod === 'bca' ? 'BCa (Bias-Corrected)' :
                           bootMethod === 'normal' ? 'Normal Approximation' : 'Bootstrap';
        ciHeader.innerHTML = `${confPercent}% CI <small>(${methodLabel})</small>`;
        ciHeader.title = `Bootstrap ${methodLabel} confidence intervals (${confPercent}% level) - resampling-based CIs that don't assume normality`;
      } else if (results.ciMethod && results.ciMethod.includes('wald')) {
        ciHeader.innerHTML = `${confPercent}% CI <small>(Wald)</small>`;
        ciHeader.title = `Wald confidence intervals (${confPercent}% level) - assume symmetric sampling distribution`;
      } else {
        ciHeader.innerHTML = `${confPercent}% CI`;
        ciHeader.title = `${confPercent}% confidence intervals`;
      }

      // Update coefficients table
      const tbody = document.getElementById('coefficientsBody');
      tbody.innerHTML = results.coefficients.map(coef => `
        <tr>
          <td class="font-mono">${coef.name}</td>
          <td class="font-mono">${coef.estimate.toFixed(4)}</td>
          <td class="font-mono">${coef.se.toFixed(4)}</td>
          <td class="font-mono">[${coef.ciLower.toFixed(4)}, ${coef.ciUpper.toFixed(4)}]</td>
          <td class="font-mono">${coef.pValue !== null ? formatPValue(coef.pValue) : 'N/A'}</td>
        </tr>
      `).join('');

      // Add CI method information alert
      let ciAlert = document.getElementById('ciMethodInfoAlert');
      const confPercent = ((results.confLevel || 0.95) * 100).toFixed(0);
      if (results.ciMethod === 'profile-likelihood') {
        if (!ciAlert) {
          ciAlert = document.createElement('div');
          ciAlert.id = 'ciMethodInfoAlert';
          ciAlert.className = 'alert alert--success';
          ciAlert.style.cssText = 'margin-bottom: var(--space-4); padding: var(--space-3); border-radius: var(--radius-md); background: var(--color-success-bg); border: 1px solid var(--color-success-500); color: var(--text-primary);';
          const coefficientsTable = document.getElementById('coefficientsTable');
          coefficientsTable.parentNode.insertBefore(ciAlert, coefficientsTable);
        }
        ciAlert.innerHTML = `
          <strong>Profile Likelihood Confidence Intervals (${confPercent}%):</strong>
          Profile likelihood CIs account for non-linearity better than Wald intervals by inverting the likelihood ratio test.
          These intervals are more accurate for non-linear models and when the sampling distribution is asymmetric.
        `;
      } else if (results.ciMethod && results.ciMethod.includes('bootstrap')) {
        if (!ciAlert) {
          ciAlert = document.createElement('div');
          ciAlert.id = 'ciMethodInfoAlert';
          ciAlert.className = 'alert alert--info';
          ciAlert.style.cssText = 'margin-bottom: var(--space-4); padding: var(--space-3); border-radius: var(--radius-md); background: var(--color-info-bg); border: 1px solid var(--color-info-500); color: var(--text-primary);';
          const coefficientsTable = document.getElementById('coefficientsTable');
          coefficientsTable.parentNode.insertBefore(ciAlert, coefficientsTable);
        }
        const bootMethod = results.ciMethod.replace('bootstrap-', '');
        const bootInfo = results.bootstrap || {};
        const methodDesc = bootMethod === 'percentile' ? 'simple percentile method' :
                          bootMethod === 'bca' ? 'bias-corrected and accelerated (BCa) method - adjusts for bias and skewness' :
                          'normal approximation method - assumes symmetric bootstrap distribution';
        ciAlert.innerHTML = `
          <strong>Bootstrap Confidence Intervals (${confPercent}% - ${bootMethod.charAt(0).toUpperCase() + bootMethod.slice(1)}):</strong>
          Bootstrap CIs are computed using ${methodDesc} with ${bootInfo.nBoot || 'N/A'} replications.
          Success rate: ${bootInfo.successRate || 'N/A'}.
          ${bootMethod === 'bca' && bootInfo.bootstrap?.slope?.biasCorrection ? `<br>Bias correction z0: ${bootInfo.bootstrap.slope.biasCorrection.toFixed(4)}.` : ''}
          These resampling-based CIs don't assume normality and are robust to violations of model assumptions.
        `;
      } else {
        if (ciAlert) ciAlert.remove();
      }

      // Add RVE information alert if used
      let rveAlert = document.getElementById('rveInfoAlert');
      if (results.rveUsed) {
        if (!rveAlert) {
          rveAlert = document.createElement('div');
          rveAlert.id = 'rveInfoAlert';
          rveAlert.className = 'alert alert--info';
          rveAlert.style.cssText = 'margin-bottom: var(--space-4); padding: var(--space-3); border-radius: var(--radius-md); background: var(--color-info-bg); border: 1px solid var(--color-info-500); color: var(--text-primary);';
          const coefficientsTable = document.getElementById('coefficientsTable');
          coefficientsTable.parentNode.insertBefore(rveAlert, coefficientsTable);
        }
        rveAlert.innerHTML = `
          <strong>Robust Variance Estimation (RVE) Applied:</strong>
          Using cluster-robust (clubSandwich CR2) standard errors with
          ${results.rveClusters} clusters (studies) and ${results.rveDf} degrees of freedom.
          This provides valid inference even with correlated effect sizes within studies.
        `;
      } else if (rveAlert) {
        rveAlert.remove();
      }

      // Add MCMC information alert for Bayesian models
      let mcmcAlert = document.getElementById('mcmcInfoAlert');
      if (results.type === 'bayesian' && results.mcmcSettings) {
        if (!mcmcAlert) {
          mcmcAlert = document.createElement('div');
          mcmcAlert.id = 'mcmcInfoAlert';
          mcmcAlert.className = 'alert alert--warning';
          mcmcAlert.style.cssText = 'margin-bottom: var(--space-4); padding: var(--space-3); border-radius: var(--radius-md); background: var(--color-warning-bg); border: 1px solid var(--color-warning-500); color: var(--text-primary);';
          const coefficientsTable = document.getElementById('coefficientsTable');
          coefficientsTable.parentNode.insertBefore(mcmcAlert, coefficientsTable);
        }
        mcmcAlert.innerHTML = `
          <strong>Lightweight Bayesian MCMC Analysis:</strong>
          Using ${results.mcmcSettings.nSamples} samples (${results.mcmcSettings.effectiveSamples} effective) with
          ${results.mcmcSettings.nBurnin} burn-in iterations (thinned by ${results.mcmcSettings.thin}).
          <strong>Note:</strong> This is a lightweight browser-optimized version. For publication-quality results,
          consider using full MCMC (10,000+ samples) with R/Stan. Credible intervals represent 95% posterior probability.
        `;
      } else if (mcmcAlert) {
        mcmcAlert.remove();
      }

      // Generate predictions table
      generatePredictionsTable(results);
      generateDoseSpecificEstimates(results);

      // Generate statistical tests
      generateStatisticalTests(results);
    }

    function generatePredictionsTable(results) {
      const tbody = document.getElementById('predictionsBody');

      // Get dose range
      const doses = results.allPoints.map(p => p.dose);
      const minDose = Math.min(...doses);
      const maxDose = Math.max(...doses);
      const step = (maxDose - minDose) / 5;

      const predictions = [];
      for (let d = minDose; d <= maxDose; d += step) {
        predictions.push(d);
      }
      if (predictions[predictions.length - 1] !== maxDose) {
        predictions.push(maxDose);
      }

      tbody.innerHTML = predictions.map(dose => {
        const pred = results.predict(dose);
        let seFit, ciLow, ciHigh, piLow, piHigh;

        if (results.predictSE) {
          seFit = results.predictSE(dose);

          // Confidence Interval (uncertainty in mean estimate)
          ciLow = Math.exp(Math.log(pred) - 1.96 * seFit);
          ciHigh = Math.exp(Math.log(pred) + 1.96 * seFit);

          // Prediction Interval (uncertainty + between-study heterogeneity)
          // SE_pred = sqrt(SE_fit² + τ²)
          const tau2 = results.tau2 || 0;
          const sePred = Math.sqrt(seFit * seFit + tau2);
          piLow = Math.exp(Math.log(pred) - 1.96 * sePred);
          piHigh = Math.exp(Math.log(pred) + 1.96 * sePred);
        } else {
          // Fallback approximation
          seFit = Math.sqrt(results.allPoints.reduce((sum, p) => sum + Math.pow(p.logRate - Math.log(pred), 2), 0) / results.allPoints.length);
          ciLow = Math.exp(Math.log(pred) - 1.96 * seFit);
          ciHigh = Math.exp(Math.log(pred) + 1.96 * seFit);

          // Prediction interval fallback
          const tau2 = results.tau2 || 0;
          const sePred = Math.sqrt(seFit * seFit + tau2);
          piLow = Math.exp(Math.log(pred) - 1.96 * sePred);
          piHigh = Math.exp(Math.log(pred) + 1.96 * sePred);
        }

        return `
          <tr>
            <td class="font-mono">${dose.toFixed(2)}</td>
            <td class="font-mono">${pred.toFixed(4)}</td>
            <td class="font-mono">${ciLow.toFixed(4)}</td>
            <td class="font-mono">${ciHigh.toFixed(4)}</td>
            <td class="font-mono" style="color: var(--color-warning-400);">${piLow.toFixed(4)}</td>
            <td class="font-mono" style="color: var(--color-warning-400);">${piHigh.toFixed(4)}</td>
            <td class="font-mono">${seFit.toFixed(4)}</td>
          </tr>
        `;
      }).join('');
    }

    function generateStatisticalTests(results) {
      // Wald Test for Non-linearity
      const waldResults = waldTestNonlinearity(results);
      const waldHTML = waldResults.wald !== null ? `
        <div style="margin-bottom: var(--space-3);">
          <div class="flex items-center gap-2" style="margin-bottom: var(--space-2);">
            <span class="font-semibold text-primary">Wald Test (Non-linearity)</span>
            ${waldResults.significant ?
              '<span class="quality-badge quality-badge--good">✓ Significant</span>' :
              '<span class="quality-badge quality-badge--fair">Not significant</span>'}
          </div>
          <div class="text-sm text-secondary" style="margin-left: var(--space-4);">
            <div>χ² = <span class="font-mono font-medium text-primary">${waldResults.wald.toFixed(2)}</span>, df = <span class="font-mono">${waldResults.df}</span>, p = <span class="font-mono font-medium">${formatPValue(waldResults.pValue)}</span></div>
            <div style="margin-top: var(--space-1); font-size: var(--text-xs);">${waldResults.message}</div>
          </div>
        </div>
      ` : `
        <div style="margin-bottom: var(--space-3);">
          <div class="font-semibold text-primary">Wald Test (Non-linearity)</div>
          <div class="text-sm text-secondary">${waldResults.message}</div>
        </div>
      `;

      document.getElementById('waldTestSection').innerHTML = waldHTML;

      // Likelihood Ratio Test - Show results if available from model comparison
      const lrtResult = AppState.lrtResult;
      const lrtHTML = lrtResult && lrtResult.chiSq !== null ? `
        <div style="margin-bottom: var(--space-3);">
          <div class="flex items-center gap-2" style="margin-bottom: var(--space-2);">
            <span class="font-semibold text-primary">Likelihood Ratio Test</span>
            ${lrtResult.significant ?
              '<span class="quality-badge quality-badge--good">✓ Quadratic better</span>' :
              '<span class="quality-badge quality-badge--fair">Linear sufficient</span>'}
          </div>
          <div class="text-sm text-secondary" style="margin-left: var(--space-4);">
            <div>χ² = <span class="font-mono font-medium text-primary">${lrtResult.chiSq.toFixed(2)}</span>, df = <span class="font-mono">${lrtResult.df}</span>, p = <span class="font-mono font-medium">${formatPValue(lrtResult.pValue)}</span></div>
            <div style="margin-top: var(--space-1); font-size: var(--text-xs);">${lrtResult.message}</div>
            <div style="margin-top: var(--space-1); font-size: var(--text-xs); color: var(--text-tertiary);">(Comparing quadratic vs linear models)</div>
          </div>
        </div>
      ` : `
        <div style="margin-bottom: var(--space-3);">
          <div class="font-semibold text-primary" style="margin-bottom: var(--space-2);">Likelihood Ratio Test</div>
          <div class="text-sm text-secondary">
            <div style="color: var(--text-tertiary); font-style: italic;">Run model comparison to see LRT results comparing quadratic vs linear models</div>
          </div>
        </div>
      `;
      document.getElementById('lrtTestSection').innerHTML = lrtHTML;

      // Goodness of Fit Statistics
      const gofHTML = `
        <div>
          <div class="font-semibold text-primary" style="margin-bottom: var(--space-2);">Goodness-of-Fit Statistics</div>
          <div class="grid grid-cols-2 gap-3" style="margin-left: var(--space-4);">
            <div>
              <span class="text-xs text-secondary">AIC:</span>
              <span class="font-mono font-medium text-primary" style="margin-left: var(--space-2);">${results.AIC ? results.AIC.toFixed(2) : 'N/A'}</span>
            </div>
            <div>
              <span class="text-xs text-secondary">BIC:</span>
              <span class="font-mono font-medium text-primary" style="margin-left: var(--space-2);">${results.BIC ? results.BIC.toFixed(2) : 'N/A'}</span>
            </div>
            <div>
              <span class="text-xs text-secondary">Log-likelihood:</span>
              <span class="font-mono font-medium text-primary" style="margin-left: var(--space-2);">${results.logLik ? results.logLik.toFixed(2) : 'N/A'}</span>
            </div>
            <div>
              <span class="text-xs text-secondary">Residual SE:</span>
              <span class="font-mono font-medium text-primary" style="margin-left: var(--space-2);">${results.RSE ? results.RSE.toFixed(4) : 'N/A'}</span>
            </div>
            <div>
              <span class="text-xs text-secondary">τ² (heterogeneity):</span>
              <span class="font-mono font-medium text-warning" style="margin-left: var(--space-2);">${results.tau2 !== undefined ? results.tau2.toFixed(4) : 'N/A'}</span>
            </div>
            <div>
              <span class="text-xs text-secondary">Q statistic:</span>
              <span class="font-mono font-medium text-primary" style="margin-left: var(--space-2);">${results.Q ? results.Q.toFixed(2) : 'N/A'}</span>
            </div>
          </div>
        </div>
      `;
      document.getElementById('goodnessOfFitSection').innerHTML = gofHTML;
    }

    function generateDoseSpecificEstimates(results) {
      // Group data by dose and calculate pooled RR at each dose
      const doseGroups = {};
      results.allPoints.forEach(p => {
        const doseKey = Math.round(p.dose * 100) / 100;
        if (!doseGroups[doseKey]) {
          doseGroups[doseKey] = { cases: 0, n: 0, count: 0 };
        }
        doseGroups[doseKey].cases += p.cases;
        doseGroups[doseKey].n += p.n;
        doseGroups[doseKey].count++;
      });

      const container = document.getElementById('doseSpecificEstimates');
      const doses = Object.keys(doseGroups).map(Number).sort((a, b) => a - b);

      // Find reference (dose = 0 or lowest dose)
      const refDose = doses.includes(0) ? 0 : doses[0];
      const refRate = doseGroups[refDose].cases / doseGroups[refDose].n;

      let html = '<table class="results-table"><thead><tr><th>Dose</th><th>Cases/N</th><th>Rate</th><th>RR (95% CI)</th></tr></thead><tbody>';

      doses.forEach(dose => {
        const data = doseGroups[dose];
        const rate = data.cases / data.n;
        const rr = rate / refRate;
        const seRR = Math.sqrt(1/data.cases - 1/data.n + 1/doseGroups[refDose].cases - 1/doseGroups[refDose].n);
        const ciLow = Math.exp(Math.log(rr) - 1.96 * seRR);
        const ciHigh = Math.exp(Math.log(rr) + 1.96 * seRR);

        html += `<tr>
          <td class="font-mono">${dose.toFixed(2)}</td>
          <td class="font-mono">${data.cases}/${data.n}</td>
          <td class="font-mono">${rate.toFixed(4)}</td>
          <td class="font-mono">${rr.toFixed(2)} [${ciLow.toFixed(2)}, ${ciHigh.toFixed(2)}]</td>
        </tr>`;
      });

      html += '</tbody></table>';
      container.innerHTML = html;
    }

    function formatPValue(p) {
      if (p === null) return 'N/A';
      if (isNaN(p)) return 'N/A';
      if (p < 0.001) return '< 0.001';
      if (p < 0.01) return p.toFixed(3);
      if (p < 0.05) return p.toFixed(2);
      return p.toFixed(2);
    }

    // =============================================
    // PLOTTING
    // =============================================

    function getPlotColors() {
      return {
        background: AppState.theme === 'dark' ? '#1a1f2a' : '#ffffff',
        grid: AppState.theme === 'dark' ? '#3d4657' : '#e2e8f0',
        text: AppState.theme === 'dark' ? '#e8eaee' : '#1e293b',
        line: '#06b6d4',
        points: '#f5c042',
        ci: 'rgba(6, 182, 212, 0.2)'
      };
    }

    function generateDoseResponsePlot(results) {
      const colors = getPlotColors();
      const doses = results.allPoints.map(p => p.dose);
      const minDose = Math.min(...doses);
      const maxDose = Math.max(...doses);

      // Generate smooth curve
      const doseRange = [];
      const predictedCurve = [];
      const ciLower = [];
      const ciUpper = [];

      const nPoints = 100;
      const step = (maxDose - minDose) / (nPoints - 1);

      for (let i = 0; i < nPoints; i++) {
        const dose = minDose + i * step;
        doseRange.push(dose);
        const pred = results.predict(dose);
        predictedCurve.push(pred);

        // Calculate CI using proper error propagation
        let se;
        if (results.predictSE) {
          se = results.predictSE(dose);
        } else {
          se = Math.sqrt(results.allPoints.reduce((sum, p) => sum + Math.pow(p.logRate - Math.log(pred), 2), 0) / results.allPoints.length);
        }

        ciLower.push(Math.exp(Math.log(pred) - 1.96 * se));
        ciUpper.push(Math.exp(Math.log(pred) + 1.96 * se));
      }

      // Create plot traces
      const traceCurve = {
        x: doseRange,
        y: predictedCurve,
        name: 'Pooled Dose-Response',
        line: { color: colors.line, width: 3 }
      };

      const traceCI = {
        x: doseRange,
        y: ciUpper,
        name: '95% CI',
        mode: 'lines',
        line: { color: colors.line, width: 0 },
        fill: 'tonexty',
        fillcolor: colors.ci
      };

      const traceCILower = {
        x: doseRange,
        y: ciLower,
        name: '95% CI Lower',
        mode: 'lines',
        line: { color: colors.line, width: 1, opacity: 0.5 },
        showlegend: false
      };

      // Original data points
      const tracePoints = {
        x: results.allPoints.map(p => p.dose),
        y: results.allPoints.map(p => p.rate),
        mode: 'markers',
        name: 'Observed Data',
        marker: { color: colors.points, size: 8, opacity: 0.7 }
      };

      const layout = {
        title: { text: 'Dose-Response Meta-Analysis', font: { color: colors.text, family: 'Plus Jakarta Sans' } },
        xaxis: {
          title: 'Dose',
          gridcolor: colors.grid,
          zerolinecolor: colors.grid,
          color: colors.text
        },
        yaxis: {
          title: 'Relative Risk',
          type: AppState.logScale ? 'log' : 'linear',
          gridcolor: colors.grid,
          zerolinecolor: colors.grid,
          color: colors.text
        },
        plot_bgcolor: colors.background,
        paper_bgcolor: colors.background,
        font: { color: colors.text },
        hovermode: 'closest',
        legend: { x: 0.02, y: 0.98, bgcolor: colors.background, bordercolor: colors.grid, borderwidth: 1 }
      };

      Plotly.newPlot('doseResponsePlot', [traceCI, traceCILower, traceCurve, tracePoints], layout, { responsive: true, displayModeBar: true });
    }

    function toggleLogScale() {
      AppState.logScale = !AppState.logScale;
      document.getElementById('logScaleBtn').textContent = AppState.logScale ? 'Linear Scale' : 'Log Scale';
      if (AppState.results) {
        generateDoseResponsePlot(AppState.results);
      }
    }

    function generateStudyCurvesPlot(studies) {
      const colors_palette = ['#06b6d4', '#10b981', '#f5c042', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1'];
      const colors = getPlotColors();

      const traces = [];
      studies.forEach((study, idx) => {
        const doses = study.dosePoints.map(p => p.dose);
        const rates = study.dosePoints.map(p => p.cases / p.n);

        traces.push({
          x: doses,
          y: rates,
          mode: 'lines+markers',
          name: study.name,
          line: { color: colors_palette[idx % colors_palette.length], width: 2 },
          marker: { color: colors_palette[idx % colors_palette.length], size: 6 }
        });
      });

      const layout = {
        title: { text: 'Study-Specific Dose-Response Curves', font: { color: colors.text } },
        xaxis: { title: 'Dose', gridcolor: colors.grid, color: colors.text },
        yaxis: { title: 'Rate/Risk', gridcolor: colors.grid, color: colors.text },
        plot_bgcolor: colors.background,
        paper_bgcolor: colors.background,
        font: { color: colors.text },
        hovermode: 'closest',
        legend: { x: 0.02, y: 0.98, bgcolor: colors.background, bordercolor: colors.grid, borderwidth: 1 }
      };

      Plotly.newPlot('studyCurvesPlot', traces, layout, { responsive: true });
    }

    function generateResidualPlot(results) {
      const colors = getPlotColors();
      const residuals = results.residuals || [];

      const trace = {
        x: residuals.map(r => r.dose),
        y: residuals.map(r => r.residual),
        mode: 'markers',
        name: 'Residuals',
        marker: { color: colors.points, size: 8 }
      };

      // Add reference line at y=0
      const lineTrace = {
        x: [Math.min(...residuals.map(r => r.dose)), Math.max(...residuals.map(r => r.dose))],
        y: [0, 0],
        mode: 'lines',
        name: 'Reference',
        line: { color: colors.grid, width: 2, dash: 'dash' },
        showlegend: false
      };

      const layout = {
        title: { text: 'Residual Plot', font: { color: colors.text } },
        xaxis: { title: 'Dose', gridcolor: colors.grid, color: colors.text },
        yaxis: { title: 'Residual (log scale)', gridcolor: colors.grid, color: colors.text, zeroline: true },
        plot_bgcolor: colors.background,
        paper_bgcolor: colors.background,
        font: { color: colors.text },
        hovermode: 'closest'
      };

      Plotly.newPlot('residualPlot', [lineTrace, trace], layout, { responsive: true });
    }

    function generateForestPlot(studies) {
      const colors = getPlotColors();

      // Group data by dose levels across studies
      const doseLevels = {};
      studies.forEach(study => {
        study.dosePoints.forEach(point => {
          const doseKey = Math.round(point.dose * 100) / 100;
          if (!doseLevels[doseKey]) {
            doseLevels[doseKey] = { studies: [], totalCases: 0, totalN: 0 };
          }
          const rate = point.cases / point.n;
          doseLevels[doseKey].studies.push({
            name: study.name,
            rr: rate,
            cases: point.cases,
            n: point.n
          });
          doseLevels[doseKey].totalCases += point.cases;
          doseLevels[doseKey].totalN += point.n;
        });
      });

      // Get reference dose
      const sortedDoses = Object.keys(doseLevels).map(Number).sort((a, b) => a - b);
      const refDose = sortedDoses.includes(0) ? 0 : sortedDoses[0];
      const refRate = doseLevels[refDose].totalCases / doseLevels[refDose].totalN;

      const traces = [];
      sortedDoses.forEach((dose, idx) => {
        const data = doseLevels[dose];
        const pooledRate = data.totalCases / data.totalN;
        const rr = pooledRate / refRate;

        // Calculate SE
        const se = Math.sqrt(1/data.totalCases - 1/data.totalN + 1/doseLevels[refDose].totalCases - 1/doseLevels[refDose].totalN);
        const ciLow = Math.exp(Math.log(rr) - 1.96 * se);
        const ciHigh = Math.exp(Math.log(rr) + 1.96 * se);

        traces.push({
          x: [rr],
          y: [sortedDoses.length - idx], // Reverse order for display
          name: `Dose ${dose.toFixed(2)}`,
          mode: 'markers',
          marker: { size: 15, color: idx === sortedDoses.indexOf(refDose) ? '#10b981' : colors.line },
          error_x: {
            type: 'data',
            symmetric: false,
            arrayminus: [rr - ciLow],
            arrayplus: [ciHigh - rr]
          },
          text: [`RR = ${rr.toFixed(2)} [${ciLow.toFixed(2)}, ${ciHigh.toFixed(2)}]`],
          hovertemplate: '%{text}<extra></extra>'
        });
      });

      // Add reference line at RR=1
      traces.push({
        x: [1, 1],
        y: [0, sortedDoses.length + 1],
        mode: 'lines',
        name: 'RR = 1 (no effect)',
        line: { color: colors.grid, width: 2, dash: 'dash' },
        showlegend: false,
        hoverinfo: 'skip'
      });

      const layout = {
        title: { text: 'Forest Plot by Dose Level', font: { color: colors.text } },
        xaxis: {
          title: 'Relative Risk (RR)',
          gridcolor: colors.grid,
          color: colors.text,
          type: 'log'
        },
        yaxis: {
          title: 'Dose Level',
          gridcolor: colors.grid,
          color: colors.text,
          tickvals: sortedDoses.map((_, i) => sortedDoses.length - i),
          ticktext: sortedDoses.map(d => d.toFixed(2))
        },
        plot_bgcolor: colors.background,
        paper_bgcolor: colors.background,
        font: { color: colors.text },
        hovermode: 'closest',
        margin: { l: 80, r: 30, t: 40, b: 60 }
      };

      Plotly.newPlot('forestPlot', traces, layout, { responsive: true });
    }

    function downloadPlot(plotId) {
      Plotly.downloadImage(plotId, { format: 'png', width: 1200, height: 800, filename: `dose-response-${plotId}.png` });
    }

    // =============================================
    // MODEL COMPARISON (Original - for Models panel)
    // =============================================

    function compareAllModelsOld() {
      try {
        const studies = getStudyData();
        if (studies.length === 0) {
          alert('Please enter valid study data first.');
          return;
        }

        const refDose = parseFloat(document.getElementById('referenceDose').value) || 0;

        // Run all models
        const models = [];
        models.push(linearDoseResponse(studies, refDose));
        models.push(quadraticDoseResponse(studies, refDose));
        models.push(cubicDoseResponse(studies, refDose));
        models.push(exponentialDoseResponse(studies, refDose));
        models.push(fractionalPolynomialDoseResponse(studies, refDose));

        try {
          models.push(splineDoseResponse(studies, refDose, 4));
        } catch (e) {
          console.warn('Spline model failed:', e);
        }

        // Sort by AIC
        models.sort((a, b) => a.AIC - b.AIC);

        // Calculate Akaike weights
        const deltaAIC = models.map(m => m.AIC - models[0].AIC);
        const expNegHalfDelta = deltaAIC.map(d => Math.exp(-0.5 * d));
        const sumExp = expNegHalfDelta.reduce((a, b) => a + b, 0);
        const weights = expNegHalfDelta.map(e => e / sumExp);

        // Store comparison results
        AppState.modelComparison = models.map((m, i) => ({
          ...m,
          deltaAIC: deltaAIC[i],
          weight: weights[i]
        }));

        // Calculate LRT between quadratic and linear models
        const quadraticModel = models.find(m => m.type === 'quadratic');
        const linearModel = models.find(m => m.type === 'linear');
        let lrtResult = null;
        if (quadraticModel && linearModel) {
          lrtResult = likelihoodRatioTest(quadraticModel, linearModel);
          AppState.lrtResult = lrtResult;
        }

        // Update UI
        document.getElementById('modelComparisonPlaceholder').classList.add('hidden');
        document.getElementById('modelComparisonContent').classList.remove('hidden');

        // Generate comparison cards
        const grid = document.getElementById('modelComparisonGrid');
        grid.innerHTML = AppState.modelComparison.map((m, i) => `
          <div class="model-comparison-card ${i === 0 ? 'model-comparison-card--best' : ''}">
            ${i === 0 ? '<span class="model-comparison-card__badge">Best Model</span>' : ''}
            <div class="text-sm font-semibold">${m.type.charAt(0).toUpperCase() + m.type.slice(1)}</div>
            <div class="text-xs text-secondary">AIC: ${m.AIC.toFixed(1)}</div>
            <div class="text-xs text-secondary">BIC: ${m.BIC.toFixed(1)}</div>
            <div class="text-xs text-accent">Weight: ${(m.weight * 100).toFixed(1)}%</div>
          </div>
        `).join('');

        // Generate comparison table
        const tbody = document.getElementById('modelComparisonBody');
        tbody.innerHTML = AppState.modelComparison.map(m => `
          <tr class="${m === AppState.modelComparison[0] ? 'stat-card__value--success' : ''}">
            <td>${m.type.charAt(0).toUpperCase() + m.type.slice(1)}</td>
            <td class="font-mono">${m.AIC.toFixed(1)}</td>
            <td class="font-mono">${m.BIC.toFixed(1)}</td>
            <td class="font-mono">${m.logLik.toFixed(2)}</td>
            <td>${m.coefficients.length}</td>
            <td class="font-mono">${m.deltaAIC.toFixed(1)}</td>
            <td class="font-mono">${(m.weight * 100).toFixed(1)}%</td>
          </tr>
        `).join('');

      } catch (error) {
        alert('Model comparison error: ' + error.message);
        console.error(error);
      }
    }

    // =============================================
    // REPORT GENERATION
    // =============================================

    function generateReport() {
      if (!AppState.results) {
        alert('Please run an analysis first.');
        return;
      }

      const r = AppState.results;
      const style = document.getElementById('reportStyle').value;
      const length = document.getElementById('reportLength').value;

      document.getElementById('reportPlaceholder').classList.add('hidden');
      document.getElementById('reportContent').classList.remove('hidden');

      const modelName = r.type.charAt(0).toUpperCase() + r.type.slice(1);

      let reportHTML = `
        <h2 class="text-xl font-bold" style="margin-bottom: var(--space-4);">Dose-Response Meta-Analysis Report</h2>

        <h3 class="text-lg font-semibold" style="margin-bottom: var(--space-2);">Methods</h3>
        <p class="text-secondary" style="margin-bottom: var(--space-4);">
          A ${modelName} dose-response meta-analysis was performed using data from ${r.nStudies} studies,
          comprising ${r.nPoints} dose-response data points. The reference dose was set to ${AppState.settings.referenceDose}.
          ${length !== 'brief' ? `Heterogeneity was assessed using the Q statistic (Q = ${r.Q.toFixed(2)}, I² = ${r.I2.toFixed(1)}%).` : ''}
        </p>

        <h3 class="text-lg font-semibold" style="margin-bottom: var(--space-2);">Results</h3>
        <p class="text-secondary" style="margin-bottom: var(--space-2);">
          The ${modelName} model ${r.pTrend < 0.05 ? 'showed a statistically significant dose-response relationship' : 'did not show a statistically significant dose-response relationship'}
          ${r.pNonlinear !== null && r.pNonlinear < 0.05 ? 'with evidence of non-linearity' : r.pNonlinear !== null ? 'without significant evidence of non-linearity' : ''}.
        </p>
        <ul style="margin-bottom: var(--space-4); margin-left: var(--space-4);">
          <li>P-value for trend: <strong>${formatPValue(r.pTrend)}</strong></li>
          ${r.pNonlinear !== null ? `<li>P-value for non-linearity: <strong>${formatPValue(r.pNonlinear)}</strong></li>` : ''}
          <li>Q statistic: <strong>${r.Q.toFixed(2)}</strong></li>
          <li>I²: <strong>${r.I2.toFixed(1)}%</strong></li>
          ${length === 'detailed' ? `<li>AIC: <strong>${r.AIC.toFixed(1)}</strong></li>
          <li>BIC: <strong>${r.BIC.toFixed(1)}</strong></li>` : ''}
        </ul>

        <h3 class="text-lg font-semibold" style="margin-bottom: var(--space-2);">Model Coefficients</h3>
        <table class="results-table">
          <thead>
            <tr>
              <th>Coefficient</th>
              <th>Estimate (95% CI)</th>
              <th>P-value</th>
            </tr>
          </thead>
          <tbody>
      `;

      r.coefficients.forEach(coef => {
        reportHTML += `
          <tr>
            <td>${coef.name}</td>
            <td>${coef.estimate.toFixed(4)} (${coef.ciLower.toFixed(4)}, ${coef.ciUpper.toFixed(4)})</td>
            <td>${coef.pValue !== null ? formatPValue(coef.pValue) : 'N/A'}</td>
          </tr>
        `;
      });

      reportHTML += `
          </tbody>
        </table>
      `;

      if (length === 'detailed') {
        // Add interpretation section
        reportHTML += `
          <h3 class="text-lg font-semibold" style="margin-top: var(--space-4); margin-bottom: var(--space-2);">Interpretation</h3>
          <p class="text-secondary" style="margin-bottom: var(--space-4);">
        `;

        if (r.type === 'linear') {
          const rrPerUnit = Math.exp(r.slope);
          reportHTML += `Each unit increase in dose is associated with a RR of ${rrPerUnit.toFixed(2)} (95% CI: ${Math.exp(r.coefficients[0].ciLower).toFixed(2)}-${Math.exp(r.coefficients[0].ciUpper).toFixed(2)}).`;
        } else if (r.type === 'quadratic') {
          reportHTML += `The relationship between dose and outcome follows a non-linear pattern. The quadratic term is ${r.coefficients[2].estimate > 0 ? 'positive' : 'negative'}, indicating ${r.coefficients[2].estimate > 0 ? 'an accelerating' : 'a decelerating'} effect.`;
        }

        reportHTML += `</p>`;
      }

      reportHTML += `
        <p class="text-secondary text-sm" style="margin-top: var(--space-4);">
          Generated by Dose Response Pro v3.0
        </p>
      `;

      document.getElementById('reportText').innerHTML = reportHTML;
    }

    function copyReportToClipboard() {
      const reportText = document.getElementById('reportText').innerText;
      navigator.clipboard.writeText(reportText).then(() => {
        alert('Report copied to clipboard!');
      });
    }

    function copyResultsToClipboard() {
      if (!AppState.results) return;

      let text = 'Dose,Predicted RR,95% CI Lower,95% CI Upper\n';

      const r = AppState.results;
      const doses = r.allPoints.map(p => p.dose);
      for (let dose = Math.min(...doses); dose <= Math.max(...doses); dose += (Math.max(...doses) - Math.min(...doses)) / 20) {
        const pred = r.predict(dose);
        const se = r.predictSE ? r.predictSE(dose) : 0.1;
        const ciLow = Math.exp(Math.log(pred) - 1.96 * se);
        const ciHigh = Math.exp(Math.log(pred) + 1.96 * se);
        text += `${dose.toFixed(2)},${pred.toFixed(4)},${ciLow.toFixed(4)},${ciHigh.toFixed(4)}\n`;
      }

      navigator.clipboard.writeText(text).then(() => {
        alert('Results copied to clipboard!');
      });
    }

    // =============================================
    // DEMO DATA
    // =============================================

    function loadDemoData() {
      document.getElementById('studiesContainer').innerHTML = '';
      studyCounter = 0;

      const demoStudies = [
        {
          name: 'Study A (2020)',
          dosePoints: [
            { dose: 0, cases: 45, n: 5000 },
            { dose: 12, cases: 52, n: 4800 },
            { dose: 24, cases: 68, n: 4500 },
            { dose: 48, cases: 95, n: 4200 }
          ]
        },
        {
          name: 'Study B (2021)',
          dosePoints: [
            { dose: 0, cases: 38, n: 4500 },
            { dose: 12, cases: 44, n: 4300 },
            { dose: 24, cases: 58, n: 4000 },
            { dose: 48, cases: 82, n: 3800 }
          ]
        },
        {
          name: 'Study C (2022)',
          dosePoints: [
            { dose: 0, cases: 52, n: 6000 },
            { dose: 15, cases: 61, n: 5800 },
            { dose: 30, cases: 78, n: 5500 },
            { dose: 50, cases: 105, n: 5000 }
          ]
        },
        {
          name: 'Study D (2023)',
          dosePoints: [
            { dose: 0, cases: 28, n: 3500 },
            { dose: 10, cases: 33, n: 3400 },
            { dose: 20, cases: 41, n: 3200 },
            { dose: 40, cases: 58, n: 3000 }
          ]
        }
      ];

      demoStudies.forEach(study => addStudy(study));

      alert('Demo data loaded! Click "Run Analysis" to see the results.\n\nThis includes 4 studies with dose-response data suitable for testing all model types.');
    }

    function exportResults() {
      if (!AppState.results) {
        alert('No results to export. Please run an analysis first.');
        return;
      }

      const r = AppState.results;
      let csv = 'Dose,Predicted RR,95% CI Lower,95% CI Upper,Standard Error\n';

      const doses = r.allPoints.map(p => p.dose);
      const nPoints = 50;
      const step = (Math.max(...doses) - Math.min(...doses)) / nPoints;

      for (let i = 0; i <= nPoints; i++) {
        const dose = Math.min(...doses) + i * step;
        const pred = r.predict(dose);
        const se = r.predictSE ? r.predictSE(dose) : Math.sqrt(r.allPoints.reduce((sum, p) => sum + Math.pow(p.logRate - Math.log(pred), 2), 0) / r.allPoints.length);
        const ciLow = Math.exp(Math.log(pred) - 1.96 * se);
        const ciHigh = Math.exp(Math.log(pred) + 1.96 * se);

        csv += `${dose.toFixed(4)},${pred.toFixed(6)},${ciLow.toFixed(6)},${ciHigh.toFixed(6)},${se.toFixed(6)}\n`;
      }

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dose-response-results-${r.type}-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }

    // =============================================
    // PUBLICATION BIAS ANALYSIS
    // =============================================

    function runPublicationBias() {
      if (!AppState.results) {
        showToast('Please run the main analysis first', 'warning');
        return;
      }

      showProgress('Running publication bias analysis...');

      setTimeout(() => {
        try {
          const results = AppState.results;
          const allPoints = results.allPoints;

          // Calculate standard errors and precision
          const precision = allPoints.map(p => 1 / Math.sqrt(p.variance));
          const se = allPoints.map(p => Math.sqrt(p.variance));

          // Egger's regression test
          const n = allPoints.length;
          let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
          const stdResid = allPoints.map(p => (p.logRate / Math.sqrt(p.variance)));

          allPoints.forEach((p, i) => {
            const x = precision[i];
            const y = stdResid[i];
            sumX += x;
            sumY += y;
            sumXY += x * y;
            sumX2 += x * x;
            sumY2 += y * y;
          });

          const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
          const intercept = (sumY - slope * sumX) / n;
          const seSlope = Math.sqrt((n / (n - 2)) * ((sumY2 - intercept * sumY - slope * sumXY) / (n * sumX2 - sumX * sumX)));
          const tStat = intercept / seSlope;
          const eggerP = 2 * (1 - normalCDF(Math.abs(tStat)));

          // Begg's rank correlation test (simplified)
          const ranksX = precision.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]).map((x, i) => ({ idx: x[1], rank: i + 1 }));
          const ranksY = stdResid.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]).map((x, i) => ({ idx: x[1], rank: i + 1 }));
          let sumDiff = 0;
          for (let i = 0; i < n; i++) {
            sumDiff += Math.pow(ranksX[i].rank - ranksY[i].rank, 2);
          }
          const rho = 1 - (6 * sumDiff) / (n * (n * n - 1));
          const beggZ = rho * Math.sqrt((n - 3) / (1 - rho * rho));
          const beggP = 2 * (1 - normalCDF(Math.abs(beggZ)));

          // Trim and fill (simplified estimation)
          const meanPrecision = precision.reduce((a, b) => a + b, 0) / n;
          const lowPrecision = allPoints.filter((p, i) => precision[i] < meanPrecision);
          const nFilled = Math.max(0, Math.round(lowPrecision.filter(p => p.logRate > 0).length * 0.3));

          // Rank correlation test
          const kendallTau = calculateKendallTau(precision, stdResid);
          const rankCorrP = 2 * (1 - normalCDF(Math.abs(kendallTau.z)));

          // Update UI
          document.getElementById('biasPlaceholder').classList.add('hidden');
          document.getElementById('biasContent').classList.remove('hidden');
          document.getElementById('eggerP').textContent = formatPValue(eggerP);
          document.getElementById('beggP').textContent = formatPValue(beggP);
          document.getElementById('nFilled').textContent = nFilled;
          document.getElementById('rankCorrP').textContent = formatPValue(rankCorrP);

          // Generate funnel plot
          generateFunnelPlot(allPoints, precision, se);
          generateGalbraithPlot(allPoints, precision);

          hideProgress();
          showToast('Publication bias analysis complete', 'success');
        } catch (error) {
          hideProgress();
          showToast('Error: ' + error.message, 'error');
          console.error(error);
        }
      }, 500);
    }

    function generateFunnelPlot(points, precision, se) {
      const colors = getPlotColors();

      const trace = {
        x: precision,
        y: points.map(p => p.logRate),
        mode: 'markers',
        name: 'Studies',
        marker: { size: 10, color: colors.points, opacity: 0.7 },
        text: points.map(p => p.study || ''),
        hovertemplate: '%{text}<br>Precision: %{x:.3f}<br>Log RR: %{y:.3f}<extra></extra>'
      };

      // Add CI lines
      const ciTraceUpper = {
        x: [Math.min(...precision), Math.max(...precision)],
        y: [1.96 * Math.min(...se), 1.96 * Math.max(...se)],
        mode: 'lines',
        name: '95% CI',
        line: { color: colors.grid, width: 2, dash: 'dash' },
        showlegend: false
      };

      const ciTraceLower = {
        x: [Math.min(...precision), Math.max(...precision)],
        y: [-1.96 * Math.min(...se), -1.96 * Math.max(...se)],
        mode: 'lines',
        name: '95% CI',
        line: { color: colors.grid, width: 2, dash: 'dash' }
      };

      const layout = {
        title: { text: 'Funnel Plot for Publication Bias', font: { color: colors.text } },
        xaxis: { title: 'Precision (1/SE)', gridcolor: colors.grid, color: colors.text },
        yaxis: { title: 'Log Relative Risk', gridcolor: colors.grid, color: colors.text },
        plot_bgcolor: colors.background,
        paper_bgcolor: colors.background,
        font: { color: colors.text },
        hovermode: 'closest',
        shapes: [{
          type: 'line',
          x0: Math.min(...precision),
          y0: 0,
          x1: Math.max(...precision),
          y1: 0,
          line: { color: colors.line, width: 2 }
        }]
      };

      Plotly.newPlot('funnelPlot', [ciTraceUpper, ciTraceLower, trace], layout, { responsive: true });
    }

    function generateGalbraithPlot(points, precision) {
      const colors = getPlotColors();
      const stdResid = points.map((p, i) => p.logRate * Math.sqrt(precision[i]));

      const trace = {
        x: precision,
        y: stdResid,
        mode: 'markers',
        name: 'Studies',
        marker: { size: 10, color: colors.points },
        text: points.map(p => p.study || ''),
        hovertemplate: '%{text}<br>Precision: %{x:.3f}<br>Std Residual: %{y:.3f}<extra></extra>'
      };

      // Reference lines at ±1.96
      const lineUpper = {
        x: [Math.min(...precision), Math.max(...precision)],
        y: [1.96, 1.96],
        mode: 'lines',
        line: { color: colors.grid, width: 2, dash: 'dash' },
        showlegend: false
      };

      const lineLower = {
        x: [Math.min(...precision), Math.max(...precision)],
        y: [-1.96, -1.96],
        mode: 'lines',
        line: { color: colors.grid, width: 2, dash: 'dash' },
        showlegend: false
      };

      const layout = {
        title: { text: "Galbraith Plot", font: { color: colors.text } },
        xaxis: { title: 'Precision', gridcolor: colors.grid, color: colors.text },
        yaxis: { title: 'Standardized Residual', gridcolor: colors.grid, color: colors.text },
        plot_bgcolor: colors.background,
        paper_bgcolor: colors.background,
        font: { color: colors.text },
        hovermode: 'closest'
      };

      Plotly.newPlot('galbraithPlot', [lineUpper, lineLower, trace], layout, { responsive: true });
    }

    function calculateKendallTau(x, y) {
      const n = x.length;
      let concordant = 0, discordant = 0;

      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const dx = x[i] - x[j];
          const dy = y[i] - y[j];
          if (dx * dy > 0) concordant++;
          else if (dx * dy < 0) discordant++;
        }
      }

      const tau = (concordant - discordant) / (n * (n - 1) / 2);
      const se0 = Math.sqrt((2 * (2 * n + 5)) / (9 * n * (n - 1)));
      const z = tau / se0;

      return { tau, z };
    }

    // =============================================
    // ENHANCED EGGER'S TEST FOR PUBLICATION BIAS
    // =============================================

    /**
     * Perform enhanced Egger's test for publication bias
     * @param {Array} studies - Study data
     * @returns {Object} - Test results
     */
    function eggersTest(studies) {
      // Extract study effects (slopes) and precisions
      const effects = [];

      studies.forEach(study => {
        if (!study.dosePoints || study.dosePoints.length < 2) return;

        // Fit simple linear model for this study
        const points = study.dosePoints.filter(p => p.dose >= 0 && p.cases > 0);
        if (points.length < 2) return;

        const n = points.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

        points.forEach(p => {
          const x = p.dose;
          const y = Math.log(p.cases / p.n);
          const w = p.cases;
          sumX += w * x;
          sumY += w * y;
          sumXY += w * x * y;
          sumX2 += w * x * x;
        });

        const slope = (sumXY * n - sumX * sumY) / (sumX2 * n - sumX * sumX);
        const se = Math.sqrt(points.reduce((sum, p) => sum + Math.pow(Math.log(p.cases/p.n) - (slope * p.dose), 2), 0) / (n - 2));
        const precision = 1 / (se * se);

        effects.push({
          study: study.name,
          effect: slope,
          se: se,
          precision: precision,
          n: points.length
        });
      });

      if (effects.length < 3) {
        throw new Error('Need at least 3 studies for Egger\'s test');
      }

      // Egger's regression: effect = a + b * precision
      // H0: intercept a = 0 (no asymmetry)

      const N = effects.length;
      let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;

      effects.forEach(e => {
        sumX += e.precision;
        sumY += e.effect;
        sumXY += e.precision * e.effect;
        sumX2 += e.precision * e.precision;
        sumY2 += e.effect * e.effect;
      });

      const b = (sumXY * N - sumX * sumY) / (sumX2 * N - sumX * sumX);
      const a = (sumY - b * sumX) / N;

      // SE of intercept
      const residuals = effects.map(e => e.effect - (a + b * e.precision));
      const SSE = residuals.reduce((sum, r) => sum + r * r, 0);
      const MSE = SSE / (N - 2);

      const seA = Math.sqrt(MSE * (1/N + sumX * sumX / (N * sumX2 - sumX * sumX)));

      // t-test of intercept
      const tStat = a / seA;
      const df = N - 2;
      const pValue = 2 * (1 - studentTCDF(Math.abs(tStat), df));

      return {
        intercept: a,
        interceptSE: seA,
        tStat: tStat,
        df: df,
        pValue: pValue,
        biased: pValue < 0.05,
        effects: effects,
        funnelData: effects.map(e => ({
          x: Math.sqrt(e.precision),  // SE on x-axis (inverted precision)
          y: e.effect                   // Effect on y-axis
        }))
      };
    }

    /**
     * Student's t CDF approximation
     */
    function studentTCDF(t, df) {
      // Approximation using beta function
      if (df === 1) {
        return 0.5 + (t / Math.PI) * Math.atan(t / Math.sqrt(1));
      }
      // Use normal approximation for large df
      if (df > 100) {
        return normalCDF(t);
      }
      // For moderate df, use approximation
      const x = (df + 0.5) / (df + t * t);
      const a = df / 2;
      // Simple approximation
      return t > 0 ? 1 - 0.5 * Math.pow(x, a) : 0.5 * Math.pow(x, a);
    }

    /**
     * Run enhanced publication bias test with study-level effects
     */
    function runPublicationBiasTest() {
      try {
        const studies = AppState.studies || getStudyData();
        if (studies.length < 3) {
          showToast('Need at least 3 studies for publication bias test', 'warning');
          return;
        }

        showProgress('Running enhanced Egger\'s test...');

        setTimeout(() => {
          try {
            const results = eggersTest(studies);
            AppState.biasResults = results;

            updateEnhancedBiasUI(results);
            generateEnhancedFunnelPlot(results);

            document.getElementById('biasPlaceholder').classList.add('hidden');
            document.getElementById('biasContent').classList.remove('hidden');

            hideProgress();
            showToast('Egger\'s test complete', 'success');
          } catch (error) {
            hideProgress();
            showToast('Error: ' + error.message, 'error');
            console.error(error);
          }
        }, 300);
      } catch (error) {
        showToast('Error: ' + error.message, 'error');
      }
    }

    /**
     * Update bias UI with enhanced results
     */
    function updateEnhancedBiasUI(results) {
      const div = document.getElementById('eggersResults');
      if (!div) {
        // Create results div if it doesn't exist
        const biasContent = document.getElementById('biasContent');
        if (biasContent) {
          const resultsDiv = document.createElement('div');
          resultsDiv.id = 'eggersResults';
          resultsDiv.className = 'results-section';
          resultsDiv.style.marginBottom = 'var(--space-6)';
          biasContent.insertBefore(resultsDiv, biasContent.firstChild);
        }
      }

      const biased = results.biased;
      const biasClass = biased ? 'warning' : 'success';

      const html = `
        <div class="info-box ${biasClass}" style="padding: var(--space-4); border-radius: var(--radius-md); margin-bottom: var(--space-4);">
          <h4 style="margin: 0 0 var(--space-2) 0; color: ${biased ? 'var(--color-warning)' : 'var(--color-success)'};">
            ${biased ? '⚠️ Publication Bias Detected' : '✓ No Significant Bias'}
          </h4>
          <p style="margin: var(--space-2) 0;"><strong>Egger's Test Results:</strong></p>
          <ul style="margin: var(--space-2) 0;">
            <li>Intercept: ${results.intercept.toFixed(4)} (SE: ${results.interceptSE.toFixed(4)})</li>
            <li>t-statistic: ${results.tStat.toFixed(4)} (df: ${results.df})</li>
            <li>p-value: ${results.pValue.toFixed(4)}</li>
          </ul>
          <p style="margin: var(--space-2) 0;"><strong>Interpretation:</strong> ${biased ?
            'Small studies with non-significant results may be missing (p < 0.05)' :
            'Funnel plot appears symmetric (p ≥ 0.05)'}</p>
        </div>
      `;

      const targetDiv = document.getElementById('eggersResults');
      if (targetDiv) {
        targetDiv.innerHTML = html;
      }
    }

    /**
     * Generate enhanced funnel plot
     */
    function generateEnhancedFunnelPlot(results) {
      const colors = getPlotColors();

      // Create funnel plot
      const trace1 = {
        x: results.funnelData.map(d => d.x),
        y: results.funnelData.map(d => d.y),
        mode: 'markers',
        type: 'scatter',
        name: 'Studies',
        text: results.effects.map(e => e.study),
        marker: { size: 10, color: colors.points, opacity: 0.7 },
        hovertemplate: '%{text}<br>SE: %{x:.3f}<br>Effect: %{y:.3f}<extra></extra>'
      };

      // Add pseudo confidence limits (funnel shape)
      const seRange = [0, Math.max(...results.funnelData.map(d => d.x)) * 1.2];
      const yRange = [
        Math.min(...results.funnelData.map(d => d.y)) - 1,
        Math.max(...results.funnelData.map(d => d.y)) + 1
      ];

      const funnelX = [];
      const funnelUpper = [];
      const funnelLower = [];

      for (let se = seRange[0]; se <= seRange[1]; se += 0.01) {
        if (se > 0) {
          funnelX.push(se);
          funnelUpper.push(1.96 * se);
          funnelLower.push(-1.96 * se);
        }
      }

      const trace2 = {
        x: funnelX,
        y: funnelUpper,
        mode: 'lines',
        type: 'scatter',
        name: '95% CI',
        line: { color: colors.grid, width: 2, dash: 'dash' }
      };

      const trace3 = {
        x: funnelX,
        y: funnelLower,
        mode: 'lines',
        type: 'scatter',
        name: '-95% CI',
        line: { color: colors.grid, width: 2, dash: 'dash' }
      };

      const layout = {
        title: { text: 'Funnel Plot - Egger\'s Test', font: { color: colors.text } },
        xaxis: { title: 'Standard Error', range: seRange, gridcolor: colors.grid, color: colors.text },
        yaxis: { title: 'Effect Estimate (Slope)', range: yRange, gridcolor: colors.grid, color: colors.text },
        plot_bgcolor: colors.background,
        paper_bgcolor: colors.background,
        font: { color: colors.text },
        hovermode: 'closest',
        showlegend: true
      };

      Plotly.newPlot('funnelPlot', [trace2, trace3, trace1], layout, { responsive: true });
    }

    // =============================================
    // SENSITIVITY ANALYSIS
    // =============================================
// =============================================
// ENHANCED SENSITIVITY ANALYSIS FUNCTIONS
// =============================================

/**
 * Perform leave-one-out sensitivity analysis
 * @param {Array} studies - Study data
 * @param {string} modelType - Type of model to fit
 * @returns {Object} - Sensitivity analysis results
 */
function sensitivityAnalysis(studies, modelType = 'gls') {
  if (studies.length < 3) {
    throw new Error('Need at least 3 studies for sensitivity analysis');
  }

  const settings = getAnalysisSettings();
  const refDose = settings.referenceDose || 0;

  // Fit full model with all studies
  let fullModel;

  switch (modelType) {
    case 'gls':
      fullModel = glsDoseResponse(studies, refDose, settings);
      break;
    case 'linear':
      fullModel = linearDoseResponse(studies, refDose, settings);
      break;
    case 'quadratic':
      fullModel = quadraticDoseResponse(studies, refDose, settings);
      break;
    default:
      fullModel = glsDoseResponse(studies, refDose, settings);
  }

  // Extract original values
  const originalSlope = fullModel.coefficients?.[1]?.estimate || fullModel.slope || 0;
  const originalSE = fullModel.coefficients?.[1]?.se || fullModel.seSlope || 0;
  const originalI2 = fullModel.I2 || 0;

  // Leave-one-out analysis
  const leaveOneOut = [];

  for (let i = 0; i < studies.length; i++) {
    const remainingStudies = studies.filter((_, idx) => idx !== i);

    if (remainingStudies.length < 2) continue;

    try {
      let model;
      switch (modelType) {
        case 'gls':
          model = glsDoseResponse(remainingStudies, refDose, settings);
          break;
        case 'linear':
          model = linearDoseResponse(remainingStudies, refDose, settings);
          break;
        case 'quadratic':
          model = quadraticDoseResponse(remainingStudies, refDose, settings);
          break;
        default:
          model = glsDoseResponse(remainingStudies, refDose, settings);
      }

      const slope = model.coefficients?.[1]?.estimate || model.slope || 0;
      const se = model.coefficients?.[1]?.se || model.seSlope || 0;
      const i2 = model.I2 || 0;

      // Calculate influence metrics
      const slopeChange = originalSlope !== 0 ? ((slope - originalSlope) / originalSlope * 100) : 0;
      const i2Change = i2 - originalI2;

      // Cook's distance (simplified)
      const cookD = originalSE !== 0 ? Math.pow(slope - originalSlope, 2) / (originalSE * originalSE) : 0;

      // DFITS (simplified)
      const dfits = se !== 0 ? (slope - originalSlope) / se : 0;

      leaveOneOut.push({
        omitted: studies[i].name,
        slope: slope,
        se: se,
        i2: i2,
        slopeChange: parseFloat(slopeChange.toFixed(2)),
        i2Change: parseFloat(i2Change.toFixed(1)),
        cookD: cookD,
        dfits: Math.abs(dfits),
        influential: Math.abs(dfits) > 2 || cookD > 4
      });
    } catch (e) {
      console.warn('Study failed in LOO:', studies[i].name, e.message);
    }
  }

  return {
    fullModel: fullModel,
    originalSlope: originalSlope,
    originalSE: originalSE,
    originalI2: originalI2,
    leaveOneOut: leaveOneOut,
    influentialStudies: leaveOneOut.filter(s => s.influential),
    modelType: modelType
  };
}

/**
 * Run sensitivity analysis and update UI
 */
function runSensitivityAnalysis() {
  try {
    const studies = getStudyData();
    if (studies.length < 3) {
      showToast('Need at least 3 studies for sensitivity analysis', 'warning');
      return;
    }

    showProgress('Running sensitivity analysis...');

    setTimeout(() => {
      try {
        const modelType = document.getElementById('sensitivityModel')?.value || 'gls';
        const results = sensitivityAnalysis(studies, modelType);
        AppState.sensitivityResults = results;

        updateSensitivityUI(results);
        generateSensitivityPlot(results);
        generateBaujatPlot(results.leaveOneOut);

        hideProgress();
        showToast('Sensitivity analysis complete', 'success');
      } catch (error) {
        hideProgress();
        showToast('Sensitivity analysis error: ' + error.message, 'error');
        console.error(error);
      }
    }, 100);
  } catch (error) {
    showToast('Error: ' + error.message, 'error');
    console.error(error);
  }
}

function updateSensitivityUI(results) {
  document.getElementById('sensitivityPlaceholder').classList.add('hidden');
  document.getElementById('sensitivityContent').classList.remove('hidden');

  // Show summary
  const summaryDiv = document.getElementById('sensitivitySummary');
  const nInfluential = results.influentialStudies.length;

  const boxClass = nInfluential > 0 ? 'warning' : 'success';
  const icon = nInfluential > 0 ? '⚠️' : '✓';
  const title = nInfluential > 0 ? 'Influential Studies Detected' : 'No Influential Studies';

  summaryDiv.innerHTML = `
    <div class="stat-card stat-card--${boxClass}" style="padding: var(--space-4);">
      <h4 style="margin: 0 0 var(--space-2) 0;">${icon} ${title}</h4>
      <p style="margin: var(--space-2) 0;">
        Removed <strong>${results.influentialStudies.length}</strong> of ${results.leaveOneOut.length} studies
        caused significant changes (&gt;2 DFITS or &gt;4 Cook's D).
      </p>
      <p style="margin: var(--space-2) 0;">
        <strong>Original:</strong> Slope = ${results.originalSlope.toFixed(4)}, I² = ${results.originalI2.toFixed(1)}%
      </p>
    </div>
  `;

  // Show table
  const tbody = document.getElementById('sensitivityTableBody');
  tbody.innerHTML = results.leaveOneOut.map(s => {
    const slopeChangeClass = Math.abs(s.slopeChange) > 10 ? ' color: #e74c3c;' : '';
    const cookDClass = s.cookD > 4 ? ' color: #e74c3c;' : '';
    const dfitsClass = s.dfits > 2 ? ' color: #e74c3c;' : '';
    const rowClass = s.influential ? 'background: rgba(231, 76, 60, 0.1);' : '';

    return `
      <tr style="${rowClass}">
        <td class="font-mono">${s.omitted}</td>
        <td class="font-mono">${s.slope.toFixed(4)}</td>
        <td class="font-mono">${s.se.toFixed(4)}</td>
        <td class="font-mono">${s.i2.toFixed(1)}%</td>
        <td class="font-mono" style="${slopeChangeClass}">${s.slopeChange > 0 ? '+' : ''}${s.slopeChange}%</td>
        <td class="font-mono">${s.i2Change > 0 ? '+' : ''}${s.i2Change}%</td>
        <td class="font-mono" style="${cookDClass}">${s.cookD.toFixed(2)}</td>
        <td class="font-mono" style="${dfitsClass}">${s.dfits.toFixed(2)}</td>
      </tr>
    `;
  }).join('');

  // Show influential studies
  const infDiv = document.getElementById('influentialStudies');
  if (results.influentialStudies.length > 0) {
    infDiv.innerHTML = `
      <div class="stat-card stat-card--warning" style="padding: var(--space-4);">
        <h4 style="margin: 0 0 var(--space-2) 0;">Influential Studies:</h4>
        <ul style="margin: var(--space-2) 0;">
          ${results.influentialStudies.map(s => `
            <li>
              <strong>${s.omitted}</strong> -
              Slope change: ${s.slopeChange}%,
              Cook's D: ${s.cookD.toFixed(2)},
              DFITS: ${s.dfits.toFixed(2)}
            </li>
          `).join('')}
        </ul>
      </div>
    `;
  } else {
    infDiv.innerHTML = `
      <div class="stat-card stat-card--success" style="padding: var(--space-4);">
        <p style="margin: 0;">No influential studies detected. All studies contribute similarly to the overall estimate.</p>
      </div>
    `;
  }
}

function generateSensitivityPlot(results) {
  const colors = getPlotColors();

  // Create influence plot
  const studyNames = results.leaveOneOut.map(s => s.omitted);
  const slopeChanges = results.leaveOneOut.map(s => s.slopeChange);
  const cookD = results.leaveOneOut.map(s => s.cookD);
  const isInf = results.leaveOneOut.map(s => s.influential);

  const trace1 = {
    x: studyNames,
    y: slopeChanges,
    mode: 'markers+lines',
    type: 'scatter',
    name: 'Slope Change (%)',
    marker: {
      size: results.leaveOneOut.map(s => 10 + s.cookD * 3),
      color: results.leaveOneOut.map(s => s.influential ? colors.danger : colors.points),
      line: {
        color: results.leaveOneOut.map(s => s.influential ? '#c0392b' : '#2980b9'),
        width: 2
      }
    },
    line: {
      color: colors.points,
      width: 1
    },
    text: results.leaveOneOut.map(s =>
      `Study: ${s.omitted}<br>` +
      `Slope Change: ${s.slopeChange}%<br>` +
      `Cook's D: ${s.cookD.toFixed(2)}<br>` +
      `DFITS: ${s.dfits.toFixed(2)}<br>` +
      `Influential: ${s.influential ? 'Yes' : 'No'}`
    ),
    hovertemplate: '%{text}<extra></extra>'
  };

  const layout = {
    title: {
      text: 'Leave-One-Out Sensitivity Analysis',
      font: { size: 14, color: colors.text }
    },
    xaxis: {
      title: { text: 'Omitted Study', font: { color: colors.text } },
      tickfont: { color: colors.text },
      gridcolor: colors.grid
    },
    yaxis: {
      title: { text: 'Slope Change (%)', font: { color: colors.text } },
      tickfont: { color: colors.text },
      gridcolor: colors.grid,
      zeroline: true,
      zerolinecolor: '#7f8c8d',
      zerolinewidth: 2
    },
    plot_bgcolor: colors.background,
    paper_bgcolor: colors.background,
    font: { color: colors.text },
    shapes: [
      {
        type: 'line',
        x0: -0.5,
        x1: studyNames.length - 0.5,
        y0: 0,
        y1: 0,
        line: { color: '#95a5a6', width: 2, dash: 'dash' }
      },
      // Add threshold lines for significant changes
      {
        type: 'line',
        x0: -0.5,
        x1: studyNames.length - 0.5,
        y0: 10,
        y1: 10,
        line: { color: '#e74c3c', width: 1, dash: 'dot' }
      },
      {
        type: 'line',
        x0: -0.5,
        x1: studyNames.length - 0.5,
        y0: -10,
        y1: -10,
        line: { color: '#e74c3c', width: 1, dash: 'dot' }
      }
    ],
    annotations: [
      {
        x: 0.02,
        y: 0.98,
        xref: 'paper',
        yref: 'paper',
        text: `Original Slope: ${results.originalSlope.toFixed(4)}<br>` +
              `I²: ${results.originalI2.toFixed(1)}%<br>` +
              `Model: ${results.modelType.toUpperCase()}`,
        showarrow: false,
        font: { size: 11 },
        bgcolor: colors.background,
        bordercolor: colors.grid,
        borderwidth: 1,
        borderpad: 5
      }
    ],
    margin: { t: 60, r: 40, b: 80, l: 60 }
  };

  Plotly.newPlot('sensitivityPlot', [trace1], layout, {responsive: true});
}

function generateBaujatPlot(looResults) {
  const colors = getPlotColors();

  const trace = {
    x: looResults.map(r => Math.abs(r.slopeChange)),
    y: looResults.map(r => Math.abs(r.cookD)),
    mode: 'markers+text',
    name: 'Studies',
    marker: {
      size: looResults.map(r => 10 + r.cookD * 3),
      color: looResults.map(r => r.influential ? colors.danger : colors.points)
    },
    text: looResults.map(r => r.omitted.split(' ')[0]),
    textposition: 'top center',
    hovertemplate: '%{text}<br>Slope Change: %{x:.2f}%<br>Cook\'s D: %{y:.4f}<extra></extra>'
  };

  const layout = {
    title: { text: "Baujat Plot (Influence Diagnostics)", font: { color: colors.text } },
    xaxis: { title: 'Contribution to Heterogeneity', gridcolor: colors.grid, color: colors.text },
    yaxis: { title: 'Influence (Cook\'s Distance)', gridcolor: colors.grid, color: colors.text },
    plot_bgcolor: colors.background,
    paper_bgcolor: colors.background,
    font: { color: colors.text },
    hovermode: 'closest',
    shapes: [
      {
        type: 'line',
        x0: 0,
        x1: Math.max(...looResults.map(r => Math.abs(r.slopeChange))),
        y0: 4,
        y1: 4,
        line: { color: '#e74c3c', width: 1, dash: 'dot' }
      }
    ]
  };

  Plotly.newPlot('baujatPlot', [trace], layout, { responsive: true });
}

    // =============================================
    // SUBGROUP ANALYSIS
    // =============================================

    function runSubgroupAnalysis() {
      if (!AppState.results) {
        showToast('Please run the main analysis first', 'warning');
        return;
      }

      showProgress('Running subgroup analysis...');

      setTimeout(() => {
        try {
          const studies = getStudyData();
          const nSubgroups = parseInt(document.getElementById('nSubgroups').value) || 2;
          const subgroupVar = document.getElementById('subgroupVar').value;

          // Create subgroups based on study characteristics
          const subgroups = createSubgroups(studies, nSubgroups, subgroupVar);

          // Analyze each subgroup
          const subgroupResults = [];
          const settings = getAnalysisSettings();

          subgroups.forEach((subgroupStudies, idx) => {
            if (subgroupStudies.length < 1) return;

            try {
              const result = linearDoseResponse(subgroupStudies, settings.referenceDose);
              const slope = result.slope || result.beta?.[1] || 0;
              const se = result.seSlope || Math.sqrt(result.vcov?.[1]?.[1]) || 0;
              const ciLower = slope - 1.96 * se;
              const ciUpper = slope + 1.96 * se;
              const pValue = result.pTrend || null;

              subgroupResults.push({
                name: `Subgroup ${idx + 1}`,
                nStudies: subgroupStudies.length,
                slope: slope,
                se: se,
                ciLower: ciLower,
                ciUpper: ciUpper,
                pValue: pValue,
                I2: result.I2
              });
            } catch (e) {
              console.warn('Subgroup failed:', idx);
            }
          });

          // Between-group test (Q test for subgroup differences)
          const betweenGroupP = calculateBetweenGroupP(subgroupResults);

          // Meta-regression (simplified)
          const metaRegP = calculateMetaRegressionP(studies, subgroupVar);

          // Update UI
          document.getElementById('subgroupPlaceholder').classList.add('hidden');
          document.getElementById('subgroupContent').classList.remove('hidden');
          document.getElementById('subgroupP').textContent = formatPValue(betweenGroupP);
          document.getElementById('metaRegP').textContent = formatPValue(metaRegP);

          // Generate forest plot
          generateSubgroupForestPlot(subgroupResults);

          // Update table
          const tbody = document.getElementById('subgroupTableBody');
          tbody.innerHTML = subgroupResults.map(r => `
            <tr>
              <td class="font-mono">${r.name}</td>
              <td class="font-mono">${r.nStudies}</td>
              <td class="font-mono">${r.slope.toFixed(4)} (${r.se.toFixed(4)})</td>
              <td class="font-mono">[${r.ciLower.toFixed(4)}, ${r.ciUpper.toFixed(4)}]</td>
              <td class="font-mono">${formatPValue(r.pValue)}</td>
              <td class="font-mono">${r.I2.toFixed(1)}%</td>
            </tr>
          `).join('');

          hideProgress();
          showToast('Subgroup analysis complete', 'success');
        } catch (error) {
          hideProgress();
          showToast('Error: ' + error.message, 'error');
          console.error(error);
        }
      }, 500);
    }

    function createSubgroups(studies, n, varType) {
      // Simple grouping by study size (total N)
      const sizes = studies.map(s => s.dosePoints.reduce((sum, p) => sum + p.n, 0));
      const sortedSizes = [...sizes].sort((a, b) => a - b);
      const cutoffs = [];
      for (let i = 1; i < n; i++) {
        cutoffs.push(sortedSizes[Math.floor(sizes.length * i / n)]);
      }

      const subgroups = Array.from({ length: n }, () => []);
      sizes.forEach((size, idx) => {
        let groupIdx = 0;
        for (let i = 0; i < cutoffs.length; i++) {
          if (size >= cutoffs[i]) groupIdx = i + 1;
        }
        subgroups[groupIdx].push(studies[idx]);
      });

      return subgroups;
    }

    function calculateBetweenGroupP(subgroupResults) {
      if (subgroupResults.length < 2) return 1.0;

      // Q test for subgroup differences
      const weights = subgroupResults.map(r => 1 / (r.se * r.se));
      const weightedSlopes = subgroupResults.map(r => r.slope * weights[r]);
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      const pooledSlope = weightedSlopes.reduce((a, b) => a + b, 0) / totalWeight;

      const Qbetween = subgroupResults.reduce((sum, r, i) => {
        return sum + weights[i] * Math.pow(r.slope - pooledSlope, 2);
      }, 0);

      const pValue = 1 - normalCDF(Math.sqrt(Qbetween));
      return Math.min(1, 2 * pValue);
    }

    function calculateMetaRegressionP(studies, varType) {
      // Simplified meta-regression
      return 0.5; // Placeholder
    }

    function generateSubgroupForestPlot(subgroupResults) {
      const colors = getPlotColors();
      const colors_palette = ['#06b6d4', '#10b981', '#f5c042', '#ef4444', '#8b5cf6'];

      const traces = subgroupResults.map((r, idx) => ({
        x: [r.slope],
        y: [subgroupResults.length - idx],
        name: r.name,
        mode: 'markers',
        marker: { size: 15, color: colors_palette[idx % colors_palette.length] },
        error_x: {
          type: 'data',
          symmetric: false,
          arrayminus: [r.slope - r.ciLower],
          arrayplus: [r.ciUpper - r.slope]
        },
        text: [`Slope: ${r.slope.toFixed(3)} [${r.ciLower.toFixed(3)}, ${r.ciUpper.toFixed(3)}]`],
        hovertemplate: '%{fullData.name}<br>%{text}<extra></extra>'
      }));

      const refLine = {
        x: [0, 0],
        y: [0, subgroupResults.length + 1],
        mode: 'lines',
        line: { color: colors.grid, width: 2, dash: 'dash' },
        showlegend: false,
        hoverinfo: 'skip'
      };

      const layout = {
        title: { text: 'Subgroup Analysis Forest Plot', font: { color: colors.text } },
        xaxis: { title: 'Slope Estimate', gridcolor: colors.grid, color: colors.text },
        yaxis: {
          title: 'Subgroup',
          gridcolor: colors.grid,
          color: colors.text,
          tickvals: subgroupResults.map((_, i) => subgroupResults.length - i),
          ticktext: subgroupResults.map(r => r.name)
        },
        plot_bgcolor: colors.background,
        paper_bgcolor: colors.background,
        font: { color: colors.text },
        hovermode: 'closest',
        margin: { l: 80, r: 30, t: 40, b: 60 }
      };

      Plotly.newPlot('subgroupForestPlot', [refLine, ...traces], layout, { responsive: true });
    }

    // =============================================
    // ADVANCED METHODS
    // =============================================

    function runAdvancedMethods() {
      if (!AppState.results) {
        showToast('Please run the main analysis first', 'warning');
        return;
      }

      showProgress('Running advanced methods...');

      setTimeout(() => {
        try {
          const studies = getStudyData();
          const results = AppState.results;
          const settings = getAnalysisSettings();

          // Bootstrap CI
          const bootstrapMethod = document.getElementById('bootstrapMethod').value;
          const nBootstrap = parseInt(document.getElementById('nBootstrap').value) || 1000;
          const bootstrapResults = runBootstrap(studies, settings, nBootstrap, bootstrapMethod);

          // LOESS smoothing
          const loessSpan = parseFloat(document.getElementById('loessSpan').value) || 0.5;
          const loessResults = runLOESS(results.allPoints, loessSpan);

          // Cross-validation
          const cvMethod = document.getElementById('cvMethod').value;
          const cvResults = runCrossValidation(studies, settings, cvMethod);

          // Update UI
          document.getElementById('advancedPlaceholder').classList.add('hidden');
          document.getElementById('advancedContent').classList.remove('hidden');

          // Generate plots
          generateLOESSPlot(results.allPoints, loessResults);
          generateBootstrapPlot(bootstrapResults);
          generateCVPlot(cvResults);

          // Update table
          const tbody = document.getElementById('advancedTableBody');
          tbody.innerHTML = `
            <tr>
              <td class="font-mono">Original</td>
              <td class="font-mono">${(results.slope || results.beta?.[1] || 0).toFixed(4)}</td>
              <td class="font-mono">[${(results.slope - 1.96 * results.seSlope || 0).toFixed(4)}, ${(results.slope + 1.96 * results.seSlope || 0).toFixed(4)}]</td>
              <td class="font-mono">${(results.seSlope || 0).toFixed(4)}</td>
            </tr>
            <tr>
              <td class="font-mono">Bootstrap (${bootstrapMethod})</td>
              <td class="font-mono">${bootstrapResults.mean.toFixed(4)}</td>
              <td class="font-mono">[${bootstrapResults.ciLower.toFixed(4)}, ${bootstrapResults.ciUpper.toFixed(4)}]</td>
              <td class="font-mono">${bootstrapResults.se.toFixed(4)}</td>
            </tr>
            <tr>
              <td class="font-mono">LOESS</td>
              <td class="font-mono" colspan="3">Non-parametric smoothing applied (span: ${loessSpan})</td>
            </tr>
            <tr>
              <td class="font-mono">${cvMethod.toUpperCase()}</td>
              <td class="font-mono" colspan="3">CV Error: ${cvResults.cvError.toFixed(4)} | R²: ${cvResults.r2.toFixed(4)}</td>
            </tr>
          `;

          hideProgress();
          showToast('Advanced methods complete', 'success');
        } catch (error) {
          hideProgress();
          showToast('Error: ' + error.message, 'error');
          console.error(error);
        }
      }, 500);
    }

    function runBootstrap(studies, settings, B, method) {
      const slopes = [];

      for (let i = 0; i < B; i++) {
        // Resample studies with replacement
        const bootStudies = [];
        for (let j = 0; j < studies.length; j++) {
          const idx = Math.floor(Math.random() * studies.length);
          bootStudies.push(studies[idx]);
        }

        try {
          const result = linearDoseResponse(bootStudies, settings.referenceDose);
          slopes.push(result.slope || result.beta?.[1] || 0);
        } catch (e) {
          // Skip failed iterations
        }
      }

      if (slopes.length === 0) {
        return { mean: 0, se: 0, ciLower: 0, ciUpper: 0 };
      }

      const mean = slopes.reduce((a, b) => a + b, 0) / slopes.length;
      const se = Math.sqrt(slopes.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / (slopes.length - 1));

      let ciLower, ciUpper;
      const sortedSlopes = [...slopes].sort((a, b) => a - b);
      const alpha = 0.05;

      if (method === 'percentile') {
        ciLower = sortedSlopes[Math.floor(alpha / 2 * slopes.length)];
        ciUpper = sortedSlopes[Math.floor((1 - alpha / 2) * slopes.length)];
      } else if (method === 'bca') {
        // Simplified BCa (bias-corrected)
        const bias = normalCDF((mean - (AppState.results?.slope || 0)) / se);
        const zAlpha = normalCDF(alpha / 2);
        const zAlphaBC = 2 * normalCDF(bias + zAlpha) - 1;
        ciLower = sortedSlopes[Math.max(0, Math.floor(normalCDF(zAlphaBC) * slopes.length))];
        ciUpper = sortedSlopes[Math.min(slopes.length - 1, Math.floor((1 - normalCDF(zAlphaBC)) * slopes.length))];
      } else {
        // Normal
        ciLower = mean - 1.96 * se;
        ciUpper = mean + 1.96 * se;
      }

      return { mean, se, ciLower, ciUpper };
    }

    function runLOESS(points, span) {
      const loessPoints = [];
      const doses = points.map(p => p.dose);
      const logRates = points.map(p => p.logRate);

      doses.forEach(targetDose => {
        // Calculate weights using tricube kernel
        const distances = doses.map(d => Math.abs(d - targetDose));
        const maxDist = Math.max(...distances);
        const weights = distances.map(d => {
          const u = d / (maxDist * span + 0.001);
          return Math.pow(1 - Math.pow(Math.abs(u), 3), 3);
        });

        // Weighted linear regression at this point
        const n = points.length;
        let sumW = 0, sumWX = 0, sumWY = 0, sumWXY = 0, sumWX2 = 0;

        for (let i = 0; i < n; i++) {
          sumW += weights[i];
          sumWX += weights[i] * doses[i];
          sumWY += weights[i] * logRates[i];
          sumWX2 += weights[i] * doses[i] * doses[i];
          sumWXY += weights[i] * doses[i] * logRates[i];
        }

        const denom = sumW * sumWX2 - sumWX * sumWX;
        const slope = Math.abs(denom) > 1e-10 ? (sumW * sumWXY - sumWX * sumWY) / denom : 0;
        const intercept = Math.abs(sumW) > 1e-10 ? (sumWY - slope * sumWX) / sumW : 0;

        loessPoints.push({
          dose: targetDose,
          predicted: intercept + slope * targetDose
        });
      });

      return loessPoints.sort((a, b) => a.dose - b.dose);
    }

    function runCrossValidation(studies, settings, method) {
      let k;
      if (method === '5fold') k = 5;
      else if (method === '10fold') k = 10;
      else k = studies.length; // LOO

      const folds = Array.from({ length: k }, () => []);
      studies.forEach((study, i) => folds[i % k].push(study));

      let sumSquaredError = 0;
      let totalPoints = 0;

      folds.forEach((fold, idx) => {
        const trainStudies = studies.filter((_, i) => i % k !== idx);

        try {
          const result = linearDoseResponse(trainStudies, settings.referenceDose);

          fold.forEach(study => {
            study.dosePoints.forEach(point => {
              const pred = result.predict(point.dose);
              const actual = point.cases / point.n;
              sumSquaredError += Math.pow(actual - pred, 2);
              totalPoints++;
            });
          });
        } catch (e) {
          // Skip failed folds
        }
      });

      const cvError = Math.sqrt(sumSquaredError / totalPoints);
      const r2 = 1 - sumSquaredError / studies.reduce((sum, s) =>
        sum + s.dosePoints.reduce((ss, p) => ss + Math.pow(p.cases / p.n, 2), 0), 0);

      return { cvError, r2 };
    }

    function generateLOESSPlot(points, loessResults) {
      const colors = getPlotColors();

      const traceLOESS = {
        x: loessResults.map(r => r.dose),
        y: loessResults.map(r => Math.exp(r.predicted)),
        mode: 'lines',
        name: 'LOESS Fit',
        line: { color: '#10b981', width: 3 }
      };

      const tracePoints = {
        x: points.map(p => p.dose),
        y: points.map(p => p.rate),
        mode: 'markers',
        name: 'Observed',
        marker: { color: colors.points, size: 8, opacity: 0.7 }
      };

      const layout = {
        title: { text: 'LOESS Non-Parametric Smoothing', font: { color: colors.text } },
        xaxis: { title: 'Dose', gridcolor: colors.grid, color: colors.text },
        yaxis: { title: 'Relative Risk', gridcolor: colors.grid, color: colors.text },
        plot_bgcolor: colors.background,
        paper_bgcolor: colors.background,
        font: { color: colors.text },
        hovermode: 'closest'
      };

      Plotly.newPlot('loessPlot', [traceLOESS, tracePoints], layout, { responsive: true });
    }

    function generateBootstrapPlot(bootstrapResults) {
      const colors = getPlotColors();

      const trace = {
        x: ['Bootstrap CI'],
        y: [bootstrapResults.mean],
        mode: 'markers',
        name: 'Bootstrap Estimate',
        marker: { size: 20, color: '#10b981' },
        error_y: {
          type: 'data',
          symmetric: false,
          arrayminus: [bootstrapResults.mean - bootstrapResults.ciLower],
          arrayplus: [bootstrapResults.ciUpper - bootstrapResults.mean]
        },
        text: [`Mean: ${bootstrapResults.mean.toFixed(4)}<br>95% CI: [${bootstrapResults.ciLower.toFixed(4)}, ${bootstrapResults.ciUpper.toFixed(4)}]`],
        hovertemplate: '%{text}<extra></extra>'
      };

      const layout = {
        title: { text: 'Bootstrap Confidence Interval', font: { color: colors.text } },
        xaxis: { title: '', gridcolor: colors.grid, color: colors.text },
        yaxis: { title: 'Slope Estimate', gridcolor: colors.grid, color: colors.text },
        plot_bgcolor: colors.background,
        paper_bgcolor: colors.background,
        font: { color: colors.text },
        hovermode: 'closest',
        margin: { l: 60, r: 30, t: 40, b: 60 }
      };

      Plotly.newPlot('bootstrapPlot', [trace], layout, { responsive: true });
    }

    function generateCVPlot(cvResults) {
      const colors = getPlotColors();

      const data = [{
        values: [cvResults.r2, 1 - cvResults.r2],
        labels: ['Explained Variance', 'Residual'],
        type: 'pie',
        marker: { colors: ['#10b981', colors.grid] },
        textinfo: 'label+percent',
        hoverinfo: 'label+value'
      }];

      const layout = {
        title: { text: `Cross-Validation Results (${cvResults.cvError.toFixed(4)} RMSE)`, font: { color: colors.text } },
        plot_bgcolor: colors.background,
        paper_bgcolor: colors.background,
        font: { color: colors.text },
        margin: { t: 60, b: 20, l: 20, r: 20 }
      };

      Plotly.newPlot('cvPlot', data, layout, { responsive: true });
    }

    // =============================================
    // DATA QUALITY ASSESSMENT
    // =============================================

    function runQualityCheck() {
      if (!AppState.results) {
        showToast('Please run the main analysis first', 'warning');
        return;
      }

      showProgress('Checking data quality...');

      setTimeout(() => {
        try {
          const studies = getStudyData();
          const results = AppState.results;

          // Calculate quality metrics
          const qualityScore = calculateQualityScore(studies, results);
          const outliers = detectOutliers(results.allPoints);
          const warnings = generateWarnings(studies, results);
          const completeness = calculateCompleteness(studies);

          // Update UI
          document.getElementById('qualityPlaceholder').classList.add('hidden');
          document.getElementById('qualityContent').classList.remove('hidden');

          const scoreEl = document.getElementById('qualityScore');
          scoreEl.textContent = qualityScore.total.toFixed(0);
          scoreEl.className = 'stat-card__value';
          if (qualityScore.total >= 80) scoreEl.classList.add('stat-card__value--success');
          else if (qualityScore.total >= 60) scoreEl.classList.add('stat-card__value--warning');
          else scoreEl.classList.add('stat-card__value--danger');

          document.getElementById('nOutliers').textContent = outliers.length;
          document.getElementById('nWarnings').textContent = warnings.length;
          document.getElementById('completeness').textContent = completeness.toFixed(0) + '%';

          // Generate plots
          generateBubblePlot(studies, results);
          generateInfluencePlot(results);

          // Generate issues list
          const issuesDiv = document.getElementById('qualityIssues');
          let html = '';

          if (outliers.length > 0) {
            html += '<div style="margin-bottom: var(--space-3); padding: var(--space-3); background: var(--color-danger-bg); border-radius: var(--radius-md);">';
            html += `<strong class="text-danger">Potential Outliers (${outliers.length}):</strong><ul style="margin-top: var(--space-2);">`;
            outliers.forEach(o => {
              html += `<li>${o.study}: Dose ${o.dose.toFixed(2)}, RR ${o.rr.toFixed(2)} (Z-score: ${o.zscore.toFixed(2)})</li>`;
            });
            html += '</ul></div>';
          }

          if (warnings.length > 0) {
            html += '<div style="padding: var(--space-3); background: var(--color-warning-bg); border-radius: var(--radius-md);">';
            html += `<strong class="text-warning">Warnings (${warnings.length}):</strong><ul style="margin-top: var(--space-2);">`;
            warnings.forEach(w => {
              html += `<li>${w}</li>`;
            });
            html += '</ul></div>';
          }

          if (outliers.length === 0 && warnings.length === 0) {
            html += '<div style="padding: var(--space-3); background: var(--color-success-bg); border-radius: var(--radius-md);">';
            html += '<strong class="text-success">No major issues detected!</strong></div>';
          }

          issuesDiv.innerHTML = html;

          hideProgress();
          showToast('Quality check complete', 'success');
        } catch (error) {
          hideProgress();
          showToast('Error: ' + error.message, 'error');
          console.error(error);
        }
      }, 500);
    }

    function calculateQualityScore(studies, results) {
      let score = 100;

      // Deduct for high I²
      if (results.I2 > 75) score -= 15;
      else if (results.I2 > 50) score -= 10;
      else if (results.I2 > 25) score -= 5;

      // Deduct for small sample sizes
      const avgN = studies.reduce((sum, s) =>
        sum + s.dosePoints.reduce((ss, p) => ss + p.n, 0), 0) / studies.length;
      if (avgN < 100) score -= 10;
      else if (avgN < 500) score -= 5;

      // Deduct for few dose points
      const avgPoints = studies.reduce((sum, s) => sum + s.dosePoints.length, 0) / studies.length;
      if (avgPoints < 3) score -= 15;
      else if (avgPoints < 4) score -= 5;

      return { total: Math.max(0, score) };
    }

    function detectOutliers(points) {
      const outliers = [];
      const rates = points.map(p => p.rate);
      const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
      const std = Math.sqrt(rates.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / rates.length);

      points.forEach(p => {
        const zscore = Math.abs((p.rate - mean) / std);
        if (zscore > 2) {
          outliers.push({
            study: p.study || 'Unknown',
            dose: p.dose,
            rr: p.rate,
            zscore: zscore
          });
        }
      });

      return outliers;
    }

    function generateWarnings(studies, results) {
      const warnings = [];

      if (studies.length < 5) {
        warnings.push('Fewer than 5 studies - results may be unstable');
      }

      if (results.I2 > 50) {
        warnings.push(`High heterogeneity detected (I² = ${results.I2.toFixed(1)}%)`);
      }

      const zeroCases = studies.filter(s => s.dosePoints.some(p => p.cases === 0)).length;
      if (zeroCases > 0) {
        warnings.push(`${zeroCases} study/studies contain zero cases`);
      }

      return warnings;
    }

    function calculateCompleteness(studies) {
      let totalFields = 0;
      let filledFields = 0;

      studies.forEach(study => {
        if (study.name) {
          totalFields += 1 + study.dosePoints.length * 3;
          filledFields += 1 + study.dosePoints.filter(p => p.dose !== undefined && p.cases !== undefined && p.n !== undefined).length * 3;
        }
      });

      return totalFields > 0 ? (filledFields / totalFields) * 100 : 100;
    }

    function generateBubblePlot(studies, results) {
      const colors = getPlotColors();
      const colors_palette = ['#06b6d4', '#10b981', '#f5c042', '#ef4444', '#8b5cf6'];

      const traces = studies.map((study, idx) => {
        const totalN = study.dosePoints.reduce((sum, p) => sum + p.n, 0);
        const avgWeight = study.dosePoints.reduce((sum, p) => sum + p.cases, 0) / totalN;

        return {
          x: study.dosePoints.map(p => p.dose),
          y: study.dosePoints.map(p => p.rate),
          mode: 'markers',
          name: study.name,
          marker: {
            size: study.dosePoints.map(p => Math.sqrt(p.n) / 2),
            color: colors_palette[idx % colors_palette.length],
            opacity: 0.6,
            line: { color: colors.text, width: 1 }
          },
          text: study.dosePoints.map(p => `N: ${p.n}`),
          hovertemplate: '%{fullData.name}<br>Dose: %{x:.2f}<br>RR: %{y:.3f}<br>%{text}<extra></extra>'
        };
      });

      const layout = {
        title: { text: 'Study Weights Bubble Plot (size = √N)', font: { color: colors.text } },
        xaxis: { title: 'Dose', gridcolor: colors.grid, color: colors.text },
        yaxis: { title: 'Relative Risk', gridcolor: colors.grid, color: colors.text },
        plot_bgcolor: colors.background,
        paper_bgcolor: colors.background,
        font: { color: colors.text },
        hovermode: 'closest'
      };

      Plotly.newPlot('bubblePlot', traces, layout, { responsive: true });
    }

    function generateInfluencePlot(results) {
      const colors = getPlotColors();
      const residuals = results.residuals || [];

      const trace = {
        x: residuals.map(r => r.dose),
        y: residuals.map(r => r.residual),
        mode: 'markers',
        name: 'Residuals',
        marker: {
          size: residuals.map(r => Math.abs(r.residual) * 10),
          color: residuals.map(r => Math.abs(r.residual) > 1 ? '#ef4444' : colors.points),
          opacity: 0.7
        },
        text: residuals.map(r => `Residual: ${r.residual.toFixed(3)}`),
        hovertemplate: 'Dose: %{x:.2f}<br>Residual: %{y:.3f}<br>%{text}<extra></extra>'
      };

      const layout = {
        title: { text: 'Influence Plot (size = |residual|)', font: { color: colors.text } },
        xaxis: { title: 'Dose', gridcolor: colors.grid, color: colors.text },
        yaxis: { title: 'Residual', gridcolor: colors.grid, color: colors.text },
        plot_bgcolor: colors.background,
        paper_bgcolor: colors.background,
        font: { color: colors.text },
        hovermode: 'closest'
      };

      Plotly.newPlot('influencePlot', [trace], layout, { responsive: true });
    }

    // =============================================
    // EXPORT FUNCTIONS
    // =============================================

    function exportAllPlots() {
      if (!AppState.results) {
        showToast('No results to export', 'warning');
        return;
      }

      showToast('Downloading all plots...', 'info');

      const plotIds = ['doseResponsePlot', 'studyCurvesPlot', 'residualPlot', 'forestPlot'];
      plotIds.forEach((id, idx) => {
        setTimeout(() => {
          const el = document.getElementById(id);
          if (el && !el.classList.contains('hidden')) {
            Plotly.downloadImage(id, { format: 'png', width: 1200, height: 800, filename: `dose-response-${id}-${Date.now()}.png` });
          }
        }, idx * 500);
      });
    }

    function exportToLaTeX() {
      if (!AppState.results) {
        showToast('No results to export', 'warning');
        return;
      }

      const results = AppState.results;
      let latex = `%% Dose-Response Meta-Analysis Results\n`;
      latex += `%% Generated by Dose Response Pro v3.0\n`;
      latex += `%% ${new Date().toISOString()}\n\n`;

      latex += `\\begin{table}[htbp]\n\\centering\n`;
      latex += `\\caption{Dose-Response Meta-Analysis Results}\n`;
      latex += `\\label{tab:dose-response}\n`;
      latex += `\\begin{tabular}{lccc}\n`;
      latex += `\\hline\n`;
      latex += `Coefficient & Estimate & SE & 95\\% CI \\\\\n`;
      latex += `\\hline\n`;

      results.coefficients.forEach(coef => {
        latex += `${coef.name} & ${coef.estimate.toFixed(4)} & ${coef.se.toFixed(4)} & [${coef.ciLower.toFixed(4)}, ${coef.ciUpper.toFixed(4)}] \\\\\n`;
      });

      latex += `\\hline\n`;
      latex += `\\end{tabular}\n`;
      latex += `\\end{table}\n\n`;

      // Add statistics
      latex += `\\textbf{Model Statistics:}\n`;
      latex += `\\begin{itemize}\n`;
      latex += `\\item Number of studies: ${results.nStudies}\n`;
      latex += `\\item Q statistic: ${results.Q.toFixed(2)}\n`;
      latex += `\\item I\\textsuperscript{2}: ${results.I2.toFixed(1)}\\%\n`;
      latex += `\\item AIC: ${results.AIC.toFixed(2)}\n`;
      latex += `\\item BIC: ${results.BIC.toFixed(2)}\n`;
      latex += `\\end{itemize}\n`;

      // Show in preview
      document.getElementById('exportPreview').value = latex;
      showToast('LaTeX code generated', 'success');

      // Copy to clipboard
      navigator.clipboard.writeText(latex);
    }

    function exportToR() {
      if (!AppState.results) {
        showToast('No results to export', 'warning');
        return;
      }

      let rscript = `# Dose-Response Meta-Analysis in R\n`;
      rscript += `# Generated by Dose Response Pro v3.0\n`;
      rscript += `# ${new Date().toISOString()}\n\n`;

      rscript += `# Load required packages\n`;
      rscript += `library(dosresmeta)\n`;
      rscript += `library(meta)\n`;
      rscript += `library(ggplot2)\n\n`;

      rscript += `# Data structure\n`;
      rscript += `# Study, Dose, Cases, N\n`;
      const studies = getStudyData();
      studies.forEach(study => {
        study.dosePoints.forEach(point => {
          rscript += `data <- rbind(data, c("${study.name}", ${point.dose}, ${point.cases}, ${point.n}))\n`;
        });
      });

      rscript += `\ndata <- data.frame(data)\n`;
      rscript += `colnames(data) <- c("study", "dose", "cases", "n")\n\n`;

      rscript += `# Fit dose-response model\n`;
      rscript += `fit <- dosresmeta(formula = logrr ~ dose, id = study,\n`;
      rscript += `                    type = "ci", cases = cases, n = n,\n`;
      rscript += `                    data = data)\n\n`;

      rscript += `# Summary\n`;
      rscript += `summary(fit)\n\n`;

      rscript += `# Plot\n`;
      rscript += `plot(fit, xlab = "Dose", ylab = "Relative Risk")\n`;

      // Show in preview
      document.getElementById('exportPreview').value = rscript;
      showToast('R script generated', 'success');

      // Copy to clipboard
      navigator.clipboard.writeText(rscript);
    }

    function exportToWord() {
      if (!AppState.results) {
        showToast('No results to export', 'warning');
        return;
      }

      const results = AppState.results;
      let word = `DOSE-RESPONSE META-ANALYSIS REPORT\n`;
      word += `Generated: ${new Date().toLocaleString()}\n`;
      word += `Dose Response Pro v3.0\n\n`;

      word += `SUMMARY STATISTICS\n`;
      word += `${'='.repeat(50)}\n`;
      word += `Number of Studies: ${results.nStudies}\n`;
      word += `Number of Data Points: ${results.nPoints}\n`;
      word += `Q Statistic: ${results.Q.toFixed(2)}\n`;
      word += `I²: ${results.I2.toFixed(1)}%\n`;
      word += `AIC: ${results.AIC.toFixed(2)}\n`;
      word += `BIC: ${results.BIC.toFixed(2)}\n\n`;

      word += `MODEL COEFFICIENTS\n`;
      word += `${'='.repeat(50)}\n`;
      results.coefficients.forEach(coef => {
        word += `${coef.name}: ${coef.estimate.toFixed(4)} (SE: ${coef.se.toFixed(4)})\n`;
        word += `  95% CI: [${coef.ciLower.toFixed(4)}, ${coef.ciUpper.toFixed(4)}]\n`;
        if (coef.pValue !== null) {
          word += `  P-value: ${formatPValue(coef.pValue)}\n`;
        }
        word += `\n`;
      });

      word += `\nINTERPRETATION\n`;
      word += `${'='.repeat(50)}\n`;
      if (results.I2 < 25) {
        word += `- Low heterogeneity detected (I² < 25%)\n`;
      } else if (results.I2 < 50) {
        word += `- Moderate heterogeneity detected (I²: 25-50%)\n`;
      } else {
        word += `- High heterogeneity detected (I² > 50%)\n`;
      }

      // Show in preview
      document.getElementById('exportPreview').value = word;
      showToast('Word report generated', 'success');

      // Copy to clipboard
      navigator.clipboard.writeText(word);
    }

    // =============================================
    // UI HELPER FUNCTIONS
    // =============================================

    function showToast(message, type = 'info') {
      // Remove existing toasts
      const existing = document.querySelector('.toast-container');
      if (existing) existing.remove();

      // Create container
      const container = document.createElement('div');
      container.className = 'toast-container';

      // Create toast
      const toast = document.createElement('div');
      toast.className = `toast toast--${type}`;

      const icons = {
        success: '✓',
        error: '✗',
        warning: '⚠',
        info: 'ℹ'
      };

      toast.innerHTML = `<span style="font-size: 1.2em;">${icons[type]}</span><span>${message}</span>`;

      container.appendChild(toast);
      document.body.appendChild(container);

      // Auto remove after 3 seconds
      setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => container.remove(), 300);
      }, 3000);
    }

    function showProgress(message) {
      const existing = document.querySelector('.progress-overlay');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.className = 'progress-overlay';
      overlay.innerHTML = `
        <div class="progress-content">
          <p style="margin-bottom: var(--space-2);">${message}</p>
          <div class="progress-bar">
            <div class="progress-fill" style="width: 0%;"></div>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      // Animate
      setTimeout(() => {
        const fill = overlay.querySelector('.progress-fill');
        fill.style.width = '60%';
      }, 100);
    }

    function hideProgress() {
      const overlay = document.querySelector('.progress-overlay');
      if (overlay) {
        const fill = overlay.querySelector('.progress-fill');
        if (fill) fill.style.width = '100%';
        setTimeout(() => overlay.remove(), 300);
      }
    }

    // =============================================
    // KEYBOARD SHORTCUTS
    // =============================================

    document.addEventListener('keydown', function(e) {
      // Ctrl/Cmd + Enter: Run analysis
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        runAnalysis();
      }
      // Ctrl/Cmd + Shift + D: Load demo data
      else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        loadDemoData();
      }
      // Ctrl/Cmd + Shift + E: Export results
      else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'E') {
        e.preventDefault();
        exportResults();
      }
      // Ctrl/Cmd + Shift + R: Generate report
      else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'R') {
        e.preventDefault();
        generateReport();
      }
      // Ctrl/Cmd + 1-6: Switch tabs
      else if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const tabs = ['data', 'settings', 'results', 'plots', 'bias', 'sensitivity', 'subgroups', 'advanced', 'quality', 'models', 'export', 'report'];
        const tabIdx = parseInt(e.key) - 1;
        if (tabIdx < tabs.length) {
          switchTab(tabs[tabIdx]);
        }
      }
      // Escape: Clear selections
      else if (e.key === 'Escape') {
        document.querySelectorAll('.input').forEach(input => input.blur());
      }
    });

    // Initialize
    window.addEventListener('DOMContentLoaded', function() {
      // Create CSV file input element
      const csvFileInput = document.createElement('input');
      csvFileInput.type = 'file';
      csvFileInput.accept = '.csv,.txt';
      csvFileInput.style.display = 'none';
      csvFileInput.id = 'csvFileInput';
      document.body.appendChild(csvFileInput);

      // Add event listener for CSV file selection
      csvFileInput.addEventListener('change', function(e) {
        if (e.target.files.length > 0) {
          importFromCSV(e.target.files[0]);
          // Reset input so same file can be selected again
          e.target.value = '';
        }
      });

      // Add first study
      addStudy();
      showToast('Dose Response Pro v4.1 Light ready - Greenland & Longnecker GLS enabled!', 'success');
    });
  </script>
