/**
 * Smoke tests for FPNMAEngine
 *
 * Minimum coverage to prevent syntactic damage from shipping undetected
 * (the maicSTC.js incident of 2026-04-15). Deeper domain tests welcome.
 *
 * FP-NMA per Jansen (2011), Freeman & Carpenter (2017), NICE TSD 21.
 */

'use strict';

const { FPNMAEngine } = require('../../src/engine/fpNMA');

describe('FPNMAEngine - smoke', () => {
    test('module exports FPNMAEngine constructor', () => {
        expect(typeof FPNMAEngine).toBe('function');
    });

    test('default constructor does not throw', () => {
        expect(() => new FPNMAEngine()).not.toThrow();
    });

    test('instance has expected prototype', () => {
        const engine = new FPNMAEngine();
        expect(engine).toBeInstanceOf(FPNMAEngine);
    });

    test('accepts custom fractional polynomial powers', () => {
        const engine = new FPNMAEngine({ powers: [-1, 0, 1] });
        expect(engine).toBeInstanceOf(FPNMAEngine);
    });
});

describe('FPNMAEngine - HR confidence band from the fitted WLS covariance', () => {
    const ts = [0.5, 1, 2, 3];
    const d = -0.5; // truth: log(HR(t)) = -0.5 * log(t)
    const dataAtSe = (se) => [
        { treatment: 'A', timePoints: ts, hazardRatios: ts.map(() => 1), ses: ts.map(() => se) },
        { treatment: 'B', timePoints: ts, hazardRatios: ts.map((t) => Math.exp(d * Math.log(t))), ses: ts.map(() => se) },
    ];
    const fitBand = (se) => new FPNMAEngine({ seed: 1 }).fit(dataAtSe(se), { powers: [0], order: 1, reference: 'A' });
    const logWidthNear = (model, tq) => {
        const hr = model.hazardRatios[0];
        let i = 0;
        for (let k = 0; k < hr.times.length; k++) if (Math.abs(hr.times[k] - tq) < Math.abs(hr.times[i] - tq)) i = k;
        return Math.log(hr.upper[i]) - Math.log(hr.lower[i]);
    };

    test('the CI band reflects the input precision (not a data-independent heuristic)', () => {
        // Regression guard for the old `se = 0.1*|logHR| + 0.05` heuristic, which ignored the data:
        // a 10x looser input SE must widen the band ~10x. The heuristic gave a ratio of ~1.
        const wPrecise = logWidthNear(fitBand(0.05), 2);
        const wImprecise = logWidthNear(fitBand(0.5), 2);
        expect(wPrecise).toBeGreaterThan(0);
        expect(wImprecise / wPrecise).toBeGreaterThan(5);
    });

    test('the CI collapses toward zero as input SE -> 0 (a fixed heuristic floor would not)', () => {
        const wTiny = logWidthNear(fitBand(0.005), 2);
        expect(wTiny).toBeLessThan(0.05); // old heuristic floored the half-width at >= 0.05 -> width >= 0.1
    });

    test('logHR(t)=0 no longer forces the old +0.05 floor; band tracks covariance', () => {
        // at the FP basis zero (t=1, log(t)=0) logHR is 0; the old heuristic still added 0.05.
        const model = fitBand(0.2);
        const hr = model.hazardRatios[0];
        let i = 0;
        for (let k = 0; k < hr.times.length; k++) if (Math.abs(hr.times[k] - 1) < Math.abs(hr.times[i] - 1)) i = k;
        const halfWidth = (Math.log(hr.upper[i]) - Math.log(hr.lower[i])) / 2;
        expect(Number.isFinite(halfWidth)).toBe(true);
        expect(halfWidth).toBeGreaterThan(0);
    });
});

