/* shared/sr-collab-v1.js — serverless team collaboration for the sr-* pipeline.
 *
 * Screening is dual-reviewer (two fixed slots r1/r2 + a `resolved` override).
 * Today reviewers swap a small `sr-reviewer-v1` decisions file by hand. This
 * module makes that exchange seamless WITHOUT a server, an account, or any
 * external OAuth: reviewers point the app at one shared folder (a Google
 * Drive / Dropbox / OneDrive folder synced by the user's own desktop client),
 * each publishes their per-reviewer file into it, and anyone can pull every
 * reviewer file and union-merge them. The browser never touches the network;
 * the OS sync client does. Manual export/import stays as the air-gapped path.
 *
 * Two layers:
 *   1. PURE merge (Node + browser testable): mergeReviewerFiles / summarize.
 *      Mirrors screen's match-by id->DOI->PMID->title and conflict detection,
 *      generalised to merge SEVERAL reviewer files in one pass.
 *   2. Folder adapter (browser-only, feature-detected via the File System
 *      Access API): pickFolder / publishReviewer / pullFolder. Absent on
 *      Firefox/Safari — callers must fall back to file export/import.
 *
 * Browser global: window.SrCollab. Node: module.exports.
 */
(function (global) {
  "use strict";

  var REVIEWER_SCHEMA = "sr-reviewer-v1";
  var FILE_PREFIX = "screen-reviewer-";

  function clean(s, cap) {
    s = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
    cap = cap || 4000;
    return s.length > cap ? s.slice(0, cap) : s;
  }

  // Self-contained title normalisation for last-resort matching (id/DOI/PMID
  // win first, so light stopword handling here is sufficient and drift-safe).
  function normTitle(t) {
    return String(t || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/).filter(Boolean).join(" ").trim();
  }

  function buildIndex(records) {
    var ix = { byId: {}, byDoi: {}, byPmid: {}, byTitle: {} };
    (records || []).forEach(function (r) {
      if (!r) return;
      if (r.id != null) ix.byId[r.id] = r;
      var d = (r.doi || "").toLowerCase(); if (d && !ix.byDoi[d]) ix.byDoi[d] = r;
      if (r.pmid && !ix.byPmid[String(r.pmid)]) ix.byPmid[String(r.pmid)] = r;
      var nt = normTitle(r.title); if (nt && !ix.byTitle[nt]) ix.byTitle[nt] = r;
    });
    return ix;
  }

  function matchIncoming(d, ix) {
    if (d.id != null && ix.byId[d.id]) return ix.byId[d.id];
    var doi = (d.doi || "").toLowerCase(); if (doi && ix.byDoi[doi]) return ix.byDoi[doi];
    if (d.pmid && ix.byPmid[String(d.pmid)]) return ix.byPmid[String(d.pmid)];
    var nt = normTitle(d.title || ""); if (nt && ix.byTitle[nt]) return ix.byTitle[nt];
    return null;
  }

  function slotEnsure(r, slot) { if (!r[slot] || typeof r[slot] !== "object") r[slot] = { d: "", reason: "" }; return r[slot]; }

  // Decide which slot a reviewer file fills:
  //  - honour the file's declared reviewer when it is r1/r2 (a re-submitted
  //    file for the same reviewer legitimately updates that slot);
  //  - otherwise assign the next free slot among r1, r2;
  //  - return null when an UNDECLARED file arrives with both slots already
  //    taken — the sr-records-v1 schema has only r1/r2, so rather than silently
  //    clobber an existing reviewer we drop the overflow file (see merge below).
  function slotFor(payload, taken) {
    var declared = payload && payload.reviewer;
    if (declared === "r1" || declared === "r2") return declared;
    if (taken.indexOf("r1") < 0) return "r1";
    if (taken.indexOf("r2") < 0) return "r2";
    return null;
  }

  // PURE: merge one or more sr-reviewer-v1 payloads into `records` (mutates
  // records, like screen's mergeReviewerState). Returns a per-reviewer report
  // plus project-level consensus/conflict counts. Order of payloads is
  // honoured; a later file targeting an already-filled slot overwrites it.
  function mergeReviewerFiles(records, payloads, opts) {
    opts = opts || {};
    if (!Array.isArray(records)) throw new Error("records must be an array");
    if (!Array.isArray(payloads)) payloads = [payloads];
    var ix = buildIndex(records);
    var taken = [];
    var perReviewer = payloads.map(function (payload) {
      var rep = { reviewer: (payload && payload.reviewer) || null, slot: null, incoming: 0, matched: 0, unmatched: 0, filled: 0 };
      if (!payload || !Array.isArray(payload.decisions)) { rep.error = "not a reviewer file (missing decisions[])"; return rep; }
      var slot = slotFor(payload, taken);
      if (!slot) { rep.error = "no free reviewer slot (sr-records-v1 supports r1/r2 only; file dropped)"; return rep; }
      if (taken.indexOf(slot) < 0) taken.push(slot);
      rep.slot = slot;
      rep.incoming = payload.decisions.length;
      payload.decisions.forEach(function (d) {
        if (!d) return;
        var r = matchIncoming(d, ix);
        if (!r) { rep.unmatched++; return; }
        rep.matched++;
        if (["include", "exclude", "maybe"].indexOf(d.d) < 0) return;
        var s = slotEnsure(r, slot);
        s.d = d.d; s.reason = clean(d.reason, 200) || "";
        if (Array.isArray(d.labels)) {
          if (!Array.isArray(r.labels)) r.labels = [];
          d.labels.forEach(function (lb) { lb = clean(lb, 120); if (lb && r.labels.indexOf(lb) < 0) r.labels.push(lb); });
        }
        rep.filled++;
      });
      return rep;
    });
    var sum = summarize(records);
    return { records: records, perReviewer: perReviewer, conflicts: sum.conflicts, consensusIncluded: sum.consensusIncluded, decided: sum.decided };
  }

  // Effective decision per record: resolved > both-agree > single. Conflicts =
  // both reviewers decided and disagree (and no resolution recorded).
  function summarize(records) {
    var out = { n: 0, decided: 0, conflicts: 0, consensusIncluded: 0, perSlot: { r1: { include: 0, exclude: 0, maybe: 0 }, r2: { include: 0, exclude: 0, maybe: 0 } } };
    (records || []).forEach(function (r) {
      if (!r || r.dup) return;
      out.n++;
      var d1 = r.r1 && r.r1.d, d2 = r.r2 && r.r2.d, res = r.resolved;
      if (d1 && out.perSlot.r1[d1] != null) out.perSlot.r1[d1]++;
      if (d2 && out.perSlot.r2[d2] != null) out.perSlot.r2[d2]++;
      if (d1 || d2 || res) out.decided++;
      if (d1 && d2 && d1 !== d2 && !res) out.conflicts++;
      var eff = res || (d1 && d2 ? (d1 === d2 ? d1 : null) : (d1 || d2));
      if (eff === "include") out.consensusIncluded++;
    });
    return out;
  }

  function buildReviewerEnvelope(reviewer, records, project, nowIso) {
    var decisions = (records || []).filter(function (r) { return r && !r.dup; }).map(function (r) {
      var slot = reviewer === "r2" ? r.r2 : r.r1;
      slot = slot || {};
      return { id: r.id, doi: r.doi, pmid: r.pmid, title: r.title, d: slot.d, reason: slot.reason, labels: (r.labels || []).slice() };
    }).filter(function (d) { return d.d; });
    return { _schema: REVIEWER_SCHEMA, _savedAt: nowIso || null, reviewer: reviewer, project: project || "", count: decisions.length, decisions: decisions };
  }

  // ---- folder adapter (browser only; File System Access API) ----
  function supportsFolder() {
    return (typeof global !== "undefined") && global.window === global && typeof global.showDirectoryPicker === "function";
  }
  function pickFolder() {
    if (!supportsFolder()) return Promise.reject(new Error("This browser has no folder access (use file export/import instead)."));
    return global.showDirectoryPicker({ id: "sr-collab", mode: "readwrite" });
  }
  function publishReviewer(dirHandle, payload) {
    if (!dirHandle || !payload) return Promise.reject(new Error("missing folder or payload"));
    var who = (payload.reviewer === "r2") ? "r2" : "r1";
    var name = FILE_PREFIX + who + ".json";
    return dirHandle.getFileHandle(name, { create: true })
      .then(function (fh) { return fh.createWritable(); })
      .then(function (w) { return w.write(JSON.stringify(payload, null, 2)).then(function () { return w.close(); }); })
      .then(function () { return name; });
  }
  function pullFolder(dirHandle) {
    if (!dirHandle || typeof dirHandle.entries !== "function") return Promise.reject(new Error("missing folder handle"));
    var payloads = [];
    function walk(it) {
      return it.next().then(function (res) {
        if (res.done) return payloads;
        var entry = res.value[1];
        var nm = String(res.value[0] || "").toLowerCase();
        if (entry.kind === "file" && nm.indexOf("reviewer") >= 0 && /\.json$/.test(nm)) {
          return entry.getFile()
            .then(function (f) { return f.text(); })
            .then(function (txt) {
              try { var p = JSON.parse(txt); if (p && p._schema === REVIEWER_SCHEMA && Array.isArray(p.decisions)) payloads.push(p); } catch (e) {}
              return walk(it);
            })
            .catch(function () { return walk(it); });
        }
        return walk(it);
      });
    }
    return walk(dirHandle.entries());
  }

  var api = {
    REVIEWER_SCHEMA: REVIEWER_SCHEMA, FILE_PREFIX: FILE_PREFIX,
    normTitle: normTitle, buildIndex: buildIndex, matchIncoming: matchIncoming, slotFor: slotFor,
    mergeReviewerFiles: mergeReviewerFiles, summarize: summarize, buildReviewerEnvelope: buildReviewerEnvelope,
    supportsFolder: supportsFolder, pickFolder: pickFolder, publishReviewer: publishReviewer, pullFolder: pullFolder
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.SrCollab = api;
})(typeof window !== "undefined" ? window : globalThis);
