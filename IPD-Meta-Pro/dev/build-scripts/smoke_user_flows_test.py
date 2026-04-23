# sentinel:skip-file — hardcoded paths are fixture/registry/audit-narrative data for this repo's research workflow, not portable application configuration. Same pattern as push_all_repos.py and E156 workbook files.
﻿#!/usr/bin/env python3
"""Focused smoke E2E checks for the primary IPD Meta-Analysis Pro user flows."""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

from selenium.common.exceptions import SessionNotCreatedException, TimeoutException, WebDriverException
from selenium.webdriver.common.by import By
from selenium.webdriver.edge.options import Options
from selenium.webdriver.support.ui import WebDriverWait

from edge_webdriver import create_edge_driver, load_local_app_with_ready_check


if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


_NON_ACTIONABLE_BROWSER_LOG_MARKERS = (
    "assets.msn.com",
    "service/msn/user",
    "c.msn.com/c.gif",
    "favicon.ico",
)


def _cleanup_stale_webdriver() -> None:
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
        pass


def _build_options(profile_dir: str) -> Options:
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--no-first-run")
    options.add_argument("--no-default-browser-check")
    options.add_argument(f"--user-data-dir={profile_dir}")
    options.set_capability("goog:loggingPrefs", {"browser": "ALL"})
    return options


def _create_driver(max_attempts: int = 3):
    last_exc = None
    for attempt in range(1, max_attempts + 1):
        profile_dir = tempfile.mkdtemp(prefix="ipdmp_smoke_")
        try:
            driver = create_edge_driver(_build_options(profile_dir))
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
                print(f"[WARN] Browser startup attempt {attempt} failed: {message.splitlines()[0]}")
                _cleanup_stale_webdriver()
                time.sleep(1.5 * attempt)
                continue
            raise

    if last_exc is not None:
        raise last_exc
    raise RuntimeError("Unable to create Edge webdriver")


def _is_non_actionable_browser_log(message: str) -> bool:
    return any(marker in message for marker in _NON_ACTIONABLE_BROWSER_LOG_MARKERS)


