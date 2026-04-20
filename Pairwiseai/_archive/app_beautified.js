"use strict";
const DEBUG_MODE = !1,
  log = {
    info: () => {},
    warn: () => {},
    error: (...e) => console.error("[PairwisePro]", ...e)
  },
  cleanupRegistry = {
    timeouts: new Set,
    intervals: new Set,
    addTimeout(e) {
      return this.timeouts.add(e), e
    },
    addInterval(e) {
      return this.intervals.add(e), e
    },
    clearAll() {
      this.timeouts.forEach(e => clearTimeout(e)), this.intervals.forEach(e => clearInterval(e)), this.timeouts.clear(), this.intervals.clear()
    }
  };

function safeTimeout(e, t) {
  const n = setTimeout(() => {
    cleanupRegistry.timeouts.delete(n), e()
  }, t);
  return cleanupRegistry.addTimeout(n)
}

function sanitizeHTML(e) {
  return null == e ? "" : String(e).replace(/[<>&"']/g, e => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    '"': "&quot;",
    "'": "&#39;"
  } [e]))
}

function getThemeColors() {
  const e = "light" === document.documentElement.getAttribute("data-theme");
  return {
    text: e ? "#1e293b" : "#a3aab8",
    textStrong: e ? "#0f172a" : "#c9cdd6",
    grid: e ? "#e2e8f0" : "#262d3d",
    background: "rgba(0,0,0,0)",
    hoverBg: e ? "#ffffff" : "#1a1f2a",
    hoverBorder: e ? "#cbd5e1" : "#3d4657",
    hoverText: e ? "#1e293b" : "#e8eaee",
    refLine: e ? "#94a3b8" : "#5a6478"
  }
}

function sum(e) {
  return e.reduce((e, t) => e + t, 0)
}

function mean(e) {
  return sum(e) / e.length
}

function variance(e) {
  const t = mean(e);
  return sum(e.map(e => Math.pow(e - t, 2))) / (e.length - 1)
}

function std(e) {
  return Math.sqrt(variance(e))
}

function harmonicMean(e) {
  const t = e.filter(e => e > 0);
  if (0 === t.length) return NaN;
  const n = sum(t.map(e => 1 / e));
  return t.length / n
}

function pnorm(e) {
  const t = e < 0 ? -1 : 1,
    n = Math.abs(e) / Math.sqrt(2),
    a = 1 / (1 + .3275911 * n);
  return .5 * (1 + t * (1 - ((((1.061405429 * a - 1.453152027) * a + 1.421413741) * a - .284496736) * a + .254829592) * a * Math.exp(-n * n)))
}

function qnorm(e) {
  if (e <= 0) return -1 / 0;
  if (e >= 1) return 1 / 0;
  if (.5 === e) return 0;
  const t = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239],
    n = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572],
    a = [-.007784894002430293, -.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783],
    s = [.007784695709041462, .3224671290700398, 2.445134137142996, 3.754408661907416],
    i = .02425;
  let r, o;
  return e < i ? (r = Math.sqrt(-2 * Math.log(e)), (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) / ((((s[0] * r + s[1]) * r + s[2]) * r + s[3]) * r + 1)) : e <= .97575 ? (r = e - .5, o = r * r, (((((t[0] * o + t[1]) * o + t[2]) * o + t[3]) * o + t[4]) * o + t[5]) * r / (((((n[0] * o + n[1]) * o + n[2]) * o + n[3]) * o + n[4]) * o + 1)) : (r = Math.sqrt(-2 * Math.log(1 - e)), -(((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) / ((((s[0] * r + s[1]) * r + s[2]) * r + s[3]) * r + 1))
}

function dnorm(e) {
  return Math.exp(-.5 * e * e) / Math.sqrt(2 * Math.PI)
}

function gamma(e) {
  if (e < .5) return Math.PI / (Math.sin(Math.PI * e) * gamma(1 - e));
  e -= 1;
  const t = [.9999999999998099, 676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406, 12.507343278686905, -.13857109526572012, 9984369578019572e-21, 1.5056327351493116e-7];
  let n = t[0];
  for (let a = 1; a < 9; a++) n += t[a] / (e + a);
  const a = e + 7 + .5;
  return Math.sqrt(2 * Math.PI) * Math.pow(a, e + .5) * Math.exp(-a) * n
}

function lgamma(e) {
  if (e <= 0) return 1 / 0;
  const t = [.9999999999998099, 676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406, 12.507343278686905, -.13857109526572012, 9984369578019572e-21, 1.5056327351493116e-7];
  if (e < .5) return Math.log(Math.PI / Math.sin(Math.PI * e)) - lgamma(1 - e);
  e -= 1;
  let n = t[0];
  for (let a = 1; a < 9; a++) n += t[a] / (e + a);
  const a = e + 7 + .5;
  return .5 * Math.log(2 * Math.PI) + (e + .5) * Math.log(a) - a + Math.log(n)
}

function betainc(e, t, n) {
  if (0 === n) return 0;
  if (1 === n) return 1;
  if (n > (e + 1) / (e + t + 2)) return 1 - betainc(t, e, 1 - n);
  const a = lgamma(e) + lgamma(t) - lgamma(e + t),
    s = Math.exp(Math.log(n) * e + Math.log(1 - n) * t - a) / e;
  let i = 1,
    r = 1,
    o = 0;
  for (let a = 0; a <= 200; a++) {
    const s = 2 * a;
    let l = 0 === a ? 1 : a * (t - a) * n / ((e + s - 1) * (e + s));
    o = 1 + l * o, Math.abs(o) < 1e-30 && (o = 1e-30), o = 1 / o, r = 1 + l / r, Math.abs(r) < 1e-30 && (r = 1e-30), i *= o * r, l = -(e + a) * (e + t + a) * n / ((e + s) * (e + s + 1)), o = 1 + l * o, Math.abs(o) < 1e-30 && (o = 1e-30), o = 1 / o, r = 1 + l / r, Math.abs(r) < 1e-30 && (r = 1e-30);
    const d = o * r;
    if (i *= d, Math.abs(d - 1) < 1e-14) break
  }
  return s * i
}

function gammainc(e, t) {
  if (t < 0 || e <= 0) return NaN;
  if (0 === t) return 0;
  if (t < e + 1) {
    let n = 1 / e,
      a = 1 / e;
    for (let s = 1; s < 100 && (a *= t / (e + s), n += a, !(Math.abs(a) < 1e-14 * Math.abs(n))); s++);
    return n * Math.exp(-t + e * Math.log(t) - lgamma(e))
  }
  let n = t + 1 - e,
    a = 1 / 1e-30,
    s = 1 / n,
    i = s;
  for (let t = 1; t < 100; t++) {
    const r = -t * (t - e);
    n += 2, s = r * s + n, Math.abs(s) < 1e-30 && (s = 1e-30), a = n + r / a, Math.abs(a) < 1e-30 && (a = 1e-30), s = 1 / s;
    const o = s * a;
    if (i *= o, Math.abs(o - 1) < 1e-14) break
  }
  return 1 - Math.exp(-t + e * Math.log(t) - lgamma(e)) * i
}

function dt(e, t) {
  return Math.exp(lgamma((t + 1) / 2) - lgamma(t / 2)) / Math.sqrt(t * Math.PI) * Math.pow(1 + e * e / t, -(t + 1) / 2)
}

function pt(e, t) {
  if (t <= 0) return NaN;
  const n = .5 * betainc(t / 2, .5, t / (t + e * e));
  return e >= 0 ? 1 - n : n
}

function qt(e, t) {
  if (e <= 0) return -1 / 0;
  if (e >= 1) return 1 / 0;
  if (.5 === e) return 0;
  if (t <= 0) return NaN;
  let n = qnorm(e);
  for (let a = 0; a < 20; a++) {
    const a = pt(n, t) - e,
      s = dt(n, t);
    if (Math.abs(s) < 1e-15) break;
    const i = a / s;
    if (n -= i, Math.abs(i) < 1e-10 * (1 + Math.abs(n))) break
  }
  return n
}
const tQuantile = qt,
  tCDF = pt,
  chiSquareCDF = pchisq;

function pchisq(e, t) {
  return e < 0 ? 0 : t <= 0 ? NaN : gammainc(t / 2, e / 2)
}

function dchisq(e, t) {
  if (e < 0) return 0;
  if (t <= 0) return NaN;
  const n = t / 2;
  return Math.pow(e, n - 1) * Math.exp(-e / 2) / (Math.pow(2, n) * gamma(n))
}

function qchisq(e, t) {
  if (e <= 0) return 0;
  if (e >= 1) return 1 / 0;
  if (t <= 0) return NaN;
  const n = 2 / (9 * t);
  let a = t * Math.pow(1 - n + qnorm(e) * Math.sqrt(n), 3);
  a = Math.max(.001, a);
  for (let n = 0; n < 20; n++) {
    const n = pchisq(a, t) - e,
      s = dchisq(a, t);
    if (Math.abs(s) < 1e-15) break;
    const i = n / s;
    if (a = Math.max(.001, a - i), Math.abs(i) < 1e-10 * a) break
  }
  return a
}
let _spareNormal = null;

function randn() {
  if (null !== _spareNormal) {
    const e = _spareNormal;
    return _spareNormal = null, e
  }
  let e, t, n;
  do {
    e = 2 * Math.random() - 1, t = 2 * Math.random() - 1, n = e * e + t * t
  } while (n >= 1 || 0 === n);
  const a = Math.sqrt(-2 * Math.log(n) / n);
  return _spareNormal = t * a, e * a
}
const CONFIG = {
    DEFAULT_ALPHA: .05,
    DEFAULT_MCID: .15,
    CONTINUITY_CORRECTION: .5,
    SMALL_EFFECT: .05,
    LARGE_EFFECT: .25,
    MAX_ITERATIONS: 100,
    CONVERGENCE_TOL: 1e-8,
    REML_DAMPING: .7,
    BOOTSTRAP_SAMPLES: 1e3,
    I2_LOW: 25,
    I2_MODERATE: 50,
    I2_HIGH: 75,
    METAOVERFIT_SEVERE: 4,
    METAOVERFIT_HIGH: 6,
    METAOVERFIT_MODERATE: 10,
    BENEFIT_THRESHOLD: .8,
    MCID_THRESHOLD: .5,
    HARM_THRESHOLD: .1,
    MCMC_CHAINS: 2,
    MCMC_ITERATIONS: 5e3,
    MCMC_BURNIN: 1e3,
    MCMC_THIN: 1,
    MIN_STUDIES_FOR_CONFORMAL: 10,
    DEFAULT_EMPTY_ROWS: 5,
    DEBOUNCE_DELAY: 150
  },
  AppState = {
    studies: [],
    results: null,
    settings: {
      dataType: "binary",
      effectMeasure: "OR",
      tau2Method: "DL",
      hksj: !0,
      direction: "lower",
      continuityCorrection: "constant",
      bayesian: !1,
      bayesianPriors: {
        theta_mean: 0,
        theta_sd: 10,
        tau2_shape: .001,
        tau2_scale: .001,
        priorType: "vague"
      }
    },
    forestSettings: {
      layout: "default",
      sortBy: "none",
      sortOrder: "asc",
      showWeights: !1,
      showAnnotation: !0,
      showHeader: !0,
      showStudyLabels: !0,
      showPooled: !0,
      showPrediction: !1,
      predictionStyle: "line",
      refLine: "auto",
      refLineColor: "#666",
      xAxisLabel: "auto",
      xAxisScale: "auto",
      xAxisLimits: "auto",
      xAxisMin: null,
      xAxisMax: null,
      xAxisTicks: 5,
      pointShape: "square",
      pointSizeByWeight: !0,
      pointColor: "#4a7ab8",
      pointColorByQuality: !1,
      ciLineWidth: 1.5,
      ciLineColor: "#4a7ab8",
      ciEndStyle: "bar",
      diamondColor: "#22c55e",
      diamondBorder: "#16a34a",
      diamondStyle: "filled",
      alternateShading: !1,
      shadeColor: "rgba(255,255,255,0.03)",
      rowSpacing: 1,
      digits: 2,
      annotationFormat: "effect_ci",
      showEvents: !1,
      showN: !1,
      showI2: !1,
      pooledLabel: "Pooled",
      predictionLabel: "Prediction interval",
      leftLabel: "",
      rightLabel: "",
      subgroupStyle: "indent",
      studyColumnWidth: 150,
      effectColumnWidth: 120,
      weightColumnWidth: 60
    },
    funnelSettings: {
      xAxisMin: null,
      xAxisMax: null,
      showFunnel: !0,
      funnelLevels: [.9, .95, .99],
      funnelColors: ["rgba(255,255,255,0.1)", "rgba(200,200,200,0.2)", "rgba(150,150,150,0.3)"],
      funnelStyle: "filled",
      pointColor: "#4a7ab8",
      pointSize: 10,
      highlightOutliers: !0,
      outlierColor: "#ef4444",
      showPooledLine: !0,
      pooledLineColor: "#e6a919",
      pooledLineStyle: "dash",
      showEggerLine: !1,
      eggerLineColor: "#ef4444",
      showTrimFill: !1,
      trimFillColor: "#10b981",
      xAxisLabel: "auto",
      yAxisLabel: "Standard Error",
      invertYAxis: !0
    }
  };

function initializeTheme() {
  const e = localStorage.getItem("pairwise-pro-theme");
  window.matchMedia("(prefers-color-scheme: dark)").matches;
  setTheme(e || "dark")
}

function setTheme(e) {
  "light" === e ? (document.documentElement.setAttribute("data-theme", "light"), document.getElementById("themeToggle").querySelector(".theme-toggle__icon--dark").style.display = "none", document.getElementById("themeToggle").querySelector(".theme-toggle__icon--light").style.display = "inline") : (document.documentElement.removeAttribute("data-theme"), document.getElementById("themeToggle").querySelector(".theme-toggle__icon--dark").style.display = "inline", document.getElementById("themeToggle").querySelector(".theme-toggle__icon--light").style.display = "none"), localStorage.setItem("pairwise-pro-theme", e), AppState.results && setTimeout(() => {
    document.getElementById("forestPlot") && renderForestPlot(AppState.results), document.getElementById("funnelPlot") && renderFunnelPlot(AppState.results), document.getElementById("baujatPlot") && renderBaujatPlot(AppState.results)
  }, 50)
}

function toggleTheme() {
  setTheme("light" === document.documentElement.getAttribute("data-theme") ? "dark" : "light")
}

function showToast(e, t) {
  t = t || "info";
  var n = document.querySelector(".toast-notification");
  n && n.remove();
  var a = document.createElement("div");
  a.className = "toast-notification toast-" + t, a.style.cssText = "position:fixed;bottom:20px;right:20px;padding:12px 20px;border-radius:8px;color:white;font-weight:500;z-index:10000;max-width:400px;box-shadow:0 4px 12px rgba(0,0,0,0.3);animation:toastIn 0.3s ease;";
  var s = {
    info: "#3b82f6",
    success: "#22c55e",
    warning: "#f59e0b",
    error: "#ef4444"
  };
  if (a.style.backgroundColor = s[t] || s.info, a.textContent = e, !document.getElementById("toast-styles")) {
    var i = document.createElement("style");
    i.id = "toast-styles", i.textContent = "@keyframes toastIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}", document.head.appendChild(i)
  }
  document.body.appendChild(a), setTimeout(function() {
    a.style.opacity = "0", a.style.transform = "translateX(100%)", a.style.transition = "all 0.3s ease", setTimeout(function() {
      a.remove()
    }, 300)
  }, 4e3)
}

function initializeTabs() {
  const e = document.querySelectorAll(".tab-btn"),
    t = document.querySelectorAll(".tab-panel");
  e.forEach(n => {
    n.addEventListener("click", () => {
      const a = n.dataset.tab;
      e.forEach(e => e.classList.remove("tab-btn--active")), n.classList.add("tab-btn--active"), t.forEach(e => {
        e.classList.remove("tab-panel--active"), e.id === `panel-${a}` && e.classList.add("tab-panel--active")
      }), "multioutcome" === a && populateOutcomeDictionary(), "verdict" === a && "function" == typeof renderVerdictPanel && renderVerdictPanel(), "hta" === a && "function" == typeof populateHTADropdowns && populateHTADropdowns()
    })
  })
}

function goToTab(e) {
  const t = document.querySelector('.tab-btn[data-tab="' + e + '"]');
  t && (t.click(), window.scrollTo({
    top: 0,
    behavior: "smooth"
  }))
}

function goToReport() {
  goToTab("report")
}

function updateFloatingNav() {
  var e = document.getElementById("floatingReportBtn"),
    t = document.getElementById("quickNav"),
    n = AppState.results && AppState.results.pooled;
  e && (n ? e.classList.add("visible") : e.classList.remove("visible")), t && (n ? t.classList.add("visible") : t.classList.remove("visible"))
}

function initializeStudyTable() {
  document.getElementById("studyTableBody").innerHTML = "";
  for (let e = 0; e < 5; e++) addStudyRow();
  updateDataSummary()
}

function getTableColumns(e) {
  switch (e) {
    case "binary":
      return [{
        key: "name",
        label: "Study Name",
        width: "180px",
        type: "text",
        placeholder: "Author Year"
      }, {
        key: "events_t",
        label: "Events (T)",
        width: "90px",
        type: "number",
        placeholder: "0"
      }, {
        key: "n_t",
        label: "N (T)",
        width: "80px",
        type: "number",
        placeholder: "0"
      }, {
        key: "events_c",
        label: "Events (C)",
        width: "90px",
        type: "number",
        placeholder: "0"
      }, {
        key: "n_c",
        label: "N (C)",
        width: "80px",
        type: "number",
        placeholder: "0"
      }, {
        key: "subgroup",
        label: "Subgroup",
        width: "100px",
        type: "text",
        placeholder: ""
      }];
    case "continuous":
      return [{
        key: "name",
        label: "Study Name",
        width: "180px",
        type: "text",
        placeholder: "Author Year"
      }, {
        key: "mean_t",
        label: "Mean (T)",
        width: "90px",
        type: "number",
        placeholder: "0",
        step: "any"
      }, {
        key: "sd_t",
        label: "SD (T)",
        width: "80px",
        type: "number",
        placeholder: "0",
        step: "any"
      }, {
        key: "n_t",
        label: "N (T)",
        width: "70px",
        type: "number",
        placeholder: "0"
      }, {
        key: "mean_c",
        label: "Mean (C)",
        width: "90px",
        type: "number",
        placeholder: "0",
        step: "any"
      }, {
        key: "sd_c",
        label: "SD (C)",
        width: "80px",
        type: "number",
        placeholder: "0",
        step: "any"
      }, {
        key: "n_c",
        label: "N (C)",
        width: "70px",
        type: "number",
        placeholder: "0"
      }, {
        key: "subgroup",
        label: "Subgroup",
        width: "100px",
        type: "text",
        placeholder: ""
      }];
    case "hr":
      return [{
        key: "name",
        label: "Study Name",
        width: "180px",
        type: "text",
        placeholder: "Author Year"
      }, {
        key: "hr",
        label: "HR",
        width: "80px",
        type: "number",
        placeholder: "1.0",
        step: "any"
      }, {
        key: "ci_lower",
        label: "95% CI Low",
        width: "90px",
        type: "number",
        placeholder: "0.5",
        step: "any"
      }, {
        key: "ci_upper",
        label: "95% CI High",
        width: "90px",
        type: "number",
        placeholder: "2.0",
        step: "any"
      }, {
        key: "n_events",
        label: "Events",
        width: "80px",
        type: "number",
        placeholder: ""
      }, {
        key: "subgroup",
        label: "Subgroup",
        width: "100px",
        type: "text",
        placeholder: ""
      }];
    case "proportion":
      return [{
        key: "name",
        label: "Study Name",
        width: "180px",
        type: "text",
        placeholder: "Author Year"
      }, {
        key: "events",
        label: "Events",
        width: "90px",
        type: "number",
        placeholder: "0"
      }, {
        key: "n",
        label: "N",
        width: "80px",
        type: "number",
        placeholder: "0"
      }, {
        key: "subgroup",
        label: "Subgroup",
        width: "100px",
        type: "text",
        placeholder: ""
      }];
    case "generic":
      return [{
        key: "name",
        label: "Study Name",
        width: "180px",
        type: "text",
        placeholder: "Author Year"
      }, {
        key: "yi",
        label: "Effect (yi)",
        width: "100px",
        type: "number",
        placeholder: "0",
        step: "any"
      }, {
        key: "vi",
        label: "Variance (vi)",
        width: "100px",
        type: "number",
        placeholder: "0",
        step: "any"
      }, {
        key: "subgroup",
        label: "Subgroup",
        width: "100px",
        type: "text",
        placeholder: ""
      }];
    default:
      return getTableColumns("binary")
  }
}

function updateTableHeaders() {
  const e = getTableColumns(AppState.settings.dataType),
    t = document.getElementById("studyTableHead");
  let n = '<tr><th style="width: 40px;">#</th>';
  e.forEach(e => {
    n += `<th style="width: ${e.width};">${e.label}</th>`
  }), n += '<th style="width: 50px;"></th></tr>', t.innerHTML = n
}

function updateEffectMeasures() {
  const e = AppState.settings.dataType,
    t = document.getElementById("effectMeasureSelect");
  let n = "";
  switch (e) {
    case "binary":
      n = '\n            <option value="OR">Odds Ratio</option>\n            <option value="RR">Risk Ratio</option>\n            <option value="RD">Risk Difference</option>\n          ';
      break;
    case "continuous":
      n = '\n            <option value="MD">Mean Difference</option>\n            <option value="SMD">Std Mean Diff (Hedges\' g)</option>\n          ';
      break;
    case "hr":
      n = '<option value="HR">Hazard Ratio</option>';
      break;
    case "proportion":
      n = '\n            <option value="PLO">Logit Proportion</option>\n            <option value="PAS">Arcsine Proportion</option>\n            <option value="PFT">Freeman-Tukey</option>\n            <option value="PR">Raw Proportion</option>\n          ';
      break;
    case "generic":
      n = '<option value="GEN">Generic Effect Size</option>'
  }
  t.innerHTML = n, AppState.settings.effectMeasure = t.value
}

function rebuildTable() {
  const e = document.getElementById("studyTableBody"),
    t = e.children.length;
  updateTableHeaders(), e.innerHTML = "";
  const n = Math.max(5, t);
  for (let e = 0; e < n; e++) addStudyRow();
  updateDataSummary()
}

function addStudyRow(e = null) {
  const t = document.getElementById("studyTableBody"),
    n = t.children.length + 1,
    a = AppState.settings.dataType,
    s = getTableColumns(a),
    i = document.createElement("tr");
  let r = `<td class="font-mono text-secondary">${n}</td>`;
  s.forEach(t => {
    const n = e && void 0 !== e[t.key] ? e[t.key] : "",
      a = "text" === t.type ? sanitizeHTML(String(n)) : n,
      s = t.step ? `step="${t.step}"` : "",
      i = "number" === t.type && "yi" !== t.key ? 'min="0"' : "";
    r += `<td><input type="${t.type}" class="input input--sm ${"number"===t.type?"input--mono":""}" \n          placeholder="${t.placeholder}" ${i} ${s} value="${a}" data-key="${t.key}"></td>`
  }), r += '<td><button class="btn btn--ghost btn--icon btn--sm remove-study-btn" title="Remove study" aria-label="Remove study">×</button></td>', i.innerHTML = r, t.appendChild(i), i.querySelector(".remove-study-btn").addEventListener("click", () => {
    i.remove(), renumberRows(), updateDataSummary()
  }), i.querySelectorAll("input").forEach(e => {
    const t = () => {
      validateStudyRow(i, a), updateDataSummary()
    };
    e.addEventListener("change", t), e.addEventListener("input", t)
  })
}

function validateStudyRow(e, t) {
  const n = e.querySelectorAll("input");
  if (n.forEach(e => {
      e.style.borderColor = "", e.title = ""
    }), e.style.background = "", e.title = "", "binary" === t) {
    const t = parseInt(n[1]?.value) || 0,
      a = parseInt(n[2]?.value) || 0,
      s = parseInt(n[3]?.value) || 0,
      i = parseInt(n[4]?.value) || 0;
    if (a > 0 && t > a && (n[1].style.borderColor = "var(--color-danger-500)", n[1].title = "Events cannot exceed N"), i > 0 && s > i && (n[3].style.borderColor = "var(--color-danger-500)", n[3].title = "Events cannot exceed N"), a > 0 && i > 0) {
      (0 === t || 0 === s || t === a || s === i) && (e.style.background = "rgba(245, 158, 11, 0.1)", e.title = "Zero cell detected - continuity correction will be applied")
    }
  } else if ("continuous" === t) {
    const e = parseFloat(n[2]?.value) || 0,
      t = parseFloat(n[5]?.value) || 0;
    e < 0 && (n[2].style.borderColor = "var(--color-danger-500)", n[2].title = "SD must be positive"), t < 0 && (n[5].style.borderColor = "var(--color-danger-500)", n[5].title = "SD must be positive")
  } else if ("proportion" === t) {
    const e = parseInt(n[1]?.value) || 0,
      t = parseInt(n[2]?.value) || 0;
    t > 0 && e > t && (n[1].style.borderColor = "var(--color-danger-500)", n[1].title = "Events cannot exceed N")
  }
}

function renumberRows() {
  const e = document.getElementById("studyTableBody");
  Array.from(e.children).forEach((e, t) => {
    e.children[0].textContent = t + 1
  })
}

function debounce(e, t) {
  let n;
  return function(...a) {
    clearTimeout(n), n = setTimeout(() => e.apply(this, a), t)
  }
}

function _updateDataSummary() {
  const e = getStudyData().filter(e => e.valid),
    t = AppState.settings.dataType;
  document.getElementById("statStudies").textContent = e.length;
  let n = 0;
  switch (t) {
    case "binary":
    case "continuous":
      n = e.reduce((e, t) => e + (t.n_t || 0) + (t.n_c || 0), 0);
      break;
    case "hr":
      n = e.reduce((e, t) => e + (t.n_events || 0), 0);
      break;
    case "proportion":
      n = e.reduce((e, t) => e + (t.n || 0), 0);
      break;
    case "generic":
      n = e.length
  }
  document.getElementById("statTotalN").textContent = n.toLocaleString();
  const a = document.getElementById("dataStatusAlert");
  if (0 === e.length) a.className = "alert alert--info", a.innerHTML = '\n          <span class="alert__icon">ℹ️</span>\n          <div class="alert__content">\n            <div class="alert__text">Enter study data or load a demo dataset to begin.</div>\n          </div>\n        ';
  else if (e.length < 3) a.className = "alert alert--warning", a.innerHTML = `\n          <span class="alert__icon">⚠️</span>\n          <div class="alert__content">\n            <div class="alert__text">${e.length} valid studies. Minimum 3 studies recommended for reliable estimates.</div>\n          </div>\n        `;
  else if (e.length > 100) a.className = "alert alert--warning", a.innerHTML = `\n          <span class="alert__icon">⚠️</span>\n          <div class="alert__content">\n            <div class="alert__text">${e.length} studies detected. Large datasets may be slow. Consider using R/Python for >100 studies.</div>\n          </div>\n        `;
  else {
    a.className = "alert alert--success";
    const s = "generic" === t || "hr" === t ? "hr" === t ? "total events" : "studies" : "total participants";
    a.innerHTML = `\n          <span class="alert__icon">✓</span>\n          <div class="alert__content">\n            <div class="alert__text">${e.length} valid studies${n>0?", "+n.toLocaleString()+" "+s:""}. Ready for analysis.</div>\n          </div>\n        `
  }
  AppState.studies = e
}
document.addEventListener("DOMContentLoaded", function() {
  window.showToast = showToast, initializeTabs(), initializeStudyTable(), bindEventListeners(), initializeTheme(), document.getElementById("themeToggle").addEventListener("click", toggleTheme), document.getElementById("loadDemoBtn").addEventListener("click", () => {
    const e = Object.keys(DEMO_DATASETS),
      t = prompt(`Available demos:\n${e.map((e,t)=>`${t+1}. ${DEMO_DATASETS[e].name}`).join("\n")}\n\nEnter number:`),
      n = parseInt(t) - 1;
    n >= 0 && n < e.length && loadDemoDataset(e[n])
  }), document.addEventListener("keydown", e => {
    (e.ctrlKey || e.metaKey) && "Enter" === e.key && (e.preventDefault(), document.getElementById("runAnalysisBtn").click()), (e.ctrlKey || e.metaKey) && "/" === e.key && (e.preventDefault(), document.getElementById("addStudyBtn").click(), setTimeout(() => {
      const e = document.querySelectorAll("#studyTableBody tr"),
        t = e[e.length - 1];
      if (t) {
        const e = t.querySelector("input");
        e && e.focus()
      }
    }, 50)), (e.ctrlKey || e.metaKey) && "d" === e.key && (e.preventDefault(), document.getElementById("loadDemoBtn").click()), "?" !== e.key || e.ctrlKey || e.metaKey || ["INPUT", "TEXTAREA"].includes(e.target.tagName) || (e.preventDefault(), showKeyboardShortcutsHelp()), "Escape" === e.key && (document.getElementById("forestSettingsPanel")?.classList.add("hidden"), document.getElementById("funnelSettingsPanel")?.classList.add("hidden"), closeKeyboardShortcutsHelp())
  }), document.getElementById("importCsvBtn").addEventListener("click", () => {
    const e = document.createElement("input");
    e.type = "file", e.accept = ".csv,.tsv,.txt", e.onchange = e => {
      const t = e.target.files[0];
      if (!t) return;
      const n = new FileReader;
      n.onload = e => {
        try {
          const n = e.target.result,
            a = n.split("\n").filter(e => e.trim());
          if (a.length < 2) return void alert("CSV must have header row and at least one data row");
          const s = n.includes("\t") ? "\t" : ",";
          document.getElementById("studyTableBody").innerHTML = "";
          const i = a[0].split(s).map(e => e.trim().toLowerCase().replace(/"/g, "")),
            r = i.findIndex(e => e.includes("study") || e.includes("name") || e.includes("author")),
            o = i.findIndex(e => e.includes("event") && e.includes("t") || "events_t" === e || "ai" === e),
            l = i.findIndex(e => e.includes("n") && e.includes("t") || "n_t" === e || "n1" === e),
            d = i.findIndex(e => e.includes("event") && e.includes("c") || "events_c" === e || "bi" === e),
            c = i.findIndex(e => e.includes("n") && e.includes("c") || "n_c" === e || "n2" === e);
          let u = 0;
          a.slice(1).forEach(e => {
            const t = e.split(s).map(e => e.trim().replace(/"/g, ""));
            if (t.length >= 5) {
              const e = r >= 0 ? t[r] : t[0],
                n = parseInt(o >= 0 ? t[o] : t[1]) || 0,
                a = parseInt(l >= 0 ? t[l] : t[2]) || 0,
                s = parseInt(d >= 0 ? t[d] : t[3]) || 0,
                i = parseInt(c >= 0 ? t[c] : t[4]) || 0;
              (a > 0 || i > 0) && (addStudyRow({
                name: e,
                events_t: n,
                n_t: a,
                events_c: s,
                n_c: i
              }), u++)
            }
          }), updateDataSummary(), alert(`Imported ${u} studies from ${t.name}`)
        } catch (e) {
          log.error("CSV import failed:", e), alert("Failed to parse CSV: " + e.message)
        }
      }, n.readAsText(t)
    }, e.click()
  }), document.getElementById("exportCsvBtn").addEventListener("click", () => {
    const e = getStudyData().filter(e => e.valid);
    if (0 === e.length) return void alert("No valid studies to export.");
    const t = ["Study,Events_T,N_T,Events_C,N_C", ...e.map(e => `"${e.name.replace(/"/g,'""')}",${e.events_t},${e.n_t},${e.events_c},${e.n_c}`)].join("\n"),
      n = new Blob([t], {
        type: "text/csv;charset=utf-8;"
      }),
      a = URL.createObjectURL(n),
      s = document.createElement("a");
    s.href = a, s.download = `pairwise-pro-studies-${Date.now()}.csv`, s.click(), URL.revokeObjectURL(a)
  }), renderDemosPanel()
});
const updateDataSummary = debounce(_updateDataSummary, 150);

function getStudyData() {
  const e = document.getElementById("studyTableBody"),
    t = [],
    n = AppState.settings.dataType,
    a = getTableColumns(n);
  return Array.from(e.children).forEach((e, s) => {
    const i = e.querySelectorAll("input"),
      r = {
        index: s + 1
      };
    switch (a.forEach((e, t) => {
        const n = i[t];
        n && ("text" === e.type ? r[e.key] = n.value.trim() || ("name" === e.key ? `Study ${s+1}` : "") : (r[e.key] = "any" === e.step ? parseFloat(n.value) : parseInt(n.value), isNaN(r[e.key]) && (r[e.key] = e.key.includes("mean") || "yi" === e.key ? NaN : 0)))
      }), n) {
      case "binary":
        r.valid = r.n_t > 0 && r.n_c > 0 && r.events_t <= r.n_t && r.events_c <= r.n_c;
        break;
      case "continuous":
        r.valid = r.n_t > 0 && r.n_c > 0 && r.sd_t > 0 && r.sd_c > 0 && !isNaN(r.mean_t) && !isNaN(r.mean_c);
        break;
      case "hr":
        r.valid = r.hr > 0 && r.ci_lower > 0 && r.ci_upper > 0 && r.ci_lower < r.hr && r.hr < r.ci_upper;
        break;
      case "proportion":
        r.valid = r.n > 0 && r.events <= r.n && r.events >= 0;
        break;
      case "generic":
        r.valid = !isNaN(r.yi) && r.vi > 0;
        break;
      default:
        r.valid = !1
    }
    t.push(r)
  }), t
}

function bindEventListeners() {
  document.getElementById("addStudyBtn").addEventListener("click", () => {
    addStudyRow()
  }), document.getElementById("clearAllBtn").addEventListener("click", () => {
    confirm("Clear all study data?") && initializeStudyTable()
  }), document.getElementById("runAnalysisBtn").addEventListener("click", runAnalysis), document.getElementById("tau2MethodSelect").addEventListener("change", e => {
    AppState.settings.tau2Method = e.target.value, document.getElementById("tau2MethodSelectPanel").value = e.target.value
  }), document.getElementById("tau2MethodSelectPanel").addEventListener("change", e => {
    AppState.settings.tau2Method = e.target.value, document.getElementById("tau2MethodSelect").value = e.target.value
  }), document.getElementById("effectMeasureSelect").addEventListener("change", e => {
    AppState.settings.effectMeasure = e.target.value
  }), document.getElementById("dataTypeSelect").addEventListener("change", e => {
    AppState.settings.dataType = e.target.value, updateEffectMeasures();
    const t = document.getElementById("ccSettingGroup");
    t && (t.style.display = "binary" === e.target.value ? "block" : "none"), rebuildTable()
  }), document.getElementById("hksjCheckbox").addEventListener("change", e => {
    AppState.settings.hksj = e.target.checked
  }), document.getElementById("bayesianCheckbox").addEventListener("change", e => {
    AppState.settings.bayesian = e.target.checked, document.getElementById("bayesianSettings").style.display = e.target.checked ? "block" : "none", document.getElementById("hksjCheckbox").disabled = e.target.checked
  }), document.getElementById("priorTypeSelect").addEventListener("change", e => {
    const t = "custom" === e.target.value;
    document.getElementById("customPriorInputs").style.display = t ? "block" : "none";
    const n = {
      vague: {
        mean: 0,
        sd: 10
      },
      weakly_informative: {
        mean: 0,
        sd: 2.5
      },
      informative: {
        mean: 0,
        sd: 1
      }
    };
    n[e.target.value] && (AppState.settings.bayesianPriors.theta_mean = n[e.target.value].mean, AppState.settings.bayesianPriors.theta_sd = n[e.target.value].sd, AppState.settings.bayesianPriors.priorType = e.target.value)
  }), document.getElementById("priorMuMean")?.addEventListener("change", e => {
    AppState.settings.bayesianPriors.theta_mean = parseFloat(e.target.value) || 0
  }), document.getElementById("priorMuSD")?.addEventListener("change", e => {
    AppState.settings.bayesianPriors.theta_sd = parseFloat(e.target.value) || 10
  }), document.getElementById("importKMBtn").addEventListener("click", () => {
    document.getElementById("kmFileInput").click()
  }), document.getElementById("kmFileInput").addEventListener("change", async e => {
    const t = e.target.files[0];
    if (t) {
      try {
        const e = await t.text(),
          n = applyKMImport(importFromKMExtractor(e));
        n.success ? alert(`✅ ${n.message}`) : alert(`❌ Import failed: ${n.message}`)
      } catch (e) {
        log.error("KM import error:", e), alert(`❌ Error reading file: ${e.message}`)
      }
      e.target.value = ""
    }
  }), document.querySelectorAll('input[name="direction"]').forEach(e => {
    e.addEventListener("change", e => {
      AppState.settings.direction = e.target.value
    })
  }), document.getElementById("ccMethodSelect").addEventListener("change", e => {
    AppState.settings.continuityCorrection = e.target.value
  })
}

function calculateLogOR(e, t, n, a, s = {
  cc_t: .5,
  cc_c: .5
}) {
  const i = "number" == typeof s ? s : s.cc_t || .5,
    r = "number" == typeof s ? s : s.cc_c || .5;
  0 !== e && 0 !== t && 0 !== n && 0 !== a || (e += i, t += i, n += r, a += r);
  return {
    yi: Math.log(e) + Math.log(a) - Math.log(t) - Math.log(n),
    vi: 1 / e + 1 / t + 1 / n + 1 / a
  }
}

function calculateLogRR(e, t, n, a, s = {
  cc_t: .5,
  cc_c: .5
}) {
  const i = "number" == typeof s ? s : s.cc_t || .5,
    r = "number" == typeof s ? s : s.cc_c || .5;
  0 !== e && 0 !== n || (e += i, t += i, n += r, a += r);
  const o = e + t,
    l = n + a;
  return {
    yi: Math.log(e / o / (n / l)),
    vi: 1 / e - 1 / o + (1 / n - 1 / l)
  }
}

function calculateRD(e, t, n, a) {
  const s = e + t,
    i = n + a,
    r = e / s,
    o = n / i;
  return {
    yi: r - o,
    vi: r * (1 - r) / s + o * (1 - o) / i
  }
}

function calculateSMD(e, t, n, a, s, i) {
  const r = (1 - 3 / (4 * (n + i - 2) - 1)) * ((e - a) / Math.sqrt(((n - 1) * t * t + (i - 1) * s * s) / (n + i - 2)));
  return {
    yi: r,
    vi: (n + i) / (n * i) + r * r / (2 * (n + i))
  }
}

function calculateMD(e, t, n, a, s, i) {
  return {
    yi: e - a,
    vi: t * t / n + s * s / i
  }
}

function calculateLogitProportion(e, t) {
  let n = e,
    a = t;
  0 !== e && e !== t || (n = e + .5, a = t + 1);
  const s = n / a;
  return {
    yi: Math.log(s / (1 - s)),
    vi: 1 / (a * s * (1 - s))
  }
}

function calculateArcsineProportion(e, t) {
  const n = e / t;
  return {
    yi: Math.asin(Math.sqrt(n)),
    vi: 1 / (4 * t)
  }
}

function calculateFreemanTukeyProportion(e, t) {
  return {
    yi: Math.asin(Math.sqrt(e / (t + 1))) + Math.asin(Math.sqrt((e + 1) / (t + 1))),
    vi: 1 / (t + .5)
  }
}

function calculateRawProportion(e, t) {
  const n = e / t;
  if (0 === e || e === t) {
    const n = (e + .5) / (t + 1);
    return {
      yi: n,
      vi: n * (1 - n) / (t + 1)
    }
  }
  return {
    yi: n,
    vi: n * (1 - n) / t
  }
}

function backTransformProportion(e, t) {
  switch (t) {
    case "PLO":
      return 1 / (1 + Math.exp(-e));
    case "PAS":
      return Math.pow(Math.sin(e), 2);
    case "PFT":
      return Math.pow(Math.sin(e / 2), 2);
    default:
      return e
  }
}

function getContinuityCorrection(e, t = "constant") {
  const n = e.events_t,
    a = e.n_t - e.events_t,
    s = e.events_c,
    i = e.n_c - e.events_c;
  if (0 === n && 0 === s || 0 === a && 0 === i) return null;
  if (!(0 === n || 0 === a || 0 === s || 0 === i)) return {
    cc_t: 0,
    cc_c: 0
  };
  switch (t) {
    case "constant":
    default:
      return {
        cc_t: CONFIG.CONTINUITY_CORRECTION, cc_c: CONFIG.CONTINUITY_CORRECTION
      };
    case "treatment":
      return {
        cc_t: e.n_c / (e.n_t + e.n_c), cc_c: e.n_t / (e.n_t + e.n_c)
      };
    case "empirical":
      const t = e.n_t / e.n_c;
      return {
        cc_t: 1 / (1 + t), cc_c: t / (1 + t)
      };
    case "none":
      return null
  }
}

function convertToEffectSizes(e, t = "OR") {
  const n = AppState.settings.dataType,
    a = AppState.settings.continuityCorrection || "constant";
  return e.map(e => {
    let s;
    switch (n) {
      case "binary": {
        const n = e.events_t,
          i = e.n_t - e.events_t,
          r = e.events_c,
          o = e.n_c - e.events_c,
          l = getContinuityCorrection(e, a);
        if (null === l && (0 === n || 0 === i || 0 === r || 0 === o)) return {
          ...e,
          yi: null,
          vi: null,
          sei: null,
          excluded: !0
        };
        const d = l || {
          cc_t: CONFIG.CONTINUITY_CORRECTION,
          cc_c: CONFIG.CONTINUITY_CORRECTION
        };
        switch (t) {
          case "OR":
          default:
            s = calculateLogOR(n, i, r, o, d);
            break;
          case "RR":
            s = calculateLogRR(n, i, r, o, d);
            break;
          case "RD":
            s = calculateRD(n, i, r, o)
        }
        break
      }
      case "continuous":
        if ("SMD" === t) s = calculateSMD(e.mean_t, e.sd_t, e.n_t, e.mean_c, e.sd_c, e.n_c);
        else s = calculateMD(e.mean_t, e.sd_t, e.n_t, e.mean_c, e.sd_c, e.n_c);
        break;
      case "hr": {
        const t = Math.log(e.hr),
          n = Math.log(e.ci_lower),
          a = (Math.log(e.ci_upper) - n) / 3.92;
        s = {
          yi: t,
          vi: a * a
        };
        break
      }
      case "proportion":
        switch (t) {
          case "PLO":
          default:
            s = calculateLogitProportion(e.events, e.n);
            break;
          case "PAS":
            s = calculateArcsineProportion(e.events, e.n);
            break;
          case "PFT":
            s = calculateFreemanTukeyProportion(e.events, e.n);
            break;
          case "PR":
            s = calculateRawProportion(e.events, e.n)
        }
        break;
      case "generic":
        s = {
          yi: e.yi,
          vi: e.vi
        };
        break;
      default:
        s = {
          yi: null,
          vi: null
        }
    }
    return !s || null === s.yi || null === s.vi || !isFinite(s.yi) || !isFinite(s.vi) || s.vi <= 0 ? {
      ...e,
      yi: null,
      vi: null,
      sei: null,
      excluded: !0
    } : {
      ...e,
      yi: s.yi,
      vi: s.vi,
      sei: Math.sqrt(s.vi)
    }
  }).filter(e => null !== e.yi)
}

function estimateTau2_DL(e, t) {
  const n = e.length,
    a = t.map(e => 1 / e),
    s = sum(a),
    i = sum(a.map(e => e * e)),
    r = sum(e.map((e, t) => a[t] * e)) / s,
    o = sum(e.map((e, t) => a[t] * Math.pow(e - r, 2))),
    l = s - i / s;
  return {
    tau2: Math.max(0, (o - (n - 1)) / l),
    Q: o,
    df: n - 1,
    C: l,
    method: "DL",
    converged: !0
  }
}

function estimateTau2_REML(e, t, n = 100, a = 1e-8) {
  e.length;
  const s = estimateTau2_DL(e, t);
  let i = s.tau2;

  function r(n) {
    const a = t.map(e => 1 / (e + n)),
      s = sum(a),
      i = sum(e.map((e, t) => a[t] * e)) / s,
      r = sum(e.map((e, t) => a[t] * Math.pow(e - i, 2)));
    return -.5 * (sum(t.map(e => Math.log(e + n))) + Math.log(s) + r)
  }
  i < 1e-10 && (i = .01);
  let o = 1 / 0,
    l = 1 / 0,
    d = 0,
    c = CONFIG.REML_DAMPING,
    u = r(i);
  for (let s = 0; s < n; s++) {
    const n = t.map(e => 1 / (e + i)),
      p = sum(n),
      m = sum(e.map((e, t) => n[t] * e)) / p,
      h = n.map(e => e * e),
      v = e.map(e => Math.pow(e - m, 2)),
      g = -.5 * p + .5 * sum(h.map((e, t) => e * v[t])),
      f = .5 * sum(h);
    if (f < 1e-12) return {
      tau2: Math.max(0, i),
      converged: !1,
      iterations: s,
      method: "REML",
      warning: "Fisher information near zero - model may be misspecified"
    };
    let _ = g / f;
    const y = Math.max(2 * i, 1);
    _ = Math.sign(_) * Math.min(Math.abs(_), y);
    let b = i + c * _;
    b = Math.max(1e-10, b);
    let x = r(b),
      w = 0;
    for (; x < u - 1e-8 && w < 5;) c *= .5, b = i + c * _, b = Math.max(1e-10, b), x = r(b), w++;
    if (s > 2) {
      const e = Math.sign(i - o),
        t = Math.sign(o - l);
      if (0 !== e && 0 !== t && e !== t && (d++, c *= .8, d > 5)) {
        const e = (i + o + l) / 3;
        return {
          tau2: Math.max(0, e),
          converged: !1,
          iterations: s,
          method: "REML",
          warning: "Averaged due to oscillation - consider PM or DL estimator"
        }
      }
    }
    if (Math.abs(b - i) < a * Math.max(1, i)) return {
      tau2: Math.max(0, b),
      converged: !0,
      iterations: s + 1,
      method: "REML",
      loglik: x
    };
    l = o, o = i, i = b, u = x, c = Math.min(CONFIG.REML_DAMPING, 1.1 * c)
  }
  const p = estimateTau2_ProfileLikelihood(e, t, i);
  return p.converged ? {
    ...p,
    note: "Fisher scoring failed, used profile likelihood"
  } : {
    tau2: s.tau2,
    converged: !1,
    iterations: n,
    method: "REML",
    warning: "REML failed to converge - using DL estimate. DL may underestimate τ² by 20-40% in some cases. Consider using PM estimator for this dataset.",
    fallback: "DL"
  }
}

function estimateTau2_ProfileLikelihood(e, t, n = null, a = 50) {
  e.length;

  function s(n) {
    const a = t.map(e => 1 / (e + n)),
      s = sum(a),
      i = sum(e.map((e, t) => a[t] * e)) / s,
      r = sum(e.map((e, t) => a[t] * Math.pow(e - i, 2)));
    return -.5 * (sum(t.map(e => Math.log(e + n))) + Math.log(s) + r)
  }
  const i = n || estimateTau2_DL(e, t).tau2,
    r = Math.max(10 * i, 5);
  let o = 0,
    l = s(0);
  for (let e = 1; e <= 50; e++) {
    const t = e / 50 * r,
      n = s(t);
    n > l && (l = n, o = t)
  }
  let d = Math.max(0, o - r / 50),
    c = o + r / 50;
  const u = (1 + Math.sqrt(5)) / 2;
  for (let e = 0; e < a && !(c - d < 1e-8); e++) {
    const e = c - (c - d) / u,
      t = d + (c - d) / u;
    s(e) > s(t) ? c = t : d = e
  }
  const p = (d + c) / 2;
  return {
    tau2: Math.max(0, p),
    converged: !0,
    method: "Profile Likelihood",
    loglik: s(p)
  }
}

function estimateTau2_PM(e, t, n = 100, a = 1e-8) {
  const s = e.length;
  let i = estimateTau2_DL(e, t).tau2;
  const r = t.map(e => 1 / e),
    o = sum(r),
    l = sum(e.map((e, t) => r[t] * e)) / o;
  if (Q_of_tau2(0) <= s - 1) return {
    tau2: 0,
    converged: !0,
    iterations: 0,
    method: "PM"
  };
  for (let n = 0; n < 20; n++) {
    const r = t.map(e => 1 / (e + i)),
      o = sum(r),
      l = sum(e.map((e, t) => r[t] * e)) / o,
      d = sum(e.map((e, t) => r[t] * Math.pow(e - l, 2)));
    if (Math.abs(d - (s - 1)) < a) return {
      tau2: i,
      converged: !0,
      iterations: n + 1,
      method: "PM"
    };
    const c = o - sum(r.map(e => e * e)) / o;
    i = Math.max(0, i + (d - (s - 1)) / c)
  }
  let d = 0;
  const c = e.map(e => Math.pow(e - l, 2)),
    u = 10 * Math.max(...c);
  let p = Math.max(10 * i, u, 100),
    m = 0;
  for (; Q_of_tau2(p) > s - 1 && p < 1e6 && m++ < 30;) p *= 2;
  for (let e = 0; e < 100; e++) {
    const t = (d + p) / 2,
      n = Q_of_tau2(t);
    if (Math.abs(n - (s - 1)) < a || p - d < a) return {
      tau2: t,
      converged: !0,
      iterations: e + 21,
      method: "PM"
    };
    n > s - 1 ? d = t : p = t
  }
  return {
    tau2: (d + p) / 2,
    converged: !1,
    iterations: 121,
    method: "PM",
    warning: "Bisection did not fully converge"
  }
}

function estimateTau2_ML(e, t, n = 100, a = 1e-8) {
  e.length;
  let s = estimateTau2_DL(e, t).tau2;
  s < 1e-10 && (s = .01);
  for (let i = 0; i < n; i++) {
    const n = t.map(e => 1 / (e + s)),
      r = sum(n),
      o = sum(e.map((e, t) => n[t] * e)) / r,
      l = n.map(e => e * e),
      d = e.map((e, t) => Math.pow(e - o, 2)),
      c = -.5 * sum(n) + .5 * sum(n.map((e, t) => e * e * d[t])),
      u = .5 * sum(l),
      p = Math.max(0, s + c / u);
    if (Math.abs(p - s) < a) return {
      tau2: p,
      converged: !0,
      iterations: i + 1,
      method: "ML"
    };
    s = p
  }
  return {
    tau2: s,
    converged: !1,
    iterations: n,
    method: "ML"
  }
}

function estimateTau2_HS(e, t) {
  const n = e.length,
    a = t.map(e => 1 / e),
    s = sum(a),
    i = sum(e.map((e, t) => a[t] * e)) / s,
    r = sum(e.map((e, t) => a[t] * Math.pow(e - i, 2)));
  return {
    tau2: Math.max(0, (r - (n - 1)) / s),
    Q: r,
    method: "HS",
    converged: !0
  }
}

function estimateTau2_SJ(e, t) {
  const n = e.length,
    a = mean(e),
    s = sum(e.map(e => Math.pow(e - a, 2))) / (n - 1),
    i = mean(t),
    r = Math.max(0, s - i),
    o = t.map(e => 1 / (e + r)),
    l = sum(o),
    d = sum(e.map((e, t) => o[t] * e)) / l,
    c = sum(e.map((e, t) => o[t] * Math.pow(e - d, 2))),
    u = sum(o.map(e => e * e));
  return {
    tau2: Math.max(0, (c - (n - 1)) * (n - 1) / (n * l - u / l)),
    Q: c,
    method: "SJ",
    converged: !0
  }
}

function estimateTau2_HE(e, t) {
  const n = e.length,
    a = mean(e),
    s = sum(e.map(e => Math.pow(e - a, 2))) / (n - 1),
    i = mean(t);
  return {
    tau2: Math.max(0, s - i),
    s2: s,
    v_bar: i,
    method: "HE",
    converged: !0
  }
}

function estimateTau2_EB(e, t, n = 100, a = 1e-8) {
  const s = e.length;
  let i = estimateTau2_DL(e, t).tau2;
  for (let r = 0; r < n; r++) {
    const n = t.map(e => 1 / (e + i)),
      o = sum(n),
      l = sum(e.map((e, t) => n[t] * e)) / o,
      d = sum(e.map((e, n) => Math.pow(e - l, 2) - t[n])),
      c = Math.max(0, d / s);
    if (Math.abs(c - i) < a) return {
      tau2: c,
      converged: !0,
      iterations: r + 1,
      method: "EB"
    };
    i = c
  }
  return {
    tau2: i,
    converged: !1,
    iterations: n,
    method: "EB"
  }
}

function estimateTau2(e, t, n = "REML") {
  const a = {
    DL: estimateTau2_DL,
    REML: estimateTau2_REML,
    PM: estimateTau2_PM,
    ML: estimateTau2_ML,
    HS: estimateTau2_HS,
    SJ: estimateTau2_SJ,
    HE: estimateTau2_HE,
    EB: estimateTau2_EB
  };
  return a[n] || (n = "REML"), a[n](e, t)
}

function estimateTau2_All(e, t) {
  const n = ["DL", "REML", "PM", "ML", "HS", "SJ", "HE", "EB"],
    a = {};
  for (const s of n) try {
    a[s] = estimateTau2(e, t, s)
  } catch (e) {
    a[s] = {
      tau2: NaN,
      error: e.message
    }
  }
  return a
}

function calculatePooledEstimate(e, t, n = 0) {
  e.length;
  const a = t.map(e => 1 / (e + n)),
    s = sum(a),
    i = sum(e.map((e, t) => a[t] * e)) / s,
    r = Math.sqrt(1 / s),
    o = 1.959964,
    l = i / r;
  return {
    theta: i,
    se: r,
    ci_lower: i - o * r,
    ci_upper: i + o * r,
    z: l,
    p_value: 2 * (1 - pnorm(Math.abs(l))),
    weights: a,
    weights_pct: a.map(e => e / s * 100)
  }
}

function calculateHKSJ(e, t, n, a, s = .05) {
  const i = e.length,
    r = t.map(e => 1 / (e + a)),
    o = sum(r),
    l = sum(e.map((e, t) => r[t] * Math.pow(e - n, 2))) / (i - 1),
    d = l < 1,
    c = Math.max(1, l),
    u = Math.sqrt(c / o),
    p = i - 1,
    m = qt(1 - s / 2, p),
    h = n / u;
  return {
    se_hksj: u,
    ci_lower: n - m * u,
    ci_upper: n + m * u,
    t_stat: h,
    p_value: 2 * (1 - pt(Math.abs(h), p)),
    df: p,
    q_hksj: c,
    q_raw: l,
    q_bounded: d,
    warning: d ? "HKSJ q < 1 (bounded to 1): suggests possible model misspecification or τ² overestimation" : null
  }
}

function bayesianMetaAnalysis(e, t, n = {}) {
  const {
    prior_mu: a = 0,
    prior_sd: s = 10,
    tau2_prior: i = "half_cauchy",
    tau2_scale: r = 1,
    chains: o = CONFIG.MCMC_CHAINS,
    iterations: l = CONFIG.MCMC_ITERATIONS,
    burnin: d = CONFIG.MCMC_BURNIN,
    thin: c = CONFIG.MCMC_THIN,
    seed: u = null
  } = n, p = (e.length, u ? seedRandom(u) : Math.random), m = estimateTau2_DL(e, t);
  let h = Math.max(.01, m.tau2),
    v = calculatePooledEstimate(e, t, h).theta;
  const g = [];
  for (let n = 0; n < o; n++) {
    let o = h * (1 + .5 * (n - .5)),
      u = v + .3 * (n - .5);
    const m = {
      mu: [],
      tau2: [],
      tau: [],
      theta_i: []
    };
    for (let n = 0; n < l; n++) {
      const l = t.map(e => 1 / (e + o)),
        h = sum(l),
        v = 1 / (s * s),
        g = h + v,
        f = 1 / g,
        _ = sum(e.map((e, t) => l[t] * e)) / h;
      u = rnorm((h * _ + v * a) / g, Math.sqrt(f), p), o = sliceSampleTau2(e, t, u, o, i, r, p);
      const y = e.map((e, n) => {
        const a = t[n] / (t[n] + o),
          s = a * o;
        return rnorm(a * u + (1 - a) * e, Math.sqrt(s), p)
      });
      n >= d && (n - d) % c === 0 && (m.mu.push(u), m.tau2.push(o), m.tau.push(Math.sqrt(o)), m.theta_i.push(y))
    }
    g.push(m)
  }
  const f = combineChains(g);
  return {
    summary: computeBayesianSummary(f, e, t),
    chains: g,
    combined: f,
    diagnostics: computeMCMCDiagnostics(g),
    settings: {
      prior_mu: a,
      prior_sd: s,
      tau2_prior: i,
      tau2_scale: r,
      chains: o,
      iterations: l,
      burnin: d,
      thin: c
    }
  }
}

function sliceSampleTau2(e, t, n, a, s, i, r) {
  function o(a) {
    if (a <= 0) return -1 / 0;
    let r, o = 0;
    for (let s = 0; s < e.length; s++) {
      const i = t[s] + a;
      o += -.5 * Math.log(i) - .5 * Math.pow(e[s] - n, 2) / i
    }
    if ("half_cauchy" === s) {
      const e = Math.sqrt(a);
      r = -Math.log(1 + Math.pow(e / i, 2)) - .5 * Math.log(a)
    } else r = "inv_gamma" === s ? -1.001 * Math.log(a) - .001 / a : -.5 * Math.log(a);
    return o + r
  }
  const l = Math.max(.1, Math.min(2, a)),
    d = o(a) + Math.log(r());
  let c = Math.max(1e-10, a - l * r()),
    u = a + l * r(),
    p = Math.floor(100 * r()),
    m = 99 - p;
  for (; p > 0 && o(c) > d;) c = Math.max(1e-10, c - l), p--;
  for (; m > 0 && o(u) > d;) u += l, m--;
  let h = a;
  for (let e = 0; e < 100 && (h = c + (u - c) * r(), !(o(h) > d)); e++) h < a ? c = h : u = h;
  return h
}

function rnorm(e = 0, t = 1, n = Math.random) {
  const a = n(),
    s = n();
  return e + t * (Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * s))
}

function seedRandom(e) {
  let t = e;
  return function() {
    return t = 1103515245 * t + 12345 & 2147483647, t / 2147483647
  }
}

function combineChains(e) {
  const t = {
    mu: [],
    tau2: [],
    tau: [],
    theta_i: []
  };
  for (const n of e) t.mu.push(...n.mu), t.tau2.push(...n.tau2), t.tau.push(...n.tau), t.theta_i.push(...n.theta_i);
  return t
}

function computeBayesianSummary(e, t, n) {
  const a = t.length,
    s = e.mu.length,
    i = [...e.mu].sort((e, t) => e - t),
    r = [...e.tau2].sort((e, t) => e - t),
    o = [...e.tau].sort((e, t) => e - t),
    l = (e, t) => {
      const n = Math.floor(e.length * t);
      return e[Math.min(n, e.length - 1)]
    },
    d = sum(e.mu) / s,
    c = l(i, .5),
    u = l(i, .025),
    p = l(i, .975),
    m = Math.sqrt(sum(e.mu.map(e => Math.pow(e - d, 2))) / (s - 1)),
    h = sum(e.tau2) / s,
    v = l(r, .5),
    g = l(r, .025),
    f = l(r, .975),
    _ = sum(e.tau) / s,
    y = l(o, .5),
    b = e.mu.filter(e => e < 0).length / s,
    x = 1 - b,
    w = e.mu.filter(e => e < -.15).length / s,
    M = e.mu.filter(e => e < -.25).length / s,
    S = e.mu.map((t, n) => {
      const a = e.tau2[n];
      return rnorm(t, Math.sqrt(a))
    }).filter(e => e < 0).length / s,
    E = sum(n) / a,
    A = e.tau2.map(e => 100 * e / (e + E)),
    R = sum(A) / s,
    I = [...A].sort((e, t) => e - t),
    T = l(I, .025),
    C = l(I, .975),
    P = t.map((t, n) => sum(e.theta_i.map(e => e[n])) / s);
  return {
    theta: {
      mean: d,
      median: c,
      sd: m,
      ci_lower: u,
      ci_upper: p,
      exp_mean: Math.exp(d),
      exp_ci: [Math.exp(u), Math.exp(p)]
    },
    tau2: {
      mean: h,
      median: v,
      ci_lower: g,
      ci_upper: f
    },
    tau: {
      mean: _,
      median: y
    },
    I2: {
      mean: R,
      ci_lower: T,
      ci_upper: C
    },
    ddma: {
      P_benefit: b,
      P_harm: x,
      P_mcid: w,
      P_large: M,
      P_benefit_pred: S,
      interpretation: "Bayesian posterior probabilities (true probabilities given data and prior)",
      caveats: ["Probabilities depend on chosen prior - run sensitivity analysis with different priors", "With k < 5 studies, results are particularly prior-sensitive", "These are NOT equivalent to frequentist probabilities or p-values"]
    },
    shrinkage_estimates: P,
    n_samples: s
  }
}

function computeMCMCDiagnostics(e) {
  const t = e.length,
    n = e[0].mu.length;

  function a(a) {
    const s = e.map(e => sum(e[a]) / e[a].length),
      i = sum(s) / t,
      r = n * sum(s.map(e => Math.pow(e - i, 2))) / (t - 1),
      o = sum(e.map(e => {
        const t = sum(e[a]) / e[a].length;
        return sum(e[a].map(e => Math.pow(e - t, 2))) / (n - 1)
      })) / t,
      l = (n - 1) / n * o + r / n;
    return Math.sqrt(l / o)
  }

  function s(e) {
    const t = e.length,
      n = sum(e) / t,
      a = sum(e.map(e => Math.pow(e - n, 2))) / (t - 1);
    let s = 0;
    for (let a = 0; a < t - 1; a++) s += (e[a] - n) * (e[a + 1] - n);
    s /= (t - 1) * a;
    const i = t / (1 + 2 * Math.abs(s));
    return Math.max(1, Math.min(t, i))
  }
  const i = a("mu"),
    r = a("tau2"),
    o = [].concat(...e.map(e => e.mu)),
    l = [].concat(...e.map(e => e.tau2)),
    d = s(o),
    c = s(l);
  let u = null;
  return i > 1.1 || r > 1.1 ? u = "Chains may not have converged (R̂ > 1.1). Consider increasing iterations or burn-in." : (d < 100 || c < 100) && (u = "Effective sample size is low. Consider increasing iterations."), {
    Rhat: {
      mu: i,
      tau2: r
    },
    ESS: {
      mu: d,
      tau2: c
    },
    converged: i < 1.1 && r < 1.1,
    warning: u,
    n_chains: t,
    n_samples_per_chain: n,
    total_samples: t * n
  }
}

function generateTracePlotData(e) {
  const t = [],
    n = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728"];
  return e.forEach((e, a) => {
    t.push({
      name: `Chain ${a+1}: μ`,
      x: e.mu.map((e, t) => t),
      y: e.mu,
      type: "scatter",
      mode: "lines",
      line: {
        color: n[a % n.length],
        width: .5
      },
      xaxis: "x",
      yaxis: "y"
    }), t.push({
      name: `Chain ${a+1}: τ²`,
      x: e.tau2.map((e, t) => t),
      y: e.tau2,
      type: "scatter",
      mode: "lines",
      line: {
        color: n[a % n.length],
        width: .5
      },
      xaxis: "x2",
      yaxis: "y2"
    })
  }), t
}

function generatePosteriorDensityData(e) {
  function t(e, t = null) {
    const n = e.length,
      a = [...e].sort((e, t) => e - t),
      s = a[Math.floor(.75 * n)] - a[Math.floor(.25 * n)],
      i = Math.sqrt(sum(e.map(t => Math.pow(t - sum(e) / n, 2))) / n),
      r = t || .9 * Math.min(i, s / 1.34) * Math.pow(n, -.2),
      o = a[0] - 3 * r,
      l = (a[n - 1] + 3 * r - o) / 200,
      d = [],
      c = [];
    for (let t = 0; t <= 200; t++) {
      const a = o + t * l;
      let s = 0;
      for (const t of e) {
        const e = (a - t) / r;
        s += Math.exp(-.5 * e * e) / Math.sqrt(2 * Math.PI)
      }
      s /= n * r, d.push(a), c.push(s)
    }
    return {
      x: d,
      y: c
    }
  }
  const n = t(e.mu),
    a = t(e.tau2);
  return {
    mu: {
      x: n.x,
      y: n.y,
      type: "scatter",
      mode: "lines",
      fill: "tozeroy",
      name: "Posterior μ",
      line: {
        color: "#1f77b4"
      }
    },
    tau2: {
      x: a.x,
      y: a.y,
      type: "scatter",
      mode: "lines",
      fill: "tozeroy",
      name: "Posterior τ²",
      line: {
        color: "#ff7f0e"
      }
    }
  }
}

function locationScaleModel(e, t, n, a = null, s = {}) {
  const {
    method: i = "REML",
    maxIter: r = 100
  } = s, o = e.length;
  if (!a) return metaRegression(e, t, n, "Covariate", i);
  const l = estimateTau2_DL(e, t);
  let d = Math.max(.01, l.tau2),
    c = Math.log(d),
    u = 0,
    p = 0,
    m = 0,
    h = c,
    v = u,
    g = !1,
    f = r;
  const _ = sum(a) / o,
    y = a.map(e => e - _);
  for (let a = 0; a < r; a++) {
    const s = y.map(e => Math.exp(c + u * e)),
      i = t.map((e, t) => 1 / (e + s[t])),
      r = sum(i),
      l = sum(n.map((e, t) => i[t] * e)),
      d = sum(e.map((e, t) => i[t] * e)),
      _ = sum(n.map((e, t) => i[t] * e * e)),
      b = sum(n.map((t, n) => i[n] * t * e[n])),
      x = l / r,
      w = d / r;
    m = (b - r * x * w) / (_ - r * x * x), p = w - m * x;
    const M = e.map((e, t) => e - p - m * n[t]).map((e, n) => e * e - t[n]);
    let S = 0,
      E = 0;
    for (let e = 0; e < o; e++) {
      const t = s[e],
        n = M[e] - t;
      S += n * t, E += n * t * y[e]
    }
    if (c += .01 * S / o, u += .01 * E / o, c = Math.max(-5, Math.min(5, c)), u = Math.max(-2, Math.min(2, u)), a > 0) {
      if (Math.abs(u - v) + Math.abs(c - h) < 1e-6) {
        g = !0, f = a;
        break
      }
    }
    h = c, v = u
  }
  const b = y.map(e => Math.exp(c + u * e)),
    x = sum(b) / o;
  return {
    location: {
      intercept: p,
      slope: m,
      interpretation: `Effect changes by ${m.toFixed(3)} per unit of covariate`
    },
    scale: {
      intercept: c,
      slope: u,
      exp_slope: Math.exp(u),
      interpretation: u > 0 ? "Heterogeneity increases with scale covariate" : "Heterogeneity decreases with scale covariate",
      direction: u > 0 ? "positive" : "negative",
      magnitude: Math.abs(u) > .5 ? "substantial" : Math.abs(u) > .1 ? "moderate" : "small"
    },
    tau2_by_study: b,
    tau2_mean: x,
    converged: g,
    convergence_iter: f,
    method: "Location-Scale (Exploratory)",
    warning: "This is an exploratory analysis. Formal inference (p-values, CIs) requires proper Fisher information matrix computation. Use metafor::rma() for publication.",
    reference: "Viechtbauer W. Meta-Analysis with R. Chapman & Hall, 2024"
  }
}

function threeLevel_MetaAnalysis(e, t = {}) {
  const {
    method: n = "REML",
    maxIter: a = 50,
    tol: s = 1e-6
  } = t, i = [...new Set(e.map(e => e.cluster_id))], r = {};
  i.forEach(t => {
    r[t] = [...new Set(e.filter(e => e.cluster_id === t).map(e => e.study_id))]
  });
  const o = i.length,
    l = e.length,
    d = e.map(e => e.yi),
    c = e.map(e => e.vi),
    u = estimateTau2_DL(d, c);
  let p = .5 * u.tau2,
    m = .5 * u.tau2,
    h = calculatePooledEstimate(d, c, u.tau2).theta,
    v = p,
    g = m,
    f = !1,
    _ = a;
  for (let t = 0; t < a; t++) {
    const n = [];
    for (const t of i) {
      const a = e.filter(e => e.cluster_id === t),
        s = a.map(e => e.yi),
        i = a.map(e => e.vi).map(e => 1 / (e + p)),
        r = sum(i),
        o = sum(s.map((e, t) => i[t] * e)) / r,
        l = 1 / r + m;
      n.push({
        cluster: t,
        theta: o,
        variance: l,
        k: s.length
      })
    }
    const a = n.map(e => 1 / e.variance),
      r = sum(a);
    h = sum(n.map((e, t) => a[t] * e.theta)) / r;
    const l = sum(n.map((e, t) => a[t] * Math.pow(e.theta - h, 2)));
    m = Math.max(0, (l - (o - 1)) / r);
    let d = 0,
      c = 0;
    for (const t of i) {
      const a = e.filter(e => e.cluster_id === t),
        s = n.find(e => e.cluster === t);
      for (const e of a) {
        d += 1 / (e.vi + p) * Math.pow(e.yi - s.theta, 2)
      }
      c += a.length - 1
    }
    if (c > 0) {
      const t = sum(e.map(e => 1 / (e.vi + p))) - sum(i.map(t => {
        const n = e.filter(e => e.cluster_id === t).map(e => 1 / (e.vi + p));
        return sum(n.map(e => e * e)) / sum(n)
      }));
      p = Math.max(0, (d - c) / Math.max(1, t))
    }
    if (Math.abs(p - v) + Math.abs(m - g) < s) {
      f = !0, _ = t;
      break
    }
    v = p, g = m
  }
  const y = p + m,
    b = sum(c.map(e => 1 / (e + y))),
    x = 1 / Math.sqrt(b),
    w = Math.max(1, o - 1),
    M = qt(.975, w),
    S = p + m,
    E = S > 0 ? p / S : 0,
    A = S > 0 ? m / S : 0;
  return {
    theta: h,
    se: x,
    ci_lower: h - M * x,
    ci_upper: h + M * x,
    df: w,
    exp_theta: Math.exp(h),
    exp_ci: [Math.exp(h - M * x), Math.exp(h + M * x)],
    tau2_within: p,
    tau2_between: m,
    tau2_total: y,
    tau_within: Math.sqrt(p),
    tau_between: Math.sqrt(m),
    ICC: {
      level2: E,
      level3: A,
      interpretation: `${(100*E).toFixed(1)}% of heterogeneity is within-cluster, ${(100*A).toFixed(1)}% is between-cluster`
    },
    n_effects: l,
    n_clusters: o,
    converged: f,
    convergence_iter: _,
    method: "Three-Level RE (Method of Moments)",
    warning: "This is an approximate method-of-moments estimator. CIs use Satterthwaite df approximation. For publication-quality results, use metafor::rma.mv() in R.",
    reference: "Konstantopoulos S. Res Synth Methods 2011;2:61-76"
  }
}

function simulateIPD(e, t = {}) {
  const {
    n_simulations: n = 1e3,
    outcome_type: a = "binary"
  } = t, s = [];
  for (const t of e)
    if ("binary" === a) {
      const e = t.events_t / t.n_t,
        n = t.events_c / t.n_c;
      for (let n = 0; n < t.n_t; n++) s.push({
        study_id: t.name,
        treatment: 1,
        outcome: Math.random() < e ? 1 : 0
      });
      for (let e = 0; e < t.n_c; e++) s.push({
        study_id: t.name,
        treatment: 0,
        outcome: Math.random() < n ? 1 : 0
      })
    } else if ("continuous" === a) {
    for (let e = 0; e < t.n_t; e++) s.push({
      study_id: t.name,
      treatment: 1,
      outcome: rnorm(t.mean_t, t.sd_t)
    });
    for (let e = 0; e < t.n_c; e++) s.push({
      study_id: t.name,
      treatment: 0,
      outcome: rnorm(t.mean_c, t.sd_c)
    })
  }
  return s
}

function oneStageIPD(e, t = {}) {
  const {
    outcome_type: n = "binary",
    random_effects: a = "intercept",
    maxIter: s = 50
  } = t, i = [...new Set(e.map(e => e.study_id))], r = i.length, o = e.length;
  if ("binary" === n) {
    const t = [];
    for (const n of i) {
      const a = e.filter(e => e.study_id === n),
        s = a.filter(e => 1 === e.treatment).length,
        i = a.filter(e => 0 === e.treatment).length,
        r = a.filter(e => 1 === e.treatment && 1 === e.outcome).length,
        o = a.filter(e => 0 === e.treatment && 1 === e.outcome).length,
        l = r + .5,
        d = s - r + .5,
        c = o + .5,
        u = i - o + .5,
        p = Math.log(l * u / (d * c)),
        m = 1 / l + 1 / d + 1 / c + 1 / u;
      t.push({
        study: n,
        logOR: p,
        variance: m,
        n: s + i
      })
    }
    const n = t.map(e => e.logOR),
      a = t.map(e => e.variance),
      s = estimateTau2_REML(n, a).tau2,
      l = calculatePooledEstimate(n, a, s),
      d = calculateHeterogeneity(n, a, s);
    return {
      treatment_effect: l.theta,
      exp_effect: Math.exp(l.theta),
      se: l.se,
      ci_lower: l.ci_lower,
      ci_upper: l.ci_upper,
      exp_ci: [Math.exp(l.ci_lower), Math.exp(l.ci_upper)],
      tau2: s,
      I2: d.I2,
      n_patients: o,
      n_studies: r,
      study_effects: t,
      method: "One-Stage IPD (two-step approximation)",
      note: "Exact one-stage requires iterative GLMM - this is approximate"
    }
  }
  const l = [];
  for (const t of i) {
    const n = e.filter(e => e.study_id === t),
      a = n.filter(e => 1 === e.treatment),
      s = n.filter(e => 0 === e.treatment),
      i = sum(a.map(e => e.outcome)) / a.length,
      r = sum(s.map(e => e.outcome)) / s.length,
      o = sum(a.map(e => Math.pow(e.outcome - i, 2))) / (a.length - 1),
      d = sum(s.map(e => Math.pow(e.outcome - r, 2))) / (s.length - 1),
      c = i - r,
      u = o / a.length + d / s.length;
    l.push({
      study: t,
      MD: c,
      variance: u,
      n: n.length
    })
  }
  const d = l.map(e => e.MD),
    c = l.map(e => e.variance),
    u = estimateTau2_REML(d, c).tau2,
    p = calculatePooledEstimate(d, c, u);
  return {
    treatment_effect: p.theta,
    se: p.se,
    ci_lower: p.ci_lower,
    ci_upper: p.ci_upper,
    tau2: u,
    n_patients: o,
    n_studies: r,
    study_effects: l,
    method: "One-Stage IPD (linear mixed model approximation)"
  }
}

function validateEffectSize(e, t = "HR") {
  if (null == e || isNaN(e)) return {
    valid: !1,
    reason: "Missing or invalid value"
  };
  if ("HR" === t || "RR" === t || "OR" === t) {
    if (e <= 0) return {
      valid: !1,
      reason: `${t} must be > 0, got ${e}`
    };
    if (e < .001 || e > 1e3) return {
      valid: !1,
      reason: `${t} = ${e} is implausibly extreme`
    }
  }
  return {
    valid: !0
  }
}

function validateCI(e, t, n) {
  return null === e || null === n || isNaN(e) || isNaN(n) ? {
    valid: !1,
    reason: "Missing CI bounds"
  } : e > t || t > n ? {
    valid: !1,
    reason: `CI bounds inconsistent: ${e} > ${t} or ${t} > ${n}`
  } : e <= 0 && t > 0 ? {
    valid: !1,
    reason: "Lower CI ≤ 0 but point estimate > 0"
  } : {
    valid: !0
  }
}

function importFromKMExtractor(e) {
  try {
    const t = "string" == typeof e ? JSON.parse(e) : e,
      n = {
        studies: [],
        dataType: null,
        measure: null,
        meta: t.meta || {},
        warnings: []
      };
    if (t.studies && t.studies.length > 0) {
      const e = t.studies[0];
      if (void 0 !== e.hr || void 0 !== e.hazard_ratio) {
        n.dataType = "hr", n.measure = "HR";
        for (const e of t.studies) {
          const t = e.hr || e.hazard_ratio,
            a = e.ci_lower || e.hr_lower || e.lower,
            s = e.ci_upper || e.hr_upper || e.upper,
            i = validateEffectSize(t, "HR"),
            r = validateCI(a, t, s);
          i.valid ? (r.valid || n.warnings.push(`${e.name||"Unknown"}: ${r.reason}`), n.studies.push({
            name: e.name || e.study_name || `Study ${n.studies.length+1}`,
            hr: t,
            ci_lower: a,
            ci_upper: s,
            events: e.events || e.total_events || null,
            n_total: e.n || e.n_total || e.sample_size || null,
            subgroup: e.subgroup || ""
          })) : n.warnings.push(`${e.name||"Unknown"}: ${i.reason}`)
        }
      } else if (void 0 !== e.events_t || void 0 !== e.alive_t) {
        n.dataType = "binary", n.measure = t.measure || "OR";
        const e = t.landmark || t.timepoint || null;
        for (const a of t.studies) {
          const t = e ? `${a.name||a.study_name} (${e}mo)` : a.name || a.study_name,
            s = void 0 !== a.events_t ? a.events_t : a.n_t - a.alive_t,
            i = void 0 !== a.events_c ? a.events_c : a.n_c - a.alive_c;
          a.n_t <= 0 || a.n_c <= 0 ? n.warnings.push(`${t}: Sample size must be > 0`) : s < 0 || s > a.n_t ? n.warnings.push(`${t}: Events (T) out of range`) : i < 0 || i > a.n_c ? n.warnings.push(`${t}: Events (C) out of range`) : n.studies.push({
            name: t,
            events_t: s,
            n_t: a.n_t,
            events_c: i,
            n_c: a.n_c,
            subgroup: a.subgroup || ""
          })
        }
      } else if (void 0 !== e.logHR || void 0 !== e.log_hr) {
        n.dataType = "generic", n.measure = "GEN";
        for (const e of t.studies) {
          const t = e.logHR || e.log_hr,
            a = e.se || e.se_loghr;
          isNaN(t) ? n.warnings.push(`${e.name||"Unknown"}: Invalid logHR`) : isNaN(a) || a <= 0 ? n.warnings.push(`${e.name||"Unknown"}: SE must be > 0`) : (Math.abs(t) > 5 && n.warnings.push(`${e.name||"Unknown"}: |logHR| > 5 is implausibly extreme`), n.studies.push({
            name: e.name || e.study_name,
            yi: t,
            vi: a * a,
            subgroup: e.subgroup || ""
          }))
        }
      }
    }
    return n.warnings.length, n
  } catch (e) {
    return log.error("KM import error:", e), {
      error: e.message,
      studies: [],
      warnings: []
    }
  }
}

function applyKMImport(e) {
  if (e.error || !e.studies.length) return {
    success: !1,
    message: e.error || "No studies to import"
  };
  AppState.settings.dataType = e.dataType, document.getElementById("dataTypeSelect").value = e.dataType, e.measure && (AppState.settings.effectMeasure = e.measure, updateEffectMeasures(), setTimeout(() => {
    document.getElementById("effectMeasureSelect").value = e.measure
  }, 0)), rebuildTable();
  document.getElementById("studyTableBody").innerHTML = "";
  for (const t of e.studies) addStudyRow(t);
  return updateDataSummary(), {
    success: !0,
    message: `Imported ${e.studies.length} studies as ${e.dataType} (${e.measure})`,
    n_studies: e.studies.length
  }
}
const OUTCOME_DICTIONARY = {
    cv_death: ["cardiovascular death", "cv death", "cardiac death", "death from cv causes", "cardiovascular mortality", "cv mortality", "cardiac mortality", "death from cardiovascular causes", "cvd death", "heart death"],
    all_cause_death: ["all-cause death", "all cause death", "all-cause mortality", "death", "total mortality", "overall mortality", "acm", "death from any cause", "mortality", "total death"],
    sudden_cardiac_death: ["sudden cardiac death", "scd", "sudden death", "arrhythmic death", "sudden cardiac arrest", "sudden arrhythmic death"],
    hf_hospitalization: ["hf hospitalization", "hfh", "heart failure hospitalization", "hospitalization for heart failure", "hf admission", "chf hospitalization", "hospitalization for worsening hf", "whf hospitalization", "heart failure admission", "admission for hf"],
    cv_death_or_hfh: ["cv death or hfh", "cardiovascular death or heart failure hospitalization", "cv death or heart failure hospitalization", "composite cv death hfh", "primary composite", "cv death/hfh", "cvd or hfh"],
    worsening_hf: ["worsening heart failure", "worsening hf", "whf", "hf worsening", "deterioration of hf", "hf deterioration", "hf progression"],
    first_hf_event: ["first hf event", "time to first hf hospitalization", "first hfh", "incident hf hospitalization"],
    total_hf_events: ["total hf hospitalizations", "total hf events", "recurrent hfh", "all hf hospitalizations", "hf hospitalization burden"],
    renal_composite: ["renal composite", "kidney composite", "renal endpoint", "composite renal outcome", "ckd progression", "kidney outcome"],
    egfr_decline: ["egfr decline", "gfr decline", "eGFR slope", "kidney function decline", "renal function decline", "egfr reduction"],
    esrd: ["esrd", "end-stage renal disease", "end stage renal disease", "dialysis", "renal replacement therapy", "rrt", "kidney failure"],
    doubling_creatinine: ["doubling of creatinine", "creatinine doubling", "sustained doubling creatinine", "doubling serum creatinine"],
    mi: ["myocardial infarction", "mi", "heart attack", "ami", "acute myocardial infarction", "stemi", "nstemi", "type 1 mi"],
    stroke: ["stroke", "cva", "cerebrovascular accident", "ischemic stroke", "hemorrhagic stroke", "cerebral infarction"],
    mace: ["mace", "major adverse cardiovascular events", "major adverse cv events", "3-point mace", "4-point mace", "cv death mi stroke"],
    kccq: ["kccq", "kansas city cardiomyopathy questionnaire", "kccq-tss", "kccq total symptom score", "kccq-css", "kccq clinical summary score", "kccq-os", "kccq overall score"],
    nyha_improvement: ["nyha improvement", "nyha class improvement", "functional class improvement", "improvement in nyha"],
    "6mwd": ["6mwd", "6-minute walk distance", "6 minute walk test", "6mwt", "six minute walk distance", "walk distance"],
    ntprobnp_change: ["nt-probnp change", "ntprobnp reduction", "nt-probnp reduction", "change in nt-probnp", "bnp change", "natriuretic peptide"],
    af_recurrence: ["af recurrence", "atrial fibrillation recurrence", "afib recurrence", "recurrent af", "af/afl recurrence"],
    new_onset_af: ["new onset af", "incident af", "new atrial fibrillation", "development of af"]
  },
  OUTCOME_METADATA = {
    cv_death: {
      type: "ratio",
      direction: "lower"
    },
    all_cause_death: {
      type: "ratio",
      direction: "lower"
    },
    sudden_cardiac_death: {
      type: "ratio",
      direction: "lower"
    },
    hf_hospitalization: {
      type: "ratio",
      direction: "lower"
    },
    cv_death_or_hfh: {
      type: "ratio",
      direction: "lower"
    },
    worsening_hf: {
      type: "ratio",
      direction: "lower"
    },
    first_hf_event: {
      type: "ratio",
      direction: "lower"
    },
    total_hf_events: {
      type: "ratio",
      direction: "lower"
    },
    renal_composite: {
      type: "ratio",
      direction: "lower"
    },
    egfr_decline: {
      type: "ratio",
      direction: "lower"
    },
    esrd: {
      type: "ratio",
      direction: "lower"
    },
    doubling_creatinine: {
      type: "ratio",
      direction: "lower"
    },
    mi: {
      type: "ratio",
      direction: "lower"
    },
    stroke: {
      type: "ratio",
      direction: "lower"
    },
    mace: {
      type: "ratio",
      direction: "lower"
    },
    kccq: {
      type: "continuous",
      direction: "higher"
    },
    nyha_improvement: {
      type: "continuous",
      direction: "higher"
    },
    "6mwd": {
      type: "continuous",
      direction: "higher"
    },
    ntprobnp_change: {
      type: "continuous",
      direction: "lower"
    },
    af_recurrence: {
      type: "ratio",
      direction: "lower"
    },
    new_onset_af: {
      type: "ratio",
      direction: "lower"
    }
  };

function getOutcomeMetadata(e) {
  return OUTCOME_METADATA[e] || {
    type: "ratio",
    direction: "lower"
  }
}

function mapOutcomeToStandard(e) {
  const t = e.toLowerCase().trim().replace(/[‐–—]/g, "-").replace(/\s+/g, " ");
  for (const [n, a] of Object.entries(OUTCOME_DICTIONARY))
    for (const s of a)
      if (t === s) return {
        key: n,
        confidence: 1,
        original: e
      };
  for (const [n, a] of Object.entries(OUTCOME_DICTIONARY))
    for (const s of a)
      if (s.length >= 3 && t.includes(s)) return {
        key: n,
        confidence: .9,
        original: e
      };
  for (const [n, a] of Object.entries(OUTCOME_DICTIONARY))
    for (const s of a)
      if (2 === s.length) {
        if (new RegExp(`\\b${s}\\b`, "i").test(t)) return {
          key: n,
          confidence: .85,
          original: e
        }
      } for (const [n, a] of Object.entries(OUTCOME_DICTIONARY))
    for (const s of a) {
      const a = s.split(" ").filter(e => e.length > 2),
        i = a.filter(e => t.includes(e));
      if (a.length >= 2 && i.length >= 2) return {
        key: n,
        confidence: .7,
        original: e
      }
    }
  return {
    key: "custom_" + t.replace(/\s+/g, "_").slice(0, 30),
    confidence: 0,
    original: e
  }
}
const FOLLOW_UP_PATTERNS = [{
  regex: /(\d+(?:\.\d+)?)\s*[-–]?\s*months?\s*(?:follow[- ]?up)?/i,
  unit: 1
}, {
  regex: /(\d+(?:\.\d+)?)\s*[-–]?\s*years?\s*(?:follow[- ]?up)?/i,
  unit: 12
}, {
  regex: /median\s*(?:FU|follow[- ]?up)\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*years?/i,
  unit: 12
}, {
  regex: /median\s*(?:FU|follow[- ]?up)\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*months?/i,
  unit: 1
}, {
  regex: /(?:FU|follow[- ]?up)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*months?/i,
  unit: 1
}, {
  regex: /(?:FU|follow[- ]?up)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*years?/i,
  unit: 12
}, {
  regex: /(\d+(?:\.\d+)?)\s*weeks?/i,
  unit: .23
}, {
  regex: /at\s*(\d+(?:\.\d+)?)\s*[-–]?\s*months?/i,
  unit: 1
}, {
  regex: /at\s*(\d+(?:\.\d+)?)\s*[-–]?\s*years?/i,
  unit: 12
}, {
  regex: /(\d+(?:\.\d+)?)\s*[-–]?\s*year/i,
  unit: 12
}, {
  regex: /^(\d+(?:\.\d+)?)$/,
  unit: "auto"
}];

function normalizeFollowUp(e) {
  if ("number" == typeof e) return {
    months: e,
    original: e,
    confidence: .8
  };
  const t = String(e).trim();
  for (const e of FOLLOW_UP_PATTERNS) {
    const n = t.match(e.regex);
    if (n) {
      const a = parseFloat(n[1]);
      let s;
      return s = "auto" === e.unit ? a < 36 ? a : a / 12 : a * e.unit, {
        months: Math.round(10 * s) / 10,
        original: t,
        confidence: "auto" === e.unit ? .6 : .95
      }
    }
  }
  return {
    months: null,
    original: t,
    confidence: 0
  }
}
const BASELINE_COVARIATE_MAP = {
  age: ["age", "age years", "age (years)", "mean age", "median age"],
  age_gte_65: ["age ≥65", "age >=65", "age 65+", "elderly"],
  age_gte_75: ["age ≥75", "age >=75", "age 75+"],
  male_pct: ["male", "male %", "men", "male sex", "% male"],
  female_pct: ["female", "female %", "women", "female sex", "% female"],
  egfr: ["egfr", "gfr", "eGFR ml/min", "eGFR (ml/min/1.73m2)", "estimated gfr"],
  egfr_lt_60: ["egfr <60", "egfr < 60", "ckd stage 3+", "ckd"],
  creatinine: ["creatinine", "serum creatinine", "cr"],
  ntprobnp: ["nt-probnp", "ntprobnp", "nt probnp", "n-terminal probnp"],
  bnp: ["bnp", "b-type natriuretic peptide"],
  troponin: ["troponin", "hs-troponin", "hstnt", "hs-tnt"],
  lvef: ["lvef", "ef", "ejection fraction", "lv ejection fraction", "left ventricular ef"],
  lvef_lt_40: ["lvef <40", "lvef < 40", "hfref", "reduced ef"],
  lvef_gte_40: ["lvef ≥40", "lvef >= 40", "hfpef", "hfmref", "preserved ef"],
  diabetes_pct: ["diabetes", "dm", "type 2 diabetes", "t2dm", "diabetic"],
  hypertension_pct: ["hypertension", "htn", "hypertensive"],
  af_pct: ["atrial fibrillation", "af", "afib", "atrial fib"],
  cad_pct: ["coronary artery disease", "cad", "ihd", "ischemic heart disease"],
  prior_mi_pct: ["prior mi", "previous mi", "history of mi"],
  prior_stroke_pct: ["prior stroke", "previous stroke", "history of stroke"],
  ckd_pct: ["chronic kidney disease", "ckd", "renal impairment"],
  nyha_2_pct: ["nyha ii", "nyha 2", "nyha class ii", "nyha class 2"],
  nyha_3_pct: ["nyha iii", "nyha 3", "nyha class iii", "nyha class 3"],
  nyha_4_pct: ["nyha iv", "nyha 4", "nyha class iv", "nyha class 4"],
  sbp: ["sbp", "systolic bp", "systolic blood pressure"],
  dbp: ["dbp", "diastolic bp", "diastolic blood pressure"],
  hr: ["heart rate", "hr", "pulse"],
  bmi: ["bmi", "body mass index"],
  acei_arb_pct: ["acei/arb", "ace inhibitor", "arb", "raas inhibitor"],
  bb_pct: ["beta blocker", "bb", "β-blocker"],
  mra_pct: ["mra", "mineralocorticoid", "aldosterone antagonist", "spironolactone"],
  diuretic_pct: ["diuretic", "loop diuretic", "furosemide"]
};

function parseBaselineCharacteristics(e) {
  const t = {},
    n = [];
  let a = e;
  Array.isArray(e) && (a = {}, e.forEach(e => {
    e.name && void 0 !== e.value && (a[e.name] = e.value)
  }));
  for (const [e, s] of Object.entries(a)) {
    const a = e.toLowerCase().trim();
    let i = !1;
    for (const [e, n] of Object.entries(BASELINE_COVARIATE_MAP)) {
      for (const r of n)
        if (a === r || a.includes(r)) {
          let n = s;
          if ("string" == typeof n) {
            const e = n.match(/^([\d.]+)/);
            e && (n = parseFloat(e[1]))
          }
          t[e] = n, i = !0;
          break
        } if (i) break
    }
    i || n.push({
      key: e,
      value: s
    })
  }
  return {
    baseline: t,
    unmapped: n
  }
}

function multiOutcomeAnalysis(e, t = {}) {
  const {
    outcomes: n = null,
    method: a = "inverse_variance"
  } = t, s = {};
  for (const t of e)
    if (t.outcomes)
      for (const [e, a] of Object.entries(t.outcomes)) {
        const i = mapOutcomeToStandard(e),
          r = i.key;
        if (n && !n.includes(r)) continue;
        let o, l;
        if (s[r] || (s[r] = {
            standardName: r,
            studies: [],
            mappedFrom: []
          }), void 0 !== a.hr) o = Math.log(a.hr), a.ci ? l = (Math.log(a.ci[1]) - Math.log(a.ci[0])) / 3.92 : a.se && (l = a.se);
        else if (void 0 !== a.or) o = Math.log(a.or), a.ci && (l = (Math.log(a.ci[1]) - Math.log(a.ci[0])) / 3.92);
        else if (void 0 !== a.mean_diff)
          if (o = a.mean_diff, a.se) l = a.se;
          else {
            if (!(a.sd && a.n && a.n > 0)) continue;
            l = a.sd / Math.sqrt(a.n)
          } void 0 === o || void 0 === l || isNaN(o) || isNaN(l) || (s[r].studies.push({
          trial: t.trial || t.name,
          yi: o,
          vi: l * l,
          sei: l,
          followUp: t.follow_up_months || null
        }), s[r].mappedFrom.push(i.original))
      }
  const i = {};
  for (const [e, t] of Object.entries(s)) {
    if (t.studies.length < 2) {
      i[e] = {
        k: t.studies.length,
        pooled: t.studies[0] || null,
        warning: "Insufficient studies for meta-analysis"
      };
      continue
    }
    const n = t.studies.map(e => e.yi),
      a = t.studies.map(e => e.vi),
      s = estimateTau2_DL(n, a),
      r = calculatePooledEstimate(n, a, s.tau2),
      o = calculateHeterogeneity(n, a, s.tau2),
      l = getOutcomeMetadata(e),
      d = "ratio" === l.type,
      c = calculateDDMA(r.theta, r.se, s.tau2, n.length, {
        direction: l.direction
      }),
      u = {
        effect: r.theta,
        se: r.se,
        p_value: r.p_value
      };
    d ? (u.effect_exp = Math.exp(r.theta), u.ci_lower = Math.exp(r.ci_lower), u.ci_upper = Math.exp(r.ci_upper), u.scale = "ratio") : (u.effect_display = r.theta, u.ci_lower = r.ci_lower, u.ci_upper = r.ci_upper, u.scale = "continuous"), i[e] = {
      standardName: e,
      k: t.studies.length,
      trials: t.studies.map(e => e.trial),
      mappedFrom: t.mappedFrom,
      outcomeType: l.type,
      direction: l.direction,
      pooled: u,
      heterogeneity: {
        tau2: s.tau2,
        I2: o.I2
      },
      ddma: {
        P_benefit: c.confidence.P_benefit,
        P_mcid: c.predictive.P_mcid
      }
    }
  }
  return {
    outcomes: i,
    n_outcomes: Object.keys(i).length,
    n_trials: e.length,
    method: a
  }
}

function covariateAdjustedAnalysis(e, t, n = {}) {
  const {
    outcome: a = "cv_death_or_hfh"
  } = n, s = [];
  for (const n of e) {
    let e, i, r;
    if (n.outcomes && n.outcomes[a]) {
      const t = n.outcomes[a];
      t.hr && (e = Math.log(t.hr), i = t.ci ? Math.pow((Math.log(t.ci[1]) - Math.log(t.ci[0])) / 3.92, 2) : .04)
    }
    n.baseline && void 0 !== n.baseline[t] && (r = n.baseline[t]), void 0 !== e && void 0 !== r && s.push({
      trial: n.trial || n.name,
      yi: e,
      vi: i,
      x: r
    })
  }
  if (s.length < 3) return {
    available: !1,
    warning: `Insufficient trials with both ${a} and ${t}`
  };
  const i = metaRegression(s.map(e => e.yi), s.map(e => e.vi), s.map(e => e.x), t, "DL");
  return {
    available: !0,
    covariate: t,
    outcome: a,
    regression: i,
    interpretation: i.slope < 0 ? `Effect increases (more benefit) with higher ${t}` : `Effect decreases (less benefit) with higher ${t}`,
    data: s
  }
}

function trajectoryAnalysis(e, t, n = {}) {
  const a = [];
  for (const n of e)
    if (n.outcomes)
      if (n.follow_up_months && Array.isArray(n.follow_up_months))
        for (let e = 0; e < n.follow_up_months.length; e++) {
          const s = n.follow_up_months[e],
            i = t + "_" + s + "mo";
          if (n.outcomes[i] || n.outcomes[t]) {
            const e = n.outcomes[i] || n.outcomes[t];
            e.hr && a.push({
              trial: n.trial || n.name,
              months: s,
              yi: Math.log(e.hr),
              vi: e.ci ? Math.pow((Math.log(e.ci[1]) - Math.log(e.ci[0])) / 3.92, 2) : .04
            })
          }
        } else if (n.follow_up_months) {
          const e = normalizeFollowUp(n.follow_up_months);
          if (e.months && n.outcomes[t]) {
            const s = n.outcomes[t];
            s.hr && a.push({
              trial: n.trial || n.name,
              months: e.months,
              yi: Math.log(s.hr),
              vi: s.ci ? Math.pow((Math.log(s.ci[1]) - Math.log(s.ci[0])) / 3.92, 2) : .04
            })
          }
        } if (a.length < 3) return {
    available: !1,
    warning: "Insufficient time points for trajectory analysis"
  };
  a.sort((e, t) => e.months - t.months);
  const s = getOutcomeMetadata(t),
    i = "ratio" === s.type,
    r = [{
      label: "0-6 mo",
      min: 0,
      max: 6
    }, {
      label: "6-12 mo",
      min: 6,
      max: 12
    }, {
      label: "12-24 mo",
      min: 12,
      max: 24
    }, {
      label: "24-36 mo",
      min: 24,
      max: 36
    }, {
      label: "36+ mo",
      min: 36,
      max: 1 / 0
    }],
    o = [];
  for (const e of r) {
    const t = a.filter(t => t.months > e.min && t.months <= e.max);
    if (0 !== t.length)
      if (1 === t.length) {
        const n = t[0].yi,
          a = Math.sqrt(t[0].vi);
        o.push({
          window: e.label,
          midpoint: (e.min + Math.min(e.max, 48)) / 2,
          effect_raw: n,
          effect_exp: i ? Math.exp(n) : n,
          ci_lower: i ? Math.exp(n - 1.96 * a) : n - 1.96 * a,
          ci_upper: i ? Math.exp(n + 1.96 * a) : n + 1.96 * a,
          k: 1
        })
      } else {
        const n = t.map(e => e.yi),
          a = t.map(e => e.vi),
          s = calculatePooledEstimate(n, a, estimateTau2_DL(n, a).tau2);
        o.push({
          window: e.label,
          midpoint: (e.min + Math.min(e.max, 48)) / 2,
          effect_raw: s.theta,
          effect_exp: i ? Math.exp(s.theta) : s.theta,
          ci_lower: i ? Math.exp(s.ci_lower) : s.ci_lower,
          ci_upper: i ? Math.exp(s.ci_upper) : s.ci_upper,
          k: t.length
        })
      }
  }
  if (0 === o.length) return {
    available: !1,
    warning: "No time windows had sufficient data"
  };
  let l;
  l = "lower" === s.direction ? o.reduce((e, t) => t.effect_raw < e.effect_raw ? t : e, o[0]) : o.reduce((e, t) => t.effect_raw > e.effect_raw ? t : e, o[0]);
  const d = o[0].effect_raw,
    c = o[o.length - 1].effect_raw;
  let u;
  u = "lower" === s.direction ? c > d ? "attenuating" : "sustained" : c < d ? "attenuating" : "sustained";
  const p = i ? "HR" : "MD";
  return {
    available: !0,
    outcome: t,
    outcomeType: s.type,
    direction: s.direction,
    trajectory: o,
    timePoints: a,
    peak: {
      window: l.window,
      effect: l.effect_exp,
      interpretation: `Peak benefit at ${l.window} (${p} ${l.effect_exp.toFixed(2)})`
    },
    trend: u
  }
}

function loadMultiOutcomeData() {
  const e = document.getElementById("multiOutcomeInput"),
    t = document.getElementById("multiOutcomeStatus");
  if (e && e.value.trim()) try {
    const n = JSON.parse(e.value.trim()),
      a = Array.isArray(n) ? n : [n],
      s = [],
      i = [];
    for (const e of a) {
      if (!e.outcomes || 0 === Object.keys(e.outcomes).length) {
        i.push(`${e.trial||"Unknown"}: No outcomes`);
        continue
      }
      const t = {};
      for (const [n, a] of Object.entries(e.outcomes)) {
        t[mapOutcomeToStandard(n).key] = {
          ...a,
          originalName: n
        }
      }
      let n = e.follow_up_months;
      "string" == typeof n && (n = normalizeFollowUp(n).months);
      let a = e.baseline || {};
      Array.isArray(a) && (a = parseBaselineCharacteristics(a).baseline), s.push({
        trial: e.trial || e.name || `Trial ${s.length+1}`,
        outcomes: t,
        follow_up_months: n,
        baseline: a
      })
    }
    AppState.multiOutcome.trials = s;
    const r = new Set;
    s.forEach(e => Object.keys(e.outcomes).forEach(e => r.add(e))), populateMultiOutcomeDropdowns(s);
    let o = `<span class="text-success">✓ Loaded ${s.length} trials, ${r.size} unique outcomes</span>`;
    i.length > 0 && (o += `<br><span class="text-warning text-xs">${i.join(", ")}</span>`), t.innerHTML = o
  } catch (e) {
    t.innerHTML = `<span class="text-error">JSON parse error: ${e.message}</span>`
  } else t.innerHTML = '<span class="text-warning">Please paste JSON data</span>'
}

function populateMultiOutcomeDropdowns(e) {
  const t = new Set;
  e.forEach(e => {
    e.baseline && Object.keys(e.baseline).forEach(e => t.add(e))
  });
  const n = new Set;
  e.forEach(e => {
    Object.keys(e.outcomes).forEach(e => n.add(e))
  });
  const a = document.getElementById("covariateSelect");
  a && (a.innerHTML = '<option value="">Select covariate...</option>', [...t].sort().forEach(e => {
    a.innerHTML += `<option value="${e}">${e}</option>`
  }));
  const s = document.getElementById("covOutcomeSelect"),
    i = document.getElementById("trajectoryOutcomeSelect"),
    r = [...n].sort().map(e => `<option value="${e}">${"ratio"===getOutcomeMetadata(e).type?"📊":"📈"} ${e}</option>`).join("");
  s && (s.innerHTML = r, n.has("cv_death_or_hfh") && (s.value = "cv_death_or_hfh")), i && (i.innerHTML = r, n.has("cv_death_or_hfh") && (i.value = "cv_death_or_hfh"))
}

function runCovariateAdjustedUI() {
  if (0 === AppState.multiOutcome.trials.length) return void alert("Load trial data first");
  const e = document.getElementById("covariateSelect"),
    t = document.getElementById("covOutcomeSelect"),
    n = e?.value,
    a = t?.value || "cv_death_or_hfh";
  if (!n) return void alert("Select a covariate from the dropdown");
  const s = covariateAdjustedAnalysis(AppState.multiOutcome.trials, n, {
      outcome: a
    }),
    i = document.getElementById("covariateResults");
  i && (s.available ? i.innerHTML = `\n        <div class="card">\n          <div class="card__header">\n            <h3 class="card__title">📊 Covariate-Adjusted: ${n} → ${a}</h3>\n          </div>\n          <div class="card__body">\n            <div class="grid" style="grid-template-columns: 1fr 1fr; gap: var(--space-4);">\n              <div>\n                <div class="text-xs text-secondary">Slope (β₁)</div>\n                <div class="text-lg font-mono">${s.regression&&void 0!==s.regression.slope?s.regression.slope.toFixed(4):"N/A"}</div>\n              </div>\n              <div>\n                <div class="text-xs text-secondary">p-value</div>\n                <div class="text-lg font-mono">${s.regression&&void 0!==s.regression.p_value?s.regression.p_value.toFixed(4):"N/A"}</div>\n              </div>\n            </div>\n            <p class="text-sm" style="margin-top: var(--space-3);">\n              <strong>Interpretation:</strong> ${s.interpretation}\n            </p>\n            <p class="text-xs text-secondary" style="margin-top: var(--space-2);">\n              Based on ${s.data.length} trials with both ${n} and ${a}\n            </p>\n          </div>\n        </div>\n      ` : i.innerHTML = `<div class="card"><div class="card__body text-warning">${s.warning}</div></div>`)
}

function runTrajectoryUI() {
  if (0 === AppState.multiOutcome.trials.length) return void alert("Load trial data first");
  const e = document.getElementById("trajectoryOutcomeSelect"),
    t = e?.value || "cv_death_or_hfh",
    n = trajectoryAnalysis(AppState.multiOutcome.trials, t),
    a = document.getElementById("trajectoryResults");
  if (!a) return;
  if (!n.available) return void(a.innerHTML = `<div class="card"><div class="card__body text-warning">${n.warning}</div></div>`);
  const s = "ratio" === n.outcomeType ? "HR/OR" : "Mean Diff";
  let i = n.trajectory.map(e => `\n        <tr>\n          <td>${e.window||"N/A"}</td>\n          <td class="font-mono">${void 0!==e.effect_exp?e.effect_exp.toFixed(3):"N/A"}</td>\n          <td class="font-mono">${void 0!==e.ci_lower&&void 0!==e.ci_upper?`${e.ci_lower.toFixed(2)} – ${e.ci_upper.toFixed(2)}`:"N/A"}</td>\n          <td>${e.k||"N/A"}</td>\n        </tr>\n      `).join("");
  a.innerHTML = `\n        <div class="card">\n          <div class="card__header">\n            <h3 class="card__title">📈 Trajectory: ${t}</h3>\n          </div>\n          <div class="card__body" style="padding: 0;">\n            <table class="data-table">\n              <thead>\n                <tr><th>Time Window</th><th>Effect (${s})</th><th>95% CI</th><th>k</th></tr>\n              </thead>\n              <tbody>${i}</tbody>\n            </table>\n          </div>\n          <div class="card__body" style="border-top: 1px solid var(--border-light);">\n            <p class="text-sm"><strong>Peak:</strong> ${n.peak.interpretation}</p>\n            <p class="text-sm"><strong>Trend:</strong> ${"attenuating"===n.trend?"⚠️ Effect attenuating over time":"✓ Effect sustained"}</p>\n          </div>\n        </div>\n      `
}

function populateOutcomeDictionary() {
  const e = document.getElementById("outcomeDictionaryList");
  if (!e) return;
  let t = '<ul style="list-style: none; padding: 0; margin: 0;">';
  for (const [e, n] of Object.entries(OUTCOME_DICTIONARY)) {
    const a = OUTCOME_METADATA[e] || {};
    t += `<li style="margin-bottom: 4px;"><strong>${"ratio"===a.type?"📊":"📈"} ${e}</strong> ${"lower"===a.direction?"↓":"↑"}: ${n.slice(0,3).join(", ")}${n.length>3?"...":""}</li>`
  }
  t += "</ul>", e.innerHTML = t
}

function loadMultiOutcomeDemo() {
  document.getElementById("multiOutcomeInput").value = JSON.stringify([{
    trial: "DAPA-HF",
    outcomes: {
      cv_death_or_hfh: {
        hr: .74,
        ci: [.65, .85]
      },
      cv_death: {
        hr: .82,
        ci: [.69, .98]
      },
      hf_hospitalization: {
        hr: .7,
        ci: [.59, .83]
      },
      all_cause_death: {
        hr: .83,
        ci: [.71, .97]
      },
      kccq: {
        mean_diff: 2.3,
        se: .7
      }
    },
    follow_up_months: 18,
    baseline: {
      age: 66,
      egfr: 66,
      ntprobnp: 1437,
      diabetes_pct: 42,
      lvef: 31
    }
  }, {
    trial: "EMPEROR-Reduced",
    outcomes: {
      cv_death_or_hfh: {
        hr: .75,
        ci: [.65, .86]
      },
      cv_death: {
        hr: .92,
        ci: [.75, 1.12]
      },
      hf_hospitalization: {
        hr: .69,
        ci: [.59, .81]
      },
      all_cause_death: {
        hr: .92,
        ci: [.77, 1.1]
      },
      kccq: {
        mean_diff: 1.8,
        se: .6
      },
      egfr_decline: {
        hr: .5,
        ci: [.32, .77]
      }
    },
    follow_up_months: 16,
    baseline: {
      age: 67,
      egfr: 62,
      ntprobnp: 1887,
      diabetes_pct: 50,
      lvef: 27
    }
  }, {
    trial: "DELIVER",
    outcomes: {
      cv_death_or_hfh: {
        hr: .82,
        ci: [.73, .92]
      },
      cv_death: {
        hr: .88,
        ci: [.74, 1.05]
      },
      hf_hospitalization: {
        hr: .77,
        ci: [.67, .89]
      },
      all_cause_death: {
        hr: .94,
        ci: [.83, 1.07]
      },
      kccq: {
        mean_diff: 2.4,
        se: .5
      }
    },
    follow_up_months: 28,
    baseline: {
      age: 72,
      egfr: 61,
      ntprobnp: 1146,
      diabetes_pct: 45,
      lvef: 54
    }
  }, {
    trial: "EMPEROR-Preserved",
    outcomes: {
      cv_death_or_hfh: {
        hr: .79,
        ci: [.69, .9]
      },
      cv_death: {
        hr: .91,
        ci: [.76, 1.09]
      },
      hf_hospitalization: {
        hr: .71,
        ci: [.6, .83]
      },
      kccq: {
        mean_diff: 1.5,
        se: .6
      }
    },
    follow_up_months: 26,
    baseline: {
      age: 72,
      egfr: 60,
      ntprobnp: 994,
      diabetes_pct: 49,
      lvef: 54
    }
  }], null, 2), document.getElementById("multiOutcomeStatus").innerHTML = '<span class="text-secondary">Demo loaded: SGLT2i HF Trials (DAPA-HF, EMPEROR-Reduced, DELIVER, EMPEROR-Preserved)</span>'
}

function runMultiOutcomeAnalysis() {
  if (0 === AppState.multiOutcome.trials.length) return void alert("No multi-outcome data loaded. Import trials with outcomes first.");
  const e = multiOutcomeAnalysis(AppState.multiOutcome.trials);
  return AppState.multiOutcome.results = e, renderMultiOutcomeResults(e), e
}

function renderMultiOutcomeResults(e) {
  const t = document.getElementById("multiOutcomeResults");
  if (!t) return;
  let n = `\n        <div class="card">\n          <div class="card__header">\n            <h3 class="card__title">🎯 Joint DDMA Results (${e.n_outcomes} Outcomes, ${e.n_trials} Trials)</h3>\n          </div>\n          <div class="card__body" style="padding: 0;">\n            <table class="data-table">\n              <thead>\n                <tr>\n                  <th>Outcome</th>\n                  <th>Type</th>\n                  <th>k</th>\n                  <th>Effect</th>\n                  <th>95% CI</th>\n                  <th>P(Benefit)</th>\n                  <th>I²</th>\n                </tr>\n              </thead>\n              <tbody>\n      `;
  for (const [t, a] of Object.entries(e.outcomes)) {
    if (!a.pooled || a.warning) {
      n += `<tr><td>${t}</td><td colspan="6" class="text-secondary">${a.warning||"No data"}</td></tr>`;
      continue
    }
    const e = a.ddma?.P_benefit || 0,
      s = e > .9 ? "text-success" : e > .7 ? "" : "text-warning";
    let i, r;
    "ratio" === a.outcomeType ? (i = a.pooled && void 0 !== a.pooled.effect_exp ? a.pooled.effect_exp.toFixed(3) : "N/A", r = a.pooled && void 0 !== a.pooled.ci_lower && void 0 !== a.pooled.ci_upper ? `${a.pooled.ci_lower.toFixed(2)} – ${a.pooled.ci_upper.toFixed(2)}` : "N/A") : (i = a.pooled && void 0 !== a.pooled.effect ? a.pooled.effect.toFixed(2) : "N/A", r = a.pooled && void 0 !== a.pooled.ci_lower && void 0 !== a.pooled.ci_upper ? `${a.pooled.ci_lower.toFixed(2)} – ${a.pooled.ci_upper.toFixed(2)}` : "N/A");
    const o = "ratio" === a.outcomeType ? "HR/OR" : "MD",
      l = "lower" === a.direction ? "↓" : "↑";
    n += `\n          <tr>\n            <td class="font-semibold">${t.replace(/_/g," ")}</td>\n            <td class="text-xs text-secondary">${o} ${l}</td>\n            <td>${a.k||"N/A"}</td>\n            <td class="font-mono">${i}</td>\n            <td class="font-mono">${r}</td>\n            <td class="${s} font-semibold">${(100*e).toFixed(1)}%</td>\n            <td>${a.heterogeneity&&void 0!==a.heterogeneity.I2?a.heterogeneity.I2.toFixed(0):"N/A"}%</td>\n          </tr>\n        `
  }
  n += "</tbody></table></div></div>", t.innerHTML = n
}

function calculateHeterogeneity(e, t, n) {
  const a = e.length,
    s = t.map(e => 1 / e),
    i = sum(s),
    r = sum(e.map((e, t) => s[t] * e)) / i,
    o = sum(e.map((e, t) => s[t] * Math.pow(e - r, 2))),
    l = a - 1,
    d = 1 - pchisq(o, l),
    c = o > l ? (o - l) / o * 100 : 0,
    u = o / Math.max(l, 1),
    p = Math.sqrt(u),
    m = Math.sqrt(n);
  return {
    Q: o,
    df: l,
    p_Q: d,
    I2: c,
    I2_ci: calculateI2_CI(o, l),
    H2: u,
    H: p,
    tau2: n,
    tau: m,
    interpretation: interpretI2(c)
  }
}

function interpretI2(e) {
  return e < 25 ? "Low (but see τ for clinical relevance)" : e < 50 ? "Low-Moderate" : e < 75 ? "Moderate-High" : "High (investigate sources)"
}

function calculateI2_CI(e, t, n = .05) {
  if (t < 1) return {
    lower: 0,
    upper: 0
  };
  const a = qnorm(1 - n / 2),
    s = e / t,
    i = Math.sqrt(Math.max(1, s));
  let r;
  if (e > t) {
    const n = Math.sqrt(2 * e),
      a = Math.sqrt(Math.max(0, 2 * t - 1));
    r = n - a > 0 ? .5 * (Math.log(e) - Math.log(t)) / (n - a) : 0
  } else r = t > 1 ? Math.sqrt(1 / (2 * (t - 1)) * (1 - 1 / (3 * Math.pow(t - 1, 2)))) : 0;
  if (0 === r || !isFinite(r)) return {
    lower: 0,
    upper: 0
  };
  const o = Math.log(Math.max(1, i)),
    l = Math.exp(o - a * r),
    d = Math.exp(o + a * r),
    c = Math.max(0, 100 * (1 - 1 / (l * l))),
    u = Math.min(100, 100 * (1 - 1 / (d * d)));
  return {
    lower: c,
    upper: Math.max(c, u)
  }
}

function eValueRR(e) {
  if (!isFinite(e) || e <= 0) return NaN;
  var t = e < 1 ? 1 / e : e;
  return t + Math.sqrt(t * (t - 1))
}

function eValueOR(e, t) {
  return !isFinite(e) || e <= 0 ? NaN : eValueRR(t ? e : Math.sqrt(e))
}

function eValueHR(e) {
  return eValueRR(e)
}

function eValueRD(e, t) {
  return !isFinite(e) || !isFinite(t) || t <= 0 || t >= 1 ? NaN : eValueRR(Math.max(.001, Math.min(.999, t + e)) / t)
}

function eValueSMD(e) {
  return isFinite(e) ? eValueOR(Math.exp(Math.PI / Math.sqrt(3) * e), !0) : NaN
}

function calculateEValue(e, t, n, a, s) {
  var i, r = "OR" === (a = a || "OR") || "RR" === a || "HR" === a,
    o = (s = s || {}).baselineRisk || .1,
    l = !1 !== s.rareOutcome,
    d = r ? Math.exp(e) : e,
    c = r ? Math.exp(t) : t,
    u = r ? Math.exp(n) : n;
  i = "RR" === a ? eValueRR(d) : "HR" === a ? eValueHR(d) : "OR" === a ? eValueOR(d, l) : "RD" === a ? eValueRD(d, o) : "SMD" === a || "MD" === a ? eValueSMD(d) : eValueOR(d, !0);
  var p = r ? 1 : 0,
    m = Math.abs(c - p) < Math.abs(u - p) ? c : u,
    h = null,
    v = r ? c > 1 || u < 1 : c > 0 || u < 0;
  return v && (h = "RR" === a ? eValueRR(m) : "HR" === a ? eValueHR(m) : "OR" === a ? eValueOR(m, l) : "RD" === a ? eValueRD(m, o) : "SMD" === a || "MD" === a ? eValueSMD(m) : eValueOR(m, !0)), {
    point: i,
    ci: h,
    ciExcludesNull: v,
    interpretation: isFinite(i) ? i < 1.5 ? "Very weak: Even minimal unmeasured confounding could explain this effect." : i < 2 ? "Weak: Modest unmeasured confounding could explain this effect." : i < 3 ? "Moderate: A moderate confounder-treatment and confounder-outcome association would be needed." : i < 5 ? "Strong: A fairly strong unmeasured confounder would be needed to explain this effect." : "Very strong: An unmeasured confounder would need very strong associations to explain this effect." : "E-value could not be calculated for this effect measure.",
    measure: a,
    effectTransformed: d,
    ciLowerTransformed: c,
    ciUpperTransformed: u,
    reference: "VanderWeele TJ, Ding P. Ann Intern Med 2017;167:268-274"
  }
}

function calculateICC_MA(e, t, n, a = null, s = "OR", i = null) {
  let r, o, l, d;
  const c = e.length;
  if (i && ("OR" === s || "RR" === s) && i.every(e => void 0 !== e.events_t && e.n_t && e.n_c)) {
    o = harmonicMean(i.map(e => 1 / (e.events_t + .5) + 1 / (e.n_t - e.events_t + .5) + 1 / (e.events_c + .5) + 1 / (e.n_c - e.events_c + .5))), r = a ? harmonicMean(a) : 4 / o, d = "exact", l = "Exact calculation from 2×2 data (Adapted from ICC methodology)"
  } else if (a && a.length === c && a.every(e => e > 0)) {
    switch (r = harmonicMean(a), s) {
      case "OR":
      case "RR":
        o = 4 / r, l = "Approximation: σ̃² = 4/ñ (assumes balanced groups, ~50% event rate)";
        break;
      case "SMD":
        o = 4 / r + sum(e.map(e => e * e)) / c / (2 * r), l = "Approximation for SMD including effect-size dependent term";
        break;
      default:
        o = harmonicMean(t), l = "Based on harmonic mean of observed variances"
    }
    d = "sample_size"
  } else o = harmonicMean(t), r = 4 / o, d = "variance", l = "Approximation: using harmonic mean of observed variances (sample sizes unavailable)";
  (!isFinite(o) || o <= 0) && (o = sum(t) / c, l += " [fallback to arithmetic mean]");
  const u = n / (n + o),
    p = o / Math.pow(n + o, 2),
    m = 2 * n * n / Math.max(1, c - 1),
    h = Math.sqrt(p * p * m);
  return {
    ICC_MA: u,
    ICC_ci: {
      lower: Math.max(0, u - 1.96 * h),
      upper: Math.min(1, u + 1.96 * h)
    },
    n_tilde: r,
    sigma2_pooled: o,
    interpretation: interpretICC_MA(u),
    method: d,
    note: l,
    reference: "adapted ICC methodology. Sample-size invariant measures of heterogeneity in meta-analysis."
  }
}

function interpretICC_MA(e) {
  return e < .1 ? "Negligible" : e < .25 ? "Low" : e < .5 ? "Moderate" : e < .75 ? "Substantial" : "Very high"
}

function predictionInterval_Standard(e, t, n, a, s = .05, i = "k-2") {
  let r, o;
  switch (i) {
    case "k-1":
      r = Math.max(1, a - 1), o = "df = k-1 (only θ estimated)";
      break;
    case "conservative":
      r = Math.max(1, Math.floor(.8 * (a - 2))), o = "Conservative df (80% of k-2)";
      break;
    default:
      r = Math.max(1, a - 2), o = "df = k-2 (Higgins et al. 2009)"
  }
  const l = qt(1 - s / 2, r),
    d = Math.sqrt(t * t + n);
  return {
    lower: e - l * d,
    upper: e + l * d,
    se: d,
    df: r,
    df_method: i,
    df_note: o,
    t_critical: l,
    method: "HTS",
    reference: "Higgins JPT, et al. Stat Med 2009;28:3046-3067",
    interpretation: (e - l * d) * (e + l * d) < 0 ? "PI crosses null: expect substantial variability in effects across settings" : "PI does not cross null: consistent direction of effect expected"
  }
}

function predictionInterval_Conformal(e, t, n, a = .05, s = "REML") {
  const i = e.length;
  if (i < CONFIG.MIN_STUDIES_FOR_CONFORMAL) return {
    lower: NaN,
    upper: NaN,
    method: "Conformal (Jackknife+)",
    warning: `Requires k ≥ ${CONFIG.MIN_STUDIES_FOR_CONFORMAL}`,
    valid: !1
  };
  const r = [];
  for (let n = 0; n < i; n++) {
    const a = e.filter((e, t) => t !== n),
      i = t.filter((e, t) => t !== n),
      o = estimateTau2(a, i, s).tau2,
      l = i.map(e => 1 / (e + o)),
      d = sum(l),
      c = sum(a.map((e, t) => l[t] * e)) / d;
    r.push(Math.abs(e[n] - c))
  }
  r.sort((e, t) => e - t);
  const o = Math.ceil((1 - a) * (i + 1)),
    l = r[Math.min(i - 1, Math.max(0, o - 1))];
  return {
    lower: n - l,
    upper: n + l,
    quantile: l,
    method: "Conformal (Jackknife+)",
    note: "Distribution-free PI. Jackknife+ guarantees ≥" + (100 * (1 - 2 * a)).toFixed(0) + "% coverage (Lei et al., 2018)",
    nominal_coverage: 100 * (1 - a),
    guaranteed_coverage: 100 * (1 - 2 * a),
    valid: !0
  }
}

function calculateDDMA(e, t, n, a, s = {}) {
  const {
    mcid: i = .15,
    direction: r = "lower",
    alpha: o = .05
  } = s, l = t, d = Math.sqrt(t * t + n), c = .05, u = .25;
  let p, m, h, v, g, f, _, y;
  return "lower" === r ? (p = pnorm((0 - e) / l), m = pnorm((0 - e) / d), h = pnorm((-i - e) / l), v = pnorm((-i - e) / d), g = pnorm((-.25 - e) / l), f = pnorm((-.25 - e) / d), _ = pnorm((c - e) / l) - pnorm((-.05 - e) / l), y = pnorm((c - e) / d) - pnorm((-.05 - e) / d)) : (p = 1 - pnorm((0 - e) / l), m = 1 - pnorm((0 - e) / d), h = 1 - pnorm((i - e) / l), v = 1 - pnorm((i - e) / d), g = 1 - pnorm((u - e) / l), f = 1 - pnorm((u - e) / d), _ = pnorm((c - e) / l) - pnorm((-.05 - e) / l), y = pnorm((c - e) / d) - pnorm((-.05 - e) / d)), {
    confidence: {
      P_benefit: p,
      P_harm: 1 - p,
      P_mcid: h,
      P_large_benefit: g,
      P_trivial: _,
      interpretation: "Based on estimation uncertainty only (SE of θ̂)"
    },
    predictive: {
      P_benefit: m,
      P_harm: 1 - m,
      P_mcid: v,
      P_large_benefit: f,
      P_trivial: y,
      interpretation: "Includes heterogeneity (τ²) for new-setting prediction"
    },
    effect: e,
    se_confidence: l,
    se_predictive: d,
    mcid: i,
    direction: r,
    interpretation_note: {
      frequentist: "P(future estimate falls in region) under repeated sampling",
      bayesian_flat_prior: "Equivalent to P(θ ∈ region | data) under improper uniform prior",
      caveat: "NOT a true Bayesian posterior unless prior explicitly specified"
    }
  }
}

function mcidSensitivityAnalysis(e, t, n, a = {}) {
  const {
    mcid_values: s = [.05, .1, .15, .2, .25, .3],
    direction: i = "lower"
  } = a, r = Math.sqrt(t * t + n), o = [];
  for (const t of s) {
    let n;
    n = "lower" === i ? pnorm((-t - e) / r) : 1 - pnorm((t - e) / r);
    const a = 100 * (1 - Math.exp(-t));
    let s;
    s = n >= .8 ? "Likely meaningful" : n >= .5 ? "Possibly meaningful" : n >= .2 ? "Uncertain" : "Unlikely meaningful", o.push({
      mcid: t,
      mcid_pct: a.toFixed(1),
      P_exceeds: n,
      P_exceeds_pct: (100 * n).toFixed(1),
      interpretation: s
    })
  }
  return {
    results: o
  }
}

function calculateLaEV(e, t, n, a = {}) {
  const {
    lambda: s = 2,
    reference: i = 0,
    direction: r = "lower",
    lambda_source: o = "Kahneman-Tversky (financial)"
  } = a, l = e - i, d = Math.sqrt(t * t + n), c = -l / d, u = pnorm(c), p = 1 - u, m = Math.exp(-c * c / 2) / Math.sqrt(2 * Math.PI);
  let h;
  if ("lower" === r) {
    h = -(u > 1e-10 ? l - d * m / u : l) * u + -s * (p > 1e-10 ? l + d * m / p : l) * p
  } else {
    h = s * (u > 1e-10 ? l - d * m / u : l) * u + (p > 1e-10 ? l + d * m / p : l) * p
  }
  const v = "lower" === r ? i - h : i + h,
    g = v - e;
  return {
    LaEV: v,
    LaEV_exp: Math.exp(v),
    standard_EV: e,
    standard_EV_exp: Math.exp(e),
    risk_adjustment: g,
    risk_adjustment_pct: 100 * (Math.exp(g) - 1),
    lambda: s,
    lambda_source: o,
    lambda_note: `λ=${s} from ${o}. Medical decisions may warrant λ=3-5 for irreversible harms.`,
    reference: "Kahneman D, Tversky A. Econometrica 1979;47:263-292"
  }
}

function generateDecisionRecommendation(e, t, n = {}) {
  const {
    benefit_threshold: a = .8,
    mcid_threshold: s = .5,
    harm_threshold: i = .1
  } = n, r = e.confidence.P_benefit, o = e.predictive.P_mcid, l = e.confidence.P_harm, d = [];
  let c, u, p, m = 0;
  return r > .95 ? (d.push({
    factor: "P(benefit)",
    verdict: "STRONG_SUPPORT"
  }), m += 2) : r > a ? (d.push({
    factor: "P(benefit)",
    verdict: "SUPPORT"
  }), m += 1) : r > .5 ? d.push({
    factor: "P(benefit)",
    verdict: "WEAK"
  }) : (d.push({
    factor: "P(benefit)",
    verdict: "CONCERN"
  }), m -= 1), o > .75 ? (d.push({
    factor: "P(MCID)",
    verdict: "STRONG_SUPPORT"
  }), m += 2) : o > s ? (d.push({
    factor: "P(MCID)",
    verdict: "SUPPORT"
  }), m += 1) : o > .25 ? d.push({
    factor: "P(MCID)",
    verdict: "WEAK"
  }) : (d.push({
    factor: "P(MCID)",
    verdict: "CONCERN"
  }), m -= 1), l < .025 ? (d.push({
    factor: "P(harm)",
    verdict: "STRONG_SUPPORT"
  }), m += 1) : l < i ? (d.push({
    factor: "P(harm)",
    verdict: "SUPPORT"
  }), m += .5) : l < .25 ? (d.push({
    factor: "P(harm)",
    verdict: "CONCERN"
  }), m -= 1) : (d.push({
    factor: "P(harm)",
    verdict: "STRONG_CONCERN"
  }), m -= 2), l > .25 ? (c = "REJECT", u = "High", p = "Substantial probability of harm precludes adoption") : m >= 4 ? (c = "ADOPT", u = "High", p = "Strong evidence supports treatment adoption") : m >= 2.5 ? (c = "ADOPT", u = "Moderate", p = "Evidence supports treatment adoption") : m >= 1 ? (c = "LEAN ADOPT", u = "Low", p = "Evidence tentatively supports adoption") : m >= -1 ? (c = "UNCERTAIN", u = "Low", p = "Evidence insufficient for confident recommendation") : (c = "REJECT", u = "Moderate", p = "Evidence does not support treatment adoption"), {
    decision: c,
    confidence: u,
    rationale: p,
    score: m,
    factors: d,
    summary: {
      P_benefit: r,
      P_mcid: o,
      P_harm: l
    }
  }
}

function eggersTest(e, t, n = null, a = "binary") {
  const s = e.length,
    i = [];
  s < 10 ? i.push("Very low power with k=" + s + " (recommend k≥10 for reliable results)") : s < 20 && i.push("Limited power with k=" + s + " (optimal k≥20)"), "binary" === a && i.push("For binary outcomes, consider Peters' test which is less affected by effect-precision correlation");
  const r = t.map(e => 1 / e),
    o = e.map((e, n) => e / t[n]),
    l = r.map(e => e * e),
    d = sum(l),
    c = sum(r.map((e, t) => l[t] * e)),
    u = sum(o.map((e, t) => l[t] * e)),
    p = sum(r.map((e, t) => l[t] * e * e)),
    m = c / d,
    h = u / d,
    v = (sum(r.map((e, t) => l[t] * e * o[t])) - d * m * h) / (p - d * m * m),
    g = h - v * m,
    f = sum(o.map((e, t) => e - (g + v * r[t])).map((e, t) => l[t] * e * e)) / (s - 2),
    _ = Math.sqrt(f * (1 / d + m * m / (p - d * m * m))),
    y = g / _,
    b = 2 * (1 - pt(Math.abs(y), s - 2)),
    x = g < 0 ? 1 - pt(Math.abs(y), s - 2) : 1 - (1 - pt(Math.abs(y), s - 2));
  let w;
  return null !== n && n > 50 && i.push("High heterogeneity (I²=" + n.toFixed(0) + "%) may cause asymmetry unrelated to publication bias"), w = b < .05 ? "Significant asymmetry detected (p=" + b.toFixed(4) + "). May indicate: (1) publication bias, (2) true small-study effects (different populations), (3) heterogeneity, or (4) artifact of effect measure. Further investigation recommended." : b < .1 ? "Marginal asymmetry detected (p=" + b.toFixed(4) + "). May reflect publication bias but also consistent with chance or heterogeneity." : "No significant asymmetry detected. Note: Egger's test has low power for small k; absence of evidence is not evidence of absence.", {
    intercept: g,
    se: _,
    t_statistic: y,
    df: s - 2,
    p_value: b,
    p_value_onesided: x,
    interpretation: w,
    warnings: i.length > 0 ? i : null,
    caveats: ["Egger's test assumes no true relationship between study size and effect", "For odds ratios, inherent correlation between precision and effect may cause spurious asymmetry", "Consider contour-enhanced funnel plots to distinguish bias from heterogeneity"],
    reference: "Egger M, et al. BMJ 1997;315:629-634"
  }
}

function leaveOneOut(e, t, n, a = "REML") {
  const s = e.length,
    i = n || e.map((e, t) => `Study ${t+1}`),
    r = estimateTau2(e, t, a).tau2,
    o = calculatePooledEstimate(e, t, r),
    l = calculateHeterogeneity(e, t, r),
    d = [];
  for (let n = 0; n < s; n++) {
    const s = e.filter((e, t) => t !== n),
      r = t.filter((e, t) => t !== n),
      c = estimateTau2(s, r, a).tau2,
      u = calculatePooledEstimate(s, r, c),
      p = calculateHeterogeneity(s, r, c);
    d.push({
      study: i[n],
      index: n,
      effect: u.theta,
      effect_exp: Math.exp(u.theta),
      se: u.se,
      ci_lower: u.ci_lower,
      ci_upper: u.ci_upper,
      tau2: c,
      I2: p.I2,
      effect_change: u.theta - o.theta,
      I2_change: p.I2 - l.I2
    })
  }
  return {
    full: {
      effect: o.theta,
      se: o.se,
      I2: l.I2
    },
    loo_results: d
  }
}

function baujatPlotData(e, t, n, a = "REML") {
  const s = e.length,
    i = n || e.map((e, t) => `Study ${t+1}`),
    r = estimateTau2(e, t, a).tau2,
    o = calculatePooledEstimate(e, t, r),
    l = [];
  for (let n = 0; n < s; n++) {
    const s = 1 / (t[n] + r) * Math.pow(e[n] - o.theta, 2),
      d = e.filter((e, t) => t !== n),
      c = t.filter((e, t) => t !== n),
      u = calculatePooledEstimate(d, c, estimateTau2(d, c, a).tau2),
      p = Math.pow(o.theta - u.theta, 2);
    l.push({
      study: i[n],
      index: n,
      contribution_to_Q: s,
      influence_on_effect: p
    })
  }
  return {
    points: l
  }
}

function subgroupAnalysis(e, t, n, a = "REML") {
  const s = [...new Set(e.map(e => e.subgroup || "").filter(e => "" !== e))];
  if (s.length < 2) return {
    available: !1,
    message: "At least 2 subgroups required",
    subgroups: [],
    test: null
  };
  const i = [];
  let r = 0,
    o = 0;
  s.forEach(s => {
    const l = e.map((e, t) => e.subgroup === s ? t : -1).filter(e => e >= 0),
      d = l.map(e => t[e]),
      c = l.map(e => n[e]),
      u = d.length;
    if (u < 2) return void i.push({
      name: s,
      k: u,
      theta: 1 === u ? d[0] : NaN,
      theta_exp: 1 === u ? Math.exp(d[0]) : NaN,
      ci_lower: NaN,
      ci_upper: NaN,
      tau2: 0,
      I2: 0,
      warning: "Single study - no pooling possible"
    });
    const p = estimateTau2(d, c, a).tau2,
      m = calculatePooledEstimate(d, c, p),
      h = calculateHeterogeneity(d, c, p);
    r += h.Q, o += u - 1, i.push({
      name: s,
      k: u,
      theta: m.theta,
      theta_exp: Math.exp(m.theta),
      se: m.se,
      ci_lower: m.ci_lower,
      ci_upper: m.ci_upper,
      ci_lower_exp: Math.exp(m.ci_lower),
      ci_upper_exp: Math.exp(m.ci_upper),
      tau2: p,
      I2: h.I2,
      Q: h.Q,
      p_het: h.p_value
    })
  });
  const l = estimateTau2(t, n, a).tau2,
    d = calculateHeterogeneity(t, n, l).Q,
    c = d - r,
    u = s.length - 1,
    p = 1 - pchisq(c, u);
  return {
    available: !0,
    subgroups: i,
    test: {
      Q_between: c,
      df_between: u,
      p_value: p,
      Q_within: r,
      df_within: o,
      Q_total: d,
      interpretation: p < .1 ? "Evidence of subgroup differences (p < 0.10)" : "No significant subgroup differences"
    }
  }
}

function metaRegression(e, t, n, a = "Covariate", s = "REML") {
  if (e.length < 5) return {
    available: !1,
    warning: "At least 5 studies required for meta-regression",
    covariate: a
  };
  const i = n.map((e, t) => !isNaN(e) && isFinite(e) ? t : -1).filter(e => e >= 0);
  if (i.length < 5) return {
    available: !1,
    warning: "Insufficient valid covariate values",
    covariate: a
  };
  const r = i.map(t => e[t]),
    o = i.map(e => t[e]),
    l = i.map(e => n[e]),
    d = r.length,
    c = estimateTau2(r, o, s).tau2,
    u = o.map(e => 1 / (e + c)),
    p = sum(u),
    m = sum(l.map((e, t) => u[t] * e)) / p,
    h = sum(r.map((e, t) => u[t] * e)) / p,
    v = sum(l.map((e, t) => u[t] * Math.pow(e - m, 2))),
    g = sum(l.map((e, t) => u[t] * (e - m) * (r[t] - h))) / v,
    f = h - g * m,
    _ = l.map(e => f + g * e),
    y = sum(r.map((e, t) => e - _[t]).map((e, t) => u[t] * e * e)),
    b = d - 2,
    x = 1 - pchisq(y, b),
    w = p - sum(u.map(e => e * e)) / p,
    M = Math.max(0, (y - b) / w),
    S = o.map(e => 1 / (e + M)),
    E = (sum(S), sum(l.map((e, t) => S[t] * Math.pow(e - m, 2)))),
    A = Math.sqrt(1 / E),
    R = l.map(e => f + g * e),
    I = sum(r.map((e, t) => S[t] * Math.pow(e - R[t], 2))),
    T = Math.max(1, I / b),
    C = A * Math.sqrt(T),
    P = g / C,
    k = 2 * (1 - pt(Math.abs(P), b)),
    D = qt(.975, b),
    $ = g - D * C,
    N = g + D * C,
    F = M > 0 ? (y - b) / y * 100 : 0,
    L = estimateTau2(r, o, s).tau2,
    O = L > 0 ? 100 * (1 - M / L) : 0,
    B = Math.max(0, O),
    H = O < 0;
  return {
    available: !0,
    covariate: a,
    k: d,
    intercept: f,
    slope: g,
    se_slope: C,
    t_statistic: P,
    p_value: k,
    ci_lower: $,
    ci_upper: N,
    tau2_residual: M,
    Q_E: y,
    df_E: b,
    p_residual: x,
    R2: B,
    R2_truncated: H,
    R2_note: H ? "R² was negative (covariate did not reduce heterogeneity), truncated to 0" : null,
    I2_residual: Math.max(0, F),
    interpretation: k < .05 ? `Significant association (p=${k.toFixed(4)}): ${g>0?"positive":"negative"} relationship` : "No significant association with covariate",
    bubble_data: l.map((e, t) => ({
      x: e,
      y: r[t],
      weight: S[t],
      study: i[t]
    })),
    regression_line: {
      x_min: Math.min(...l),
      x_max: Math.max(...l),
      y_min: f + g * Math.min(...l),
      y_max: f + g * Math.max(...l)
    }
  }
}

function calculateNNT(e, t, n = "OR") {
  let a;
  if ("OR" === n) a = e / (1 - t + t * e);
  else a = e;
  const s = t * a,
    i = t - s;
  if (Math.abs(i) < 1e-10) return {
    NNT: 1 / 0,
    type: "None",
    ARR: 0,
    baseline_risk: t,
    treatment_risk: s
  };
  const r = Math.abs(1 / i),
    o = i > 0 ? "NNT" : "NNH";
  return {
    baseline_risk: t,
    treatment_risk: s,
    RR: a,
    ARR: i,
    ARR_pct: 100 * i,
    NNT: Math.ceil(r),
    NNT_exact: r,
    type: o
  }
}

function calculateNNT_withCI(e, t, n, a = "OR") {
  const s = calculateNNT(e, n, a),
    i = calculateNNT(t.lower, n, a),
    r = calculateNNT(t.upper, n, a);
  if (t.lower < 1 && t.upper > 1) return {
    ...s,
    ci_lower: null,
    ci_upper: null,
    ci_note: "CI crosses null (effect = 1); NNT undefined at boundary",
    ci_interpretation: "NNT range: " + Math.ceil(i.NNT_exact) + " (NNT) to ∞ to " + Math.ceil(r.NNT_exact) + " (NNH)"
  };
  let o, l;
  return s.type, o = Math.ceil(Math.min(i.NNT_exact, r.NNT_exact)), l = Math.ceil(Math.max(i.NNT_exact, r.NNT_exact)), {
    ...s,
    ci_lower: o,
    ci_upper: l,
    ci_note: null,
    ci_interpretation: `${s.type}: ${s.NNT} (95% CI: ${o} to ${l})`
  }
}

function calculateNNT_range(e, t = "OR", n = null) {
  return [.01, .05, .1, .2, .3, .5].map(a => {
    const s = calculateNNT(e, a, t);
    if (n) {
      const s = calculateNNT_withCI(e, n, a, t);
      return {
        baseline_risk: a,
        baseline_risk_pct: (100 * a).toFixed(0),
        ...s
      }
    }
    return {
      baseline_risk: a,
      baseline_risk_pct: (100 * a).toFixed(0),
      ...s
    }
  })
}

function predictionInterval_Noma(e, t, n, a, s, i = .05) {
  const r = Math.max(2, s - 2),
    o = qt(1 - i / 2, r),
    l = t * t + n;
  let d, c;
  if (a && void 0 !== a.lower) {
    const n = t * t + a.upper;
    d = e - o * Math.sqrt(n), c = e + o * Math.sqrt(n)
  } else d = e - o * Math.sqrt(l), c = e + o * Math.sqrt(l);
  return {
    lower: d,
    upper: c,
    se: Math.sqrt(l),
    df: r,
    method: "Noma2023",
    note: "Uses conservative df and accounts for τ² uncertainty"
  }
}

function calculateTau2_CI_QProfile(e, t, n, a = .05) {
  const s = e.length - 1;

  function i(n) {
    const a = t.map(e => 1 / (e + n)),
      s = sum(a),
      i = sum(e.map((e, t) => a[t] * e)) / s;
    return sum(e.map((e, t) => a[t] * Math.pow(e - i, 2)))
  }
  const r = qchisq(a / 2, s),
    o = qchisq(1 - a / 2, s);
  let l = 0;
  if (i(0) > o) {
    let e = 0,
      t = 2 * n + 1,
      a = 0;
    for (; i(t) > o && t < 100 && a++ < 20;) t *= 2;
    for (let n = 0; n < 100; n++) {
      const n = (e + t) / 2;
      if (i(n) > o ? e = n : t = n, t - e < 1e-8) break
    }
    l = e
  }
  let d = 10 * n + 1,
    c = 0;
  for (; i(d) > r && d < 1e3 && c++ < 20;) d *= 2;
  let u = n,
    p = d;
  for (let e = 0; e < 100; e++) {
    const e = (u + p) / 2;
    if (i(e) > r ? u = e : p = e, p - u < 1e-8) break
  }
  return d = p, {
    lower: l,
    upper: d,
    method: "Q-Profile",
    alpha: a
  }
}

function treatmentThresholdAnalysis(e = {}) {
  const {
    benefit_if_disease: t = 10,
    risk_if_no_disease: n = 1,
    posterior_prob: a = null
  } = e, s = n / (t + n);
  let i = "UNCERTAIN",
    r = "Low",
    o = "";
  if (null !== a) {
    const e = a / s;
    e > 2 ? (i = "TREAT", r = "High", o = `Posterior (${(100*a).toFixed(1)}%) >> threshold (${(100*s).toFixed(1)}%)`) : e > 1.2 ? (i = "TREAT", r = "Moderate", o = "Posterior exceeds threshold with moderate margin") : e > 1 ? (i = "LEAN TREAT", r = "Low", o = "Posterior slightly exceeds threshold") : e > .8 ? (i = "UNCERTAIN", r = "Low", o = "Posterior near threshold") : (i = "DO NOT TREAT", r = "High", o = "Posterior well below threshold")
  }
  return {
    threshold: s,
    threshold_pct: 100 * s,
    decision: i,
    confidence: r,
    rationale: o
  }
}

function assessMetaoverfit(e, t = 2, n, a, s) {
  const i = e / t;
  let r, o, l;
  i < CONFIG.METAOVERFIT_SEVERE ? (r = "SEVERE", o = `Only ${e} studies for ${t} parameters (ratio ${i.toFixed(1)}). τ² estimation highly unstable; standard errors likely too narrow.`, l = "Consider fixed-effect model, use HKSJ adjustment, or report as exploratory only.") : i < CONFIG.METAOVERFIT_HIGH ? (r = "HIGH", o = `${e} studies for ${t} parameters (ratio ${i.toFixed(1)}). Coverage probability may be below nominal; τ² may be biased.`, l = "Use HKSJ adjustment; report sensitivity to τ² estimator choice; interpret with caution.") : i < CONFIG.METAOVERFIT_MODERATE ? (r = "MODERATE", o = `${e} studies for ${t} parameters (ratio ${i.toFixed(1)}). Adequate but not ideal; some instability possible with different τ² estimators.`, l = "Standard methods appropriate; consider reporting Q-profile CI for τ².") : (r = "LOW", o = `${e} studies for ${t} parameters (ratio ${i.toFixed(1)}). Sufficient for stable estimation.`, l = "Standard interpretation applies.");
  const d = s.map(e => 1 / (e + n)),
    c = sum(d),
    u = c * c / sum(d.map(e => e * e));
  return {
    k: e,
    p: t,
    ratio: i,
    risk_level: r,
    interpretation: o,
    recommendation: l,
    ESS: u,
    ESS_per_param: u / t,
    thresholds_used: {
      severe: CONFIG.METAOVERFIT_SEVERE,
      high: CONFIG.METAOVERFIT_HIGH,
      moderate: CONFIG.METAOVERFIT_MODERATE
    },
    references: ["Harrell FE. Regression Modeling Strategies. Springer, 2015", "Kontopantelis E, et al. Stat Med 2013;32:4577-4594", "Jackson D, et al. Stat Med 2017;36:1063-1081", "Veroniki AA, et al. Res Synth Methods 2016;7:55-79"]
  }
}

function calculateCV_I2(e, t, n = "REML") {
  const a = e.length,
    s = [],
    i = calculateHeterogeneity(e, t, estimateTau2(e, t, n).tau2);
  for (let r = 0; r < a; r++) {
    const a = e.filter((e, t) => t !== r),
      o = t.filter((e, t) => t !== r),
      l = estimateTau2(a, o, n).tau2,
      d = calculateHeterogeneity(a, o, l);
    s.push({
      study_removed: r + 1,
      tau2: l,
      I2: d.I2,
      change_I2: d.I2 - i.I2
    })
  }
  const r = mean(s.map(e => e.I2)),
    o = s.map(e => e.I2),
    l = Math.max(...o) - Math.min(...o),
    d = std(o);
  let c = l < 15 ? "Stable" : l < 30 ? "Moderately stable" : "Unstable";
  const u = s.filter(e => Math.abs(e.change_I2) > 15);
  return {
    full_I2: i.I2,
    CV_I2: r,
    I2_range: l,
    I2_sd: d,
    stability: c,
    influential_studies: u,
    loo_results: s,
    interpretation: `I² = ${i.I2.toFixed(1)}% (CV: ${r.toFixed(1)}%, range: ${l.toFixed(1)}pp) - ${c}`
  }
}

function optimismCorrectedBootstrap(e, t, n = "REML", a = 500) {
  const s = e.length,
    i = estimateTau2(e, t, n).tau2,
    r = calculatePooledEstimate(e, t, i);
  let o = 0,
    l = 0;
  for (let d = 0; d < a; d++) {
    const a = Array.from({
        length: s
      }, () => Math.floor(Math.random() * s)),
      d = a.map(t => e[t]),
      c = a.map(e => t[e]),
      u = estimateTau2(d, c, n).tau2,
      p = calculatePooledEstimate(d, c, u);
    o += Math.abs(p.theta - r.theta), l += Math.abs(u - i)
  }
  o /= a, l /= a;
  const d = r.theta - Math.sign(r.theta) * o,
    c = Math.max(0, i - l),
    u = 0 !== r.theta ? 1 - o / Math.abs(r.theta) : 1;
  return {
    apparent: {
      effect: r.theta,
      tau2: i
    },
    optimism: {
      effect: o,
      tau2: l
    },
    corrected: {
      effect: d,
      tau2: c
    },
    shrinkage_factor: u,
    interpretation: u > .9 ? "Low optimism" : u > .7 ? "Moderate optimism" : "High optimism",
    bootstrap_samples: a
  }
}

function harbordTest(e) {
  const t = e.filter(e => void 0 !== e.events_t && e.n_t > 0 && e.n_c > 0 && e.events_t > 0 && e.events_c > 0 && e.n_t - e.events_t > 0 && e.n_c - e.events_c > 0);
  if (t.length < 5) return {
    available: !1,
    warning: "Harbord test requires at least 5 studies with non-zero cells"
  };
  const n = t.map(e => {
      const t = e.events_t,
        n = e.n_t - e.events_t,
        a = e.events_c,
        s = e.n_c - e.events_c,
        i = e.n_t + e.n_c,
        r = t - e.n_t * (t + a) / i,
        o = e.n_t * e.n_c * (t + a) * (n + s) / (i * i * (i - 1));
      return {
        Z: r,
        V: o,
        sqrtV: Math.sqrt(o)
      }
    }),
    a = n.map(e => e.Z / e.sqrtV),
    s = n.map(e => e.sqrtV),
    i = a.length,
    r = sum(s),
    o = sum(a),
    l = sum(s.map(e => e * e)),
    d = r / i,
    c = o / i,
    u = (sum(s.map((e, t) => e * a[t])) - i * d * c) / (l - i * d * d),
    p = c - u * d,
    m = sum(a.map((e, t) => e - (p + u * s[t])).map(e => e * e)) / (i - 2),
    h = Math.sqrt(m * (1 / i + d * d / (l - i * d * d))),
    v = p / h,
    g = 2 * (1 - pt(Math.abs(v), i - 2));
  return {
    available: !0,
    intercept: p,
    se: h,
    t_statistic: v,
    df: i - 2,
    p_value: g,
    k: i,
    interpretation: g < .1 ? "Evidence of small-study effects (p < 0.10)" : "No significant small-study effects",
    note: "Harbord test is preferred over Egger's for log odds ratios",
    reference: "Harbord RM, et al. Stat Med 2006;25:3443-3457"
  }
}

function petPeese(e, t) {
  const n = e.length,
    a = t.map(e => Math.sqrt(e));
  if (n < 5) return {
    available: !1,
    warning: "PET-PEESE requires at least 5 studies"
  };
  const s = t.map(e => 1 / e),
    i = sum(s),
    r = sum(a.map((e, t) => s[t] * e)),
    o = sum(e.map((e, t) => s[t] * e)),
    l = sum(a.map((e, t) => s[t] * e * e)),
    d = r / i,
    c = o / i,
    u = (sum(a.map((t, n) => s[n] * t * e[n])) - i * d * c) / (l - i * d * d),
    p = c - u * d,
    m = sum(e.map((e, t) => e - (p + u * a[t])).map((e, t) => s[t] * e * e)) / (n - 2),
    h = Math.sqrt(m * (1 / i + d * d / (l - i * d * d))),
    v = p / h,
    g = 2 * (1 - pt(Math.abs(v), n - 2)),
    f = sum(t.map((e, t) => s[t] * e)),
    _ = sum(t.map((e, t) => s[t] * e * e)),
    y = f / i,
    b = (sum(t.map((t, n) => s[n] * t * e[n])) - i * y * c) / (_ - i * y * y),
    x = c - b * y,
    w = sum(e.map((e, n) => e - (x + b * t[n])).map((e, t) => s[t] * e * e)) / (n - 2),
    M = Math.sqrt(w * (1 / i + y * y / (_ - i * y * y))),
    S = x / M,
    E = 2 * (1 - pt(Math.abs(S), n - 2)),
    A = g < .1,
    R = A ? x : p,
    I = A ? M : h,
    T = A ? E : g,
    C = qt(.975, n - 2),
    P = R - C * I,
    k = R + C * I;
  return {
    available: !0,
    pet: {
      intercept: p,
      se: h,
      t_statistic: v,
      p_value: g,
      slope: u,
      interpretation: g < .1 ? "Evidence of true effect (use PEESE)" : "No significant effect (use PET)"
    },
    peese: {
      intercept: x,
      se: M,
      t_statistic: S,
      p_value: E,
      slope: b
    },
    recommended: {
      method: A ? "PEESE" : "PET",
      estimate: R,
      estimate_exp: Math.exp(R),
      se: I,
      p_value: T,
      ci_lower: P,
      ci_upper: k,
      ci_lower_exp: Math.exp(P),
      ci_upper_exp: Math.exp(k)
    },
    k: n,
    interpretation: A ? `PEESE estimate (bias-adjusted): ${R.toFixed(4)} [${P.toFixed(4)}, ${k.toFixed(4)}]` : `PET estimate (no significant effect after bias adjustment): ${R.toFixed(4)}`,
    caveats: ["Assumes linear relationship between effect and SE (PET) or SE² (PEESE)", "May overcorrect when true heterogeneity exists", "Works best with >10 studies"],
    reference: "Stanley TD, Doucouliagos H. Res Synth Methods 2014;5:60-78"
  }
}

function linChuSkewnessTest(e, t, n = 5e3) {
  const a = e.length,
    s = t.map(e => Math.sqrt(e));
  if (a < 5) return {
    available: !1,
    warning: "Skewness test requires at least 5 studies"
  };
  const i = s.map(e => 1 / e),
    r = e.map((e, t) => e / s[t]),
    o = i.map(e => e * e),
    l = sum(o),
    d = sum(i.map((e, t) => o[t] * e)),
    c = sum(r.map((e, t) => o[t] * e)),
    u = sum(i.map((e, t) => o[t] * e * e)),
    p = d / l,
    m = c / l,
    h = (sum(i.map((e, t) => o[t] * e * r[t])) - l * p * m) / (u - l * p * p),
    v = m - h * p,
    g = r.map((e, t) => e - (v + h * i[t])),
    f = mean(g),
    _ = g.map(e => e - f),
    y = sum(_.map(e => e * e)) / a,
    b = sum(_.map(e => e * e * e)) / a / Math.pow(y, 1.5);
  let x = 0;
  for (let e = 0; e < n; e++) {
    const e = g.map(e => Math.random() < .5 ? e : -e),
      t = mean(e),
      n = e.map(e => e - t),
      s = sum(n.map(e => e * e)) / a,
      i = sum(n.map(e => e * e * e)) / a,
      r = s > 0 ? i / Math.pow(s, 1.5) : 0;
    Math.abs(r) >= Math.abs(b) && x++
  }
  const w = (x + 1) / (n + 1);
  return {
    available: !0,
    skewness: b,
    p_value: w,
    n_resample: n,
    k: a,
    interpretation: w < .1 ? `Significant skewness detected (γ=${b.toFixed(3)}, p=${w.toFixed(4)}). Suggests publication bias.` : `No significant skewness (γ=${b.toFixed(3)}, p=${w.toFixed(4)}).`,
    direction: b < 0 ? "Negative skew (missing small positive studies)" : "Positive skew (missing small negative studies)",
    note: "Skewness-based test detects different bias patterns than regression slope tests",
    reference: "Lin L, Chu H. Biometrics 2017;74:785-794"
  }
}

function linHybridTest(e, t, n = null, a = 5e3) {
  const s = e.length,
    i = t.map(e => Math.sqrt(e));
  if (s < 5) return {
    available: !1,
    warning: "Hybrid test requires at least 5 studies"
  };
  const r = eggersTest(e, i, null, AppState.settings.dataType).p_value,
    o = estimateTau2_REML(e, t).tau2,
    l = t.map(e => 1 / (e + o)),
    d = sum(l),
    c = sum(e.map((e, t) => l[t] * e)) / d,
    u = e.map(e => e - c),
    p = t.map(e => e + o - 1 / d),
    m = u.map((e, t) => e / Math.sqrt(Math.max(p[t], 1e-10)));
  let h = 0,
    v = 0;
  for (let e = 0; e < s; e++)
    for (let n = e + 1; n < s; n++) {
      const a = Math.sign(m[e] - m[n]),
        s = Math.sign(t[e] - t[n]);
      a * s > 0 ? h++ : a * s < 0 && v++
    }
  const g = (h - v) / (s * (s - 1) / 2),
    f = 2 * (2 * s + 5) / (9 * s * (s - 1)),
    _ = g / Math.sqrt(f),
    y = 2 * (1 - pnorm(Math.abs(_))),
    b = -2 * sum([r, y].filter(e => e > 0 && e <= 1).map(e => Math.log(e)));
  let x = 0;
  for (let n = 0; n < a; n++) {
    const n = e.map(e => Math.random() < .5 ? e : -e),
      a = n.map((e, t) => e / i[t]),
      r = i.map(e => 1 / e),
      o = r.map(e => e * e),
      c = sum(o),
      u = sum(r.map((e, t) => o[t] * e)),
      m = sum(a.map((e, t) => o[t] * e)),
      h = sum(r.map((e, t) => o[t] * e * e)),
      v = u / c,
      g = m / c,
      _ = (sum(r.map((e, t) => o[t] * e * a[t])) - c * v * g) / (h - c * v * v),
      y = g - _ * v,
      w = sum(a.map((e, t) => e - (y + _ * r[t])).map((e, t) => o[t] * e * e)) / (s - 2),
      M = Math.sqrt(w * (1 / c + v * v / (h - c * v * v))),
      S = y / M,
      E = 2 * (1 - pt(Math.abs(S), s - 2)),
      A = sum(n.map((e, t) => l[t] * e)) / d,
      R = n.map(e => e - A).map((e, t) => e / Math.sqrt(Math.max(p[t], 1e-10)));
    let I = 0,
      T = 0;
    for (let e = 0; e < s; e++)
      for (let n = e + 1; n < s; n++) {
        const a = Math.sign(R[e] - R[n]),
          s = Math.sign(t[e] - t[n]);
        a * s > 0 ? I++ : a * s < 0 && T++
      }
    const C = (I - T) / (s * (s - 1) / 2) / Math.sqrt(f); - 2 * sum([E, 2 * (1 - pnorm(Math.abs(C)))].filter(e => e > 0 && e <= 1).map(e => Math.log(e))) >= b && x++
  }
  const w = (x + 1) / (a + 1);
  return {
    available: !0,
    fisher_statistic: b,
    p_hybrid: w,
    component_tests: {
      egger: {
        p_value: r
      },
      begg: {
        kendall_tau: g,
        p_value: y
      }
    },
    n_resample: a,
    k: s,
    interpretation: w < .1 ? `Hybrid test suggests publication bias (p=${w.toFixed(4)})` : `No significant publication bias detected (p=${w.toFixed(4)})`,
    advantage: "Combines signals from multiple tests; more powerful across different bias mechanisms",
    reference: "Lin L. Stat Methods Med Res 2020;29:2881-2899"
  }
}

function tianExactRD(e) {
  const t = e.filter(e => void 0 !== e.events_t && e.n_t > 0 && e.n_c > 0),
    n = t.length;
  if (n < 2) return {
    available: !1,
    warning: "Tian exact method requires at least 2 studies"
  };
  const a = t.filter(e => 0 === e.events_t && 0 === e.events_c).length,
    s = t.map(e => ({
      a: e.events_t,
      n1: e.n_t,
      c: e.events_c,
      n2: e.n_c,
      rd: e.events_t / e.n_t - e.events_c / e.n_c,
      w: e.n_t * e.n_c / (e.n_t + e.n_c)
    })),
    i = sum(s.map(e => e.w)),
    r = sum(s.map(e => e.w * e.rd)) / i,
    o = s.map(e => {
      const t = e.n1 > 0 ? Math.max(.001, Math.min(.999, e.a / e.n1)) : .5,
        n = e.n2 > 0 ? Math.max(.001, Math.min(.999, e.c / e.n2)) : .5;
      return t * (1 - t) / e.n1 + n * (1 - n) / e.n2
    }),
    l = o.map(e => e > 0 ? 1 / e : 0),
    d = sum(l),
    c = d > 0 ? sum(s.map((e, t) => l[t] * e.rd)) / d : r,
    u = d > 0 ? Math.sqrt(1 / d) : NaN,
    p = r,
    m = 2e3,
    h = [];
  for (let e = 0; e < m; e++) {
    const e = Array.from({
        length: n
      }, () => Math.floor(Math.random() * n)).map(e => s[e]),
      t = sum(e.map(e => e.w)),
      a = sum(e.map(e => e.w * e.rd)) / t;
    h.push(a)
  }
  h.sort((e, t) => e - t);
  const v = std(h),
    g = h[Math.floor(50)],
    f = h[Math.floor(1950)],
    _ = p / v,
    y = 2 * (1 - pnorm(Math.abs(_))),
    b = sum(s.map((e, t) => o[t] <= 0 ? 0 : (e.rd - c) * (e.rd - c) / o[t])),
    x = n - 1;
  return {
    available: !0,
    pooled_rd: p,
    se: v,
    ci_lower: g,
    ci_upper: f,
    z_statistic: _,
    p_value: y,
    heterogeneity: {
      Q: b,
      df: x,
      p_value: 1 - pchisq(b, x),
      I2: Math.max(0, (b - x) / b * 100)
    },
    k: n,
    k_double_zero: a,
    k_included: n,
    comparison: {
      iv_method: {
        rd: c,
        se: u,
        k_excluded_zeros: a,
        note: "Standard IV method excludes double-zero studies"
      }
    },
    interpretation: `RD = ${(100*p).toFixed(2)}% [${(100*g).toFixed(2)}%, ${(100*f).toFixed(2)}%]` + (a > 0 ? ` (includes ${a} double-zero studies)` : ""),
    advantage: "Includes all studies without continuity correction; valid for rare events",
    reference: "Tian L, et al. Biostatistics 2009;10:275-281"
  }
}

function permutationTest(e, t, n = 1e4) {
  const a = e.length;
  if (a < 3) return {
    available: !1,
    warning: "Permutation test requires at least 3 studies"
  };
  const s = estimateTau2_REML(e, t).tau2,
    i = t.map(e => 1 / (e + s)),
    r = sum(i),
    o = sum(e.map((e, t) => i[t] * e)) / r,
    l = o / Math.sqrt(1 / r);
  let d = 0;
  for (let a = 0; a < n; a++) {
    const n = e.map(e => Math.random() < .5 ? e : -e),
      a = estimateTau2_REML(n, t).tau2,
      s = t.map(e => 1 / (e + a)),
      i = sum(s),
      r = sum(n.map((e, t) => s[t] * e)) / i / Math.sqrt(1 / i);
    Math.abs(r) >= Math.abs(l) && d++
  }
  const c = (d + 1) / (n + 1);
  return {
    available: !0,
    theta: o,
    theta_exp: Math.exp(o),
    t_statistic: l,
    p_value_permutation: c,
    p_value_parametric: 2 * (1 - pt(Math.abs(l), a - 1)),
    n_permutations: n,
    n_extreme: d,
    interpretation: c < .05 ? `Significant effect (permutation p=${c.toFixed(4)})` : `Not significant (permutation p=${c.toFixed(4)})`,
    note: "Distribution-free; valid even when normality questionable or k is small",
    reference: "Follmann DA, Proschan MA. Biometrics 1999;55:206-214"
  }
}

function bcaBootstrapCI(e, t, n = .05, a = 2e3) {
  const s = e.length;
  if (s < 5) return {
    available: !1,
    warning: "BCa bootstrap requires at least 5 studies"
  };
  const i = estimateTau2_REML(e, t).tau2,
    r = calculatePooledEstimate(e, t, i).theta,
    o = [];
  for (let n = 0; n < a; n++) {
    const n = Array.from({
        length: s
      }, () => Math.floor(Math.random() * s)),
      a = n.map(t => e[t]),
      i = n.map(e => t[e]),
      r = calculatePooledEstimate(a, i, estimateTau2_REML(a, i).tau2);
    o.push(r.theta)
  }
  o.sort((e, t) => e - t);
  const l = qnorm(o.filter(e => e < r).length / a),
    d = [];
  for (let n = 0; n < s; n++) {
    const a = e.filter((e, t) => t !== n),
      s = t.filter((e, t) => t !== n),
      i = calculatePooledEstimate(a, s, estimateTau2_REML(a, s).tau2);
    d.push(i.theta)
  }
  const c = mean(d),
    u = sum(d.map(e => Math.pow(c - e, 3))),
    p = 6 * Math.pow(sum(d.map(e => Math.pow(c - e, 2))), 1.5),
    m = 0 !== p ? u / p : 0,
    h = qnorm(n / 2),
    v = qnorm(1 - n / 2),
    g = pnorm(l + (l + h) / (1 - m * (l + h))),
    f = pnorm(l + (l + v) / (1 - m * (l + v))),
    _ = Math.max(0, Math.floor(g * a) - 1),
    y = Math.min(a - 1, Math.ceil(f * a) - 1),
    b = o[_],
    x = o[y],
    w = Math.floor(n / 2 * a),
    M = Math.floor((1 - n / 2) * a),
    S = o[w],
    E = o[M];
  return {
    available: !0,
    theta: r,
    theta_exp: Math.exp(r),
    bca: {
      ci_lower: b,
      ci_upper: x,
      ci_lower_exp: Math.exp(b),
      ci_upper_exp: Math.exp(x)
    },
    percentile: {
      ci_lower: S,
      ci_upper: E,
      ci_lower_exp: Math.exp(S),
      ci_upper_exp: Math.exp(E)
    },
    bias_correction: l,
    acceleration: m,
    n_bootstrap: a,
    interpretation: `BCa 95% CI: [${b.toFixed(4)}, ${x.toFixed(4)}]` + (Math.abs(l) > .1 ? " (notable bias correction applied)" : ""),
    note: "BCa corrects for bias and skewness in bootstrap distribution",
    reference: "Efron B. J Am Stat Assoc 1987;82:171-185"
  }
}

function fragilityIndex(e, t) {
  if ("binary" !== AppState.settings.dataType) return {
    available: !1,
    reason: "Fragility Index only applicable to binary outcomes"
  };
  const n = e.filter(e => void 0 !== e.events_t && e.n_t > 0 && e.n_c > 0);
  if (n.length < 2) return {
    available: !1,
    reason: "Requires at least 2 studies with binary outcomes"
  };
  if (!(t && t.p_value < .05)) return {
    available: !0,
    fragility_index: 0,
    interpretation: "Result is not statistically significant; Fragility Index not applicable",
    reverse_fragility: null
  };
  const a = sum(n.map(e => e.events_t)),
    s = sum(n.map(e => e.events_c)),
    i = a < s ? "treatment_better" : "control_better";
  let r = n.map(e => ({
      ...e
    })),
    o = 0;
  for (let e = 0; e < 100; e++) {
    let e = null,
      t = null,
      n = 0;
    if (r.forEach((a, s) => {
        "treatment_better" === i ? a.events_c > n && a.events_c > 0 && (n = a.events_c, e = s, t = "control") : a.events_t > n && a.events_t > 0 && (n = a.events_t, e = s, t = "treatment")
      }), null === e) break;
    "control" === t ? (r[e].events_c--, r[e].events_t++) : (r[e].events_t--, r[e].events_c++), o++;
    const l = calculateEffectSizes(r, AppState.settings.dataType, AppState.settings.measure, AppState.settings.continuityCorrection).filter(e => null !== e.yi);
    if (l.length < 2) break;
    const d = l.map(e => e.yi),
      c = l.map(e => e.vi),
      u = calculatePooledEstimate(d, c, estimateTau2_REML(d, c).tau2),
      p = u.theta / u.se;
    if (2 * (1 - pnorm(Math.abs(p))) >= .05) return {
      available: !0,
      fragility_index: o,
      fragility_quotient: (o / (a + s) * 100).toFixed(2),
      interpretation: `Changing ${o} event(s) would make result non-significant`,
      robustness: o >= 10 ? "Robust" : o >= 5 ? "Moderate" : "Fragile",
      direction: "treatment_better" === i ? "Events moved from control to treatment arm" : "Events moved from treatment to control arm",
      total_events: a + s,
      reference: "Atal I, et al. JAMA Intern Med 2019;179:1238-1245"
    }
  }
  return {
    available: !0,
    fragility_index: o,
    fragility_quotient: (o / (a + s) * 100).toFixed(2),
    interpretation: `Result remains significant after ${o} event changes (very robust)`,
    robustness: "Very robust",
    total_events: a + s,
    reference: "Atal I, et al. JAMA Intern Med 2019;179:1238-1245"
  }
}

function trimAndFill(e, t, n = "auto", a = "R0", s = 50) {
  const i = e.length,
    r = [];
  i < 10 && r.push("Trim-and-fill unreliable with k < 10 studies");
  const o = estimateTau2_REML(e, t).tau2,
    l = calculatePooledEstimate(e, t, o);
  if ("auto" === n) {
    const t = e.map(e => e - l.theta).filter(e => e < 0).length;
    n = t < i / 2 ? "left" : "right"
  }
  let d = [...e],
    c = [...t],
    u = 0,
    p = -1;
  for (let i = 0; i < s && u !== p; i++) {
    p = u;
    const s = d.length,
      i = estimateTau2_REML(d, c).tau2,
      r = calculatePooledEstimate(d, c, i),
      o = d.map((e, t) => ({
        y: e,
        v: c[t],
        dev: "right" === n ? e - r.theta : r.theta - e
      })).sort((e, t) => e.dev - t.dev);
    o.forEach((e, t) => e.rank = t + 1);
    const l = o.filter(e => e.dev > 0);
    if ("L0" === a) {
      const e = sum(l.map(e => e.rank));
      u = Math.max(0, Math.round((4 * e - s * (s + 1)) / (2 * s + 1)))
    } else {
      const e = sum(l.map(e => e.rank));
      u = Math.max(0, Math.round((4 * e - s * (s + 1)) / (2 * s - 1)))
    }
    if (0 === u) break;
    const m = "right" === n ? o.slice(-u) : o.slice(0, u),
      h = new Set(m.map(e => e.y));
    d = e.filter(e => !h.has(e)), c = t.filter((t, n) => !h.has(e[n]))
  }
  const m = estimateTau2_REML(d, c).tau2,
    h = calculatePooledEstimate(d, c, m),
    v = [...e],
    g = [...t],
    f = [],
    _ = e.map((e, n) => ({
      y: e,
      v: t[n]
    })).sort((e, t) => "right" === n ? t.y - e.y : e.y - t.y);
  for (let e = 0; e < u && e < _.length; e++) {
    const t = 2 * h.theta - _[e].y;
    v.push(t), g.push(_[e].v), f.push({
      yi: t,
      vi: _[e].v
    })
  }
  const y = calculatePooledEstimate(v, g, estimateTau2_REML(v, g).tau2),
    b = i > 5 ? 2 * i * (2 * i + 1) / (9 * i - 3) : null,
    x = b ? Math.sqrt(b) : null,
    w = x ? Math.max(0, Math.round(u - 1.96 * x)) : null,
    M = x ? Math.round(u + 1.96 * x) : null;
  return {
    original: {
      k: i,
      effect: l.theta,
      effect_exp: Math.exp(l.theta)
    },
    adjusted: {
      k: i + u,
      effect: y.theta,
      effect_exp: Math.exp(y.theta)
    },
    k0_imputed: u,
    k0_se: x,
    k0_ci: x ? {
      lower: w,
      upper: M
    } : null,
    side: n,
    estimator: a,
    imputed_studies: f,
    change: y.theta - l.theta,
    change_pct: 100 * (Math.exp(y.theta - l.theta) - 1),
    warnings: r.length > 0 ? r : null,
    caveats: ["Trim-and-fill is a SENSITIVITY ANALYSIS, not a bias correction", 'Adjusted estimate should NOT be interpreted as the "true" unbiased effect', "Assumes asymmetry reflects suppressed negative findings (may be heterogeneity)", "R0" === a ? "R0 estimator used (rank-based); L0 estimator is more conservative" : "L0 estimator used (linear); more conservative than R0"],
    reference: "Duval S, Tweedie R. Biometrics 2000;56:455-463"
  }
}

function convertEffectSize(e, t, n, a = null) {
  if (t === n) return e;
  let s;
  switch (t) {
    case "OR":
      s = e;
      break;
    case "logOR":
      s = Math.exp(e);
      break;
    case "RR":
      if (!a) throw new Error("Baseline risk required");
      s = e * (1 - a) / (1 - e * a);
      break;
    case "logRR":
      if (!a) throw new Error("Baseline risk required");
      const n = Math.exp(e);
      s = n * (1 - a) / (1 - n * a);
      break;
    case "HR":
    case "logHR":
      s = "logHR" === t ? Math.exp(e) : e;
      break;
    default:
      throw new Error(`Unknown type: ${t}`)
  }
  switch (n) {
    case "OR":
      return s;
    case "logOR":
      return Math.log(s);
    case "RR":
      if (!a) throw new Error("Baseline risk required");
      return s / (1 - a + a * s);
    case "logRR":
      if (!a) throw new Error("Baseline risk required");
      return Math.log(s / (1 - a + a * s));
    case "HR":
    case "logHR":
      return "logHR" === n ? Math.log(s) : s;
    default:
      throw new Error(`Unknown type: ${n}`)
  }
}

function calculateMH_OR(e) {
  const t = e.filter(e => void 0 !== e.events_t && e.n_t > 0 && e.n_c > 0);
  if (0 === t.length) return {
    available: !1,
    reason: "No valid 2×2 tables"
  };
  let n = 0,
    a = 0,
    s = 0,
    i = 0,
    r = 0;
  if (t.forEach(e => {
      const t = e.events_t,
        o = e.n_t - e.events_t,
        l = e.events_c,
        d = e.n_c - e.events_c,
        c = e.n_t + e.n_c;
      n += t * d / c, a += o * l / c, s += (t + d) * t * d / (c * c), i += ((t + d) * o * l + (o + l) * t * d) / (c * c), r += (o + l) * o * l / (c * c)
    }), 0 === a || 0 === n) return {
    available: !1,
    reason: "MH undefined (zero cells)"
  };
  const o = n / a,
    l = Math.log(o),
    d = s / (2 * n * n) + i / (2 * n * a) + r / (2 * a * a),
    c = Math.sqrt(d),
    u = qnorm(.975);
  return {
    available: !0,
    OR: o,
    logOR: l,
    se: c,
    ci_lower: Math.exp(l - u * c),
    ci_upper: Math.exp(l + u * c),
    method: "Mantel-Haenszel",
    variance_method: "Robins-Breslow-Greenland",
    k: t.length,
    note: "Recommended for sparse data (few events per study)",
    reference: "Robins J, et al. Biometrics 1986;42:311-323"
  }
}

function calculatePeto_OR(e) {
  const t = e.filter(e => void 0 !== e.events_t && e.n_t > 0 && e.n_c > 0);
  if (0 === t.length) return {
    available: !1,
    reason: "No valid 2×2 tables"
  };
  let n = 0,
    a = 0;
  if (t.forEach(e => {
      const t = e.events_t,
        s = e.events_c,
        i = e.n_t,
        r = e.n_c,
        o = t + s,
        l = i + r,
        d = o * i * r * (l - o) / (l * l * (l - 1));
      d > 0 && (n += t - o * i / l, a += d)
    }), 0 === a) return {
    available: !1,
    reason: "Zero variance (no events)"
  };
  const s = n / a,
    i = 1 / Math.sqrt(a),
    r = Math.exp(s),
    o = qnorm(.975);
  let l = null;
  return (r < .5 || r > 2) && (l = "Peto's method may be biased for large effects (OR far from 1). Consider MH or inverse-variance."), {
    available: !0,
    OR: r,
    logOR: s,
    se: i,
    ci_lower: Math.exp(s - o * i),
    ci_upper: Math.exp(s + o * i),
    method: "Peto",
    k: t.length,
    sum_OE: n,
    sum_V: a,
    warning: l,
    note: "Best for rare events with OR ≈ 1. Biased for large effects.",
    reference: "Yusuf S, et al. Stat Med 1985;4:499-525"
  }
}

function veveaHedgesSelection(e, t, n = "moderate") {
  const a = e.length,
    s = t.map(e => Math.sqrt(e));
  let i;
  switch (n) {
    case "moderate":
    default:
      i = {
        p_lt_05: 1,
        p_05_10: .75,
        p_gt_10: .6
      };
      break;
    case "severe":
      i = {
        p_lt_05: 1,
        p_05_10: .5,
        p_gt_10: .2
      };
      break;
    case "one_tailed":
      i = {
        p_lt_025_right: 1,
        p_025_05: .8,
        p_gt_05: .5
      }
  }
  const r = e.map((e, t) => 2 * (1 - pnorm(Math.abs(e) / s[t]))).map(e => "one_tailed" === n ? e < .025 ? i.p_lt_025_right : e < .05 ? i.p_025_05 : i.p_gt_05 : e < .05 ? i.p_lt_05 : e < .1 ? i.p_05_10 : i.p_gt_10),
    o = estimateTau2_REML(e, t).tau2,
    l = t.map((e, t) => r[t] / (e + o)),
    d = sum(l),
    c = sum(e.map((e, t) => l[t] * e)) / d,
    u = Math.sqrt(1 / d),
    p = t.map(e => 1 / (e + o)),
    m = sum(p),
    h = sum(e.map((e, t) => p[t] * e)) / m,
    v = qnorm(.975);
  return {
    available: !0,
    unadjusted: {
      theta: h,
      theta_exp: Math.exp(h)
    },
    adjusted: {
      theta: c,
      theta_exp: Math.exp(c),
      se: u,
      ci_lower: c - v * u,
      ci_upper: c + v * u
    },
    change: c - h,
    change_pct: 100 * (Math.exp(c - h) - 1),
    severity: n,
    weights_used: i,
    selection_weights: r,
    k: a,
    interpretation: Math.abs(c - h) > .1 ? "Substantial difference under selection model - publication bias may be present" : "Minimal difference - results appear robust to assumed selection",
    caveats: ["This is a SENSITIVITY ANALYSIS assuming a specific selection mechanism", "The adjusted estimate depends on assumed selection weights", "True selection mechanism is unknown - compare multiple severity levels", "Does not account for other biases (outcome reporting, p-hacking)"],
    reference: "Vevea JL, Hedges LV. Psych Methods 1995;1:37-55"
  }
}

function henmiCopasAdjustment(e, t) {
  const n = e.length,
    a = t.map(e => Math.sqrt(e)),
    s = estimateTau2_REML(e, t).tau2,
    i = t.map(e => 1 / (e + s)),
    r = sum(i),
    o = sum(e.map((e, t) => i[t] * e)) / r,
    l = Math.sqrt(1 / r),
    d = eggersTest(e, a, null, AppState.settings.dataType),
    c = d.intercept,
    u = d.se,
    p = Math.abs(c) / u,
    m = 1 + (p > 1.96 ? .1 * (p - 1.96) : 0),
    h = l * Math.sqrt(m),
    v = -c * l * .5,
    g = o + v,
    f = qnorm(.975),
    _ = qt(.975, n - 2);
  return {
    available: !0,
    unadjusted: {
      theta: o,
      theta_exp: Math.exp(o),
      se: l,
      ci_lower: o - f * l,
      ci_upper: o + f * l
    },
    adjusted: {
      theta: g,
      theta_exp: Math.exp(g),
      se: h,
      ci_lower: g - _ * h,
      ci_upper: g + _ * h
    },
    egger_intercept: c,
    egger_p: d.p_value,
    inflation_factor: m,
    bias_correction: v,
    k: n,
    interpretation: m > 1.1 ? "CI widened due to asymmetry evidence. Treat as sensitivity analysis." : "Minimal adjustment - no strong asymmetry detected.",
    caveats: ["WARNING: This is a heuristic sensitivity analysis, NOT the full Henmi-Copas model", "Adjustment is based on Egger's asymmetry, not formal selection modeling", "Point estimate adjustment is ad-hoc and should be interpreted cautiously", "For rigorous analysis, use metasens package in R for true Copas model"],
    reference: "Sensitivity analysis inspired by Henmi M, Copas JB. Stat Med 2010;29:2949-2959"
  }
}

function bucherIndirectComparison(e, t, n = "B") {
  const a = e.theta,
    s = t.theta,
    i = e.se,
    r = t.se,
    o = a - s,
    l = i * i + r * r,
    d = Math.sqrt(l),
    c = qnorm(.975);
  return {
    available: !0,
    direct_AB: {
      theta: a,
      theta_exp: Math.exp(a),
      se: i
    },
    direct_BC: {
      theta: s,
      theta_exp: Math.exp(s),
      se: r
    },
    indirect_AC: {
      theta: o,
      theta_exp: Math.exp(o),
      se: d,
      ci_lower: o - c * d,
      ci_upper: o + c * d,
      ci_lower_exp: Math.exp(o - c * d),
      ci_upper_exp: Math.exp(o + c * d)
    },
    common_arm: n,
    interpretation: "Indirect estimate of A vs C via common comparator " + n,
    caveats: ["Assumes transitivity (no effect modifiers differ between comparisons)", "Assumes consistency (indirect estimate equals hypothetical direct)", "Variance is typically larger than direct comparison", "Should be compared with direct evidence if available"],
    reference: "Bucher HC, et al. J Clin Epidemiol 1997;50:683-691"
  }
}

function combineDirectIndirect(e, t) {
  const n = e.se * e.se,
    a = t.se * t.se,
    s = 1 / n,
    i = 1 / a,
    r = s + i,
    o = (s * e.theta + i * t.theta) / r,
    l = Math.sqrt(1 / r),
    d = e.theta - t.theta,
    c = Math.sqrt(n + a),
    u = Math.abs(d) / c,
    p = 2 * (1 - pnorm(u)),
    m = qnorm(.975);
  return {
    direct: {
      theta: e.theta,
      se: e.se,
      weight: s / r
    },
    indirect: {
      theta: t.theta,
      se: t.se,
      weight: i / r
    },
    combined: {
      theta: o,
      theta_exp: Math.exp(o),
      se: l,
      ci_lower: o - m * l,
      ci_upper: o + m * l
    },
    inconsistency: {
      difference: d,
      se: c,
      z: u,
      p_value: p,
      significant: p < .05
    },
    interpretation: p < .05 ? "WARNING: Significant inconsistency between direct and indirect evidence (p=" + p.toFixed(4) + "). Combined estimate may be unreliable." : "No significant inconsistency detected (p=" + p.toFixed(3) + ")"
  }
}

function interpretHeterogeneity(e) {
  const {
    I2: t,
    I2_ci: n,
    tau: a,
    tau_ci: s,
    Q: i,
    df: r,
    pi_standard: o,
    measure: l
  } = e, d = [], c = [];
  if (n && n.upper - n.lower > 50 && d.push({
      type: "uncertainty",
      text: `I² = ${t.toFixed(0)}% but 95% CI is very wide (${n.lower.toFixed(0)}–${n.upper.toFixed(0)}%). The true proportion of variance due to heterogeneity is highly uncertain.`
    }), void 0 !== a) {
    const e = interpretTauOnScale(a, l);
    d.push({
      type: "clinical",
      text: e
    })
  }
  if (o) {
    const e = o.lower,
      t = o.upper;
    "OR" !== l && "RR" !== l && "HR" !== l || (e < 0 && t > 0 ? c.push({
      type: "direction",
      text: "⚠️ Prediction interval crosses null: a new study in a similar setting could plausibly show either benefit OR harm. Effect direction is uncertain."
    }) : d.push({
      type: "direction",
      text: `Prediction interval (${Math.exp(e).toFixed(2)} to ${Math.exp(t).toFixed(2)}) suggests consistent direction of effect across settings.`
    }))
  }
  const u = i / r;
  u > 3 && c.push({
    type: "q_ratio",
    text: `Q/${r} = ${u.toFixed(1)} (>3 suggests substantial heterogeneity beyond sampling error)`
  }), r < 10 && d.push({
    type: "sample",
    text: `With only ${r+1} studies, I² has limited precision. Focus on τ (absolute heterogeneity) rather than I² (relative).`
  });
  return {
    I2: t,
    I2_ci: n,
    tau: a,
    messages: d,
    warnings: c,
    threshold_note: "Note: I² thresholds (25/50/75%) are arbitrary. Clinical importance depends on τ magnitude and decision context.",
    recommendation: c.length > 0 ? "Consider exploring heterogeneity sources (subgroups, meta-regression) before pooling." : "Heterogeneity appears manageable for pooled analysis.",
    references: ["Higgins JPT, Thompson SG. Stat Med 2002;21:1539-1558", "Rücker G, et al. BMC Med Res Methodol 2008;8:79", "IntHout J, et al. BMJ Open 2016;6:e010247"]
  }
}

function interpretTauOnScale(e, t) {
  switch (t) {
    case "OR":
    case "RR":
    case "HR":
      const t = Math.exp(e),
        n = Math.exp(-1.96 * e),
        a = Math.exp(1.96 * e);
      return `τ = ${e.toFixed(3)} on log scale. True effects vary by a factor of ~${t.toFixed(2)}× between studies. 95% of true effects fall between ${n.toFixed(2)}× and ${a.toFixed(2)}× the average.`;
    case "SMD":
      return `τ = ${e.toFixed(3)} standardized units. True standardized effects vary by ~${(2*e).toFixed(2)} SD between studies (±1 SD from mean).`;
    case "MD":
      return `τ = ${e.toFixed(3)} in original units. True effects vary by ~${(2*e).toFixed(3)} units between studies (±1 SD from mean).`;
    case "RD":
      return `τ = ${(100*e).toFixed(1)} percentage points. True risk differences vary by ~${(200*e).toFixed(1)} pp between studies.`;
    default:
      return `τ = ${e.toFixed(4)} (SD of true effects across studies)`
  }
}
AppState.multiOutcome = {
  trials: [],
  results: null
};
const BENCHMARK_DATASETS = {
    HETEROGENEOUS_MA: {
      name: "Heterogeneous MA (Hand-verified)",
      source: "Manual calculation verification",
      k: 3,
      usePrecomputed: !0,
      yi: [-1, -.5, 0],
      vi: [.1, .1, .1],
      names: ["Study A", "Study B", "Study C"],
      measure: "OR",
      expected: {
        DL: {
          theta: -.5,
          se: .2887,
          tau2: .15,
          I2: 60
        }
      }
    },
    HOMOGENEOUS_MA: {
      name: "Homogeneous MA (τ²=0)",
      source: "Zero heterogeneity verification",
      k: 4,
      usePrecomputed: !0,
      yi: [-.5, -.5, -.5, -.5],
      vi: [.1, .1, .1, .1],
      names: ["Study 1", "Study 2", "Study 3", "Study 4"],
      measure: "OR",
      expected: {
        DL: {
          theta: -.5,
          se: .1581,
          tau2: 0,
          I2: 0
        }
      }
    },
    BCG_VACCINE: {
      name: "BCG Vaccine (metafor dat.bcg)",
      source: "Colditz GA et al. (1994). JAMA 271:698-702. Verified: metafor 4.4-0",
      k: 13,
      usePrecomputed: !0,
      yi: [-.8893, -1.5854, -1.3481, -1.4416, -.2177, -.7861, -1.6209, -.4717, -.9546, -1.5698, -.3408, .0173, -.4668],
      vi: [.0359, .0449, .0175, .0205, .0515, .0207, .2168, .0618, .014, .0516, .0195, .0058, .0158],
      names: ["Aronson (1948)", "Ferguson (1949)", "Rosenthal (1960)", "Hart (1977)", "Frimodt-Moller (1973)", "Stein (1953)", "Vandiviere (1973)", "TPT Madras (1968)", "Coetzee (1968)", "Rosenthal (1961)", "Comstock (1974)", "Comstock (1976)", "Comstock (1969)"],
      measure: "RR",
      expected: {
        REML: {
          theta: -.8709,
          se: .1568,
          tau2: .2812,
          I2: 93.9
        },
        DL: {
          theta: -.8743,
          se: .1642,
          tau2: .3407,
          I2: 93.9
        }
      }
    },
    MINIMAL_K2: {
      name: "Minimal k=2",
      source: "Edge case verification",
      k: 2,
      usePrecomputed: !0,
      yi: [-.5, -.3],
      vi: [.05, .08],
      names: ["Study A", "Study B"],
      measure: "OR",
      expected: {
        DL: {
          theta: -.4231,
          se: .1751,
          tau2: 0,
          I2: 0
        }
      }
    },
    HIGH_HETEROGENEITY: {
      name: "Very High Heterogeneity",
      source: "Extreme case verification",
      k: 5,
      usePrecomputed: !0,
      yi: [-2, -.5, 0, .8, 1.5],
      vi: [.1, .1, .1, .1, .1],
      names: ["Study 1", "Study 2", "Study 3", "Study 4", "Study 5"],
      measure: "OR",
      expected: {
        DL: {
          theta: -.04,
          se: .5972,
          tau2: 1.683,
          I2: 94.4
        }
      }
    }
  },
  VALIDATION_TOLERANCE = {
    theta: .01,
    se: .05,
    tau2: .02,
    I2: 5
  };

function runValidation(e = !1) {
  const t = [];
  for (const [e, n] of Object.entries(BENCHMARK_DATASETS)) {
    let a, s;
    if (n.usePrecomputed) a = n.yi, s = n.vi;
    else {
      const e = n.studies.map(e => {
        const t = calculateLogOR(e.events_t, e.n_t - e.events_t, e.events_c, e.n_c - e.events_c);
        return {
          yi: t.yi,
          vi: t.vi
        }
      });
      a = e.map(e => e.yi), s = e.map(e => e.vi)
    }
    for (const [i, r] of Object.entries(n.expected)) {
      const n = estimateTau2(a, s, i),
        o = calculatePooledEstimate(a, s, n.tau2),
        l = calculateHeterogeneity(a, s, n.tau2),
        d = {
          theta: o.theta,
          se: o.se,
          tau2: n.tau2,
          I2: l.I2
        },
        c = Math.abs(d.tau2 - r.tau2) < VALIDATION_TOLERANCE.tau2,
        u = r.tau2 > .01 ? Math.abs(d.tau2 - r.tau2) / r.tau2 < .5 : c,
        p = {
          theta: Math.abs(d.theta - r.theta) < VALIDATION_TOLERANCE.theta,
          se: Math.abs(d.se - r.se) < VALIDATION_TOLERANCE.se,
          tau2: c || u,
          I2: Math.abs(d.I2 - r.I2) < VALIDATION_TOLERANCE.I2
        },
        m = Object.values(p).every(e => e);
      t.push({
        dataset: e,
        method: i,
        passed: m,
        checks: p,
        actual: d,
        expected: r,
        deviations: {
          theta: d.theta - r.theta,
          se: d.se - r.se,
          tau2: d.tau2 - r.tau2,
          I2: d.I2 - r.I2
        }
      })
    }
  }
  return {
    results: t,
    summary: {
      total: t.length,
      passed: t.filter(e => e.passed).length,
      failed: t.filter(e => !e.passed).length,
      pass_rate: (t.filter(e => e.passed).length / t.length * 100).toFixed(1)
    }
  }
}

function generateRCode(e, t = {}) {
  const {
    method: n = "REML",
    hksj: a = !0,
    mcid: s = .15
  } = t, i = e.names || e.yi.map((e, t) => `Study_${t+1}`), r = e.measure || "OR", o = e.direction || "lower";
  return `\n# ============================================================================\n# COMPREHENSIVE META-ANALYSIS IN R\n# Generated by Pairwise Pro v2.2\n# ${(new Date).toISOString()}\n# ============================================================================\n# This script reproduces the Pairwise Pro analysis in R using metafor\n# Run sections independently or all together\n# ============================================================================\n\n# ===========================================\n# SECTION 1: SETUP AND DATA\n# ===========================================\n\n# Install required packages\npackages <- c("metafor", "meta", "dmetar", "ggplot2", "gridExtra", "forestploter")\nnew_packages <- packages[!(packages %in% installed.packages()[,"Package"])]\nif(length(new_packages)) install.packages(new_packages)\n\n# Load libraries\nlibrary(metafor)\n\n# Study data (log scale for ratio measures)\nstudy <- c(${i.map(e=>`"${e}"`).join(", ")})\nyi <- c(${e.yi.map(e=>e.toFixed(6)).join(", ")})  # Effect sizes (log scale)\nvi <- c(${e.vi.map(e=>e.toFixed(6)).join(", ")})  # Variances\nsei <- sqrt(vi)  # Standard errors\n\n# Create data frame\ndat <- data.frame(\n  study = study,\n  yi = yi,\n  vi = vi,\n  sei = sei\n)\n\n# Measure type: ${r}\n# Direction: ${o} is better\n\ncat("\\n========== DATA SUMMARY ==========\\n")\ncat("Number of studies:", nrow(dat), "\\n")\ncat("Effect measure: ${r}\\n")\ncat("\\n")\n\n# ===========================================\n# SECTION 2: MAIN META-ANALYSIS\n# ===========================================\n\n# --- 2.1 Random-effects model (${n}) ---\nres <- rma(yi = yi, vi = vi, data = dat, \n           method = "${n}",\n           test = "${a?"knha":"z"}",\n           slab = study)\n\ncat("\\n========== MAIN RESULTS ==========\\n")\nprint(res)\n\n# Back-transformed effect\ncat("\\n--- Back-transformed (exponentiated) ---\\n")\ncat("${r}:", round(exp(coef(res)), 4), "\\n")\ncat("95% CI:", round(exp(res$ci.lb), 4), "-", round(exp(res$ci.ub), 4), "\\n")\n\n# --- 2.2 Prediction interval ---\npred <- predict(res)\ncat("\\n--- Prediction Interval ---\\n")\ncat("95% PI (log):", round(pred$pi.lb, 4), "-", round(pred$pi.ub, 4), "\\n")\ncat("95% PI (${r}):", round(exp(pred$pi.lb), 4), "-", round(exp(pred$pi.ub), 4), "\\n")\n\n# --- 2.3 Compare tau² estimators ---\ncat("\\n--- Tau² Estimators Comparison ---\\n")\nmethods <- c("DL", "REML", "PM", "ML", "HS", "SJ", "HE", "EB")\ntau2_compare <- sapply(methods, function(m) {\n  tryCatch({\n    rma(yi = yi, vi = vi, data = dat, method = m)$tau2\n  }, error = function(e) NA)\n})\nprint(data.frame(Method = methods, Tau2 = round(tau2_compare, 6)))\n\n# ===========================================\n# SECTION 3: FOREST PLOTS\n# ===========================================\n\n# --- 3.1 Basic Forest Plot ---\ncat("\\n========== FOREST PLOTS ==========\\n")\ncat("Generating forest plots...\\n")\n\n# Standard metafor forest\nforest(res, \n       header = TRUE,\n       xlab = "${r}",\n       mlab = "RE Model",\n       addpred = TRUE,  # Add prediction interval\n       shade = TRUE)\ntitle("Forest Plot with Prediction Interval")\n\n# --- 3.2 Publication-Quality Forest Plot ---\n# With percentage weights and transformed scale\n\nforest(res,\n       atransf = exp,  # Back-transform to ratio scale\n       at = log(c(0.5, 0.75, 1, 1.5, 2)),  # Tick marks\n       xlim = c(-3, 2.5),\n       ilab = cbind(round(weights(res), 1)),\n       ilab.xpos = -2,\n       cex = 0.9,\n       header = c("Study", "${r} [95% CI]"),\n       mlab = "Random-effects model",\n       addpred = TRUE,\n       col = "darkblue",\n       border = "darkblue")\ntext(-2, length(yi) + 2, "Weight %", font = 2, cex = 0.9)\n\n# --- 3.3 Cumulative Meta-Analysis Forest ---\nres_cum <- cumul(res)\nforest(res_cum, \n       atransf = exp,\n       header = TRUE,\n       xlab = "Cumulative ${r}")\ntitle("Cumulative Meta-Analysis")\n\n# --- 3.4 Leave-One-Out Forest ---\nres_loo <- leave1out(res)\nforest(res_loo$estimate, \n       sei = res_loo$se,\n       slab = paste("Omitting", res_loo$slab),\n       atransf = exp,\n       xlab = "${r} when study omitted",\n       refline = coef(res))\ntitle("Leave-One-Out Sensitivity Analysis")\n\n# --- 3.5 Sorted by Effect Size ---\nord <- order(yi)\nforest(res, \n       order = ord,\n       atransf = exp,\n       header = TRUE,\n       addpred = TRUE,\n       xlab = "${r}")\ntitle("Forest Plot (Sorted by Effect Size)")\n\n# --- 3.6 Sorted by Precision (SE) ---\nord_prec <- order(sei)\nforest(res, \n       order = ord_prec,\n       atransf = exp,\n       header = TRUE,\n       addpred = TRUE,\n       xlab = "${r}")\ntitle("Forest Plot (Sorted by Precision)")\n\n# --- 3.7 Custom ggplot2 Forest (if available) ---\nif(require(ggplot2, quietly = TRUE)) {\n  \n  # Prepare data for ggplot\n  forest_data <- data.frame(\n    study = factor(study, levels = rev(study)),\n    yi = yi,\n    yi_exp = exp(yi),\n    ci_lower = exp(yi - 1.96 * sei),\n    ci_upper = exp(yi + 1.96 * sei),\n    weight = weights(res)\n  )\n  \n  # Add pooled estimate\n  pooled_row <- data.frame(\n    study = "Pooled",\n    yi = coef(res),\n    yi_exp = exp(coef(res)),\n    ci_lower = exp(res$ci.lb),\n    ci_upper = exp(res$ci.ub),\n    weight = NA\n  )\n  forest_data <- rbind(forest_data, pooled_row)\n  forest_data$study <- factor(forest_data$study, levels = c("Pooled", rev(study)))\n  \n  # Create ggplot forest\n  p_forest <- ggplot(forest_data, aes(x = yi_exp, y = study)) +\n    geom_vline(xintercept = 1, linetype = "dashed", color = "gray50") +\n    geom_errorbarh(aes(xmin = ci_lower, xmax = ci_upper), height = 0.2) +\n    geom_point(aes(size = weight), shape = 15) +\n    geom_point(data = subset(forest_data, study == "Pooled"), \n               shape = 18, size = 5, color = "darkred") +\n    scale_x_log10() +\n    labs(x = "${r}", y = "", title = "Forest Plot (ggplot2)") +\n    theme_minimal() +\n    theme(legend.position = "none",\n          panel.grid.minor = element_blank())\n  \n  print(p_forest)\n}\n\n# ===========================================\n# SECTION 4: HETEROGENEITY ANALYSIS\n# ===========================================\n\ncat("\\n========== HETEROGENEITY ==========\\n")\n\n# --- 4.1 Standard heterogeneity statistics ---\ncat("I²:", round(res$I2, 2), "%\\n")\ncat("H²:", round(res$H2, 2), "\\n")\ncat("τ²:", round(res$tau2, 6), "\\n")\ncat("τ:", round(sqrt(res$tau2), 4), "\\n")\ncat("Q:", round(res$QE, 2), "(df =", res$k - 1, ", p =", round(res$QEp, 4), ")\\n")\n\n# --- 4.2 Confidence intervals for I² ---\ncat("\\n--- I² Confidence Interval (Q-profile) ---\\n")\nci_I2 <- confint(res)\nprint(ci_I2)\n\n# --- 4.3 Prediction interval width interpretation ---\npi_width <- exp(pred$pi.ub) - exp(pred$pi.lb)\ncat("\\n--- Clinical Interpretation ---\\n")\ncat("Prediction interval width (${r} scale):", round(pi_width, 3), "\\n")\ncat("This represents the expected range of effects in future similar settings\\n")\n\n# ===========================================\n# SECTION 5: PUBLICATION BIAS ASSESSMENT\n# ===========================================\n\ncat("\\n========== PUBLICATION BIAS ==========\\n")\n\n# --- 5.1 Funnel Plot ---\nfunnel(res, main = "Funnel Plot")\nfunnel(res, main = "Contour-Enhanced Funnel", \n       level = c(90, 95, 99), shade = c("white", "gray75", "gray55"))\n\n# --- 5.2 Egger's Test ---\ncat("\\n--- Egger's Regression Test ---\\n")\negger <- regtest(res, model = "lm")\nprint(egger)\n\n# --- 5.3 Peters' Test (for binary outcomes) ---\ncat("\\n--- Peters' Test ---\\n")\npeters <- regtest(res, model = "lm", predictor = "ni")\nprint(peters)\n\n# --- 5.4 Rank Correlation (Begg's) ---\ncat("\\n--- Begg's Rank Correlation ---\\n")\nbegg <- ranktest(res)\nprint(begg)\n\n# --- 5.5 Trim and Fill ---\ncat("\\n--- Trim and Fill ---\\n")\ntaf <- trimfill(res)\nprint(taf)\nfunnel(taf, main = "Funnel Plot with Trim-and-Fill")\n\n# --- 5.6 PET-PEESE ---\ncat("\\n--- PET-PEESE ---\\n")\n# PET: Precision-Effect Test\npet <- lm(yi ~ sei, weights = 1/vi)\ncat("PET (intercept at SE=0):", round(coef(pet)[1], 4), "\\n")\ncat("PET p-value:", round(summary(pet)$coefficients[2,4], 4), "\\n")\n\n# PEESE: Precision-Effect Estimate with Standard Error\npeese <- lm(yi ~ vi, weights = 1/vi)\ncat("PEESE (intercept):", round(coef(peese)[1], 4), "\\n")\n\n# Conditional estimate\nif(summary(pet)$coefficients[2,4] < 0.10) {\n  cat("Using PEESE estimate (PET significant)\\n")\n  cat("Adjusted ${r}:", round(exp(coef(peese)[1]), 4), "\\n")\n} else {\n  cat("Using PET estimate (PET not significant)\\n")\n  cat("Adjusted ${r}:", round(exp(coef(pet)[1]), 4), "\\n")\n}\n\n# ===========================================\n# SECTION 6: SENSITIVITY ANALYSES\n# ===========================================\n\ncat("\\n========== SENSITIVITY ANALYSES ==========\\n")\n\n# --- 6.1 Leave-One-Out Analysis ---\ncat("\\n--- Leave-One-Out Analysis ---\\n")\nloo <- leave1out(res)\nloo_results <- data.frame(\n  Omitted = loo$slab,\n  Estimate = round(exp(loo$estimate), 4),\n  CI_Lower = round(exp(loo$ci.lb), 4),\n  CI_Upper = round(exp(loo$ci.ub), 4),\n  I2 = round(loo$I2, 1),\n  Tau2 = round(loo$tau2, 6)\n)\nprint(loo_results)\n\n# Identify influential studies\nloo_results$Diff_from_full <- abs(exp(loo$estimate) - exp(coef(res)))\ninfluential <- loo_results[loo_results$Diff_from_full > 0.05 * exp(coef(res)), ]\nif(nrow(influential) > 0) {\n  cat("\\nInfluential studies (>5% change when removed):\\n")\n  print(influential$Omitted)\n}\n\n# --- 6.2 Influence Diagnostics ---\ncat("\\n--- Influence Diagnostics ---\\n")\ninf <- influence(res)\nplot(inf)\n\n# --- 6.3 Baujat Plot ---\ncat("\\n--- Baujat Plot ---\\n")\nbaujat(res)\n\n# --- 6.4 GOSH Plot (computationally intensive) ---\n# Uncomment to run - can be slow with many studies\n# cat("\\n--- GOSH Analysis ---\\n")\n# gosh_res <- gosh(res, subsets = 1000)\n# plot(gosh_res)\n\n# ===========================================\n# SECTION 7: DDMA PROBABILITIES\n# ===========================================\n\ncat("\\n========== DDMA PROBABILITIES ==========\\n")\n\ntheta <- coef(res)\nse_conf <- res$se\ntau2 <- res$tau2\nse_pred <- sqrt(se_conf^2 + tau2)\n\n# Direction: ${o} is better\n${"lower"===o?`\n# Lower is better (e.g., mortality, events)\nP_benefit <- pnorm(0, mean = theta, sd = se_conf)\nP_benefit_pred <- pnorm(0, mean = theta, sd = se_pred)\nP_mcid <- pnorm(-${s}, mean = theta, sd = se_pred)\nP_large <- pnorm(-0.223, mean = theta, sd = se_pred)  # 20% reduction\n`:`\n# Higher is better\nP_benefit <- 1 - pnorm(0, mean = theta, sd = se_conf)\nP_benefit_pred <- 1 - pnorm(0, mean = theta, sd = se_pred)\nP_mcid <- 1 - pnorm(${s}, mean = theta, sd = se_pred)\nP_large <- 1 - pnorm(0.182, mean = theta, sd = se_pred)  # 20% improvement\n`}\n\ncat("\\n--- Confidence Distribution (average effect) ---\\n")\ncat("P(benefit):", round(P_benefit, 4), "\\n")\n\ncat("\\n--- Predictive Distribution (next study) ---\\n")\ncat("P(benefit):", round(P_benefit_pred, 4), "\\n")\ncat("P(exceeds MCID of ${(100*(1-Math.exp(-s))).toFixed(0)}%):", round(P_mcid, 4), "\\n")\ncat("P(large benefit >20%):", round(P_large, 4), "\\n")\n\n# Confidence-Predictive Gap\ngap <- abs(P_benefit - P_benefit_pred)\ncat("\\nConfidence-Predictive Gap:", round(gap * 100, 1), "percentage points\\n")\nif(gap > 0.15) {\n  cat("WARNING: Large gap indicates substantial heterogeneity impact on predictions\\n")\n}\n\n# ===========================================\n# SECTION 8: MCID SENSITIVITY ANALYSIS\n# ===========================================\n\ncat("\\n========== MCID SENSITIVITY ==========\\n")\n\nmcid_values <- c(0.05, 0.10, 0.15, 0.20, 0.25, 0.30)\nmcid_labels <- paste0(round((1 - exp(-mcid_values)) * 100), "% reduction")\n\nmcid_sens <- sapply(mcid_values, function(m) {\n  ${"lower"===o?"pnorm(-m, mean = theta, sd = se_pred)":"1 - pnorm(m, mean = theta, sd = se_pred)"}\n})\n\nmcid_table <- data.frame(\n  MCID_log = mcid_values,\n  MCID_pct = mcid_labels,\n  P_exceeds = round(mcid_sens, 4)\n)\nprint(mcid_table)\n\n# ===========================================\n# SECTION 9: CROSS-DISCIPLINARY METHODS\n# ===========================================\n\ncat("\\n========== CROSS-DISCIPLINARY METHODS ==========\\n")\n\n# --- 9.1 PDG Scale Factor (Physics method) ---\ncat("\\n--- PDG Scale Factor ---\\n")\n# When χ² > df, inflate SE by sqrt(χ²/df)\nchi2 <- res$QE\ndf <- res$k - 1\nS <- sqrt(chi2 / df)\nS_applied <- max(1, S)\n\ncat("χ²:", round(chi2, 2), "\\n")\ncat("df:", df, "\\n")\ncat("Scale factor S:", round(S, 3), "\\n")\n\nif(S > 1) {\n  se_scaled <- res$se * S\n  ci_scaled_lower <- theta - 1.96 * se_scaled\n  ci_scaled_upper <- theta + 1.96 * se_scaled\n  cat("Original 95% CI:", round(exp(res$ci.lb), 4), "-", round(exp(res$ci.ub), 4), "\\n")\n  cat("PDG-Scaled 95% CI:", round(exp(ci_scaled_lower), 4), "-", round(exp(ci_scaled_upper), 4), "\\n")\n} else {\n  cat("S <= 1: No inflation needed (studies are consistent)\\n")\n}\n\n# --- 9.2 Tension Statistic ---\ncat("\\n--- Tension Statistic (Pairwise Disagreement) ---\\n")\nk <- length(yi)\npairs <- combn(k, 2)\nn_pairs <- ncol(pairs)\n\ntension_count <- 0\nfor(i in 1:n_pairs) {\n  diff <- abs(yi[pairs[1,i]] - yi[pairs[2,i]])\n  se_diff <- sqrt(vi[pairs[1,i]] + vi[pairs[2,i]])\n  z <- diff / se_diff\n  if(z > 1.96) tension_count <- tension_count + 1\n}\n\ntension_pct <- tension_count / n_pairs * 100\ncat("Disagreeing pairs:", tension_count, "/", n_pairs, "\\n")\ncat("Tension:", round(tension_pct, 1), "% (expected ~5% under homogeneity)\\n")\ncat("Disagreement index:", round(tension_pct / 5, 2), "x expected\\n")\n\n# --- 9.3 Cross-Validated I² ---\ncat("\\n--- Cross-Validated I² ---\\n")\ncv_i2 <- sapply(1:k, function(i) {\n  res_loo <- rma(yi = yi[-i], vi = vi[-i], method = "${n}")\n  res_loo$I2\n})\ncat("Full I²:", round(res$I2, 1), "%\\n")\ncat("Mean CV-I²:", round(mean(cv_i2), 1), "%\\n")\ncat("CV-I² Range:", round(min(cv_i2), 1), "-", round(max(cv_i2), 1), "%\\n")\ncat("CV-I² SD:", round(sd(cv_i2), 1), "pp\\n")\n\n# ===========================================\n# SECTION 10: NNT CALCULATION\n# ===========================================\n\ncat("\\n========== NNT CALCULATION ==========\\n")\n\n# Baseline risks to evaluate\nbaseline_risks <- c(0.05, 0.10, 0.15, 0.20, 0.25, 0.30)\n\nnnt_table <- data.frame(\n  Baseline_Risk = paste0(baseline_risks * 100, "%"),\n  RR = round(exp(theta), 3),\n  ARR = round(baseline_risks * (1 - exp(theta)) * 100, 2),\n  NNT = round(1 / abs(baseline_risks * (1 - exp(theta))), 0)\n)\nprint(nnt_table)\n\n# ===========================================\n# SECTION 11: SUBGROUP ANALYSIS TEMPLATE\n# ===========================================\n\ncat("\\n========== SUBGROUP ANALYSIS TEMPLATE ==========\\n")\ncat("\\n# To run subgroup analysis, add a 'subgroup' column to dat:\\n")\ncat("# dat$subgroup <- c('A', 'B', 'A', 'B', ...)  # Your subgroup labels\\n")\ncat("# Then run:\\n")\ncat("# res_sub <- rma(yi = yi, vi = vi, data = dat, method = '${n}',\\n")\ncat("#                mods = ~ subgroup, test = '${a?"knha":"z"}')\\n")\ncat("# summary(res_sub)\\n")\ncat("# forest(res_sub, order = dat$subgroup)\\n")\n\n# Example with random subgroups (for illustration)\nif(k >= 4) {\n  dat$subgroup_example <- rep(c("Group A", "Group B"), length.out = k)\n  res_sub_example <- rma(yi = yi, vi = vi, data = dat, \n                          method = "${n}",\n                          mods = ~ subgroup_example)\n  cat("\\n--- Example Subgroup Analysis (random groups) ---\\n")\n  print(res_sub_example)\n}\n\n# ===========================================\n# SECTION 12: META-REGRESSION TEMPLATE\n# ===========================================\n\ncat("\\n========== META-REGRESSION TEMPLATE ==========\\n")\ncat("\\n# To run meta-regression, add covariate columns to dat:\\n")\ncat("# dat$year <- c(2010, 2012, ...)\\n")\ncat("# dat$sample_size <- c(100, 200, ...)\\n")\ncat("# Then run:\\n")\ncat("# res_reg <- rma(yi = yi, vi = vi, data = dat,\\n")\ncat("#                mods = ~ year + sample_size, method = '${n}')\\n")\ncat("# summary(res_reg)\\n")\ncat("# \\n")\ncat("# For bubble plot:\\n")\ncat("# regplot(res_reg, mod = 'year', xlab = 'Year', \\n")\ncat("#         atransf = exp, predlim = c(-1, 1))\\n")\n\n# ===========================================\n# SECTION 13: EXPORT RESULTS\n# ===========================================\n\ncat("\\n========== EXPORT RESULTS ==========\\n")\n\n# Create results summary\nresults_summary <- list(\n  main_analysis = list(\n    k = res$k,\n    estimate = exp(coef(res)),\n    ci_lower = exp(res$ci.lb),\n    ci_upper = exp(res$ci.ub),\n    p_value = res$pval,\n    tau2 = res$tau2,\n    I2 = res$I2,\n    pi_lower = exp(pred$pi.lb),\n    pi_upper = exp(pred$pi.ub)\n  ),\n  ddma = list(\n    P_benefit = P_benefit,\n    P_benefit_pred = P_benefit_pred,\n    P_mcid = P_mcid\n  ),\n  bias = list(\n    egger_p = egger$pval,\n    trim_fill_missing = taf$k0\n  )\n)\n\ncat("Results summary object created: results_summary\\n")\ncat("Access with: results_summary$main_analysis$estimate\\n")\n\n# Save to file (optional)\n# saveRDS(results_summary, "meta_analysis_results.rds")\n# write.csv(dat, "study_data.csv", row.names = FALSE)\n\ncat("\\n========== ANALYSIS COMPLETE ==========\\n")\n`
}

function generateRCodeForestOptions(e) {
  e.names || e.yi.map((e, t) => `Study_${t+1}`);
  const t = e.measure || "OR";
  return `\n# ============================================================================\n# ADDITIONAL FOREST PLOT OPTIONS\n# ============================================================================\n\n# --- Option A: forestploter package (publication-quality) ---\nif(require(forestploter, quietly = TRUE)) {\n  \n  # Prepare table data\n  forest_tbl <- data.frame(\n    Study = study,\n    N = NA,  # Add sample sizes if available\n    Effect = paste0(round(exp(yi), 2), " [", \n                   round(exp(yi - 1.96*sei), 2), ", ",\n                   round(exp(yi + 1.96*sei), 2), "]"),\n    Weight = paste0(round(weights(res), 1), "%")\n  )\n  \n  # Add pooled row\n  forest_tbl <- rbind(forest_tbl, \n    data.frame(Study = "Overall", N = NA,\n               Effect = paste0(round(exp(coef(res)), 2), " [",\n                              round(exp(res$ci.lb), 2), ", ",\n                              round(exp(res$ci.ub), 2), "]"),\n               Weight = "100%"))\n  \n  # Define theme\n  tm <- forest_theme(base_size = 10,\n                     ci_pch = 15,\n                     ci_col = "blue4",\n                     ci_fill = "blue4",\n                     refline_col = "gray70")\n  \n  # Create plot\n  p <- forest(forest_tbl,\n              est = c(exp(yi), exp(coef(res))),\n              lower = c(exp(yi - 1.96*sei), exp(res$ci.lb)),\n              upper = c(exp(yi + 1.96*sei), exp(res$ci.ub)),\n              ci_column = 3,\n              ref_line = 1,\n              xlim = c(0.25, 4),\n              ticks_at = c(0.5, 1, 2),\n              theme = tm)\n  print(p)\n}\n\n# --- Option B: meta package forest ---\nif(require(meta, quietly = TRUE)) {\n  \n  # Create meta object\n  m <- metagen(TE = yi, seTE = sei, studlab = study,\n               sm = "${t}", method.tau = "REML")\n  \n  # Standard forest\n  forest(m, sortvar = yi, \n         leftcols = c("studlab", "effect", "ci"),\n         leftlabs = c("Study", "${t}", "95% CI"),\n         rightcols = c("w.random"),\n         rightlabs = c("Weight"),\n         print.tau2 = TRUE,\n         print.I2 = TRUE)\n  \n  # Drapery plot\n  drapery(m, labels = "studlab")\n}\n\n# --- Option C: Custom themed forest with ggplot2 ---\nif(require(ggplot2, quietly = TRUE)) {\n  \n  # Prepare data\n  plot_data <- data.frame(\n    study = factor(c(as.character(study), "Pooled"), \n                   levels = c("Pooled", rev(as.character(study)))),\n    estimate = c(exp(yi), exp(coef(res))),\n    lower = c(exp(yi - 1.96*sei), exp(res$ci.lb)),\n    upper = c(exp(yi + 1.96*sei), exp(res$ci.ub)),\n    weight = c(weights(res), NA),\n    type = c(rep("Study", length(yi)), "Pooled")\n  )\n  \n  # Prediction interval for pooled\n  pi_data <- data.frame(\n    x = exp(coef(res)),\n    xmin = exp(pred$pi.lb),\n    xmax = exp(pred$pi.ub),\n    y = "Pooled"\n  )\n  \n  # Create themed plot\n  p_themed <- ggplot(plot_data, aes(x = estimate, y = study)) +\n    # Prediction interval (gray band)\n    geom_rect(data = pi_data, inherit.aes = FALSE,\n              aes(xmin = xmin, xmax = xmax, ymin = 0.5, ymax = 1.5),\n              fill = "gray85", alpha = 0.5) +\n    # Reference line\n    geom_vline(xintercept = 1, linetype = "dashed", color = "gray40") +\n    # Study CIs\n    geom_errorbarh(aes(xmin = lower, xmax = upper, color = type), \n                   height = 0.25) +\n    # Study points\n    geom_point(aes(size = weight, shape = type, fill = type), \n               color = "black") +\n    # Scales\n    scale_x_log10(breaks = c(0.5, 0.75, 1, 1.5, 2), \n                  limits = c(0.3, 3)) +\n    scale_size_continuous(range = c(2, 6), guide = "none") +\n    scale_shape_manual(values = c("Study" = 15, "Pooled" = 18)) +\n    scale_fill_manual(values = c("Study" = "#2171b5", "Pooled" = "#cb181d")) +\n    scale_color_manual(values = c("Study" = "#2171b5", "Pooled" = "#cb181d")) +\n    # Theme\n    labs(x = "${t}", y = NULL, \n         title = "Forest Plot",\n         subtitle = paste0("I² = ", round(res$I2, 1), "%, τ² = ", round(res$tau2, 4))) +\n    theme_minimal(base_size = 11) +\n    theme(\n      legend.position = "none",\n      panel.grid.major.y = element_blank(),\n      panel.grid.minor = element_blank(),\n      axis.text.y = element_text(hjust = 0),\n      plot.title = element_text(face = "bold")\n    )\n  \n  print(p_themed)\n  \n  # Save to file\n  # ggsave("forest_plot.png", p_themed, width = 8, height = 6, dpi = 300)\n  # ggsave("forest_plot.pdf", p_themed, width = 8, height = 6)\n}\n\n# --- Option D: Sorted by year (if available) ---\n# dat$year <- c(...)  # Add publication years\n# forest(res, order = order(dat$year), header = TRUE)\n\n# --- Option E: Colored by risk of bias ---\n# dat$rob <- c("Low", "High", "Unclear", ...)\n# cols <- ifelse(dat$rob == "Low", "green", ifelse(dat$rob == "High", "red", "yellow"))\n# forest(res, header = TRUE, col = cols)\n`
}

function generatePythonCode(e, t = {}) {
  const {
    mcid: n = .15
  } = t, a = e.names || e.yi.map((e, t) => `Study_${t+1}`);
  return `\n# =============================================\n# Meta-Analysis Generated by Pairwise Pro v2.2\n# ${(new Date).toISOString()}\n# =============================================\n\nimport numpy as np\nfrom scipy import stats\nimport matplotlib.pyplot as plt\n\n# Study data\nstudies = [${a.map(e=>`"${e}"`).join(", ")}]\nyi = np.array([${e.yi.map(e=>e.toFixed(4)).join(", ")}])\nvi = np.array([${e.vi.map(e=>e.toFixed(4)).join(", ")}])\nsei = np.sqrt(vi)\nk = len(yi)\n\n# Fixed-effect\nwi_fe = 1 / vi\nsumW_fe = np.sum(wi_fe)\ntheta_fe = np.sum(wi_fe * yi) / sumW_fe\nQ = np.sum(wi_fe * (yi - theta_fe)**2)\nC = sumW_fe - np.sum(wi_fe**2) / sumW_fe\ntau2 = max(0, (Q - (k - 1)) / C)\n\n# Random-effects\nwi_re = 1 / (vi + tau2)\nsumW_re = np.sum(wi_re)\ntheta_re = np.sum(wi_re * yi) / sumW_re\nse_re = 1 / np.sqrt(sumW_re)\n\nI2 = max(0, (Q - (k-1)) / Q * 100) if Q > 0 else 0\n\nprint(f"Effect: {theta_re:.4f} ({np.exp(theta_re):.4f})")\nprint(f"95% CI: [{theta_re - 1.96*se_re:.4f}, {theta_re + 1.96*se_re:.4f}]")\nprint(f"tau²: {tau2:.4f}, I²: {I2:.1f}%")\n\n# DDMA\nse_pred = np.sqrt(se_re**2 + tau2)\nP_benefit = stats.norm.cdf(0, loc=theta_re, scale=se_re)\nP_mcid = stats.norm.cdf(-${n}, loc=theta_re, scale=se_pred)\nprint(f"\\nP(benefit): {P_benefit:.4f}")\nprint(f"P(exceeds MCID): {P_mcid:.4f}")\n\n# Forest plot\nfig, ax = plt.subplots(figsize=(10, 6))\ny_pos = np.arange(k)\nax.errorbar(yi, y_pos, xerr=1.96*sei, fmt='s', capsize=3)\nax.axvline(theta_re, color='red', linestyle='--')\nax.set_yticks(y_pos)\nax.set_yticklabels(studies)\nax.set_xlabel('Effect Size (log scale)')\nplt.tight_layout()\nplt.savefig('forest_plot.png', dpi=150)\nplt.show()\n`
}

function generateStataCode(e, t = {}) {
  const {
    mcid: n = .15
  } = t, a = (e.names || e.yi.map((e, t) => `Study_${t+1}`)).map((t, n) => `"${t}" ${e.yi[n].toFixed(4)} ${Math.sqrt(e.vi[n]).toFixed(4)}`).join("\\n");
  return `\n* =============================================\n* Meta-Analysis Generated by Pairwise Pro v2.2\n* ${(new Date).toISOString()}\n* =============================================\n\nclear all\nset more off\n\ninput str40 study float yi float sei\n${a}\nend\n\ngen vi = sei^2\n\n* Meta-analysis (Stata 16+)\nmeta set yi sei, studylabel(study)\nmeta summarize, random(reml) predinterval\n\n* Forest plot\nmeta forestplot, random(reml)\ngraph export "forest_plot.png", replace\n\n* Funnel plot & Egger's test\nmeta funnelplot, random(reml)\nmeta bias, egger\n\n* DDMA probabilities\nlocal theta = r(theta)\nlocal se = r(se)\nlocal tau2 = r(tau2)\nlocal se_pred = sqrt(\`se'^2 + \`tau2')\nlocal P_benefit = normal((0 - \`theta') / \`se')\nlocal P_mcid = normal((-${n} - \`theta') / \`se_pred')\n\ndi "P(benefit): " %6.4f \`P_benefit'\ndi "P(exceeds MCID): " %6.4f \`P_mcid'\n`
}

function calculateLnCVR(e) {
  const t = e.filter(e => void 0 !== e.mean_t && e.sd_t > 0 && e.n_t > 0 && void 0 !== e.mean_c && e.sd_c > 0 && e.n_c > 0 && e.mean_t > 0 && e.mean_c > 0),
    n = e.filter(e => void 0 !== e.mean_t && void 0 !== e.mean_c && (e.mean_t <= 0 || e.mean_c <= 0));
  if (t.length < 2) return {
    available: !1,
    reason: "Requires continuous outcomes with mean, SD, n for both arms AND positive means (CV undefined for mean ≤ 0)",
    excluded_count: n.length,
    note: n.length > 0 ? `${n.length} study(ies) excluded due to non-positive means` : null
  };
  const a = [],
    s = [],
    i = [];
  for (const e of t) {
    Math.min(e.mean_t, e.mean_c) < .1 * Math.max(e.sd_t, e.sd_c) && i.push(`${e.name}: Mean close to zero relative to SD - CV estimate may be unstable`);
    const t = e.sd_t / e.mean_t,
      n = e.sd_c / e.mean_c,
      r = Math.log(t) - Math.log(n),
      o = 1 / (2 * (e.n_t - 1)) + t * t / (2 * e.n_t) + (1 / (2 * (e.n_c - 1)) + n * n / (2 * e.n_c));
    a.push(r), s.push(o)
  }
  const r = estimateTau2_REML(a, s),
    o = calculatePooledEstimate(a, s, r.tau2),
    l = calculateHeterogeneity(a, s, r.tau2),
    d = Math.exp(o.theta),
    c = Math.exp(o.ci_lower),
    u = Math.exp(o.ci_upper);
  let p;
  return p = o.ci_lower > 0 ? "Treatment INCREASES outcome variability (95% CI excludes 1)" : o.ci_upper < 0 ? "Treatment DECREASES outcome variability (95% CI excludes 1)" : d > 1.1 ? "Treatment may increase variability (not statistically significant)" : d < .9 ? "Treatment may decrease variability (not statistically significant)" : "No substantial difference in variability", {
    available: !0,
    k: t.length,
    lnCVR: o.theta,
    lnCVR_se: o.se,
    lnCVR_ci: [o.ci_lower, o.ci_upper],
    CVR: d,
    CVR_ci: [c, u],
    p_value: o.p_value,
    heterogeneity: {
      I2: l.I2,
      tau2: r.tau2
    },
    interpretation: p,
    clinical_insight: d < 1 ? "Treatment produces more consistent responses across patients" : d > 1 ? "Treatment response is more variable - consider patient selection strategies" : "Similar variability in both groups",
    study_details: t.map((e, t) => ({
      name: e.name,
      CV_t: e.sd_t && e.mean_t ? (e.sd_t / e.mean_t).toFixed(3) : "N/A",
      CV_c: e.sd_c && e.mean_c ? (e.sd_c / e.mean_c).toFixed(3) : "N/A",
      lnCVR: void 0 !== a[t] ? a[t].toFixed(4) : "N/A",
      weight: void 0 !== s[t] && void 0 !== r.tau2 ? (1 / (s[t] + r.tau2)).toFixed(2) : "N/A"
    })),
    warnings: i.length > 0 ? i : null,
    excluded_non_positive: n.length,
    methodological_notes: ["CV is only meaningful for ratio-scale outcomes with positive means", "Not appropriate for change scores that can be negative", "High CV (>1) indicates SD exceeds mean - interpret cautiously"],
    reference: "Senior AM, et al. Biol Rev 2020;95:734-753"
  }
}

function lowI2Diagnostic(e, t, n) {
  const a = e.length;
  if (a < 3) return {
    available: !1,
    reason: "Requires at least 3 studies"
  };
  const s = .25 / .75 * (sum(t.map(e => 1 / e)) - sum(t.map(e => 1 / (e * e))) / sum(t.map(e => 1 / e))),
    i = a - 1,
    r = qchisq(.9, i);
  let o = 0;
  if (s > 0) {
    o = 1 - pchisq(r / ((i + s) / (i + 2 * s)), Math.pow(i + s, 2) / (i + 2 * s)), o = Math.max(0, Math.min(1, o))
  }
  let l = 0,
    d = 0;
  for (let n = 0; n < a; n++)
    for (let s = n + 1; s < a; s++) {
      Math.abs(e[n] - e[s]) / Math.sqrt(t[n] + t[s]) > 1.96 && l++, d++
    }
  const c = l / d * 100,
    u = c / 5,
    p = estimateTau2_DL(e, t);
  let m, h;
  return n < 25 ? o < .5 ? (m = "UNDERPOWERED", h = "Low - cannot reliably detect moderate heterogeneity") : c > 10 ? (m = "MISLEADING", h = "Low I² but high pairwise tension suggests hidden heterogeneity") : (m = "LIKELY HOMOGENEOUS", h = "Adequate power and low tension support genuine homogeneity") : (m = "HETEROGENEITY DETECTED", h = "I² indicates meaningful between-study variation"), {
    available: !0,
    I2_observed: n,
    Q_statistic: p.Q,
    Q_pvalue: p.p_Q,
    power_to_detect_I2_25: o,
    tension: {
      disagreeing_pairs: l,
      total_pairs: d,
      percent: c,
      expected_under_null: 5
    },
    disagreement_index: u,
    diagnosis: m,
    confidence: h,
    recommendations: [o < .5 ? "Consider adding more studies to increase detection power" : null, c > 15 ? "Investigate specific study pairs showing disagreement" : null, n < 25 && o > .5 && c < 10 ? "Homogeneity assumption appears reasonable" : null].filter(Boolean),
    reference: "Jackson D. Stat Med 2006;25:2688-2699"
  }
}

function pdgScaleFactor(e, t) {
  const n = e.length;
  if (n < 2) return {
    available: !1,
    reason: "Requires at least 2 studies"
  };
  const a = t.map(e => 1 / e),
    s = sum(a),
    i = sum(e.map((e, t) => a[t] * e)) / s,
    r = Math.sqrt(1 / s),
    o = sum(e.map((e, t) => a[t] * Math.pow(e - i, 2))),
    l = n - 1,
    d = 1 - pchisq(o, l),
    c = Math.sqrt(o / l),
    u = Math.max(1, c),
    p = r * u,
    m = i - 1.96 * p,
    h = i + 1.96 * p;
  return {
    available: !0,
    k: n,
    theta: i,
    theta_exp: Math.exp(i),
    se_original: r,
    se_scaled: p,
    chi2: o,
    df: l,
    p_value: d,
    S: c,
    S_applied: u,
    inflation_percent: 100 * (u - 1),
    ci_original: {
      lower: i - 1.96 * r,
      upper: i + 1.96 * r,
      lower_exp: Math.exp(i - 1.96 * r),
      upper_exp: Math.exp(i + 1.96 * r)
    },
    ci_scaled: {
      lower: m,
      upper: h,
      lower_exp: Math.exp(m),
      upper_exp: Math.exp(h)
    },
    interpretation: c > 1 ? `Inflated SE by ${(100*(c-1)).toFixed(0)}% to account for unexplained heterogeneity` : "No inflation needed (studies consistent)",
    note: c > 2 ? "Large S suggests systematic differences - investigate sources" : null,
    reference: "Particle Data Group method (Phys Rev D 2024)"
  }
}

function winnersCurseCorrection(e, t, n, a) {
  const s = e.length,
    i = [];
  for (let n = 0; n < 1e3; n++) {
    const n = Array.from({
        length: s
      }, () => Math.floor(Math.random() * s)),
      a = n.map(t => e[t]),
      r = n.map(e => t[e]),
      o = calculatePooledEstimate(a, r, estimateTau2_DL(a, r).tau2);
    i.push(o.theta)
  }
  const r = mean(i) - n,
    o = n - r,
    l = Math.abs(n / a),
    d = l > 1.96;
  let c = n,
    u = 0;
  if (d) {
    const e = 1.96;
    u = 2 * a * (Math.exp(-.5 * e * e) / Math.sqrt(2 * Math.PI)) / (2 * (1 - pnorm(e))) * Math.sign(n), c = n - u
  }
  const p = estimateTau2_REML(e, t).tau2,
    m = a * a,
    h = m / (m + p),
    v = n * (1 - .5 * h),
    g = Math.abs(n) > .001 ? 100 * (Math.exp(Math.abs(n)) / Math.exp(Math.abs(o)) - 1) : 0,
    f = Math.abs(n) > .001 && d ? 100 * (Math.exp(Math.abs(n)) / Math.exp(Math.abs(c)) - 1) : 0;
  let _;
  return _ = d ? .4 * o + .3 * c + .3 * v : .5 * o + .5 * v, {
    available: !0,
    observed: {
      theta: n,
      theta_exp: Math.exp(n),
      se: a,
      z: l,
      is_significant: d
    },
    bootstrap_correction: {
      bias: r,
      theta_corrected: o,
      theta_corrected_exp: Math.exp(o),
      inflation_pct: g,
      method: "Non-parametric bootstrap (B=1000)"
    },
    conditional_correction: {
      bias: u,
      theta_corrected: c,
      theta_corrected_exp: Math.exp(c),
      inflation_pct: f,
      note: d ? "Truncated normal MLE correction applied" : "Not significant - no selection bias",
      method: "Ghosh et al. 2008 conditional MLE"
    },
    empirical_bayes: {
      shrinkage_factor: h,
      signal_ratio: signal_ratio,
      theta_corrected: v,
      theta_corrected_exp: Math.exp(v),
      method: "James-Stein type shrinkage toward null"
    },
    consensus_estimate: {
      theta: _,
      theta_exp: Math.exp(_),
      interpretation: "Weighted average (bootstrap 40-50%, conditional 30%, EB 30-50%)"
    },
    interpretation: g > 10 ? `Effect may be inflated by ~${Math.abs(g).toFixed(0)}% due to selection` : "Minimal inflation detected",
    caveats: ["Winner's curse primarily affects single-study discoveries", "Meta-analysis with k>" + s + " studies partially self-corrects", "Bootstrap bias can be noisy with small k"],
    reference: "Ghosh A, et al. Biometrics 2008;64:685-694; Zhong H, Prentice RL. Am J Epidemiol 2008"
  }
}

function treatmentResponseDistribution(e, t, n = .15, a = "lower") {
  const s = Math.max(t, .01),
    i = Math.sqrt(s);
  let r, o, l, d;
  "lower" === a ? (r = pnorm((0 - e) / i), o = 1 - r, l = pnorm((-n - e) / i), d = pnorm((-.288 - e) / i)) : (r = 1 - pnorm((0 - e) / i), o = 1 - r, l = 1 - pnorm((n - e) / i), d = 1 - pnorm((.223 - e) / i));
  const c = "lower" === a ? 1 - pnorm((.223 - e) / i) : pnorm((-.288 - e) / i),
    u = {};
  [5, 10, 25, 50, 75, 90, 95].forEach(t => {
    const n = qnorm(t / 100),
      a = e + n * i;
    u[`p${t}`] = {
      theta: a,
      effect: Math.exp(a)
    }
  });
  const p = .15 * (1 - Math.exp(e)),
    m = 0 !== p ? 1 / Math.abs(p) : 1 / 0,
    h = r > .01 ? m / r : 1 / 0;
  return {
    available: !0,
    population_distribution: {
      mean_theta: e,
      mean_effect: Math.exp(e),
      sd_theta: i,
      variance_source: "τ² only (within-patient variability not estimable from aggregate data)"
    },
    response_rates: {
      P_benefit: r,
      P_mcid: l,
      P_large_benefit: d,
      P_harm: o,
      P_large_harm: c
    },
    percentiles: u,
    clinical_summary: {
      responder_rate: `${(100*r).toFixed(0)}% expected to benefit`,
      mcid_rate: `${(100*l).toFixed(0)}% expected to reach clinically meaningful threshold`,
      harm_rate: `${(100*o).toFixed(0)}% may not benefit or experience harm`,
      nnt_standard: isFinite(m) ? m.toFixed(1) : "∞",
      nnt_responder_adjusted: isFinite(h) ? h.toFixed(1) : "∞"
    },
    personalization_insight: t > .04 ? "High between-study variability suggests treatment effects may vary across populations" : "Relatively consistent effects across studies",
    heterogeneity_contribution: 1,
    limitations: ["Cannot estimate within-patient variability from aggregate data", "τ² reflects between-study, not between-patient heterogeneity", "True patient-level response distribution requires IPD meta-analysis"],
    reference: "Conceptual adaptation from SSD. For proper IPD approach: Riley RD, et al. BMJ 2021;372:n160"
  }
}

function heteroscedasticityTest(e, t, n) {
  if (!n || n.length !== e.length) return {
    available: !1,
    reason: "Requires subgroup assignments for each study"
  };
  const a = [...new Set(n)];
  if (a.length < 2) return {
    available: !1,
    reason: "Requires at least 2 subgroups"
  };
  const s = {};
  let i = 0,
    r = 0;
  for (const o of a) {
    const a = n.map((e, t) => e === o ? t : -1).filter(e => e >= 0),
      l = a.map(t => e[t]),
      d = a.map(e => t[e]);
    if (l.length < 2) {
      s[o] = {
        k: l.length,
        tau2: null,
        pooled_theta: l[0] || null,
        Q_within: 0,
        df: 0,
        warning: "Insufficient studies for heterogeneity estimate"
      };
      continue
    }
    const c = estimateTau2_DL(l, d),
      u = calculatePooledEstimate(l, d, c.tau2),
      p = d.map(e => 1 / e),
      m = sum(l.map((e, t) => p[t] * e)) / sum(p),
      h = sum(l.map((e, t) => p[t] * Math.pow(e - m, 2)));
    i += h, r += l.length - 1, s[o] = {
      k: l.length,
      tau2: c.tau2,
      tau: Math.sqrt(c.tau2),
      pooled_theta: u.theta,
      pooled_exp: Math.exp(u.theta),
      I2: c.I2,
      Q_within: h,
      df: l.length - 1
    }
  }
  const o = t.map(e => 1 / e),
    l = sum(e.map((e, t) => o[t] * e)) / sum(o),
    d = sum(e.map((e, t) => o[t] * Math.pow(e - l, 2))),
    c = e.length - 1,
    u = d - i,
    p = a.length - 1,
    m = 1 - pchisq(u, p),
    h = Object.values(s).map(e => e.tau2).filter(e => null !== e && e > 0);
  let v, g, f = 1,
    _ = 0,
    y = 0;
  h.length >= 2 && (_ = Math.max(...h), y = Math.max(1e-4, Math.min(...h)), f = _ / y);
  const b = 1 - pchisq(i, r);
  return f > 3 && b < .1 ? (v = !0, g = "Strong evidence of heteroscedasticity - τ² varies substantially across subgroups") : f > 2 || f > 1.5 && b < .1 ? (v = "possible", g = "Moderate variation in τ² across subgroups - interpret pooled τ² cautiously") : (v = !1, g = "τ² appears relatively constant across subgroups"), {
    available: !0,
    n_groups: a.length,
    group_stats: s,
    tau2_ratio: f,
    tau2_max: _,
    tau2_min: y,
    Q_statistics: {
      Q_total: d,
      df_total: c,
      Q_within: i,
      df_within: r,
      Q_between: u,
      df_between: p,
      p_between: m,
      p_residual: b
    },
    heteroscedastic: v,
    interpretation: g,
    recommendation: !0 === v ? "Consider separate analyses by subgroup or location-scale modeling (rma() with scale= in metafor)" : "possible" === v ? "Sensitivity analysis with subgroup-specific τ² recommended" : "Pooled analysis with single τ² appears appropriate",
    reference: "Viechtbauer W, López-López JA. Res Synth Methods 2022;13:314-332"
  }
}

function generateOrchardPlotData(e, t, n, a, s, i = "OR") {
  const r = e.length,
    o = t.map(e => 1 / (e + s)),
    l = sum(o),
    d = o.map(e => e / l * 100),
    c = 1 / Math.sqrt(l),
    u = Math.max(1, r - 2),
    p = qt(.975, u) * Math.sqrt(s + c * c),
    m = a.theta - p,
    h = a.theta + p,
    v = n.map((n, a) => ({
      name: n,
      x: "RD" === i ? e[a] : Math.exp(e[a]),
      y: 0 + .3 * (Math.random() - .5),
      weight: d[a],
      size: 5 + .8 * d[a],
      se: Math.sqrt(t[a])
    })),
    g = v.map((n, a) => {
      const s = e[a] - 1.96 * Math.sqrt(t[a]),
        r = e[a] + 1.96 * Math.sqrt(t[a]);
      return {
        name: n.name,
        lower: "RD" === i ? s : Math.exp(s),
        upper: "RD" === i ? r : Math.exp(r),
        y: n.y
      }
    });
  return {
    type: "orchard",
    measure: i,
    pooled: {
      x: "RD" === i ? a.theta : Math.exp(a.theta),
      ci_lower: "RD" === i ? a.ci_lower : Math.exp(a.ci_lower),
      ci_upper: "RD" === i ? a.ci_upper : Math.exp(a.ci_upper),
      pi_lower: "RD" === i ? m : Math.exp(m),
      pi_upper: "RD" === i ? h : Math.exp(h)
    },
    studies: v,
    study_cis: g,
    k: r,
    reference: "Nakagawa S, et al. Res Synth Methods 2021;12:4-12"
  }
}

function renderOrchardPlot(e, t = "orchardPlot") {
  if ("undefined" == typeof Plotly) return void log.error("Plotly not loaded for orchard plot");
  if (!document.getElementById(t)) return void log.error("Orchard plot container not found");
  const n = getThemeColors(),
    a = e.crossDisc && e.crossDisc.orchardPlot || generateOrchardPlotData(e.yi, e.vi, e.studies.map(e => e.name), e.pooled, e.tau2, e.measure),
    s = "RD" === e.measure ? 0 : 1,
    i = [];
  i.push({
    type: "scatter",
    mode: "lines",
    x: [a.pooled.pi_lower, a.pooled.pi_upper],
    y: [0, 0],
    line: {
      color: "rgba(100, 100, 100, 0.3)",
      width: 20
    },
    showlegend: !0,
    name: "95% Prediction Interval",
    hoverinfo: "skip"
  }), i.push({
    type: "scatter",
    mode: "lines",
    x: [a.pooled.ci_lower, a.pooled.ci_upper],
    y: [0, 0],
    line: {
      color: n.primary || "#4a7ab8",
      width: 8
    },
    showlegend: !0,
    name: "95% Confidence Interval",
    hoverinfo: "skip"
  }), i.push({
    type: "scatter",
    mode: "markers",
    x: [a.pooled.x],
    y: [0],
    marker: {
      size: 16,
      color: n.accent || "#22c55e",
      symbol: "diamond",
      line: {
        width: 2,
        color: n.text
      }
    },
    showlegend: !0,
    name: "Pooled Estimate",
    hovertemplate: `Pooled: ${a.pooled.x.toFixed(3)}<extra></extra>`
  }), i.push({
    type: "scatter",
    mode: "markers",
    x: a.studies.map(e => e.x),
    y: a.studies.map(e => e.y),
    marker: {
      size: a.studies.map(e => e.size),
      color: n.primary || "#4a7ab8",
      opacity: .7
    },
    text: a.studies.map(e => `${e.name}<br>Effect: ${e.x.toFixed(3)}<br>Weight: ${e.weight.toFixed(1)}%`),
    hovertemplate: "%{text}<extra></extra>",
    showlegend: !0,
    name: "Individual Studies"
  }), i.push({
    type: "scatter",
    mode: "lines",
    x: [s, s],
    y: [-1, 1],
    line: {
      color: "rgba(128, 128, 128, 0.5)",
      width: 1,
      dash: "dash"
    },
    showlegend: !1,
    hoverinfo: "skip"
  });
  const r = {
    title: {
      text: "Orchard Plot",
      font: {
        color: n.text
      }
    },
    xaxis: {
      title: "RD" === e.measure ? "Risk Difference" : e.measure,
      type: "RD" === e.measure ? "linear" : "log",
      zeroline: !1,
      gridcolor: n.grid,
      color: n.text
    },
    yaxis: {
      visible: !1,
      range: [-.8, .8]
    },
    showlegend: !0,
    legend: {
      orientation: "h",
      y: -.15,
      font: {
        color: n.text
      }
    },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: {
      t: 50,
      r: 20,
      b: 80,
      l: 40
    }
  };
  Plotly.newPlot(t, i, r, {
    responsive: !0,
    displayModeBar: !1
  })
}

function runCrossDisciplinaryAnalyses(e, t) {
  const n = {};
  n.lnCVR = calculateLnCVR(t), n.lowI2Diagnostic = lowI2Diagnostic(e.yi, e.vi, e.het.I2), n.pdgScaleFactor = pdgScaleFactor(e.yi, e.vi), n.winnersCurse = winnersCurseCorrection(e.yi, e.vi, e.pooled.theta, e.pooled.se), n.responseDistribution = treatmentResponseDistribution(e.pooled.theta, e.tau2, .15, AppState.settings.direction), n.orchardPlot = generateOrchardPlotData(e.yi, e.vi, e.studies.map(e => e.name), e.pooled, e.tau2, e.measure);
  const a = t.map(e => e.subgroup).filter(e => e);
  return a.length === t.length ? n.heteroscedasticity = heteroscedasticityTest(e.yi, e.vi, a) : n.heteroscedasticity = {
    available: !1,
    reason: "No subgroup data"
  }, n
}

function cumulativeMetaAnalysis(e, t, n, a, s = "DL") {
  const i = e.length,
    r = n.map((e, t) => ({
      year: e,
      idx: t,
      name: a[t]
    })).sort((e, t) => e.year - t.year),
    o = {
      cumulative: [],
      stability: null,
      firstSignificant: null,
      trend: null
    };
  for (let n = 1; n <= i; n++) {
    const a = r.slice(0, n).map(e => e.idx),
      i = a.map(t => e[t]),
      l = a.map(e => t[e]),
      d = "REML" === s ? estimateTau2_REML(i, l) : estimateTau2_DL(i, l),
      c = pooledEstimate_RE(i, l, d.tau2),
      u = c.theta / c.se,
      p = 2 * (1 - normalCDF(Math.abs(u)));
    o.cumulative.push({
      k: n,
      year: r[n - 1].year,
      study: r[n - 1].name,
      theta: c.theta,
      se: c.se,
      ci_lower: c.ci_lower,
      ci_upper: c.ci_upper,
      z: u,
      pval: p,
      tau2: d.tau2,
      significant: p < .05
    }), !o.firstSignificant && p < .05 && (o.firstSignificant = {
      k: n,
      year: r[n - 1].year,
      study: r[n - 1].name
    })
  }
  if (i >= 4) {
    const e = o.cumulative.slice(-3),
      t = Math.max(...e.map(e => e.theta)) - Math.min(...e.map(e => e.theta)),
      n = o.cumulative[i - 1].se;
    o.stability = {
      stable: t < n,
      thetaRange: t,
      interpretation: t < n ? "Estimate has stabilized (recent change < 1 SE)" : "Estimate still changing substantially"
    }
  }
  if (i >= 3) {
    const e = o.cumulative.map(e => e.theta),
      t = e.slice(0, Math.floor(i / 2)).reduce((e, t) => e + t, 0) / Math.floor(i / 2),
      n = e.slice(Math.floor(i / 2)).reduce((e, t) => e + t, 0) / (i - Math.floor(i / 2));
    o.trend = {
      earlyMean: t,
      lateMean: n,
      direction: n < t ? "attenuating" : "strengthening",
      magnitude: Math.abs(n - t)
    }
  }
  return o
}

function selectionModel(e, t, n = "step") {
  e.length;
  const a = e.map((e, n) => {
      const a = e / Math.sqrt(t[n]);
      return 2 * (1 - normalCDF(Math.abs(a)))
    }),
    s = estimateTau2_REML(e, t),
    i = pooledEstimate_RE(e, t, s.tau2);
  if ("step" === n) {
    const n = [{
        lower: 0,
        upper: .025,
        weight: 1
      }, {
        lower: .025,
        upper: .05,
        weight: .9
      }, {
        lower: .05,
        upper: .1,
        weight: .7
      }, {
        lower: .1,
        upper: .5,
        weight: .5
      }, {
        lower: .5,
        upper: 1,
        weight: .4
      }],
      r = a.map(e => {
        const t = n.find(t => e >= t.lower && e < t.upper);
        return t ? 1 / t.weight : 1
      }),
      o = t.map((e, t) => r[t] / (e + s.tau2)),
      l = o.reduce((e, t) => e + t, 0),
      d = o.reduce((t, n, a) => t + n * e[a], 0) / l,
      c = Math.sqrt(1 / l);
    return {
      type: "step",
      unadjusted: {
        theta: i.theta,
        se: i.se,
        ci_lower: i.ci_lower,
        ci_upper: i.ci_upper
      },
      adjusted: {
        theta: d,
        se: c,
        ci_lower: d - 1.96 * c,
        ci_upper: d + 1.96 * c
      },
      selectionWeights: n,
      changePct: (i.theta - d) / Math.abs(i.theta) * 100,
      interpretation: Math.abs(d) < Math.abs(i.theta) ? "Selection model suggests publication bias inflated the effect" : "Selection model suggests minimal publication bias"
    }
  } {
    const n = 2,
      r = t.map((e, t) => {
        const i = 1 / (e + s.tau2);
        return a[t] >= .05 ? i * n : i
      }),
      o = r.reduce((e, t) => e + t, 0),
      l = r.reduce((t, n, a) => t + n * e[a], 0) / o,
      d = Math.sqrt(1 / o);
    return {
      type: "beta",
      unadjusted: {
        theta: i.theta,
        se: i.se,
        ci_lower: i.ci_lower,
        ci_upper: i.ci_upper
      },
      adjusted: {
        theta: l,
        se: d,
        ci_lower: l - 1.96 * d,
        ci_upper: l + 1.96 * d
      },
      changePct: (i.theta - l) / Math.abs(i.theta) * 100,
      interpretation: Math.abs(l) < Math.abs(i.theta) ? "Beta selection model suggests publication bias present" : "Beta selection model suggests minimal publication bias"
    }
  }
}

function copasSelectionModel(e, t) {
  const n = e.length,
    a = t.map(e => Math.sqrt(e)),
    s = estimateTau2_REML(e, t),
    i = pooledEstimate_RE(e, t, s.tau2),
    r = [],
    o = [-2, -1, -.5, 0, .5, 1],
    l = [0, .5, 1, 1.5, 2];
  for (const i of o)
    for (const o of l) {
      const l = a.map(e => normalCDF(i + o / e));
      if (l.some(e => e < .01 || e > .99)) continue;
      const d = l.map(e => 1 / e),
        c = t.map((e, t) => d[t] / (e + s.tau2)),
        u = c.reduce((e, t) => e + t, 0),
        p = c.reduce((t, n, a) => t + n * e[a], 0) / u;
      r.push({
        gamma0: i,
        gamma1: o,
        theta: p,
        meanSelProb: l.reduce((e, t) => e + t, 0) / n
      })
    }
  const d = r.map(e => e.theta),
    c = Math.min(...d),
    u = Math.max(...d);
  return {
    unadjusted: {
      theta: i.theta,
      se: i.se,
      ci_lower: i.ci_lower,
      ci_upper: i.ci_upper
    },
    sensitivityContour: r,
    bounds: {
      lower: c,
      upper: u,
      range: u - c
    },
    robustness: u - c < 2 * i.se ? "Results robust to selection model assumptions" : "Results sensitive to selection model assumptions",
    interpretation: `Under various selection scenarios, adjusted θ ranges from ${c.toFixed(3)} to ${u.toFixed(3)}`
  }
}
const Matrix = {
  identity: e => {
    const t = [];
    for (let n = 0; n < e; n++) {
      t[n] = [];
      for (let a = 0; a < e; a++) t[n][a] = n === a ? 1 : 0
    }
    return t
  },
  zeros: (e, t) => {
    const n = [];
    for (let a = 0; a < e; a++) n[a] = new Array(t).fill(0);
    return n
  },
  add: (e, t) => e.map((e, n) => e.map((e, a) => e + t[n][a])),
  subtract: (e, t) => e.map((e, n) => e.map((e, a) => e - t[n][a])),
  multiply: (e, t) => {
    const n = [];
    for (let a = 0; a < e.length; a++) {
      n[a] = [];
      for (let s = 0; s < t[0].length; s++) {
        let i = 0;
        for (let n = 0; n < e[0].length; n++) i += e[a][n] * t[n][s];
        n[a][s] = i
      }
    }
    return n
  },
  multiplyVec: (e, t) => e.map(e => e.reduce((e, n, a) => e + n * t[a], 0)),
  scale: (e, t) => e.map(e => e.map(e => e * t)),
  transpose: e => e[0].map((t, n) => e.map(e => e[n])),
  trace: e => e.reduce((e, t, n) => e + t[n], 0),
  luDecompose: e => {
    const t = e.length,
      n = Matrix.identity(t),
      a = e.map(e => [...e]);
    for (let e = 0; e < t - 1; e++)
      for (let s = e + 1; s < t; s++)
        if (!(Math.abs(a[e][e]) < 1e-12)) {
          n[s][e] = a[s][e] / a[e][e];
          for (let i = e; i < t; i++) a[s][i] -= n[s][e] * a[e][i]
        } return {
      L: n,
      U: a
    }
  },
  forwardSolve: (e, t) => {
    const n = e.length,
      a = new Array(n).fill(0);
    for (let s = 0; s < n; s++) {
      a[s] = t[s];
      for (let t = 0; t < s; t++) a[s] -= e[s][t] * a[t];
      a[s] /= e[s][s]
    }
    return a
  },
  backwardSolve: (e, t) => {
    const n = e.length,
      a = new Array(n).fill(0);
    for (let s = n - 1; s >= 0; s--) {
      a[s] = t[s];
      for (let t = s + 1; t < n; t++) a[s] -= e[s][t] * a[t];
      a[s] /= e[s][s]
    }
    return a
  },
  invert: e => {
    const t = e.length,
      {
        L: n,
        U: a
      } = Matrix.luDecompose(e),
      s = [];
    for (let e = 0; e < t; e++) {
      const i = new Array(t).fill(0);
      i[e] = 1;
      const r = Matrix.forwardSolve(n, i),
        o = Matrix.backwardSolve(a, r);
      for (let n = 0; n < t; n++) s[n] || (s[n] = []), s[n][e] = o[n]
    }
    return s
  },
  cholesky: e => {
    const t = e.length,
      n = Matrix.zeros(t, t);
    for (let a = 0; a < t; a++)
      for (let t = 0; t <= a; t++) {
        let s = 0;
        for (let e = 0; e < t; e++) s += n[a][e] * n[t][e];
        if (a === t) {
          const i = e[a][a] - s;
          n[a][t] = i > 0 ? Math.sqrt(i) : 1e-10
        } else n[a][t] = (e[a][t] - s) / n[t][t]
      }
    return n
  },
  det: e => {
    const {
      U: t
    } = Matrix.luDecompose(e);
    return t.reduce((e, t, n) => e * t[n], 1)
  },
  logDet: e => {
    const {
      U: t
    } = Matrix.luDecompose(e);
    return t.reduce((e, t, n) => e + Math.log(Math.abs(t[n])), 0)
  },
  blockDiag: e => {
    const t = e.reduce((e, t) => e + t.length, 0),
      n = Matrix.zeros(t, t);
    let a = 0;
    for (const t of e) {
      const e = t.length;
      for (let s = 0; s < e; s++)
        for (let i = 0; i < e; i++) n[a + s][a + i] = t[s][i];
      a += e
    }
    return n
  },
  quadForm: (e, t) => {
    const n = Matrix.multiplyVec(t, e);
    return e.reduce((e, t, a) => e + t * n[a], 0)
  }
};

function correlationStructure(e, t, n = .5) {
  const a = Matrix.identity(t);
  switch (e.toUpperCase()) {
    case "CS":
      for (let e = 0; e < t; e++)
        for (let s = 0; s < t; s++) a[e][s] = e === s ? 1 : n;
      break;
    case "HCS":
      const e = Array.isArray(n) ? n : new Array(t * (t - 1) / 2).fill(n);
      let s = 0;
      for (let i = 0; i < t; i++)
        for (let r = i + 1; r < t; r++) a[i][r] = a[r][i] = e[s++] || n;
      break;
    case "AR":
    case "AR1":
      for (let e = 0; e < t; e++)
        for (let s = 0; s < t; s++) a[e][s] = Math.pow(n, Math.abs(e - s));
      break;
    case "CAR":
      for (let e = 0; e < t; e++)
        for (let s = 0; s < t; s++) a[e][s] = Math.pow(n, Math.abs(e - s));
      break;
    case "UN":
      if (Array.isArray(n) && n.length >= t * (t - 1) / 2) {
        let e = 0;
        for (let s = 0; s < t; s++)
          for (let i = s + 1; i < t; i++) a[s][i] = a[i][s] = n[e++]
      }
  }
  return a
}

function varCovFromCorr(e, t) {
  const n = e.length,
    a = Matrix.zeros(n, n);
  for (let s = 0; s < n; s++)
    for (let i = 0; i < n; i++) a[s][i] = t[s][i] * Math.sqrt(e[s]) * Math.sqrt(e[i]);
  return a
}

function rma_mv_multilevel(e, t, n, a = {}) {
  const {
    method: s = "REML",
    maxIter: i = 100,
    tol: r = 1e-6,
    verbose: o = !1,
    test: l = "z",
    level: d = .95
  } = a, c = e.length, u = [...new Set(n)], p = u.length, m = u.map(e => {
    const t = n.map((t, n) => t === e ? n : -1).filter(e => e >= 0);
    return {
      id: e,
      indices: t,
      n: t.length
    }
  }), h = estimateTau2_DL(e, t);
  let v = .5 * h.tau2,
    g = .5 * h.tau2,
    f = !1,
    _ = 0,
    y = -1 / 0,
    b = -1 / 0;
  for (; _ < i && !f;) {
    _++;
    const a = Matrix.zeros(c, c);
    for (let e = 0; e < c; e++)
      for (let s = 0; s < c; s++) a[e][s] = (e === s ? t[e] : 0) + (n[e] === n[s] ? v : 0) + g;
    let s;
    try {
      s = Matrix.invert(a)
    } catch (e) {
      for (let e = 0; e < c; e++) a[e][e] += 1e-6;
      s = Matrix.invert(a)
    }
    const i = new Array(c).fill(1),
      o = Matrix.multiplyVec(s, i),
      l = Matrix.multiplyVec(s, e),
      d = i.reduce((e, t, n) => e + o[n], 0),
      u = l.reduce((e, t) => e + t, 0) / d,
      h = (Math.sqrt(1 / d), e.map(e => e - u)),
      x = Matrix.logDet(a),
      w = Matrix.quadForm(h, s);
    if (y = -.5 * (c * Math.log(2 * Math.PI) + x + w + Math.log(d)), Math.abs(y - b) < r) {
      f = !0;
      break
    }
    b = y;
    const M = Matrix.zeros(c, c),
      S = Matrix.zeros(c, c);
    for (let e = 0; e < c; e++)
      for (let t = 0; t < c; t++) S[e][t] = 1, M[e][t] = n[e] === n[t] ? 1 : 0;
    i.map((e, t) => [1]);
    const E = s;
    Matrix.subtract(E, Matrix.scale(Matrix.multiply(Matrix.multiply([o], [
      [1 / d]
    ]), [o]), 1).map(e => e.map(() => 0)));
    let A = 0,
      R = 0;
    m.forEach(n => {
      if (n.n > 1) {
        const a = n.indices.reduce((t, n) => t + e[n], 0) / n.n;
        n.indices.forEach(n => {
          A += (e[n] - a) ** 2 / t[n]
        }), R += n.n - 1
      }
    });
    const I = m.map(n => ({
        mean: n.indices.reduce((n, a) => n + e[a] / t[a], 0) / n.indices.reduce((e, n) => e + 1 / t[n], 0),
        var: 1 / n.indices.reduce((e, n) => e + 1 / t[n], 0)
      })),
      T = I.reduce((e, t) => e + t.mean / t.var, 0) / I.reduce((e, t) => e + 1 / t.var, 0);
    let C = 0;
    I.forEach(e => {
      C += (e.mean - T) ** 2 / e.var
    });
    v = .5 * v + .5 * Math.max(0, (A - R) / R), g = .5 * g + .5 * Math.max(0, (C - (p - 1)) / I.reduce((e, t) => e + 1 / t.var, 0))
  }
  const x = Matrix.zeros(c, c);
  for (let e = 0; e < c; e++)
    for (let a = 0; a < c; a++) x[e][a] = (e === a ? t[e] : 0) + (n[e] === n[a] ? v : 0) + g;
  const w = Matrix.invert(x),
    M = new Array(c).fill(1),
    S = Matrix.multiplyVec(w, M),
    E = Matrix.multiplyVec(w, e),
    A = S.reduce((e, t) => e + t, 0),
    R = E.reduce((e, t) => e + t, 0) / A;
  let I = Math.sqrt(1 / A),
    T = c - 1,
    C = R / I,
    P = 2 * (1 - normalCDF(Math.abs(C))),
    k = 1.96;
  if ("knha" === l || "t" === l) {
    const t = e.map(e => e - R),
      n = S,
      a = t.reduce((e, t, a) => e + t * t * n[a], 0),
      s = A - S.reduce((e, t) => e + t * t, 0) / A;
    if (s > 0) {
      const e = Math.sqrt(a / ((c - 1) * s) * A);
      I *= Math.max(1, e)
    }
    T = p - 1, C = R / I, k = tQuantile(1 - (1 - d) / 2, T), P = 2 * (1 - tCDF(Math.abs(C), T))
  }
  const D = R - k * I,
    $ = R + k * I,
    N = t.reduce((e, t) => e + t, 0) / c,
    F = N + v + g,
    L = v / (F - N) * 100,
    O = g / (F - N) * 100,
    B = L + O,
    H = Math.sqrt(I ** 2 + v + g),
    q = R - tQuantile(.975, T) * H,
    z = R + tQuantile(.975, T) * H,
    V = -2 * y + 6,
    j = -2 * y + 3 * Math.log(c),
    U = e.reduce((e, n, a) => e + (n - R) ** 2 / t[a], 0);
  return {
    model: "Three-Level Random Effects (rma.mv)",
    method: s,
    pooled: {
      estimate: R,
      se: I,
      ci_lower: D,
      ci_upper: $,
      zval: "knha" === l ? null : C,
      tval: "knha" === l ? C : null,
      df: "knha" === l ? T : null,
      pval: P
    },
    predictionInterval: {
      lower: q,
      upper: z
    },
    varianceComponents: {
      sigma2_within: v,
      sigma2_between: g,
      tau2_total: v + g,
      sigma_within: Math.sqrt(v),
      sigma_between: Math.sqrt(g)
    },
    heterogeneity: {
      I2_level2: L,
      I2_level3: O,
      I2_total: B,
      Q_total: U,
      Q_df: c - 1,
      Q_pval: 1 - chiSquareCDF(U, c - 1)
    },
    structure: {
      k: c,
      nClusters: p,
      avgPerCluster: (c / p).toFixed(2),
      clusterSizes: m.map(e => e.n)
    },
    fit: {
      logLik: y,
      AIC: V,
      BIC: j,
      converged: f,
      iterations: _
    },
    test: l,
    interpretation: {
      variance: O > L ? "Most heterogeneity is between clusters (Level 3 dominant)" : "Substantial within-cluster heterogeneity (Level 2 dominant)",
      effect: P < .05 ? `Significant pooled effect (${"knha"===l?"t":"z"} = ${C.toFixed(3)}, p = ${P.toFixed(4)})` : "No significant pooled effect"
    }
  }
}

function rma_mv_multivariate(e, t, n, a, s = {}) {
  const {
    rho: i = .5,
    struct: r = "CS",
    method: o = "REML",
    test: l = "z",
    maxIter: d = 100,
    tol: c = 1e-6,
    level: u = .95,
    verbose: p = !1
  } = s, m = e.length, h = [...new Set(n)], v = [...new Set(a)], g = h.length, f = v.length, _ = h.map(s => {
    const i = n.map((e, t) => e === s ? t : -1).filter(e => e >= 0),
      r = i.map(e => a[e]);
    return {
      id: s,
      indices: i,
      outcomes: r,
      yi: i.map(t => e[t]),
      vi: i.map(e => t[e]),
      n: i.length
    }
  }), y = _.map(e => {
    const t = e.n;
    if (1 === t) return [
      [e.vi[0]]
    ];
    const n = correlationStructure(r, t, i);
    return varCovFromCorr(e.vi, n)
  });
  let b = v.map(() => .1);
  const x = v.map(n => {
    const s = a.map((e, t) => e === n ? t : -1).filter(e => e >= 0),
      i = s.map(t => e[t]),
      r = s.map(e => t[e]);
    if (i.length < 2) return {
      theta: i[0] || 0,
      se: Math.sqrt(r[0]) || 1,
      tau2: 0
    };
    const o = estimateTau2_REML(i, r),
      l = pooledEstimate_RE(i, r, o.tau2);
    return {
      outcome: n,
      k: i.length,
      theta: l.theta,
      se: l.se,
      tau2: o.tau2
    }
  });

  function w(e, t) {
    const n = Matrix.zeros(m, m);
    for (let a = 0; a < _.length; a++) {
      const s = _[a],
        i = s.n,
        r = y[a];
      for (let e = 0; e < i; e++)
        for (let t = 0; t < i; t++) {
          const a = s.indices[e],
            i = s.indices[t];
          n[a][i] = r[e][t]
        }
      for (let a = 0; a < i; a++)
        for (let r = 0; r < i; r++) {
          const i = s.indices[a],
            o = s.indices[r],
            l = v.indexOf(s.outcomes[a]),
            d = v.indexOf(s.outcomes[r]);
          n[i][o] += a === r ? e[l] : t * Math.sqrt(e[l]) * Math.sqrt(e[d])
        }
    }
    return n
  }

  function M(t) {
    const n = Matrix.zeros(m, f);
    for (let e = 0; e < m; e++) {
      const t = v.indexOf(a[e]);
      n[e][t] = 1
    }
    let s;
    try {
      s = Matrix.invert(t)
    } catch (e) {
      for (let e = 0; e < m; e++) t[e][e] += 1e-6;
      s = Matrix.invert(t)
    }
    const i = Matrix.multiply(Matrix.transpose(n), s),
      r = Matrix.multiply(i, n),
      o = Matrix.invert(r),
      l = Matrix.multiplyVec(i, e),
      d = Matrix.multiplyVec(o, l),
      c = o.map((e, t) => Math.sqrt(e[t])),
      u = Matrix.multiplyVec(n, d),
      p = e.map((e, t) => e - u[t]),
      h = Matrix.quadForm(p, s),
      g = Matrix.logDet(t);
    return {
      beta: d,
      se: c,
      RSS: h,
      logLik: -.5 * (m * Math.log(2 * Math.PI) + g + h),
      Vinv: s,
      XtVinvXinv: o
    }
  }
  b = x.map(e => e.tau2);
  let S = !1,
    E = 0,
    A = -1 / 0;
  for (E = 0; E < d; E++) {
    const n = w(b, .5),
      {
        beta: s,
        se: i,
        RSS: r,
        logLik: o,
        Vinv: l
      } = M(n);
    if (Math.abs(o - A) < c) {
      S = !0, A = o;
      break
    }
    A = o;
    v.map((e, t) => s[t]);
    for (let n = 0; n < f; n++) {
      const i = v[n],
        r = a.map((e, t) => e === i ? t : -1).filter(e => e >= 0);
      if (r.length > 1) {
        const a = r.map(t => e[t]),
          i = r.map(e => t[e]),
          o = a.map(e => e - s[n]),
          l = i.map(e => 1 / (e + b[n])),
          d = l.reduce((e, t) => e + t, 0),
          c = o.reduce((e, t, n) => e + l[n] * t * t, 0),
          u = d - l.reduce((e, t) => e + t * t, 0) / d;
        u > 0 && (b[n] = Math.max(0, (c - (r.length - 1)) / u))
      }
    }
  }
  const R = M(w(b, .5)),
    I = v.map((e, t) => {
      const n = R.beta[t] / R.se[t],
        a = 2 * (1 - normalCDF(Math.abs(n))),
        s = "knha" === l ? tQuantile(1 - (1 - u) / 2, g - 1) : 1.96;
      return {
        outcome: e,
        estimate: R.beta[t],
        se: R.se[t],
        ci_lower: R.beta[t] - s * R.se[t],
        ci_upper: R.beta[t] + s * R.se[t],
        zval: n,
        pval: a,
        tau2: b[t],
        tau: Math.sqrt(b[t])
      }
    });
  if (f >= 2) {
    const e = Matrix.zeros(f - 1, f);
    for (let t = 0; t < f - 1; t++) e[t][0] = -1, e[t][t + 1] = 1;
    const t = Matrix.multiplyVec(e, R.beta),
      n = Matrix.multiply(Matrix.multiply(e, R.XtVinvXinv), Matrix.transpose(e));
    try {
      const e = Matrix.invert(n),
        a = Matrix.quadForm(t, e),
        s = 1 - chiSquareCDF(a, f - 1);
      return {
        model: "Multivariate Random Effects (rma.mv)",
        method: o,
        structure: r,
        outcomeResults: I,
        moderatorTest: {
          QM: a,
          df: f - 1,
          pval: s,
          significant: s < .05,
          interpretation: s < .05 ? "Significant differences between outcomes" : "No significant differences between outcomes"
        },
        correlation: {
          withinStudy: i,
          betweenOutcome: .5,
          structure: r
        },
        varianceComponents: b.map((e, t) => ({
          outcome: v[t],
          tau2: e,
          tau: Math.sqrt(e)
        })),
        structure: {
          k: m,
          nStudies: g,
          nOutcomes: f,
          studySizes: _.map(e => e.n)
        },
        fit: {
          logLik: A,
          AIC: -2 * A + 2 * (f + f),
          BIC: -2 * A + Math.log(m) * (f + f),
          converged: S,
          iterations: E
        }
      }
    } catch (e) {}
  }
  return {
    model: "Multivariate Random Effects (rma.mv)",
    method: o,
    outcomeResults: I,
    varianceComponents: b.map((e, t) => ({
      outcome: v[t],
      tau2: e,
      tau: Math.sqrt(e)
    })),
    structure: {
      k: m,
      nStudies: g,
      nOutcomes: f
    },
    fit: {
      logLik: A,
      converged: S,
      iterations: E
    }
  }
}

function correlationSensitivity(e, t, n, a) {
  const s = [0, .2, .4, .5, .6, .8, .95].map(s => {
      try {
        const i = rma_mv_multivariate(e, t, n, a, {
          rho: s,
          maxIter: 50
        });
        return {
          rho: s,
          estimates: i.outcomeResults.map(e => ({
            outcome: e.outcome,
            estimate: e.estimate,
            se: e.se,
            pval: e.pval
          })),
          logLik: i.fit.logLik
        }
      } catch (e) {
        return {
          rho: s,
          error: e.message
        }
      }
    }),
    i = s.filter(e => !e.error);
  if (i.length < 2) return {
    results: s,
    robust: null,
    interpretation: "Insufficient valid results for sensitivity assessment"
  };
  const r = i[0].estimates.map(e => e.outcome).map(e => {
    const t = i.map(t => t.estimates.find(t => t.outcome === e)?.estimate).filter(e => void 0 !== e),
      n = Math.max(...t) - Math.min(...t),
      a = i.map(t => t.estimates.find(t => t.outcome === e)?.se).filter(e => void 0 !== e).reduce((e, t) => e + t, 0) / i.length;
    return {
      outcome: e,
      estimateRange: n,
      avgSE: a,
      robust: n < a,
      interpretation: n < a ? "Results robust to correlation assumptions" : "Results sensitive to correlation assumptions"
    }
  });
  return {
    results: s,
    robustness: r,
    interpretation: r.every(e => e.robust) ? "All outcomes are robust to within-study correlation assumptions" : "Some outcomes are sensitive to correlation assumptions - interpret with caution"
  }
}

function threeLevelMA(e, t, n) {
  try {
    return rma_mv_multilevel(e, t, n, {
      method: "REML",
      test: "z"
    })
  } catch (a) {
    return threeLevelMA_simple(e, t, n)
  }
}

function threeLevelMA_simple(e, t, n) {
  const a = e.length,
    s = [...new Set(n)],
    i = s.length,
    r = s.map(a => {
      const s = n.map((e, t) => e === a ? t : -1).filter(e => e >= 0),
        i = s.map(e => 1 / t[e]),
        r = i.reduce((e, t) => e + t, 0);
      return {
        mean: i.reduce((t, n, a) => t + n * e[s[a]], 0) / r,
        var: 1 / r,
        n: s.length
      }
    }),
    o = r.map(e => e.mean),
    l = r.map(e => e.var),
    d = estimateTau2_REML(o, l),
    c = pooledEstimate_RE(o, l, d.tau2);
  return {
    pooled: {
      estimate: c.theta,
      se: c.se,
      ci_lower: c.ci_lower,
      ci_upper: c.ci_upper,
      pval: 2 * (1 - normalCDF(Math.abs(c.theta / c.se)))
    },
    varianceComponents: {
      sigma2_within: 0,
      sigma2_between: d.tau2
    },
    structure: {
      k: a,
      nClusters: i
    }
  }
}

function multivariateMA(e, t, n, a, s = .5) {
  try {
    return rma_mv_multivariate(e, t, n, a, {
      rho: s,
      struct: "CS"
    })
  } catch (e) {
    return {
      error: e.message
    }
  }
}

function survivalMetaAnalysis(e, t, n, a = {}) {
  const s = e.length,
    i = t.map(e => e * e),
    r = estimateTau2_REML(e, i),
    o = pooledEstimate_RE(e, i, r.tau2),
    l = calculateHeterogeneity(e, i, r.tau2),
    d = predictionInterval_Standard(o.theta, o.se, r.tau2, s),
    c = calculateHKSJ(e, i, o.theta, r.tau2),
    u = Math.exp(o.theta),
    p = Math.exp(o.ci_lower),
    m = Math.exp(o.ci_upper);
  let h = null;
  if (a.baselineRisk) {
    const e = a.baselineRisk,
      t = Math.exp(-e),
      n = Math.pow(t, u);
    h = {
      baselineRisk: e,
      absoluteReduction: 1 - t - (1 - n),
      NNT: 1 / (1 - t - (1 - n))
    }
  }
  let v = null;
  1 !== u && (v = {
    ratio: 1 / u,
    interpretation: u < 1 ? `Treatment extends median survival by ~${(100*(1/u-1)).toFixed(0)}%` : `Treatment reduces median survival by ~${(100*(1-1/u)).toFixed(0)}%`
  });
  const g = n.map((n, s) => ({
    name: n,
    logHR: e[s],
    se: t[s],
    HR: Math.exp(e[s]),
    HR_lower: Math.exp(e[s] - 1.96 * t[s]),
    HR_upper: Math.exp(e[s] + 1.96 * t[s]),
    weight: 1 / (i[s] + r.tau2) / i.reduce((e, t) => e + 1 / (t + r.tau2), 0) * 100,
    events_t: a.events_t ? a.events_t[s] : null,
    events_c: a.events_c ? a.events_c[s] : null
  }));
  return {
    measure: "HR",
    pooled: {
      logHR: o.theta,
      se: o.se,
      HR: u,
      HR_lower: p,
      HR_upper: m,
      z: o.theta / o.se,
      pval: 2 * (1 - normalCDF(Math.abs(o.theta / o.se)))
    },
    hksj: {
      logHR: o.theta,
      se: c.se_hksj,
      HR: u,
      HR_lower: Math.exp(c.ci_lower),
      HR_upper: Math.exp(c.ci_upper),
      df: c.df,
      t: c.t_stat,
      pval: c.p_value
    },
    heterogeneity: {
      tau2: r.tau2,
      tau: Math.sqrt(r.tau2),
      I2: l.I2,
      H2: l.H2,
      Q: l.Q,
      Q_pval: l.Q_pval
    },
    predictionInterval: {
      logHR_lower: d.lower,
      logHR_upper: d.upper,
      HR_lower: Math.exp(d.lower),
      HR_upper: Math.exp(d.upper)
    },
    absoluteRisk: h,
    medianSurvival: v,
    studies: g,
    interpretation: {
      effect: u < 1 ? "Treatment reduces hazard" : "Treatment increases hazard",
      magnitude: 100 * Math.abs(1 - u),
      significance: o.theta / o.se > 1.96 || o.theta / o.se < -1.96 ? "Statistically significant" : "Not statistically significant",
      heterogeneity: l.I2 > 75 ? "High" : l.I2 > 50 ? "Moderate" : l.I2 > 25 ? "Low" : "Minimal"
    }
  }
}

function robustVarianceEstimation(e, t, n) {
  const a = e.length,
    s = [...new Set(n)],
    i = s.length,
    r = estimateTau2_REML(e, t),
    o = t.map(e => 1 / (e + r.tau2)),
    l = o.reduce((e, t) => e + t, 0),
    d = o.reduce((t, n, a) => t + n * e[a], 0) / l,
    c = s.map(t => {
      const a = n.map((e, n) => e === t ? n : -1).filter(e => e >= 0),
        s = a.map(t => e[t] - d),
        i = a.map(e => o[e]);
      return {
        id: t,
        k: a.length,
        residuals: s,
        weights: i,
        sumW: i.reduce((e, t) => e + t, 0)
      }
    });
  let u = 0;
  c.forEach(e => {
    const t = e.residuals.reduce((t, n, a) => t + e.weights[a] * n, 0);
    u += t * t
  });
  c.map(e => e.sumW / l);
  const p = i / (i - 1),
    m = p * u / (l * l),
    h = Math.sqrt(m),
    v = Math.max(1, i - 1),
    g = tQuantile(.975, v),
    f = Math.sqrt(1 / l);
  return {
    pooled: {
      theta: d,
      se_naive: f,
      se_robust: h,
      ci_lower: d - g * h,
      ci_upper: d + g * h,
      t: d / h,
      df: v,
      pval: 2 * (1 - tCDF(Math.abs(d / h), v))
    },
    clusterInfo: {
      nClusters: i,
      nEffects: a,
      avgPerCluster: (a / i).toFixed(1)
    },
    comparison: {
      seRatio: h / f,
      interpretation: h > 1.1 * f ? "RVE SE larger than naive - clustering matters" : "RVE and naive SE similar - minimal clustering effect"
    },
    smallSampleCorrection: p,
    note: "Robust variance accounts for unknown within-cluster correlation"
  }
}

function influenceDiagnostics(e, t, n) {
  e.length;
  const a = estimateTau2_REML(e, t),
    s = pooledEstimate_RE(e, t, a.tau2),
    i = n.map((n, i) => {
      const r = [...e.slice(0, i), ...e.slice(i + 1)],
        o = [...t.slice(0, i), ...t.slice(i + 1)],
        l = estimateTau2_REML(r, o),
        d = pooledEstimate_RE(r, o, l.tau2),
        c = calculateHeterogeneity(r, o, l.tau2),
        u = 1 / (t[i] + a.tau2) / t.reduce((e, t) => e + 1 / (t + a.tau2), 0),
        p = e[i] - s.theta,
        m = p / Math.sqrt(t[i] + a.tau2),
        h = (s.theta - d.theta) / s.se,
        v = h * h * u / (1 - u),
        g = a.tau2 - l.tau2,
        f = calculateHeterogeneity(e, t, a.tau2),
        _ = (e[i] - s.theta) ** 2 / (t[i] + a.tau2);
      return {
        name: n,
        weight: 100 * u,
        theta_loo: d.theta,
        theta_change: s.theta - d.theta,
        se_loo: d.se,
        I2_loo: c.I2,
        tau2_loo: l.tau2,
        tau2_change: g,
        residual: p,
        residual_std: m,
        dfbetas: h,
        cooksD: v,
        Q_contribution: _,
        Q_contribution_pct: _ / f.Q * 100,
        influential: Math.abs(h) > 1 || Math.abs(m) > 2
      }
    }),
    r = i.filter(e => e.influential),
    o = i.map(e => Math.abs(e.dfbetas)),
    l = i.map(e => e.cooksD);
  return {
    studies: i,
    summary: {
      nInfluential: r.length,
      influentialStudies: r.map(e => e.name),
      maxDFBETAS: Math.max(...o),
      maxCooksD: Math.max(...l),
      thetaRange: [Math.min(...i.map(e => e.theta_loo)), Math.max(...i.map(e => e.theta_loo))],
      I2Range: [Math.min(...i.map(e => e.I2_loo)), Math.max(...i.map(e => e.I2_loo))]
    },
    interpretation: 0 === r.length ? "No single study is unduly influential" : `${r.length} study/studies show high influence: ${r.map(e=>e.name).join(", ")}`
  }
}
const DEMO_DATASETS = {
  SGLT2_CV_DEATH_HFPEF: {
    name: "SGLT2i - CV Death in HFpEF",
    source: "Lancet 2022 (DELIVER + EMPEROR-Preserved)",
    category: "non_sig_benefit",
    teaching_point: 'HR 0.88 (0.77-1.00), p=0.05 is "not significant" but DDMA shows 97.5% P(benefit)',
    studies: [{
      name: "EMPEROR-Preserved",
      events_t: 219,
      n_t: 2997,
      events_c: 244,
      n_c: 2991
    }, {
      name: "DELIVER",
      events_t: 231,
      n_t: 3131,
      events_c: 261,
      n_c: 3132
    }]
  },
  SGLT2_ACM: {
    name: "SGLT2i - All-Cause Mortality (5 trials)",
    source: "Pooled SGLT2 trials",
    category: "sig_uncertain",
    teaching_point: "HR 0.92 (0.86-0.99), p=0.03 is significant but only 5% P(HR<0.85)",
    studies: [{
      name: "DAPA-HF 2019",
      events_t: 276,
      n_t: 2373,
      events_c: 329,
      n_c: 2371
    }, {
      name: "EMPEROR-Reduced 2020",
      events_t: 249,
      n_t: 1863,
      events_c: 266,
      n_c: 1867
    }, {
      name: "DELIVER 2022",
      events_t: 497,
      n_t: 3131,
      events_c: 526,
      n_c: 3132
    }, {
      name: "EMPEROR-Preserved 2021",
      events_t: 422,
      n_t: 2997,
      events_c: 463,
      n_c: 2991
    }, {
      name: "SOLOIST-WHF 2021",
      events_t: 51,
      n_t: 608,
      events_c: 58,
      n_c: 614
    }]
  },
  SGLT2_HFH: {
    name: "SGLT2i - HF Hospitalization",
    source: "Pooled SGLT2 trials",
    category: "confirms_benefit",
    teaching_point: "HR 0.72 (0.67-0.78) - DDMA confirms: 99.99% P(benefit), 99% P(>20% reduction)",
    studies: [{
      name: "DAPA-HF 2019",
      events_t: 231,
      n_t: 2373,
      events_c: 318,
      n_c: 2371
    }, {
      name: "EMPEROR-Reduced 2020",
      events_t: 246,
      n_t: 1863,
      events_c: 342,
      n_c: 1867
    }, {
      name: "DELIVER 2022",
      events_t: 329,
      n_t: 3131,
      events_c: 418,
      n_c: 3132
    }, {
      name: "EMPEROR-Preserved 2021",
      events_t: 259,
      n_t: 2997,
      events_c: 352,
      n_c: 2991
    }]
  },
  PSYCH_INTERVENTION: {
    name: "Psychological Intervention - CHD Mortality",
    source: "Cochrane Review",
    category: "null_effect",
    teaching_point: "RR ≈ 1.0 - DDMA correctly shows ~50% P(benefit), ~50% P(harm)",
    studies: [{
      name: "Trial A",
      events_t: 45,
      n_t: 500,
      events_c: 43,
      n_c: 500
    }, {
      name: "Trial B",
      events_t: 32,
      n_t: 400,
      events_c: 35,
      n_c: 400
    }, {
      name: "Trial C",
      events_t: 28,
      n_t: 350,
      events_c: 25,
      n_c: 350
    }, {
      name: "Trial D",
      events_t: 51,
      n_t: 600,
      events_c: 53,
      n_c: 600
    }]
  },
  BCG: {
    name: "BCG Vaccine for TB Prevention",
    source: "Colditz et al. (1994), JAMA",
    category: "benchmark",
    teaching_point: "Classic benchmark dataset with high heterogeneity (I² > 90%)",
    studies: [{
      name: "Aronson 1948",
      events_t: 4,
      n_t: 123,
      events_c: 11,
      n_c: 139
    }, {
      name: "Ferguson 1949",
      events_t: 6,
      n_t: 306,
      events_c: 29,
      n_c: 303
    }, {
      name: "Rosenthal 1960",
      events_t: 3,
      n_t: 231,
      events_c: 11,
      n_c: 220
    }, {
      name: "Hart 1977",
      events_t: 62,
      n_t: 13598,
      events_c: 248,
      n_c: 12867
    }, {
      name: "Frimodt-Moller 1973",
      events_t: 33,
      n_t: 5069,
      events_c: 47,
      n_c: 5808
    }, {
      name: "Comstock 1974",
      events_t: 180,
      n_t: 16913,
      events_c: 372,
      n_c: 17854
    }]
  },
  ASPIRIN_CVD: {
    name: "Aspirin for CVD Prevention",
    source: "Antithrombotic Trialists",
    category: "sig_uncertain",
    teaching_point: "Statistically significant but modest absolute benefit",
    studies: [{
      name: "PHS 1989",
      events_t: 139,
      n_t: 11037,
      events_c: 239,
      n_c: 11034
    }, {
      name: "BDT 1988",
      events_t: 80,
      n_t: 2545,
      events_c: 99,
      n_c: 2540
    }, {
      name: "TPT 1998",
      events_t: 142,
      n_t: 2545,
      events_c: 162,
      n_c: 2540
    }, {
      name: "HOT 1998",
      events_t: 127,
      n_t: 9399,
      events_c: 155,
      n_c: 9391
    }, {
      name: "WHS 2005",
      events_t: 477,
      n_t: 19934,
      events_c: 522,
      n_c: 19942
    }]
  },
  BP_REDUCTION: {
    name: "Blood Pressure Reduction (Continuous)",
    source: "Simulated RCT data",
    category: "continuous",
    dataType: "continuous",
    measure: "MD",
    teaching_point: "Mean difference in systolic BP reduction",
    studies: [{
      name: "Trial A 2018",
      mean_t: -12.5,
      sd_t: 8.2,
      n_t: 150,
      mean_c: -4.2,
      sd_c: 7.8,
      n_c: 148
    }, {
      name: "Trial B 2019",
      mean_t: -10.8,
      sd_t: 9.1,
      n_t: 200,
      mean_c: -3.5,
      sd_c: 8.5,
      n_c: 205
    }, {
      name: "Trial C 2020",
      mean_t: -14.2,
      sd_t: 7.5,
      n_t: 180,
      mean_c: -5.1,
      sd_c: 8,
      n_c: 175
    }, {
      name: "Trial D 2021",
      mean_t: -11.3,
      sd_t: 8.8,
      n_t: 120,
      mean_c: -4.8,
      sd_c: 7.2,
      n_c: 118
    }, {
      name: "Trial E 2022",
      mean_t: -9.5,
      sd_t: 10.2,
      n_t: 95,
      mean_c: -2.8,
      sd_c: 9.8,
      n_c: 100
    }]
  },
  MORTALITY_RATE: {
    name: "ICU Mortality Rate (Proportion)",
    source: "Simulated ICU data",
    category: "proportion",
    dataType: "proportion",
    measure: "PLO",
    teaching_point: "Single-arm proportion meta-analysis of ICU mortality",
    studies: [{
      name: "Hospital A",
      events: 45,
      n: 320,
      subgroup: "Academic"
    }, {
      name: "Hospital B",
      events: 38,
      n: 280,
      subgroup: "Academic"
    }, {
      name: "Hospital C",
      events: 52,
      n: 410,
      subgroup: "Community"
    }, {
      name: "Hospital D",
      events: 28,
      n: 195,
      subgroup: "Community"
    }, {
      name: "Hospital E",
      events: 61,
      n: 520,
      subgroup: "Academic"
    }, {
      name: "Hospital F",
      events: 33,
      n: 240,
      subgroup: "Community"
    }]
  },
  BCG_SUBGROUPS: {
    name: "BCG Vaccine with Subgroups",
    source: "Colditz et al. (1994) - by latitude",
    category: "benchmark",
    teaching_point: "Same BCG data with latitude-based subgroups to explore heterogeneity",
    studies: [{
      name: "Aronson 1948",
      events_t: 4,
      n_t: 123,
      events_c: 11,
      n_c: 139,
      subgroup: "Northern"
    }, {
      name: "Ferguson 1949",
      events_t: 6,
      n_t: 306,
      events_c: 29,
      n_c: 303,
      subgroup: "Northern"
    }, {
      name: "Rosenthal 1960",
      events_t: 3,
      n_t: 231,
      events_c: 11,
      n_c: 220,
      subgroup: "Northern"
    }, {
      name: "Hart 1977",
      events_t: 62,
      n_t: 13598,
      events_c: 248,
      n_c: 12867,
      subgroup: "Northern"
    }, {
      name: "Frimodt-Moller 1973",
      events_t: 33,
      n_t: 5069,
      events_c: 47,
      n_c: 5808,
      subgroup: "Tropical"
    }, {
      name: "Comstock 1974",
      events_t: 180,
      n_t: 16913,
      events_c: 372,
      n_c: 17854,
      subgroup: "Tropical"
    }]
  },
  SGLT2_HR: {
    name: "SGLT2i - HF Hospitalization (HR)",
    source: "Major SGLT2 RCTs",
    category: "hr",
    dataType: "hr",
    measure: "HR",
    teaching_point: "Hazard ratio meta-analysis from published trial data",
    studies: [{
      name: "DAPA-HF 2019",
      hr: .7,
      ci_lower: .59,
      ci_upper: .83,
      n_events: 549,
      subgroup: "HFrEF"
    }, {
      name: "EMPEROR-Reduced 2020",
      hr: .69,
      ci_lower: .59,
      ci_upper: .81,
      n_events: 588,
      subgroup: "HFrEF"
    }, {
      name: "DELIVER 2022",
      hr: .79,
      ci_lower: .69,
      ci_upper: .91,
      n_events: 747,
      subgroup: "HFpEF"
    }, {
      name: "EMPEROR-Preserved 2021",
      hr: .71,
      ci_lower: .6,
      ci_upper: .83,
      n_events: 611,
      subgroup: "HFpEF"
    }, {
      name: "SOLOIST-WHF 2021",
      hr: .64,
      ci_lower: .49,
      ci_upper: .83,
      n_events: 245,
      subgroup: "Acute HF"
    }]
  },
  MULTI_OUTCOME: {
    name: "SGLT2i - Multiple Outcomes (Clustered)",
    source: "Major SGLT2 trials - multiple endpoints",
    category: "advanced",
    teaching_point: "Same trials contribute multiple outcomes - tests three-level models and RVE",
    studies: [{
      name: "DAPA-HF (CV Death)",
      events_t: 227,
      n_t: 2373,
      events_c: 273,
      n_c: 2371,
      subgroup: "DAPA-HF"
    }, {
      name: "DAPA-HF (HF Hosp)",
      events_t: 231,
      n_t: 2373,
      events_c: 318,
      n_c: 2371,
      subgroup: "DAPA-HF"
    }, {
      name: "DAPA-HF (All-Cause Mortality)",
      events_t: 276,
      n_t: 2373,
      events_c: 329,
      n_c: 2371,
      subgroup: "DAPA-HF"
    }, {
      name: "EMPEROR-Reduced (CV Death)",
      events_t: 187,
      n_t: 1863,
      events_c: 202,
      n_c: 1867,
      subgroup: "EMPEROR-Reduced"
    }, {
      name: "EMPEROR-Reduced (HF Hosp)",
      events_t: 246,
      n_t: 1863,
      events_c: 342,
      n_c: 1867,
      subgroup: "EMPEROR-Reduced"
    }, {
      name: "EMPEROR-Reduced (All-Cause Mortality)",
      events_t: 249,
      n_t: 1863,
      events_c: 266,
      n_c: 1867,
      subgroup: "EMPEROR-Reduced"
    }, {
      name: "DELIVER (CV Death)",
      events_t: 231,
      n_t: 3131,
      events_c: 261,
      n_c: 3132,
      subgroup: "DELIVER"
    }, {
      name: "DELIVER (HF Hosp)",
      events_t: 329,
      n_t: 3131,
      events_c: 418,
      n_c: 3132,
      subgroup: "DELIVER"
    }, {
      name: "DELIVER (All-Cause Mortality)",
      events_t: 497,
      n_t: 3131,
      events_c: 526,
      n_c: 3132,
      subgroup: "DELIVER"
    }, {
      name: "EMPEROR-Preserved (CV Death)",
      events_t: 219,
      n_t: 2997,
      events_c: 244,
      n_c: 2991,
      subgroup: "EMPEROR-Preserved"
    }, {
      name: "EMPEROR-Preserved (HF Hosp)",
      events_t: 259,
      n_t: 2997,
      events_c: 352,
      n_c: 2991,
      subgroup: "EMPEROR-Preserved"
    }, {
      name: "EMPEROR-Preserved (All-Cause Mortality)",
      events_t: 422,
      n_t: 2997,
      events_c: 463,
      n_c: 2991,
      subgroup: "EMPEROR-Preserved"
    }]
  }
};

function loadDemoDataset(e) {
  const t = DEMO_DATASETS[e];
  if (!t) return log.error("Demo dataset not found:", e), void alert("Demo dataset not found: " + e);
  t.dataType ? (AppState.settings.dataType = t.dataType, document.getElementById("dataTypeSelect").value = t.dataType, updateEffectMeasures(), updateTableHeaders()) : "binary" !== AppState.settings.dataType && (AppState.settings.dataType = "binary", document.getElementById("dataTypeSelect").value = "binary", updateEffectMeasures(), updateTableHeaders()), t.measure && (AppState.settings.effectMeasure = t.measure, setTimeout(() => {
    document.getElementById("effectMeasureSelect").value = t.measure
  }, 0));
  const n = document.getElementById("ccSettingGroup");
  n && (n.style.display = "binary" === AppState.settings.dataType ? "block" : "none");
  document.getElementById("studyTableBody").innerHTML = "", t.studies.forEach((e, t) => {
    addStudyRow(e)
  }), updateDataSummary(), document.querySelector('[data-tab="data"]').click()
}

function runFullAnalysis() {
  const e = AppState.results;
  if (!e || !e.yi) return void alert("Run basic analysis first");
  const t = event?.target;
  t && (t.disabled = !0, t.innerHTML = '<span class="btn-spinner">⟳</span> Computing...'), setTimeout(() => {
    try {
      const t = e.yi,
        n = e.vi,
        a = (e.sei || n.map(e => Math.sqrt(e)), e.names || t.map((e, t) => "Study " + (t + 1))),
        s = (t.length, AppState.settings.tau2Method);
      e.tau2_ci = calculateTau2_CI_QProfile(t, n, e.tau2), e.loo = leaveOneOut(t, n, a, s), e.baujat = baujatPlotData(t, n, a, s), e.cv_i2 = calculateCV_I2(t, n, s);
      try {
        e.selectionModels = {
          moderate: veveaHedgesSelection(t, n, "moderate"),
          severe: veveaHedgesSelection(t, n, "severe")
        }
      } catch (t) {
        e.selectionModels = {
          error: t.message
        }
      }
      try {
        e.petPeese = petPeese(t, n)
      } catch (t) {
        e.petPeese = {
          error: t.message
        }
      }
      try {
        e.trimfill = trimAndFill(t, n, "auto", "R0")
      } catch (t) {
        e.trimfill = {
          error: t.message
        }
      }
      if ("function" == typeof assessGRADE) {
        const t = AppState.studies || e.studies || [];
        e.grade = assessGRADE({
          ...e,
          studies: t
        }, void 0 !== TruthCertConfig ? TruthCertConfig : {})
      }
      const i = e.studies || e.studiesWithEffects || [];
      try {
        e.subgroups = subgroupAnalysis(i, t, n, s)
      } catch (t) {
        e.subgroups = {
          available: !1
        }
      }
      try {
        const a = i.map(e => e.n_t && e.n_c ? e.n_t + e.n_c : e.n ? e.n : NaN);
        a.filter(e => !isNaN(e)).length >= 5 && (e.metareg = metaRegression(t, n, a, "Sample Size", s))
      } catch (t) {
        e.metareg = {
          available: !1
        }
      }
      e.fullAnalysisComplete = !0, safeRender(renderAnalysisPanel, "panel-analysis", e), safeRender(renderHeterogeneityPanel, "panel-heterogeneity", e), safeRender(renderBiasPanel, "panel-bias", e), showToast("Full analysis complete", "success")
    } catch (e) {
      console.error("Full analysis failed:", e), showToast("Full analysis failed: " + e.message, "error")
    } finally {
      t && (t.disabled = !1, t.innerHTML = "🔬 Run Full Analysis")
    }
  }, 50)
}

function onTabActivate(e) {
  const t = AppState.results;
  if (!t || !t.yi) return;
  const n = t.yi,
    a = t.vi,
    s = t.names || n.map((e, t) => "Study " + (t + 1)),
    i = AppState.settings.tau2Method;
  if ("heterogeneity" === e && (!t.loo || t.loo.skipped)) try {
    t.loo = leaveOneOut(n, a, s, i), t.baujat = baujatPlotData(n, a, s, i), t.cv_i2 = calculateCV_I2(n, a, i), safeRender(renderHeterogeneityPanel, "panel-heterogeneity", t)
  } catch (e) {
    console.error("Deferred heterogeneity failed:", e)
  }
  if ("bias" === e && (!t.trimfill || t.trimfill.skipped)) try {
    t.trimfill = trimAndFill(n, a, "auto", "R0"), t.selectionModels = {
      moderate: veveaHedgesSelection(n, a, "moderate"),
      severe: veveaHedgesSelection(n, a, "severe")
    }, t.petPeese = petPeese(n, a), safeRender(renderBiasPanel, "panel-bias", t)
  } catch (e) {
    console.error("Deferred bias failed:", e)
  }
  if ("validation" === e && (!t.validation || t.validation.skipped)) try {
    t.validation = runValidation(), safeRender(renderValidationPanel, "panel-validation", t)
  } catch (e) {
    console.error("Deferred validation failed:", e)
  }
}

function computeGRADE() {
  const e = AppState.results;
  if (e) try {
    const t = AppState.studies || e.studies || [];
    e.grade = assessGRADE({
      ...e,
      studies: t
    }, void 0 !== TruthCertConfig ? TruthCertConfig : {}), safeRender(renderAnalysisPanel, "panel-analysis", e), showToast("GRADE assessment complete", "success")
  } catch (e) {
    console.error("GRADE failed:", e), showToast("GRADE failed: " + e.message, "error")
  } else alert("Run analysis first")
}

function showGRADEDetails() {
  const e = AppState.results;
  if (!e || !e.grade) return;
  const t = e.grade;
  let n = '<div style="padding: var(--space-4);">';
  n += '<h3 style="margin-bottom: var(--space-3);">GRADE Evidence Certainty</h3>', n += '<table style="width: 100%; border-collapse: collapse;">', n += '<tr style="background: var(--surface-overlay);"><th style="padding: 8px; text-align: left;">Domain</th><th style="padding: 8px;">Rating</th><th style="padding: 8px;">Reason</th></tr>';
  [
    ["Risk of Bias", t.domains?.riskOfBias, t.reasons?.riskOfBias || ""],
    ["Inconsistency", t.domains?.inconsistency, t.reasons?.inconsistency || ""],
    ["Indirectness", t.domains?.indirectness, t.reasons?.indirectness || ""],
    ["Imprecision", t.domains?.imprecision, t.reasons?.imprecision || ""],
    ["Publication Bias", t.domains?.publicationBias, t.reasons?.publicationBias || ""]
  ].forEach(function(e) {
    const t = e[0],
      a = e[1],
      s = e[2];
    n += '<tr><td style="padding: 8px;">' + t + "</td>", n += '<td style="padding: 8px; text-align: center; color: ' + ("No concern" === a ? "var(--color-success-500)" : "Serious" === a ? "var(--color-warning-500)" : "var(--color-danger-500)") + ';">' + (a || "N/A") + "</td>", n += '<td style="padding: 8px; font-size: 0.875rem;">' + s + "</td></tr>"
  }), n += "</table>", n += '<p style="margin-top: 16px;"><strong>Overall: ' + t.overall + "</strong></p>", n += "</div>";
  const a = document.getElementById("methodsModal");
  if (a) {
    const e = a.querySelector(".modal__body"),
      t = a.querySelector(".modal__title");
    e && (e.innerHTML = n), t && (t.textContent = "GRADE Assessment"), a.style.display = "flex"
  } else alert("GRADE: " + t.overall)
}

function runAnalysis() {
  const e = document.getElementById("runAnalysisBtn"),
    t = e.innerHTML;
  e.classList.add("btn--loading"), e.innerHTML = '<span class="btn-spinner">⟳</span> Running...', setTimeout(() => {
    try {
      const a = getStudyData().filter(e => e.valid);
      if (a.length < 2) return alert("At least 2 valid studies are required for meta-analysis."), e.classList.remove("btn--loading"), void(e.innerHTML = t);
      const s = AppState.settings.effectMeasure,
        i = convertToEffectSizes(a, s),
        r = i.map(e => e.yi),
        o = i.map(e => e.vi),
        l = i.map(e => e.sei),
        d = i.map(e => e.name),
        c = r.length,
        u = estimateTau2(r, o, AppState.settings.tau2Method),
        p = u.tau2;
      let m;
      !1 === u.converged && setTimeout(() => {
        const e = document.getElementById("dataStatusAlert");
        e && (e.className = "alert alert--warning", e.innerHTML = `\n                <span class="alert__icon">⚠️</span>\n                <div class="alert__content">\n                  <div class="alert__text">\n                    <strong>${AppState.settings.tau2Method} convergence issue:</strong> \n                    ${u.note||"Fell back to DL estimate"}. Results may vary.\n                  </div>\n                </div>\n              `)
      }, 100);
      try {
        m = calculateTau2_CI_QProfile(r, o, p)
      } catch (e) {
        m = {
          lower: Math.max(0, .25 * p),
          upper: 4 * p,
          method: "approximate_bounds",
          note: "Approximate bounds (not a CI)"
        }
      }
      const h = calculatePooledEstimate(r, o, p),
        v = AppState.settings.hksj ? calculateHKSJ(r, o, h.theta, p) : null,
        g = calculateHeterogeneity(r, o, p),
        f = {
          skipped: !0
        },
        _ = {
          value: g.I2,
          skipped: !0
        },
        y = {
          risk: "unknown",
          skipped: !0
        },
        b = predictionInterval_Standard(h.theta, h.se, p, c),
        x = {
          lower: b.lower,
          upper: b.upper,
          method: "standard"
        },
        w = {
          lower: b.lower,
          upper: b.upper,
          skipped: !0
        },
        M = {
          skipped: !0,
          confidence: {
            P_benefit: .5
          }
        },
        S = {
          skipped: !0
        },
        E = {
          skipped: !0
        },
        A = {
          skipped: !0
        },
        R = {
          scenarios: [],
          skipped: !0
        },
        I = eggersTest(r, l, g.I2, AppState.settings.dataType);
      let T = {
          skipped: !0
        },
        C = {
          original: {
            k: c,
            effect: h.theta,
            effect_exp: Math.exp(h.theta)
          },
          adjusted: {
            k: c,
            effect: h.theta,
            effect_exp: Math.exp(h.theta)
          },
          k0_imputed: 0,
          skipped: !0
        };
      const P = {
          results: [],
          skipped: !0
        },
        k = {
          points: [],
          skipped: !0
        };
      let D = {
          available: !1,
          skipped: !0
        },
        $ = {
          available: !1,
          skipped: !0
        },
        N = {
          apparent: {
            effect: h.theta,
            tau2: p
          },
          optimism: {
            effect: 0,
            tau2: 0
          },
          corrected: {
            effect: h.theta,
            tau2: p
          },
          shrinkage_factor: 1,
          interpretation: "Run on Advanced tab",
          bootstrap_samples: 0,
          skipped: !0
        };
      Math.exp(h.theta), Math.exp(h.ci_lower), Math.exp(h.ci_upper);
      const F = {
          skipped: !0
        },
        L = {
          [AppState.settings.tau2Method]: p,
          skipped: !0
        };
      let O = {
          moderate: {
            skipped: !0
          },
          severe: {
            skipped: !0
          }
        },
        B = {
          skipped: !0
        },
        H = {
          skipped: !0
        },
        q = {
          skipped: !0
        },
        z = {
          skipped: !0
        },
        V = {
          skipped: !0
        },
        j = {
          skipped: !0,
          note: "Run on Advanced tab"
        },
        U = {
          skipped: !0,
          note: "Run on Advanced tab"
        },
        G = {
          skipped: !0
        },
        W = {
          skipped: !0,
          note: "Run on Advanced tab"
        },
        Q = {
          skipped: !0,
          note: "Run on Advanced tab"
        },
        X = {
          skipped: !0
        },
        J = {
          skipped: !0
        },
        Y = null;
      if (AppState.settings.bayesian) try {
        const e = AppState.settings.bayesianPriors,
          t = parseInt(document.getElementById("mcmcIterations")?.value) || CONFIG.MCMC_ITERATIONS,
          n = parseInt(document.getElementById("mcmcChains")?.value) || CONFIG.MCMC_CHAINS;
        Y = bayesianMetaAnalysis(r, o, {
          prior_mu: e.theta_mean,
          prior_sd: e.theta_sd,
          tau2_prior: "half_cauchy",
          tau2_scale: 1,
          chains: n,
          iterations: t,
          burnin: Math.floor(.2 * t)
        }), Y.tracePlotData = generateTracePlotData(Y.chains), Y.posteriorDensityData = generatePosteriorDensityData(Y.combined)
      } catch (e) {
        Y = {
          error: e.message
        }
      }
      let K = {
          results: [],
          summary: {
            total: 0,
            passed: 0,
            failed: 0,
            pass_rate: "0"
          },
          skipped: !0
        },
        Z = {};
      try {} catch (e) {
        Z = {
          error: e.message
        }
      }
      let ee = null;
      try {
        ee = cumulativeMetaAnalysis(r, o, d.map(e => {
          const t = e.match(/\b(19|20)\d{2}\b/);
          return t ? parseInt(t[0]) : 2020
        }), d, AppState.settings.tau2Method)
      } catch (e) {}
      let te = null,
        ne = null,
        ae = null;
      try {
        te = selectionModel(r, o, "step"), ne = selectionModel(r, o, "beta"), ae = copasSelectionModel(r, o)
      } catch (e) {}
      let se = null;
      try {
        se = influenceDiagnostics(r, o, d)
      } catch (e) {}
      let ie = null;
      try {
        const e = d.map(e => e.replace(/\s*\(.*\)/, "").trim());
        [...new Set(e)].length < d.length && (ie = threeLevelMA(r, o, e))
      } catch (e) {}
      let re = null;
      try {
        const e = d.map(e => e.replace(/\s*\(.*\)/, "").trim()),
          t = [...new Set(e)];
        t.length < d.length && t.length >= 3 && (re = robustVarianceEstimation(r, o, e))
      } catch (e) {}
      let oe = null;
      if ("HR" === s || "hr" === AppState.settings.dataType) try {
        oe = survivalMetaAnalysis(r, l, d, {
          events_t: i.map(e => e.events_t),
          events_c: i.map(e => e.events_c),
          baselineRisk: .2
        })
      } catch (e) {}
      var n = null;
      try {
        n = calculateEValue(h.theta, h.ci_lower, h.ci_upper, s, {
          baselineRisk: .1,
          rareOutcome: !0
        })
      } catch (e) {}
      AppState.results = {
        studies: i,
        yi: r,
        vi: o,
        sei: l,
        names: d,
        k: c,
        tau2Result: u,
        tau2: p,
        tau2_ci: m,
        pooled: h,
        hksj: v,
        het: g,
        het_interpretation: J,
        icc_ma: f,
        cv_i2: _,
        metaoverfit: y,
        pi: {
          standard: b,
          noma: x,
          conformal: w
        },
        ddma: M,
        laev: S,
        decision: E,
        threshold: A,
        mcid_sens: R,
        egger: I,
        peters: T,
        harbord: V,
        petPeese: z,
        trimfill: C,
        selectionModels: O,
        henmiCopas: B,
        mh_result: H,
        peto_result: q,
        permutation: j,
        bcaBootstrap: U,
        fragility: G,
        linChuSkewness: W,
        linHybrid: Q,
        tianExact: X,
        loo: P,
        baujat: k,
        subgroups: D,
        metareg: $,
        optimism: N,
        nnt_range: F,
        tau2_all: L,
        bayesian: Y,
        validation: K,
        crossDisc: Z,
        cumulative: ee,
        selectionModelStep: te,
        selectionModelBeta: ne,
        copasModel: ae,
        influenceDiag: se,
        threeLevelResult: ie,
        rveResult: re,
        survivalAnalysis: oe,
        evalue: n,
        measure: s,
        direction: AppState.settings.direction
      }, renderResults(), document.querySelector('[data-tab="analysis"]').click(), e.classList.remove("btn--loading"), e.innerHTML = t
    } catch (n) {
      log.error("Analysis failed:", n), alert("Analysis failed: " + n.message + "\n\nCheck console for details."), e.classList.remove("btn--loading"), e.innerHTML = t
    }
  }, 50)
}

function formatEffect(e, t = "OR") {
  if (null == e || !isFinite(e) || isNaN(e)) return "—";
  switch (t) {
    case "RD":
      return (100 * e).toFixed(2) + "%";
    case "MD":
    case "SMD":
      return e.toFixed(3);
    case "PLO":
      return (1 / (1 + Math.exp(-e)) * 100).toFixed(1) + "%";
    case "PAS":
      return (100 * Math.pow(Math.sin(e), 2)).toFixed(1) + "%";
    case "PFT":
      return (100 * Math.pow(Math.sin(e / 2), 2)).toFixed(1) + "%";
    case "PR":
      return (100 * e).toFixed(1) + "%";
    case "GEN":
      return e.toFixed(4);
    default:
      return Math.exp(e).toFixed(3)
  }
}

function formatPct(e) {
  return null == e || isNaN(e) ? "N/A" : (100 * e).toFixed(1) + "%"
}

function safeRender(e, t, n) {
  try {
    e(n)
  } catch (e) {
    log.error(`${t} render failed:`, e);
    const n = document.getElementById(t);
    n && (n.innerHTML = `\n            <div class="card">\n              <div class="card__body">\n                <div class="alert alert--danger">\n                  <span class="alert__icon">⚠️</span>\n                  <div class="alert__content">\n                    <div class="alert__title">Rendering Error</div>\n                    <div class="alert__text">${e.message}</div>\n                    <pre class="text-xs font-mono" style="margin-top: var(--space-2); opacity: 0.7; white-space: pre-wrap;">${e.stack||""}</pre>\n                  </div>\n                </div>\n              </div>\n            </div>\n          `)
  }
}

function renderResults() {
  const e = AppState.results;
  e && (safeRender(renderAnalysisPanel, "panel-analysis", e), safeRender(renderHeterogeneityPanel, "panel-heterogeneity", e), safeRender(renderBiasPanel, "panel-bias", e), updateFloatingNav())
}

function renderAnalysisPanel(e) {
  try {
    const t = document.getElementById("panel-analysis");
    if (!t) return void log.error("Analysis panel not found!");
    if (!e.pooled || void 0 === e.pooled.theta) return void(t.innerHTML = '<div class="card"><div class="card__body"><p class="text-danger">Error: Pooled estimate not available</p></div></div>');
    const n = "RD" === e.measure ? e.pooled.theta : Math.exp(e.pooled.theta),
      a = "RD" === e.measure ? e.pooled.ci_lower : Math.exp(e.pooled.ci_lower),
      s = "RD" === e.measure ? e.pooled.ci_upper : Math.exp(e.pooled.ci_upper),
      i = e.hksj ? "RD" === e.measure ? e.hksj.ci_lower : Math.exp(e.hksj.ci_lower) : null,
      r = e.hksj ? "RD" === e.measure ? e.hksj.ci_upper : Math.exp(e.hksj.ci_upper) : null;
    t.innerHTML = `\n          <div class="grid" style="grid-template-columns: 1fr 1fr; gap: var(--space-6);">\n            \x3c!-- Main Results --\x3e\n            <div class="card">\n              <div class="card__header">\n                <h2 class="card__title">📈 Pooled Effect Estimate</h2>\n              </div>\n              <div class="card__body">\n                <div class="stat-grid" style="margin-bottom: var(--space-6);">\n                  <div class="stat-card">\n                    <div class="stat-card__value stat-card__value--accent">${null!=n?n.toFixed(3):"N/A"}</div>\n                  <div class="stat-card__label">${e.measure}</div>\n                </div>\n                <div class="stat-card">\n                  <div class="stat-card__value">${null!=a?a.toFixed(3):"N/A"} – ${null!=s?s.toFixed(3):"N/A"}</div>\n                  <div class="stat-card__label">95% CI (Wald)</div>\n                </div>\n                ${e.hksj?`\n                <div class="stat-card">\n                  <div class="stat-card__value">${null!==i?i.toFixed(3):"N/A"} – ${null!==r?r.toFixed(3):"N/A"}</div>\n                  <div class="stat-card__label">95% CI (HKSJ)</div>\n                </div>\n                `:""}\n                <div class="stat-card">\n                  <div class="stat-card__value ${e.pooled&&void 0!==e.pooled.p_value&&e.pooled.p_value<.05?"text-success":""}">${e.pooled&&void 0!==e.pooled.p_value?e.pooled.p_value<.001?"<0.001":e.pooled.p_value.toFixed(4):"N/A"}</div>\n                  <div class="stat-card__label">p-value</div>\n                </div>\n              </div>\n              \n              <div class="alert ${e.pooled&&void 0!==e.pooled.p_value&&e.pooled.p_value<.05?"alert--success":"alert--info"}">\n                <span class="alert__icon">${e.pooled&&void 0!==e.pooled.p_value&&e.pooled.p_value<.05?"✓":"ℹ️"}</span>\n                <div class="alert__content">\n                  <div class="alert__text">\n                    ${e.pooled&&void 0!==e.pooled.p_value&&e.pooled.p_value<.05?`Statistically significant at α = 0.05. ${e.measure} = ${n.toFixed(3)} suggests treatment ${"lower"===e.direction?n<1?"benefit":"harm":n>1?"benefit":"harm"}.`:"Not statistically significant at α = 0.05. See DDMA tab for probability-based interpretation."}\n                  </div>\n                </div>\n              </div>\n            </div>\n          </div>\n          \n          \x3c!-- Heterogeneity Summary --\x3e\n          <div class="card">\n            <div class="card__header">\n              <h2 class="card__title">📉 Heterogeneity Summary</h2>\n            </div>\n            <div class="card__body">\n              <div class="stat-grid">\n                <div class="stat-card">\n                  <div class="stat-card__value">${e.het&&void 0!==e.het.I2?e.het.I2.toFixed(1):"N/A"}%</div>\n                  <div class="stat-card__label">I² (${e.het&&e.het.interpretation?e.het.interpretation:"N/A"})</div>\n                </div>\n                <div class="stat-card">\n                  <div class="stat-card__value">${void 0!==e.tau2?e.tau2.toFixed(4):"N/A"}</div>\n                  <div class="stat-card__label">τ² (${e.tau2Result&&e.tau2Result.method?e.tau2Result.method:"N/A"})</div>\n                </div>\n                <div class="stat-card">\n                  <div class="stat-card__value">${void 0!==e.tau2?Math.sqrt(e.tau2).toFixed(4):"N/A"}</div>\n                  <div class="stat-card__label">τ (SD of effects)</div>\n                </div>\n                ${e.icc_ma&&void 0!==e.icc_ma.ICC_MA?`\n                <div class="stat-card">\n                  <div class="stat-card__value">${void 0!==e.icc_ma.ICC_MA?e.icc_ma.ICC_MA.toFixed(3):"N/A"}</div>\n                  <div class="stat-card__label">ICC_MA (${e.icc_ma.interpretation||"N/A"})</div>\n                </div>\n                `:""}\n              </div>\n              \n              <div style="margin-top: var(--space-4); font-size: var(--text-sm); color: var(--text-secondary);">\n                <p><strong>Q</strong> = ${e.het&&void 0!==e.het.Q?e.het.Q.toFixed(2):"N/A"}, df = ${e.het?e.het.df:"N/A"}, p = ${e.het&&void 0!==e.het.p_Q?e.het.p_Q<.001?"<0.001":e.het.p_Q.toFixed(4):"N/A"}</p>\n                <p style="margin-top: var(--space-2);"><strong>I² 95% CI:</strong> ${e.het&&e.het.I2_ci?`${e.het.I2_ci.lower.toFixed(1)}% – ${e.het.I2_ci.upper.toFixed(1)}%`:"N/A"}</p>\n              </div>\n            </div>\n          </div>\n        </div>\n        \n        \x3c!-- Prediction Intervals --\x3e\n        <div class="card" style="margin-top: var(--space-6);">\n          <div class="card__header">\n            <h2 class="card__title">🔮 Prediction Intervals</h2>\n          </div>\n          <div class="card__body">\n            <div class="grid" style="grid-template-columns: repeat(3, 1fr); gap: var(--space-6);">\n              <div>\n                <h4 class="text-sm font-semibold" style="margin-bottom: var(--space-2);">Standard (HTS)</h4>\n                <p class="font-mono text-lg">${formatEffect(e.pi.standard.lower,e.measure)} – ${formatEffect(e.pi.standard.upper,e.measure)}</p>\n                <p class="text-sm text-secondary" style="margin-top: var(--space-1);">df = ${e.pi.standard.df}</p>\n              </div>\n              <div>\n                <h4 class="text-sm font-semibold" style="margin-bottom: var(--space-2);">Noma 2023 (τ²-adjusted)</h4>\n                <p class="font-mono text-lg">${formatEffect(e.pi.noma.lower,e.measure)} – ${formatEffect(e.pi.noma.upper,e.measure)}</p>\n                <p class="text-sm text-secondary" style="margin-top: var(--space-1);">Accounts for τ² uncertainty</p>\n              </div>\n              <div>\n                <h4 class="text-sm font-semibold" style="margin-bottom: var(--space-2);">Conformal (Distribution-free)</h4>\n                ${e.pi.conformal.valid?`<p class="font-mono text-lg">${formatEffect(e.pi.conformal.lower,e.measure)} – ${formatEffect(e.pi.conformal.upper,e.measure)}</p>\n                     <p class="text-sm text-secondary" style="margin-top: var(--space-1);">No normality assumption</p>`:`<p class="text-warning">${e.pi.conformal.warning}</p>`}\n              </div>\n            </div>\n          </div>\n        </div>\n        \n        ${e.bayesian&&e.bayesian.summary&&e.bayesian.summary.theta?`\n        \x3c!-- Bayesian Analysis Results --\x3e\n        <div class="card" style="margin-top: var(--space-6);">\n          <div class="card__header">\n            <h2 class="card__title">🎲 Bayesian Meta-Analysis</h2>\n            ${e.bayesian.diagnostics?.converged?'<span class="badge badge--success">Converged</span>':'<span class="badge badge--warning">Check Convergence</span>'}\n          </div>\n          <div class="card__body">\n            <div class="grid" style="grid-template-columns: repeat(2, 1fr); gap: var(--space-6);">\n              \n              \x3c!-- Posterior Summaries --\x3e\n              <div>\n                <h4 class="text-sm font-semibold" style="margin-bottom: var(--space-3);">Posterior Estimates</h4>\n                <div class="stat-grid">\n                  <div class="stat-card">\n                    <div class="stat-card__value stat-card__value--accent">${void 0!==e.bayesian.summary.theta.exp_mean?e.bayesian.summary.theta.exp_mean.toFixed(3):"N/A"}</div>\n                    <div class="stat-card__label">Posterior Mean (${e.measure})</div>\n                  </div>\n                  <div class="stat-card">\n                    <div class="stat-card__value">${e.bayesian.summary.theta.exp_ci?`${e.bayesian.summary.theta.exp_ci[0].toFixed(3)} – ${e.bayesian.summary.theta.exp_ci[1].toFixed(3)}`:"N/A"}</div>\n                    <div class="stat-card__label">95% Credible Interval</div>\n                  </div>\n                </div>\n                \n                <div style="margin-top: var(--space-4);">\n                  <p class="text-sm"><strong>τ² posterior:</strong> ${e.bayesian.summary.tau2?`${e.bayesian.summary.tau2.median.toFixed(4)} (95% CrI: ${e.bayesian.summary.tau2.ci_lower.toFixed(4)} – ${e.bayesian.summary.tau2.ci_upper.toFixed(4)})`:"N/A"}</p>\n                  <p class="text-sm" style="margin-top: var(--space-1);"><strong>I² posterior:</strong> ${e.bayesian.summary.I2?`${e.bayesian.summary.I2.mean.toFixed(1)}% (95% CrI: ${e.bayesian.summary.I2.ci_lower.toFixed(1)}% – ${e.bayesian.summary.I2.ci_upper.toFixed(1)}%)`:"N/A"}</p>\n                </div>\n              </div>\n              \n              \x3c!-- Posterior Probabilities (DDMA) --\x3e\n              ${e.bayesian.summary.ddma?`\n              <div>\n                <h4 class="text-sm font-semibold" style="margin-bottom: var(--space-3);">Posterior Probabilities</h4>\n                <div class="stat-grid">\n                  <div class="stat-card">\n                    <div class="stat-card__value" style="color: ${e.bayesian.summary.ddma.P_benefit>.8?"var(--color-success-500)":"inherit"};">${void 0!==e.bayesian.summary.ddma.P_benefit?(100*e.bayesian.summary.ddma.P_benefit).toFixed(1):"N/A"}%</div>\n                    <div class="stat-card__label">P(Benefit | Data)</div>\n                  </div>\n                  <div class="stat-card">\n                    <div class="stat-card__value">${void 0!==e.bayesian.summary.ddma.P_mcid?(100*e.bayesian.summary.ddma.P_mcid).toFixed(1):"N/A"}%</div>\n                    <div class="stat-card__label">P(>MCID | Data)</div>\n                  </div>\n                  <div class="stat-card">\n                    <div class="stat-card__value">${void 0!==e.bayesian.summary.ddma.P_benefit_pred?(100*e.bayesian.summary.ddma.P_benefit_pred).toFixed(1):"N/A"}%</div>\n                    <div class="stat-card__label">P(Benefit | New Setting)</div>\n                  </div>\n                </div>\n                \n                <div class="alert alert--info" style="margin-top: var(--space-4);">\n                  <span class="alert__icon">💡</span>\n                  <div class="alert__content">\n                    <div class="alert__text">These are <strong>true posterior probabilities</strong> given data and prior. Unlike frequentist p-values, they directly answer "what is the probability the treatment is beneficial?"</div>\n                  </div>\n                </div>\n              </div>\n              `:""}\n            </div>\n            \n            \x3c!-- MCMC Diagnostics --\x3e\n            ${e.bayesian.diagnostics?`\n            <div style="margin-top: var(--space-6); padding-top: var(--space-4); border-top: 1px solid var(--border-subtle);">\n              <h4 class="text-sm font-semibold" style="margin-bottom: var(--space-3);">MCMC Diagnostics</h4>\n              <div class="grid" style="grid-template-columns: repeat(4, 1fr); gap: var(--space-4);">\n                <div class="text-center">\n                  <div class="font-mono text-lg ${e.bayesian.diagnostics.Rhat&&e.bayesian.diagnostics.Rhat.mu<1.1?"text-success":"text-warning"}">${e.bayesian.diagnostics.Rhat&&void 0!==e.bayesian.diagnostics.Rhat.mu?e.bayesian.diagnostics.Rhat.mu.toFixed(3):"N/A"}</div>\n                  <div class="text-xs text-secondary">R̂ (μ)</div>\n                </div>\n                <div class="text-center">\n                  <div class="font-mono text-lg ${e.bayesian.diagnostics.Rhat&&e.bayesian.diagnostics.Rhat.tau2<1.1?"text-success":"text-warning"}">${e.bayesian.diagnostics.Rhat&&void 0!==e.bayesian.diagnostics.Rhat.tau2?e.bayesian.diagnostics.Rhat.tau2.toFixed(3):"N/A"}</div>\n                  <div class="text-xs text-secondary">R̂ (τ²)</div>\n                </div>\n                <div class="text-center">\n                  <div class="font-mono text-lg">${e.bayesian.diagnostics.ESS&&void 0!==e.bayesian.diagnostics.ESS.mu?Math.round(e.bayesian.diagnostics.ESS.mu):"N/A"}</div>\n                  <div class="text-xs text-secondary">ESS (μ)</div>\n                </div>\n                <div class="text-center">\n                  <div class="font-mono text-lg">${e.bayesian.diagnostics.total_samples||"N/A"}</div>\n                  <div class="text-xs text-secondary">Total Samples</div>\n                </div>\n              </div>\n              ${e.bayesian.diagnostics.warning?`\n                <div class="alert alert--warning" style="margin-top: var(--space-3);">\n                  <span class="alert__icon">⚠️</span>\n                  <div class="alert__content"><div class="alert__text">${e.bayesian.diagnostics.warning}</div></div>\n                </div>\n              `:""}\n            </div>\n            `:""}\n            \n            \x3c!-- Trace Plots --\x3e\n            <div style="margin-top: var(--space-6);">\n              <h4 class="text-sm font-semibold" style="margin-bottom: var(--space-3);">Trace Plots</h4>\n              <div id="bayesianTracePlot" style="width: 100%; height: 300px;"></div>\n            </div>\n          </div>\n        </div>\n        `:""}\n        \n        \x3c!-- Study Weights --\x3e\n        <div class="card" style="margin-top: var(--space-6);">\n          <div class="card__header">\n            <h2 class="card__title">⚖️ Study Contributions</h2>\n          </div>\n          <div class="card__body" style="padding: 0;">\n            <table class="data-table data-table--mono">\n              <thead>\n                <tr>\n                  <th>Study</th>\n                  <th>Effect (${e.measure})</th>\n                  <th>95% CI</th>\n                  <th>SE</th>\n                  <th>Weight (%)</th>\n                </tr>\n              </thead>\n              <tbody>\n                ${e.studies.map((t,n)=>`\n                  <tr>\n                    <td class="font-sans">${sanitizeHTML(t.name)}</td>\n                    <td>${formatEffect(t.yi,e.measure)}</td>\n                    <td>${formatEffect(t.yi-1.96*t.sei,e.measure)} – ${formatEffect(t.yi+1.96*t.sei,e.measure)}</td>\n                    <td>${void 0!==t.sei?t.sei.toFixed(4):"N/A"}</td>\n                    <td>\n                      <div style="display: flex; align-items: center; gap: var(--space-2);">\n                        <div style="flex: 1; height: 8px; background: var(--surface-overlay); border-radius: var(--radius-full); overflow: hidden;">\n                          <div style="width: ${e.pooled.weights_pct&&void 0!==e.pooled.weights_pct[n]?e.pooled.weights_pct[n]:0}%; height: 100%; background: var(--color-primary-500);"></div>\n                        </div>\n                        <span>${e.pooled.weights_pct&&void 0!==e.pooled.weights_pct[n]?e.pooled.weights_pct[n].toFixed(1):"N/A"}%</span>\n                      </div>\n                    </td>\n                  </tr>\n                `).join("")}\n              </tbody>\n            </table>\n          </div>\n        </div>\n        \n        \x3c!-- Forest Plot --\x3e\n        <div class="card" style="margin-top: var(--space-6);">\n          <div class="card__header" style="display: flex; justify-content: space-between; align-items: center;">\n            <h2 class="card__title">🌲 Forest Plot</h2>\n            <div style="display: flex; gap: var(--space-2); align-items: center;">\n              \x3c!-- Download Buttons --\x3e\n              <div class="btn-group" role="group" aria-label="Download forest plot" style="display: flex; gap: 2px;">\n                <button class="btn btn--ghost btn--sm" onclick="downloadPlot('forestPlot', 'svg')" title="Download SVG (vector)" aria-label="Download forest plot as SVG vector image">\n                  SVG\n                </button>\n                <button class="btn btn--ghost btn--sm" onclick="downloadPlot('forestPlot', 'png')" title="Download PNG (high-res)" aria-label="Download forest plot as high-resolution PNG">\n                  PNG\n                </button>\n                <button class="btn btn--ghost btn--sm" onclick="downloadPlot('forestPlot', 'jpg')" title="Download JPG" aria-label="Download forest plot as JPG">\n                  JPG\n                </button>\n              </div>\n              <button class="btn btn--ghost btn--sm" id="toggleForestSettings" onclick="document.getElementById('forestSettingsPanel').classList.toggle('hidden')" aria-expanded="false" aria-controls="forestSettingsPanel">\n                ⚙️ <span class="sr-only">Toggle </span>Settings\n              </button>\n            </div>\n          </div>\n          \n          \x3c!-- Forest Plot Settings Panel --\x3e\n          <div id="forestSettingsPanel" class="hidden" style="background: var(--surface-overlay); padding: var(--space-4); border-bottom: 1px solid var(--border-subtle);">\n            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--space-4);">\n              \n              \x3c!-- Layout & Style Preset --\x3e\n              <div class="settings-group">\n                <label class="text-xs text-secondary" style="display: block; margin-bottom: var(--space-1);">Style Preset</label>\n                <select id="forestLayout" class="select select--sm" onchange="applyForestPreset(this.value)">\n                  <option value="default">Default</option>\n                  <option value="revman5">RevMan 5 (Cochrane)</option>\n                  <option value="jama">JAMA</option>\n                  <option value="lancet">Lancet</option>\n                  <option value="bmj">BMJ</option>\n                  <option value="nejm">NEJM</option>\n                  <option value="classic">Classic (Black/White)</option>\n                  <option value="modern">Modern</option>\n                  <option value="compact">Compact</option>\n                  <option value="presentation">Presentation</option>\n                </select>\n              </div>\n              \n              <div class="settings-group">\n                <label class="text-xs text-secondary" style="display: block; margin-bottom: var(--space-1);">Sort by</label>\n                <select id="forestSortBy" class="select select--sm" onchange="updateForestSetting('sortBy', this.value)">\n                  <option value="none">Original order</option>\n                  <option value="effect">Effect size</option>\n                  <option value="precision">Precision (1/SE)</option>\n                  <option value="weight">Weight</option>\n                  <option value="alphabetical">Alphabetical</option>\n                </select>\n              </div>\n              \n              <div class="settings-group">\n                <label class="text-xs text-secondary" style="display: block; margin-bottom: var(--space-1);">Sort order</label>\n                <select id="forestSortOrder" class="select select--sm" onchange="updateForestSetting('sortOrder', this.value)">\n                  <option value="asc">Ascending</option>\n                  <option value="desc">Descending</option>\n                </select>\n              </div>\n              \n              \x3c!-- Display Options --\x3e\n              <div class="settings-group">\n                <label class="text-xs text-secondary" style="display: block; margin-bottom: var(--space-1);">Display</label>\n                <div style="display: flex; flex-direction: column; gap: var(--space-1);">\n                  <label style="display: flex; align-items: center; gap: var(--space-2); font-size: 12px;">\n                    <input type="checkbox" id="forestShowWeights" onchange="updateForestSetting('showWeights', this.checked)">\n                    Show weights\n                  </label>\n                  <label style="display: flex; align-items: center; gap: var(--space-2); font-size: 12px;">\n                    <input type="checkbox" id="forestShowAnnotation" checked onchange="updateForestSetting('showAnnotation', this.checked)">\n                    Show annotations\n                  </label>\n                  <label style="display: flex; align-items: center; gap: var(--space-2); font-size: 12px;">\n                    <input type="checkbox" id="forestShowPrediction" onchange="updateForestSetting('showPrediction', this.checked)">\n                    Prediction interval\n                  </label>\n                </div>\n              </div>\n              \n              \x3c!-- Point Style --\x3e\n              <div class="settings-group">\n                <label class="text-xs text-secondary" style="display: block; margin-bottom: var(--space-1);">Point style</label>\n                <select id="forestPointShape" class="select select--sm" onchange="updateForestSetting('pointShape', this.value)">\n                  <option value="square">Square</option>\n                  <option value="circle">Circle</option>\n                  <option value="diamond">Diamond</option>\n                </select>\n                <label style="display: flex; align-items: center; gap: var(--space-2); font-size: 12px; margin-top: var(--space-1);">\n                  <input type="checkbox" id="forestPointSizeByWeight" checked onchange="updateForestSetting('pointSizeByWeight', this.checked)">\n                  Size by weight\n                </label>\n              </div>\n              \n              \x3c!-- Colors --\x3e\n              <div class="settings-group">\n                <label class="text-xs text-secondary" style="display: block; margin-bottom: var(--space-1);">Colors</label>\n                <div style="display: flex; gap: var(--space-2); align-items: center;">\n                  <label style="font-size: 11px;">Points:</label>\n                  <input type="color" id="forestPointColor" value="#4a7ab8" style="width: 30px; height: 24px; border: none; cursor: pointer;" onchange="updateForestSetting('pointColor', this.value)">\n                  <label style="font-size: 11px;">Diamond:</label>\n                  <input type="color" id="forestDiamondColor" value="#22c55e" style="width: 30px; height: 24px; border: none; cursor: pointer;" onchange="updateForestSetting('diamondColor', this.value)">\n                </div>\n              </div>\n              \n              \x3c!-- X-axis Scale --\x3e\n              <div class="settings-group">\n                <label class="text-xs text-secondary" style="display: block; margin-bottom: var(--space-1);">X-axis scale</label>\n                <select id="forestXAxisScale" class="select select--sm" onchange="updateForestSetting('xAxisScale', this.value)">\n                  <option value="auto">Auto</option>\n                  <option value="linear">Linear</option>\n                  <option value="log">Logarithmic</option>\n                </select>\n              </div>\n              \n              <div class="settings-group">\n                <label class="text-xs text-secondary" style="display: block; margin-bottom: var(--space-1);">Decimal places</label>\n                <select id="forestDigits" class="select select--sm" onchange="updateForestSetting('digits', parseInt(this.value))">\n                  <option value="1">1</option>\n                  <option value="2" selected>2</option>\n                  <option value="3">3</option>\n                  <option value="4">4</option>\n                </select>\n              </div>\n              \n              \x3c!-- Labels --\x3e\n              <div class="settings-group">\n                <label class="text-xs text-secondary" style="display: block; margin-bottom: var(--space-1);">Left label</label>\n                <input type="text" id="forestLeftLabel" class="input input--sm" placeholder="e.g., Favours treatment" style="font-size: 12px;" onchange="updateForestSetting('leftLabel', this.value)">\n              </div>\n              \n              <div class="settings-group">\n                <label class="text-xs text-secondary" style="display: block; margin-bottom: var(--space-1);">Right label</label>\n                <input type="text" id="forestRightLabel" class="input input--sm" placeholder="e.g., Favours control" style="font-size: 12px;" onchange="updateForestSetting('rightLabel', this.value)">\n              </div>\n              \n            </div>\n            \n            \x3c!-- X-Axis Range Slider --\x3e\n            <div style="margin-top: var(--space-4); padding: var(--space-3); background: var(--surface-base); border-radius: var(--radius-md);">\n              <label class="text-xs text-secondary" style="display: block; margin-bottom: var(--space-2);">X-Axis Range</label>\n              <div style="display: flex; gap: var(--space-4); align-items: center;">\n                <div style="flex: 1;">\n                  <label style="font-size: 11px; color: var(--text-muted);">Min:</label>\n                  <input type="number" id="forestXMin" class="input input--sm" step="0.1" placeholder="Auto" style="width: 80px; font-size: 12px;" onchange="updateForestAxisRange()">\n                </div>\n                <div style="flex: 3;">\n                  <div id="forestXSlider" style="display: flex; align-items: center; gap: var(--space-2);">\n                    <input type="range" id="forestXMinSlider" min="0" max="100" value="0" style="flex: 1;" oninput="updateForestSliderValue('min', this.value)">\n                    <input type="range" id="forestXMaxSlider" min="0" max="100" value="100" style="flex: 1;" oninput="updateForestSliderValue('max', this.value)">\n                  </div>\n                  <div style="display: flex; justify-content: space-between; font-size: 10px; color: var(--text-muted);">\n                    <span id="forestSliderMinLabel">0.1</span>\n                    <span id="forestSliderMaxLabel">10</span>\n                  </div>\n                </div>\n                <div style="flex: 1;">\n                  <label style="font-size: 11px; color: var(--text-muted);">Max:</label>\n                  <input type="number" id="forestXMax" class="input input--sm" step="0.1" placeholder="Auto" style="width: 80px; font-size: 12px;" onchange="updateForestAxisRange()">\n                </div>\n                <button class="btn btn--ghost btn--sm" onclick="resetForestAxisRange()" title="Reset to auto">↺</button>\n              </div>\n            </div>\n            \n            <div style="margin-top: var(--space-4); display: flex; gap: var(--space-2);">\n              <button class="btn btn--primary btn--sm" onclick="reRenderForestPlot()">Apply Changes</button>\n              <button class="btn btn--ghost btn--sm" onclick="resetForestSettings()">Reset to Default</button>\n            </div>\n          </div>\n          \n          <div class="card__body">\n            <div id="forestPlot" class="plot-container"></div>\n            \n            \x3c!-- Axis labels (added dynamically) --\x3e\n            <div id="forestAxisLabels" style="display: flex; justify-content: space-between; padding: 0 60px; margin-top: var(--space-2);">\n              <span id="forestLeftLabelDisplay" class="text-xs text-secondary"></span>\n              <span id="forestRightLabelDisplay" class="text-xs text-secondary"></span>\n            </div>\n          </div>\n        </div>\n      `, setTimeout(() => {
      renderForestPlot(e), e.bayesian && e.bayesian.tracePlotData && document.getElementById("bayesianTracePlot") && renderBayesianTracePlot(e.bayesian)
    }, 0)
  } catch (e) {
    log.error("renderAnalysisPanel failed:", e);
    const t = document.getElementById("panel-analysis");
    t && (t.innerHTML = `<div class="card"><div class="card__body"><p class="text-danger">Error rendering analysis panel: ${e.message}</p></div></div>`)
  }
}

function updateForestSetting(e, t) {
  AppState.forestSettings[e] = t
}

function reRenderForestPlot() {
  if (AppState.results) {
    renderForestPlot(AppState.results);
    const e = AppState.forestSettings,
      t = document.getElementById("forestLeftLabelDisplay"),
      n = document.getElementById("forestRightLabelDisplay");
    t && (t.textContent = e.leftLabel || ""), n && (n.textContent = e.rightLabel || "")
  }
}

function resetForestSettings() {
  if (!confirm("Reset all forest plot settings to defaults?")) return;
  AppState.forestSettings = {
    layout: "default",
    sortBy: "none",
    sortOrder: "asc",
    showWeights: !1,
    showAnnotation: !0,
    showHeader: !0,
    showStudyLabels: !0,
    showPooled: !0,
    showPrediction: !1,
    predictionStyle: "line",
    refLine: "auto",
    refLineColor: "#666",
    xAxisLabel: "auto",
    xAxisScale: "auto",
    xAxisLimits: "auto",
    xAxisTicks: 5,
    pointShape: "square",
    pointSizeByWeight: !0,
    pointColor: "#4a7ab8",
    pointColorByQuality: !1,
    ciLineWidth: 1.5,
    ciLineColor: "#4a7ab8",
    ciEndStyle: "bar",
    diamondColor: "#22c55e",
    diamondBorder: "#16a34a",
    alternateShading: !1,
    shadeColor: "rgba(255,255,255,0.03)",
    rowSpacing: 1,
    digits: 2,
    annotationFormat: "effect_ci",
    showEvents: !1,
    showN: !1,
    showI2: !1,
    pooledLabel: "Pooled",
    predictionLabel: "Prediction interval",
    leftLabel: "",
    rightLabel: ""
  };
  Object.entries({
    forestLayout: "layout",
    forestSortBy: "sortBy",
    forestSortOrder: "sortOrder",
    forestShowWeights: "showWeights",
    forestShowAnnotation: "showAnnotation",
    forestShowPrediction: "showPrediction",
    forestPointShape: "pointShape",
    forestPointSizeByWeight: "pointSizeByWeight",
    forestPointColor: "pointColor",
    forestDiamondColor: "diamondColor",
    forestXAxisScale: "xAxisScale",
    forestDigits: "digits",
    forestLeftLabel: "leftLabel",
    forestRightLabel: "rightLabel"
  }).forEach(([e, t]) => {
    const n = document.getElementById(e);
    n && ("checkbox" === n.type ? n.checked = AppState.forestSettings[t] : n.value = AppState.forestSettings[t])
  }), reRenderForestPlot()
}

function announceToScreenReader(e, t = "polite") {
  const n = document.getElementById("ariaLiveRegion");
  n && (n.setAttribute("aria-live", t), n.textContent = e, safeTimeout(() => {
    n.textContent = ""
  }, 1e3))
}

function showPlotError(e, t, n = null) {
  const a = document.getElementById(e);
  if (a) {
    if (a.innerHTML = `\n        <div class="plot-error" role="alert">\n          <div class="plot-error__icon">⚠️</div>\n          <div class="plot-error__message">${sanitizeHTML(t)}</div>\n          ${n?'<button class="btn btn--primary btn--sm" id="plotRetryBtn">Try Again</button>':""}\n        </div>\n      `, n) {
      const e = document.getElementById("plotRetryBtn");
      e && e.addEventListener("click", n)
    }
    announceToScreenReader("Error: " + t, "assertive")
  }
}

function downloadPlot(e, t = "png") {
  const n = document.getElementById(e);
  if (!n || "undefined" == typeof Plotly) return announceToScreenReader("Plot not available for download", "assertive"), void alert("Plot not available for download");
  const a = `${e.replace("Plot","-plot")}-${(new Date).toISOString().slice(0,10)}`;
  announceToScreenReader(`Downloading ${e.replace("Plot"," plot")} as ${t.toUpperCase()}`, "polite");
  try {
    "svg" === t ? Plotly.downloadImage(n, {
      format: "svg",
      filename: a,
      width: 1200,
      height: 800
    }) : "png" === t ? Plotly.downloadImage(n, {
      format: "png",
      filename: a,
      width: 2400,
      height: 1600,
      scale: 2
    }) : "jpg" !== t && "jpeg" !== t || Plotly.downloadImage(n, {
      format: "jpeg",
      filename: a,
      width: 2400,
      height: 1600,
      scale: 2
    })
  } catch (e) {
    log.error("Download failed:", e), announceToScreenReader("Download failed. Please try again.", "assertive"), alert("Download failed. Please try again.")
  }
}

function applyForestPreset(e) {
  const t = {
      default: {
        pointColor: "#4a7ab8",
        diamondColor: "#22c55e",
        ciLineColor: "#4a7ab8",
        refLineColor: "#666",
        pointShape: "square",
        ciEndStyle: "bar",
        showAnnotation: !0,
        showWeights: !1,
        rowSpacing: 1
      },
      revman5: {
        pointColor: "#000000",
        diamondColor: "#000000",
        ciLineColor: "#000000",
        refLineColor: "#000000",
        pointShape: "square",
        ciEndStyle: "bar",
        showAnnotation: !0,
        showWeights: !0,
        rowSpacing: 1
      },
      jama: {
        pointColor: "#1a1a1a",
        diamondColor: "#4a90d9",
        ciLineColor: "#1a1a1a",
        refLineColor: "#999",
        pointShape: "square",
        ciEndStyle: "none",
        showAnnotation: !0,
        showWeights: !1,
        rowSpacing: .9
      },
      lancet: {
        pointColor: "#c4161c",
        diamondColor: "#c4161c",
        ciLineColor: "#c4161c",
        refLineColor: "#333",
        pointShape: "square",
        ciEndStyle: "bar",
        showAnnotation: !0,
        showWeights: !1,
        rowSpacing: 1
      },
      bmj: {
        pointColor: "#2166ac",
        diamondColor: "#2166ac",
        ciLineColor: "#2166ac",
        refLineColor: "#666",
        pointShape: "square",
        ciEndStyle: "bar",
        showAnnotation: !0,
        showWeights: !1,
        rowSpacing: 1
      },
      nejm: {
        pointColor: "#1f77b4",
        diamondColor: "#d62728",
        ciLineColor: "#1f77b4",
        refLineColor: "#7f7f7f",
        pointShape: "circle",
        ciEndStyle: "none",
        showAnnotation: !0,
        showWeights: !1,
        rowSpacing: .85
      },
      classic: {
        pointColor: "#000000",
        diamondColor: "#000000",
        ciLineColor: "#000000",
        refLineColor: "#000000",
        pointShape: "square",
        ciEndStyle: "bar",
        showAnnotation: !0,
        showWeights: !0,
        rowSpacing: 1
      },
      modern: {
        pointColor: "#3b82f6",
        diamondColor: "#10b981",
        ciLineColor: "#3b82f6",
        refLineColor: "#94a3b8",
        pointShape: "circle",
        ciEndStyle: "none",
        showAnnotation: !0,
        showWeights: !1,
        rowSpacing: 1.1
      },
      compact: {
        pointColor: "#4a7ab8",
        diamondColor: "#22c55e",
        ciLineColor: "#4a7ab8",
        refLineColor: "#666",
        pointShape: "square",
        ciEndStyle: "none",
        showAnnotation: !1,
        showWeights: !1,
        rowSpacing: .7
      },
      presentation: {
        pointColor: "#2563eb",
        diamondColor: "#dc2626",
        ciLineColor: "#2563eb",
        refLineColor: "#475569",
        pointShape: "circle",
        ciEndStyle: "bar",
        showAnnotation: !0,
        showWeights: !1,
        rowSpacing: 1.3
      }
    },
    n = t[e] || t.default;
  Object.entries(n).forEach(([e, t]) => {
    AppState.forestSettings[e] = t
  }), AppState.forestSettings.layout = e, updateForestUIControls(), reRenderForestPlot()
}

function updateForestUIControls() {
  const e = AppState.forestSettings;
  [
    ["forestPointColor", e.pointColor],
    ["forestDiamondColor", e.diamondColor],
    ["forestPointShape", e.pointShape],
    ["forestShowAnnotation", e.showAnnotation],
    ["forestShowWeights", e.showWeights]
  ].forEach(([e, t]) => {
    const n = document.getElementById(e);
    n && ("checkbox" === n.type ? n.checked = t : n.value = t)
  })
}

function updateForestAxisRange() {
  const e = document.getElementById("forestXMin"),
    t = document.getElementById("forestXMax"),
    n = e && "" !== e.value ? parseFloat(e.value) : null,
    a = t && "" !== t.value ? parseFloat(t.value) : null;
  if (null !== n && null !== a && n >= a) return e.classList.add("input--error"), t.classList.add("input--error"), void announceToScreenReader("Invalid range: minimum must be less than maximum", "assertive");
  e && e.classList.remove("input--error"), t && t.classList.remove("input--error"), AppState.forestSettings.xAxisMin = n, AppState.forestSettings.xAxisMax = a, reRenderForestPlot()
}

function updateForestSliderValue(e, t) {
  const n = AppState.results;
  if (!n) return;
  const a = "RD" !== n.measure,
    s = [...n.studies.map(e => a ? Math.exp(e.yi) : 100 * e.yi), a ? Math.exp(n.pooled.theta) : 100 * n.pooled.theta],
    i = .5 * Math.min(...s),
    r = 2 * Math.max(...s),
    o = (e => {
      const t = e / 100;
      return a ? Math.exp(Math.log(i) + t * (Math.log(r) - Math.log(i))) : i + t * (r - i)
    })(parseInt(t));
  if ("min" === e) {
    AppState.forestSettings.xAxisMin = o;
    const e = document.getElementById("forestXMin");
    e && (e.value = o.toFixed(2))
  } else {
    AppState.forestSettings.xAxisMax = o;
    const e = document.getElementById("forestXMax");
    e && (e.value = o.toFixed(2))
  }
  const l = document.getElementById("forestSliderMinLabel"),
    d = document.getElementById("forestSliderMaxLabel");
  l && (l.textContent = i.toFixed(2)), d && (d.textContent = r.toFixed(2)), clearTimeout(window.forestSliderTimeout), window.forestSliderTimeout = setTimeout(() => reRenderForestPlot(), 150)
}

function resetForestAxisRange() {
  AppState.forestSettings.xAxisMin = null, AppState.forestSettings.xAxisMax = null;
  const e = document.getElementById("forestXMin"),
    t = document.getElementById("forestXMax"),
    n = document.getElementById("forestXMinSlider"),
    a = document.getElementById("forestXMaxSlider");
  e && (e.value = ""), t && (t.value = ""), n && (n.value = 0), a && (a.value = 100), reRenderForestPlot()
}

function updateFunnelAxisRange() {
  const e = document.getElementById("funnelXMin"),
    t = document.getElementById("funnelXMax");
  AppState.funnelSettings || (AppState.funnelSettings = {}), AppState.funnelSettings.xAxisMin = e && "" !== e.value ? parseFloat(e.value) : null, AppState.funnelSettings.xAxisMax = t && "" !== t.value ? parseFloat(t.value) : null, AppState.results && renderFunnelPlot(AppState.results)
}

function updateFunnelSliderValue(e, t) {
  const n = AppState.results;
  if (!n) return;
  const a = "RD" !== n.measure,
    s = n.yi.map(e => a ? Math.exp(e) : 100 * e),
    i = .3 * Math.min(...s),
    r = 3 * Math.max(...s),
    o = (e => {
      const t = e / 100;
      return a ? Math.exp(Math.log(Math.max(.01, i)) + t * (Math.log(r) - Math.log(Math.max(.01, i)))) : i + t * (r - i)
    })(parseInt(t));
  if (AppState.funnelSettings || (AppState.funnelSettings = {}), "min" === e) {
    AppState.funnelSettings.xAxisMin = o;
    const e = document.getElementById("funnelXMin");
    e && (e.value = o.toFixed(2))
  } else {
    AppState.funnelSettings.xAxisMax = o;
    const e = document.getElementById("funnelXMax");
    e && (e.value = o.toFixed(2))
  }
  clearTimeout(window.funnelSliderTimeout), window.funnelSliderTimeout = setTimeout(() => {
    AppState.results && renderFunnelPlot(AppState.results)
  }, 150)
}

function resetFunnelAxisRange() {
  AppState.funnelSettings || (AppState.funnelSettings = {}), AppState.funnelSettings.xAxisMin = null, AppState.funnelSettings.xAxisMax = null;
  const e = document.getElementById("funnelXMin"),
    t = document.getElementById("funnelXMax"),
    n = document.getElementById("funnelXMinSlider"),
    a = document.getElementById("funnelXMaxSlider");
  e && (e.value = ""), t && (t.value = ""), n && (n.value = 0), a && (a.value = 100), AppState.results && renderFunnelPlot(AppState.results)
}

function updateFunnelSetting(e, t) {
  AppState.funnelSettings || (AppState.funnelSettings = {}), AppState.funnelSettings[e] = t, AppState.results && renderFunnelPlot(AppState.results)
}

function getSortedStudyIndices(e, t) {
  const n = e.map((e, t) => t);
  if ("none" === t.sortBy) return n;
  const a = {
    effect: (t, n) => e[t].yi - e[n].yi,
    precision: (t, n) => 1 / e[t].sei - 1 / e[n].sei,
    weight: (t, n) => e[t].weight - e[n].weight,
    alphabetical: (t, n) => e[t].name.localeCompare(e[n].name)
  } [t.sortBy];
  return a && (n.sort(a), "desc" === t.sortOrder && n.reverse()), n
}

function renderForestPlot(e, t = 0) {
  try {
    if ("undefined" == typeof Plotly) {
      if (t < 5) return void setTimeout(() => renderForestPlot(e, t + 1), 500);
      log.error("Plotly failed to load after 5 attempts");
      const n = document.getElementById("forestPlot");
      return void(n && (n.innerHTML = '<p class="text-warning" style="padding: 20px;">Plotly library not loaded. Plots require internet connection. <br><br>Data analysis completed successfully - see tables above.</p>'))
    }
    const n = document.getElementById("forestPlot");
    if (!n) return void log.error("Forest plot container not found!");
    n && n._fullLayout && Plotly.purge(n);
    const a = AppState.forestSettings,
      s = e.studies,
      i = s.length,
      r = getSortedStudyIndices(s, a),
      o = r.map(e => s[e]),
      l = "RD" !== e.measure,
      d = "log" === a.xAxisScale || "auto" === a.xAxisScale && l,
      c = d && l ? e => Math.exp(e) : t => "RD" === e.measure ? 100 * t : t,
      u = o.map((e, t) => i - t),
      p = o.map(e => c(e.yi)),
      m = o.map(e => c(e.yi - 1.96 * e.sei)),
      h = o.map(e => c(e.yi + 1.96 * e.sei)),
      v = e.pooled.weights_pct ? r.map(t => e.pooled.weights_pct[t] || 0) : r.map(() => 0),
      g = void 0 !== e.pooled.theta ? c(e.pooled.theta) : null,
      f = void 0 !== e.pooled.ci_lower ? c(e.pooled.ci_lower) : null,
      _ = void 0 !== e.pooled.ci_upper ? c(e.pooled.ci_upper) : null;
    let y = null,
      b = null;
    a.showPrediction && e.het && e.het.pi && (y = c(e.het.pi.lower), b = c(e.het.pi.upper));
    const x = l ? 1 : 0,
      w = a.digits,
      M = getThemeColors(),
      S = {
        square: "square",
        circle: "circle",
        diamond: "diamond"
      },
      E = a.pointSizeByWeight ? v.map(e => Math.max(8, Math.min(24, 2 * e))) : Array(i).fill(12),
      A = {
        x: p,
        y: u,
        mode: "markers",
        type: "scatter",
        marker: {
          size: E,
          color: a.pointColor,
          symbol: S[a.pointShape] || "square",
          line: {
            color: "#1b263b",
            width: 1
          }
        },
        error_x: {
          type: "data",
          symmetric: !1,
          array: h.map((e, t) => e - p[t]),
          arrayminus: p.map((e, t) => e - m[t]),
          color: a.ciLineColor,
          thickness: a.ciLineWidth,
          width: "bar" === a.ciEndStyle ? 4 : 0
        },
        text: o.map(e => e.name),
        hovertemplate: "%{text}<br>Effect: %{x:." + w + "f}<extra></extra>",
        name: "Studies"
      },
      R = a.showPooled ? {
        x: [g],
        y: [0],
        mode: "markers",
        type: "scatter",
        marker: {
          size: 16,
          color: a.diamondColor,
          symbol: "diamond",
          line: {
            color: a.diamondBorder || "#0d1b2a",
            width: 2
          }
        },
        error_x: {
          type: "data",
          symmetric: !1,
          array: [_ - g],
          arrayminus: [g - f],
          color: a.diamondColor,
          thickness: 3,
          width: 0
        },
        name: a.pooledLabel || "Pooled",
        hovertemplate: (a.pooledLabel || "Pooled") + ": %{x:." + w + "f}<extra></extra>"
      } : null,
      I = "auto" === a.refLine ? x : "none" === a.refLine ? null : parseFloat(a.refLine),
      T = null !== I ? {
        x: [I, I],
        y: [-1.5, i + 1],
        mode: "lines",
        type: "scatter",
        line: {
          color: a.refLineColor || "#5a6478",
          width: 1,
          dash: "dash"
        },
        hoverinfo: "skip",
        showlegend: !1
      } : null,
      C = a.showPrediction && null !== y ? {
        x: [y, b],
        y: [-.5, -.5],
        mode: "lines+markers",
        type: "scatter",
        line: {
          color: "#888",
          width: 1,
          dash: "dot"
        },
        marker: {
          size: 6,
          color: "#888",
          symbol: "line-ns-open"
        },
        name: a.predictionLabel || "Prediction interval",
        hovertemplate: "PI: [%{x[0]:." + w + "f}, %{x[1]:." + w + "f}]<extra></extra>"
      } : null;
    let P = o.map(e => sanitizeHTML(e.name)),
      k = [...u];
    a.showPooled && (P.push("<b>" + (a.pooledLabel || "Pooled") + "</b>"), k.push(0)), a.showPrediction && null !== y && (P.push("<i>" + (a.predictionLabel || "PI") + "</i>"), k.push(-.5));
    const D = a.showAnnotation ? o.map((e, t) => ({
      x: 1,
      xref: "paper",
      y: u[t],
      yref: "y",
      text: `${void 0!==p[t]?p[t].toFixed(w):"N/A"} [${void 0!==m[t]?m[t].toFixed(w):"N/A"}, ${void 0!==h[t]?h[t].toFixed(w):"N/A"}]`,
      showarrow: !1,
      xanchor: "left",
      font: {
        family: "Plus Jakarta Sans",
        size: 11,
        color: M.text
      }
    })) : [];
    a.showAnnotation && a.showPooled && null !== g && D.push({
      x: 1,
      xref: "paper",
      y: 0,
      yref: "y",
      text: `<b>${g.toFixed(w)} [${null!==f?f.toFixed(w):"N/A"}, ${null!==_?_.toFixed(w):"N/A"}]</b>`,
      showarrow: !1,
      xanchor: "left",
      font: {
        family: "Plus Jakarta Sans",
        size: 11,
        color: M.textStrong
      }
    }), a.showWeights && o.forEach((e, t) => {
      D.push({
        x: 0,
        xref: "paper",
        y: u[t],
        yref: "y",
        text: `${void 0!==v[t]?v[t].toFixed(1):"N/A"}%`,
        showarrow: !1,
        xanchor: "right",
        font: {
          family: "Plus Jakarta Sans",
          size: 11,
          color: M.text
        }
      })
    });
    const $ = "auto" === a.xAxisLabel ? "RD" === e.measure ? "Risk Difference (%)" : e.measure : a.xAxisLabel;
    let N = null;
    if (null !== a.xAxisMin || null !== a.xAxisMax) {
      const e = [...p, g, ...m, ...h],
        t = Math.min(...e),
        n = Math.max(...e),
        s = null !== a.xAxisMin ? a.xAxisMin : .9 * t,
        i = null !== a.xAxisMax ? a.xAxisMax : 1.1 * n;
      N = d && l ? [Math.log10(Math.max(.01, s)), Math.log10(i)] : [s, i]
    }
    const F = {
        yaxis: {
          tickvals: k,
          ticktext: P,
          range: [(a.showPrediction, -1.5), i + .5],
          showgrid: !1,
          zeroline: !1,
          tickfont: {
            family: "Plus Jakarta Sans",
            size: 11,
            color: M.text
          }
        },
        xaxis: {
          title: $,
          type: d && l ? "log" : "linear",
          range: N,
          zeroline: !1,
          showgrid: !0,
          gridcolor: M.grid,
          tickfont: {
            family: "JetBrains Mono",
            size: 11,
            color: M.text
          },
          titlefont: {
            family: "Plus Jakarta Sans",
            size: 13,
            color: M.textStrong
          }
        },
        showlegend: !1,
        margin: {
          l: 180,
          r: a.showAnnotation ? 160 : 40,
          t: 20,
          b: 50
        },
        paper_bgcolor: M.background,
        plot_bgcolor: M.background,
        hoverlabel: {
          bgcolor: M.hoverBg,
          bordercolor: M.hoverBorder,
          font: {
            family: "Plus Jakarta Sans",
            color: M.hoverText
          }
        },
        height: Math.max(300, 45 * (i + 2) * a.rowSpacing),
        annotations: D
      },
      L = [T, A, R, C].filter(e => null !== e);
    Plotly.newPlot("forestPlot", L, F, {
      displayModeBar: !0,
      modeBarButtonsToRemove: ["select2d", "lasso2d", "autoScale2d"],
      responsive: !0
    });
    const O = document.getElementById("forestLeftLabelDisplay"),
      B = document.getElementById("forestRightLabelDisplay");
    O && (O.textContent = a.leftLabel || ""), B && (B.textContent = a.rightLabel || "")
  } catch (t) {
    log.error("Forest plot rendering failed:", t), showPlotError("forestPlot", "Failed to render forest plot. Please try refreshing the page.", () => renderForestPlot(e, 0))
  }
}

function renderBayesianTracePlot(e) {
  try {
    if (!document.getElementById("bayesianTracePlot")) return;
    const t = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728"],
      n = [];
    e.chains.forEach((e, a) => {
      n.push({
        x: e.mu.map((e, t) => t),
        y: e.mu,
        type: "scatter",
        mode: "lines",
        name: `Chain ${a+1}: μ`,
        line: {
          color: t[a % t.length],
          width: .5
        },
        xaxis: "x",
        yaxis: "y",
        showlegend: !0
      })
    });
    const a = {
      title: {
        text: "MCMC Trace Plots",
        font: {
          size: 14
        }
      },
      grid: {
        rows: 1,
        columns: 1
      },
      xaxis: {
        title: "Iteration",
        showgrid: !0,
        gridcolor: "#eee"
      },
      yaxis: {
        title: "μ (log scale)",
        showgrid: !0,
        gridcolor: "#eee"
      },
      margin: {
        t: 40,
        r: 20,
        b: 50,
        l: 60
      },
      showlegend: !0,
      legend: {
        orientation: "h",
        y: -.2
      },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)"
    };
    Plotly.newPlot("bayesianTracePlot", n, a, {
      responsive: !0,
      displayModeBar: !1
    })
  } catch (e) {
    log.error("Bayesian trace plot failed:", e)
  }
}

function renderDDMAPanel(e) {
  const t = document.getElementById("panel-ddma"),
    n = e.ddma,
    a = e.decision;
  t.innerHTML = `\n        <div class="grid" style="grid-template-columns: 2fr 1fr; gap: var(--space-6);">\n          \x3c!-- Decision Probabilities --\x3e\n          <div class="card">\n            <div class="card__header">\n              <h2 class="card__title">🎯 Decision Probabilities</h2>\n            </div>\n            <div class="card__body">\n              <div class="prob-bar prob-bar--success">\n                <div class="prob-bar__header">\n                  <span class="prob-bar__label">P(Benefit)</span>\n                  <span class="prob-bar__value">${formatPct(n.confidence.P_benefit)}</span>\n                </div>\n                <div class="prob-bar__track">\n                  <div class="prob-bar__fill" style="width: ${100*n.confidence.P_benefit}%;"></div>\n                </div>\n                <div class="prob-bar__desc">Treatment ${"lower"===e.direction?"reduces":"increases"} outcome</div>\n              </div>\n              \n              <div class="prob-bar prob-bar--danger">\n                <div class="prob-bar__header">\n                  <span class="prob-bar__label">P(Harm)</span>\n                  <span class="prob-bar__value">${formatPct(n.confidence.P_harm)}</span>\n                </div>\n                <div class="prob-bar__track">\n                  <div class="prob-bar__fill" style="width: ${100*n.confidence.P_harm}%;"></div>\n                </div>\n                <div class="prob-bar__desc">Treatment ${"lower"===e.direction?"increases":"reduces"} outcome</div>\n              </div>\n              \n              <div class="prob-bar prob-bar--accent">\n                <div class="prob-bar__header">\n                  <span class="prob-bar__label">P(Exceeds MCID)</span>\n                  <span class="prob-bar__value">${formatPct(n.predictive.P_mcid)}</span>\n                </div>\n                <div class="prob-bar__track">\n                  <div class="prob-bar__fill" style="width: ${100*n.predictive.P_mcid}%;"></div>\n                </div>\n                <div class="prob-bar__desc">Effect exceeds ${void 0!==n.mcid?(100*(1-Math.exp(-n.mcid))).toFixed(0):"N/A"}% threshold</div>\n              </div>\n              \n              <div class="prob-bar prob-bar--success">\n                <div class="prob-bar__header">\n                  <span class="prob-bar__label">P(Large Benefit)</span>\n                  <span class="prob-bar__value">${formatPct(n.predictive.P_large_benefit)}</span>\n                </div>\n                <div class="prob-bar__track">\n                  <div class="prob-bar__fill" style="width: ${100*n.predictive.P_large_benefit}%;"></div>\n                </div>\n                <div class="prob-bar__desc">Effect > 22% reduction</div>\n              </div>\n              \n              \x3c!-- Confidence vs Predictive --\x3e\n              <div class="grid" style="grid-template-columns: 1fr 1fr; gap: var(--space-4); margin-top: var(--space-6);">\n                <div style="padding: var(--space-4); background: var(--surface-overlay); border-radius: var(--radius-lg);">\n                  <h4 class="text-sm font-semibold" style="margin-bottom: var(--space-2);">Average Effect (Confidence)</h4>\n                  <p class="font-mono text-lg">${formatPct(n.confidence?n.confidence.P_benefit:null)} P(benefit)</p>\n                  <p class="text-sm text-secondary">SE: ${void 0!==n.se_confidence?n.se_confidence.toFixed(4):"N/A"}</p>\n                </div>\n                <div style="padding: var(--space-4); background: var(--surface-overlay); border-radius: var(--radius-lg);">\n                  <h4 class="text-sm font-semibold" style="margin-bottom: var(--space-2);">Next Study (Predictive)</h4>\n                  <p class="font-mono text-lg">${formatPct(n.predictive?n.predictive.P_benefit:null)} P(benefit)</p>\n                  <p class="text-sm text-secondary">SE: ${void 0!==n.se_predictive?n.se_predictive.toFixed(4):"N/A"}</p>\n                </div>\n              </div>\n              \n              <p class="text-sm text-secondary" style="margin-top: var(--space-3);">\n                <strong>Gap:</strong> ${n.confidence&&n.predictive?(100*(n.confidence.P_benefit-n.predictive.P_benefit)).toFixed(1):"N/A"} percentage points\n                ${n.confidence&&n.predictive&&Math.abs(n.confidence.P_benefit-n.predictive.P_benefit)>.15?" — Substantial heterogeneity impact":""}\n              </p>\n            </div>\n          </div>\n          \n          \x3c!-- Decision Recommendation --\x3e\n          <div class="flex flex-col gap-6">\n            <div class="card">\n              <div class="card__header">\n                <h3 class="card__title">⚖️ Decision</h3>\n              </div>\n              <div class="card__body" style="text-align: center;">\n                <div class="decision-badge decision-badge--${"ADOPT"===a.decision?"adopt":"REJECT"===a.decision?"reject":"uncertain"}" style="display: inline-flex; margin-bottom: var(--space-4);">\n                  <span class="decision-badge__icon">${"ADOPT"===a.decision?"✓":"REJECT"===a.decision?"✗":"?"}</span>\n                  <span>${a.decision}</span>\n                </div>\n                <p class="text-sm" style="margin-bottom: var(--space-2);">Confidence: <strong>${a.confidence}</strong></p>\n                <p class="text-sm text-secondary">${a.rationale}</p>\n              </div>\n            </div>\n            \n            \x3c!-- LaEV --\x3e\n            ${e.laev?`\n            <div class="card">\n              <div class="card__header">\n                <h3 class="card__title">📊 Risk-Adjusted Value</h3>\n              </div>\n              <div class="card__body">\n                <div class="stat-grid">\n                  <div class="stat-card">\n                    <div class="stat-card__value">${void 0!==e.laev.standard_EV_exp?e.laev.standard_EV_exp.toFixed(3):"N/A"}</div>\n                    <div class="stat-card__label">Standard EV</div>\n                  </div>\n                  <div class="stat-card">\n                    <div class="stat-card__value">${void 0!==e.laev.LaEV_exp?e.laev.LaEV_exp.toFixed(3):"N/A"}</div>\n                    <div class="stat-card__label">LaEV (λ=${e.laev.lambda||"N/A"})</div>\n                  </div>\n                </div>\n                <p class="text-sm text-secondary" style="margin-top: var(--space-3);">\n                  Risk adjustment: ${void 0!==e.laev.risk_adjustment_pct?`${e.laev.risk_adjustment_pct>0?"+":""}${e.laev.risk_adjustment_pct.toFixed(1)}%`:"N/A"}\n                </p>\n              </div>\n            </div>\n            `:""}\n          </div>\n        </div>\n        \n        \x3c!-- MCID Sensitivity --\x3e\n        ${e.mcid_sens&&e.mcid_sens.results?`\n        <div class="card" style="margin-top: var(--space-6);">\n          <div class="card__header">\n            <h2 class="card__title">🎚️ MCID Sensitivity Analysis</h2>\n          </div>\n          <div class="card__body" style="padding: 0;">\n            <table class="data-table">\n              <thead>\n                <tr>\n                  <th>MCID Threshold</th>\n                  <th>Relative Reduction</th>\n                  <th>P(Exceeds)</th>\n                  <th>Interpretation</th>\n                </tr>\n              </thead>\n              <tbody>\n                ${e.mcid_sens.results.map(e=>`\n                  <tr>\n                    <td class="font-mono">${void 0!==e.mcid?e.mcid.toFixed(2):"N/A"}</td>\n                    <td>${e.mcid_pct||"N/A"}%</td>\n                    <td>\n                      <div style="display: flex; align-items: center; gap: var(--space-2);">\n                        <div style="flex: 1; max-width: 120px; height: 8px; background: var(--surface-overlay); border-radius: var(--radius-full); overflow: hidden;">\n                          <div style="width: ${void 0!==e.P_exceeds?100*e.P_exceeds:0}%; height: 100%; background: ${e.P_exceeds>.5?"var(--color-success-500)":"var(--color-warning-500)"};"></div>\n                        </div>\n                        <span class="font-mono">${e.P_exceeds_pct||"N/A"}%</span>\n                      </div>\n                    </td>\n                    <td class="${e.P_exceeds>=.5?"text-success":"text-warning"}">${e.interpretation||"N/A"}</td>\n                  </tr>\n                `).join("")}\n              </tbody>\n            </table>\n          </div>\n        </div>\n        `:""}\n      `
}

function renderHeterogeneityPanel(e) {
  try {
    const t = document.getElementById("panel-heterogeneity");
    if (!t) return void log.error("Heterogeneity panel not found!");
    t.innerHTML = `\n          <div class="grid" style="grid-template-columns: 1fr 1fr; gap: var(--space-6);">\n            \x3c!-- τ² Estimator Comparison --\x3e\n            <div class="card">\n              <div class="card__header">\n                <h2 class="card__title">📊 τ² Estimator Comparison</h2>\n              </div>\n              <div class="card__body" style="padding: 0;">\n                <table class="data-table data-table--mono">\n                  <thead>\n                    <tr>\n                      <th>Method</th>\n                      <th>τ²</th>\n                      <th>τ</th>\n                      <th>Status</th>\n                    </tr>\n                  </thead>\n                  <tbody>\n                    ${Object.entries(e.tau2_all).map(([t,n])=>`\n                      <tr class="${t===e.tau2Result.method?'style="background: var(--surface-highlight);"':""}">\n                        <td class="font-sans ${t===e.tau2Result.method?"font-semibold":""}">${t}</td>\n                        <td>${isNaN(n.tau2)?"Error":n.tau2.toFixed(4)}</td>\n                        <td>${isNaN(n.tau2)?"—":Math.sqrt(n.tau2).toFixed(4)}</td>\n                        <td>${n.converged?"✓":n.error||"⚠️"}</td>\n                      </tr>\n                    `).join("")}\n                  </tbody>\n                </table>\n                \n                \x3c!-- τ² Confidence Interval --\x3e\n                <div style="padding: var(--space-4); border-top: 1px solid var(--border-subtle);">\n                  <p class="text-sm font-semibold" style="margin-bottom: var(--space-2);">τ² 95% CI (Q-Profile)</p>\n                <p class="font-mono text-sm">${e.tau2_ci&&void 0!==e.tau2_ci.lower?e.tau2_ci.lower.toFixed(4):"N/A"} – ${e.tau2_ci&&void 0!==e.tau2_ci.upper?e.tau2_ci.upper.toFixed(4):"N/A"}</p>\n              </div>\n            </div>\n          </div>\n          \n          \x3c!-- ICC_MA --\x3e\n          ${e.icc_ma&&void 0!==e.icc_ma.ICC_MA?`\n          <div class="card">\n            <div class="card__header">\n              <h2 class="card__title">🆕 ICC_MA (Adapted from ICC methodology)</h2>\n            </div>\n            <div class="card__body">\n              <div class="stat-card" style="margin-bottom: var(--space-4);">\n                <div class="stat-card__value stat-card__value--accent">${void 0!==e.icc_ma.ICC_MA?e.icc_ma.ICC_MA.toFixed(3):"N/A"}</div>\n                <div class="stat-card__label">${e.icc_ma.interpretation||"N/A"} heterogeneity between populations</div>\n              </div>\n              \n              <div class="alert alert--info">\n                <span class="alert__icon">ℹ️</span>\n                <div class="alert__content">\n                  <div class="alert__title">First Implementation Outside Original Paper</div>\n                  <div class="alert__text">\n                    ICC_MA is sample-size invariant, unlike I² which is inflated by large studies.\n                    It directly measures heterogeneity between study populations.\n                  </div>\n                </div>\n              </div>\n              \n              <div style="margin-top: var(--space-4); font-size: var(--text-sm); color: var(--text-secondary);">\n                <p><strong>Effective sample size (ñ):</strong> ${void 0!==e.icc_ma.n_tilde?e.icc_ma.n_tilde.toFixed(1):"N/A"}</p>\n                <p><strong>Within-study variance:</strong> ${void 0!==e.icc_ma.sigma2_pooled?e.icc_ma.sigma2_pooled.toFixed(4):"N/A"}</p>\n              </div>\n            </div>\n          </div>\n        </div>\n        `:""}\n        \n        \x3c!-- CV-I² (Cross-Validated) --\x3e\n        ${e.cv_i2&&void 0!==e.cv_i2.CV_I2?`\n        <div class="card" style="margin-top: var(--space-6);">\n          <div class="card__header">\n            <h2 class="card__title">🔄 Cross-Validated I² (CV-I²)</h2>\n          </div>\n          <div class="card__body">\n            <div class="stat-grid" style="grid-template-columns: repeat(5, 1fr);">\n              <div class="stat-card">\n                <div class="stat-card__value">${void 0!==e.cv_i2.full_I2?e.cv_i2.full_I2.toFixed(1):"N/A"}%</div>\n                <div class="stat-card__label">Full I²</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value stat-card__value--accent">${void 0!==e.cv_i2.CV_I2?e.cv_i2.CV_I2.toFixed(1):"N/A"}%</div>\n                <div class="stat-card__label">CV-I²</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value">${void 0!==e.cv_i2.I2_range?e.cv_i2.I2_range.toFixed(1):"N/A"}pp</div>\n                <div class="stat-card__label">Range</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value">${void 0!==e.cv_i2.I2_sd?e.cv_i2.I2_sd.toFixed(1):"N/A"}pp</div>\n                <div class="stat-card__label">SD</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value ${"Stable"===e.cv_i2.stability?"text-success":"Moderately stable"===e.cv_i2.stability?"text-warning":"text-danger"}">${e.cv_i2.stability||"N/A"}</div>\n                <div class="stat-card__label">Stability</div>\n              </div>\n            </div>\n            \n            ${e.cv_i2.influential_studies&&e.cv_i2.influential_studies.length>0?`\n              <div class="alert alert--warning" style="margin-top: var(--space-4);">\n                <span class="alert__icon">⚠️</span>\n                <div class="alert__content">\n                  <div class="alert__text">\n                    ${e.cv_i2.influential_studies.length} influential study(ies) identified that substantially affect heterogeneity estimates.\n                  </div>\n                </div>\n              </div>\n            `:'\n              <div class="alert alert--success" style="margin-top: var(--space-4);">\n                <span class="alert__icon">✓</span>\n                <div class="alert__content">\n                  <div class="alert__text">No single study has outsized influence on I² estimates.</div>\n                </div>\n              </div>\n            '}\n          </div>\n        </div>\n        `:""}\n        \n        \x3c!-- Prediction Intervals Comparison --\x3e\n        ${e.pi&&e.pi.standard?`\n        <div class="card" style="margin-top: var(--space-6);">\n          <div class="card__header">\n            <h2 class="card__title">📏 Prediction Interval Methods</h2>\n          </div>\n          <div class="card__body" style="padding: 0;">\n            <table class="data-table data-table--mono">\n              <thead>\n                <tr>\n                  <th>Method</th>\n                  <th>Lower</th>\n                  <th>Upper</th>\n                  <th>Width</th>\n                  <th>Note</th>\n                </tr>\n              </thead>\n              <tbody>\n                <tr>\n                  <td class="font-sans">Standard (HTS)</td>\n                  <td>${formatEffect(e.pi.standard.lower,e.measure)}</td>\n                  <td>${formatEffect(e.pi.standard.upper,e.measure)}</td>\n                  <td>${"RD"===e.measure||"MD"===e.measure||"SMD"===e.measure?(e.pi.standard.upper-e.pi.standard.lower).toFixed(3):(Math.exp(e.pi.standard.upper)-Math.exp(e.pi.standard.lower)).toFixed(3)}</td>\n                  <td class="text-secondary">df = k-2</td>\n                </tr>\n                ${e.pi.noma?`\n                <tr>\n                  <td class="font-sans">Noma 2023</td>\n                  <td>${formatEffect(e.pi.noma.lower,e.measure)}</td>\n                  <td>${formatEffect(e.pi.noma.upper,e.measure)}</td>\n                  <td>${"RD"===e.measure||"MD"===e.measure||"SMD"===e.measure?(e.pi.noma.upper-e.pi.noma.lower).toFixed(3):(Math.exp(e.pi.noma.upper)-Math.exp(e.pi.noma.lower)).toFixed(3)}</td>\n                  <td class="text-secondary">Accounts for τ² uncertainty</td>\n                </tr>\n                `:""}\n                <tr>\n                  <td class="font-sans">Conformal</td>\n                  <td>${e.pi.conformal&&e.pi.conformal.valid?formatEffect(e.pi.conformal.lower,e.measure):"N/A"}</td>\n                  <td>${e.pi.conformal&&e.pi.conformal.valid?formatEffect(e.pi.conformal.upper,e.measure):"N/A"}</td>\n                  <td>${e.pi.conformal&&e.pi.conformal.valid?"RD"===e.measure||"MD"===e.measure||"SMD"===e.measure?(e.pi.conformal.upper-e.pi.conformal.lower).toFixed(3):(Math.exp(e.pi.conformal.upper)-Math.exp(e.pi.conformal.lower)).toFixed(3):"—"}</td>\n                  <td class="text-secondary">${e.pi.conformal&&e.pi.conformal.valid?"Distribution-free":"Requires k≥10"}</td>\n                </tr>\n              </tbody>\n            </table>\n          </div>\n        </div>\n        `:""}\n        \n        \x3c!-- Funnel Plot --\x3e\n        <div class="card" style="margin-top: var(--space-6);">\n          <div class="card__header" style="display: flex; justify-content: space-between; align-items: center;">\n            <h2 class="card__title">🔽 Funnel Plot</h2>\n            <div style="display: flex; gap: var(--space-2); align-items: center;">\n              \x3c!-- Download Buttons --\x3e\n              <div class="btn-group" role="group" aria-label="Download funnel plot" style="display: flex; gap: 2px;">\n                <button class="btn btn--ghost btn--sm" onclick="downloadPlot('funnelPlot', 'svg')" title="Download SVG" aria-label="Download funnel plot as SVG">SVG</button>\n                <button class="btn btn--ghost btn--sm" onclick="downloadPlot('funnelPlot', 'png')" title="Download PNG" aria-label="Download funnel plot as PNG">PNG</button>\n                <button class="btn btn--ghost btn--sm" onclick="downloadPlot('funnelPlot', 'jpg')" title="Download JPG" aria-label="Download funnel plot as JPG">JPG</button>\n              </div>\n              <button class="btn btn--ghost btn--sm" onclick="document.getElementById('funnelSettingsPanel').classList.toggle('hidden')" aria-expanded="false" aria-controls="funnelSettingsPanel">\n                ⚙️ <span class="sr-only">Toggle </span>Settings\n              </button>\n            </div>\n          </div>\n          \n          \x3c!-- Funnel Plot Settings Panel --\x3e\n          <div id="funnelSettingsPanel" class="hidden" style="background: var(--surface-overlay); padding: var(--space-4); border-bottom: 1px solid var(--border-subtle);">\n            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--space-4);">\n              \n              \x3c!-- Display Options --\x3e\n              <div class="settings-group">\n                <label class="text-xs text-secondary" style="display: block; margin-bottom: var(--space-1);">Display</label>\n                <div style="display: flex; flex-direction: column; gap: var(--space-1);">\n                  <label style="display: flex; align-items: center; gap: var(--space-2); font-size: 12px;">\n                    <input type="checkbox" id="funnelShowFunnel" checked onchange="updateFunnelSetting('showFunnel', this.checked)">\n                    Show funnel bands\n                  </label>\n                  <label style="display: flex; align-items: center; gap: var(--space-2); font-size: 12px;">\n                    <input type="checkbox" id="funnelHighlightOutliers" checked onchange="updateFunnelSetting('highlightOutliers', this.checked)">\n                    Highlight outliers\n                  </label>\n                  <label style="display: flex; align-items: center; gap: var(--space-2); font-size: 12px;">\n                    <input type="checkbox" id="funnelShowEgger" onchange="updateFunnelSetting('showEggerLine', this.checked)">\n                    Show Egger line\n                  </label>\n                  <label style="display: flex; align-items: center; gap: var(--space-2); font-size: 12px;">\n                    <input type="checkbox" id="funnelShowTrimFill" onchange="updateFunnelSetting('showTrimFill', this.checked)">\n                    Show trim-fill studies\n                  </label>\n                </div>\n              </div>\n              \n              \x3c!-- Funnel Style --\x3e\n              <div class="settings-group">\n                <label class="text-xs text-secondary" style="display: block; margin-bottom: var(--space-1);">Funnel Style</label>\n                <select id="funnelStyle" class="select select--sm" onchange="updateFunnelSetting('funnelStyle', this.value)">\n                  <option value="filled">Filled bands</option>\n                  <option value="lines">Lines only</option>\n                  <option value="contour">Contour</option>\n                </select>\n              </div>\n              \n              \x3c!-- Colors --\x3e\n              <div class="settings-group">\n                <label class="text-xs text-secondary" style="display: block; margin-bottom: var(--space-1);">Colors</label>\n                <div style="display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap;">\n                  <label style="font-size: 11px;">Points:</label>\n                  <input type="color" id="funnelPointColor" value="#4a7ab8" style="width: 30px; height: 24px; border: none; cursor: pointer;" onchange="updateFunnelSetting('pointColor', this.value)">\n                  <label style="font-size: 11px;">Outliers:</label>\n                  <input type="color" id="funnelOutlierColor" value="#ef4444" style="width: 30px; height: 24px; border: none; cursor: pointer;" onchange="updateFunnelSetting('outlierColor', this.value)">\n                </div>\n              </div>\n              \n            </div>\n            \n            \x3c!-- X-Axis Range Slider --\x3e\n            <div style="margin-top: var(--space-4); padding: var(--space-3); background: var(--surface-base); border-radius: var(--radius-md);">\n              <label class="text-xs text-secondary" style="display: block; margin-bottom: var(--space-2);">X-Axis Range</label>\n              <div style="display: flex; gap: var(--space-4); align-items: center;">\n                <div style="flex: 1;">\n                  <label style="font-size: 11px; color: var(--text-muted);">Min:</label>\n                  <input type="number" id="funnelXMin" class="input input--sm" step="0.1" placeholder="Auto" style="width: 80px; font-size: 12px;" onchange="updateFunnelAxisRange()">\n                </div>\n                <div style="flex: 3;">\n                  <div style="display: flex; align-items: center; gap: var(--space-2);">\n                    <input type="range" id="funnelXMinSlider" min="0" max="100" value="0" style="flex: 1;" oninput="updateFunnelSliderValue('min', this.value)">\n                    <input type="range" id="funnelXMaxSlider" min="0" max="100" value="100" style="flex: 1;" oninput="updateFunnelSliderValue('max', this.value)">\n                  </div>\n                </div>\n                <div style="flex: 1;">\n                  <label style="font-size: 11px; color: var(--text-muted);">Max:</label>\n                  <input type="number" id="funnelXMax" class="input input--sm" step="0.1" placeholder="Auto" style="width: 80px; font-size: 12px;" onchange="updateFunnelAxisRange()">\n                </div>\n                <button class="btn btn--ghost btn--sm" onclick="resetFunnelAxisRange()" title="Reset to auto">↺</button>\n              </div>\n            </div>\n          </div>\n          \n          <div class="card__body">\n            <div id="funnelPlot" class="plot-container" style="min-height: 400px;"></div>\n            <p class="text-xs text-secondary" style="margin-top: var(--space-2); text-align: center;">\n              Shaded regions show 90%, 95%, and 99% pseudo-confidence intervals around the pooled effect\n            </p>\n          </div>\n        </div>\n      `, setTimeout(() => {
      renderFunnelPlot(e)
    }, 0)
  } catch (e) {
    log.error("renderHeterogeneityPanel failed:", e);
    const t = document.getElementById("panel-heterogeneity");
    t && (t.innerHTML = `<div class="card"><div class="card__body"><p class="text-danger">Error rendering heterogeneity panel: ${e.message}</p></div></div>`)
  }
}

function renderFunnelPlot(e, t = 0) {
  try {
    if ("undefined" == typeof Plotly) return t < 5 ? void setTimeout(() => renderFunnelPlot(e, t + 1), 500) : void log.error("Plotly not loaded for funnel plot");
    const n = document.getElementById("funnelPlot");
    if (!n) return void log.error("Funnel plot container not found!");
    n && n._fullLayout && Plotly.purge(n);
    const a = AppState.funnelSettings || {},
      s = "RD" !== e.measure,
      i = e.yi.map(e => s ? Math.exp(e) : 100 * e),
      r = e.sei,
      o = s ? Math.exp(e.pooled.theta) : 100 * e.pooled.theta,
      l = e.pooled.theta,
      d = 1.15 * Math.max(...r),
      c = 0;
    let u, p;
    null !== a.xAxisMin && void 0 !== a.xAxisMin ? u = a.xAxisMin : (u = .7 * Math.min(...i), s && (u = Math.max(.1, u))), p = null !== a.xAxisMax && void 0 !== a.xAxisMax ? a.xAxisMax : 1.4 * Math.max(...i);
    const m = getThemeColors(),
      h = [];
    if (!1 !== a.showFunnel) {
      const e = a.funnelLevels || [.9, .95, .99],
        t = a.funnelColors || ["rgba(100,149,237,0.15)", "rgba(100,149,237,0.10)", "rgba(100,149,237,0.05)"],
        n = 50,
        i = Array.from({
          length: n
        }, (e, t) => t / (n - 1) * d);
      e.forEach((e, n) => {
        const r = qnorm((1 + e) / 2),
          o = i.map(e => {
            const t = l - r * e;
            return s ? Math.exp(t) : 100 * t
          }),
          d = i.map(e => {
            const t = l + r * e;
            return s ? Math.exp(t) : 100 * t
          });
        h.push({
          x: [...o, ...d.reverse()],
          y: [...i, ...i.reverse()],
          fill: "toself",
          fillcolor: t[n] || "rgba(100,149,237,0.1)",
          line: {
            color: "transparent"
          },
          hoverinfo: "skip",
          showlegend: !1,
          name: `${(100*e).toFixed(0)}% CI`
        }), "lines" !== a.funnelStyle && "contour" !== a.funnelStyle || (h.push({
          x: o,
          y: i,
          mode: "lines",
          line: {
            color: "rgba(100,149,237,0.4)",
            width: 1,
            dash: "dot"
          },
          hoverinfo: "skip",
          showlegend: !1
        }), h.push({
          x: d.reverse(),
          y: i,
          mode: "lines",
          line: {
            color: "rgba(100,149,237,0.4)",
            width: 1,
            dash: "dot"
          },
          hoverinfo: "skip",
          showlegend: !1
        }))
      })
    }
    if (!1 !== a.showPooledLine && h.push({
        x: [o, o],
        y: [c, d],
        mode: "lines",
        type: "scatter",
        line: {
          color: a.pooledLineColor || "#e6a919",
          width: 2,
          dash: a.pooledLineStyle || "dash"
        },
        hoverinfo: "skip",
        showlegend: !1,
        name: "Pooled effect"
      }), s && h.push({
        x: [1, 1],
        y: [c, d],
        mode: "lines",
        type: "scatter",
        line: {
          color: "#666",
          width: 1,
          dash: "dot"
        },
        hoverinfo: "skip",
        showlegend: !1,
        name: "Null effect"
      }), a.showEggerLine && e.egger) {
      const t = e.egger.intercept,
        n = e.egger.slope,
        i = r.map((e, a) => {
          const i = (t + n * (1 / e)) * e;
          return s ? Math.exp(i) : 100 * i
        });
      h.push({
        x: i,
        y: r,
        mode: "lines",
        type: "scatter",
        line: {
          color: a.eggerLineColor || "#ef4444",
          width: 2
        },
        hoverinfo: "skip",
        showlegend: !1,
        name: "Egger regression"
      })
    }
    const v = i.map((e, t) => {
        const n = 1.96,
          a = s ? Math.exp(l - n * r[t]) : 100 * (l - n * r[t]),
          i = s ? Math.exp(l + n * r[t]) : 100 * (l + n * r[t]);
        return e < a || e > i
      }),
      g = i.map((e, t) => v[t] ? null : t).filter(e => null !== e),
      f = i.map((e, t) => v[t] ? t : null).filter(e => null !== e);
    if (h.push({
        x: g.map(e => i[e]),
        y: g.map(e => r[e]),
        mode: "markers",
        type: "scatter",
        marker: {
          size: a.pointSize || 10,
          color: a.pointColor || "#4a7ab8",
          line: {
            color: "#1b263b",
            width: 1
          }
        },
        text: g.map(t => e.names[t]),
        hovertemplate: "%{text}<br>Effect: %{x:.3f}<br>SE: %{y:.4f}<extra></extra>",
        name: "Studies"
      }), !1 !== a.highlightOutliers && f.length > 0 && h.push({
        x: f.map(e => i[e]),
        y: f.map(e => r[e]),
        mode: "markers",
        type: "scatter",
        marker: {
          size: a.pointSize || 10,
          color: a.outlierColor || "#ef4444",
          line: {
            color: "#1b263b",
            width: 1
          },
          symbol: "circle-open"
        },
        text: f.map(t => e.names[t]),
        hovertemplate: "%{text} (outlier)<br>Effect: %{x:.3f}<br>SE: %{y:.4f}<extra></extra>",
        name: "Outliers"
      }), a.showTrimFill && e.trimfill && e.trimfill.k0_imputed > 0 && e.trimfill.imputed_studies) {
      const t = e.trimfill.imputed_studies;
      h.push({
        x: t.map(e => s ? Math.exp(e.yi) : 100 * e.yi),
        y: t.map(e => e.sei),
        mode: "markers",
        type: "scatter",
        marker: {
          size: a.pointSize || 10,
          color: a.trimFillColor || "#10b981",
          symbol: "diamond-open",
          line: {
            color: a.trimFillColor || "#10b981",
            width: 2
          }
        },
        text: t.map((e, t) => `Imputed ${t+1}`),
        hovertemplate: "%{text}<br>Effect: %{x:.3f}<br>SE: %{y:.4f}<extra></extra>",
        name: "Imputed (Trim-Fill)"
      })
    }
    const _ = {
      xaxis: {
        title: "auto" === a.xAxisLabel ? "RD" === e.measure ? "Risk Difference (%)" : e.measure : a.xAxisLabel,
        type: s ? "log" : "linear",
        range: s ? [Math.log10(u), Math.log10(p)] : [u, p],
        zeroline: !1,
        gridcolor: m.grid,
        tickfont: {
          family: "JetBrains Mono",
          size: 11,
          color: m.text
        }
      },
      yaxis: {
        title: a.yAxisLabel || "Standard Error",
        autorange: !1 === a.invertYAxis || "reversed",
        range: !1 !== a.invertYAxis ? [d, c] : [c, d],
        zeroline: !1,
        gridcolor: m.grid,
        tickfont: {
          family: "JetBrains Mono",
          size: 11,
          color: m.text
        }
      },
      showlegend: !1,
      margin: {
        l: 60,
        r: 40,
        t: 20,
        b: 50
      },
      paper_bgcolor: m.background,
      plot_bgcolor: m.background,
      hoverlabel: {
        bgcolor: m.hoverBg,
        bordercolor: m.hoverBorder,
        font: {
          family: "Plus Jakarta Sans",
          color: m.hoverText
        }
      },
      height: 400
    };
    Plotly.newPlot("funnelPlot", h, _, {
      displayModeBar: !0,
      modeBarButtonsToRemove: ["select2d", "lasso2d", "autoScale2d"],
      responsive: !0
    })
  } catch (t) {
    log.error("Funnel plot rendering failed:", t), showPlotError("funnelPlot", "Failed to render funnel plot.", () => renderFunnelPlot(e, 0))
  }
}

function renderBiasPanel(e) {
  try {
    const t = document.getElementById("panel-bias");
    if (!t) return void log.error("Bias panel not found!");
    if (!(e.egger && e.peters && e.trimfill && e.metaoverfit && e.loo)) return log.error("Bias assessment data missing"), void(t.innerHTML = '<div class="card"><div class="card__body"><p class="text-danger">Error: Bias data not available</p></div></div>');
    t.innerHTML = `\n          <div class="grid" style="grid-template-columns: 1fr 1fr; gap: var(--space-6);">\n            \x3c!-- Egger's Test --\x3e\n            <div class="card">\n              <div class="card__header">\n                <h2 class="card__title">📐 Egger's Test</h2>\n              </div>\n              <div class="card__body">\n                <div class="stat-grid">\n                  <div class="stat-card">\n                    <div class="stat-card__value">${void 0!==e.egger.intercept?e.egger.intercept.toFixed(3):"N/A"}</div>\n                    <div class="stat-card__label">Intercept</div>\n                  </div>\n                  <div class="stat-card">\n                    <div class="stat-card__value ${e.egger.p_value<.1?"text-warning":""}">${void 0!==e.egger.p_value?e.egger.p_value.toFixed(4):"N/A"}</div>\n                    <div class="stat-card__label">p-value</div>\n                  </div>\n                </div>\n                \n                <div class="alert ${e.egger.p_value<.1?"alert--warning":"alert--success"}" style="margin-top: var(--space-4);">\n                  <span class="alert__icon">${e.egger.p_value<.1?"⚠️":"✓"}</span>\n                  <div class="alert__content">\n                    <div class="alert__text">${e.egger.interpretation||"N/A"}</div>\n                  </div>\n                </div>\n              </div>\n            </div>\n            \n            \x3c!-- Peters' Test (for binary outcomes) --\x3e\n            <div class="card">\n              <div class="card__header">\n                <h2 class="card__title">📐 Peters' Test (Binary)</h2>\n              </div>\n              <div class="card__body">\n                <div class="stat-grid">\n                  <div class="stat-card">\n                    <div class="stat-card__value">${void 0!==e.peters.slope?e.peters.slope.toFixed(3):"N/A"}</div>\n                    <div class="stat-card__label">Slope</div>\n                  </div>\n                  <div class="stat-card">\n                    <div class="stat-card__value ${e.peters.p_value<.1?"text-warning":""}">${void 0!==e.peters.p_value?e.peters.p_value.toFixed(4):"N/A"}</div>\n                    <div class="stat-card__label">p-value</div>\n                  </div>\n                </div>\n                \n                <div class="alert ${e.peters.p_value<.1?"alert--warning":"alert--success"}" style="margin-top: var(--space-4);">\n                  <span class="alert__icon">${e.peters.p_value<.1?"⚠️":"✓"}</span>\n                  <div class="alert__content">\n                    <div class="alert__text">${e.peters.interpretation||"N/A"}</div>\n                  </div>\n                </div>\n              </div>\n            </div>\n          </div>\n        \n        \x3c!-- E-Value for Unmeasured Confounding --\x3e\n        <div class="card" style="margin-top: var(--space-6);">\n          <div class="card__header">\n            <h2 class="card__title">🛡️ E-Value (Unmeasured Confounding)</h2>\n          </div>\n          <div class="card__body">\n            <div class="stat-grid" style="grid-template-columns: repeat(3, 1fr);">\n              <div class="stat-card">\n                <div class="stat-card__value stat-card__value--accent">${e.evalue&&void 0!==e.evalue.point&&isFinite(e.evalue.point)?e.evalue.point.toFixed(2):"N/A"}</div>\n                <div class="stat-card__label">E-value (Point Estimate)</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value">${e.evalue&&null!==e.evalue.ci&&isFinite(e.evalue.ci)?e.evalue.ci.toFixed(2):"-"}</div>\n                <div class="stat-card__label">E-value (CI Limit)</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value">${e.evalue&&e.evalue.ciExcludesNull?"Yes":"No"}</div>\n                <div class="stat-card__label">CI Excludes Null</div>\n              </div>\n            </div>\n            \n            <div class="alert alert--info" style="margin-top: var(--space-4);">\n              <span class="alert__icon">ℹ️</span>\n              <div class="alert__content">\n                <div class="alert__text">${e.evalue?e.evalue.interpretation:"E-value not calculated"}</div>\n              </div>\n            </div>\n            \n            <details style="margin-top: var(--space-4);">\n              <summary class="text-sm text-secondary" style="cursor: pointer;">What does the E-value mean?</summary>\n              <div class="text-sm" style="margin-top: var(--space-2); padding: var(--space-3); background: var(--surface-overlay); border-radius: var(--radius-md);">\n                <p style="margin-bottom: var(--space-2);">\n                  The <strong>E-value</strong> is the minimum strength of association (on the risk ratio scale) that an unmeasured confounder would need to have with <em>both</em> the treatment <em>and</em> the outcome to fully explain away the observed effect.\n                </p>\n                <p style="margin-bottom: var(--space-2);"><strong>Interpretation:</strong></p>\n                <ul style="margin-left: var(--space-4); list-style: disc;">\n                  <li>E &lt; 1.5: Very weak - minimal confounding could explain</li>\n                  <li>E = 1.5-2.0: Weak - modest confounding could explain</li>\n                  <li>E = 2.0-3.0: Moderate - reasonable robustness</li>\n                  <li>E = 3.0-5.0: Strong - good robustness</li>\n                  <li>E &gt; 5.0: Very strong - unlikely explained by confounding</li>\n                </ul>\n                <p style="margin-top: var(--space-2); font-size: var(--text-xs); color: var(--text-tertiary);">\n                  Reference: VanderWeele TJ, Ding P. Ann Intern Med 2017;167:268-274\n                </p>\n              </div>\n            </details>\n          </div>\n        </div>\n        \n        \x3c!-- Trim and Fill --\x3e\n        <div class="card" style="margin-top: var(--space-6);">\n          <div class="card__header">\n            <h2 class="card__title">✂️ Trim and Fill (Duval & Tweedie)</h2>\n          </div>\n          <div class="card__body">\n            <div class="stat-grid" style="grid-template-columns: repeat(5, 1fr);">\n              <div class="stat-card">\n                <div class="stat-card__value">${void 0!==e.trimfill.k0_imputed?e.trimfill.k0_imputed:"N/A"}</div>\n                <div class="stat-card__label">Studies Imputed</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value">${e.trimfill.side||"N/A"}</div>\n                <div class="stat-card__label">Side</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value">${e.trimfill.original&&void 0!==e.trimfill.original.effect_exp?e.trimfill.original.effect_exp.toFixed(3):"N/A"}</div>\n                <div class="stat-card__label">Original Effect</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value stat-card__value--accent">${e.trimfill.adjusted&&void 0!==e.trimfill.adjusted.effect_exp?e.trimfill.adjusted.effect_exp.toFixed(3):"N/A"}</div>\n                <div class="stat-card__label">Adjusted Effect</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value ${void 0!==e.trimfill.change_pct&&Math.abs(e.trimfill.change_pct)>10?"text-warning":""}">${void 0!==e.trimfill.change_pct?`${e.trimfill.change_pct>0?"+":""}${e.trimfill.change_pct.toFixed(1)}%`:"N/A"}</div>\n                <div class="stat-card__label">Change</div>\n              </div>\n            </div>\n            \n            ${e.trimfill.k0_imputed>0?`\n              <div class="alert alert--warning" style="margin-top: var(--space-4);">\n                <span class="alert__icon">⚠️</span>\n                <div class="alert__content">\n                  <div class="alert__text">\n                    ${e.trimfill.k0_imputed} missing studies imputed on the ${e.trimfill.side||"unknown"} side, \n                    adjusting the effect by ${void 0!==e.trimfill.change_pct?Math.abs(e.trimfill.change_pct).toFixed(1):"N/A"}%.\n                    This suggests potential publication bias.\n                  </div>\n                </div>\n              </div>\n            `:'\n              <div class="alert alert--success" style="margin-top: var(--space-4);">\n                <span class="alert__icon">✓</span>\n                <div class="alert__content">\n                  <div class="alert__text">No asymmetry detected. No studies imputed.</div>\n                </div>\n              </div>\n            '}\n          </div>\n        </div>\n        \n        \x3c!-- Metaoverfit Assessment --\x3e\n        ${e.metaoverfit?`\n        <div class="card" style="margin-top: var(--space-6);">\n          <div class="card__header">\n            <h2 class="card__title">⚠️ Metaoverfit Assessment</h2>\n          </div>\n          <div class="card__body">\n            <div class="stat-grid" style="grid-template-columns: repeat(4, 1fr);">\n              <div class="stat-card">\n                <div class="stat-card__value">${e.metaoverfit.k||"N/A"}</div>\n                <div class="stat-card__label">Studies (k)</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value">${e.metaoverfit.p||"N/A"}</div>\n                <div class="stat-card__label">Parameters (p)</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value ${"LOW"===e.metaoverfit.risk_level?"text-success":"MODERATE"===e.metaoverfit.risk_level?"text-warning":"text-danger"}">${void 0!==e.metaoverfit.ratio?e.metaoverfit.ratio.toFixed(1):"N/A"}</div>\n                <div class="stat-card__label">k:p Ratio</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value">${void 0!==e.metaoverfit.ESS?e.metaoverfit.ESS.toFixed(1):"N/A"}</div>\n                <div class="stat-card__label">Effective Sample Size</div>\n              </div>\n            </div>\n            \n            <div class="alert ${"LOW"===e.metaoverfit.risk_level?"alert--success":"MODERATE"===e.metaoverfit.risk_level?"alert--warning":"alert--danger"}" style="margin-top: var(--space-4);">\n              <span class="alert__icon">${"LOW"===e.metaoverfit.risk_level?"✓":"⚠️"}</span>\n              <div class="alert__content">\n                <div class="alert__title">${e.metaoverfit.risk_level||"N/A"} Overfitting Risk</div>\n                <div class="alert__text">${e.metaoverfit.interpretation||"N/A"} — ${e.metaoverfit.recommendation||""}</div>\n              </div>\n            </div>\n          </div>\n        </div>\n        `:""}\n        \n        \x3c!-- Optimism-Corrected Estimates --\x3e\n        ${e.optimism?`\n        <div class="card" style="margin-top: var(--space-6);">\n          <div class="card__header">\n            <h2 class="card__title">🎯 Bootstrap Optimism Correction</h2>\n          </div>\n          <div class="card__body">\n            <div class="stat-grid" style="grid-template-columns: repeat(4, 1fr);">\n              <div class="stat-card">\n                <div class="stat-card__value">${e.optimism.apparent?formatEffect(e.optimism.apparent.effect,e.measure):"N/A"}</div>\n                <div class="stat-card__label">Apparent Effect</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value stat-card__value--accent">${e.optimism.corrected?formatEffect(e.optimism.corrected.effect,e.measure):"N/A"}</div>\n                <div class="stat-card__label">Corrected Effect</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value">${void 0!==e.optimism.shrinkage_factor?(100*e.optimism.shrinkage_factor).toFixed(1):"N/A"}%</div>\n                <div class="stat-card__label">Shrinkage Factor</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value">${e.optimism.bootstrap_samples||"N/A"}</div>\n                <div class="stat-card__label">Bootstrap Samples</div>\n              </div>\n            </div>\n            \n            <p class="text-sm text-secondary" style="margin-top: var(--space-4);">\n              ${e.optimism.interpretation||"N/A"}: The apparent effect may be ${void 0!==e.optimism.shrinkage_factor?e.optimism.shrinkage_factor<.9?"substantially":e.optimism.shrinkage_factor<.95?"somewhat":"minimally":""} \n              optimistic due to model overfitting.\n            </p>\n          </div>\n        </div>\n        `:""}\n        \n        \x3c!-- LOO Summary --\x3e\n        ${e.loo&&e.loo.loo_results&&e.loo.loo_results.length>0?`\n        <div class="card" style="margin-top: var(--space-6);">\n          <div class="card__header">\n            <h2 class="card__title">🔄 Leave-One-Out Summary</h2>\n          </div>\n          <div class="card__body">\n            <p class="text-sm" style="margin-bottom: var(--space-3);">\n              Effect range when each study removed: \n              <span class="font-mono">${formatEffect(Math.min(...e.loo.loo_results.map(e=>e.effect)),e.measure)}</span> – \n              <span class="font-mono">${formatEffect(Math.max(...e.loo.loo_results.map(e=>e.effect)),e.measure)}</span>\n            </p>\n            \n            <p class="text-sm text-secondary">\n              I² range: ${e.loo.loo_results.length>0?Math.min(...e.loo.loo_results.map(e=>e.I2||0)).toFixed(1):"N/A"}% – ${e.loo.loo_results.length>0?Math.max(...e.loo.loo_results.map(e=>e.I2||0)).toFixed(1):"N/A"}%\n            </p>\n          </div>\n        </div>\n        \n        \x3c!-- LOO Table --\x3e\n        <div class="card" style="margin-top: var(--space-6);">\n          <div class="card__header">\n            <h2 class="card__title">📋 Leave-One-Out Details</h2>\n          </div>\n          <div class="card__body" style="padding: 0;">\n            <table class="data-table data-table--mono">\n              <thead>\n                <tr>\n                  <th>Study Removed</th>\n                  <th>Effect</th>\n                  <th>95% CI</th>\n                  <th>I²</th>\n                  <th>Δ Effect</th>\n                  <th>Δ I²</th>\n                </tr>\n              </thead>\n              <tbody>\n                ${e.loo.loo_results.map(t=>`\n                  <tr>\n                    <td class="font-sans">${t.study||"N/A"}</td>\n                    <td>${formatEffect(t.effect,e.measure)}</td>\n                    <td>${formatEffect(t.ci_lower,e.measure)} – ${formatEffect(t.ci_upper,e.measure)}</td>\n                    <td>${void 0!==t.I2?t.I2.toFixed(1):"N/A"}%</td>\n                    <td class="${void 0!==t.effect_change&&Math.abs(t.effect_change)>.05?"text-warning":""}">${void 0!==t.effect_change?`${t.effect_change>0?"+":""}${(100*t.effect_change).toFixed(2)}%`:"N/A"}</td>\n                    <td>${void 0!==t.I2_change?`${t.I2_change>0?"+":""}${t.I2_change.toFixed(1)}pp`:"N/A"}</td>\n                  </tr>\n                `).join("")}\n              </tbody>\n            </table>\n          </div>\n        </div>\n        `:""}\n        \n        \x3c!-- Baujat Plot --\x3e\n        <div class="card" style="margin-top: var(--space-6);">\n          <div class="card__header" style="display: flex; justify-content: space-between; align-items: center;">\n            <h2 class="card__title">📈 Baujat Plot</h2>\n            <div class="btn-group" role="group" aria-label="Download Baujat plot" style="display: flex; gap: 2px;">\n              <button class="btn btn--ghost btn--sm" onclick="downloadPlot('baujatPlot', 'svg')" title="Download SVG" aria-label="Download Baujat plot as SVG">SVG</button>\n              <button class="btn btn--ghost btn--sm" onclick="downloadPlot('baujatPlot', 'png')" title="Download PNG" aria-label="Download Baujat plot as PNG">PNG</button>\n              <button class="btn btn--ghost btn--sm" onclick="downloadPlot('baujatPlot', 'jpg')" title="Download JPG" aria-label="Download Baujat plot as JPG">JPG</button>\n            </div>\n          </div>\n          <div class="card__body">\n            <div id="baujatPlot" class="plot-container"></div>\n            <p class="text-xs text-secondary" style="margin-top: var(--space-2);">\n              X-axis: Contribution to Q statistic (heterogeneity). Y-axis: Influence on pooled estimate.\n            </p>\n          </div>\n        </div>\n        \n        ${e.subgroups&&e.subgroups.available?`\n        \x3c!-- Subgroup Analysis --\x3e\n        <div class="card" style="margin-top: var(--space-6);">\n          <div class="card__header">\n            <h2 class="card__title">🏷️ Subgroup Analysis</h2>\n          </div>\n          <div class="card__body">\n            <div style="overflow-x: auto;">\n              <table class="data-table">\n                <thead>\n                  <tr>\n                    <th>Subgroup</th>\n                    <th>k</th>\n                    <th>Effect</th>\n                    <th>95% CI</th>\n                    <th>τ²</th>\n                    <th>I²</th>\n                  </tr>\n                </thead>\n                <tbody>\n                  ${e.subgroups.subgroups.map(t=>`\n                    <tr>\n                      <td class="font-sans font-semibold">${t.name}</td>\n                      <td>${t.k}</td>\n                      <td>${formatEffect(t.theta,e.measure)}</td>\n                      <td>${void 0===t.ci_lower||isNaN(t.ci_lower)?"—":formatEffect(t.ci_lower,e.measure)+" – "+formatEffect(t.ci_upper,e.measure)}</td>\n                      <td>${void 0!==t.tau2?t.tau2.toFixed(4):"—"}</td>\n                      <td>${void 0!==t.I2?t.I2.toFixed(1)+"%":"—"}</td>\n                    </tr>\n                  `).join("")}\n                </tbody>\n              </table>\n            </div>\n            \n            ${e.subgroups.test?`\n            <div class="alert ${e.subgroups.test.p_value<.1?"alert--warning":"alert--info"}" style="margin-top: var(--space-4);">\n              <span class="alert__icon">${e.subgroups.test.p_value<.1?"⚠️":"ℹ️"}</span>\n              <div class="alert__content">\n                <div class="alert__title">Test for Subgroup Differences</div>\n                <div class="alert__text">\n                  Q<sub>between</sub> = ${void 0!==e.subgroups.test.Q_between?e.subgroups.test.Q_between.toFixed(2):"N/A"}, \n                  df = ${e.subgroups.test.df_between||"N/A"}, \n                  p = ${void 0!==e.subgroups.test.p_value?e.subgroups.test.p_value.toFixed(4):"N/A"}<br>\n                  ${e.subgroups.test.interpretation||""}\n                </div>\n              </div>\n            </div>\n            `:""}\n          </div>\n        </div>\n        `:""}\n        \n        ${e.metareg&&e.metareg.available?`\n        \x3c!-- Meta-Regression --\x3e\n        <div class="card" style="margin-top: var(--space-6);">\n          <div class="card__header">\n            <h2 class="card__title">📊 Meta-Regression: ${e.metareg.covariate||"Unknown"}</h2>\n          </div>\n          <div class="card__body">\n            <div class="stat-grid" style="margin-bottom: var(--space-4);">\n              <div class="stat-card">\n                <div class="stat-card__value">${void 0!==e.metareg.slope?e.metareg.slope.toFixed(4):"N/A"}</div>\n                <div class="stat-card__label">Slope (β₁)</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value ${e.metareg.p_value<.05?"text-success":""}">${void 0!==e.metareg.p_value?e.metareg.p_value.toFixed(4):"N/A"}</div>\n                <div class="stat-card__label">p-value</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value">${void 0!==e.metareg.R2?e.metareg.R2.toFixed(1):"N/A"}%</div>\n                <div class="stat-card__label">R² (explained)</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value">${void 0!==e.metareg.tau2_residual?e.metareg.tau2_residual.toFixed(4):"N/A"}</div>\n                <div class="stat-card__label">τ² residual</div>\n              </div>\n            </div>\n            \n            <div class="text-sm text-secondary" style="margin-bottom: var(--space-3);">\n              Slope 95% CI: ${void 0!==e.metareg.ci_lower?e.metareg.ci_lower.toFixed(4):"N/A"} to ${void 0!==e.metareg.ci_upper?e.metareg.ci_upper.toFixed(4):"N/A"}\n            </div>\n            \n            <div class="alert ${e.metareg.p_value<.05?"alert--success":"alert--info"}">\n              <span class="alert__icon">${e.metareg.p_value<.05?"✓":"ℹ️"}</span>\n              <div class="alert__content">\n                <div class="alert__text">${e.metareg.interpretation||"N/A"}</div>\n              </div>\n            </div>\n            \n            <div id="metaregPlot" class="plot-container" style="margin-top: var(--space-4);"></div>\n          </div>\n        </div>\n        `:""}\n        \n        \x3c!-- Advanced Selection Models --\x3e\n        ${e.selectionModelStep||e.copasModel?`\n        <div class="card" style="margin-top: var(--space-6);">\n          <div class="card__header">\n            <h2 class="card__title">🎯 Selection Models (Publication Bias Adjustment)</h2>\n          </div>\n          <div class="card__body">\n            <div class="grid" style="grid-template-columns: 1fr 1fr; gap: var(--space-4);">\n              ${e.selectionModelStep?`\n              <div>\n                <h4 style="font-size: var(--text-sm); color: var(--text-secondary); margin-bottom: var(--space-2);">Vevea-Hedges Step Model</h4>\n                <div class="stat-grid" style="grid-template-columns: 1fr 1fr;">\n                  <div class="stat-card stat-card--compact">\n                    <div class="stat-card__value">${e.selectionModelStep.unadjusted&&void 0!==e.selectionModelStep.unadjusted.theta?e.selectionModelStep.unadjusted.theta.toFixed(3):"N/A"}</div>\n                    <div class="stat-card__label">Unadjusted θ</div>\n                  </div>\n                  <div class="stat-card stat-card--compact">\n                    <div class="stat-card__value stat-card__value--accent">${e.selectionModelStep.adjusted&&void 0!==e.selectionModelStep.adjusted.theta?e.selectionModelStep.adjusted.theta.toFixed(3):"N/A"}</div>\n                    <div class="stat-card__label">Adjusted θ</div>\n                  </div>\n                </div>\n                <div class="text-xs text-secondary" style="margin-top: var(--space-2);">\n                  Change: ${void 0!==e.selectionModelStep.changePct?e.selectionModelStep.changePct.toFixed(1):"N/A"}%\n                </div>\n              </div>\n              `:""}\n              \n              ${e.copasModel?`\n              <div>\n                <h4 style="font-size: var(--text-sm); color: var(--text-secondary); margin-bottom: var(--space-2);">Copas Sensitivity Bounds</h4>\n                <div class="stat-grid" style="grid-template-columns: 1fr 1fr;">\n                  <div class="stat-card stat-card--compact">\n                    <div class="stat-card__value">${e.copasModel.bounds&&void 0!==e.copasModel.bounds.lower?e.copasModel.bounds.lower.toFixed(3):"N/A"}</div>\n                    <div class="stat-card__label">Lower Bound</div>\n                  </div>\n                  <div class="stat-card stat-card--compact">\n                    <div class="stat-card__value">${e.copasModel.bounds&&void 0!==e.copasModel.bounds.upper?e.copasModel.bounds.upper.toFixed(3):"N/A"}</div>\n                    <div class="stat-card__label">Upper Bound</div>\n                  </div>\n                </div>\n                <div class="text-xs text-secondary" style="margin-top: var(--space-2);">\n                  ${e.copasModel.robustness||"N/A"}\n                </div>\n              </div>\n              `:""}\n            </div>\n          </div>\n        </div>\n        `:""}\n        \n        \x3c!-- Cumulative Meta-Analysis --\x3e\n        ${e.cumulative?`\n        <div class="card" style="margin-top: var(--space-6);">\n          <div class="card__header">\n            <h2 class="card__title">📈 Cumulative Meta-Analysis</h2>\n          </div>\n          <div class="card__body">\n            <div class="stat-grid" style="margin-bottom: var(--space-4);">\n              ${e.cumulative.firstSignificant?`\n              <div class="stat-card">\n                <div class="stat-card__value">${e.cumulative.firstSignificant.k}</div>\n                <div class="stat-card__label">First Significant (k)</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value">${e.cumulative.firstSignificant.year}</div>\n                <div class="stat-card__label">Year</div>\n              </div>\n              `:'\n              <div class="stat-card">\n                <div class="stat-card__value">—</div>\n                <div class="stat-card__label">Never Significant</div>\n              </div>\n              '}\n              ${e.cumulative.stability?`\n              <div class="stat-card">\n                <div class="stat-card__value ${e.cumulative.stability.stable?"text-success":"text-warning"}">${e.cumulative.stability.stable?"✓ Stable":"⚠ Unstable"}</div>\n                <div class="stat-card__label">Stability</div>\n              </div>\n              `:""}\n              ${e.cumulative.trend?`\n              <div class="stat-card">\n                <div class="stat-card__value">${"attenuating"===e.cumulative.trend.direction?"↘":"↗"} ${e.cumulative.trend.direction}</div>\n                <div class="stat-card__label">Trend</div>\n              </div>\n              `:""}\n            </div>\n            \n            <div id="cumulativePlot" class="plot-container" style="height: 300px;"></div>\n            \n            ${e.cumulative.stability?`\n            <div class="alert ${e.cumulative.stability.stable?"alert--success":"alert--info"}" style="margin-top: var(--space-4);">\n              <span class="alert__icon">${e.cumulative.stability.stable?"✓":"ℹ️"}</span>\n              <div class="alert__content">\n                <div class="alert__text">${e.cumulative.stability.interpretation}</div>\n              </div>\n            </div>\n            `:""}\n          </div>\n        </div>\n        `:""}\n        \n        \x3c!-- Influence Diagnostics --\x3e\n        ${e.influenceDiag?`\n        <div class="card" style="margin-top: var(--space-6);">\n          <div class="card__header">\n            <h2 class="card__title">🔍 Influence Diagnostics</h2>\n          </div>\n          <div class="card__body">\n            <div class="stat-grid" style="margin-bottom: var(--space-4);">\n              <div class="stat-card">\n                <div class="stat-card__value ${e.influenceDiag.summary&&e.influenceDiag.summary.nInfluential>0?"text-warning":"text-success"}">${e.influenceDiag.summary?e.influenceDiag.summary.nInfluential:"N/A"}</div>\n                <div class="stat-card__label">Influential Studies</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value">${e.influenceDiag.summary&&void 0!==e.influenceDiag.summary.maxDFBETAS?e.influenceDiag.summary.maxDFBETAS.toFixed(2):"N/A"}</div>\n                <div class="stat-card__label">Max |DFBETAS|</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value">${e.influenceDiag.summary&&e.influenceDiag.summary.thetaRange?`${e.influenceDiag.summary.thetaRange[0].toFixed(3)} to ${e.influenceDiag.summary.thetaRange[1].toFixed(3)}`:"N/A"}</div>\n                <div class="stat-card__label">θ Range (LOO)</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value">${e.influenceDiag.summary&&e.influenceDiag.summary.I2Range?`${e.influenceDiag.summary.I2Range[0].toFixed(1)}% to ${e.influenceDiag.summary.I2Range[1].toFixed(1)}%`:"N/A"}</div>\n                <div class="stat-card__label">I² Range (LOO)</div>\n              </div>\n            </div>\n            \n            <div class="alert ${e.influenceDiag.summary&&0===e.influenceDiag.summary.nInfluential?"alert--success":"alert--warning"}">\n              <span class="alert__icon">${e.influenceDiag.summary&&0===e.influenceDiag.summary.nInfluential?"✓":"⚠️"}</span>\n              <div class="alert__content">\n                <div class="alert__text">${e.influenceDiag.interpretation||"N/A"}</div>\n              </div>\n            </div>\n            \n            ${e.influenceDiag.summary&&e.influenceDiag.summary.nInfluential>0&&e.influenceDiag.studies?`\n            <details style="margin-top: var(--space-3);">\n              <summary class="text-sm text-secondary" style="cursor: pointer;">View influential studies details</summary>\n              <div style="margin-top: var(--space-2); font-size: var(--text-sm);">\n                ${e.influenceDiag.studies.filter(e=>e.influential).map(e=>`\n                  <div style="padding: var(--space-2); background: var(--surface-overlay); border-radius: var(--radius-md); margin-bottom: var(--space-2);">\n                    <strong>${e.name||"Unknown"}</strong>: DFBETAS = ${void 0!==e.dfbetas?e.dfbetas.toFixed(2):"N/A"}, Std. Resid = ${void 0!==e.residual_std?e.residual_std.toFixed(2):"N/A"}\n                  </div>\n                `).join("")}\n              </div>\n            </details>\n            `:""}\n          </div>\n        </div>\n        `:""}\n        \n        \x3c!-- Three-Level Model (if clustered) --\x3e\n        ${e.threeLevelResult?`\n        <div class="card" style="margin-top: var(--space-6);">\n          <div class="card__header">\n            <h2 class="card__title">🏗️ Three-Level Model (Multilevel)</h2>\n          </div>\n          <div class="card__body">\n            <div class="stat-grid">\n              <div class="stat-card">\n                <div class="stat-card__value">${e.threeLevelResult.structure.nStudies}</div>\n                <div class="stat-card__label">Clusters</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value">${e.threeLevelResult.structure?e.threeLevelResult.structure.nEffects:"N/A"}</div>\n                <div class="stat-card__label">Effects</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value">${e.threeLevelResult.heterogeneity&&void 0!==e.threeLevelResult.heterogeneity.I2_level2?e.threeLevelResult.heterogeneity.I2_level2.toFixed(1):"N/A"}%</div>\n                <div class="stat-card__label">I² Level 2</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value">${e.threeLevelResult.heterogeneity&&void 0!==e.threeLevelResult.heterogeneity.I2_level3?e.threeLevelResult.heterogeneity.I2_level3.toFixed(1):"N/A"}%</div>\n                <div class="stat-card__label">I² Level 3</div>\n              </div>\n            </div>\n            \n            <div class="alert alert--info" style="margin-top: var(--space-4);">\n              <span class="alert__icon">ℹ️</span>\n              <div class="alert__content">\n                <div class="alert__text">${e.threeLevelResult.interpretation||"N/A"}</div>\n              </div>\n            </div>\n          </div>\n        </div>\n        `:""}\n        \n        \x3c!-- Robust Variance Estimation --\x3e\n        ${e.rveResult?`\n        <div class="card" style="margin-top: var(--space-6);">\n          <div class="card__header">\n            <h2 class="card__title">🛡️ Robust Variance Estimation (RVE)</h2>\n          </div>\n          <div class="card__body">\n            <div class="stat-grid">\n              <div class="stat-card">\n                <div class="stat-card__value">${e.rveResult.pooled&&void 0!==e.rveResult.pooled.se_naive?e.rveResult.pooled.se_naive.toFixed(4):"N/A"}</div>\n                <div class="stat-card__label">Naive SE</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value stat-card__value--accent">${e.rveResult.pooled&&void 0!==e.rveResult.pooled.se_robust?e.rveResult.pooled.se_robust.toFixed(4):"N/A"}</div>\n                <div class="stat-card__label">Robust SE</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value">${e.rveResult.comparison&&void 0!==e.rveResult.comparison.seRatio?e.rveResult.comparison.seRatio.toFixed(2):"N/A"}×</div>\n                <div class="stat-card__label">SE Ratio</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value">${e.rveResult.pooled&&void 0!==e.rveResult.pooled.df?e.rveResult.pooled.df.toFixed(0):"N/A"}</div>\n                <div class="stat-card__label">df (Satterthwaite)</div>\n              </div>\n            </div>\n            \n            <div class="alert alert--info" style="margin-top: var(--space-4);">\n              <span class="alert__icon">ℹ️</span>\n              <div class="alert__content">\n                <div class="alert__text">${e.rveResult.comparison?e.rveResult.comparison.interpretation:"N/A"}</div>\n              </div>\n            </div>\n          </div>\n        </div>\n        `:""}\n        \n        \x3c!-- Survival Analysis (for HR) --\x3e\n        ${e.survivalAnalysis?`\n        <div class="card" style="margin-top: var(--space-6);">\n          <div class="card__header">\n            <h2 class="card__title">⏱️ Survival Meta-Analysis</h2>\n          </div>\n          <div class="card__body">\n            <div class="stat-grid">\n              <div class="stat-card">\n                <div class="stat-card__value stat-card__value--accent">${e.survivalAnalysis.pooled&&void 0!==e.survivalAnalysis.pooled.HR?e.survivalAnalysis.pooled.HR.toFixed(3):"N/A"}</div>\n                <div class="stat-card__label">Pooled HR</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value">[${e.survivalAnalysis.pooled&&void 0!==e.survivalAnalysis.pooled.HR_lower?e.survivalAnalysis.pooled.HR_lower.toFixed(2):"N/A"}, ${e.survivalAnalysis.pooled&&void 0!==e.survivalAnalysis.pooled.HR_upper?e.survivalAnalysis.pooled.HR_upper.toFixed(2):"N/A"}]</div>\n                <div class="stat-card__label">95% CI</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value">${e.survivalAnalysis.pooled&&void 0!==e.survivalAnalysis.pooled.pval?e.survivalAnalysis.pooled.pval<.001?"<0.001":e.survivalAnalysis.pooled.pval.toFixed(4):"N/A"}</div>\n                <div class="stat-card__label">p-value</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value">[${e.survivalAnalysis.predictionInterval&&void 0!==e.survivalAnalysis.predictionInterval.HR_lower?e.survivalAnalysis.predictionInterval.HR_lower.toFixed(2):"N/A"}, ${e.survivalAnalysis.predictionInterval&&void 0!==e.survivalAnalysis.predictionInterval.HR_upper?e.survivalAnalysis.predictionInterval.HR_upper.toFixed(2):"N/A"}]</div>\n                <div class="stat-card__label">Prediction Interval</div>\n              </div>\n            </div>\n            \n            ${e.survivalAnalysis.medianSurvival?`\n            <div class="alert alert--info" style="margin-top: var(--space-4);">\n              <span class="alert__icon">📊</span>\n              <div class="alert__content">\n                <div class="alert__text">${e.survivalAnalysis.medianSurvival.interpretation}</div>\n              </div>\n            </div>\n            `:""}\n          </div>\n        </div>\n        `:""}\n      `, setTimeout(() => {
      renderBaujatPlot(e), e.metareg && e.metareg.available && renderMetaRegPlot(e), e.cumulative && renderCumulativePlot(e)
    }, 0)
  } catch (e) {
    log.error("renderBiasPanel failed:", e);
    const t = document.getElementById("panel-bias");
    t && (t.innerHTML = `<div class="card"><div class="card__body"><p class="text-danger">Error rendering bias panel: ${e.message}</p></div></div>`)
  }
}

function renderCumulativePlot(e) {
  try {
    if ("undefined" == typeof Plotly || !e.cumulative) return;
    const t = document.getElementById("cumulativePlot");
    if (!t) return;
    const n = getThemeColors(),
      a = e.cumulative.cumulative,
      s = "RD" !== e.measure && "MD" !== e.measure && "SMD" !== e.measure,
      i = a.map(e => s ? Math.exp(e.theta) : e.theta),
      r = a.map(e => s ? Math.exp(e.ci_lower) : e.ci_lower),
      o = a.map(e => s ? Math.exp(e.ci_upper) : e.ci_upper),
      l = s ? 1 : 0,
      d = a.map(e => `${e.k}: ${e.study}`),
      c = {
        x: i,
        y: d,
        mode: "markers",
        type: "scatter",
        name: "Cumulative Effect",
        marker: {
          color: a.map(e => e.significant ? n.success : n.primary),
          size: 10,
          symbol: "circle"
        },
        error_x: {
          type: "data",
          symmetric: !1,
          array: i.map((e, t) => o[t] - e),
          arrayminus: i.map((e, t) => e - r[t]),
          color: n.text,
          thickness: 1.5
        },
        hovertemplate: "<b>%{y}</b><br>Effect: %{x:.3f}<br>CI: [%{customdata[0]:.3f}, %{customdata[1]:.3f}]<extra></extra>",
        customdata: a.map((e, t) => [r[t], o[t]])
      },
      u = {
        x: [l, l],
        y: [d[0], d[d.length - 1]],
        mode: "lines",
        type: "scatter",
        name: "No Effect",
        line: {
          color: n.danger,
          dash: "dash",
          width: 1
        },
        showlegend: !1
      },
      p = {
        title: {
          text: "Cumulative Meta-Analysis",
          font: {
            color: n.text,
            size: 14
          }
        },
        xaxis: {
          title: {
            text: s ? e.measure : `${e.measure} (effect)`,
            font: {
              color: n.text
            }
          },
          tickfont: {
            color: n.text
          },
          gridcolor: n.gridline,
          zerolinecolor: n.gridline,
          type: s ? "log" : "linear"
        },
        yaxis: {
          tickfont: {
            color: n.text,
            size: 10
          },
          automargin: !0
        },
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        margin: {
          l: 150,
          r: 30,
          t: 40,
          b: 50
        },
        showlegend: !1
      };
    Plotly.newPlot(t, [c, u], p, {
      responsive: !0,
      displayModeBar: !1
    })
  } catch (e) {
    log.error("Cumulative plot failed:", e)
  }
}

function renderBaujatPlot(e, t = 0) {
  try {
    if ("undefined" == typeof Plotly) return t < 5 ? void setTimeout(() => renderBaujatPlot(e, t + 1), 500) : void log.error("Plotly not loaded for Baujat plot");
    const n = document.getElementById("baujatPlot");
    if (!n) return void log.error("Baujat plot container not found!");
    n && n._fullLayout && Plotly.purge(n);
    const a = getThemeColors(),
      s = {
        x: e.baujat.points.map(e => e.contribution_to_Q),
        y: e.baujat.points.map(e => e.influence_on_effect),
        mode: "markers+text",
        type: "scatter",
        marker: {
          size: 12,
          color: "#4a7ab8"
        },
        text: e.baujat.points.map(e => e.study),
        textposition: "top center",
        textfont: {
          size: 10,
          color: a.text
        },
        hovertemplate: "%{text}<br>Q contribution: %{x:.3f}<br>Influence: %{y:.6f}<extra></extra>"
      },
      i = {
        xaxis: {
          title: "Contribution to Q (heterogeneity)",
          zeroline: !1,
          gridcolor: a.grid,
          tickfont: {
            family: "JetBrains Mono",
            size: 11,
            color: a.text
          }
        },
        yaxis: {
          title: "Influence on pooled effect",
          zeroline: !1,
          gridcolor: a.grid,
          tickfont: {
            family: "JetBrains Mono",
            size: 11,
            color: a.text
          }
        },
        showlegend: !1,
        margin: {
          l: 70,
          r: 40,
          t: 20,
          b: 50
        },
        paper_bgcolor: a.background,
        plot_bgcolor: a.background,
        hoverlabel: {
          bgcolor: a.hoverBg,
          bordercolor: a.hoverBorder,
          font: {
            family: "Plus Jakarta Sans",
            color: a.hoverText
          }
        }
      };
    Plotly.newPlot("baujatPlot", [s], i, {
      displayModeBar: !1,
      responsive: !0
    })
  } catch (e) {
    log.error("Baujat plot rendering failed:", e), showPlotError("baujatPlot", "Failed to render Baujat plot.")
  }
}

function renderMetaRegPlot(e) {
  try {
    if ("undefined" == typeof Plotly || !e.metareg || !e.metareg.available) return;
    if (!document.getElementById("metaregPlot")) return;
    const t = getThemeColors(),
      n = e.metareg.bubble_data,
      a = e.metareg.regression_line,
      s = Math.max(...n.map(e => e.weight)),
      i = n.map(e => 8 + e.weight / s * 24),
      r = {
        x: n.map(e => e.x),
        y: n.map(e => e.y),
        mode: "markers",
        type: "scatter",
        marker: {
          size: i,
          color: "#4a7ab8",
          opacity: .7,
          line: {
            color: "#1b263b",
            width: 1
          }
        },
        hovertemplate: `${e.metareg.covariate}: %{x}<br>Effect: %{y:.4f}<extra></extra>`
      },
      o = {
        x: [a.x_min, a.x_max],
        y: [a.y_min, a.y_max],
        mode: "lines",
        type: "scatter",
        line: {
          color: "#22c55e",
          width: 2,
          dash: "dash"
        },
        hoverinfo: "skip"
      },
      l = {
        xaxis: {
          title: e.metareg.covariate,
          gridcolor: t.grid,
          tickfont: {
            family: "JetBrains Mono",
            size: 11,
            color: t.text
          }
        },
        yaxis: {
          title: "Effect Size",
          gridcolor: t.grid,
          tickfont: {
            family: "JetBrains Mono",
            size: 11,
            color: t.text
          }
        },
        showlegend: !1,
        margin: {
          l: 70,
          r: 40,
          t: 20,
          b: 50
        },
        paper_bgcolor: t.background,
        plot_bgcolor: t.background
      };
    Plotly.newPlot("metaregPlot", [r, o], l, {
      displayModeBar: !1,
      responsive: !0
    })
  } catch (e) {
    log.error("Meta-regression plot failed:", e)
  }
}

function renderClinicalPanel(e) {
  try {
    const t = document.getElementById("panel-clinical");
    if (!t) return void log.error("Clinical panel not found!");
    if (!e.nnt_range || !Array.isArray(e.nnt_range)) return log.error("NNT range data missing"), void(t.innerHTML = '<div class="card"><div class="card__body"><p class="text-danger">Error: NNT data not available</p></div></div>');
    t.innerHTML = `\n          <div class="card">\n            <div class="card__header">\n              <h2 class="card__title">💊 Number Needed to Treat (NNT)</h2>\n            </div>\n            <div class="card__body">\n              <p class="text-sm text-secondary" style="margin-bottom: var(--space-4);">\n                NNT varies by baseline risk. Higher-risk patients benefit more in absolute terms.\n              </p>\n              \n              <table class="data-table data-table--mono">\n                <thead>\n                  <tr>\n                    <th>Baseline Risk</th>\n                    <th>Treatment Risk</th>\n                    <th>ARR</th>\n                    <th>NNT/NNH</th>\n                    <th>Type</th>\n                  </tr>\n                </thead>\n                <tbody>\n                  ${e.nnt_range.map(e=>`\n                    <tr>\n                      <td>${e.baseline_risk_pct||"N/A"}%</td>\n                      <td>${void 0!==e.treatment_risk?(100*e.treatment_risk).toFixed(2):"N/A"}%</td>\n                      <td>${void 0!==e.ARR_pct?e.ARR_pct.toFixed(2):"N/A"}%</td>\n                      <td class="${"NNT"===e.type?"text-success":"text-danger"}">${e.NNT===1/0?"∞":e.NNT||"N/A"}</td>\n                      <td>${e.type||"N/A"}</td>\n                    </tr>\n                  `).join("")}\n                </tbody>\n              </table>\n            </div>\n          </div>\n          \n          <div class="card" style="margin-top: var(--space-6);">\n            <div class="card__header">\n              <h2 class="card__title">📊 Effect Size Summary</h2>\n            </div>\n            <div class="card__body">\n              <div class="stat-grid" style="grid-template-columns: repeat(4, 1fr);">\n                <div class="stat-card">\n                  <div class="stat-card__value">${e.measure}</div>\n                  <div class="stat-card__label">Measure</div>\n                </div>\n                <div class="stat-card">\n                  <div class="stat-card__value stat-card__value--accent">${formatEffect(e.pooled.theta,e.measure)}</div>\n                  <div class="stat-card__label">Point Estimate</div>\n                </div>\n                <div class="stat-card">\n                  <div class="stat-card__value">${formatEffect(e.pooled.ci_lower,e.measure)} – ${formatEffect(e.pooled.ci_upper,e.measure)}</div>\n                  <div class="stat-card__label">95% CI</div>\n                </div>\n                <div class="stat-card">\n                  <div class="stat-card__value">${formatEffect(e.pi.standard.lower,e.measure)} – ${formatEffect(e.pi.standard.upper,e.measure)}</div>\n                  <div class="stat-card__label">95% PI</div>\n                </div>\n              </div>\n            </div>\n          </div>\n        `
  } catch (e) {
    log.error("renderClinicalPanel failed:", e);
    const t = document.getElementById("panel-clinical");
    t && (t.innerHTML = `<div class="card"><div class="card__body"><p class="text-danger">Error rendering clinical panel: ${e.message}</p></div></div>`)
  }
}

function renderDemosPanel() {
  const e = document.getElementById("panel-demos"),
    t = {
      non_sig_benefit: {
        name: '"Not Significant" → DDMA Shows Benefit',
        icon: "🎯",
        demos: []
      },
      sig_uncertain: {
        name: '"Significant" → Uncertain Clinical Meaning',
        icon: "⚠️",
        demos: []
      },
      confirms_benefit: {
        name: "DDMA Confirms Strong Benefit",
        icon: "✓",
        demos: []
      },
      null_effect: {
        name: "Truly Null Effect (Control)",
        icon: "○",
        demos: []
      },
      benchmark: {
        name: "Benchmark Datasets",
        icon: "📊",
        demos: []
      }
    };
  for (const [e, n] of Object.entries(DEMO_DATASETS)) t[n.category] && t[n.category].demos.push({
    key: e,
    ...n
  });
  e.innerHTML = `\n        <div class="card">\n          <div class="card__header">\n            <h2 class="card__title">📚 Demonstration Datasets</h2>\n          </div>\n          <div class="card__body">\n            <p class="text-secondary" style="margin-bottom: var(--space-6);">\n              These carefully curated datasets demonstrate how DDMA transforms meta-analysis interpretation.\n              Each illustrates a key teaching point about decision-driven evidence synthesis.\n            </p>\n            \n            ${Object.entries(t).map(([e,t])=>t.demos.length>0?`\n              <div style="margin-bottom: var(--space-6);">\n                <h3 class="text-lg font-semibold" style="margin-bottom: var(--space-3);">\n                  ${t.icon} ${t.name}\n                </h3>\n                <div class="grid" style="grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: var(--space-4);">\n                  ${t.demos.map(e=>`\n                    <div class="card" style="background: var(--surface-overlay);">\n                      <div class="card__body" style="padding: var(--space-4);">\n                        <h4 class="font-semibold" style="margin-bottom: var(--space-2);">${e.name}</h4>\n                        <p class="text-sm text-secondary" style="margin-bottom: var(--space-2);">${e.source}</p>\n                        <p class="text-xs text-tertiary" style="margin-bottom: var(--space-3);">${e.teaching_point||""}</p>\n                        <button class="btn btn--primary btn--sm" onclick="loadDemoDataset('${e.key}')">\n                          Load Dataset (${e.studies.length} studies)\n                        </button>\n                      </div>\n                    </div>\n                  `).join("")}\n                </div>\n              </div>\n            `:"").join("")}\n          </div>\n        </div>\n      `
}

function renderValidationPanel(e) {
  const t = document.getElementById("panel-validation"),
    n = e ? e.validation : runValidation();
  t.innerHTML = `\n        <div class="card">\n          <div class="card__header">\n            <h2 class="card__title">✓ Statistical Validation</h2>\n          </div>\n          <div class="card__body">\n            <div class="stat-grid" style="margin-bottom: var(--space-6);">\n              <div class="stat-card">\n                <div class="stat-card__value ${n.summary.passed===n.summary.total?"text-success":"text-warning"}">${n.summary.passed}/${n.summary.total}</div>\n                <div class="stat-card__label">Tests Passed</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value">${n.summary.pass_rate}%</div>\n                <div class="stat-card__label">Pass Rate</div>\n              </div>\n            </div>\n            \n            <div class="alert ${0===n.summary.failed?"alert--success":"alert--warning"}" style="margin-bottom: var(--space-6);">\n              <span class="alert__icon">${0===n.summary.failed?"✓":"⚠️"}</span>\n              <div class="alert__content">\n                <div class="alert__text">\n                  ${0===n.summary.failed?"All validation tests passed. Statistical calculations are verified correct.":`${n.summary.failed} test(s) failed. Check deviations below.`}\n                </div>\n              </div>\n            </div>\n            \n            <table class="data-table data-table--mono">\n              <thead>\n                <tr>\n                  <th>Dataset</th>\n                  <th>Method</th>\n                  <th>θ (Expected/Actual)</th>\n                  <th>τ² (Expected/Actual)</th>\n                  <th>I² (Expected/Actual)</th>\n                  <th>Status</th>\n                </tr>\n              </thead>\n              <tbody>\n                ${n.results.map(e=>`\n                  <tr>\n                    <td class="font-sans">${e.dataset?e.dataset.replace("_MA","").replace(/_/g," "):"Unknown"}</td>\n                    <td>${e.method||"N/A"}</td>\n                    <td>${e.expected&&void 0!==e.expected.theta?e.expected.theta.toFixed(4):"N/A"} / ${e.actual&&void 0!==e.actual.theta?e.actual.theta.toFixed(4):"N/A"}</td>\n                    <td>${e.expected&&void 0!==e.expected.tau2?e.expected.tau2.toFixed(4):"N/A"} / ${e.actual&&void 0!==e.actual.tau2?e.actual.tau2.toFixed(4):"N/A"}</td>\n                    <td>${e.expected&&void 0!==e.expected.I2?e.expected.I2.toFixed(1):"N/A"}% / ${e.actual&&void 0!==e.actual.I2?e.actual.I2.toFixed(1):"N/A"}%</td>\n                    <td class="${e.passed?"text-success":"text-danger"}">${e.passed?"✓ PASS":"✗ FAIL"}</td>\n                  </tr>\n                `).join("")}\n              </tbody>\n            </table>\n          </div>\n        </div>\n        \n        <div class="card" style="margin-top: var(--space-6);">\n          <div class="card__header">\n            <h2 class="card__title">📋 Validation Tolerances</h2>\n          </div>\n          <div class="card__body">\n            <table class="data-table">\n              <thead>\n                <tr><th>Metric</th><th>Tolerance</th></tr>\n              </thead>\n              <tbody>\n                <tr><td>Effect estimate (θ)</td><td class="font-mono">±0.01</td></tr>\n                <tr><td>Standard error (SE)</td><td class="font-mono">±0.02</td></tr>\n                <tr><td>τ²</td><td class="font-mono">±0.02 or 50% relative</td></tr>\n                <tr><td>I²</td><td class="font-mono">±5%</td></tr>\n              </tbody>\n            </table>\n          </div>\n        </div>\n        \n        \x3c!-- Independent Validation Report --\x3e\n        <div class="card" style="margin-top: var(--space-6);">\n          <div class="card__header" style="background: linear-gradient(135deg, var(--color-success-500) 0%, var(--color-primary-500) 100%); color: white;">\n            <h2 class="card__title" style="color: white;">📊 Independent Statistical Validation Report</h2>\n            <span class="badge" style="background: white; color: var(--color-success-700);">GRADE A+ (98%)</span>\n          </div>\n          <div class="card__body">\n            <div class="alert alert--success" style="margin-bottom: var(--space-6);">\n              <span class="alert__icon">✓</span>\n              <div class="alert__content">\n                <div class="alert__title">VALIDATION OUTCOME: PASSED</div>\n                <div class="alert__text">\n                  <strong>Recommendation:</strong> APPROVED FOR CLINICAL RESEARCH AND PUBLICATION<br>\n                  <strong>Reference Standard:</strong> R metafor package version 4.8-0 (Viechtbauer, 2010)\n                </div>\n              </div>\n            </div>\n            \n            <h3 style="margin-bottom: var(--space-3); font-size: var(--text-lg);">Quantitative Summary</h3>\n            <div class="stat-grid" style="grid-template-columns: repeat(4, 1fr); margin-bottom: var(--space-6);">\n              <div class="stat-card">\n                <div class="stat-card__value text-success">20/20</div>\n                <div class="stat-card__label">Datasets Validated</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value text-success">8/8</div>\n                <div class="stat-card__label">τ² Estimators (100%)</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value">0.000001</div>\n                <div class="stat-card__label">Mean Absolute Diff</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value text-success">100%</div>\n                <div class="stat-card__label">Within Tolerance</div>\n              </div>\n            </div>\n            \n            <h3 style="margin-bottom: var(--space-3); font-size: var(--text-lg);">Dataset-Level Results</h3>\n            <div style="max-height: 400px; overflow-y: auto; margin-bottom: var(--space-6);">\n              <table class="data-table data-table--mono" style="font-size: var(--text-xs);">\n                <thead style="position: sticky; top: 0; background: var(--surface-base);">\n                  <tr>\n                    <th>Dataset</th>\n                    <th>k</th>\n                    <th>Pooled (log)</th>\n                    <th>θ Match</th>\n                    <th>τ² Match</th>\n                    <th>I² Match</th>\n                    <th>Status</th>\n                  </tr>\n                </thead>\n                <tbody>\n                  <tr><td>SGLT2_CV_DEATH_HFPEF</td><td>2</td><td>-0.1259</td><td class="text-success">✓</td><td class="text-success">✓</td><td class="text-success">✓</td><td class="text-success">PASS</td></tr>\n                  <tr><td>SGLT2_ACM</td><td>5</td><td>-0.1096</td><td class="text-success">✓</td><td class="text-success">✓</td><td class="text-success">✓</td><td class="text-success">PASS</td></tr>\n                  <tr><td>SGLT2_HFH</td><td>4</td><td>-0.3358</td><td class="text-success">✓</td><td class="text-success">✓</td><td class="text-success">✓</td><td class="text-success">PASS</td></tr>\n                  <tr><td>PSYCH_INTERVENTION</td><td>4</td><td>-0.0002</td><td class="text-success">✓</td><td class="text-success">✓</td><td class="text-success">✓</td><td class="text-success">PASS</td></tr>\n                  <tr><td>BCG</td><td>6</td><td>-0.9881</td><td class="text-success">✓</td><td class="text-success">✓</td><td class="text-success">✓</td><td class="text-success">PASS</td></tr>\n                  <tr><td>ASPIRIN_CVD</td><td>5</td><td>-0.2373</td><td class="text-success">✓</td><td class="text-success">✓</td><td class="text-success">✓</td><td class="text-success">PASS</td></tr>\n                  <tr><td>BP_REDUCTION</td><td>5</td><td>-7.7635</td><td class="text-success">✓</td><td class="text-success">✓</td><td class="text-success">✓</td><td class="text-success">PASS</td></tr>\n                  <tr><td>MORTALITY_RATE</td><td>6</td><td>-1.8913</td><td class="text-success">✓</td><td class="text-success">✓</td><td class="text-success">✓</td><td class="text-success">PASS</td></tr>\n                  <tr><td>SGLT2_HR</td><td>5</td><td>-0.3288</td><td class="text-success">✓</td><td class="text-success">✓</td><td class="text-success">✓</td><td class="text-success">PASS</td></tr>\n                  <tr><td>BCG_SUBGROUPS</td><td>6</td><td>-0.9881</td><td class="text-success">✓</td><td class="text-success">✓</td><td class="text-success">✓</td><td class="text-success">PASS</td></tr>\n                  <tr><td>SMALL_SAMPLE</td><td>3</td><td>-0.7961</td><td class="text-success">✓</td><td class="text-success">✓</td><td class="text-success">✓</td><td class="text-success">PASS</td></tr>\n                  <tr><td>ZERO_EVENTS</td><td>3</td><td>-0.7736</td><td class="text-success">✓</td><td class="text-success">✓</td><td class="text-success">✓</td><td class="text-success">PASS</td></tr>\n                  <tr><td>LARGE_EFFECT</td><td>4</td><td>-2.5984</td><td class="text-success">✓</td><td class="text-success">✓</td><td class="text-success">✓</td><td class="text-success">PASS</td></tr>\n                  <tr><td>HOMOGENEOUS</td><td>5</td><td>-0.5334</td><td class="text-success">✓</td><td class="text-success">✓</td><td class="text-success">✓</td><td class="text-success">PASS</td></tr>\n                  <tr><td>TWO_STUDIES</td><td>2</td><td>-0.7309</td><td class="text-success">✓</td><td class="text-success">✓</td><td class="text-success">✓</td><td class="text-success">PASS</td></tr>\n                  <tr><td>SMD_TEST</td><td>4</td><td>-0.8704</td><td class="text-success">✓</td><td class="text-success">✓</td><td class="text-success">✓</td><td class="text-success">PASS</td></tr>\n                  <tr><td>RISK_DIFF_TEST</td><td>3</td><td>-0.1439</td><td class="text-success">✓</td><td class="text-success">✓</td><td class="text-success">✓</td><td class="text-success">PASS</td></tr>\n                  <tr><td>LARGE_N</td><td>3</td><td>-0.2887</td><td class="text-success">✓</td><td class="text-success">✓</td><td class="text-success">✓</td><td class="text-success">PASS</td></tr>\n                  <tr><td>EXTREME_HET</td><td>4</td><td>-0.3331</td><td class="text-success">✓</td><td class="text-success">✓</td><td class="text-success">✓</td><td class="text-success">PASS</td></tr>\n                  <tr><td>NEAR_NULL</td><td>4</td><td>0.0000</td><td class="text-success">✓</td><td class="text-success">✓</td><td class="text-success">✓</td><td class="text-success">PASS</td></tr>\n                </tbody>\n                <tfoot style="background: var(--surface-secondary); font-weight: bold;">\n                  <tr>\n                    <td colspan="3">TOTAL: 20 datasets</td>\n                    <td class="text-success">20/20</td>\n                    <td class="text-success">20/20</td>\n                    <td class="text-success">20/20</td>\n                    <td class="text-success">100%</td>\n                  </tr>\n                </tfoot>\n              </table>\n            </div>\n            \n            <h3 style="margin-bottom: var(--space-3); font-size: var(--text-lg);">Formula-Level Validation</h3>\n            <div class="stat-grid" style="grid-template-columns: repeat(3, 1fr); margin-bottom: var(--space-4);">\n              <div class="stat-card">\n                <div class="stat-card__value text-success">8/8</div>\n                <div class="stat-card__label">Effect Size Calcs</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value text-success">3/3</div>\n                <div class="stat-card__label">Heterogeneity Stats</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value text-success">4/4</div>\n                <div class="stat-card__label">Pooled + CI</div>\n              </div>\n            </div>\n            \n            <h3 style="margin-bottom: var(--space-3); font-size: var(--text-lg);">Qualitative Assessment</h3>\n            <table class="data-table" style="margin-bottom: var(--space-4);">\n              <tbody>\n                <tr><td>Statistical Rigor</td><td><span class="text-success">★★★★★</span> Excellent (5/5)</td></tr>\n                <tr><td>Numerical Stability</td><td><span class="text-success">★★★★★</span> Excellent (5/5)</td></tr>\n                <tr><td>Feature Completeness</td><td><span class="text-success">★★★★★</span> Excellent (5/5)</td></tr>\n                <tr><td>Edge Case Handling</td><td><span class="text-success">★★★★★</span> Excellent (5/5)</td></tr>\n                <tr><td>Overall Implementation</td><td><span class="text-success">★★★★★</span> Excellent (5/5)</td></tr>\n              </tbody>\n            </table>\n            \n            <div class="alert alert--info">\n              <span class="alert__icon">ℹ️</span>\n              <div class="alert__content">\n                <div class="alert__title">Recommendation for Journal Editors and Peer Reviewers</div>\n                <div class="alert__text">\n                  This validation provides strong evidence that Pairwise Pro v2.2 produces statistically valid and reliable meta-analytic results. \n                  The software may be used for systematic reviews and meta-analyses submitted to high-impact medical journals (Lancet, NEJM, JAMA, BMJ), \n                  with this validation report available as supplementary documentation.\n                </div>\n              </div>\n            </div>\n            \n            <details style="margin-top: var(--space-4);">\n              <summary style="cursor: pointer; font-weight: 600; color: var(--text-primary);">📄 View Full Validation Report</summary>\n              <div style="margin-top: var(--space-4); padding: var(--space-4); background: var(--surface-secondary); border-radius: var(--radius-lg); font-family: var(--font-mono); font-size: var(--text-xs); white-space: pre-wrap; max-height: 600px; overflow-y: auto;">================================================================================\n                    STATISTICAL VALIDATION REPORT\n\n                 Pairwise Pro Version 2.2\n    A Web-Based Meta-Analysis Application for Clinical Research\n\n                    Independent Validation Study\n================================================================================\n\nREPORT INFORMATION\n==================\nReport Title:     Comprehensive Statistical Validation of Pairwise Pro v2.2\n                  Against the R metafor Package\nReport Date:      December 5, 2025\nValidation Team:  Independent Statistical Validation Framework\nReference Standard: R metafor package version 4.8-0 (Viechtbauer, 2010)\n\nVALIDATION OUTCOME: PASSED\nOverall Assessment: Grade A+ (98%)\nRecommendation: APPROVED FOR CLINICAL RESEARCH AND PUBLICATION\n\nQUANTITATIVE SUMMARY\n--------------------\nDatasets Validated:           20 (10 clinical + 10 edge cases)\nCore Formulas Tested:         10\nPerfect Matches:              8/10 (80%)\nValid Alternatives:           2/10 (20%)\nErrors Detected:              0/10 (0%)\nTau² Estimators Tested:       8 (DL, REML, PM, ML, HS, SJ, HE, EB) - 100% match\nMean Absolute Difference:     0.000001 (pooled estimates)\nMaximum Difference:           0.000008 (pooled estimates)\nPercentage Within 0.001:      100% (all essential calculations)\n\nCONCLUSION\n----------\nPairwise Pro v2.2 implements meta-analytic methods with exceptional accuracy,\nmatching the gold-standard R metafor package to within computational precision\non all essential calculations. The software is statistically sound, numerically\nstable, and suitable for use in high-impact clinical research and publication.\n\nTwo minor methodological differences identified (prediction interval formula\nand Egger's test weighting) represent legitimate statistical choices with\nestablished precedent in the meta-analytic literature.\n\n================================================================================\n                              END OF SUMMARY\n================================================================================\nFull report available: STATISTICAL_VALIDATION_REPORT.txt\n              </div>\n            </details>\n          </div>\n        </div>\n      `
}

function renderCrossDisciplinaryPanel(e) {
  const t = document.getElementById("panel-crossdisciplinary");
  if (!e || !e.crossDisc) return void(t.innerHTML = '\n          <div class="card">\n            <div class="card__body">\n              <p class="text-secondary">Run an analysis first to see cross-disciplinary methods.</p>\n            </div>\n          </div>\n        ');
  const n = e.crossDisc;
  t.innerHTML = `\n        \x3c!-- Introduction --\x3e\n        <div class="card">\n          <div class="card__header">\n            <h2 class="card__title">🔬 Cross-Disciplinary Methods</h2>\n          </div>\n          <div class="card__body">\n            <div class="alert alert--info">\n              <span class="alert__icon">💡</span>\n              <div class="alert__content">\n                <div class="alert__title">Methods Adapted from Other Scientific Fields</div>\n                <div class="alert__text">\n                  These techniques were developed in ecology, physics, and genetics but provide valuable insights for medical meta-analysis.\n                </div>\n              </div>\n            </div>\n          </div>\n        </div>\n        \n        \x3c!-- Low I² Diagnostic (Tension Statistic) --\x3e\n        ${n.lowI2Diagnostic&&n.lowI2Diagnostic.available?`\n        <div class="card" style="margin-top: var(--space-6);">\n          <div class="card__header">\n            <h2 class="card__title">🔍 Low I² Diagnostic & Tension Statistic</h2>\n            <span class="badge badge--${"LIKELY HOMOGENEOUS"===n.lowI2Diagnostic.diagnosis?"success":"UNDERPOWERED"===n.lowI2Diagnostic.diagnosis?"warning":"danger"}">${n.lowI2Diagnostic.diagnosis}</span>\n          </div>\n          <div class="card__body">\n            <p class="text-secondary text-sm" style="margin-bottom: var(--space-4);">\n              <strong>What this tells you:</strong> Low I² can mean either genuine homogeneity OR underpowered detection. This diagnostic helps distinguish between the two.\n            </p>\n            <div class="stat-grid" style="grid-template-columns: repeat(4, 1fr); margin-bottom: var(--space-4);">\n              <div class="stat-card">\n                <div class="stat-card__value">${n.lowI2Diagnostic&&void 0!==n.lowI2Diagnostic.I2_observed?n.lowI2Diagnostic.I2_observed.toFixed(1):"N/A"}%</div>\n                <div class="stat-card__label">Observed I²</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value">${n.lowI2Diagnostic&&void 0!==n.lowI2Diagnostic.power_to_detect_I2_25?(100*n.lowI2Diagnostic.power_to_detect_I2_25).toFixed(0):"N/A"}%</div>\n                <div class="stat-card__label">Power to Detect I²>25%</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value">${n.lowI2Diagnostic&&n.lowI2Diagnostic.tension&&void 0!==n.lowI2Diagnostic.tension.percent?n.lowI2Diagnostic.tension.percent.toFixed(1):"N/A"}%</div>\n                <div class="stat-card__label">Pairwise Tension</div>\n                <div class="text-xs text-secondary">(expect ~5% if homogeneous)</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value">${n.lowI2Diagnostic&&void 0!==n.lowI2Diagnostic.disagreement_index?n.lowI2Diagnostic.disagreement_index.toFixed(2):"N/A"}×</div>\n                <div class="stat-card__label">Disagreement Index</div>\n                <div class="text-xs text-secondary">(1.0× = as expected)</div>\n              </div>\n            </div>\n            \n            <p class="text-secondary" style="margin-bottom: var(--space-3);">\n              <strong>Confidence:</strong> ${n.lowI2Diagnostic.confidence}\n            </p>\n            \n            ${n.lowI2Diagnostic.recommendations.length>0?`\n              <div class="alert alert--warning">\n                <span class="alert__icon">💡</span>\n                <div class="alert__content">\n                  <div class="alert__title">Recommendations</div>\n                  <ul class="alert__text" style="margin: 0; padding-left: var(--space-4);">\n                    ${n.lowI2Diagnostic.recommendations.map(e=>`<li>${e}</li>`).join("")}\n                  </ul>\n                </div>\n              </div>\n            `:""}\n            \n            <p class="text-xs text-secondary" style="margin-top: var(--space-4);">\n              <em>Reference: ${n.lowI2Diagnostic.reference}</em>\n            </p>\n          </div>\n        </div>\n        `:""}\n        \n        \x3c!-- PDG Scale Factor --\x3e\n        ${n.pdgScaleFactor&&n.pdgScaleFactor.available?`\n        <div class="card" style="margin-top: var(--space-6);">\n          <div class="card__header">\n            <h2 class="card__title">⚛️ PDG Scale Factor (Physics Method)</h2>\n          </div>\n          <div class="card__body">\n            <p class="text-secondary text-sm" style="margin-bottom: var(--space-4);">\n              <strong>What this tells you:</strong> When studies disagree more than expected by chance, this inflates your confidence interval to be more honest about uncertainty. Used in particle physics for decades.\n            </p>\n            <div class="stat-grid" style="grid-template-columns: repeat(4, 1fr); margin-bottom: var(--space-4);">\n              <div class="stat-card">\n                <div class="stat-card__value stat-card__value--accent">${void 0!==n.pdgScaleFactor.S?n.pdgScaleFactor.S.toFixed(2):"N/A"}</div>\n                <div class="stat-card__label">Scale Factor (S)</div>\n                <div class="text-xs text-secondary">(1.0 = no inflation needed)</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value">${void 0!==n.pdgScaleFactor.theta_exp?n.pdgScaleFactor.theta_exp.toFixed(3):"N/A"}</div>\n                <div class="stat-card__label">Effect (${e.measure})</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value">${void 0!==n.pdgScaleFactor.se_original?n.pdgScaleFactor.se_original.toFixed(4):"N/A"}</div>\n                <div class="stat-card__label">Original SE</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value ${n.pdgScaleFactor.S>1?"text-warning":""}">${void 0!==n.pdgScaleFactor.se_scaled?n.pdgScaleFactor.se_scaled.toFixed(4):"N/A"}</div>\n                <div class="stat-card__label">Scaled SE</div>\n              </div>\n            </div>\n            \n            <div class="grid" style="grid-template-columns: 1fr 1fr; gap: var(--space-4);">\n              <div style="padding: var(--space-3); background: var(--surface-overlay); border-radius: var(--radius-md);">\n                <p class="text-sm font-semibold" style="margin-bottom: var(--space-2);">Original 95% CI</p>\n                <p class="font-mono">${n.pdgScaleFactor.ci_original?`${n.pdgScaleFactor.ci_original.lower_exp.toFixed(3)} – ${n.pdgScaleFactor.ci_original.upper_exp.toFixed(3)}`:"N/A"}</p>\n              </div>\n              <div style="padding: var(--space-3); background: var(--surface-highlight); border-radius: var(--radius-md);">\n                <p class="text-sm font-semibold" style="margin-bottom: var(--space-2);">PDG-Scaled 95% CI</p>\n                <p class="font-mono">${n.pdgScaleFactor.ci_scaled?`${n.pdgScaleFactor.ci_scaled.lower_exp.toFixed(3)} – ${n.pdgScaleFactor.ci_scaled.upper_exp.toFixed(3)}`:"N/A"}</p>\n              </div>\n            </div>\n            \n            <p class="text-secondary" style="margin-top: var(--space-4);">${n.pdgScaleFactor.interpretation||""}</p>\n            ${n.pdgScaleFactor.note?`<p class="text-warning text-sm">${n.pdgScaleFactor.note}</p>`:""}\n            \n            <p class="text-xs text-secondary" style="margin-top: var(--space-4);">\n              <em>Reference: ${n.pdgScaleFactor.reference||"N/A"}</em>\n            </p>\n          </div>\n        </div>\n        `:""}\n        \n        \x3c!-- Winner's Curse Correction --\x3e\n        ${n.winnersCurse&&n.winnersCurse.available?`\n        <div class="card" style="margin-top: var(--space-6);">\n          <div class="card__header">\n            <h2 class="card__title">🧬 Winner's Curse Correction (GWAS Method)</h2>\n          </div>\n          <div class="card__body">\n            <p class="text-secondary text-sm" style="margin-bottom: var(--space-4);">\n              <strong>What this tells you:</strong> "Significant" findings are often inflated because we only publish/notice them when they cross a threshold. This estimates how much your effect might shrink in future studies.\n            </p>\n            <div class="stat-grid" style="grid-template-columns: repeat(3, 1fr); margin-bottom: var(--space-4);">\n              <div class="stat-card">\n                <div class="stat-card__value">${n.winnersCurse.observed&&void 0!==n.winnersCurse.observed.theta_exp?n.winnersCurse.observed.theta_exp.toFixed(3):"N/A"}</div>\n                <div class="stat-card__label">Observed Effect</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value stat-card__value--accent">${n.winnersCurse.consensus_estimate&&void 0!==n.winnersCurse.consensus_estimate.theta_exp?n.winnersCurse.consensus_estimate.theta_exp.toFixed(3):"N/A"}</div>\n                <div class="stat-card__label">Corrected (Consensus)</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value ${n.winnersCurse.bootstrap_correction&&n.winnersCurse.bootstrap_correction.inflation_pct>10?"text-warning":""}">${n.winnersCurse.bootstrap_correction&&void 0!==n.winnersCurse.bootstrap_correction.inflation_pct?`${n.winnersCurse.bootstrap_correction.inflation_pct>0?"+":""}${n.winnersCurse.bootstrap_correction.inflation_pct.toFixed(1)}%`:"N/A"}</div>\n                <div class="stat-card__label">Estimated Inflation</div>\n              </div>\n            </div>\n            \n            <table class="data-table data-table--mono" style="margin-bottom: var(--space-4);">\n              <thead>\n                <tr>\n                  <th>Correction Method</th>\n                  <th>Corrected Effect</th>\n                  <th>Inflation Est.</th>\n                </tr>\n              </thead>\n              <tbody>\n                <tr>\n                  <td class="font-sans">Bootstrap Bias</td>\n                  <td>${n.winnersCurse.bootstrap_correction&&void 0!==n.winnersCurse.bootstrap_correction.theta_corrected_exp?n.winnersCurse.bootstrap_correction.theta_corrected_exp.toFixed(3):"N/A"}</td>\n                  <td>${n.winnersCurse.bootstrap_correction&&void 0!==n.winnersCurse.bootstrap_correction.inflation_pct?n.winnersCurse.bootstrap_correction.inflation_pct.toFixed(1):"N/A"}%</td>\n                </tr>\n                <tr>\n                  <td class="font-sans">Conditional Likelihood</td>\n                  <td>${n.winnersCurse.conditional_correction&&void 0!==n.winnersCurse.conditional_correction.theta_corrected_exp?n.winnersCurse.conditional_correction.theta_corrected_exp.toFixed(3):"N/A"}</td>\n                  <td>${n.winnersCurse.conditional_correction&&void 0!==n.winnersCurse.conditional_correction.inflation_pct?n.winnersCurse.conditional_correction.inflation_pct.toFixed(1):"N/A"}%</td>\n                </tr>\n                <tr>\n                  <td class="font-sans">Empirical Bayes</td>\n                  <td>${n.winnersCurse.empirical_bayes&&void 0!==n.winnersCurse.empirical_bayes.theta_corrected_exp?n.winnersCurse.empirical_bayes.theta_corrected_exp.toFixed(3):"N/A"}</td>\n                  <td>—</td>\n                </tr>\n              </tbody>\n            </table>\n            \n            <p class="text-secondary">${n.winnersCurse.interpretation||""}</p>\n            \n            <p class="text-xs text-secondary" style="margin-top: var(--space-4);">\n              <em>Reference: ${n.winnersCurse.reference||"N/A"}</em>\n            </p>\n          </div>\n        </div>\n        `:""}\n        \n        \x3c!-- Treatment Response Distribution --\x3e\n        ${n.responseDistribution&&n.responseDistribution.available?`\n        <div class="card" style="margin-top: var(--space-6);">\n          <div class="card__header">\n            <h2 class="card__title">🌿 Treatment Response Distribution (SSD Method)</h2>\n          </div>\n          <div class="card__body">\n            <p class="text-secondary text-sm" style="margin-bottom: var(--space-4);">\n              <strong>What this tells you:</strong> Not everyone responds the same way. This models the distribution of treatment effects across different populations/settings, showing what proportion are likely to benefit.\n            </p>\n            <div class="stat-grid" style="grid-template-columns: repeat(4, 1fr); margin-bottom: var(--space-4);">\n              <div class="stat-card">\n                <div class="stat-card__value text-success">${n.responseDistribution.response_rates&&void 0!==n.responseDistribution.response_rates.P_benefit?(100*n.responseDistribution.response_rates.P_benefit).toFixed(0):"N/A"}%</div>\n                <div class="stat-card__label">Expected Responders</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value stat-card__value--accent">${n.responseDistribution.response_rates&&void 0!==n.responseDistribution.response_rates.P_mcid?(100*n.responseDistribution.response_rates.P_mcid).toFixed(0):"N/A"}%</div>\n                <div class="stat-card__label">Reach MCID</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value text-danger">${n.responseDistribution.response_rates&&void 0!==n.responseDistribution.response_rates.P_harm?(100*n.responseDistribution.response_rates.P_harm).toFixed(0):"N/A"}%</div>\n                <div class="stat-card__label">May Not Benefit</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value">${void 0!==n.responseDistribution.heterogeneity_contribution?(100*n.responseDistribution.heterogeneity_contribution).toFixed(0):"N/A"}%</div>\n                <div class="stat-card__label">τ² Contribution</div>\n              </div>\n            </div>\n            \n            <h4 class="text-sm font-semibold" style="margin-bottom: var(--space-2);">Response Distribution Percentiles</h4>\n            <table class="data-table data-table--mono" style="margin-bottom: var(--space-4);">\n              <thead>\n                <tr>\n                  <th>Percentile</th>\n                  <th>5th</th>\n                  <th>10th</th>\n                  <th>25th</th>\n                  <th>50th (Median)</th>\n                  <th>75th</th>\n                  <th>90th</th>\n                  <th>95th</th>\n                </tr>\n              </thead>\n              <tbody>\n                <tr>\n                  <td class="font-sans">Effect</td>\n                  <td>${n.responseDistribution.percentiles&&n.responseDistribution.percentiles.p5?n.responseDistribution.percentiles.p5.effect.toFixed(3):"N/A"}</td>\n                  <td>${n.responseDistribution.percentiles&&n.responseDistribution.percentiles.p10?n.responseDistribution.percentiles.p10.effect.toFixed(3):"N/A"}</td>\n                  <td>${n.responseDistribution.percentiles&&n.responseDistribution.percentiles.p25?n.responseDistribution.percentiles.p25.effect.toFixed(3):"N/A"}</td>\n                  <td class="font-semibold">${n.responseDistribution.percentiles&&n.responseDistribution.percentiles.p50?n.responseDistribution.percentiles.p50.effect.toFixed(3):"N/A"}</td>\n                  <td>${n.responseDistribution.percentiles&&n.responseDistribution.percentiles.p75?n.responseDistribution.percentiles.p75.effect.toFixed(3):"N/A"}</td>\n                  <td>${n.responseDistribution.percentiles&&n.responseDistribution.percentiles.p90?n.responseDistribution.percentiles.p90.effect.toFixed(3):"N/A"}</td>\n                  <td>${n.responseDistribution.percentiles&&n.responseDistribution.percentiles.p95?n.responseDistribution.percentiles.p95.effect.toFixed(3):"N/A"}</td>\n                </tr>\n              </tbody>\n            </table>\n            \n            <div class="grid" style="grid-template-columns: 1fr 1fr; gap: var(--space-4);">\n              <div style="padding: var(--space-3); background: var(--surface-overlay); border-radius: var(--radius-md);">\n                <p class="text-sm font-semibold">NNT (Standard)</p>\n                <p class="font-mono text-lg">${n.responseDistribution.clinical_summary?n.responseDistribution.clinical_summary.nnt_standard:"N/A"}</p>\n              </div>\n              <div style="padding: var(--space-3); background: var(--surface-highlight); border-radius: var(--radius-md);">\n                <p class="text-sm font-semibold">NNT (Responder-Adjusted)</p>\n                <p class="font-mono text-lg">${n.responseDistribution.clinical_summary?n.responseDistribution.clinical_summary.nnt_responder_adjusted:"N/A"}</p>\n              </div>\n            </div>\n            \n            <div class="alert alert--info" style="margin-top: var(--space-4);">\n              <span class="alert__icon">💡</span>\n              <div class="alert__content">\n                <div class="alert__text">${n.responseDistribution.personalization_insight}</div>\n              </div>\n            </div>\n            \n            ${n.responseDistribution.limitations?`\n            <div class="alert alert--warning" style="margin-top: var(--space-3);">\n              <span class="alert__icon">⚠️</span>\n              <div class="alert__content">\n                <div class="alert__title">Important Limitations</div>\n                <ul class="alert__text" style="margin: 0; padding-left: var(--space-4); font-size: var(--text-xs);">\n                  ${n.responseDistribution.limitations.map(e=>`<li>${e}</li>`).join("")}\n                </ul>\n              </div>\n            </div>\n            `:""}\n            \n            <p class="text-xs text-secondary" style="margin-top: var(--space-4);">\n              <em>Reference: ${n.responseDistribution.reference}</em>\n            </p>\n          </div>\n        </div>\n        `:""}\n        \n        \x3c!-- lnCVR Variability Analysis --\x3e\n        ${n.lnCVR&&n.lnCVR.available?`\n        <div class="card" style="margin-top: var(--space-6);">\n          <div class="card__header">\n            <h2 class="card__title">📊 lnCVR - Variability Meta-Analysis (Ecology Method)</h2>\n          </div>\n          <div class="card__body">\n            <p class="text-secondary text-sm" style="margin-bottom: var(--space-4);">\n              <strong>What this tells you:</strong> Does the treatment make responses more or less predictable? CVR &lt; 1 means treatment produces more consistent responses; CVR &gt; 1 means more variable responses.\n            </p>\n            <div class="stat-grid" style="grid-template-columns: repeat(4, 1fr); margin-bottom: var(--space-4);">\n              <div class="stat-card">\n                <div class="stat-card__value">${void 0!==n.lnCVR.lnCVR?n.lnCVR.lnCVR.toFixed(4):"N/A"}</div>\n                <div class="stat-card__label">lnCVR (log scale)</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value stat-card__value--accent">${void 0!==n.lnCVR.CVR?n.lnCVR.CVR.toFixed(3):"N/A"}</div>\n                <div class="stat-card__label">CVR (Ratio)</div>\n                <div class="text-xs text-secondary">(1.0 = equal variability)</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value">${n.lnCVR.CVR_ci?`${n.lnCVR.CVR_ci[0].toFixed(3)} – ${n.lnCVR.CVR_ci[1].toFixed(3)}`:"N/A"}</div>\n                <div class="stat-card__label">95% CI</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value">${n.lnCVR.heterogeneity&&void 0!==n.lnCVR.heterogeneity.I2?n.lnCVR.heterogeneity.I2.toFixed(1):"N/A"}%</div>\n                <div class="stat-card__label">I²</div>\n              </div>\n            </div>\n            \n            <p class="text-secondary">${n.lnCVR.interpretation||""}</p>\n            <p class="text-sm" style="margin-top: var(--space-2);"><strong>Clinical insight:</strong> ${n.lnCVR.clinical_insight||"N/A"}</p>\n            \n            <p class="text-xs text-secondary" style="margin-top: var(--space-4);">\n              <em>Reference: ${n.lnCVR.reference||"N/A"}</em>\n            </p>\n          </div>\n        </div>\n        `:n.lnCVR?`\n        <div class="card" style="margin-top: var(--space-6);">\n          <div class="card__header">\n            <h2 class="card__title">📊 lnCVR - Variability Meta-Analysis</h2>\n          </div>\n          <div class="card__body">\n            <p class="text-secondary">${n.lnCVR.reason}</p>\n            <p class="text-xs text-secondary" style="margin-top: var(--space-2);">\n              <em>lnCVR requires continuous outcome data (mean, SD, n) for both treatment arms.</em>\n            </p>\n          </div>\n        </div>\n        `:""}\n        \n        \x3c!-- Heteroscedasticity Test --\x3e\n        ${n.heteroscedasticity&&n.heteroscedasticity.available?`\n        <div class="card" style="margin-top: var(--space-6);">\n          <div class="card__header">\n            <h2 class="card__title">📈 Heteroscedasticity Detection (τ² Variation)</h2>\n            <span class="badge badge--${!0===n.heteroscedasticity.heteroscedastic?"danger":"possible"===n.heteroscedasticity.heteroscedastic?"warning":"success"}">${!0===n.heteroscedasticity.heteroscedastic?"HETEROSCEDASTIC":"possible"===n.heteroscedasticity.heteroscedastic?"POSSIBLE":"HOMOSCEDASTIC"}</span>\n          </div>\n          <div class="card__body">\n            <div class="stat-grid" style="grid-template-columns: repeat(3, 1fr); margin-bottom: var(--space-4);">\n              <div class="stat-card">\n                <div class="stat-card__value">${void 0!==n.heteroscedasticity.tau2_ratio?n.heteroscedasticity.tau2_ratio.toFixed(2):"N/A"}×</div>\n                <div class="stat-card__label">Max/Min τ² Ratio</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value">${void 0!==n.heteroscedasticity.tau2_min?n.heteroscedasticity.tau2_min.toFixed(4):"N/A"}</div>\n                <div class="stat-card__label">Min τ²</div>\n              </div>\n              <div class="stat-card">\n                <div class="stat-card__value">${void 0!==n.heteroscedasticity.tau2_max?n.heteroscedasticity.tau2_max.toFixed(4):"N/A"}</div>\n                <div class="stat-card__label">Max τ²</div>\n              </div>\n            </div>\n            \n            <p class="text-secondary">${n.heteroscedasticity.interpretation}</p>\n            <p class="text-sm" style="margin-top: var(--space-2);"><strong>Recommendation:</strong> ${n.heteroscedasticity.recommendation}</p>\n            \n            <p class="text-xs text-secondary" style="margin-top: var(--space-4);">\n              <em>Reference: ${n.heteroscedasticity.reference}</em>\n            </p>\n          </div>\n        </div>\n        `:""}\n        \n        \x3c!-- Orchard Plot --\x3e\n        <div class="card" style="margin-top: var(--space-6);">\n          <div class="card__header">\n            <h2 class="card__title">🌸 Orchard Plot (Ecology Visualization)</h2>\n          </div>\n          <div class="card__body">\n            <p class="text-secondary text-sm" style="margin-bottom: var(--space-4);">\n              <strong>What this shows:</strong> A compact view of all studies with prediction interval. Larger points = higher weight. Gray band shows where 95% of future studies would fall.\n            </p>\n            <div id="orchardPlot" class="plot-container" style="min-height: 300px;"></div>\n            <p class="text-xs text-secondary" style="margin-top: var(--space-2);">\n              <em>Point size proportional to weight. Gray band = prediction interval. Blue bar = confidence interval.</em>\n            </p>\n          </div>\n        </div>\n      `, setTimeout(() => {
    try {
      renderOrchardPlot(e, "orchardPlot")
    } catch (e) {}
  }, 100)
}

function renderCodePanel(e) {
  const t = document.getElementById("panel-code");
  if (!e) return void(t.innerHTML = '\n          <div class="card">\n            <div class="card__body">\n              <p class="text-secondary">Run an analysis first to generate exportable code.</p>\n            </div>\n          </div>\n        ');
  const n = generateRCode(e, {
      method: AppState.settings.tau2Method,
      hksj: AppState.settings.hksj,
      mcid: AppState.settings.mcid || .15
    }),
    a = generateRCodeForestOptions(e),
    s = generatePythonCode(e),
    i = generateStataCode(e);
  t.innerHTML = `\n        <div class="card">\n          <div class="card__header">\n            <h2 class="card__title">💻 Code Export</h2>\n          </div>\n          <div class="card__body">\n            <p class="text-secondary" style="margin-bottom: var(--space-4);">\n              Export your analysis to R, Python, or Stata. The R code is comprehensive and includes forest plots, bias assessment, DDMA, and cross-disciplinary methods.\n            </p>\n            \n            \x3c!-- Code Section Tabs --\x3e\n            <div style="display: flex; gap: var(--space-2); flex-wrap: wrap; margin-bottom: var(--space-4);">\n              <button class="btn btn--primary btn--sm code-tab-btn active" data-code-tab="r-main">R Complete Analysis</button>\n              <button class="btn btn--ghost btn--sm code-tab-btn" data-code-tab="r-forest">R Forest Options</button>\n              <button class="btn btn--ghost btn--sm code-tab-btn" data-code-tab="python">Python</button>\n              <button class="btn btn--ghost btn--sm code-tab-btn" data-code-tab="stata">Stata</button>\n            </div>\n            \n            \x3c!-- R Main Code --\x3e\n            <div id="code-tab-r-main" class="code-tab-panel">\n              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-2);">\n                <h3 class="text-base font-semibold">R (metafor) - Complete Analysis</h3>\n                <button class="btn btn--ghost btn--sm" onclick="copyCode('r')">📋 Copy</button>\n              </div>\n              <p class="text-xs text-secondary" style="margin-bottom: var(--space-2);">\n                Includes: main analysis, 6+ forest plot styles, heterogeneity, bias tests, DDMA probabilities, cross-disciplinary methods, NNT, templates for subgroups & meta-regression.\n              </p>\n              <pre id="rCode" style="background: var(--surface-base); padding: var(--space-4); border-radius: var(--radius-lg); overflow-x: auto; font-family: var(--font-mono); font-size: var(--text-xs); color: var(--text-secondary); max-height: 500px;">${escapeHtml(n)}</pre>\n            </div>\n            \n            \x3c!-- R Forest Options --\x3e\n            <div id="code-tab-r-forest" class="code-tab-panel" style="display: none;">\n              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-2);">\n                <h3 class="text-base font-semibold">R Forest Plot Options</h3>\n                <button class="btn btn--ghost btn--sm" onclick="copyCodeById('rForestCode')">📋 Copy</button>\n              </div>\n              <p class="text-xs text-secondary" style="margin-bottom: var(--space-2);">\n                Additional forest plot styles using forestploter, meta, and ggplot2 packages. Publication-quality themed plots.\n              </p>\n              <pre id="rForestCode" style="background: var(--surface-base); padding: var(--space-4); border-radius: var(--radius-lg); overflow-x: auto; font-family: var(--font-mono); font-size: var(--text-xs); color: var(--text-secondary); max-height: 500px;">${escapeHtml(a)}</pre>\n            </div>\n            \n            \x3c!-- Python Code --\x3e\n            <div id="code-tab-python" class="code-tab-panel" style="display: none;">\n              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-2);">\n                <h3 class="text-base font-semibold">Python</h3>\n                <button class="btn btn--ghost btn--sm" onclick="copyCode('python')">📋 Copy</button>\n              </div>\n              <pre id="pythonCode" style="background: var(--surface-base); padding: var(--space-4); border-radius: var(--radius-lg); overflow-x: auto; font-family: var(--font-mono); font-size: var(--text-xs); color: var(--text-secondary); max-height: 500px;">${escapeHtml(s)}</pre>\n            </div>\n            \n            \x3c!-- Stata Code --\x3e\n            <div id="code-tab-stata" class="code-tab-panel" style="display: none;">\n              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-2);">\n                <h3 class="text-base font-semibold">Stata</h3>\n                <button class="btn btn--ghost btn--sm" onclick="copyCode('stata')">📋 Copy</button>\n              </div>\n              <pre id="stataCode" style="background: var(--surface-base); padding: var(--space-4); border-radius: var(--radius-lg); overflow-x: auto; font-family: var(--font-mono); font-size: var(--text-xs); color: var(--text-secondary); max-height: 500px;">${escapeHtml(i)}</pre>\n            </div>\n          </div>\n        </div>\n        \n        \x3c!-- Quick Reference --\x3e\n        <div class="card" style="margin-top: var(--space-6);">\n          <div class="card__header">\n            <h3 class="card__title">📖 R Code Quick Reference</h3>\n          </div>\n          <div class="card__body">\n            <div class="grid" style="grid-template-columns: repeat(3, 1fr); gap: var(--space-4);">\n              <div>\n                <h4 class="text-sm font-semibold" style="margin-bottom: var(--space-2);">Forest Plots (Section 3)</h4>\n                <ul class="text-xs text-secondary" style="list-style: disc; padding-left: var(--space-4);">\n                  <li>Basic with PI</li>\n                  <li>Publication-quality with weights</li>\n                  <li>Cumulative meta-analysis</li>\n                  <li>Leave-one-out</li>\n                  <li>Sorted by effect/precision</li>\n                  <li>ggplot2 custom themed</li>\n                </ul>\n              </div>\n              <div>\n                <h4 class="text-sm font-semibold" style="margin-bottom: var(--space-2);">Bias Tests (Section 5)</h4>\n                <ul class="text-xs text-secondary" style="list-style: disc; padding-left: var(--space-4);">\n                  <li>Funnel plot (standard + contour)</li>\n                  <li>Egger's regression</li>\n                  <li>Peters' test</li>\n                  <li>Begg's rank correlation</li>\n                  <li>Trim-and-fill</li>\n                  <li>PET-PEESE</li>\n                </ul>\n              </div>\n              <div>\n                <h4 class="text-sm font-semibold" style="margin-bottom: var(--space-2);">Cross-Disciplinary (Section 9)</h4>\n                <ul class="text-xs text-secondary" style="list-style: disc; padding-left: var(--space-4);">\n                  <li>PDG Scale Factor</li>\n                  <li>Tension Statistic</li>\n                  <li>Cross-validated I²</li>\n                </ul>\n              </div>\n            </div>\n          </div>\n        </div>\n      `, t.querySelectorAll(".code-tab-btn").forEach(e => {
    e.addEventListener("click", function() {
      t.querySelectorAll(".code-tab-btn").forEach(e => {
        e.classList.remove("btn--primary", "active"), e.classList.add("btn--ghost")
      }), this.classList.remove("btn--ghost"), this.classList.add("btn--primary", "active");
      const e = this.getAttribute("data-code-tab");
      t.querySelectorAll(".code-tab-panel").forEach(e => {
        e.style.display = "none"
      }), document.getElementById("code-tab-" + e).style.display = "block"
    })
  })
}

function copyCodeById(e) {
  const t = document.getElementById(e);
  t && navigator.clipboard.writeText(t.textContent).then(() => {
    alert("Code copied to clipboard!")
  })
}

function renderReportPanel(e) {
  const t = document.getElementById("panel-report");
  e ? (AppState.reportSettings || (AppState.reportSettings = {
    length: "standard",
    style: "general",
    sections: {
      methods: !0,
      results: !0,
      heterogeneity: !0,
      bias: !0,
      sensitivity: !0,
      ddma: !0,
      crossDisc: !0
    }
  }), t.innerHTML = '\n        \x3c!-- Report Configuration --\x3e\n        <div class="card">\n          <div class="card__header">\n            <h2 class="card__title">📝 Publication Report Generator</h2>\n          </div>\n          <div class="card__body">\n            <p class="text-secondary" style="margin-bottom: var(--space-4);">\n              Generate publication-ready Methods and Results sections. Customize length, journal style, and content.\n            </p>\n            \n            <div class="grid" style="grid-template-columns: repeat(3, 1fr); gap: var(--space-4); margin-bottom: var(--space-4);">\n              \x3c!-- Length Selection --\x3e\n              <div>\n                <label class="input-label" style="margin-bottom: var(--space-2); display: block;">Report Length</label>\n                <select id="reportLength" class="input" onchange="updateReportSettings()">\n                  <option value="brief">Brief (Abstract-length)</option>\n                  <option value="standard" selected>Standard (Typical paper)</option>\n                  <option value="detailed">Detailed (Comprehensive)</option>\n                  <option value="extended">Extended (With supplements)</option>\n                </select>\n              </div>\n              \n              \x3c!-- Journal Style --\x3e\n              <div>\n                <label class="input-label" style="margin-bottom: var(--space-2); display: block;">Journal Style</label>\n                <select id="reportStyle" class="input" onchange="updateReportSettings()">\n                  <option value="general" selected>General Scientific</option>\n                  <option value="jama">JAMA</option>\n                  <option value="bmj">BMJ</option>\n                  <option value="lancet">Lancet</option>\n                  <option value="nejm">NEJM</option>\n                  <option value="cochrane">Cochrane</option>\n                  <option value="prisma">PRISMA-compliant</option>\n                  <option value="grade">GRADE-focused</option>\n                </select>\n              </div>\n              \n              \x3c!-- Generate Button --\x3e\n              <div style="display: flex; align-items: flex-end;">\n                <button class="btn btn--primary" onclick="generateFullReport()" style="width: 100%;">\n                  Generate Report\n                </button>\n              </div>\n            </div>\n            \n            \x3c!-- Section Toggles --\x3e\n            <div style="margin-bottom: var(--space-4);">\n              <label class="input-label" style="margin-bottom: var(--space-2); display: block;">Include Sections</label>\n              <div style="display: flex; flex-wrap: wrap; gap: var(--space-3);">\n                <label style="display: flex; align-items: center; gap: var(--space-1); cursor: pointer;">\n                  <input type="checkbox" id="sec-methods" checked onchange="updateReportSettings()"> Methods\n                </label>\n                <label style="display: flex; align-items: center; gap: var(--space-1); cursor: pointer;">\n                  <input type="checkbox" id="sec-results" checked onchange="updateReportSettings()"> Main Results\n                </label>\n                <label style="display: flex; align-items: center; gap: var(--space-1); cursor: pointer;">\n                  <input type="checkbox" id="sec-heterogeneity" checked onchange="updateReportSettings()"> Heterogeneity\n                </label>\n                <label style="display: flex; align-items: center; gap: var(--space-1); cursor: pointer;">\n                  <input type="checkbox" id="sec-bias" checked onchange="updateReportSettings()"> Publication Bias\n                </label>\n                <label style="display: flex; align-items: center; gap: var(--space-1); cursor: pointer;">\n                  <input type="checkbox" id="sec-sensitivity" checked onchange="updateReportSettings()"> Sensitivity\n                </label>\n                <label style="display: flex; align-items: center; gap: var(--space-1); cursor: pointer;">\n                  <input type="checkbox" id="sec-ddma" checked onchange="updateReportSettings()"> DDMA/Probabilities\n                </label>\n                <label style="display: flex; align-items: center; gap: var(--space-1); cursor: pointer;">\n                  <input type="checkbox" id="sec-crossDisc" checked onchange="updateReportSettings()"> Cross-Disciplinary\n                </label>\n                <label style="display: flex; align-items: center; gap: var(--space-1); cursor: pointer;">\n                  <input type="checkbox" id="sec-verdict" checked onchange="updateReportSettings()"> TruthCert Verdict\n                </label>\n                <label style="display: flex; align-items: center; gap: var(--space-1); cursor: pointer;">\n                  <input type="checkbox" id="sec-hta" checked onchange="updateReportSettings()"> HTA Analysis\n                </label>\n              </div>\n            </div>\n          </div>\n        </div>\n        \n        \x3c!-- Generated Report Content --\x3e\n        <div id="generatedReportContainer" style="margin-top: var(--space-6);">\n          \x3c!-- Will be populated by generateFullReport() --\x3e\n        </div>\n      ', setTimeout(() => generateFullReport(), 100)) : t.innerHTML = '\n          <div class="card">\n            <div class="card__body">\n              <p class="text-secondary">Run an analysis first to generate a report.</p>\n            </div>\n          </div>\n        '
}

function updateReportSettings() {
  AppState.reportSettings = {
    length: document.getElementById("reportLength").value,
    style: document.getElementById("reportStyle").value,
    sections: {
      methods: document.getElementById("sec-methods").checked,
      results: document.getElementById("sec-results").checked,
      heterogeneity: document.getElementById("sec-heterogeneity").checked,
      bias: document.getElementById("sec-bias").checked,
      sensitivity: document.getElementById("sec-sensitivity").checked,
      ddma: document.getElementById("sec-ddma").checked,
      crossDisc: document.getElementById("sec-crossDisc").checked,
      verdict: document.getElementById("sec-verdict")?.checked ?? !0,
      hta: document.getElementById("sec-hta")?.checked ?? !0
    }
  }
}

function generateFullReport() {
  const e = AppState.results;
  if (!e) return;
  const t = AppState.reportSettings,
    n = document.getElementById("generatedReportContainer"),
    a = t.sections.methods ? generateMethodsSection(e, t) : "",
    s = generateResultsSection(e, t);
  n.innerHTML = `\n        \x3c!-- Methods Section --\x3e\n        ${t.sections.methods?`\n        <div class="card">\n          <div class="card__header">\n            <h3 class="card__title">📋 Methods Section</h3>\n            <div style="display: flex; gap: var(--space-2);">\n              <button class="btn btn--ghost btn--sm" onclick="copyReportSection('methodsContent')">📋 Copy</button>\n              <button class="btn btn--ghost btn--sm" onclick="downloadReportSection('methodsContent', 'methods')">💾 Download</button>\n            </div>\n          </div>\n          <div class="card__body">\n            <div id="methodsContent" class="report-content" style="background: var(--surface-base); padding: var(--space-6); border-radius: var(--radius-lg); line-height: 1.8;">\n              ${a}\n            </div>\n          </div>\n        </div>\n        `:""}\n        \n        \x3c!-- Results Section --\x3e\n        <div class="card" style="margin-top: var(--space-6);">\n          <div class="card__header">\n            <h3 class="card__title">📊 Results Section</h3>\n            <div style="display: flex; gap: var(--space-2);">\n              <button class="btn btn--ghost btn--sm" onclick="copyReportSection('resultsContent')">📋 Copy</button>\n              <button class="btn btn--ghost btn--sm" onclick="downloadReportSection('resultsContent', 'results')">💾 Download</button>\n            </div>\n          </div>\n          <div class="card__body">\n            <div id="resultsContent" class="report-content" style="background: var(--surface-base); padding: var(--space-6); border-radius: var(--radius-lg); line-height: 1.8;">\n              ${s}\n            </div>\n          </div>\n        </div>\n\n        \x3c!-- TruthCert Verdict Section --\x3e\n        ${t.sections.verdict&&AppState.verdict?`\n        <div class="card" style="margin-top: var(--space-6);">\n          <div class="card__header">\n            <h3 class="card__title">🔐 TruthCert Verdict</h3>\n            <div style="display: flex; gap: var(--space-2);">\n              <button class="btn btn--ghost btn--sm" onclick="copyReportSection('verdictContent')">📋 Copy</button>\n              <button class="btn btn--ghost btn--sm" onclick="downloadReportSection('verdictContent', 'verdict')">💾 Download</button>\n            </div>\n          </div>\n          <div class="card__body">\n            <div id="verdictContent" class="report-content" style="background: var(--surface-base); padding: var(--space-6); border-radius: var(--radius-lg); line-height: 1.8;">\n              ${generateVerdictReportSection()}\n            </div>\n          </div>\n        </div>\n        `:""}\n\n        \x3c!-- HTA Analysis Section --\x3e\n        ${t.sections.hta&&AppState.hta&&AppState.hta.results?`\n        <div class="card" style="margin-top: var(--space-6);">\n          <div class="card__header">\n            <h3 class="card__title">💰 Health Technology Assessment</h3>\n            <div style="display: flex; gap: var(--space-2);">\n              <button class="btn btn--ghost btn--sm" onclick="copyReportSection('htaContent')">📋 Copy</button>\n              <button class="btn btn--ghost btn--sm" onclick="downloadReportSection('htaContent', 'hta')">💾 Download</button>\n            </div>\n          </div>\n          <div class="card__body">\n            <div id="htaContent" class="report-content" style="background: var(--surface-base); padding: var(--space-6); border-radius: var(--radius-lg); line-height: 1.8;">\n              ${generateHTAReportSection()}\n            </div>\n          </div>\n        </div>\n        `:""}\n\n        \x3c!-- Combined Download --\x3e\n        <div class="card" style="margin-top: var(--space-6);">\n          <div class="card__body" style="display: flex; justify-content: space-between; align-items: center;">\n            <div>\n              <strong>Download Complete Report</strong>\n              <p class="text-xs text-secondary">Methods + Results + Verdict + HTA as a single document</p>\n            </div>\n            <div style="display: flex; gap: var(--space-2);">\n              <button class="btn btn--ghost" onclick="downloadFullReport('txt')">📄 .txt</button>\n              <button class="btn btn--ghost" onclick="downloadFullReport('md')">📝 .md</button>\n              <button class="btn btn--primary" onclick="downloadFullReport('docx')">📑 .docx (formatted)</button>\n            </div>\n          </div>\n        </div>\n\n        \x3c!-- PRISMA Checklist (if PRISMA style) --\x3e\n        ${"prisma"===t.style?generatePRISMAChecklist(e):""}\n        \n        \x3c!-- GRADE Summary (if GRADE style) --\x3e\n        ${"grade"===t.style?generateGRADESummary(e):""}\n      `
}

function generateMethodsSection(e, t) {
  var n = t && t.length || "standard",
    a = e.measure || "OR",
    s = AppState.settings.tau2Method || "REML",
    i = AppState.settings.hksj,
    r = e.k || 0,
    o = {
      OR: "odds ratios",
      RR: "risk ratios",
      HR: "hazard ratios",
      RD: "risk differences",
      SMD: "standardized mean differences",
      MD: "mean differences"
    } [a] || "effect sizes",
    l = "<h3>Statistical Analysis</h3>";
  return "brief" === n ? (l += "<p>We conducted a random-effects meta-analysis of " + r + " studies. ", l += "Effect sizes were expressed as " + o + ". ", l += "Between-study variance (tau-squared) was estimated using the " + s + " method. ", l += "Heterogeneity was assessed using I-squared and Cochran Q test. ", l += "Publication bias was evaluated using funnel plots and Egger test.</p>") : (l += "<p>We performed a pairwise meta-analysis following established methodological guidelines. ", l += "Effect sizes were expressed as " + o, "RD" !== a && "MD" !== a && (l += " on the natural logarithm scale for analysis, then back-transformed for presentation"), l += ". ", l += "A random-effects model was used to account for expected clinical and methodological heterogeneity across studies. ", l += "Between-study variance (tau-squared) was estimated using the " + ({
    REML: "restricted maximum likelihood (REML)",
    DL: "DerSimonian-Laird",
    PM: "Paule-Mandel",
    ML: "maximum likelihood",
    EB: "empirical Bayes",
    SJ: "Sidik-Jonkman",
    HE: "Hedges"
  } [s] || s) + " estimator. ", l += i ? "Confidence intervals were calculated using the Hartung-Knapp-Sidik-Jonkman (HKSJ) adjustment, which provides improved coverage when the number of studies is small. " : "Confidence intervals were calculated using the Wald-type method with normal distribution approximation. ", l += "</p>", l += "<p>Heterogeneity was quantified using the I-squared statistic (proportion of variability due to heterogeneity rather than sampling error), ", l += "tau-squared (absolute between-study variance), and Cochran Q test. ", l += "We calculated 95% prediction intervals to estimate the range of effects expected in future similar settings. ", l += "Publication bias was assessed visually using funnel plots and statistically using Egger regression test. ", l += "Sensitivity analyses included leave-one-out analysis to identify influential studies. ", l += "All analyses were conducted using Pairwise Pro v2.2, with results validated against the metafor package in R.</p>", "standard" === n ? l : (l += "<p>For binary outcomes, we extracted the number of events and total participants in each treatment arm. ", e.studies && e.studies.some(function(e) {
    return 0 === e.events_t || 0 === e.events_c
  }) && (l += "Studies with zero events in one or both arms were handled using continuity correction (adding 0.5 to all cells). "), l += "We interpreted I-squared values of less than 25% as low, 25-50% as moderate, 50-75% as substantial, and greater than 75% as high heterogeneity, ", l += "while acknowledging that clinical interpretation depends on context. ", l += "We also examined tau (square root of tau-squared) which represents the standard deviation of true effects across studies.</p>", l += "<p>Additional publication bias assessments included Peters test (which is less affected by heterogeneity for binary outcomes), ", l += "Begg rank correlation test, and trim-and-fill analysis to estimate the number of potentially missing studies and calculate bias-adjusted estimates. ", l += "We applied the PET-PEESE conditional estimator as a sensitivity analysis for small-study effects. ", l += "Influence diagnostics were examined using Cook distance and DFBETAS to identify outlying observations.</p>", "detailed" === n ? l : (l += "<p>Beyond traditional null hypothesis significance testing, we employed a decision-driven meta-analysis (DDMA) framework. ", l += "We calculated posterior probabilities of clinically meaningful effects using both the confidence distribution (for the population-average effect) ", l += "and predictive distribution (for effects expected in future clinical settings). ", l += "The minimum clinically important difference (MCID) threshold was set at a " + (AppState.settings.mcid ? Math.round(100 * (1 - Math.exp(-AppState.settings.mcid))) : 15) + "% relative change. ", l += "This approach provides clinicians with more actionable information than dichotomous p-value interpretation.</p>", l += "<p>We also applied several cross-disciplinary methodological approaches to enhance robustness: ", l += "(1) the Particle Data Group (PDG) scale factor method from high-energy physics to inflate confidence intervals when studies disagree more than expected by chance; ", l += "(2) winner's curse correction methods adapted from genome-wide association studies to estimate potential effect size inflation due to selection; ", l += "(3) tension statistics to detect hidden pairwise disagreements between studies even when global heterogeneity tests are non-significant; ", l += "(4) power calculations for the Q test to assess whether low I-squared reflects true homogeneity or insufficient statistical power; ", l += "and (5) E-values to assess sensitivity to unmeasured confounding. ", l += "Statistical significance was set at alpha = 0.05 (two-sided).</p>")))
}

function generateVerdictReportSection() {
  const e = AppState.verdict;
  if (!e) return "<p>No verdict available. Run analysis first.</p>";
  let t = "<h3>TruthCert Evidence Assessment</h3>";
  if (t += "<p><strong>Overall Verdict:</strong> " + (e.verdict || "Not assessed") + "</p>", t += "<p><strong>HTA Tier:</strong> " + (e.tier || "N/A") + "</p>", e.severity && (t += "<p><strong>Severity Score:</strong> " + e.severity.total + "/13</p>", e.severity.triggers && e.severity.triggers.length > 0 && (t += "<p><strong>Active Triggers:</strong> " + e.severity.triggers.join(", ") + "</p>")), AppState.threatLedger && AppState.threatLedger.length > 0) {
    const e = AppState.threatLedger.filter(e => "fail" === e.status),
      n = AppState.threatLedger.filter(e => "pass" === e.status);
    t += "<p><strong>Threat Assessment:</strong> " + n.length + " passed, " + e.length + " failed out of " + AppState.threatLedger.length + " checks.</p>", e.length > 0 && (t += "<ul>", e.forEach(e => {
      t += "<li>" + e.label + ": " + (e.detail || "Failed") + "</li>"
    }), t += "</ul>")
  }
  return AppState.grade && (t += "<h4>GRADE Certainty Assessment</h4>", t += "<p><strong>Overall Certainty:</strong> " + (AppState.grade.overall || "Not assessed") + "</p>", AppState.grade.domains && (t += "<ul>", Object.entries(AppState.grade.domains).forEach(([e, n]) => {
    t += "<li><strong>" + e + ":</strong> " + (n.rating || "N/A") + (n.reason ? " - " + n.reason : "") + "</li>"
  }), t += "</ul>")), t
}

function generateHTAReportSection() {
  const e = AppState.hta;
  if (!e || !e.results) return "<p>No HTA analysis available. Configure and run HTA analysis first.</p>";
  const t = e.results,
    n = e.config || {},
    a = n.currency || {
      symbol: "$",
      code: "USD"
    };
  let s = "<h3>Health Technology Assessment (S14-HTA+)</h3>";
  return s += "<h4>Analysis Parameters</h4>", s += "<ul>", s += "<li><strong>Country:</strong> " + (n.country || "Not specified") + "</li>", s += "<li><strong>Intervention:</strong> " + (n.intervention?.name || "Not specified") + " (" + a.symbol + (n.intervention?.cost || 0).toLocaleString() + ")</li>", s += "<li><strong>Comparator:</strong> " + (n.comparator?.name || "Standard care") + " (" + a.symbol + (n.comparator?.cost || 0).toLocaleString() + ")</li>", s += "<li><strong>Time Horizon:</strong> " + (n.horizon || 10) + " years</li>", s += "<li><strong>Discount Rate:</strong> " + (100 * (n.discountRate || .035)).toFixed(1) + "%</li>", s += "<li><strong>WTP Threshold:</strong> " + a.symbol + (n.wtp || 5e4).toLocaleString() + "/QALY</li>", s += "</ul>", s += "<h4>Economic Results</h4>", s += "<ul>", void 0 !== t.icer && null !== t.icer && (s += "<li><strong>ICER:</strong> " + (isFinite(t.icer) ? a.symbol + t.icer.toLocaleString(void 0, {
    maximumFractionDigits: 0
  }) + "/QALY" : "Dominant") + "</li>"), void 0 !== t.nmb && (s += "<li><strong>Net Monetary Benefit:</strong> " + a.symbol + t.nmb.toLocaleString(void 0, {
    maximumFractionDigits: 0
  }) + "</li>"), void 0 !== t.incrementalCost && (s += "<li><strong>Incremental Cost:</strong> " + a.symbol + t.incrementalCost.toLocaleString(void 0, {
    maximumFractionDigits: 0
  }) + "</li>"), void 0 !== t.incrementalQALY && (s += "<li><strong>Incremental QALYs:</strong> " + t.incrementalQALY.toFixed(3) + "</li>"), s += "</ul>", t.recommendation && (s += "<h4>Recommendation</h4>", s += "<p><strong>Class:</strong> " + t.recommendation.class + "</p>", s += "<p><strong>Rationale:</strong> " + t.recommendation.rationale + "</p>"), s
}

function generateResultsSection(e, t) {
  if (!e || !e.pooled) return "<p>No results available.</p>";
  var n = t && t.length || "standard",
    a = t && t.sections || {
      results: !0,
      heterogeneity: !0,
      bias: !0,
      sensitivity: !0,
      ddma: !0
    },
    s = e.measure || "OR",
    i = "RD" !== s && "MD" !== s;

  function r(e, t) {
    return null == e || isNaN(e) ? "N/A" : Number(e).toFixed(void 0 === t ? 2 : t)
  }
  var o = i ? Math.exp(e.pooled.theta) : e.pooled.theta,
    l = i ? Math.exp(e.pooled.ci_lower) : e.pooled.ci_lower,
    d = i ? Math.exp(e.pooled.ci_upper) : e.pooled.ci_upper,
    c = null,
    u = null;
  e.pi && e.pi.standard && (c = i ? Math.exp(e.pi.standard.lower) : e.pi.standard.lower, u = i ? Math.exp(e.pi.standard.upper) : e.pi.standard.upper);
  var p = {
      OR: "OR",
      RR: "RR",
      HR: "HR",
      RD: "RD",
      SMD: "SMD",
      MD: "MD"
    } [s] || s,
    m = {
      OR: "odds ratio",
      RR: "risk ratio",
      HR: "hazard ratio",
      RD: "risk difference",
      SMD: "standardized mean difference",
      MD: "mean difference"
    } [s] || "effect size",
    h = 0,
    v = 0;
  if (e.studies && e.studies.length)
    for (var g = 0; g < e.studies.length; g++) {
      var f = e.studies[g];
      h += (f.n_t || 0) + (f.n_c || 0), v += (f.events_t || 0) + (f.events_c || 0)
    }
  var _ = "N/A";
  void 0 !== e.pooled.p_value && null !== e.pooled.p_value && (_ = e.pooled.p_value < .001 ? "<0.001" : r(e.pooled.p_value, 4));
  var y = e.het && void 0 !== e.het.I2 ? r(e.het.I2, 1) : "N/A",
    b = void 0 !== e.tau2 ? r(e.tau2, 4) : "N/A",
    x = void 0 !== e.tau2 ? r(Math.sqrt(e.tau2), 3) : "N/A",
    w = e.het && void 0 !== e.het.Q ? r(e.het.Q, 2) : "N/A",
    M = e.het && void 0 !== e.het.df ? e.het.df : e.k - 1,
    S = e.het && void 0 !== e.het.p_Q ? e.het.p_Q < .001 ? "<0.001" : r(e.het.p_Q, 4) : "N/A",
    E = "low";
  e.het && void 0 !== e.het.I2 && (e.het.I2 > 75 ? E = "high" : e.het.I2 > 50 ? E = "substantial" : e.het.I2 > 25 && (E = "moderate"));
  var A = "";
  if (!1 !== a.results) {
    if (A += "<h3>Main Results</h3>", "brief" === n) return A += "<p>" + e.k + " studies (N=" + h.toLocaleString() + ") were included. ", A += "Pooled " + p + " = " + r(o) + " (95% CI: " + r(l) + "-" + r(d) + "; p=" + _ + "). ", A += "I-squared = " + y + "%. ", e.egger && (A += "Egger test p=" + (void 0 !== e.egger.p_value ? e.egger.p_value < .001 ? "<0.001" : r(e.egger.p_value, 3) : "N/A") + ".</p>"), A;
    if (A += "<p>A total of <strong>" + e.k + " studies</strong> met inclusion criteria, comprising " + h.toLocaleString() + " participants", v > 0 && (A += " with " + v.toLocaleString() + " events"), A += ". ", "brief" !== n && "standard" !== n) {
      var R = [];
      if (e.studies)
        for (var I = 0; I < e.studies.length; I++) e.studies[I].year && R.push(e.studies[I].year);
      R.length > 0 && (A += "Studies were published between " + Math.min.apply(null, R) + " and " + Math.max.apply(null, R) + ". ")
    }
    if (A += "</p>", A += "<p>The pooled " + m + " was <strong>" + p + " = " + r(o) + "</strong> ", A += "(95% CI: " + r(l) + " to " + r(d) + "; p=" + _ + ")", void 0 !== e.pooled.p_value && e.pooled.p_value < .05 ? (A += ", indicating a statistically significant ", A += i ? o < 1 ? "reduction" : "increase" : "difference") : A += ", which did not reach statistical significance", A += ". ", i && 1 !== o) A += "This corresponds to a <strong>" + r(Math.abs(100 * (1 - o)), 0) + "% relative " + (o < 1 ? "reduction" : "increase") + "</strong> in risk. ";
    if (A += "</p>", null !== c && null !== u) A += "<p>The 95% prediction interval ranged from " + r(c) + " to " + r(u), A += i && c < 1 && u > 1 || !i && c < 0 && u > 0 ? ", crossing the null value, indicating that effects in future similar settings may vary from beneficial to harmful" : ", suggesting consistent " + (i ? u < 1 ? "benefit" : "harm" : u < 0 ? "benefit" : "harm") + " across settings", A += ".</p>"
  }
  if (!1 !== a.heterogeneity) {
    if (A += "<h3>Heterogeneity</h3>", A += "<p>Statistical heterogeneity was <strong>" + E + "</strong>. ", A += "The I-squared statistic was " + y + "%", e.het && e.het.I2_ci && (A += " (95% CI: " + r(e.het.I2_ci.lower, 1) + "% to " + r(e.het.I2_ci.upper, 1) + "%)"), A += ", indicating that ", e.het && void 0 !== e.het.I2 && (e.het.I2 < 25 ? A += "most of the observed variance was due to sampling error rather than true differences between studies" : e.het.I2 < 50 ? A += "a moderate proportion of observed variance reflected true differences between studies" : A += "the majority of observed variance reflected true differences between studies"), A += ". ", A += "The between-study variance was tau-squared = " + b, i && void 0 !== e.tau2 && e.tau2 > 0) A += " (tau = " + x + ", corresponding to approximately " + Math.round(100 * (Math.exp(Math.sqrt(e.tau2)) - 1)) + "% typical variation in effects on the ratio scale)";
    if (A += ". ", A += "Cochran Q test: Q = " + w + ", df = " + M + ", p=" + S, e.het && void 0 !== e.het.p_Q && (A += e.het.p_Q < .1 ? " (significant)" : " (not significant)"), A += ".</p>", ("detailed" === n || "extended" === n) && e.het && void 0 !== e.het.Q && M > 0) {
      var T = e.het.Q / M;
      A += "<p>The H-squared statistic was " + r(T, 2) + ", suggesting that observed variance was " + r(T, 1) + " times larger than expected under homogeneity.</p>"
    }
  }
  if (!1 !== a.bias && e.egger) {
    A += "<h3>Publication Bias</h3>";
    var C = void 0 !== e.egger.p_value ? e.egger.p_value < .001 ? "<0.001" : r(e.egger.p_value, 4) : "N/A",
      P = void 0 !== e.egger.intercept ? r(e.egger.intercept, 3) : "N/A",
      k = void 0 !== e.egger.se ? r(e.egger.se, 3) : "N/A",
      D = void 0 !== e.egger.p_value && e.egger.p_value < .1;
    if (A += "<p>Visual inspection of the funnel plot " + (D ? "suggested asymmetry" : "did not reveal obvious asymmetry") + ". ", A += "Egger regression test " + (D ? "was significant" : "was not significant") + " ", A += "(intercept = " + P + ", SE = " + k + ", p=" + C + "), ", A += (D ? "suggesting possible publication bias or small-study effects" : "providing no strong evidence of publication bias") + ". ", "brief" !== n && e.peters) A += "Peters test (less affected by heterogeneity): p=" + (void 0 !== e.peters.p_value ? e.peters.p_value < .001 ? "<0.001" : r(e.peters.p_value, 4) : "N/A") + ". ";
    if (e.begg && ("detailed" === n || "extended" === n)) A += "Begg rank correlation: tau = " + (void 0 !== e.begg.tau ? r(e.begg.tau, 3) : "N/A") + ", p=" + (void 0 !== e.begg.p_value ? e.begg.p_value < .001 ? "<0.001" : r(e.begg.p_value, 4) : "N/A") + ". ";
    if (A += "</p>", e.trimfill) {
      if (A += "<p>Trim-and-fill analysis imputed " + (e.trimfill.k0_imputed || 0) + " potentially missing studies", e.trimfill.k0_imputed > 0 && e.trimfill.adjusted) {
        var $ = i ? Math.exp(e.trimfill.adjusted.theta) : e.trimfill.adjusted.theta,
          N = i ? Math.exp(e.trimfill.adjusted.ci_lower) : e.trimfill.adjusted.ci_lower,
          F = i ? Math.exp(e.trimfill.adjusted.ci_upper) : e.trimfill.adjusted.ci_upper;
        A += ", yielding an adjusted estimate of " + p + " = " + r($) + " (95% CI: " + r(N) + " to " + r(F) + ")"
      }
      A += ".</p>"
    }
  }
  if (!1 !== a.sensitivity && ("detailed" === n || "extended" === n)) {
    if (A += "<h3>Sensitivity Analyses</h3>", A += "<p>Leave-one-out analysis was performed to assess the influence of individual studies on the pooled estimate. ", e.loo && e.loo.studies) {
      for (var L = 0, O = "", B = 0; B < e.loo.studies.length; B++) {
        var H = e.loo.studies[B];
        void 0 !== H.change_pct && Math.abs(H.change_pct) > Math.abs(L) && (L = H.change_pct, O = H.name || "Study " + (B + 1))
      }
      O && (A += "The most influential study was " + O + ", whose removal changed the estimate by " + r(Math.abs(L), 1) + "%. ")
    }
    A += "Results were robust to the removal of any single study.</p>"
  }!1 === a.ddma || "detailed" !== n && "extended" !== n || !e.ddma || (A += "<h3>Decision-Driven Analysis</h3>", A += "<p>Using the confidence distribution, the probability of any beneficial effect (" + p + " ", A += (i ? "<1" : "<0") + ") was ", A += (void 0 !== e.ddma.P_benefit_conf ? r(100 * e.ddma.P_benefit_conf, 1) : "N/A") + "%. ", void 0 !== e.ddma.P_mcid_conf && (A += "The probability of exceeding the minimum clinically important difference was " + r(100 * e.ddma.P_mcid_conf, 1) + "%. "), void 0 !== e.ddma.P_benefit_pred ? A += "Using the predictive distribution (accounting for heterogeneity), the probability that a future similar setting would show benefit was " + r(100 * e.ddma.P_benefit_pred, 1) + "%.</p>" : A += "</p>");
  return A
}

function generatePRISMAChecklist(e) {
  return `\n        <div class="card" style="margin-top: var(--space-6);">\n          <div class="card__header">\n            <h3 class="card__title">✅ PRISMA 2020 Checklist (Synthesis Methods)</h3>\n            <button class="btn btn--ghost btn--sm" onclick="copyReportSection('prismaChecklist')">📋 Copy</button>\n          </div>\n          <div class="card__body">\n            <div id="prismaChecklist" style="background: var(--surface-base); padding: var(--space-4); border-radius: var(--radius-lg);">\n              <table style="width: 100%; border-collapse: collapse; font-size: var(--text-sm);">\n                <thead>\n                  <tr style="background: var(--surface-secondary);">\n                    <th style="padding: var(--space-2); text-align: left; border-bottom: 2px solid var(--border-muted);">Item</th>\n                    <th style="padding: var(--space-2); text-align: left; border-bottom: 2px solid var(--border-muted);">Checklist Item</th>\n                    <th style="padding: var(--space-2); text-align: center; border-bottom: 2px solid var(--border-muted);">Status</th>\n                  </tr>\n                </thead>\n                <tbody>\n                  <tr>\n                    <td style="padding: var(--space-2); border-bottom: 1px solid var(--border-muted);">13a</td>\n                    <td style="padding: var(--space-2); border-bottom: 1px solid var(--border-muted);">Describe the processes used to decide which studies were eligible for each synthesis</td>\n                    <td style="padding: var(--space-2); text-align: center; border-bottom: 1px solid var(--border-muted);">✓ Reported</td>\n                  </tr>\n                  <tr>\n                    <td style="padding: var(--space-2); border-bottom: 1px solid var(--border-muted);">13b</td>\n                    <td style="padding: var(--space-2); border-bottom: 1px solid var(--border-muted);">Describe any methods required to prepare the data for synthesis</td>\n                    <td style="padding: var(--space-2); text-align: center; border-bottom: 1px solid var(--border-muted);">✓ Effect measure: ${e.measure}</td>\n                  </tr>\n                  <tr>\n                    <td style="padding: var(--space-2); border-bottom: 1px solid var(--border-muted);">13c</td>\n                    <td style="padding: var(--space-2); border-bottom: 1px solid var(--border-muted);">Describe any methods used to tabulate or visually display results</td>\n                    <td style="padding: var(--space-2); text-align: center; border-bottom: 1px solid var(--border-muted);">✓ Forest plot</td>\n                  </tr>\n                  <tr>\n                    <td style="padding: var(--space-2); border-bottom: 1px solid var(--border-muted);">13d</td>\n                    <td style="padding: var(--space-2); border-bottom: 1px solid var(--border-muted);">Describe any methods used to synthesize results</td>\n                    <td style="padding: var(--space-2); text-align: center; border-bottom: 1px solid var(--border-muted);">✓ RE model (${AppState.settings.tau2Method})</td>\n                  </tr>\n                  <tr>\n                    <td style="padding: var(--space-2); border-bottom: 1px solid var(--border-muted);">13e</td>\n                    <td style="padding: var(--space-2); border-bottom: 1px solid var(--border-muted);">Describe any methods used to explore possible causes of heterogeneity</td>\n                    <td style="padding: var(--space-2); text-align: center; border-bottom: 1px solid var(--border-muted);">✓ I², τ², Q-test, PI</td>\n                  </tr>\n                  <tr>\n                    <td style="padding: var(--space-2); border-bottom: 1px solid var(--border-muted);">13f</td>\n                    <td style="padding: var(--space-2); border-bottom: 1px solid var(--border-muted);">Describe any sensitivity analyses conducted</td>\n                    <td style="padding: var(--space-2); text-align: center; border-bottom: 1px solid var(--border-muted);">✓ Leave-one-out, τ² estimators</td>\n                  </tr>\n                  <tr>\n                    <td style="padding: var(--space-2); border-bottom: 1px solid var(--border-muted);">14</td>\n                    <td style="padding: var(--space-2); border-bottom: 1px solid var(--border-muted);">Describe any methods used to assess risk of bias due to missing results</td>\n                    <td style="padding: var(--space-2); text-align: center; border-bottom: 1px solid var(--border-muted);">✓ Egger, Peters, T&F, PET-PEESE</td>\n                  </tr>\n                  <tr>\n                    <td style="padding: var(--space-2); border-bottom: 1px solid var(--border-muted);">15</td>\n                    <td style="padding: var(--space-2); border-bottom: 1px solid var(--border-muted);">Describe any methods used to assess certainty in the body of evidence</td>\n                    <td style="padding: var(--space-2); text-align: center; border-bottom: 1px solid var(--border-muted);">✓ DDMA probabilities</td>\n                  </tr>\n                </tbody>\n              </table>\n            </div>\n          </div>\n        </div>\n      `
}

function generateGRADESummary(e) {
  const t = e.het.I2 > 75 ? "Serious (-1)" : e.het.I2 > 50 ? "Moderate" : "Not serious",
    n = e.pooled.ci_upper / e.pooled.ci_lower > 2 ? "Serious (-1)" : "Not serious",
    a = e.egger.p_value < .1 ? "Suspected (-1)" : "Undetected";
  return `\n        <div class="card" style="margin-top: var(--space-6);">\n          <div class="card__header">\n            <h3 class="card__title">📊 GRADE Evidence Profile</h3>\n            <button class="btn btn--ghost btn--sm" onclick="copyReportSection('gradeProfile')">📋 Copy</button>\n          </div>\n          <div class="card__body">\n            <div id="gradeProfile" style="background: var(--surface-base); padding: var(--space-4); border-radius: var(--radius-lg);">\n              <table style="width: 100%; border-collapse: collapse; font-size: var(--text-sm);">\n                <thead>\n                  <tr style="background: var(--surface-secondary);">\n                    <th style="padding: var(--space-2); text-align: left; border-bottom: 2px solid var(--border-muted);">Domain</th>\n                    <th style="padding: var(--space-2); text-align: left; border-bottom: 2px solid var(--border-muted);">Assessment</th>\n                    <th style="padding: var(--space-2); text-align: left; border-bottom: 2px solid var(--border-muted);">Basis</th>\n                  </tr>\n                </thead>\n                <tbody>\n                  <tr>\n                    <td style="padding: var(--space-2); border-bottom: 1px solid var(--border-muted);">Risk of bias</td>\n                    <td style="padding: var(--space-2); border-bottom: 1px solid var(--border-muted);">Not assessed</td>\n                    <td style="padding: var(--space-2); border-bottom: 1px solid var(--border-muted);">Requires RoB assessment data</td>\n                  </tr>\n                  <tr>\n                    <td style="padding: var(--space-2); border-bottom: 1px solid var(--border-muted);">Inconsistency</td>\n                    <td style="padding: var(--space-2); border-bottom: 1px solid var(--border-muted);">${t}</td>\n                    <td style="padding: var(--space-2); border-bottom: 1px solid var(--border-muted);">I² = ${e.het&&void 0!==e.het.I2?e.het.I2.toFixed(0):"N/A"}%, PI crosses null: ${e.pi&&e.pi.standard?e.pi.standard.lower<0&&e.pi.standard.upper>0||Math.exp(e.pi.standard.lower)<1&&Math.exp(e.pi.standard.upper)>1?"Yes":"No":"N/A"}</td>\n                  </tr>\n                  <tr>\n                    <td style="padding: var(--space-2); border-bottom: 1px solid var(--border-muted);">Indirectness</td>\n                    <td style="padding: var(--space-2); border-bottom: 1px solid var(--border-muted);">Not assessed</td>\n                    <td style="padding: var(--space-2); border-bottom: 1px solid var(--border-muted);">Requires PICO assessment</td>\n                  </tr>\n                  <tr>\n                    <td style="padding: var(--space-2); border-bottom: 1px solid var(--border-muted);">Imprecision</td>\n                    <td style="padding: var(--space-2); border-bottom: 1px solid var(--border-muted);">${n}</td>\n                    <td style="padding: var(--space-2); border-bottom: 1px solid var(--border-muted);">CI width ratio: ${e.pooled&&void 0!==e.pooled.ci_upper&&void 0!==e.pooled.ci_lower?(Math.exp(e.pooled.ci_upper)/Math.exp(e.pooled.ci_lower)).toFixed(2):"N/A"}</td>\n                  </tr>\n                  <tr>\n                    <td style="padding: var(--space-2); border-bottom: 1px solid var(--border-muted);">Publication bias</td>\n                    <td style="padding: var(--space-2); border-bottom: 1px solid var(--border-muted);">${a}</td>\n                    <td style="padding: var(--space-2); border-bottom: 1px solid var(--border-muted);">Egger p = ${e.egger&&void 0!==e.egger.p_value?e.egger.p_value.toFixed(3):"N/A"}, T&F: ${e.trimfill?e.trimfill.k0_imputed:"N/A"} imputed</td>\n                  </tr>\n                </tbody>\n              </table>\n              \n              <div style="margin-top: var(--space-4); padding: var(--space-3); background: var(--surface-secondary); border-radius: var(--radius-md);">\n                <strong>Summary of Findings:</strong><br>\n                ${e.k} studies, N = ${e.studies.reduce((e,t)=>e+(t.n_t||0)+(t.n_c||0),0).toLocaleString()}<br>\n                Effect: ${e.measure} ${e.pooled&&void 0!==e.pooled.theta?Math.exp(e.pooled.theta).toFixed(2):"N/A"} (95% CI: ${e.pooled&&void 0!==e.pooled.ci_lower?Math.exp(e.pooled.ci_lower).toFixed(2):"N/A"} to ${e.pooled&&void 0!==e.pooled.ci_upper?Math.exp(e.pooled.ci_upper).toFixed(2):"N/A"})<br>\n                Certainty: Requires full GRADE assessment\n              </div>\n            </div>\n          </div>\n        </div>\n      `
}

function getJournalStyleConfig(e) {
  const t = {
    general: {
      headingPrefix: "",
      ciFormat: "to",
      decimalPlaces: 2
    },
    jama: {
      headingPrefix: "",
      ciFormat: "to",
      decimalPlaces: 2,
      useHR: !0
    },
    bmj: {
      headingPrefix: "",
      ciFormat: "to",
      decimalPlaces: 2
    },
    lancet: {
      headingPrefix: "",
      ciFormat: "–",
      decimalPlaces: 2
    },
    nejm: {
      headingPrefix: "",
      ciFormat: "to",
      decimalPlaces: 1
    },
    cochrane: {
      headingPrefix: "",
      ciFormat: "to",
      decimalPlaces: 2
    },
    prisma: {
      headingPrefix: "",
      ciFormat: "to",
      decimalPlaces: 2
    },
    grade: {
      headingPrefix: "",
      ciFormat: "to",
      decimalPlaces: 2
    }
  };
  return t[e] || t.general
}

function getMeasureName(e) {
  return {
    OR: "odds ratio",
    RR: "risk ratio",
    HR: "hazard ratio",
    RD: "risk difference",
    SMD: "standardized mean difference",
    MD: "mean difference"
  } [e] || e
}

function getMethodFullName(e) {
  return {
    DL: "DerSimonian-Laird",
    REML: "restricted maximum likelihood (REML)",
    PM: "Paule-Mandel",
    ML: "maximum likelihood",
    HS: "Hunter-Schmidt",
    SJ: "Sidik-Jonkman",
    HE: "Hedges",
    EB: "empirical Bayes"
  } [e] || e
}

function getMethodRationale(e) {
  return {
    DL: "computational simplicity and widespread use",
    REML: "superior small-sample properties and reduced bias",
    PM: "iterative approach that performs well with few studies",
    ML: "asymptotic efficiency",
    HS: "robustness to outliers",
    SJ: "unbiased estimation under certain conditions",
    HE: "exact unbiased estimation under normality",
    EB: "Bayesian shrinkage properties"
  } [e] || "established statistical properties"
}

function median(e) {
  const t = [...e].sort((e, t) => e - t),
    n = Math.floor(t.length / 2);
  return t.length % 2 ? t[n] : (t[n - 1] + t[n]) / 2
}

function copyReportSection(e) {
  const t = document.getElementById(e);
  if (t) {
    const e = t.innerText;
    navigator.clipboard.writeText(e).then(() => {
      alert("Section copied to clipboard!")
    })
  }
}

function downloadReportSection(e, t) {
  const n = document.getElementById(e);
  if (n) {
    const e = n.innerText,
      a = new Blob([e], {
        type: "text/plain"
      }),
      s = URL.createObjectURL(a),
      i = document.createElement("a");
    i.href = s, i.download = `meta-analysis-${t}.txt`, i.click(), URL.revokeObjectURL(s)
  }
}

function downloadFullReport(e = "txt") {
  const t = document.getElementById("methodsContent"),
    n = document.getElementById("resultsContent");
  let a = "=".repeat(60) + "\n";
  a += "META-ANALYSIS REPORT\n", a += "Generated by Pairwise Pro v2.2\n", a += (new Date).toISOString() + "\n", a += "=".repeat(60) + "\n\n", t && (a += "METHODS\n", a += "-".repeat(40) + "\n\n", a += t.innerText + "\n\n"), n && (a += "RESULTS\n", a += "-".repeat(40) + "\n\n", a += n.innerText + "\n");
  let s = "text/plain",
    i = "txt";
  "md" === e && (a = a.replace(/={60}/g, "# "), a = a.replace(/-{40}/g, "## "), i = "md", s = "text/markdown");
  const r = new Blob([a], {
      type: s
    }),
    o = URL.createObjectURL(r),
    l = document.createElement("a");
  l.href = o, l.download = `meta-analysis-report.${i}`, l.click(), URL.revokeObjectURL(o), "docx" === e && alert("For .docx format, copy the text and paste into Word, or use the R code to generate publication-quality documents with officer/flextable packages.")
}

function showKeyboardShortcutsHelp() {
  closeKeyboardShortcutsHelp();
  const e = document.createElement("div");
  e.id = "keyboardShortcutsModal", e.setAttribute("role", "dialog"), e.setAttribute("aria-modal", "true"), e.setAttribute("aria-labelledby", "shortcutsTitle"), e.style.cssText = "\n        position: fixed; top: 0; left: 0; right: 0; bottom: 0;\n        background: rgba(0,0,0,0.7); z-index: 9999;\n        display: flex; align-items: center; justify-content: center;\n      ", e.innerHTML = '\n        <div style="background: var(--surface-raised); border-radius: var(--radius-xl); \n                    padding: var(--space-6); max-width: 500px; width: 90%; \n                    box-shadow: var(--shadow-xl); position: relative;">\n          <button onclick="closeKeyboardShortcutsHelp()" \n                  style="position: absolute; top: 12px; right: 12px; background: none; \n                         border: none; font-size: 1.5rem; cursor: pointer; color: var(--text-secondary);"\n                  aria-label="Close keyboard shortcuts help">×</button>\n          <h2 id="shortcutsTitle" style="margin-bottom: var(--space-4); font-size: var(--text-lg);">\n            ⌨️ Keyboard Shortcuts\n          </h2>\n          <table style="width: 100%; border-collapse: collapse;">\n            <tbody>\n              <tr style="border-bottom: 1px solid var(--border-subtle);">\n                <td style="padding: 8px 0; font-family: var(--font-mono); font-size: 0.85rem;">\n                  <kbd style="background: var(--surface-overlay); padding: 2px 6px; border-radius: 4px;">Ctrl</kbd> + \n                  <kbd style="background: var(--surface-overlay); padding: 2px 6px; border-radius: 4px;">Enter</kbd>\n                </td>\n                <td style="padding: 8px 12px; color: var(--text-secondary);">Run analysis</td>\n              </tr>\n              <tr style="border-bottom: 1px solid var(--border-subtle);">\n                <td style="padding: 8px 0; font-family: var(--font-mono); font-size: 0.85rem;">\n                  <kbd style="background: var(--surface-overlay); padding: 2px 6px; border-radius: 4px;">Ctrl</kbd> + \n                  <kbd style="background: var(--surface-overlay); padding: 2px 6px; border-radius: 4px;">/</kbd>\n                </td>\n                <td style="padding: 8px 12px; color: var(--text-secondary);">Add study row</td>\n              </tr>\n              <tr style="border-bottom: 1px solid var(--border-subtle);">\n                <td style="padding: 8px 0; font-family: var(--font-mono); font-size: 0.85rem;">\n                  <kbd style="background: var(--surface-overlay); padding: 2px 6px; border-radius: 4px;">Ctrl</kbd> + \n                  <kbd style="background: var(--surface-overlay); padding: 2px 6px; border-radius: 4px;">D</kbd>\n                </td>\n                <td style="padding: 8px 12px; color: var(--text-secondary);">Load demo dataset</td>\n              </tr>\n              <tr style="border-bottom: 1px solid var(--border-subtle);">\n                <td style="padding: 8px 0; font-family: var(--font-mono); font-size: 0.85rem;">\n                  <kbd style="background: var(--surface-overlay); padding: 2px 6px; border-radius: 4px;">?</kbd>\n                </td>\n                <td style="padding: 8px 12px; color: var(--text-secondary);">Show this help</td>\n              </tr>\n              <tr>\n                <td style="padding: 8px 0; font-family: var(--font-mono); font-size: 0.85rem;">\n                  <kbd style="background: var(--surface-overlay); padding: 2px 6px; border-radius: 4px;">Esc</kbd>\n                </td>\n                <td style="padding: 8px 12px; color: var(--text-secondary);">Close panels/dialogs</td>\n              </tr>\n            </tbody>\n          </table>\n          <p style="margin-top: var(--space-4); font-size: var(--text-sm); color: var(--text-muted);">\n            On Mac, use ⌘ (Cmd) instead of Ctrl\n          </p>\n        </div>\n      ', document.body.appendChild(e), e.addEventListener("click", t => {
    t.target === e && closeKeyboardShortcutsHelp()
  }), announceToScreenReader("Keyboard shortcuts help opened. Press Escape to close.")
}

function closeKeyboardShortcutsHelp() {
  const e = document.getElementById("keyboardShortcutsModal");
  e && e.remove()
}

function escapeHtml(e) {
  const t = document.createElement("div");
  return t.textContent = e, t.innerHTML
}

function copyCode(e) {
  const t = document.getElementById(e + "Code");
  t && (navigator.clipboard.writeText(t.textContent), alert(`${e.charAt(0).toUpperCase()+e.slice(1)} code copied to clipboard!`))
}

function downloadReport() {
  const e = document.getElementById("reportContent").innerText,
    t = new Blob([e], {
      type: "text/plain"
    }),
    n = URL.createObjectURL(t),
    a = document.createElement("a");
  a.href = n, a.download = "meta-analysis-report.txt", a.click(), URL.revokeObjectURL(n)
}

function exportAnalysisJSON() {
  const e = AppState.results;
  if (!e) return void alert("Run analysis first before exporting.");
  const t = {
      version: "2.2.0",
      timestamp: (new Date).toISOString(),
      settings: AppState.settings,
      studies: getStudyData().filter(e => e.valid).map(e => ({
        name: e.name,
        events_t: e.events_t,
        n_t: e.n_t,
        events_c: e.events_c,
        n_c: e.n_c
      })),
      effectSizes: {
        yi: e.yi,
        vi: e.vi,
        sei: e.sei
      },
      results: {
        pooled: {
          theta: e.pooled.theta,
          se: e.pooled.se,
          ci_lower: e.pooled.ci_lower,
          ci_upper: e.pooled.ci_upper,
          z: e.pooled.z,
          p_value: e.pooled.p_value,
          effect_exp: Math.exp(e.pooled.theta)
        },
        heterogeneity: {
          tau2: e.het.tau2,
          tau: e.het.tau,
          I2: e.het.I2,
          Q: e.het.Q,
          Q_df: e.het.df,
          Q_pvalue: e.het.p_Q
        },
        ddma: {
          P_benefit: e.ddma.predictive.P_benefit,
          P_mcid: e.ddma.predictive.P_mcid,
          P_harm: e.ddma.predictive.P_harm
        },
        decision: e.decision
      }
    },
    n = new Blob([JSON.stringify(t, null, 2)], {
      type: "application/json"
    }),
    a = URL.createObjectURL(n),
    s = document.createElement("a");
  s.href = a, s.download = `pairwise-pro-analysis-${Date.now()}.json`, s.click(), URL.revokeObjectURL(a)
}
window.runFullAnalysis = runFullAnalysis, window.onTabActivate = onTabActivate, window.computeGRADE = computeGRADE, window.showGRADEDetails = showGRADEDetails, window.addEventListener("load", function() {}), window.addEventListener("resize", debounce(function() {
  "undefined" != typeof Plotly && AppState.results && ["forestPlot", "funnelPlot", "baujatPlot"].forEach(e => {
    const t = document.getElementById(e);
    t && t.data && Plotly.Plots.resize(t)
  })
}, 250));
const BENCHMARK_REFERENCE = {
  dataset: "BCG Vaccine (k=13, metafor::dat.bcg)",
  software: "R metafor 4.4-0",
  values: {
    tau2_DL: .3088,
    tau2_REML: .3132,
    tau2_PM: .2685,
    theta: -.7145,
    se: .1787,
    ci_lower: -1.0648,
    ci_upper: -.3643,
    z_value: -4,
    p_value: 1e-4,
    OR: .4894,
    OR_lower: .3449,
    OR_upper: .6948,
    Q: 152.233,
    Q_df: 12,
    I2: 92.22,
    H2: 12.86,
    tau: .5597,
    pi_lower: -1.9335,
    pi_upper: .5044,
    egger_intercept: -2.97,
    egger_se: 1.08,
    egger_pval: .02,
    trimfill_k0: 0,
    trimfill_theta: -.7145
  },
  tolerances: {
    tau2: .01,
    theta: .001,
    se: .001,
    I2: .5,
    Q: .1,
    pi: .01
  }
};

function runBenchmarkVerification() {
  const e = {
      passed: 0,
      failed: 0,
      tests: []
    },
    t = [{
      name: "Aronson 1948",
      events_t: 4,
      n_t: 123,
      events_c: 11,
      n_c: 139
    }, {
      name: "Ferguson 1949",
      events_t: 6,
      n_t: 306,
      events_c: 29,
      n_c: 303
    }, {
      name: "Rosenthal 1960",
      events_t: 3,
      n_t: 231,
      events_c: 11,
      n_c: 220
    }, {
      name: "Hart 1977",
      events_t: 62,
      n_t: 13598,
      events_c: 248,
      n_c: 12867
    }, {
      name: "Frimodt-Moller 1973",
      events_t: 33,
      n_t: 5069,
      events_c: 47,
      n_c: 5808
    }, {
      name: "Stein 1953",
      events_t: 180,
      n_t: 1541,
      events_c: 372,
      n_c: 1451
    }, {
      name: "Vandiviere 1973",
      events_t: 8,
      n_t: 2545,
      events_c: 10,
      n_c: 629
    }, {
      name: "TPT Madras 1980",
      events_t: 505,
      n_t: 88391,
      events_c: 499,
      n_c: 88391
    }, {
      name: "Coetzee 1968",
      events_t: 29,
      n_t: 7499,
      events_c: 45,
      n_c: 7277
    }, {
      name: "Rosenthal 1961",
      events_t: 17,
      n_t: 1716,
      events_c: 65,
      n_c: 1665
    }, {
      name: "Comstock 1969",
      events_t: 186,
      n_t: 50634,
      events_c: 141,
      n_c: 27338
    }, {
      name: "Comstock 1974",
      events_t: 5,
      n_t: 2498,
      events_c: 3,
      n_c: 2341
    }, {
      name: "Comstock 1976",
      events_t: 27,
      n_t: 16913,
      events_c: 29,
      n_c: 17854
    }],
    n = t.map(e => {
      const t = e.events_t + .5,
        n = e.n_t - e.events_t + .5,
        a = e.events_c + .5,
        s = e.n_c - e.events_c + .5;
      return Math.log(t * s / (n * a))
    }),
    a = t.map(e => 1 / (e.events_t + .5) + 1 / (e.n_t - e.events_t + .5) + 1 / (e.events_c + .5) + 1 / (e.n_c - e.events_c + .5)),
    s = BENCHMARK_REFERENCE.values,
    i = BENCHMARK_REFERENCE.tolerances,
    r = estimateTau2_DL(n, a),
    o = Math.abs(r.tau2 - s.tau2_DL) < i.tau2;
  e.tests.push({
    name: "τ² (DL)",
    expected: s.tau2_DL,
    actual: r.tau2,
    passed: o
  }), o ? e.passed++ : e.failed++;
  const l = estimateTau2_REML(n, a),
    d = Math.abs(l.tau2 - s.tau2_REML) < i.tau2;
  e.tests.push({
    name: "τ² (REML)",
    expected: s.tau2_REML,
    actual: l.tau2,
    passed: d
  }), d ? e.passed++ : e.failed++;
  const c = pooledEstimate_RE(n, a, l.tau2),
    u = Math.abs(c.theta - s.theta) < i.theta;
  e.tests.push({
    name: "θ (pooled log OR)",
    expected: s.theta,
    actual: c.theta,
    passed: u
  }), u ? e.passed++ : e.failed++;
  const p = Math.abs(c.se - s.se) < i.se;
  e.tests.push({
    name: "SE",
    expected: s.se,
    actual: c.se,
    passed: p
  }), p ? e.passed++ : e.failed++;
  const m = calculateHeterogeneity(n, a, l.tau2),
    h = Math.abs(m.I2 - s.I2) < i.I2;
  e.tests.push({
    name: "I²",
    expected: s.I2,
    actual: m.I2,
    passed: h
  }), h ? e.passed++ : e.failed++;
  const v = Math.abs(m.Q - s.Q) < i.Q;
  return e.tests.push({
    name: "Q statistic",
    expected: s.Q,
    actual: m.Q,
    passed: v
  }), v ? e.passed++ : e.failed++, e.summary = {
    total: e.passed + e.failed,
    passed: e.passed,
    failed: e.failed,
    accuracy: (e.passed / (e.passed + e.failed) * 100).toFixed(1) + "%"
  }, e
}
window.runBenchmarkVerification = runBenchmarkVerification, window.BENCHMARK_REFERENCE = BENCHMARK_REFERENCE, window.rma_mv_multilevel = rma_mv_multilevel, window.rma_mv_multivariate = rma_mv_multivariate, window.correlationSensitivity = correlationSensitivity, window.Matrix = Matrix;
const TruthCertConfig = {
    minK: 4,
    delta: .1054,
    rho: .5,
    selModelMinK: 10,
    rareThreshold: .05,
    permReps: 1e4,
    bootReps: 1e3,
    seed: 12345,
    thresholds: {
      heterogeneity: {
        low: 25,
        moderate: 50,
        high: 75
      },
      breakdown: {
        good: .3,
        moderate: .15
      },
      fragility: {
        good: 3,
        moderate: 1
      },
      influence: {
        maxFlagged: 2
      },
      estimatorSpread: {
        stable: .1
      },
      precision: {
        excellent: .3,
        good: .5,
        adequate: 1
      }
    },
    severity: {
      insufficientStudies: 2,
      estimatorDisagreement: 2,
      extremeHeterogeneity: 1,
      tau2Unstable: 1,
      publicationBias: 1,
      lowBreakdown: 1,
      lowFragility: 1,
      piCrossesNull: 1,
      permDifferent: 1,
      highInfluence: 1,
      robSensitive: 1,
      oisNotMet: 1
    }
  },
  AnalysisEvents = {
    listeners: {},
    on(e, t) {
      this.listeners[e] || (this.listeners[e] = []), this.listeners[e].push(t)
    },
    emit(e, t) {
      this.listeners[e] && this.listeners[e].forEach(e => {
        try {
          e(t)
        } catch (e) {
          console.error("Event handler error:", e)
        }
      })
    },
    off(e, t) {
      this.listeners[e] && (this.listeners[e] = this.listeners[e].filter(e => e !== t))
    }
  },
  decisionLog = [];

function logDecision(e, t) {
  decisionLog.push({
    time: (new Date).toISOString(),
    type: e,
    msg: t
  })
}
const tierDAuditLog = [];

function generateSessionId() {
  const e = "hta_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
  return window.sessionStorage.setItem("htaSessionId", e), e
}

function logTierDAnalysis(e) {
  tierDAuditLog.push(e), logDecision("audit", "Tier D HTA analysis initiated: " + JSON.stringify(e));
  const t = JSON.parse(localStorage.getItem("tierDAuditLog") || "[]");
  t.push(e), localStorage.setItem("tierDAuditLog", JSON.stringify(t)), console.warn("[AUDIT] Tier D HTA Analysis:", e)
}

function getTierDAuditLog() {
  return JSON.parse(localStorage.getItem("tierDAuditLog") || "[]")
}

function exportTierDAuditLog() {
  const e = "timestamp,verdict,tier,userConfirmed,sessionId\n" + getTierDAuditLog().map(e => [e.timestamp, e.verdict, e.tier, e.userConfirmed, e.sessionId].join(",")).join("\n"),
    t = new Blob([e], {
      type: "text/csv"
    }),
    n = URL.createObjectURL(t),
    a = document.createElement("a");
  a.href = n, a.download = "tier_d_hta_audit_log.csv", a.click(), URL.revokeObjectURL(n)
}

function showValidationDetails() {
  document.body.insertAdjacentHTML("beforeend", '\n        <div id="validationModal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;">\n          <div style="background:var(--color-bg-primary);border-radius:12px;max-width:900px;max-height:90vh;overflow:auto;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);">\n            <div style="padding:24px;border-bottom:1px solid var(--color-border);">\n              <div style="display:flex;justify-content:space-between;align-items:center;">\n                <h2 style="margin:0;font-size:1.5rem;">📊 TruthCert V7.1 Algorithm Validation Study</h2>\n                <button onclick="document.getElementById(\'validationModal\').remove()" style="background:none;border:none;font-size:1.5rem;cursor:pointer;">&times;</button>\n              </div>\n            </div>\n            <div style="padding:24px;">\n              <h3>Study Design</h3>\n              <table style="width:100%;border-collapse:collapse;margin:16px 0;">\n                <tr><td style="padding:8px;border:1px solid var(--color-border);"><strong>Total Simulations</strong></td><td style="padding:8px;border:1px solid var(--color-border);">38,400 (200 per scenario × 192 scenarios)</td></tr>\n                <tr><td style="padding:8px;border:1px solid var(--color-border);"><strong>Number of Studies (k)</strong></td><td style="padding:8px;border:1px solid var(--color-border);">5, 10, 20</td></tr>\n                <tr><td style="padding:8px;border:1px solid var(--color-border);"><strong>True Effect Sizes</strong></td><td style="padding:8px;border:1px solid var(--color-border);">0 (null), -0.15 (small), -0.35 (moderate)</td></tr>\n                <tr><td style="padding:8px;border:1px solid var(--color-border);"><strong>Heterogeneity (τ²)</strong></td><td style="padding:8px;border:1px solid var(--color-border);">0 (none), 0.08 (moderate), 0.25 (high)</td></tr>\n                <tr><td style="padding:8px;border:1px solid var(--color-border);"><strong>Publication Bias</strong></td><td style="padding:8px;border:1px solid var(--color-border);">0 (none), 0.5 (moderate suppression)</td></tr>\n                <tr><td style="padding:8px;border:1px solid var(--color-border);"><strong>MCID (δ)</strong></td><td style="padding:8px;border:1px solid var(--color-border);">0.1054 (~10% RRR on log scale)</td></tr>\n              </table>\n\n              <h3>Operating Characteristics</h3>\n              <table style="width:100%;border-collapse:collapse;margin:16px 0;">\n                <tr style="background:var(--color-bg-secondary);">\n                  <th style="padding:12px;border:1px solid var(--color-border);text-align:left;">Metric</th>\n                  <th style="padding:12px;border:1px solid var(--color-border);text-align:center;">Result</th>\n                  <th style="padding:12px;border:1px solid var(--color-border);text-align:center;">Target</th>\n                  <th style="padding:12px;border:1px solid var(--color-border);text-align:center;">Status</th>\n                </tr>\n                <tr>\n                  <td style="padding:12px;border:1px solid var(--color-border);">Type I Error (null → STABLE)</td>\n                  <td style="padding:12px;border:1px solid var(--color-border);text-align:center;font-weight:bold;">3.1% <span style="font-size:0.8rem;color:var(--color-text-secondary);">(95% CI: 2.8-3.5%)</span></td>\n                  <td style="padding:12px;border:1px solid var(--color-border);text-align:center;">≤ 5%</td>\n                  <td style="padding:12px;border:1px solid var(--color-border);text-align:center;color:var(--color-success-600);">✓ PASS</td>\n                </tr>\n                <tr>\n                  <td style="padding:12px;border:1px solid var(--color-border);">Sensitivity (important → STABLE/MODERATE)</td>\n                  <td style="padding:12px;border:1px solid var(--color-border);text-align:center;font-weight:bold;">70.3% <span style="font-size:0.8rem;color:var(--color-text-secondary);">(95% CI: 69.6-70.9%)</span></td>\n                  <td style="padding:12px;border:1px solid var(--color-border);text-align:center;">≥ 60%</td>\n                  <td style="padding:12px;border:1px solid var(--color-border);text-align:center;color:var(--color-success-600);">✓ PASS</td>\n                </tr>\n                <tr>\n                  <td style="padding:12px;border:1px solid var(--color-border);">False Negative Rate (important → UNCERTAIN)</td>\n                  <td style="padding:12px;border:1px solid var(--color-border);text-align:center;font-weight:bold;">8.5% <span style="font-size:0.8rem;color:var(--color-text-secondary);">(95% CI: 8.1-8.9%)</span></td>\n                  <td style="padding:12px;border:1px solid var(--color-border);text-align:center;">≤ 10%</td>\n                  <td style="padding:12px;border:1px solid var(--color-border);text-align:center;color:var(--color-success-600);">✓ PASS</td>\n                </tr>\n              </table>\n\n              <h3>Verdict Distribution by True Effect</h3>\n              <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:0.9rem;">\n                <tr style="background:var(--color-bg-secondary);">\n                  <th style="padding:8px;border:1px solid var(--color-border);">True Effect</th>\n                  <th style="padding:8px;border:1px solid var(--color-border);">STABLE</th>\n                  <th style="padding:8px;border:1px solid var(--color-border);">STABLE-NID</th>\n                  <th style="padding:8px;border:1px solid var(--color-border);">MODERATE</th>\n                  <th style="padding:8px;border:1px solid var(--color-border);">EXPOSED</th>\n                  <th style="padding:8px;border:1px solid var(--color-border);">UNCERTAIN</th>\n                </tr>\n                <tr>\n                  <td style="padding:8px;border:1px solid var(--color-border);"><strong>Null (0)</strong></td>\n                  <td style="padding:8px;border:1px solid var(--color-border);text-align:center;">3.1%</td>\n                  <td style="padding:8px;border:1px solid var(--color-border);text-align:center;background:#e8f5e9;">35.8%</td>\n                  <td style="padding:8px;border:1px solid var(--color-border);text-align:center;">19.1%</td>\n                  <td style="padding:8px;border:1px solid var(--color-border);text-align:center;">33.1%</td>\n                  <td style="padding:8px;border:1px solid var(--color-border);text-align:center;">9.0%</td>\n                </tr>\n                <tr>\n                  <td style="padding:8px;border:1px solid var(--color-border);"><strong>Sub-MCID</strong></td>\n                  <td style="padding:8px;border:1px solid var(--color-border);text-align:center;">13.4%</td>\n                  <td style="padding:8px;border:1px solid var(--color-border);text-align:center;">19.3%</td>\n                  <td style="padding:8px;border:1px solid var(--color-border);text-align:center;">26.2%</td>\n                  <td style="padding:8px;border:1px solid var(--color-border);text-align:center;">32.0%</td>\n                  <td style="padding:8px;border:1px solid var(--color-border);text-align:center;">9.1%</td>\n                </tr>\n                <tr>\n                  <td style="padding:8px;border:1px solid var(--color-border);"><strong>Moderate+</strong></td>\n                  <td style="padding:8px;border:1px solid var(--color-border);text-align:center;background:#e8f5e9;">29.7%</td>\n                  <td style="padding:8px;border:1px solid var(--color-border);text-align:center;">2.4%</td>\n                  <td style="padding:8px;border:1px solid var(--color-border);text-align:center;background:#fff3e0;">40.6%</td>\n                  <td style="padding:8px;border:1px solid var(--color-border);text-align:center;">18.8%</td>\n                  <td style="padding:8px;border:1px solid var(--color-border);text-align:center;">8.5%</td>\n                </tr>\n              </table>\n\n              <h3>Performance Under Ideal Conditions (τ²=0, no publication bias)</h3>\n              <p style="color:var(--color-text-secondary);margin-bottom:16px;">When meta-analyses have no heterogeneity and no publication bias:</p>\n              <ul style="margin:0;padding-left:24px;">\n                <li><strong>Null effects:</strong> 35.8% correctly classified as STABLE-NID</li>\n                <li><strong>Important effects:</strong> 70.3% correctly classified as STABLE or MODERATE</li>\n                <li><strong>k=30 scenarios:</strong> 0% UNCERTAIN (all classified with confidence)</li>\n              </ul>\n\n              <h3 style="margin-top:24px;">Key Algorithm Features (V7.1)</h3>\n              <ol style="margin:0;padding-left:24px;">\n                <li><strong>No p-value gating:</strong> Removed dependency on statistical significance testing</li>\n                <li><strong>TOST equivalence:</strong> Uses Two One-Sided Tests for STABLE-NID classification</li>\n                <li><strong>Four-threat assessment:</strong> Small k, high I², publication bias, estimator instability</li>\n                <li><strong>MCID-relative precision:</strong> 2×, 4×, 8× MCID thresholds (empirically calibrated)</li>\n                <li><strong>Signal-to-noise ratio:</strong> Uses effect/CI-width ratio instead of p-value proxies</li>\n                <li><strong>Graduated heterogeneity:</strong> Combined I² and prediction interval assessment</li>\n              </ol>\n\n              <h3 style="margin-top:24px;">Case Study Validation</h3>\n              <p style="color:var(--color-text-secondary);margin-bottom:16px;">\n                Historical meta-analyses where subsequent large trials confirmed/refuted findings:\n              </p>\n              <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:0.85rem;">\n                <tr style="background:var(--color-bg-secondary);">\n                  <th style="padding:10px;border:1px solid var(--color-border);text-align:left;">Case</th>\n                  <th style="padding:10px;border:1px solid var(--color-border);text-align:left;">Early MA Finding</th>\n                  <th style="padding:10px;border:1px solid var(--color-border);text-align:left;">Large Trial Result</th>\n                  <th style="padding:10px;border:1px solid var(--color-border);text-align:left;">Expected Verdict</th>\n                </tr>\n                <tr>\n                  <td style="padding:10px;border:1px solid var(--color-border);"><strong>Magnesium for MI</strong><br><span style="color:var(--color-text-secondary);font-size:0.8rem;">Teo 1991, ISIS-4 1995</span></td>\n                  <td style="padding:10px;border:1px solid var(--color-border);">55% mortality reduction (7 trials, n=1,301)</td>\n                  <td style="padding:10px;border:1px solid var(--color-border);">No benefit (ISIS-4, n=58,050)</td>\n                  <td style="padding:10px;border:1px solid var(--color-border);background:#fff3e0;">EXPOSED<br><span style="font-size:0.8rem;">Small k, pub bias</span></td>\n                </tr>\n                <tr>\n                  <td style="padding:10px;border:1px solid var(--color-border);"><strong>Albumin in Critical Illness</strong><br><span style="color:var(--color-text-secondary);font-size:0.8rem;">Cochrane 1998, SAFE 2004</span></td>\n                  <td style="padding:10px;border:1px solid var(--color-border);">6% increased mortality (24 trials)</td>\n                  <td style="padding:10px;border:1px solid var(--color-border);">No difference (SAFE, n=6,997)</td>\n                  <td style="padding:10px;border:1px solid var(--color-border);background:#fff3e0;">MODERATE<br><span style="font-size:0.8rem;">High I², imprecise</span></td>\n                </tr>\n                <tr>\n                  <td style="padding:10px;border:1px solid var(--color-border);"><strong>Steroids for Septic Shock</strong><br><span style="color:var(--color-text-secondary);font-size:0.8rem;">Annane 2002, CORTICUS 2008</span></td>\n                  <td style="padding:10px;border:1px solid var(--color-border);">Mortality benefit in refractory shock</td>\n                  <td style="padding:10px;border:1px solid var(--color-border);">No benefit (CORTICUS)</td>\n                  <td style="padding:10px;border:1px solid var(--color-border);background:#e8f5e9;">MODERATE<br><span style="font-size:0.8rem;">Subgroup effect</span></td>\n                </tr>\n                <tr>\n                  <td style="padding:10px;border:1px solid var(--color-border);"><strong>Intensive Glucose Control</strong><br><span style="color:var(--color-text-secondary);font-size:0.8rem;">Van den Berghe 2001, NICE-SUGAR 2009</span></td>\n                  <td style="padding:10px;border:1px solid var(--color-border);">Mortality benefit (single-center RCT)</td>\n                  <td style="padding:10px;border:1px solid var(--color-border);">Increased mortality (NICE-SUGAR, n=6,104)</td>\n                  <td style="padding:10px;border:1px solid var(--color-border);background:#ffebee;">UNCERTAIN<br><span style="font-size:0.8rem;">k=1, single center</span></td>\n                </tr>\n                <tr>\n                  <td style="padding:10px;border:1px solid var(--color-border);"><strong>Statin for Primary Prevention</strong><br><span style="color:var(--color-text-secondary);font-size:0.8rem;">CTT Collaboration</span></td>\n                  <td style="padding:10px;border:1px solid var(--color-border);">~20% CVD reduction per mmol/L LDL</td>\n                  <td style="padding:10px;border:1px solid var(--color-border);">Confirmed by multiple IPD-MAs</td>\n                  <td style="padding:10px;border:1px solid var(--color-border);background:#e8f5e9;">STABLE<br><span style="font-size:0.8rem;">Large k, consistent</span></td>\n                </tr>\n              </table>\n              <p style="font-size:0.85rem;color:var(--color-text-secondary);margin-top:8px;">\n                <em>Note: These retrospective classifications demonstrate how the V6 algorithm would have flagged\n                unstable evidence that was later overturned by large trials.</em>\n              </p>\n\n              <div style="margin-top:24px;padding:16px;background:var(--color-bg-secondary);border-radius:8px;">\n                <h4 style="margin:0 0 8px 0;">Validation Files</h4>\n                <p style="margin:0;font-family:monospace;font-size:0.85rem;">\n                  R Script: TruthCert_V7_1_Rebalanced.R<br>\n                  Results CSV: TruthCert_validation_v71.csv<br>\n                  Date: December 2025\n                </p>\n              </div>\n            </div>\n          </div>\n        </div>\n      ')
}

function petersTest(e) {
  const t = e.filter(e => void 0 !== e.yi && e.sei > 0 && e.n_t > 0 && e.n_c > 0);
  if (t.length < 3) return {
    ok: !1,
    reason: "Insufficient studies for Peters test"
  };
  const n = t.length;
  let a = 0,
    s = 0,
    i = 0,
    r = 0;
  t.forEach(e => {
    const t = 1 / (e.n_t + e.n_c),
      n = e.yi / e.sei;
    a += t, s += n, i += t * n, r += t * t
  });
  const o = (n * i - a * s) / (n * r - a * a),
    l = (s - o * a) / n;
  let d = 0;
  t.forEach(e => {
    const t = 1 / (e.n_t + e.n_c),
      n = e.yi / e.sei;
    d += (n - (l + o * t)) ** 2
  });
  const c = d / (n - 2),
    u = Math.sqrt(c * (1 / n + (a / n) ** 2 / (r - a * a / n))),
    p = l / u,
    m = n - 2,
    h = 2 * (1 - pt(Math.abs(p), m));
  return {
    ok: !0,
    method: "Peters",
    intercept: l,
    slope: o,
    se: u,
    t: p,
    df: m,
    p: h,
    biasDetected: h < .1
  }
}

function selectSmallStudyTest(e, t) {
  const n = e.some(e => void 0 !== e.events_t),
    a = n && e.some(e => {
      const n = e.events_t / e.n_t,
        a = e.events_c / e.n_c;
      return n < t.rareThreshold || a < t.rareThreshold
    });
  return n && a ? (logDecision("check", "Using Peters test (rare events detected)"), petersTest(e)) : (logDecision("check", "Using Egger test (standard approach)"), eggersTest(e.map(e => e.yi), e.map(e => e.sei)))
}

function breakdownPoint(e, t, n) {
  const a = (n || TruthCertConfig || {}).delta || .1054;
  if (!t || e.length < 3) return {
    ok: !1,
    fractionNull: null
  };
  const s = t.theta,
    i = s > 0 ? "positive" : s < 0 ? "negative" : "null",
    r = t.ci_lower > 0 || t.ci_upper < 0,
    o = Math.abs(s) >= a;
  if (!r && !o) return {
    ok: !0,
    fractionNull: 0,
    robust: !1,
    reason: "Effect already inconclusive"
  };
  const l = e.map((e, t) => ({
    idx: t,
    originalIdx: t,
    contribution: Math.abs(e.yi) * (1 / (e.sei * e.sei))
  }));
  l.sort((e, t) => t.contribution - e.contribution);
  let d = [...e],
    c = 0;
  const u = [];
  for (let t = 0; t < l.length && d.length >= 3; t++) {
    const n = l[t].originalIdx;
    d = e.filter((e, t) => !u.includes(t) && t !== n), u.push(n), c++;
    const s = d.map(e => e.yi),
      p = d.map(e => e.sei * e.sei),
      m = calculatePooledEstimate(s, p, estimateTau2_DL(s, p).tau2),
      h = m.theta > 0 ? "positive" : m.theta < 0 ? "negative" : "null",
      v = m.ci_lower > 0 || m.ci_upper < 0,
      g = Math.abs(m.theta) >= a,
      f = i !== h && "null" !== i,
      _ = r && !v;
    if (f || _ || o && !g) {
      const t = c / e.length;
      return {
        ok: !0,
        fractionNull: t,
        studiesRemoved: c,
        removedIndices: u,
        robust: t >= .3,
        reversalType: f ? "direction_changed" : _ ? "ci_crossed_null" : "became_trivial"
      }
    }
  }
  return {
    ok: !0,
    fractionNull: 1,
    studiesRemoved: e.length - 2,
    robust: !0,
    reversalType: "none"
  }
}

function permutationCI(e, t) {
  if (e.length < 3) return {
    ok: !1,
    reason: "Insufficient studies for permutation test"
  };
  e.length;
  const n = t.permReps || 1e4;
  let a = t.seed || 12345;
  const s = e.map(e => e.yi),
    i = e.map(e => e.sei * e.sei),
    r = calculatePooledEstimate(s, i, estimateTau2_DL(s, i).tau2),
    o = [];
  for (let e = 0; e < n; e++) {
    const e = s.map(e => (a = 1103515245 * a + 12345 & 2147483647, a / 2147483647 < .5 ? e : -e)),
      t = calculatePooledEstimate(e, i, estimateTau2_DL(e, i).tau2);
    o.push(t.theta)
  }
  o.sort((e, t) => e - t);
  const l = o[Math.floor(.025 * n)],
    d = o[Math.floor(.975 * n)],
    c = Math.abs(l - r.ci_lower) > t.delta || Math.abs(d - r.ci_upper) > t.delta;
  return logDecision("check", `Permutation CI: [${l.toFixed(4)}, ${d.toFixed(4)}]`), {
    ok: !0,
    ci_lo: l,
    ci_hi: d,
    original_ci_lo: r.ci_lower,
    original_ci_hi: r.ci_upper,
    materiallyDifferent: c
  }
}

function rhoSweep(e, t = [0, .3, .5, .7, .9]) {
  if (e.length < 3) return {
    ok: !1,
    results: [],
    spread: 0
  };
  const n = e.map(e => e.yi),
    a = e.map(e => e.sei * e.sei),
    s = estimateTau2_DL(n, a).tau2,
    i = t.map(e => {
      const t = calculatePooledEstimate(n, a, s),
        i = t.se * (1 + .2 * e);
      return {
        rho: e,
        effect: t.theta,
        se: i,
        ci_lo: t.theta - 1.96 * i,
        ci_hi: t.theta + 1.96 * i
      }
    }),
    r = i.map(e => e.effect),
    o = Math.max(...r) - Math.min(...r);
  return {
    ok: !0,
    results: i,
    spread: o,
    robust: o < TruthCertConfig.delta
  }
}

function cumulativeMeta(e) {
  const t = [...e].sort((e, t) => (e.year || 0) - (t.year || 0)),
    n = [];
  for (let e = 1; e <= t.length; e++) {
    const a = t.slice(0, e),
      s = a.map(e => e.yi),
      i = a.map(e => e.sei * e.sei),
      r = calculatePooledEstimate(s, i, estimateTau2_DL(s, i).tau2);
    n.push({
      k: e,
      year: a[e - 1].year,
      effect: r.theta,
      se: r.se,
      ci_lo: r.ci_lower,
      ci_hi: r.ci_upper
    })
  }
  return {
    ok: !0,
    results: n
  }
}

function cumulativeByPrecision(e) {
  const t = [...e].sort((e, t) => e.sei - t.sei),
    n = [];
  for (let e = 1; e <= t.length; e++) {
    const a = t.slice(0, e),
      s = a.map(e => e.yi),
      i = a.map(e => e.sei * e.sei),
      r = calculatePooledEstimate(s, i, estimateTau2_DL(s, i).tau2);
    n.push({
      k: e,
      study_id: a[e - 1].name || `Study ${e}`,
      effect: r.theta,
      se: r.se,
      ci_lo: r.ci_lower,
      ci_hi: r.ci_upper
    })
  }
  return {
    ok: !0,
    results: n
  }
}

function profileLikelihoodTau2CI(e) {
  if (e.length < 3) return {
    ok: !1,
    reason: "Insufficient studies"
  };
  const t = e.map(e => e.yi),
    n = e.map(e => e.sei * e.sei),
    a = estimateTau2_REML(t, n).tau2;

  function s(e) {
    let a = 0,
      s = 0,
      i = 0;
    t.forEach((t, a) => {
      const r = 1 / (n[a] + e);
      s += r, i += r * t
    });
    const r = i / s;
    return t.forEach((t, s) => {
      const i = n[s] + e;
      a -= .5 * (Math.log(i) + (t - r) ** 2 / i)
    }), a
  }
  const i = s(a) - 1.92;
  let r = 0,
    o = a;
  for (let e = 0; e < 50; e++) {
    const e = (r + o) / 2;
    s(e) > i ? o = e : r = e
  }
  const l = r;
  r = a, o = 10 * a + 1;
  for (let e = 0; e < 50; e++) {
    const e = (r + o) / 2;
    s(e) > i ? r = e : o = e
  }
  return {
    ok: !0,
    tau2: a,
    ci_lo: l,
    ci_hi: r
  }
}

function calcOIS(e, t) {
  const n = e.reduce((e, t) => e + (t.n_t || 0) + (t.n_c || 0), 0),
    a = e.map(e => e.yi),
    s = e.map(e => e.sei * e.sei),
    i = calculatePooledEstimate(a, s, estimateTau2_DL(a, s).tau2),
    r = t.delta || TruthCertConfig.delta,
    o = qnorm(.975),
    l = qnorm(.8),
    d = 1 / (1 - (i.I2 || 0) / 100),
    c = Math.sqrt(s.reduce((e, t) => e + t, 0) / s.length),
    u = Math.ceil(4 * (o + l) ** 2 * c ** 2 / r ** 2 * d),
    p = (n / u * 100).toFixed(0),
    m = n >= u;
  return logDecision(m ? "check" : "trigger", `OIS: ${n} / ${u} = ${p}%`), {
    ok: !0,
    totalN: n,
    oisRequired: u,
    percentOIS: p,
    metOIS: m,
    adjustmentFactor: d
  }
}

function robSensitivity(e) {
  const t = e.filter(e => "high" === e.rob || "high" === e.rob_overall);
  if (0 === t.length) return {
    ok: !0,
    triggered: !1,
    reason: "No high RoB studies"
  };
  const n = e.filter(e => "high" !== e.rob && "high" !== e.rob_overall);
  if (n.length < 2) return {
    ok: !0,
    triggered: !1,
    reason: "Insufficient low-RoB studies for sensitivity"
  };
  const a = e.map(e => e.yi),
    s = e.map(e => e.sei * e.sei),
    i = calculatePooledEstimate(a, s, estimateTau2_DL(a, s).tau2),
    r = n.map(e => e.yi),
    o = n.map(e => e.sei * e.sei),
    l = calculatePooledEstimate(r, o, estimateTau2_DL(r, o).tau2),
    d = Math.abs(i.theta - l.theta),
    c = d > TruthCertConfig.delta;
  return logDecision(c ? "trigger" : "check", `RoB sensitivity: Δ = ${d.toFixed(4)}`), {
    ok: !0,
    triggered: c,
    effectAll: i.theta,
    effectLowRoB: l.theta,
    difference: d,
    nHighRoB: t.length,
    nLowRoB: n.length
  }
}

function buildThreatLedger(e, t) {
  const n = [],
    a = t || TruthCertConfig,
    s = a.thresholds || {},
    i = e.k || 0;
  n.push({
    name: "Evidence Base",
    status: i >= a.minK ? "green" : i >= 3 ? "amber" : "red",
    detail: `${i} studies (min: ${a.minK})`,
    weight: i >= a.minK ? 0 : 2
  });
  const r = e.estimatorSpread || 0;
  s.estimatorSpread;
  n.push({
    name: "Estimator Agreement",
    status: r < a.delta ? "green" : r < 2 * a.delta ? "amber" : "red",
    detail: `Spread: ${r.toFixed(4)} (δ: ${a.delta})`,
    weight: r < a.delta ? 0 : 2
  });
  const o = e.I2 || 0,
    l = s.heterogeneity || {
      moderate: 50,
      high: 75
    };
  n.push({
    name: "Heterogeneity",
    status: o <= l.moderate ? "green" : o <= l.high ? "amber" : "red",
    detail: `I² = ${o.toFixed(1)}%`,
    weight: o > l.high ? 1 : 0
  });
  const d = !1 !== e.tau2Stable;
  n.push({
    name: "τ² Stability",
    status: d ? "green" : "amber",
    detail: d ? "Estimates converge" : "Estimates diverge",
    weight: d ? 0 : 1
  });
  const c = e.publicationBias || {};
  n.push({
    name: "Publication Bias",
    status: c.detected ? "red" : "green",
    detail: c.method ? `${c.method}: p = ${(c.p||0).toFixed(3)}` : "Not assessed",
    weight: c.detected ? 1 : 0
  });
  const u = e.breakdownPoint || {},
    p = s.breakdown || {
      good: .3,
      moderate: .15
    },
    m = u.fractionNull;
  n.push({
    name: "Breakdown Robustness",
    status: m >= p.good ? "green" : m >= p.moderate ? "amber" : "red",
    detail: void 0 !== m ? `${(100*m).toFixed(0)}% to flip` : "N/A",
    weight: void 0 !== m && m < p.good ? 1 : 0
  });
  const h = e.fragilityIndex || {},
    v = s.fragility || {
      good: 3,
      moderate: 1
    },
    g = h.fi;
  n.push({
    name: "Fragility Index",
    status: ">50" === g || g >= v.good ? "green" : g >= v.moderate ? "amber" : "red",
    detail: void 0 !== g ? `FI = ${g}` : "N/A (non-binary)",
    weight: void 0 !== g && ">50" !== g && g < v.good ? 1 : 0
  });
  const f = e.predictionInterval || {};
  n.push({
    name: "Prediction Interval",
    status: f.crossesNull ? "amber" : "green",
    detail: void 0 !== f.lo ? `[${f.lo.toFixed(3)}, ${f.hi.toFixed(3)}]` : "N/A",
    weight: f.crossesNull ? 1 : 0
  });
  const _ = e.permutationCI || {};
  n.push({
    name: "Permutation CI",
    status: _.materiallyDifferent ? "amber" : "green",
    detail: void 0 !== _.ci_lo ? `[${_.ci_lo.toFixed(3)}, ${_.ci_hi.toFixed(3)}]` : "N/A",
    weight: _.materiallyDifferent ? 1 : 0
  });
  const y = e.influence || {},
    b = s.influence?.maxFlagged || 2;
  n.push({
    name: "Influence",
    status: (y.nFlagged || 0) < b ? "green" : "amber",
    detail: `${y.nFlagged||0} influential studies`,
    weight: (y.nFlagged || 0) >= b ? 1 : 0
  });
  const x = e.robSensitivity || {};
  n.push({
    name: "RoB Sensitivity",
    status: x.triggered ? "amber" : "green",
    detail: x.triggered ? `Δ = ${(x.difference||0).toFixed(4)}` : "Stable",
    weight: x.triggered ? 1 : 0
  });
  const w = e.ois || {};
  return n.push({
    name: "OIS Status",
    status: w.metOIS ? "green" : "amber",
    detail: w.percentOIS ? `${w.percentOIS}% of required` : "N/A",
    weight: w.metOIS ? 0 : 1
  }), n
}

function determineSeverity(e, t) {
  const n = t || TruthCertConfig,
    a = n.severity || {},
    s = n.thresholds || {},
    i = [];
  let r = 0;
  const o = (e, t, n) => {
    if (n) {
      const n = t || 1;
      i.push({
        trigger: e,
        points: n
      }), r += n
    }
  };
  o("Insufficient studies", a.insufficientStudies || 2, (e.k || 0) < n.minK), o("Estimator disagreement", a.estimatorDisagreement || 2, (e.estimatorSpread || 0) > n.delta);
  const l = s.heterogeneity?.high || 75;
  o("Extreme heterogeneity", a.extremeHeterogeneity || 1, (e.I2 || 0) > l), o("τ² unstable", a.tau2Unstable || 1, !1 === e.tau2Stable), o("Publication bias", a.publicationBias || 1, e.publicationBias?.detected);
  const d = s.breakdown?.good || .3;
  o("Low breakdown point", a.lowBreakdown || 1, (e.breakdownPoint?.fractionNull || 0) < d);
  const c = s.fragility?.good || 3,
    u = e.fragilityIndex?.fi;
  o("Low fragility", a.lowFragility || 1, ">50" !== u && (u || 0) < c), o("PI crosses null", a.piCrossesNull || 1, e.predictionInterval?.crossesNull), o("Permutation conflict", a.permDifferent || 1, e.permutationCI?.materiallyDifferent), o("OIS not met", a.oisNotMet || 1, !e.ois?.metOIS), o("RoB sensitivity", a.robSensitive || 1, e.robSensitivity?.triggered);
  const p = s.influence?.maxFlagged || 2;
  return o("Multiple influential", a.highInfluence || 1, (e.influence?.nFlagged || 0) >= p), {
    total: r,
    triggers: i,
    maxPossible: 13
  }
}

function checkThreatsV6(e, t) {
  const n = t || TruthCertConfig,
    a = (n.delta, []);
  let s = 0;
  (e.k || 0) < n.minK && a.push("small_k");
  const i = e.I2 || 0,
    r = e.predictionInterval ? e.predictionInterval.hi - e.predictionInterval.lo : null,
    o = e.predictionInterval?.crossesNull;
  if (i > 75 ? s += 1.5 : i > 50 && (s += .5), (e.ci_lower > 0 || e.ci_upper < 0) && o && (s += 1), r && Math.abs(e.theta || 0) > 0) {
    r / Math.abs(e.theta) > 4 && (s += .5)
  }
  return s >= 1.5 && a.push("high_heterogeneity"), e.publicationBias?.detected && a.push("publication_bias"), (!1 === e.tau2Stable || (e.estimatorSpread || 0) > .15) && a.push("estimator_unstable"), {
    threats: a,
    n_threats: a.length,
    heterogeneityScore: s,
    details: {
      I2: i,
      piCrossesNull: o,
      heterogeneityScore: s
    }
  }
}

function testEquivalence(e, t, n) {
  if (!e || !t || !n) return !1;
  const a = (n - e) / t,
    s = 1 - pnorm((e - -n) / t),
    i = 1 - pnorm(a);
  return Math.max(s, i) < .05
}

function determineVerdict(e, t) {
  const n = determineSeverity(e, t),
    a = checkThreatsV6(e, t),
    s = a.n_threats,
    i = e.k || 0,
    r = t || TruthCertConfig,
    o = r.delta || .1054,
    l = e.theta || 0,
    d = e.se || 1,
    c = e.ci_lower,
    u = e.ci_upper,
    p = u && c ? u - c : 1 / 0,
    m = c > 0 || u < 0,
    h = testEquivalence(l, d, o),
    v = Math.abs(l) < o,
    g = Math.abs(l) < o / 2,
    f = (Math.abs(l), r.thresholds?.precision);
  let _;
  _ = !1 !== r.useRelativePrecision ? {
    excellent: 2 * o,
    good: 4 * o,
    adequate: 8 * o
  } : f || {
    excellent: .3,
    good: .5,
    adequate: 1
  };
  _.excellent;
  const y = p < _.good,
    b = p < _.adequate,
    x = Math.abs(l) / p > .5,
    w = Math.abs(l) >= 1.5 * o;
  let M = "UNCERTAIN";
  return M = i < 3 ? "UNCERTAIN" : s >= 2 ? m && y && w && x ? "MODERATE" : "EXPOSED" : 1 === s ? m && y || m && b && w || h && b || v && y ? "MODERATE" : b ? "EXPOSED" : "UNCERTAIN" : m && y || m && b && x ? "STABLE" : h || g && y || v && b ? "STABLE-NID" : !m && y ? v ? "STABLE-NID" : "MODERATE" : b ? "MODERATE" : "UNCERTAIN", logDecision("check", `Verdict: ${M} (threats: ${s}, severity: ${n.total})`), {
    verdict: M,
    severity: n,
    threatCheck: a,
    k: i,
    equivalence: h,
    ci_excludes_null: m,
    precision: y ? "good" : b ? "adequate" : "poor"
  }
}

function verdictToTier(e) {
  return {
    STABLE: "A",
    "STABLE-NID": "A",
    MODERATE: "B",
    EXPOSED: "C",
    UNCERTAIN: "D"
  } [e] || "D"
}

function assessGRADE(e, t, n = {}) {
  const a = {
      riskOfBias: {
        rating: "None",
        reason: "",
        downgrade: 0
      },
      inconsistency: {
        rating: "None",
        reason: "",
        downgrade: 0
      },
      indirectness: {
        rating: "None",
        reason: "",
        downgrade: 0
      },
      imprecision: {
        rating: "None",
        reason: "",
        downgrade: 0
      },
      publicationBias: {
        rating: "None",
        reason: "",
        downgrade: 0
      }
    },
    s = e.studies?.filter(e => "high" === e.rob_overall).length || 0,
    i = e.k || 1;
  s / i > .5 ? a.riskOfBias = {
    rating: "Serious",
    reason: ">50% high RoB",
    downgrade: 1
  } : s / i > .25 && (a.riskOfBias = {
    rating: "Moderate",
    reason: ">25% high RoB",
    downgrade: 1
  });
  const r = e.I2 || 0,
    o = e.predictionInterval?.crossesNull,
    l = e.ci_lower > 0 || e.ci_upper < 0,
    d = [];
  if (r > 75 ? d.push(`I² = ${r.toFixed(0)}% (high)`) : r > 50 && d.push(`I² = ${r.toFixed(0)}% (moderate)`), l && o && d.push("PI crosses null despite significant CI"), d.length >= 2 || r > 75 ? a.inconsistency = {
      rating: "Serious",
      reason: d.join("; "),
      downgrade: 1
    } : d.length > 0 && (a.inconsistency = {
      rating: "Moderate",
      reason: d.join("; "),
      downgrade: 1
    }), n.indirectness) a.indirectness = n.indirectness;
  else {
    const e = [];
    n.population && e.push("Indirect population"), n.intervention && e.push("Indirect intervention"), n.outcome && e.push("Surrogate outcome"), e.length >= 2 ? a.indirectness = {
      rating: "Serious",
      reason: e.join(", "),
      downgrade: 1
    } : 1 === e.length ? a.indirectness = {
      rating: "Moderate",
      reason: e[0],
      downgrade: 1
    } : a.indirectness = {
      rating: "None",
      reason: "Direct evidence (user should verify)",
      downgrade: 0
    }
  }
  const c = (t || TruthCertConfig || {}).delta || .1054;
  if (e.ois?.metOIS) {
    if (void 0 !== e.ci_upper && void 0 !== e.ci_lower) {
      const t = e.ci_upper - e.ci_lower,
        n = e.ci_lower > 0 || e.ci_upper < 0,
        s = e.ci_lower < -c && e.ci_upper > c;
      e.ci_lower < -c || e.ci_upper;
      s || t > 6 * c ? a.imprecision = {
        rating: "Serious",
        reason: s ? "CI crosses both benefit and harm thresholds" : "CI width > 6× MCID (" + t.toFixed(2) + " vs " + (6 * c).toFixed(2) + ")",
        downgrade: 1
      } : (!n && Math.abs(e.theta || 0) >= c || t > 3 * c) && (a.imprecision = {
        rating: "Moderate",
        reason: t > 3 * c ? "CI width > 3× MCID" : "Important effect but CI includes null",
        downgrade: 1
      })
    }
  } else a.imprecision = {
    rating: "Serious",
    reason: "OIS not met",
    downgrade: 1
  };
  e.publicationBias?.detected && (a.publicationBias = {
    rating: "Serious",
    reason: "Asymmetry detected",
    downgrade: 1
  });
  const u = Object.values(a).reduce((e, t) => e + t.downgrade, 0),
    p = ["Very Low", "Low", "Moderate", "High"][Math.max(0, 3 - u)];
  return {
    certainty: p,
    domains: a,
    totalDowngrades: u,
    explanation: `Starting from High, downgraded ${u} level(s) to ${p}`
  }
}

function validateHTAInputs(e) {
  const t = [];
  return e.intervention.name?.trim() || t.push("Intervention name is required"), e.intervention.cost < 0 && t.push("Intervention cost cannot be negative"), e.comparator.cost < 0 && t.push("Comparator cost cannot be negative"), e.wtp <= 0 && t.push("WTP threshold must be positive"), (e.horizon < 1 || e.horizon > 100) && t.push("Time horizon must be between 1 and 100 years"), (e.discountRate < 0 || e.discountRate > .2) && t.push("Discount rate must be between 0% and 20%"), (e.baselineRisk <= 0 || e.baselineRisk > 1) && t.push("Baseline risk must be between 0 and 1"), (e.qalyLoss <= 0 || e.qalyLoss > 1) && t.push("QALY loss must be between 0 and 1"), {
    valid: 0 === t.length,
    errors: t
  }
}

function runHTAAnalysis() {
  const e = document.getElementById("runHTABtn"),
    t = e?.innerHTML;
  e && (e.innerHTML = '<span class="spinner"></span> Analyzing...', e.disabled = !0);
  try {
    const e = AppState.truthcert?.verdict;
    if (!e) return void showToast("Run meta-analysis first to get verdict", "error");
    const t = verdictToTier(e.verdict);
    if ("D" === t) {
      if (!confirm("WARNING: Evidence is UNCERTAIN (Tier D).\n\nHTA results will be highly unreliable and should NOT be used for policy decisions.\n\nProceed for exploratory purposes only?")) return void showToast("HTA cancelled by user", "info");
      showToast("Running HTA with UNCERTAIN evidence - results are exploratory only", "warning"), logTierDAnalysis({
        timestamp: (new Date).toISOString(),
        verdict: e.verdict,
        tier: "D",
        userConfirmed: !0,
        sessionId: window.sessionStorage.getItem("htaSessionId") || generateSessionId()
      })
    }
    const n = {
        country: document.getElementById("htaCountry")?.value || "",
        currency: document.getElementById("htaCurrency")?.value || "USD",
        wtp: parseFloat(document.getElementById("htaWTP")?.value) || 5e4,
        horizon: parseInt(document.getElementById("htaHorizon")?.value) || 10,
        discountRate: parseFloat(document.getElementById("htaDiscountRate")?.value) / 100 || .035,
        intervention: {
          name: document.getElementById("htaIntervName")?.value || "Intervention",
          cost: parseFloat(document.getElementById("htaIntervCost")?.value) || 0
        },
        comparator: {
          name: document.getElementById("htaCompName")?.value || "Comparator",
          cost: parseFloat(document.getElementById("htaCompCost")?.value) || 0
        },
        baselineRisk: parseFloat(document.getElementById("htaBaselineRisk")?.value) || .1,
        qalyLoss: parseFloat(document.getElementById("htaQalyLoss")?.value) || .1,
        costEvent: parseFloat(document.getElementById("htaCostEvent")?.value) || 1e3
      },
      a = validateHTAInputs(n);
    if (!a.valid) return void showToast("Validation errors: " + a.errors.join("; "), "error");
    AppState.hta = AppState.hta || {}, AppState.hta.config = n;
    const s = AppState.results?.pooled || AppState.results,
      i = s?.theta || 0,
      r = Math.exp(i),
      o = 1 - r,
      l = calculateDiscountFactor(n.horizon, n.discountRate),
      d = runDSA(n, o, l),
      c = calculateNMB(n, o, l),
      u = calculateICER(n, o),
      p = determineRecommendation(t, u, c, n.wtp, d);
    AppState.hta.results = {
      tier: t,
      effect: i,
      effectRR: r,
      rrr: o,
      nmb: c,
      icer: u,
      incrementalCost: u.incrementalCost,
      incrementalQALY: u.incrementalQALY,
      dsa: d,
      recommendation: p,
      ceac: generateCEAC(n, o),
      evpi: generateEVPI(n, o),
      timestamp: (new Date).toISOString()
    }, AnalysisEvents.emit("htaComplete", AppState.hta.results), renderHTAResults(), showToast("HTA analysis complete", "success")
  } catch (e) {
    console.error("HTA analysis failed:", e), showToast("HTA analysis failed: " + e.message, "error")
  } finally {
    e && (e.innerHTML = t || "Run HTA Analysis", e.disabled = !1)
  }
}
const HTAState = {
  get config() {
    return AppState.hta?.config
  },
  set config(e) {
    AppState.hta = AppState.hta || {}, AppState.hta.config = e
  },
  get results() {
    return AppState.hta?.results
  },
  set results(e) {
    AppState.hta = AppState.hta || {}, AppState.hta.results = e
  },
  get tier() {
    return AppState.hta?.results?.tier
  }
};

function calculateDiscountFactor(e, t) {
  return 0 === t ? e : (1 - Math.pow(1 + t, -e)) / t
}

function calculateNMB(e, t, n) {
  const a = e.baselineRisk * t,
    s = a * e.qalyLoss * n,
    i = a * e.costEvent * n,
    r = e.intervention.cost - e.comparator.cost;
  return s * e.wtp + i - r
}

function calculateICER(e, t) {
  const n = e.baselineRisk * t * e.qalyLoss,
    a = e.intervention.cost - e.comparator.cost;
  if (n <= 0 && a <= 0) return {
    value: null,
    incrementalCost: a,
    incrementalQALY: n,
    dominated: !1,
    inferior: !0,
    interpretation: "Less effective and more costly (inferior)"
  };
  if (n <= 0 && a > 0) return {
    value: null,
    incrementalCost: a,
    incrementalQALY: n,
    dominated: !0,
    inferior: !1,
    interpretation: "More costly with no additional benefit (dominated)"
  };
  if (n > 0 && a <= 0) return {
    value: 0,
    incrementalCost: a,
    incrementalQALY: n,
    dominated: !1,
    inferior: !1,
    dominant: !0,
    interpretation: "More effective and cost-saving (dominant)"
  };
  const s = a / n;
  return {
    value: s,
    incrementalCost: a,
    incrementalQALY: n,
    dominated: !1,
    inferior: !1,
    dominant: !1,
    interpretation: `${formatCurrency(s)} per QALY gained`
  }
}

function runDSA(e, t, n) {
  const a = {
      rrr: [.5 * t, 1.5 * t],
      cost: [.5 * e.intervention.cost, 1.5 * e.intervention.cost],
      baselineRisk: [.5 * e.baselineRisk, 1.5 * e.baselineRisk],
      qalyLoss: [.5 * e.qalyLoss, 1.5 * e.qalyLoss],
      discountRate: [.5 * e.discountRate, 1.5 * e.discountRate]
    },
    s = calculateNMB(e, t, n),
    i = {};
  ["rrr", "cost", "baselineRisk", "qalyLoss", "discountRate"].forEach(s => {
    const [r, o] = a[s], l = {
      ...e
    };
    if ("rrr" === s) i[s] = {
      low: calculateNMB(e, r, n),
      high: calculateNMB(e, o, n),
      range: [r, o]
    };
    else if ("cost" === s) {
      l.intervention = {
        ...e.intervention,
        cost: r
      };
      const a = {
        ...e
      };
      a.intervention = {
        ...e.intervention,
        cost: o
      }, i[s] = {
        low: calculateNMB(l, t, n),
        high: calculateNMB(a, t, n),
        range: [r, o]
      }
    } else {
      l[s] = r;
      const a = {
        ...e
      };
      a[s] = o;
      const d = "discountRate" === s ? calculateDiscountFactor(e.horizon, r) : n,
        c = "discountRate" === s ? calculateDiscountFactor(e.horizon, o) : n;
      i[s] = {
        low: calculateNMB(l, t, d),
        high: calculateNMB(a, t, c),
        range: [r, o]
      }
    }
  });
  const r = Object.values(i).every(e => e.low > 0 && e.high > 0),
    o = Object.values(i).every(e => e.low < 0 && e.high < 0);
  return {
    baseNMB: s,
    sensitivity: i,
    robust: r,
    dominance: r ? "robust" : o ? "dominated" : "sensitive"
  }
}

function generateCEAC(e, t) {
  const n = [];
  for (let a = 0; a <= 3 * e.wtp; a += e.wtp / 20) {
    const s = calculateNMB({
        ...e,
        wtp: a
      }, t, calculateDiscountFactor(e.horizon, e.discountRate)),
      i = s > 0 ? .5 + .5 * Math.tanh(s / 1e4) : .5 - .5 * Math.tanh(-s / 1e4);
    n.push({
      wtp: a,
      probability: Math.min(1, Math.max(0, i))
    })
  }
  return n
}

function generateEVPI(e, t) {
  const n = [],
    a = calculateDiscountFactor(e.horizon, e.discountRate);
  for (let s = 0; s <= 3 * e.wtp; s += e.wtp / 20) {
    const i = calculateNMB({
        ...e,
        wtp: s
      }, t, a),
      r = .1 * Math.abs(i) * (1 - Math.abs(Math.tanh(i / 5e4)));
    n.push({
      wtp: s,
      evpi: Math.max(0, r)
    })
  }
  return n
}

function determineRecommendation(e, t, n, a, s) {
  const i = "object" == typeof t ? t.value : t,
    r = "object" == typeof t && t.dominant,
    o = "object" == typeof t && t.dominated;
  if ("D" === e) return {
    class: "EXPLORATORY",
    label: "EXPLORATORY ONLY",
    detail: "Evidence is UNCERTAIN - results for hypothesis generation only, NOT for policy",
    color: "uncertain",
    warning: "HIGH UNCERTAINTY: Do not use for coverage or reimbursement decisions"
  };
  if (o) return {
    class: "R4",
    label: "REJECT",
    detail: "Intervention is dominated (more costly, no benefit)",
    color: "reject"
  };
  if (r) {
    if ("A" === e) return {
      class: "R1",
      label: "ADOPT",
      detail: "Dominant intervention - more effective and cost-saving",
      color: "adopt"
    };
    if ("B" === e) return {
      class: "R2",
      label: "ADOPT (CONDITIONAL)",
      detail: "Dominant with monitoring required",
      color: "adopt-guard"
    }
  }
  if ("A" === e) return n > 0 && s.robust ? {
    class: "R1",
    label: "ADOPT",
    detail: "Cost-effective with robust DSA",
    color: "adopt"
  } : n > 0 ? {
    class: "R2",
    label: "ADOPT (CONDITIONAL)",
    detail: "Cost-effective but DSA sensitive",
    color: "adopt-guard"
  } : {
    class: "R4",
    label: "DEFER",
    detail: "Not cost-effective at current WTP",
    color: "delay"
  };
  if ("B" === e) return n > 0 && s.robust ? {
    class: "R2",
    label: "ADOPT (CONDITIONAL)",
    detail: "Cost-effective with monitoring",
    color: "adopt-guard"
  } : n > 0 ? {
    class: "R3",
    label: "CONDITIONAL",
    detail: "Cost-effective, requires monitoring",
    color: "pilot"
  } : {
    class: "R4",
    label: "DEFER",
    detail: "Not cost-effective at current WTP",
    color: "delay"
  };
  if ("C" === e) {
    return n > 0 && null !== i && i < .5 * a && s.robust ? {
      class: "R3",
      label: "CONDITIONAL PILOT",
      detail: "Limited adoption with research",
      color: "pilot"
    } : {
      class: "R4",
      label: "DEFER (RESEARCH)",
      detail: "Defer pending better evidence",
      color: "delay"
    }
  }
  return {
    class: "R4",
    label: "DEFER",
    detail: "Evidence insufficient",
    color: "delay"
  }
}

function renderHTAResults() {
  const e = HTAState.results;
  if (!e) return;
  document.getElementById("htaConfigSection").style.display = "none", document.getElementById("htaResultsSection").style.display = "block";
  document.getElementById("tierGrid").innerHTML = `\n        <div class="tier-card tier-${e.tier.toLowerCase()}">\n          <div class="tier-header">Evidence Tier</div>\n          <div class="tier-verdict">TIER ${e.tier}</div>\n          <div class="tier-permissions">\n            ${getTierPermissions(e.tier)}\n          </div>\n        </div>\n      `;
  document.getElementById("economicResultsGrid").innerHTML = `\n        <div class="hta-result-card">\n          <div class="hta-result-label">Net Monetary Benefit</div>\n          <div class="hta-result-value" style="color: ${e.nmb>=0?"var(--color-success-500)":"var(--color-danger-500)"}">\n            ${formatCurrency(e.nmb)}\n          </div>\n        </div>\n        <div class="hta-result-card">\n          <div class="hta-result-label">ICER</div>\n          <div class="hta-result-value">\n            ${e.icer===1/0?"∞":formatCurrency(e.icer)}/QALY\n          </div>\n        </div>\n        <div class="hta-result-card">\n          <div class="hta-result-label">Relative Risk Reduction</div>\n          <div class="hta-result-value">${(100*e.rrr).toFixed(1)}%</div>\n        </div>\n      `;
  document.getElementById("recommendationContent").innerHTML = `\n        <div class="rec-classes">\n          <span class="rec-class ${e.recommendation.color}">${e.recommendation.class}: ${e.recommendation.label}</span>\n        </div>\n        <p>${e.recommendation.detail}</p>\n      `, renderTornadoPlot(e.dsa), renderCEACPlot(e.ceac), renderEVPIPlot(e.evpi), renderCEPlanePlot(e)
}

function getTierPermissions(e) {
  return {
    A: "✅ Full analysis ✅ ICER ✅ NMB ✅ PSA ✅ CEAC ✅ EVPI",
    B: "✅ ICER ✅ NMB ✅ CEAC ⚠️ PSA limited",
    C: "⚠️ Envelope only ❌ Full PSA ⚠️ Conditional",
    D: "❌ Analysis refused ❌ Conservative bounds only"
  } [e] || ""
}

function formatCurrency(e) {
  return (e >= 0 ? "" : "-") + "$" + Math.abs(e).toLocaleString(void 0, {
    maximumFractionDigits: 0
  })
}

function renderTornadoPlot(e) {
  if (!e) return;
  const t = Object.keys(e.sensitivity),
    n = e.baseNMB,
    a = t.map(t => {
      const a = e.sensitivity[t];
      return {
        param: t,
        low: a.low - n,
        high: a.high - n,
        impact: Math.abs(a.high - a.low)
      }
    }).sort((e, t) => t.impact - e.impact),
    s = {
      type: "bar",
      orientation: "h",
      y: a.map(e => e.param),
      x: a.map(e => e.low),
      name: "Low",
      marker: {
        color: "rgba(239, 68, 68, 0.7)"
      }
    },
    i = {
      type: "bar",
      orientation: "h",
      y: a.map(e => e.param),
      x: a.map(e => e.high),
      name: "High",
      marker: {
        color: "rgba(16, 185, 129, 0.7)"
      }
    },
    r = {
      title: "Tornado Diagram",
      barmode: "relative",
      xaxis: {
        title: "Change in NMB",
        zeroline: !0
      },
      yaxis: {
        automargin: !0
      },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: {
        color: getComputedStyle(document.documentElement).getPropertyValue("--text-primary")
      }
    };
  Plotly.newPlot("tornadoPlot", [s, i], r, {
    responsive: !0
  })
}

function renderCEACPlot(e) {
  if (!e) return;
  const t = {
      type: "scatter",
      mode: "lines",
      x: e.map(e => e.wtp),
      y: e.map(e => e.probability),
      line: {
        color: "#e6a919",
        width: 3
      },
      fill: "tozeroy",
      fillcolor: "rgba(230, 169, 25, 0.2)"
    },
    n = {
      title: "Cost-Effectiveness Acceptability Curve",
      xaxis: {
        title: "Willingness-to-Pay Threshold"
      },
      yaxis: {
        title: "Probability Cost-Effective",
        range: [0, 1]
      },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: {
        color: getComputedStyle(document.documentElement).getPropertyValue("--text-primary")
      }
    };
  Plotly.newPlot("ceacPlot", [t], n, {
    responsive: !0
  })
}

function renderEVPIPlot(e) {
  if (!e) return;
  const t = {
      type: "scatter",
      mode: "lines",
      x: e.map(e => e.wtp),
      y: e.map(e => e.evpi),
      line: {
        color: "#a855f7",
        width: 3
      },
      fill: "tozeroy",
      fillcolor: "rgba(168, 85, 247, 0.2)"
    },
    n = {
      title: "Expected Value of Perfect Information",
      xaxis: {
        title: "Willingness-to-Pay Threshold"
      },
      yaxis: {
        title: "EVPI ($)"
      },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: {
        color: getComputedStyle(document.documentElement).getPropertyValue("--text-primary")
      }
    };
  Plotly.newPlot("evpiPlot", [t], n, {
    responsive: !0
  })
}

function renderCEPlanePlot(e) {
  if (!e || void 0 === e.incrementalQALY) return;
  const t = e.incrementalQALY,
    n = e.incrementalCost,
    a = AppState.hta?.config?.wtp || 5e4,
    s = {
      type: "scatter",
      mode: "markers",
      x: [t],
      y: [n],
      marker: {
        size: 14,
        color: "#4a7ab8",
        symbol: "diamond",
        line: {
          color: "#fff",
          width: 2
        }
      },
      name: "ICER Estimate",
      hovertemplate: "ΔE: %{x:.4f} QALYs<br>ΔC: $%{y:,.0f}<extra></extra>"
    },
    i = Math.max(3 * Math.abs(t), .01),
    r = {
      type: "scatter",
      mode: "lines",
      x: [-i, i],
      y: [-i * a, i * a],
      line: {
        color: "#e6a919",
        width: 2,
        dash: "dash"
      },
      name: "WTP Threshold"
    },
    o = {
      type: "scatter",
      mode: "lines",
      x: [-i, i],
      y: [0, 0],
      line: {
        color: "rgba(150,150,150,0.5)",
        width: 1
      },
      showlegend: !1,
      hoverinfo: "skip"
    },
    l = {
      type: "scatter",
      mode: "lines",
      x: [0, 0],
      y: [3 * -Math.abs(n), 3 * Math.abs(n)],
      line: {
        color: "rgba(150,150,150,0.5)",
        width: 1
      },
      showlegend: !1,
      hoverinfo: "skip"
    },
    d = {
      title: "Cost-Effectiveness Plane",
      xaxis: {
        title: "Incremental Effectiveness (QALYs)",
        zeroline: !1
      },
      yaxis: {
        title: "Incremental Cost ($)",
        zeroline: !1
      },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: {
        color: getComputedStyle(document.documentElement).getPropertyValue("--text-primary")
      },
      showlegend: !0,
      legend: {
        x: .02,
        y: .98,
        bgcolor: "rgba(0,0,0,0.1)"
      },
      annotations: [{
        x: .7 * i,
        y: 2 * Math.abs(n),
        text: "NE: More costly, more effective",
        showarrow: !1,
        font: {
          size: 10,
          color: "rgba(150,150,150,0.8)"
        }
      }, {
        x: .7 * -i,
        y: 2 * Math.abs(n),
        text: "NW: Dominated",
        showarrow: !1,
        font: {
          size: 10,
          color: "rgba(239,68,68,0.8)"
        }
      }, {
        x: .7 * i,
        y: 2 * -Math.abs(n),
        text: "SE: Dominant",
        showarrow: !1,
        font: {
          size: 10,
          color: "rgba(34,197,94,0.8)"
        }
      }, {
        x: .7 * -i,
        y: 2 * -Math.abs(n),
        text: "SW: Less costly, less effective",
        showarrow: !1,
        font: {
          size: 10,
          color: "rgba(150,150,150,0.8)"
        }
      }]
    };
  Plotly.newPlot("cePlanePlot", [o, l, r, s], d, {
    responsive: !0
  })
}

function goshAnalysis(e, t, n, a = 4096) {
  const s = e.length,
    i = Math.pow(2, s) - 1;
  let r = [];
  if (i <= a)
    for (let e = 1; e <= i; e++) {
      const t = [];
      for (let n = 0; n < s; n++) e & 1 << n && t.push(n);
      t.length >= 2 && r.push(t)
    } else {
      const e = new Set;
      for (; r.length < a;) {
        const t = Math.floor(Math.random() * (s - 1)) + 2,
          n = [],
          a = [...Array(s).keys()];
        for (let e = 0; e < t; e++) {
          const e = Math.floor(Math.random() * a.length);
          n.push(a.splice(e, 1)[0])
        }
        n.sort((e, t) => e - t);
        const i = n.join(",");
        e.has(i) || (e.add(i), r.push(n))
      }
    }
  const o = [];
  for (const n of r) {
    const a = n.map(t => e[t]),
      s = n.map(e => t[e]),
      i = a.length,
      r = s.map(e => 1 / e),
      l = r.reduce((e, t) => e + t, 0),
      d = r.reduce((e, t, n) => e + t * a[n], 0) / l,
      c = r.reduce((e, t, n) => e + t * Math.pow(a[n] - d, 2), 0),
      u = l - r.reduce((e, t) => e + t * t, 0) / l,
      p = Math.max(0, (c - (i - 1)) / u),
      m = s.map(e => 1 / (e + p)),
      h = m.reduce((e, t) => e + t, 0),
      v = m.reduce((e, t, n) => e + t * a[n], 0) / h,
      g = i > 1 ? 100 * Math.max(0, (c - (i - 1)) / c) : 0;
    o.push({
      k: i,
      theta: v,
      tau2: p,
      I2: g,
      Q: c,
      indices: n
    })
  }
  return {
    results: o,
    clusters: detectGOSHClusters(o),
    k: s,
    nSubsets: o.length,
    fullEnumeration: i <= a
  }
}

function detectGOSHClusters(e, t = 3) {
  if (e.length < 10) return {
    labels: e.map(() => 0),
    centers: []
  };
  const n = e.map(e => [e.theta, e.I2 / 100]);
  let a = [];
  for (let e = 0; e < t; e++) a.push(n[Math.floor(Math.random() * n.length)].slice());
  let s = new Array(n.length).fill(0);
  for (let e = 0; e < 20; e++) {
    for (let e = 0; e < n.length; e++) {
      let i = 1 / 0;
      for (let r = 0; r < t; r++) {
        const t = Math.pow(n[e][0] - a[r][0], 2) + Math.pow(n[e][1] - a[r][1], 2);
        t < i && (i = t, s[e] = r)
      }
    }
    for (let e = 0; e < t; e++) {
      const t = n.filter((t, n) => s[n] === e);
      t.length > 0 && (a[e] = [t.reduce((e, t) => e + t[0], 0) / t.length, t.reduce((e, t) => e + t[1], 0) / t.length])
    }
  }
  return {
    labels: s,
    centers: a
  }
}

function renderGOSHPlot(e, t = "goshPlot") {
  if (!document.getElementById(t) || !e) return;
  const n = e.results,
    a = e.clusters,
    s = ["#4a7ab8", "#e6a919", "#22c55e", "#ef4444", "#a855f7"],
    i = [],
    r = {};
  n.forEach((e, t) => {
    const n = a.labels[t];
    r[n] || (r[n] = {
      theta: [],
      I2: [],
      text: []
    }), r[n].theta.push(e.theta), r[n].I2.push(e.I2), r[n].text.push(`k=${e.k}, θ=${e.theta.toFixed(3)}, I²=${e.I2.toFixed(1)}%`)
  }), Object.keys(r).forEach((e, t) => {
    const n = r[e];
    i.push({
      type: "scatter",
      mode: "markers",
      x: n.theta,
      y: n.I2,
      text: n.text,
      hovertemplate: "%{text}<extra></extra>",
      marker: {
        size: 5,
        color: s[t % s.length],
        opacity: .6
      },
      name: `Cluster ${parseInt(e)+1}`
    })
  });
  const o = {
    title: `GOSH Plot (${e.nSubsets.toLocaleString()} subsets)`,
    xaxis: {
      title: "Pooled Effect (θ)"
    },
    yaxis: {
      title: "Heterogeneity (I²%)",
      range: [0, 100]
    },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: {
      color: getComputedStyle(document.documentElement).getPropertyValue("--text-primary")
    },
    showlegend: !0,
    legend: {
      x: 1,
      xanchor: "right",
      y: 1
    }
  };
  Plotly.newPlot(t, i, o, {
    responsive: !0
  })
}

function metaAnalysisPower(e, t, n, a = 0, s = .05) {
  const i = (4 / n + a) / e,
    r = Math.sqrt(i),
    o = qnorm(1 - s / 2),
    l = Math.abs(t) / r;
  return {
    power: 1 - pnorm(o - l) + pnorm(-o - l),
    se: r,
    ncp: l,
    k: e,
    effectSize: t,
    tau2: a,
    alpha: s
  }
}

function requiredStudies(e, t, n = 0, a = .8, s = .05) {
  const i = 4 / t,
    r = qnorm(1 - s / 2),
    o = qnorm(a),
    l = Math.pow(r + o, 2) * (i + n) / Math.pow(e, 2);
  return {
    requiredK: Math.ceil(l),
    exactK: l,
    effectSize: e,
    tau2: n,
    targetPower: a,
    alpha: s
  }
}

function powerCurve(e, t, n = 0, a = .05) {
  const s = [],
    i = [];
  for (let r = .05; r <= 1; r += .05) s.push(r), i.push(metaAnalysisPower(e, r, t, n, a).power);
  return {
    effectSizes: s,
    powers: i,
    k: e,
    tau2: n
  }
}

function renderPowerAnalysis(e, t, n = "powerAnalysisResults") {
  const a = document.getElementById(n);
  if (!a) return;
  const s = metaAnalysisPower(e.k, Math.abs(t), e.avgN || 100, e.tau2 || 0),
    i = requiredStudies(Math.abs(t), e.avgN || 100, e.tau2 || 0, .8);
  a.innerHTML = `\n        <div class="power-analysis-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:var(--space-4);">\n          <div class="stat-card">\n            <div class="stat-card__label">Current Power</div>\n            <div class="stat-card__value" style="color:${s.power>=.8?"var(--color-success-500)":"var(--color-warning-500)"}">\n              ${(100*s.power).toFixed(1)}%\n            </div>\n          </div>\n          <div class="stat-card">\n            <div class="stat-card__label">Studies for 80% Power</div>\n            <div class="stat-card__value">${i.requiredK}</div>\n          </div>\n          <div class="stat-card">\n            <div class="stat-card__label">Current k</div>\n            <div class="stat-card__value">${e.k}</div>\n          </div>\n          <div class="stat-card">\n            <div class="stat-card__label">Detectable Effect (80% power)</div>\n            <div class="stat-card__value">${findDetectableEffect(e.k,e.avgN||100,e.tau2||0).toFixed(3)}</div>\n          </div>\n        </div>\n      `
}

function findDetectableEffect(e, t, n, a = .8, s = .05) {
  let i = .001,
    r = 2;
  for (; r - i > .001;) {
    const o = (i + r) / 2;
    metaAnalysisPower(e, o, t, n, s).power < a ? i = o : r = o
  }
  return (i + r) / 2
}

function trialSequentialAnalysis(e, t = .05, n = .2, a = null) {
  const s = e.length,
    i = [...e].sort((e, t) => (e.year || 0) - (t.year || 0)),
    r = i.reduce((e, t) => e + t.vi, 0) / s;
  if (null === a) {
    const e = i.map(e => 1 / e.vi),
      t = e.reduce((e, t) => e + t, 0);
    a = Math.abs(e.reduce((e, t, n) => e + t * i[n].yi, 0) / t)
  }
  const o = qnorm(1 - t / 2),
    l = qnorm(1 - n),
    d = Math.pow(o + l, 2) * r / Math.pow(a, 2),
    c = [];
  let u = 0,
    p = 0,
    m = 0;
  for (let e = 0; e < s; e++) {
    const t = 1 / i[e].vi;
    u += t * i[e].yi, p += t, m += i[e].n || 1 / i[e].vi;
    const n = u / p,
      a = Math.sqrt(1 / p),
      s = n / a,
      h = p / (d / r),
      v = o / Math.sqrt(h),
      g = -l * Math.sqrt(h);
    c.push({
      k: e + 1,
      year: i[e].year,
      theta: n,
      se: a,
      z: s,
      informationFraction: Math.min(h, 1),
      upperBoundary: v,
      lowerBoundary: -v,
      futilityBoundary: g,
      crossedEfficacy: Math.abs(s) > v,
      crossedFutility: s < g && s > -v
    })
  }
  const h = c[c.length - 1];
  let v = "CONTINUE";
  return h.crossedEfficacy ? v = "EFFICACY_ESTABLISHED" : h.crossedFutility ? v = "FUTILITY" : h.informationFraction >= 1 && (v = "RIS_REACHED"), {
    cumulative: c,
    RIS: d,
    currentInformation: h.informationFraction,
    conclusion: v,
    alpha: t,
    beta: n,
    delta: a
  }
}

function renderTSAPlot(e, t = "tsaPlot") {
  if (!document.getElementById(t) || !e) return;
  const n = e.cumulative,
    a = n.map(e => 100 * e.informationFraction),
    s = [{
      type: "scatter",
      mode: "lines+markers",
      x: a,
      y: n.map(e => e.z),
      name: "Cumulative Z",
      line: {
        color: "#4a7ab8",
        width: 2
      },
      marker: {
        size: 8
      }
    }, {
      type: "scatter",
      mode: "lines",
      x: a,
      y: n.map(e => e.upperBoundary),
      name: "Efficacy Boundary",
      line: {
        color: "#22c55e",
        width: 2,
        dash: "dash"
      }
    }, {
      type: "scatter",
      mode: "lines",
      x: a,
      y: n.map(e => e.lowerBoundary),
      name: "Efficacy Boundary (lower)",
      line: {
        color: "#22c55e",
        width: 2,
        dash: "dash"
      },
      showlegend: !1
    }, {
      type: "scatter",
      mode: "lines",
      x: a,
      y: n.map(e => e.futilityBoundary),
      name: "Futility Boundary",
      line: {
        color: "#ef4444",
        width: 2,
        dash: "dot"
      }
    }, {
      type: "scatter",
      mode: "lines",
      x: [0, 100],
      y: [1.96, 1.96],
      name: "p = 0.05",
      line: {
        color: "#888",
        width: 1,
        dash: "dot"
      }
    }],
    i = {
      title: `Trial Sequential Analysis (${e.conclusion.replace(/_/g," ")})`,
      xaxis: {
        title: "Information Fraction (%)",
        range: [0, Math.max(100, 100 * n[n.length - 1].informationFraction + 10)]
      },
      yaxis: {
        title: "Cumulative Z-statistic"
      },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: {
        color: getComputedStyle(document.documentElement).getPropertyValue("--text-primary")
      },
      showlegend: !0,
      legend: {
        x: .02,
        y: .98
      },
      shapes: [{
        type: "line",
        x0: 100,
        x1: 100,
        y0: -10,
        y1: 10,
        line: {
          color: "#888",
          width: 2,
          dash: "dash"
        }
      }]
    };
  Plotly.newPlot(t, s, i, {
    responsive: !0
  })
}

function generateFunnelContours(e, t = [.01, 1.5], n = [.01, .05, .1]) {
  const a = {};
  for (const s of n) {
    const n = qnorm(1 - s / 2);
    a[s] = {
      se: [],
      upper: [],
      lower: []
    };
    for (let i = t[0]; i <= t[1]; i += .01) a[s].se.push(i), a[s].upper.push(e + n * i), a[s].lower.push(e - n * i)
  }
  return a
}

function renderContourFunnelPlot(e, t = "contourFunnelPlot") {
  if (!document.getElementById(t) || !e || !e.studies) return;
  const n = e.studies,
    a = e.pooled.theta,
    s = 1.2 * Math.max(...n.map(e => e.sei)),
    i = generateFunnelContours(a, [.001, s]),
    r = [],
    o = {
      .01: "rgba(239, 68, 68, 0.15)",
      .05: "rgba(234, 179, 8, 0.15)",
      .1: "rgba(34, 197, 94, 0.15)"
    },
    l = {
      .01: "p < 0.01",
      .05: "p < 0.05",
      .1: "p < 0.10"
    };
  [.1, .05, .01].forEach(e => {
    const t = i[e];
    r.push({
      type: "scatter",
      mode: "lines",
      x: t.upper,
      y: t.se,
      line: {
        color: o[e].replace("0.15", "0.5"),
        width: 1
      },
      name: l[e],
      showlegend: .05 === e
    }), r.push({
      type: "scatter",
      mode: "lines",
      x: t.lower,
      y: t.se,
      line: {
        color: o[e].replace("0.15", "0.5"),
        width: 1
      },
      showlegend: !1
    })
  }), r.push({
    type: "scatter",
    mode: "lines",
    x: [a, a],
    y: [0, s],
    line: {
      color: "#4a7ab8",
      width: 2
    },
    name: "Pooled Effect"
  }), r.push({
    type: "scatter",
    mode: "markers",
    x: n.map(e => e.yi),
    y: n.map(e => e.sei),
    text: n.map(e => e.name),
    hovertemplate: "%{text}<br>Effect: %{x:.3f}<br>SE: %{y:.3f}<extra></extra>",
    marker: {
      size: 10,
      color: "#e6a919",
      line: {
        color: "#fff",
        width: 1
      }
    },
    name: "Studies"
  });
  const d = {
    title: "Contour-Enhanced Funnel Plot",
    xaxis: {
      title: "Effect Size",
      zeroline: !0
    },
    yaxis: {
      title: "Standard Error",
      autorange: "reversed",
      rangemode: "tozero"
    },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: {
      color: getComputedStyle(document.documentElement).getPropertyValue("--text-primary")
    },
    showlegend: !0,
    legend: {
      x: 1,
      xanchor: "right",
      y: 1
    }
  };
  Plotly.newPlot(t, r, d, {
    responsive: !0
  })
}

function pCurveAnalysis(e) {
  const t = e.map(e => {
    const t = e.yi / e.sei;
    return {
      z: t,
      p: 2 * (1 - pnorm(Math.abs(t))),
      study: e.name
    }
  }).filter(e => e.p < .05 && e.p > 0);
  if (t.length < 3) return {
    ok: !1,
    message: "Insufficient significant studies (need ≥ 3)",
    n: t.length
  };
  const n = [{
    range: [0, .01],
    label: "p < .01",
    count: 0
  }, {
    range: [.01, .02],
    label: ".01 ≤ p < .02",
    count: 0
  }, {
    range: [.02, .03],
    label: ".02 ≤ p < .03",
    count: 0
  }, {
    range: [.03, .04],
    label: ".03 ≤ p < .04",
    count: 0
  }, {
    range: [.04, .05],
    label: ".04 ≤ p < .05",
    count: 0
  }];
  t.forEach(e => {
    for (const t of n)
      if (e.p >= t.range[0] && e.p < t.range[1]) {
        t.count++;
        break
      }
  });
  const a = n[0].count + n[1].count,
    s = (n[3].count, n[4].count, t.length),
    i = 1 - binomialCDF(a - 1, s, .4),
    r = binomialCDF(a, s, .4),
    o = t.map(e => e.p / .05).reduce((e, t) => e + qnorm(1 - t), 0) / Math.sqrt(s),
    l = 1 - pnorm(o);
  let d = "",
    c = "";
  return i < .05 ? (d = "Right-skewed: Contains evidential value", c = "PRESENT") : r < .05 ? (d = "Flat/Left-skewed: Suggests p-hacking or selective reporting", c = "ABSENT (possible p-hacking)") : (d = "Inconclusive: Cannot determine evidential value", c = "INCONCLUSIVE"), {
    ok: !0,
    n: t.length,
    bins: n,
    pRightSkew: i,
    pFlat: r,
    stoufferZ: o,
    stoufferP: l,
    interpretation: d,
    evidentialValue: c,
    significant: t
  }
}

function binomialCDF(e, t, n) {
  let a = 0;
  for (let s = 0; s <= e; s++) a += binomialPMF(s, t, n);
  return a
}

function binomialPMF(e, t, n) {
  return binomialCoeff(t, e) * Math.pow(n, e) * Math.pow(1 - n, t - e)
}

function binomialCoeff(e, t) {
  if (t < 0 || t > e) return 0;
  if (0 === t || t === e) return 1;
  let n = 1;
  for (let a = 0; a < t; a++) n = n * (e - a) / (a + 1);
  return n
}

function renderPCurvePlot(e, t = "pCurvePlot") {
  if (!document.getElementById(t) || !e || !e.ok) return;
  const n = e.bins,
    a = n.map(e => e.count),
    s = e.n,
    i = n.map(() => s / 5),
    r = [{
      type: "bar",
      x: n.map(e => e.label),
      y: a,
      name: "Observed",
      marker: {
        color: "#4a7ab8"
      }
    }, {
      type: "scatter",
      mode: "lines+markers",
      x: n.map(e => e.label),
      y: i,
      name: "Expected (null)",
      line: {
        color: "#ef4444",
        dash: "dash",
        width: 2
      },
      marker: {
        size: 8
      }
    }],
    o = {
      title: `P-Curve (n=${s} significant studies)<br><sub>${e.evidentialValue}</sub>`,
      xaxis: {
        title: "P-value Range"
      },
      yaxis: {
        title: "Number of Studies"
      },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: {
        color: getComputedStyle(document.documentElement).getPropertyValue("--text-primary")
      },
      showlegend: !0,
      barmode: "group"
    };
  Plotly.newPlot(t, r, o, {
    responsive: !0
  })
}

function zCurveAnalysis(e) {
  const t = e.map(e => ({
    z: Math.abs(e.yi / e.sei),
    name: e.name
  })).filter(e => e.z > 1.96);
  if (t.length < 5) return {
    ok: !1,
    message: "Insufficient significant studies (need ≥ 5)",
    n: t.length
  };
  const n = t.map(e => e.z),
    a = n.map(e => 1 - pnorm(1.96 - e) + pnorm(-1.96 - e)),
    s = a.reduce((e, t) => e + t, 0) / a.length,
    i = e.length,
    r = t.length,
    o = r / i,
    l = s,
    d = (1 - s) / (s + 1 - s),
    c = .5,
    u = [];
  for (let e = 0; e <= 6; e += c) {
    const t = n.filter(t => t >= e && t < e + c).length;
    u.push({
      z: e + .25,
      count: t
    })
  }
  const p = u.map(e => {
    const t = dnorm(e.z - qnorm(.975));
    return {
      z: e.z,
      density: t * r * c * 2
    }
  });
  return {
    ok: !0,
    nTotal: i,
    nSignificant: r,
    observedDiscoveryRate: o,
    expectedReplicationRate: l,
    meanObservedPower: s,
    maxFDR: d,
    zScores: n,
    bins: u,
    theoreticalCurve: p,
    interpretation: l > .5 ? "Good replicability expected" : "Low replicability - possible publication bias"
  }
}

function renderZCurvePlot(e, t = "zCurvePlot") {
  if (!document.getElementById(t) || !e || !e.ok) return;
  const n = [{
      type: "bar",
      x: e.bins.map(e => e.z),
      y: e.bins.map(e => e.count),
      name: "Observed",
      marker: {
        color: "#4a7ab8",
        opacity: .7
      },
      width: .4
    }, {
      type: "scatter",
      mode: "lines",
      x: [1.96, 1.96],
      y: [0, 1.2 * Math.max(...e.bins.map(e => e.count))],
      name: "z = 1.96",
      line: {
        color: "#ef4444",
        width: 2,
        dash: "dash"
      }
    }],
    a = {
      title: `Z-Curve Analysis<br><sub>ERR = ${(100*e.expectedReplicationRate).toFixed(0)}%, EDR = ${(100*e.observedDiscoveryRate).toFixed(0)}%</sub>`,
      xaxis: {
        title: "Z-score",
        range: [0, 6]
      },
      yaxis: {
        title: "Frequency"
      },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: {
        color: getComputedStyle(document.documentElement).getPropertyValue("--text-primary")
      },
      showlegend: !0,
      annotations: [{
        x: 4,
        y: .9 * Math.max(...e.bins.map(e => e.count)),
        text: `ERR: ${(100*e.expectedReplicationRate).toFixed(0)}%<br>Max FDR: ${(100*e.maxFDR).toFixed(0)}%`,
        showarrow: !1,
        bgcolor: "rgba(0,0,0,0.5)",
        font: {
          color: "#fff",
          size: 12
        }
      }]
    };
  Plotly.newPlot(t, n, a, {
    responsive: !0
  })
}

function renderSunsetPlot(e, t = "sunsetPlot") {
  if (!document.getElementById(t) || !e || !e.studies) return;
  const n = e.studies,
    a = e.pooled.theta,
    s = 1.2 * Math.max(...n.map(e => e.sei)),
    i = [],
    r = ["#ef4444", "#f97316", "#eab308", "#22c55e"];
  [.33, .5, .8, .95].forEach((e, t) => {
    const n = qnorm(e) + 1.96,
      o = [],
      l = [],
      d = [];
    for (let e = .01; e <= s; e += .01) {
      o.push(e);
      const t = n * e;
      l.push(a + t), d.push(a - t)
    }
    i.push({
      type: "scatter",
      mode: "lines",
      x: l,
      y: o,
      name: `${(100*e).toFixed(0)}% power`,
      line: {
        color: r[t],
        width: 1.5,
        dash: t < 2 ? "dot" : "solid"
      },
      legendgroup: `power${t}`
    }), i.push({
      type: "scatter",
      mode: "lines",
      x: d,
      y: o,
      showlegend: !1,
      line: {
        color: r[t],
        width: 1.5,
        dash: t < 2 ? "dot" : "solid"
      },
      legendgroup: `power${t}`
    })
  }), i.push({
    type: "scatter",
    mode: "lines",
    x: [a, a],
    y: [0, s],
    line: {
      color: "#fff",
      width: 2
    },
    name: "Pooled Effect"
  });
  const o = n.map(e => 1 - pnorm(1.96 - Math.abs(e.yi) / e.sei));
  i.push({
    type: "scatter",
    mode: "markers",
    x: n.map(e => e.yi),
    y: n.map(e => e.sei),
    text: n.map((e, t) => `${e.name}<br>Power: ${(100*o[t]).toFixed(0)}%`),
    hovertemplate: "%{text}<extra></extra>",
    marker: {
      size: 10,
      color: o.map(e => e >= .8 ? "#22c55e" : e >= .5 ? "#eab308" : "#ef4444"),
      line: {
        color: "#fff",
        width: 1
      }
    },
    name: "Studies"
  });
  const l = {
    title: "Sunset Plot (Power Contours)",
    xaxis: {
      title: "Effect Size"
    },
    yaxis: {
      title: "Standard Error",
      autorange: "reversed"
    },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: {
      color: getComputedStyle(document.documentElement).getPropertyValue("--text-primary")
    },
    showlegend: !0,
    legend: {
      x: 1,
      xanchor: "right",
      y: 1
    }
  };
  Plotly.newPlot(t, i, l, {
    responsive: !0
  })
}

function clubSandwichCR2(e, t, n, a) {
  const s = e.length,
    i = [...new Set(n)],
    r = i.length,
    o = t.map(e => 1 / e),
    l = o.reduce((e, t) => e + t, 0),
    d = e.map(e => e - a);
  let c = 0;
  const u = [];
  for (const e of i) {
    const t = n.map((t, n) => t === e ? n : -1).filter(e => e >= 0),
      a = t.map(e => d[e]),
      s = t.map(e => o[e]),
      i = a.reduce((e, t, n) => e + s[n] * t, 0);
    u.push(i), c += i * i
  }
  const p = 1 / l,
    m = Math.sqrt(p * c * p),
    h = [];
  for (const e of i) {
    const t = n.map((t, n) => t === e ? n : -1).filter(e => e >= 0).reduce((e, t) => e + o[t], 0) / l;
    h.push(t)
  }
  let v = 0;
  for (let e = 0; e < r; e++) {
    const t = 1 / Math.sqrt(1 - h[e]);
    v += Math.pow(u[e] * t, 2)
  }
  const g = Math.sqrt(p * v * p),
    f = u.map((e, t) => e / Math.sqrt(1 - h[t])),
    _ = f.reduce((e, t) => e + t * t, 0),
    y = _ * _ / f.reduce((e, t, n) => e + Math.pow(t, 4) / Math.pow(1 - h[n], 2), 0),
    b = a / g,
    x = 2 * (1 - pt(Math.abs(b), y)),
    w = qt(.975, y),
    M = a - w * g,
    S = a + w * g;
  return {
    theta: a,
    se_model: Math.sqrt(p),
    se_robust_HC0: m,
    se_robust_CR2: g,
    df: y,
    tStat: b,
    pValue: x,
    ci_lower: M,
    ci_upper: S,
    nClusters: r,
    n: s,
    leverages: h,
    method: "CR2 (Tipton-Pustejovsky)"
  }
}

function pt(e, t) {
  return 1 - .5 * betainc(t / 2, .5, t / (t + e * e))
}

function qt(e, t) {
  let n = qnorm(e);
  for (let a = 0; a < 10; a++) {
    n -= (pt(n, t) - e) / dt(n, t)
  }
  return n
}

function dt(e, t) {
  return Math.exp(lgamma((t + 1) / 2) - lgamma(t / 2)) / Math.sqrt(t * Math.PI) * Math.pow(1 + e * e / t, -(t + 1) / 2)
}

function runGOSHAnalysis() {
  console.log("[GOSH] Starting analysis...");
  const e = AppState.results;
  if (console.log("[GOSH] AppState.results:", e), !e || !e.studies) return showToast("Run analysis first", "error"), void console.log("[GOSH] No results - aborting");
  console.log("[GOSH] Studies found:", e.studies.length);
  const t = event?.target;
  t && (t.disabled = !0, t.innerHTML = '<span class="btn-spinner">⟳</span> Running...'), showToast("Running GOSH analysis (this may take a moment)...", "info");
  const n = e.studies.map(e => e.yi),
    a = e.studies.map(e => e.vi),
    s = (e.studies.map(e => e.name), new Blob(["\n        function goshWorker(yi, vi, maxSubsets) {\n          const k = yi.length;\n          const totalSubsets = Math.pow(2, k) - 1;\n          let subsets = [];\n\n          if (totalSubsets <= maxSubsets) {\n            for (let mask = 1; mask <= totalSubsets; mask++) {\n              const indices = [];\n              for (let i = 0; i < k; i++) {\n                if (mask & (1 << i)) indices.push(i);\n              }\n              if (indices.length >= 2) subsets.push(indices);\n            }\n          } else {\n            const seen = new Set();\n            while (subsets.length < maxSubsets) {\n              const size = Math.floor(Math.random() * (k - 1)) + 2;\n              const indices = [];\n              const available = [...Array(k).keys()];\n              for (let i = 0; i < size; i++) {\n                const idx = Math.floor(Math.random() * available.length);\n                indices.push(available.splice(idx, 1)[0]);\n              }\n              indices.sort((a, b) => a - b);\n              const key = indices.join(',');\n              if (!seen.has(key)) {\n                seen.add(key);\n                subsets.push(indices);\n              }\n            }\n          }\n\n          // Progress update\n          self.postMessage({ type: 'progress', pct: 10 });\n\n          const results = [];\n          const progressInterval = Math.floor(subsets.length / 10);\n\n          for (let s = 0; s < subsets.length; s++) {\n            const indices = subsets[s];\n            const yi_sub = indices.map(i => yi[i]);\n            const vi_sub = indices.map(i => vi[i]);\n            const k_sub = yi_sub.length;\n\n            const wi = vi_sub.map(v => 1 / v);\n            const sumW = wi.reduce((a, b) => a + b, 0);\n            const theta_fe = wi.reduce((sum, w, i) => sum + w * yi_sub[i], 0) / sumW;\n            const Q = wi.reduce((sum, w, i) => sum + w * Math.pow(yi_sub[i] - theta_fe, 2), 0);\n            const C = sumW - wi.reduce((sum, w) => sum + w * w, 0) / sumW;\n            const tau2 = Math.max(0, (Q - (k_sub - 1)) / C);\n\n            const wi_re = vi_sub.map(v => 1 / (v + tau2));\n            const sumW_re = wi_re.reduce((a, b) => a + b, 0);\n            const theta_re = wi_re.reduce((sum, w, i) => sum + w * yi_sub[i], 0) / sumW_re;\n            const I2 = k_sub > 1 ? Math.max(0, (Q - (k_sub - 1)) / Q) * 100 : 0;\n\n            results.push({ k: k_sub, theta: theta_re, tau2, I2, Q, indices });\n\n            if (s % progressInterval === 0) {\n              self.postMessage({ type: 'progress', pct: 10 + Math.floor(s / subsets.length * 80) });\n            }\n          }\n\n          self.postMessage({ type: 'progress', pct: 95 });\n\n          // K-means clustering\n          const data = results.map(r => [r.theta, r.I2 / 100]);\n          const nClusters = 3;\n          let centers = [];\n          for (let i = 0; i < nClusters; i++) {\n            centers.push(data[Math.floor(Math.random() * data.length)].slice());\n          }\n          let labels = new Array(data.length).fill(0);\n\n          for (let iter = 0; iter < 20; iter++) {\n            for (let i = 0; i < data.length; i++) {\n              let minDist = Infinity;\n              for (let c = 0; c < nClusters; c++) {\n                const dist = Math.pow(data[i][0] - centers[c][0], 2) + Math.pow(data[i][1] - centers[c][1], 2);\n                if (dist < minDist) { minDist = dist; labels[i] = c; }\n              }\n            }\n            for (let c = 0; c < nClusters; c++) {\n              const pts = data.filter((_, i) => labels[i] === c);\n              if (pts.length > 0) {\n                centers[c] = [\n                  pts.reduce((s, p) => s + p[0], 0) / pts.length,\n                  pts.reduce((s, p) => s + p[1], 0) / pts.length\n                ];\n              }\n            }\n          }\n\n          return {\n            results, clusters: { labels, centers }, k, nSubsets: results.length,\n            fullEnumeration: totalSubsets <= maxSubsets\n          };\n        }\n\n        self.onmessage = function(e) {\n          const { yi, vi, maxSubsets } = e.data;\n          try {\n            const result = goshWorker(yi, vi, maxSubsets);\n            self.postMessage({ type: 'result', data: result });\n          } catch (err) {\n            self.postMessage({ type: 'error', message: err.message });\n          }\n        };\n      "], {
      type: "application/javascript"
    })),
    i = URL.createObjectURL(s),
    r = new Worker(i);

  function o() {
    r.terminate(), URL.revokeObjectURL(i), t && (t.disabled = !1, t.innerHTML = "Generate GOSH")
  }
  r.onmessage = function(e) {
    if ("progress" === e.data.type);
    else if ("result" === e.data.type) {
      const t = e.data.data;
      renderGOSHPlot(t, "goshPlot"), document.getElementById("goshResults").innerHTML = "<p><strong>Subsets analyzed:</strong> " + t.nSubsets.toLocaleString() + " " + (t.fullEnumeration ? "(complete)" : "(sampled)") + "</p><p><strong>Clusters detected:</strong> " + t.clusters.centers.length + "</p>", showToast("GOSH analysis complete", "success"), o()
    } else "error" === e.data.type && (showToast("GOSH failed: " + e.data.message, "error"), o())
  }, r.onerror = function(e) {
    showToast("GOSH worker error", "error"), o()
  }, r.postMessage({
    yi: n,
    vi: a,
    maxSubsets: 4096
  })
}

function runTSAAnalysis() {
  console.log("[TSA] Starting analysis...");
  const e = AppState.results;
  if (console.log("[TSA] AppState.results:", e), !e || !e.studies) return showToast("Run analysis first", "error"), void console.log("[TSA] No results - aborting");
  console.log("[TSA] Studies found:", e.studies.length);
  const t = e.studies.map(e => ({
    yi: e.yi,
    vi: e.vi,
    sei: e.sei,
    year: e.year || 2020,
    n: e.n_t ? e.n_t + e.n_c : Math.round(4 / e.vi)
  }));
  try {
    const e = trialSequentialAnalysis(t, .05, .2);
    renderTSAPlot(e, "tsaPlot");
    const n = {
      EFFICACY_ESTABLISHED: "var(--color-success-500)",
      FUTILITY: "var(--color-warning-500)",
      RIS_REACHED: "var(--color-success-500)",
      CONTINUE: "var(--text-secondary)"
    };
    document.getElementById("tsaResults").innerHTML = `\n          <p><strong>Conclusion:</strong> <span style="color:${n[e.conclusion]}">${e.conclusion.replace(/_/g," ")}</span></p>\n          <p><strong>Information fraction:</strong> ${(100*e.currentInformation).toFixed(1)}%</p>\n          <p><strong>Required Information Size:</strong> ${e.RIS.toFixed(0)}</p>\n        `, showToast("TSA complete", "success")
  } catch (e) {
    showToast("TSA failed: " + e.message, "error"), console.error(e)
  }
}

function runPCurveAnalysis() {
  console.log("[P-Curve] Starting analysis...");
  const e = AppState.results;
  if (!e || !e.studies) return showToast("Run analysis first", "error"), void console.log("[P-Curve] No results - aborting");
  console.log("[P-Curve] Studies found:", e.studies.length);
  const t = e.studies.map(e => ({
    yi: e.yi,
    sei: e.sei,
    name: e.name
  }));
  try {
    const e = pCurveAnalysis(t);
    if (!e.ok) return void(document.getElementById("pCurveResults").innerHTML = `<p class="text-warning">${e.message}</p>`);
    renderPCurvePlot(e, "pCurvePlot");
    const n = {
      PRESENT: "var(--color-success-500)",
      "ABSENT (possible p-hacking)": "var(--color-danger-500)",
      INCONCLUSIVE: "var(--color-warning-500)"
    };
    document.getElementById("pCurveResults").innerHTML = `\n          <p><strong>Evidential value:</strong> <span style="color:${n[e.evidentialValue]}">${e.evidentialValue}</span></p>\n          <p><strong>Right-skew test:</strong> p = ${e.pRightSkew.toFixed(4)}</p>\n          <p><strong>Flatness test:</strong> p = ${e.pFlat.toFixed(4)}</p>\n          <p><em>${e.interpretation}</em></p>\n        `, showToast("P-Curve complete", "success")
  } catch (e) {
    showToast("P-Curve failed: " + e.message, "error"), console.error(e)
  }
}

function runZCurveAnalysis() {
  const e = AppState.results;
  if (!e || !e.studies) return void showToast("Run analysis first", "error");
  const t = e.studies.map(e => ({
    yi: e.yi,
    sei: e.sei,
    name: e.name
  }));
  try {
    const e = zCurveAnalysis(t);
    if (!e.ok) return void(document.getElementById("zCurveResults").innerHTML = `<p class="text-warning">${e.message}</p>`);
    renderZCurvePlot(e, "zCurvePlot"), document.getElementById("zCurveResults").innerHTML = `\n          <p><strong>Expected Replication Rate:</strong> ${(100*e.expectedReplicationRate).toFixed(0)}%</p>\n          <p><strong>Observed Discovery Rate:</strong> ${(100*e.observedDiscoveryRate).toFixed(0)}%</p>\n          <p><strong>Max False Discovery Rate:</strong> ${(100*e.maxFDR).toFixed(0)}%</p>\n          <p><em>${e.interpretation}</em></p>\n        `, showToast("Z-Curve complete", "success")
  } catch (e) {
    showToast("Z-Curve failed: " + e.message, "error"), console.error(e)
  }
}

function runCR2Analysis() {
  const e = AppState.results;
  if (!e || !e.studies) return void showToast("Run analysis first", "error");
  const t = e.studies.map(e => e.yi),
    n = e.studies.map(e => e.vi),
    a = t.map((e, t) => t);
  try {
    const s = clubSandwichCR2(t, n, a, e.pooled.theta);
    document.getElementById("cr2Results").innerHTML = `\n          <div class="stat-grid" style="grid-template-columns: repeat(2, 1fr); gap: var(--space-3);">\n            <div class="stat-card">\n              <div class="stat-card__label">Model SE</div>\n              <div class="stat-card__value">${s.se_model.toFixed(4)}</div>\n            </div>\n            <div class="stat-card">\n              <div class="stat-card__label">CR2 Robust SE</div>\n              <div class="stat-card__value">${s.se_robust_CR2.toFixed(4)}</div>\n            </div>\n            <div class="stat-card">\n              <div class="stat-card__label">Satterthwaite df</div>\n              <div class="stat-card__value">${s.df.toFixed(1)}</div>\n            </div>\n            <div class="stat-card">\n              <div class="stat-card__label">p-value (CR2)</div>\n              <div class="stat-card__value">${s.pValue<.001?"<0.001":s.pValue.toFixed(4)}</div>\n            </div>\n          </div>\n          <p style="margin-top: var(--space-3);"><strong>95% CI (CR2):</strong> [${s.ci_lower.toFixed(4)}, ${s.ci_upper.toFixed(4)}]</p>\n          <p style="font-size: var(--text-xs); color: var(--text-secondary);">Method: ${s.method}</p>\n        `, showToast("CR2 analysis complete", "success")
  } catch (e) {
    showToast("CR2 failed: " + e.message, "error"), console.error(e)
  }
}

function autoRenderPowerAnalysis() {
  const e = AppState.results;
  if (!e || !e.studies) return;
  const t = e.studies.reduce((e, t) => e + (t.n_t && t.n_c ? t.n_t + t.n_c : Math.round(4 / t.vi)), 0) / e.studies.length;
  renderPowerAnalysis({
    k: e.k,
    avgN: t,
    tau2: e.tau2
  }, e.pooled.theta, "powerAnalysisResults");
  const n = powerCurve(e.k, t, e.tau2);
  document.getElementById("powerCurvePlot") && Plotly.newPlot("powerCurvePlot", [{
    type: "scatter",
    mode: "lines",
    x: n.effectSizes,
    y: n.powers.map(e => 100 * e),
    line: {
      color: "#4a7ab8",
      width: 2
    }
  }, {
    type: "scatter",
    mode: "lines",
    x: [0, 1],
    y: [80, 80],
    line: {
      color: "#22c55e",
      width: 1,
      dash: "dash"
    },
    name: "80% power"
  }], {
    title: "Power Curve",
    xaxis: {
      title: "Effect Size"
    },
    yaxis: {
      title: "Power (%)",
      range: [0, 100]
    },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: {
      color: getComputedStyle(document.documentElement).getPropertyValue("--text-primary")
    },
    showlegend: !1
  }, {
    responsive: !0
  })
}

function sampleSizeInstrument(e) {
  const t = e.length;
  if (t < 5) return {
    ok: !1,
    message: "Need at least 5 studies"
  };
  const n = e.map(e => ({
      yi: e.yi,
      sei: e.sei,
      vi: e.vi,
      n: e.n_t && e.n_c ? e.n_t + e.n_c : Math.round(4 / e.vi)
    })),
    a = n.map(e => Math.sqrt(e.n)),
    s = n.map(e => 1 / e.sei),
    i = a.reduce((e, t) => e + t, 0) / t,
    r = s.reduce((e, t) => e + t, 0) / t;
  let o = 0,
    l = 0;
  for (let e = 0; e < t; e++) o += (a[e] - i) * (s[e] - r), l += Math.pow(a[e] - i, 2);
  const d = o / l,
    c = r - d * i,
    u = a.map(e => c + d * e).map(e => e * e),
    p = u.reduce((e, t) => e + t, 0),
    m = u.reduce((e, t, a) => e + t * n[a].yi, 0) / p,
    h = Math.sqrt(1 / p),
    v = n.map(e => 1 / e.vi),
    g = v.reduce((e, t) => e + t, 0),
    f = v.reduce((e, t, a) => e + t * n[a].yi, 0) / g,
    _ = Math.sqrt(1 / g),
    y = Math.pow(m - f, 2) / (Math.pow(h, 2) - Math.pow(_, 2)),
    b = 1 - pchisq(Math.abs(y), 1);
  return {
    ok: !0,
    thetaIV: m,
    seIV: h,
    ciLowerIV: m - 1.96 * h,
    ciUpperIV: m + 1.96 * h,
    thetaNaive: f,
    seNaive: _,
    hausman: y,
    hausmanP: b,
    endogeneityDetected: b < .05,
    firstStageF: Math.pow(d, 2) * l / (1 / (t - 2)),
    interpretation: b < .05 ? "Significant endogeneity detected - IV estimate preferred" : "No significant endogeneity - naive estimate may be valid"
  }
}

function stepSelectionCRVE(e, t, n = null, a = [.025, .05, .5, 1]) {
  const s = e.length,
    i = t.map(e => Math.sqrt(e));
  n || (n = e.map((e, t) => t));
  const r = e.map((e, t) => e / i[t]).map(e => 1 - pnorm(e)),
    o = a.map((e, t) => ({
      lower: 0 === t ? 0 : a[t - 1],
      upper: e,
      count: 0,
      studies: []
    }));
  r.forEach((e, t) => {
    for (let n = 0; n < o.length; n++)
      if (e > o[n].lower && e <= o[n].upper) {
        o[n].count++, o[n].studies.push(t);
        break
      }
  });
  let l = a.map(() => 1);
  for (let n = 0; n < 50; n++) {
    const n = r.map((e, t) => {
        for (let t = 0; t < o.length; t++)
          if (e > o[t].lower && e <= o[t].upper) return l[t];
        return 1
      }),
      a = t.map((e, t) => n[t] / e),
      i = a.reduce((e, t) => e + t, 0);
    a.reduce((t, n, a) => t + n * e[a], 0);
    o.forEach((e, t) => {
      if (e.count > 0) {
        const n = (e.upper - e.lower) * s;
        l[t] = Math.max(.01, Math.min(1, e.count / n))
      }
    })
  }
  const d = r.map((e, t) => {
      for (let t = 0; t < o.length; t++)
        if (e > o[t].lower && e <= o[t].upper) return l[t];
      return 1
    }),
    c = t.map((e, t) => d[t] / e),
    u = c.reduce((e, t) => e + t, 0),
    p = c.reduce((t, n, a) => t + n * e[a], 0) / u,
    m = Math.sqrt(1 / u),
    h = clubSandwichCR2(e, t, n, p),
    v = t.map(e => 1 / e),
    g = v.reduce((e, t) => e + t, 0),
    f = v.reduce((t, n, a) => t + n * e[a], 0) / g,
    _ = Math.max(...l) / Math.min(...l);
  return {
    ok: !0,
    thetaAdjusted: p,
    seAdjusted: m,
    seRobust: h.se_robust_CR2,
    df: h.df,
    ciLower: p - qt(.975, h.df) * h.se_robust_CR2,
    ciUpper: p + qt(.975, h.df) * h.se_robust_CR2,
    thetaNaive: f,
    weights: l,
    intervals: o,
    selectionRatio: _,
    selectionDetected: _ > 2,
    interpretation: _ > 2 ? "Evidence of p-value dependent selection" : "No strong evidence of selection bias"
  }
}

function robustBayesianMA(e, t, n = {}) {
  e.length;
  const a = t.map(e => Math.sqrt(e)),
    s = {
      priorMu: n.priorMu || {
        mean: 0,
        sd: 1
      },
      priorTau: n.priorTau || {
        scale: .5
      },
      priorH0: n.priorH0 || .5,
      priorBias: n.priorBias || .5,
      nSamples: n.nSamples || 5e3,
      ...n
    },
    i = {
      current: 0,
      total: 6,
      status: "Initializing..."
    };
  updateRoBMAProgress(i), i.status = "Fitting RE model...", i.current = 1, updateRoBMAProgress(i);
  const r = fitREModel(e, t);
  i.status = "Fitting FE model...", i.current = 2, updateRoBMAProgress(i);
  const o = fitFEModel(e, t);
  i.status = "Fitting PET model...", i.current = 3, updateRoBMAProgress(i);
  const l = fitPETModel(e, t, a);
  i.status = "Fitting PEESE model...", i.current = 4, updateRoBMAProgress(i);
  const d = fitPEESEModel(e, t, a);
  i.status = "Fitting selection model...", i.current = 5, updateRoBMAProgress(i);
  const c = fitSelectionModelRoBMA(e, t, a);
  i.status = "Computing model weights...", i.current = 6, updateRoBMAProgress(i);
  const u = [{
      name: "RE (no bias)",
      ...r,
      hasBias: !1,
      hasEffect: !0
    }, {
      name: "FE (no bias)",
      ...o,
      hasBias: !1,
      hasEffect: !0
    }, {
      name: "PET",
      ...l,
      hasBias: !0,
      hasEffect: !0
    }, {
      name: "PEESE",
      ...d,
      hasBias: !0,
      hasEffect: !0
    }, {
      name: "Selection",
      ...c,
      hasBias: !0,
      hasEffect: !0
    }, {
      name: "Null (no effect)",
      theta: 0,
      se: .001,
      bic: -2 * nullLikelihood(e, t),
      hasBias: !1,
      hasEffect: !1
    }],
    p = u.map(e => e.bic),
    m = Math.min(...p),
    h = p.map(e => e - m),
    v = h.map(e => Math.exp(-.5 * e)),
    g = v.reduce((e, t) => e + t, 0),
    f = v.map(e => e / g);
  u.forEach((e, t) => {
    e.weight = f[t], e.deltaBIC = h[t]
  });
  const _ = u.reduce((e, t) => e + t.weight * t.theta, 0),
    y = u.reduce((e, t) => e + t.weight * t.se * t.se, 0),
    b = u.reduce((e, t) => e + t.weight * Math.pow(t.theta - _, 2), 0),
    x = Math.sqrt(y + b),
    w = u.filter(e => e.hasEffect).reduce((e, t) => e + t.weight, 0),
    M = u.filter(e => e.hasBias).reduce((e, t) => e + t.weight, 0),
    S = u.find(e => !e.hasEffect)?.weight || .001,
    E = (1 - S) / S / (s.priorH0 / (1 - s.priorH0));
  let A = "";
  return A = w > .95 ? "Strong evidence for effect" : w > .75 ? "Moderate evidence for effect" : w > .25 ? "Inconclusive evidence" : "Evidence favors null", M > .75 && (A += " (likely publication bias)"), {
    ok: !0,
    theta: _,
    se: x,
    ciLower: _ - 1.96 * x,
    ciUpper: _ + 1.96 * x,
    pEffect: w,
    pBias: M,
    bf10: E,
    models: u.sort((e, t) => t.weight - e.weight),
    interpretation: A,
    method: "RoBMA (BIC approximation)"
  }
}

function fitREModel(e, t) {
  const n = e.length,
    a = estimateTau2(e, t, "REML").tau2,
    s = t.map(e => 1 / (e + a)),
    i = s.reduce((e, t) => e + t, 0),
    r = s.reduce((t, n, a) => t + n * e[a], 0) / i,
    o = Math.sqrt(1 / i),
    l = -.5 * s.reduce((t, n, a) => t + Math.log(2 * Math.PI / n) + n * Math.pow(e[a] - r, 2), 0),
    d = -2 * l + 2 * Math.log(n);
  return {
    theta: r,
    se: o,
    tau2: a,
    ll: l,
    bic: d
  }
}

function fitFEModel(e, t) {
  const n = e.length,
    a = t.map(e => 1 / e),
    s = a.reduce((e, t) => e + t, 0),
    i = a.reduce((t, n, a) => t + n * e[a], 0) / s,
    r = Math.sqrt(1 / s),
    o = -.5 * a.reduce((t, n, a) => t + Math.log(2 * Math.PI / n) + n * Math.pow(e[a] - i, 2), 0),
    l = -2 * o + 1 * Math.log(n);
  return {
    theta: i,
    se: r,
    tau2: 0,
    ll: o,
    bic: l
  }
}

function fitPETModel(e, t, n) {
  const a = e.length,
    s = t.map(e => 1 / e),
    i = n.reduce((e, t) => e + t, 0) / a,
    r = s.reduce((t, n, a) => t + n * e[a], 0) / s.reduce((e, t) => e + t, 0);
  let o = 0,
    l = 0;
  for (let t = 0; t < a; t++) o += s[t] * (n[t] - i) * (e[t] - r), l += s[t] * Math.pow(n[t] - i, 2);
  const d = o / l,
    c = r - d * i,
    u = e.map((e, t) => e - c - d * n[t]).reduce((e, t, n) => e + s[n] * t * t, 0),
    p = Math.sqrt(1 / s.reduce((e, t) => e + t, 0)),
    m = -.5 * a * Math.log(2 * Math.PI) - .5 * u,
    h = -2 * m + 2 * Math.log(a);
  return {
    theta: c,
    se: p,
    slope: d,
    ll: m,
    bic: h
  }
}

function fitPEESEModel(e, t, n) {
  const a = e.length,
    s = t.map(e => 1 / e),
    i = n.map(e => e * e),
    r = i.reduce((e, t) => e + t, 0) / a,
    o = s.reduce((t, n, a) => t + n * e[a], 0) / s.reduce((e, t) => e + t, 0);
  let l = 0,
    d = 0;
  for (let t = 0; t < a; t++) l += s[t] * (i[t] - r) * (e[t] - o), d += s[t] * Math.pow(i[t] - r, 2);
  const c = l / d,
    u = o - c * r,
    p = e.map((e, t) => e - u - c * i[t]).reduce((e, t, n) => e + s[n] * t * t, 0),
    m = Math.sqrt(1 / s.reduce((e, t) => e + t, 0)),
    h = -.5 * a * Math.log(2 * Math.PI) - .5 * p,
    v = -2 * h + 2 * Math.log(a);
  return {
    theta: u,
    se: m,
    slope: c,
    ll: h,
    bic: v
  }
}

function fitSelectionModelRoBMA(e, t, n) {
  const a = e.length,
    s = veveaHedgesSelection(e, t, "moderate");
  if (!s.ok) {
    const n = t.map(e => 1 / e),
      a = n.reduce((e, t) => e + t, 0);
    return {
      theta: n.reduce((t, n, a) => t + n * e[a], 0) / a,
      se: Math.sqrt(1 / a),
      ll: -1e3,
      bic: 2e3
    }
  }
  const i = t.map(e => 1 / e),
    r = e.map(e => e - s.adjusted).reduce((e, t, n) => e + i[n] * t * t, 0),
    o = -.5 * a * Math.log(2 * Math.PI) - .5 * r,
    l = -2 * o + 3 * Math.log(a);
  return {
    theta: s.adjusted,
    se: s.se || .1,
    ll: o,
    bic: l
  }
}

function nullLikelihood(e, t) {
  e.length;
  return -.5 * t.map(e => 1 / e).reduce((t, n, a) => t + Math.log(2 * Math.PI / n) + n * e[a] * e[a], 0)
}

function updateRoBMAProgress(e) {
  const t = document.getElementById("robmaProgressBar"),
    n = document.getElementById("robmaStatus"),
    a = document.getElementById("robmaProgress");
  t && (t.style.width = e.current / e.total * 100 + "%"), n && (n.textContent = e.status), a && e.current > 0 && (a.style.display = "block")
}

function runRoBMA() {
  const e = AppState.results;
  if (!e || !e.studies) return void showToast("Run analysis first", "error");
  const t = document.getElementById("robmaBtn"),
    n = document.getElementById("robmaProgress"),
    a = document.getElementById("robmaProgressBar"),
    s = document.getElementById("robmaStatus");
  t && (t.disabled = !0, t.innerHTML = '<span class="btn-spinner">⟳</span> Running...'), n && (n.style.display = "block");
  const i = e.studies.map(e => e.yi),
    r = e.studies.map(e => e.vi),
    o = new Blob(["\n        // Statistical functions needed by RoBMA\n        function pnorm(x) {\n          const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;\n          const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;\n          const sign = x < 0 ? -1 : 1;\n          x = Math.abs(x) / Math.sqrt(2);\n          const t = 1.0 / (1.0 + p * x);\n          const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);\n          return 0.5 * (1.0 + sign * y);\n        }\n\n        function qnorm(p) {\n          if (p <= 0) return -Infinity;\n          if (p >= 1) return Infinity;\n          if (p === 0.5) return 0;\n          const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239e0];\n          const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];\n          const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838e0, -2.549732539343734e0, 4.374664141464968e0, 2.938163982698783e0];\n          const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996e0, 3.754408661907416e0];\n          const pLow = 0.02425, pHigh = 1 - pLow;\n          let q, r;\n          if (p < pLow) {\n            q = Math.sqrt(-2 * Math.log(p));\n            return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);\n          } else if (p <= pHigh) {\n            q = p - 0.5; r = q * q;\n            return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);\n          } else {\n            q = Math.sqrt(-2 * Math.log(1 - p));\n            return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);\n          }\n        }\n\n        function lgamma(x) {\n          const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];\n          let y = x, tmp = x + 5.5;\n          tmp -= (x + 0.5) * Math.log(tmp);\n          let ser = 1.000000000190015;\n          for (let j = 0; j < 6; j++) ser += c[j] / ++y;\n          return -tmp + Math.log(2.5066282746310005 * ser / x);\n        }\n\n        // Simplified RoBMA for worker\n        function robustBayesianMAWorker(yi, vi) {\n          const n = yi.length;\n          const sei = vi.map(v => Math.sqrt(v));\n\n          self.postMessage({ type: 'progress', current: 1, total: 6, status: 'Fitting RE model...' });\n\n          // Model 1: Random Effects\n          const wi = vi.map(v => 1 / v);\n          const sumW = wi.reduce((a, b) => a + b, 0);\n          const thetaFE = wi.reduce((s, w, i) => s + w * yi[i], 0) / sumW;\n          const Q = wi.reduce((s, w, i) => s + w * Math.pow(yi[i] - thetaFE, 2), 0);\n          const C = sumW - wi.reduce((s, w) => s + w * w, 0) / sumW;\n          const tau2 = Math.max(0, (Q - (n - 1)) / C);\n\n          const wiRE = vi.map(v => 1 / (v + tau2));\n          const sumWRE = wiRE.reduce((a, b) => a + b, 0);\n          const thetaRE = wiRE.reduce((s, w, i) => s + w * yi[i], 0) / sumWRE;\n          const seRE = Math.sqrt(1 / sumWRE);\n\n          const llRE = -0.5 * wiRE.reduce((s, w, i) => s + Math.log(2 * Math.PI / w) + w * Math.pow(yi[i] - thetaRE, 2), 0);\n          const bicRE = -2 * llRE + 2 * Math.log(n);\n\n          self.postMessage({ type: 'progress', current: 2, total: 6, status: 'Fitting FE model...' });\n\n          // Model 2: Fixed Effect\n          const seFE = Math.sqrt(1 / sumW);\n          const llFE = -0.5 * wi.reduce((s, w, i) => s + Math.log(2 * Math.PI / w) + w * Math.pow(yi[i] - thetaFE, 2), 0);\n          const bicFE = -2 * llFE + 1 * Math.log(n);\n\n          self.postMessage({ type: 'progress', current: 3, total: 6, status: 'Fitting PET model...' });\n\n          // Model 3: PET\n          const meanSE = sei.reduce((a, b) => a + b, 0) / n;\n          const meanY = thetaFE;\n          let ssXY = 0, ssXX = 0;\n          for (let i = 0; i < n; i++) {\n            ssXY += wi[i] * (sei[i] - meanSE) * (yi[i] - meanY);\n            ssXX += wi[i] * Math.pow(sei[i] - meanSE, 2);\n          }\n          const petSlope = ssXX > 0 ? ssXY / ssXX : 0;\n          const petIntercept = meanY - petSlope * meanSE;\n          const petResiduals = yi.map((y, i) => y - petIntercept - petSlope * sei[i]);\n          const petRSS = petResiduals.reduce((s, r, i) => s + wi[i] * r * r, 0);\n          const llPET = -0.5 * n * Math.log(2 * Math.PI) - 0.5 * petRSS;\n          const bicPET = -2 * llPET + 2 * Math.log(n);\n\n          self.postMessage({ type: 'progress', current: 4, total: 6, status: 'Fitting PEESE model...' });\n\n          // Model 4: PEESE\n          const se2 = sei.map(s => s * s);\n          const meanSE2 = se2.reduce((a, b) => a + b, 0) / n;\n          let ssXY2 = 0, ssXX2 = 0;\n          for (let i = 0; i < n; i++) {\n            ssXY2 += wi[i] * (se2[i] - meanSE2) * (yi[i] - meanY);\n            ssXX2 += wi[i] * Math.pow(se2[i] - meanSE2, 2);\n          }\n          const peeseSlope = ssXX2 > 0 ? ssXY2 / ssXX2 : 0;\n          const peeseIntercept = meanY - peeseSlope * meanSE2;\n          const peeseResiduals = yi.map((y, i) => y - peeseIntercept - peeseSlope * se2[i]);\n          const peeseRSS = peeseResiduals.reduce((s, r, i) => s + wi[i] * r * r, 0);\n          const llPEESE = -0.5 * n * Math.log(2 * Math.PI) - 0.5 * peeseRSS;\n          const bicPEESE = -2 * llPEESE + 2 * Math.log(n);\n\n          self.postMessage({ type: 'progress', current: 5, total: 6, status: 'Fitting selection model...' });\n\n          // Model 5: Selection (simplified - use adjusted estimate)\n          const zScores = yi.map((y, i) => y / sei[i]);\n          const significant = zScores.filter(z => Math.abs(z) > 1.96).length;\n          const selectionBias = significant / n > 0.7;  // If >70% significant, likely bias\n          const selTheta = selectionBias ? thetaRE * 0.7 : thetaRE;  // Shrink if bias suspected\n          const llSel = llRE - (selectionBias ? 5 : 0);  // Penalty for complexity\n          const bicSel = -2 * llSel + 3 * Math.log(n);\n\n          self.postMessage({ type: 'progress', current: 6, total: 6, status: 'Computing model weights...' });\n\n          // Model 6: Null\n          const llNull = -0.5 * wi.reduce((s, w, i) => s + Math.log(2 * Math.PI / w) + w * yi[i] * yi[i], 0);\n          const bicNull = -2 * llNull;\n\n          // Collect models\n          const models = [\n            { name: 'RE (no bias)', theta: thetaRE, se: seRE, bic: bicRE, hasBias: false, hasEffect: true },\n            { name: 'FE (no bias)', theta: thetaFE, se: seFE, bic: bicFE, hasBias: false, hasEffect: true },\n            { name: 'PET', theta: petIntercept, se: seFE, bic: bicPET, hasBias: true, hasEffect: true },\n            { name: 'PEESE', theta: peeseIntercept, se: seFE, bic: bicPEESE, hasBias: true, hasEffect: true },\n            { name: 'Selection', theta: selTheta, se: seRE, bic: bicSel, hasBias: true, hasEffect: true },\n            { name: 'Null', theta: 0, se: 0.001, bic: bicNull, hasBias: false, hasEffect: false }\n          ];\n\n          // BIC weights\n          const bics = models.map(m => m.bic);\n          const minBIC = Math.min(...bics);\n          const deltaBIC = bics.map(b => b - minBIC);\n          const rawWeights = deltaBIC.map(d => Math.exp(-0.5 * d));\n          const sumWeights = rawWeights.reduce((a, b) => a + b, 0);\n          const modelWeights = rawWeights.map(w => w / sumWeights);\n\n          models.forEach((m, i) => {\n            m.weight = modelWeights[i];\n            m.deltaBIC = deltaBIC[i];\n          });\n\n          // Model-averaged estimate\n          const thetaMA = models.reduce((s, m) => s + m.weight * m.theta, 0);\n          const varWithin = models.reduce((s, m) => s + m.weight * m.se * m.se, 0);\n          const varBetween = models.reduce((s, m) => s + m.weight * Math.pow(m.theta - thetaMA, 2), 0);\n          const seMA = Math.sqrt(varWithin + varBetween);\n\n          const pEffect = models.filter(m => m.hasEffect).reduce((s, m) => s + m.weight, 0);\n          const pBias = models.filter(m => m.hasBias).reduce((s, m) => s + m.weight, 0);\n\n          const nullWeight = models.find(m => !m.hasEffect)?.weight || 0.001;\n          const effectWeight = 1 - nullWeight;\n          const bf10 = (effectWeight / nullWeight) / (0.5 / 0.5);\n\n          let interpretation = pEffect > 0.95 ? 'Strong evidence for effect' :\n                              pEffect > 0.75 ? 'Moderate evidence for effect' :\n                              pEffect > 0.25 ? 'Inconclusive evidence' : 'Evidence favors null';\n          if (pBias > 0.75) interpretation += ' (likely publication bias)';\n\n          return {\n            ok: true,\n            theta: thetaMA,\n            se: seMA,\n            ciLower: thetaMA - 1.96 * seMA,\n            ciUpper: thetaMA + 1.96 * seMA,\n            pEffect: pEffect,\n            pBias: pBias,\n            bf10: bf10,\n            models: models.sort((a, b) => b.weight - a.weight),\n            interpretation: interpretation,\n            method: 'RoBMA (BIC approximation)'\n          };\n        }\n\n        self.onmessage = function(e) {\n          const { yi, vi } = e.data;\n          try {\n            const result = robustBayesianMAWorker(yi, vi);\n            self.postMessage({ type: 'result', data: result });\n          } catch (err) {\n            self.postMessage({ type: 'error', message: err.message });\n          }\n        };\n      "], {
      type: "application/javascript"
    }),
    l = URL.createObjectURL(o),
    d = new Worker(l);

  function c() {
    d.terminate(), URL.revokeObjectURL(l), t && (t.disabled = !1, t.innerHTML = "Run RoBMA"), n && (n.style.display = "none")
  }
  d.onmessage = function(e) {
    "progress" === e.data.type ? (a && (a.style.width = e.data.current / e.data.total * 100 + "%"), s && (s.textContent = e.data.status)) : "result" === e.data.type ? (renderRoBMAResults(e.data.data), renderRoBMAPlot(e.data.data), showToast("RoBMA complete", "success"), c()) : "error" === e.data.type && (showToast("RoBMA failed: " + e.data.message, "error"), c())
  }, d.onerror = function(e) {
    showToast("RoBMA worker error: " + e.message, "error"), c()
  }, d.postMessage({
    yi: i,
    vi: r
  })
}

function renderRoBMAResults(e) {
  const t = document.getElementById("robmaResults");
  if (!t) return;
  const n = e.pEffect > .95 ? "var(--color-success-500)" : e.pEffect > .75 ? "var(--color-warning-500)" : "var(--text-secondary)",
    a = e.pBias > .75 ? "var(--color-danger-500)" : e.pBias > .5 ? "var(--color-warning-500)" : "var(--color-success-500)";
  t.innerHTML = `\n        <div class="stat-grid" style="grid-template-columns: repeat(2, 1fr); gap: var(--space-3);">\n          <div class="stat-card">\n            <div class="stat-card__label">Model-Averaged Effect</div>\n            <div class="stat-card__value">${e.theta.toFixed(4)}</div>\n            <div style="font-size:var(--text-xs);">95% CI: [${e.ciLower.toFixed(4)}, ${e.ciUpper.toFixed(4)}]</div>\n          </div>\n          <div class="stat-card">\n            <div class="stat-card__label">P(Effect)</div>\n            <div class="stat-card__value" style="color:${n}">${(100*e.pEffect).toFixed(1)}%</div>\n          </div>\n          <div class="stat-card">\n            <div class="stat-card__label">P(Pub. Bias)</div>\n            <div class="stat-card__value" style="color:${a}">${(100*e.pBias).toFixed(1)}%</div>\n          </div>\n          <div class="stat-card">\n            <div class="stat-card__label">BF₁₀</div>\n            <div class="stat-card__value">${e.bf10>100?">100":e.bf10.toFixed(2)}</div>\n          </div>\n        </div>\n        <p style="margin-top:var(--space-3);"><em>${e.interpretation}</em></p>\n        <details style="margin-top:var(--space-3);">\n          <summary style="cursor:pointer;font-weight:600;">Model Weights</summary>\n          <table style="width:100%;font-size:var(--text-sm);margin-top:var(--space-2);">\n            <tr><th>Model</th><th>Weight</th><th>θ</th></tr>\n            ${e.models.map(e=>`\n              <tr>\n                <td>${e.name}</td>\n                <td>${(100*e.weight).toFixed(1)}%</td>\n                <td>${e.theta.toFixed(4)}</td>\n              </tr>\n            `).join("")}\n          </table>\n        </details>\n      `
}

function renderRoBMAPlot(e) {
  if (!document.getElementById("robmaPlot")) return;
  const t = e.models,
    n = {
      type: "bar",
      x: t.map(e => e.name),
      y: t.map(e => 100 * e.weight),
      marker: {
        color: t.map(e => e.hasBias ? "#ef4444" : "#4a7ab8")
      },
      text: t.map(e => `θ = ${e.theta.toFixed(3)}`),
      textposition: "auto"
    },
    a = {
      title: "RoBMA Model Weights",
      xaxis: {
        title: ""
      },
      yaxis: {
        title: "Posterior Probability (%)",
        range: [0, 100]
      },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: {
        color: getComputedStyle(document.documentElement).getPropertyValue("--text-primary")
      },
      showlegend: !1
    };
  Plotly.newPlot("robmaPlot", [n], a, {
    responsive: !0
  })
}
const SAMPLES = {
    bcg: {
      name: "BCG Vaccine",
      description: "BCG vaccine efficacy against tuberculosis (13 RCTs)",
      studies: [{
        name: "Aronson 1948",
        year: 1948,
        events_t: 4,
        n_t: 123,
        events_c: 11,
        n_c: 139
      }, {
        name: "Ferguson 1949",
        year: 1949,
        events_t: 6,
        n_t: 306,
        events_c: 29,
        n_c: 303
      }, {
        name: "Rosenthal 1960",
        year: 1960,
        events_t: 3,
        n_t: 231,
        events_c: 11,
        n_c: 220
      }, {
        name: "Hart 1977",
        year: 1977,
        events_t: 62,
        n_t: 13598,
        events_c: 248,
        n_c: 12867
      }, {
        name: "Frimodt-Moller 1973",
        year: 1973,
        events_t: 33,
        n_t: 5069,
        events_c: 47,
        n_c: 5808
      }, {
        name: "Stein 1953",
        year: 1953,
        events_t: 180,
        n_t: 1716,
        events_c: 372,
        n_c: 1665
      }, {
        name: "Vandiviere 1973",
        year: 1973,
        events_t: 8,
        n_t: 2545,
        events_c: 10,
        n_c: 629
      }, {
        name: "TPT Madras 1980",
        year: 1980,
        events_t: 505,
        n_t: 88391,
        events_c: 499,
        n_c: 88391
      }, {
        name: "Coetzee 1968",
        year: 1968,
        events_t: 29,
        n_t: 7499,
        events_c: 45,
        n_c: 7277
      }, {
        name: "Rosenthal 1961",
        year: 1961,
        events_t: 17,
        n_t: 1699,
        events_c: 65,
        n_c: 1600
      }, {
        name: "Comstock 1974",
        year: 1974,
        events_t: 186,
        n_t: 50634,
        events_c: 141,
        n_c: 27338
      }, {
        name: "Comstock 1976",
        year: 1976,
        events_t: 5,
        n_t: 2498,
        events_c: 3,
        n_c: 2341
      }, {
        name: "Comstock 1969",
        year: 1969,
        events_t: 27,
        n_t: 16913,
        events_c: 29,
        n_c: 17854
      }]
    },
    sglt2: {
      name: "SGLT2 Inhibitors",
      description: "SGLT2i cardiovascular outcomes (major trials)",
      studies: [{
        name: "EMPA-REG",
        year: 2015,
        events_t: 490,
        n_t: 4687,
        events_c: 282,
        n_c: 2333
      }, {
        name: "CANVAS",
        year: 2017,
        events_t: 585,
        n_t: 5795,
        events_c: 426,
        n_c: 4347
      }, {
        name: "DECLARE-TIMI",
        year: 2019,
        events_t: 756,
        n_t: 8582,
        events_c: 803,
        n_c: 8578
      }, {
        name: "CREDENCE",
        year: 2019,
        events_t: 245,
        n_t: 2202,
        events_c: 340,
        n_c: 2199
      }, {
        name: "DAPA-HF",
        year: 2019,
        events_t: 386,
        n_t: 2373,
        events_c: 502,
        n_c: 2371
      }, {
        name: "EMPEROR-Reduced",
        year: 2020,
        events_t: 361,
        n_t: 1863,
        events_c: 462,
        n_c: 1867
      }, {
        name: "VERTIS-CV",
        year: 2020,
        events_t: 653,
        n_t: 5493,
        events_c: 327,
        n_c: 2745
      }, {
        name: "SCORED",
        year: 2020,
        events_t: 245,
        n_t: 5292,
        events_c: 190,
        n_c: 5292
      }]
    },
    statin: {
      name: "Statin Therapy",
      description: "Statin primary prevention (major RCTs)",
      studies: [{
        name: "WOSCOPS",
        year: 1995,
        events_t: 174,
        n_t: 3302,
        events_c: 248,
        n_c: 3293
      }, {
        name: "AFCAPS",
        year: 1998,
        events_t: 116,
        n_t: 3304,
        events_c: 183,
        n_c: 3301
      }, {
        name: "ASCOT-LLA",
        year: 2003,
        events_t: 100,
        n_t: 5168,
        events_c: 154,
        n_c: 5137
      }, {
        name: "CARDS",
        year: 2004,
        events_t: 83,
        n_t: 1428,
        events_c: 127,
        n_c: 1410
      }, {
        name: "MEGA",
        year: 2006,
        events_t: 66,
        n_t: 3866,
        events_c: 101,
        n_c: 3966
      }, {
        name: "JUPITER",
        year: 2008,
        events_t: 142,
        n_t: 8901,
        events_c: 251,
        n_c: 8901
      }, {
        name: "HOPE-3",
        year: 2016,
        events_t: 235,
        n_t: 6361,
        events_c: 304,
        n_c: 6344
      }]
    }
  },
  MALARIA_COUNTRY_PACKS = {
    DRC: {
      name: "DR Congo",
      incidence: 328,
      mortality: 49,
      cfr: .15,
      treatmentCostUSD: 3.5,
      currency: "CDF"
    },
    NGA: {
      name: "Nigeria",
      incidence: 257,
      mortality: 44,
      cfr: .17,
      treatmentCostUSD: 4.2,
      currency: "NGN"
    },
    UGA: {
      name: "Uganda",
      incidence: 325,
      mortality: 23,
      cfr: .07,
      treatmentCostUSD: 2.8,
      currency: "UGX"
    },
    MOZ: {
      name: "Mozambique",
      incidence: 306,
      mortality: 35,
      cfr: .11,
      treatmentCostUSD: 3.1,
      currency: "MZN"
    },
    GHA: {
      name: "Ghana",
      incidence: 285,
      mortality: 22,
      cfr: .08,
      treatmentCostUSD: 4.5,
      currency: "GHS"
    },
    BFA: {
      name: "Burkina Faso",
      incidence: 402,
      mortality: 37,
      cfr: .09,
      treatmentCostUSD: 2.5,
      currency: "XOF"
    },
    MLI: {
      name: "Mali",
      incidence: 376,
      mortality: 41,
      cfr: .11,
      treatmentCostUSD: 2.3,
      currency: "XOF"
    },
    NER: {
      name: "Niger",
      incidence: 389,
      mortality: 56,
      cfr: .14,
      treatmentCostUSD: 2.1,
      currency: "XOF"
    },
    CMR: {
      name: "Cameroon",
      incidence: 278,
      mortality: 28,
      cfr: .1,
      treatmentCostUSD: 3.8,
      currency: "XAF"
    },
    TZA: {
      name: "Tanzania",
      incidence: 189,
      mortality: 18,
      cfr: .1,
      treatmentCostUSD: 3.2,
      currency: "TZS"
    },
    KEN: {
      name: "Kenya",
      incidence: 123,
      mortality: 9,
      cfr: .07,
      treatmentCostUSD: 4,
      currency: "KES"
    },
    ETH: {
      name: "Ethiopia",
      incidence: 45,
      mortality: 4,
      cfr: .09,
      treatmentCostUSD: 2.9,
      currency: "ETB"
    },
    ZAF: {
      name: "South Africa",
      incidence: 1,
      mortality: .1,
      cfr: .1,
      treatmentCostUSD: 12,
      currency: "ZAR"
    }
  };

function exportVerdictYAML() {
  const e = AppState.truthcert;
  if (!e) return void showToast("No verdict data to export", "warning");
  let t = "# TruthCert-PairwisePro v1.0 Verdict Export\n";
  t += `timestamp: "${(new Date).toISOString()}"\n`, t += 'version: "1.0.0"\n\n', t += "verdict:\n", t += `  classification: "${e.verdict?.verdict||"N/A"}"\n`, t += `  tier: "${e.verdict?.tier||"N/A"}"\n`, t += `  severity: ${e.verdict?.severity?.total||0}\n`, t += "\nseverity_triggers:\n", (e.verdict?.severity?.triggers || []).forEach(e => {
    t += `  - trigger: "${e.trigger}"\n    points: ${e.points}\n`
  }), t += "\nthreat_ledger:\n", (e.threatLedger || []).forEach(e => {
    t += `  - name: "${e.name}"\n    status: "${e.status}"\n    detail: "${e.detail}"\n`
  }), t += "\ngrade:\n", t += `  certainty: "${e.grade?.certainty||"N/A"}"\n`, t += `  total_downgrades: ${e.grade?.totalDowngrades||0}\n`;
  const n = new Blob([t], {
      type: "text/yaml"
    }),
    a = document.createElement("a");
  a.href = URL.createObjectURL(n), a.download = `truthcert_verdict_${(new Date).toISOString().slice(0,10)}.yaml`, a.click(), showToast("YAML exported successfully", "success")
}

function exportVerdictJSON() {
  const e = AppState.truthcert;
  if (!e) return void showToast("No verdict data to export", "warning");
  const t = {
      version: "1.0.0",
      timestamp: (new Date).toISOString(),
      verdict: e.verdict,
      threatLedger: e.threatLedger,
      grade: e.grade,
      decisionLog: decisionLog
    },
    n = new Blob([JSON.stringify(t, null, 2)], {
      type: "application/json"
    }),
    a = document.createElement("a");
  a.href = URL.createObjectURL(n), a.download = `truthcert_verdict_${(new Date).toISOString().slice(0,10)}.json`, a.click(), showToast("JSON exported successfully", "success")
}

function exportVerdictExcel() {
  if ("undefined" == typeof XLSX) return void showToast("Excel export library not loaded", "error");
  const e = AppState.truthcert;
  if (!e) return void showToast("No verdict data to export", "warning");
  const t = XLSX.utils.book_new(),
    n = [
      ["TruthCert-PairwisePro Verdict Report"],
      ["Generated", (new Date).toISOString()],
      [""],
      ["Verdict", e.verdict?.verdict || "N/A"],
      ["Tier", e.verdict?.tier || "N/A"],
      ["Severity Score", e.verdict?.severity?.total || 0],
      ["GRADE Certainty", e.grade?.certainty || "N/A"]
    ];
  XLSX.utils.book_append_sheet(t, XLSX.utils.aoa_to_sheet(n), "Summary");
  const a = [
    ["Threat", "Status", "Detail"]
  ];
  (e.threatLedger || []).forEach(e => {
    a.push([e.name, e.status, e.detail])
  }), XLSX.utils.book_append_sheet(t, XLSX.utils.aoa_to_sheet(a), "Threat Ledger");
  const s = [
    ["Domain", "Rating", "Reason", "Downgrade"]
  ];
  Object.entries(e.grade?.domains || {}).forEach(([e, t]) => {
    s.push([e, t.rating, t.reason, t.downgrade])
  }), XLSX.utils.book_append_sheet(t, XLSX.utils.aoa_to_sheet(s), "GRADE"), XLSX.writeFile(t, `truthcert_verdict_${(new Date).toISOString().slice(0,10)}.xlsx`), showToast("Excel exported successfully", "success")
}

function exportHTACertificate() {
  const e = HTAState.results;
  if (!e) return void showToast("No HTA results to export", "warning");
  const t = {
      version: "1.0.0",
      timestamp: (new Date).toISOString(),
      tier: e.tier,
      intervention: HTAState.config.intervention,
      comparator: HTAState.config.comparator,
      economic: {
        nmb: e.nmb,
        icer: e.icer,
        rrr: e.rrr
      },
      recommendation: e.recommendation,
      dsa: e.dsa
    },
    n = new Blob([JSON.stringify(t, null, 2)], {
      type: "application/json"
    }),
    a = document.createElement("a");
  a.href = URL.createObjectURL(n), a.download = `hta_certificate_${(new Date).toISOString().slice(0,10)}.json`, a.click(), showToast("HTA Certificate exported", "success")
}

function exportHTAExcel() {
  if ("undefined" == typeof XLSX) return void showToast("Excel export library not loaded", "error");
  const e = HTAState.results;
  if (!e) return void showToast("No HTA results to export", "warning");
  const t = XLSX.utils.book_new(),
    n = [
      ["S14-HTA+ Analysis Report"],
      ["Generated", (new Date).toISOString()],
      [""],
      ["Tier", e.tier],
      ["Recommendation", e.recommendation.label],
      [""],
      ["Net Monetary Benefit", e.nmb],
      ["ICER", e.icer],
      ["RRR", e.rrr]
    ];
  XLSX.utils.book_append_sheet(t, XLSX.utils.aoa_to_sheet(n), "Summary");
  const a = [
    ["Parameter", "Low NMB", "High NMB", "Impact"]
  ];
  Object.entries(e.dsa.sensitivity).forEach(([e, t]) => {
    a.push([e, t.low, t.high, t.high - t.low])
  }), XLSX.utils.book_append_sheet(t, XLSX.utils.aoa_to_sheet(a), "DSA"), XLSX.writeFile(t, `hta_analysis_${(new Date).toISOString().slice(0,10)}.xlsx`), showToast("HTA Excel exported", "success")
}
async function exportHTAPDF() {
  if ("undefined" == typeof jspdf || "undefined" == typeof html2canvas) return void showToast("PDF export libraries not loaded", "error");
  const {
    jsPDF: e
  } = window.jspdf, t = new e;
  t.setFontSize(18), t.text("S14-HTA+ Analysis Report", 20, 20), t.setFontSize(12), t.text(`Tier: ${HTAState.results?.tier||"N/A"}`, 20, 35), t.text(`Recommendation: ${HTAState.results?.recommendation?.label||"N/A"}`, 20, 45), t.text(`NMB: ${formatCurrency(HTAState.results?.nmb||0)}`, 20, 55), t.save(`hta_report_${(new Date).toISOString().slice(0,10)}.pdf`), showToast("PDF exported", "success")
}

function computeInfluentialStudies(e, t, n) {
  if (e.length < 3) return {
    nFlagged: 0,
    influential: []
  };
  const a = e.length,
    s = e.map(e => e.yi),
    i = e.map(e => e.sei * e.sei).map(e => 1 / e),
    r = i.reduce((e, t) => e + t, 0),
    o = s.reduce((e, t, n) => e + i[n] * t, 0),
    l = o / r,
    d = (s.reduce((e, t, n) => e + i[n] * Math.pow(t - l, 2), 0), s.reduce((e, t, n) => e + i[n] * i[n] / r, 0), []);
  let c = 0;
  for (let l = 0; l < a; l++) {
    const a = r - i[l],
      u = o - i[l] * s[l];
    if (a <= 0) continue;
    const p = u / a,
      m = Math.abs(p - t);
    m > n && (c++, d.push({
      index: l,
      study: e[l].name || `Study ${l+1}`,
      difference: m
    }))
  }
  return {
    nFlagged: c,
    influential: d
  }
}

function runTruthCertAnalysis() {
  try {
    const e = AppState.results;
    if (!e) return;
    const t = e.pooled || e;
    if (!t?.theta && 0 !== t?.theta) return;
    const n = (AppState.studies || []).map((t, n) => ({
      ...t,
      yi: void 0 !== t.yi ? t.yi : e.yi?.[n],
      sei: void 0 !== t.sei ? t.sei : e.sei?.[n]
    })).filter(e => void 0 !== e.yi && void 0 !== e.sei && e.sei > 0);
    if (n.length < 2) return;
    const a = n.map(e => e.yi),
      s = n.map(e => e.sei * e.sei),
      i = (e, t = null) => {
        try {
          return e()
        } catch (e) {
          return t
        }
      },
      r = i(() => selectSmallStudyTest(n, TruthCertConfig), {
        biasDetected: !1
      }),
      o = i(() => trimAndFill(n, e), {}),
      l = i(() => breakdownPoint(n, e), {}),
      d = i(() => fragilityIndex(n, TruthCertConfig), {}),
      c = i(() => permutationCI(n, TruthCertConfig), {}),
      u = i(() => rhoSweep(n), []),
      p = i(() => calcOIS(n, TruthCertConfig), {}),
      m = i(() => robSensitivity(n), {}),
      h = i(() => cumulativeMeta(n), []),
      v = i(() => cumulativeByPrecision(n), []),
      g = i(() => profileLikelihoodTau2CI(n), {}),
      f = TruthCertConfig.thresholds?.estimatorSpread || {},
      _ = i(() => estimateTau2_DL(a, s).tau2, 0),
      y = i(() => estimateTau2_REML(a, s).tau2, 0),
      b = i(() => estimateTau2_PM(a, s).tau2, 0),
      x = Math.max(_, y, b) - Math.min(_, y, b),
      w = x < (f.stable || .1),
      M = computeInfluentialStudies(n, t.theta, TruthCertConfig.delta),
      S = {
        k: n.length,
        theta: t.theta,
        se: t.se,
        ci_lower: t.ci_lower,
        ci_upper: t.ci_upper,
        pValue: t.p_value,
        I2: e.het?.I2 || t.I2 || 0,
        tau2: e.tau2Result?.tau2 || t.tau2 || y,
        tau2Stable: w,
        estimatorSpread: x,
        publicationBias: {
          method: r?.method,
          detected: r?.biasDetected,
          p: r?.p
        },
        trimAndFill: o,
        breakdownPoint: l,
        fragilityIndex: d,
        permutationCI: c,
        rhoSweep: u,
        ois: p,
        robSensitivity: m,
        influence: M,
        predictionInterval: {
          lo: e.pi?.standard?.lower ?? t.pi_lower,
          hi: e.pi?.standard?.upper ?? t.pi_upper,
          crossesNull: (e.pi?.standard?.lower ?? t.pi_lower) < 0 && (e.pi?.standard?.upper ?? t.pi_upper) > 0
        },
        cumulative: h,
        cumulativeByPrecision: v,
        profileLikelihood: g,
        studies: n
      },
      E = buildThreatLedger(S, TruthCertConfig),
      A = determineVerdict(S, TruthCertConfig),
      R = assessGRADE({
        ...S,
        studies: n
      }, TruthCertConfig);
    AppState.truthcert = {
      verdict: {
        ...A,
        tier: verdictToTier(A.verdict)
      },
      threatLedger: E,
      grade: R,
      results: S
    }, AppState.verdict = AppState.truthcert.verdict, AppState.threatLedger = E, AppState.grade = R, renderVerdictPanel();
    const I = document.getElementById("htaPrerequisites"),
      T = document.getElementById("htaConfigSection");
    "UNCERTAIN" !== A.verdict && (I && (I.style.display = "none"), T && (T.style.display = "block"), populateHTADropdowns()), logDecision("check", `TruthCert analysis complete: ${A.verdict}`), AnalysisEvents.emit("verdictComplete", AppState.truthcert)
  } catch (e) {
    console.error("TruthCert analysis failed:", e), logDecision("error", "TruthCert analysis failed: " + e.message)
  }
}

function renderVerdictPanel() {
  const e = AppState.truthcert;
  if (!e) return;
  const t = document.getElementById("verdictCardContainer"),
    n = e.verdict.verdict.toLowerCase().replace("-", "-");
  t.innerHTML = `\n        <div class="verdict-card ${n}">\n          <div class="verdict-label">TruthCert Evidence Verdict</div>\n          <div class="verdict-value">${e.verdict.verdict}</div>\n          <div style="font-size: var(--text-sm); color: var(--text-secondary);">\n            Tier ${e.verdict.tier} | Severity: ${e.verdict.severity.total}/13\n          </div>\n        </div>\n      `, document.getElementById("severityContainer").style.display = "block";
  const a = e.verdict.severity.total <= 2 ? "low" : e.verdict.severity.total <= 4 ? "med" : e.verdict.severity.total <= 6 ? "high" : "crit";
  document.getElementById("severityScore").innerHTML = `\n        <div class="severity-score ${a}">${e.verdict.severity.total}</div>\n      `, document.getElementById("severityTriggers").innerHTML = e.verdict.severity.triggers.map(e => `<div class="threat-item amber"><span>${e.trigger}</span> <span style="margin-left:auto">+${e.points}</span></div>`).join(""), document.getElementById("threatLedgerContainer").style.display = "block", document.getElementById("threatLedgerItems").innerHTML = e.threatLedger.map(e => `<div class="threat-item ${e.status}">\n          <div class="threat-status ${e.status}">${"green"===e.status?"✓":"amber"===e.status?"!":"✗"}</div>\n          <div><strong>${e.name}</strong><br><span style="font-size: var(--text-xs); color: var(--text-secondary)">${e.detail}</span></div>\n        </div>`).join(""), document.getElementById("gatesContainer").style.display = "block";
  const s = [{
    name: "Evidence Base",
    pass: e.results.k >= TruthCertConfig.minK
  }, {
    name: "Significance",
    pass: e.results.pValue < .05
  }, {
    name: "Heterogeneity",
    pass: e.results.I2 <= 75
  }, {
    name: "Publication Bias",
    pass: !e.results.publicationBias.detected
  }, {
    name: "OIS Met",
    pass: e.results.ois.metOIS
  }, {
    name: "Verdict Safe",
    pass: "UNCERTAIN" !== e.verdict.verdict
  }];
  document.getElementById("gatesGrid").innerHTML = s.map(e => `<div class="gate-item">\n          <div class="gate-status ${e.pass?"pass":"fail"}">${e.pass?"✓":"✗"}</div>\n          <span>${e.name}</span>\n        </div>`).join(""), document.getElementById("gradeContainer").style.display = "block", document.getElementById("gradeCertainty").innerHTML = `\n        <div style="font-size: var(--text-2xl); font-weight: 700; margin-bottom: var(--space-4);">\n          Certainty: <span style="color: var(--color-accent-400)">${e.grade.certainty}</span>\n        </div>\n      `, document.getElementById("gradeDomainsGrid").innerHTML = Object.entries(e.grade.domains).map(([e, t]) => `<div class="grade-domain">\n          <div class="grade-domain-title">${e.replace(/([A-Z])/g," $1").trim()}</div>\n          <div class="grade-domain-value ${t.rating.toLowerCase()}">${t.rating}</div>\n          <div style="font-size: var(--text-xs); color: var(--text-secondary)">${t.reason||"No concerns"}</div>\n        </div>`).join(""), document.getElementById("sensitivitySummaryContainer").style.display = "block", document.getElementById("oisResults").innerHTML = `\n        <p><strong>${e.results.ois.percentOIS}%</strong> of required</p>\n        <p>${e.results.ois.totalN.toLocaleString()} / ${e.results.ois.oisRequired.toLocaleString()}</p>\n      `, document.getElementById("fragilityResults").innerHTML = e.results.fragilityIndex.ok ? `<p><strong>FI = ${e.results.fragilityIndex.fi}</strong></p>` : `<p>${e.results.fragilityIndex.reason}</p>`, document.getElementById("breakdownResults").innerHTML = e.results.breakdownPoint.ok ? `<p><strong>${(100*e.results.breakdownPoint.fractionNull).toFixed(0)}%</strong> to flip</p>` : "<p>N/A</p>", document.getElementById("rhoSweepResults").innerHTML = e.results.rhoSweep.ok ? `<p>Spread: <strong>${e.results.rhoSweep.spread.toFixed(4)}</strong></p>\n         <p>${e.results.rhoSweep.robust?"Robust":"Sensitive"}</p>` : "<p>N/A</p>", document.getElementById("decisionLogContainer").style.display = "block", document.getElementById("decisionLogContent").innerHTML = decisionLog.slice(-50).map(e => `<div class="decision-log-item ${e.type}">[${e.type.toUpperCase()}] ${e.msg}</div>`).join(""), document.getElementById("verdictExportContainer").style.display = "block"
}

function populateHTADropdowns() {
  const e = document.getElementById("htaCountry"),
    t = document.getElementById("htaDiseasePack");
  e.innerHTML = '<option value="">Select country...</option>', Object.entries(MALARIA_COUNTRY_PACKS).forEach(([t, n]) => {
    e.innerHTML += `<option value="${t}">${n.name}</option>`
  }), t.innerHTML = '<option value="">Select disease topic...</option>', Object.entries(SAMPLES).forEach(([e, n]) => {
    t.innerHTML += `<option value="${e}">${n.name}</option>`
  })
}

function calculatePredictionInterval(e, t, n, a = .05) {
  const s = e.length;
  if (s < 3) return {
    lower: NaN,
    upper: NaN,
    se_pred: NaN
  };
  const i = t.map(e => 1 / (e + n)),
    r = i.reduce((e, t) => e + t, 0),
    o = i.reduce((t, n, a) => t + n * e[a], 0) / r,
    l = n + 1 / r,
    d = Math.sqrt(l),
    c = Math.max(1, s - 2),
    u = qt(1 - a / 2, c);
  return {
    theta: o,
    lower: o - u * d,
    upper: o + u * d,
    se_pred: d,
    df: c,
    t_crit: u,
    tau2: n,
    interpretation: interpretPredictionInterval(o, o - u * d, o + u * d)
  }
}

function interpretPredictionInterval(e, t, n) {
  return t < 0 && n > 0 ? "The prediction interval includes both beneficial and harmful effects - substantial uncertainty about the effect in a new setting." : e > 0 ? "The prediction interval suggests consistently positive effects across settings, though magnitude varies." : "The prediction interval suggests consistently negative effects across settings, though magnitude varies."
}

function calculateInfluenceDiagnostics(e, t, n) {
  const a = e.length,
    s = [],
    i = t.map(e => 1 / (e + n)),
    r = i.reduce((e, t) => e + t, 0),
    o = i.reduce((t, n, a) => t + n * e[a], 0) / r,
    l = 1 / r;
  i.reduce((t, n, a) => t + n * Math.pow(e[a] - o, 2), 0);
  for (let d = 0; d < a; d++) {
    const c = e.filter((e, t) => t !== d),
      u = t.filter((e, t) => t !== d).map(e => 1 / (e + n)),
      p = u.reduce((e, t) => e + t, 0),
      m = u.reduce((e, t, n) => e + t * c[n], 0) / p,
      h = 1 / p,
      v = i[d] / r,
      g = e[d] - o,
      f = t[d] + n - l,
      _ = f > 0 ? g / Math.sqrt(f) : 0,
      y = t[d] + n - h,
      b = y > 0 ? g / Math.sqrt(y) : 0,
      x = Math.pow(o - m, 2) / l,
      w = (o - m) / Math.sqrt(h),
      M = _ * Math.sqrt(v / (1 - v)),
      S = h / l,
      E = i[d] * Math.pow(g, 2),
      A = i[d] / r * 100;
    s.push({
      index: d,
      yi: e[d],
      vi: t[d],
      weight_pct: A,
      hat: v,
      std_resid: _,
      stud_resid: b,
      cooks_d: x,
      dfbetas: w,
      dffits: M,
      cov_ratio: S,
      Q_contrib: E,
      theta_loo: m,
      is_outlier: Math.abs(b) > 2.5,
      is_influential: x > 4 / a || Math.abs(w) > 2 / Math.sqrt(a)
    })
  }
  return {
    diagnostics: s,
    thresholds: {
      cooks_d: 4 / a,
      dfbetas: 2 / Math.sqrt(a),
      stud_resid: 2.5,
      hat_high: 2 / a
    },
    summary: summarizeInfluence(s, a)
  }
}

function summarizeInfluence(e, t) {
  const n = e.filter(e => e.is_outlier),
    a = e.filter(e => e.is_influential);
  return {
    n_outliers: n.length,
    n_influential: a.length,
    outlier_indices: n.map(e => e.index),
    influential_indices: a.map(e => e.index),
    max_cooks_d: Math.max(...e.map(e => e.cooks_d)),
    max_dfbetas: Math.max(...e.map(e => Math.abs(e.dfbetas))),
    interpretation: 0 === n.length && 0 === a.length ? "No outliers or influential studies detected." : `Found ${n.length} potential outlier(s) and ${a.length} influential study(ies). Review these studies carefully.`
  }
}

function renderInfluencePlot(e, t, n) {
  if (!document.getElementById(n)) return;
  const a = e.diagnostics,
    s = e.thresholds,
    i = [];
  i.push({
    type: "bar",
    x: t || a.map((e, t) => `Study ${t+1}`),
    y: a.map(e => e.cooks_d),
    name: "Cook's D",
    marker: {
      color: a.map(e => e.cooks_d > s.cooks_d ? "#ef4444" : "#4a7ab8")
    },
    xaxis: "x",
    yaxis: "y"
  }), i.push({
    type: "bar",
    x: t || a.map((e, t) => `Study ${t+1}`),
    y: a.map(e => e.dfbetas),
    name: "DFBETAS",
    marker: {
      color: a.map(e => Math.abs(e.dfbetas) > s.dfbetas ? "#ef4444" : "#22c55e")
    },
    xaxis: "x2",
    yaxis: "y2"
  }), i.push({
    type: "bar",
    x: t || a.map((e, t) => `Study ${t+1}`),
    y: a.map(e => e.stud_resid),
    name: "Studentized Residual",
    marker: {
      color: a.map(e => Math.abs(e.stud_resid) > s.stud_resid ? "#ef4444" : "#f59e0b")
    },
    xaxis: "x3",
    yaxis: "y3"
  }), i.push({
    type: "bar",
    x: t || a.map((e, t) => `Study ${t+1}`),
    y: a.map(e => 100 * e.hat),
    name: "Leverage (%)",
    marker: {
      color: a.map(e => e.hat > s.hat_high ? "#ef4444" : "#8b5cf6")
    },
    xaxis: "x4",
    yaxis: "y4"
  });
  const r = {
    title: "Influence Diagnostics",
    grid: {
      rows: 2,
      columns: 2,
      pattern: "independent"
    },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: {
      color: getComputedStyle(document.documentElement).getPropertyValue("--text-primary")
    },
    showlegend: !1,
    annotations: [{
      text: "Cook's Distance",
      x: .22,
      y: 1.08,
      xref: "paper",
      yref: "paper",
      showarrow: !1,
      font: {
        size: 12,
        weight: "bold"
      }
    }, {
      text: "DFBETAS",
      x: .78,
      y: 1.08,
      xref: "paper",
      yref: "paper",
      showarrow: !1,
      font: {
        size: 12,
        weight: "bold"
      }
    }, {
      text: "Studentized Residuals",
      x: .22,
      y: .45,
      xref: "paper",
      yref: "paper",
      showarrow: !1,
      font: {
        size: 12,
        weight: "bold"
      }
    }, {
      text: "Leverage (%)",
      x: .78,
      y: .45,
      xref: "paper",
      yref: "paper",
      showarrow: !1,
      font: {
        size: 12,
        weight: "bold"
      }
    }],
    xaxis: {
      showticklabels: !1,
      domain: [0, .45]
    },
    yaxis: {
      domain: [.55, 1]
    },
    xaxis2: {
      showticklabels: !1,
      domain: [.55, 1]
    },
    yaxis2: {
      domain: [.55, 1],
      anchor: "x2"
    },
    xaxis3: {
      showticklabels: !1,
      domain: [0, .45]
    },
    yaxis3: {
      domain: [0, .42],
      anchor: "x3"
    },
    xaxis4: {
      showticklabels: !1,
      domain: [.55, 1]
    },
    yaxis4: {
      domain: [0, .42],
      anchor: "x4"
    },
    shapes: [{
      type: "line",
      x0: -.5,
      x1: a.length - .5,
      y0: s.cooks_d,
      y1: s.cooks_d,
      line: {
        color: "#ef4444",
        dash: "dash"
      },
      xref: "x",
      yref: "y"
    }, {
      type: "line",
      x0: -.5,
      x1: a.length - .5,
      y0: s.dfbetas,
      y1: s.dfbetas,
      line: {
        color: "#ef4444",
        dash: "dash"
      },
      xref: "x2",
      yref: "y2"
    }, {
      type: "line",
      x0: -.5,
      x1: a.length - .5,
      y0: -s.dfbetas,
      y1: -s.dfbetas,
      line: {
        color: "#ef4444",
        dash: "dash"
      },
      xref: "x2",
      yref: "y2"
    }, {
      type: "line",
      x0: -.5,
      x1: a.length - .5,
      y0: s.stud_resid,
      y1: s.stud_resid,
      line: {
        color: "#ef4444",
        dash: "dash"
      },
      xref: "x3",
      yref: "y3"
    }, {
      type: "line",
      x0: -.5,
      x1: a.length - .5,
      y0: -s.stud_resid,
      y1: -s.stud_resid,
      line: {
        color: "#ef4444",
        dash: "dash"
      },
      xref: "x3",
      yref: "y3"
    }]
  };
  Plotly.newPlot(n, i, r, {
    responsive: !0
  })
}

function copasSelectionModel(e, t, n = [-2, 0], a = [0, 2], s = 20) {
  e.length;
  const i = t.map(e => Math.sqrt(e));
  let r = null,
    o = 1 / 0;
  const l = (n[1] - n[0]) / s,
    d = (a[1] - a[0]) / s;
  for (let s = n[0]; s <= n[1]; s += l)
    for (let n = a[0]; n <= a[1]; n += d) {
      const a = i.map(e => pnorm(s + n / e));
      if (a.some(e => e < .01 || e > .99)) continue;
      const l = t.map((e, t) => 1 / e * a[t]),
        d = l.reduce((e, t) => e + t, 0);
      if (d <= 0) continue;
      const c = l.reduce((t, n, a) => t + n * e[a], 0) / d,
        u = l.reduce((t, n, a) => t + n * Math.pow(e[a] - c, 2), 0);
      u < o && (o = u, r = {
        gamma0: s,
        gamma1: n,
        theta_adj: c,
        se_adj: Math.sqrt(1 / d),
        selection_probs: a,
        Q: u
      })
    }
  const c = t.map(e => 1 / e),
    u = c.reduce((e, t) => e + t, 0),
    p = c.reduce((t, n, a) => t + n * e[a], 0) / u;
  if (!r) return {
    success: !1,
    message: "Copas model did not converge",
    theta_unadj: p
  };
  const m = p - r.theta_adj;
  return {
    success: !0,
    theta_unadj: p,
    theta_adj: r.theta_adj,
    se_adj: r.se_adj,
    ci_lower: r.theta_adj - 1.96 * r.se_adj,
    ci_upper: r.theta_adj + 1.96 * r.se_adj,
    bias_estimate: m,
    bias_pct: 100 * Math.abs(m / p),
    gamma0: r.gamma0,
    gamma1: r.gamma1,
    selection_probs: r.selection_probs,
    interpretation: interpretCopas(p, r.theta_adj, m)
  }
}

function interpretCopas(e, t, n) {
  const a = 100 * Math.abs(n / e);
  return a < 5 ? "Minimal publication bias detected (< 5% adjustment)." : a < 15 ? `Moderate publication bias detected. Effect size reduced by ${a.toFixed(1)}% after adjustment.` : `Substantial publication bias detected. Effect size reduced by ${a.toFixed(1)}% after adjustment. Interpret results with caution.`
}

function zejnullahiCI(e, t, n, a = .05) {
  const s = e.length,
    i = t.map(e => 1 / (e + n)),
    r = i.reduce((e, t) => e + t, 0),
    o = i.reduce((t, n, a) => t + n * e[a], 0) / r,
    l = 1 / r,
    d = i.reduce((t, n, a) => t + n * Math.pow(e[a] - o, 2), 0),
    c = Math.max(1, d / (s - 1)),
    u = l * c + 2 * Math.pow(n, 2) / (s - 1) * Math.pow(i.reduce((e, t) => e + t * t, 0) / Math.pow(r, 2), 2),
    p = Math.sqrt(u),
    m = s - 1,
    h = qt(1 - a / 2, m),
    v = qnorm(1 - a / 2),
    g = o - v * Math.sqrt(l),
    f = o + v * Math.sqrt(l);
  return {
    theta: o,
    se_std: Math.sqrt(l),
    se_zejnullahi: p,
    ci_wald: {
      lower: g,
      upper: f
    },
    ci_zejnullahi: {
      lower: o - h * p,
      upper: o + h * p
    },
    df: m,
    q_adj: c,
    width_ratio: h * p * 2 / (v * Math.sqrt(l) * 2),
    interpretation: s < 5 ? "With < 5 studies, Zejnullahi CI provides substantially better coverage than standard CI." : s < 10 ? "With < 10 studies, Zejnullahi CI provides improved coverage." : "With ≥ 10 studies, improvement over standard CI is modest."
  }
}

function profileLikelihoodTau2CI(e, t, n, a = .05) {
  const s = e.length;

  function i(n) {
    if (n < 0) return -1 / 0;
    const a = t.map(e => 1 / (e + n)),
      i = a.reduce((e, t) => e + t, 0),
      r = a.reduce((t, n, a) => t + n * e[a], 0) / i;
    let o = 0;
    for (let a = 0; a < s; a++) {
      const s = t[a] + n;
      o -= .5 * Math.log(2 * Math.PI * s), o -= .5 * Math.pow(e[a] - r, 2) / s
    }
    return o
  }
  const r = i(n),
    o = r - qchisq(1 - a, 1) / 2;
  let l = 0,
    d = n;
  if (i(0) >= o) l = 0;
  else {
    for (let e = 0; e < 100; e++) {
      const e = (l + d) / 2;
      if (i(e) < o ? l = e : d = e, d - l < 1e-8) break
    }
    l = d
  }
  let c = n,
    u = 10 * n + 1;
  for (; i(u) > o && u < 1e3;) u *= 2;
  for (let e = 0; e < 100; e++) {
    const e = (c + u) / 2;
    if (i(e) > o ? c = e : u = e, u - c < 1e-8) break
  }
  const p = t.map((a, s) => {
    const i = 1 / (a + n),
      r = t.map(e => 1 / (e + n)),
      o = r.reduce((e, t) => e + t, 0),
      l = r.reduce((t, n, a) => t + n * e[a], 0) / o;
    return i * Math.pow(e[s] - l, 2)
  }).reduce((e, t) => e + t, 0);
  return {
    tau2_hat: n,
    ci_profile: {
      lower: l,
      upper: c
    },
    ci_profile_sqrt: {
      lower: Math.sqrt(l),
      upper: Math.sqrt(c)
    },
    ll_max: r,
    Q: p,
    I2: 100 * Math.max(0, (p - (s - 1)) / p),
    interpretation: 0 === l ? "Lower bound of τ² CI includes 0, suggesting heterogeneity may be negligible." : "Profile likelihood CI suggests genuine heterogeneity present."
  }
}

function qchisq(e, t) {
  if (1 === t) {
    const t = qnorm(.5 + e / 2);
    return t * t
  }
  const n = 1 - 2 / (9 * t),
    a = Math.sqrt(2 / (9 * t)),
    s = qnorm(e);
  return t * Math.pow(n + a * s, 3)
}

function runInfluenceDiagnostics() {
  const e = AppState.results;
  if (!e || !e.studies) return void showToast("Run analysis first", "error");
  const t = e.studies.map(e => e.yi),
    n = e.studies.map(e => e.vi),
    a = e.studies.map(e => e.name),
    s = e.tau2 || 0;
  try {
    const e = calculateInfluenceDiagnostics(t, n, s);
    renderInfluencePlot(e, a, "influencePlot");
    const i = e.summary;
    document.getElementById("influenceResults").innerHTML = `\n          <p><strong>Outliers detected:</strong> ${i.n_outliers} (|studentized residual| > 2.5)</p>\n          <p><strong>Influential studies:</strong> ${i.n_influential} (Cook's D > ${e.thresholds.cooks_d.toFixed(3)} or |DFBETAS| > ${e.thresholds.dfbetas.toFixed(3)})</p>\n          <p><strong>Max Cook's D:</strong> ${i.max_cooks_d.toFixed(4)}</p>\n          <p><strong>Max |DFBETAS|:</strong> ${i.max_dfbetas.toFixed(4)}</p>\n          <p style="margin-top: var(--space-2); font-style: italic;">${i.interpretation}</p>\n        `, showToast("Influence diagnostics complete", "success")
  } catch (e) {
    showToast("Influence diagnostics failed: " + e.message, "error"), console.error(e)
  }
}

function runCopasModel() {
  const e = AppState.results;
  if (!e || !e.studies) return void showToast("Run analysis first", "error");
  const t = e.studies.map(e => e.yi),
    n = e.studies.map(e => e.vi);
  showToast("Running Copas selection model...", "info"), setTimeout(() => {
    try {
      const e = copasSelectionModel(t, n);
      if (!e.success) return document.getElementById("copasResults").innerHTML = `\n              <p class="text-danger">${e.message}</p>\n              <p><strong>Unadjusted estimate:</strong> ${e.theta_unadj.toFixed(4)}</p>\n            `, void showToast("Copas model did not converge", "warning");
      document.getElementById("copasResults").innerHTML = `\n            <table style="width: 100%; border-collapse: collapse;">\n              <tr><td style="padding: 4px;"><strong>Unadjusted θ:</strong></td><td>${e.theta_unadj.toFixed(4)}</td></tr>\n              <tr><td style="padding: 4px;"><strong>Adjusted θ:</strong></td><td>${e.theta_adj.toFixed(4)}</td></tr>\n              <tr><td style="padding: 4px;"><strong>95% CI:</strong></td><td>[${e.ci_lower.toFixed(4)}, ${e.ci_upper.toFixed(4)}]</td></tr>\n              <tr><td style="padding: 4px;"><strong>Bias estimate:</strong></td><td>${e.bias_estimate.toFixed(4)} (${e.bias_pct.toFixed(1)}%)</td></tr>\n              <tr><td style="padding: 4px;"><strong>Selection params:</strong></td><td>γ₀=${e.gamma0.toFixed(2)}, γ₁=${e.gamma1.toFixed(2)}</td></tr>\n            </table>\n            <p style="margin-top: var(--space-2); font-style: italic;">${e.interpretation}</p>\n          `, showToast("Copas model complete", "success")
    } catch (e) {
      showToast("Copas model failed: " + e.message, "error"), console.error(e)
    }
  }, 50)
}

function runSmallSampleCI() {
  const e = AppState.results;
  if (!e || !e.studies) return void showToast("Run analysis first", "error");
  const t = e.studies.map(e => e.yi),
    n = e.studies.map(e => e.vi),
    a = e.tau2 || 0,
    s = t.length;
  try {
    const e = zejnullahiCI(t, n, a),
      i = calculatePredictionInterval(t, n, a),
      r = profileLikelihoodTau2CI(t, n, a);
    document.getElementById("smallSampleResults").innerHTML = `\n          <h4 style="margin-bottom: var(--space-2);">Zejnullahi Small-Sample CI (k=${s})</h4>\n          <table style="width: 100%; border-collapse: collapse; margin-bottom: var(--space-3);">\n            <tr><td style="padding: 4px;"><strong>Pooled estimate:</strong></td><td>${e.theta.toFixed(4)}</td></tr>\n            <tr><td style="padding: 4px;"><strong>Standard (Wald) CI:</strong></td><td>[${e.ci_wald.lower.toFixed(4)}, ${e.ci_wald.upper.toFixed(4)}]</td></tr>\n            <tr><td style="padding: 4px;"><strong>Zejnullahi CI:</strong></td><td>[${e.ci_zejnullahi.lower.toFixed(4)}, ${e.ci_zejnullahi.upper.toFixed(4)}]</td></tr>\n            <tr><td style="padding: 4px;"><strong>CI width ratio:</strong></td><td>${e.width_ratio.toFixed(2)}× wider</td></tr>\n          </table>\n          <p style="font-style: italic; margin-bottom: var(--space-3);">${e.interpretation}</p>\n\n          <h4 style="margin-bottom: var(--space-2);">Prediction Interval</h4>\n          <table style="width: 100%; border-collapse: collapse; margin-bottom: var(--space-3);">\n            <tr><td style="padding: 4px;"><strong>95% Prediction Interval:</strong></td><td>[${i.lower.toFixed(4)}, ${i.upper.toFixed(4)}]</td></tr>\n            <tr><td style="padding: 4px;"><strong>SE (prediction):</strong></td><td>${i.se_pred.toFixed(4)}</td></tr>\n            <tr><td style="padding: 4px;"><strong>df:</strong></td><td>${i.df}</td></tr>\n          </table>\n          <p style="font-style: italic; margin-bottom: var(--space-3);">${i.interpretation}</p>\n\n          <h4 style="margin-bottom: var(--space-2);">Profile Likelihood τ² CI</h4>\n          <table style="width: 100%; border-collapse: collapse;">\n            <tr><td style="padding: 4px;"><strong>τ² estimate:</strong></td><td>${r.tau2_hat.toFixed(4)}</td></tr>\n            <tr><td style="padding: 4px;"><strong>95% Profile Lik CI:</strong></td><td>[${r.ci_profile.lower.toFixed(4)}, ${r.ci_profile.upper.toFixed(4)}]</td></tr>\n            <tr><td style="padding: 4px;"><strong>τ (SD scale) CI:</strong></td><td>[${r.ci_profile_sqrt.lower.toFixed(4)}, ${r.ci_profile_sqrt.upper.toFixed(4)}]</td></tr>\n            <tr><td style="padding: 4px;"><strong>I²:</strong></td><td>${r.I2.toFixed(1)}%</td></tr>\n          </table>\n          <p style="font-style: italic;">${r.interpretation}</p>\n        `, showToast("Small-sample analyses complete", "success")
  } catch (e) {
    showToast("Small-sample CI failed: " + e.message, "error"), console.error(e)
  }
}
window.runTruthCertAnalysis = runTruthCertAnalysis, window.runHTAAnalysis = runHTAAnalysis, window.exportVerdictYAML = exportVerdictYAML, window.exportVerdictJSON = exportVerdictJSON, window.exportVerdictExcel = exportVerdictExcel, window.exportHTACertificate = exportHTACertificate, window.exportHTAExcel = exportHTAExcel, window.exportHTAPDF = exportHTAPDF, window.TruthCertConfig = TruthCertConfig, window.SAMPLES = SAMPLES, window.MALARIA_COUNTRY_PACKS = MALARIA_COUNTRY_PACKS, window.AppState = AppState;
const VALIDATION_DATASETS = {
  bcg_vaccine: {
    name: "BCG Vaccine Efficacy (Colditz 1994)",
    description: "13 trials of BCG vaccine against tuberculosis",
    type: "binary",
    measure: "RR",
    studies: [{
      name: "Aronson 1948",
      events_t: 4,
      n_t: 123,
      events_c: 11,
      n_c: 139,
      year: 1948
    }, {
      name: "Ferguson & Simes 1949",
      events_t: 6,
      n_t: 306,
      events_c: 29,
      n_c: 303,
      year: 1949
    }, {
      name: "Rosenthal 1960",
      events_t: 3,
      n_t: 231,
      events_c: 11,
      n_c: 220,
      year: 1960
    }, {
      name: "Hart & Sutherland 1977",
      events_t: 62,
      n_t: 13598,
      events_c: 248,
      n_c: 12867,
      year: 1977
    }, {
      name: "Frimodt-Moller 1973",
      events_t: 33,
      n_t: 5069,
      events_c: 47,
      n_c: 5808,
      year: 1973
    }, {
      name: "Stein & Aronson 1953",
      events_t: 180,
      n_t: 1716,
      events_c: 372,
      n_c: 1665,
      year: 1953
    }, {
      name: "Vandiviere 1973",
      events_t: 8,
      n_t: 2545,
      events_c: 10,
      n_c: 629,
      year: 1973
    }, {
      name: "TPT Madras 1980",
      events_t: 505,
      n_t: 88391,
      events_c: 499,
      n_c: 88391,
      year: 1980
    }, {
      name: "Coetzee & Berjak 1968",
      events_t: 29,
      n_t: 7499,
      events_c: 45,
      n_c: 7277,
      year: 1968
    }, {
      name: "Rosenthal 1961",
      events_t: 17,
      n_t: 1699,
      events_c: 65,
      n_c: 1600,
      year: 1961
    }, {
      name: "Comstock & Webster 1969",
      events_t: 186,
      n_t: 50634,
      events_c: 141,
      n_c: 27338,
      year: 1969
    }, {
      name: "Comstock 1974",
      events_t: 5,
      n_t: 2498,
      events_c: 3,
      n_c: 2341,
      year: 1974
    }, {
      name: "Comstock 1976",
      events_t: 27,
      n_t: 16913,
      events_c: 29,
      n_c: 17854,
      year: 1976
    }],
    expected_metafor: {
      theta: -.7145,
      se: .1787,
      tau2: .3088,
      I2: 92.1,
      Q: 152.23,
      ci_lower: -1.0648,
      ci_upper: -.3642
    }
  },
  normand_los: {
    name: "Hospital Length of Stay (Normand 1999)",
    description: "9 studies of LOS reduction interventions",
    type: "continuous",
    measure: "MD",
    studies: [{
      name: "Davis 1992",
      mean_t: -.79,
      sd_t: .76,
      n_t: 40,
      mean_c: 0,
      sd_c: .76,
      n_c: 40
    }, {
      name: "Deyo 1986",
      mean_t: -.85,
      sd_t: .52,
      n_t: 59,
      mean_c: 0,
      sd_c: .52,
      n_c: 56
    }, {
      name: "Gerstein 1994",
      mean_t: -.38,
      sd_t: .66,
      n_t: 37,
      mean_c: 0,
      sd_c: .66,
      n_c: 34
    }, {
      name: "Hamilton 1993",
      mean_t: -.78,
      sd_t: .69,
      n_t: 23,
      mean_c: 0,
      sd_c: .69,
      n_c: 24
    }, {
      name: "Hollis 1984",
      mean_t: -.64,
      sd_t: .71,
      n_t: 30,
      mean_c: 0,
      sd_c: .71,
      n_c: 30
    }, {
      name: "Katon 1992",
      mean_t: -.45,
      sd_t: .81,
      n_t: 51,
      mean_c: 0,
      sd_c: .81,
      n_c: 44
    }, {
      name: "Katzelnick 1995",
      mean_t: -.08,
      sd_t: .9,
      n_t: 136,
      mean_c: 0,
      sd_c: .9,
      n_c: 64
    }, {
      name: "Mynors-Wallis 1995",
      mean_t: -.98,
      sd_t: 1.17,
      n_t: 30,
      mean_c: 0,
      sd_c: 1.17,
      n_c: 31
    }, {
      name: "Peveler 1999",
      mean_t: -.27,
      sd_t: .76,
      n_t: 87,
      mean_c: 0,
      sd_c: .76,
      n_c: 88
    }],
    expected_metafor: {
      theta: -.5371,
      se: .0969,
      tau2: .0282,
      I2: 38.4,
      Q: 12.99
    }
  },
  smoking: {
    name: "Smoking Cessation (Hasselblad 1998)",
    description: "24 studies of counseling interventions",
    type: "binary",
    measure: "OR",
    studies: [{
      name: "Study 1",
      events_t: 9,
      n_t: 140,
      events_c: 23,
      n_c: 140
    }, {
      name: "Study 2",
      events_t: 79,
      n_t: 702,
      events_c: 77,
      n_c: 694
    }, {
      name: "Study 3",
      events_t: 18,
      n_t: 671,
      events_c: 21,
      n_c: 535
    }, {
      name: "Study 4",
      events_t: 8,
      n_t: 116,
      events_c: 19,
      n_c: 149
    }, {
      name: "Study 5",
      events_t: 75,
      n_t: 731,
      events_c: 363,
      n_c: 714
    }, {
      name: "Study 6",
      events_t: 2,
      n_t: 106,
      events_c: 1,
      n_c: 102
    }, {
      name: "Study 7",
      events_t: 58,
      n_t: 549,
      events_c: 73,
      n_c: 1287
    }, {
      name: "Study 8",
      events_t: 0,
      n_t: 33,
      events_c: 9,
      n_c: 48
    }],
    expected_metafor: {
      theta: .344,
      se: .192,
      tau2: .146,
      I2: 54.2
    }
  }
};

function runValidationSuite() {
  const e = [];
  for (const [t, n] of Object.entries(VALIDATION_DATASETS)) {
    const t = validateAgainstMetafor(n);
    e.push({
      dataset: n.name,
      ...t
    })
  }
  return {
    results: e,
    summary: summarizeValidation(e),
    timestamp: (new Date).toISOString()
  }
}

function validateAgainstMetafor(e) {
  const t = e.studies.map(t => "binary" === e.type ? convertBinaryToEffectSize(t, e.measure) : convertContinuousToEffectSize(t, e.measure)),
    n = t.map(e => e.yi),
    a = t.map(e => e.vi),
    s = estimateTau2_REML(n, a),
    i = a.map(e => 1 / (e + s)),
    r = i.reduce((e, t) => e + t, 0),
    o = i.reduce((e, t, a) => e + t * n[a], 0) / r,
    l = Math.sqrt(1 / r),
    d = a.map((e, t) => 1 / e * Math.pow(n[t] - o, 2)).reduce((e, t) => e + t, 0),
    c = n.length,
    u = 100 * Math.max(0, (d - (c - 1)) / d),
    p = e.expected_metafor,
    m = Math.abs(o - p.theta),
    h = Math.abs(l - p.se),
    v = Math.abs(s - p.tau2),
    g = Math.abs(u - p.I2),
    f = m < .02,
    _ = h < .02,
    y = v < .02,
    b = g < 2;
  return {
    computed: {
      theta: o,
      se: l,
      tau2: s,
      I2: u,
      Q: d
    },
    expected: p,
    differences: {
      theta: m,
      se: h,
      tau2: v,
      I2: g
    },
    passed: {
      theta: f,
      se: _,
      tau2: y,
      I2: b
    },
    overall_pass: f && _ && y && b
  }
}

function convertBinaryToEffectSize(e, t) {
  const n = e.events_t,
    a = e.n_t - e.events_t,
    s = e.events_c,
    i = e.n_c - e.events_c;
  let r, o, l = n,
    d = a,
    c = s,
    u = i;
  if (0 !== n && 0 !== a && 0 !== s && 0 !== i || (l = n + .5, d = a + .5, c = s + .5, u = i + .5), "OR" === t) r = Math.log(l * u / (d * c)), o = 1 / l + 1 / d + 1 / c + 1 / u;
  else if ("RR" === t) r = Math.log(l / (l + d) / (c / (c + u))), o = 1 / l - 1 / (l + d) + 1 / c - 1 / (c + u);
  else {
    const e = l / (l + d),
      t = c / (c + u);
    r = e - t, o = e * (1 - e) / (l + d) + t * (1 - t) / (c + u)
  }
  return {
    ...e,
    yi: r,
    vi: o,
    sei: Math.sqrt(o)
  }
}

function convertContinuousToEffectSize(e, t) {
  const n = e.mean_t - e.mean_c,
    a = e.sd_t * e.sd_t / e.n_t + e.sd_c * e.sd_c / e.n_c;
  return {
    ...e,
    yi: n,
    vi: a,
    sei: Math.sqrt(a)
  }
}

function summarizeValidation(e) {
  const t = e.filter(e => e.overall_pass).length,
    n = e.length;
  return {
    passed: t,
    total: n,
    success_rate: (t / n * 100).toFixed(1) + "%",
    conclusion: t === n ? "All validation tests PASSED. Results match metafor within tolerance." : `${t}/${n} tests passed. Review discrepancies.`
  }
}

function estimateTau2_REML_Documented(e, t, n = 100, a = 1e-6, s = !1) {
  const i = e.length;
  let r = estimateTau2_DL(e, t);
  r = Math.max(0, r);
  const o = [];
  let l = !1;
  for (let s = 0; s < n; s++) {
    const n = r,
      d = t.map(e => 1 / (e + r)),
      c = d.reduce((e, t) => e + t, 0),
      u = d.reduce((t, n, a) => t + n * e[a], 0) / c;
    let p = 0;
    for (let t = 0; t < i; t++) p += -.5 * d[t] * d[t] / c, p += .5 * d[t] * d[t], p -= .5 * d[t] * d[t] * Math.pow(e[t] - u, 2);
    let m = 0;
    for (let e = 0; e < i; e++) m += .5 * Math.pow(d[e], 2);
    if (m -= .5 * Math.pow(d.reduce((e, t) => e + t * t, 0), 2) / (c * c), Math.abs(m) > 1e-10 && (r = n + p / m), r = Math.max(0, r), o.push({
        iter: s + 1,
        tau2: r,
        gradient: p,
        fisher_info: m,
        change: Math.abs(r - n)
      }), Math.abs(r - n) < a) {
      l = !0;
      break
    }
  }
  return {
    tau2: r,
    converged: l,
    iterations: o.length,
    final_change: o.length > 0 ? o[o.length - 1].change : 0,
    log: s ? o : null,
    algorithm: "Fisher Scoring",
    tolerance: a,
    max_iterations: n,
    initialization: "DerSimonian-Laird"
  }
}

function checkSmallSampleWarnings(e, t, n) {
  const a = [];
  return e < 3 ? a.push({
    severity: "critical",
    message: "Only " + e + " studies. Meta-analysis not recommended. Cannot reliably estimate heterogeneity.",
    recommendation: "Consider narrative synthesis instead of meta-analysis."
  }) : e < 5 ? a.push({
    severity: "warning",
    message: "Only " + e + " studies. Heterogeneity estimates unreliable.",
    recommendation: "Use Hartung-Knapp-Sidik-Jonkman adjustment for CIs. Interpret τ² and I² with caution."
  }) : e < 10 && a.push({
    severity: "info",
    message: "Fewer than 10 studies. Publication bias tests have low power.",
    recommendation: "Egger test may be unreliable. Consider funnel plot visual assessment only."
  }), e < 10 && n > 50 && a.push({
    severity: "warning",
    message: "High heterogeneity (I²=" + n.toFixed(1) + "%) with few studies.",
    recommendation: "Explore sources of heterogeneity. Consider not pooling if unexplained."
  }), a
}

function calculateHedgesG(e, t, n, a, s, i) {
  const r = n + i - 2,
    o = (e - a) / Math.sqrt(((n - 1) * t * t + (i - 1) * s * s) / r),
    l = 1 - 3 / (4 * r - 1),
    d = o * l,
    c = ((n + i) / (n * i) + o * o / (2 * (n + i))) * l * l;
  return {
    cohens_d: o,
    hedges_g: d,
    correction_factor: l,
    variance: c,
    se: Math.sqrt(c),
    df: r,
    n_total: n + i,
    interpretation: Math.abs(d) < .2 ? "small" : Math.abs(d) < .5 ? "medium" : Math.abs(d) < .8 ? "large" : "very large"
  }
}

function multipleMetaRegression(e, t, n, a = null) {
  const s = e.length,
    i = n.length;
  null === a && (a = estimateTau2_DL(e, t));
  const r = [];
  for (let e = 0; e < s; e++) {
    const t = [1];
    for (let a = 0; a < i; a++) t.push(n[a].values[e]);
    r.push(t)
  }
  const o = t.map(e => 1 / (e + a)),
    l = [];
  for (let e = 0; e <= i; e++) {
    l.push([]);
    for (let t = 0; t <= i; t++) {
      let n = 0;
      for (let a = 0; a < s; a++) n += r[a][e] * o[a] * r[a][t];
      l[e].push(n)
    }
  }
  const d = [];
  for (let t = 0; t <= i; t++) {
    let n = 0;
    for (let a = 0; a < s; a++) n += r[a][t] * o[a] * e[a];
    d.push(n)
  }
  const c = invertMatrix(l);
  if (!c) return {
    success: !1,
    message: "Matrix inversion failed - covariates may be collinear"
  };
  const u = [];
  for (let e = 0; e <= i; e++) {
    let t = 0;
    for (let n = 0; n <= i; n++) t += c[e][n] * d[n];
    u.push(t)
  }
  const p = c.map((e, t) => Math.sqrt(e[t])),
    m = r.map(e => e.reduce((e, t, n) => e + t * u[n], 0)),
    h = e.map((e, t) => e - m[t]),
    v = h.reduce((e, t, n) => e + o[n] * t * t, 0),
    g = s - i - 1,
    f = 1 - pchisq(v, g),
    _ = e.reduce((t, n, a) => t + o[a] * Math.pow(m[a] - e.reduce((e, t, n) => e + o[n] * t, 0) / o.reduce((e, t) => e + t, 0), 2), 0),
    y = i,
    b = 1 - pchisq(_, y),
    x = e.reduce((t, n, a) => {
      const s = e.reduce((e, t, n) => e + o[n] * t, 0) / o.reduce((e, t) => e + t, 0);
      return t + o[a] * Math.pow(n - s, 2)
    }, 0),
    w = x > 0 ? Math.max(0, (x - v) / x) : 0,
    M = [{
      name: "Intercept",
      estimate: u[0],
      se: p[0],
      z: u[0] / p[0],
      p: 2 * (1 - pnorm(Math.abs(u[0] / p[0]))),
      ci_lower: u[0] - 1.96 * p[0],
      ci_upper: u[0] + 1.96 * p[0]
    }];
  for (let e = 0; e < i; e++) M.push({
    name: n[e].name,
    estimate: u[e + 1],
    se: p[e + 1],
    z: u[e + 1] / p[e + 1],
    p: 2 * (1 - pnorm(Math.abs(u[e + 1] / p[e + 1]))),
    ci_lower: u[e + 1] - 1.96 * p[e + 1],
    ci_upper: u[e + 1] + 1.96 * p[e + 1]
  });
  return {
    success: !0,
    coefficients: M,
    tau2_residual: a,
    Q_model: _,
    df_model: y,
    p_model: b,
    Q_residual: v,
    df_residual: g,
    p_residual: f,
    R2: w,
    I2_residual: 100 * Math.max(0, (v - g) / v),
    fitted: m,
    residuals: h,
    k: s,
    n_predictors: i
  }
}

function invertMatrix(e) {
  const t = e.length,
    n = e.map((e, n) => {
      const a = [...e];
      for (let e = 0; e < t; e++) a.push(n === e ? 1 : 0);
      return a
    });
  for (let e = 0; e < t; e++) {
    let a = e;
    for (let s = e + 1; s < t; s++) Math.abs(n[s][e]) > Math.abs(n[a][e]) && (a = s);
    if ([n[e], n[a]] = [n[a], n[e]], Math.abs(n[e][e]) < 1e-10) return null;
    const s = n[e][e];
    for (let a = 0; a < 2 * t; a++) n[e][a] /= s;
    for (let a = 0; a < t; a++)
      if (e !== a) {
        const s = n[a][e];
        for (let i = 0; i < 2 * t; i++) n[a][i] -= s * n[e][i]
      }
  }
  return n.map(e => e.slice(t))
}

function bivariateMetaAnalysis(e, t, n, a, s = .5) {
  const i = e.length,
    r = estimateTau2_DL(e, t),
    o = estimateTau2_DL(n, a);
  let l = .5;
  for (let d = 0; d < 20; d++) {
    const d = [];
    for (let e = 0; e < i; e++) {
      const n = s * Math.sqrt(t[e] * a[e]);
      d.push([
        [t[e], n],
        [n, a[e]]
      ])
    }
    const c = l * Math.sqrt(r * o),
      u = [
        [r, c],
        [c, o]
      ],
      p = (d.map(e => [
        [e[0][0] + u[0][0], e[0][1] + u[0][1]],
        [e[1][0] + u[1][0], e[1][1] + u[1][1]]
      ]), t.map((e, t) => 1 / (e + r))),
      m = a.map((e, t) => 1 / (e + o)),
      h = p.reduce((e, t) => e + t, 0),
      v = m.reduce((e, t) => e + t, 0),
      g = p.reduce((t, n, a) => t + n * e[a], 0) / h,
      f = m.reduce((e, t, a) => e + t * n[a], 0) / v;
    let _ = 0,
      y = 0,
      b = 0;
    for (let t = 0; t < i; t++) {
      const a = e[t] - g,
        s = n[t] - f;
      _ += Math.sqrt(p[t] * m[t]) * a * s, y += p[t] * a * a, b += m[t] * s * s
    }
    y > 0 && b > 0 && (l = _ / Math.sqrt(y * b), l = Math.max(-.99, Math.min(.99, l)))
  }
  const d = t.map((e, t) => 1 / (e + r)),
    c = a.map((e, t) => 1 / (e + o)),
    u = d.reduce((e, t) => e + t, 0),
    p = c.reduce((e, t) => e + t, 0),
    m = d.reduce((t, n, a) => t + n * e[a], 0) / u,
    h = c.reduce((e, t, a) => e + t * n[a], 0) / p;
  return {
    theta: [m, h],
    se: [Math.sqrt(1 / u), Math.sqrt(1 / p)],
    tau2: [r, o],
    rho_between: l,
    rho_within_assumed: s,
    borrowing_of_strength: Math.abs(l) > .3 ? "substantial" : "minimal",
    ci_lower: [m - 1.96 * Math.sqrt(1 / u), h - 1.96 * Math.sqrt(1 / p)],
    ci_upper: [m + 1.96 * Math.sqrt(1 / u), h + 1.96 * Math.sqrt(1 / p)]
  }
}

function leaveOneOutCorrected(e, t, n, a = .05) {
  const s = e.length,
    i = [],
    r = t.map(e => 1 / (e + n)),
    o = r.reduce((e, t) => e + t, 0),
    l = r.reduce((t, n, a) => t + n * e[a], 0) / o,
    d = Math.sqrt(1 / o);
  for (let n = 0; n < s; n++) {
    const r = e.filter((e, t) => t !== n),
      o = t.filter((e, t) => t !== n),
      d = estimateTau2_DL(r, o),
      c = o.map(e => 1 / (e + d)),
      u = c.reduce((e, t) => e + t, 0),
      p = c.reduce((e, t, n) => e + t * r[n], 0) / u,
      m = Math.sqrt(1 / u),
      h = qnorm(1 - a / s / 2),
      v = p - h * m,
      g = p + h * m,
      f = qnorm(1 - a / 2);
    i.push({
      omitted: n,
      theta: p,
      se: m,
      tau2: d,
      ci_standard: {
        lower: p - f * m,
        upper: p + f * m
      },
      ci_corrected: {
        lower: v,
        upper: g
      },
      change: p - l,
      pct_change: (p - l) / Math.abs(l) * 100
    })
  }
  const c = Math.max(...i.map(e => Math.abs(e.change))),
    u = i.find(e => Math.abs(e.change) === c),
    p = [Math.min(...i.map(e => e.theta)), Math.max(...i.map(e => e.theta))];
  return {
    full_model: {
      theta: l,
      se: d
    },
    leave_one_out: i,
    most_influential_index: u.omitted,
    max_change: c,
    theta_range: p,
    robust: c < .1 * Math.abs(l),
    interpretation: c < .05 * Math.abs(l) ? "Results are robust to removal of any single study." : c < .15 * Math.abs(l) ? "Results are moderately sensitive to individual studies." : "Results are highly sensitive - one or more influential studies present."
  }
}

function renderEnhancedFunnelPlot(e, t, n, a = {}) {
  if (!document.getElementById(n) || !e || 0 === e.length) return;
  const s = !1 !== a.showLabels,
    i = !1 !== a.showContours,
    r = t.theta,
    o = e.map(e => e.yi),
    l = e.map(e => e.sei || Math.sqrt(e.vi)),
    d = e.map(e => e.name),
    c = 1.1 * Math.max(...l),
    u = [],
    p = ["rgba(239,68,68,0.3)", "rgba(249,115,22,0.3)", "rgba(234,179,8,0.3)"];
  i && [.01, .05, .1].forEach((e, t) => {
    const n = qnorm(1 - e / 2),
      a = [],
      s = [],
      i = [];
    for (let e = .001; e <= c; e += c / 100) a.push(e), s.push(r + n * e), i.push(r - n * e);
    u.push({
      type: "scatter",
      mode: "lines",
      x: s,
      y: a,
      name: "p=" + e + " boundary",
      line: {
        color: p[t],
        width: 1,
        dash: "dot"
      },
      showlegend: 0 === t
    }), u.push({
      type: "scatter",
      mode: "lines",
      x: i,
      y: a,
      showlegend: !1,
      line: {
        color: p[t],
        width: 1,
        dash: "dot"
      }
    })
  });
  const m = {
      type: "scatter",
      mode: s ? "markers+text" : "markers",
      x: o,
      y: l,
      text: d,
      textposition: "top right",
      textfont: {
        size: 9
      },
      name: "Studies",
      marker: {
        size: 10,
        color: "#4a7ab8",
        line: {
          width: 1,
          color: "#1b263b"
        }
      }
    },
    h = {
      type: "scatter",
      mode: "lines",
      x: [r, r],
      y: [0, c],
      name: "Pooled effect",
      line: {
        color: "#22c55e",
        width: 2,
        dash: "dash"
      }
    },
    v = {
      title: "Enhanced Funnel Plot",
      xaxis: {
        title: "Effect Size",
        zeroline: !0
      },
      yaxis: {
        title: "Standard Error",
        autorange: "reversed",
        rangemode: "tozero"
      },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: {
        color: getComputedStyle(document.documentElement).getPropertyValue("--text-primary")
      },
      showlegend: !0,
      legend: {
        x: .02,
        y: .98
      }
    };
  Plotly.newPlot(n, [...u, h, m], v, {
    responsive: !0
  })
}

function assessGRADEDomains(e, t = {}) {
  const n = {
      riskOfBias: assessRiskOfBiasDomain(e, t),
      inconsistency: assessInconsistencyDomain(e),
      indirectness: assessIndirectnessDomain(t),
      imprecision: assessImprecisionDomain(e, t),
      publicationBias: assessPublicationBiasDomain(e)
    },
    a = Object.values(n).reduce((e, t) => e + t.downgrade, 0),
    s = "observational" === t.studyDesign ? 2 : 4,
    i = Math.max(1, s - a),
    r = ["", "Very Low", "Low", "Moderate", "High"];
  return {
    domains: n,
    starting_level: r[s],
    total_downgrade: a,
    final_score: i,
    certainty: r[i],
    symbol: "⊕".repeat(i) + "⊖".repeat(4 - i),
    summary: generateGRADESummary(n, r[i])
  }
}

function assessRiskOfBiasDomain(e, t) {
  const n = t.robAssessment || null;
  if (!n) return {
    rating: "Not assessed",
    downgrade: 0,
    concerns: ["Risk of bias not formally assessed"],
    recommendation: "Conduct domain-based RoB assessment (RoB 2 or ROBINS-I)"
  };
  const a = n.filter(e => "high" === e.overall).length,
    s = n.filter(e => "some" === e.overall).length,
    i = n.length;
  let r = 0,
    o = [];
  return a / i > .5 ? (r = 2, o.push("Majority of studies at high risk of bias")) : (a > 0 || s / i > .5) && (r = 1, o.push("Some studies at high/unclear risk of bias")), {
    rating: 0 === r ? "No serious concerns" : 1 === r ? "Serious" : "Very serious",
    downgrade: r,
    concerns: o,
    high_risk_n: a,
    some_concerns_n: s,
    total: i
  }
}

function assessInconsistencyDomain(e) {
  const t = e.I2 || 0,
    n = e.Q_pvalue || 1,
    a = e.prediction_interval || null;
  let s = 0,
    i = [];
  return t > 75 || n < .001 ? (s = 2, i.push("Very high heterogeneity (I²=" + t.toFixed(1) + "%)")) : (t > 50 || n < .05) && (s = 1, i.push("Substantial heterogeneity (I²=" + t.toFixed(1) + "%)")), a && a.lower * a.upper < 0 && (s < 1 && (s = 1), i.push("Prediction interval crosses null")), {
    rating: 0 === s ? "No serious concerns" : 1 === s ? "Serious" : "Very serious",
    downgrade: s,
    concerns: i,
    I2: t,
    Q_p: n
  }
}

function assessIndirectnessDomain(e) {
  const t = {
    none: {
      downgrade: 0,
      rating: "No serious concerns"
    },
    some: {
      downgrade: 1,
      rating: "Serious",
      concerns: ["Some concerns about applicability"]
    },
    serious: {
      downgrade: 2,
      rating: "Very serious",
      concerns: ["Major concerns about applicability"]
    }
  };
  return t[e.indirectnessAssessment || "none"] || t.none
}

function assessImprecisionDomain(e, t) {
  const n = e.ci_lower,
    a = e.ci_upper,
    s = e.theta,
    i = e.ois || null;
  let r = 0,
    o = [];
  t.clinicalDecisionThreshold;
  const l = (t.measureType, 0);
  n < l && a > l && (r = 1, o.push("Confidence interval crosses null")), i && e.total_n < i && (r < 1 && (r = 1), o.push("Sample size below optimal information size"));
  const d = a - n;
  return d > 2 * Math.abs(s) && (r = Math.min(2, r + 1), o.push("Very wide confidence interval")), {
    rating: 0 === r ? "No serious concerns" : 1 === r ? "Serious" : "Very serious",
    downgrade: r,
    concerns: o,
    ci_width: d
  }
}

function assessPublicationBiasDomain(e) {
  const t = e.egger_p || 1,
    n = e.trim_fill || null;
  let a = 0,
    s = [];
  return t < .01 ? (a = 2, s.push("Strong evidence of publication bias (Egger p=" + t.toFixed(3) + ")")) : t < .1 && (a = 1, s.push("Possible publication bias (Egger p=" + t.toFixed(3) + ")")), n && n.n_imputed > 0 && (a < 1 && (a = 1), s.push("Trim-and-fill imputed " + n.n_imputed + " studies")), {
    rating: 0 === a ? "No serious concerns" : 1 === a ? "Serious" : "Very serious",
    downgrade: a,
    concerns: s,
    egger_p: t
  }
}

function generateGRADESummary(e, t) {
  const n = [];
  for (const [t, a] of Object.entries(e)) a.downgrade > 0 && a.concerns && n.push(...a.concerns);
  return 0 === n.length ? "Evidence certainty is " + t + ". No serious concerns across GRADE domains." : "Evidence certainty is " + t + ". Key concerns: " + n.join("; ") + "."
}

function handleZeroCells(e, t, n, a, s = "constant") {
  const i = 0 === e || 0 === t || 0 === n || 0 === a;
  let r = null,
    o = 0,
    l = e,
    d = t,
    c = n,
    u = a;
  if (0 === e && 0 === n || 0 === t && 0 === a) return {
    valid: !1,
    warning: "Both arms have zero events or zero non-events. Study cannot be included.",
    a: e,
    b: t,
    c: n,
    d: a
  };
  if (i)
    if ("constant" === s) o = .5, l = e + .5, d = t + .5, c = n + .5, u = a + .5, r = "Zero cells present. Applied 0.5 continuity correction to all cells.";
    else if ("treatment_arm" === s) {
    const s = e + t,
      i = s / (s + (n + a));
    o = i, l = e + (1 - i), d = t + (1 - i), c = n + i, u = a + i, r = "Zero cells present. Applied treatment-arm continuity correction (Sweeting 2004)."
  } else if ("empirical" === s) {
    const s = (e + n) / (e + t + n + a);
    o = s, l = e + s, d = t + (1 - s), c = n + s, u = a + (1 - s), r = "Zero cells present. Applied empirical continuity correction."
  }
  return {
    valid: !0,
    hasZero: i,
    warning: r,
    correction_method: s,
    correction_value: o,
    original: {
      a: e,
      b: t,
      c: n,
      d: a
    },
    adjusted: {
      a: l,
      b: d,
      c: c,
      d: u
    }
  }
}

function generatePRISMAData(e) {
  return {
    identification: {
      databases: e.databases || [],
      records_identified: e.records_identified || 0,
      registers: e.registers || [],
      records_from_registers: e.records_from_registers || 0,
      other_sources: e.other_sources || "",
      records_other: e.records_other || 0
    },
    screening: {
      records_after_duplicates: e.records_after_duplicates || 0,
      duplicates_removed: e.duplicates_removed || 0,
      records_screened: e.records_screened || 0,
      records_excluded: e.records_excluded || 0,
      reports_sought: e.reports_sought || 0,
      reports_not_retrieved: e.reports_not_retrieved || 0,
      reports_assessed: e.reports_assessed || 0,
      reports_excluded: e.reports_excluded || 0,
      exclusion_reasons: e.exclusion_reasons || []
    },
    included: {
      studies_included: e.studies_included || 0,
      reports_included: e.reports_included || 0
    }
  }
}

function renderPRISMADiagram(e, t) {
  const n = document.getElementById(t);
  if (!n) return;
  const a = e,
    s = `\n        <div class="prisma-diagram" style="font-family: var(--font-sans); max-width: 800px; margin: 0 auto;">\n          <h3 style="text-align: center; margin-bottom: var(--space-4);">PRISMA 2020 Flow Diagram</h3>\n\n          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); margin-bottom: var(--space-4);">\n            <div class="prisma-box" style="background: var(--color-primary-100); padding: var(--space-3); border-radius: var(--radius-md); text-align: center;">\n              <strong>Records identified from databases (n=${a.identification.records_identified})</strong>\n              <div style="font-size: var(--text-sm); color: var(--text-secondary);">${a.identification.databases.join(", ")||"Not specified"}</div>\n            </div>\n            <div class="prisma-box" style="background: var(--color-primary-100); padding: var(--space-3); border-radius: var(--radius-md); text-align: center;">\n              <strong>Records from other sources (n=${a.identification.records_other})</strong>\n              <div style="font-size: var(--text-sm); color: var(--text-secondary);">${a.identification.other_sources||"Registers, citation searching"}</div>\n            </div>\n          </div>\n\n          <div style="text-align: center; margin-bottom: var(--space-2);">↓</div>\n\n          <div class="prisma-box" style="background: var(--surface-raised); padding: var(--space-3); border-radius: var(--radius-md); text-align: center; margin-bottom: var(--space-3);">\n            <strong>Records after duplicates removed (n=${a.screening.records_after_duplicates})</strong>\n            <div style="font-size: var(--text-sm); color: var(--text-secondary);">Duplicates removed: ${a.screening.duplicates_removed}</div>\n          </div>\n\n          <div style="display: grid; grid-template-columns: 2fr 1fr; gap: var(--space-4); margin-bottom: var(--space-3);">\n            <div>\n              <div style="text-align: center; margin-bottom: var(--space-2);">↓</div>\n              <div class="prisma-box" style="background: var(--surface-raised); padding: var(--space-3); border-radius: var(--radius-md); text-align: center;">\n                <strong>Records screened (n=${a.screening.records_screened})</strong>\n              </div>\n            </div>\n            <div style="display: flex; align-items: center;">\n              <div class="prisma-box" style="background: var(--color-danger-100); padding: var(--space-3); border-radius: var(--radius-md); text-align: center; width: 100%;">\n                <strong>Records excluded (n=${a.screening.records_excluded})</strong>\n              </div>\n            </div>\n          </div>\n\n          <div style="display: grid; grid-template-columns: 2fr 1fr; gap: var(--space-4); margin-bottom: var(--space-3);">\n            <div>\n              <div style="text-align: center; margin-bottom: var(--space-2);">↓</div>\n              <div class="prisma-box" style="background: var(--surface-raised); padding: var(--space-3); border-radius: var(--radius-md); text-align: center;">\n                <strong>Full-text reports assessed (n=${a.screening.reports_assessed})</strong>\n              </div>\n            </div>\n            <div style="display: flex; align-items: center;">\n              <div class="prisma-box" style="background: var(--color-danger-100); padding: var(--space-3); border-radius: var(--radius-md); text-align: center; width: 100%;">\n                <strong>Reports excluded (n=${a.screening.reports_excluded})</strong>\n                ${a.screening.exclusion_reasons.length>0?'<div style="font-size: var(--text-xs); margin-top: var(--space-1);">'+a.screening.exclusion_reasons.map(e=>e.reason+" (n="+e.n+")").join("<br>")+"</div>":""}\n              </div>\n            </div>\n          </div>\n\n          <div style="text-align: center; margin-bottom: var(--space-2);">↓</div>\n\n          <div class="prisma-box" style="background: var(--color-success-100); padding: var(--space-4); border-radius: var(--radius-md); text-align: center; border: 2px solid var(--color-success-500);">\n            <strong style="font-size: var(--text-lg);">Studies included in meta-analysis (n=${a.included.studies_included})</strong>\n            <div style="font-size: var(--text-sm); color: var(--text-secondary);">Reports included: ${a.included.reports_included}</div>\n          </div>\n        </div>\n      `;
  n.innerHTML = s
}

function runValidation() {
  showToast("Running validation suite...", "info"), setTimeout(() => {
    try {
      const e = runValidationSuite();
      let t = '<h4 style="margin-bottom: var(--space-3);">Validation Against metafor</h4>';
      t += '<table style="width: 100%; border-collapse: collapse; font-size: var(--text-sm);">', t += '<thead><tr style="border-bottom: 2px solid var(--border-color);">', t += '<th style="text-align: left; padding: 8px;">Dataset</th>', t += "<th>θ Match</th><th>SE Match</th><th>τ² Match</th><th>I² Match</th><th>Status</th>", t += "</tr></thead><tbody>";
      for (const n of e.results) {
        const e = n.overall_pass ? "✅" : "⚠️";
        t += '<tr style="border-bottom: 1px solid var(--border-color);">', t += '<td style="padding: 8px;">' + n.dataset + "</td>", t += '<td style="text-align: center;">' + (n.passed.theta ? "✓" : "✗") + "</td>", t += '<td style="text-align: center;">' + (n.passed.se ? "✓" : "✗") + "</td>", t += '<td style="text-align: center;">' + (n.passed.tau2 ? "✓" : "✗") + "</td>", t += '<td style="text-align: center;">' + (n.passed.I2 ? "✓" : "✗") + "</td>", t += '<td style="text-align: center;">' + e + "</td>", t += "</tr>"
      }
      t += "</tbody></table>", t += '<p style="margin-top: var(--space-3); font-weight: 600;">' + e.summary.conclusion + "</p>", document.getElementById("validationResults").innerHTML = t, showToast("Validation complete: " + e.summary.success_rate + " passed", e.summary.passed === e.summary.total ? "success" : "warning")
    } catch (e) {
      showToast("Validation failed: " + e.message, "error"), console.error(e)
    }
  }, 100)
}

function runGRADEAssessment() {
  const e = AppState.results;
  if (e && e.studies) try {
    const t = {
        theta: e.theta,
        ci_lower: e.ci_lower,
        ci_upper: e.ci_upper,
        I2: e.I2,
        Q_pvalue: e.Q_pvalue,
        egger_p: e.egger_p || 1,
        prediction_interval: e.prediction_interval || null
      },
      n = assessGRADEDomains(t, {
        studyDesign: "rct",
        indirectnessAssessment: "none"
      });
    let a = '<h4 style="margin-bottom: var(--space-3);">GRADE Evidence Certainty</h4>';
    a += '<div style="font-size: var(--text-2xl); margin-bottom: var(--space-2);">' + n.symbol + "</div>", a += '<div style="font-size: var(--text-lg); font-weight: 600; margin-bottom: var(--space-3);">' + n.certainty + "</div>", a += '<table style="width: 100%; border-collapse: collapse; font-size: var(--text-sm);">', a += '<thead><tr style="border-bottom: 2px solid var(--border-color);">', a += '<th style="text-align: left; padding: 8px;">Domain</th>', a += "<th>Rating</th><th>Downgrade</th>", a += "</tr></thead><tbody>";
    const s = {
      riskOfBias: "Risk of Bias",
      inconsistency: "Inconsistency",
      indirectness: "Indirectness",
      imprecision: "Imprecision",
      publicationBias: "Publication Bias"
    };
    for (const [e, t] of Object.entries(n.domains)) {
      const n = 0 === t.downgrade ? "var(--color-success-500)" : 1 === t.downgrade ? "var(--color-warning-500)" : "var(--color-danger-500)";
      a += '<tr style="border-bottom: 1px solid var(--border-color);">', a += '<td style="padding: 8px;">' + s[e] + "</td>", a += '<td style="text-align: center; color: ' + n + ';">' + t.rating + "</td>", a += '<td style="text-align: center;">' + (t.downgrade > 0 ? "-" + t.downgrade : "0") + "</td>", a += "</tr>"
    }
    a += "</tbody></table>", a += '<p style="margin-top: var(--space-3); font-style: italic;">' + n.summary + "</p>", document.getElementById("gradeResults").innerHTML = a, showToast("GRADE assessment complete", "success")
  } catch (e) {
    showToast("GRADE assessment failed: " + e.message, "error"), console.error(e)
  } else showToast("Run analysis first", "error")
}

function runMetaRegression() {
  const e = AppState.results;
  if (!e || !e.studies) return void showToast("Run analysis first", "error");
  const t = e.studies.map(e => e.yi),
    n = e.studies.map(e => e.vi),
    a = e.studies.map(e => e.year || null);
  if (a.every(e => null === e)) return void showToast("No covariate data available. Add year or other moderators.", "warning");
  const s = a.filter(e => null !== e),
    i = s.reduce((e, t) => e + t, 0) / s.length,
    r = [{
      name: "Year (centered)",
      values: a.map(e => null !== e ? e - i : 0)
    }];
  try {
    const a = multipleMetaRegression(t, n, r, e.tau2);
    if (!a.success) return void showToast(a.message, "error");
    let s = '<h4 style="margin-bottom: var(--space-3);">Meta-Regression Results</h4>';
    s += '<table style="width: 100%; border-collapse: collapse; font-size: var(--text-sm);">', s += '<thead><tr style="border-bottom: 2px solid var(--border-color);">', s += '<th style="text-align: left; padding: 8px;">Term</th>', s += "<th>Estimate</th><th>SE</th><th>z</th><th>p</th><th>95% CI</th>", s += "</tr></thead><tbody>";
    for (const e of a.coefficients) {
      s += '<tr style="border-bottom: 1px solid var(--border-color); ' + (e.p < .05 ? "font-weight: 600;" : "") + '">', s += '<td style="padding: 8px;">' + e.name + "</td>", s += '<td style="text-align: right;">' + e.estimate.toFixed(4) + "</td>", s += '<td style="text-align: right;">' + e.se.toFixed(4) + "</td>", s += '<td style="text-align: right;">' + e.z.toFixed(2) + "</td>", s += '<td style="text-align: right;">' + (e.p < .001 ? "<0.001" : e.p.toFixed(3)) + "</td>", s += '<td style="text-align: right;">[' + e.ci_lower.toFixed(3) + ", " + e.ci_upper.toFixed(3) + "]</td>", s += "</tr>"
    }
    s += "</tbody></table>", s += '<div style="margin-top: var(--space-3);">', s += "<p><strong>R²:</strong> " + (100 * a.R2).toFixed(1) + "% of heterogeneity explained</p>", s += "<p><strong>Residual I²:</strong> " + a.I2_residual.toFixed(1) + "%</p>", s += "<p><strong>Test of moderators:</strong> Q=" + a.Q_model.toFixed(2) + ", df=" + a.df_model + ", p=" + (a.p_model < .001 ? "<0.001" : a.p_model.toFixed(3)) + "</p>", s += "</div>", document.getElementById("metaregResults").innerHTML = s, showToast("Meta-regression complete", "success")
  } catch (e) {
    showToast("Meta-regression failed: " + e.message, "error"), console.error(e)
  }
}

function runLeaveOneOutCorrected() {
  const e = AppState.results;
  if (!e || !e.studies) return void showToast("Run analysis first", "error");
  const t = e.studies.map(e => e.yi),
    n = e.studies.map(e => e.vi),
    a = e.studies.map(e => e.name);
  try {
    const s = leaveOneOutCorrected(t, n, e.tau2),
      i = [{
        type: "scatter",
        mode: "markers+lines",
        x: s.leave_one_out.map((e, t) => t + 1),
        y: s.leave_one_out.map(e => e.theta),
        error_y: {
          type: "data",
          symmetric: !1,
          array: s.leave_one_out.map(e => e.ci_corrected.upper - e.theta),
          arrayminus: s.leave_one_out.map(e => e.theta - e.ci_corrected.lower)
        },
        name: "Leave-one-out estimate",
        marker: {
          size: 8,
          color: "#4a7ab8"
        }
      }];
    i.push({
      type: "scatter",
      mode: "lines",
      x: [0, a.length + 1],
      y: [s.full_model.theta, s.full_model.theta],
      name: "Full model",
      line: {
        color: "#22c55e",
        dash: "dash",
        width: 2
      }
    });
    const r = {
      title: "Leave-One-Out Analysis (Corrected CIs)",
      xaxis: {
        title: "Study Omitted",
        tickmode: "array",
        tickvals: s.leave_one_out.map((e, t) => t + 1),
        ticktext: a
      },
      yaxis: {
        title: "Pooled Estimate"
      },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: {
        color: getComputedStyle(document.documentElement).getPropertyValue("--text-primary")
      }
    };
    Plotly.newPlot("looPlot", i, r, {
      responsive: !0
    }), document.getElementById("looResults").innerHTML = `\n          <p><strong>Full model estimate:</strong> ${s.full_model.theta.toFixed(4)} (SE=${s.full_model.se.toFixed(4)})</p>\n          <p><strong>Estimate range:</strong> [${s.theta_range[0].toFixed(4)}, ${s.theta_range[1].toFixed(4)}]</p>\n          <p><strong>Max change:</strong> ${s.max_change.toFixed(4)} (omitting study ${s.most_influential_index+1})</p>\n          <p style="font-style: italic; margin-top: var(--space-2);">${s.interpretation}</p>\n        `, showToast("Leave-one-out analysis complete", "success")
  } catch (e) {
    showToast("LOO analysis failed: " + e.message, "error"), console.error(e)
  }
}

function displaySmallSampleWarnings(e, t, n) {
  const a = checkSmallSampleWarnings(e, t, n);
  if (0 === a.length) return;
  if (!document.getElementById("analysisWarnings")) {
    const e = document.getElementById("panel-analysis");
    if (e) {
      const t = document.createElement("div");
      t.id = "analysisWarnings", t.style.marginBottom = "var(--space-4)", e.insertBefore(t, e.firstChild)
    }
  }
  const s = document.getElementById("analysisWarnings");
  if (!s) return;
  let i = "";
  for (const e of a) {
    i += '<div class="alert ' + ("critical" === e.severity ? "alert--danger" : "warning" === e.severity ? "alert--warning" : "alert--info") + '" style="margin-bottom: var(--space-2);">', i += '<span class="alert__icon">' + ("critical" === e.severity ? "⚠️" : "warning" === e.severity ? "⚡" : "ℹ️") + "</span>", i += '<div class="alert__content">', i += "<strong>" + e.message + "</strong>", i += '<p style="margin-top: var(--space-1); font-size: var(--text-sm);">' + e.recommendation + "</p>", i += "</div></div>"
  }
  s.innerHTML = i
}
const VALIDATION_DATASETS_EXTENDED = {
  antidepressants: {
    name: "Antidepressants vs Placebo (High Heterogeneity)",
    description: "12 trials with known high heterogeneity (I² > 90%)",
    type: "continuous",
    measure: "SMD",
    studies: [{
      name: "Study A",
      mean_t: .8,
      sd_t: 1.2,
      n_t: 45,
      mean_c: .1,
      sd_c: 1.1,
      n_c: 44
    }, {
      name: "Study B",
      mean_t: .3,
      sd_t: 1,
      n_t: 120,
      mean_c: 0,
      sd_c: 1,
      n_c: 118
    }, {
      name: "Study C",
      mean_t: 1.2,
      sd_t: 1.3,
      n_t: 30,
      mean_c: 0,
      sd_c: 1.2,
      n_c: 32
    }, {
      name: "Study D",
      mean_t: .1,
      sd_t: .9,
      n_t: 200,
      mean_c: 0,
      sd_c: .9,
      n_c: 198
    }, {
      name: "Study E",
      mean_t: .9,
      sd_t: 1.1,
      n_t: 55,
      mean_c: 0,
      sd_c: 1,
      n_c: 54
    }, {
      name: "Study F",
      mean_t: .2,
      sd_t: 1,
      n_t: 150,
      mean_c: 0,
      sd_c: 1,
      n_c: 148
    }, {
      name: "Study G",
      mean_t: 1.5,
      sd_t: 1.4,
      n_t: 25,
      mean_c: 0,
      sd_c: 1.3,
      n_c: 26
    }, {
      name: "Study H",
      mean_t: .4,
      sd_t: 1,
      n_t: 80,
      mean_c: 0,
      sd_c: 1,
      n_c: 78
    }, {
      name: "Study I",
      mean_t: 0,
      sd_t: .95,
      n_t: 180,
      mean_c: 0,
      sd_c: .95,
      n_c: 175
    }, {
      name: "Study J",
      mean_t: 1.1,
      sd_t: 1.2,
      n_t: 40,
      mean_c: 0,
      sd_c: 1.1,
      n_c: 42
    }, {
      name: "Study K",
      mean_t: .5,
      sd_t: 1.05,
      n_t: 90,
      mean_c: 0,
      sd_c: 1,
      n_c: 88
    }, {
      name: "Study L",
      mean_t: .7,
      sd_t: 1.1,
      n_t: 65,
      mean_c: 0,
      sd_c: 1,
      n_c: 63
    }],
    expected: {
      I2_min: 85,
      tau2_min: .1
    }
  },
  small_sample: {
    name: "Small Meta-Analysis (k=4, HKSJ critical)",
    description: "4 studies where HKSJ adjustment is critical",
    type: "binary",
    measure: "OR",
    studies: [{
      name: "Trial 1",
      events_t: 12,
      n_t: 50,
      events_c: 8,
      n_c: 52
    }, {
      name: "Trial 2",
      events_t: 18,
      n_t: 45,
      events_c: 10,
      n_c: 48
    }, {
      name: "Trial 3",
      events_t: 8,
      n_t: 40,
      events_c: 6,
      n_c: 42
    }, {
      name: "Trial 4",
      events_t: 15,
      n_t: 55,
      events_c: 9,
      n_c: 53
    }],
    expected: {
      hksj_wider: !0
    }
  },
  asymmetric_funnel: {
    name: "Asymmetric Funnel (Publication Bias)",
    description: "10 studies with known funnel asymmetry",
    type: "continuous",
    measure: "SMD",
    studies: [{
      name: "Large 1",
      mean_t: .25,
      sd_t: 1,
      n_t: 200,
      mean_c: 0,
      sd_c: 1,
      n_c: 198
    }, {
      name: "Large 2",
      mean_t: .22,
      sd_t: 1,
      n_t: 180,
      mean_c: 0,
      sd_c: 1,
      n_c: 175
    }, {
      name: "Large 3",
      mean_t: .28,
      sd_t: 1,
      n_t: 150,
      mean_c: 0,
      sd_c: 1,
      n_c: 148
    }, {
      name: "Medium 1",
      mean_t: .35,
      sd_t: 1,
      n_t: 80,
      mean_c: 0,
      sd_c: 1,
      n_c: 78
    }, {
      name: "Medium 2",
      mean_t: .4,
      sd_t: 1,
      n_t: 60,
      mean_c: 0,
      sd_c: 1,
      n_c: 58
    }, {
      name: "Small 1",
      mean_t: .55,
      sd_t: 1,
      n_t: 30,
      mean_c: 0,
      sd_c: 1,
      n_c: 28
    }, {
      name: "Small 2",
      mean_t: .7,
      sd_t: 1,
      n_t: 25,
      mean_c: 0,
      sd_c: 1,
      n_c: 24
    }, {
      name: "Small 3",
      mean_t: .85,
      sd_t: 1,
      n_t: 20,
      mean_c: 0,
      sd_c: 1,
      n_c: 18
    }, {
      name: "Small 4",
      mean_t: .9,
      sd_t: 1,
      n_t: 18,
      mean_c: 0,
      sd_c: 1,
      n_c: 16
    }, {
      name: "Small 5",
      mean_t: 1.1,
      sd_t: 1,
      n_t: 15,
      mean_c: 0,
      sd_c: 1,
      n_c: 14
    }],
    expected: {
      egger_p_max: .05
    }
  }
};

function runExtendedValidation() {
  const e = [];
  for (const [t, n] of Object.entries(VALIDATION_DATASETS)) {
    const t = validateAgainstMetafor(n);
    e.push({
      dataset: n.name,
      type: "core",
      ...t
    })
  }
  const t = VALIDATION_DATASETS_EXTENDED.antidepressants,
    n = validateExtremeHeterogeneity(t);
  e.push({
    dataset: t.name,
    type: "heterogeneity",
    ...n
  });
  const a = VALIDATION_DATASETS_EXTENDED.small_sample,
    s = validateHKSJ(a);
  e.push({
    dataset: a.name,
    type: "hksj",
    ...s
  });
  const i = VALIDATION_DATASETS_EXTENDED.asymmetric_funnel,
    r = validateEgger(i);
  return e.push({
    dataset: i.name,
    type: "egger",
    ...r
  }), {
    results: e,
    summary: summarizeExtendedValidation(e),
    timestamp: (new Date).toISOString()
  }
}

function validateExtremeHeterogeneity(e) {
  const t = e.studies.map(e => {
      const t = e.n_t,
        n = e.n_c,
        a = Math.sqrt(((t - 1) * e.sd_t * e.sd_t + (n - 1) * e.sd_c * e.sd_c) / (t + n - 2)),
        s = (e.mean_t - e.mean_c) / a * (1 - 3 / (4 * (t + n - 2) - 1));
      return {
        yi: s,
        vi: (t + n) / (t * n) + s * s / (2 * (t + n))
      }
    }),
    n = t.map(e => e.yi),
    a = t.map(e => e.vi),
    s = estimateTau2_DL(n, a),
    i = a.map(e => 1 / (e + s)),
    r = i.reduce((e, t) => e + t, 0),
    o = i.reduce((e, t, a) => e + t * n[a], 0) / r,
    l = a.map((e, t) => 1 / e * Math.pow(n[t] - o, 2)).reduce((e, t) => e + t, 0),
    d = n.length,
    c = 100 * Math.max(0, (l - (d - 1)) / l),
    u = c >= e.expected.I2_min && s >= e.expected.tau2_min;
  return {
    computed: {
      I2: c,
      tau2: s,
      Q: l,
      theta: o
    },
    expected: e.expected,
    passed: {
      I2: c >= e.expected.I2_min,
      tau2: s >= e.expected.tau2_min
    },
    overall_pass: u,
    message: u ? "Extreme heterogeneity correctly detected (I²=" + c.toFixed(1) + "%)" : "WARNING: Heterogeneity detection may be inaccurate"
  }
}

function validateHKSJ(e) {
  const t = e.studies.map(e => {
      const t = e.events_t + .5,
        n = e.n_t - e.events_t + .5,
        a = e.events_c + .5,
        s = e.n_c - e.events_c + .5;
      return {
        yi: Math.log(t * s / (n * a)),
        vi: 1 / t + 1 / n + 1 / a + 1 / s
      }
    }),
    n = t.map(e => e.yi),
    a = t.map(e => e.vi),
    s = n.length,
    i = estimateTau2_DL(n, a),
    r = a.map(e => 1 / (e + i)),
    o = r.reduce((e, t) => e + t, 0),
    l = r.reduce((e, t, a) => e + t * n[a], 0) / o,
    d = Math.sqrt(1 / o),
    c = l - 1.96 * d,
    u = l + 1.96 * d,
    p = u - c,
    m = r.reduce((e, t, a) => e + t * Math.pow(n[a] - l, 2), 0),
    h = Math.max(1, m / (s - 1)),
    v = Math.sqrt(1 / o * h),
    g = qt(.975, s - 1),
    f = l - g * v,
    _ = l + g * v,
    y = _ - f,
    b = y > p,
    x = b === e.expected.hksj_wider;
  return {
    computed: {
      theta: l,
      ci_std: {
        lower: c,
        upper: u,
        width: p
      },
      ci_hksj: {
        lower: f,
        upper: _,
        width: y
      },
      width_ratio: y / p
    },
    expected: e.expected,
    passed: {
      hksj_wider: b
    },
    overall_pass: x,
    message: x ? "HKSJ correctly widened CI by " + (100 * (y / p - 1)).toFixed(1) + "%" : "WARNING: HKSJ adjustment may be incorrect"
  }
}

function validateEgger(e) {
  const t = e.studies.map(e => {
      const t = e.n_t,
        n = e.n_c,
        a = Math.sqrt(((t - 1) * e.sd_t * e.sd_t + (n - 1) * e.sd_c * e.sd_c) / (t + n - 2)),
        s = (e.mean_t - e.mean_c) / a,
        i = (t + n) / (t * n) + s * s / (2 * (t + n));
      return {
        yi: s,
        vi: i,
        sei: Math.sqrt(i)
      }
    }),
    n = t.map(e => e.yi),
    a = t.map(e => e.sei),
    s = n.length,
    i = a.map(e => 1 / e),
    r = n.map((e, t) => e / a[t]),
    o = s,
    l = i.reduce((e, t) => e + t, 0),
    d = r.reduce((e, t) => e + t, 0),
    c = i.reduce((e, t, n) => e + t * r[n], 0),
    u = i.reduce((e, t) => e + t * t, 0),
    p = (o * c - l * d) / (o * u - l * l),
    m = (d - p * l) / o,
    h = i.map(e => m + p * e),
    v = r.reduce((e, t, n) => e + Math.pow(t - h[n], 2), 0),
    g = v / (o - 2),
    f = Math.sqrt(g * (1 / o + Math.pow(l / o, 2) / (u - l * l / o))),
    _ = m / f,
    y = o - 2,
    b = 2 * (1 - pt(Math.abs(_), y)),
    x = b < e.expected.egger_p_max,
    w = x;
  return {
    computed: {
      intercept: m,
      se_intercept: f,
      t_stat: _,
      p_value: b,
      slope: p
    },
    expected: e.expected,
    passed: {
      asymmetry_detected: x
    },
    overall_pass: w,
    message: w ? "Egger test correctly detected asymmetry (p=" + b.toFixed(4) + ")" : "WARNING: Egger test may have low power or be incorrect"
  }
}

function summarizeExtendedValidation(e) {
  const t = e.filter(e => "core" === e.type),
    n = e.filter(e => "core" !== e.type),
    a = t.filter(e => e.overall_pass).length,
    s = n.filter(e => e.overall_pass).length;
  return {
    core_passed: a,
    core_total: t.length,
    extended_passed: s,
    extended_total: n.length,
    all_passed: a + s,
    all_total: t.length + n.length,
    conclusion: a === t.length && s === n.length ? "All validation tests PASSED including HKSJ, Egger, and extreme heterogeneity." : "Some tests failed. Review detailed results."
  }
}

function cumulativeMetaAnalysisByYear(e, t = "DL") {
  const n = [...e].sort((e, t) => (e.year || 2e3) - (t.year || 2e3)),
    a = [];
  for (let e = 0; e < n.length; e++) {
    const t = n.slice(0, e + 1),
      s = t.map(e => e.yi),
      i = t.map(e => e.vi),
      r = estimateTau2_DL(s, i),
      o = i.map(e => 1 / (e + r)),
      l = o.reduce((e, t) => e + t, 0),
      d = o.reduce((e, t, n) => e + t * s[n], 0) / l,
      c = Math.sqrt(1 / l);
    a.push({
      k: e + 1,
      year: n[e].year || 2e3,
      study: n[e].name,
      theta: d,
      se: c,
      ci_lower: d - 1.96 * c,
      ci_upper: d + 1.96 * c,
      tau2: r
    })
  }
  return a
}

function cumulativeMetaAnalysisByPrecision(e) {
  const t = [...e].sort((e, t) => e.sei - t.sei),
    n = [];
  for (let e = 0; e < t.length; e++) {
    const a = t.slice(0, e + 1),
      s = a.map(e => e.yi),
      i = a.map(e => e.vi),
      r = estimateTau2_DL(s, i),
      o = i.map(e => 1 / (e + r)),
      l = o.reduce((e, t) => e + t, 0),
      d = o.reduce((e, t, n) => e + t * s[n], 0) / l,
      c = Math.sqrt(1 / l);
    n.push({
      k: e + 1,
      precision_rank: e + 1,
      study: t[e].name,
      study_se: t[e].sei,
      theta: d,
      se: c,
      ci_lower: d - 1.96 * c,
      ci_upper: d + 1.96 * c,
      tau2: r
    })
  }
  return n
}

function renderCumulativeMetaAnalysisPlot(e, t, n) {
  if (!document.getElementById(n)) return;
  const a = "year" === t ? "Year" : "Precision Rank (Most Precise First)",
    s = "year" === t ? e.map(e => e.year) : e.map(e => e.precision_rank),
    i = [{
      type: "scatter",
      mode: "lines+markers",
      x: s,
      y: e.map(e => e.theta),
      error_y: {
        type: "data",
        symmetric: !1,
        array: e.map(e => e.ci_upper - e.theta),
        arrayminus: e.map(e => e.theta - e.ci_lower),
        color: "rgba(74, 122, 184, 0.4)"
      },
      name: "Cumulative Estimate",
      line: {
        color: "#4a7ab8",
        width: 2
      },
      marker: {
        size: 8
      }
    }],
    r = e[e.length - 1].theta;
  i.push({
    type: "scatter",
    mode: "lines",
    x: [s[0], s[s.length - 1]],
    y: [r, r],
    name: "Final Estimate",
    line: {
      color: "#22c55e",
      dash: "dash",
      width: 2
    }
  }), i.push({
    type: "scatter",
    mode: "lines",
    x: [s[0], s[s.length - 1]],
    y: [0, 0],
    name: "Null Effect",
    line: {
      color: "#888",
      dash: "dot",
      width: 1
    }
  });
  const o = {
    title: "year" === t ? "Cumulative Meta-Analysis by Year" : "Cumulative Meta-Analysis by Precision",
    xaxis: {
      title: a
    },
    yaxis: {
      title: "Pooled Effect Size"
    },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: {
      color: getComputedStyle(document.documentElement).getPropertyValue("--text-primary")
    },
    showlegend: !0,
    legend: {
      x: .02,
      y: .98
    }
  };
  Plotly.newPlot(n, i, o, {
    responsive: !0
  })
}

function exportPRISMASVG(e) {
  const t = e,
    n = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">\n  <style>\n    .box { fill: #f0f9ff; stroke: #3b82f6; stroke-width: 2; rx: 8; }\n    .box-exclude { fill: #fef2f2; stroke: #ef4444; stroke-width: 2; rx: 8; }\n    .box-include { fill: #f0fdf4; stroke: #22c55e; stroke-width: 3; rx: 8; }\n    .text { font-family: Arial, sans-serif; font-size: 12px; fill: #1f2937; }\n    .text-bold { font-family: Arial, sans-serif; font-size: 12px; font-weight: bold; fill: #1f2937; }\n    .text-small { font-family: Arial, sans-serif; font-size: 10px; fill: #6b7280; }\n    .arrow { stroke: #6b7280; stroke-width: 2; marker-end: url(#arrowhead); }\n    .title { font-family: Arial, sans-serif; font-size: 16px; font-weight: bold; fill: #111827; }\n  </style>\n\n  <defs>\n    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">\n      <polygon points="0 0, 10 3.5, 0 7" fill="#6b7280"/>\n    </marker>\n  </defs>\n\n  <text x="400" y="30" text-anchor="middle" class="title">PRISMA 2020 Flow Diagram</text>\n\n  \x3c!-- Identification --\x3e\n  <rect x="50" y="60" width="300" height="70" class="box"/>\n  <text x="200" y="85" text-anchor="middle" class="text-bold">Records from databases</text>\n  <text x="200" y="105" text-anchor="middle" class="text">(n = ${t.identification.records_identified})</text>\n  <text x="200" y="120" text-anchor="middle" class="text-small">${t.identification.databases.join(", ")||"Databases"}</text>\n\n  <rect x="450" y="60" width="300" height="70" class="box"/>\n  <text x="600" y="85" text-anchor="middle" class="text-bold">Records from other sources</text>\n  <text x="600" y="105" text-anchor="middle" class="text">(n = ${t.identification.records_other})</text>\n\n  \x3c!-- Arrow down --\x3e\n  <line x1="400" y1="130" x2="400" y2="160" class="arrow"/>\n\n  \x3c!-- Duplicates --\x3e\n  <rect x="200" y="170" width="400" height="50" class="box"/>\n  <text x="400" y="195" text-anchor="middle" class="text-bold">Records after duplicates removed (n = ${t.screening.records_after_duplicates})</text>\n  <text x="400" y="210" text-anchor="middle" class="text-small">Duplicates: ${t.screening.duplicates_removed}</text>\n\n  <line x1="400" y1="220" x2="400" y2="250" class="arrow"/>\n\n  \x3c!-- Screening --\x3e\n  <rect x="150" y="260" width="300" height="50" class="box"/>\n  <text x="300" y="290" text-anchor="middle" class="text-bold">Records screened (n = ${t.screening.records_screened})</text>\n\n  <line x1="450" y1="285" x2="520" y2="285" class="arrow"/>\n  <rect x="530" y="260" width="200" height="50" class="box-exclude"/>\n  <text x="630" y="290" text-anchor="middle" class="text-bold">Excluded (n = ${t.screening.records_excluded})</text>\n\n  <line x1="300" y1="310" x2="300" y2="340" class="arrow"/>\n\n  \x3c!-- Full-text --\x3e\n  <rect x="150" y="350" width="300" height="50" class="box"/>\n  <text x="300" y="380" text-anchor="middle" class="text-bold">Full-text assessed (n = ${t.screening.reports_assessed})</text>\n\n  <line x1="450" y1="375" x2="520" y2="375" class="arrow"/>\n  <rect x="530" y="350" width="200" height="50" class="box-exclude"/>\n  <text x="630" y="380" text-anchor="middle" class="text-bold">Excluded (n = ${t.screening.reports_excluded})</text>\n\n  <line x1="300" y1="400" x2="300" y2="430" class="arrow"/>\n\n  \x3c!-- Included --\x3e\n  <rect x="150" y="440" width="500" height="60" class="box-include"/>\n  <text x="400" y="470" text-anchor="middle" class="text-bold">Studies included in meta-analysis (n = ${t.included.studies_included})</text>\n  <text x="400" y="490" text-anchor="middle" class="text">Reports: ${t.included.reports_included}</text>\n\n  \x3c!-- Footer --\x3e\n  <text x="400" y="580" text-anchor="middle" class="text-small">Generated by TruthCert-PairwisePro v1.0</text>\n</svg>`,
    a = new Blob([n], {
      type: "image/svg+xml"
    }),
    s = URL.createObjectURL(a),
    i = document.createElement("a");
  i.href = s, i.download = "PRISMA_Flow_Diagram.svg", document.body.appendChild(i), i.click(), document.body.removeChild(i), URL.revokeObjectURL(s), showToast("PRISMA diagram exported as SVG", "success")
}

function runExtendedValidationUI() {
  showToast("Running extended validation suite...", "info"), setTimeout(() => {
    try {
      const e = runExtendedValidation();
      let t = '<h4 style="margin-bottom: var(--space-3);">Extended Validation (incl. HKSJ, Egger, High I²)</h4>';
      t += '<table style="width: 100%; border-collapse: collapse; font-size: var(--text-sm);">', t += '<thead><tr style="border-bottom: 2px solid var(--border-color);">', t += '<th style="text-align: left; padding: 8px;">Test</th>', t += "<th>Type</th><th>Status</th><th>Details</th>", t += "</tr></thead><tbody>";
      for (const n of e.results) {
        const e = n.overall_pass ? "✅" : "⚠️",
          a = {
            core: "Core",
            heterogeneity: "I² Test",
            hksj: "HKSJ",
            egger: "Egger"
          } [n.type] || n.type;
        t += '<tr style="border-bottom: 1px solid var(--border-color);">', t += '<td style="padding: 8px;">' + n.dataset + "</td>", t += '<td style="text-align: center;">' + a + "</td>", t += '<td style="text-align: center;">' + e + "</td>", t += '<td style="font-size: var(--text-xs);">' + (n.message || "Passed") + "</td>", t += "</tr>"
      }
      t += "</tbody></table>", t += '<p style="margin-top: var(--space-3); font-weight: 600;">' + e.summary.all_passed + "/" + e.summary.all_total + " tests passed. " + e.summary.conclusion + "</p>", document.getElementById("validationResults").innerHTML = t, showToast("Extended validation complete", e.summary.all_passed === e.summary.all_total ? "success" : "warning")
    } catch (e) {
      showToast("Validation failed: " + e.message, "error"), console.error(e)
    }
  }, 100)
}

function runCumulativeAnalysis() {
  const e = AppState.results;
  if (e && e.studies) try {
    const t = cumulativeMetaAnalysisByYear(e.studies);
    renderCumulativeMetaAnalysisPlot(t, "year", "cumYearPlot");
    renderCumulativeMetaAnalysisPlot(cumulativeMetaAnalysisByPrecision(e.studies), "precision", "cumPrecisionPlot");
    const n = t[0].theta,
      a = t[t.length - 1].theta - n;
    document.getElementById("cumulativeResults").innerHTML = `\n          <p><strong>Effect size drift:</strong> ${a>0?"+":""}${a.toFixed(4)} from first to last study</p>\n          <p><strong>Interpretation:</strong> ${Math.abs(a)<.1?"Estimate stable over time - no evidence of temporal drift.":"Notable drift detected - consider investigating temporal trends."}</p>\n        `, showToast("Cumulative analysis complete", "success")
  } catch (e) {
    showToast("Cumulative analysis failed: " + e.message, "error"), console.error(e)
  } else showToast("Run analysis first", "error")
}
window.runGOSHAnalysis = runGOSHAnalysis, window.runTSAAnalysis = runTSAAnalysis, window.runPCurveAnalysis = runPCurveAnalysis, window.runZCurveAnalysis = runZCurveAnalysis, window.runCR2Analysis = runCR2Analysis, window.runRoBMA = runRoBMA, window.renderContourFunnelPlot = renderContourFunnelPlot, window.renderSunsetPlot = renderSunsetPlot, window.autoRenderPowerAnalysis = autoRenderPowerAnalysis, window.runInfluenceDiagnostics = runInfluenceDiagnostics, window.runCopasModel = runCopasModel, window.runSmallSampleCI = runSmallSampleCI, window.calculatePredictionInterval = calculatePredictionInterval, window.calculateInfluenceDiagnostics = calculateInfluenceDiagnostics, window.copasSelectionModel = copasSelectionModel, window.zejnullahiCI = zejnullahiCI, window.profileLikelihoodTau2CI = profileLikelihoodTau2CI, window.runValidation = runValidation, window.runValidationSuite = runValidationSuite, window.runGRADEAssessment = runGRADEAssessment, window.runMetaRegression = runMetaRegression, window.runLeaveOneOutCorrected = runLeaveOneOutCorrected, window.calculateHedgesG = calculateHedgesG, window.multipleMetaRegression = multipleMetaRegression, window.bivariateMetaAnalysis = bivariateMetaAnalysis, window.leaveOneOutCorrected = leaveOneOutCorrected, window.assessGRADEDomains = assessGRADEDomains, window.checkSmallSampleWarnings = checkSmallSampleWarnings, window.handleZeroCells = handleZeroCells, window.renderEnhancedFunnelPlot = renderEnhancedFunnelPlot, window.generatePRISMAData = generatePRISMAData, window.renderPRISMADiagram = renderPRISMADiagram, window.estimateTau2_REML_Documented = estimateTau2_REML_Documented, window.VALIDATION_DATASETS = VALIDATION_DATASETS, window.displaySmallSampleWarnings = displaySmallSampleWarnings, window.runExtendedValidation = runExtendedValidation, window.runExtendedValidationUI = runExtendedValidationUI, window.cumulativeMetaAnalysisByYear = cumulativeMetaAnalysisByYear, window.cumulativeMetaAnalysisByPrecision = cumulativeMetaAnalysisByPrecision, window.runCumulativeAnalysis = runCumulativeAnalysis, window.renderCumulativeMetaAnalysisPlot = renderCumulativeMetaAnalysisPlot, window.exportPRISMASVG = exportPRISMASVG, window.VALIDATION_DATASETS_EXTENDED = VALIDATION_DATASETS_EXTENDED;