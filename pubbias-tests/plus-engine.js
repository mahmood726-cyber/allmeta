/* pubbias-tests #alm-plus engine: PET, PEESE, conditional PET-PEESE and leave-one-out sensitivity.
 * Every existing test (Egger, Begg, trim-and-fill, Peters, Harbord) is computed by calling the page's own
 * inline engine (window.__almPubBiasEngine), so the full-data row cannot differ from the main results table.
 * New quantities: PET intercept test and t confidence interval, PEESE (weighted lm(yi ~ vi, weights=1/vi)),
 * the conditional choice, and the omission loop. No archived output is read by this engine.
 * Reference: metafor::regtest(yi, vi=vi, model="lm", predictor="sei"/"vi"), ranktest, trimfill(L0, REML),
 * meta::metabias(method.bias="Peters"/"Harbord"); see validate/README-plus.md. */
(function (g) {
  'use strict';
  const ALPHA = 0.05;      // two-sided level of the PET intercept test that selects PEESE
  const TIE = 1e-9;        // |p - alpha| <= TIE refuses the branch (equals the p-value comparison tolerance)
  const LOO_MIN = 4, LOO_MAX = 100, MIN_K = 3;
  const refusal = reason => ({ status: 'refused', reason });
  const ok = values => ({ status: 'ok', values });

  // Accurate t distribution (Lanczos log-gamma, Lentz continued fraction to 2e-15).
  function lg(z) {
    const c = [676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406, 12.507343278686905, -.13857109526572012, 9.984369578019572e-6, 1.5056327351493116e-7];
    if (z < .5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - lg(1 - z);
    z--; let x = .99999999999980993; for (let i = 0; i < c.length; i++) x += c[i] / (z + i + 1);
    const t = z + 7.5; return .5 * Math.log(2 * Math.PI) + (z + .5) * Math.log(t) - t + Math.log(x);
  }
  function betacf(a, b, x) {
    let c = 1, d = 1 - (a + b) * x / (a + 1); const floor = 1e-300;
    if (Math.abs(d) < floor) d = floor; d = 1 / d; let h = d;
    for (let m = 1; m < 10000; m++) {
      for (const aa of [m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m)), -(a + m) * (a + b + m) * x / ((a + 2 * m) * (a + 2 * m + 1))]) {
        d = 1 + aa * d; if (Math.abs(d) < floor) d = floor; c = 1 + aa / c; if (Math.abs(c) < floor) c = floor; d = 1 / d; h *= d * c;
      }
      if (Math.abs(d * c - 1) < 2e-15) return h;
    }
    throw Error('beta-convergence');
  }
  function ibeta(a, b, x) {
    if (x <= 0) return 0; if (x >= 1) return 1;
    const v = Math.exp(lg(a + b) - lg(a) - lg(b) + a * Math.log(x) + b * Math.log1p(-x));
    return x < (a + 1) / (a + b + 2) ? v * betacf(a, b, x) / a : 1 - v * betacf(b, a, 1 - x) / b;
  }
  // Two-sided p-value of t with df degrees of freedom.
  function tp(t, df) { return ibeta(df / 2, .5, df / (df + t * t)); }
  // Upper quantile: q with P(T > q) = 1 - p (bisection on the accurate CDF).
  function tq(p, df) {
    let lo = 0, hi = 1; while (tp(hi, df) > 2 * (1 - p)) hi *= 2;
    for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (m === lo || m === hi) break; if (tp(m, df) > 2 * (1 - p)) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }

  const engine = () => {
    const E = g.__almPubBiasEngine;
    if (!E) throw Error('page-engine-unavailable');
    return E;
  };

  // PET = weighted lm(yi ~ sei, weights 1/vi). Algebraically identical to the page's Egger regression
  // (unweighted SND ~ precision): PET intercept = Egger slope, PET slope = Egger intercept. The page's own
  // wls() and eggerGeneric() are called, so the PET slope test IS the displayed Egger test.
  function pet(rows) {
    const E = engine(), k = rows.length;
    if (k < MIN_K) return refusal('k-below-3');
    if (rows.every(r => r.se === rows[0].se)) return refusal('singular-design');
    let fit, egger;
    try { fit = E.wls(rows.map(r => 1 / r.se), rows.map(r => r.te / r.se), rows.map(() => 1)); egger = E.eggerGeneric(rows); }
    catch (e) { return refusal('singular-design'); }
    const df = k - 2, est = fit.b1, se = fit.seB1, t = est / se, q = tq(.975, df);
    const v = { est, se, ciLo: est - q * se, ciHi: est + q * se, t, p: tp(t, df), slope: fit.b0, slopeT: egger.statistic, slopeP: egger.p, df };
    return Object.values(v).every(Number.isFinite) && se > 0 ? ok(v) : refusal('undefined-regression');
  }
  // PEESE = weighted lm(yi ~ vi, weights 1/vi), t inference with k-2 df (metafor regtest model="lm", predictor="vi").
  function peese(rows) {
    const k = rows.length;
    if (k < MIN_K) return refusal('k-below-3');
    const y = rows.map(r => r.te), x = rows.map(r => r.se * r.se), w = x.map(v => 1 / v);
    if (x.every(v => v === x[0])) return refusal('singular-design');
    const sw = w.reduce((a, b) => a + b, 0), mx = x.reduce((a, v, i) => a + w[i] * v, 0) / sw, my = y.reduce((a, v, i) => a + w[i] * v, 0) / sw;
    let xx = 0, xy = 0; for (let i = 0; i < k; i++) { xx += w[i] * (x[i] - mx) ** 2; xy += w[i] * (x[i] - mx) * (y[i] - my); }
    if (!(xx > 0)) return refusal('singular-design');
    const slope = xy / xx, est = my - slope * mx, df = k - 2;
    const rss = y.reduce((a, v, i) => a + w[i] * (v - est - slope * x[i]) ** 2, 0), s2 = rss / df;
    const se = Math.sqrt(s2 * (1 / sw + mx * mx / xx)), seSlope = Math.sqrt(s2 / xx), t = est / se, q = tq(.975, df);
    const v = { est, se, ciLo: est - q * se, ciHi: est + q * se, t, p: tp(t, df), slope, slopeT: slope / seSlope, slopeP: tp(slope / seSlope, df), df };
    return Object.values(v).every(Number.isFinite) && se > 0 ? ok(v) : refusal('undefined-regression');
  }
  // Rule: PEESE when PET's intercept test rejects at two-sided 5% (p < 0.05), otherwise PET.
  function conditional(p, q) {
    if (p.status !== 'ok') return p;
    if (Math.abs(p.values.p - ALPHA) <= TIE) return refusal('alpha-tie');
    const branch = p.values.p < ALPHA ? 'PEESE' : 'PET', r = branch === 'PET' ? p : q;
    if (r.status !== 'ok') return r;
    return ok({ branch, est: r.values.est, ciLo: r.values.ciLo, ciHi: r.values.ciHi });
  }

  // Same refusal vocabulary as the original validation adapter.
  function reason(e) {
    const m = String(e && e.message || e).replace(/^Error: /, '');
    if (m.startsWith('Fisher scoring algorithm did not converge')) return 'reml-nonconvergence';
    if (m === 'Trim and fill algorithm did not converge.') return 'trimfill-nonconvergence';
    if (m === 'Insufficient informative rows.') return 'insufficient-informative-rows';
    if (m === 'Singular regression design.' || m.startsWith('Constant precision')) return 'singular-design';
    return 'error: ' + m;
  }
  function attempt(fn) { try { return fn(); } catch (e) { return refusal(reason(e)); } }

  // All validated tests for one data set, each via the page engine.
  function tests(rows, binary) {
    const E = engine(), r = {};
    r.egger = attempt(() => {
      const e = E.eggerGeneric(rows), limit = E.wls(rows.map(x => 1 / x.se), rows.map(x => x.te / x.se), rows.map(() => 1)).b1;
      return [e.statistic, e.p, limit].every(Number.isFinite) ? ok({ statistic: e.statistic, p: e.p, limit }) : refusal('undefined-regression');
    });
    r.begg = attempt(() => { const b = E.beggMazumdar(rows); return Number.isFinite(b.tau) && Number.isFinite(b.p) ? ok({ tau: b.tau, p: b.p }) : refusal('begg-undefined'); });
    r.trimfill = attempt(() => {
      const t = E.trimFill(rows), side = E.remlSlopeNeg(rows.map(x => x.te), rows.map(x => x.se * x.se), rows.map(x => x.se)) ? 'right' : 'left';
      return Number.isInteger(t.k0) && Number.isFinite(t.est) ? ok({ k0: t.k0, side, est: t.est }) : refusal('undefined-trimfill');
    });
    r.pet = pet(rows); r.peese = peese(rows); r.conditional = conditional(r.pet, r.peese);
    if (binary) for (const [key, fn] of [['peters', 'petersTest'], ['harbord', 'harbordTest']]) {
      r[key] = attempt(() => { const z = E[fn](binary); return z && Number.isFinite(z.statistic) && Number.isFinite(z.p) ? ok({ statistic: z.statistic, p: z.p }) : refusal('undefined-regression'); });
    }
    return r;
  }
  const sig = x => x.status === 'ok' ? x.values.p < ALPHA : null;
  function flags(base, row) {
    const f = {};
    for (const m of ['egger', 'begg', 'peters', 'harbord']) if (base[m]) { const a = sig(base[m]), b = sig(row[m]); f[m + '_flip'] = a === null || b === null ? null : a !== b; }
    f.trimfill_k0_change = base.trimfill.status !== 'ok' || row.trimfill.status !== 'ok' ? null : base.trimfill.values.k0 !== row.trimfill.values.k0;
    f.branch_change = base.conditional.status !== 'ok' || row.conditional.status !== 'ok' ? null : base.conditional.values.branch !== row.conditional.values.branch;
    return f;
  }
  // rows: [{te,se}] in input order; binary: parallel parsed binary rows (page parseBinary) or null.
  function leaveOneOut(rows, binary) {
    const k = rows.length;
    if (k < LOO_MIN) return refusal('loo-requires-k-4');
    if (k > LOO_MAX) return refusal('loo-k-above-100');
    if (binary && binary.length !== k) return refusal('binary-row-mismatch');
    const base = tests(rows, binary), out = [{ omit: null, ...base }];
    for (let i = 0; i < k; i++) {
      const keep = (_, j) => j !== i, r = tests(rows.filter(keep), binary ? binary.filter(keep) : null);
      out.push({ omit: i + 1, ...r, flags: flags(base, r) });
    }
    return ok({ rows: out });
  }
  function validRows(rows) {
    return Array.isArray(rows) && rows.every(r => Number.isFinite(r.te) && Number.isFinite(r.se) && r.se > 0);
  }
  function compute(rows, binary) {
    if (!validRows(rows)) throw Error('Every study needs a finite effect and a positive standard error.');
    const k = rows.length;
    if (k < MIN_K) return { k, full: { pet: refusal('k-below-3'), peese: refusal('k-below-3'), conditional: refusal('k-below-3') }, loo: refusal('loo-requires-k-4') };
    const p = pet(rows), q = peese(rows);
    return { k, binary: !!binary, full: { pet: p, peese: q, conditional: conditional(p, q) }, loo: leaveOneOut(rows, binary) };
  }
  const api = { compute, pet, peese, conditional, tests, flags, leaveOneOut, tp, tq, reason, constants: { ALPHA, TIE, LOO_MIN, LOO_MAX, MIN_K } };
  g.AlmPubbiasPlus = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
