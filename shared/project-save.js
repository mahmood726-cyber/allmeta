/* shared/project-save.js — single-file cross-app project save/restore.
 *
 * allmeta apps persist their state in localStorage (autosave, url-state, the ma-studies-v1
 * bus, per-app keys). Because localStorage is shared across all same-origin app pages, a
 * snapshot taken on ANY page captures the whole review workspace, and restoring it makes
 * that state available to every app. This gives RevMan-style project portability while
 * staying fully offline and single-file (one .json you can email or archive).
 *
 * snapshot()      → { _schema, savedAt, app, entries:{key:value,…} } of all localStorage.
 * download(name)  → save the snapshot as a .json file.
 * restore(obj)    → write the entries back to localStorage; returns the count restored.
 * importFile(f)   → parse an uploaded .json and restore it (Promise<count>).
 * install({target}) → mount "Save project" / "Load project" controls into an element.
 *
 * No external dependency; no network.
 */
(function (global) {
  "use strict";
  var SCHEMA = "allmeta-project-v1";

  function _now() { try { return new Date().toISOString(); } catch (e) { return null; } }

  function snapshot() {
    var entries = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        entries[k] = localStorage.getItem(k);
      }
    } catch (e) {}
    var app = "";
    try { app = (location.pathname.split("/").filter(Boolean).slice(-2, -1)[0]) || ""; } catch (e) {}
    return { _schema: SCHEMA, savedAt: _now(), app: app, count: Object.keys(entries).length, entries: entries };
  }

  function download(filename) {
    var snap = snapshot();
    if (typeof document === "undefined") return snap;
    var blob = new Blob([JSON.stringify(snap, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = filename || ("allmeta-project-" + (snap.savedAt || "").replace(/[:.]/g, "-").slice(0, 19) + ".json");
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
    return snap;
  }

  // Restore. opts.clear=true wipes existing keys first (full replace); default merges.
  function restore(obj, opts) {
    opts = opts || {};
    if (!obj || obj._schema !== SCHEMA || typeof obj.entries !== "object") {
      throw new Error("Not a valid allmeta project file (expected _schema=\"" + SCHEMA + "\").");
    }
    var n = 0;
    try {
      if (opts.clear) localStorage.clear();
      for (var k in obj.entries) {
        if (Object.prototype.hasOwnProperty.call(obj.entries, k)) {
          localStorage.setItem(k, obj.entries[k]); n++;
        }
      }
    } catch (e) {}
    return n;
  }

  function importFile(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { try { resolve(restore(JSON.parse(String(r.result)))); } catch (e) { reject(e); } };
      r.onerror = function () { reject(new Error("Could not read file.")); };
      r.readAsText(file);
    });
  }

  function install(opts) {
    opts = opts || {};
    if (typeof document === "undefined") return false;
    var host = typeof opts.target === "string" ? document.querySelector(opts.target) : opts.target;
    if (!host) return false;
    var status = function (msg) { var s = host.querySelector(".alm-proj-status"); if (s) s.textContent = msg; };
    host.innerHTML =
      "<div class='alm-proj' style='display:flex;gap:.5rem;align-items:center;flex-wrap:wrap'>" +
      "<button type='button' class='alm-proj-save'>💾 Save project</button>" +
      "<label class='alm-proj-load' style='cursor:pointer;text-decoration:underline'>📂 Load project<input type='file' accept='.json,application/json' style='display:none'></label>" +
      "<span class='alm-proj-status' role='status' aria-live='polite' style='font-size:.8rem;opacity:.8'></span></div>";
    host.querySelector(".alm-proj-save").addEventListener("click", function () { var s = download(opts.filename); status("Saved " + s.count + " items."); });
    host.querySelector(".alm-proj-load input").addEventListener("change", function (e) {
      var f = e.target.files && e.target.files[0]; if (!f) return;
      importFile(f).then(function (n) { status("Loaded " + n + " items — reopen apps to see restored state."); if (opts.onRestore) opts.onRestore(n); })
        .catch(function (err) { status("Error: " + (err.message || err)); });
    });
    return true;
  }

  var api = { snapshot: snapshot, download: download, restore: restore, importFile: importFile, install: install, SCHEMA: SCHEMA };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AlmProject = api;
})(typeof window !== "undefined" ? window : globalThis);
