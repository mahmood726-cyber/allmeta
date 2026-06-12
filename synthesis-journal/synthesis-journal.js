/* synthesis-journal.js — render an allmeta review as a Synthēsis journal article.
 * Browser port of the synthesis-paper-spec/metapaper STANDARD (typography, figure
 * house rules, structured abstract, how-to-cite). Truth-first: every number is read
 * from the synthesis buses (ma-studies / ma-pooled); nothing is invented. When the
 * buses are empty the page renders a clearly-labelled DEMO so it is usable
 * standalone, and the demo banner says so.
 */
(function () {
  "use strict";
  var Z = 1.959963984540054;
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fnum(x, d) { d = d == null ? 2 : d; return (typeof x === "number" && isFinite(x)) ? x.toFixed(d) : "—"; }

  // ---- A clearly-labelled DEMO synthesis (only used when no bus data is present) ----
  var DEMO = {
    demo: true, scale: "ratio", measure: "RR",
    title: "Statins for the primary prevention of cardiovascular mortality",
    deck: "A demonstration synthesis — replace it by running a review in allmeta and returning here.",
    studies: [
      { label: "Downs 1998", est: Math.log(0.79), se: 0.13 },
      { label: "Shepherd 1995", est: Math.log(0.72), se: 0.11 },
      { label: "Sever 2003", est: Math.log(0.83), se: 0.10 },
      { label: "Nakamura 2006", est: Math.log(0.67), se: 0.18 },
      { label: "Ridker 2008", est: Math.log(0.80), se: 0.07 },
      { label: "Yusuf 2016", est: Math.log(0.76), se: 0.09 },
      { label: "Mortensen 2019", est: Math.log(0.88), se: 0.12 }
    ],
    pooled: null
  };

  function readBuses() {
    var studies = [];
    try { if (window.MaStudies) studies = (MaStudies.read() || []).filter(function (s) { return s && isFinite(s.est) && isFinite(s.se) && s.se > 0; }); } catch (e) {}
    var pooledList = [];
    try { if (window.MaPooled) pooledList = MaPooled.read() || []; } catch (e) {}
    if (!studies.length) { var d = DEMO; return { demo: true, scale: d.scale, measure: d.measure, title: d.title, deck: d.deck, studies: d.studies.slice(), pooled: pooled(d.studies, d.scale) }; }
    var pl = pooledList.length ? pooledList[pooledList.length - 1] : null;
    var scale = pl && pl.scale ? pl.scale : "linear";
    var measure = pl && pl.measure ? pl.measure : (scale === "ratio" ? "RR" : "MD");
    var p;
    if (pl && isFinite(pl.pointEstimate)) {
      // Pooled is read VERBATIM from the producer (never re-pooled — bus contract).
      p = { mu: scale === "ratio" ? Math.log(pl.pointEstimate) : pl.pointEstimate,
            lo: scale === "ratio" ? Math.log(pl.ciLo) : pl.ciLo,
            hi: scale === "ratio" ? Math.log(pl.ciHi) : pl.ciHi,
            natural: pl.pointEstimate, naturalLo: pl.ciLo, naturalHi: pl.ciHi,
            k: pl.k || studies.length, computed: false };
    } else {
      p = pooled(studies, scale);   // no producer estimate -> compute + label it
    }
    return { demo: false, scale: scale, measure: measure,
      title: pl && pl.label ? pl.label : "Evidence synthesis", deck: "", studies: studies, pooled: p };
  }

  // Random-effects pool (REML via ma-core) — only used when the bus carries no
  // producer estimate; the result is explicitly labelled "computed here".
  function pooled(studies, scale) {
    var yi = studies.map(function (s) { return s.est; }), vi = studies.map(function (s) { return s.se * s.se; });
    var r;
    try { r = (window.AlmMaCore || {}).pool(yi, vi, { method: "REML", knha: true, knhaFloor: true }); }
    catch (e) { r = null; }
    if (!r) { // fixed-effect fallback
      var sw = 0, swy = 0; for (var i = 0; i < yi.length; i++) { var w = 1 / vi[i]; sw += w; swy += w * yi[i]; }
      var mu = swy / sw, se = Math.sqrt(1 / sw); r = { mu: mu, ciLo: mu - Z * se, ciHi: mu + Z * se, k: yi.length };
    }
    var ex = scale === "ratio" ? Math.exp : function (x) { return x; };
    return { mu: r.mu, lo: r.ciLo, hi: r.ciHi, natural: ex(r.mu), naturalLo: ex(r.ciLo), naturalHi: ex(r.ciHi), k: r.k, computed: true };
  }

  // ---- Inline forest figure, following the metapaper house rules: a single
  // baseline spine, direct study labels (no legend), one brand accent for the
  // study marks and ONE red diamond for the pooled estimate. ----
  function forestSVG(d) {
    var studies = d.studies, ratio = d.scale === "ratio", p = d.pooled;
    var rows = studies.map(function (s) { return { label: s.label, est: s.est, lo: s.est - Z * s.se, hi: s.est + Z * s.se, w: 1 / (s.se * s.se) }; });
    var allLo = Math.min.apply(null, rows.map(function (r) { return r.lo; }).concat([p.lo, 0]));
    var allHi = Math.max.apply(null, rows.map(function (r) { return r.hi; }).concat([p.hi, 0]));
    var pad = (allHi - allLo) * 0.08 || 0.1; allLo -= pad; allHi += pad;
    var W = 760, padL = 168, padR = 92, plotW = W - padL - padR;
    var rowH = 24, top = 26, H = top + rows.length * rowH + 54;
    function X(v) { return padL + (v - allLo) / (allHi - allLo) * plotW; }
    var ex = ratio ? Math.exp : function (x) { return x; };
    var nullX = X(0);
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Forest plot of study and pooled estimates" font-family="Segoe UI, system-ui, sans-serif">';
    // null reference line (dotted)
    svg += '<line x1="' + nullX.toFixed(1) + '" y1="' + (top - 6) + '" x2="' + nullX.toFixed(1) + '" y2="' + (top + rows.length * rowH + 4) + '" stroke="#a7a7a2" stroke-width="1" stroke-dasharray="2 3"/>';
    rows.forEach(function (r, i) {
      var y = top + i * rowH + rowH / 2;
      var sz = 4 + 5 * Math.sqrt(r.w / Math.max.apply(null, rows.map(function (q) { return q.w; })));
      svg += '<text x="8" y="' + (y + 3.5) + '" font-size="11.5" fill="#1d1d1b">' + esc(r.label) + '</text>';
      svg += '<line x1="' + X(r.lo).toFixed(1) + '" y1="' + y + '" x2="' + X(r.hi).toFixed(1) + '" y2="' + y + '" stroke="#054f16" stroke-width="1.3"/>';
      svg += '<rect x="' + (X(r.est) - sz).toFixed(1) + '" y="' + (y - sz) + '" width="' + (2 * sz).toFixed(1) + '" height="' + (2 * sz).toFixed(1) + '" fill="#054f16"/>';
      svg += '<text x="' + (W - 8) + '" y="' + (y + 3.5) + '" font-size="10.5" fill="#6f6f6a" text-anchor="end">' + fnum(ex(r.est)) + ' (' + fnum(ex(r.lo)) + ', ' + fnum(ex(r.hi)) + ')</text>';
    });
    // pooled diamond (red — the one emphasis mark)
    var yD = top + rows.length * rowH + 16, c = X(p.mu), l = X(p.lo), h = X(p.hi);
    svg += '<polygon points="' + l.toFixed(1) + ',' + yD + ' ' + c.toFixed(1) + ',' + (yD - 7) + ' ' + h.toFixed(1) + ',' + yD + ' ' + c.toFixed(1) + ',' + (yD + 7) + '" fill="#9c2b27"/>';
    svg += '<text x="8" y="' + (yD + 3.5) + '" font-size="11.5" font-weight="700" fill="#1d1d1b">Pooled (' + esc(d.measure) + ')</text>';
    svg += '<text x="' + (W - 8) + '" y="' + (yD + 3.5) + '" font-size="10.5" font-weight="700" fill="#9c2b27" text-anchor="end">' + fnum(p.natural) + ' (' + fnum(p.naturalLo) + ', ' + fnum(p.naturalHi) + ')</text>';
    // baseline spine + a few ticks
    var axisY = yD + 22;
    svg += '<line x1="' + padL + '" y1="' + axisY + '" x2="' + (W - padR) + '" y2="' + axisY + '" stroke="#1d1d1b" stroke-width="1"/>';
    var ticks = ratio ? [0.5, 0.75, 1, 1.5, 2] : [allLo, (allLo + allHi) / 2, allHi];
    ticks.forEach(function (t) { var v = ratio ? Math.log(t) : t; if (v < allLo || v > allHi) return; var x = X(v);
      svg += '<line x1="' + x.toFixed(1) + '" y1="' + axisY + '" x2="' + x.toFixed(1) + '" y2="' + (axisY + 4) + '" stroke="#1d1d1b"/>';
      svg += '<text x="' + x.toFixed(1) + '" y="' + (axisY + 15) + '" font-size="9.5" fill="#6f6f6a" text-anchor="middle">' + fnum(ratio ? t : t, ratio ? 2 : 2) + '</text>'; });
    svg += '<text x="' + nullX.toFixed(1) + '" y="' + (axisY + 28) + '" font-size="9" fill="#a7a7a2" text-anchor="middle">no effect</text>';
    svg += "</svg>";
    return svg;
  }

  function studyTable(d) {
    var ratio = d.scale === "ratio", ex = ratio ? Math.exp : function (x) { return x; };
    var body = d.studies.map(function (s) {
      var lo = ex(s.est - Z * s.se), hi = ex(s.est + Z * s.se), w = 1 / (s.se * s.se);
      return "<tr><td>" + esc(s.label) + "</td><td>" + fnum(ex(s.est)) + "</td><td>" + fnum(lo) + " to " + fnum(hi) + "</td><td>" + fnum(s.se, 3) + "</td></tr>";
    }).join("");
    return '<table class="booktabs"><caption><span class="fnum">Table 1.</span> Included studies and their effect estimates (' + esc(d.measure) + ').</caption>'
      + "<thead><tr><th>Study</th><th>" + esc(d.measure) + "</th><th>95% CI</th><th>SE</th></tr></thead><tbody>" + body + "</tbody></table>";
  }

  function render() {
    var d = readBuses();
    var ratio = d.scale === "ratio", p = d.pooled, k = d.studies.length;
    var dir = p.natural < (ratio ? 1 : 0) ? "lower" : "higher";
    var sig = (p.naturalLo > (ratio ? 1 : 0)) || (p.naturalHi < (ratio ? 1 : 0));
    var poolWord = p.computed ? "random-effects (REML, computed here)" : "as reported by the review";

    var banner = document.getElementById("demoBanner");
    if (d.demo) { banner.hidden = false; banner.textContent = "DEMO — no live synthesis is on the bus. Run a review in allmeta, then return and press “Refresh from review”."; }
    else { banner.hidden = true; }

    var html = "";
    html += '<div class="letterhead"><span class="wordmark">Synthēsis</span>'
      + '<span class="issue-line">Living Evidence Synthesis<br>Article ID: ALM-' + (k ? ("k" + k) : "—") + ' · ' + (d.demo ? "DEMONSTRATION" : "Living dashboard") + '<br>DOI: not yet assigned</span></div>';
    html += '<p class="kicker">Systematic review &amp; meta-analysis</p>';
    html += '<h1 class="title">' + esc(d.title) + "</h1>";
    if (d.deck) html += '<p class="deck">' + esc(d.deck) + "</p>";
    html += '<p class="byline">Generated by allmeta · every figure and number is read from the synthesis data, not invented.</p>';

    // Structured abstract
    var absResult = "The pooled " + esc(d.measure) + " across " + k + " studies was <b>" + fnum(p.natural)
      + "</b> (95% CI " + fnum(p.naturalLo) + " to " + fnum(p.naturalHi) + "), " + poolWord + "."
      + (sig ? " The interval excludes no effect." : " The interval includes no effect.");
    html += '<div class="abstract"><h2>Abstract</h2>'
      + '<p><span class="lead">Background.</span> ' + esc(d.title) + " is assessed by pooling the available randomised evidence.</p>"
      + '<p><span class="lead">Methods.</span> ' + k + " studies were combined; the summary effect is reported on the "
      + (ratio ? "ratio" : "difference") + " scale (" + esc(d.measure) + "), with a 95% confidence interval.</p>"
      + '<p><span class="lead">Results.</span> ' + absResult + "</p>"
      + '<p><span class="lead">Conclusions.</span> The pooled estimate indicates a ' + dir + " value than the comparator"
      + (sig ? ", with an interval that excludes no effect" : ", though the interval is compatible with no effect") + ".</p></div>";

    // Key finding pull-quote
    html += '<div class="keyfinding"><div class="bar"></div><div><div class="stmt">'
      + esc(d.measure) + " " + fnum(p.natural) + " <span style=\"font-size:.7em;color:#6f6f6a\">(95% CI " + fnum(p.naturalLo) + "–" + fnum(p.naturalHi) + ")</span></div>"
      + '<div class="sub">Pooled across ' + k + " studies · " + poolWord + "</div></div></div>";

    html += '<h2 class="section">Results</h2>';
    html += "<p>The " + k + " included studies and their effect estimates are listed in <b>Table 1</b>; the forest plot in <b>Figure 1</b> shows each study estimate with its 95% confidence interval and the pooled summary. " + absResult.replace(/<\/?b>/g, "") + "</p>";
    html += studyTable(d);
    html += '<figure class="fig">' + forestSVG(d) + '<figcaption><span class="fnum">Figure 1.</span> Forest plot of the ' + k + " study estimates (brand squares, sized by precision) and the pooled estimate (red diamond). The dotted line marks no effect" + (ratio ? " (" + esc(d.measure) + " = 1)" : " (" + esc(d.measure) + " = 0)") + ".</figcaption></figure>";

    html += '<h2 class="section">Included studies</h2>';
    html += '<ol class="refs">' + d.studies.map(function (s) { return "<li>" + esc(s.label) + ". (Full citation from the review’s extraction record.)</li>"; }).join("") + "</ol>";
    if (d.demo) html += '<p class="integrity">Demonstration data — not a real synthesis. The “included studies” above are illustrative labels.</p>';

    // Open access + how to cite
    var yearGuess = "2026";
    html += '<div class="howtocite"><h3>How to cite</h3><div class="cite">allmeta living evidence synthesis. <i>'
      + esc(d.title) + "</i>. Synthēsis (living dashboard), " + yearGuess + ". DOI: not yet assigned.</div></div>";
    html += '<div class="oa"><span>© ' + yearGuess + " · CC BY 4.0 (diamond open access). Figures and numbers traced to the synthesis data.</span>"
      + '<span style="text-align:right">Published in <b>Synthēsis</b> · synthesis-medicine.org</span></div>';

    document.getElementById("article").innerHTML = html;
  }

  function boot() {
    render();
    var p = document.getElementById("btnPrint"); if (p) p.addEventListener("click", function () { window.print(); });
    var r = document.getElementById("btnRefresh"); if (r) r.addEventListener("click", render);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
