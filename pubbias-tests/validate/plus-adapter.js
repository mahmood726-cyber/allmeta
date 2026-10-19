/* "Validate the extras in R" panel for the pubbias-tests #alm-plus section (PET-PEESE, leave-one-out).
 * Tier 1 (live): runs metafor/meta in the bundled webR on the current input and compares every displayed quantity.
 * Tier 2 (offline): replays the 152 paper configurations through plus-engine.js against the pinned native R
 * reference (metafor 5.2-1, meta 8.5-0) and audits every rendered number. Separate from the original panel. */
(function () {
  'use strict';
  const P = window.AlmPubbiasPlus, C = window.AlmPubbiasPlusCompare, U = window.AlmPubbiasPlusUI, PINS = window.AlmPubbiasPlusPins;
  const files = PINS.files, repo = 'https://github.com/mahmood726-cyber/pubbias-reproducible';
  const exceptionIds = new Set(PINS.exceptions.identities);

  // Flatten a plus result into key -> value (numbers, strings, flags as 'true'/'false'/'null', refusals as reasons).
  function flat(result, binary) {
    const out = {};
    for (const m of ['pet', 'peese', 'conditional']) {
      const r = result.full[m];
      if (r.status !== 'ok') { out['full.' + m + '.refusal'] = r.reason; continue; }
      for (const [q] of C.FULL[m]) out['full.' + m + '.' + q] = r.values[q];
    }
    if (result.loo.status !== 'ok') { out['loo.refusal'] = result.loo.reason; return out; }
    for (const row of result.loo.values.rows) {
      const tag = 'loo.' + (row.omit === null ? 'none' : 'omit' + row.omit) + '.';
      for (const [m, fields] of Object.entries(C.LOO)) {
        if (['peters', 'harbord'].includes(m) && !binary) continue;
        const r = row[m];
        if (r.status !== 'ok') { out[tag + m + '.refusal'] = r.reason; continue; }
        for (const [q] of fields) out[tag + m + '.' + q] = r.values[q];
      }
      if (row.omit !== null) for (const f of C.FLAGS) if (binary || !/^(peters|harbord)/.test(f)) out[tag + 'flag.' + f] = String(row.flags[f]);
    }
    return out;
  }
  // Rendered-number audit: each displayed number/label has exactly one node whose stored value is the engine
  // value and whose text is its formatted value; each refusal is shown with its reason.
  function audit(result, binary) {
    const problems = [], root = document.getElementById('alm-plus');
    const want = {};
    for (const m of ['pet', 'peese']) { const r = result.full[m]; if (r.status === 'ok') for (const q of ['est', 'se', 'ciLo', 'ciHi', 't', 'p', 'slopeT', 'slopeP']) want['full.' + m + '.' + q] = r.values[q]; }
    const c = result.full.conditional; if (c.status === 'ok') for (const q of ['est', 'ciLo', 'ciHi']) want['full.conditional.' + q] = c.values[q];
    if (result.loo.status === 'ok') for (const row of result.loo.values.rows) {
      const tag = 'loo.' + (row.omit === null ? 'none' : 'omit' + row.omit) + '.';
      for (const [m, q] of [['egger', 'statistic'], ['egger', 'p'], ['egger', 'limit'], ['peese', 'est'], ['conditional', 'branch'], ['begg', 'tau'], ['begg', 'p'], ['trimfill', 'k0'], ['trimfill', 'side'], ['trimfill', 'est'], ['peters', 'statistic'], ['peters', 'p'], ['harbord', 'statistic'], ['harbord', 'p']]) {
        if (['peters', 'harbord'].includes(m) && !binary) continue;
        if (row[m].status === 'ok') want[tag + m + '.' + q] = row[m].values[q];
      }
    }
    const nodes = [...root.querySelectorAll('[data-plus-key]')].filter(n => !n.closest('#alm-plus-validate'));
    const seen = new Map(); for (const n of nodes) seen.set(n.dataset.plusKey, (seen.get(n.dataset.plusKey) || []).concat(n));
    for (const [key, v] of Object.entries(want)) {
      const list = seen.get(key) || [];
      if (list.length !== 1) { problems.push(key + ' shown ' + list.length + ' times'); continue; }
      const n = list[0];
      if (n.dataset.plusValue !== String(v)) problems.push(key + ' stored ' + n.dataset.plusValue + ' not ' + v);
      if (n.textContent !== U.display(key, v)) problems.push(key + ' text ' + n.textContent);
      if (n.closest('[hidden]') && !n.closest('tr[data-plus-row]')) problems.push(key + ' hidden');
    }
    for (const key of seen.keys()) if (!(key in want)) problems.push('unexpected displayed key ' + key);
    const fb = result.full.conditional;
    const branchNode = root.querySelectorAll('[data-plus-branch="full.conditional.branch"]');
    if (fb.status === 'ok' ? branchNode.length !== 1 || branchNode[0].dataset.plusValue !== fb.values.branch || !branchNode[0].textContent.includes(fb.values.branch) : branchNode.length !== 0) problems.push('conditional branch label');
    // Refusals: one node per refused method (per row) with the engine's reason.
    const refusals = [];
    for (const m of ['pet', 'peese', 'conditional']) if (result.full[m].status !== 'ok') refusals.push(['full.' + m, result.full[m].reason]);
    if (result.loo.status !== 'ok') refusals.push(['loo', result.loo.reason]);
    else for (const row of result.loo.values.rows) for (const m of ['egger', 'peese', 'conditional', 'begg', 'trimfill', 'peters', 'harbord']) {
      if (['peters', 'harbord'].includes(m) && !binary) continue;
      if (row[m].status !== 'ok') refusals.push(['loo.' + (row.omit === null ? 'none' : 'omit' + row.omit) + '.' + m, row[m].reason]);
    }
    const rnodes = [...root.querySelectorAll('[data-plus-refusal]')].filter(n => !n.closest('#alm-plus-validate'));
    if (rnodes.length !== refusals.length) problems.push('refusal nodes ' + rnodes.length + ' expected ' + refusals.length);
    for (const [key, reason] of refusals) { const n = rnodes.filter(x => x.dataset.plusRefusal === key); if (n.length !== 1 || n[0].dataset.plusReason !== reason || !n[0].textContent.startsWith('Refused: ')) problems.push('refusal ' + key); }
    // Flags column: stored flags equal the engine flags and the text lists exactly the true ones.
    if (result.loo.status === 'ok') for (const row of result.loo.values.rows) {
      const tag = row.omit === null ? 'none' : 'omit' + row.omit, n = root.querySelectorAll('[data-plus-flags="' + tag + '"]');
      if (n.length !== 1 || n[0].dataset.plusValue !== JSON.stringify(row.flags || null)) problems.push('flags ' + tag);
      else if (row.omit !== null) { const t = Object.entries(row.flags).filter(([, v]) => v === true).length; if ((t === 0) !== (n[0].textContent === 'none') || (t > 0 && n[0].textContent.split('; ').length !== t)) problems.push('flag text ' + tag); }
    }
    return problems;
  }

  async function replay(loaded, progress) {
    const corpus = loaded[files[0].path], ref = loaded[files[1].path], refs = ref.datasets, E = window.__almPubBiasEngine;
    const tsRef = loaded[files[3].path], tsRefs = tsRef.datasets;
    if (tsRef.versions.metafor !== '5.2.1' || Object.keys(tsRefs).length !== corpus.length) throw new Error('Thompson-Sharp reference coverage mismatch');
    if (!Array.isArray(corpus) || corpus.length !== PINS.configurations || Object.keys(refs).length !== corpus.length || new Set(corpus.map(d => d.id)).size !== corpus.length || corpus.some(d => !Object.hasOwn(refs, d.id))) throw new Error('Plus corpus configuration coverage mismatch');
    if (ref.versions.metafor !== '5.2.1' || ref.versions.meta !== '8.5.0') throw new Error('Reference versions differ from the pinned metafor 5.2-1 / meta 8.5-0');
    // Corpus disposition (archive data/dataset-disposition.json): every used dataset's configurations are exactly the corpus.
    const disp = loaded[files[2].path], used = Object.values(disp).filter(v => v.used), listed = used.flatMap(v => [].concat(v.configurations));
    const dispOK = Object.keys(disp).length === 114 && used.length === 75 && Object.values(disp).every(v => v.used || (typeof v.reason === 'string' && v.reason.length > 0)) &&
      listed.length === corpus.length && new Set(listed).size === listed.length && listed.every(id => corpus.some(d => d.id === id));
    const saved = U.snapshot(), status = document.getElementById('plus-status').textContent;
    let checks = 0, passed = 0; const failed = [], maxima = {}, refusals = [], identities = [];
    try {
      for (const [i, d] of corpus.entries()) {
        if (!Number.isInteger(d.k) || d.yi.length !== d.k || d.vi.length !== d.k || d.vi.some(v => !(v > 0))) throw new Error('Invalid source inputs: ' + d.id);
        const rows = d.yi.map((te, j) => ({ te, se: Math.sqrt(d.vi[j]) }));
        const binary = d.binary ? E.parseBinary(d.binary.map(b => [b.e1, b.n1, b.e2, b.n2].join(',')).join('\n')) : null;
        const result = P.compute(rows, binary);
        for (const c of [...C.compareConfig(d.id, result, refs[d.id], d.binary || null), ...C.compareTS(d.id, E, rows, tsRefs[d.id])]) {
          const identity = d.id + ' | ' + c.quantity; identities.push(identity); checks++;
          const key = c.quantity.replace(/^loo\.(none|omit\d+)\./, 'loo.');
          if (Number.isFinite(c.diff)) maxima[key] = Math.max(maxima[key] || 0, c.diff);
          if (c.quantity.endsWith('refusal') && c.pass) refusals.push(identity);
          if (c.pass && !exceptionIds.has(identity)) { passed++; continue; }
          const known = !c.pass && !!c.cls && PINS.exceptions.classOf[identity] === c.cls && exceptionIds.has(identity);
          failed.push({ knownException: known, label: identity + (known ? ' [documented: ' + c.cls + ']' : c.pass ? ' [UNEXPECTED: pinned exception now passes]' : ' [UNEXPECTED]'), app: c.app, ref: c.ref, diff: c.diff, tol: c.tol });
        }
        // Rendered display of this configuration.
        U.render(result, binary, ' (corpus replay: ' + d.id + ')');
        const problems = audit(result, !!binary), identity = d.id + ' | display'; identities.push(identity); checks++;
        if (!problems.length) passed++; else failed.push({ knownException: false, label: identity + ' [UNEXPECTED]', app: problems.slice(0, 5).join('; '), ref: 'every number, label, refusal and flag rendered once', diff: problems.length, tol: 0 });
        progress('Replaying ' + (i + 1) + '/' + corpus.length + ' configurations; ' + checks + ' checks');
        await new Promise(r => setTimeout(r, 0));
      }
    } finally {
      if (saved) U.render(saved.result, saved.binary); else for (const id of ['plus-pp-body', 'plus-loo-head', 'plus-loo-body', 'plus-loo-summary', 'plus-k']) document.getElementById(id).replaceChildren();
      document.getElementById('plus-status').textContent = status;
    }
    identities.push('corpus | disposition'); checks++;
    if (dispOK) passed++; else failed.push({ knownException: false, label: 'corpus | disposition [UNEXPECTED]', app: used.length + ' used / ' + listed.length + ' configurations', ref: '75 used datasets / ' + corpus.length + ' configurations, each exclusion with a reason', diff: 1, tol: 0 });
    const coverageFails = [];
    if (new Set(identities).size !== identities.length) coverageFails.push({ label: 'Duplicate check identities', app: identities.length - new Set(identities).size, ref: 0, diff: null, tol: 0 });
    for (const id of exceptionIds) if (!identities.includes(id)) coverageFails.push({ label: 'Pinned exception missing: ' + id, app: 'absent', ref: 'present', diff: null, tol: 0 });
    const unexpected = failed.filter(f => !f.knownException).length + coverageFails.length;
    return { checks, passed, failed, coverageFails, maxima, refusals: refusals.length, unexpected, coverage: coverageFails.length === 0 && checks === PINS.checks,
      summaryLines: ['Unexpected failures: ' + unexpected, corpus.length + ' configurations from the paper corpus; leave-one-out for 4 <= k <= 100 (' + PINS.looConfigurations + ' configurations, ' + PINS.omissions + ' omissions); larger and smaller configurations are recorded refusals.',
        'Documented exceptions (' + exceptionIds.size + '): R refuses because a REML fit inside the R call does not converge (the archive parent model, or the trimfill side regression) while the app returns a value that agrees with the documented R fallback. They remain FAIL.',
        'Reference: R 4.6.0, metafor 5.2-1, meta 8.5-0 (pinned SHA-256 on LF bytes). Thompson-Sharp (page table) is checked against regtest(rma REML, model=rma, predictor=sei). The selection model is experimental and not part of these checks.'] };
  }

  // ---- Live tier: the same calls in the bundled webR, for the current input.
  function buildScript(s) {
    const vec = x => 'c(' + x.map(v => typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toPrecision(17)) : v).join(',') + ')';
    const L = ['suppressMessages({library(metafor)' + (s.binary ? ';library(meta)' : '') + '})',
      'y <- ' + vec(s.rows.map(r => r.te)), 'v <- ' + vec(s.rows.map(r => r.se * r.se))];
    if (s.binary) for (const q of ['e1', 'n1', 'e2', 'n2']) L.push(q + ' <- ' + vec(s.binary.map(r => r[q])));
    L.push(
      'out <- list(); put <- function(k, x) out[[k]] <<- x',
      'reason <- function(e, informative=NA) { if (startsWith(e, "Fisher scoring algorithm did not converge")) return("reml-nonconvergence"); if (e == "Trim and fill algorithm did not converge.") return("trimfill-nonconvergence"); if (identical(informative, TRUE)) return("insufficient-informative-rows"); paste0("r-error: ", e) }',
      'cap <- function(expr) tryCatch(suppressWarnings(expr), error=function(e) list(error=conditionMessage(e)))',
      'reg <- function(y, v, pred) { z <- regtest(y, vi=v, model="lm", predictor=pred, ret.fit=TRUE); s <- coef(summary(z$fit)); list(est=unname(z$est), se=s[1,2], ciLo=unname(z$ci.lb), ciHi=unname(z$ci.ub), t=s[1,3], p=s[1,4], slope=s[2,1], slopeT=unname(z$zval), slopeP=unname(z$pval), df=unname(z$dfs)) }',
      'cond <- function(a, b) { if (!is.null(a$error)) return(a); if (abs(a$p - 0.05) <= 1e-9) return(list(error="alpha-tie")); if (a$p < 0.05) c(list(branch="PEESE"), b) else c(list(branch="PET"), a) }',
      'k <- length(y); if (k >= 3) { pf <- reg(y, v, "sei"); qf <- reg(y, v, "vi"); cf <- cond(pf, qf)',
      ' for (q in c("est","se","ciLo","ciHi","t","p","slope","slopeT","slopeP","df")) { put(paste0("full.pet.",q), pf[[q]]); put(paste0("full.peese.",q), qf[[q]]) }',
      ' if (is.null(cf$error)) for (q in c("branch","est","ciLo","ciHi")) put(paste0("full.conditional.",q), cf[[q]]) else put("full.conditional.refusal", cf$error) }',
      'tests <- function(i) { keep <- if (is.null(i)) seq_len(k) else seq_len(k)[-i]; ys <- y[keep]; vs <- v[keep]; r <- list()',
      ' r$egger <- cap({ z <- regtest(rma(ys, vs, method="REML"), model="lm", predictor="sei", ret.fit=TRUE); list(statistic=z$zval, p=z$pval, limit=as.numeric(coef(z$fit)[1])) })',
      ' r$begg <- cap({ z <- ranktest(ys, vi=vs); list(tau=unname(z$tau), p=z$pval) })',
      ' r$trimfill <- cap({ z <- trimfill(rma(ys, vs, method="REML"), estimator="L0"); list(k0=z$k0, side=z$side, est=as.numeric(z$b)) })',
      ' p1 <- cap(reg(ys, vs, "sei")); q1 <- cap(reg(ys, vs, "vi")); r$pet <- p1; r$peese <- q1; r$conditional <- cond(p1, q1)',
      s.binary ? ' inf <- sum(e1[keep] + e2[keep] > 0 & e1[keep] + e2[keep] < n1[keep] + n2[keep]) < 3; for (M in c("Peters","Harbord")) { z <- cap(metabias(metabin(e1[keep], n1[keep], e2[keep], n2[keep], sm="OR", method="Inverse", allstudies=TRUE), method.bias=M, k.min=3)); if (is.null(z$error) && is.null(z$statistic)) z <- list(error="none", informative=inf); r[[tolower(M)]] <- if (is.null(z$error)) list(statistic=unname(z$statistic), p=z$p.value) else list(error=z$error, informative=inf) }' : '',
      ' r }',
      'fields <- list(egger=c("statistic","p","limit"), begg=c("tau","p"), trimfill=c("k0","side","est"), pet="est", peese="est", conditional="branch"' + (s.binary ? ', peters=c("statistic","p"), harbord=c("statistic","p")' : '') + ')',
      'sig <- function(x) if (is.null(x$error)) x$p < 0.05 else NA',
      'flag <- function(a, b) if (is.na(a) || is.na(b)) "null" else tolower(as.character(a != b))',
      'if (k < 4) put("loo.refusal", if (k < 3) "k-below-3" else "loo-requires-k-4") else if (k > 100) put("loo.refusal", "loo-k-above-100") else {',
      ' base <- tests(NULL)',
      ' for (i in c(0, seq_len(k))) { r <- if (i == 0) base else tests(i); tag <- if (i == 0) "loo.none." else paste0("loo.omit", i, ".")',
      '  for (m in names(fields)) { x <- r[[m]]; if (!is.null(x$error)) { put(paste0(tag, m, ".refusal"), if (m %in% c("pet","peese","conditional") && x$error == "alpha-tie") "alpha-tie" else reason(x$error, if (m %in% c("peters","harbord")) x$informative else NA)); next }; for (q in fields[[m]]) put(paste0(tag, m, ".", q), x[[q]]) }',
      '  if (i > 0) { for (m in intersect(c("egger","begg","peters","harbord"), names(fields))) put(paste0(tag, "flag.", m, "_flip"), flag(sig(base[[m]]), sig(r[[m]])))',
      '   put(paste0(tag, "flag.trimfill_k0_change"), if (!is.null(base$trimfill$error) || !is.null(r$trimfill$error)) "null" else tolower(as.character(base$trimfill$k0 != r$trimfill$k0)))',
      '   put(paste0(tag, "flag.branch_change"), if (!is.null(base$conditional$error) || !is.null(r$conditional$error)) "null" else tolower(as.character(base$conditional$branch != r$conditional$branch))) } } }',
      'enc <- function(x) { if (length(x) != 1 || is.na(x)) return("null"); if (is.character(x)) return(paste0("\\"", x, "\\"")); if (!is.finite(x)) return("null"); sprintf("%.17g", x) }',
      'cat("ALMJSON:{", paste(sprintf("\\"%s\\":%s", names(out), vapply(out, enc, "")), collapse=","), "}\\n", sep="")');
    return L.filter(Boolean).join('\n');
  }
  function currentState() {
    const E = window.__almPubBiasEngine, binary = document.getElementById('format').value === 'binary';
    const parsed = (binary ? E.parseBinary : E.parseTESE)(document.getElementById('src').value);
    if (parsed.length < 3) throw new Error('Need at least three studies with positive standard errors.');
    if (parsed.length > 100) throw new Error('Live R check of leave-one-out is limited to 100 studies.');
    const rows = parsed.map(r => ({ te: r.te, se: r.se }));
    return { rows, binary: binary ? parsed.map(r => ({ e1: r.e1, n1: r.n1, e2: r.e2, n2: r.n2, te: r.te, se: r.se, total: r.total })) : null,
      note: 'Live tier uses the bundled webR metafor/meta versions; the pinned native reference used metafor 5.2-1 and meta 8.5-0. Egger, trim-and-fill, Peters and Harbord use the archive\'s parent-REML calls, so an R parent-REML refusal appears as a FAIL here.' };
  }
  function appValues(s) {
    const result = P.compute(s.rows, s.binary);
    const rows = Object.entries(flat(result, !!s.binary)).map(([key, value]) => ({ key, label: key, value }));
    compare.tolerance = { default: 1e-9 }; compare.kind = {};
    for (const { key } of rows) { const [k, t] = rule(key); compare.kind[key] = k; compare.tolerance[key] = t; }
    return rows;
  }
  // Plain objects (the widget structuredClones them after appValues has filled in this run's keys).
  const compare = { tolerance: { default: 1e-9 }, kind: {} };
  function rule(key) {
    if (/\.(k0|side|branch|df|refusal)$|\.flag\./.test(key)) return ['exact', 0];
    if (/\.(p|slopeP)$/.test(key)) return ['abs', 1e-9];
    return ['rel', /trimfill\.est$/.test(key) ? 1e-6 : 1e-9];
  }
  const adapter = { app: 'pubbias-tests-plus', paper: { checks: PINS.checks, repoUrl: repo },
    live: { packages: ['metafor', 'meta'], paperVersions: { metafor: '5.2-1', meta: '8.5-0' }, currentState, appValues, buildScript, get compare() { return compare; } },
    corpus: { files, run: replay } };
  window.AlmPubbiasPlusAdapter = adapter;
  window.AlmPubbiasPlusAudit = { flat, audit };
  window.AlmPubbiasPlusValidation = AlmValidate.mount(document.getElementById('alm-plus-validate'), adapter);
  document.querySelector('#alm-plus-validate h2').textContent = 'Validate the extras in R';
  const buttons = document.querySelectorAll('#alm-plus-validate button');
  buttons[0].textContent = 'Validate current PET-PEESE and leave-one-out in R';
  buttons[1].textContent = 'Replay extras corpus (stored R references)';
})();
