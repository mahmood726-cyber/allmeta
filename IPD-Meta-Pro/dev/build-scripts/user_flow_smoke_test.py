#!/usr/bin/env python3
"""Focused end-to-end smoke test for core IPD Meta-Analysis Pro user flows."""

from __future__ import annotations

import json
import shutil
import sys
import time
from pathlib import Path

from selenium.webdriver.common.by import By
from selenium_test import IPDMetaProTester


if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


ARTIFACT_PATH = Path(__file__).resolve().parents[1] / "benchmarks" / "latest_user_flow_smoke_test.json"


def _panel_visible(tester: IPDMetaProTester, panel_name: str) -> bool:
    tester.execute_js(
        f"""
        var tab = document.querySelector('.nav-tab[data-panel="{panel_name}"]');
        if (tab) tab.click();
        """
    )
    time.sleep(0.6)
    panel = tester.driver.find_element(By.ID, f"panel-{panel_name}")
    return panel.is_displayed()


def _capture_csv_download(tester: IPDMetaProTester) -> dict:
    return tester.execute_js(
        """
        try {
            window.__smokeDownloads = [];
            if (!window.__downloadCaptureInstalled) {
                window.__downloadCaptureInstalled = true;
                window.__origAnchorClick = HTMLAnchorElement.prototype.click;
                HTMLAnchorElement.prototype.click = function() {
                    window.__smokeDownloads.push({
                        download: this.download || '',
                        href: this.href || ''
                    });
                    return window.__origAnchorClick.apply(this, arguments);
                };
            }
            if (typeof downloadTablesCSV !== 'function') {
                return { ok: false, error: 'downloadTablesCSV missing', downloads: window.__smokeDownloads };
            }
            downloadTablesCSV();
            return { ok: true, downloads: window.__smokeDownloads };
        } catch (e) {
            return { ok: false, error: e.message || String(e), downloads: window.__smokeDownloads || [] };
        }
        """,
        "capture CSV download",
    )


def _run_analysis_smoke(tester: IPDMetaProTester) -> None:
    invoked = tester.execute_js(
        "if (typeof runAnalysis === 'function') { runAnalysis(); return true; } return false;",
        "invoke runAnalysis for smoke suite",
    )
    if not invoked:
        tester.log_fail("Smoke flow could not invoke runAnalysis()")
        return

    for _ in range(2):
        time.sleep(4)
        state = tester.execute_js(
            """
            const pooled = APP && APP.results && APP.results.pooled;
            const effect = pooled && Number.isFinite(pooled.effect) ? pooled.effect
                : (pooled && Number.isFinite(pooled.pooled) ? pooled.pooled : null);
            return {
                hasResults: !!(APP && APP.results),
                hasPooled: !!pooled,
                effect: effect,
                studyCount: APP && APP.results && APP.results.studies ? APP.results.studies.length : 0
            };
            """,
            "inspect smoke analysis state",
        )
        if isinstance(state, dict) and state.get("hasResults") and state.get("hasPooled"):
            tester.log_pass(
                f"Smoke flow produced pooled analysis output (k={state.get('studyCount', 0)}, effect={state.get('effect')})"
            )
            return
        tester.execute_js(
            "if (typeof runAnalysis === 'function') { runAnalysis(); }",
            "retry runAnalysis for smoke suite",
        )

    tester.log_fail(f"Smoke flow did not produce analysis output: {state}")


def _write_artifact(tester: IPDMetaProTester) -> None:
    artifact = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "FAIL" if tester.results["failed"] else "PASS",
        "passed": tester.results["passed"],
        "failed": tester.results["failed"],
        "warnings": tester.results["warnings"],
    }
    ARTIFACT_PATH.parent.mkdir(parents=True, exist_ok=True)
    ARTIFACT_PATH.write_text(json.dumps(artifact, indent=2), encoding="utf-8")


def main() -> int:
    tester = IPDMetaProTester()
    try:
        if not tester.setup():
            tester.log_fail("Browser setup failed")
            return 1
        if not tester.load_app():
            tester.log_fail("App failed to load")
            return 1

        tester.test_load_example_data("binary")
        _run_analysis_smoke(tester)

        for panel in ("results", "guardian"):
            try:
                if _panel_visible(tester, panel):
                    tester.log_pass(f"Smoke flow switched to '{panel}' panel")
                else:
                    tester.log_fail(f"Smoke flow could not display '{panel}' panel")
            except Exception as exc:
                tester.log_fail(f"Smoke flow panel switch failed for '{panel}': {exc}")

        tester.test_help_modal()
        tester.test_export_functionality()

        download_state = _capture_csv_download(tester)
        if isinstance(download_state, dict) and download_state.get("ok"):
            downloads = download_state.get("downloads") or []
            expected = any(
                (item.get("download") or "") == "ipd_meta_analysis_tables.csv"
                for item in downloads
                if isinstance(item, dict)
            )
            if expected:
                tester.log_pass("Smoke flow captured CSV export download")
            else:
                tester.log_fail(f"Smoke flow did not capture expected CSV export: {downloads}")
        else:
            tester.log_fail(
                f"Smoke flow CSV export failed: {download_state.get('error') if isinstance(download_state, dict) else download_state}"
            )

        failed = tester.print_summary()
        return 1 if failed else 0
    except Exception as exc:
        tester.log_fail(f"Unhandled smoke test exception: {exc}")
        tester.print_summary()
        return 1
    finally:
        _write_artifact(tester)
        if tester.driver:
            tester.driver.quit()
            tester.driver = None
        if tester._profile_dir:
            shutil.rmtree(tester._profile_dir, ignore_errors=True)
            tester._profile_dir = None


if __name__ == "__main__":
    raise SystemExit(main())
