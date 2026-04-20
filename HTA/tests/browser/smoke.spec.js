const { test, expect } = require('@playwright/test');
const path = require('path');

// Use file:// protocol with proper forward-slash path
const APP_URL = 'file:///' + path.resolve(__dirname, '../../index.html').replace(/\\/g, '/');

test.describe('HTA App Browser Smoke Tests', () => {

    test('page loads without critical JS errors', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));
        await page.goto(APP_URL);
        await page.waitForLoadState('domcontentloaded');
        // Allow non-critical errors (e.g. CSP for CDN on file://) but no SyntaxError/ReferenceError
        const critical = errors.filter(e =>
            e.includes('SyntaxError') || e.includes('ReferenceError')
        );
        expect(critical, 'Should have no SyntaxError or ReferenceError').toHaveLength(0);
    });

    test('title contains HTA', async ({ page }) => {
        await page.goto(APP_URL);
        const title = await page.title();
        expect(title.toLowerCase()).toContain('hta');
    });

    test('all engine classes load on window', async ({ page }) => {
        await page.goto(APP_URL);
        await page.waitForLoadState('domcontentloaded');
        const engines = await page.evaluate(() => {
            return {
                MarkovEngine: typeof window.MarkovEngine,
                NetworkMetaAnalysis: typeof window.NetworkMetaAnalysis,
                BudgetImpactEngine: typeof window.BudgetImpactEngine,
                MCDAEngine: typeof window.MCDAEngine,
                CompetingRisksEngine: typeof window.CompetingRisksEngine,
                CureModelEngine: typeof window.CureModelEngine,
                SemiMarkovEngine: typeof window.SemiMarkovEngine,
                CorrelatedPSAEngine: typeof window.CorrelatedPSAEngine,
                ThresholdAnalysisEngine: typeof window.ThresholdAnalysisEngine,
                ModelAveragingEngine: typeof window.ModelAveragingEngine,
                EVSIEngine: typeof window.EVSIEngine,
                MultiStateModelEngine: typeof window.MultiStateModelEngine,
                CountryProfileLibrary: typeof window.CountryProfileLibrary,
                CoxRegressionEngine: typeof window.CoxRegressionEngine,
                GuyotIPDEngine: typeof window.GuyotIPDEngine,
                ExpectedLossEngine: typeof window.ExpectedLossEngine,
                RegulatoryTemplateEngine: typeof window.RegulatoryTemplateEngine,
                GRADEAutomationEngine: typeof window.GRADEAutomationEngine,
                LivingHTAEngine: typeof window.LivingHTAEngine
            };
        });
        for (const [name, type] of Object.entries(engines)) {
            expect(type, `${name} should be a function`).toBe('function');
        }
    });

    test('PCG32 determinism works in browser', async ({ page }) => {
        await page.goto(APP_URL);
        await page.waitForLoadState('domcontentloaded');
        const result = await page.evaluate(() => {
            const rng = new PCG32(12345);
            return [rng.nextDouble(), rng.nextDouble(), rng.nextDouble()];
        });
        // Known deterministic values from unit tests
        expect(result[0]).toBeCloseTo(0.5309738010460006, 10);
        expect(result[1]).toBeCloseTo(0.5041090831311836, 10);
        expect(result[2]).toBeCloseTo(0.2835282705406984, 10);
    });

    test('KahanSum compensated summation works in browser', async ({ page }) => {
        await page.goto(APP_URL);
        await page.waitForLoadState('domcontentloaded');
        const result = await page.evaluate(() => {
            // Standard Kahan: verify it accumulates correctly for typical HTA sums
            const ks = new KahanSum();
            for (let i = 0; i < 10000; i++) ks.add(0.1);
            const kahanResult = ks.total();

            // NeumaierSum handles the extreme catastrophic cancellation case
            const ns = new NeumaierSum();
            ns.add(1e16);
            ns.add(1.0);
            ns.add(-1e16);
            const neumaierResult = ns.total();

            return { kahanResult, neumaierResult };
        });
        // Kahan sum of 10000 * 0.1 should be very close to 1000
        expect(result.kahanResult).toBeCloseTo(1000.0, 8);
        // NeumaierSum preserves the 1.0 in catastrophic cancellation
        expect(result.neumaierResult).toBe(1.0);
    });

    test('ExpressionParser evaluates arithmetic in browser', async ({ page }) => {
        await page.goto(APP_URL);
        await page.waitForLoadState('domcontentloaded');
        const result = await page.evaluate(() => {
            // ExpressionParser is an object with .evaluate(), not a class
            return ExpressionParser.evaluate('2 + 3 * 4', {});
        });
        expect(result).toBe(14);
    });

    test('MarkovEngine runs a simple 2-state model in browser', async ({ page }) => {
        await page.goto(APP_URL);
        await page.waitForLoadState('domcontentloaded');
        const result = await page.evaluate(() => {
            const engine = new MarkovEngine({ logger: { warn: () => {}, error: () => {} } });
            const project = {
                version: '0.1',
                metadata: { id: 'smoke-test', name: 'Smoke Test Markov' },
                model: { type: 'markov_cohort' },
                settings: {
                    time_horizon: 5,
                    cycle_length: 1,
                    discount_rate_costs: 0.035,
                    discount_rate_qalys: 0.035,
                    half_cycle_correction: 'none',
                    starting_age: 55
                },
                parameters: {
                    p_death: { value: 0.1 },
                    c_alive: { value: 1000 },
                    u_alive: { value: 0.8 }
                },
                states: {
                    alive: {
                        label: 'Alive',
                        initial_probability: 1,
                        cost: 'c_alive',
                        utility: 'u_alive'
                    },
                    dead: {
                        label: 'Dead',
                        type: 'absorbing',
                        cost: 0,
                        utility: 0
                    }
                },
                transitions: {
                    alive_to_dead: { from: 'alive', to: 'dead', probability: 'p_death' },
                    alive_to_alive: { from: 'alive', to: 'alive', probability: 'complement' },
                    dead_to_dead: { from: 'dead', to: 'dead', probability: 1 }
                },
                strategies: {
                    base: {
                        label: 'Base',
                        is_comparator: true,
                        overrides: {}
                    }
                }
            };
            return engine.run(project);
        });
        expect(result).toBeDefined();
        expect(result.total_costs).toBeGreaterThan(0);
        expect(result.total_qalys).toBeGreaterThan(0);
    });

    test('CountryProfileLibrary lists countries and returns UK WTP', async ({ page }) => {
        await page.goto(APP_URL);
        await page.waitForLoadState('domcontentloaded');
        const result = await page.evaluate(() => {
            const lib = new CountryProfileLibrary();
            const countries = lib.listCountries();
            const ukWTP = lib.getWTP('uk');
            const canadaDiscount = lib.getDiscountRates('canada');
            return {
                count: countries.length,
                ukWTPValue: ukWTP.value,
                canadaDiscountCosts: canadaDiscount.costs
            };
        });
        expect(result.count).toBeGreaterThanOrEqual(20);
        expect(result.ukWTPValue).toBe(30000);
        expect(result.canadaDiscountCosts).toBeCloseTo(0.015, 5);
    });

    test('dark mode toggle button exists', async ({ page }) => {
        await page.goto(APP_URL);
        await page.waitForLoadState('domcontentloaded');
        const hasDarkModeToggle = await page.evaluate(() => {
            return document.getElementById('btn-dark-mode') !== null;
        });
        expect(hasDarkModeToggle).toBe(true);
    });

    test('script tags load correctly (49+ engine scripts)', async ({ page }) => {
        await page.goto(APP_URL);
        await page.waitForLoadState('domcontentloaded');
        const scriptCount = await page.evaluate(() => {
            return document.querySelectorAll('script[src]').length;
        });
        // The app has 49+ engine/utility scripts plus CDN scripts
        expect(scriptCount).toBeGreaterThanOrEqual(40);
    });

    test('main navigation renders', async ({ page }) => {
        await page.goto(APP_URL);
        await page.waitForLoadState('domcontentloaded');
        const navExists = await page.evaluate(() => {
            const nav = document.querySelector('nav') ||
                        document.querySelector('.nav-container') ||
                        document.querySelector('.sidebar') ||
                        document.querySelector('[role="navigation"]');
            return nav !== null;
        });
        expect(navExists).toBe(true);
    });

    test('service worker API is available', async ({ page }) => {
        await page.goto(APP_URL);
        const swSupported = await page.evaluate(() => {
            return 'serviceWorker' in navigator;
        });
        expect(swSupported).toBe(true);
    });
});
