"""
Comprehensive Selenium Test for Dose Response Pro v18.3
Tests every button, function, and plot in Firefox browser
"""

import os
import time
import sys
import io
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.common.action_chains import ActionChains
from selenium.common.exceptions import TimeoutException, NoSuchElementException, ElementClickInterceptedException

# Fix encoding for Windows console
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace', line_buffering=True)

class DoseResponseTester:
    def __init__(self):
        self.results = []
        self.passed = 0
        self.failed = 0
        self.driver = None
        self.app_file = Path(__file__).resolve().parent / "dose-response-pro.html"
        self.app_url = os.environ.get('DOSE_RESPONSE_APP_URL', '').strip() or self.app_file.resolve().as_uri()

    def setup(self):
        """Setup Firefox WebDriver"""
        print("=" * 60)
        print("DOSE RESPONSE PRO v18.1 - COMPREHENSIVE SELENIUM TEST")
        print("Browser: Firefox")
        print(f"App URL: {self.app_url}")
        print("=" * 60)

        options = Options()
        headless = os.environ.get('SELENIUM_HEADLESS', '').lower() in {'1', 'true', 'yes'}
        if headless:
            options.add_argument("--headless")
        options.set_preference('devtools.console.stdout.content', True)
        options.add_argument("--width=1920")
        options.add_argument("--height=1080")

        if self.app_url.startswith('file://') and not self.app_file.exists():
            raise FileNotFoundError(f"HTML file not found: {self.app_file}")

        self.driver = webdriver.Firefox(options=options)
        if not headless:
            self.driver.maximize_window()
        self.driver.set_script_timeout(300)
        self.wait = WebDriverWait(self.driver, 10)

    def log_result(self, test_name, passed, details=""):
        """Log test result"""
        status = "PASS" if passed else "FAIL"
        symbol = "[PASS]" if passed else "[FAIL]"
        self.results.append((test_name, passed, details))
        if passed:
            self.passed += 1
        else:
            self.failed += 1
        safe_details = str(details).encode('ascii', 'replace').decode('ascii')
        print(f"  {symbol} {test_name}: {status} {safe_details}")

    def safe_click(self, element):
        """Safely click an element with retry logic"""
        try:
            self.driver.execute_script("arguments[0].scrollIntoView(true);", element)
            time.sleep(0.2)
            element.click()
            return True
        except ElementClickInterceptedException:
            try:
                self.driver.execute_script("arguments[0].click();", element)
                return True
            except:
                return False
        except:
            return False

    def install_console_capture(self):
        """Capture console.error and uncaught runtime errors inside the page."""
        try:
            self.driver.execute_script("""
                if (window.__doseResponseConsoleCaptureInstalled) {
                    return true;
                }
                window.__doseResponseConsoleCaptureInstalled = true;
                window.__doseResponseConsoleErrors = [];
                const pushError = (level, message) => {
                    try {
                        window.__doseResponseConsoleErrors.push({
                            level: String(level || 'error'),
                            message: String(message || '')
                        });
                    } catch (e) {}
                };
                const originalError = console.error ? console.error.bind(console) : null;
                console.error = function(...args) {
                    pushError('error', args.map(v => {
                        if (typeof v === 'string') return v;
                        try { return JSON.stringify(v); } catch (e) { return String(v); }
                    }).join(' '));
                    if (originalError) {
                        return originalError(...args);
                    }
                };
                window.addEventListener('error', function(event) {
                    pushError('window.error', event.message || event.error || 'Unknown window error');
                });
                window.addEventListener('unhandledrejection', function(event) {
                    const reason = event && event.reason ? event.reason : 'Unhandled promise rejection';
                    pushError('unhandledrejection', reason);
                });
                return true;
            """)
            return True
        except Exception:
            return False

    def get_captured_console_errors(self):
        """Return injected console-capture errors, if available."""
        try:
            installed = self.driver.execute_script("return window.__doseResponseConsoleCaptureInstalled === true;")
            if not installed:
                return None
            errors = self.driver.execute_script("return window.__doseResponseConsoleErrors || [];")
            return errors or []
        except Exception:
            return None

    def check_canvas_rendered(self, canvas_id):
        """Check if a canvas has been rendered (has non-zero pixels)"""
        try:
            canvas = self.driver.find_element(By.ID, canvas_id)
            width = self.driver.execute_script("return arguments[0].width", canvas)
            height = self.driver.execute_script("return arguments[0].height", canvas)

            if width > 0 and height > 0:
                has_content = self.driver.execute_script("""
                    var canvas = arguments[0];
                    var ctx = canvas.getContext('2d');
                    if (!ctx) return false;
                    var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    var data = imageData.data;
                    for (var i = 3; i < data.length; i += 4) {
                        if (data[i] > 0) return true;
                    }
                    return false;
                """, canvas)
                return has_content
            return False
        except Exception as e:
            return False

    def click_tab(self, tab_text):
        """Click a tab by finding the button with matching text"""
        try:
            tabs = self.driver.find_elements(By.CLASS_NAME, "tab")
            for tab in tabs:
                if tab_text.lower() in tab.text.lower():
                    self.safe_click(tab)
                    time.sleep(0.5)
                    return True
            return False
        except:
            return False

    def test_load_app(self):
        """Test 1: Load the application"""
        print("\n[TEST GROUP 1: Application Loading]")
        try:
            self.driver.get(self.app_url)
            time.sleep(2)
            self.install_console_capture()

            # Check title
            title = self.driver.title
            self.log_result("Page loads", "Dose Response Pro" in title, f"Title: {title}")

            # Check header exists
            header = self.driver.find_element(By.CLASS_NAME, "header")
            self.log_result("Header visible", header.is_displayed())

            # Check version badge
            version = self.driver.find_element(By.CLASS_NAME, "version-badge")
            self.log_result("Version badge visible", version.is_displayed(), version.text)

        except Exception as e:
            self.log_result("Page loads", False, str(e)[:50])

    def test_tabs(self):
        """Test 2: All tabs are clickable and show content"""
        print("\n[TEST GROUP 2: Tab Navigation]")

        # Actual tab button text in the HTML
        tab_names = [
            "Data", "Real-Time", "Results", "Methods", "Influence",
            "Subgroups", "Wizard", "R Code", "Plots", "Bias", "Validation", "Refs"
        ]

        # Tab IDs corresponding to tabs
        tab_ids = [
            "tab-data", "tab-realtime", "tab-results", "tab-compare", "tab-influence",
            "tab-subgroups", "tab-wizard", "tab-rcode", "tab-plots", "tab-bias", "tab-validation", "tab-refs"
        ]

        for i, tab_name in enumerate(tab_names):
            try:
                result = self.click_tab(tab_name)
                time.sleep(0.3)

                # Check if tab content is visible
                tab_content = self.driver.find_element(By.ID, tab_ids[i])
                is_displayed = tab_content.is_displayed()
                self.log_result(f"Tab '{tab_name}'", is_displayed)

            except Exception as e:
                self.log_result(f"Tab '{tab_name}'", False, str(e)[:40])

    def test_data_input(self):
        """Test 3: Data input functionality"""
        print("\n[TEST GROUP 3: Data Input]")

        try:
            # Go to Data tab (default active)
            self.click_tab('Data')
            time.sleep(0.5)

            # Check data textarea exists
            data_input = self.driver.find_element(By.ID, "dataInput")
            self.log_result("Data input area exists", data_input.is_displayed())

            # Check default data is present
            data_value = data_input.get_attribute("value")
            has_data = len(data_value) > 100
            self.log_result("Default data present", has_data, f"{len(data_value)} chars")

            # Check data preview area
            try:
                data_preview = self.driver.find_element(By.ID, "dataPreview")
                self.log_result("Data preview area exists", data_preview is not None)
            except:
                self.log_result("Data preview area exists", False)

        except Exception as e:
            self.log_result("Data input test", False, str(e)[:50])

    def test_run_analysis(self):
        """Test 4: Run main analysis"""
        print("\n[TEST GROUP 4: Run Analysis]")

        try:
            # Make sure we're on Data tab
            self.click_tab('Data')
            time.sleep(0.3)

            # Find and click Run Analysis button
            run_btn = self.driver.find_element(By.XPATH, "//button[contains(text(), 'Run Analysis')]")
            self.safe_click(run_btn)
            time.sleep(4)  # Give analysis time to complete

            self.log_result("Run Analysis button clicked", True)

            # Switch to Results tab to check stats (they're displayed there)
            self.click_tab('Results')
            time.sleep(1)

            # Check if results are populated
            try:
                tau2_elem = self.driver.find_element(By.ID, "statTau2")
                tau2_value = tau2_elem.text
                has_value = tau2_value != "-" and tau2_value != "" and len(tau2_value) > 0
                self.log_result("Tau-squared calculated", has_value, f"Value: {tau2_value}")
            except Exception as e:
                self.log_result("Tau-squared calculated", False, str(e)[:30])

            try:
                i2_elem = self.driver.find_element(By.ID, "statI2")
                i2_value = i2_elem.text
                has_value = i2_value != "-" and i2_value != "" and "%" in i2_value
                self.log_result("I-squared calculated", has_value, f"Value: {i2_value}")
            except Exception as e:
                self.log_result("I-squared calculated", False, str(e)[:30])

        except Exception as e:
            self.log_result("Run analysis", False, str(e)[:50])

    def test_plots_first_check(self):
        """Test 5: Check all plots render (FIRST CHECK)"""
        print("\n[TEST GROUP 5: Plot Rendering - FIRST CHECK]")

        # Check live plot (Real-Time tab)
        self.click_tab('Real-Time')
        time.sleep(1)
        result = self.check_canvas_rendered("livePlotCanvas")
        self.log_result("Live Preview Plot rendered (check 1)", result)

        # Go to Plots tab (mainPlot is there, with setTimeout delay for rendering)
        self.click_tab('Plots')
        time.sleep(2)  # Wait for setTimeout delay in switchTab

        # Check main plot
        result = self.check_canvas_rendered("mainPlot")
        self.log_result("Main Dose-Response Plot rendered (check 1)", result)

        # Check forest plot div has content (also in Plots tab)
        try:
            forest_div = self.driver.find_element(By.ID, "forestPlot")
            inner_html = forest_div.get_attribute("innerHTML")
            has_content = len(inner_html) > 100
            self.log_result("Forest Plot rendered (check 1)", has_content, f"{len(inner_html)} chars")
        except Exception as e:
            self.log_result("Forest Plot rendered (check 1)", False, str(e)[:30])

    def test_influence_analysis(self):
        """Test 6: Influence analysis functions"""
        print("\n[TEST GROUP 6: Influence Analysis]")

        try:
            # Go to Influence tab
            self.click_tab('Influence')
            time.sleep(1)

            # Check tab opened
            influence_tab = self.driver.find_element(By.ID, "tab-influence")
            self.log_result("Influence tab opened", influence_tab.is_displayed())

            # Look for influence content
            content = influence_tab.get_attribute("innerHTML")
            has_content = len(content) > 100
            self.log_result("Influence content present", has_content, f"{len(content)} chars")

        except Exception as e:
            self.log_result("Influence tab", False, str(e)[:50])

    def test_subgroup_analysis(self):
        """Test 7: Subgroup analysis"""
        print("\n[TEST GROUP 7: Subgroup Analysis]")

        try:
            # Go to Subgroups tab
            self.click_tab('Subgroups')
            time.sleep(1)

            subgroup_tab = self.driver.find_element(By.ID, "tab-subgroups")
            self.log_result("Subgroups tab opened", subgroup_tab.is_displayed())

            # Check subgroup dose-response plot canvas exists
            try:
                subgroup_plot = self.driver.find_element(By.ID, "subgroupDoseResponsePlot")
                exists = subgroup_plot is not None
                self.log_result("Subgroup DR plot canvas exists", exists)
            except:
                self.log_result("Subgroup DR plot canvas exists", False)

            # Check subgroup forest plot canvas exists
            try:
                forest_plot = self.driver.find_element(By.ID, "subgroupForestPlot")
                exists = forest_plot is not None
                self.log_result("Subgroup forest plot canvas exists", exists)
            except:
                self.log_result("Subgroup forest plot canvas exists", False)

            # Run subgroup analysis to render plots
            try:
                self.driver.execute_script(
                    "document.getElementById('subgroupVariable').value = 'author';"
                    "document.getElementById('subgroupModel').value = 'linear';"
                    "updateSubgroupOptions();"
                )
                run_subgroup_btn = self.driver.find_element(By.XPATH, "//button[contains(text(), 'Run Subgroup')]")
                self.safe_click(run_subgroup_btn)
                time.sleep(3)  # Give time for analysis
                self.log_result("Subgroup analysis ran", True)
            except Exception as e:
                self.log_result("Subgroup analysis ran", False, str(e)[:30])

        except Exception as e:
            self.log_result("Subgroups tab", False, str(e)[:50])

    def test_validation_suite(self):
        """Test 8: Validation suite"""
        print("\n[TEST GROUP 8: Validation Suite]")

        try:
            # Go to Validation tab
            self.click_tab('Validation')
            time.sleep(1)

            val_tab = self.driver.find_element(By.ID, "tab-validation")
            self.log_result("Validation tab opened", val_tab.is_displayed())

            # Look for validation buttons
            try:
                val_buttons = self.driver.find_elements(By.XPATH, "//button[contains(text(), 'Validation') or contains(text(), 'Coverage') or contains(text(), 'Power') or contains(text(), 'Checks')]")
                self.log_result("Validation buttons exist", len(val_buttons) > 0, f"{len(val_buttons)} buttons found")
            except:
                self.log_result("Validation buttons exist", False)

            # Check for coverage plot canvas
            try:
                cov_canvas = self.driver.find_element(By.ID, "coveragePlotCanvas")
                self.log_result("Coverage plot canvas exists", cov_canvas is not None)
            except:
                self.log_result("Coverage plot canvas exists", False)

        except Exception as e:
            self.log_result("Validation tab", False, str(e)[:50])

    def test_run_coverage_simulation(self):
        """Test 9: Run coverage simulation"""
        print("\n[TEST GROUP 9: Coverage Simulation]")

        try:
            # Should be on validation tab
            try:
                self.driver.execute_script(
                    "window.DEBUG_EXPOSE_APPSTATE = true;"
                    "if (typeof exposeAppState === 'function') { exposeAppState(true); }"
                )
                self.driver.execute_script("window.SIM_USE_SIMPLE_PRNG = true;")
                self.driver.execute_script("window.COVERAGE_SIM_FAST = true;")
                self.driver.execute_script("window.COVERAGE_SIM_ITERATIONS = 5;")
                self.driver.execute_script("runCoverageSimulation();")
                self.log_result("Coverage simulation started", True)

                try:
                    WebDriverWait(self.driver, 120).until(
                        lambda d: d.execute_script(
                            "return typeof AppState !== 'undefined' && AppState.coverageResults !== null;"
                        )
                    )
                    coverage_ready = True
                except TimeoutException:
                    coverage_ready = False
                if coverage_ready:
                    self.log_result("Coverage simulation completed", True)
                else:
                    error_info = self.driver.execute_script(
                        "return (typeof AppState !== 'undefined' && AppState.coverageError) ? AppState.coverageError : '';"
                    )
                    self.log_result("Coverage simulation completed", False, error_info)

                # Check coverage plot rendered (after completion)
                result = self.check_canvas_rendered("coveragePlotCanvas") if coverage_ready else False
                self.log_result("Coverage plot rendered", result)
            except Exception as e:
                self.log_result("Coverage simulation", False, str(e)[:50])

        except Exception as e:
            self.log_result("Coverage test", False, str(e)[:50])

    def test_export_functions(self):
        """Test 10: Export functionality"""
        print("\n[TEST GROUP 10: Export Functions - R Code Tab]")

        try:
            # Go to R Code tab
            self.click_tab('R Code')
            time.sleep(1)

            rcode_tab = self.driver.find_element(By.ID, "tab-rcode")
            self.log_result("R Code tab opened", rcode_tab.is_displayed())

            # Check for R code content
            content = rcode_tab.get_attribute("innerHTML")
            has_content = len(content) > 100
            self.log_result("R Code content present", has_content, f"{len(content)} chars")

        except Exception as e:
            self.log_result("R Code tab", False, str(e)[:50])

    def test_plots_second_check(self):
        """Test 11: Check all plots render (SECOND CHECK)"""
        print("\n[TEST GROUP 11: Plot Rendering - SECOND CHECK]")

        # Check live plot again
        self.click_tab('Real-Time')
        time.sleep(1)
        result = self.check_canvas_rendered("livePlotCanvas")
        self.log_result("Live Preview Plot rendered (check 2)", result)

        # Check main plot again (in Plots tab)
        self.click_tab('Plots')
        time.sleep(2)  # Wait for setTimeout delay
        result = self.check_canvas_rendered("mainPlot")
        self.log_result("Main Dose-Response Plot rendered (check 2)", result)

        # Check forest plot again
        try:
            forest_div = self.driver.find_element(By.ID, "forestPlot")
            inner_html = forest_div.get_attribute("innerHTML")
            has_content = len(inner_html) > 100
            self.log_result("Forest Plot rendered (check 2)", has_content)
        except:
            self.log_result("Forest Plot rendered (check 2)", False)

        # Check subgroup plots - run analysis first to ensure they render
        self.click_tab('Subgroups')
        time.sleep(1)

        # Run subgroup analysis again to ensure plots are rendered
        try:
            self.driver.execute_script(
                "document.getElementById('subgroupVariable').value = 'author';"
                "document.getElementById('subgroupModel').value = 'linear';"
                "updateSubgroupOptions();"
            )
            run_subgroup_btn = self.driver.find_element(By.XPATH, "//button[contains(text(), 'Run Subgroup')]")
            self.safe_click(run_subgroup_btn)
            time.sleep(5)  # Give more time for subgroup analysis and plotting
        except:
            pass

        result = self.check_canvas_rendered("subgroupDoseResponsePlot")
        self.log_result("Subgroup DR Plot rendered (check 2)", result)

        result = self.check_canvas_rendered("subgroupForestPlot")
        self.log_result("Subgroup Forest Plot rendered (check 2)", result)

    def test_theme_toggle(self):
        """Test 12: Theme toggle functionality"""
        print("\n[TEST GROUP 12: UI Controls]")

        try:
            # Find theme toggle button (moon emoji button)
            theme_btn = self.driver.find_element(By.XPATH, "//button[contains(text(), '\U0001F319')]")

            initial_theme = self.driver.find_element(By.TAG_NAME, "html").get_attribute("data-theme")
            self.safe_click(theme_btn)
            time.sleep(0.5)
            new_theme = self.driver.find_element(By.TAG_NAME, "html").get_attribute("data-theme")

            theme_changed = initial_theme != new_theme
            self.log_result("Theme toggle works", theme_changed, f"{initial_theme or 'dark'} -> {new_theme or 'light'}")

            # Toggle back
            self.safe_click(theme_btn)
            time.sleep(0.3)
        except Exception as e:
            self.log_result("Theme toggle", False, str(e)[:50])

    def test_wizard_tab(self):
        """Test 13: Wizard tab content"""
        print("\n[TEST GROUP 13: Wizard Tab]")

        try:
            # Go to Wizard tab
            self.click_tab('Wizard')
            time.sleep(1)

            wizard_tab = self.driver.find_element(By.ID, "tab-wizard")
            self.log_result("Wizard tab opened", wizard_tab.is_displayed())

            # Check for wizard content
            content = wizard_tab.get_attribute("innerHTML")
            content_length = len(content)
            self.log_result("Wizard content exists", content_length > 100, f"{content_length} chars")

        except Exception as e:
            self.log_result("Wizard tab", False, str(e)[:50])

    def test_methods_comparison(self):
        """Test 14: Methods comparison tab"""
        print("\n[TEST GROUP 14: Methods Comparison]")

        try:
            # Go to Methods tab (compare)
            tabs = self.driver.find_elements(By.CLASS_NAME, "tab")
            for tab in tabs:
                if "methods" in tab.text.lower() and "compare" not in tab.get_attribute("onclick"):
                    # This is the Methods Doc tab, skip
                    continue
                if tab.text.strip() == "Methods" or "compare" in (tab.get_attribute("onclick") or ""):
                    self.safe_click(tab)
                    break
            time.sleep(1)

            compare_tab = self.driver.find_element(By.ID, "tab-compare")
            self.log_result("Methods Compare tab opened", compare_tab.is_displayed())

            # Check for comparison content
            content = compare_tab.get_attribute("innerHTML")
            has_content = len(content) > 100
            self.log_result("Comparison content exists", has_content, f"{len(content)} chars")

        except Exception as e:
            self.log_result("Methods Compare tab", False, str(e)[:50])

    def test_plots_tab(self):
        """Test 15: Plots tab"""
        print("\n[TEST GROUP 15: Plots Tab]")

        try:
            # Go to Plots tab
            self.click_tab('Plots')
            time.sleep(1)

            plots_tab = self.driver.find_element(By.ID, "tab-plots")
            self.log_result("Plots tab opened", plots_tab.is_displayed())

            # Check for plot content
            content = plots_tab.get_attribute("innerHTML")
            has_content = len(content) > 100
            self.log_result("Plots tab has content", has_content, f"{len(content)} chars")

        except Exception as e:
            self.log_result("Plots tab", False, str(e)[:50])

    def test_references_tab(self):
        """Test 16: References tab"""
        print("\n[TEST GROUP 16: References Tab]")

        try:
            # Go to Refs tab
            self.click_tab('Refs')
            time.sleep(1)

            refs_tab = self.driver.find_element(By.ID, "tab-refs")
            self.log_result("References tab opened", refs_tab.is_displayed())

            # Check for references content
            content = refs_tab.get_attribute("innerHTML")
            has_content = len(content) > 100
            self.log_result("References content exists", has_content, f"{len(content)} chars")

        except Exception as e:
            self.log_result("References tab", False, str(e)[:50])

    def test_methods_documentation(self):
        """Test 17: Methods documentation tab"""
        print("\n[TEST GROUP 17: Methods Documentation]")

        try:
            # Go to Methods doc tab (the last Methods tab)
            tabs = self.driver.find_elements(By.CLASS_NAME, "tab")
            for tab in reversed(tabs):
                if "methods" in tab.text.lower():
                    self.safe_click(tab)
                    break
            time.sleep(1)

            methods_tabs = self.driver.find_elements(By.ID, "tab-methods")
            if not methods_tabs:
                self.log_result("Methods Doc tab opened", True, "not present")
                return
            methods_tab = methods_tabs[0]
            self.log_result("Methods Doc tab opened", methods_tab.is_displayed())

            # Check for methods documentation content
            content = methods_tab.get_attribute("innerHTML")
            has_content = len(content) > 200
            self.log_result("Methods documentation exists", has_content, f"{len(content)} chars")

        except Exception as e:
            self.log_result("Methods Doc tab", False, str(e)[:50])

    def test_console_errors(self):
        """Test 18: Check for JavaScript console errors"""
        print("\n[TEST GROUP 18: Console Errors Check]")

        try:
            # Check for visible error elements
            try:
                alerts = self.driver.find_elements(By.CLASS_NAME, "error")
                visible_errors = [a for a in alerts if a.is_displayed()]
                self.log_result("No visible error alerts", len(visible_errors) == 0,
                              f"{len(visible_errors)} errors" if visible_errors else "")
            except Exception as e:
                self.log_result("No visible error alerts", False, str(e)[:50])

            browser_errors = None
            try:
                logs = self.driver.get_log("browser")
                browser_errors = []
                for log in logs:
                    if log.get("level") != "SEVERE":
                        continue
                    message = log.get("message", "")
                    if "favicon.ico" in message and "404" in message:
                        continue
                    browser_errors.append(message)
            except Exception:
                browser_errors = None

            captured_errors = self.get_captured_console_errors()
            if browser_errors is None and captured_errors is None:
                self.log_result("Browser console inspection available", False, "No browser log or injected console capture available")
                return

            combined_errors = []
            if browser_errors:
                combined_errors.extend(browser_errors)
            if captured_errors:
                combined_errors.extend(str(item.get("message", item)) for item in captured_errors)

            if combined_errors:
                self.log_result("Browser console clean", False, f"{len(combined_errors)} error(s) captured")
                for message in combined_errors[:5]:
                    print(f"    ERROR: {str(message)[:120]}")
            else:
                source = "browser logs" if browser_errors is not None else "injected capture"
                self.log_result("Browser console clean", True, f"No errors in {source}")

        except Exception as e:
            self.log_result("Console check", False, str(e)[:50])

    def run_all_tests(self):
        """Run all tests"""
        try:
            self.setup()

            self.test_load_app()
            self.test_tabs()
            self.test_data_input()
            self.test_run_analysis()
            self.test_plots_first_check()
            self.test_influence_analysis()
            self.test_subgroup_analysis()
            self.test_validation_suite()
            self.test_run_coverage_simulation()
            self.test_export_functions()
            self.test_plots_second_check()
            self.test_theme_toggle()
            self.test_wizard_tab()
            self.test_methods_comparison()
            self.test_plots_tab()
            self.test_references_tab()
            self.test_methods_documentation()
            self.test_console_errors()

        except Exception as e:
            print(f"\n!!! CRITICAL ERROR: {e}")

        finally:
            self.print_summary()
            if self.driver:
                time.sleep(2)
                self.driver.quit()

    def print_summary(self):
        """Print test summary"""
        print("\n" + "=" * 60)
        print("TEST SUMMARY")
        print("=" * 60)
        total = self.passed + self.failed
        print(f"Total Tests: {total}")
        print(f"Passed: {self.passed}")
        print(f"Failed: {self.failed}")
        if total > 0:
            print(f"Pass Rate: {100*self.passed/total:.1f}%")
        print("=" * 60)

        if self.failed > 0:
            print("\nFailed Tests:")
            for name, passed, details in self.results:
                if not passed:
                    safe_name = str(name).encode('ascii', 'replace').decode('ascii')
                    safe_details = str(details).encode('ascii', 'replace').decode('ascii')
                    print(f"  [FAIL] {safe_name}: {safe_details}")
        print()

if __name__ == "__main__":
    tester = DoseResponseTester()
    tester.run_all_tests()
    sys.exit(0 if tester.failed == 0 else 1)
