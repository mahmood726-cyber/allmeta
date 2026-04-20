const DataPaginator = {

 currentPage: 1,

 pageSize: 100,

 totalPages: 1,

 samplingEnabled: false,

 sampleSize: 5000,



 // Initialize paginator

 init: function(data) {

 this.currentPage = 1;

 this.totalPages = Math.ceil(data.length / this.pageSize);



 // Auto-enable sampling for very large datasets

 if (data.length > 10000 && !this.samplingEnabled) {

 this.showLargeDatasetWarning(data.length);

 }

 },



 // Show warning for large datasets

 showLargeDatasetWarning: function(n) {

 const container = document.getElementById('dataPreviewCard');

 if (!container) return;



 let warningDiv = document.getElementById('largeDataWarning');

 if (!warningDiv) {

 warningDiv = document.createElement('div');

 warningDiv.id = 'largeDataWarning';

 warningDiv.className = 'alert alert-warning';

 warningDiv.style.marginBottom = '1rem';

 container.insertBefore(warningDiv, container.querySelector('.data-table-container'));

 }



 warningDiv.innerHTML = `

 <strong>⚠️ Large Dataset Detected:</strong> ${n.toLocaleString()} records loaded.

 <br><small>For optimal performance, consider using stratified sampling for exploratory analysis.</small>

 <div style="margin-top:0.5rem;">

 <button class="btn btn-secondary btn-sm" onclick="DataPaginator.enableSampling()">

   Use Sampling (${this.sampleSize.toLocaleString()} records)

 </button>

 <button class="btn btn-secondary btn-sm" onclick="DataPaginator.dismissWarning()">

   Use Full Dataset

 </button>

 </div>

 `;

 },



 // Enable stratified sampling

 enableSampling: function() {

 this.samplingEnabled = true;

 this.dismissWarning();



 // Stratified sample by study

 const studyVar = APP.config.studyVar || document.getElementById('varStudy')?.value;

 if (studyVar && APP.data.length > this.sampleSize) {

 const byStudy = {};

 APP.data.forEach(row => {

   const study = row[studyVar] || 'Unknown';

   if (!byStudy[study]) byStudy[study] = [];

   byStudy[study].push(row);

 });



 const studies = Object.keys(byStudy);

 const perStudy = Math.floor(this.sampleSize / studies.length);

 const sampled = [];



 studies.forEach(study => {

   const studyData = byStudy[study];

   const n = Math.min(perStudy, studyData.length);

   // Random sample

   const shuffled = studyData.sort(() => Math.random() - 0.5);

   sampled.push(...shuffled.slice(0, n));

 });



 APP.originalData = APP.data;

 APP.data = sampled;

 APP.isSampled = true;



 showNotification(`Stratified sample: ${sampled.length} records from ${studies.length} studies`, 'success');

 displayData();

 }

 },



 // Restore full dataset

 restoreFullData: function() {

 if (APP.originalData) {

 APP.data = APP.originalData;

 APP.originalData = null;

 APP.isSampled = false;

 this.samplingEnabled = false;

 showNotification('Full dataset restored', 'success');

 displayData();

 }

 },



 // Dismiss warning

 dismissWarning: function() {

 const warning = document.getElementById('largeDataWarning');

 if (warning) warning.remove();

 },



 // Get current page data

 getPageData: function(data) {

 const start = (this.currentPage - 1) * this.pageSize;

 return data.slice(start, start + this.pageSize);

 },



 // Navigate to page

 goToPage: function(page) {

 this.currentPage = Math.max(1, Math.min(page, this.totalPages));

 this.renderTable();

 },



 // Render pagination controls

 renderControls: function() {

 const total = APP.data.length;

 const start = (this.currentPage - 1) * this.pageSize + 1;

 const end = Math.min(this.currentPage * this.pageSize, total);



 return `

 <div class="pagination-controls" style="display:flex;justify-content:space-between;align-items:center;padding:0.75rem;background:var(--bg-tertiary);border-radius:0 0 8px 8px;font-size:0.85rem;">

 <div style="color:var(--text-secondary);">

   Showing ${start.toLocaleString()}-${end.toLocaleString()} of ${total.toLocaleString()} records

   ${APP.isSampled ? '<span class="badge badge-warning" style="margin-left:0.5rem;">Sampled</span>' : ''}

 </div>

 <div style="display:flex;gap:0.25rem;align-items:center;">

   <button class="btn btn-secondary btn-sm" onclick="DataPaginator.goToPage(1)" ${this.currentPage === 1 ? 'disabled' : ''}>&#x23EA;</button>

   <button class="btn btn-secondary btn-sm" onclick="DataPaginator.goToPage(${this.currentPage - 1})" ${this.currentPage === 1 ? 'disabled' : ''}>&#x25C0;</button>

   <span style="padding:0 0.5rem;">Page ${this.currentPage} of ${this.totalPages}</span>

   <button class="btn btn-secondary btn-sm" onclick="DataPaginator.goToPage(${this.currentPage + 1})" ${this.currentPage === this.totalPages ? 'disabled' : ''}>&#x25B6;</button>

   <button class="btn btn-secondary btn-sm" onclick="DataPaginator.goToPage(${this.totalPages})" ${this.currentPage === this.totalPages ? 'disabled' : ''}>&#x23E9;</button>

   ${APP.isSampled ? '<button class="btn btn-secondary btn-sm" onclick="DataPaginator.restoreFullData()" style="margin-left:0.5rem;">Restore Full</button>' : ''}

 </div>

 </div>

 `;

 },



 // Render table with current page

 renderTable: function() {

 const tbody = document.getElementById('dataTableBody');

 if (!tbody || !APP.data) return;



 const pageData = this.getPageData(APP.data);

 tbody.innerHTML = pageData.map(row =>

 '<tr>' + APP.variables.map(v => {

 const name = getVarName(v);

 return `<td class="editable">${escapeHTML(row[name] ?? '')}</td>`;

 }).join('') + '</tr>'

 ).join('');



 // Update pagination controls

 let paginationDiv = document.getElementById('paginationControls');

 if (!paginationDiv) {

 paginationDiv = document.createElement('div');

 paginationDiv.id = 'paginationControls';

 const tableContainer = document.querySelector('#dataPreviewCard .data-table-container');

 if (tableContainer) {

   tableContainer.after(paginationDiv);

 }

 }

 paginationDiv.innerHTML = this.renderControls();

 }

};



