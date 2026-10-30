import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

export const cases = [
  { id: 'plain', kind: 'control', label: 'Trial A' },
  { id: 'quoted', kind: 'control', label: 'Trial "A"' },
  { id: 'apostrophe', kind: 'control', label: "O'Brien" },
  { id: 'unknown_escape', kind: 'plant', label: String.raw`Trial\q` },
  { id: 'literal_tab', kind: 'plant', label: String.raw`Trial\tA` },
  { id: 'literal_escapes', kind: 'plant', label: String.raw`Trial\a\b\f\n\r\t\v\x41\u0041` },
  { id: 'trailing_backslash', kind: 'plant', label: 'Trial\\' },
  { id: 'repeated_backslashes', kind: 'plant', label: String.raw`Trial\\A` },
  { id: 'backslash_quote', kind: 'plant', label: String.raw`Trial\"A` },
  // Newline and tab delimit the app's input format, so exercise these directly
  // at the string-serialization boundary instead of changing CSV semantics.
  { id: 'control_characters', kind: 'plant', label: 'Trial\x07\b\f\n\r\t\vA', direct: true },
];

const html = readFileSync(new URL('../../../../meta-regression/index.html', import.meta.url), 'utf8');
export const appSha256 = createHash('sha256').update(html).digest('hex');
function extract(start, end) {
  const from = html.indexOf(start);
  const to = html.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Missing app function boundary: ${start}`);
  return html.slice(from, to);
}
// Execute the actual app functions, with no copied encoder or browser dependency.
const context = vm.createContext({});
vm.runInContext(extract('    function parseStudies(', '    function fit(')
  + extract('    function rScript(', '    function loadSaved('), context);

export function exportCase(item) {
  const input = `${item.label}, -0.28, 0.12, 32\nTrial B, -0.22, 0.09, 35\nTrial C, -0.15, 0.11, 42\nTrial D, -0.10, 0.13, 48`;
  const parsed = context.parseStudies(item.direct ? input.replace(item.label, 'Trial A') : input);
  assert.equal(parsed.warnings.length, 0);
  assert.equal(parsed.studies.length, 4);
  if (item.direct) parsed.studies[0].label = item.label;
  assert.equal(parsed.studies[0].label, item.label, 'Input parser must preserve the planted label');
  return context.rScript(parsed.studies, {});
}

// Prepare exact exports and an R-readable manifest in TEMP for the native replay.
// Integer code points keep the independent R input free of JS/R escape ambiguity.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const directory = join(tmpdir(), 'allmeta-p08-r3');
  mkdirSync(directory, { recursive: true });
  const entries = cases.map(item => {
    writeFileSync(join(directory, `${item.id}.R`), exportCase(item), 'utf8');
    const points = Array.from(item.label, char => char.codePointAt(0));
    return `list(id="${item.id}", kind="${item.kind}", label=intToUtf8(c(${points.join(',')})))`;
  });
  writeFileSync(join(directory, 'cases.R'), `app_sha256 <- "${appSha256}"\ncases <- list(\n${entries.join(',\n')}\n)\n`);
  console.log(`Prepared ${cases.length} exact app exports in ${directory}`);
}
