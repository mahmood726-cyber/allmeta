#!/usr/bin/env node
// F4 report: aggregate the matrix's result-<os>-<r>.json files (scripts/xplat/run-checks.R).
//
// Usage: node scripts/xplat/report.mjs --results <dir> --expected "ubuntu-latest:release,..." [--status <dir>]
// Writes xplat-results.json (cwd) and prints the markdown summary (append it to $GITHUB_STEP_SUMMARY).
// With --status <dir>: also writes <dir>/xplat-results.json, <dir>/index.html (static, no JS) and shields
// endpoint JSONs <dir>/badge-<os>-<r>.json + <dir>/badge-app-<app>.json (all rows for one app).
// A matrix row with no result file (job crashed/cancelled) is reported as MISSING, never as a pass.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const resultsDir = opt('--results') || '.';
const statusDir = opt('--status');
const expected = (opt('--expected') || '').split(',').filter(Boolean).map(s => { const [os, r] = s.split(':'); return { os, r }; });

const env = process.env;
const server = env.GITHUB_SERVER_URL || 'https://github.com', repo = env.GITHUB_REPOSITORY || 'mahmood726-cyber/allmeta';
const runUrl = env.GITHUB_RUN_ID ? `${server}/${repo}/actions/runs/${env.GITHUB_RUN_ID}` : null;
const workflowUrl = `${server}/${repo}/actions/workflows/xplat-verify.yml`;
const STATUS_RAW = `https://raw.githubusercontent.com/${repo}/xplat-status/status`;

const files = readdirSync(resultsDir, { recursive: true }).map(String).filter(f => /(^|[\\/])result-[^\\/]+\.json$/.test(f));
const rows = files.map(f => JSON.parse(readFileSync(join(resultsDir, f), 'utf8')));
for (const e of expected) if (!rows.some(r => r.os === e.os && String(r.r) === e.r)) rows.push({ os: e.os, r: e.r, missing: true, pass: false });
rows.sort((a, b) => (a.os + a.r).localeCompare(b.os + b.r));

const n = x => (x === null || x === undefined ? '?' : x);
function line(r) {
  if (r.missing) return 'MISSING (no result: the job did not finish)';
  return `${n(r.checks.passed)} of ${n(r.checks.N)} pass (${n(r.quantities.passed)}/${n(r.quantities.N)} quantities); ` +
    `entry ${n(r.entry.passed)}/${n(r.entry.N)}; planted ${r.planted_detected ? 'detected' : 'NOT detected'}` + (r.plots_ok ? '' : '; plots FAILED');
}
const allPass = rows.length > 0 && rows.every(r => r.pass);
const apps = [...new Set(rows.flatMap(r => Object.keys(r.apps || {})))].sort();

const aggregate = {
  generated: new Date().toISOString(), commit: env.GITHUB_SHA || null, ref: env.GITHUB_REF_NAME || null, run: runUrl,
  pass: allPass, rows: rows.map(r => ({ ...r, summary: line(r) })),
};
writeFileSync('xplat-results.json', JSON.stringify(aggregate, null, 2) + '\n');

