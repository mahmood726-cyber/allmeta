/**
 * Real HTTP Chromium test of the HTA BudgetImpactEngine shipped by HTA/index.html.
 * No BIA data-entry UI is currently exposed, so these verify actual loaded
 * browser engine behavior, NOT a full guided BIA import/plot/export workflow.
 */
import { test, expect } from '@playwright/test';

const URL = 'http://localhost:8088/HTA/index.html';
const group = (population, drugCost = 1) => ({
    population, prevalence: 1, timeHorizon: 1, uptake: [1],
    newTx: { drugCost }, currentTx: { drugCost: 0 }, discountRate: 0
});

test('HTA loads production BIA engine from its actual app URL', async ({ page }) => {
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await expect.poll(async () => page.evaluate(() => typeof window.BudgetImpactEngine)).toBe('function');
    const r = await page.evaluate(() => {
        const engine = new window.BudgetImpactEngine();
        return engine.run({
            population: 100000, prevalence: .05, timeHorizon: 3,
            uptake: [.1, .3, .5], newTx: { drugCost: 5000 },
            currentTx: { drugCost: 2000 },
            offsets: { hospitalization: -500 }, discountRate: .03
        });
    });
    expect(r.yearlyBudget.map(y => y.patients)).toEqual([500, 1500, 2500]);
    expect(r.netBudgetImpact).toBe(11250000);
    expect(r.totalDiscounted).toBeCloseTo(10782001.13112, 4);
});

test('browser engine refuses unsafe aggregate patient counts and recovers', async ({ page }) => {
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    const r = await page.evaluate((one) => {
        const e = new window.BudgetImpactEngine();
        let refused;
        try { e.subpopulationAnalysis({subpopulations: [
            {...one,population:Number.MAX_SAFE_INTEGER},
            {...one,population:Number.MAX_SAFE_INTEGER}, one
        ]}); refused = false; } catch(err) { refused = /safe integer|precision/.test(err.message); }
        const valid = e.subpopulationAnalysis({subpopulations: [one,{...one,population:100}]});
        return {refused, valid};
    }, group(1));
    expect(r.refused).toBe(true);
    expect(r.valid.total.cumulativePatients).toBe(101);
});

test('browser engine refuses infinite subtotal and scenario differences', async ({ page }) => {
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    const r = await page.evaluate(() => {
        const e = new window.BudgetImpactEngine();
        const base = p => ({
            population:1,prevalence:1,timeHorizon:1,uptake:[1],
            newTx:{drugCost:p},currentTx:{drugCost:0},discountRate:0
        });
        let subgroupRefused = false, scenarioRefused = false;
        try { e.subpopulationAnalysis({subpopulations:[base(1e308),base(1e308)]}); }
        catch(err) { subgroupRefused=/overflow/.test(err.message); }
        try { e.scenarioAnalysis({...base(0),offsets:{savings:-1e308}},{
            reversal:{newTx:{drugCost:1e308},offsets:{savings:0}}
        }); }
        catch(err) { scenarioRefused=/overflow/.test(err.message); }
        return {subgroupRefused, scenarioRefused, valid: e.run(base(100)).netBudgetImpact};
    });
    expect(r.subgroupRefused).toBe(true);
    expect(r.scenarioRefused).toBe(true);
    expect(r.valid).toBe(100);
});
