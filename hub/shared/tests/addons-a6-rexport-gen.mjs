// Receipt harness for hub/shared/r-export.js (lane A6). For each configuration it opens the real
// page, presses the add-on's "Download R script" button, runs the downloaded script in R and
// records hub/shared/tests/fixtures/r-export/<app>.receipt.json:
//   {app, configId, scriptSha256 (SHA-256 of the body below the header), R, pkgs, quantities, pass,
//    negativeControl}  - the negative control re-runs the script with one page value moved by
//    1e-3 relative and must print FAIL.
// Usage: node hub/shared/tests/addons-a6-rexport-gen.mjs --rlib <metafor-5.2-1 library>
//        [--rscript <path>] [--port 8162] [--channel msedge]
// The receipts are checked (SHA only, no R) by addons-a6-panels.spec.mjs.
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir, stat, mkdtemp, rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {resolve, extname, sep, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';

export const CONFIGS = [{app: 'influence', configId: 'influence/default-example', url: '/influence/index.html'}];
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const bodySha = text => {
  const marker = '# ---- end of header ----\n', i = text.indexOf(marker);
  if (i < 0) throw Error('Not an allmeta R export');
  return createHash('sha256').update(text.slice(i + marker.length).replace(/\r\n/g, '\n'), 'utf8').digest('hex');
};

async function main() {
  const {values} = parseArgs({options: {rlib: {type: 'string'}, rscript: {type: 'string'}, port: {type: 'string'}, channel: {type: 'string'}}});
  if (!values.rlib) throw Error('--rlib <library with metafor 5.2-1> is required');
  const rscript = values.rscript || 'C:/Program Files/R/R-4.6.0/bin/Rscript.exe';
  const port = Number(values.port || 8162), origin = 'http://127.0.0.1:' + port;
  // The validated library first; the user library is not consulted.
  const env = {...process.env, R_LIBS: values.rlib, R_LIBS_USER: values.rlib, R_ENVIRON_USER: 'NUL', R_PROFILE_USER: 'NUL'};
  const R = (file) => spawnSync(rscript, [file], {encoding: 'utf8', env, timeout: 600000});
  // A script file, not -e: Rscript.exe re-quotes -e arguments on Windows.
  const probeDir = await mkdtemp(join(tmpdir(), 'alm-probe-')), probeFile = join(probeDir, 'probe.R');
  await writeFile(probeFile, 'cat(paste(R.version$major, R.version$minor, sep = "."), as.character(packageVersion("metafor")), find.package("metafor"), sep = "|")\n');
  const probe = R(probeFile); await rm(probeDir, {recursive: true, force: true});
  const [rVersion, metafor, where] = (probe.stdout || '').split('|');
  console.log('R', rVersion, 'metafor', metafor, 'from', where);
  if (rVersion !== '4.6.0' || metafor !== '5.2.1') throw Error('Need R 4.6.0 with metafor 5.2-1; got ' + probe.stdout + probe.stderr);
  const require = createRequire(new URL('./package.json', import.meta.url));
  const {chromium} = require('@playwright/test');
  const mime = {'.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.wasm': 'application/wasm'};
  const server = createServer(async (req, res) => {
    try {
      let path = resolve(ROOT, '.' + decodeURIComponent(new URL(req.url, origin).pathname));
      if (!path.startsWith(resolve(ROOT) + sep)) throw Error('refused');
      if ((await stat(path)).isDirectory()) path = resolve(path, 'index.html');
      res.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream'); res.end(await readFile(path));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((ok, no) => { server.once('error', no); server.listen(port, '127.0.0.1', ok); });
  const browser = await chromium.launch({headless: true, channel: values.channel || undefined});
  const dir = await mkdtemp(join(tmpdir(), 'alm-receipt-'));
  try {
    for (const c of CONFIGS) {
      const context = await browser.newContext({acceptDownloads: true});
      const page = await context.newPage();
      await page.goto(origin + c.url);
      await page.waitForFunction(() => !!window.__almInfluenceAddons);
      await page.locator('#alm-addon-' + c.app + '-r-script > summary').click();
      const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#alm-addon-' + c.app + '-r-download').click()]);
      const text = await readFile(await download.path(), 'utf8');
      await context.close();
      const file = join(dir, c.app + '.R'); await writeFile(file, text);
      const run = R(file), out = run.stdout + run.stderr;
      const m = /ALLMETA REPRODUCTION: (PASS|FAIL) \((\d+)\/(\d+)/.exec(out);
      if (!m) throw Error(c.configId + ': no verdict from R\n' + out);
      if (/differs from the validated|is not installed/.test(out)) throw Error(c.configId + ': package version warning\n' + out);
      // Negative control: move the first page value by 1e-3 relative; R must report FAIL.
      const tampered = text.replace(/(  page = c\()(-?[0-9.eE+-]+)/, (_, a, v) => a + String(Number(v) * (1 + 1e-3) + (Number(v) === 0 ? 1e-3 : 0)));
      if (tampered === text) throw Error('Negative control could not be built');
      const neg = join(dir, c.app + '.neg.R'); await writeFile(neg, tampered);
      const negOut = R(neg), n = /ALLMETA REPRODUCTION: (PASS|FAIL)/.exec(negOut.stdout + negOut.stderr);
      const receipt = {app: c.app, configId: c.configId, scriptSha256: bodySha(text), R: rVersion, pkgs: {metafor},
        quantities: Number(m[3]), passed: Number(m[2]), pass: m[1] === 'PASS' && m[2] === m[3], negativeControl: n ? n[1] : 'NO VERDICT'};
      console.log(c.configId, receipt.pass ? 'PASS' : 'FAIL', m[2] + '/' + m[3], 'negative control', receipt.negativeControl);
      if (!receipt.pass) console.log(out);
      if (receipt.negativeControl !== 'FAIL') throw Error('Negative control did not fail');
      const dest = resolve(ROOT, 'hub/shared/tests/fixtures/r-export'); await mkdir(dest, {recursive: true});
      await writeFile(join(dest, c.app + '.receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
    }
  } finally { await browser.close(); await new Promise(ok => server.close(ok)); await rm(dir, {recursive: true, force: true}); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exitCode = 1; });