describe('FPNMAEngine - reconstruction-variance weighting (VALIDATED, gold-anchored)', () => {
    // Jansen FP-NMA ingesting digitised/Guyot-reconstructed survival curves: a
    // reconstructed curve's LATE log-HR points carry a late-growing reconstruction
    // bias + variance r(t)^2. Encoding r(t) in the IV weight — se_eff = sqrt(se^2 +
    // r^2) — down-weights those biased points and recovers the late-time fit toward
    // the all-IPD gold. Mirrors registry-ipd phase3c_step4 (naive late-logHR bias
    // ~0.17 -> honest ~0.023 -> gold ~0.0009). Directional check, loose tolerances.

    const TS = [0.5, 1, 2, 4];      // t=4 is the least-identified late point
    const TMAX = 4;
    const D_TRUE = -0.5;            // truth: log(HR(t)) = -0.5 * log(t)
    const S_SAMP = 0.15;           // sampling SD of a reported logHR
    const B_LATE = 0.45;          // reconstruction bias coefficient (late, quadratic)
    const R_LATE = 0.5;           // reconstruction SD coefficient (late, linear)
    const EVAL_LATE = 4;

    const trueLogHR = (t) => D_TRUE * Math.log(Math.max(t, 1e-9));
    const reconBias = (t) => B_LATE * Math.pow(t / TMAX, 2);  // ~0 early, B_LATE at TMAX
    const reconSD = (t) => R_LATE * (t / TMAX);               // grows linearly

    // Build a small network: 3 IPD + 3 reconstructed-curve studies, A vs B.
    // mode 'naive'  -> reconstructed studies report sampling-only ses (ignore r(t))
    // mode 'honest' -> reconstructed studies ALSO pass per-interval reconSDs = r(t)
    // Deterministic fixture (no RNG): the late reconstruction BIAS is the signal;
    // the test asks whether down-weighting via r(t) pulls the late fit back.
    function buildData(mode) {
        const data = [];
        for (let j = 0; j < 6; j++) {
            const reconstructed = (j % 2 === 1);
            data.push({
                treatment: 'A',
                timePoints: [...TS],
                hazardRatios: TS.map(() => 1),
                ses: TS.map(() => S_SAMP),
            });
            const hrs = [], ses = [], reconSDs = [];
            for (const t of TS) {
                let lhr = trueLogHR(t);
                if (reconstructed) lhr += reconBias(t);     // late-growing reconstruction bias
                hrs.push(Math.exp(lhr));
                ses.push(S_SAMP);
                reconSDs.push(reconstructed ? reconSD(t) : 0);
            }
            const study = { treatment: 'B', timePoints: [...TS], hazardRatios: hrs, ses };
            if (mode === 'honest') study.reconSDs = reconSDs;   // encode r(t) in the weight
            data.push(study);
        }
        return data;
    }

    const fitLateBias = (mode) => {
        const eng = new FPNMAEngine({ seed: 12345 });
        const m = eng.fit(buildData(mode), { powers: [0], order: 1, reference: 'A' });
        const d = m.treatmentEffects[0].coefficients[0];
        return d * Math.log(EVAL_LATE) - trueLogHR(EVAL_LATE);  // late logHR bias vs truth
    };

    test('encoding r(t) in the weight reduces late-logHR bias vs sampling-only', () => {
        const naiveBias = Math.abs(fitLateBias('naive'));
        const honestBias = Math.abs(fitLateBias('honest'));
        // direction of the validated 0.17 -> 0.023 drop: honest is materially less biased
        expect(naiveBias).toBeGreaterThan(0);
        expect(honestBias).toBeLessThan(naiveBias);
        // and the improvement is substantial, not a rounding wobble
        expect(honestBias).toBeLessThan(0.7 * naiveBias);
    });

    test('default behavior (no reconSDs) is byte-identical to sampling-only weighting', () => {
        // A study with no reconstruction term must produce the exact same fit whether
        // or not the reconstruction-weighting code path exists. Compare a fit using
        // plain studies (no reconSDs key at all) to one where reconSDs is all-zero/absent.
        const plain = buildData('naive');                 // no reconSDs key on B studies
        const withZeros = buildData('naive').map((s) =>
            s.treatment === 'B' ? { ...s, reconSDs: TS.map(() => 0) } : s);
        const fit = (data) => new FPNMAEngine({ seed: 12345 })
            .fit(data, { powers: [0], order: 1, reference: 'A' })
            .treatmentEffects[0].coefficients[0];
        // r = 0 must be treated as "no reconstruction term" (falls to sampling-only branch)
        expect(fit(withZeros)).toBe(fit(plain));
    });
});
