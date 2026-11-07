import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');
const reference = JSON.parse(read('./p07-extras-reference.json'));
const md5 = bytes => createHash('md5').update(bytes).digest('hex');
const attributes = new URL('./.gitattributes', import.meta.url);

for (const [kind, file] of [['input', 'p07-extras-input.json'], ['script', 'p07-extras-reference.R']]) {
  test(`P07 review plant: ${kind} checkout preserves the pinned LF bytes`, () => {
    const rules = existsSync(attributes) ? readFileSync(attributes, 'utf8').split(/\r?\n/) : [];
    assert.ok(rules.includes(`${file} text eol=lf`), `${file} must explicitly retain LF on checkout`);
    const bytes = readFileSync(new URL(file, import.meta.url));
    assert.ok(!bytes.includes(13), `${file} must already use LF in this checkout`);
    assert.equal(md5(bytes), reference.provenance[`${kind}_md5`]);
  });

  test(`P07 review control: ${kind} LF hash is pinned and content corruption is detected`, () => {
    const lf = read(file).replaceAll('\r\n', '\n');
    assert.equal(md5(lf), reference.provenance[`${kind}_md5`]);
    assert.notEqual(md5(lf + 'changed'), reference.provenance[`${kind}_md5`]);
  });
}

// Execute the helper's actual assertion against a Locator-shaped DOM boundary.
// innerText models the existing CSS uppercase transform; textContent retains DOM case.
const helper = read('./p07-extras-browser-replay.mjs');
const assertions = helper.match(/^\s*assert\.equal\(await page\.locator\('#alm-plus-validate h2'\).*;$/gm);
assert.equal(assertions?.length, 1, 'Exercise exactly the browser helper heading assertion');
const heading = (textContent, innerText) => vm.runInNewContext(`(async () => { ${assertions[0]} })()`, {
  assert,
  page: { locator(selector) {
    assert.equal(selector, '#alm-plus-validate h2');
    return { textContent: async () => textContent, innerText: async () => innerText };
  } }
});

test('P07 review plant: uppercase CSS does not change the heading DOM-text contract', async () => {
  await heading('Validate the extras in R', 'VALIDATE THE EXTRAS IN R');
});

test('P07 review control: untransformed correct heading passes', async () => {
  await heading('Validate the extras in R', 'Validate the extras in R');
});

test('P07 review control: incorrect heading text still fails', async () => {
  await assert.rejects(heading('Wrong heading', 'WRONG HEADING'), { code: 'ERR_ASSERTION' });
  await assert.rejects(heading('VALIDATE THE EXTRAS IN R', 'VALIDATE THE EXTRAS IN R'), { code: 'ERR_ASSERTION' });
});
