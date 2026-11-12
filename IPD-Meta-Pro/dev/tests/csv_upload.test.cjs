'use strict';
// CSV / TSV upload (Data > drop zone / #fileInput) must load every column as written in the file.
// parseDelimited split each row with line.match(/("([^"]|"")*"|[^,]*)/g). `[^,]*` also matches the empty string, so
// after every field the regex yields an empty match at the comma position: "S1,1,11.148881" -> ["S1","","1","",
// "11.148881",""], and the row loaded as {study:"S1", treat:"", y:1}. Every column after the first was shifted onto an
// empty match or onto the previous column's value, so a CSV upload never gave the data a JSON upload gives. The TSV
// branch matched /[^\t]+/g, which drops empty fields and shifts the next value left. Headers were split on the bare
// delimiter, so a quoted header containing the delimiter became two columns; "" escapes were not unescaped; a quoted
// field spanning lines was cut into two rows; numbers were read with parseFloat, so "1.5abc" became 1.5 and a quoted
// decimal-comma value "11,148881" became 11 without any warning. parseCSV (an unused second copy) had the same regex.
//   node dev/tests/csv_upload.test.cjs [path/to/ipd-meta-pro.html]
const path = require('node:path');
const { loadPage } = require('./p60_page_loader.cjs');
const pageFile = process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html');
const { run, sandbox } = loadPage(pageFile);
let passed = 0, failed = 0;
const check = (name, ok, detail) => { if (ok) passed++; else failed++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  [' + detail + ']')); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const parse = (text, delim) => { sandbox.__t = text; sandbox.__d = delim; return JSON.parse(JSON.stringify(run('parseDelimited(__t, __d)'))); };

const cases = [
  { name: 'plain comma CSV (the uploaded IPD rows)', text: 'study,treat,y\nS1,1,11.148881\nS2,0,-0.5\n',
    headers: ['study', 'treat', 'y'], data: [{ study: 'S1', treat: 1, y: 11.148881 }, { study: 'S2', treat: 0, y: -0.5 }] },
  { name: 'quoted fields with commas, "" escapes, empty fields; quoted header with a comma',
    text: 'study,"arm, label",y,note\n"S, 1",1,11.5,"He said ""hi"""\nS2,,3.25,\n"S3",0,-2,plain\n',
    headers: ['study', 'arm, label', 'y', 'note'],
    data: [{ study: 'S, 1', 'arm, label': 1, y: 11.5, note: 'He said "hi"' }, { study: 'S2', 'arm, label': '', y: 3.25, note: '' }, { study: 'S3', 'arm, label': 0, y: -2, note: 'plain' }] },
  { name: 'CRLF line ends, blank line and trailing newline', text: 'study,treat,y\r\nS1,1,11.148881\r\nS1,0,9.5\r\n\r\n',
    headers: ['study', 'treat', 'y'], data: [{ study: 'S1', treat: 1, y: 11.148881 }, { study: 'S1', treat: 0, y: 9.5 }] },
  { name: 'no trailing newline', text: 'study,treat,y\nS1,1,2',
    headers: ['study', 'treat', 'y'], data: [{ study: 'S1', treat: 1, y: 2 }] },
  { name: 'UTF-8 byte-order mark before the header', text: '﻿study,treat,y\nS1,1,11.148881\n',
    headers: ['study', 'treat', 'y'], data: [{ study: 'S1', treat: 1, y: 11.148881 }] },
  { name: 'tab-delimited (.tsv) with empty fields', text: 'study\ttreat\ty\tnote\nS1\t1\t11.148881\t\nS1\t\t9.5\tx\n', delim: '\t',
    headers: ['study', 'treat', 'y', 'note'], data: [{ study: 'S1', treat: 1, y: 11.148881, note: '' }, { study: 'S1', treat: '', y: 9.5, note: 'x' }] },
  { name: 'tab-delimited content in a .csv file (delimiter detected from the header)', text: 'study\ttreat\ty\nS1\t1\t2.5\n',
    headers: ['study', 'treat', 'y'], data: [{ study: 'S1', treat: 1, y: 2.5 }] },
  { name: 'semicolon-delimited with decimal commas (European Excel export)', text: 'study;treat;y\nS1;1;11,148881\nS1;0;-9,5\n',
    headers: ['study', 'treat', 'y'], data: [{ study: 'S1', treat: 1, y: 11.148881 }, { study: 'S1', treat: 0, y: -9.5 }] },
  { name: 'quoted field spanning two lines', text: 'study,treat,note,y\nS1,1,"line one\nline two",4.5\nS2,0,x,1e-3\n',
    headers: ['study', 'treat', 'note', 'y'], data: [{ study: 'S1', treat: 1, note: 'line one\nline two', y: 4.5 }, { study: 'S2', treat: 0, note: 'x', y: 0.001 }] },
  { name: 'text that only starts with a number stays text; NA stays text', text: 'study,treat,y\nS1,1,1.5abc\nS1,0,NA\n',
    headers: ['study', 'treat', 'y'], data: [{ study: 'S1', treat: 1, y: '1.5abc' }, { study: 'S1', treat: 0, y: 'NA' }] },
  { name: 'number forms: padded, signed, leading dot, exponent, quoted number', text: 'a,b,c,d,e,f\n 2 ,+3,.5,1E3,"42",-\n',
    headers: ['a', 'b', 'c', 'd', 'e', 'f'], data: [{ a: 2, b: 3, c: 0.5, d: 1000, e: 42, f: '-' }] },
  { name: 'short row: missing trailing fields load as empty', text: 'study,treat,y\nS1,1\n',
    headers: ['study', 'treat', 'y'], data: [{ study: 'S1', treat: 1, y: '' }] }
];
for (const c of cases) {
  const r = parse(c.text, c.delim);
  check('parseDelimited: ' + c.name, same(r.headers, c.headers) && same(r.data, c.data),
    'headers ' + JSON.stringify(r.headers) + ' data ' + JSON.stringify(r.data));
}

// A decimal comma inside a comma-delimited file is ambiguous (11,148881 could be a thousands separator); it must not be
// read as 11. It stays text and the parse reports which column holds such values.
{
  const r = parse('study,treat,y\nS1,1,"11,148881"\nS1,0,"9,5"\n');
  check('comma CSV with quoted decimal commas: not truncated to 11, reported', r.data[0].y === '11,148881' && r.data[1].y === '9,5' &&
    Array.isArray(r.warnings) && r.warnings.some(w => /\by\b/.test(w) && /decimal comma/i.test(w)), JSON.stringify(r));
}

// The unused second copy must not keep the broken regex.
sandbox.__t = 'study,treat,y\nS1,1,11.148881\n';
check('parseCSV (second copy) gives the same row', same(JSON.parse(JSON.stringify(run('parseCSV(__t).data'))), [{ study: 'S1', treat: 1, y: 11.148881 }]),
  JSON.stringify(run('parseCSV(__t).data')));

// End to end through handleFile (the drop zone / #fileInput handler) with a FileReader that returns the file text.
sandbox.FileReader = function () { const self = this; this.readAsText = function (f) { self.onload({ target: { result: f.__text } }); }; this.readAsArrayBuffer = this.readAsText; };
run('window.__notes = []; showNotification = function (m, t) { __notes.push(String(t) + ": " + String(m)); }; APP.data = null;');
sandbox.__file = { name: 'ipd_rows.csv', __text: 'study,treat,y\nS1,1,11.148881\nS1,0,9.5\nS2,1,10.25\n' };
run('handleFile(__file)');
const loaded = JSON.parse(JSON.stringify(run('APP.data')));
check('handleFile on a .csv: APP.data holds the file\'s values', same(loaded, [{ study: 'S1', treat: 1, y: 11.148881 }, { study: 'S1', treat: 0, y: 9.5 }, { study: 'S2', treat: 1, y: 10.25 }]),
  JSON.stringify(loaded) + ' notes ' + JSON.stringify(run('__notes')));
run('APP.data = null; __notes.length = 0;');
sandbox.__file = { name: 'eu.csv', __text: 'study,treat,y\nS1,1,"11,148881"\n' };
run('handleFile(__file)');
const notes = JSON.parse(JSON.stringify(run('__notes')));
check('handleFile on a .csv with quoted decimal commas: the user is told', notes.some(n => /^warning/.test(n) && /decimal comma/i.test(n)), JSON.stringify(notes));

console.log(passed + '/' + (passed + failed) + ' PASS');
process.exitCode = failed ? 1 : 0;