const md = [
  `## xplat-verify: ${allPass ? 'all rows PASS' : 'FAIL'}`, '',
  '| OS | R | R version | packages via | result | |', '|---|---|---|---|---|---|',
  ...rows.map(r => `| ${r.os} | ${r.r} | ${r.missing ? '-' : r['R.version.string']} | ${r.missing ? '-' : r.install} | ${line(r)} | ${r.pass ? 'PASS' : 'FAIL'} |`),
  '', apps.length ? '| app | ' + rows.map(r => `${r.os} / ${r.r}`).join(' | ') + ' |' : '',
  apps.length ? '|---|' + rows.map(() => '---|').join('') : '',
  ...apps.map(a => `| ${a} | ` + rows.map(r => { const x = (r.apps || {})[a]; return x ? `${x.pass ? '✅' : '❌'} ${n(x.passed)}/${n(x.N)}` : '-'; }).join(' | ') + ' |'),
  '', runUrl ? `Run: ${runUrl} (artifacts: xplat-out, xplat-result-*, xplat-plots-*)` : '',
].join('\n');
console.log(md);

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slug = r => `${r.os}-${r.r}`.replace(/[^A-Za-z0-9._-]/g, '_');
if (statusDir) {
  mkdirSync(statusDir, { recursive: true });
  writeFileSync(join(statusDir, 'xplat-results.json'), JSON.stringify(aggregate, null, 2) + '\n');
  for (const r of rows) {
    const badge = { schemaVersion: 1, label: `${r.os} R ${r.r}`,
      message: r.missing ? 'no result' : `${n(r.checks.passed)}/${n(r.checks.N)} pass` + (r.planted_detected ? '' : ', planted missed'),
      color: r.missing ? 'lightgrey' : r.pass ? 'brightgreen' : 'red' };
    writeFileSync(join(statusDir, `badge-${slug(r)}.json`), JSON.stringify(badge) + '\n');
  }
  for (const a of apps) {
    const got = rows.filter(r => r.apps && r.apps[a]);
    const ok = got.filter(r => r.apps[a].pass).length;
    writeFileSync(join(statusDir, `badge-app-${a}.json`), JSON.stringify({ schemaVersion: 1, label: `${a} in R`,
      message: `${ok}/${rows.length} platforms`, color: ok === rows.length ? 'brightgreen' : 'red' }) + '\n');
  }
  const badgeImg = file => `https://img.shields.io/endpoint?url=${encodeURIComponent(`${STATUS_RAW}/${file}`)}`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>allmeta xplat-verify status</title>
<style>body{font:15px/1.5 system-ui,sans-serif;margin:2rem;color:#15181d}table{border-collapse:collapse;margin:1rem 0}
th,td{border:1px solid #bbb;padding:.3rem .6rem;text-align:left}.pass{color:#0a6b2d;font-weight:600}.fail{color:#b00020;font-weight:600}</style>
</head><body>
<h1>allmeta cross-platform R verification (xplat-verify)</h1>
<p>Overall: <span class="${allPass ? 'pass' : 'fail'}">${allPass ? 'PASS' : 'FAIL'}</span>.
Commit <code>${esc(aggregate.commit || 'n/a')}</code>, generated ${esc(aggregate.generated)}.</p>
<p>${runUrl ? `<a href="${esc(runUrl)}">This run (logs)</a> · <a href="${esc(runUrl)}#artifacts">Artifacts (R scripts, results, plots)</a> · ` : ''}<a href="${esc(workflowUrl)}">All xplat-verify runs</a></p>
<table><thead><tr><th scope="col">OS</th><th scope="col">R</th><th scope="col">R version</th><th scope="col">Packages via</th><th scope="col">Result</th><th scope="col">Badge</th></tr></thead><tbody>
${rows.map(r => `<tr><td>${esc(r.os)}</td><td>${esc(r.r)}</td><td>${esc(r.missing ? '-' : r['R.version.string'])}</td><td>${esc(r.missing ? '-' : r.install)}</td><td class="${r.pass ? 'pass' : 'fail'}">${esc(line(r))}</td><td><img alt="${esc(r.os + ' R ' + r.r)}" src="${esc(badgeImg(`badge-${slug(r)}.json`))}"></td></tr>`).join('\n')}
</tbody></table>
<h2>Per app</h2>
<table><thead><tr><th scope="col">App</th>${rows.map(r => `<th scope="col">${esc(r.os)} / ${esc(r.r)}</th>`).join('')}</tr></thead><tbody>
${apps.map(a => `<tr><td>${esc(a)}</td>${rows.map(r => { const x = (r.apps || {})[a]; return x ? `<td class="${x.pass ? 'pass' : 'fail'}">${esc(n(x.passed))}/${esc(n(x.N))}</td>` : '<td>-</td>'; }).join('')}</tr>`).join('\n')}
</tbody></table>
<p>Each cell is the number of app quantities that matched R within the app's own tolerance (rules identical to
shared/alm-validate.js compare()). Every row also re-runs the data-entry conversion grid against metafor and must detect a
planted defect. Machine-readable: <a href="xplat-results.json">xplat-results.json</a>.</p>
</body></html>
`;
  writeFileSync(join(statusDir, 'index.html'), html);
}
if (!rows.length) process.exit(1);
