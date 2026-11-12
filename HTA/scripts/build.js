#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const repoRoot = path.resolve(root, '..');
// Layout: <outDir>/HTA/ holds the app; files the page loads from outside HTA/ (../shared/, ../hub/)
// are copied to <outDir>/<same path from the repository root>, so every relative URL (and its SRI
// hash) resolves unchanged in the built copy.
const outDir = process.env.HTA_DIST_DIR ? path.resolve(process.env.HTA_DIST_DIR) : path.join(root, 'dist');
const appOut = path.join(outDir, path.basename(root));

const includePaths = [
    'index.html',
    'manifest.json',
    'service-worker.js',
    'src',
    'schemas',
    'reference-models',
    'README.md'
];

function ensureDir(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
}

function copyRecursive(src, dest) {
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
        ensureDir(dest);
        for (const entry of fs.readdirSync(src)) {
            copyRecursive(path.join(src, entry), path.join(dest, entry));
        }
        return;
    }
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
}

function collectJsFiles(dir) {
    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...collectJsFiles(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            files.push(fullPath);
        }
    }
    return files;
}

function checkSyntax(files) {
    for (const file of files) {
        const result = spawnSync(process.execPath, ['--check', file], { stdio: 'pipe', encoding: 'utf8' });
        if (result.status !== 0) {
            process.stderr.write(result.stderr || result.stdout || `Syntax check failed: ${file}\n`);
            process.exit(result.status || 1);
        }
    }
}

// Every ../ resource of index.html (src/href attributes) and service-worker.js (string literals).
function externalRefs() {
    const refs = new Set();
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    for (const m of html.matchAll(/\b(?:src|href)\s*=\s*"(\.\.\/[^"#?]*)[^"]*"/g)) refs.add(m[1]);
    const swPath = path.join(root, 'service-worker.js');
    if (fs.existsSync(swPath)) {
        const sw = fs.readFileSync(swPath, 'utf8');
        for (const m of sw.matchAll(/['"](\.\.\/[^'"#?]*)[^'"]*['"]/g)) refs.add(m[1]);
    }
    // A query or fragment is not part of the file; a path ending in / is a navigation link
    // (the hub-back link href="../"), not a resource the page loads.
    return [...refs].filter(r => r.length > 3 && !r.endsWith('/'));
}

function build() {
    const srcDir = path.join(root, 'src');
    const jsFiles = collectJsFiles(srcDir);
    checkSyntax(jsFiles);

    fs.rmSync(outDir, { recursive: true, force: true });
    ensureDir(outDir);

    for (const relPath of includePaths) {
        const src = path.join(root, relPath);
        if (!fs.existsSync(src)) continue;
        copyRecursive(src, path.join(appOut, relPath));
    }

    const refs = externalRefs();
    for (const ref of refs) {
        const src = path.resolve(root, ref);
        const fromRepo = path.relative(repoRoot, src);
        if (fromRepo.startsWith('..') || path.isAbsolute(fromRepo)) {
            process.stderr.write(`Reference outside the repository: ${ref}\n`);
            process.exit(1);
        }
        if (!fs.existsSync(src) || !fs.statSync(src).isFile()) {
            process.stderr.write(`Referenced file not found: ${ref} (${src})\n`);
            process.exit(1);
        }
        copyRecursive(src, path.join(outDir, fromRepo));
    }

    console.log(`Build complete: ${jsFiles.length} JS files validated, ${refs.length} files from outside ${path.basename(root)}/ copied; open ${path.join(appOut, 'index.html')}`);
}

build();
