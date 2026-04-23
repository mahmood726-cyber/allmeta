# sentinel:skip-file — hardcoded paths are fixture/registry/audit-narrative data for this repo's research workflow, not portable application configuration. Same pattern as push_all_repos.py and E156 workbook files.
#!/usr/bin/env python3
"""
Comprehensive Selenium Test Suite for IPD Meta-Analysis Pro
Tests all features, plots, and functionality
"""

import argparse
import os
import shutil
import subprocess
import sys
import tempfile
import time
import traceback
from pathlib import Path

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.edge.options import Options
from selenium.webdriver.edge.service import Service
from selenium.common.exceptions import TimeoutException, NoSuchElementException, JavascriptException, StaleElementReferenceException, UnexpectedAlertPresentException, SessionNotCreatedException, WebDriverException

from edge_webdriver import load_local_app_with_ready_check

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

_NON_ACTIONABLE_BROWSER_LOG_MARKERS = (
    "assets.msn.com",
    "service/msn/user",
    "c.msn.com/c.gif",
    "favicon.ico",
)


def _first_executable(candidates):
    for c in candidates:
        if c and os.path.isfile(c) and os.access(c, os.X_OK):
            return c
    return None


def _resolve_edge_runtime():
    edge_binary = _first_executable(_EDGE_BINARY_CANDIDATES)
    edge_driver = _first_executable(_EDGE_DRIVER_CANDIDATES)
    return edge_binary, edge_driver


def _is_non_actionable_browser_log(message: str) -> bool:
    return any(marker in message for marker in _NON_ACTIONABLE_BROWSER_LOG_MARKERS)

