'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const readText = p => {
  const bytes = fs.readFileSync(path.join(__dirname, p));
  return bytes.toString(bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf16le' : 'utf8').replace(/^\uFEFF/, '');
};
const read = p => JSON.parse(readText(p));
const a = read('agreement.json'), replay = read('plus-replay.json'), exact = read('exact-replay.json');
const r = read('default-warnings.json'), controls = read('controls.json'), mutations = read('mutation-results.json');
const tests = readText('node-tests.log');
assert.equal(a.agreement, 99); assert.equal(a.passed, true);
assert.equal(replay.passed, 54612); assert.equal(replay.checks, 54612); assert.equal(replay.failedChecks, 0);
assert.equal(exact.fits, 2023); assert.equal(exact.refusals, 1);
assert.equal(mutations.length, 2); assert.ok(mutations.every(m => m.exitCode === 1));
assert.match(tests, /pass 13/); assert.match(tests, /fail 0/);
const byClass = ['a', 'b', 'control'].map(c => {
  const fits = a.fits.filter(f => f.classification === c);
  return `| ${c} | ${fits.length} | ${fits.filter(f => f.diagnostic.verdict === 'boundary maximum').length} | ${fits.filter(f => f.diagnostic.verdict === 'flat likelihood: estimates not unique').length} | ${fits.filter(f => f.diagnostic.verdict === 'unique interior maximum').length} |`;
});
const profilePoints = a.fits.flatMap(f => f.diagnostic.profiles.flatMap(p => p.points));
const warnings = pkg => r.fits.filter(f => f[pkg].warnings.length).length;
const errors = pkg => r.fits.filter(f => f[pkg].error);
const errorText = ['mvmeta','metafor'].flatMap(pkg => errors(pkg).map(f => `- ${pkg}: \`${f.id}\`: ${f[pkg].error}`));
const paper = 'An in-app diagnostic reports optimizer starts, near-equal covariance candidates, boundary flags and local variance profiles without changing fitted estimates. It agreed with an R oracle on 69 challenging fits and 30 independently selected interior controls. Default mvmeta and metafor runs emitted no fitting warnings for these challenging inputs, although metafor failed to converge for one fit; they did not supply the multistart/profile classification. These finite-tolerance diagnostics describe numerical sensitivity, not structural non-identifiability or proof of a global maximum.';
assert.ok(paper.split(/\s+/).length <= 80);
const sources = ['shared/multivariate-ma.js', 'multivariate-ma/index.html', 'multivariate-ma/plus-ui.js', 'multivariate-ma/plus.js',
  'multivariate-ma/tests/diagnostic.cjs', 'hub/shared/tests/multivariate-ma-diagnostic.spec.mjs'];
