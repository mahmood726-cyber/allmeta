import { test, expect } from '@playwright/test';

// DTA SROC meta-regression covariate type (last input column). The column used to be read as numeric when every value
// passed Number(), so hexadecimal "0x10" entered as 16, and one typo ("12x") silently turned the whole column into text
// categories: a different meta-regression with no message. A covariate is numeric only when every value is a complete
// decimal number (the same token rule as the counts and the extras tab). A column that is mostly numbers but has some
// values that are not is refused with those studies listed in the Notes (the existing "Meta-regression: ..." refusal);
// a genuinely categorical column (mostly text labels) stays categorical.
const APP = 'dta-sroc';
const LEAD = 'Meta-regression: the covariate looks numeric but these values are not decimal numbers: ';
const COUNTS = [
  [47, 101, 9, 738], [126, 272, 51, 1543], [19, 12, 10, 192], [36, 78, 3, 276], [130, 211, 19, 959],
  [84, 68, 2, 89], [68, 112, 1, 423], [59, 55, 5, 136], [142, 571, 50, 2788], [137, 107, 24, 358],
];
const NUMERIC = ['1990', '1992', '1993', '1995', '1996', '1998', '2001', '2003', '2004', '2007'];
const rows = covs => COUNTS.map((c, i) => ['Study ' + (i + 1)].concat(c, covs[i]).join(', ')).join('\n');

async function run(page, covs) {
  await page.goto('/' + APP + '/index.html');
  await page.waitForFunction(() => typeof window.__almMetaRegression === 'function');
  await page.locator('#f-cov').selectOption('last');
  await page.locator('#f-data').fill(rows(covs));
  await page.getByRole('button', { name: 'Run analysis', exact: true }).click();
  await expect(page.locator('#svg-host svg')).toBeVisible();
  return page.evaluate(() => {
    const m = window.__almMetaRegression();
    return { terms: m ? m.coefTable.map(c => c.term) : null, coef: m ? m.coef : null,
      notes: document.getElementById('warn-banner').innerText };
  });
}

for (const [name, bad] of [['a trailing typo', '2001x'], ['hexadecimal', '0x7d1'], ['Infinity', 'Infinity'],
  ['an embedded space', '20 01']]) {
  test('DTA SROC covariate: one value with ' + name + ' in a numeric column is refused and listed, never read as categories', async ({ page }) => {
    const covs = NUMERIC.slice(); covs[6] = bad;
    const out = await run(page, covs);
    expect(out.terms, 'no meta-regression is fitted').toBeNull();
    expect(out.notes).toContain(LEAD + 'Study 7 (' + bad + ').');
  });
}

test('DTA SROC covariate: a column written entirely in hexadecimal is refused, not read as numbers', async ({ page }) => {
  const out = await run(page, NUMERIC.map(v => '0x' + Number(v).toString(16)));
  expect(out.terms).toBeNull();
  expect(out.notes).toContain(LEAD + 'Study 1 (0x7c6), Study 2 (0x7c8), Study 3 (0x7c9), Study 4 (0x7cb), Study 5 (0x7cc) and 5 more.');
});

test('DTA SROC covariate: valid decimal forms (+, exponent, leading dot) stay numeric with the same fit', async ({ page }) => {
  const plain = await run(page, NUMERIC);
  expect(plain.terms).toEqual(['(Intercept)', 'covariate', '(Intercept)', 'covariate']);
  const forms = NUMERIC.slice(); forms[0] = '+1990'; forms[1] = '1.992e3'; forms[2] = '1993.0';
  const same = await run(page, forms);
  expect(same.terms).toEqual(plain.terms);
  expect(same.coef).toEqual(plain.coef);
  const small = await run(page, NUMERIC.map((v, i) => (i === 0 ? '.5' : i === 1 ? '-0.25' : String((Number(v) - 1990) / 10))));
  expect(small.terms).toEqual(['(Intercept)', 'covariate', '(Intercept)', 'covariate']);
});

test('DTA SROC covariate: a genuinely categorical column stays categorical, including one number-like label', async ({ page }) => {
  const cats = ['IAQ', 'SAQ', 'IAQ', 'SAQ', 'IAQ', 'SAQ', 'IAQ', 'SAQ', 'IAQ', 'SAQ'];
  const out = await run(page, cats);
  expect(out.terms).toEqual(['(Intercept)', 'covariate = SAQ', '(Intercept)', 'covariate = SAQ']);
  const mixed = cats.slice(); mixed[0] = '3';
  const m = await run(page, mixed);
  expect(m.terms).toEqual(['(Intercept)', 'covariate = IAQ', 'covariate = SAQ', '(Intercept)', 'covariate = IAQ', 'covariate = SAQ']);
  expect(m.notes).not.toContain(LEAD);
});
