/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

function makeRng(seed) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

const rng = makeRng(421337);
const rand = () => rng();

function parseCsv(text) {
  const rows = text.trim().split(/\r?\n/).map(line => line.split(","));
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => h.trim().toLowerCase());
  const idx = {
    study: headers.indexOf("study"),
    treatment: headers.indexOf("treatment"),
    dose: headers.indexOf("dose"),
    effect: headers.indexOf("effect"),
    se: headers.indexOf("se")
  };
  if (idx.treatment < 0 || idx.dose < 0 || idx.effect < 0) return [];
  const data = [];
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const study = idx.study >= 0 ? row[idx.study].trim() : `Study-${i}`;
    const treatment = row[idx.treatment].trim();
    const dose = Number.parseFloat(row[idx.dose]);
    const effect = Number.parseFloat(row[idx.effect]);
    const se = idx.se >= 0 ? Number.parseFloat(row[idx.se]) : NaN;
    if (!treatment || !Number.isFinite(dose) || !Number.isFinite(effect)) continue;
    const weight = Number.isFinite(se) && se > 0 ? 1 / (se * se) : 1;
    data.push({ study, treatment, dose, effect, se, weight, value: effect });
  }
  return data;
}

function groupByTreatment(data) {
  const map = new Map();
  data.forEach(row => {
    if (!map.has(row.treatment)) map.set(row.treatment, []);
    map.get(row.treatment).push(row);
  });
  return map;
}

function weightedMean(points, key = "value") {
  let sum = 0;
  let wsum = 0;
  points.forEach(point => {
    sum += point[key] * point.weight;
    wsum += point.weight;
  });
  return wsum ? sum / wsum : 0;
}

function computeAIC(sse, n, k) {
  if (!Number.isFinite(sse) || sse <= 0 || n <= 0) return NaN;
  return n * Math.log(sse / n) + 2 * k;
}

function computeAICc(aic, n, k) {
  if (!Number.isFinite(aic)) return NaN;
  if (n <= k + 1) return aic;
  return aic + (2 * k * (k + 1)) / (n - k - 1);
}

function computeWeightedStats(points, predictFn, k) {
  const mean = weightedMean(points, "value");
  let sse = 0;
  let sst = 0;
  points.forEach(point => {
    const pred = predictFn(point.dose);
    const resid = point.value - pred;
    sse += point.weight * resid * resid;
    const dev = point.value - mean;
    sst += point.weight * dev * dev;
  });
  const n = points.length;
  const rmse = Math.sqrt(sse / Math.max(n, 1));
  const r2 = sst ? 1 - sse / sst : NaN;
  const aic = computeAIC(sse, n, k);
  const aicc = computeAICc(aic, n, k);
  const bic = Number.isFinite(sse) && sse > 0 && n > 0 ? n * Math.log(sse / n) + k * Math.log(n) : NaN;
  return { sse, rmse, r2, aic, aicc, bic };
}

function solveLinearSystem(matrix, vector) {
  const n = matrix.length;
  const a = matrix.map(row => row.slice());
  const b = vector.slice();
  for (let i = 0; i < n; i += 1) {
    let maxRow = i;
    let max = Math.abs(a[i][i]);
    for (let r = i + 1; r < n; r += 1) {
      const value = Math.abs(a[r][i]);
      if (value > max) {
        max = value;
        maxRow = r;
      }
    }
    if (!Number.isFinite(max) || max < 1e-12) return null;
    if (maxRow !== i) {
      const tempRow = a[i];
      a[i] = a[maxRow];
      a[maxRow] = tempRow;
      const tempVal = b[i];
      b[i] = b[maxRow];
      b[maxRow] = tempVal;
    }
    const pivot = a[i][i];
    for (let c = i; c < n; c += 1) {
      a[i][c] /= pivot;
    }
    b[i] /= pivot;
    for (let r = 0; r < n; r += 1) {
      if (r === i) continue;
      const factor = a[r][i];
      for (let c = i; c < n; c += 1) {
        a[r][c] -= factor * a[i][c];
      }
      b[r] -= factor * b[i];
    }
  }
  return b;
}

