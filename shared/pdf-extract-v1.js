/* shared/pdf-extract-v1.js — offline PDF text extraction for the extract app.
 *
 * Thin wrapper over the VENDORED pdf.js (shared/vendor/pdfjs/, Apache-2.0).
 * Pulls the text layer out of an uploaded PDF entirely client-side: no CDN, no
 * upload, no server. Runs under the app CSP — the worker is same-origin
 * ('self'), and getDocument is called with isEvalSupported:false so no
 * 'unsafe-eval' is needed.
 *
 * Browser only (pdf.js needs DOM + a worker). The grounding/extraction logic
 * that consumes this text is the separate, node-testable shared/
 * extract-grounding-v1.js. Browser global: window.SrPdf.
 */
(function (global) {
  "use strict";

  function lib() { return global.pdfjsLib; }
  function available() { var L = lib(); return !!(L && L.getDocument); }

  // Point pdf.js at the vendored worker (same-origin -> satisfies worker-src 'self').
  function configure(workerSrc) {
    var L = lib();
    if (L && L.GlobalWorkerOptions) {
      L.GlobalWorkerOptions.workerSrc = workerSrc || "../shared/vendor/pdfjs/pdf.worker.min.js";
    }
  }

  // arrayBuffer (or Uint8Array) -> Promise<{ pages:[{n,text}], text }>.
  function extractText(data) {
    if (!available()) return Promise.reject(new Error("pdf.js is not loaded"));
    var task = lib().getDocument({ data: data, isEvalSupported: false, disableFontFace: true });
    return task.promise.then(function (pdf) {
      var pages = [], chain = Promise.resolve();
      for (var p = 1; p <= pdf.numPages; p++) {
        (function (n) {
          chain = chain.then(function () {
            return pdf.getPage(n)
              .then(function (page) { return page.getTextContent(); })
              .then(function (tc) {
                var s = tc.items.map(function (it) { return it.str; }).join(" ").replace(/\s+/g, " ").trim();
                pages.push({ n: n, text: s });
              });
          });
        })(p);
      }
      return chain.then(function () {
        return { pages: pages, text: pages.map(function (pg) { return pg.text; }).join("\n\n") };
      });
    });
  }

  // Read a File/Blob -> Promise<{pages,text}>.
  function extractFile(file) {
    return file.arrayBuffer().then(function (buf) { return extractText(buf); });
  }

  global.SrPdf = { available: available, configure: configure, extractText: extractText, extractFile: extractFile };
})(typeof window !== "undefined" ? window : globalThis);
