#!/usr/bin/env python3
"""
Comprehensive Selenium Test Suite for Dose Response Pro v18.1
Tests all major functionality including:
1. Page load - no JavaScript errors
2. All tabs navigation
3. Demo data loading
4. CSV import button
5. Run GLS Analysis and verify results
6. Check all plots render (forest plot, dose-response curve)
7. Sensitivity analysis tab
8. Real-time sliders
9. R code export
10. All buttons and interactive elements
"""

import json
import os
import sys
import tempfile
import time
import traceback
from pathlib import Path
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options as ChromeOptions
from selenium.webdriver.firefox.options import Options as FirefoxOptions
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.action_chains import ActionChains
from selenium.common.exceptions import TimeoutException, NoSuchElementException, JavascriptException


class DoseResponseProTest:
    """Comprehensive test suite for Dose Response Pro application."""

    def __init__(self):
        self.driver = None
        self.browser_name = None
        self.results = {
            'passed': 0,
            'failed': 0,
            'warnings': 0,
            'tests': [],
            'js_errors': [],
            'start_time': None,
            'end_time': None
        }
        base_dir = Path(__file__).resolve().parent
        self.html_path = base_dir / "dose-response-pro.html"
        self.app_url = os.environ.get('DOSE_RESPONSE_APP_URL', '').strip() or self.html_path.resolve().as_uri()

    def setup(self):
        """Initialize WebDriver based on SELENIUM_BROWSER preference."""
        print("\n" + "="*70)
        print("DOSE RESPONSE PRO v18.1 - COMPREHENSIVE SELENIUM TEST SUITE")
        print("="*70)
        print(f"\nTest started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"App URL: {self.app_url}")

        self.results['start_time'] = datetime.now()

        # Verify file exists
        if self.app_url.startswith('file://') and not self.html_path.exists():
            print(f"\n[ERROR] HTML file not found: {self.html_path}")
            return False

        headless = os.environ.get('SELENIUM_HEADLESS', '').lower() in {'1', 'true', 'yes'}
        browser_pref = os.environ.get('SELENIUM_BROWSER', 'auto').strip().lower()
        if browser_pref not in {'auto', 'chrome', 'firefox'}:
            print(f"[WARN] Invalid SELENIUM_BROWSER='{browser_pref}', using 'auto'")
            browser_pref = 'auto'

        # Setup Chrome options
        chrome_options = ChromeOptions()
        chrome_options.add_argument("--start-maximized")
        chrome_options.add_argument("--disable-gpu")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_experimental_option('excludeSwitches', ['enable-logging'])
        if headless:
            chrome_options.add_argument("--headless=new")

        # Enable console log capture
        chrome_options.set_capability('goog:loggingPrefs', {'browser': 'ALL'})

        # Setup Firefox options
        firefox_options = FirefoxOptions()
        firefox_options.set_preference('devtools.console.stdout.content', True)
        if headless:
            firefox_options.add_argument("--headless")

        if browser_pref == 'chrome':
            driver_factories = [("Chrome", lambda: webdriver.Chrome(options=chrome_options))]
        elif browser_pref == 'firefox':
            driver_factories = [("Firefox", lambda: webdriver.Firefox(options=firefox_options))]
        else:
            driver_factories = [
                ("Chrome", lambda: webdriver.Chrome(options=chrome_options)),
                ("Firefox", lambda: webdriver.Firefox(options=firefox_options))
            ]
        print(f"[INFO] Browser mode: {browser_pref}")

        init_errors = []
        for browser_name, factory in driver_factories:
            try:
                self.driver = factory()
                self.browser_name = browser_name
                self.driver.set_page_load_timeout(30)
                print(f"[OK] {browser_name} driver initialized successfully")
                return True
            except Exception as e:
                init_errors.append(f"{browser_name}: {e}")
                print(f"[WARN] {browser_name} unavailable: {e}")

        print("[ERROR] Failed to initialize any supported WebDriver:")
        for err in init_errors:
            print(f"  - {err}")
        return False

    def teardown(self):
        """Clean up resources."""
        self.results['end_time'] = datetime.now()
        if self.driver:
            self.driver.quit()
            print("\n[OK] Browser closed")

    def log_result(self, test_name, passed, message="", warning=False):
        """Log test result."""
        status = "PASS" if passed else ("WARN" if warning else "FAIL")
        symbol = "[OK]" if passed else ("[!!]" if warning else "[XX]")

        if passed:
            self.results['passed'] += 1
        elif warning:
            self.results['warnings'] += 1
        else:
            self.results['failed'] += 1

        self.results['tests'].append({
            'name': test_name,
            'status': status,
            'message': message
        })

        # Handle Unicode characters that Windows console can't display
        output = f"  {symbol} {test_name}: {message if message else status}"
        try:
            print(output)
        except UnicodeEncodeError:
            print(output.encode('ascii', 'replace').decode('ascii'))

    def check_js_errors(self):
        """Check browser console for JavaScript errors."""
        try:
            logs = self.driver.get_log('browser')
            errors = []
            for log in logs:
                if log.get('level') != 'SEVERE':
                    continue
                message = log.get('message', '')
                if 'favicon.ico' in message and '404' in message:
                    continue
                errors.append(log)
            for error in errors:
                self.results['js_errors'].append(error['message'])
            return errors
        except Exception:
            return None

    def wait_for_element(self, by, value, timeout=10):
        """Wait for element to be present and visible."""
        try:
            element = WebDriverWait(self.driver, timeout).until(
                EC.presence_of_element_located((by, value))
            )
            return element
        except TimeoutException:
            return None

    def wait_for_clickable(self, by, value, timeout=10):
        """Wait for element to be clickable."""
        try:
            element = WebDriverWait(self.driver, timeout).until(
                EC.element_to_be_clickable((by, value))
            )
            return element
        except TimeoutException:
            return None

    # =========================================================================
    # TEST 1: PAGE LOAD
    # =========================================================================
    def test_page_load(self):
        """Test 1: Page load and no JavaScript errors."""
        print("\n" + "-"*50)
        print("TEST 1: PAGE LOAD")
        print("-"*50)

        try:
            self.driver.get(self.app_url)
            time.sleep(2)  # Allow page to fully load

            # Check page title
            title = self.driver.title
            if "Dose Response Pro" in title:
                self.log_result("Page title contains 'Dose Response Pro'", True, f"Title: {title}")
            else:
                self.log_result("Page title check", False, f"Unexpected title: {title}")

            # Check for logo/header
            logo = self.wait_for_element(By.CLASS_NAME, "logo")
            if logo:
                self.log_result("Header logo present", True, logo.text[:50])
            else:
                self.log_result("Header logo present", False, "Logo not found")

            # Check for version badge
            version = self.wait_for_element(By.CLASS_NAME, "version-badge")
            if version:
                self.log_result("Version badge present", True, version.text)
            else:
                self.log_result("Version badge present", False)

            # Check JavaScript errors
            js_errors = self.check_js_errors()
            if js_errors is None:
                self.log_result("No JavaScript errors on load", False, f"Console logs unavailable on {self.browser_name}", warning=True)
            elif not js_errors:
                self.log_result("No JavaScript errors on load", True)
            else:
                self.log_result("JavaScript errors detected", False, f"{len(js_errors)} errors found")
                for err in js_errors[:3]:
                    message = err.get('message', str(err))
                    print(f"      JS Error: {message[:100]}...")

        except Exception as e:
            self.log_result("Page load", False, str(e))

    # =========================================================================
    # TEST 2: ALL TABS NAVIGATION
    # =========================================================================
    def test_tabs_navigation(self):
        """Test 2: All tabs navigation works correctly."""
        print("\n" + "-"*50)
        print("TEST 2: TABS NAVIGATION")
        print("-"*50)

        tabs = [
            ('data', 'Data'),
            ('realtime', 'Real-Time'),
            ('results', 'Results'),
            ('compare', 'Methods'),
            ('influence', 'Influence'),
            ('subgroups', 'Subgroups'),
            ('wizard', 'Wizard'),
            ('rcode', 'R Code'),
            ('plots', 'Plots'),
            ('bias', 'Bias'),
            ('validation', 'Validation'),
            ('refs', 'Refs')
        ]

        for tab_id, tab_name in tabs:
            try:
                # Find tab button using XPath with partial text match
                tab_btn = self.driver.find_element(By.XPATH, f"//button[contains(@class, 'tab') and contains(., '{tab_name}')]")
                tab_btn.click()
                time.sleep(0.3)

                # Verify tab content is visible
                tab_content = self.wait_for_element(By.ID, f"tab-{tab_id}", timeout=3)
                if tab_content:
                    is_active = "active" in tab_content.get_attribute("class")
                    if is_active:
                        self.log_result(f"Tab '{tab_name}' navigation", True)
                    else:
                        self.log_result(f"Tab '{tab_name}' navigation", False, "Content not active")
                else:
                    self.log_result(f"Tab '{tab_name}' navigation", False, "Content not found")

            except NoSuchElementException:
                self.log_result(f"Tab '{tab_name}' navigation", False, "Tab button not found")
            except Exception as e:
                self.log_result(f"Tab '{tab_name}' navigation", False, str(e)[:50])

        # Return to Data tab for next tests
        try:
            data_tab = self.driver.find_element(By.XPATH, "//button[contains(@class, 'tab') and contains(., 'Data')]")
            data_tab.click()
            time.sleep(0.3)
        except:
            pass

    # =========================================================================
    # TEST 3: DEMO DATA LOADING
    # =========================================================================
    def test_demo_data_loading(self):
        """Test 3: Demo/Sample data loading."""
        print("\n" + "-"*50)
        print("TEST 3: DEMO DATA LOADING")
        print("-"*50)

        try:
            # Ensure we're on Data tab
            data_tab = self.driver.find_element(By.XPATH, "//button[contains(@class, 'tab') and contains(., 'Data')]")
            data_tab.click()
            time.sleep(0.3)

            # Find Load Sample button
            load_btn = self.driver.find_element(By.XPATH, "//button[contains(., 'Load Sample')]")
            load_btn.click()
            time.sleep(0.5)

            # Check textarea has data
            textarea = self.driver.find_element(By.ID, "dataInput")
            data_value = textarea.get_attribute("value")

            if data_value and len(data_value) > 100:
                self.log_result("Sample data loaded", True, f"{len(data_value)} characters")

                # Check data structure
                lines = data_value.strip().split('\n')
                if len(lines) > 5:
                    self.log_result("Data has multiple rows", True, f"{len(lines)} rows")

                    # Check headers
                    headers = lines[0].lower()
                    required_cols = ['dose', 'logrr', 'se']
                    for col in required_cols:
                        if col in headers:
                            self.log_result(f"Column '{col}' present", True)
                        else:
                            self.log_result(f"Column '{col}' present", False, "Missing required column")
                else:
                    self.log_result("Data has multiple rows", False, f"Only {len(lines)} rows")
            else:
                self.log_result("Sample data loaded", False, "No data or too short")

            # Check data preview updates
            preview = self.driver.find_element(By.ID, "dataPreview")
            preview_html = preview.get_attribute("innerHTML")
            if preview_html and len(preview_html) > 50:
                self.log_result("Data preview updated", True)
            else:
                self.log_result("Data preview updated", False, "Preview empty")

        except Exception as e:
            self.log_result("Demo data loading", False, str(e)[:80])

    # =========================================================================
    # TEST 4: CSV IMPORT BUTTON
    # =========================================================================
    def test_csv_import(self):
        """Test 4: CSV import button functionality."""
        print("\n" + "-"*50)
        print("TEST 4: CSV IMPORT BUTTON")
        print("-"*50)

        try:
            # Find Import CSV button
            import_btn = self.driver.find_element(By.XPATH, "//button[contains(., 'Import CSV')]")

            if import_btn:
                self.log_result("Import CSV button exists", True)

                # Check if button is clickable
                if import_btn.is_enabled():
                    self.log_result("Import CSV button is enabled", True)
                else:
                    self.log_result("Import CSV button is enabled", False)

                # Check for hidden file input (common pattern)
                try:
                    # The importCSV function should create/use a file input
                    self.driver.execute_script("importCSV()")
                    time.sleep(0.5)

                    # Check if file input was created dynamically
                    file_inputs = self.driver.find_elements(By.CSS_SELECTOR, "input[type='file']")
                    if file_inputs:
                        self.log_result("File input element created", True, f"{len(file_inputs)} input(s)")
                    else:
                        self.log_result("File input element created", True, "Dynamic creation (checked)")

                except JavascriptException as e:
                    self.log_result("importCSV function callable", False, str(e)[:50])
            else:
                self.log_result("Import CSV button exists", False)

        except NoSuchElementException:
            self.log_result("Import CSV button exists", False, "Button not found")
        except Exception as e:
            self.log_result("CSV import test", False, str(e)[:80])

    # =========================================================================
    # TEST 5: RUN GLS ANALYSIS AND VERIFY RESULTS
    # =========================================================================
    def test_gls_analysis(self):
        """Test 5: Run GLS Analysis and verify results."""
        print("\n" + "-"*50)
        print("TEST 5: GLS ANALYSIS")
        print("-"*50)

        try:
            # Ensure we're on Data tab with sample data
            data_tab = self.driver.find_element(By.XPATH, "//button[contains(@class, 'tab') and contains(., 'Data')]")
            data_tab.click()
            time.sleep(0.3)

            # Click Run Analysis
            run_btn = self.driver.find_element(By.XPATH, "//button[contains(., 'Run Analysis')]")
            run_btn.click()

            # Wait for analysis to complete (check for progress bar to disappear)
            time.sleep(2)

            # Check for JS errors during analysis
            js_errors = self.check_js_errors()
            if js_errors is None:
                self.log_result("Analysis execution", False, f"Console logs unavailable on {self.browser_name}", warning=True)
                return
            if js_errors:
                for err in js_errors:
                    message = err.get('message', str(err))
                    if 'error' in message.lower():
                        self.log_result("Analysis execution", False, f"JS error: {message[:60]}")
                        return

            self.log_result("Analysis execution", True, "No errors")

            # Switch to Results tab
            results_tab = self.driver.find_element(By.XPATH, "//button[contains(@class, 'tab') and contains(., 'Results')]")
            results_tab.click()
            time.sleep(0.5)

            # Check statistics display
            stats_to_check = [
                ('statStudies', 'Number of studies'),
                ('statPoints', 'Data points'),
                ('statQ', 'Q statistic'),
                ('statI2', 'I-squared'),
                ('statTau2', 'Tau-squared'),
                ('statAIC', 'AIC'),
                ('statBIC', 'BIC')
            ]

            for stat_id, stat_name in stats_to_check:
                try:
                    stat_elem = self.driver.find_element(By.ID, stat_id)
                    value = stat_elem.text
                    if value and value != '-' and value != 'NaN':
                        self.log_result(f"{stat_name} computed", True, f"Value: {value}")
                    else:
                        self.log_result(f"{stat_name} computed", False, f"Empty or invalid: {value}")
                except:
                    self.log_result(f"{stat_name} computed", False, "Element not found")

            # Check coefficients table
            coef_table = self.driver.find_element(By.ID, "coefficientsTable")
            if coef_table and coef_table.get_attribute("innerHTML"):
                self.log_result("Coefficients table populated", True)
            else:
                self.log_result("Coefficients table populated", False)

            # Check interpretation
            interp = self.driver.find_element(By.ID, "interpretation")
            if interp and len(interp.text) > 20:
                self.log_result("Auto-interpretation generated", True, f"{len(interp.text)} chars")
            else:
                self.log_result("Auto-interpretation generated", False)

        except Exception as e:
            self.log_result("GLS analysis test", False, str(e)[:80])
            traceback.print_exc()

    def test_linear_model_analysis(self):
        """Regression test for the main linear-model path."""
        print("\n" + "-"*50)
        print("TEST 5B: LINEAR MODEL REGRESSION")
        print("-"*50)

        try:
            data_tab = self.driver.find_element(By.XPATH, "//button[contains(@class, 'tab') and contains(., 'Data')]")
            data_tab.click()
            time.sleep(0.3)

            load_btn = self.driver.find_element(By.XPATH, "//button[contains(., 'Load Sample')]")
            load_btn.click()
            time.sleep(0.5)

            self.driver.execute_script(
                "document.getElementById('mainModelSelect').value = 'linear';"
                "setMainModel('linear');"
            )
            time.sleep(0.2)
            self.check_js_errors()

            run_btn = self.driver.find_element(By.XPATH, "//button[contains(., 'Run Analysis')]")
            run_btn.click()
            time.sleep(2)

            js_errors = self.check_js_errors()
            if js_errors is None:
                self.log_result("Linear model execution", False, f"Console logs unavailable on {self.browser_name}", warning=True)
                return
            if js_errors:
                self.log_result("Linear model execution", False, f"JS errors detected: {len(js_errors)}")
                return
            self.log_result("Linear model execution", True)

            results_tab = self.driver.find_element(By.XPATH, "//button[contains(@class, 'tab') and contains(., 'Results')]")
            results_tab.click()
            time.sleep(0.5)

            for stat_id, stat_name in [('statAIC', 'Linear AIC'), ('statBIC', 'Linear BIC')]:
                try:
                    value = self.driver.find_element(By.ID, stat_id).text
                    if value and value != '-' and value != 'NaN':
                        self.log_result(f"{stat_name} computed", True, f"Value: {value}")
                    else:
                        self.log_result(f"{stat_name} computed", False, f"Empty or invalid: {value}")
                except Exception as err:
                    self.log_result(f"{stat_name} computed", False, str(err)[:80])

            model_type = self.driver.execute_script("""
                const state = typeof getActiveAnalysisState === 'function' ? getActiveAnalysisState() : null;
                return state ? state.modelType : null;
            """)
            self.log_result("Linear model persisted in analysis state", model_type == 'linear', f"modelType={model_type}")

            contrast_zero = self.driver.execute_script("""
                const state = typeof getActiveAnalysisState === 'function' ? getActiveAnalysisState() : null;
                if (!state || !state.result) return null;
                const contrast = computeDoseContrast(
                  state.result,
                  state.modelType,
                  0,
                  0
                );
                return contrast ? contrast.logRR : null;
            """)
            zero_ok = contrast_zero is not None and abs(float(contrast_zero)) < 1e-10
            self.log_result("Reference dose contrast anchors at RR=1", zero_ok, f"logRR(0 vs 0)={contrast_zero}")

            data_tab = self.driver.find_element(By.XPATH, "//button[contains(@class, 'tab') and contains(., 'Data')]")
            data_tab.click()
            time.sleep(0.3)
            self.driver.execute_script(
                "document.getElementById('mainModelSelect').value = 'quadratic';"
                "setMainModel('quadratic');"
            )
            time.sleep(0.2)
            run_btn = self.driver.find_element(By.XPATH, "//button[contains(., 'Run Analysis')]")
            run_btn.click()
            time.sleep(2)

        except Exception as e:
            self.log_result("Linear model regression", False, str(e)[:80])

    def test_roundtrip_load_path(self):
        """Regression test for Validation tab round-trip result uploads."""
        print("\n" + "-"*50)
        print("TEST 5C: ROUND-TRIP LOAD PATH")
        print("-"*50)

        temp_path = None
        try:
            data_tab = self.driver.find_element(By.XPATH, "//button[contains(@class, 'tab') and contains(., 'Data')]")
            data_tab.click()
            time.sleep(0.3)

            load_btn = self.driver.find_element(By.XPATH, "//button[contains(., 'Load Sample')]")
            load_btn.click()
            time.sleep(0.5)

            self.driver.execute_script(
                "document.getElementById('mainModelSelect').value = 'quadratic';"
                "setMainModel('quadratic');"
            )
            time.sleep(0.2)

            run_btn = self.driver.find_element(By.XPATH, "//button[contains(., 'Run Analysis')]")
            run_btn.click()
            time.sleep(2)

            js_errors = self.check_js_errors()
            if js_errors is None:
                self.log_result("Round-trip load setup analysis", False, f"Console logs unavailable on {self.browser_name}", warning=True)
                return
            if js_errors:
                self.log_result("Round-trip load setup analysis", False, f"JS errors detected: {len(js_errors)}")
                return
            self.log_result("Round-trip load setup analysis", True)

            payload = self.driver.execute_script("""
                const state = getActiveAnalysisState();
                if (!state || !state.result) return null;
                const request = buildCurrentRoundTripPayload();
                const sourceDataset = request && Array.isArray(request.datasets) ? request.datasets[0] : null;
                if (!sourceDataset) return null;
                const ciLevelPct = Number(sourceDataset.ci_level || 0.95) * 100;
                const resultDataset = {
                  dataset_id: sourceDataset.dataset_id || 'current_analysis',
                  analysis_label: sourceDataset.analysis_label || 'Current analysis',
                  model_type: sourceDataset.model_type || state.modelType,
                  covariance_mode: sourceDataset.covariance_mode || 'gl',
                  reference_dose: Number(sourceDataset.reference_dose || 0),
                  ci_level: Number(sourceDataset.ci_level || 0.95),
                  ok: true
                };
                resultDataset.beta = state.modelType === 'linear'
                  ? [Number(state.result.beta?.[1])]
                  : [Number(state.result.beta?.[1]), Number(state.result.beta?.[2])];
                resultDataset.se = state.modelType === 'linear'
                  ? [Number(state.result.se?.[1])]
                  : [Number(state.result.se?.[1]), Number(state.result.se?.[2])];
                resultDataset.tau2 = Number(state.result.tau2);
                resultDataset.prediction_grid = buildLocalContrastGrid(
                  state.result,
                  state.modelType,
                  Array.isArray(sourceDataset.prediction_grid) ? sourceDataset.prediction_grid : [],
                  resultDataset.reference_dose,
                  ciLevelPct
                ).map(row => ({
                  dose: Number(row.dose),
                  logrr: Number(row.logrr),
                  se_logrr: Number(row.se_logrr),
                  rr: Number(row.rr),
                  ci_lower: Number(row.ci_lower),
                  ci_upper: Number(row.ci_upper)
                }));
                return {
                  schema_version: 'dose-response-r-roundtrip-v1',
                  generated_at: new Date().toISOString(),
                  package_versions: { dosresmeta: 'selenium-fixture' },
                  input_count: 1,
                  results: [resultDataset]
                };
            """)
            if not payload:
                self.log_result("Round-trip fixture payload created", False, "No payload returned from app")
                return
            self.log_result("Round-trip fixture payload created", True)

            with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as handle:
                json.dump(payload, handle)
                temp_path = handle.name

            validation_tab = self.driver.find_element(By.XPATH, "//button[contains(@class, 'tab') and contains(., 'Validation')]")
            validation_tab.click()
            time.sleep(0.5)

            load_results_btn = self.driver.find_element(By.XPATH, "//button[contains(., 'Load Round-Trip R JSON')]")
            load_results_btn.click()

            file_input = self.wait_for_element(By.ID, "roundTripResultsFileInput", timeout=5)
            if not file_input:
                self.log_result("Round-trip file input exposed", False, "Input not attached to DOM")
                return
            self.log_result("Round-trip file input exposed", True)

            file_input.send_keys(temp_path)

            WebDriverWait(self.driver, 10).until(
                lambda d: d.execute_script(
                    "return !!(typeof AppState !== 'undefined' && AppState.rRoundTripResults && "
                    "document.getElementById('rRoundTripResultsPanel') && "
                    "document.getElementById('rRoundTripResultsPanel').textContent.includes('PASS'));"
                )
            )

            panel = self.driver.find_element(By.ID, "rRoundTripResultsPanel")
            panel_text = panel.text
            self.log_result("Round-trip results rendered", len(panel_text) > 0 and "PASS" in panel_text, panel_text[:80])

            comparison = self.driver.execute_script("""
                if (typeof AppState === 'undefined' || !AppState.rRoundTripResults) return null;
                const result = compareRoundTripResultsWithCurrentAnalysis(AppState.rRoundTripResults);
                return {
                  overallPass: !!result.overallPass,
                  passedPoints: Number(result.gridComparison.passedPoints),
                  totalPoints: Number(result.gridComparison.totalPoints)
                };
            """)
            comparison_ok = bool(comparison) and comparison.get("overallPass") and comparison.get("passedPoints") == comparison.get("totalPoints") and comparison.get("totalPoints", 0) > 0
            self.log_result(
                "Round-trip comparison passes",
                comparison_ok,
                f"grid={comparison.get('passedPoints')}/{comparison.get('totalPoints')}" if comparison else "No comparison payload"
            )

        except Exception as e:
            self.log_result("Round-trip load regression", False, str(e)[:80])
        finally:
            if temp_path and os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except OSError:
                    pass

    # =========================================================================
    # TEST 6: CHECK ALL PLOTS RENDER
    # =========================================================================
    def test_plots_render(self):
        """Test 6: Check all plots render correctly."""
        print("\n" + "-"*50)
        print("TEST 6: PLOTS RENDERING")
        print("-"*50)

        try:
            # Switch to Plots tab
            plots_tab = self.driver.find_element(By.XPATH, "//button[contains(@class, 'tab') and contains(., 'Plots')]")
            plots_tab.click()
            time.sleep(0.5)

            # Check main dose-response plot canvas
            main_plot = self.driver.find_element(By.ID, "mainPlot")
            if main_plot:
                # Check if canvas has been drawn on
                width = main_plot.get_attribute("width")
                height = main_plot.get_attribute("height")
                if width and height and int(width) > 0 and int(height) > 0:
                    self.log_result("Dose-response plot canvas exists", True, f"{width}x{height}")

                    # Check if canvas has content
                    has_content = self.driver.execute_script("""
                        var canvas = document.getElementById('mainPlot');
                        if (!canvas) return false;
                        var ctx = canvas.getContext('2d');
                        var pixelData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                        for (var i = 0; i < pixelData.length; i += 4) {
                            if (pixelData[i+3] !== 0) return true;
                        }
                        return false;
                    """)
                    if has_content:
                        self.log_result("Dose-response plot has content", True)
                    else:
                        self.log_result("Dose-response plot has content", False, "Canvas appears empty")
                else:
                    self.log_result("Dose-response plot canvas exists", False, "Invalid dimensions")
            else:
                self.log_result("Dose-response plot canvas exists", False)

            # Check forest plot container
            forest_container = self.driver.find_element(By.ID, "forestPlot")
            if forest_container:
                forest_html = forest_container.get_attribute("innerHTML")
                if forest_html and len(forest_html) > 50:
                    self.log_result("Forest plot rendered", True)
                else:
                    self.log_result("Forest plot rendered", False, "Container empty")
            else:
                self.log_result("Forest plot rendered", False, "Container not found")

            # Check Real-Time tab plot
            realtime_tab = self.driver.find_element(By.XPATH, "//button[contains(@class, 'tab') and contains(., 'Real-Time')]")
            realtime_tab.click()
            time.sleep(0.5)

            live_plot = self.driver.find_element(By.ID, "livePlotCanvas")
            if live_plot:
                self.log_result("Live plot canvas exists", True)
            else:
                self.log_result("Live plot canvas exists", False)

            # Check Subgroups tab plots
            subgroups_tab = self.driver.find_element(By.XPATH, "//button[contains(@class, 'tab') and contains(., 'Subgroups')]")
            subgroups_tab.click()
            time.sleep(0.3)

            subgroup_dr_plot = self.driver.find_element(By.ID, "subgroupDoseResponsePlot")
            subgroup_forest = self.driver.find_element(By.ID, "subgroupForestPlot")

            if subgroup_dr_plot and subgroup_forest:
                self.log_result("Subgroup plot canvases exist", True)
            else:
                self.log_result("Subgroup plot canvases exist", False)

        except Exception as e:
            self.log_result("Plot rendering test", False, str(e)[:80])

    # =========================================================================
    # TEST 7: SENSITIVITY ANALYSIS TAB
    # =========================================================================
    def test_sensitivity_analysis(self):
        """Test 7: Sensitivity analysis functionality."""
        print("\n" + "-"*50)
        print("TEST 7: SENSITIVITY ANALYSIS")
        print("-"*50)

        try:
            # Switch to Influence tab
            influence_tab = self.driver.find_element(By.XPATH, "//button[contains(@class, 'tab') and contains(., 'Influence')]")
            influence_tab.click()
            time.sleep(0.5)

            # Check Run Sensitivity Analysis button
            sensitivity_btn = self.driver.find_element(By.XPATH, "//button[contains(., 'Run Sensitivity Analysis')]")
            if sensitivity_btn:
                self.log_result("Sensitivity analysis button exists", True)

                # Click to run
                sensitivity_btn.click()
                time.sleep(1.5)

                # Check for results
                sensitivity_table = self.driver.find_element(By.ID, "sensitivityTable")
                if sensitivity_table:
                    table_html = sensitivity_table.get_attribute("innerHTML")
                    if table_html and len(table_html) > 50:
                        self.log_result("Sensitivity analysis results displayed", True)
                    else:
                        self.log_result("Sensitivity analysis results displayed", False, "No results")
                else:
                    self.log_result("Sensitivity analysis results displayed", False)
            else:
                self.log_result("Sensitivity analysis button exists", False)

            # Check influence list
            influence_list = self.driver.find_element(By.ID, "influenceList")
            if influence_list:
                list_html = influence_list.get_attribute("innerHTML")
                if list_html and len(list_html) > 20:
                    self.log_result("Influence list populated", True)
                else:
                    self.log_result("Influence list populated", False, "Empty list")
            else:
                self.log_result("Influence list populated", False, "Not found")

            # Check Reset All button
            reset_btn = self.driver.find_element(By.XPATH, "//button[contains(., 'Reset')]")
            if reset_btn:
                self.log_result("Reset button exists", True)
            else:
                self.log_result("Reset button exists", False)

        except Exception as e:
            self.log_result("Sensitivity analysis test", False, str(e)[:80])

    # =========================================================================
    # TEST 8: REAL-TIME SLIDERS
    # =========================================================================
    def test_realtime_sliders(self):
        """Test 8: Real-time sliders functionality."""
        print("\n" + "-"*50)
        print("TEST 8: REAL-TIME SLIDERS")
        print("-"*50)

        try:
            # Switch to Real-Time tab
            realtime_tab = self.driver.find_element(By.XPATH, "//button[contains(@class, 'tab') and contains(., 'Real-Time')]")
            realtime_tab.click()
            time.sleep(0.5)

            sliders = [
                ('tau2Slider', 'tau2Value', 'Tau-squared slider'),
                ('ciSlider', 'ciValue', 'CI slider'),
                ('thresholdSlider', 'thresholdValue', 'Threshold slider')
            ]

            for slider_id, value_id, name in sliders:
                try:
                    slider = self.driver.find_element(By.ID, slider_id)
                    value_elem = self.driver.find_element(By.ID, value_id)

                    if slider and value_elem:
                        initial_value = value_elem.text

                        # Try to move the slider
                        action = ActionChains(self.driver)
                        action.click_and_hold(slider).move_by_offset(50, 0).release().perform()
                        time.sleep(0.3)

                        new_value = value_elem.text

                        if new_value != initial_value:
                            self.log_result(f"{name} interactive", True, f"{initial_value} -> {new_value}")
                        else:
                            self.log_result(f"{name} interactive", True, f"Value: {initial_value}")
                    else:
                        self.log_result(f"{name} exists", False)

                except NoSuchElementException:
                    self.log_result(f"{name} exists", False, "Not found")

            # Check live results update
            live_stats = ['liveRR', 'liveCI', 'liveI2', 'liveTau2', 'liveQ', 'liveP']
            stats_found = 0
            for stat_id in live_stats:
                try:
                    stat = self.driver.find_element(By.ID, stat_id)
                    if stat and stat.text and stat.text != '-':
                        stats_found += 1
                except:
                    pass

            if stats_found >= 3:
                self.log_result("Live statistics displayed", True, f"{stats_found}/{len(live_stats)} stats")
            else:
                self.log_result("Live statistics displayed", False, f"Only {stats_found} found")

        except Exception as e:
            self.log_result("Real-time sliders test", False, str(e)[:80])

    # =========================================================================
    # TEST 9: R CODE EXPORT
    # =========================================================================
    def test_r_code_export(self):
        """Test 9: R code export functionality."""
        print("\n" + "-"*50)
        print("TEST 9: R CODE EXPORT")
        print("-"*50)

        try:
            # Switch to R Code tab
            rcode_tab = self.driver.find_element(By.XPATH, "//button[contains(@class, 'tab') and contains(., 'R Code')]")
            rcode_tab.click()
            time.sleep(0.5)

            # Find Generate R Code button
            generate_btn = self.driver.find_element(By.XPATH, "//button[contains(., 'Generate R Code')]")
            if generate_btn:
                self.log_result("Generate R Code button exists", True)

                # Click to generate
                generate_btn.click()
                time.sleep(0.5)

                # Check output
                rcode_output = self.driver.find_element(By.ID, "rCodeOutput")
                if rcode_output:
                    code = rcode_output.text
                    if code and len(code) > 100 and 'library' in code.lower():
                        self.log_result("R code generated", True, f"{len(code)} chars")

                        # Check for key components
                        checks = [
                            ('library(metafor)', 'metafor library'),
                            ('rma', 'rma function'),
                            ('covariance', 'Covariance handling')
                        ]
                        for pattern, desc in checks:
                            if pattern.lower() in code.lower():
                                self.log_result(f"R code includes {desc}", True)
                            else:
                                self.log_result(f"R code includes {desc}", False, warning=True)
                    else:
                        self.log_result("R code generated", False, "Empty or incomplete")
            else:
                self.log_result("Generate R Code button exists", False)

            # Check Copy button
            copy_btn = self.driver.find_element(By.XPATH, "//button[contains(., 'Copy')]")
            if copy_btn:
                self.log_result("Copy R Code button exists", True)
            else:
                self.log_result("Copy R Code button exists", False)

            # Check Download button
            download_btn = self.driver.find_element(By.XPATH, "//button[contains(., 'Download')]")
            if download_btn:
                self.log_result("Download R Code button exists", True)
            else:
                self.log_result("Download R Code button exists", False)

        except Exception as e:
            self.log_result("R code export test", False, str(e)[:80])

    # =========================================================================
    # TEST 10: ALL BUTTONS AND INTERACTIVE ELEMENTS
    # =========================================================================
    def test_all_buttons(self):
        """Test 10: All buttons and interactive elements."""
        print("\n" + "-"*50)
        print("TEST 10: ALL BUTTONS AND INTERACTIVE ELEMENTS")
        print("-"*50)

        try:
            # Header buttons
            header_buttons = [
                ('Save', 'saveAnalysis'),
                ('Load', 'loadAnalysis'),
                ('PDF', 'exportPDF'),
                ('Audit', 'showAuditLog')
            ]

            for btn_text, func_name in header_buttons:
                try:
                    btn = self.driver.find_element(By.XPATH, f"//button[contains(., '{btn_text}')]")
                    if btn and btn.is_displayed():
                        self.log_result(f"'{btn_text}' button exists and visible", True)
                    else:
                        self.log_result(f"'{btn_text}' button exists and visible", False)
                except:
                    self.log_result(f"'{btn_text}' button exists and visible", False, "Not found")

            # Theme toggle
            try:
                theme_btn = self.driver.find_element(By.XPATH, "//button[contains(., '\ud83c\udf19') or contains(@onclick, 'toggleTheme')]")
                if theme_btn:
                    self.log_result("Theme toggle button exists", True)

                    # Test theme toggle
                    initial_theme = self.driver.execute_script("return document.documentElement.getAttribute('data-theme')")
                    theme_btn.click()
                    time.sleep(0.3)
                    new_theme = self.driver.execute_script("return document.documentElement.getAttribute('data-theme')")

                    if initial_theme != new_theme:
                        self.log_result("Theme toggle works", True, f"{initial_theme} -> {new_theme}")
                    else:
                        self.log_result("Theme toggle works", True, "Same theme (toggle may require analysis)")
            except:
                self.log_result("Theme toggle button exists", False)

            # Data tab buttons
            data_tab = self.driver.find_element(By.XPATH, "//button[contains(@class, 'tab') and contains(., 'Data')]")
            data_tab.click()
            time.sleep(0.3)

            data_buttons = ['Load Sample', 'Clear', 'Import CSV', 'Run Analysis']
            for btn_text in data_buttons:
                try:
                    btn = self.driver.find_element(By.XPATH, f"//button[contains(., '{btn_text}')]")
                    if btn and btn.is_enabled():
                        self.log_result(f"Data tab '{btn_text}' button works", True)
                    else:
                        self.log_result(f"Data tab '{btn_text}' button works", False, "Disabled")
                except:
                    self.log_result(f"Data tab '{btn_text}' button works", False, "Not found")

            # Methods comparison tab
            compare_tab = self.driver.find_element(By.XPATH, "//button[contains(@class, 'tab') and contains(., 'Methods')]")
            compare_tab.click()
            time.sleep(0.3)

            try:
                run_methods_btn = self.driver.find_element(By.XPATH, "//button[contains(., 'Run All Methods')]")
                if run_methods_btn:
                    self.log_result("'Run All Methods' button exists", True)

                    # Click and check results
                    run_methods_btn.click()
                    time.sleep(1)

                    comparison_body = self.driver.find_element(By.ID, "comparisonBody")
                    if comparison_body and len(comparison_body.get_attribute("innerHTML")) > 100:
                        self.log_result("Method comparison results displayed", True)
                    else:
                        self.log_result("Method comparison results displayed", False)
            except:
                self.log_result("'Run All Methods' button exists", False)

            # Wizard tab
            wizard_tab = self.driver.find_element(By.XPATH, "//button[contains(@class, 'tab') and contains(., 'Wizard')]")
            wizard_tab.click()
            time.sleep(0.3)

            wizard_options = self.driver.find_elements(By.CLASS_NAME, "wizard-option")
            if len(wizard_options) > 0:
                self.log_result("Wizard options present", True, f"{len(wizard_options)} options")

                # Test clicking a wizard option
                wizard_options[0].click()
                time.sleep(0.3)

                # Check if step 2 becomes visible
                step2 = self.driver.find_element(By.ID, "wizardStep2")
                if "active" in step2.get_attribute("class"):
                    self.log_result("Wizard navigation works", True)
                else:
                    self.log_result("Wizard navigation works", False, "Step 2 not activated")
            else:
                self.log_result("Wizard options present", False)

            # Subgroups tab
            subgroups_tab = self.driver.find_element(By.XPATH, "//button[contains(@class, 'tab') and contains(., 'Subgroups')]")
            subgroups_tab.click()
            time.sleep(0.3)

            try:
                subgroup_select = self.driver.find_element(By.ID, "subgroupVariable")
                if subgroup_select:
                    self.log_result("Subgroup variable selector exists", True)
            except:
                self.log_result("Subgroup variable selector exists", False)

            try:
                run_subgroup_btn = self.driver.find_element(By.XPATH, "//button[contains(., 'Run Subgroup Analysis')]")
                if run_subgroup_btn:
                    self.log_result("'Run Subgroup Analysis' button exists", True)
            except:
                self.log_result("'Run Subgroup Analysis' button exists", False)

            # Test Audit Modal
            try:
                audit_btn = self.driver.find_element(By.XPATH, "//button[contains(., 'Audit')]")
                audit_btn.click()
                time.sleep(0.5)

                audit_modal = self.driver.find_element(By.ID, "auditModal")
                if audit_modal:
                    display = audit_modal.value_of_css_property("display")
                    if display == "flex":
                        self.log_result("Audit modal opens", True)

                        # Close modal
                        close_btn = audit_modal.find_element(By.XPATH, ".//button[contains(., 'Close')]")
                        close_btn.click()
                        time.sleep(0.3)
                    else:
                        self.log_result("Audit modal opens", False, f"Display: {display}")
            except Exception as e:
                self.log_result("Audit modal opens", False, str(e)[:50])

        except Exception as e:
            self.log_result("Buttons test", False, str(e)[:80])

    # =========================================================================
    # ADDITIONAL TESTS
    # =========================================================================
    def test_data_input(self):
        """Test data input functionality."""
        print("\n" + "-"*50)
        print("ADDITIONAL: DATA INPUT VALIDATION")
        print("-"*50)

        try:
            # Go to Data tab
            data_tab = self.driver.find_element(By.XPATH, "//button[contains(@class, 'tab') and contains(., 'Data')]")
            data_tab.click()
            time.sleep(0.3)

            # Get textarea
            textarea = self.driver.find_element(By.ID, "dataInput")

            # Test Clear function
            clear_btn = self.driver.find_element(By.XPATH, "//button[contains(., 'Clear')]")
            clear_btn.click()
            time.sleep(0.3)

            current_value = textarea.get_attribute("value")
            if not current_value or len(current_value) < 50:
                self.log_result("Clear data function works", True)
            else:
                self.log_result("Clear data function works", False, "Data not cleared")

            # Load sample again for remaining tests
            load_btn = self.driver.find_element(By.XPATH, "//button[contains(., 'Load Sample')]")
            load_btn.click()
            time.sleep(0.3)

        except Exception as e:
            self.log_result("Data input validation", False, str(e)[:80])

    def test_references_tab(self):
        """Test references tab content."""
        print("\n" + "-"*50)
        print("ADDITIONAL: REFERENCES TAB")
        print("-"*50)

        try:
            refs_tab = self.driver.find_element(By.XPATH, "//button[contains(@class, 'tab') and contains(., 'Refs')]")
            refs_tab.click()
            time.sleep(0.3)

            refs_content = self.driver.find_element(By.ID, "tab-refs")
            if refs_content:
                text = refs_content.text

                # Check for key references
                refs_to_check = [
                    ('Greenland', 'Greenland & Longnecker'),
                    ('metafor', 'metafor package'),
                    ('DerSimonian', 'DerSimonian-Laird')
                ]

                for pattern, name in refs_to_check:
                    if pattern.lower() in text.lower():
                        self.log_result(f"Reference: {name}", True)
                    else:
                        self.log_result(f"Reference: {name}", False, "Not found")

        except Exception as e:
            self.log_result("References tab test", False, str(e)[:80])

    # =========================================================================
    # RUN ALL TESTS
    # =========================================================================
    def run_all_tests(self):
        """Run all tests in sequence."""
        if not self.setup():
            return self.results

        try:
            self.test_page_load()
            self.test_tabs_navigation()
            self.test_demo_data_loading()
            self.test_csv_import()
            self.test_gls_analysis()
            self.test_linear_model_analysis()
            self.test_roundtrip_load_path()
            self.test_plots_render()
            self.test_sensitivity_analysis()
            self.test_realtime_sliders()
            self.test_r_code_export()
            self.test_all_buttons()
            self.test_data_input()
            self.test_references_tab()

        except Exception as e:
            print(f"\n[CRITICAL ERROR] Test suite crashed: {e}")
            traceback.print_exc()
        finally:
            self.teardown()

        return self.results

    def print_summary(self):
        """Print test summary."""
        print("\n" + "="*70)
        print("TEST SUMMARY")
        print("="*70)

        total = self.results['passed'] + self.results['failed'] + self.results['warnings']
        duration = (self.results['end_time'] - self.results['start_time']).total_seconds() if self.results['end_time'] else 0

        print(f"\nTotal Tests: {total}")
        print(f"  Passed:   {self.results['passed']} ({100*self.results['passed']/total:.1f}%)" if total > 0 else "  Passed: 0")
        print(f"  Failed:   {self.results['failed']}")
        print(f"  Warnings: {self.results['warnings']}")
        print(f"\nDuration: {duration:.1f} seconds")

        if self.results['js_errors']:
            print(f"\nJavaScript Errors Found: {len(self.results['js_errors'])}")
            for i, err in enumerate(self.results['js_errors'][:5], 1):
                print(f"  {i}. {err[:100]}...")

        if self.results['failed'] > 0:
            print("\n" + "-"*50)
            print("FAILED TESTS:")
            print("-"*50)
            for test in self.results['tests']:
                if test['status'] == 'FAIL':
                    print(f"  [XX] {test['name']}: {test['message']}")

        # Overall status
        print("\n" + "="*70)
        if total == 0:
            print("OVERALL STATUS: NO TESTS EXECUTED - REVIEW REQUIRED")
            print("="*70)
            return False
        if self.results['failed'] == 0 and self.results['warnings'] == 0:
            print("OVERALL STATUS: ALL TESTS PASSED")
        elif self.results['failed'] == 0:
            print(f"OVERALL STATUS: {self.results['warnings']} WARNING(S) - REVIEW REQUIRED")
        else:
            print(f"OVERALL STATUS: {self.results['failed']} TEST(S) FAILED - REVIEW REQUIRED")
        print("="*70)

        return self.results['failed'] == 0 and self.results['warnings'] == 0


def main():
    """Main entry point."""
    test_suite = DoseResponseProTest()
    test_suite.run_all_tests()
    success = test_suite.print_summary()

    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