function weightedLeastSquares(design, y, weights) {
  const n = design.length;
  const p = design[0]?.length || 0;
  if (!n || !p) return null;
  const xtwx = Array.from({ length: p }, () => Array(p).fill(0));
  const xtwy = Array(p).fill(0);
  for (let i = 0; i < n; i += 1) {
    const row = design[i];
    const w = weights[i];
    for (let j = 0; j < p; j += 1) {
      xtwy[j] += w * row[j] * y[i];
      for (let k = 0; k < p; k += 1) {
        xtwx[j][k] += w * row[j] * row[k];
      }
    }
  }
  const betas = solveLinearSystem(xtwx, xtwy);
  if (!betas) return null;
  let sse = 0;
  for (let i = 0; i < n; i += 1) {
    const row = design[i];
    let pred = 0;
    for (let j = 0; j < p; j += 1) {
      pred += betas[j] * row[j];
    }
    const resid = y[i] - pred;
    sse += weights[i] * resid * resid;
  }
  return { betas, sse };
}

function selectKnots(doses, count) {
  const sorted = doses.slice().sort((a, b) => a - b);
  const unique = Array.from(new Set(sorted));
  if (unique.length < 3) return [];
  const k = Math.min(count, unique.length);
  const probs = k === 3 ? [0.1, 0.5, 0.9] : [0.05, 0.35, 0.65, 0.95];
  const knots = probs.map(p => sorted[Math.floor(p * (sorted.length - 1))]);
  return Array.from(new Set(knots)).sort((a, b) => a - b);
}

function buildRcsBasis(dose, knots, includeIntercept) {
  const k = knots.length;
  if (k < 3) return [];
  const last = knots[k - 1];
  const lastMinus = knots[k - 2];
  const denom = last - lastMinus || 1;
  const terms = [];
  if (includeIntercept) terms.push(1);
  terms.push(dose);
  for (let j = 1; j < k - 1; j += 1) {
    const knot = knots[j];
    const term = Math.pow(Math.max(dose - knot, 0), 3);
    const termLastMinus = Math.pow(Math.max(dose - lastMinus, 0), 3);
    const termLast = Math.pow(Math.max(dose - last, 0), 3);
    const adj = term - termLastMinus * ((last - knot) / denom) + termLast * ((lastMinus - knot) / denom);
    terms.push(adj);
  }
  return terms;
}

function buildFpTerm(x, power) {
  if (power === 0) return Math.log(x);
  return Math.pow(x, power);
}

function predictEmax(fit, dose) {
  const denom = fit.ed50 + dose;
  if (!Number.isFinite(denom) || denom === 0) return fit.e0;
  return fit.e0 + fit.emax * (dose / denom);
}

function predictHill(fit, dose) {
  const pow = Math.pow(dose, fit.hill);
  const denom = Math.pow(fit.ed50, fit.hill) + pow;
  if (!Number.isFinite(denom) || denom === 0) return fit.e0;
  return fit.e0 + fit.emax * (pow / denom);
}

function predictLogLinear(fit, dose) {
  return fit.e0 + fit.slope * Math.log(dose + fit.shift);
}

function predictRcs(fit, dose) {
  const basis = buildRcsBasis(dose, fit.knots, fit.includeIntercept);
  let pred = 0;
  for (let i = 0; i < fit.betas.length; i += 1) {
    pred += fit.betas[i] * basis[i];
  }
  return pred;
}

