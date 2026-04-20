# HTA Comprehensive Improvement Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevate the HTA Artifact Standard from 948 tests / 26 engines to a genuinely world-class platform with full test coverage of untested modules, new HTA engines, and production-grade quality gates.

**Architecture:** All new engines follow the established UMD dual-export pattern (window + module.exports), use PCG32 for stochastic methods, KahanSum for numerical stability, and dependency injection via constructor options. Tests use Jest + jsdom with the existing `require()` pattern.

**Tech Stack:** Vanilla JavaScript (ES2022), Jest 29, fast-check (property-based), PCG32 PRNG, Kahan summation.

---

## Chunk 1: Test the Untested Critical Modules

### Task 1: Test `src/utils/kahan.js` (KahanSum + NeumaierSum)

**Files:**
- Test: `tests/utils/kahan.test.js` (CREATE)

- [ ] **Step 1: Write tests for KahanSum**

```javascript
'use strict';
const { KahanSum, NeumaierSum } = require('../../src/utils/kahan');

describe('KahanSum', () => {
    test('sums small array correctly', () => {
        const ks = new KahanSum();
        ks.add(1.0); ks.add(2.0); ks.add(3.0);
        expect(ks.total()).toBe(6.0);
    });

    test('handles catastrophic cancellation', () => {
        // Classic test: sum of 1e16 + 1.0 + (-1e16) should be 1.0
        const ks = new KahanSum();
        ks.add(1e16); ks.add(1.0); ks.add(-1e16);
        expect(ks.total()).toBe(1.0);
    });

    test('naive summation fails where Kahan succeeds', () => {
        // Sum 10 million 0.1s — naive gives ~1000000.0000001, Kahan is exact
        const ks = new KahanSum();
        let naive = 0;
        for (let i = 0; i < 1e7; i++) {
            ks.add(0.1);
            naive += 0.1;
        }
        // Kahan should be closer to 1000000.0 than naive
        const kahanErr = Math.abs(ks.total() - 1e6);
        const naiveErr = Math.abs(naive - 1e6);
        expect(kahanErr).toBeLessThan(naiveErr);
    });

    test('static sum works on array', () => {
        expect(KahanSum.sum([1, 2, 3, 4, 5])).toBe(15);
    });

    test('reset clears accumulator', () => {
        const ks = new KahanSum();
        ks.add(100); ks.reset();
        expect(ks.total()).toBe(0);
    });

    test('handles empty usage', () => {
        expect(new KahanSum().total()).toBe(0);
    });

    test('handles negative values', () => {
        expect(KahanSum.sum([-1, -2, -3])).toBe(-6);
    });

    test('handles alternating signs', () => {
        const values = [];
        for (let i = 0; i < 1000; i++) values.push(i % 2 === 0 ? 1e-10 : -1e-10);
        expect(KahanSum.sum(values)).toBeCloseTo(0, 15);
    });
});

describe('NeumaierSum', () => {
    test('sums correctly', () => {
        expect(NeumaierSum.sum([1, 2, 3])).toBe(6);
    });

    test('handles catastrophic cancellation', () => {
        const ns = new NeumaierSum();
        ns.add(1e16); ns.add(1.0); ns.add(-1e16);
        expect(ns.total()).toBe(1.0);
    });

    test('reset clears state', () => {
        const ns = new NeumaierSum();
        ns.add(42); ns.reset();
        expect(ns.total()).toBe(0);
    });

    test('static sum matches instance usage', () => {
        const arr = [1.1, 2.2, 3.3, 4.4];
        const ns = new NeumaierSum();
        arr.forEach(v => ns.add(v));
        expect(NeumaierSum.sum(arr)).toBeCloseTo(ns.total(), 12);
    });
});
```

- [ ] **Step 2: Run test**

Run: `npx jest tests/utils/kahan.test.js --no-coverage --forceExit`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add tests/utils/kahan.test.js
git commit -m "test: add KahanSum and NeumaierSum tests"
```

---

### Task 2: Test `src/utils/pcg32.js` (PCG32 PRNG)

**Files:**
- Test: `tests/utils/pcg32.test.js` (CREATE)

- [ ] **Step 1: Write comprehensive PRNG tests**

```javascript
'use strict';
const { PCG32 } = require('../../src/utils/pcg32');

