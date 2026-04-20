#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const referenceRoot = path.join(root, 'reference-models');
const externalRoot = path.join(root, 'external-comparators');

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function ensureDir(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
}

function sha256OfFile(filePath) {
    const hash = crypto.createHash('sha256');
    hash.update(fs.readFileSync(filePath));
    return hash.digest('hex');
}

function defaultTolerance(modelDir) {
    const expectedPath = path.join(modelDir, 'expected_results.json');
    if (fs.existsSync(expectedPath)) {
        const expected = readJson(expectedPath);
        if (expected && expected.tolerance) return expected.tolerance;
    }
    return { costs: 0.01, qalys: 0.0001, relative: 0.001 };
}

function normalizeStrategies(raw) {
    const out = {};
    for (const [strategy, metrics] of Object.entries(raw || {})) {
        out[strategy] = {
            total_costs: Number(metrics.total_costs),
            total_qalys: Number(metrics.total_qalys),
            life_years: Number(metrics.life_years)
        };
    }
    return out;
}

function parseTreeAgeCsv(filePath) {
    const lines = fs.readFileSync(filePath, 'utf8')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    if (!lines.length) return {};

    const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const idx = {
        strategy: header.indexOf('strategy'),
        total_costs: header.indexOf('total_costs'),
        total_qalys: header.indexOf('total_qalys'),
        life_years: header.indexOf('life_years')
    };
    const missing = Object.entries(idx).filter(([, value]) => value < 0).map(([key]) => key);
    if (missing.length) {
        throw new Error(`TreeAge CSV missing columns: ${missing.join(', ')}`);
    }

    const out = {};
    for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',').map((part) => part.trim());
        const strategy = parts[idx.strategy];
        if (!strategy) continue;
        out[strategy] = {
            total_costs: Number(parts[idx.total_costs]),
            total_qalys: Number(parts[idx.total_qalys]),
            life_years: Number(parts[idx.life_years])
        };
    }
    return out;
}

function loadRComparator(modelId, tolerance) {
    const filePath = path.join(externalRoot, 'r', modelId, 'results.json');
    if (!fs.existsSync(filePath)) return null;
    const payload = readJson(filePath);
    return {
        source: payload.source || 'R external export',
        strict: true,
        tolerance,
        strategies: normalizeStrategies(payload.strategies || {}),
        provenance: {
            file: path.relative(root, filePath),
            sha256: sha256OfFile(filePath),
            generated_at: payload.generated_at || null,
            comparator: payload.comparator || 'R'
        }
    };
}

function loadTreeAgeComparator(modelId, tolerance) {
    const jsonPath = path.join(externalRoot, 'treeage', modelId, 'results.json');
    const csvPath = path.join(externalRoot, 'treeage', modelId, 'results.csv');

    let strategies = null;
    let sourcePath = null;
    let sourceLabel = 'TreeAge external export';
    let generatedAt = null;

    if (fs.existsSync(jsonPath)) {
        const payload = readJson(jsonPath);
        strategies = normalizeStrategies(payload.strategies || {});
        sourcePath = jsonPath;
        sourceLabel = payload.source || sourceLabel;
        generatedAt = payload.generated_at || null;
    } else if (fs.existsSync(csvPath)) {
        strategies = parseTreeAgeCsv(csvPath);
        sourcePath = csvPath;
    }

    if (!sourcePath) return null;

    return {
        source: sourceLabel,
        strict: true,
        tolerance,
        strategies,
        provenance: {
            file: path.relative(root, sourcePath),
            sha256: sha256OfFile(sourcePath),
            generated_at: generatedAt,
            comparator: 'TreeAge'
        }
    };
}

function syncModel(modelDir) {
    const projectPath = path.join(modelDir, 'project.json');
    if (!fs.existsSync(projectPath)) return null;

    const modelId = path.basename(modelDir);
    const tolerance = defaultTolerance(modelDir);
    const comparators = {};

    const rComparator = loadRComparator(modelId, tolerance);
    if (rComparator) comparators.r_reference = rComparator;

    const treeComparator = loadTreeAgeComparator(modelId, tolerance);
    if (treeComparator) comparators.treeage_reference = treeComparator;

    const payload = {
        version: '0.2',
        model_id: modelId,
        generated_at: new Date().toISOString(),
        comparators
    };

    const outPath = path.join(modelDir, 'external_reference.json');
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));

    return {
        model: modelId,
        external_reference: path.relative(root, outPath),
        comparators: Object.keys(comparators)
    };
}

function main() {
    ensureDir(externalRoot);
    const modelDirs = fs.readdirSync(referenceRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(referenceRoot, entry.name));

    const reports = [];
    for (const modelDir of modelDirs) {
        const report = syncModel(modelDir);
        if (report) reports.push(report);
    }

    console.log('Synced external comparator definitions:');
    for (const report of reports) {
        console.log(`- ${report.model}: [${report.comparators.join(', ')}]`);
    }
}

main();