function displayData() {

 APP.currentData = APP.data;

 window.currentData = APP.data;



 document.getElementById('dataPreviewCard').style.display = 'block';

 document.getElementById('analysisSettingsCard').style.display = 'block';



 document.getElementById('statPatients').textContent = APP.data.length.toLocaleString();

 const studyVar = APP.variables.find(v => {

 const name = getVarName(v);

 return name && (name.toLowerCase().includes('study') || name.toLowerCase().includes('trial'));

 });

 if (studyVar) {

 document.getElementById('statStudies').textContent = studyVar.unique;

 }

 const treatVar = APP.variables.find(v => {

 const name = getVarName(v);

 return name && (name.toLowerCase().includes('treat') || name.toLowerCase().includes('arm') || name.toLowerCase().includes('group'));

 });

 if (treatVar) {

 document.getElementById('statTreatments').textContent = treatVar.unique;

 }

 document.getElementById('statVariables').textContent = APP.variables.length;



 const selects = ['varStudy', 'varTreatment', 'varTime', 'varEvent'];

 selects.forEach(id => {

 const select = document.getElementById(id);

 if (!select) return; // Guard: element may not exist in all views

 select.innerHTML = '<option value="">-- Select --</option>';

 APP.variables.forEach(v => {

 const name = getVarName(v);

 if (!name) return;

 const type = (v && typeof v === 'object' && v.type) ? v.type : '';

 const opt = document.createElement('option');

 opt.value = name;

 opt.textContent = type ? `${name} (${type})` : name;

 select.appendChild(opt);

 });

 });



 if (studyVar) document.getElementById('varStudy').value = getVarName(studyVar);

 if (treatVar) document.getElementById('varTreatment').value = getVarName(treatVar);



 const timeVar = APP.variables.find(v => {

 const name = getVarName(v);

 return name && (name.toLowerCase().includes('time') || name.toLowerCase().includes('surv'));

 });

 if (timeVar) document.getElementById('varTime').value = getVarName(timeVar);



 const eventVar = APP.variables.find(v => {

 const name = getVarName(v);

 return name && (name.toLowerCase().includes('event') || name.toLowerCase().includes('status') || name.toLowerCase().includes('censor'));

 });

 if (eventVar) document.getElementById('varEvent').value = getVarName(eventVar);



 const thead = document.getElementById('dataTableHead');

 const tbody = document.getElementById('dataTableBody');



 thead.innerHTML = '<tr>' + APP.variables.map(v => `<th>${escapeHTML(getVarName(v))}</th>`).join('') + '</tr>';



 // Use paginator for table rendering

 DataPaginator.init(APP.data);

 DataPaginator.renderTable();

 if (typeof refreshMethodConfidencePanel === 'function') {

 refreshMethodConfidencePanel();

 }

 }