const repo = path.resolve(__dirname, '../../..');
const hashes = sources.map(p => ({ path: p, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(repo, p))).digest('hex') }));
fs.writeFileSync(path.join(__dirname, 'final-hashes.json'), JSON.stringify(hashes, null, 2) + '\n');
const text = `# P18 diagnostic result

**99/99 diagnostic agreement; 54,612/54,612 pinned replay checks; 13/13 Node tests.**
All 2,023 successful corpus fit objects retain every preexisting field exactly
(deepStrictEqual, no tolerance); the one refused input has the identical error.
The 99 diagnostic fits also match the saved original engine exactly.
Verification repeated on 2026-10-21: diagnostic agreement, both mutation
failures, Node tests and both corpus replays passed. All 41 provenance hashes
matched, and the saved baseline matched the requested Git revision. This
recheck reused the saved R oracle and default-warning evidence; R was not rerun.
No Git writes or browser launches were made. Checkout baseline:
\`d15e49d9913c6f5d56714cb296e8a4d631fc456d\`.

| Oracle class | Fits | Boundary | Flat | Unique interior |
|---|---:|---:|---:|---:|
${byClass.join('\n')}

## Implementation

- \`allmeta/shared/multivariate-ma.js\`: every successful fit carries
  \`diagnostic\`: starts run, near-best covariance clusters within 1e-8,
  best-minus-default-start likelihood, indexed variance/correlation boundary
  flags, nuisance-reoptimized variance profiles, curvature and verdict.
  Univariate fits retain the same object.
- \`allmeta/multivariate-ma/index.html\`: a short result note with
  \`role=status\`; hidden for interior fits and cleared on refusal or empty input.
  The main JSON export includes the complete diagnostic.
- \`allmeta/multivariate-ma/plus-ui.js\` and \`plus.js\`: sweep and univariate
  JSON exports retain diagnostics without changing displayed numbers.
- \`allmeta/multivariate-ma/tests/diagnostic.cjs\`: numerical, UI/export,
  invalid-input and comparison integrity tests.
- \`allmeta/hub/shared/tests/multivariate-ma-diagnostic.spec.mjs\`: browser
  coverage of visibility, live status, downloaded JSON, sweep and stale state.
- \`allmeta/multivariate-ma/validate/diagnostic/\`: standalone validation tier;
  \`PREREG.md\`, \`prepare.cjs\`, \`oracle.R\`, \`compare.cjs\`, \`run.cjs\`,
  \`verify.ps1\`, \`exact-replay.cjs\`, \`report.cjs\` and saved evidence.
  \`final-hashes.json\` identifies the changed production/test sources.

## Oracle and integrity evidence

The unchanged pre-registration SHA-256 is
\`${a.preregSHA256}\`. The 69 complete fit IDs join P18LL's saved classifications
and per-job JSON; numerical duplicates retain their own IDs. Source hashes are
in \`provenance.json\`; inputs and expected verdicts are in \`hard.json\`.

R selected the first 30 eligible, numerically distinct controls in registered
corpus order after ${controls.attempted.length} candidates. Eligibility required
an interior covariance, non-flat profiles under the registered offsets,
positive observed information and refined multistart mvmeta/metafor likelihood
agreement within 1e-6. Selection used no JavaScript verdicts. Full selection
evidence is in \`controls.json\`. \`CONTROL-IMPLEMENTATION.md\` documents the
secondary optimizer fallback; \`controls-initial.json\` and
\`oracle-initial.log\` retain the stopped first implementation.
The controls comprise 15 Berkey fits, 12 fibrinogen fits and 3 outcome-reversed
Berkey fits. They are 30 fit-level cases, not 30 independent datasets.

\`agreement.json\` retains all 99 diagnostics. ${profilePoints.length}/${profilePoints.length}
offset searches were finite; ${profilePoints.filter(p => p.converged).length}/${profilePoints.length}
reported simplex convergence. \`mutation-results.json\` and the two mutation
logs record **98/99 and exit 1** for both a forced wrong verdict and a dropped
fit. The expected denominator remains 99. The comparator also rejects duplicate
and unexpected IDs.

\`plus-replay.json\`/\`plus-replay.log\` record the unchanged 54,612-check
contract, including the existing one likelihood-adjudicated fit.
\`exact-replay.json\` records exact equality against \`baseline-engine.cjs\`.
\`node-tests.log\` records 13 passes. The first isolated Node test launch was
blocked by child-process EPERM; the successful run used
\`--test-isolation=none\`. Mutation CLI exits were checked from PowerShell.

## What R printed by default

Versions: ${r.metadata.R}; mvmeta ${r.metadata.mvmeta}; metafor ${r.metadata.metafor}.
The separate warning run supplied no optimizer controls or starting covariance.
It covers 32 distinct inputs, expanded to all 69 IDs in
\`default-warnings.json\`, preserving literal printed output, warnings, errors,
convergence and likelihoods. mvmeta: ${warnings('mvmeta')}/69 fits with warnings,
${errors('mvmeta').length}/69 errors; metafor: ${warnings('metafor')}/69 fits with
warnings, ${errors('metafor').length}/69 errors.

${errorText.join('\n')}

Successful default printouts contain the usual model/estimate summaries; they
do not supply this multistart/profile verdict. Warning silence alone cannot
establish uniqueness. P18LL's original “default” was the exported single-start
mvmeta call with tightened controls; this new default-warning experiment uses
untouched package optimizer settings and is a separate result.

## Reproduction

From \`allmeta/multivariate-ma/validate/diagnostic\`:

\`\`\`powershell
node prepare.cjs C:/Users/User/p18ll
$env:R_ENVIRON_USER = 'NUL'
$env:R_LIBS_USER = 'C:/Users/User/allmeta-offload/Rlib_dta'
$env:R_LIBS = 'C:/Users/User/allmeta-offload/Rlib_extra'
& 'C:/Program Files/R/R-4.6.0/bin/Rscript.exe' --vanilla oracle.R
./verify.ps1
node exact-replay.cjs
node ../run-plus-node.cjs plus-replay.json
node --test --test-isolation=none ../../tests/diagnostic.cjs ../../tests/review-regressions.cjs
node report.cjs
\`\`\`

For regeneration of the report, save Node test output to \`node-tests.log\`
and pinned replay output to \`plus-replay.log\`. \`oracle.R\` reuses complete
saved default-warning evidence; remove only that generated JSON to rerun the
untouched-default experiment.

Playwright commands, **listed only, not run**:

\`\`\`powershell
cd allmeta/hub/shared/tests
npx playwright test multivariate-ma-diagnostic.spec.mjs --config=playwright.config.mjs
npx playwright test multivariate-ma-plus.spec.mjs --config=playwright.config.mjs
\`\`\`

## Limits

“Distinct optima” counts covariance clusters among the final, screened and
refined candidates; it does not certify distinct stationary points. Starts
count original seeds (5 bivariate, 3 univariate, 0 for exact two-study fits),
excluding diagnostic nuisance searches and continuation refinements. The
default-start gap uses the moment start's 600-iteration screen, explicitly
labelled in JSON; it is not the gap to R's default or an equally polished
single-start run. Two-study gaps are null.

Boundary precedence uses variance <=1e-10*max(1, mean sampling variance) or
abs(rho)>=1-1e-6. Variance offsets are 1e-4*max(1, fitted variance); both
offset likelihood changes must be below 1e-6 to flag a flat profile.
These unit-dependent, local, finite-search checks do not prove a unique/global
maximum or structural identifiability. Controls are selected for the registered
numerical definition and do not estimate population specificity. Statistical
oracle validation is bivariate; the generic engine preservation test is not
an R validation of higher-dimensional models. Browsers were not run.

## Paper paragraph (${paper.split(/\s+/).length} words)

${paper}

LANE DONE
`;
fs.writeFileSync(path.resolve(__dirname, '../../../../RESULT.md'), text);
console.log('RESULT.md written; paper words:', paper.split(/\s+/).length);
