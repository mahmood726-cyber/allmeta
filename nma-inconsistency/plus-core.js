/* nma-inconsistency plus panel: pure analysis core (UMD).
 *
 * Every number here comes from the page's own engine functions, injected as E =
 * {inputIssue, estimateTau2, fitNMA, nodeSplit, dbt}. The core never calls run(),
 * never reads the DOM and never touches the page result state, so the base
 * results stay those validated by the pinned replay.
 *
 *  - fitAll(E, rows, model)        one analysis exactly as run() performs it
 *  - loo(E, rows, model)           leave-one-study-out inconsistency sensitivity
 *  - compare3(E, rows)             FE / DL / PM side by side
 *  - interpret(state)              plain-language reading with caveats
 *  - methodsText(state)            Methods + Results paragraphs
 *  - buildRScript(state)           self-verifying native-R script
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AlmIncoPlusCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const ALPHA = 0.05;
  const MODELS = ['FE', 'DL', 'PM'];
  const MODEL_NAME = { FE: 'fixed-effect (common τ² = 0)', DL: 'random-effects, DerSimonian-Laird τ²', PM: 'random-effects, Paule-Mandel τ²' };
  const SINGULAR = 'Network fit is singular or numerically invalid.';
  const finite = x => typeof x === 'number' && Number.isFinite(x);
  const sig = p => finite(p) && p < ALPHA;
  function fmt(x, d = 3) { return finite(x) ? x.toFixed(d) : '—'; }
  // Signed change: a value that rounds to zero is shown as unsigned zero, so floating-point noise
  // around 0 (e.g. -1e-15) never prints as "-0.00" or "+0.00".
  function fmtSigned(x, d = 2) { const s = fmt(x, d); return !finite(x) || Number(s) === 0 ? fmt(finite(x) ? 0 : x, d) : (x > 0 ? '+' : '') + s; }
  function fmtP(p) { return p === null || !finite(p) ? 'not testable' : p < 0.001 ? '< 0.001' : fmt(p, 3); }

  // Identical sequence to the page's run(): gate, tau2, singular check, splits, global.
  function fitAll(E, rows, model) {
    const issue = E.inputIssue(rows);
    if (issue) return { status: 'refused', reason: issue };
    let tau2;
    try { tau2 = E.estimateTau2(rows, model); E.fitNMA(rows, undefined, tau2); }
    catch (_) { return { status: 'refused', reason: SINGULAR }; }
    const ns = E.nodeSplit(rows, undefined, tau2), g = E.dbt(rows, tau2);
    return normalizeFit({ status: 'ok', model, tau2, k: rows.length,
      trts: [...new Set(rows.flatMap(r => [r.A, r.B]))].sort(), nodeSplit: ns, dbt: g });
  }
  // Canonical fit shape shared by app fits and R reference fits: splits in code-unit
  // order of their label, unavailable p as null.
  const byLabel = (a, b) => a.comparison < b.comparison ? -1 : a.comparison > b.comparison ? 1 : 0;
  function normalizeFit(f) {
    if (f.status !== 'ok') return { status: f.status, reason: f.reason };
    return {
      status: 'ok', model: f.model, tau2: f.tau2, k: f.k, trts: [...f.trts],
      nodeSplit: f.nodeSplit.map(r => ({ comparison: r.comparison, direct: { mean: r.direct.mean, se: r.direct.se },
        indirect: { mean: r.indirect.mean, se: r.indirect.se }, diff: r.diff, seDiff: r.seDiff, z: r.z, p: r.p, kDirect: r.kDirect })).sort(byLabel),
      dbt: { Q: f.dbt.Q, df: f.dbt.df, p: finite(f.dbt.p) ? f.dbt.p : null },
    };
  }

  function summarizeDrop(base, fit, study, index) {
    const out = { study, index, status: fit.status };
    if (fit.status !== 'ok') { out.reason = fit.reason; return out; }
    const byCmp = new Map(fit.nodeSplit.map(s => [s.comparison, s]));
    const splitP = {};
    for (const s of base.nodeSplit) splitP[s.comparison] = byCmp.has(s.comparison) ? byCmp.get(s.comparison).p : null;
    Object.assign(out, {
      tau2: fit.tau2, dbt: fit.dbt, nSplits: fit.nodeSplit.length,
      nInconsistent: fit.nodeSplit.filter(s => sig(s.p)).length, splitP,
      globalFlip: finite(base.dbt.p) && finite(fit.dbt.p) && sig(base.dbt.p) !== sig(fit.dbt.p),
      globalTestable: fit.dbt.p !== null,
      splitFlips: base.nodeSplit.filter(s => splitP[s.comparison] !== null && sig(s.p) !== sig(splitP[s.comparison])).map(s => s.comparison),
      splitLost: base.nodeSplit.filter(s => splitP[s.comparison] === null).map(s => s.comparison),
      dQ: fit.dbt.Q - base.dbt.Q,
      nodeSplit: fit.nodeSplit,
    });
    return out;
  }
  // Split into plan/drop so the page can run drops in chunks without blocking.
  function looPlan(E, rows, model) {
    const base = fitAll(E, rows, model);
    return { model, rows, base, n: base.status === 'ok' ? rows.length : 0 };
  }
  function looDrop(E, plan, i) {
    const rows = plan.rows.filter((_, j) => j !== i);
    return summarizeDrop(plan.base, fitAll(E, rows, plan.model), plan.rows[i].study, i);
  }
  function looFinish(plan, drops) {
    if (plan.base.status !== 'ok') return { status: 'refused', reason: plan.base.reason, model: plan.model };
    const ok = drops.filter(d => d.status === 'ok');
    return {
      status: 'ok', model: plan.model, base: plan.base, drops,
      reestimatedTau2: plan.model !== 'FE',
      globalFlips: ok.filter(d => d.globalFlip).map(d => d.study),
      splitFlipStudies: ok.filter(d => d.splitFlips.length).map(d => d.study),
      refusedDrops: drops.filter(d => d.status !== 'ok').map(d => ({ study: d.study, reason: d.reason })),
      untestableDrops: ok.filter(d => !d.globalTestable && plan.base.dbt.p !== null).map(d => d.study),
    };
  }
  function loo(E, rows, model) {
    const plan = looPlan(E, rows, model), drops = [];
    for (let i = 0; i < plan.n; i++) drops.push(looDrop(E, plan, i));
    return looFinish(plan, drops);
  }
  // D: network graph edges. One edge per directly compared pair; k = number of studies,
  // p = node-split p of that pair (null when the pair cannot be split).
  function graphEdges(base, rows) {
    const m = new Map();
    for (const r of rows) { const [a, b] = [r.A, r.B].sort(), c = a + ' vs ' + b; if (!m.has(c)) m.set(c, { comparison: c, a, b, k: 0 }); m.get(c).k++; }
    const sp = new Map(base.nodeSplit.map(x => [x.comparison, x.p]));
    return [...m.values()].sort(byLabel).map(e => Object.assign(e, { p: sp.has(e.comparison) ? sp.get(e.comparison) : null }));
  }
  function pRange(ps) {
    const xs = ps.filter(finite);
    if (!xs.length) return null;
    return [Math.min(...xs), Math.max(...xs)];
  }
  function looSummary(L) {
    if (!L || L.status !== 'ok') return L ? 'Sensitivity analysis not available: ' + L.reason : '';
    const parts = [], ok = L.drops.filter(d => d.status === 'ok'), b = L.base;
    const gr = pRange(ok.map(d => d.dbt.p));
    const range = gr ? ` (global p ranged from ${fmtP(gr[0])} to ${fmtP(gr[1])} across single-study removals)` : '';
    if (b.dbt.p !== null) {
      if (!L.globalFlips.length) parts.push(`Among removals with a testable global p-value, the global test stays on the same side of 0.05${range}; this concerns the stability of the test result, not evidence of consistency.`);
      else parts.push(`The global test result is fragile: p crosses 0.05 (full data p = ${fmtP(b.dbt.p)}) after removing ${L.globalFlips.join(', ')}${range}.`);
    }
    if (b.nodeSplit.length) {
      if (!L.splitFlipStudies.length) parts.push('No node-split p-value crosses 0.05 when any single study is removed.');
      else {
        const near = b.nodeSplit.filter(s => finite(s.p) && Math.abs(s.p - ALPHA) < 0.01);
        parts.push(`At least one node-split p-value crosses 0.05 after removing ${L.splitFlipStudies.length === L.drops.length ? 'any one' : L.splitFlipStudies.length} of the ${L.drops.length} studies: ` + L.splitFlipStudies.join(', ') + '.' +
          (near.length ? ` With full-data p close to 0.05 (${near.map(s => `${s.comparison}, p = ${fmtP(s.p)}`).join('; ')}), such crossings are expected and do not by themselves identify influential studies.` : ''));
      }
    }
    if (L.untestableDrops.length) parts.push('Inconsistency becomes untestable (no closed loop left) after removing: ' + L.untestableDrops.join(', ') + '.');
    if (L.refusedDrops.length) parts.push('Not analysable after removing: ' + L.refusedDrops.map(d => d.study + ' (' + d.reason.replace(/\.$/, '') + ')').join('; ') + '.');
    return parts.join(' ');
  }

  function compare3(E, rows) {
    const fits = {};
    for (const m of MODELS) fits[m] = fitAll(E, rows, m);
    return compareFits(fits);
  }
  // Also used with R reference fits (normalizeFit) by the validator.
  function compareFits(fits) {
    if (MODELS.some(m => fits[m].status !== 'ok')) return { status: 'refused', reason: (fits.FE.status !== 'ok' ? fits.FE : fits.DL.status !== 'ok' ? fits.DL : fits.PM).reason };
    const names = [...new Set(MODELS.flatMap(m => fits[m].nodeSplit.map(s => s.comparison)))].sort();
    const splits = names.map(c => {
      const p = {}; for (const m of MODELS) { const s = fits[m].nodeSplit.find(x => x.comparison === c); p[m] = s ? s.p : null; }
      const flags = MODELS.filter(m => p[m] !== null).map(m => sig(p[m]));
      return { comparison: c, p, agree: flags.length === 3 && flags.every(f => f === flags[0]) };
    });
    const gflags = MODELS.map(m => fits[m].dbt.p === null ? null : sig(fits[m].dbt.p));
    return {
      status: 'ok', fits, splits,
      global: Object.fromEntries(MODELS.map(m => [m, { Q: fits[m].dbt.Q, df: fits[m].dbt.df, p: fits[m].dbt.p, tau2: fits[m].tau2 }])),
      globalAgree: gflags.every(f => f === gflags[0]),
      nDisagree: splits.filter(s => !s.agree).length,
    };
  }
  function withinDesignCaveat(f) {
    // Connected, independent two-arm data: total residual df = k - (T - 1).
    // Subtract between-design df to obtain within-design df (= k - designs).
    // Derive this from the existing fit shape so R reference fits get the same warning.
    const df = f.k - (f.trts.length - 1) - f.dbt.df;
    return df === 0 ? 'There are no replicated designs (within-design df = 0): heterogeneity and inconsistency cannot be separated. The consistency-model τ² may absorb inconsistency, so the random-effects tests are sensitivity analyses and cannot resolve that ambiguity.' : '';
  }
  function compareSummary(C) {
    if (!C || C.status !== 'ok') return C ? 'Estimator comparison not available: ' + C.reason : '';
    const g = C.global, het = g.DL.tau2 > 0 || g.PM.tau2 > 0;
    const s = [`Global design-by-treatment p was ${fmtP(g.FE.p)} with fixed-effect, ${fmtP(g.DL.p)} with DerSimonian-Laird (τ² = ${fmt(g.DL.tau2, 4)}) and ${fmtP(g.PM.p)} with Paule-Mandel (τ² = ${fmt(g.PM.tau2, 4)}) weights.`];
    const caveat = withinDesignCaveat(C.fits.FE);
    if (caveat) s.push(caveat);
    if (!C.globalAgree) s.push('The models fall on different sides of 0.05' + (het ? '; the result is sensitive to τ² weighting, which does not establish heterogeneity as the cause.' : '.'));
    else if (g.FE.p !== null) s.push('All three models fall on the same side of 0.05.');
    if (C.splits.length) s.push(C.nDisagree ? `${C.nDisagree} of ${C.splits.length} node-split p-values fall on different sides of 0.05 depending on the model.` : `Each of the ${C.splits.length} node-split p-values falls on the same side of 0.05 under all three models.`);
    return s.join(' ');
  }

  // Plain-language reading. Must never claim consistency is shown or proven.
  // Wording revised after an independent second reading (claude-sonnet-5-5, 2026-10-19).
  function interpret(state) {
    const b = state && state.loo && state.loo.status === 'ok' ? state.loo.base : state && state.base;
    if (!b || b.status !== 'ok') return [];
    const out = [], nS = b.nodeSplit.length, nI = b.nodeSplit.filter(s => sig(s.p)).length, p = b.dbt.p;
    const caveat = withinDesignCaveat(b);
    if (p === null) out.push('This network has no closed loop, so direct and indirect evidence cannot be compared: inconsistency is not testable here.');
    else if (sig(p)) out.push(`The global design-by-treatment test rejected the hypothesis of no inconsistency (p = ${fmtP(p)}).` +
      (b.model === 'FE' && !caveat ? ' Under a fixed-effect model this can reflect unmodelled between-study heterogeneity as well as disagreement between direct and indirect evidence, so read it alongside the random-effects results.' : '') +
      ' Examine the node-split results, the designs involved and study characteristics before relying on network estimates.');
    else out.push(`The global design-by-treatment test did not reject the hypothesis of no inconsistency (p = ${fmtP(p)}). This is not evidence that the network is consistent: the test may have low power, particularly with few studies per design, so a non-significant result does not exclude important inconsistency.` +
      (p < 0.10 ? ' The p-value is close to 0.05; some authors use 0.10 for this test because of its low power.' : ''));
    if (nS) out.push(`${nI} of ${nS} node-split comparisons had p < 0.05. These p-values are unadjusted: if there were no inconsistency, about ${fmt(ALPHA * nS, 1)} of ${nS} would be expected to reach p < 0.05 by chance, and the splits are correlated (several re-test the same loops). Treat isolated flags as hypothesis-generating, and look at the size of each direct–indirect difference, not only its p-value.`);
    if (caveat) out.push(caveat);
    if (b.model === 'FE') out.push('Fixed-effect weights ignore between-study heterogeneity; when heterogeneity is present this inflates Q and makes node-split p-values too small. Compare with the random-effects results.');
    else out.push(`Random-effects weights fix τ² at the consistency-model ${b.model} estimate (${fmt(b.tau2, 4)}) for every test, including the global Q. That estimate can absorb inconsistency and its uncertainty is ignored, which tends to make the random-effects tests conservative.`);
    out.push('The comparison of fixed-effect and random-effects results below is a sensitivity analysis: prespecify the primary model rather than choosing it from these results.');
    out.push('Inconsistency tests do not check transitivity (whether effect modifiers are balanced across comparisons). Only independent two-arm studies are supported; multi-arm studies would need their within-study correlation, and excluding them changes the network.');
    return out;
  }

  function methodsText(state) {
    const L = state && state.loo, C = state && state.compare;
    const b = L && L.status === 'ok' ? L.base : state && state.base;
    if (!b || b.status !== 'ok') return '';
    const m = b.model, M = [], R = [];
    M.push(`Inconsistency in the network of ${b.k} independent two-arm studies and ${b.trts.length} treatments was assessed with node-splitting (Dias et al. 2010), computed by back-calculation (König et al. 2013), for every comparison with both direct evidence and an indirect path, and with the global design-by-treatment interaction test (Higgins et al. 2012), using a ${MODEL_NAME[m]} model${m === 'FE' ? '' : '; τ² was estimated from the consistency model and fixed at that value for all tests, which ignores its uncertainty'}. Node-split p-values were not adjusted for multiplicity.`);
    if (L && L.status === 'ok') M.push(`Sensitivity of the inconsistency conclusions was assessed by removing each study in turn${m === 'FE' ? '' : ' and re-estimating τ²'}, and all analyses were repeated under fixed-effect, DerSimonian-Laird and Paule-Mandel models. Analyses used the allmeta nma-inconsistency browser tool, whose node-split, design-by-treatment and leave-one-out results are validated against R netmeta 3.7-0 netsplit() and decomp.design() (relative tolerance 1e-9, 1e-6 for Paule-Mandel; p-values 1e-9 absolute).`);
    R.push(`The global design-by-treatment test gave Q = ${fmt(b.dbt.Q, 2)} on ${b.dbt.df} df (p = ${fmtP(b.dbt.p)})${m === 'FE' ? '' : ` with τ² = ${fmt(b.tau2, 4)}`}; ${b.nodeSplit.filter(s => sig(s.p)).length} of ${b.nodeSplit.length} node-split comparisons had p < 0.05${b.nodeSplit.filter(s => sig(s.p)).length ? ' (' + b.nodeSplit.filter(s => sig(s.p)).map(s => `${s.comparison}, p = ${fmtP(s.p)}`).join('; ') + ')' : ''}.`);
    if (L && L.status === 'ok') R.push(looSummary(L));
    if (C && C.status === 'ok') R.push(compareSummary(C));
    else if (withinDesignCaveat(b)) R.push(withinDesignCaveat(b));
    return 'Methods. ' + M.join(' ') + '\n\nResults. ' + R.join(' ');
  }

  // ---- B: self-verifying native-R script ----------------------------------
  const num = x => finite(x) ? x.toPrecision(17) : 'NA_real_';
  const str = s => JSON.stringify(String(s));
  function rVector(xs, f) { return 'c(' + xs.map(f).join(', ') + ')'; }
  const R_FIT = `fit <- function(d, model) {
  A <- d$A; B <- d$B; te <- d$te; se <- d$se; study <- d$study
  tr <- sort(unique(c(A, B)), method = "radix")
  reached <- tr[1]
  repeat { nxt <- unique(c(reached, B[A %in% reached], A[B %in% reached])); if (length(nxt) == length(reached)) break; reached <- nxt }
  if (nrow(d) < 3) return(list(status = "refused", reason = "At least 3 valid contrasts are required."))
  if (anyDuplicated(study)) return(list(status = "refused", reason = "Repeated study IDs are unsupported: enter one independent contrast per study."))
  if (length(reached) < length(tr)) return(list(status = "refused", reason = "The treatment network is disconnected."))
  tau <- 0
  if (model == "PM") {
    # Paule-Mandel tau2 for the network: root of the generalized Q(tau2) = df
    # equation using metafor's internal .QE.func (an unexported function).
    X <- sapply(tr[-1], function(t) as.numeric(A == t) - as.numeric(B == t))
    if (nrow(d) > ncol(as.matrix(X))) {
      qe <- get(".QE.func", asNamespace("metafor"))
      f <- function(t2) qe(t2, Y = as.matrix(te), vi = se^2, X = as.matrix(X), k = nrow(d), objective = nrow(d) - ncol(as.matrix(X)))
      if (f(0) > 0) {
        upper <- max(1, var(te)); while (f(upper) > 0) upper <- upper * 2
        tau <- sqrt(uniroot(f, c(0, upper), tol = .Machine$double.eps^0.75, maxiter = 1000)$root)
      }
    }
  }
  # DL tau2 is netmeta's own estimate; FE/PM supply tau as a preset.
  m <- netmeta(TE = te, seTE = se, treat1 = A, treat2 = B, studlab = study, sm = "MD", reference.group = tr[1],
               common = TRUE, random = TRUE, method.tau = "DL", tau.preset = if (model == "DL") NULL else tau,
               sep.trts = " ~~ ", warn = FALSE)
  tau <- if (model == "FE") 0 else m$tau
  s <- netsplit(m, method = "Back-calculation", tol.direct = 0)
  suffix <- if (model == "FE") "common" else "random"
  direct <- s[[paste0("direct.", suffix)]]; indirect <- s[[paste0("indirect.", suffix)]]; cmp <- s[[paste0("compare.", suffix)]]
  path <- function(a, b) { keep <- !((A == a & B == b) | (A == b & B == a)); seen <- a
    repeat { nxt <- unique(c(seen, B[keep & A %in% seen], A[keep & B %in% seen])); if (length(nxt) == length(seen)) break; seen <- nxt }
    b %in% seen }
  splits <- list()
  for (j in seq_len(nrow(cmp))) {
    pair <- strsplit(cmp$comparison[j], " ~~ ", fixed = TRUE)[[1]]; ord <- sort(pair, method = "radix"); sgn <- if (pair[1] == ord[1]) 1 else -1
    if (!is.finite(direct$TE[j]) || !path(ord[1], ord[2])) next
    name <- paste(ord, collapse = " vs ")
    splits[[name]] <- list(direct = sgn * direct$TE[j], direct.se = direct$seTE[j], indirect = sgn * indirect$TE[j], indirect.se = indirect$seTE[j],
                           diff = sgn * cmp$TE[j], diff.se = cmp$seTE[j], z = sgn * cmp$statistic[j], p = cmp$p[j])
  }
  dec <- decomp.design(m, tau.preset = tau, warn = FALSE)
  q <- if (model == "FE") dec$Q.decomp else dec$Q.inc.random.preset
  g <- list(Q = 0, df = 0, p = NA_real_)
  if (!is.null(q)) { r <- match("Between designs", rownames(q)); g <- list(Q = q$Q[r], df = q$df[r], p = q$pval[r]); if (g$df == 0) { g$Q <- 0; g$p <- NA_real_ } }
  list(status = "ok", tau2 = tau^2, splits = splits, global = g, netmeta = m, netsplit = s, decomp = dec)
}`;
  function buildRScript(state, opts) {
    opts = opts || {};
    const L = state.loo, b = L && L.status === 'ok' ? L.base : state.base;
    if (!b || b.status !== 'ok') throw Error('Run an accepted analysis first.');
    const rows = state.rows, model = b.model, withLoo = !!(opts.loo && L && L.status === 'ok');
    const relTol = model === 'PM' ? '1e-6' : '1e-9';
    const lines = [];
    const add = (label, kind, app, rexpr) => lines.push(`check(${str(label)}, ${str(kind)}, ${app === null ? 'NA_real_' : typeof app === 'string' ? str(app) : typeof app === 'boolean' ? (app ? 'TRUE' : 'FALSE') : num(app)}, ${rexpr})`);
    function fitChecks(prefix, f, rx) {
      add(prefix + 'tau2', 'rel', f.tau2, `${rx}$tau2`);
      add(prefix + 'global Q', 'rel', f.dbt.Q, `${rx}$global$Q`);
      add(prefix + 'global df', 'exact', f.dbt.df, `${rx}$global$df`);
      add(prefix + 'global p', 'abs', f.dbt.p, `${rx}$global$p`);
      lines.push(`check(${str(prefix + 'node-split comparisons')}, "exact", ${str(f.nodeSplit.map(s => s.comparison).sort().join(' | '))}, paste(sort(as.character(names(${rx}$splits)), method = "radix"), collapse = " | "))`);
      for (const s of f.nodeSplit) {
        const sx = `${rx}$splits[[${str(s.comparison)}]]`;
        add(`${prefix}${s.comparison}: direct`, 'rel', s.direct.mean, `${sx}$direct`);
        add(`${prefix}${s.comparison}: direct SE`, 'rel', s.direct.se, `${sx}$direct.se`);
        add(`${prefix}${s.comparison}: indirect`, 'rel', s.indirect.mean, `${sx}$indirect`);
        add(`${prefix}${s.comparison}: indirect SE`, 'rel', s.indirect.se, `${sx}$indirect.se`);
        add(`${prefix}${s.comparison}: difference`, 'rel', s.diff, `${sx}$diff`);
        add(`${prefix}${s.comparison}: difference SE`, 'rel', s.seDiff, `${sx}$diff.se`);
        add(`${prefix}${s.comparison}: z`, 'rel', s.z, `${sx}$z`);
        add(`${prefix}${s.comparison}: p`, 'abs', s.p, `${sx}$p`);
      }
    }
    fitChecks('', b, 'full');
    if (withLoo) {
      lines.push('# Leave-one-study-out: each study removed in turn' + (model === 'FE' ? '' : ', tau2 re-estimated') + '.');
      L.drops.forEach((d, i) => {
        const rx = `loo[[${i + 1}]]`, prefix = `without ${d.study}: `;
        lines.push(`check(${str(prefix + 'status')}, "exact", ${str(d.status === 'ok' ? 'ok' : d.reason)}, if (${rx}$status == "ok") "ok" else ${rx}$reason)`);
        if (d.status === 'ok') { lines.push(`if (${rx}$status == "ok") {`); fitChecks(prefix, Object.assign({}, d, { model }), rx); lines.push('}'); }
      });
    }
    const date = opts.date || new Date().toISOString().slice(0, 10);
    return `# allmeta nma-inconsistency: self-verifying R reproduction script
# Generated ${date} from the browser analysis. Run with:  Rscript this-file.R
# It refits the analysis with netmeta / metafor, then compares every number the
# app reported (embedded below) with R and exits with status 1 on any mismatch.
# Model: ${MODEL_NAME[model]}. Data: ${rows.length} contrasts.${withLoo ? ' Includes leave-one-study-out refits.' : ''}
# Checked against R 4.6.0, netmeta 3.7-0, metafor 5.2-1. Tolerances: estimates,
# SEs, Q, z and tau2 ${relTol} relative to max(1, |R|); p-values 1e-9 absolute;
# df, comparison sets and refusal reasons exact.
suppressPackageStartupMessages({ library(netmeta); library(metafor) })
for (p in c("netmeta", "metafor")) cat(p, as.character(packageVersion(p)), "\\n")
if (packageVersion("netmeta") != "3.7.0" || packageVersion("metafor") != "5.2.1")
  warning("These checks were validated with netmeta 3.7-0 and metafor 5.2-1; other versions may differ slightly.")
d <- data.frame(
  A = ${rVector(rows, r => str(r.A))},
  B = ${rVector(rows, r => str(r.B))},
  te = ${rVector(rows, r => num(r.te))},
  se = ${rVector(rows, r => num(r.se))},
  study = ${rVector(rows, r => str(r.study))},
  stringsAsFactors = FALSE)
model <- ${str(model)}
${R_FIT}
full <- fit(d, model)
stopifnot(full$status == "ok")
print(full$netsplit)
print(full$decomp)
${withLoo ? 'loo <- lapply(seq_len(nrow(d)), function(i) fit(d[-i, , drop = FALSE], model))\n' : ''}n_checks <- 0; n_ok <- 0; bad <- character()
check <- function(label, kind, app, r) {
  n_checks <<- n_checks + 1
  ok <- if (kind == "exact") identical(as.character(app), as.character(r))
    else if (is.na(app) || is.null(r) || is.na(r)) is.na(app) && !is.null(r) && is.na(r)
    else if (kind == "abs") abs(app - r) <= 1e-9
    else abs(app - r) / max(1, abs(r)) <= ${relTol}
  if (isTRUE(ok)) n_ok <<- n_ok + 1 else bad <<- c(bad, sprintf("%s: app %s, R %s", label, format(app, digits = 17), format(r, digits = 17)))
}
${lines.join('\n')}
cat(sprintf("allmeta check: %d/%d quantities match\\n", n_ok, n_checks))
if (n_ok != n_checks) { cat("Mismatches:\\n", paste(bad, collapse = "\\n"), "\\n"); quit(status = 1) }
`;
  }

  return { ALPHA, MODELS, MODEL_NAME, SINGULAR, fmt, fmtP, fmtSigned, sig, fitAll, graphEdges, normalizeFit, summarizeDrop, compareFits, looPlan, looDrop, looFinish, loo, looSummary, compare3, compareSummary, interpret, methodsText, buildRScript };
});
