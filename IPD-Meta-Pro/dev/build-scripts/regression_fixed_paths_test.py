#!/usr/bin/env python3
"""
Regression checks for recently fixed high-risk paths:
- Pooled schema compatibility (pooled.effect vs pooled.pooled)
- Export flows do not throw at runtime
- CSV escaping/injection guard behavior
- Fragility-study HTML escaping (XSS regression)
- Mojibake/encoding sanity checks in key files
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from selenium import webdriver
from selenium.common.exceptions import SessionNotCreatedException, WebDriverException
from selenium.webdriver.edge.options import Options
from selenium.webdriver.edge.service import Service

from edge_webdriver import load_local_app_with_ready_check


if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

_EDGE_BINARY_CANDIDATES = [
    os.environ.get("EDGE_BINARY"),
    "/home/user/.local/bin/microsoft-edge",
    "/mnt/c/Users/user/.local/bin/microsoft-edge",
    shutil.which("microsoft-edge"),
    shutil.which("microsoft-edge-stable"),
    shutil.which("msedge"),
]

_EDGE_DRIVER_CANDIDATES = [
    os.environ.get("EDGE_DRIVER"),
    "/home/user/.local/bin/msedgedriver",
    "/mnt/c/Users/user/.local/bin/msedgedriver",
    shutil.which("msedgedriver"),
]


def _first_executable(candidates) -> str | None:
    for c in candidates:
        if c and os.path.isfile(c) and os.access(c, os.X_OK):
            return c
    return None


def _resolve_edge_runtime() -> tuple[str | None, str | None]:
    edge_binary = _first_executable(_EDGE_BINARY_CANDIDATES)
    edge_driver = _first_executable(_EDGE_DRIVER_CANDIDATES)
    return edge_binary, edge_driver


class CheckResult:
    def __init__(self) -> None:
        self.passed: list[str] = []
        self.failed: list[str] = []

    def ok(self, msg: str) -> None:
        print(f"  [PASS] {msg}")
        self.passed.append(msg)

    def fail(self, msg: str) -> None:
        print(f"  [FAIL] {msg}")
        self.failed.append(msg)

    @property
    def success(self) -> bool:
        return not self.failed


def _cleanup_stale_webdriver() -> None:
    """Best-effort cleanup for orphaned Selenium driver processes."""
    try:
        if sys.platform == "win32":
            subprocess.run(
                ["taskkill", "/F", "/T", "/IM", "msedgedriver.exe"],
                capture_output=True,
                text=True,
                check=False,
            )
            subprocess.run(
                ["taskkill", "/F", "/T", "/IM", "chromedriver.exe"],
                capture_output=True,
                text=True,
                check=False,
            )
        else:
            subprocess.run(
                ["pkill", "-f", "msedgedriver|chromedriver"],
                capture_output=True,
                text=True,
                check=False,
            )
    except Exception:
        # Cleanup is opportunistic only.
        pass


def _build_options(profile_dir: str, edge_binary: str | None = None) -> Options:
    options = Options()
    options.add_argument("--start-maximized")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--no-first-run")
    options.add_argument("--no-default-browser-check")
    options.add_argument(f"--user-data-dir={profile_dir}")
    if edge_binary:
        options.binary_location = edge_binary
    options.add_experimental_option("excludeSwitches", ["enable-logging"])
    return options


def _create_driver(max_attempts: int = 3):
    """Create webdriver with retries for transient Edge startup failures."""
    edge_binary, edge_driver = _resolve_edge_runtime()
    if edge_binary:
        print(f"  [INFO] Using Edge binary: {edge_binary}")
    if edge_driver:
        print(f"  [INFO] Using EdgeDriver: {edge_driver}")

    last_exc = None
    for attempt in range(1, max_attempts + 1):
        profile_dir = tempfile.mkdtemp(prefix="ipdmp_regression_")
        try:
            options = _build_options(profile_dir, edge_binary=edge_binary)
            if edge_driver:
                driver = webdriver.Edge(
                    service=Service(executable_path=edge_driver),
                    options=options,
                )
            else:
                driver = webdriver.Edge(options=options)
            return driver, profile_dir
        except (SessionNotCreatedException, WebDriverException) as exc:
            last_exc = exc
            message = str(exc)
            retryable = (
                isinstance(exc, SessionNotCreatedException)
                or "Edge instance exited" in message
                or "Chrome instance exited" in message
                or "DevToolsActivePort" in message
            )
            shutil.rmtree(profile_dir, ignore_errors=True)
            if retryable and attempt < max_attempts:
                first_line = message.splitlines()[0] if message else repr(exc)
                print(f"  [WARN] Browser startup attempt {attempt} failed: {first_line}")
                _cleanup_stale_webdriver()
                time.sleep(1.5 * attempt)
                continue
            raise

    if last_exc is not None:
        raise last_exc
    raise RuntimeError("Unable to create Edge webdriver")


def run_static_checks(
    result: CheckResult,
    app_path: Path,
    module_path: Path,
    head_path: Path,
    service_worker_path: Path,
    trailer_path: Path,
    confidence_path: Path,
    webr_validation_path: Path,
) -> None:
    print("\n[STATIC] Source Safety Checks")

    app_text = app_path.read_text(encoding="utf-8")
    module_text = module_path.read_text(encoding="utf-8")
    head_text = head_path.read_text(encoding="utf-8")
    service_worker_text = service_worker_path.read_text(encoding="utf-8")
    trailer_text = trailer_path.read_text(encoding="utf-8")
    confidence_text = confidence_path.read_text(encoding="utf-8")
    webr_validation_text = webr_validation_path.read_text(encoding="utf-8")

    required = [
        "escapeHTML(results.mostFragileStudy.study)",
        "function normalizeResultsSchema(",
        "function exportAllFormats(",
        "function exportPublicationTables(",
        "function downloadTablesCSV(",
        "function escapeCSV(",
        'id="methodConfidencePanel"',
        "function refreshMethodConfidencePanel()",
        "function runIPDIntegrityGate()",
        "function detectOutliers(data, field)",
        "function detectDuplicates(data, keyFields, hasPatientId)",
        "function assessTreatmentBalance(data, studyVar, treatmentVar)",
        "APP.lastIntegrityReport = report",
        "window.runWebRValidation",
        "var WEBR_SCENARIOS  = []",
        "var generateRScript = function",
        "var copyRScript = function",
        "function compareResults(",
        "function extractRValues(",
        "webrValidationContainer",
    ]

    for marker in required:
        if (
            marker in module_text
            or marker in confidence_text
            or marker in app_text
            or marker in webr_validation_text
        ):
            result.ok(f"Marker present: {marker}")
        else:
            result.fail(f"Missing required marker: {marker}")

    mojibake = re.compile(r"(â€™|â€œ|â€\x9d|â€“|â€”|Ã.|Â.|ðŸ|IÂ²|Ï„Â²)")
    authored_source = "\n".join((head_text, module_text, service_worker_text, trailer_text, confidence_text))
    if mojibake.search(authored_source):
        result.fail("Potential mojibake marker found in source")
    else:
        result.ok("No common mojibake markers found in authored source modules")

    forbidden_startup_refs = [
        "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
        "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
        "ipd-meta-pro-cdn-v1",
        '<script src="dev/modules/export_schema_module.js"></script>',
    ]
    startup_sources = {
        "head": head_text,
        "service_worker": service_worker_text,
        "trailer": trailer_text,
    }
    for label, text in startup_sources.items():
        hits = [marker for marker in forbidden_startup_refs if marker in text]
        if hits:
            result.fail(f"Startup source still references external/runtime split deps in {label}: {hits}")
        else:
            result.ok(f"Startup source is local-only in {label}")


def run_browser_checks(result: CheckResult, app_path: Path) -> None:
    print("\n[RUNTIME] Browser Regression Checks")

    driver = None
    profile_dir = None

    try:
        driver, profile_dir = _create_driver()
    except Exception as exc:
        result.fail(f"Browser startup failed: {exc}")
        return

    try:
        load_state = load_local_app_with_ready_check(
            driver,
            app_path,
            required_functions=(
                "loadExampleData",
                "runAnalysis",
                "exportAllFormats",
                "exportPublicationTables",
                "downloadTablesCSV",
                "escapeCSV",
                "buildCSVRow",
            ),
            required_objects=("APP",),
        )
        if load_state.get("timed_out"):
            print("  [INFO] Continued after local runtime became ready despite CDN page-load timeout")
        time.sleep(1)

        runtime_signal = driver.execute_script("return window.__IPD_META_PRO_READY__ || null;")
        if load_state.get("appRuntimeReady") and isinstance(runtime_signal, dict):
            result.ok("Explicit app runtime ready signal is published")
        else:
            result.fail(f"Explicit app runtime ready signal missing: {load_state!r} / {runtime_signal!r}")

        if (
            isinstance(runtime_signal, dict)
            and runtime_signal.get("ready") is True
            and runtime_signal.get("phase") == "ready"
            and runtime_signal.get("coreInitComplete") is True
        ):
            result.ok("Runtime ready signal reports ready/core-init-complete state")
        else:
            result.fail(f"Runtime ready signal has unexpected payload: {runtime_signal!r}")

        ready = driver.execute_script(
            "return typeof loadExampleData === 'function' && typeof runAnalysis === 'function'"
        )
        if ready:
            result.ok("Core runtime functions are available")
        else:
            result.fail("Core runtime functions missing")
            return

        embedded_manifest = driver.execute_script(
            """
            const manifest = window.__IPD_EMBEDDED_VALIDATION_MANIFEST__ || null;
            return {
              exists: !!manifest,
              buildId: manifest ? (manifest.app_build_id || null) : null,
              digest: manifest && manifest.integrity_signature ? (manifest.integrity_signature.digest || null) : null,
              artifactCount: manifest && manifest.artifacts ? Object.keys(manifest.artifacts).length : 0
            };
            """
        )
        if embedded_manifest.get("exists") and embedded_manifest.get("digest") and embedded_manifest.get("artifactCount", 0) >= 4:
            result.ok("Embedded validation manifest is published with integrity digest")
        else:
            result.fail(f"Embedded validation manifest missing or incomplete: {embedded_manifest!r}")

        offline_parity = driver.execute_script(
            """
            const artifact = loadIPDLocalJSONSync('dev/benchmarks/latest_ipd_parity_gate.json');
            return {
              exists: !!artifact,
              source: artifact ? (artifact.__artifact_source || null) : null,
              buildId: artifact ? (artifact.app_build_id || null) : null,
              twoStage: artifact && artifact.summary ? artifact.summary.two_stage_pass_rate : null
            };
            """
        )
        if offline_parity.get("exists") and offline_parity.get("source") == "embedded_validation_manifest":
            result.ok("Offline benchmark loader falls back to embedded validation manifest")
        else:
            result.fail(f"Offline benchmark loader did not use embedded manifest: {offline_parity!r}")

        if offline_parity.get("buildId") and offline_parity.get("twoStage") == 1:
            result.ok("Embedded parity artifact carries build-specific validation summary")
        else:
            result.fail(f"Embedded parity artifact missing expected summary fields: {offline_parity!r}")

        confidence_panel = driver.execute_script(
            """
            const panel = document.getElementById('methodConfidencePanel');
            return {
              exists: !!panel,
              state: panel ? (panel.dataset.methodConfidence || null) : null,
              text: panel ? panel.innerText : ''
            };
            """
        )
        if confidence_panel.get("exists"):
            result.ok("Method confidence panel is rendered in analysis settings")
        else:
            result.fail("Method confidence panel missing from analysis settings")

        panel_text = confidence_panel.get("text", "")
        if "Benchmark-backed" in panel_text and "Composite validated score" in panel_text:
            result.ok("Method confidence panel exposes benchmark-backed guidance and embedded scorecards")
        else:
            result.fail(f"Method confidence panel text unexpected: {confidence_panel!r}")

        vendor_runtime = driver.execute_script(
            """
            return {
              hasXLSX: typeof XLSX !== 'undefined',
              hasJsPdfNamespace: typeof window.jspdf !== 'undefined',
              hasJsPdfCtor: !!(window.jspdf && typeof window.jspdf.jsPDF === 'function')
            };
            """
        )
        if vendor_runtime.get("hasXLSX"):
            result.ok("Vendored XLSX runtime is available")
        else:
            result.fail(f"Vendored XLSX runtime missing: {vendor_runtime}")

        if vendor_runtime.get("hasJsPdfNamespace") and vendor_runtime.get("hasJsPdfCtor"):
            result.ok("Vendored jsPDF runtime is available")
        else:
            result.fail(f"Vendored jsPDF runtime missing: {vendor_runtime}")

        advanced_modal = driver.execute_script(
            """
            showAdvancedFeaturesMenu();
            const modal = document.getElementById('beyondR40Modal');
            const out = {
              exists: !!modal,
              hasLegend: modal ? modal.innerText.includes('Evidence legend') : false,
              frontier: modal ? modal.querySelectorAll('button[data-evidence-tier="frontier-benchmark"]').length : 0,
              journal: modal ? modal.querySelectorAll('button[data-evidence-tier="journal-backed"]').length : 0,
              operational: modal ? modal.querySelectorAll('button[data-evidence-tier="operational"]').length : 0
            };
            if (modal && modal.remove) modal.remove();
            return out;
            """
        )
        if advanced_modal.get("exists") and advanced_modal.get("hasLegend"):
            result.ok("Advanced features launcher opens evidence-aware Beyond-R panel")
        else:
            result.fail(f"Advanced features modal did not expose evidence legend: {advanced_modal}")

        if advanced_modal.get("frontier", 0) > 0 and advanced_modal.get("journal", 0) > 0:
            result.ok("Beyond-R panel annotates methods with evidence tiers")
        else:
            result.fail(f"Beyond-R evidence tiers missing from modal: {advanced_modal}")

        driver.execute_script("loadExampleData('survival')")
        time.sleep(1.5)
        driver.execute_script("runAnalysis()")
        time.sleep(2)

        schema = driver.execute_script(
            """
            const pooled = APP.results && APP.results.pooled;
            const het = APP.results && APP.results.heterogeneity;
            return {
              hasPooled: !!pooled,
              hasEffect: pooled ? Number.isFinite(pooled.effect) : false,
              hasLegacyPooled: pooled ? Number.isFinite(pooled.pooled) : false,
              delta: pooled && Number.isFinite(pooled.effect) && Number.isFinite(pooled.pooled)
                    ? Math.abs(pooled.effect - pooled.pooled)
                    : null,
              hasHetI2: het ? Number.isFinite(het.i2) : false,
              hasHetTau2: het ? Number.isFinite(het.tau2) : false
            };
            """
        )

        if schema.get("hasPooled") and schema.get("hasEffect") and schema.get("hasLegacyPooled"):
            result.ok("Pooled schema compatibility fields exist")
        else:
            result.fail(f"Pooled schema compatibility missing: {schema}")

        delta = schema.get("delta")
        if isinstance(delta, (float, int)) and delta < 1e-10:
            result.ok("pooled.effect matches pooled.pooled")
        else:
            result.fail(f"pooled.effect mismatch vs pooled.pooled: {delta}")

        if schema.get("hasHetI2") and schema.get("hasHetTau2"):
            result.ok("Heterogeneity compatibility fields present")
        else:
            result.fail(f"Heterogeneity compatibility missing: {schema}")

        export_errors = driver.execute_script(
            """
            const out = {};
            try { exportAllFormats(); out.exportAllFormats = null; } catch(e) { out.exportAllFormats = e.message || String(e); }
            try { exportPublicationTables(); out.exportPublicationTables = null; } catch(e) { out.exportPublicationTables = e.message || String(e); }
            try { downloadTablesCSV(); out.downloadTablesCSV = null; } catch(e) { out.downloadTablesCSV = e.message || String(e); }
            try { exportResults('csv'); out.exportResultsCsv = null; } catch(e) { out.exportResultsCsv = e.message || String(e); }
            return out;
            """
        )

        for key, err in export_errors.items():
            if err is None:
                result.ok(f"{key} executes without runtime error")
            else:
                result.fail(f"{key} runtime error: {err}")

        csv_checks = {
            "inj": driver.execute_script("return escapeCSV(arguments[0]);", "=1+1"),
            "quote": driver.execute_script("return escapeCSV(arguments[0]);", 'a,b"c'),
            "newline": driver.execute_script("return escapeCSV(arguments[0]);", "x\ny"),
            "row": driver.execute_script("return buildCSVRow(arguments[0]);", ["=2+3", "a,b"]),
        }

        if isinstance(csv_checks.get("inj"), str) and csv_checks["inj"].startswith("'"):
            result.ok("escapeCSV prefixes formula-like input")
        else:
            result.fail(f"escapeCSV formula guard failed: {csv_checks.get('inj')!r}")

        quote_val = csv_checks.get("quote", "")
        if isinstance(quote_val, str) and quote_val.startswith('"') and quote_val.endswith('"'):
            result.ok("escapeCSV wraps comma/quote content")
        else:
            result.fail(f"escapeCSV quote wrapping failed: {quote_val!r}")

        xss = driver.execute_script(
            """
            if (typeof displayFragilityResults !== 'function') {
              return { available: false };
            }
            try {
              const payload = {
                fragilities: [{ study: '<img src=x onerror=1>', n: 10, events: 3, fragility: 2 }],
                mostFragileStudy: { study: '<img src=x onerror=1>' },
                overallFragility: 2,
                isSignificant: true
              };
              displayFragilityResults(payload);
              const overlays = Array.from(document.querySelectorAll('.modal-overlay.active'));
              const modal = overlays.length ? overlays[overlays.length - 1] : null;
              const html = modal ? modal.innerHTML : '';
              if (modal && modal.remove) modal.remove();
              return {
                available: true,
                raw: html.includes('<img src=x onerror=1>'),
                escaped: html.includes('&lt;img src=x onerror=1&gt;')
              };
            } catch (e) {
              return { available: true, error: e.message || String(e) };
            }
            """
        )

        if not xss.get("available"):
            result.fail("displayFragilityResults not available for XSS regression check")
        elif xss.get("error"):
            result.fail(f"displayFragilityResults check failed: {xss['error']}")
        elif xss.get("raw"):
            result.fail("Fragility modal contains raw unescaped payload")
        elif xss.get("escaped"):
            result.ok("Fragility modal escapes malicious study name")
        else:
            result.fail("Fragility modal did not contain expected escaped payload")

        # ---- IPD Integrity Gate override + report shape ----
        gate_override = driver.execute_script(
            """
            return {
              hasRunDataGuardian: typeof runDataGuardian === 'function',
              hasRunIPDIntegrityGate: typeof runIPDIntegrityGate === 'function',
              overrideInstalled: (typeof runDataGuardian === 'function'
                                  && typeof runIPDIntegrityGate === 'function'
                                  && runDataGuardian === runIPDIntegrityGate)
            };
            """
        )
        if gate_override.get("overrideInstalled"):
            result.ok("runDataGuardian is overridden by runIPDIntegrityGate")
        elif gate_override.get("hasRunIPDIntegrityGate"):
            result.fail("runIPDIntegrityGate exists but override not installed")
        else:
            result.fail(f"Integrity gate override missing: {gate_override}")

        # Run the gate on the already-loaded survival example data
        gate_report = driver.execute_script(
            """
            try {
              var report = runIPDIntegrityGate();
              if (!report) return { error: 'null report' };
              return {
                pass: report.pass,
                blockerCount: (report.blockers || []).length,
                warningCount: (report.warnings || []).length,
                qualityScore: report.qualityScore,
                hasIntegrityExtras: !!report.integrityExtras,
                hasOutliers: !!(report.integrityExtras && report.integrityExtras.outliers),
                hasDuplicates: !!(report.integrityExtras && report.integrityExtras.duplicates),
                hasBalance: !!(report.integrityExtras && report.integrityExtras.balance),
                hasChronology: !!(report.integrityExtras && report.integrityExtras.chronology),
                storedOnApp: APP.lastIntegrityReport === report,
                storedOnAppQC: APP.lastStrictQCReport === report,
                badgeText: (document.getElementById('qualityBadge') || {}).textContent || '',
                confirmatory: (document.getElementById('guardianConfirmatoryStatus') || {}).textContent || ''
              };
            } catch (e) {
              return { error: e.message || String(e) };
            }
            """
        )
        if gate_report.get("error"):
            result.fail(f"runIPDIntegrityGate threw: {gate_report['error']}")
        else:
            if gate_report.get("hasIntegrityExtras"):
                result.ok("Integrity report contains integrityExtras (outliers, duplicates, balance, chronology)")
            else:
                result.fail(f"integrityExtras missing from report: {gate_report}")

            if gate_report.get("storedOnApp") and gate_report.get("storedOnAppQC"):
                result.ok("Report stored on both APP.lastIntegrityReport and APP.lastStrictQCReport")
            else:
                result.fail(f"Report storage check failed: {gate_report}")

            badge = gate_report.get("badgeText", "")
            confirm = gate_report.get("confirmatory", "")
            if badge in ("PASS", "WARN", "FAIL") and confirm in ("PASS", "FAIL"):
                result.ok(f"DOM stat boxes updated (badge={badge}, confirmatory={confirm})")
            else:
                result.fail(f"DOM stat boxes not updated: badge={badge!r}, confirmatory={confirm!r}")

            score = gate_report.get("qualityScore")
            if isinstance(score, (int, float)) and 0 <= score <= 100:
                result.ok(f"Quality score is valid: {score}")
            else:
                result.fail(f"Quality score out of range: {score}")

        # ---- WebR Validation UI checks ----
        webr_ui = driver.execute_script(
            """
            return {
              hasContainer: !!document.getElementById('webrValidationContainer'),
              hasBtnCurrent: !!document.getElementById('webrBtnCurrent'),
              hasBtnReference: !!document.getElementById('webrBtnRef'),
              hasProgressContainer: !!document.getElementById('webrProgressContainer'),
              hasResultsDiv: !!document.getElementById('webrResults'),
              hasBadge: !!document.getElementById('webrBadge'),
              btnCurrentDisabled: (document.getElementById('webrBtnCurrent') || {}).disabled,
              scenarioCount: (typeof getWebRScenarioCount === 'function') ? getWebRScenarioCount() : -1,
              hasRunFn: typeof runWebRValidation === 'function',
              hasGenFn: typeof generateRScript === 'function',
              hasCopyFn: typeof copyRScript === 'function'
            };
            """
        )

        if webr_ui.get("hasContainer") and webr_ui.get("hasBtnCurrent") and webr_ui.get("hasBtnReference"):
            result.ok("WebR validation UI elements present (container, buttons)")
        else:
            result.fail(f"WebR UI elements missing: {webr_ui}")

        if webr_ui.get("btnCurrentDisabled"):
            result.ok("'Validate Current Analysis' button correctly disabled when no data loaded")
        else:
            result.fail("'Validate Current Analysis' button should be disabled before data load")

        sc_count = webr_ui.get("scenarioCount", -1)
        if sc_count >= 6:
            result.ok(f"WEBR_SCENARIOS registry has {sc_count} scenarios")
        else:
            result.fail(f"WEBR_SCENARIOS count too low: {sc_count}")

        if webr_ui.get("hasRunFn") and webr_ui.get("hasGenFn") and webr_ui.get("hasCopyFn"):
            result.ok("WebR global functions exposed (runWebRValidation, generateRScript, copyRScript)")
        else:
            result.fail(f"WebR functions missing: {webr_ui}")

        # Verify R script generation works without data
        script_check = driver.execute_script(
            """
            try {
              var s = generateRScript();
              return {
                length: s.length,
                hasMetafor: s.indexOf('library(metafor)') >= 0,
                hasBCG: s.indexOf('BCG') >= 0 || s.indexOf('bcg') >= 0,
                hasLevel: s.indexOf('level=') >= 0
              };
            } catch(e) { return { error: e.message }; }
            """
        )
        if script_check.get("error"):
            result.fail(f"generateRScript() threw: {script_check['error']}")
        elif script_check.get("hasMetafor") and script_check.get("hasBCG") and script_check.get("hasLevel"):
            result.ok(f"generateRScript() produces valid output ({script_check['length']} chars)")
        else:
            result.fail(f"generateRScript() output incomplete: {script_check}")

    finally:
        if driver:
            driver.quit()
        if profile_dir:
            shutil.rmtree(profile_dir, ignore_errors=True)


def main() -> int:
    print("=" * 70)
    print("IPD Meta-Analysis Pro - Regression Fixed Paths Test")
    print("=" * 70)

    script_path = Path(__file__).resolve()
    repo_root = script_path.parents[2]
    app_path = repo_root / "ipd-meta-pro.html"
    module_path = repo_root / "dev" / "modules" / "export_schema_module.js"
    head_path = repo_root / "dev" / "modules" / "00_head.html"
    service_worker_path = repo_root / "dev" / "modules" / "02_19_service-worker.js"
    trailer_path = repo_root / "dev" / "modules" / "03_body_html.html"
    confidence_path = repo_root / "dev" / "modules" / "02_22a_method-confidence-ui.js"
    webr_validation_path = repo_root / "dev" / "modules" / "02_21b_webr-validation.js"

    if not app_path.exists():
        print(f"[FAIL] App file not found: {app_path}")
        return 1
    if not module_path.exists():
        print(f"[FAIL] Module file not found: {module_path}")
        return 1
    if not head_path.exists():
        print(f"[FAIL] Head module not found: {head_path}")
        return 1
    if not service_worker_path.exists():
        print(f"[FAIL] Service worker module not found: {service_worker_path}")
        return 1
    if not trailer_path.exists():
        print(f"[FAIL] Trailer module not found: {trailer_path}")
        return 1
    if not confidence_path.exists():
        print(f"[FAIL] Method confidence module not found: {confidence_path}")
        return 1
    if not webr_validation_path.exists():
        print(f"[FAIL] WebR validation module not found: {webr_validation_path}")
        return 1

    result = CheckResult()
    run_static_checks(result, app_path, module_path, head_path, service_worker_path, trailer_path, confidence_path, webr_validation_path)
    run_browser_checks(result, app_path)

    print("\n" + "=" * 70)
    print("REGRESSION SUMMARY")
    print("=" * 70)
    print(f"Passed: {len(result.passed)}")
    print(f"Failed: {len(result.failed)}")

    if result.failed:
        print("\nFailed checks:")
        for msg in result.failed:
            print(f" - {msg}")
        return 1

    print("\nAll regression checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
