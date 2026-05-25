/* shared/citation.js — drop-in "Cite as" button for every numerical app.
 *
 * Each app declares which method papers it implements; this module emits
 * a small button that opens a modal with both Vancouver-style and BibTeX
 * citations for (a) allmeta itself and (b) each method-specific paper.
 *
 *   AlmCitation.attach({
 *     btn: "#btn-cite",
 *     app: "rve-meta",     // key in CITATIONS below
 *   });
 *
 * Or render the button from scratch:
 *
 *   AlmCitation.attachAuto({
 *     container: "#alm-cite-mount",
 *     app: "rve-meta",
 *   });
 */
(function (global) {
  "use strict";

  // ----- Method paper registry ------------------------------------------
  //
  // Each method-app maps to one or more papers. The allmeta self-citation
  // is added automatically and doesn't need to be declared per app.

  var ALLMETA_CITE = {
    vancouver: 'Ahmad M. allmeta: open browser-only tools for evidence synthesis. v11, 2026. Available from: https://mahmood726-cyber.github.io/allmeta/',
    bibtex: '@software{ahmad_allmeta_2026,\n  author = {Ahmad, Mahmood},\n  title = {allmeta: open browser-only tools for evidence synthesis},\n  url = {https://mahmood726-cyber.github.io/allmeta/},\n  version = {v11},\n  year = {2026}\n}',
  };

  var CITATIONS = {
    "rve-meta": [
      { vancouver: "Hedges LV, Tipton E, Johnson MC. Robust variance estimation in meta-regression with dependent effect size estimates. Res Synth Methods. 2010;1(1):39-65. doi:10.1002/jrsm.5",
        bibtex: '@article{hedges_tipton_2010_rve,\n  author = {Hedges, Larry V. and Tipton, Elizabeth and Johnson, Matthew C.},\n  title = {Robust variance estimation in meta-regression with dependent effect size estimates},\n  journal = {Research Synthesis Methods},\n  volume = {1},\n  number = {1},\n  pages = {39--65},\n  year = {2010},\n  doi = {10.1002/jrsm.5}\n}' },
      { vancouver: "Tipton E. Small sample adjustments for robust variance estimation with meta-regression. Psychol Methods. 2015;20(3):375-393. doi:10.1037/met0000011",
        bibtex: '@article{tipton_2015_cr1,\n  author = {Tipton, Elizabeth},\n  title = {Small sample adjustments for robust variance estimation with meta-regression},\n  journal = {Psychological Methods},\n  volume = {20},\n  number = {3},\n  pages = {375--393},\n  year = {2015},\n  doi = {10.1037/met0000011}\n}' },
    ],
    "bma-tau-priors": [
      { vancouver: "Friede T, Röver C, Wandel S, Neuenschwander B. Meta-analysis of two studies in the presence of heterogeneity with applications in rare diseases. Biom J. 2017;59(4):658-671. doi:10.1002/bimj.201500236",
        bibtex: '@article{friede_2017_bma,\n  author = {Friede, Tim and R\\"over, Christian and Wandel, Simon and Neuenschwander, Beat},\n  title = {Meta-analysis of two studies in the presence of heterogeneity with applications in rare diseases},\n  journal = {Biometrical Journal},\n  volume = {59},\n  number = {4},\n  pages = {658--671},\n  year = {2017},\n  doi = {10.1002/bimj.201500236}\n}' },
    ],
    "cross-design": [
      { vancouver: "Welton NJ, Cooper NJ, Ades AE, Lu G, Sutton AJ. Mixed treatment comparison with multiple outcomes reported inconsistently across trials: evaluation of antivirals for treatment of influenza A and B. Stat Med. 2008;27(27):5620-5639. doi:10.1002/sim.3445",
        bibtex: '@article{welton_2008_design_bias,\n  author = {Welton, Nicky J. and Cooper, Nicola J. and Ades, A. E. and Lu, Guobing and Sutton, Alex J.},\n  title = {Mixed treatment comparison with multiple outcomes reported inconsistently across trials},\n  journal = {Statistics in Medicine},\n  volume = {27},\n  pages = {5620--5639},\n  year = {2008},\n  doi = {10.1002/sim.3445}\n}' },
      { vancouver: "Ibrahim JG, Chen MH. Power Prior Distributions for Regression Models. Statist Sci. 2000;15(1):46-60. doi:10.1214/ss/1009212673",
        bibtex: '@article{ibrahim_chen_2000_powerprior,\n  author = {Ibrahim, Joseph G. and Chen, Ming-Hui},\n  title = {Power Prior Distributions for Regression Models},\n  journal = {Statistical Science},\n  volume = {15},\n  number = {1},\n  pages = {46--60},\n  year = {2000},\n  doi = {10.1214/ss/1009212673}\n}' },
    ],
    "cross-network": [
      { vancouver: "Efthimiou O, Mavridis D, Debray TP, Samara M, Belger M, Siontis GC, et al. Combining randomized and non-randomized evidence in network meta-analysis. Stat Med. 2017;36(8):1210-1226. doi:10.1002/sim.7223",
        bibtex: '@article{efthimiou_2017_getreal,\n  author = {Efthimiou, Orestis and Mavridis, Dimitris and Debray, Thomas P. and others},\n  title = {Combining randomized and non-randomized evidence in network meta-analysis},\n  journal = {Statistics in Medicine},\n  volume = {36},\n  number = {8},\n  pages = {1210--1226},\n  year = {2017},\n  doi = {10.1002/sim.7223}\n}' },
    ],
    "multi-outcome-ma": [
      { vancouver: "Riley RD, Thompson JR, Abrams KR. An alternative model for bivariate random-effects meta-analysis when the within-study correlations are unknown. Biostatistics. 2007;8(3):441-451. doi:10.1093/biostatistics/kxl018",
        bibtex: '@article{riley_2007_bivariate,\n  author = {Riley, Richard D. and Thompson, John R. and Abrams, Keith R.},\n  title = {An alternative model for bivariate random-effects meta-analysis when the within-study correlations are unknown},\n  journal = {Biostatistics},\n  volume = {8},\n  number = {3},\n  pages = {441--451},\n  year = {2007},\n  doi = {10.1093/biostatistics/kxl018}\n}' },
    ],
    "multi-outcome-nma": [
      { vancouver: "Achana FA, Cooper NJ, Bujkiewicz S, Hubbard SJ, Kendrick D, Jones DR, Sutton AJ. Network meta-analysis of multiple outcome measures accounting for borrowing of information across outcomes. BMC Med Res Methodol. 2014;14:92. doi:10.1186/1471-2288-14-92",
        bibtex: '@article{achana_2014_multioutcome_nma,\n  author = {Achana, Felix A. and Cooper, Nicola J. and Bujkiewicz, Sylwia and others},\n  title = {Network meta-analysis of multiple outcome measures accounting for borrowing of information across outcomes},\n  journal = {BMC Medical Research Methodology},\n  volume = {14},\n  pages = {92},\n  year = {2014},\n  doi = {10.1186/1471-2288-14-92}\n}' },
    ],
    "nma-meta-reg": [
      { vancouver: "Cooper NJ, Sutton AJ, Morris D, Ades AE, Welton NJ. Addressing between-study heterogeneity and inconsistency in mixed treatment comparisons: Application to stroke prevention treatments in individuals with non-rheumatic atrial fibrillation. Stat Med. 2009;28(14):1861-1881. doi:10.1002/sim.3594",
        bibtex: '@article{cooper_2009_nmr,\n  author = {Cooper, Nicola J. and Sutton, Alex J. and Morris, Davina and Ades, A. E. and Welton, Nicky J.},\n  title = {Addressing between-study heterogeneity and inconsistency in mixed treatment comparisons},\n  journal = {Statistics in Medicine},\n  volume = {28},\n  number = {14},\n  pages = {1861--1881},\n  year = {2009},\n  doi = {10.1002/sim.3594}\n}' },
    ],
    "rare-events-glmm": [
      { vancouver: "Stijnen T, Hamza TH, Ozdemir P. Random effects meta-analysis of event outcome in the framework of the generalized linear mixed model with applications in sparse data. Stat Med. 2010;29(29):3046-3067. doi:10.1002/sim.4040",
        bibtex: '@article{stijnen_2010_glmm,\n  author = {Stijnen, Theo and Hamza, Taye H. and Ozdemir, Pinar},\n  title = {Random effects meta-analysis of event outcome in the framework of the generalized linear mixed model with applications in sparse data},\n  journal = {Statistics in Medicine},\n  volume = {29},\n  number = {29},\n  pages = {3046--3067},\n  year = {2010},\n  doi = {10.1002/sim.4040}\n}' },
    ],
    "sequential-ma": [
      { vancouver: "Lan KKG, DeMets DL. Discrete sequential boundaries for clinical trials. Biometrika. 1983;70(3):659-663. doi:10.2307/2336502",
        bibtex: '@article{lan_demets_1983,\n  author = {Lan, K. K. G. and DeMets, David L.},\n  title = {Discrete sequential boundaries for clinical trials},\n  journal = {Biometrika},\n  volume = {70},\n  number = {3},\n  pages = {659--663},\n  year = {1983},\n  doi = {10.2307/2336502}\n}' },
      { vancouver: "Wetterslev J, Thorlund K, Brok J, Gluud C. Trial sequential analysis may establish when firm evidence is reached in cumulative meta-analysis. J Clin Epidemiol. 2008;61(1):64-75. doi:10.1016/j.jclinepi.2007.03.013",
        bibtex: '@article{wetterslev_2008_tsa,\n  author = {Wetterslev, J\\o{}rn and Thorlund, Kristian and Brok, Jesper and Gluud, Christian},\n  title = {Trial sequential analysis may establish when firm evidence is reached in cumulative meta-analysis},\n  journal = {Journal of Clinical Epidemiology},\n  volume = {61},\n  number = {1},\n  pages = {64--75},\n  year = {2008},\n  doi = {10.1016/j.jclinepi.2007.03.013}\n}' },
    ],
    "personalised-te": [
      { vancouver: "Kent DM, Paulus JK, van Klaveren D, D'Agostino R, Goodman S, Hayward R, et al. The Predictive Approaches to Treatment effect Heterogeneity (PATH) Statement. Ann Intern Med. 2020;172(1):35-45. doi:10.7326/M18-3667",
        bibtex: '@article{kent_2020_path,\n  author = {Kent, David M. and Paulus, Jessica K. and van Klaveren, David and others},\n  title = {The Predictive Approaches to Treatment effect Heterogeneity (PATH) Statement},\n  journal = {Annals of Internal Medicine},\n  volume = {172},\n  number = {1},\n  pages = {35--45},\n  year = {2020},\n  doi = {10.7326/M18-3667}\n}' },
    ],
    "everything-model": [
      { vancouver: "Higgins JPT, Whitehead A. Borrowing strength from external trials in a meta-analysis. Stat Med. 1996;15(24):2733-2749. doi:10.1002/(SICI)1097-0258(19961230)15:24<2733::AID-SIM562>3.0.CO;2-0",
        bibtex: '@article{higgins_whitehead_1996,\n  author = {Higgins, J. P. T. and Whitehead, Anne},\n  title = {Borrowing strength from external trials in a meta-analysis},\n  journal = {Statistics in Medicine},\n  volume = {15},\n  number = {24},\n  pages = {2733--2749},\n  year = {1996}\n}' },
    ],
    "living-rob-pool": [
      { vancouver: "Elliott JH, Synnot A, Turner T, Simmonds M, Akl EA, McDonald S, et al. Living systematic review: 1. Introduction—the why, what, when, and how. J Clin Epidemiol. 2017;91:23-30. doi:10.1016/j.jclinepi.2017.08.010",
        bibtex: '@article{elliott_2017_lsr,\n  author = {Elliott, Julian H. and Synnot, Anneliese and Turner, Tari and others},\n  title = {Living systematic review: 1. Introduction—the why, what, when, and how},\n  journal = {Journal of Clinical Epidemiology},\n  volume = {91},\n  pages = {23--30},\n  year = {2017},\n  doi = {10.1016/j.jclinepi.2017.08.010}\n}' },
    ],
    "forest-plot":      [],
    "funnel-plot":      [],
    "heterogeneity":    [],
    "meta-regression":  [],
    "cumulative-subgroup": [],
    "bayesian-ma":      [],
    "tsa":              [
      { vancouver: "Wetterslev J, Thorlund K, Brok J, Gluud C. Trial sequential analysis may establish when firm evidence is reached in cumulative meta-analysis. J Clin Epidemiol. 2008;61(1):64-75.",
        bibtex: '@article{wetterslev_2008_tsa_short,\n  author = {Wetterslev, J\\o{}rn and Thorlund, Kristian and Brok, Jesper and Gluud, Christian},\n  title = {Trial sequential analysis may establish when firm evidence is reached in cumulative meta-analysis},\n  journal = {Journal of Clinical Epidemiology},\n  volume = {61},\n  number = {1},\n  pages = {64--75},\n  year = {2008}\n}' },
    ],
  };

  // ----- Formatting -----------------------------------------------------

  function getCitations(appKey) {
    var papers = CITATIONS[appKey] || [];
    return {
      app: ALLMETA_CITE,
      papers: papers,
    };
  }

  function formatAll(appKey) {
    var c = getCitations(appKey);
    var lines = [];
    lines.push("# Cite the suite");
    lines.push("");
    lines.push("## Vancouver");
    lines.push(c.app.vancouver);
    lines.push("");
    lines.push("## BibTeX");
    lines.push(c.app.bibtex);
    if (c.papers.length) {
      lines.push("");
      lines.push("# Cite the method paper" + (c.papers.length > 1 ? "s" : ""));
      c.papers.forEach(function (p, i) {
        lines.push("");
        lines.push("## Method paper " + (i + 1) + " — Vancouver");
        lines.push(p.vancouver);
        lines.push("");
        lines.push("## Method paper " + (i + 1) + " — BibTeX");
        lines.push(p.bibtex);
      });
    }
    return lines.join("\n");
  }

  // ----- Modal renderer --------------------------------------------------

  function _modalHTML(appKey, text) {
    return [
      '<div id="alm-cite-overlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center">',
      '  <div role="dialog" aria-modal="true" aria-labelledby="alm-cite-title" style="background:var(--panel,#fff);color:var(--ink,#15181d);border:1px solid var(--border,#ccc);border-radius:10px;padding:1.2rem 1.4rem;max-width:700px;width:94vw;max-height:84vh;overflow:auto;box-shadow:0 12px 40px rgba(0,0,0,0.3)">',
      '    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem">',
      '      <h2 id="alm-cite-title" style="margin:0;font-size:1.05rem">Cite as — ' + escapeHTML(appKey) + '</h2>',
      '      <button type="button" id="alm-cite-close" aria-label="Close" style="background:transparent;border:none;font-size:1.4rem;cursor:pointer;color:inherit;line-height:1">×</button>',
      '    </div>',
      '    <div style="display:flex;gap:0.4rem;margin-bottom:0.5rem">',
      '      <button type="button" id="alm-cite-copy" style="background:var(--accent,#2c5e8a);color:#fff;border:none;border-radius:4px;padding:0.35rem 0.85rem;font-size:0.85rem;font-weight:600;cursor:pointer">Copy all</button>',
      '      <span id="alm-cite-status" style="font-size:0.83rem;color:var(--muted,#5c6470);align-self:center"></span>',
      '    </div>',
      '    <pre id="alm-cite-text" style="background:var(--input-bg,#f6f4ef);color:inherit;padding:0.7rem 0.9rem;border-radius:6px;font-size:0.78rem;white-space:pre-wrap;word-break:break-word;max-height:60vh;overflow:auto">' + escapeHTML(text) + '</pre>',
      '  </div>',
      '</div>',
    ].join("");
  }
  function escapeHTML(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function showModal(appKey) {
    if (document.getElementById("alm-cite-overlay")) return;
    var text = formatAll(appKey);
    document.body.insertAdjacentHTML("beforeend", _modalHTML(appKey, text));
    var overlay = document.getElementById("alm-cite-overlay");
    document.getElementById("alm-cite-close").addEventListener("click", function () { overlay.remove(); });
    overlay.addEventListener("click", function (e) { if (e.target === overlay) overlay.remove(); });
    document.getElementById("alm-cite-copy").addEventListener("click", function () {
      var t = formatAll(appKey);
      if (navigator.clipboard) {
        navigator.clipboard.writeText(t).then(function () {
          var s = document.getElementById("alm-cite-status");
          if (s) { s.textContent = "Copied to clipboard."; setTimeout(function () { s.textContent = ""; }, 2000); }
        });
      } else {
        var ta = document.createElement("textarea");
        ta.value = t; document.body.appendChild(ta); ta.select();
        try { document.execCommand("copy"); } catch (_) {}
        document.body.removeChild(ta);
      }
    });
  }

  function attach(opts) {
    if (typeof document === "undefined" || !opts || !opts.btn) return false;
    var el = typeof opts.btn === "string" ? document.querySelector(opts.btn) : opts.btn;
    if (!el) return false;
    el.addEventListener("click", function () { showModal(opts.app); });
    return true;
  }

  function attachAuto(opts) {
    if (typeof document === "undefined") return false;
    var el = typeof opts.container === "string" ? document.querySelector(opts.container) : opts.container;
    if (!el) return false;
    el.innerHTML = '<button type="button" id="alm-cite-btn" title="Show suggested citations" style="background:transparent;color:var(--accent,#2c5e8a);border:1px solid var(--accent,#2c5e8a);border-radius:4px;padding:0.3rem 0.7rem;font-size:0.82rem;font-weight:600;cursor:pointer">📑 Cite as</button>';
    return attach({ btn: "#alm-cite-btn", app: opts.app });
  }

  var api = {
    CITATIONS: CITATIONS,
    ALLMETA_CITE: ALLMETA_CITE,
    getCitations: getCitations,
    formatAll: formatAll,
    showModal: showModal,
    attach: attach,
    attachAuto: attachAuto,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmCitation = api;
})(typeof window !== "undefined" ? window : globalThis);
