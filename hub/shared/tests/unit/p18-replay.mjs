// Read-only numerical evidence; full output is kept in the OS temporary directory.
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { input, reference, originalReference, supplement, app, parsed, multivariate,
  univariate, differences, refFor } from './p18-parity-support.mjs';
const failures = [], cases = [];
for (const c of input.cases) {
  const ref = refFor(c.id), out = app.plus.compute(parsed(c.studies));
  const summary = { id: c.id, appStatus: out.status, RStatus: ref.multivariate.status };
  if (out.status === 'ok' && ref.multivariate.status === 'ok') {
    const fit = multivariate(out.fit);
    for (const field of ['mu', 'muSE', 'muVcov', 'G', 'logLik', 'z', 'p', 'ciLo', 'ciHi', ...(c.compareRho ? ['rho'] : [])])
      failures.push(...differences(fit[field], ref.multivariate[field], `${c.id}.${field}`));
    for (let j = 0; j < 2; j++) {
      const u = univariate(out.univariate[j]), r = ref.univariate[j];
      for (const field of ['mu', 'se', 'tau2', 'logLik', 'z', 'p', 'ciLo', 'ciHi'])
        failures.push(...differences(u[field], r[field], `${c.id}.univariate${j}.${field}`));
    }
    const varianceRatios = ref.univariate.map((u, j) => ref.multivariate.muSE[j] ** 2 / u.se ** 2);
    failures.push(...differences(out.varRatio, varianceRatios, `${c.id}.varRatio`));
    summary.app = { G: fit.G, rho: fit.rho, logLik: fit.logLik, boundary: fit.optimizer.boundary };
    summary.R = { G: ref.multivariate.G, rho: ref.multivariate.rho, logLik: ref.multivariate.logLik,
      warnings: ref.multivariate.warnings };
  } else summary.RMessage = ref.multivariate.message;
  cases.push(summary);
}
const c = input.cases.find(c => c.id === input.sweep.caseId);
const sw = app.plus.sweep(parsed(c.studies), input.sweep.grid);
for (let i = 0; i < sw.length; i++) {
  if (sw[i].status !== 'ok' || reference.sweep[i].multivariate.status !== 'ok') {
    failures.push({ label: `sweep${sw[i].rhoW}`, appStatus: sw[i].status,
      RStatus: reference.sweep[i].multivariate.status,
      RMessage: reference.sweep[i].multivariate.message }); continue;
  }
  const f = multivariate(sw[i].fit), r = reference.sweep[i].multivariate;
  for (const field of ['mu', 'muSE', 'muVcov', 'G', 'rho', 'logLik', 'z', 'p', 'ciLo', 'ciHi'])
    failures.push(...differences(f[field], r[field], `sweep${sw[i].rhoW}.${field}`));
}
for (const extra of supplement.additional) {
  const result = app.plus.compute(parsed(extra.input.studies)), r = extra.multivariate;
  cases.push({ id: extra.input.id, appStatus: result.status, RStatus: r.status,
    app: result.status === 'ok' ? { G: result.fit.G, rho: result.fit.rho, logLik: result.fit.logLik } : result.reason,
    R: r.status === 'ok' ? { G: r.G, rho: r.rho, logLik: r.logLik } : r.message });
  if (result.status === 'ok' && r.status === 'ok') {
    const f = multivariate(result.fit);
    for (const field of ['mu', 'muSE', 'muVcov', 'G', 'rho', 'logLik', 'z', 'p', 'ciLo', 'ciHi'])
      failures.push(...differences(f[field], r[field], `${extra.input.id}.${field}`));
  }
}
const originalErrors = [...originalReference.cases.map(c => ({ id: c.id, ...c.multivariate })),
  ...originalReference.sweep.map(s => ({ id: `sweep${s.rhoW}`, ...s.multivariate }))]
  .filter(r => r.status !== 'ok').map(({ id, status, message }) => ({ id, status, message }));
const evidence = { tolerance: 1e-6, originalErrors, cases, failures };
writeFileSync(join(tmpdir(), 'p18-replay.json'), JSON.stringify(evidence, null, 2));
for (const c of cases) console.log(JSON.stringify(c));
for (const f of failures) console.log(JSON.stringify(f));
console.log(`P18 replay: ${cases.length} cases; ${failures.length} numerical/status differences; full evidence in temporary p18-replay.json`);
