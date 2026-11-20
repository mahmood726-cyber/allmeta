'use strict';
// Requirement: the post-upload auto-mapper never maps an identifier column (patient_id, subject, record, a column
// unique to every row) as the outcome or as an automatically chosen covariate, and when it cannot identify the
// outcome from the column names it does NOT run an analysis by itself: it asks the user to check the mapping.
// Root cause (user path, Lee 2004 acupoint PONV IPD: patient_id, study_id, treatment, nausea, age, female): no
// column name contains an outcome keyword, so ipd80InferOutcomeType fell through to 'continuous' and the
// continuous branch of ipd80AutoMapVariables took the first numeric column that is not study/treatment/time/year:
// patient_id. runAdoptionBoosterAfterDataLoad then ran runAnalysis() on it and the page showed a pooled mean
// difference of patient numbers (-42.33).
//   node dev/tests/auto_map_identifier_columns.test.cjs [path/to/ipd-meta-pro.html]
const path = require('node:path');
const { loadPage } = require('./p60_page_loader.cjs');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const { run, sandbox } = loadPage(pageFile);
let passed = 0, failed = 0;
const check = (name, ok, detail) => { if (ok) passed++; else failed++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  [' + String(detail).slice(0, 400) + ']')); };

// A small file with the shape of the uploaded one (deterministic rows; values are not used for any number here).
function lee(n) {
  const rows = ['patient_id,study_id,treatment,nausea,age,female'];
  for (let i = 1; i <= n; i++) rows.push([i, 'S' + (1 + (i % 6)), Math.floor(i / 6) % 2, (i * 7) % 3 === 0 ? 1 : 0, 30 + (i * 13) % 40, (i * 5) % 2].join(','));
  return rows.join('\n') + '\n';
}
// Load rows the way an upload does (parseDelimited), give the four mapping <select>s the uploaded columns as their
// options (the simulated DOM has none), and record whether runAnalysis is called.
function load(text) {
  sandbox.__t = text;
  return run(`(function () {
    var p = parseDelimited(__t);
    APP.data = p.data; APP.variables = p.headers.slice(); APP.declaredOutcome = null; APP.results = null;
    APP.firstRunBoosterState = null; APP.analysisRunning = false;
    ['varStudy', 'varTreatment', 'varTime', 'varEvent'].forEach(function (id) {
      var el = document.getElementById(id);
      el.options = [{ value: '' }].concat(p.headers.map(function (h) { return { value: h }; }));
      el.value = '';
    });
    window.__runCalls = 0; window.__notes = [];
    runAnalysis = function () { window.__runCalls++; };
    showNotification = function (m, t) { __notes.push(String(t) + ': ' + String(m)); };
    return p.headers;
  })()`);
}
const ID_LIKE = /^(patient_id|subject|record_no|row)$/;

{
  load(lee(120));
  const rep = JSON.parse(JSON.stringify(run('ipd80AutoMapVariables({ silent: true })')));
  check('Lee-shaped upload: the outcome is not patient_id', rep.mapped.varEvent !== 'patient_id', JSON.stringify(rep.mapped));
  check('... nor any other identifier-like column', !ID_LIKE.test(rep.mapped.varEvent || ''), JSON.stringify(rep.mapped));
  check('... the outcome is not called confident (no column name names an outcome)', rep.outcomeConfident === false, JSON.stringify(rep));
  check('... it suggests the one column left after identifiers, study, treatment and patient characteristics: nausea (binary)',
    rep.outcomeGuess === 'nausea' && rep.mapped.varEvent === 'nausea' && rep.outcomeType === 'binary', JSON.stringify(rep));
  check('... the event/outcome control on the form does not hold patient_id', run("document.getElementById('varEvent').value") !== 'patient_id', run("document.getElementById('varEvent').value"));
  const b = JSON.parse(JSON.stringify(run("runAdoptionBoosterAfterDataLoad('upload', { silent: true })")));
  check('the post-upload booster does not run an analysis when the outcome is not identified', run('__runCalls') === 0 && b.ranAnalysis === false, JSON.stringify({ calls: run('__runCalls'), b }));
  check('... it records why', /outcome/i.test(String(b.skippedReason || '')), String(b.skippedReason));
  check('... and asks the user to map the columns', run('__notes').some((n) => /map|outcome/i.test(n) && /column|variable/i.test(n)), JSON.stringify(run('__notes')));
}
{
  // Other identifier spellings, and a numeric column that is unique per row; no outcome keyword anywhere.
  for (const idName of ['subject', 'record_no', 'row']) {
    load(lee(80).replace(/^patient_id/, idName));
    const rep = JSON.parse(JSON.stringify(run('ipd80AutoMapVariables({ silent: true })')));
    check('identifier "' + idName + '" is never the outcome', rep.mapped.varEvent !== idName, JSON.stringify(rep.mapped));
  }
  load(lee(80).replace(/^patient_id/, 'serial'));
  const rep = JSON.parse(JSON.stringify(run('ipd80AutoMapVariables({ silent: true })')));
  check('a numeric column with a different integer on every row ("serial") is never the outcome', rep.mapped.varEvent !== 'serial', JSON.stringify(rep.mapped));
}
{
  // Two candidate outcome columns and no outcome name: nothing is suggested, the event control is left empty.
  load(lee(80).replace(',female', ',vomit'));
  const rep = JSON.parse(JSON.stringify(run('ipd80AutoMapVariables({ silent: true })')));
  check('two unnamed candidate outcomes (nausea, vomit): no outcome mapped, not confident, control empty',
    rep.mapped.varEvent === '' && rep.outcomeConfident === false && rep.pass === false && run("document.getElementById('varEvent').value") === '', JSON.stringify(rep));
  run("document.getElementById('varEvent').value = 'patient_id'; ipd80AutoMapVariables({ silent: true })");
  check('... an identifier left on the event control is cleared', run("document.getElementById('varEvent').value") === '', run("document.getElementById('varEvent').value"));
  run("document.getElementById('varEvent').value = 'vomit'; ipd80AutoMapVariables({ silent: true })");
  check('... a column the user chose there is kept', run("document.getElementById('varEvent').value") === 'vomit', run("document.getElementById('varEvent').value"));
}
{
  // Review of #644: a name ending in code/no/num/number/key is an identifier only after an id-like head (patient,
  // subject, record, participant, ...). response_code, status_code and event_no are outcomes; a 0/1 column is never
  // an identifier by its name alone.
  const NL = String.fromCharCode(10);
  const csv = (headers, n, gen) => [headers.join(',')].concat(Array.from({ length: n }, (_, k) => headers.map((h) => gen(h, k + 1)).join(','))).join(NL) + NL;
  const base = (h, i) => h === 'pid' ? i : h === 'study_id' ? 'S' + (1 + i % 5) : h === 'treatment' ? Math.floor(i / 5) % 2 : null;
  const bin = (i) => (i * 7) % 3 === 0 ? 1 : 0;
  load(csv(['pid', 'study_id', 'treatment', 'response_code', 'baseline_score'], 30, (h, i) => base(h, i) ?? (h === 'response_code' ? bin(i) : 10 + (i * 3) % 17)));
  let rep = JSON.parse(JSON.stringify(run('ipd80AutoMapVariables({ silent: true })')));
  check('response_code (0/1) + baseline_score: binary outcome response_code, never the continuous baseline_score',
    rep.outcomeType === 'binary' && rep.mapped.varEvent === 'response_code', JSON.stringify(rep));
  for (const name of ['status_code', 'event_no']) {
    load(csv(['pid', 'study_id', 'treatment', name, 'age'], 30, (h, i) => base(h, i) ?? (h === name ? bin(i) : 30 + i % 40)));
    rep = JSON.parse(JSON.stringify(run('ipd80AutoMapVariables({ silent: true })')));
    check(name + ' (0/1): binary outcome ' + name + ', confident', rep.outcomeType === 'binary' && rep.mapped.varEvent === name && rep.outcomeConfident === true, JSON.stringify(rep));
  }
  const names = { response_code: false, status_code: false, event_no: false, events_num: false, baseline_score: false, cost_key: false,
    patient_no: true, patient_code: true, subject_number: true, record_num: true, participant_key: true, id_no: true, patient_id: true, pid: true };
  for (const k of Object.keys(names)) {
    sandbox.__n = k;
    check('identifier by name: ' + k + ' -> ' + names[k], run('ipd80IsIdentifierName(__n)') === names[k], String(run('ipd80IsIdentifierName(__n)')));
  }
  load(csv(['pid', 'study_id', 'treatment', 'case', 'age'], 30, (h, i) => base(h, i) ?? (h === 'case' ? bin(i) : 30 + i % 40)));
  check('a 0/1 column named "case" is not an identifier', run("ipd80IsIdentifierField('case')") === false, String(run("ipd80IsIdentifierField('case')")));
}
{
  // Review of #644, minor 2: auto-map (also called by Fast Path and the SOP lock) never clears a column the user chose
  // by hand on the Event control, even one that looks like an identifier; one left there by code is still cleared.
  const NL = String.fromCharCode(10);
  const rows = ['patient_id,study_id,treatment,nausea,vomit,cost,case'];
  for (let i = 1; i <= 40; i++) rows.push([i, 'S' + (1 + i % 5), Math.floor(i / 5) % 2, i % 3 === 0 ? 1 : 0, i % 4 === 0 ? 1 : 0, 1000 + i * 37, i % 2].join(','));
  load(rows.join(NL) + NL);
  check('cost (a different integer on every row) looks like an identifier', run("ipd80IsIdentifierField('cost')") === true, '');
  for (const v of ['cost', 'case', 'patient_id']) {
    sandbox.__v = v;
    run("(function () { var el = document.getElementById('varEvent'); el.value = __v; ipd80NoteUserSelect('varEvent', el.value); ipd80AutoMapVariables({ silent: true }); })()");
    check('a column the user chose by hand on the Event control (' + v + ') is kept by auto-map', run("document.getElementById('varEvent').value") === v, run("document.getElementById('varEvent').value"));
  }
  // a choice made for another file does not protect the column in this one
  run("ipd80NoteUserSelect('varEvent', 'patient_id')");
  load(rows.join(NL).replace(/,S/g, ',T') + NL);
  run("document.getElementById('varEvent').value = 'patient_id'; ipd80AutoMapVariables({ silent: true })");
  check('... a hand choice made before a different file was loaded does not stop the identifier being cleared', run("document.getElementById('varEvent').value") === '', run("document.getElementById('varEvent').value"));
  load(rows.join(NL) + NL);
  run("ipd80NoteUserSelect('varEvent', 'vomit'); document.getElementById('varEvent').value = 'patient_id'; ipd80AutoMapVariables({ silent: true })");
  check('... after the user then chose vomit, an identifier put there by code (not by the user) is still cleared', run("document.getElementById('varEvent').value") === '', run("document.getElementById('varEvent').value"));
}
{
  // Review of #644, minor 3: weight (a patient characteristic) as the only candidate: nothing is suggested or run,
  // and the warning tells the user to map the outcome.
  const NL = String.fromCharCode(10);
  const rows = ['pid,study_id,treatment,weight,age'];
  for (let i = 1; i <= 30; i++) rows.push([i, 'S' + (1 + i % 5), Math.floor(i / 5) % 2, 60.5 + (i * 7) % 30, 30 + i % 40].join(','));
  load(rows.join(NL) + NL);
  const b = JSON.parse(JSON.stringify(run("runAdoptionBoosterAfterDataLoad('upload3', { silent: true })")));
  check('weight-only file: no analysis run', run('__runCalls') === 0 && b.ranAnalysis === false, JSON.stringify(b));
  check('... the warning says to map the outcome', run('__notes').some((n) => /^warning/.test(n) && /map the columns/i.test(n) && /outcome/i.test(n)), JSON.stringify(run('__notes')));
}
{
  // Beyond-R methods choose a covariate by themselves (numericCovariateField): with no preferred name (age, bmi, ...)
  // they took the first numeric column, i.e. patient_id. The identifier is skipped; the next numeric column is used.
  const NL = String.fromCharCode(10);
  sandbox.__t = ['patient_id,study_id,treatment,y,dose'].concat(Array.from({ length: 60 }, (_, i) => [i + 1, 'S' + (1 + i % 4), Math.floor(i / 4) % 2, (i * 3) % 7, 10 + (i * 11) % 5].join(','))).join(NL) + NL;
  run(`(function () {
    var p = parseDelimited(__t); APP.data = p.data; APP.variables = p.headers.slice(); APP.results = null;
    APP.config.studyVar = 'study_id'; APP.config.treatmentVar = 'treatment'; APP.config.eventVar = 'y';
    var g = document.getElementById.bind(document), els = {};
    document.getElementById = function (id) { if (id === 'beyondR40Results' || id === 'beyondR40Output') return els[id] || (els[id] = { style: {}, innerHTML: '' }); return g(id); };
    getBeyondR40MethodAvailability = function () { return {}; };
    window.__cov = null; BeyondR40.ecologicalBiasDecomp = function (d, o, t, c) { window.__cov = c; return { error: 'stub' }; };
    try { runBeyondR40('ecologicalBiasDecomp'); } catch (e) { window.__covErr = String(e); }
    document.getElementById = g;
  })()`);
  check('Beyond-R automatic covariate: not patient_id (the next numeric column, dose)', run('__cov') === 'dose', String(run('__cov')) + ' ' + String(run('window.__covErr')));
}
{
  // A file whose outcome IS named: mapping stays confident and the booster still runs the analysis, as before.
  load(lee(120).replace(',nausea,', ',outcome,'));
  const rep = JSON.parse(JSON.stringify(run('ipd80AutoMapVariables({ silent: true })')));
  check('named outcome column ("outcome", 0/1): binary / outcome, confident', rep.outcomeType === 'binary' && rep.mapped.varEvent === 'outcome' && rep.outcomeConfident === true, JSON.stringify(rep));
  const b = JSON.parse(JSON.stringify(run("runAdoptionBoosterAfterDataLoad('upload2', { silent: true })")));
  check('... and the booster still runs the analysis', run('__runCalls') === 1 && b.ranAnalysis === true, JSON.stringify({ calls: run('__runCalls'), b }));
}
{
  // Built-in examples: the mapping each gives is exactly the one it gave before (pinned here from origin/main
  // d06a67fb), and it is confident.
  const pinned = {
    survival: { varStudy: 'study_id', varTreatment: 'treatment', varTime: 'time_months', varEvent: 'event', outcomeType: 'survival' },
    binary: { varStudy: 'study_id', varTreatment: 'treatment', varTime: '', varEvent: 'mace_event', outcomeType: 'binary' },
    continuous: { varStudy: 'study_id', varTreatment: 'treatment', varTime: '', varEvent: 'hamd_change', outcomeType: 'continuous' },
    ovarian_survival: { varStudy: 'study_id', varTreatment: 'treatment', varTime: 'time_months', varEvent: 'event', outcomeType: 'survival' },
    breast_endocrine: { varStudy: 'study_id', varTreatment: 'treatment', varTime: 'time_months', varEvent: 'event', outcomeType: 'survival' },
    network_antidepressants: { varStudy: 'study_id', varTreatment: 'treatment', varTime: '', varEvent: 'hamd_change', outcomeType: 'continuous' },
    statin_cvd: { varStudy: 'study_id', varTreatment: 'treatment', varTime: '', varEvent: 'mace_event', outcomeType: 'binary' },
    hiv_survival: { varStudy: 'study_id', varTreatment: 'treatment', varTime: 'time_months', varEvent: 'event', outcomeType: 'survival' },
    covid_treatments: { varStudy: 'study_id', varTreatment: 'treatment', varTime: '', varEvent: 'mortality_28d', outcomeType: 'binary' }
  };
  for (const k of Object.keys(pinned)) {
    sandbox.__k = k;
    const r = JSON.parse(JSON.stringify(run('(function () { loadExampleData(__k); var rep = ipd80AutoMapVariables({ silent: true }); return { mapped: rep.mapped, pass: rep.pass, confident: rep.outcomeConfident }; })()')));
    check('example ' + k + ': same mapping as before, confident', JSON.stringify(r.mapped) === JSON.stringify(pinned[k]) && r.pass === true && r.confident === true, JSON.stringify(r));
  }
}
console.log(passed + '/' + (passed + failed) + ' PASS');
process.exitCode = failed ? 1 : 0;
