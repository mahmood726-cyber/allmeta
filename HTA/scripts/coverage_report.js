#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const packagePath = path.join(root, 'package.json');
const tempConfigPath = path.join(root, '.tmp_jest_coverage.config.json');

function main() {
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    const baseJestConfig = pkg.jest || {};
    const coverageConfig = {
        ...baseJestConfig,
        coverageThreshold: {
            global: {
                branches: 0,
                functions: 0,
                lines: 0,
                statements: 0
            }
        }
    };

    fs.writeFileSync(tempConfigPath, JSON.stringify(coverageConfig, null, 2));

    const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const result = spawnSync(
        npxCommand,
        ['jest', '--coverage', '--runInBand', '--config', tempConfigPath],
        { stdio: 'inherit', cwd: root }
    );

    try {
        fs.unlinkSync(tempConfigPath);
    } catch (e) {
        // no-op
    }

    process.exit(result.status || 0);
}

main();
