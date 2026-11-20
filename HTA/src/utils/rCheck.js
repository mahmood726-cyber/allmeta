/**
 * HTA/src/utils/rCheck.js — the Base Case page's R check (app-local).
 *
 * buildScript(project, results, displayed, opts) returns a self-contained R script that
 *   1. re-runs the CURRENT Markov cohort model in base R, written independently of the page's
 *      engine but following the page's documented conventions (trapezoidal / start / end
 *      within-cycle weights at time points t = 0..N, discounting each time point by
 *      (1 + r)^-t, the page's transition-matrix rules: clamp, complement, row-sum repair);
 *   2. if heemod is installed and the transition matrix does not change over time, also
 *      rebuilds the cohort trace with heemod (the P43 pack's reference, heemod 1.1.0);
 *   3. compares every number the Base Case page displays (total costs and QALYs of the shown
 *      strategies, the ICER or its dominance label) and the plotted state-occupancy trace with
 *      the page's values, printing |difference|, and ends with "MATCH n/n" or "MISMATCH k/n".
 *
 * The P43 pack validated the discounted totals against an R re-implementation of the page's
 * documented trapezoid formula (heemod discounts each cycle's average instead, a convention
 * difference of up to 2.9%), and the traces against heemod at 1e-9. This script does the same.
 * Expressions are translated from the page's own parse tree (fully parenthesised); so the
 * script checks the Markov engine and its arithmetic, not the expression parser's precedence.
 * Dual-mode: browser global window.HTARCheck; Node require().
 */
