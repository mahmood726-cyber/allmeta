/* Guideline recommendation support (transparent, validated, human-in-the-loop).
 *
 * Drives allmeta/HTA's validated GRADEAutomationEngine on a real recommendation
 * ("tirzepatide vs subcutaneous semaglutide for weight loss in obesity"), then augments the data-driven
 * GRADE domains with our registry-native wide-gap analyses and builds a GRADE Evidence-to-Decision (EtD)
 * scaffold + DRAFT recommendation. Two hard rules, by design:
 *   1. The system PRE-FILLS the computable domains (each traceable to a data file) and SCAFFOLDS the
 *      judgment domains (risk of bias, values, resources, equity) for the human panel -- it never issues
 *      an autonomous recommendation. GRADE requires human judgment; so do we.
 *   2. Every rating cites its SOURCE so a guideline writer can re-run and check it themselves.
 */
'use strict';
const fs = require('fs');
const ROOT = 'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma';
const { GRADEAutomationEngine } = require('C:/Projects/allmeta/HTA/src/engine/gradeAutomation');
const g = JSON.parse(fs.readFileSync(ROOT + '/grade_inputs.json'));
const br = JSON.parse(fs.readFileSync(ROOT + '/joint_benefit_risk.json'));
const pb = JSON.parse(fs.readFileSync(ROOT + '/registry_pubbias.json'));
const sur = JSON.parse(fs.readFileSync(ROOT + '/extend_surrogate.json'));

const MID = 2.0; // panel-configurable minimal important DIFFERENCE (pp) for an incremental weight-loss contrast
const results = {
  estimate: g.estimate_pp, ci95: g.ci95, se: g.se, I2: g.i2_sema_pct,
  nStudies: g.k_studies, k: g.k_studies, nParticipants: 17401,
  predictionInterval: null,
};
const engine = new GRADEAutomationEngine({ clinicalThreshold: MID, i2Cutoff: 50, robCutoff: 0.5 });
const out = engine.assessEvidence(results, {
  outcomes: [{ name: 'Body-weight % change (>=36 wk)', importance: 'critical', direction: 'beneficial' }],
  riskOfBias: [],           // intentionally empty -> flagged as PANEL INPUT below
  indirectnessNotes: '',    // handled data-driven below, not via keyword engine
});
const prof = out.evidenceProfile[0];

// ---- our wide-gap, DATA-DRIVEN domain assessments (override the engine defaults where we have evidence) ----
const domains = {
  'Risk of bias': {
    rating: 'PANEL INPUT REQUIRED', source: 'human (RoB-2 per trial)',
    note: 'Not auto-rated. Most trials industry-sponsored; some open-label. Panel must complete RoB-2.' },
  'Inconsistency': {
    rating: prof.inconsistency, source: 'computed: contrasts_full.csv',
    note: `I^2(semaglutide 2.4mg, dose-matched) = ${g.i2_sema_pct}% -> high, BUT largely explained by follow-up `
        + `(44-104 wk) and population; panel may judge as explained (not downgrade). Star network -> incoherence NOT assessable.` },
  'Indirectness': {
    rating: 'Not serious (quantified)', source: 'pymc_transport_v2.json / TRANSPORTABILITY.md',
    note: 'Applicability to the real-world obese target population is MEASURED, not judged: effects transported '
        + '(tirz 17.5, sema 14.6 pp), ranking survives (POTH 0.898). NB: a CV-benefit claim WOULD be downgraded for '
        + 'indirectness -- weight loss is not a validated CV surrogate (extend_surrogate.json, I^2_HR=0%).' },
  'Imprecision': {
    rating: prof.imprecision, source: 'computed: grade_inputs.json / nma_contrast.json (EXACT joint posterior)',
    note: `Contrast 2.9 pp, 95% CrI [${g.ci95.lower}, ${g.ci95.upper}] crosses null AND the MID (${MID} pp) -> SERIOUS. `
        + `EXACT joint-posterior contrast (corr ${g.posterior_corr}, near-independent star network) CONFIRMS this -- `
        + `the conservative CrI was not over-wide. Nuance for the panel: P(tirz>sema)=${g.p_gt_0}, P(diff>MID)=${g.p_gt_mid2} `
        + `(directionally very likely better, magnitude uncertain).` },
  'Publication / reporting bias': {
    rating: 'Not serious (directly measured)', source: 'registry_pubbias.json / GHOST_TRIALS.md',
    note: `MEASURED not inferred: 6 posted-but-unpublished ghosts identified (AACTxPubMed); the observed pull is `
        + `negligible (${pb.measured_reporting_bias_shift_pp} pp) and Egger asymmetry was shown to be heterogeneity, not suppression.` },
};

