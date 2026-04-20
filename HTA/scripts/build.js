#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'dist');

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

function build() {
    const srcDir = path.join(root, 'src');
    const jsFiles = collectJsFiles(srcDir);
    checkSyntax(jsFiles);

    fs.rmSync(outDir, { recursive: true, force: true });
    ensureDir(outDir);

    for (const relPath of includePaths) {
        const src = path.join(root, relPath);
        if (!fs.existsSync(src)) continue;
        copyRecursive(src, path.join(outDir, relPath));
    }

    console.log(`Build complete: ${jsFiles.length} JS files validated, output written to ${outDir}`);
}

build();