class SmokeRunner:
    def __init__(self) -> None:
        self.repo_root = Path(__file__).resolve().parents[2]
        self.app_path = self.repo_root / "ipd-meta-pro.html"
        self.output_dir = self.repo_root / "output" / "playwright"
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.summary_path = self.output_dir / "latest_smoke_user_flows.json"
        self.screenshot_path = self.output_dir / "latest_smoke_user_flows.png"
        self.driver = None
        self.profile_dir = None
        self.wait = None
        self.summary: dict[str, object] = {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "appPath": str(self.app_path),
            "steps": [],
        }

    def record_step(self, name: str, ok: bool, detail: str = "") -> None:
        status = "PASS" if ok else "FAIL"
        print(f"[{status}] {name}{': ' + detail if detail else ''}")
        self.summary["steps"].append({"name": name, "pass": ok, "detail": detail})

    def setup(self) -> None:
        _cleanup_stale_webdriver()
        self.driver, self.profile_dir = _create_driver()
        self.driver.set_window_size(1440, 1024)
        self.wait = WebDriverWait(self.driver, 30)

    def teardown(self) -> None:
        if self.driver is not None:
            try:
                self.driver.save_screenshot(str(self.screenshot_path))
            except Exception:
                pass
            try:
                self.driver.quit()
            except Exception:
                pass
        if self.profile_dir:
            shutil.rmtree(self.profile_dir, ignore_errors=True)
        self.summary_path.write_text(json.dumps(self.summary, indent=2), encoding="utf-8")

    def execute_js(self, script: str):
        return self.driver.execute_script(script)

    def wait_for(self, description: str, script: str, timeout: int = 30):
        try:
            WebDriverWait(self.driver, timeout).until(lambda d: d.execute_script(script))
        except TimeoutException as exc:
            raise RuntimeError(f"Timed out waiting for {description}") from exc

    def click_css(self, selector: str) -> None:
        element = self.wait.until(lambda d: d.find_element(By.CSS_SELECTOR, selector))
        element.click()

    def click_xpath(self, selector: str) -> None:
        element = self.wait.until(lambda d: d.find_element(By.XPATH, selector))
        element.click()

    def install_download_probe(self) -> None:
        self.execute_js(
            """
            window.__smokeDownloads = [];
            if (!window.__smokeDownloadProbeInstalled) {
              window.__smokeDownloadProbeInstalled = true;
              const originalCreateObjectURL = URL.createObjectURL.bind(URL);
              URL.createObjectURL = function(blob) {
                const url = originalCreateObjectURL(blob);
                window.__smokeDownloads.push({
                  kind: 'blob',
                  url: url,
                  type: blob ? blob.type : null,
                  size: blob ? blob.size : null
                });
                return url;
              };
              HTMLAnchorElement.prototype.click = function() {
                window.__smokeDownloads.push({
                  kind: 'anchor',
                  download: this.download || null,
                  href: this.href || null
                });
              };
            }
            """
        )

    def run(self) -> int:
        print("=" * 68)
        print("IPD Meta-Analysis Pro - Smoke User Flows")
        print("=" * 68)

        try:
            self.setup()
            load_local_app_with_ready_check(
                self.driver,
                self.app_path,
                required_functions=("loadExampleData", "runAnalysis", "switchPanel"),
                required_objects=("APP", "MetaAnalysis", "Stats", "Plots"),
                ready_timeout=20,
            )
            self.wait_for("enhanced export button", "return !!document.getElementById('enhancedExportBtn');", timeout=10)
            self.install_download_probe()
            self.summary["buildId"] = self.execute_js("return APP && APP.buildId ? APP.buildId : null;")
            self.record_step("App bootstrap", True, f"buildId={self.summary['buildId']}")

            self.click_css("button[onclick=\"loadExampleData('survival')\"]")
            self.wait_for(
                "survival example data",
                "return Array.isArray(APP.data) && APP.data.length > 0 && APP.config && APP.config.outcomeType === 'survival';",
            )
            rows = self.execute_js("return APP.data.length;")
            self.summary["datasetRows"] = rows
            self.record_step("Load survival example", True, f"rows={rows}")

            self.click_css("button[onclick=\"runAnalysis()\"]")
            self.wait_for(
                "analysis results",
                "return APP.results && APP.results.pooled && Number.isFinite(APP.results.pooled.effect) && document.querySelector('#panel-results.active');",
                timeout=45,
            )
            pooled_text = self.execute_js("return document.getElementById('pooledEffect').textContent.trim();")
            self.summary["pooledEffectLabel"] = pooled_text
            self.record_step("Run analysis", True, f"pooled={pooled_text}")

            self.click_css(".nav-tab[data-panel='data']")
            self.wait_for("data panel", "return !!document.querySelector('#panel-data.active');")
            self.click_css(".nav-tab[data-panel='results']")
            self.wait_for("results panel", "return !!document.querySelector('#panel-results.active');")
            self.record_step("Switch panels", True)

            self.click_css("#helpDropdown .dropdown-toggle")
            self.click_css("#helpDropdown .dropdown-item[onclick=\"HelpSystem.showAbout()\"]")
            self.wait_for(
                "help modal",
                "return !!document.querySelector('.modal-overlay.active .modal-title');",
            )
            modal_title = self.execute_js("var el = document.querySelector('.modal-overlay.active .modal-title'); return el ? el.textContent.trim() : '';")
            self.record_step("Open help/about modal", True, modal_title)
            close_buttons = self.driver.find_elements(By.CSS_SELECTOR, ".modal-overlay.active .modal-close")
            if close_buttons:
                close_buttons[0].click()
                self.wait_for("modal close", "return !document.querySelector('.modal-overlay.active');")

            self.click_css("#enhancedExportBtn")
            self.wait_for(
                "export modal",
                "var title = document.querySelector('.modal-overlay.active .modal-title'); return !!title && title.textContent.indexOf('Export Options') >= 0;",
            )
            self.click_xpath("//div[contains(@class,'modal-overlay') and contains(@class,'active')]//button[normalize-space()='Results CSV']")
            self.wait_for("captured export event", "return window.__smokeDownloads && window.__smokeDownloads.length > 0;")
            download_info = self.execute_js("return window.__smokeDownloads;")
            self.summary["downloads"] = download_info
            self.record_step("Open export modal and trigger CSV export", True, json.dumps(download_info[-2:]))

            severe_logs = [
                log
                for log in self.driver.get_log("browser")
                if log.get("level") == "SEVERE"
                and not _is_non_actionable_browser_log(log.get("message", ""))
            ]
            self.summary["browserErrors"] = severe_logs
            if severe_logs:
                self.record_step("Browser console", False, severe_logs[0].get("message", ""))
                return 1

            self.record_step("Browser console", True)
            return 0
        except Exception as exc:
            self.record_step("Smoke user flows", False, str(exc))
            return 1
        finally:
            self.teardown()


def main() -> int:
    runner = SmokeRunner()
    return runner.run()


if __name__ == "__main__":
    raise SystemExit(main())
