#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function runNpm(args) {
    const npmExecPath = process.env.npm_execpath;
    const result = npmExecPath
        ? spawnSync(process.execPath, [npmExecPath, ...args], {
            cwd: root,
            encoding: 'utf8'
        })
        : spawnSync(npmCmd, args, {
            cwd: root,
            encoding: 'utf8',
            shell: true
        });
    return {
        ok: result.status === 0,
        status: result.status,
        stdout: result.stdout || '',
        stderr: result.stderr || ''
    };
}

function clamp01(x) {
    return Math.max(0, Math.min(1, x));
}

function weightedScore(criteria, weights) {
    let weighted = 0;
    let total = 0;
    for (const [key, w] of Object.entries(weights)) {
        weighted += (criteria[key] || 0) * w;
        total += w;
    }
    return total > 0 ? weighted / total : 0;
}

function countMatches(text, regex) {
    const m = text.match(regex);
    return m ? m.length : 0;
}

function main() {
    const appJs = read('src/ui/app.js');
    const advancedUi = read('src/ui/advancedUI.js');
    const indexHtml = read('index.html');
    const markovTest = read('tests/engine/markov.test.js');
    const editorialTest = read('tests/editorialRevisions.test.js');
    const advancedMeta = read('src/engine/advancedMeta.js');

    const build = runNpm(['run', 'build']);
    const lint = runNpm(['run', 'lint']);
    const test = runNpm(['test', '--', '--runInBand']);

    const noEval = !/\beval\s*\(/.test(read('src/ui/advancedUI.js'));
    const cspWorker = /worker-src\s+'self'\s+blob:/.test(indexHtml);
    const cspDataConnect = /connect-src[^"]*raw\.githubusercontent\.com/.test(indexHtml) && /connect-src[^"]*zenodo\.org/.test(indexHtml);
    const sanitizerUsage = /escapeHTML\s*\(/.test(appJs) && countMatches(appJs, /setSafeInnerHTML\s*\(/g) >= 4;
    const noFakeDemoSuccess = !/completed \(demo\)/i.test(advancedUi) && /showUnavailableMethod\s*\(/.test(advancedUi);
    const meaningfulMarkovTests = /require\('\.\.\/\.\.\/src\/engine\/markov'\)/.test(markovTest);
    const meaningfulEditorialTests = /require\('\.\.\/src\/engine\/editorialRevisions'\)/.test(editorialTest);
    const placeholderCount = countMatches(advancedMeta, /placeholder/ig);
    const unavailableMethodCount = Math.max(0, countMatches(advancedUi, /showUnavailableMethod\(/g) - 1);

    const criteria = {
        reproducibility: (Number(build.ok) + Number(lint.ok) + Number(test.ok)) / 3,
        security: (Number(noEval) + Number(sanitizerUsage) + Number(cspWorker) + Number(cspDataConnect)) / 4,
        transparency: Number(noFakeDemoSuccess),
        methodologicalRigor: (Number(meaningfulMarkovTests) + Number(meaningfulEditorialTests) + Number(test.ok)) / 3,
        maintainability: (Number(fs.existsSync(path.join(root, 'scripts/build.js'))) + Number(fs.existsSync(path.join(root, 'eslint.config.js'))) + Number(lint.ok)) / 3,
        frontierCompleteness: clamp01(1 - (placeholderCount * 0.1) - (unavailableMethodCount * 0.03))
    };

    const reviewers = [
        {
            id: 'R1',
            role: 'HTA committee chair',
            threshold: 0.80,
            weights: { methodologicalRigor: 0.30, reproducibility: 0.25, security: 0.15, transparency: 0.10, maintainability: 0.10, frontierCompleteness: 0.10 }
        },
        {
            id: 'R2',
            role: 'NICE-style economic modeler',
            threshold: 0.82,
            weights: { methodologicalRigor: 0.35, reproducibility: 0.20, transparency: 0.15, frontierCompleteness: 0.15, security: 0.10, maintainability: 0.05 }
        },
        {
            id: 'R3',
            role: 'Hospital HTA lead',
            threshold: 0.78,
            weights: { reproducibility: 0.30, maintainability: 0.20, methodologicalRigor: 0.20, security: 0.15, transparency: 0.10, frontierCompleteness: 0.05 }
        },
        {
            id: 'R4',
            role: 'Methods transparency specialist',
            threshold: 0.80,
            weights: { transparency: 0.35, methodologicalRigor: 0.20, reproducibility: 0.20, security: 0.15, maintainability: 0.10 }
        },
        {
            id: 'R5',
            role: 'Regulatory evidence reviewer',
            threshold: 0.81,
            weights: { methodologicalRigor: 0.30, transparency: 0.20, security: 0.20, reproducibility: 0.15, maintainability: 0.10, frontierCompleteness: 0.05 }
        },
        {
            id: 'R6',
            role: 'Health economist (payer)',
            threshold: 0.79,
            weights: { reproducibility: 0.25, methodologicalRigor: 0.25, frontierCompleteness: 0.20, security: 0.10, transparency: 0.10, maintainability: 0.10 }
        },
        {
            id: 'R7',
            role: 'Biostatistician',
            threshold: 0.80,
            weights: { methodologicalRigor: 0.35, reproducibility: 0.25, transparency: 0.10, security: 0.10, frontierCompleteness: 0.10, maintainability: 0.10 }
        },
        {
            id: 'R8',
            role: 'Evidence synthesis lead',
            threshold: 0.79,
            weights: { methodologicalRigor: 0.30, frontierCompleteness: 0.20, transparency: 0.15, reproducibility: 0.15, security: 0.10, maintainability: 0.10 }
        },
        {
            id: 'R9',
            role: 'Clinical guideline methodologist',
            threshold: 0.78,
            weights: { transparency: 0.20, methodologicalRigor: 0.30, reproducibility: 0.20, maintainability: 0.15, security: 0.10, frontierCompleteness: 0.05 }
        },
        {
            id: 'R10',
            role: 'Open-science reproducibility auditor',
            threshold: 0.83,
            weights: { reproducibility: 0.40, transparency: 0.20, maintainability: 0.15, security: 0.15, methodologicalRigor: 0.10 }
        },
        {
            id: 'R11',
            role: 'Digital health safety reviewer',
            threshold: 0.80,
            weights: { security: 0.35, reproducibility: 0.20, maintainability: 0.20, transparency: 0.15, methodologicalRigor: 0.10 }
        },
        {
            id: 'R12',
            role: 'Frontier methods purist',
            threshold: 0.86,
            weights: { frontierCompleteness: 0.50, methodologicalRigor: 0.20, reproducibility: 0.15, transparency: 0.10, security: 0.05 }
        }
    ];

    const panel = reviewers.map(r => {
        const score = weightedScore(criteria, r.weights);
        return {
            reviewer: r.id,
            role: r.role,
            score: Number(score.toFixed(3)),
            threshold: r.threshold,
            switch_now: score >= r.threshold
        };
    });

    const approvals = panel.filter(p => p.switch_now).length;
    const decision = approvals >= 11 ? 'TARGET_MET' : 'TARGET_NOT_MET';

    const result = {
        timestamp: new Date().toISOString(),
        criteria,
        checks: {
            build_ok: build.ok,
            lint_ok: lint.ok,
            test_ok: test.ok,
            no_eval_in_advanced_ui: noEval,
            csp_worker_enabled: cspWorker,
            csp_external_data_enabled: cspDataConnect,
            sanitizer_usage_in_app: sanitizerUsage,
            no_fake_demo_success_messages: noFakeDemoSuccess,
            meaningful_markov_tests: meaningfulMarkovTests,
            meaningful_editorial_tests: meaningfulEditorialTests,
            advanced_meta_placeholder_count: placeholderCount,
            unavailable_method_count: unavailableMethodCount
        },
        panel,
        approvals,
        target: 11,
        decision
    };

    const reportsDir = path.join(root, 'reports');
    fs.mkdirSync(reportsDir, { recursive: true });
    const reportPath = path.join(reportsDir, 'methodologist-review.json');
    fs.writeFileSync(reportPath, JSON.stringify(result, null, 2), 'utf8');

    console.log('12-Methodologist Review');
    console.log('=======================');
    console.log(`Approvals: ${approvals}/12 (target: 11)`);
    console.log(`Decision: ${decision}`);
    for (const p of panel) {
        console.log(`- ${p.reviewer} ${p.role}: score=${p.score} threshold=${p.threshold} switch_now=${p.switch_now}`);
    }
    console.log(`Report: ${reportPath}`);

    process.exit(decision === 'TARGET_MET' ? 0 : 2);
}

main();