function predictFP(fit, dose) {
  const x = dose + fit.shift;
  const terms = [];
  if (fit.includeIntercept) terms.push(1);
  const term1 = buildFpTerm(x, fit.powers[0]);
  terms.push(term1);
  if (fit.powers.length > 1) {
    const p2 = fit.powers[1];
    const term2 = p2 === fit.powers[0] ? term1 * Math.log(x) : buildFpTerm(x, p2);
    terms.push(term2);
  }
  let pred = 0;
  for (let i = 0; i < fit.betas.length; i += 1) {
    pred += fit.betas[i] * terms[i];
  }
  return pred;
}

function predictModel(fit, dose) {
  if (fit.model === "hill") return predictHill(fit, dose);
  if (fit.model === "log_linear") return predictLogLinear(fit, dose);
  if (fit.model === "rcs") return predictRcs(fit, dose);
  if (fit.model === "fp") return predictFP(fit, dose);
  return predictEmax(fit, dose);
}

function finalizeFit(points, fit, model) {
  const kMap = {
    emax: 2,
    hill: 3,
    log_linear: 1
  };
  const k = Number.isFinite(fit.k) ? fit.k : (kMap[model] || 2);
  const stats = computeWeightedStats(points, dose => predictModel({ ...fit, model }, dose), k);
  if (!Number.isFinite(stats.sse)) return null;
  return { ...fit, ...stats, model };
}

function fitEmax(points) {
  const doses = points.map(p => p.dose);
  const values = points.map(p => p.value);
  const weights = points.map(p => p.weight);
  const n = points.length;

  const maxDose = Math.max(...doses);
  const minPosDose = Math.min(...doses.filter(d => d > 0));
  const safeMinPos = Number.isFinite(minPosDose) ? minPosDose : Math.max(maxDose, 1);

  const minEffect = Math.min(...values);
  const maxEffect = Math.max(...values);
  const effRange = (maxEffect - minEffect) || 1;

  const sorted = points.slice().sort((a, b) => a.dose - b.dose);
  const lowSlice = sorted.slice(0, Math.max(1, Math.floor(n * 0.2)));
  const highSlice = sorted.slice(Math.max(1, Math.floor(n * 0.8)));

  const baseE0 = 0;
  const highMean = weightedMean(highSlice);
  let baseEmax = highMean - baseE0;
  if (!Number.isFinite(baseEmax) || baseEmax === 0) baseEmax = effRange * 0.8;

  const logMin = Math.log10(Math.max(safeMinPos * 0.2, 0.001));
  const logMax = Math.log10(Math.max(maxDose * 2, safeMinPos * 0.6));

  const evaluate = (e0, emax, ed50) => {
    let sse = 0;
    for (let i = 0; i < n; i += 1) {
      const dose = doses[i];
      const denom = ed50 + dose;
      const pred = denom ? e0 + emax * (dose / denom) : e0;
      const resid = values[i] - pred;
      sse += weights[i] * resid * resid;
    }
    return sse;
  };

  let best = {
    e0: baseE0,
    emax: baseEmax,
    ed50: Math.pow(10, (logMin + logMax) / 2),
    sse: Number.POSITIVE_INFINITY
  };

  const trials = 160 + Math.min(240, n * 40);
  const emaxRange = effRange * 1.5;
  for (let i = 0; i < trials; i += 1) {
    const e0 = 0;
    const emax = baseEmax + (rand() - 0.5) * emaxRange;
    const ed50 = Math.pow(10, logMin + rand() * (logMax - logMin));
    const sse = evaluate(e0, emax, ed50);
    if (sse < best.sse) {
      best = { e0, emax, ed50, sse };
    }
  }

  let stepEmax = emaxRange * 0.25;
  let stepEd50 = (Math.pow(10, logMax) - Math.pow(10, logMin)) * 0.25;
  for (let i = 0; i < 80; i += 1) {
    const e0 = 0;
    const emax = best.emax + (rand() - 0.5) * stepEmax;
    const ed50 = Math.max(0.0001, best.ed50 + (rand() - 0.5) * stepEd50);
    const sse = evaluate(e0, emax, ed50);
    if (sse < best.sse) {
      best = { e0, emax, ed50, sse };
    }
    if (i % 10 === 9) {
      stepEmax *= 0.7;
      stepEd50 *= 0.7;
    }
  }
  return { ...best, n };
}

