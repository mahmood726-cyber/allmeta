#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const { MarkovEngine } = require('../src/engine/markov');

const root = path.resolve(__dirname, '..');
const referenceRoot = path.join(root, 'reference-models');
const configPath = path.join(root, 'benchmarks', 'performance-thresholds.json');
const reportDir = path.join(root, 'reports');
const reportPath = path.join(reportDir, 'performance-benchmark.json');

function ensureDir(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function percentile(sortedValues, p) {
    if (!sortedValues.length) return 0;
    const idx = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil((p / 100) * sortedValues.length) - 1));
    return sortedValues[idx];
}

function summarize(samples) {
    const sorted = [...samples].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, value) => acc + value, 0);
    return {
        iterations: sorted.length,
        min_ms: sorted[0],
        max_ms: sorted[sorted.length - 1],
        mean_ms: sum / sorted.length,
        median_ms: percentile(sorted, 50),
        p95_ms: percentile(sorted, 95)
    };
}

function benchmarkModel(modelId, projectPath, cfg, iterations, warmup) {
    const project = readJson(projectPath);
    const engine = new MarkovEngine({
        logger: { warn: () => {} }
    });

    for (let i = 0; i < warmup; i++) {
        engine.runAllStrategies(project);
    }

    const samples = [];
    for (let i = 0; i < iterations; i++) {
        const start = process.hrtime.bigint();
        engine.runAllStrategies(project);
        const end = process.hrtime.bigint();
        samples.push(Number(end - start) / 1e6);
    }

    const stats = summarize(samples);
    const thresholds = cfg.models?.[modelId] || {};
    const maxMeanMs = Number(thresholds.max_mean_ms ?? Number.POSITIVE_INFINITY);
    const maxP95Ms = Number(thresholds.max_p95_ms ?? Number.POSITIVE_INFINITY);

    const checks = {
        mean_within_budget: stats.mean_ms <= maxMeanMs,
        p95_within_budget: stats.p95_ms <= maxP95Ms
    };

    return {
        model: modelId,
        stats,
        thresholds: {
            max_mean_ms: Number.isFinite(maxMeanMs) ? maxMeanMs : null,
            max_p95_ms: Number.isFinite(maxP95Ms) ? maxP95Ms : null
        },
        passed: checks.mean_within_budget && checks.p95_within_budget,
        checks
    };
}

function main() {
    const cfg = fs.existsSync(configPath) ? readJson(configPath) : { models: {}, defaults: {} };

    const cliIterations = Number(process.argv.find((arg) => arg.startsWith('--iterations='))?.split('=')[1]);
    const cliWarmup = Number(process.argv.find((arg) => arg.startsWith('--warmup='))?.split('=')[1]);

    const iterations = Number.isFinite(cliIterations) && cliIterations > 1
        ? Math.floor(cliIterations)
        : Number(cfg.defaults?.iterations ?? 40);
    const warmup = Number.isFinite(cliWarmup) && cliWarmup >= 0
        ? Math.floor(cliWarmup)
        : Number(cfg.defaults?.warmup ?? 5);

    const modelDirs = fs.readdirSync(referenceRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);

    const modelReports = [];
    for (const modelId of modelDirs) {
        const projectPath = path.join(referenceRoot, modelId, 'project.json');
        if (!fs.existsSync(projectPath)) continue;
        modelReports.push(benchmarkModel(modelId, projectPath, cfg, iterations, warmup));
    }

    const failed = modelReports.filter((entry) => !entry.passed);

    const report = {
        generated_at: new Date().toISOString(),
        iterations,
        warmup,
        summary: {
            total: modelReports.length,
            passed: modelReports.length - failed.length,
            failed: failed.length
        },
        models: modelReports
    };

    ensureDir(reportDir);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`Performance report written: ${reportPath}`);
    for (const model of modelReports) {
        console.log(`${model.model}: mean=${model.stats.mean_ms.toFixed(3)}ms p95=${model.stats.p95_ms.toFixed(3)}ms passed=${model.passed}`);
    }

    if (failed.length > 0) {
        process.exitCode = 1;
    }
}

main();
