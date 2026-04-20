function loadExampleData(type) {

 const dataset = EXAMPLE_DATASETS[type];

 if (!dataset) return;



 const data = [];



 const outcomeMapping = {

 'survival': 'survival', 'ovarian_survival': 'survival', 'breast_endocrine': 'survival', 'hiv_survival': 'survival',

 'binary': 'binary', 'statin_cvd': 'binary', 'covid_treatments': 'binary',

 'continuous': 'continuous', 'network_antidepressants': 'continuous',

 'pbc_liver': 'survival', 'heart_transplant': 'survival', 'portal_hypertension': 'survival',

 'bcg_tuberculosis': 'binary', 'magnesium_mi': 'binary', 'aspirin_stroke': 'binary',

 'nsclc_immunotherapy': 'survival', 'sglt2_heart_failure': 'survival'

 };

 const outcomeType = outcomeMapping[type] || 'survival';



 const effectMapping = {

 'survival': 0.72, 'ovarian_survival': 0.78, 'breast_endocrine': 0.82, 'hiv_survival': 0.65,

 'binary': 0.78, 'statin_cvd': 0.75, 'covid_treatments': 0.85,

 'continuous': 2.5, 'network_antidepressants': 3.0

 };

 const baseEffect = effectMapping[type] || 0.75;



 dataset.studies.forEach((study, studyIdx) => {



 const studyEffect = baseEffect * (0.85 + (studyIdx * 0.03) + (Math.sin(studyIdx) * 0.1));



 const n = Math.min(study.n, Math.round(study.n * 0.15));



 for (let i = 0; i < n; i++) {

 data.push(dataset.generatePatient(study, i + 1, studyEffect));

 }

 });



 APP.data = data;

 APP.variables = detectVariableTypes(data, Object.keys(data[0]));

 displayData();



 document.getElementById('outcomeType').value = outcomeType;

 updateOutcomeVars();



 setTimeout(() => {

 document.getElementById('varStudy').value = 'study_id';

 document.getElementById('varTreatment').value = 'treatment';



 const survivalTypes = ['survival', 'ovarian_survival', 'breast_endocrine', 'hiv_survival'];

 const binaryTypes = ['binary', 'statin_cvd', 'covid_treatments'];



 if (survivalTypes.includes(type)) {

 document.getElementById('varTime').value = 'time_months';

 document.getElementById('varEvent').value = 'event';

 } else if (binaryTypes.includes(type)) {



 if (type === 'statin_cvd' || type === 'binary') {

 document.getElementById('varEvent').value = 'mace_event';

 } else if (type === 'covid_treatments') {

 document.getElementById('varEvent').value = 'mortality_28d';

 }

 } else {



 document.getElementById('varEvent').value = 'hamd_change';

 }

 }, 100);



 const isNetwork = type === 'network_antidepressants';

 const treatments = isNetwork ? [...new Set(data.map(d => d.treatment_name))].length : 2;

 const notifMsg = isNetwork

 ? `Loaded ${dataset.name}: ${data.length} patients, ${dataset.studies.length} trials, ${treatments} treatments`

 : `Loaded ${dataset.name}: ${data.length} patients from ${dataset.studies.length} trials`;

 showNotification(notifMsg, 'success');

 if (typeof refreshBeyondR40MethodStatesIfOpen === 'function') {

 setTimeout(refreshBeyondR40MethodStatesIfOpen, 150);

 }

 scheduleAdoptionBoosterAfterDataLoad('example_dataset:' + type, {
 delayMs: 260,
 silent: true
 });

 }



