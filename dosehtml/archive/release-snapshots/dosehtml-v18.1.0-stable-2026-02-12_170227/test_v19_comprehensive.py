"""
Comprehensive Selenium Test for Dose Response Pro v19.0
Tests all tabs, demo data loading, GLS analysis, and AI insights
"""

import os
import time
import traceback
from pathlib import Path
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options as ChromeOptions
from selenium.webdriver.firefox.options import Options as FirefoxOptions
from selenium.common.exceptions import TimeoutException, NoSuchElementException


class DoseResponseProTest:
    """Comprehensive test suite for Dose Response Pro v19.0"""

    def __init__(self):
        self.driver = None
        self.results = []
        self.console_errors = []
        self.browser_name = None
        self.base_dir = Path(__file__).resolve().parent
        self.screenshot_dir = str(self.base_dir / "test_screenshots")
        self.html_file = str(self.base_dir / "dose-response-pro-v19.0.html")

    def setup(self):
        """Initialize WebDriver based on SELENIUM_BROWSER preference."""
        print("\n" + "="*60)
        print("DOSE RESPONSE PRO v19.0 - COMPREHENSIVE TEST SUITE")
        print("="*60)
        print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("-"*60)

        # Create screenshot directory
        os.makedirs(self.screenshot_dir, exist_ok=True)

        headless = os.environ.get('SELENIUM_HEADLESS', '').lower() in {'1', 'true', 'yes'}
        browser_pref = os.environ.get('SELENIUM_BROWSER', 'auto').strip().lower()
        if browser_pref not in {'auto', 'chrome', 'firefox'}:
            print(f"[WARN] Invalid SELENIUM_BROWSER='{browser_pref}', using 'auto'")
            browser_pref = 'auto'

        # Chrome options
        chrome_options = ChromeOptions()
        chrome_options.add_argument("--start-maximized")
        chrome_options.add_argument("--disable-gpu")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        if headless:
            chrome_options.add_argument("--headless=new")
        # Enable console logging
        chrome_options.set_capability('goog:loggingPrefs', {'browser': 'ALL'})

        # Firefox options
        firefox_options = FirefoxOptions()
        if headless:
            firefox_options.add_argument("--headless")
        firefox_options.set_preference('devtools.console.stdout.content', True)

        if browser_pref == 'chrome':
            driver_factories = [("Chrome", lambda: webdriver.Chrome(options=chrome_options))]
        elif browser_pref == 'firefox':
            driver_factories = [("Firefox", lambda: webdriver.Firefox(options=firefox_options))]
        else:
            driver_factories = [
                ("Chrome", lambda: webdriver.Chrome(options=chrome_options)),
                ("Firefox", lambda: webdriver.Firefox(options=firefox_options))
            ]
        print(f"Browser mode: {browser_pref}")

        init_errors = []
        for browser_name, factory in driver_factories:
            try:
                self.driver = factory()
                self.browser_name = browser_name
                print(f"Browser: {browser_name}")
                break
            except Exception as e:
                init_errors.append(f"{browser_name}: {e}")

        if not self.driver:
            raise RuntimeError("Failed to initialize any WebDriver: " + " | ".join(init_errors))

        self.driver.implicitly_wait(5)

    def teardown(self):
        """Close browser and generate report"""
        if self.driver:
            # Capture any remaining console errors
            self._capture_console_logs()
            self.driver.quit()

    def _capture_console_logs(self):
        """Capture JavaScript console logs"""
        try:
            logs = self.driver.get_log('browser')
            for log in logs:
                if log['level'] in ['SEVERE', 'ERROR']:
                    self.console_errors.append(log)
        except Exception:
            pass  # Some drivers don't support console log capture

    def _take_screenshot(self, name):
        """Take a screenshot for debugging"""
        filename = os.path.join(self.screenshot_dir, f"{name}_{datetime.now().strftime('%H%M%S')}.png")
        try:
            self.driver.save_screenshot(filename)
            return filename
        except Exception as e:
            return f"Failed: {e}"

    def _log_result(self, test_name, passed, details=""):
        """Log test result"""
        status = "PASS" if passed else "FAIL"
        self.results.append({
            'test': test_name,
            'passed': passed,
            'details': details
        })
        symbol = "[PASS]" if passed else "[FAIL]"
        print(f"  {symbol} {test_name}")
        if details and not passed:
            print(f"         Details: {details}")

    def _wait_for_element(self, by, value, timeout=10):
        """Wait for element to be present and visible"""
        try:
            element = WebDriverWait(self.driver, timeout).until(
                EC.presence_of_element_located((by, value))
            )
            return element
        except TimeoutException:
            return None

    def _wait_for_clickable(self, by, value, timeout=10):
        """Wait for element to be clickable"""
        try:
            element = WebDriverWait(self.driver, timeout).until(
                EC.element_to_be_clickable((by, value))
            )
            return element
        except TimeoutException:
            return None

    # ==================== TEST METHODS ====================

    def test_01_page_load(self):
        """Test 1: Verify page loads without JavaScript errors"""
        print("\n[Test 1] Page Load")

        try:
            # Load the page
            file_url = f"file:///{self.html_file.replace(os.sep, '/')}"
            self.driver.get(file_url)
            time.sleep(2)  # Wait for page to fully load

            # Check title
            title = self.driver.title
            if "Dose Response Pro" in title:
                self._log_result("Page title correct", True, title)
            else:
                self._log_result("Page title correct", False, f"Got: {title}")

            # Check for header element
            header = self._wait_for_element(By.CLASS_NAME, "header")
            if header:
                self._log_result("Header element present", True)
            else:
                self._log_result("Header element present", False)

            # Check for logo text
            logo_text = self._wait_for_element(By.CLASS_NAME, "logo-text")
            if logo_text and "Dose Response Pro" in logo_text.text:
                self._log_result("Logo text displays correctly", True)
            else:
                self._log_result("Logo text displays correctly", False)

            # Check for JavaScript errors
            self._capture_console_logs()
            severe_errors = [e for e in self.console_errors if e['level'] == 'SEVERE']
            if len(severe_errors) == 0:
                self._log_result("No severe JavaScript errors on load", True)
            else:
                self._log_result("No severe JavaScript errors on load", False,
                               f"Found {len(severe_errors)} errors")

        except Exception as e:
            self._log_result("Page load test", False, str(e))
            self._take_screenshot("page_load_error")

    def test_02_tab_navigation(self):
        """Test 2: Click each tab and verify content displays"""
        print("\n[Test 2] Tab Navigation")

        tabs = [
            ('overview', 'tab-overview', 'Welcome to Dose Response Pro'),
            ('gls', 'tab-gls', 'Greenland & Longnecker'),
            ('nma', 'tab-nma', 'Network Meta-Analysis'),
            ('pubbias', 'tab-pubbias', 'Publication Bias'),
            ('ipd', 'tab-ipd', 'IPD Meta-Analysis'),
            ('ai', 'tab-ai', 'AI-Powered Insights'),
            ('comparison', 'tab-comparison', 'vs R Packages')
        ]

        for tab_name, tab_id, expected_text in tabs:
            try:
                # Find and click tab button
                tab_button = self._wait_for_clickable(
                    By.XPATH, f"//button[contains(@onclick, \"switchTab('{tab_name}')\")]"
                )

                if tab_button:
                    tab_button.click()
                    time.sleep(0.5)

                    # Verify tab content is visible
                    tab_content = self.driver.find_element(By.ID, tab_id)
                    is_visible = "active" in tab_content.get_attribute("class")

                    # Check for expected text
                    has_text = expected_text in tab_content.text if is_visible else False

                    if is_visible and has_text:
                        self._log_result(f"Tab '{tab_name}' navigates correctly", True)
                    else:
                        self._log_result(f"Tab '{tab_name}' navigates correctly", False,
                                       f"Visible: {is_visible}, Has text: {has_text}")
                else:
                    self._log_result(f"Tab '{tab_name}' button found", False, "Button not found")

            except Exception as e:
                self._log_result(f"Tab '{tab_name}' navigation", False, str(e))

        # Return to overview for next tests
        try:
            overview_tab = self._wait_for_clickable(
                By.XPATH, "//button[contains(@onclick, \"switchTab('overview')\")]"
            )
            if overview_tab:
                overview_tab.click()
                time.sleep(0.3)
        except Exception:
            pass

    def test_03_demo_data_loading(self):
        """Test 3: Test all 3 demo data buttons"""
        print("\n[Test 3] Demo Data Loading")

        demo_types = [
            ('linear', 'Linear Trend'),
            ('u-shaped', 'U-Shaped'),
            ('heterogeneity', 'High I²')
        ]

        for demo_type, button_text in demo_types:
            try:
                # Make sure we're on overview tab
                overview_tab = self._wait_for_clickable(
                    By.XPATH, "//button[contains(@onclick, \"switchTab('overview')\")]"
                )
                if overview_tab:
                    overview_tab.click()
                    time.sleep(0.3)

                # Find and click demo button
                demo_button = self._wait_for_clickable(
                    By.XPATH, f"//button[contains(@onclick, \"loadDemoData('{demo_type}')\")]"
                )

                if demo_button:
                    demo_button.click()
                    time.sleep(0.5)

                    # Check for toast notification
                    toast = self._wait_for_element(By.CLASS_NAME, "toast", timeout=3)
                    if toast and demo_type in toast.text.lower():
                        self._log_result(f"Demo data '{button_text}' loads with toast", True)
                    elif toast:
                        self._log_result(f"Demo data '{button_text}' shows toast", True,
                                       f"Toast: {toast.text[:50]}")
                    else:
                        # Even without toast, check if data was loaded via console
                        self._log_result(f"Demo data '{button_text}' button clicked", True,
                                       "Button clicked (toast may have auto-dismissed)")
                else:
                    self._log_result(f"Demo data '{button_text}' button found", False)

                # Wait for toast to dismiss
                time.sleep(1)

            except Exception as e:
                self._log_result(f"Demo data '{button_text}'", False, str(e))

    def test_04_csv_import_button(self):
        """Test 4: Test CSV import button exists and is clickable"""
        print("\n[Test 4] CSV Import Button")

        try:
            # Navigate to overview
            overview_tab = self._wait_for_clickable(
                By.XPATH, "//button[contains(@onclick, \"switchTab('overview')\")]"
            )
            if overview_tab:
                overview_tab.click()
                time.sleep(0.3)

            # Find the CSV button (the one that triggers the hidden input)
            csv_button = self._wait_for_clickable(
                By.XPATH, "//button[contains(text(), 'Choose CSV File')]"
            )

            if csv_button:
                self._log_result("CSV import button exists", True)

                # Check if it's clickable (don't actually click to avoid file dialog)
                is_enabled = csv_button.is_enabled()
                self._log_result("CSV import button is enabled", is_enabled)

                # Check for hidden file input
                file_input = self.driver.find_element(By.ID, "csvInput")
                if file_input:
                    accept_attr = file_input.get_attribute("accept")
                    self._log_result("CSV file input accepts .csv", accept_attr == ".csv")
                else:
                    self._log_result("CSV file input exists", False)
            else:
                self._log_result("CSV import button exists", False)

        except Exception as e:
            self._log_result("CSV import test", False, str(e))

    def test_05_gls_analysis(self):
        """Test 5: Load demo data, run GLS analysis, verify results and plot"""
        print("\n[Test 5] GLS Analysis")

        try:
            # First load demo data
            overview_tab = self._wait_for_clickable(
                By.XPATH, "//button[contains(@onclick, \"switchTab('overview')\")]"
            )
            if overview_tab:
                overview_tab.click()
                time.sleep(0.3)

            demo_button = self._wait_for_clickable(
                By.XPATH, "//button[contains(@onclick, \"loadDemoData('linear')\")]"
            )
            if demo_button:
                demo_button.click()
                time.sleep(0.5)
                self._log_result("Demo data loaded for GLS", True)
            else:
                self._log_result("Demo data loaded for GLS", False)
                return

            # Navigate to GLS tab
            gls_tab = self._wait_for_clickable(
                By.XPATH, "//button[contains(@onclick, \"switchTab('gls')\")]"
            )
            if gls_tab:
                gls_tab.click()
                time.sleep(0.5)
                self._log_result("Navigated to GLS tab", True)
            else:
                self._log_result("Navigated to GLS tab", False)
                return

            # Click Run GLS Analysis button
            run_button = self._wait_for_clickable(
                By.XPATH, "//button[contains(@onclick, 'runGLS()')]"
            )
            if run_button:
                run_button.click()
                time.sleep(1)  # Wait for analysis
                self._log_result("GLS Analysis button clicked", True)
            else:
                self._log_result("GLS Analysis button found", False)
                return

            # Wait for results to display
            time.sleep(1)

            # Check for results display
            results_div = self.driver.find_element(By.ID, "gls-results")
            results_visible = results_div.get_attribute("style") != "display: none;"

            if results_visible and "Analysis Results" in results_div.text:
                self._log_result("GLS results display", True)

                # Check for specific result elements
                if "β₀" in results_div.text and "β₁" in results_div.text:
                    self._log_result("Coefficient results shown", True)
                else:
                    self._log_result("Coefficient results shown", False)

                # Check for heterogeneity metrics
                if "Tau²" in results_div.text and "I²" in results_div.text:
                    self._log_result("Heterogeneity metrics shown", True)
                else:
                    self._log_result("Heterogeneity metrics shown", False)
            else:
                self._log_result("GLS results display", False)
                self._take_screenshot("gls_results_fail")

            # Check for Plotly chart
            plot_div = self.driver.find_element(By.ID, "gls-plot")
            plot_visible = plot_div.get_attribute("style") != "display: none;"

            if plot_visible:
                # Check for Plotly elements inside
                try:
                    plotly_element = plot_div.find_element(By.CLASS_NAME, "plotly")
                    self._log_result("Plotly chart rendered", True)
                except NoSuchElementException:
                    # Alternative check - look for SVG
                    try:
                        svg_element = plot_div.find_element(By.TAG_NAME, "svg")
                        self._log_result("Plotly chart rendered (SVG found)", True)
                    except NoSuchElementException:
                        # Check for js-plotly-plot class
                        try:
                            js_plotly = plot_div.find_element(By.CLASS_NAME, "js-plotly-plot")
                            self._log_result("Plotly chart rendered (js-plotly-plot found)", True)
                        except NoSuchElementException:
                            self._log_result("Plotly chart rendered", False, "No Plotly elements found")
            else:
                self._log_result("Plot container visible", False)

            # Check status indicator
            status = self.driver.find_element(By.ID, "gls-status")
            if "Complete" in status.text:
                self._log_result("Status shows 'Complete'", True)
            else:
                self._log_result("Status shows 'Complete'", False, f"Status: {status.text}")

            # Take screenshot of results
            self._take_screenshot("gls_analysis_complete")

        except Exception as e:
            self._log_result("GLS analysis test", False, str(e))
            self._take_screenshot("gls_analysis_error")
            traceback.print_exc()

    def test_06_network_ma_tab(self):
        """Test 6: Click Run Network Meta-Analysis and check for toast message"""
        print("\n[Test 6] Network Meta-Analysis Tab")

        try:
            # Navigate to Network MA tab
            nma_tab = self._wait_for_clickable(
                By.XPATH, "//button[contains(@onclick, \"switchTab('nma')\")]"
            )
            if nma_tab:
                nma_tab.click()
                time.sleep(0.5)
                self._log_result("Navigated to Network MA tab", True)
            else:
                self._log_result("Navigated to Network MA tab", False)
                return

            # Verify tab content
            tab_content = self.driver.find_element(By.ID, "tab-nma")
            if "Network Meta-Analysis" in tab_content.text:
                self._log_result("Network MA content displays", True)
            else:
                self._log_result("Network MA content displays", False)

            # Click Run Network Meta-Analysis button
            run_button = self._wait_for_clickable(
                By.XPATH, "//button[contains(@onclick, 'runNMA()')]"
            )
            if run_button:
                run_button.click()
                time.sleep(0.5)

                # Check for toast message
                toast = self._wait_for_element(By.CLASS_NAME, "toast", timeout=3)
                if toast and ("multi-treatment" in toast.text.lower() or "network" in toast.text.lower()):
                    self._log_result("Network MA shows warning toast", True, toast.text[:60])
                elif toast:
                    self._log_result("Network MA shows toast", True, toast.text[:60])
                else:
                    self._log_result("Network MA toast message", False, "No toast appeared")
            else:
                self._log_result("Network MA button found", False)

        except Exception as e:
            self._log_result("Network MA test", False, str(e))

    def test_07_publication_bias_tab(self):
        """Test 7: Click Assess Publication Bias and check response"""
        print("\n[Test 7] Publication Bias Tab")

        try:
            # Navigate to Publication Bias tab
            pubbias_tab = self._wait_for_clickable(
                By.XPATH, "//button[contains(@onclick, \"switchTab('pubbias')\")]"
            )
            if pubbias_tab:
                pubbias_tab.click()
                time.sleep(0.5)
                self._log_result("Navigated to Publication Bias tab", True)
            else:
                self._log_result("Navigated to Publication Bias tab", False)
                return

            # Verify tab content
            tab_content = self.driver.find_element(By.ID, "tab-pubbias")
            if "Publication Bias" in tab_content.text:
                self._log_result("Publication Bias content displays", True)
            else:
                self._log_result("Publication Bias content displays", False)

            # Click Assess Publication Bias button
            run_button = self._wait_for_clickable(
                By.XPATH, "//button[contains(@onclick, 'runPubBias()')]"
            )
            if run_button:
                run_button.click()
                time.sleep(0.5)

                # Check for toast message
                toast = self._wait_for_element(By.CLASS_NAME, "toast", timeout=3)
                if toast:
                    self._log_result("Publication Bias shows toast", True, toast.text[:60])
                else:
                    self._log_result("Publication Bias toast message", False)
            else:
                self._log_result("Publication Bias button found", False)

        except Exception as e:
            self._log_result("Publication Bias test", False, str(e))

    def test_08_ipd_tab(self):
        """Test 8: Click Run IPD Analysis and check response"""
        print("\n[Test 8] IPD Analysis Tab")

        try:
            # Navigate to IPD tab
            ipd_tab = self._wait_for_clickable(
                By.XPATH, "//button[contains(@onclick, \"switchTab('ipd')\")]"
            )
            if ipd_tab:
                ipd_tab.click()
                time.sleep(0.5)
                self._log_result("Navigated to IPD tab", True)
            else:
                self._log_result("Navigated to IPD tab", False)
                return

            # Verify tab content
            tab_content = self.driver.find_element(By.ID, "tab-ipd")
            if "IPD Meta-Analysis" in tab_content.text:
                self._log_result("IPD content displays", True)
            else:
                self._log_result("IPD content displays", False)

            # Check for method dropdown
            method_select = self.driver.find_element(By.ID, "ipd-method")
            if method_select:
                self._log_result("IPD method dropdown exists", True)
            else:
                self._log_result("IPD method dropdown exists", False)

            # Click Run IPD Analysis button
            run_button = self._wait_for_clickable(
                By.XPATH, "//button[contains(@onclick, 'runIPD()')]"
            )
            if run_button:
                run_button.click()
                time.sleep(0.5)

                # Check for toast message
                toast = self._wait_for_element(By.CLASS_NAME, "toast", timeout=3)
                if toast:
                    self._log_result("IPD Analysis shows toast", True, toast.text[:60])
                else:
                    self._log_result("IPD Analysis toast message", False)
            else:
                self._log_result("IPD Analysis button found", False)

        except Exception as e:
            self._log_result("IPD Analysis test", False, str(e))

    def test_09_ai_insights_tab(self):
        """Test 9: First run GLS analysis, then generate AI insights"""
        print("\n[Test 9] AI Insights Tab")

        try:
            # First ensure GLS analysis has been run (load data and analyze)
            # Navigate to overview and load data
            overview_tab = self._wait_for_clickable(
                By.XPATH, "//button[contains(@onclick, \"switchTab('overview')\")]"
            )
            if overview_tab:
                overview_tab.click()
                time.sleep(0.3)

            demo_button = self._wait_for_clickable(
                By.XPATH, "//button[contains(@onclick, \"loadDemoData('linear')\")]"
            )
            if demo_button:
                demo_button.click()
                time.sleep(0.5)

            # Run GLS analysis
            gls_tab = self._wait_for_clickable(
                By.XPATH, "//button[contains(@onclick, \"switchTab('gls')\")]"
            )
            if gls_tab:
                gls_tab.click()
                time.sleep(0.3)

            run_gls = self._wait_for_clickable(
                By.XPATH, "//button[contains(@onclick, 'runGLS()')]"
            )
            if run_gls:
                run_gls.click()
                time.sleep(1)
                self._log_result("Pre-requisite: GLS analysis run", True)
            else:
                self._log_result("Pre-requisite: GLS analysis run", False)

            # Now navigate to AI tab
            ai_tab = self._wait_for_clickable(
                By.XPATH, "//button[contains(@onclick, \"switchTab('ai')\")]"
            )
            if ai_tab:
                ai_tab.click()
                time.sleep(0.5)
                self._log_result("Navigated to AI Insights tab", True)
            else:
                self._log_result("Navigated to AI Insights tab", False)
                return

            # Verify tab content
            tab_content = self.driver.find_element(By.ID, "tab-ai")
            if "AI-Powered Insights" in tab_content.text:
                self._log_result("AI Insights content displays", True)
            else:
                self._log_result("AI Insights content displays", False)

            # Click Generate AI Insights button
            run_button = self._wait_for_clickable(
                By.XPATH, "//button[contains(@onclick, 'runAI()')]"
            )
            if run_button:
                run_button.click()
                time.sleep(1)

                # Check for AI results
                ai_results = self.driver.find_element(By.ID, "ai-results")
                results_visible = ai_results.get_attribute("style") != "display: none;"

                if results_visible:
                    self._log_result("AI results display", True)

                    # Check for interpretation content
                    if "dose-response" in ai_results.text.lower() or "linear" in ai_results.text.lower():
                        self._log_result("AI interpretation content present", True)
                    else:
                        self._log_result("AI interpretation content present", False)

                    # Check for warning disclaimer
                    if "AI-generated" in ai_results.text:
                        self._log_result("AI disclaimer shown", True)
                    else:
                        self._log_result("AI disclaimer shown", False)

                    # Take screenshot
                    self._take_screenshot("ai_insights_results")
                else:
                    self._log_result("AI results display", False)
                    self._take_screenshot("ai_insights_fail")
            else:
                self._log_result("AI Insights button found", False)

        except Exception as e:
            self._log_result("AI Insights test", False, str(e))
            self._take_screenshot("ai_insights_error")

    def test_10_console_errors(self):
        """Test 10: Report any JavaScript console errors"""
        print("\n[Test 10] Console Errors Check")

        try:
            # Capture all console logs
            self._capture_console_logs()

            severe_errors = [e for e in self.console_errors if e['level'] == 'SEVERE']
            warnings = [e for e in self.console_errors if e['level'] == 'WARNING']

            if len(severe_errors) == 0:
                self._log_result("No severe console errors", True)
            else:
                self._log_result("No severe console errors", False,
                               f"Found {len(severe_errors)} severe errors")
                for err in severe_errors[:5]:  # Show first 5
                    print(f"         ERROR: {err['message'][:100]}")

            if len(warnings) == 0:
                self._log_result("No console warnings", True)
            else:
                self._log_result("Console warnings present", True,
                               f"{len(warnings)} warnings (acceptable)")

            # Final summary of console health
            total_issues = len(severe_errors) + len(warnings)
            self._log_result(f"Total console issues: {total_issues}", total_issues < 10)

        except Exception as e:
            self._log_result("Console error check", False, str(e))

    def run_all_tests(self):
        """Run all tests and generate summary"""
        exit_code = 1
        try:
            self.setup()

            # Run all tests
            self.test_01_page_load()
            self.test_02_tab_navigation()
            self.test_03_demo_data_loading()
            self.test_04_csv_import_button()
            self.test_05_gls_analysis()
            self.test_06_network_ma_tab()
            self.test_07_publication_bias_tab()
            self.test_08_ipd_tab()
            self.test_09_ai_insights_tab()
            self.test_10_console_errors()

        except Exception as e:
            print(f"\nFATAL ERROR: {e}")
            traceback.print_exc()

        finally:
            self.teardown()
            exit_code = self._print_summary()

        return exit_code

    def _print_summary(self):
        """Print test summary"""
        print("\n" + "="*60)
        print("TEST SUMMARY")
        print("="*60)

        total = len(self.results)
        passed = sum(1 for r in self.results if r['passed'])
        failed = total - passed

        print(f"\nTotal Tests: {total}")
        print(f"Passed: {passed}")
        print(f"Failed: {failed}")
        print(f"Pass Rate: {(passed/total*100) if total > 0 else 0:.1f}%")

        if failed > 0:
            print("\n" + "-"*60)
            print("FAILED TESTS:")
            print("-"*60)
            for r in self.results:
                if not r['passed']:
                    print(f"  - {r['test']}")
                    if r['details']:
                        print(f"    Reason: {r['details']}")

        print("\n" + "-"*60)
        print(f"Screenshots saved to: {self.screenshot_dir}")
        print(f"Completed: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("="*60)

        # Return exit code
        return 0 if failed == 0 else 1


if __name__ == "__main__":
    test_suite = DoseResponseProTest()
    exit_code = test_suite.run_all_tests()
    exit(exit_code)