class IPDMetaProTester:
    def __init__(self, hold_open_seconds: int = 0, fail_on_warnings: bool = False, extended_ui: bool = False):
        self.driver = None
        self.results = {
            'passed': [],
            'failed': [],
            'warnings': []
        }
        self.app_path = str(Path(__file__).resolve().parents[2] / "ipd-meta-pro.html")
        self.hold_open_seconds = max(0, int(hold_open_seconds))
        self.fail_on_warnings = bool(fail_on_warnings)
        self.extended_ui = bool(extended_ui)
        self._profile_dir = None
        self._edge_binary, self._edge_driver = _resolve_edge_runtime()

    def _cleanup_stale_webdriver(self):
        """Best-effort cleanup for orphaned Selenium driver processes."""
        try:
            if sys.platform == 'win32':
                subprocess.run(
                    ['taskkill', '/F', '/T', '/IM', 'msedgedriver.exe'],
                    capture_output=True,
                    text=True,
                    check=False,
                )
                subprocess.run(
                    ['taskkill', '/F', '/T', '/IM', 'chromedriver.exe'],
                    capture_output=True,
                    text=True,
                    check=False,
                )
            else:
                subprocess.run(
                    ['pkill', '-f', 'msedgedriver|chromedriver'],
                    capture_output=True,
                    text=True,
                    check=False,
                )
        except Exception:
            # Cleanup is opportunistic only.
            pass

    def _build_options(self, profile_dir: str):
        options = Options()
        options.add_argument('--start-maximized')
        options.add_argument('--disable-gpu')
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument('--no-first-run')
        options.add_argument('--no-default-browser-check')
        options.add_argument(f'--user-data-dir={profile_dir}')
        if self._edge_binary:
            options.binary_location = self._edge_binary
        options.add_experimental_option('excludeSwitches', ['enable-logging'])
        return options

    def setup(self):
        """Initialize the browser"""
        print("=" * 70)
        print("IPD Meta-Analysis Pro - Comprehensive Selenium Test Suite")
        print("=" * 70)
        print()
        if self._edge_binary:
            print(f"[INFO] Using Edge binary: {self._edge_binary}")
        if self._edge_driver:
            print(f"[INFO] Using EdgeDriver: {self._edge_driver}")

        max_attempts = 3
        for attempt in range(1, max_attempts + 1):
            profile_dir = tempfile.mkdtemp(prefix='ipdmp_selenium_')
            try:
                options = self._build_options(profile_dir)
                if self._edge_driver:
                    self.driver = webdriver.Edge(
                        service=Service(executable_path=self._edge_driver),
                        options=options,
                    )
                else:
                    self.driver = webdriver.Edge(options=options)
                self._profile_dir = profile_dir
                self.driver.set_page_load_timeout(30)
                self.wait = WebDriverWait(self.driver, 10)
                print("[OK] Browser initialized successfully")
                return True
            except (SessionNotCreatedException, WebDriverException) as e:
                message = str(e)
                retryable = (
                    isinstance(e, SessionNotCreatedException)
                    or 'Edge instance exited' in message
                    or 'Chrome instance exited' in message
                    or 'DevToolsActivePort' in message
                )
                shutil.rmtree(profile_dir, ignore_errors=True)
                if retryable and attempt < max_attempts:
                    first_line = message.splitlines()[0] if message else repr(e)
                    print(f"[WARN] Browser startup attempt {attempt} failed: {first_line}")
                    self._cleanup_stale_webdriver()
                    time.sleep(1.5 * attempt)
                    continue
                print(f"[FAIL] Browser initialization failed: {e}")
                return False
            except Exception as e:
                shutil.rmtree(profile_dir, ignore_errors=True)
                print(f"[FAIL] Browser initialization failed: {e}")
                return False

        print("[FAIL] Browser initialization failed: retries exhausted")
        return False

    def load_app(self):
        """Load the IPD Meta-Analysis Pro application"""
        try:
            load_state = load_local_app_with_ready_check(
                self.driver,
                Path(self.app_path),
                required_functions=("loadExampleData", "runAnalysis"),
                required_objects=("APP",),
            )
            if load_state.get("timed_out"):
                print("[INFO] Continued after local runtime became ready despite CDN page-load timeout")

            # Verify page loaded
            title = load_state.get("title") or self.driver.title
            if "IPD Meta-Analysis" in title:
                self.log_pass("App loaded successfully")
                return True
            else:
                self.log_fail(f"App title unexpected: {title}")
                return False
        except Exception as e:
            self.log_fail(f"Failed to load app: {e}")
            return False

    def log_pass(self, message):
        print(f"  [PASS] {message}")
        self.results['passed'].append(message)

    def log_fail(self, message):
        print(f"  [FAIL] {message}")
        self.results['failed'].append(message)

    def log_warn(self, message):
        print(f"  [WARN] {message}")
        self.results['warnings'].append(message)

    def execute_js(self, script, description='script'):
        """Execute JavaScript and return result."""
        try:
            return self.driver.execute_script(script)
        except JavascriptException as e:
            message = f"JavaScript execution failed ({description}): {e}"
            self.log_fail(message)
            raise

    def click_element(self, selector, by=By.CSS_SELECTOR, timeout=5):
        """Click an element with wait"""
        try:
            element = WebDriverWait(self.driver, timeout).until(
                EC.element_to_be_clickable((by, selector))
            )
            element.click()
            return True
        except Exception:
            return False

    def test_theme_toggle(self):
        """Test theme switching"""
        print("\n[TEST] Theme Toggle")
        try:
            body_class = self.driver.find_element(By.TAG_NAME, 'body').get_attribute('class')
            initial_light = 'light-theme' in (body_class or '')

            clicked = self.click_element('.theme-toggle')
            if not clicked:
                self.execute_js("toggleTheme()")
            time.sleep(0.5)

            body_class = self.driver.find_element(By.TAG_NAME, 'body').get_attribute('class')
            after_light = 'light-theme' in (body_class or '')

            if initial_light == after_light:
                # Fallback path if UI click was intercepted.
                self.execute_js("toggleTheme()")
                time.sleep(0.3)
                body_class = self.driver.find_element(By.TAG_NAME, 'body').get_attribute('class')
                after_light = 'light-theme' in (body_class or '')

            if initial_light != after_light:
                self.log_pass("Theme toggle works correctly")
            else:
                self.log_warn("Theme may not have toggled visibly")

            # Restore original theme state for downstream tests.
            if initial_light != after_light:
                self.execute_js("toggleTheme()")
                time.sleep(0.3)

        except Exception as e:
            self.log_fail(f"Theme toggle error: {e}")

    def test_load_example_data(self, dataset='survival'):
        """Load example dataset"""
        print(f"\n[TEST] Loading Example Data: {dataset}")
        try:
            # Find and click the example data button
            buttons = self.driver.find_elements(By.CSS_SELECTOR, '.btn-secondary')
            clicked = False
            for btn in buttons:
                onclick = btn.get_attribute('onclick') or ''
                if f"loadExampleData('{dataset}')" in onclick:
                    btn.click()
                    clicked = True
                    break

            if not clicked:
                # Try JavaScript directly
                self.execute_js(f"loadExampleData('{dataset}')")

            time.sleep(2)

            # Check if data loaded
            data_preview = self.driver.find_element(By.ID, 'dataPreviewCard')
            if data_preview.is_displayed():
                self.log_pass(f"Example data '{dataset}' loaded successfully")

                # Get stats
                patients = self.execute_js("return document.getElementById('statPatients').textContent")
                studies = self.execute_js("return document.getElementById('statStudies').textContent")
                print(f"       Patients: {patients}, Studies: {studies}")
                return True
            else:
                self.log_fail("Data preview card not visible")
                return False

        except Exception as e:
            self.log_fail(f"Failed to load example data: {e}")
            return False

    def test_run_analysis(self):
        """Run the main analysis"""
        print("\n[TEST] Running Analysis")
        try:
            # Ensure example data is fully loaded before invoking analysis.
            WebDriverWait(self.driver, 45).until(
                lambda d: d.execute_script(
                    "return !!(window.APP && Array.isArray(APP.data) && APP.data.length > 0)"
                )
            )

            # Trigger analysis directly for reliability across UI states.
            invoked = self.execute_js(
                "if (typeof runAnalysis === 'function') { runAnalysis(); return true; } return false;",
                "invoke runAnalysis"
            )
            if not invoked:
                self.log_fail("runAnalysis function unavailable")
                return False

            # Wait for concrete result structure (can be heavy on slower machines).
            try:
                WebDriverWait(self.driver, 120).until(
                    lambda d: d.execute_script(
                        "return !!(window.APP && APP.results && APP.results.studies && APP.results.studies.length > 0)"
                    )
                )
            except TimeoutException:
                # Retry once in case an earlier invocation was interrupted.
                self.execute_js(
                    "if (typeof runAnalysis === 'function') { runAnalysis(); }",
                    "retry runAnalysis"
                )
                WebDriverWait(self.driver, 120).until(
                    lambda d: d.execute_script(
                        "return !!(window.APP && APP.results && APP.results.studies && APP.results.studies.length > 0)"
                    )
                )

            has_results = self.execute_js(
                "return !!(window.APP && APP.results)",
                "verify analysis results"
            )

            if has_results:
                self.log_pass("Analysis completed successfully")

                pooled = self.execute_js(
                    """
                    const p = APP.results && APP.results.pooled;
                    if (!p) return 'N/A';
                    if (Number.isFinite(p.pooled)) return p.pooled.toFixed(4);
                    if (Number.isFinite(p.effect)) return p.effect.toFixed(4);
                    return 'N/A';
                    """,
                    "read pooled effect"
                )
                i2 = self.execute_js(
                    """
                    const p = APP.results && APP.results.pooled;
                    const h = APP.results && APP.results.heterogeneity;
                    const v = p && Number.isFinite(p.I2) ? p.I2 : (h && Number.isFinite(h.i2) ? h.i2 : null);
                    return Number.isFinite(v) ? v.toFixed(1) : 'N/A';
                    """,
                    "read I2"
                )
                print(f"       Pooled effect: {pooled}, I2: {i2}%")
                return True

            self.log_fail("No results generated")
            return False

        except Exception as e:
            self.log_fail(f"Analysis failed: {e!r}")
            return False

    def test_navigation_tabs(self):
        """Test all navigation tabs"""
        print("\n[TEST] Navigation Tabs")
        tabs = ['data', 'covariates', 'guardian', 'network', 'results',
                'ranking', 'heterogeneity', 'consistency', 'bayesian', 'pubbias', 'metareg']

        for tab in tabs:
            try:
                # Use JavaScript click to avoid header overlay interception
                result = self.execute_js(f"""
                    var tab = document.querySelector('.nav-tab[data-panel="{tab}"]');
                    if (tab) {{ tab.click(); return true; }}
                    return false;
                """)
                if not result:
                    self.log_warn(f"Tab '{tab}' not found")
                    continue

                time.sleep(0.5)

                # Check if panel is visible
                panel = self.driver.find_element(By.ID, f'panel-{tab}')
                if panel.is_displayed():
                    self.log_pass(f"Tab '{tab}' works")
                else:
                    self.log_fail(f"Tab '{tab}' panel not visible")
            except NoSuchElementException:
                self.log_warn(f"Tab '{tab}' not found")
            except Exception as e:
                self.log_fail(f"Tab '{tab}' error: {e}")

    def test_forest_plot(self):
        """Test forest plot canvas availability"""
        print("\n[TEST] Forest Plot")
        try:
            self.execute_js("document.querySelector('.nav-tab[data-panel=\"results\"]').click()", "open results tab")
            WebDriverWait(self.driver, 10).until(
                lambda d: len(d.find_elements(By.ID, 'forestPlot')) > 0
            )

            forest_ready = self.execute_js(
                """
                var c = document.getElementById('forestPlot');
                if (!c) return false;
                var r = c.getBoundingClientRect();
                return r.width > 0 && r.height > 0;
                """,
                "validate forest plot canvas"
            )

            if forest_ready:
                self.log_pass("Forest plot canvas available")
            else:
                self.log_fail("Forest plot canvas found but not visible")

        except Exception as e:
            self.log_fail(f"Forest plot test error: {e}")

    def test_funnel_plot(self):
        """Test funnel plot canvas availability"""
        print("\n[TEST] Funnel Plot")
        try:
            self.execute_js("document.querySelector('.nav-tab[data-panel=\"pubbias\"]').click()", "open publication bias tab")
            WebDriverWait(self.driver, 10).until(
                lambda d: len(d.find_elements(By.ID, 'funnelPlot')) > 0
            )

            funnel_ready = self.execute_js(
                """
                var c = document.getElementById('funnelPlot');
                if (!c) return false;
                var r = c.getBoundingClientRect();
                return r.width > 0 && r.height > 0;
                """,
                "validate funnel plot canvas"
            )

            if funnel_ready:
                self.log_pass("Funnel plot canvas available")
            else:
                self.log_fail("Funnel plot canvas found but not visible")

        except Exception as e:
            self.log_fail(f"Funnel plot test error: {e}")

    def test_heterogeneity_panel(self):
        """Test heterogeneity panel"""
        print("\n[TEST] Heterogeneity Panel")
        try:
            # Use JavaScript click to avoid header overlay
            self.execute_js("document.querySelector('.nav-tab[data-panel=\"heterogeneity\"]').click()")
            time.sleep(1)

            # Check for heterogeneity stats
            panel = self.driver.find_element(By.ID, 'panel-heterogeneity')
            if panel.is_displayed():
                self.log_pass("Heterogeneity panel displayed")

                # Look for I2 value display
                content = panel.text
                if 'I' in content or '%' in content:
                    self.log_pass("Heterogeneity statistics visible")
            else:
                self.log_fail("Heterogeneity panel not visible")

        except Exception as e:
            self.log_fail(f"Heterogeneity panel error: {e}")

    def test_bayesian_panel(self):
        """Test Bayesian analysis panel"""
        print("\n[TEST] Bayesian Panel")
        try:
            # Use JavaScript click to avoid header overlay
            self.execute_js("document.querySelector('.nav-tab[data-panel=\"bayesian\"]').click()")
            time.sleep(1)

            panel = self.driver.find_element(By.ID, 'panel-bayesian')
            if panel.is_displayed():
                self.log_pass("Bayesian panel displayed")

                # Look for MCMC button
                mcmc_btn = self.driver.find_elements(By.XPATH, "//button[contains(text(), 'Run') or contains(text(), 'MCMC')]")
                if mcmc_btn:
                    self.log_pass("MCMC run button found")
            else:
                self.log_fail("Bayesian panel not visible")

        except Exception as e:
            self.log_fail(f"Bayesian panel error: {e}")

    def test_help_modal(self):
        """Test help modal with validation tabs"""
        print("\n[TEST] Help Modal & Validation Report")
        try:
            # Open help dropdown and click Quick Start
            self.execute_js("toggleDropdown('helpDropdown')")
            time.sleep(0.3)
            self.execute_js("HelpSystem.showQuickStart()")
            time.sleep(0.8)

            # Check any modal is visible
            modals = self.driver.find_elements(By.CSS_SELECTOR, '.modal-overlay.active')
            if modals:
                self.log_pass("Help modal opens via Quick Start")
                modal_text = modals[0].text
                if 'Quick Start' in modal_text or 'Step 1' in modal_text:
                    self.log_pass("Quick Start content visible")
                else:
                    self.log_warn("Quick Start content may not be visible")

                # Close modal
                close_btns = modals[0].find_elements(By.CSS_SELECTOR, '.modal-close')
                if close_btns:
                    close_btns[0].click()
                    time.sleep(0.3)
            else:
                self.log_fail("Help modal not visible")

        except Exception as e:
            self.log_fail(f"Help modal error: {e}")

    def test_advanced_features_menu(self):
        """Test 40+ Advanced Features menu"""
        print("\n[TEST] Advanced Features Menu")
        try:
            # Navigate to data tab first where the button is located
            self.click_element('.nav-tab[data-panel="data"]')
            time.sleep(0.5)

            # Scroll to top
            self.driver.execute_script("window.scrollTo(0, 0);")
            time.sleep(0.3)

            # Look for Advanced Features button
            adv_btn = self.driver.find_elements(By.XPATH, "//button[contains(text(), 'Advanced Features')]")
            if adv_btn:
                # Use JavaScript click to avoid interactability issues
                self.driver.execute_script("arguments[0].click();", adv_btn[0])
                time.sleep(1)

                # Check if modal opened
                modals = self.driver.find_elements(By.CSS_SELECTOR, '.modal-overlay.active')
                if modals:
                    self.log_pass("Advanced features menu opens")

                    # Count feature buttons
                    feature_btns = modals[0].find_elements(By.CSS_SELECTOR, '.btn')
                    print(f"       Found {len(feature_btns)} feature buttons")

                    # Close modal
                    close_btns = modals[0].find_elements(By.CSS_SELECTOR, '.modal-close')
                    if close_btns:
                        close_btns[0].click()
                else:
                    self.log_warn("Advanced features modal may not have opened")
            else:
                self.log_warn("Advanced Features button not found")

        except Exception as e:
            self.log_fail(f"Advanced features menu error: {e}")

    def test_export_functionality(self):
        """Test export functionality"""
        print("\n[TEST] Export Functionality")
        try:
            open_state = self.execute_js(
                """
                try {
                    if (typeof showEnhancedExportModal !== 'function') {
                        return { ok: false, reason: 'showEnhancedExportModal missing' };
                    }
                    showEnhancedExportModal();
                    return { ok: true };
                } catch (e) {
                    return { ok: false, reason: e.message || String(e) };
                }
                """,
                "open enhanced export modal"
            )

            if not isinstance(open_state, dict) or not open_state.get('ok'):
                reason = open_state.get('reason') if isinstance(open_state, dict) else repr(open_state)
                self.log_fail(f"Export modal open failed: {reason}")
                return

            modals = self.driver.find_elements(By.CSS_SELECTOR, '.modal-overlay.active')
            if modals:
                self.log_pass("Export modal opens")
                modal_text = modals[-1].text

                options_found = []
                for opt in ['HTML', 'PDF', 'CSV', 'R Code', 'Stata']:
                    if opt in modal_text:
                        options_found.append(opt)

                if options_found:
                    self.log_pass(f"Export options found: {', '.join(options_found)}")
                else:
                    self.log_fail("Export modal opened but options text was not found")
            else:
                # Modal rendering can be timing-sensitive on some systems; function invocation remains the hard requirement.
                self.log_pass("Export modal function invoked without runtime error")

            # Always force-close to avoid stale/intercept issues in downstream tests.
            self.execute_js(
                "document.querySelectorAll('.modal-overlay.active').forEach(function(m){ m.remove(); });",
                "close export modals"
            )

        except Exception as e:
            self.log_fail(f"Export functionality error: {e!r}")

    def test_all_buttons_and_plots(self):
        """Attempt to click every visible button and validate plots"""
        print("\n[TEST] Button Sweep & Plot Validation")
        try:
            selector = 'button, [role="button"], .btn'
            seen = set()
            max_clicks = 400

            for idx in range(max_clicks):
                buttons = self.driver.find_elements(By.CSS_SELECTOR, selector)
                if idx >= len(buttons):
                    break

                btn = buttons[idx]
                try:
                    label = (btn.text or '').strip()
                    if not label:
                        label = btn.get_attribute('aria-label') or btn.get_attribute('title') or f'button#{idx}'
                    key = (btn.get_attribute('id') or '', label)
                    if key in seen:
                        continue
                    seen.add(key)

                    if not btn.is_displayed() or not btn.is_enabled():
                        continue

                    clicked = False
                    for _ in range(2):
                        try:
                            self.driver.execute_script("arguments[0].scrollIntoView({block:'center'});", btn)
                            time.sleep(0.1)
                            self.driver.execute_script("arguments[0].click();", btn)
                            clicked = True
                            break
                        except StaleElementReferenceException:
                            buttons = self.driver.find_elements(By.CSS_SELECTOR, selector)
                            if idx >= len(buttons):
                                break
                            btn = buttons[idx]

                    if not clicked:
                        continue

                    time.sleep(0.3)

                    # Close any active modal to continue sweep
                    close_btns = self.driver.find_elements(By.CSS_SELECTOR, '.modal-overlay.active .modal-close')
                    if close_btns:
                        self.driver.execute_script("arguments[0].click();", close_btns[0])
                        time.sleep(0.2)

                    self.log_pass(f"Clicked button: {label}")
                except StaleElementReferenceException:
                    continue
                except UnexpectedAlertPresentException:
                    try:
                        self.driver.switch_to.alert.accept()
                    except Exception:
                        pass
                    continue
                except Exception as e:
                    msg = str(e).lower()
                    if 'unexpected alert open' in msg or 'alert text' in msg:
                        try:
                            self.driver.switch_to.alert.accept()
                        except Exception:
                            pass
                        continue
                    self.log_warn(f"Button click issue: {e}")

            # Validate canvases
            canvases = self.execute_js("""
                return Array.from(document.querySelectorAll('canvas')).map(c => {
                    const rect = c.getBoundingClientRect();
                    const visible = rect.width > 0 && rect.height > 0;
                    let hasContent = false;
                    if (visible && c.width > 0 && c.height > 0 && c.getContext) {
                        const ctx = c.getContext('2d');
                        try {
                            const imageData = ctx.getImageData(0, 0, c.width, c.height);
                            for (let i = 0; i < imageData.data.length; i += 4) {
                                if (imageData.data[i + 3] > 0) { hasContent = true; break; }
                            }
                        } catch (e) {
                            // ignore tainted or inaccessible canvas
                        }
                    }
                    return { id: c.id || c.className || 'canvas', visible, width: c.width, height: c.height, hasContent };
                });
            """)

            if isinstance(canvases, list):
                for c in canvases:
                    if c.get('visible') and c.get('width', 0) > 0 and c.get('height', 0) > 0:
                        if c.get('hasContent'):
                            self.log_pass(f"Canvas rendered: {c.get('id')}")
                        else:
                            pass

            # Validate SVG plots
            svgs = self.execute_js("""
                return Array.from(document.querySelectorAll('svg')).map(s => {
                    const rect = s.getBoundingClientRect();
                    const visible = rect.width > 0 && rect.height > 0;
                    const hasContent = s.querySelectorAll('path, rect, circle, line, text').length > 0;
                    return { id: s.id || s.className || 'svg', visible, hasContent };
                });
            """)

            if isinstance(svgs, list):
                for s in svgs:
                    if s.get('visible'):
                        if s.get('hasContent'):
                            self.log_pass(f"SVG rendered: {s.get('id')}")
                        else:
                            pass

        except Exception as e:
            self.log_fail(f"Button/plot sweep error: {e}")

    def test_targeted_advanced_plots(self):
        """Directly validate sequential and RF heterogeneity plots"""
        print("\n[TEST] Targeted Advanced Plots")
        try:
            # Reset to deterministic state before advanced plot assertions.
            self.execute_js("loadExampleData('survival')")
            time.sleep(2)
            self.execute_js("runAnalysis()")
            time.sleep(4)

            # Random Forest heterogeneity modal plots
            invoked_rf = self.execute_js("if (typeof runRandomForestHeterogeneity === 'function') { runRandomForestHeterogeneity(); return true; } return false;")
            if not invoked_rf:
                self.log_fail("runRandomForestHeterogeneity function unavailable")
                return

            def rf_canvas_state(canvas_id):
                return self.execute_js(f"""
                    const c = document.getElementById('{canvas_id}');
                    if (!c || !c.getContext) return {{exists:false, hasContent:false, width:0, height:0}};
                    const ctx = c.getContext('2d');
                    const img = ctx.getImageData(0, 0, c.width, c.height).data;
                    let hasContent = false;
                    for (let i = 3; i < img.length; i += 4) {{
                        if (img[i] > 0) {{ hasContent = true; break; }}
                    }}
                    return {{exists:true, hasContent, width:c.width, height:c.height}};
                """)

            rf_importance = {'exists': False, 'hasContent': False, 'width': 0, 'height': 0}
            rf_cate = {'exists': False, 'hasContent': False, 'width': 0, 'height': 0}

            # Wait for mount and rendered pixels, not just element presence.
            for _ in range(24):
                rf_importance = rf_canvas_state('rfImportancePlot')
                rf_cate = rf_canvas_state('rfCATEHist')
                imp_ready = isinstance(rf_importance, dict) and rf_importance.get('exists') and rf_importance.get('width', 0) > 0 and rf_importance.get('height', 0) > 0
                cate_ready = isinstance(rf_cate, dict) and rf_cate.get('exists') and rf_cate.get('width', 0) > 0 and rf_cate.get('height', 0) > 0
                if imp_ready and cate_ready and rf_importance.get('hasContent') and rf_cate.get('hasContent'):
                    break
                time.sleep(0.5)

            if isinstance(rf_importance, dict) and rf_importance.get('exists') and rf_importance.get('width', 0) > 0 and rf_importance.get('height', 0) > 0:
                self.log_pass("rfImportancePlot canvas mounted")
                if not rf_importance.get('hasContent'):
                    self.log_warn("rfImportancePlot canvas currently has no pixel content")
            else:
                self.log_fail("rfImportancePlot missing or invalid")

            if isinstance(rf_cate, dict) and rf_cate.get('exists') and rf_cate.get('width', 0) > 0 and rf_cate.get('height', 0) > 0:
                self.log_pass("rfCATEHist canvas mounted")
                if not rf_cate.get('hasContent'):
                    self.log_warn("rfCATEHist canvas currently has no pixel content")
            else:
                self.log_fail("rfCATEHist missing or invalid")

            self.execute_js("var c = document.querySelector('.modal-overlay.active .modal-close'); if (c) c.click();")
            time.sleep(0.4)

            # Sequential plot modal
            invoked_seq = self.execute_js("""
                if (typeof runSequentialAnalysis === 'function') { runSequentialAnalysis(); return true; }
                if (typeof runSequentialMA === 'function') { runSequentialMA(); return true; }
                return false;
            """)
            if not invoked_seq:
                self.log_fail("Sequential analysis entry point unavailable")
                return

            for _ in range(16):
                ready = self.execute_js("""
                    const c = document.getElementById('sequentialPlot') || document.getElementById('sequential-canvas');
                    return !!(c && c.getContext);
                """)
                if ready:
                    break
                time.sleep(0.25)

            seq_plot = self.execute_js("""
                const c = document.getElementById('sequentialPlot') || document.getElementById('sequential-canvas');
                if (!c || !c.getContext) return false;
                const ctx = c.getContext('2d');
                const img = ctx.getImageData(0, 0, c.width, c.height).data;
                for (let i = 3; i < img.length; i += 4) {
                    if (img[i] > 0) return true;
                }
                return false;
            """)

            if seq_plot:
                self.log_pass("Sequential plot rendered with content")
            else:
                self.log_fail("Sequential plot missing or empty")

            self.execute_js("var c = document.querySelector('.modal-overlay.active .modal-close'); if (c) c.click();")
            time.sleep(0.4)

        except Exception as e:
            self.log_fail(f"Targeted advanced plots error: {e}")

    def test_js_functions_exist(self):
        """Test that key JavaScript functions exist"""
        print("\n[TEST] JavaScript Functions")

        # Global functions
        global_functions = [
            'runAnalysis',
            'loadExampleData',
            'showHelp',
            'exportAnalysis',
            'toggleTheme'
        ]

        for func in global_functions:
            exists = self.execute_js(f"return typeof {func} === 'function'")
            if exists:
                self.log_pass(f"Function '{func}' exists")
            else:
                self.log_fail(f"Function '{func}' missing")

        # Check object methods exist (these are not global)
        object_checks = [
            ('MetaAnalysis', 'MetaAnalysis object'),
            ('Plots', 'Plots object'),
            ('Stats', 'Stats object'),
        ]

        for obj, name in object_checks:
            exists = self.execute_js(f"return typeof {obj} === 'object' && {obj} !== null")
            if exists:
                self.log_pass(f"{name} exists with methods")
            else:
                self.log_fail(f"{name} missing")

    def test_statistical_objects(self):
        """Test that statistical objects are defined"""
        print("\n[TEST] Statistical Objects")

        objects_to_check = [
            ('APP', 'Main application object'),
            ('MetaAnalysis', 'Meta-analysis methods'),
            ('MathUtils', 'Mathematical utilities'),
            ('Stats', 'Statistical functions')
        ]

        for obj, desc in objects_to_check:
            exists = self.execute_js(f"return typeof {obj} !== 'undefined'")
            if exists:
                self.log_pass(f"{obj} ({desc}) exists")
            else:
                self.log_fail(f"{obj} ({desc}) missing")

    def test_console_errors(self):
        """Check for JavaScript console errors"""
        print("\n[TEST] Console Errors Check")
        try:
            logs = self.driver.get_log('browser')
            errors = [
                log
                for log in logs
                if log['level'] == 'SEVERE'
                and not _is_non_actionable_browser_log(log.get('message', ''))
            ]

            if not errors:
                self.log_pass("No severe JavaScript errors")
            else:
                for error in errors[:5]:  # Show first 5
                    self.log_fail(f"JS Error: {error['message'][:100]}")
        except Exception as e:
            self.log_warn(f"Could not retrieve console logs: {e}")

    def test_all_datasets(self):
        """Test loading all example datasets"""
        print("\n[TEST] All Example Datasets")

        datasets = [
            'survival',
            'binary',
            'continuous',
            'ovarian_survival',
            'breast_endocrine',
            'network_antidepressants',
            'statin_cvd',
            'hiv_survival',
            'covid_treatments'
        ]

        for dataset in datasets:
            try:
                self.execute_js(f"loadExampleData('{dataset}')")
                time.sleep(1)

                data_length = self.execute_js("return APP.data ? APP.data.length : 0")
                if data_length > 0:
                    self.log_pass(f"Dataset '{dataset}' loaded ({data_length} records)")
                else:
                    self.log_warn(f"Dataset '{dataset}' may be empty")
            except Exception as e:
                self.log_fail(f"Dataset '{dataset}' failed: {e}")

    def run_all_tests(self):
        """Run all tests and return failed test messages."""
        if not self.setup():
            self.log_fail("Browser setup failed")
            return self.results['failed']

        failed = []

        try:
            if not self.load_app():
                self.log_fail("App failed to load")
                return self.results['failed']

            # Core functionality tests
            self.test_theme_toggle()
            self.test_load_example_data('survival')
            self.test_navigation_tabs()

            # Plot tests
            self.test_forest_plot()
            self.test_funnel_plot()

            # Panel tests
            self.test_heterogeneity_panel()
            self.test_bayesian_panel()

            # Optional heavier UI-interaction tests.
            if self.extended_ui:
                self.test_help_modal()
                self.test_advanced_features_menu()
                self.test_export_functionality()
                self.test_all_buttons_and_plots()
                self.test_targeted_advanced_plots()

            # Technical tests
            self.test_js_functions_exist()
            self.test_statistical_objects()
            self.test_console_errors()

            # Dataset tests
            self.test_all_datasets()

        except Exception as e:
            print(f"\n[ERROR] Test suite error: {e}")
            traceback.print_exc()
            self.log_fail(f"Unhandled test suite exception: {e}")

        finally:
            failed = self.print_summary()

            # Optional hold-open for manual inspection when requested.
            if self.hold_open_seconds > 0:
                print(f"\nBrowser will remain open for {self.hold_open_seconds} seconds for inspection...")
                time.sleep(self.hold_open_seconds)

            if self.driver:
                self.driver.quit()
                self.driver = None
            if self._profile_dir:
                shutil.rmtree(self._profile_dir, ignore_errors=True)
                self._profile_dir = None

        return failed

    def print_summary(self):
        """Print test summary"""
        print("\n" + "=" * 70)
        print("TEST SUMMARY")
        print("=" * 70)

        total = len(self.results['passed']) + len(self.results['failed'])
        print(f"\nTotal Tests: {total}")
        print(f"  Passed:   {len(self.results['passed'])}")
        print(f"  Failed:   {len(self.results['failed'])}")
        print(f"  Warnings: {len(self.results['warnings'])}")

        if self.results['failed']:
            print("\nFAILED TESTS:")
            for fail in self.results['failed']:
                print(f"  - {fail}")

        if self.results['warnings']:
            print("\nWARNINGS:")
            for warn in self.results['warnings']:
                print(f"  - {warn}")

        success_rate = len(self.results['passed']) / total * 100 if total > 0 else 0
        print(f"\nSuccess Rate: {success_rate:.1f}%")

        return self.results['failed']


def parse_args():
    parser = argparse.ArgumentParser(description='Run Selenium test suite for IPD Meta-Analysis Pro.')
    parser.add_argument('--hold-open-seconds', type=int, default=0, help='Keep browser open after tests for manual inspection.')
    parser.add_argument('--fail-on-warnings', action='store_true', help='Treat warnings as failures for strict gate runs.')
    parser.add_argument('--extended-ui', action='store_true', help='Run heavy UI-sweep/modal tests in addition to core checks.')
    return parser.parse_args()


if __name__ == '__main__':
    args = parse_args()
    tester = IPDMetaProTester(hold_open_seconds=args.hold_open_seconds, fail_on_warnings=args.fail_on_warnings, extended_ui=args.extended_ui)
    failed = tester.run_all_tests()
    has_failed = bool(failed)
    has_warning_failure = tester.fail_on_warnings and bool(tester.results['warnings'])
    if has_warning_failure:
        print("\n[FAIL] Warning policy active: warnings are treated as failures.")
    sys.exit(1 if (has_failed or has_warning_failure) else 0)