(function (global) {
    'use strict';

    function getParser() {
        if (global.ExpressionParser) return global.ExpressionParser;
        if (typeof require === 'function') return require('../parser/expression').ExpressionParser;
        throw new Error('ExpressionParser not loaded');
    }

    function unsupported(msg) { const e = new Error(msg); e.unsupported = true; return e; }

    function rNum(v) {
        if (typeof v !== 'number') throw unsupported('non-numeric value ' + JSON.stringify(v));
        if (Number.isNaN(v)) return 'NaN';
        if (v === Infinity) return 'Inf';
        if (v === -Infinity) return '-Inf';
        if (Object.is(v, -0)) return '-0';
        return Number.isInteger(v) && Math.abs(v) < 1e15 ? String(v) : v.toPrecision(17);
    }
    function rStr(s) {
        let out = '"';
        for (const ch of String(s)) {
            const cp = ch.codePointAt(0);
            if (ch === '\\') out += '\\\\';
            else if (ch === '"') out += '\\"';
            else if (ch === '\n') out += '\\n';
            else if (ch === '\r') out += '\\r';
            else if (ch === '\t') out += '\\t';
            else if (cp < 0x20 || cp === 0x7f) out += '\\u{' + cp.toString(16) + '}';
            else if (cp > 0xffff) out += '\\U{' + cp.toString(16) + '}';
            else if (cp > 0x7e) out += '\\u{' + cp.toString(16) + '}';
            else out += ch;
        }
        return out + '"';
    }

    const PROTO = new Set(Object.getOwnPropertyNames(Object.prototype));
    // name -> [R helper, allowed argument counts]
    const FUN = {
        exp: ['exp', [1]], ln: ['log', [1]], log: ['log10', [1]], log10: ['log10', [1]], sqrt: ['sqrt', [1]],
        abs: ['abs', [1]], floor: ['floor', [1]], ceil: ['ceiling', [1]], round: ['.js_round', [1]],
        sin: ['sin', [1]], cos: ['cos', [1]], tan: ['tan', [1]],
        min: ['.js_min', [1, 2, 3, 4, 5, 6, 7, 8]], max: ['.js_max', [1, 2, 3, 4, 5, 6, 7, 8]], pow: ['.js_pow', [2]],
        rate_to_prob: ['.rate_to_prob', [1, 2]], prob_to_rate: ['.prob_to_rate', [1, 2]],
        odds_to_prob: ['.odds_to_prob', [1]], prob_to_odds: ['.prob_to_odds', [1]], clamp: ['.clamp', [3]]
    };
    const BIN = { '+': '+', '-': '-', '*': '*' };
    const CMP = { '<': '<', '<=': '<=', '>': '>', '>=': '>=', '==': '==', '!=': '!=' };

    function astToR(n, used) {
        switch (n.type) {
            case 'Number': return rNum(n.value);
            case 'Variable':
                if (PROTO.has(n.name)) throw unsupported('variable name "' + n.name + '"');
                return '.v(' + rStr(n.name) + ')';
            case 'UnaryOp': {
                const a = astToR(n.operand, used);
                if (n.op === '-') return '(-(' + a + '))';
                if (n.op === 'not') return 'as.numeric(!.truthy(' + a + '))';
                throw unsupported('unary operator ' + n.op);
            }
            case 'BinaryOp': {
                const a = astToR(n.left, used), b = astToR(n.right, used);
                if (BIN[n.op]) return '((' + a + ') ' + BIN[n.op] + ' (' + b + '))';
                if (n.op === '/') return '.js_div(' + a + ', ' + b + ')';
                if (n.op === '%') return '.js_mod(' + a + ', ' + b + ')';
                if (n.op === '^') return '.js_pow(' + a + ', ' + b + ')';
                if (CMP[n.op]) return 'as.numeric(isTRUE((' + a + ') ' + CMP[n.op] + ' (' + b + ')))';
                if (n.op === 'and') return '.js_and(' + a + ', ' + b + ')';
                if (n.op === 'or') return '.js_or(' + a + ', ' + b + ')';
                throw unsupported('operator ' + n.op);
            }
            case 'FunctionCall': {
                const args = n.args.map((x) => astToR(x, used));
                if (n.name === 'if') {
                    if (args.length !== 3) throw unsupported('if() with ' + args.length + ' arguments');
                    return '(if (.truthy(' + args[0] + ')) (' + args[1] + ') else (' + args[2] + '))';
                }
                const f = Object.hasOwn(FUN, n.name) ? FUN[n.name] : null;
                if (!f) throw unsupported('function ' + n.name + '()');
                if (!f[1].includes(args.length)) throw unsupported(n.name + '() with ' + args.length + ' arguments');
                if (n.name === 'log') used.log10 = true;
                return f[0] + '(' + args.join(', ') + ')';
            }
            default: throw unsupported('expression node ' + n.type);
        }
    }

    // An expression as the page holds it -> an R value: a number literal, or a function() body.
    function exprToR(e, used) {
        if (typeof e === 'number') return { kind: 'num', r: rNum(e) };
        if (typeof e !== 'string') return { kind: 'other' };
        const t = e.trim();
        if (!t) return { kind: 'empty' };
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(t)) return { kind: 'id', r: rStr(t) };
        let ast;
        try { ast = getParser().parse(e); } catch (err) { return { kind: 'parse_error', msg: err.message }; }
        return { kind: 'expr', r: 'function() ' + astToR(ast, used) };
    }
    function rExprItem(x) {
        // list(kind, value): kind = num | id | expr | empty | other | parse_error
        if (x.kind === 'num') return 'list(kind = "num", value = ' + x.r + ')';
        if (x.kind === 'id') return 'list(kind = "id", value = ' + x.r + ')';
        if (x.kind === 'expr') return 'list(kind = "expr", value = ' + x.r + ')';
        if (x.kind === 'parse_error') return 'list(kind = "parse_error", value = ' + rStr(x.msg) + ')';
        return 'list(kind = ' + rStr(x.kind) + ', value = NULL)';
    }

    function digitsOf(text) {
        const s = String(text == null ? '' : text).trim();
        const neg = /^[-−]|^£\s*[-−]/.test(s) || /^-?£?-/.test(s);
        const d = s.replace(/[^0-9]/g, '');
        return d ? (neg ? -1 : 1) * Number(d) : null;
    }

    /**
     * @param project   the page's current project (app.project)
     * @param results   the page's current results (app.results)
     * @param displayed the Base Case texts as shown: {icer, costsInt, costsComp, qalysInt, qalysComp}
     * @param opts      {settings: engine.getSettings(project), tolerance: engine.options.tolerance}
     */
    function buildScript(project, results, displayed, opts) {
        if (!project || !results) throw unsupported('run the base case first');
        if ((project.model && project.model.type) !== 'markov_cohort') throw unsupported('the R check covers the Markov cohort engine only (model type "' + (project.model && project.model.type) + '")');
        const strategies = project.strategies || {};
        const sids = Object.keys(strategies);
        if (sids.length < 2) throw unsupported('the R check needs at least two strategies');
        if (!sids.some((s) => strategies[s].is_comparator)) throw unsupported('no comparator strategy');
        const settings = opts.settings, tol = opts.tolerance;
        for (const k of ['time_horizon', 'cycle_length', 'discount_rate_costs', 'discount_rate_qalys', 'starting_age']) {
            if (typeof settings[k] !== 'number' || !Number.isFinite(settings[k])) throw unsupported('setting ' + k + ' is not a finite number');
        }
        const parser = getParser();
        const used = {};
        const params = project.parameters || {};
        const pids = Object.keys(params);
        const baseStr = {};
        pids.forEach((id) => { if (typeof params[id].value === 'string') baseStr[id] = params[id].value; });
        if (Object.keys(baseStr).length && typeof parser.analyzeDependencies === 'function') {
            const a = parser.analyzeDependencies(baseStr);
            if (a && Array.isArray(a.cycles) && a.cycles.length) throw unsupported('circular parameter definitions');
        }
        const states = project.states || {};
        const stIds = Object.keys(states);
        if (!stIds.length) throw unsupported('no states');
        stIds.forEach((s) => {
            const ip = states[s].initial_probability;
            if (ip !== undefined && ip !== null && typeof ip !== 'number') throw unsupported('initial_probability of ' + s + ' is not a number');
        });
        const trans = project.transitions || {};
        const L = [];
        const P = (s) => L.push(s);
        P('# HTA Base Case (allmeta HTA page) — independent check in R.');
        P('# Generated ' + new Date().toISOString() + ' from the page\'s CURRENT model and its last base-case run.');
        P('# Markov cohort re-implemented in base R following the page\'s documented conventions:');
        P('#   rewards at time points t = 0..N, weights by within-cycle method (trapezoidal: 0.5 at t = 0 and N),');
        P('#   discount factor (1 + r)^-(t * cycle_length) per time point, transition-matrix clamp/complement/');
        P('#   row-sum rules. The P43 pack validated discounted totals against this formula in R and the cohort');
        P('#   traces against heemod 1.1.0 at 1e-9. heemod discounts each cycle\'s average from the start of the');
        P('#   cycle, so heemod\'s own discounted totals differ by design (up to 2.9% in the pack); they are');
        P('#   printed for information only and are not counted.');
        P('# Expressions are translated from the page\'s own parse tree (fully parenthesised).');
        const noteAt = L.length;
        P('# Run with: Rscript --vanilla hta-basecase-check.R');
        P('');
        P('tol_engine <- ' + rNum(tol) + '   # the page engine\'s mass/normalisation tolerance');
        P('settings <- list(time_horizon = ' + rNum(settings.time_horizon) + ', cycle_length = ' + rNum(settings.cycle_length)
            + ', r_costs = ' + rNum(settings.discount_rate_costs) + ', r_qalys = ' + rNum(settings.discount_rate_qalys)
            + ', starting_age = ' + rNum(settings.starting_age) + ', within_cycle = ' + rStr(settings.half_cycle_correction) + ')');
        P('');
        P('# ---- the model (parameters, states, transitions, strategies) ----');
        P('params <- list(');
        P(pids.map((id) => {
            const v = params[id].value;
            const it = typeof v === 'number' ? 'list(kind = "num", value = ' + rNum(v) + ')'
                : typeof v === 'string' ? 'list(kind = "str", value = ' + rExprItem(exprToR(v, used)) + ')'
                    : 'list(kind = "num", value = 0)';
            return '  ' + rStr(id) + ' = ' + it;
        }).join(',\n'));
        P(')');
        P('names(params) <- ' + (pids.length ? 'c(' + pids.map(rStr).join(', ') + ')' : 'character(0)'));
        P('states <- list(');
        P(stIds.map((s) => {
            const st = states[s];
            const ip = typeof st.initial_probability === 'number' ? st.initial_probability : 0;
            const label = String(st.label || s);
            const cost = typeof st.cost === 'number' ? 'list(kind = "num", value = ' + rNum(st.cost) + ')'
                : typeof st.cost === 'string' ? rExprItemSafe(st.cost, used) : 'list(kind = "default", value = NULL)';
            const util = typeof st.utility === 'number' ? 'list(kind = "num", value = ' + rNum(st.utility) + ')'
                : typeof st.utility === 'string' ? rExprItemSafe(st.utility, used) : 'list(kind = "default", value = NULL)';
            return '  list(id = ' + rStr(s) + ', label = ' + rStr(label) + ', init = ' + rNum(ip || 0) + ', cost = ' + cost + ', utility = ' + util + ')';
        }).join(',\n'));
        P(')');
        P('transitions <- list(');
        P(Object.keys(trans).map((tid) => {
            const t = trans[tid];
            const raw = typeof t.probability === 'string' ? t.probability.trim() : t.probability;
            let p;
            if (typeof raw === 'number') p = 'list(kind = "num", value = ' + rNum(raw) + ')';
            else if (typeof raw === 'string' && (raw.toLowerCase() === 'complement' || raw.toUpperCase() === 'C')) p = 'list(kind = "complement", value = NULL)';
            else if (typeof raw === 'string') p = rExprItemSafe(raw, used);
            else p = 'list(kind = "num", value = 0)';
            return '  list(id = ' + rStr(tid) + ', from = ' + rStr(String(t.from)) + ', to = ' + rStr(String(t.to)) + ', p = ' + p + ')';
        }).join(',\n'));
        P(')');
        P('strategies <- list(');
        P(sids.map((sid) => {
            const st = strategies[sid];
            const ov = st.parameter_overrides || {};
            const items = Object.keys(ov).filter((k) => pids.includes(k)).map((k) => {
                const v = ov[k];
                const it = typeof v === 'number' ? 'list(kind = "num", value = ' + rNum(v) + ')'
                    : typeof v === 'string' ? 'list(kind = "str", value = ' + rExprItem(exprToR(v, used)) + ')'
                        : 'list(kind = "ignored", value = NULL)';
                return rStr(k) + ' = ' + it;
            });
            return '  ' + rStr(sid) + ' = list(label = ' + rStr(st.label || sid) + ', comparator = ' + (st.is_comparator ? 'TRUE' : 'FALSE')
                + ', overrides = list(' + items.join(', ') + '))';
        }).join(',\n'));
        P(')');
        P('');
        // ---- page values ----
        const rs = results.strategies || {};
        let intId = null, compDisp = null;
        for (const id of sids) { if (strategies[id].is_comparator) compDisp = id; else if (!intId) intId = id; }
        if (!intId) intId = Object.keys(rs)[0];
        if (!compDisp) compDisp = Object.keys(rs)[1] || intId;
        const cmp0 = results.incremental && results.incremental.comparisons && results.incremental.comparisons[0];
        P('# ---- what the page computed / displayed ----');
        P('page <- list(');
        P('  strategies = list(');
        P(Object.keys(rs).map((sid) => {
            const r = rs[sid];
            const tr = r.trace && r.trace.states ? r.trace.states : {};
            return '    ' + rStr(sid) + ' = list(total_costs = ' + rNum(r.total_costs) + ', total_qalys = ' + rNum(r.total_qalys) + ', trace = list('
                + Object.keys(tr).map((k) => rStr(k) + ' = c(' + tr[k].map(rNum).join(', ') + ')').join(', ') + '))';
        }).join(',\n'));
        P('  ),');
        P('  shown_int = ' + rStr(intId) + ', shown_comp = ' + rStr(compDisp) + ',');
        P('  icer = ' + (cmp0 && typeof cmp0.icer === 'number' ? rNum(cmp0.icer) : 'NA') + ', dominance = ' + rStr(cmp0 ? cmp0.dominance : '') + ',');
        P('  icer_strategy = ' + rStr(cmp0 ? cmp0.strategy : '') + ', comparator = ' + rStr(results.incremental ? results.incremental.comparator : '') + ',');
        P('  text = list(icer = ' + rStr(displayed.icer) + ', costs_int = ' + rStr(displayed.costsInt) + ', costs_comp = ' + rStr(displayed.costsComp)
            + ', qalys_int = ' + rStr(displayed.qalysInt) + ', qalys_comp = ' + rStr(displayed.qalysComp) + '),');
        const dn = (x) => { const v = digitsOf(x); return v === null ? 'NA' : rNum(v); };
        P('  num = list(icer = ' + dn(displayed.icer) + ', costs_int = ' + dn(displayed.costsInt) + ', costs_comp = ' + dn(displayed.costsComp) + ')');
        P(')');
        P('');
        P(R_ENGINE);
        if (used.log10) L.splice(noteAt, 0, '# NOTE: the page reads log() as base 10 (R log() is natural); translated as log10().');
        return L.join('\n') + '\n';
    }
    function rExprItemSafe(e, used) { return rExprItem(exprToR(e, used)); }

    // The R side: written from the page's documented conventions, not translated from markov.js.
    const R_ENGINE = String.raw`# ---- expression helpers (page semantics: JavaScript numbers) ----
.ctx <- NULL
.undef <- function(n) structure(class = c("undefined_variable", "error", "condition"), list(message = paste("Undefined variable:", n), call = NULL))
.v <- function(n) { if (!exists(n, envir = .ctx, inherits = FALSE)) stop(.undef(n)); get(n, envir = .ctx, inherits = FALSE) }
.truthy <- function(x) !is.na(x) && x != 0
.js_div <- function(a, b) { if (b == 0) stop("Division by zero"); a / b }
.js_mod <- function(a, b) if (b == 0 || !is.finite(a)) NaN else if (!is.finite(b)) a else a - b * trunc(a / b)
.js_pow <- function(a, b) if (is.nan(b) || (abs(a) == 1 && is.infinite(b))) NaN else a^b
.js_and <- function(a, b) if (.truthy(a)) as.numeric(.truthy(b)) else 0
.js_or <- function(a, b) if (.truthy(a)) 1 else as.numeric(.truthy(b))
.js_round <- function(x) { if (!is.finite(x)) return(x); r <- floor(x); if (x - r >= 0.5) r + 1 else r }   # Math.round, exact (floor(x + 0.5) is not)
.js_min <- function(...) { x <- c(...); if (any(is.nan(x))) NaN else min(x) }
.js_max <- function(...) { x <- c(...); if (any(is.nan(x))) NaN else max(x) }
.rate_to_prob <- function(rate, time = 1) 1 - exp(-rate * time)
.prob_to_rate <- function(prob, time = 1) -log(1 - prob) / time
.odds_to_prob <- function(odds) odds / (1 + odds)
.prob_to_odds <- function(prob) prob / (1 - prob)
.clamp <- function(x, lo, hi) .js_max(lo, .js_min(hi, x))
# evaluate one expression item; returns list(ok, value, retry)
.eval_item <- function(it) {
  if (it$kind == "num") return(list(ok = TRUE, value = it$value, retry = FALSE))
  if (it$kind == "id") {
    if (exists(it$value, envir = .ctx, inherits = FALSE)) return(list(ok = TRUE, value = get(it$value, envir = .ctx), retry = FALSE))
    return(list(ok = FALSE, value = 0, retry = TRUE))
  }
  if (it$kind == "expr") {
    f <- it$value
    return(tryCatch(list(ok = TRUE, value = suppressWarnings(as.numeric(f())), retry = FALSE),
      undefined_variable = function(e) list(ok = FALSE, value = 0, retry = TRUE),
      error = function(e) list(ok = FALSE, value = 0, retry = FALSE)))
  }
  list(ok = FALSE, value = 0, retry = FALSE)   # empty / unparseable / not an expression
}
# parameter maps: repeated passes, unresolved -> 0, non-finite -> 0 (page rule for parameters)
.resolve_map <- function(items) {
  pending <- names(items)
  for (pass in seq_len(max(1, 2 * length(items)))) {
    if (!length(pending)) break
    progress <- FALSE
    for (id in pending) {
      r <- .eval_item(items[[id]])
      if (r$ok && items[[id]]$kind == "expr" && !is.finite(r$value)) r <- list(ok = FALSE, value = 0, retry = FALSE)
      if (r$ok || !r$retry) { assign(id, if (r$ok) r$value else 0, envir = .ctx); pending <- setdiff(pending, id); progress <- TRUE }
    }
    if (!progress) break
  }
  for (id in pending) assign(id, 0, envir = .ctx)
}
.context <- function(strategy, cycle) {
  .ctx <<- new.env(parent = emptyenv())
  cl <- settings$cycle_length
  assign("cycle", cycle, .ctx); assign("time", cycle * cl, .ctx)
  age0 <- if (settings$starting_age == 0) 50 else settings$starting_age
  assign("age", age0 + cycle * cl, .ctx)
  ov <- strategy$overrides
  base_str <- list()
  for (id in names(params)) {
    p <- params[[id]]
    if (p$kind == "num") assign(id, p$value, .ctx) else if (!(id %in% names(ov))) base_str[[id]] <- p$value
  }
  if (length(base_str)) .resolve_map(base_str)
  ov_str <- list()
  for (id in names(ov)) { o <- ov[[id]]; if (o$kind == "num") assign(id, o$value, .ctx) else if (o$kind == "str") ov_str[[id]] <- o$value }
  if (length(ov_str)) .resolve_map(ov_str)
}
.state_value <- function(it, fallback) {
  if (it$kind == "num") return(it$value)
  if (it$kind == "default") return(fallback)
  if (it$kind %in% c("id", "expr")) {
    if (it$kind == "id") { if (exists(it$value, envir = .ctx, inherits = FALSE)) return(get(it$value, envir = .ctx)); return(fallback) }
    r <- .eval_item(it); return(if (r$ok) r$value else fallback)
  }
  fallback
}
.matrix <- function(sn) {
  k <- length(sn); M <- matrix(0, k, k, dimnames = list(sn, sn))
  for (t in transitions) {
    if (t$p$kind == "complement") next
    r <- if (t$p$kind == "num") t$p$value else { e <- .eval_item(t$p); if (e$ok) e$value else 0 }
    r <- max(0, min(1, r))
    if (t$from %in% sn && t$to %in% sn) M[t$from, t$to] <- r
  }
  for (t in transitions) if (t$p$kind == "complement" && t$from %in% sn && t$to %in% sn)
    M[t$from, t$to] <- max(0, 1 - sum(M[t$from, setdiff(sn, t$to)]))
  for (i in sn) {
    M[i, which(M[i, ] < 0)] <- 0
    s <- sum(M[i, ])
    if (isTRUE(s < 1e-6)) { M[i, ] <- 0; M[i, i] <- 1 }
    else if (isTRUE(abs(s - 1) > 1e-6)) { if (s > 1) M[i, ] <- M[i, ] / s else M[i, i] <- M[i, i] + (1 - s) }
    s2 <- sum(M[i, ])
    if (isTRUE(s2 > 1e-6) && isTRUE(abs(s2 - 1) > tol_engine)) M[i, ] <- M[i, ] / s2
  }
  M
}
run_strategy <- function(sid) {
  strat <- strategies[[sid]]; sn <- vapply(states, function(s) s$id, "")
  N <- min(ceiling(settings$time_horizon / settings$cycle_length), 10000)
  d <- vapply(states, function(s) s$init, 0); names(d) <- sn
  tot <- sum(d); if (abs(tot - 1) > 1e-9 && tot > 0) d <- d / tot; if (tot == 0) d[1] <- 1
  cl <- settings$cycle_length; trace <- matrix(NA_real_, N + 1, length(sn), dimnames = list(NULL, sn))
  cost <- 0; qaly <- 0; mats <- list()
  for (cyc in 0:N) {
    .context(strat, cyc)
    trace[cyc + 1, ] <- d
    w <- switch(settings$within_cycle,
      trapezoidal = if (cyc == 0 || cyc == N) 0.5 else 1,
      end = if (cyc == 0) 0 else 1,
      if (cyc == N) 0 else 1)   # start / none / other
    cc <- 0; qq <- 0
    for (s in states) {
      occ <- d[[s$id]]; if (isTRUE(occ <= 0)) next   # page skips unoccupied states (NaN is not skipped)
      cc <- cc + occ * .state_value(s$cost, 0) * cl * w
      qq <- qq + occ * .state_value(s$utility, 1) * cl * w
    }
    df_c <- if (settings$r_costs <= 0) 1 else (1 + settings$r_costs)^-(cyc * cl)
    df_q <- if (settings$r_qalys <= 0) 1 else (1 + settings$r_qalys)^-(cyc * cl)
    cost <- cost + cc * df_c; qaly <- qaly + qq * df_q
    if (cyc < N) {
      M <- .matrix(sn); mats[[cyc + 1]] <- M
      nd <- as.vector(d %*% M); names(nd) <- sn
      m <- sum(nd); if (m > tol_engine && abs(m - 1) > tol_engine) nd <- nd / m
      d <- nd
    }
  }
  list(total_costs = cost, total_qalys = qaly, trace = trace, mats = mats, N = N)
}

# ---- run every strategy ----
cat(R.version.string, "\n")
R <- lapply(setNames(names(strategies), names(strategies)), run_strategy)
comp_id <- names(strategies)[vapply(strategies, function(s) isTRUE(s$comparator), TRUE)][1]
icer_id <- setdiff(names(strategies), comp_id)[1]
dc <- R[[icer_id]]$total_costs - R[[comp_id]]$total_costs; de <- R[[icer_id]]$total_qalys - R[[comp_id]]$total_qalys
icer <- NA_real_; dom <- "none"
if (abs(de) < 1e-10) dom <- if (dc > 0) "more_costly_equal_effect" else if (dc < 0) "less_costly_equal_effect" else "equivalent" else
if (de > 0) { if (dc > 0) icer <- dc / de else dom <- "dominant" } else { if (dc > 0) dom <- "dominated" else icer <- dc / de }

# ---- compare ----
n_ok <- 0L; n_all <- 0L
chk <- function(name, pg, rv, ok, d = NA) {
  n_all <<- n_all + 1L; if (isTRUE(ok)) n_ok <<- n_ok + 1L
  cat(sprintf("%-40s page=%-18s R=%-18s |diff|=%-9s %s\n", name, pg, rv, if (is.na(d)) "-" else format(d, digits = 3), if (isTRUE(ok)) "OK" else "DIFF"))
}
rel_ok <- function(a, b) is.finite(a) && is.finite(b) && abs(a - b) <= 1e-9 * max(1, abs(b))
num <- function(x, dg = 10) format(x, digits = dg)
for (sid in names(R)) {
  pg <- page$strategies[[sid]]; rr <- R[[sid]]
  if (is.null(pg)) { chk(paste0(sid, ": strategy present"), "absent", "present", FALSE); next }
  chk(paste0(sid, ": total costs"), num(pg$total_costs), num(rr$total_costs), rel_ok(pg$total_costs, rr$total_costs), abs(pg$total_costs - rr$total_costs))
  chk(paste0(sid, ": total QALYs"), num(pg$total_qalys), num(rr$total_qalys), rel_ok(pg$total_qalys, rr$total_qalys), abs(pg$total_qalys - rr$total_qalys))
  dmax <- -Inf; okt <- TRUE
  for (s in colnames(rr$trace)) {
    v <- pg$trace[[s]]
    if (length(v) != nrow(rr$trace)) { okt <- FALSE; next }
    dmax <- max(dmax, abs(v - rr$trace[, s]))
  }
  chk(paste0(sid, ": trace (", nrow(rr$trace), " x ", ncol(rr$trace), ") max"), "page trace", "R trace", okt && dmax <= 1e-9, if (is.finite(dmax)) dmax else NA)
}
si <- page$shown_int; sc <- page$shown_comp
js_round <- .js_round
# The page shows QALYs with (x).toFixed(3): the exact binary value rounded, an exact tie going AWAY from
# zero ((2.0625).toFixed(3) = "2.063"); R's sprintf rounds an exact tie to even ("2.062"). Round the page's way.
js_to_fixed <- function(x, d) {
  if (is.na(x)) return("NaN")
  if (is.infinite(x)) return(if (x > 0) "Infinity" else "-Infinity")
  s <- if (x < 0) "-" else ""; a <- abs(x)
  t <- sprintf(paste0("%.", d + 1, "f"), a)
  tie <- substring(t, nchar(t)) == "5" && sprintf(paste0("%.", d + 40, "f"), a) == paste0(t, strrep("0", 39))
  if (!tie) return(paste0(s, sprintf(paste0("%.", d, "f"), a)))
  ch <- strsplit(substr(t, 1, nchar(t) - 1), "")[[1]]; i <- length(ch); carry <- TRUE
  while (carry && i >= 1) {
    if (ch[i] == ".") { i <- i - 1; next }
    if (ch[i] == "9") { ch[i] <- "0"; i <- i - 1 } else { ch[i] <- as.character(as.integer(ch[i]) + 1L); carry <- FALSE }
  }
  u <- paste0(if (carry) "1" else "", paste(ch, collapse = ""))
  paste0(s, sub("\\.$", "", u))
}
chk("shown: Total Costs (Intervention)", page$text$costs_int, js_round(R[[si]]$total_costs), isTRUE(page$num$costs_int == js_round(R[[si]]$total_costs)))
chk("shown: Total Costs (Comparator)", page$text$costs_comp, js_round(R[[sc]]$total_costs), isTRUE(page$num$costs_comp == js_round(R[[sc]]$total_costs)))
chk("shown: Total QALYs (Intervention)", page$text$qalys_int, js_to_fixed(R[[si]]$total_qalys, 3), page$text$qalys_int == js_to_fixed(R[[si]]$total_qalys, 3))
chk("shown: Total QALYs (Comparator)", page$text$qalys_comp, js_to_fixed(R[[sc]]$total_qalys, 3), page$text$qalys_comp == js_to_fixed(R[[sc]]$total_qalys, 3))
chk("ICER: strategy vs comparator", paste(page$icer_strategy, "vs", page$comparator), paste(icer_id, "vs", comp_id), page$icer_strategy == icer_id && page$comparator == comp_id)
chk("ICER: dominance", page$dominance, dom, page$dominance == dom)
if (!is.na(icer) || !is.na(page$icer)) {
  chk("ICER (full precision)", num(page$icer), num(icer), rel_ok(page$icer, icer), abs(page$icer - icer))
  chk("shown: ICER", page$text$icer, js_round(icer), isTRUE(page$num$icer == js_round(icer)))
} else chk("shown: ICER label", page$text$icer, dom, page$text$icer == dom)

# ---- heemod (P43 pack reference for the cohort trace), when installed ----
if (requireNamespace("heemod", quietly = TRUE)) {
  suppressPackageStartupMessages(library(heemod))   # heemod 1.1.0 run_model() fails unless the package is attached
  cat("heemod", as.character(packageVersion("heemod")), "installed: rebuilding the cohort traces with heemod\n")
  for (sid in names(R)) {
    rr <- R[[sid]]; sn <- colnames(rr$trace); k <- length(sn)
    const <- length(rr$mats) > 0 && all(vapply(rr$mats, function(M) isTRUE(all(M == rr$mats[[1]])), TRUE))
    if (!const) { cat("  ", sid, ": transition matrix changes over time; heemod trace check not run\n"); next }
    if (k < 2) { cat("  ", sid, ": heemod refuses a one-state model; heemod trace check not run\n"); next }
    hs <- paste0("S", seq_len(k))
    tm <- do.call(heemod::define_transition, c(as.list(as.vector(t(rr$mats[[1]]))), list(state_names = hs)))
    st <- lapply(hs, function(h) heemod::define_state(cost = 0, effect = 0)); names(st) <- hs
    strat <- do.call(heemod::define_strategy, c(list(transition = tm), st))
    # method = "end": heemod's counts at the end of cycles 1..N (the start vector is t = 0)
    res <- suppressMessages(suppressWarnings(heemod::run_model(s = strat, parameters = heemod::define_parameters(alm_unused = 0),
      cycles = rr$N, init = unname(rr$trace[1, ]), cost = cost, effect = effect, method = "end")))
    cn <- as.data.frame(heemod::get_counts(res))
    ht <- sapply(hs, function(h) { x <- cn[cn$state_names == h, ]; c(rr$trace[1, which(hs == h)], x$count[order(x$model_time)]) })
    dmax <- max(abs(ht - page$strategies[[sid]]$trace[sn] |> as.data.frame() |> as.matrix()))
    chk(paste0(sid, ": trace vs heemod (", nrow(ht), " x ", k, ") max"), "page trace", "heemod trace", dmax <= 1e-9, dmax)
  }
} else cat("heemod is not installed here: the heemod trace check did not run (install heemod 1.1.0 to run it).\n")
cat(if (n_ok == n_all) sprintf("MATCH %d/%d\n", n_ok, n_all) else sprintf("MISMATCH %d/%d\n", n_ok, n_all))
`;

    const api = { buildScript, digitsOf, exprToR: (e) => exprToR(e, {}) };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.HTARCheck = api;

    // ---- page wiring (browser only) ----
    if (typeof document === 'undefined') return;
    function el(id) { return document.getElementById(id); }
    function current() {
        const app = global.app;
        if (!app || !app.project || !app.results) throw unsupported('run the base case first');
        const engine = app.engines && app.engines.markov_cohort;
        if (!engine) throw unsupported('Markov engine not loaded');
        const displayed = {
            icer: el('result-icer').textContent.trim(), costsInt: el('result-costs-int').textContent.trim(),
            costsComp: el('result-costs-comp').textContent.trim(), qalysInt: el('result-qalys-int').textContent.trim(),
            qalysComp: el('result-qalys-comp').textContent.trim()
        };
        return buildScript(app.project, app.results, displayed, { settings: engine.getSettings(app.project), tolerance: engine.options.tolerance });
    }
    let token = 0;
    function init() {
        if (!el('btn-r-script')) return;
        el('btn-r-script').addEventListener('click', () => {
            const st = el('r-check-status');
            try {
                const url = URL.createObjectURL(new Blob([current()], { type: 'text/plain' }));
                const a = document.createElement('a'); a.href = url; a.download = 'hta-basecase-check.R';
                document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 0);
                st.textContent = 'R script downloaded (base R; adds a heemod trace check where heemod is installed).';
            } catch (e) { st.textContent = 'R script not available: ' + e.message; }
        });
        el('btn-verify-r').addEventListener('click', async () => {
            const my = ++token, st = el('r-check-status'), out = el('r-check-output'), btn = el('btn-verify-r');
            out.textContent = ''; btn.disabled = true;
            try {
                const script = current(), snap = global.app.results;
                if (!global.AlmWebR || typeof global.AlmWebR.runR !== 'function') throw new Error('WebR runner (shared/webr-runner.js) did not load.');
                const res = await global.AlmWebR.runR({ packages: [], script, onStatus: (m) => { if (my === token) st.textContent = m; } });
                // R answered for the run it was given. A new base-case run replaces app.results even when it
                // leaves the ICER cell untouched (no comparison), so check the run itself, not only that cell.
                if (my !== token || global.app.results !== snap) { st.textContent = 'R result discarded: the analysis on the page changed while R was running, so the verdict R returned (for the earlier analysis) is not shown. Press Verify in R again.'; return; }
                if (!res.ok) throw new Error(res.error);
                const last = res.stdout.trim().split('\n').pop() || '';
                st.textContent = 'WebR ' + res.versions.webR + ' · ' + res.versions.R + ' — base-R checks: ' + last
                    + '. heemod is not in this site\'s pinned WebR package repository, so its trace check did not run here; the downloadable R script runs it where heemod 1.1.0 is installed.';
                out.textContent = res.stdout;
            } catch (e) { if (my === token) st.textContent = 'R check could not run: ' + e.message; }
            finally { btn.disabled = false; }
        });
        // A new base-case run makes an earlier R output stale.
        const icer = el('result-icer');
        if (icer && typeof MutationObserver === 'function') new MutationObserver(() => {
            token++;
            if (el('r-check-output').textContent) { el('r-check-output').textContent = ''; el('r-check-status').textContent = 'Results changed since the last R check — press Verify in R again.'; }
        }).observe(icer, { childList: true, characterData: true, subtree: true });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(typeof window !== 'undefined' ? window : globalThis);