function fitHill(points) {
  const doses = points.map(p => p.dose);
  const values = points.map(p => p.value);
  const weights = points.map(p => p.weight);
  const n = points.length;

  const maxDose = Math.max(...doses);
  const minPosDose = Math.min(...doses.filter(d => d > 0));
  const safeMinPos = Number.isFinite(minPosDose) ? minPosDose : Math.max(maxDose, 1);

  const minEffect = Math.min(...values);
  const maxEffect = Math.max(...values);
  const effRange = (maxEffect - minEffect) || 1;

  const sorted = points.slice().sort((a, b) => a.dose - b.dose);
  const lowSlice = sorted.slice(0, Math.max(1, Math.floor(n * 0.2)));
  const highSlice = sorted.slice(Math.max(1, Math.floor(n * 0.8)));

  const baseE0 = 0;
  const highMean = weightedMean(highSlice);
  let baseEmax = highMean - baseE0;
  if (!Number.isFinite(baseEmax) || baseEmax === 0) baseEmax = effRange * 0.8;

  const logMin = Math.log10(Math.max(safeMinPos * 0.2, 0.001));
  const logMax = Math.log10(Math.max(maxDose * 2, safeMinPos * 0.6));
  const hillMin = 0.4;
  const hillMax = 5.5;

  const evaluate = (e0, emax, ed50, hill) => {
    if (ed50 <= 0 || hill <= 0) return Number.POSITIVE_INFINITY;
    let sse = 0;
    for (let i = 0; i < n; i += 1) {
      const dose = doses[i];
      const pow = Math.pow(dose, hill);
      const denom = Math.pow(ed50, hill) + pow;
      const pred = denom ? e0 + emax * (pow / denom) : e0;
      const resid = values[i] - pred;
      sse += weights[i] * resid * resid;
    }
    return sse;
  };

  let best = {
    e0: baseE0,
    emax: baseEmax,
    ed50: Math.pow(10, (logMin + logMax) / 2),
    hill: 1.2,
    sse: Number.POSITIVE_INFINITY
  };

  const trials = 220 + Math.min(320, n * 60);
  const emaxRange = effRange * 1.6;
  for (let i = 0; i < trials; i += 1) {
    const e0 = 0;
    const emax = baseEmax + (rand() - 0.5) * emaxRange;
    const ed50 = Math.pow(10, logMin + rand() * (logMax - logMin));
    const hill = hillMin + rand() * (hillMax - hillMin);
    const sse = evaluate(e0, emax, ed50, hill);
    if (sse < best.sse) {
      best = { e0, emax, ed50, hill, sse };
    }
  }

  let stepEmax = emaxRange * 0.25;
  let stepEd50 = (Math.pow(10, logMax) - Math.pow(10, logMin)) * 0.25;
  let stepHill = (hillMax - hillMin) * 0.3;
  for (let i = 0; i < 90; i += 1) {
    const e0 = 0;
    const emax = best.emax + (rand() - 0.5) * stepEmax;
    const ed50 = Math.max(0.0001, best.ed50 + (rand() - 0.5) * stepEd50);
    const hill = Math.max(0.2, best.hill + (rand() - 0.5) * stepHill);
    const sse = evaluate(e0, emax, ed50, hill);
    if (sse < best.sse) {
      best = { e0, emax, ed50, hill, sse };
    }
    if (i % 10 === 9) {
      stepEmax *= 0.7;
      stepEd50 *= 0.7;
      stepHill *= 0.75;
    }
  }
  return { ...best, n };
}

