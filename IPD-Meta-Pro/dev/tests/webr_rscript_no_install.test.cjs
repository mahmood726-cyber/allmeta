'use strict';
// Requirement: the downloaded / copied validation R script (generateRScript) never installs software.
// It checks for the packages it needs and, when one is missing, STOPS with a message naming it and
// telling the user how to install it; it does not run install.packages() itself.
// Found in the 20 Nov live sweep: the script began with
//   if (!require("metafor", quietly=TRUE)) install.packages("metafor")   (also survival, lme4)
// so running it silently tried to install packages (lme4 is not even used outside the tier-C check,
// which already reports a missing package as NOT CHECKED via requireNamespace).
// Static check of the generated script; then, if R is available (RSCRIPT), the script is run with an
// EMPTY library first (metafor absent) -- only after the static check has shown it contains no
// install.packages call -- and must stop with the message; then with the normal libraries it must
// still reach its "Compared ..." summary line.
//   node dev/tests/webr_rscript_no_install.test.cjs [path/to/ipd-meta-pro.html]
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { loadPage } = require('./p60_page_loader.cjs');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const { sandbox } = loadPage(pageFile);
let failed = 0;
function check(name, ok, detail) { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  [' + detail + ']' : '')); if (!ok) failed++; }
if (typeof sandbox.generateRScript !== 'function') { console.log('FAIL generateRScript missing'); process.exit(1); }
const s = sandbox.generateRScript();
const installs = s.split('\n').filter(l => /install\.packages\s*\(/.test(l) && !/^\s*#/.test(l) && !/stop\(|message\(|cat\(/.test(l));
check('the script contains no executable install.packages() call', installs.length === 0, installs.join(' | '));
check('the script checks for metafor and survival before using them', /requireNamespace/.test(s.split('library(metafor)')[0] || '') && /"metafor"/.test(s) && /"survival"/.test(s));
const R = process.env.RSCRIPT;
let ranR = false;
if (installs.length === 0 && R && fs.existsSync(R)) {
  ranR = true;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ipd-noinst-'));
  try {
    const f = path.join(dir, 'v.R'); fs.writeFileSync(f, s);
    const empty = path.join(dir, 'emptylib'); fs.mkdirSync(empty);
    const env0 = Object.assign({}, process.env, { R_LIBS: empty, R_LIBS_USER: empty, R_LIBS_SITE: empty });
    const r0 = spawnSync(R, ['--vanilla', f], { env: env0, encoding: 'utf8', timeout: 300000 });
    const out0 = (r0.stdout || '') + (r0.stderr || '');
    check('with metafor absent the script stops, naming the package, and installs nothing',
      r0.status !== 0 && /not installed: metafor/.test(out0) && /does not install/.test(out0) && fs.readdirSync(empty).length === 0,
      'rc=' + r0.status + ' ' + out0.split('\n').filter(l => /metafor|install/i.test(l)).slice(0, 3).join(' | '));
    const r1 = spawnSync(R, ['--vanilla', f], { encoding: 'utf8', timeout: 600000 });
    const out1 = (r1.stdout || '') + (r1.stderr || '');
    check('control: with the normal libraries the script runs to its "Compared" summary', r1.status === 0 && /Compared \d+ quantities/.test(out1), 'rc=' + r1.status + ' ' + (out1.match(/Compared[^\n]*/) || [out1.slice(-200)])[0]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
} else console.log('SKIP R run (' + (installs.length ? 'script would install packages' : 'RSCRIPT not set') + ')');
if (failed) { console.log(failed + ' FAILED'); process.exit(1); }
// A check that did not run is not a pass (review of PR #655): without R the stop-on-missing-package
// and control runs did not happen, so the test reports SKIPPED and exits 2, never "all passed".
if (!ranR) { console.log('SKIPPED: the R runs need RSCRIPT=<path to Rscript>; the static checks above passed'); process.exit(2); }
console.log('all passed');
