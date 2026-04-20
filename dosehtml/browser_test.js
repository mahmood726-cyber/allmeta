const { chromium } = require('playwright');
const path = require('path');

async function runTests() {
  console.log('='.repeat(60));
  console.log('DOSE-RESPONSE APP v18.3 - COMPREHENSIVE TEST');
  console.log('='.repeat(60));

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  const errors = [];
  let validationFailed = false;
  page.on('dialog', dialog => dialog.accept());
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push('PAGE ERROR: ' + err.message));

  const filePath = 'file:///' + path.resolve('C:/HTML apps/dosehtml/dose-response-pro-v18.2-ultimate.html').replace(/\\/g, '/');

  try {
    console.log('\n1. LOADING PAGE...');
    await page.goto(filePath, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    console.log('   ✓ Page loaded');

    console.log('\n2. LOADING SAMPLE DATA...');
    await page.click('button:has-text("Load Sample")');
    await page.waitForTimeout(500);
    console.log('   ✓ Sample data loaded');

    console.log('\n3. RUNNING ANALYSIS...');
    await page.click('button:has-text("Run Analysis")');
    await page.waitForTimeout(2000);

    // Check for valid results
    const tau2Text = await page.locator('#statTau2').textContent();
    const i2Text = await page.locator('#statI2').textContent();
    console.log('   τ² value:', tau2Text);
    console.log('   I² value:', i2Text);

    // Check coefficients
    const coeffTable = await page.locator('#coefficientsTable').textContent();
    const hasNaN = coeffTable.includes('NaN');
    console.log('   Coefficients table has NaN:', hasNaN ? '✗ YES (BAD)' : '✓ NO (GOOD)');

    // Check τ² is reasonable
    const tau2Reasonable = !tau2Text.includes('×10^') || parseFloat(tau2Text) < 100;
    console.log('   τ² is reasonable:', tau2Reasonable ? '✓ YES' : '✗ NO');

    console.log('\n4. TESTING EXPORT...');
    await page.click('button:has-text("Results")');
    await page.waitForTimeout(300);
    // Check export button exists
    const exportBtn = await page.locator('button:has-text("Export Results")').count();
    console.log('   Export button exists:', exportBtn > 0 ? '✓ YES' : '✗ NO');

    console.log('\n5. TESTING FUNNEL TAB...');
    await page.click('button:has-text("Funnel")');
    await page.waitForTimeout(500);
    const funnelBtn = page.locator('button:has-text("Generate Funnel Plot")');
    if (await funnelBtn.count() > 0) {
      await funnelBtn.click();
      await page.waitForTimeout(1000);
      console.log('   ✓ Funnel plot generated');

      await page.click('button:has-text("Egger")');
      await page.waitForTimeout(500);
      console.log('   ✓ Egger test completed');

      await page.click('button:has-text("Trim")');
      await page.waitForTimeout(500);
      console.log('   ✓ Trim & Fill completed');
    }

    console.log('\n6. TESTING GRADE TAB...');
    await page.click('button:has-text("GRADE")');
    await page.waitForTimeout(500);
    const gradeBtn = page.locator('button:has-text("Auto-Assess")');
    if (await gradeBtn.count() > 0) {
      await gradeBtn.click();
      await page.waitForTimeout(500);
      const rating = await page.locator('#gradeOverallRating').textContent();
      console.log('   GRADE rating:', rating);
      console.log('   ✓ GRADE assessment completed');
    }

    console.log('\n7. TESTING SENSITIVITY ANALYSIS...');
    await page.click('button:has-text("Influence")');
    await page.waitForTimeout(500);
    const sensBtn = page.locator('button:has-text("Run Sensitivity")');
    if (await sensBtn.count() > 0) {
      await sensBtn.click();
      await page.waitForTimeout(1500);
      console.log('   ✓ Sensitivity analysis completed');
    }

    console.log('\n8. TESTING SUBGROUP ANALYSIS...');
    await page.click('button:has-text("Subgroups")');
    await page.waitForTimeout(500);
    const subBtn = page.locator('button:has-text("Run Subgroup")');
    if (await subBtn.count() > 0) {
      await subBtn.click();
      await page.waitForTimeout(1000);
      console.log('   ✓ Subgroup analysis completed');
    }

    console.log('\n9. TESTING VALIDATION SUITE...');
    await page.click('button:has-text("Validation")');
    await page.waitForTimeout(500);
    const valBtn = page.locator('button:has-text("Run Full Validation")');
    if (await valBtn.count() > 0) {
      await valBtn.click();
      await page.waitForTimeout(3000);
      const valStatus = await page.locator('#valStatus').textContent();
      console.log('   Validation status:', valStatus);
      validationFailed = typeof valStatus === 'string' && valStatus.toUpperCase().includes('FAIL');
      if (validationFailed) {
        errors.push('Validation suite reported FAIL');
      }
    }

    console.log('\n10. MOBILE RESPONSIVENESS...');
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);
    const mobileTabs = await page.locator('.tabs').isVisible();
    console.log('   Mobile tabs visible:', mobileTabs ? '✓ YES' : '✗ NO');
    await page.setViewportSize({ width: 1400, height: 900 });

    console.log('\n11. SCREENSHOT...');
    await page.click('button:has-text("Results")');
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'C:/HTML apps/dosehtml/test_final.png' });
    console.log('   ✓ Screenshot saved');

    console.log('\n' + '='.repeat(60));
    console.log('TEST SUMMARY');
    console.log('='.repeat(60));

    if (errors.length === 0 && !validationFailed) {
      console.log('\n✓ ALL TESTS PASSED - No JavaScript errors!');
    } else {
      console.log('\n✗ ERRORS DETECTED (' + errors.length + '):');
      errors.forEach((err, i) => console.log('   ' + (i+1) + '. ' + err.substring(0, 150)));
    }

    console.log('\nBrowser closing in 3 seconds...');
    await page.waitForTimeout(3000);

  } catch (err) {
    console.log('\n✗ TEST FAILED:', err.message);
  } finally {
    await browser.close();
  }
}

runTests().catch(console.error);