function fitLogLinear(points) {
  const doses = points.map(p => p.dose);
  const values = points.map(p => p.value);
  const weights = points.map(p => p.weight);
  const n = points.length;

  const minPosDose = Math.min(...doses.filter(d => d > 0));
  const maxDose = Math.max(...doses);
  const shift = Number.isFinite(minPosDose) ? minPosDose * 0.5 : Math.max(1, maxDose * 0.1);
  const x = doses.map(d => Math.log(d + shift));

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    num += weights[i] * x[i] * values[i];
    den += weights[i] * x[i] * x[i];
  }
  const slope = den ? num / den : 0;
  const intercept = 0;
  let sse = 0;
  for (let i = 0; i < n; i += 1) {
    const pred = intercept + slope * x[i];
    const resid = values[i] - pred;
    sse += weights[i] * resid * resid;
  }
  return { e0: intercept, slope, shift, sse, n };
}

function fitRcs(points) {
  const doses = points.map(p => p.dose);
  const values = points.map(p => p.value);
  const weights = points.map(p => p.weight);
  const knotCount = Math.min(4, new Set(doses).size);
  const knots = selectKnots(doses, knotCount);
  if (knots.length < 3) return null;
  const includeIntercept = false;
  const design = points.map(point => buildRcsBasis(point.dose, knots, includeIntercept));
  const result = weightedLeastSquares(design, values, weights);
  if (!result) return null;
  return {
    betas: result.betas,
    knots,
    includeIntercept,
    sse: result.sse,
    n: points.length,
    k: result.betas.length
  };
}

function fitFracPoly(points) {
  const doses = points.map(p => p.dose);
  const values = points.map(p => p.value);
  const weights = points.map(p => p.weight);
  const minPosDose = Math.min(...doses.filter(d => d > 0));
  const maxDose = Math.max(...doses);
  const shift = Number.isFinite(minPosDose) ? minPosDose * 0.5 : Math.max(1, maxDose * 0.1);
  const x = doses.map(d => d + shift);
  const powers = [-2, -1, -0.5, 0, 0.5, 1, 2, 3];
  let best = null;

  const tryCandidate = (p1, p2, isDouble) => {
    const design = [];
    for (let i = 0; i < x.length; i += 1) {
      const row = [];
      row.push(1);
      const term1 = buildFpTerm(x[i], p1);
      row.push(term1);
      if (isDouble) {
        const term2 = p1 === p2 ? term1 * Math.log(x[i]) : buildFpTerm(x[i], p2);
        row.push(term2);
      }
      design.push(row);
    }
    const result = weightedLeastSquares(design, values, weights);
    if (!result) return;
    const fit = {
      betas: result.betas,
      powers: [p1, isDouble ? p2 : null].filter(v => v !== null),
      shift,
      includeIntercept: true,
      sse: result.sse,
      n: points.length,
      k: result.betas.length
    };
    const finalized = finalizeFit(points, fit, "fp");
    if (!finalized) return;
    if (!best || (Number.isFinite(finalized.aicc) && finalized.aicc < best.aicc)) {
      best = finalized;
    }
  };

  powers.forEach(p1 => {
    tryCandidate(p1, null, false);
  });
  powers.forEach(p1 => {
    powers.forEach(p2 => {
      if (p2 < p1) return;
      tryCandidate(p1, p2, true);
    });
  });
  return best;
}

function fitModel(points, model) {
  if (model === "hill") {
    return finalizeFit(points, fitHill(points), "hill");
  }
  if (model === "log_linear") {
    return finalizeFit(points, fitLogLinear(points), "log_linear");
  }
  if (model === "rcs") {
    const fit = fitRcs(points);
    return fit ? finalizeFit(points, fit, "rcs") : null;
  }
  if (model === "fp") {
    return fitFracPoly(points);
  }
  return finalizeFit(points, fitEmax(points), "emax");
}