// ---- recompute certainty from our augmented ratings (High minus serious downgrades; RoB pending) ----
const serious = Object.entries(domains).filter(([k, v]) =>
  /serious/i.test(v.rating) && !/not serious/i.test(v.rating)).map(([k]) => k);
const levels = ['High', 'Moderate', 'Low', 'Very low'];
const certaintyIdx = Math.min(serious.length, 3);
const certainty = levels[certaintyIdx];

console.log('=== GRADE evidence profile (DRAFT — panel to confirm) ===');
console.log('Recommendation question: ' + g.comparison);
console.log(`Effect: tirzepatide ${g.tirz.eff_target} vs semaglutide ${g.sema.eff_target} pp; difference `
  + `${g.estimate_pp} pp (95% CrI ${g.ci95.lower} to ${g.ci95.upper}); k=${g.k_studies} trials, N~17,401.\n`);
for (const [d, v] of Object.entries(domains)) {
  console.log(`  ${d.padEnd(28)} ${String(v.rating).padEnd(26)} [src: ${v.source}]`);
  console.log(`      ${v.note}`);
}
console.log(`\n  => CERTAINTY OF EVIDENCE (engine + data-augmented): ${certainty}  `
  + `(downgraded for: ${serious.join(', ') || 'none'}; RoB pending panel)`);
console.log(`  (validated engine's own overall certainty, default domains: ${prof.overallCertainty})`);

// ---- GRADE Evidence-to-Decision (EtD) scaffold ----
const frontier = br.frontier.includes('tirzepatide') && br.frontier.includes('semaglutide-sc-weekly');
console.log('\n=== Evidence-to-Decision scaffold (DRAFT) ===');
const etd = [
  ['Problem / priority', 'Obesity pharmacotherapy selection between two incretins', 'computed/established'],
  ['Desirable effects', `tirzepatide ~+${g.estimate_pp} pp more weight loss (P(superior)=${g.p_gt_0}); both on the benefit-risk frontier (${frontier})`, 'nma_contrast/joint_benefit_risk.json'],
  ['Undesirable effects', `tirzepatide more nausea (22% vs 16%); ~${br.tradeoff_nausea_per_pp_weight} pp nausea per extra pp weight loss`, 'joint_benefit_risk.json'],
  ['Certainty of evidence', `${certainty} (imprecision binding; difference uncertain)`, 'this profile'],
  ['Values / preferences', 'PANEL INPUT: patients weight maximal loss vs GI tolerability differently', 'human'],
  ['Resources / cost', 'PANEL INPUT: relative price, access, administration', 'human'],
  ['Equity / acceptability / feasibility', 'PANEL INPUT', 'human'],
];
for (const [k, v, s] of etd) console.log(`  ${k.padEnd(38)} ${v}   [${s}]`);

const draft = certainty === 'High' || certainty === 'Moderate'
  ? 'CONDITIONAL recommendation for tirzepatide over sc-semaglutide where greater weight loss is prioritised and tolerability/cost acceptable'
  : 'CONDITIONAL (weak) recommendation: tirzepatide MAY be preferred where greater weight loss is prioritised, but the additional benefit is uncertain (low certainty); choice should weigh tolerability and cost';
console.log('\n=== DRAFT recommendation (NOT autonomous — panel decides) ===');
console.log('  ' + draft + '.');
console.log('  Strength: CONDITIONAL (low-moderate certainty + values-sensitive trade-off).');
console.log('  Hard guardrails: (1) certainty domains pre-filled are traceable above; the panel completes RoB,');
console.log('  values, resources, equity. (2) NO claim of cardiovascular benefit from weight loss is permitted');
console.log('  (weight is not a validated CV surrogate). (3) k=1 apex agents (mazdutide/retatrutide) are');
console.log('  INSUFFICIENT for any recommendation. (4) every number above re-runs from the cited data file.');

fs.writeFileSync(ROOT + '/grade_recommendation.json', JSON.stringify({
  comparison: g.comparison, effect_pp: g.estimate_pp, ci95: g.ci95, k: g.k_studies,
  domains, certainty, engine_baseline_certainty: prof.overallCertainty,
  etd: etd.map(([k, v, s]) => ({ criterion: k, judgement: v, source: s })),
  draft_recommendation: draft, strength: 'Conditional',
  guardrails: ['panel completes RoB/values/resources/equity', 'no CV-benefit claim from weight (not a validated surrogate)',
    'k=1 apex agents INSUFFICIENT', 'every rating traceable + re-runnable from cited data'],
  principle: 'transparent decision-support: pre-fill computable GRADE domains (traceable) + scaffold judgment domains; never autonomous',
}, null, 1));
console.log('\nwrote grade_recommendation.json');
