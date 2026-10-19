// Real DOM checks: numeric stubs cannot establish accessibility.
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const browser = await chromium.launch({channel: 'chrome'});
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(path.resolve(
      process.env.LIMIT_MA_PAGE || process.argv[2] || path.join(__dirname, '../index.html')
    )).href);
    const controls = page.locator('#alm-axis-mount input[data-edge="log"]');
    assert.equal(await controls.count(), 2, 'Expected both log toggles');
    const descriptionIds = [];
    for (const control of await controls.all()) {
      assert.ok(await control.isDisabled(), 'Log toggle must be disabled');
      const describedby = await control.getAttribute('aria-describedby');
      assert.ok(describedby?.trim(), 'Log toggle needs aria-describedby');
      let explanationId;
      for (const id of describedby.trim().split(/\s+/)) {
        const description = page.locator('[id=' + JSON.stringify(id) + ']');
        assert.equal(await description.count(), 1, 'Description id must resolve: ' + id);
        assert.ok(await description.isVisible(), 'Description must be visible: ' + id);
        const text = await description.innerText();
        if (/\blog(?:arithmic)?\b/i.test(text) && /\bax(?:es|is)\b/i.test(text) &&
            /\b(?:unsupported|not\s+supported|unavailable)\b/i.test(text)) {
          explanationId = id;
        }
      }
      assert.ok(explanationId, 'Visible description must explain that log axes are unsupported');
      descriptionIds.push(explanationId);
    }
    assert.equal(descriptionIds[0], descriptionIds[1], 'Both toggles must reference the explanation');
    console.log('PASS: two disabled log toggles reference a visible explanation that log axes are unsupported');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
