#!/usr/bin/env node
// Backfill `added: "YYYY-MM-DD"` into hub/projects.js for every entry.
// Date = oldest commit that introduced the entry's `path:` string into
// hub/projects.js (i.e. when the project was added to the catalog).
// Idempotent: rewrites the `added:` line if present, inserts after `path:` if not.
//
// Usage:  node scripts/backfill-added-dates.mjs
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const projectsPath = join(repoRoot, 'hub', 'projects.js');
const src = readFileSync(projectsPath, 'utf8');
const lines = src.split('\n');

const pathLineRe = /^(\s{4})path:\s+"([^"]+)",\s*$/;
const addedLineRe = /^\s{4}added:\s+"[^"]*",\s*$/;

function firstAddDate(pathStr) {
  // git log -S finds commits that change the count of the literal string.
  // The OLDEST such commit (--reverse, head -1) is the one that introduced it.
  const arg = `"${pathStr}"`;
  try {
    const out = execSync(
      `git log --reverse --format=%aI -S ${JSON.stringify(arg)} -- hub/projects.js`,
      { cwd: repoRoot, encoding: 'utf8' }
    ).trim();
    const first = out.split('\n')[0]?.trim();
    if (!first) return null;
    return first.slice(0, 10);
  } catch (err) {
    console.warn(`  ! git log failed for ${pathStr}: ${err.message}`);
    return null;
  }
}

const out = [];
let updated = 0;
let inserted = 0;
let skipped = 0;
let lastPathDate = null;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const m = line.match(pathLineRe);
  if (m) {
    const indent = m[1];
    const pathStr = m[2];
    const date = firstAddDate(pathStr);
    if (date) {
      lastPathDate = date;
      out.push(line);
      // Check if next non-comment line is already `added:` — replace it
      const next = lines[i + 1] ?? '';
      if (addedLineRe.test(next)) {
        out.push(`${indent}added: "${date}",`);
        i++; // skip original added line
        updated++;
      } else {
        out.push(`${indent}added: "${date}",`);
        inserted++;
      }
      process.stdout.write(`  ${date}  ${pathStr}\n`);
    } else {
      out.push(line);
      lastPathDate = null;
      skipped++;
      process.stdout.write(`  ????-??-??  ${pathStr}  (no git history)\n`);
    }
  } else {
    out.push(line);
  }
}

writeFileSync(projectsPath, out.join('\n'), 'utf8');
console.log(`\nDone.  inserted=${inserted}  updated=${updated}  skipped=${skipped}`);
