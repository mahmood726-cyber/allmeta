#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const { MarkovEngine } = require('../src/engine/markov');

const root = path.resolve(__dirname, '..');
const referenceRoot = path.join(root, 'reference-models');
const reportDir = path.join(root, 'reports');
const reportPath = path.join(reportDir, 'reference-validation.json');

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function ensureDir(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
}

function absDiff(a, b) {
    return Math.abs(a - b);
}

function relDiff(a, b) {
    if (Math.abs(b) < 1e-12) return Math.abs(a) < 1e-12 ? 0 : Infinity;
    return Math.abs((a - b) / b);
}

function compareMetric(metricName, observed, expected, tolerance) {
    const absolute = absDiff(observed, expected);
    const relative = relDiff(observed, expected);
    const passAbsolute = absolute <= tolerance;
    const passRelative = relative <= tolerance;
    return {
        metric: metricName,
        observed,
        expected,
        absolute_error: absolute,
        relative_error: relative,
        tolerance,
        passed: passAbsolute || passRelative
    };
}

function resolveTolerance(toleranceCfg = {}) {
    return {
        costs: Number(toleranceCfg.costs ?? 1e-2),
        qalys: Number(toleranceCfg.qalys ?? 1e-4),
        relative: Number(toleranceCfg.relative ?? 1e-3)
    };
}

function compareStrategies(observedStrategies, expectedStrategies, toleranceCfg) {
    const tolerance = resolveTolerance(toleranceCfg);
    const strategyResults = [];
    let passed = true;

    for (const [strategyId, expectedMetrics] of Object.entries(expectedStrategies || {})) {
        const observed = observedStrategies?.[strategyId];
        if (!observed) {
            strategyResults.push({
                strategy: strategyId,
                passed: false,
                reason: 'Strategy missing in observed results'
            });
            passed = false;
            continue;
        }

        const metrics = [
            compareMetric('total_costs', observed.total_costs, expectedMetrics.total_costs, tolerance.costs),
            compareMetric('total_qalys', observed.total_qalys, expectedMetrics.total_qalys, tolerance.qalys),
            compareMetric('life_years', observed.life_years, expectedMetrics.life_years, tolerance.relative)
        ].map((entry) => {
            if (entry.metric === 'life_years') {
                entry.tolerance = tolerance.relative;
                entry.passed = entry.relative_error <= tolerance.relative || entry.absolute_error <= tolerance.qalys;
            } else if (entry.metric === 'total_costs') {
                entry.passed = entry.absolute_error <= tolerance.costs || entry.relative_error <= tolerance.relative;
            } else if (entry.metric === 'total_qalys') {
                entry.passed = entry.absolute_error <= tolerance.qalys || entry.relative_error <= tolerance.relative;
            }
            return entry;
        });

        const strategyPassed = metrics.every((m) => m.passed);
        strategyResults.push({
            strategy: strategyId,
            passed: strategyPassed,
            metrics
        });

        if (!strategyPassed) {
            passed = false;
        }
    }

    return {
        passed,
        tolerance,
        strategies: strategyResults
    };
}

function validateFixture(modelDir, engine) {
    const modelId = path.basename(modelDir);
    const projectPath = path.join(modelDir, 'project.json');
    const expectedPath = path.join(modelDir, 'expected_results.json');

    if (!fs.existsSync(expectedPath)) {
        const project = readJson(projectPath);
        const runResult = engine.runAllStrategies(project);
        return {
            model: modelId,
            status: 'informational',
            reason: 'expected_results.json not found',
            strategies_observed: Object.keys(runResult.strategies || {})
        };
    }

    const project = readJson(projectPath);
    const expected = readJson(expectedPath);
    const runResult = engine.runAllStrategies(project);
    const expectedStrategies = expected?.deterministic?.strategies || {};
    const deterministicComparison = compareStrategies(
        runResult.strategies,
        expectedStrategies,
        expected?.tolerance || {}
    );

    let modelPassed = deterministicComparison.passed;
    const externalPath = path.join(modelDir, 'external_reference.json');
    const externalComparatorReports = [];
    if (fs.existsSync(externalPath)) {
        const externalData = readJson(externalPath);
        const comparators = externalData?.comparators || {};
        for (const [comparatorId, comparatorCfg] of Object.entries(comparators)) {
            const comparison = compareStrategies(
                runResult.strategies,
                comparatorCfg?.strategies || {},
                comparatorCfg?.tolerance || expected?.tolerance || {}
            );

            const strict = comparatorCfg?.strict !== false;
            if (strict && !comparison.passed) {
                modelPassed = false;
            }

            externalComparatorReports.push({
                comparator: comparatorId,
                source: comparatorCfg?.source || null,
                strict,
                passed: comparison.passed,
                tolerance: comparison.tolerance,
                strategies: comparison.strategies
            });
        }
    }

    return {
        model: modelId,
        status: modelPassed ? 'passed' : 'failed',
        expected_file: path.relative(root, expectedPath),
        deterministic: {
            passed: deterministicComparison.passed,
            tolerance: deterministicComparison.tolerance,
            strategies: deterministicComparison.strategies
        },
        external_reference_file: fs.existsSync(externalPath) ? path.relative(root, externalPath) : null,
        external_comparators: externalComparatorReports
    };
}

function main() {
    const engine = new MarkovEngine({
        logger: { warn: () => {} }
    });

    const modelDirs = fs.readdirSync(referenceRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(referenceRoot, entry.name))
        .filter((modelDir) => fs.existsSync(path.join(modelDir, 'project.json')));

    const fixtureReports = modelDirs.map((dirPath) => validateFixture(dirPath, engine));

    const failed = fixtureReports.filter((entry) => entry.status === 'failed');
    const passed = fixtureReports.filter((entry) => entry.status === 'passed');
    const informational = fixtureReports.filter((entry) => entry.status === 'informational');

    const report = {
        generated_at: new Date().toISOString(),
        summary: {
            total: fixtureReports.length,
            passed: passed.length,
            failed: failed.length,
            informational: informational.length,
            external_comparators_checked: fixtureReports.reduce((sum, item) => sum + (item.external_comparators?.length || 0), 0)
        },
        fixtures: fixtureReports
    };

    ensureDir(reportDir);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`Reference validation report written: ${reportPath}`);
    console.log(`Passed: ${passed.length}, Failed: ${failed.length}, Informational: ${informational.length}`);

    if (failed.length > 0) {
        process.exitCode = 1;
    }
}

main();