function updateOutcomeVars() {

 const type = document.getElementById('outcomeType').value;

 document.getElementById('timeVarGroup').style.display = type === 'survival' ? 'block' : 'none';



 const effectSelect = document.getElementById('effectMeasure');

 effectSelect.innerHTML = '';



 if (type === 'survival') {

 effectSelect.innerHTML = '<option value="HR">Hazard Ratio (HR)</option>';

 } else if (type === 'binary') {

 effectSelect.innerHTML = `

 <option value="OR">Odds Ratio (OR)</option>

 <option value="RR">Risk Ratio (RR)</option>

 <option value="RD">Risk Difference (RD)</option>

 `;

 } else {

 effectSelect.innerHTML = `

 <option value="MD">Mean Difference (MD)</option>

 <option value="SMD">Standardized Mean Difference (SMD)</option>

 `;

 }

 if (typeof refreshMethodConfidencePanel === 'function') {

 setTimeout(refreshMethodConfidencePanel, 0);

 }

 }



 const EXAMPLE_DATASETS = {



 survival: {

 name: 'Advanced NSCLC Immunotherapy Meta-Analysis',

 description: '12 RCTs comparing PD-1/PD-L1 inhibitors vs chemotherapy in advanced NSCLC',

 studies: [

 { id: 'KEYNOTE-024', n: 305, year: 2016, region: 'Global', line: '1L', pdl1: 'high' },

 { id: 'KEYNOTE-042', n: 1274, year: 2019, region: 'Global', line: '1L', pdl1: 'any' },

 { id: 'KEYNOTE-010', n: 1034, year: 2016, region: 'Global', line: '2L+', pdl1: 'pos' },

 { id: 'CheckMate-017', n: 272, year: 2015, region: 'Global', line: '2L', pdl1: 'any' },

 { id: 'CheckMate-057', n: 582, year: 2015, region: 'Global', line: '2L', pdl1: 'any' },

 { id: 'CheckMate-078', n: 504, year: 2019, region: 'Asia', line: '2L', pdl1: 'any' },

 { id: 'OAK', n: 850, year: 2017, region: 'Global', line: '2L+', pdl1: 'any' },

 { id: 'POPLAR', n: 287, year: 2016, region: 'Global', line: '2L+', pdl1: 'any' },

 { id: 'IMpower110', n: 572, year: 2020, region: 'Global', line: '1L', pdl1: 'high' },

 { id: 'JAVELIN-Lung-200', n: 792, year: 2018, region: 'Global', line: '2L', pdl1: 'pos' },

 { id: 'ARCTIC', n: 126, year: 2020, region: 'Europe', line: '3L+', pdl1: 'high' },

 { id: 'EMPOWER-Lung-1', n: 710, year: 2021, region: 'Global', line: '1L', pdl1: 'high' }

 ],

 generatePatient: (study, idx, studyHR) => {

 const age = Math.round(40 + Math.random() * 35 + (study.region === 'Asia' ? -5 : 0));

 const sex = Math.random() < 0.65 ? 'Male' : 'Female';

 const smoking = Math.random() < 0.85 ? 'Current/Former' : 'Never';

 const histology = Math.random() < 0.6 ? 'Adenocarcinoma' : (Math.random() < 0.7 ? 'Squamous' : 'Other');

 const ecog = Math.random() < 0.7 ? 0 : 1;

 const pdl1_score = study.pdl1 === 'high' ? Math.round(50 + Math.random() * 50) : Math.round(Math.random() * 100);

 const brain_met = Math.random() < 0.15 ? 1 : 0;

 const liver_met = Math.random() < 0.2 ? 1 : 0;

 const treat = Math.random() < 0.5 ? 1 : 0;



 let baseHazard = 0.025;

 baseHazard *= (1 + (age - 60) * 0.015);

 baseHazard *= (ecog === 1 ? 1.4 : 1);

 baseHazard *= (brain_met ? 1.6 : 1);

 baseHazard *= (liver_met ? 1.5 : 1);

 baseHazard *= (smoking === 'Never' ? 0.85 : 1);



 let hr = studyHR;

 if (treat === 1) {

 hr *= (pdl1_score > 50 ? 0.85 : 1.1);

 hr *= (smoking === 'Never' ? 1.15 : 0.95);

 }



 const hazard = baseHazard * (treat === 1 ? hr : 1);

 const survTime = -Math.log(Math.random()) / hazard;

 const maxFollow = study.line === '1L' ? 48 : 36;

 const censorTime = Math.random() * maxFollow;

 const event = survTime < censorTime ? 1 : 0;

 const time = Math.round(Math.min(survTime, censorTime) * 10) / 10;



 return {

 study_id: study.id,

 patient_id: `${study.id}_${String(idx).padStart(4, '0')}`,

 treatment: treat,

 treatment_name: treat === 1 ? 'Immunotherapy' : 'Chemotherapy',

 time_months: time,

 event: event,

 age: age,

 sex: sex,

 smoking_status: smoking,

 histology: histology,

 ecog_ps: ecog,

 pdl1_tps: pdl1_score,

 brain_metastases: brain_met,

 liver_metastases: liver_met,

 line_of_therapy: study.line,

 region: study.region,

 study_year: study.year

 };

 }

 },



 binary: {

 name: 'SGLT2 Inhibitors Cardiovascular Outcomes',

 description: '8 RCTs of SGLT2 inhibitors for MACE prevention in T2DM',

 studies: [

 { id: 'EMPA-REG', n: 7020, year: 2015, drug: 'Empagliflozin', population: 'CVD' },

 { id: 'CANVAS', n: 10142, year: 2017, drug: 'Canagliflozin', population: 'CVD/Risk' },

 { id: 'DECLARE-TIMI', n: 17160, year: 2019, drug: 'Dapagliflozin', population: 'CVD/Risk' },

 { id: 'CREDENCE', n: 4401, year: 2019, drug: 'Canagliflozin', population: 'CKD' },

 { id: 'DAPA-HF', n: 4744, year: 2019, drug: 'Dapagliflozin', population: 'HFrEF' },

 { id: 'EMPEROR-Reduced', n: 3730, year: 2020, drug: 'Empagliflozin', population: 'HFrEF' },

 { id: 'VERTIS-CV', n: 8246, year: 2020, drug: 'Ertugliflozin', population: 'CVD' },

 { id: 'SCORED', n: 10584, year: 2021, drug: 'Sotagliflozin', population: 'CKD/CVD' }

 ],

 generatePatient: (study, idx, studyOR) => {

 const age = Math.round(55 + Math.random() * 20);

 const sex = Math.random() < 0.65 ? 'Male' : 'Female';

 const bmi = Math.round((25 + Math.random() * 15) * 10) / 10;

 const hba1c = Math.round((7 + Math.random() * 3) * 10) / 10;

 const egfr = Math.round(30 + Math.random() * 70);

 const prior_mi = Math.random() < 0.3 ? 1 : 0;

 const prior_stroke = Math.random() < 0.15 ? 1 : 0;

 const heart_failure = study.population.includes('HF') ? (Math.random() < 0.8 ? 1 : 0) : (Math.random() < 0.2 ? 1 : 0);

 const hypertension = Math.random() < 0.85 ? 1 : 0;

 const statin_use = Math.random() < 0.75 ? 1 : 0;

 const treat = Math.random() < 0.5 ? 1 : 0;



 let baseRisk = 0.08;

 baseRisk *= (1 + (age - 60) * 0.02);

 baseRisk *= (prior_mi ? 1.8 : 1);

 baseRisk *= (prior_stroke ? 1.6 : 1);

 baseRisk *= (heart_failure ? 2.0 : 1);

 baseRisk *= (egfr < 60 ? 1.5 : 1);

 baseRisk *= (statin_use ? 0.75 : 1);

 baseRisk = Math.min(0.5, baseRisk);



 let or = studyOR;

 if (treat === 1) {

 or *= (heart_failure ? 0.85 : 1);

 or *= (egfr < 60 ? 0.9 : 1);

 }



 const treatRisk = (baseRisk * or) / (1 - baseRisk + baseRisk * or);

 const outcome = Math.random() < (treat === 1 ? treatRisk : baseRisk) ? 1 : 0;



 return {

 study_id: study.id,

 patient_id: `${study.id}_${String(idx).padStart(5, '0')}`,

 treatment: treat,

 treatment_name: treat === 1 ? study.drug : 'Placebo',

 mace_event: outcome,

 age: age,

 sex: sex,

 bmi: bmi,

 hba1c_baseline: hba1c,

 egfr_baseline: egfr,

 prior_mi: prior_mi,

 prior_stroke: prior_stroke,

 heart_failure: heart_failure,

 hypertension: hypertension,

 statin_use: statin_use,

 diabetes_duration: Math.round(5 + Math.random() * 15),

 study_population: study.population,

 study_year: study.year

 };

 }

 },



 continuous: {

 name: 'CBT vs Pharmacotherapy for Depression',

 description: '10 RCTs comparing CBT to antidepressants for major depression',

 studies: [

 { id: 'DeRubeis2005', n: 240, year: 2005, severity: 'moderate-severe', setting: 'outpatient' },

 { id: 'Dimidjian2006', n: 241, year: 2006, severity: 'moderate-severe', setting: 'outpatient' },

 { id: 'Elkin1989', n: 250, year: 1989, severity: 'mild-moderate', setting: 'outpatient' },

 { id: 'Hollon2014', n: 452, year: 2014, severity: 'moderate-severe', setting: 'outpatient' },

 { id: 'Jarrett1999', n: 156, year: 1999, severity: 'moderate', setting: 'outpatient' },

 { id: 'Keller2000', n: 681, year: 2000, severity: 'chronic', setting: 'outpatient' },

 { id: 'Rush1977', n: 41, year: 1977, severity: 'moderate-severe', setting: 'outpatient' },

 { id: 'Blackburn1981', n: 64, year: 1981, severity: 'moderate', setting: 'mixed' },

 { id: 'Murphy1984', n: 87, year: 1984, severity: 'moderate', setting: 'outpatient' },

 { id: 'Cuijpers2020', n: 318, year: 2020, severity: 'moderate-severe', setting: 'online' }

 ],

 generatePatient: (study, idx, studyEffect) => {

 const age = Math.round(25 + Math.random() * 45);

 const sex = Math.random() < 0.62 ? 'Female' : 'Male';

 const education = Math.random() < 0.3 ? 'High School' : (Math.random() < 0.6 ? 'College' : 'Graduate');

 const employed = Math.random() < 0.6 ? 1 : 0;

 const married = Math.random() < 0.45 ? 1 : 0;

 const recurrent = Math.random() < 0.65 ? 1 : 0;

 const comorbid_anxiety = Math.random() < 0.55 ? 1 : 0;

 const prior_treatment = Math.random() < 0.4 ? 1 : 0;

 const treat = Math.random() < 0.5 ? 1 : 0;



 let baseline_hamd = study.severity === 'chronic' ? 22 + Math.random() * 8 :

 study.severity === 'moderate-severe' ? 20 + Math.random() * 10 :

 study.severity === 'moderate' ? 17 + Math.random() * 8 : 14 + Math.random() * 8;

 baseline_hamd = Math.round(baseline_hamd);



 let response = 8 + Math.random() * 6;

 response += (treat === 1 ? studyEffect : 0);

 response += (baseline_hamd > 25 ? 2 : 0);

 response += (comorbid_anxiety ? -1.5 : 0);

 response += (recurrent ? -1 : 0);

 response += (prior_treatment ? -0.5 : 0);

 response += (study.setting === 'online' ? -1 : 0);

 response += (Math.random() - 0.5) * 8;



 const endpoint_hamd = Math.max(0, Math.round((baseline_hamd - response) * 10) / 10);

 const remission = endpoint_hamd <= 7 ? 1 : 0;

 const response_50 = (baseline_hamd - endpoint_hamd) / baseline_hamd >= 0.5 ? 1 : 0;



 return {

 study_id: study.id,

 patient_id: `${study.id}_${String(idx).padStart(3, '0')}`,

 treatment: treat,

 treatment_name: treat === 1 ? 'CBT' : 'Antidepressant',

 hamd_baseline: baseline_hamd,

 hamd_endpoint: endpoint_hamd,

 hamd_change: Math.round((baseline_hamd - endpoint_hamd) * 10) / 10,

 remission: remission,

 response_50pct: response_50,

 age: age,

 sex: sex,

 education: education,

 employed: employed,

 married: married,

 recurrent_depression: recurrent,

 comorbid_anxiety: comorbid_anxiety,

 prior_treatment: prior_treatment,

 depression_severity: study.severity,

 treatment_setting: study.setting,

 study_year: study.year

 };

 }

 },



 ovarian_survival: {

 name: 'Ovarian Cancer Platinum-Based Chemotherapy (ICON/EORTC)',

 description: 'IPD meta-analysis of platinum-based chemotherapy in ovarian cancer',

 studies: [

 { id: 'GONO', n: 226, year: 1991 }, { id: 'GICOG', n: 200, year: 1992 },

 { id: 'ICON3', n: 1838, year: 1998 }, { id: 'GOG111', n: 410, year: 1996 }, { id: 'OV10', n: 680, year: 1998 }

 ],

 generatePatient: (study, idx, studyHR) => {

 const age = Math.round(50 + Math.random() * 25);

 const stage = Math.random() < 0.6 ? 'III' : 'IV';

 const grade = Math.random() < 0.2 ? 1 : Math.random() < 0.5 ? 2 : 3;

 const residual = Math.random() < 0.4 ? 'optimal' : 'suboptimal';

 const treat = Math.random() < 0.5 ? 1 : 0;

 let baseHazard = 0.015 * (stage === 'IV' ? 2.5 : 1.8) * (grade === 3 ? 1.6 : 1) * (residual === 'suboptimal' ? 1.8 : 1);

 const hazard = baseHazard * (treat === 1 ? studyHR : 1);

 const survTime = -Math.log(Math.random()) / hazard;

 const censorTime = 36 + Math.random() * 60;

 return {

 study_id: study.id, patient_id: `${study.id}_${String(idx).padStart(4, '0')}`,

 treatment: treat, treatment_name: treat === 1 ? 'Paclitaxel-based' : 'Standard platinum',

 time_months: Math.round(Math.min(survTime, censorTime) * 10) / 10,

 event: survTime < censorTime ? 1 : 0, age: age, figo_stage: stage, grade: grade,

 residual_disease: residual, study_year: study.year

 };

 }

 },



 breast_endocrine: {

 name: 'Breast Cancer Tamoxifen Duration (EBCTCG)',

 description: 'ER+ breast cancer extended endocrine therapy',

 studies: [

 { id: 'NSABP-B14', n: 2892, year: 1989 }, { id: 'Scottish', n: 1312, year: 1987 },

 { id: 'ATLAS', n: 6846, year: 2013 }, { id: 'aTTom', n: 6953, year: 2013 }

 ],

 generatePatient: (study, idx, studyHR) => {

 const age = Math.round(45 + Math.random() * 30);

 const nodes = Math.floor(Math.random() * Math.random() * 10);

 const grade = Math.random() < 0.25 ? 1 : Math.random() < 0.65 ? 2 : 3;

 const treat = Math.random() < 0.5 ? 1 : 0;

 let baseHazard = 0.008 * (1 + nodes * 0.15) * (grade === 3 ? 1.6 : grade === 2 ? 1.2 : 1);

 const survTime = -Math.log(Math.random()) / (baseHazard * (treat === 1 ? studyHR : 1));

 const censorTime = 60 + Math.random() * 120;

 return {

 study_id: study.id, patient_id: `${study.id}_${String(idx).padStart(5, '0')}`,

 treatment: treat, treatment_name: treat === 1 ? 'Extended tamoxifen' : 'Standard duration',

 time_months: Math.round(Math.min(survTime, censorTime) * 10) / 10,

 event: survTime < censorTime ? 1 : 0, age: age, nodes_positive: nodes, grade: grade, study_year: study.year

 };

 }

 },



 network_antidepressants: {

 name: 'Antidepressant Network Meta-Analysis (Cipriani 2018 Lancet)',

 description: 'Multi-arm trials comparing 21 antidepressants - network structure',

 studies: [

 { id: 'Schweizer94', n: 189, arms: ['Fluoxetine', 'Placebo'] },

 { id: 'Keller01', n: 376, arms: ['Paroxetine', 'Imipramine', 'Placebo'] },

 { id: 'Boulenger06', n: 494, arms: ['Escitalopram', 'Paroxetine', 'Placebo'] },

 { id: 'Montgomery07', n: 468, arms: ['Duloxetine', 'Escitalopram'] },

 { id: 'Rush06', n: 565, arms: ['Bupropion', 'Sertraline', 'Venlafaxine'] },

 { id: 'Lenox02', n: 410, arms: ['Mirtazapine', 'Fluoxetine', 'Placebo'] }

 ],

 generatePatient: (study, idx) => {

 const armIdx = idx % study.arms.length;

 const treatment_name = study.arms[armIdx];

 const baseline = Math.round(20 + Math.random() * 12);

 const effects = { 'Escitalopram': 3.5, 'Mirtazapine': 3.3, 'Sertraline': 3.1, 'Venlafaxine': 3.2,

 'Paroxetine': 3.0, 'Duloxetine': 2.9, 'Fluoxetine': 2.8, 'Bupropion': 2.7, 'Imipramine': 2.5, 'Placebo': 0 };

 const response = 8 + Math.random() * 5 + (effects[treatment_name] || 2.5) + (Math.random() - 0.5) * 8;

 const endpoint = Math.max(0, Math.round((baseline - response) * 10) / 10);

 return {

 study_id: study.id, patient_id: `${study.id}_${String(idx).padStart(4, '0')}`,

 treatment: treatment_name === 'Placebo' ? 0 : 1, treatment_name: treatment_name,

 hamd_baseline: baseline, hamd_endpoint: endpoint, hamd_change: Math.round((baseline - endpoint) * 10) / 10,

 remission: endpoint <= 7 ? 1 : 0, age: Math.round(30 + Math.random() * 40), sex: Math.random() < 0.62 ? 'Female' : 'Male'

 };

 }

 },



 statin_cvd: {

 name: 'Statin Therapy for CVD Prevention (CTT Collaboration)',

 description: 'LDL cholesterol lowering with statins - major MACE outcomes',

 studies: [

 { id: '4S', n: 4444, year: 1994, statin: 'Simvastatin', population: 'secondary' },

 { id: 'WOSCOPS', n: 6595, year: 1995, statin: 'Pravastatin', population: 'primary' },

 { id: 'HPS', n: 20536, year: 2002, statin: 'Simvastatin', population: 'high_risk' },

 { id: 'JUPITER', n: 17802, year: 2008, statin: 'Rosuvastatin', population: 'elevated_CRP' },

 { id: 'CARDS', n: 2838, year: 2004, statin: 'Atorvastatin', population: 'diabetes' }

 ],

 generatePatient: (study, idx, studyRR) => {

 const age = Math.round(50 + Math.random() * 25);

 const diabetes = study.population === 'diabetes' ? 1 : (Math.random() < 0.2 ? 1 : 0);

 const prior_mi = study.population === 'secondary' ? (Math.random() < 0.5 ? 1 : 0) : 0;

 const treat = Math.random() < 0.5 ? 1 : 0;

 let baseRisk = study.population === 'secondary' ? 0.12 : study.population === 'high_risk' ? 0.08 : 0.04;

 baseRisk *= (1 + (age - 60) * 0.025) * (diabetes ? 1.6 : 1) * (prior_mi ? 2.0 : 1);

 const mace = Math.random() < Math.min(0.4, baseRisk) * (treat === 1 ? studyRR : 1) ? 1 : 0;

 return {

 study_id: study.id, patient_id: `${study.id}_${String(idx).padStart(5, '0')}`,

 treatment: treat, treatment_name: treat === 1 ? study.statin : 'Placebo',

 mace_event: mace, age: age, sex: Math.random() < 0.7 ? 'Male' : 'Female',

 ldl_baseline: Math.round(130 + Math.random() * 70), diabetes: diabetes, prior_mi: prior_mi,

 population: study.population, study_year: study.year

 };

 }

 },



 hiv_survival: {

 name: 'HIV Treatment Initiation Timing (ART-CC Collaboration)',

 description: 'When to start antiretroviral therapy - CD4-stratified analysis',

 studies: [

 { id: 'ART-CC-EUR', n: 12574, year: 2009, region: 'Europe' },

 { id: 'ART-CC-NAM', n: 8432, year: 2009, region: 'N.America' },

 { id: 'CASCADE', n: 4346, year: 2008, region: 'Europe' },

 { id: 'UK-CHIC', n: 7823, year: 2009, region: 'UK' }

 ],

 generatePatient: (study, idx, studyHR) => {

 const age = Math.round(28 + Math.random() * 30);

 const cd4 = Math.round(150 + Math.random() * 350);

 const vl = Math.round(10000 + Math.random() * 190000);

 const treat = Math.random() < 0.5 ? 1 : 0;

 let baseHazard = 0.002 * (cd4 < 200 ? 4 : cd4 < 350 ? 2 : 1) * (vl > 100000 ? 1.8 : 1);

 const hr = treat === 1 ? studyHR * (cd4 > 350 ? 0.95 : 0.7) : 1;

 const survTime = -Math.log(Math.random()) / (baseHazard * hr);

 const censorTime = 60 + Math.random() * 120;

 return {

 study_id: study.id, patient_id: `${study.id}_${String(idx).padStart(5, '0')}`,

 treatment: treat, treatment_name: treat === 1 ? 'Early ART' : 'Deferred ART',

 time_months: Math.round(Math.min(survTime, censorTime) * 10) / 10,

 event: survTime < censorTime ? 1 : 0, age: age, sex: Math.random() < 0.75 ? 'Male' : 'Female',

 baseline_cd4: cd4, baseline_viral_load: vl, region: study.region, study_year: study.year

 };

 }

 },



 covid_treatments: {

 name: 'COVID-19 Treatment Meta-Analysis (RECOVERY/Solidarity)',

 description: 'Mortality outcomes for COVID-19 treatments',

 studies: [

 { id: 'RECOVERY-Dex', n: 6425, year: 2020, treatment: 'Dexamethasone' },

 { id: 'RECOVERY-Toc', n: 4116, year: 2021, treatment: 'Tocilizumab' },

 { id: 'SOLIDARITY-Rem', n: 5451, year: 2020, treatment: 'Remdesivir' },

 { id: 'REMAP-CAP', n: 803, year: 2021, treatment: 'Tocilizumab' }

 ],

 generatePatient: (study, idx) => {

 const age = Math.round(50 + Math.random() * 30);

 const diabetes = Math.random() < 0.25 ? 1 : 0;

 const treat = Math.random() < 0.5 ? 1 : 0;

 const oxygen = Math.random() < 0.4 ? 'None' : Math.random() < 0.6 ? 'Low_flow' : Math.random() < 0.8 ? 'High_flow' : 'Ventilator';

 let baseRisk = oxygen === 'Ventilator' ? 0.4 : oxygen === 'High_flow' ? 0.2 : oxygen === 'Low_flow' ? 0.08 : 0.02;

 baseRisk *= (1 + (age - 60) * 0.03) * (diabetes ? 1.4 : 1);

 const treatEffect = study.treatment === 'Dexamethasone' && oxygen !== 'None' ? 0.8 :

 study.treatment === 'Tocilizumab' && oxygen !== 'None' ? 0.85 : 0.95;

 const mortality = Math.random() < Math.min(0.6, baseRisk) * (treat === 1 ? treatEffect : 1) ? 1 : 0;

 return {

 study_id: study.id, patient_id: `${study.id}_${String(idx).padStart(5, '0')}`,

 treatment: treat, treatment_name: treat === 1 ? study.treatment : 'Standard care',

 mortality_28d: mortality, age: age, sex: Math.random() < 0.6 ? 'Male' : 'Female',

 oxygen_requirement: oxygen, diabetes: diabetes, study_year: study.year

 };

 }

 }

 };



