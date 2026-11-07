// Read-only diagnostic: stdout is collected by the wrapper outside wt/.
import { fixture, jobs } from './p03-dta-check.mjs';
const failures = [];
for (const job of jobs()) {
  try { job.run(); } catch (e) { failures.push({ id: job.id, differences: e.actual ?? null, error: e.message }); }
}
console.log(JSON.stringify({ provenance: fixture.provenance, checks: jobs().length, failures,
  smallK: fixture.fits.filter(f => /^k[123]$/.test(f.dataset)).map(f => ({ id: f.id, ok: f.ok, error: f.error, warnings: f.warnings })) }, null, 2));
