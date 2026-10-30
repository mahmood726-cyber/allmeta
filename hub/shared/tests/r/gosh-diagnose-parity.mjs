// Read-only diagnostics for RUN.txt. The unit suite remains the pass/fail gate.
// Print one worst discrepancy per case/model/engine/field, preserving R numbers.
import {
  input, cases, fits, exact, exactPoints, pageResult, pointFields, pageSummaryFields, tolerance
} from '../unit/gosh-r-parity-helpers.mjs';
import { readFileSync } from 'node:fs';

let checked = 0, failed = 0;
const worst = new Map();
const subsetFailures = [];
function check(c, model, engine, actual, expected, fields, members) {
  for (const field of fields) {
    checked++;
    const app = actual[field], R = expected[field], absolute_difference = Math.abs(app - R);
    if (Number.isFinite(app) && Number.isFinite(R) && absolute_difference <= tolerance) continue;
    failed++;
    if (members) subsetFailures.push({id:c.id,model,engine,field,members,app,R,absolute_difference});
    const key = `${c.id}/${model}/${engine}/${field}`;
    const previous = worst.get(key);
    if (!previous || absolute_difference > previous.absolute_difference || !Number.isFinite(absolute_difference)) {
      worst.set(key, { id: c.id, model, engine, field, members, app, R, absolute_difference });
    }
  }
}
for (const c of cases) for (const model of input.models) {
  const ref = fits.find(r => r.id === c.id && r.model === model);
  exactPoints(c, model, ref.points).forEach((p, i) =>
    check(c, model, 'exact-subset', p, ref.points[i], ['mu', 'Q', 'I2', 'tau2'], ref.points[i].members));
  if (!c.draws) check(c, model, 'exact-summary', exact.run(c.te, c.se, model), ref.summary, Object.keys(ref.summary));
  if (c.te.length >= 3) {
    const page = pageResult(c, model);
    if (!page.summary || page.points.length !== ref.points.length) throw Error(`Missing page fits: ${c.id}/${model}`);
    page.points.forEach((p, i) => check(c, model, 'page-subset', p, ref.points[i], pointFields(model, p), p.members));
    check(c, model, 'page-summary', page.summary, ref.summary, pageSummaryFields);
  }
}
console.log(JSON.stringify({ tolerance, checked, failed, worst_discrepancies: [...worst.values()] }, null, 2));
console.log('Every failed subset comparison (not just the largest per field):');
for (const failure of subsetFailures) console.log(JSON.stringify(failure));
const boundary = cases.find(c=>c.id==='heterogeneous');
for (const model of input.models) {
  const ref = fits.find(r=>r.id===boundary.id && r.model===model);
  const p = ref.points.find(p=>p.members.join(',')==='2,4');
  const exactFit = exactPoints(boundary,model,[p])[0];
  const pageFit = pageResult(boundary,model).points.find(p=>p.members.join(',')==='2,4');
  console.log(JSON.stringify({boundary:boundary.id,model,members:p.members,exact:exactFit,page:pageFit,R:p}));
}
const audit = JSON.parse(readFileSync(new URL('../fixtures/gosh-r-parity-numeric-audit.json',import.meta.url)));
console.log('Direct 17-digit R audit (diagnostic only; original assertions retained):');
for (const record of audit.records) {
  const c = cases.find(c=>c.id===record.id);
  const exactFit = exactPoints(c,record.model,[record])[0];
  const pageFit = pageResult(c,record.model).points.find(p=>p.members.join(',')===record.members.join(','));
  for (const field of ['Q','I2','tau2']) {
    const directR = Number(record.direct_R_17[field]), storedR = Number(record.stored_R_17[field]);
    if (Math.abs(directR-storedR)>tolerance || Math.abs(exactFit[field]-directR)>tolerance || record.id==='heterogeneous') {
      console.log(JSON.stringify({id:record.id,model:record.model,members:record.members,field,
        exact:exactFit[field],page:pageFit[field],directR,storedR,
        exact_minus_directR:exactFit[field]-directR,page_minus_directR:pageFit[field]-directR,
        stored_minus_directR:storedR-directR}));
    }
  }
}
