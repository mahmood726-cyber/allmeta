#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const rScriptFile = path.join(root, 'scripts', 'export_r_markov_fixture_results.R');

function resolveRscriptPath() {
    const candidates = [
        process.env.RSCRIPT_PATH,
        'C:\\Program Files\\R\\R-4.5.2\\bin\\Rscript.exe',
        'C:\\Program Files\\R\\R-4.5.2\\bin\\x64\\Rscript.exe',
        'C:\\Program Files\\R\\R-4.4.3\\bin\\Rscript.exe',
        'C:\\Program Files\\R\\R-4.4.3\\bin\\x64\\Rscript.exe'
    ].filter(Boolean);

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) return candidate;
    }

    const probe = spawnSync('where', ['Rscript'], { shell: true, encoding: 'utf8' });
    if (probe.status === 0) {
        const lines = String(probe.stdout || '')
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);
        if (lines.length) {
            return lines[0];
        }
    }

    return null;
}

function main() {
    const rscript = resolveRscriptPath();
    if (!rscript) {
        console.error('Unable to locate Rscript. Set RSCRIPT_PATH or install R.');
        process.exit(1);
    }

    const result = spawnSync(rscript, [rScriptFile, root], {
        cwd: root,
        stdio: 'inherit',
        shell: false
    });

    if (result.error) {
        console.error(`Failed to start Rscript at "${rscript}": ${result.error.message}`);
        process.exit(1);
    }

    process.exit(result.status || 0);
}

main();
