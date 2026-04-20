#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { MarkovEngine } = require('../src/engine/markov');

const root = path.resolve(__dirname, '..');
const referenceRoot = path.join(root, 'reference-models');
const reportDir = path.join(root, 'reports');
const reportPath = path.join(reportDir, 'determinism-check.json');

function ensureDir(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function canonicalize(value) {
    if (Array.isArray(value)) {
        return value.map((item) => canonicalize(item));
    }
    if (value && typeof value === 'object') {
        const sortedKeys = Object.keys(value).sort();
        const obj = {};
        for (const key of sortedKeys) {
            if (key === 'computation_time_ms') continue;
            obj[key] = canonicalize(value[key]);
        }
        return obj;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? Number(value.toPrecision(15)) : value;
    }
    return value;
}

function stableHash(result) {
    const canonical = canonicalize(result);
    const serialized = JSON.stringify(canonical);
    return crypto.createHash('sha256').update(serialized).digest('hex');
}

function collectProjects() {
    return fs.readdirSync(referenceRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(referenceRoot, entry.name, 'project.json'))
        .filter((filePath) => fs.existsSync(filePath));
}

function runDeterminism(projectPath, runs) {
    const project = readJson(projectPath);
    const engine = new MarkovEngine({
        logger: { warn: () => {} }
    });
    const hashes = [];

    for (let i = 0; i < runs; i++) {
        const result = engine.runAllStrategies(project);
        hashes.push(stableHash(result));
    }

    const uniqueHashes = Array.from(new Set(hashes));
    return {
        model: path.basename(path.dirname(projectPath)),
        runs,
        unique_hashes: uniqueHashes.length,
        first_hash: hashes[0],
        passed: uniqueHashes.length === 1
    };
}

function main() {
    const argRuns = Number(process.argv.find((arg) => arg.startsWith('--runs='))?.split('=')[1]);
    const runs = Number.isFinite(argRuns) && argRuns > 1 ? Math.floor(argRuns) : 10;

    const projects = collectProjects();
    const results = projects.map((projectPath) => runDeterminism(projectPath, runs));
    const failed = results.filter((entry) => !entry.passed);

    const report = {
        generated_at: new Date().toISOString(),
        runs_per_model: runs,
        summary: {
            total: results.length,
            passed: results.length - failed.length,
            failed: failed.length
        },
        models: results
    };

    ensureDir(reportDir);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`Determinism report written: ${reportPath}`);
    console.log(`Passed: ${report.summary.passed}/${report.summary.total}`);

    if (failed.length > 0) {
        process.exitCode = 1;
    }
}

main();
