/**
 * scripts/build.js: the dist output must contain every file the page loads from outside HTA/
 * (../shared/ma-core.js, ../shared/vendor/*, ../hub/*), at the same relative paths, so that the
 * built page and its service worker resolve them. Run with jest or `node --test`.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const htaRoot = path.resolve(__dirname, '..');

function refsOutsideApp(html, sw) {
    const refs = new Set();
    for (const m of html.matchAll(/\b(?:src|href)\s*=\s*"(\.\.\/[^"#?]*)[^"]*"/g)) refs.add(m[1]);
    for (const m of sw.matchAll(/['"](\.\.\/[^'"#?]*)[^'"]*['"]/g)) refs.add(m[1]);
    // query/fragment stripped; a path ending in / (the hub-back link) is navigation, not a resource
    return [...refs].filter(r => r.length > 3 && !r.endsWith('/'));
}

const nodeTest = typeof describe === 'undefined' ? require('node:test') : null;
const run = (name, fn) => (nodeTest ? nodeTest(name, fn) : test(name, fn));

run('build output resolves every ../ reference of index.html and service-worker.js', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'hta-dist-'));
    try {
        const r = spawnSync(process.execPath, [path.join(htaRoot, 'scripts', 'build.js')], {
            encoding: 'utf8', env: { ...process.env, HTA_DIST_DIR: out }
        });
        if (r.status !== 0) throw new Error('build failed: ' + (r.stderr || r.stdout));
        const appDir = path.join(out, 'HTA');
        const html = fs.readFileSync(path.join(appDir, 'index.html'), 'utf8');
        const sw = fs.readFileSync(path.join(appDir, 'service-worker.js'), 'utf8');
        const refs = refsOutsideApp(html, sw);
        if (!refs.some(x => x.endsWith('shared/ma-core.js'))) throw new Error('fixture lost: index.html no longer loads ../shared/ma-core.js');
        const missing = refs.filter(x => !fs.existsSync(path.resolve(appDir, x)));
        if (missing.length) throw new Error('dist is missing: ' + missing.join(', '));
        for (const x of refs) {
            const a = fs.readFileSync(path.resolve(appDir, x)), b = fs.readFileSync(path.resolve(htaRoot, x));
            if (!a.equals(b)) throw new Error('dist copy differs from source: ' + x);
        }
    } finally {
        fs.rmSync(out, { recursive: true, force: true });
    }
});
