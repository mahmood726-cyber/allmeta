// glossary.js — drop-in hover-tooltip for evidence-synthesis jargon.
//
// Usage: include this script (defer) on any allmeta tool page, then either
//   (a) add `data-gloss="term"` to a span/abbr to render an inline tooltip; or
//   (b) call `Glossary.scan(rootEl, { firstOnly: true })` to auto-tag the
//       first occurrence of each known term inside `rootEl`'s text nodes.
//
// All entries are short (≤ ~140 chars). Hover or focus shows the definition;
// long definitions also render in a small popover on click. No CDN, no data
// leaves the page. Tooltip is built with native <button> + aria-describedby
// so screen readers see the relationship.
//
// Add or override entries by mutating Glossary.terms at runtime:
//   Glossary.terms.PRISMA = "Preferred Reporting Items for Systematic Reviews and Meta-Analyses (Page 2021).";
//   Glossary.scan(document.body, { firstOnly: true });

(function (global) {
  "use strict";

  // ~70 entries covering the catalog's core methodological vocabulary.
  // Keep definitions short (one sentence). Cite the source when contested.
  const TERMS = {
    // Pooling & estimators
    "DerSimonian-Laird": "Method-of-moments random-effects estimator for τ². Underestimates τ² with k<10; prefer REML or Paule–Mandel for small k.",
    "DL": "Shorthand for DerSimonian–Laird τ² estimator (random-effects pooling).",
    "REML": "Restricted maximum-likelihood τ² estimator. Recommended default for k<10; Cochrane Handbook §10.10.4.",
    "Paule-Mandel": "Iterative τ² estimator that performs well at small k. Often preferred over DL when REML fails to converge.",
    "PM": "Shorthand for Paule–Mandel τ² estimator.",
    "HKSJ": "Hartung–Knapp–Sidik–Jonkman variance correction. Replaces z with t_{k-1} and inflates SE; floor q*≥1 to avoid narrowing the CI when Q<k-1.",
    "Hartung-Knapp": "See HKSJ — small-sample correction for random-effects meta-analysis.",
    "fixed-effect": "Pooling model assuming a single common true effect (Cochrane Handbook v6+ now prefers 'common-effect' to avoid the long-standing fixed-effect/fixed-effects ambiguity; Borenstein 2010 RSM 1:97). All study variation is sampling noise. Misleading when heterogeneity is non-trivial.",
    "random-effects": "Pooling model assuming each study has its own true effect drawn from a distribution N(μ, τ²).",
    "inverse-variance": "Each study contributes weight 1/SE² (or 1/(SE²+τ²) under random effects).",
    "Mantel-Haenszel": "Pooling method for binary outcomes that performs better than IV when events are sparse; computed on the natural log scale.",
    "Peto OR": "Approximate odds-ratio pooling for rare events; valid when events <1-5%, the true effect is not extreme (OR not far from 1), and arm sizes are not grossly unequal. Cochrane Handbook §10.4.1.1; Bradburn 2007.",
    // Heterogeneity
    "I-squared": "Proportion of total variance attributable to between-study heterogeneity. Cochrane Handbook §10.10.2 indicative bands (overlapping, NOT strict thresholds): 0-40% may not be important, 30-60% moderate, 50-90% substantial, 75-100% considerable. Report τ² alongside — I² measures proportion, not magnitude.",
    "I²": "See I-squared. Does NOT indicate the size of heterogeneity — report τ² alongside.",
    "tau-squared": "Between-study variance under a random-effects model. The actual scale of heterogeneity.",
    "τ²": "See tau-squared.",
    "Cochran Q": "Chi-square statistic for heterogeneity. Underpowered with few studies; do not interpret p>0.10 as 'no heterogeneity'.",
    "prediction interval": "Range of true effects expected in 95% of future studies: μ ± t_{k-2}·√(SE² + τ²). Undefined for k<3.",
    "PI": "Prediction interval — see entry.",
    // Bias
    "Egger test": "Regression test for funnel-plot asymmetry. Low power for k<10. Use Peters' test for binary outcomes.",
    "Peters test": "Funnel-plot asymmetry test for binary outcomes; preferred over Egger when effect size is OR/RR with sparse events.",
    "trim-and-fill": "Duval–Tweedie procedure that imputes 'missing' studies symmetric to the funnel. Sensitivity analysis only — never the primary result.",
    "PET-PEESE": "Conditional procedure: PET regresses TE on SE; if intercept rejects null, switch to PEESE (regression on SE²). Stanley & Doucouliagos 2014.",
    "p-curve": "Distribution of significant p-values used to detect p-hacking and estimate true effect; assumes flat null and right-skewed alternative.",
    "publication bias": "Tendency for statistically significant or 'positive' studies to be published preferentially.",
    // Risk of bias
    "RoB 2": "Cochrane's risk-of-bias 2 tool for randomized trials (5 domains + overall). Sterne 2019.",
    "ROBINS-I": "Risk Of Bias In Non-randomized Studies of Interventions (7 domains). Sterne 2016.",
    "ROBINS-E": "Risk Of Bias In Non-randomized Studies of Exposures.",
    "QUADAS-2": "Quality assessment of diagnostic accuracy studies (4 domains).",
    "AMSTAR-2": "16-item appraisal tool for systematic reviews of interventions. Shea 2017.",
    // GRADE
    "GRADE": "Grading of Recommendations, Assessment, Development and Evaluations — four-tier certainty (High/Moderate/Low/Very low) across five downgrade domains.",
    "CINeMA": "Confidence In Network Meta-Analysis — 6 domains: within-study bias, reporting bias, indirectness, imprecision, heterogeneity, incoherence (Nikolakopoulou 2020 PLoS Med 17:e1003082).",
    "CERQual": "Confidence in Evidence from Reviews of Qualitative research — GRADE analogue for qualitative evidence synthesis.",
    "certainty of evidence": "Confidence in the estimate; rated under GRADE as High/Moderate/Low/Very low after considering 5 downgrade domains.",
    // NMA
    "NMA": "Network meta-analysis — pooling direct and indirect evidence across multiple comparators.",
    "SUCRA": "Surface Under the Cumulative RAnking curve. Rank metric; do NOT use as the sole basis for treatment recommendations — show CrI of effects too.",
    "transitivity": "Assumption that effect modifiers are balanced across the direct comparisons in a network. The structural premise for combining indirect evidence.",
    "consistency": "Statistical agreement of direct and indirect evidence in NMA. Tested via design-by-treatment interaction or node-splitting.",
    "node-splitting": "Test for inconsistency in NMA: split each loop, compare direct to indirect estimate.",
    "Bucher": "Indirect comparison method for a single loop: A vs B and B vs C → A vs C, with variance summed.",
    "consistency model": "NMA fitted under the assumption that direct and indirect estimates agree (closed-loop consistency).",
    // DTA
    "DTA": "Diagnostic test accuracy meta-analysis.",
    "HSROC": "Hierarchical Summary ROC — Rutter–Gatsonis bivariate model with accuracy and threshold parameters.",
    "Bivariate DTA": "Reitsma model — bivariate normal on logit-Se / logit-Sp.",
    "SROC": "Summary Receiver Operating Characteristic curve — built from HSROC or bivariate output.",
    "DOR": "Diagnostic odds ratio = exp(μ₁ + μ₂) on the logit scale (NOT μ₁ - μ₂).",
    // Survival / IPD
    "RMST": "Restricted mean survival time — area under S(t) up to a fixed τ*. Pool differences, not ratios. Always state τ*.",
    "IPD": "Individual patient data — gold standard but rarely available. Two-stage and one-stage IV models exist.",
    "Guyot IPD": "Reconstruction of IPD from a digitised Kaplan–Meier curve plus published at-risk numbers (Guyot 2012 BMC Med Res Methodol 12:9). Approximate — never claim IPD-level accuracy.",
    "Schoenfeld test": "Tests proportional hazards assumption; if rejected, a single HR is misleading.",
    "Kaplan-Meier": "Non-parametric estimate of survival function S(t) from time-to-event data.",
    // Effect sizes
    "RR": "Risk ratio = P(event|exposed) / P(event|control). For cumulative incidence (binary outcomes). Distinct from rate ratio (incidence-rate data); both abbreviated RR — context matters.",
    "rate ratio": "Ratio of incidence rates (events per person-time): IR_exposed / IR_control. Distinct from risk ratio; both abbreviated RR. Preferred when follow-up varies between subjects.",
    "OR": "Odds ratio. OR ≈ RR only when baseline risk is low (commonly <10% rule of thumb) AND effect size is modest — large ORs diverge from RRs even at modest baseline risk (Zhang & Yu 1998 JAMA 280:1690).",
    "HR": "Hazard ratio. Assumes proportional hazards. Not a direct risk ratio.",
    "MD": "Mean difference between groups (same scale).",
    "SMD": "Standardised mean difference (Cohen's d / Hedges' g). Pooled across heterogeneous scales.",
    "Hedges g": "Bias-corrected SMD; multiply Cohen's d by 1 - 3/(4(N₁+N₂)-9).",
    "Fisher z": "Variance-stabilising transform for correlations: z = atanh(r), Var(z) = 1/(n-3).",
    // Sensitivity / advanced
    "fragility index": "Minimum number of event re-classifications, in one arm only (typically the arm with fewer events, not always the experimental arm), that flips a significant trial to non-significant (Walsh 2014). Some implementations test both arms and use the smaller flip count (Lin & Lee 2020).",
    "TSA": "Trial Sequential Analysis — sequential monitoring boundaries for cumulative meta-analyses (O'Brien-Fleming).",
    "Copas selection": "Sensitivity model for selective publication. Needs k≥15.",
    "leave-one-out": "Sensitivity analysis recomputing the pooled estimate after omitting each study in turn.",
    "GOSH": "Graphical display of study heterogeneity — every subset of studies is one dot in (μ̂, I²) space. Olkin 2012.",
    // Reporting
    "PRISMA": "Preferred Reporting Items for Systematic Reviews and Meta-Analyses. Page 2021 (PRISMA 2020).",
    "PRISMA-NMA": "Hutton 2015 extension to PRISMA for NMA — adds 5 NMA-specific items.",
    "PROSPERO": "International prospective register of systematic reviews.",
    "PICO": "Population, Intervention, Comparator, Outcome — review-question framework.",
    "PICOS": "PICO + Study design.",
    // Bayesian
    "credible interval": "Bayesian analogue of a confidence interval — direct probability statement on the parameter.",
    "CrI": "Credible interval — see entry.",
    "MCMC": "Markov Chain Monte Carlo — Bayesian inference engine.",
    "Rhat": "Convergence diagnostic; Rhat>1.01 means do NOT interpret the posterior.",
    "ESS": "Effective sample size; ESS<400 means CrI is unreliable."
  };

  const STORAGE_KEY = "allmeta:glossary:hidden:v1";

  let installed = false;
  let popoverEl = null;
  let popoverFor = null;

  function ensureStyles() {
    if (document.getElementById("__glossary-style")) return;
    const css = `
.gloss-term {
  border-bottom: 1px dotted currentColor;
  cursor: help;
  background: none;
  border-left: 0;
  border-right: 0;
  border-top: 0;
  padding: 0;
  margin: 0;
  font: inherit;
  color: inherit;
  text-decoration: none;
}
.gloss-term:focus-visible {
  outline: 2px solid var(--accent, #2c5e8a);
  outline-offset: 2px;
}
.gloss-popover {
  position: absolute;
  z-index: 9999;
  max-width: min(420px, 92vw);
  background: var(--panel, #fff);
  color: var(--ink, #15181d);
  border: 1px solid var(--border, #d9d5cc);
  border-left: 3px solid var(--accent, #2c5e8a);
  border-radius: 6px;
  padding: 0.55rem 0.75rem;
  box-shadow: 0 4px 16px rgba(0,0,0,0.12);
  font-size: 0.85rem;
  line-height: 1.4;
}
.gloss-popover .gloss-head {
  font-weight: 600;
  margin-bottom: 0.2rem;
  color: var(--accent, #2c5e8a);
}
.gloss-popover .gloss-close {
  position: absolute;
  top: 4px;
  right: 6px;
  background: none;
  border: 0;
  font-size: 1rem;
  color: var(--muted, #5c6470);
  cursor: pointer;
  padding: 0 0.3rem;
}
@media (prefers-color-scheme: dark) {
  .gloss-popover { box-shadow: 0 4px 16px rgba(0,0,0,0.6); }
}`;
    const style = document.createElement("style");
    style.id = "__glossary-style";
    style.textContent = css;
    document.head.appendChild(style);
  }

  function closePopover() {
    if (!popoverEl) return;
    popoverEl.remove();
    popoverEl = null;
    if (popoverFor) popoverFor.removeAttribute("aria-describedby");
    popoverFor = null;
    document.removeEventListener("keydown", handleKeydown, true);
    document.removeEventListener("click", handleOutsideClick, true);
  }

  // AV6-07: trap Tab/Shift-Tab inside the popover so keyboard users can't
  // walk past it while it's open; Escape returns focus to the trigger.
  function handleKeydown(e) {
    if (!popoverEl) return;
    if (e.key === "Escape") {
      const target = popoverFor;
      closePopover();
      if (target) target.focus();
      return;
    }
    if (e.key !== "Tab") return;
    const focusables = popoverEl.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusables.length) {
      // No focusables inside (shouldn't happen — close button is always there);
      // pin focus to the popover container itself.
      e.preventDefault();
      popoverEl.focus();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    // Single-focusable case: pin Tab/Shift-Tab to the only focusable.
    if (focusables.length === 1) {
      e.preventDefault();
      first.focus();
      return;
    }
    if (e.shiftKey) {
      if (active === first || active === popoverEl) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (active === last || active === popoverEl) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function handleOutsideClick(e) {
    if (!popoverEl) return;
    if (popoverEl.contains(e.target)) return;
    if (popoverFor && popoverFor.contains(e.target)) return;
    closePopover();
  }

  function showPopover(btn, term, def) {
    closePopover();
    ensureStyles();
    popoverEl = document.createElement("div");
    popoverEl.className = "gloss-popover";
    // role="dialog" + aria-modal="false" is correct for a click-dismissible
    // interactive panel (role="tooltip" is reserved for hover/focus-only,
    // non-interactive descriptions). P1-07.
    popoverEl.setAttribute("role", "dialog");
    popoverEl.setAttribute("aria-modal", "false");
    popoverEl.tabIndex = -1;
    const id = "gloss-pop-" + Math.random().toString(36).slice(2, 8);
    const headId = id + "-h";
    popoverEl.id = id;
    popoverEl.setAttribute("aria-labelledby", headId);
    popoverEl.innerHTML =
      '<button class="gloss-close" aria-label="Close definition" type="button">×</button>' +
      '<div class="gloss-head" id="' + headId + '"></div>' +
      '<div class="gloss-body"></div>';
    popoverEl.querySelector(".gloss-head").textContent = term;
    popoverEl.querySelector(".gloss-body").textContent = def;
    popoverEl.querySelector(".gloss-close").addEventListener("click", () => {
      const target = btn;
      closePopover();
      if (target) target.focus();
    });
    document.body.appendChild(popoverEl);
    const r = btn.getBoundingClientRect();
    const left = Math.max(8, Math.min(window.innerWidth - popoverEl.offsetWidth - 8, r.left + window.scrollX));
    const top = r.bottom + window.scrollY + 4;
    popoverEl.style.left = left + "px";
    popoverEl.style.top = top + "px";
    btn.setAttribute("aria-describedby", id);
    popoverFor = btn;
    document.addEventListener("keydown", handleKeydown, true);
    document.addEventListener("click", handleOutsideClick, true);
    // Move focus into the popover so keyboard users can close via the close
    // button or Escape and screen readers announce the dialog content.
    popoverEl.focus({ preventScroll: true });
  }

  function lookupTerm(text) {
    if (!text) return null;
    if (TERMS[text]) return { term: text, def: TERMS[text] };
    // Case-insensitive fallback (preserves the original casing in the page).
    const t = text.toLowerCase();
    for (const k of Object.keys(TERMS)) {
      if (k.toLowerCase() === t) return { term: k, def: TERMS[k] };
    }
    return null;
  }

  function makeButton(text, def, term) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "gloss-term";
    btn.textContent = text;
    btn.setAttribute("title", def.length > 70 ? def.slice(0, 70) + "…" : def);
    btn.setAttribute("aria-label", `${term}: ${def}`);
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (popoverFor === btn) {
        closePopover();
      } else {
        showPopover(btn, term, def);
      }
    });
    return btn;
  }

  function tagExisting() {
    document.querySelectorAll("[data-gloss]").forEach((el) => {
      if (el.classList.contains("gloss-term")) return; // already wrapped
      const term = el.dataset.gloss || el.textContent;
      const hit = lookupTerm(term);
      if (!hit) return;
      el.classList.add("gloss-term");
      const orig = el.getAttribute("title");
      if (!orig) el.setAttribute("title", hit.def.length > 70 ? hit.def.slice(0, 70) + "…" : hit.def);
      el.setAttribute("aria-label", `${hit.term}: ${hit.def}`);
      el.setAttribute("role", "button");
      el.setAttribute("tabindex", "0");
      el.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (popoverFor === el) closePopover();
        else showPopover(el, hit.term, hit.def);
      });
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (popoverFor === el) closePopover();
          else showPopover(el, hit.term, hit.def);
        }
      });
    });
  }

  // Build a regex that matches any whole-word term occurrence.
  // Escape regex metachars; boundaries reject letters, digits, hyphens, and
  // Latin Extended (so "post-RMST" no longer tags "RMST", "naïve" doesn't
  // tag "naive" partials, etc.). P1-04.
  function buildScanRegex(keys) {
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\\-]/g, "\\$&");
    const sorted = keys.slice().sort((a, b) => b.length - a.length);
    const parts = sorted.map(esc).join("|");
    const BOUND = "[A-Za-z0-9\\-\\u00C0-\\u024F]";
    return new RegExp("(?<!" + BOUND + ")(" + parts + ")(?!" + BOUND + ")", "g");
  }

  function scan(root, opts) {
    ensureStyles();
    opts = opts || {};
    const firstOnly = opts.firstOnly !== false; // default true
    root = root || document.body;
    // P1-03: idempotency — never scan the same root twice.
    if (root.dataset && root.dataset.glossScanned === "true") return;
    if (root.dataset) root.dataset.glossScanned = "true";
    const seen = new Set();
    const re = buildScanRegex(Object.keys(TERMS));
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const p = n.parentNode;
        if (!p) return NodeFilter.FILTER_REJECT;
        const tag = p.nodeName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "TEXTAREA" || tag === "INPUT" || tag === "BUTTON" || tag === "LABEL" || tag === "OPTION") return NodeFilter.FILTER_REJECT;
        if (p.classList && p.classList.contains("gloss-term")) return NodeFilter.FILTER_REJECT;
        if (p.closest && p.closest(".gloss-skip, [data-gloss-skip], .gloss-popover")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    let cur;
    while ((cur = walker.nextNode())) nodes.push(cur);
    nodes.forEach((node) => {
      const text = node.nodeValue;
      re.lastIndex = 0;
      let m;
      const ranges = [];
      while ((m = re.exec(text)) !== null) {
        const term = m[1];
        if (firstOnly && seen.has(term)) continue;
        ranges.push({ start: m.index, end: m.index + term.length, term });
        seen.add(term);
      }
      if (!ranges.length) return;
      const frag = document.createDocumentFragment();
      let i = 0;
      ranges.forEach((r) => {
        if (r.start > i) frag.appendChild(document.createTextNode(text.slice(i, r.start)));
        const hit = lookupTerm(r.term);
        if (hit) frag.appendChild(makeButton(text.slice(r.start, r.end), hit.def, hit.term));
        else frag.appendChild(document.createTextNode(text.slice(r.start, r.end)));
        i = r.end;
      });
      if (i < text.length) frag.appendChild(document.createTextNode(text.slice(i)));
      node.parentNode.replaceChild(frag, node);
    });
  }

  function init(opts) {
    if (installed) return;
    installed = true;
    ensureStyles();
    tagExisting();
    if (opts && opts.autoScan) scan(document.body, { firstOnly: true });
  }

  // Auto-init on DOMContentLoaded so plain `<script src="../shared/glossary.js" defer>`
  // tags get the data-gloss handling for free. Auto-scan is opt-in.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => init({ autoScan: false }));
  } else {
    init({ autoScan: false });
  }

  global.Glossary = { terms: TERMS, scan, tagExisting, init, close: closePopover };
})(typeof window !== "undefined" ? window : this);
