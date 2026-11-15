'use strict';
// Runs nma-dose-response-app/js/utils/exports.js (a plain script of function declarations) in a vm
// context and prints exportLatexDocument() for the cases read as JSON from stdin, as JSON.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const file = path.join(__dirname, '..', '..', 'nma-dose-response-app', 'js', 'utils', 'exports.js');
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
const cases = JSON.parse(fs.readFileSync(0, 'utf8'));
const out = {};
for (const [name, data] of Object.entries(cases)) out[name] = ctx.exportLatexDocument(data);
process.stdout.write(JSON.stringify(out));