function fitAllTreatments(data) {
  const groups = groupByTreatment(data);
  const treatments = Array.from(groups.keys());
  const fits = {};
  treatments.forEach(treatment => {
    const points = groups.get(treatment);
    if (!points || points.length < 2) return;
    const models = ["emax", "hill", "log_linear", "rcs", "fp"];
    const fitList = models.map(model => fitModel(points, model)).filter(Boolean);
    if (!fitList.length) return;
    const best = fitList.reduce((prev, current) => {
      if (!prev) return current;
      if (!Number.isFinite(current.aicc)) return prev;
      if (!Number.isFinite(prev.aicc)) return current;
      return current.aicc < prev.aicc ? current : prev;
    }, null);
    if (best) fits[treatment] = best;
  });
  return { fits, treatments };
}

function computeStudyOffsets(baseData, fits) {
  const studyAgg = new Map();
  baseData.forEach(row => {
    const fit = fits[row.treatment];
    if (!fit) return;
    const pred = predictModel(fit, row.dose);
    if (!studyAgg.has(row.study)) studyAgg.set(row.study, { sum: 0, weight: 0 });
    const agg = studyAgg.get(row.study);
    agg.sum += row.weight * (row.effect - pred);
    agg.weight += row.weight;
  });
  const offsets = new Map();
  baseData.forEach(row => {
    const agg = studyAgg.get(row.study);
    if (agg && agg.weight > 0) offsets.set(row.study, agg.sum / agg.weight);
  });
  return offsets;
}

function applyStudyOffsets(baseData, offsets) {
  return baseData.map(row => {
    const offset = offsets.get(row.study) || 0;
    return { ...row, value: row.effect - offset };
  });
}

function fitNetwork(baseData, iterations = 3) {
  let adjusted = baseData.map(row => ({ ...row }));
  let fits = {};
  let treatments = [];
  for (let iter = 0; iter < iterations; iter += 1) {
    const fitResults = fitAllTreatments(adjusted);
    fits = fitResults.fits;
    treatments = fitResults.treatments;
    const offsets = computeStudyOffsets(baseData, fits);
    adjusted = applyStudyOffsets(baseData, offsets);
  }
  return { fits, treatments, adjusted };
}

function computeRange(data) {
  const doses = data.map(d => d.dose);
  return { minDose: Math.min(...doses), maxDose: Math.max(...doses) };
}

function computeStats(fits, data, targetDose) {
  const stats = [];
  const range = computeRange(data);
  const minDose = range.minDose;
  const maxDose = range.maxDose === range.minDose ? range.minDose + 1 : range.maxDose;
  const steps = 80;
  const groups = groupByTreatment(data);

  Object.keys(fits).forEach(treatment => {
    const fit = fits[treatment];
    const points = groups.get(treatment) || [];
    let auc = 0;
    let prevDose = minDose;
    let prevVal = predictModel(fit, minDose);
    for (let i = 1; i <= steps; i += 1) {
      const dose = minDose + (maxDose - minDose) * (i / steps);
      const delta = dose - prevDose;
      const val = predictModel(fit, dose);
      auc += (prevVal + val) * 0.5 * delta;
      prevVal = val;
      prevDose = dose;
    }
    const target = predictModel(fit, targetDose);
    stats.push({
      treatment,
      model: fit.model,
      aicc: fit.aicc,
      aic: fit.aic,
      bic: fit.bic,
      sse: fit.sse,
      rmse: fit.rmse,
      r2: fit.r2,
      auc,
      target,
      n: points.length
    });
  });
  return stats;
}

function main() {
  const csvPath = process.argv[2] || path.join(__dirname, "benchmark.csv");
  const text = fs.readFileSync(csvPath, "utf8");
  const data = parseCsv(text);
  if (!data.length) {
    console.error("No data parsed.");
    process.exit(1);
  }
  const start = process.hrtime.bigint();
  const networkResult = fitNetwork(data, 3);
  const stats = computeStats(networkResult.fits, networkResult.adjusted, 10);
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
  const output = { elapsedMs, stats };
  fs.writeFileSync(path.join(__dirname, "benchmark_js_results.json"), JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output, null, 2));
}

main();
