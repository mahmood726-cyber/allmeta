'use strict';
// A fit that did not converge must not be reported as converged.
//   node dev/tests/p60_convergence_flags.test.cjs [path/to/ipd-meta-pro.html]
// Complete separation (every treated participant has the event, no control does) has no finite
// treatment-effect MLE: glmer warns and returns a huge estimate. The page's tau2 = 0 boundary
// shortcut ran a GLM by IRLS and declared convergence even when IRLS had not converged.
const path = require('node:path');
const { loadPage } = require('./p60_page_loader.cjs');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const { run, sandbox } = loadPage(pageFile);
let failed = 0;
function check(name, ok, detail) { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  [' + detail + ']' : '')); if (!ok) failed++; }

{
  const rows = [];
  for (let s = 0; s < 4; s++) for (let i = 0; i < 40; i++) { const t = i % 2; rows.push({ study: 'S' + s, treatment: t, event: t }); }
  sandbox.__rows = rows;
  const g = run('OneStageGLMM.fitBinary(__rows, "event", "treatment", "study", [], {})');
  check('GLMM under complete separation is not reported as converged', g && g.convergence && g.convergence.converged === false,
    'converged ' + (g && g.convergence && g.convergence.converged) + ' logOR ' + (g && g.treatment && g.treatment.logOR));
}
// the boundary shortcut must still work where the GLM does converge (same data as the archive regression test)
{
  const rows = [];
  for (let s = 0; s < 4; s++) { for (let i = 0; i < 100; i++) rows.push({ study: 'S' + s, treatment: 1, event: i < 20 ? 1 : 0 }); for (let i = 0; i < 100; i++) rows.push({ study: 'S' + s, treatment: 0, event: i < 30 ? 1 : 0 }); }
  sandbox.__rows = rows;
  const g = run('OneStageGLMM.fitBinary(__rows, "event", "treatment", "study", [], {})');
  check('GLMM at the tau2 = 0 boundary with a convergent GLM is still converged', g.convergence.converged === true && g.tau2 < 1e-12,
    'converged ' + g.convergence.converged + ' tau2 ' + g.tau2);
}
console.log(failed ? 'FAILED ' + failed : 'ALL PASS');
process.exit(failed ? 1 : 0);