describe('PCG32', () => {
    test('determinism: same seed produces same sequence', () => {
        const a = new PCG32(42);
        const b = new PCG32(42);
        for (let i = 0; i < 100; i++) {
            expect(a.nextU32()).toBe(b.nextU32());
        }
    });

    test('different seeds produce different sequences', () => {
        const a = new PCG32(1);
        const b = new PCG32(2);
        const aVals = Array.from({length: 10}, () => a.nextU32());
        const bVals = Array.from({length: 10}, () => b.nextU32());
        expect(aVals).not.toEqual(bVals);
    });

    test('golden sequence verification', () => {
        expect(PCG32.verifyDeterminism()).toBe(true);
    });

    test('nextFloat returns [0, 1)', () => {
        const rng = new PCG32(123);
        for (let i = 0; i < 10000; i++) {
            const v = rng.nextFloat();
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });

    test('nextDouble returns [0, 1) with 53-bit precision', () => {
        const rng = new PCG32(456);
        for (let i = 0; i < 1000; i++) {
            const v = rng.nextDouble();
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });

    test('nextInt stays in range', () => {
        const rng = new PCG32(789);
        for (let i = 0; i < 1000; i++) {
            const v = rng.nextInt(5, 15);
            expect(v).toBeGreaterThanOrEqual(5);
            expect(v).toBeLessThanOrEqual(15);
        }
    });

    test('uniform distribution', () => {
        const rng = new PCG32(101);
        const v = rng.uniform(10, 20);
        expect(v).toBeGreaterThanOrEqual(10);
        expect(v).toBeLessThanOrEqual(20);
    });

    test('normal distribution mean/sd', () => {
        const rng = new PCG32(202);
        const samples = Array.from({length: 10000}, () => rng.normal(5, 2));
        const mean = samples.reduce((a, b) => a + b) / samples.length;
        const sd = Math.sqrt(samples.reduce((a, b) => a + (b - mean) ** 2, 0) / (samples.length - 1));
        expect(mean).toBeCloseTo(5, 0);
        expect(sd).toBeCloseTo(2, 0);
    });

    test('lognormal returns positive values', () => {
        const rng = new PCG32(303);
        for (let i = 0; i < 100; i++) {
            expect(rng.lognormal(0, 0.5)).toBeGreaterThan(0);
        }
    });

    test('gamma returns positive values', () => {
        const rng = new PCG32(404);
        for (let i = 0; i < 100; i++) {
            expect(rng.gamma(2, 1)).toBeGreaterThan(0);
        }
        // shape < 1 branch
        for (let i = 0; i < 100; i++) {
            expect(rng.gamma(0.5, 1)).toBeGreaterThan(0);
        }
    });

    test('beta returns [0, 1]', () => {
        const rng = new PCG32(505);
        for (let i = 0; i < 1000; i++) {
            const v = rng.beta(2, 5);
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(1);
        }
    });

    test('weibull returns positive values', () => {
        const rng = new PCG32(606);
        for (let i = 0; i < 100; i++) {
            expect(rng.weibull(1.5, 2)).toBeGreaterThan(0);
        }
    });

    test('exponential returns positive values', () => {
        const rng = new PCG32(707);
        for (let i = 0; i < 100; i++) {
            expect(rng.exponential(1)).toBeGreaterThan(0);
        }
    });

    test('triangular returns [min, max]', () => {
        const rng = new PCG32(808);
        for (let i = 0; i < 100; i++) {
            const v = rng.triangular(1, 5, 10);
            expect(v).toBeGreaterThanOrEqual(1);
            expect(v).toBeLessThanOrEqual(10);
        }
    });

    test('categorical returns valid indices', () => {
        const rng = new PCG32(909);
        const probs = [0.2, 0.3, 0.5];
        for (let i = 0; i < 100; i++) {
            const idx = rng.categorical(probs);
            expect(idx).toBeGreaterThanOrEqual(0);
            expect(idx).toBeLessThanOrEqual(2);
        }
    });

    test('sample dispatches to correct distribution', () => {
        const rng = new PCG32(111);
        expect(rng.sample({ type: 'fixed', value: 42 })).toBe(42);
        expect(rng.sample({ type: 'constant', value: 7 })).toBe(7);
        expect(rng.sample({ type: 'normal', mean: 0, sd: 1 })).toBeDefined();
        expect(rng.sample({ type: 'beta', alpha: 2, beta: 5 })).toBeDefined();
        expect(rng.sample({ type: 'gamma', shape: 2, scale: 1 })).toBeDefined();
        expect(rng.sample({ type: 'uniform', min: 0, max: 1 })).toBeDefined();
        expect(rng.sample({ type: 'lognormal', meanlog: 0, sdlog: 0.5 })).toBeDefined();
        expect(rng.sample({ type: 'triangular', min: 1, mode: 5, max: 10 })).toBeDefined();
        expect(rng.sample({ type: 'exponential', rate: 1 })).toBeDefined();
        expect(rng.sample({ type: 'weibull', shape: 1.5, scale: 2 })).toBeDefined();
    });

    test('sample throws on invalid distribution', () => {
        const rng = new PCG32(222);
        expect(() => rng.sample({ type: 'invalid' })).toThrow();
        expect(() => rng.sample(null)).toThrow();
    });

    test('getState/setState allows resuming', () => {
        const rng = new PCG32(333);
        for (let i = 0; i < 50; i++) rng.nextU32();
        const state = rng.getState();
        const expected = rng.nextU32();

        const rng2 = new PCG32(0);
        rng2.setState(state);
        expect(rng2.nextU32()).toBe(expected);
    });
});
```

- [ ] **Step 2: Run test**

Run: `npx jest tests/utils/pcg32.test.js --no-coverage --forceExit`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add tests/utils/pcg32.test.js
git commit -m "test: add PCG32 PRNG tests — determinism, distributions, state"
```

---

### Task 3: Test `src/utils/mathUtils.js` (StatUtils)

**Files:**
- Test: `tests/utils/mathUtils.test.js` (CREATE)

- [ ] **Step 1: Write statistical utility tests**

Test mean, sd, percentile, percentileFromSorted, median, variance, confidence intervals, correlation. Read the full file first to identify all exported functions/methods, then write tests for each.

- [ ] **Step 2: Run and verify**
- [ ] **Step 3: Commit**

---

### Task 4: Test `src/utils/lifetable.js` (LifeTable)

**Files:**
- Test: `tests/utils/lifetable.test.js` (CREATE)

- [ ] **Step 1: Write life table tests**

Test: constructor, `getMortality(age, sex)`, edge cases (age 0, age 100+), interpolation, cumulative survival. Verify against known ONS data points.

- [ ] **Step 2: Run and verify**
- [ ] **Step 3: Commit**

---

### Task 5: Test `src/utils/audit.js` (AuditLogger)

**Files:**
- Test: `tests/utils/audit.test.js` (CREATE)

- [ ] **Step 1: Write audit trail tests**

Test: log creation, event types (MODEL_RUN, VALIDATION, EXPORT), timestamp ordering, export to JSON, filtering by type/date, audit report generation.

- [ ] **Step 2: Run and verify**
- [ ] **Step 3: Commit**

---

### Task 6: Test `src/utils/interoperability.js` (TreeAgeImporter + exports)

**Files:**
- Test: `tests/utils/interoperability.test.js` (CREATE)

- [ ] **Step 1: Write interoperability tests**

Test: TreeAge XML parsing, R code export, Excel column mapping, FHIR resource generation, invalid input handling. Use mock XML/data.

- [ ] **Step 2: Run and verify**
- [ ] **Step 3: Commit**

---

### Task 7: Test `src/parser/expression.js` (comprehensive — currently 23 lines)

**Files:**
- Modify: `tests/parser/expression.test.js` (EXPAND from 23 to ~300 lines)

- [ ] **Step 1: Write comprehensive expression parser tests**

Test categories:
- Arithmetic: `1+2`, `3*4/2`, operator precedence `2+3*4=14`
- Comparisons: `5>3`, `2<=2`, `1==1`, `1!=2`
- Boolean: `1 and 0`, `1 or 0`, `not 0`
- Functions: `exp(0)=1`, `ln(1)=0`, `sqrt(4)=2`, `abs(-5)=5`, `min(1,2)=1`, `max(1,2)=2`
- HTA functions: `rate_to_prob(0.1, 1)`, `prob_to_rate(0.5, 1)`, `clamp(5, 0, 1)=1`
- Conditional: `if(1, 10, 20)=10`, `if(0, 10, 20)=20`
- Variables: evaluate with context `{age: 55, cost: 1000}`
- Edge cases: division by zero, nested parens, right-associative `^`
- Security: reject `__proto__`, `constructor`, function injection attempts
- Error handling: unmatched parens, unknown functions, empty input

- [ ] **Step 2: Run tests**
- [ ] **Step 3: Commit**

---

### Task 8: Test `src/validator/` (schema.js + semantic.js + validator.js)

**Files:**
- Test: `tests/validator/schema.test.js` (CREATE)
- Test: `tests/validator/semantic.test.js` (CREATE)
- Test: `tests/validator/validator.test.js` (CREATE)

- [ ] **Step 1: Write schema validation tests**

Test: valid project passes, missing required fields fail, invalid types fail, version validation, nested schema validation.

- [ ] **Step 2: Write semantic validation tests**

Test: reference integrity (state refs valid transitions), probability bounds [0,1], mass conservation (row sums = 1), circular dependency detection, clinical plausibility warnings.

- [ ] **Step 3: Write HTAValidator integration tests**

Test: `validateProject()` with valid/invalid projects, `generateReport()` format, error code classification (E0xx vs W0xx vs I0xx).

- [ ] **Step 4: Run all validator tests**
- [ ] **Step 5: Commit**

---

### Task 9: Test `src/engine/editorialRevisions.js` (expand from 130 lines)

**Files:**
- Modify: `tests/engine/editorialRevisions.test.js` (EXPAND)

- [ ] **Step 1: Read editorialRevisions.js to identify all exported methods**
- [ ] **Step 2: Write tests for HKSJ correction, prediction intervals, network MA editorial fixes**
- [ ] **Step 3: Run and verify**
- [ ] **Step 4: Commit**

---

### Task 10: Fix HTML/JS class name mismatches

**Files:**
- Modify: `index.html` (FIX references)

- [ ] **Step 1: Search for all class instantiations in index.html**

```bash
grep -n 'new [A-Z]' index.html
```

- [ ] **Step 2: Fix mismatched names**

Known issues:
- `new MarkovCohortEngine()` → `new MarkovEngine()`
- `new MetaAnalysis()` → `new AdvancedMetaAnalysis()`
- `new HTAValidator()` → verify the actual export name
- Any other mismatches found in step 1

- [ ] **Step 3: Run full test suite to verify no regressions**
- [ ] **Step 4: Commit**

---

## Chunk 2: New HTA Engines — Core Methods

### Task 11: Budget Impact Analysis Engine

**Files:**
- Create: `src/engine/budgetImpact.js`
- Test: `tests/engine/budgetImpact.test.js`
- Modify: `index.html` (add script tag)

**What it does:** Models the financial impact of adopting a new technology over a 1-5 year horizon. Projects patient population, market uptake, per-patient costs (drug, admin, monitoring, AE), and budget offsets from displaced treatments.

- [ ] **Step 1: Write failing tests**

```javascript
'use strict';
const { BudgetImpactEngine } = require('../../src/engine/budgetImpact');

describe('BudgetImpactEngine', () => {
    let engine;
    beforeEach(() => { engine = new BudgetImpactEngine(); });

    test('basic BIA with linear uptake', () => {
        const result = engine.run({
            population: 100000,
            prevalence: 0.05,         // 5% = 5000 eligible
            timeHorizon: 3,           // 3 years
            uptake: [0.1, 0.3, 0.5], // Year 1: 10%, Year 2: 30%, Year 3: 50%
            newTx: { drugCost: 5000, adminCost: 200, monitoringCost: 100 },
            currentTx: { drugCost: 2000, adminCost: 150, monitoringCost: 80 },
            offsets: { hospitalization: -500 }  // Savings
        });
        expect(result.yearlyBudget).toHaveLength(3);
        expect(result.yearlyBudget[0].incremental).toBeCloseTo(
            5000 * 0.1 * (5000 + 200 + 100 - 2000 - 150 - 80 - 500), -2
        );
        expect(result.totalIncremental).toBeDefined();
        expect(result.netBudgetImpact).toBeDefined();
    });

    test('handles zero uptake', () => {
        const result = engine.run({
            population: 100000, prevalence: 0.01,
            timeHorizon: 1, uptake: [0],
            newTx: { drugCost: 10000 }, currentTx: { drugCost: 1000 }
        });
        expect(result.yearlyBudget[0].incremental).toBe(0);
    });

    test('handles multiple subpopulations', () => {
        const result = engine.run({
            subpopulations: [
                { name: 'Mild', population: 3000, uptake: [0.2], newTx: { drugCost: 3000 }, currentTx: { drugCost: 1000 } },
                { name: 'Severe', population: 1000, uptake: [0.5], newTx: { drugCost: 8000 }, currentTx: { drugCost: 2000 } }
            ],
            timeHorizon: 1
        });
        expect(result.subpopResults).toHaveLength(2);
        expect(result.totalIncremental).toBeDefined();
    });

    test('scenario comparison', () => {
        const base = { population: 10000, prevalence: 0.1, timeHorizon: 2, uptake: [0.2, 0.4],
            newTx: { drugCost: 5000 }, currentTx: { drugCost: 2000 } };
        const scenarios = engine.scenarioAnalysis(base, {
            pessimistic: { uptake: [0.3, 0.6] },
            optimistic: { uptake: [0.1, 0.2] }
        });
        expect(scenarios.base).toBeDefined();
        expect(scenarios.pessimistic.totalIncremental).toBeGreaterThan(scenarios.base.totalIncremental);
    });

    test('discounting applied', () => {
        const result = engine.run({
            population: 10000, prevalence: 0.1, timeHorizon: 3,
            uptake: [0.5, 0.5, 0.5], discountRate: 0.035,
            newTx: { drugCost: 5000 }, currentTx: { drugCost: 2000 }
        });
        // Year 3 should be discounted
        expect(result.yearlyBudget[2].discountedIncremental).toBeLessThan(result.yearlyBudget[0].incremental);
    });
});
```

- [ ] **Step 2: Implement BudgetImpactEngine**

Class with: `run(config)`, `scenarioAnalysis(base, scenarios)`, population projection, cost calculation with offsets, discounting, subpopulation support.

- [ ] **Step 3: Run tests**
- [ ] **Step 4: Add `<script>` to index.html**
- [ ] **Step 5: Commit**

---

### Task 12: Multi-Criteria Decision Analysis (MCDA) Engine

**Files:**
- Create: `src/engine/mcda.js`
- Test: `tests/engine/mcda.test.js`
- Modify: `index.html` (add script tag)

**What it does:** Weighted-sum MCDA with swing weighting, rank acceptability, and sensitivity analysis for HTA benefit-risk assessment.

- [ ] **Step 1: Write tests**

Key test cases:
- Weighted sum: 3 alternatives, 4 criteria, verify scores
- Swing weighting: worst-to-best ranges, weight derivation
- Rank acceptability: Monte Carlo weight sensitivity → probability each alternative is best
- Dominance detection: strictly dominated alternatives flagged
- Partial value functions: linear, piecewise-linear, step
- Weight sensitivity: one-at-a-time weight perturbation tornado

- [ ] **Step 2: Implement MCDAEngine**

Methods: `weightedSum(matrix, weights)`, `swingWeight(ranges)`, `rankAcceptability(matrix, weightDists, nSim)`, `detectDominance(matrix)`, `weightSensitivity(matrix, weights, steps)`.

- [ ] **Step 3: Run tests, add to HTML**
- [ ] **Step 4: Commit**

---

### Task 13: Competing Risks Engine

**Files:**
- Create: `src/engine/competingRisks.js`
- Test: `tests/engine/competingRisks.test.js`
- Modify: `index.html` (add script tag)

**What it does:** Fine-Gray subdistribution hazard models, cumulative incidence functions (CIF), and Aalen-Johansen estimators for multi-state survival with competing events.

- [ ] **Step 1: Write tests**

Key test cases:
- CIF from cause-specific data: 2 causes, verify CIF(t) sums < 1
- Aalen-Johansen estimator: transition probabilities from multi-state data
- Fine-Gray model: subdistribution HR estimation
- Gray's test: test equality of CIFs between groups
- Edge cases: single event type (reduces to KM), no censoring, all censored

- [ ] **Step 2: Implement CompetingRisksEngine**

Methods: `cumulativeIncidence(data, cause)`, `aalenJohansen(data, states)`, `fineGray(data, covariates)`, `grayTest(groups)`.

- [ ] **Step 3: Run tests, add to HTML**
- [ ] **Step 4: Commit**

---

### Task 14: Cure Models Engine

**Files:**
- Create: `src/engine/cureModels.js`
- Test: `tests/engine/cureModels.test.js`
- Modify: `index.html` (add script tag)

**What it does:** Mixture cure models (MCM) and non-mixture cure models (NMCM) for long-term survival extrapolation in oncology HTA where a fraction of patients are "cured."

- [ ] **Step 1: Write tests**

Key test cases:
- Mixture cure: cure fraction π, uncured survival S_u(t), overall S(t) = π + (1-π)*S_u(t)
- Non-mixture cure (bounded cumulative hazard): H(t|θ) = θ*F(t)
- Fitting: given survival data with plateau, estimate cure fraction
- Extrapolation: project 10-year survival with cure assumption
- Distribution options: Weibull, log-logistic, log-normal for uncured
- Edge cases: π=0 (no cure), π=1 (all cured), negative cure fraction clamped

- [ ] **Step 2: Implement CureModelEngine**
- [ ] **Step 3: Run tests, add to HTML**
- [ ] **Step 4: Commit**

---

### Task 15: Semi-Markov Engine (Sojourn Time Distributions)

**Files:**
- Create: `src/engine/semiMarkov.js`
- Test: `tests/engine/semiMarkov.test.js`
- Modify: `index.html` (add script tag)

**What it does:** Extends Markov with time-in-state (sojourn) dependent transitions using Weibull/gamma/log-normal sojourn distributions, enabling more realistic disease progression modeling.

- [ ] **Step 1: Write tests**

Key test cases:
- Constant hazard sojourn → equivalent to standard Markov
- Weibull sojourn (shape>1): increasing hazard with time in state
- Gamma sojourn: verify transition probabilities match R flexsurv
- Individual tracking: cohort expanded to track time-in-state
- Half-cycle correction: compatible with sojourn adjustment
- 3-state model: Healthy → Disease (Weibull sojourn) → Dead

- [ ] **Step 2: Implement SemiMarkovEngine**

Extends MarkovEngine. Overrides transition probability calculation to incorporate sojourn time. Uses PCG32 for stochastic version.

- [ ] **Step 3: Run tests, add to HTML**
- [ ] **Step 4: Commit**

---

### Task 16: Correlated PSA Engine

**Files:**
- Create: `src/engine/correlatedPSA.js`
- Test: `tests/engine/correlatedPSA.test.js`
- Modify: `index.html` (add script tag)

**What it does:** Extends PSA with Cholesky decomposition for correlated parameter sampling and copula-based non-normal correlations. Critical for realistic uncertainty propagation.

- [ ] **Step 1: Write tests**

Key test cases:
- Cholesky decomposition: verify L*L^T = correlation matrix
- Correlated normal sampling: 2 params with ρ=0.8, verify empirical correlation
- Non-positive-definite matrix: nearest PD fallback
- Copula sampling: Gaussian copula with marginal beta distributions
- Independence case: identity correlation matrix → uncorrelated samples
- 4-parameter model: cost, utility, probability, RR all correlated

- [ ] **Step 2: Implement CorrelatedPSAEngine**

Methods: `cholesky(matrix)`, `nearestPD(matrix)`, `correlatedSample(marginals, corrMatrix, rng)`, `gaussianCopula(marginals, corrMatrix, n, rng)`.

- [ ] **Step 3: Run tests, add to HTML**
- [ ] **Step 4: Commit**

---

### Task 17: Threshold Analysis Engine

**Files:**
- Create: `src/engine/thresholdAnalysis.js`
- Test: `tests/engine/thresholdAnalysis.test.js`
- Modify: `index.html` (add script tag)

**What it does:** Finds the critical value of each parameter where the optimal decision changes. Produces tornado diagrams and two-way threshold surfaces.

- [ ] **Step 1: Write tests**

Key test cases:
- One-way threshold: find break-even cost where ICER = WTP
- Two-way threshold: 2D grid of break-even points
- Tornado diagram data: parameter ranges sorted by ICER impact
- No threshold exists: parameter has no break-even in range
- Multiple thresholds: non-monotonic relationship
- DSA integration: deterministic sensitivity analysis input/output format

- [ ] **Step 2: Implement ThresholdAnalysisEngine**

Methods: `oneway(model, param, range, wtp)`, `twoway(model, params, ranges, wtp)`, `tornado(model, paramRanges, wtp)`, `findBreakeven(model, param, range, wtp)`.

- [ ] **Step 3: Run tests, add to HTML**
- [ ] **Step 4: Commit**

---

### Task 18: Scenario Analysis Framework

**Files:**
- Create: `src/engine/scenarioAnalysis.js`
- Test: `tests/engine/scenarioAnalysis.test.js`
- Modify: `index.html` (add script tag)

**What it does:** Structured framework for defining, running, and comparing base case / pessimistic / optimistic / alternative scenarios with automatic comparison tables.

- [ ] **Step 1: Write tests**

Key test cases:
- Base + 2 scenarios: parameter overrides applied correctly
- Comparison matrix: differences vs base case computed
- Scenario from template: pessimistic/optimistic auto-generated from parameter CIs
- Custom scenario: arbitrary parameter sets
- Multi-strategy scenarios: each scenario × each strategy
- Result formatting: incremental table with scenario labels

- [ ] **Step 2: Implement ScenarioAnalysisEngine**
- [ ] **Step 3: Run tests, add to HTML**
- [ ] **Step 4: Commit**

---

### Task 19: Structural Uncertainty / Model Averaging Engine

**Files:**
- Create: `src/engine/modelAveraging.js`
- Test: `tests/engine/modelAveraging.test.js`
- Modify: `index.html` (add script tag)

**What it does:** Bayesian model averaging (BMA) using DIC/WAIC/BIC weights across multiple structural assumptions (e.g., different survival distributions, different Markov structures).

- [ ] **Step 1: Write tests**

Key test cases:
- BIC weights: 3 models with known BIC → correct posterior weights
- DIC weights: information criterion comparison
- Model-averaged prediction: weighted combination of model outputs
- Single model dominance: one model gets ~100% weight
- Equal models: uniform weights when all BIC equal
- Survival distribution selection: Weibull vs log-normal vs log-logistic comparison

- [ ] **Step 2: Implement ModelAveragingEngine**

Methods: `bicWeights(bics)`, `dicWeights(dics)`, `waicWeights(waics)`, `modelAverage(models, weights)`, `fitCompare(data, distributions)`.

- [ ] **Step 3: Run tests, add to HTML**
- [ ] **Step 4: Commit**

---

### Task 20: EVSI (Expected Value of Sample Information) Engine

**Files:**
- Create: `src/engine/evsi.js`
- Test: `tests/engine/evsi.test.js`
- Modify: `index.html` (add script tag)

**What it does:** Estimates the value of collecting additional data through a proposed study design. Extends EVPPI with sample size optimization and study design evaluation.

- [ ] **Step 1: Write tests**

Key test cases:
- EVSI < EVPPI: sample info always less than perfect info
- EVSI increases with sample size (diminishing returns)
- Optimal sample size: find n* that maximizes EVSI - study cost
- Moment matching approximation: fast EVSI estimate
- Multiple parameters: EVSI for study measuring several parameters
- Zero EVSI: when current info is sufficient for decision

- [ ] **Step 2: Implement EVSIEngine**

Methods: `compute(psaResults, studyDesign)`, `optimalSampleSize(psaResults, costPerPatient, studyDesign)`, `momentMatch(priorMoments, likelihoodInfo, n)`.

- [ ] **Step 3: Run tests, add to HTML**
- [ ] **Step 4: Commit**

---

## Chunk 3: Quality Gates & Polish

### Task 21: Expand ESLint configuration

**Files:**
- Modify: `eslint.config.js`

- [ ] **Step 1: Add production-grade rules**

Add: `no-unused-vars` (warn), `no-undef` (error with globals whitelist), `no-redeclare` (error), `eqeqeq` (warn), `no-var` (warn), `prefer-const` (warn). Define globals: `window`, `globalThis`, `document`, `DOMParser`, `JSZip`, `Chart`, `d3`, `crypto`, `performance`.

- [ ] **Step 2: Run lint and fix any new errors**
- [ ] **Step 3: Commit**

---

### Task 22: Add coverage thresholds for all tested modules

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add per-module coverage thresholds**

For each engine with tests, add a minimum threshold (functions: 50%, lines: 40%, branches: 30%). For utils (kahan, pcg32, etc.) set higher thresholds (functions: 80%, lines: 70%).

- [ ] **Step 2: Run `npm run test:coverage` to verify thresholds pass**
- [ ] **Step 3: Commit**

---

### Task 23: Populate reference models (BIA + PartSA)

**Files:**
- Create: `reference-models/bia_basic/project.json`
- Create: `reference-models/partsa_imported/project.json`

- [ ] **Step 1: Create BIA reference model**

A simple 3-year budget impact model for a hypothetical drug with known costs. Include expected results for validation.

- [ ] **Step 2: Create partitioned survival reference model**

A 3-state (PFS/PPS/Dead) model with Weibull curves. Include expected area-under-curve results.

- [ ] **Step 3: Commit**

---

### Task 24: Update CHANGELOG.md

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Write proper changelog**

Document all versions: v0.6 (initial), v0.7 (quality overhaul, 948 tests), v0.8 (this release — new engines, comprehensive tests).

- [ ] **Step 2: Commit**

---

### Task 25: Run full test suite and verify

- [ ] **Step 1: Run `npx jest --no-coverage --forceExit`**

Expected: ALL tests pass (948 existing + ~600 new = ~1550+)

- [ ] **Step 2: Run `npx jest --coverage --forceExit` and report coverage**

- [ ] **Step 3: Final commit and push**

```bash
git add -A
git commit -m "v0.8: comprehensive improvement — new engines, full test coverage, quality gates"
git push origin master
```

---

## Summary

| Category | Tasks | New Tests (est.) | New Lines (est.) |
|----------|-------|------------------|------------------|
| **Untested critical modules** | Tasks 1-9 | ~400 | ~2,500 test |
| **HTML fixes** | Task 10 | 0 | ~20 fix |
| **New engines** | Tasks 11-20 | ~500 | ~5,000 src + 3,000 test |
| **Quality gates** | Tasks 21-24 | 0 | ~200 config |
| **Final verification** | Task 25 | 0 | 0 |
| **TOTAL** | 25 tasks | ~900 new tests | ~10,700 lines |

**Expected final state:** ~1,850 tests, 36+ engines, full quality gates, zero untested critical modules.
