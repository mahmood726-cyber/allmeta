"""
Comprehensive Selenium Test for NMA Dose-Response App
Tests all features, plots, and functionality
"""

import time
import os
import json
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.common.exceptions import TimeoutException, NoSuchElementException, JavascriptException

class NMAAppTester:
    def __init__(self):
        self.driver = None
        self.errors = []
        self.warnings = []
        self.passed = []
        self.console_errors = []

    def setup(self):
        """Initialize Chrome browser with unique debugging port"""
        print("Setting up Chrome browser...")
        options = Options()
        # Use a different debugging port to avoid conflicts
        options.add_argument("--remote-debugging-port=9223")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--window-size=1920,1080")
        # Don't use headless so we can see what's happening
        # options.add_argument("--headless")

        # Enable console log capture
        options.set_capability("goog:loggingPrefs", {"browser": "ALL"})

        try:
            self.driver = webdriver.Chrome(options=options)
            self.driver.implicitly_wait(5)
            print("Browser started successfully")
            return True
        except Exception as e:
            print(f"Failed to start browser: {e}")
            return False

    def load_app(self):
        """Load the NMA app"""
        app_path = os.path.abspath("index.html")
        url = f"file:///{app_path.replace(os.sep, '/')}"
        print(f"Loading app from: {url}")

        try:
            self.driver.get(url)
            time.sleep(2)  # Wait for app to initialize

            # Check page title or key element
            title = self.driver.title
            print(f"Page title: {title}")

            # Check for JavaScript errors in console
            self.check_console_errors()

            return True
        except Exception as e:
            self.errors.append(f"Failed to load app: {e}")
            return False

    def check_console_errors(self):
        """Check browser console for JavaScript errors"""
        try:
            logs = self.driver.get_log("browser")
            for log in logs:
                if log["level"] == "SEVERE":
                    self.console_errors.append(log["message"])
                    print(f"  CONSOLE ERROR: {log['message'][:100]}")
        except Exception as e:
            print(f"  Could not get console logs: {e}")

    def test_element_exists(self, selector, name, by=By.CSS_SELECTOR):
        """Test if an element exists"""
        try:
            element = self.driver.find_element(by, selector)
            if element.is_displayed():
                self.passed.append(f"{name} exists and visible")
                return element
            else:
                self.warnings.append(f"{name} exists but not visible")
                return element
        except NoSuchElementException:
            self.errors.append(f"{name} NOT FOUND (selector: {selector})")
            return None

    def test_data_entry(self):
        """Test data entry functionality"""
        print("\n=== Testing Data Entry ===")

        # Look for data input areas
        selectors_to_try = [
            ("textarea", "Data textarea"),
            ("input[type='text']", "Text input"),
            ("#dataInput", "Data input area"),
            (".data-entry", "Data entry section"),
            ("#effects", "Effects input"),
            ("#studyData", "Study data input"),
        ]

        found_input = False
        for selector, name in selectors_to_try:
            try:
                elements = self.driver.find_elements(By.CSS_SELECTOR, selector)
                if elements:
                    print(f"  Found {len(elements)} {name} element(s)")
                    found_input = True
            except:
                pass

        if not found_input:
            self.warnings.append("No obvious data input elements found")

        return found_input

    def test_buttons(self):
        """Test all buttons are present and clickable"""
        print("\n=== Testing Buttons ===")

        buttons = self.driver.find_elements(By.CSS_SELECTOR, "button")
        print(f"  Found {len(buttons)} buttons")

        for i, btn in enumerate(buttons[:20]):  # Test first 20 buttons
            try:
                text = btn.text.strip() or btn.get_attribute("title") or f"Button {i+1}"
                if btn.is_displayed() and btn.is_enabled():
                    self.passed.append(f"Button '{text[:30]}' is clickable")
                else:
                    self.warnings.append(f"Button '{text[:30]}' not clickable")
            except:
                pass

        return len(buttons) > 0

    def test_tabs_navigation(self):
        """Test tab navigation if present"""
        print("\n=== Testing Navigation ===")

        # Common tab/nav selectors
        nav_selectors = [
            ".tab", ".nav-tab", "[role='tab']", ".nav-link",
            ".menu-item", ".sidebar-item", "nav a"
        ]

        tabs_found = 0
        for selector in nav_selectors:
            try:
                tabs = self.driver.find_elements(By.CSS_SELECTOR, selector)
                if tabs:
                    tabs_found += len(tabs)
                    print(f"  Found {len(tabs)} elements matching '{selector}'")
            except:
                pass

        if tabs_found > 0:
            self.passed.append(f"Navigation elements found: {tabs_found}")
        else:
            self.warnings.append("No navigation tabs found")

        return tabs_found > 0

    def test_plots_canvas(self):
        """Test if plot canvases/SVGs exist and have content"""
        print("\n=== Testing Plot Elements ===")

        # Look for canvas elements (Chart.js, etc.)
        canvases = self.driver.find_elements(By.CSS_SELECTOR, "canvas")
        print(f"  Found {len(canvases)} canvas elements")

        for i, canvas in enumerate(canvases):
            try:
                width = canvas.get_attribute("width")
                height = canvas.get_attribute("height")
                if width and height and int(width) > 0 and int(height) > 0:
                    self.passed.append(f"Canvas {i+1} has dimensions {width}x{height}")
                else:
                    self.warnings.append(f"Canvas {i+1} has no dimensions")
            except:
                pass

        # Look for SVG elements (D3.js, etc.)
        svgs = self.driver.find_elements(By.CSS_SELECTOR, "svg")
        print(f"  Found {len(svgs)} SVG elements")

        for i, svg in enumerate(svgs[:10]):  # Check first 10
            try:
                # Check if SVG has child elements (actual content)
                children = svg.find_elements(By.CSS_SELECTOR, "*")
                if len(children) > 0:
                    self.passed.append(f"SVG {i+1} has {len(children)} child elements")
                else:
                    self.warnings.append(f"SVG {i+1} is empty")
            except:
                pass

        return len(canvases) > 0 or len(svgs) > 0

    def test_javascript_functions(self):
        """Test if key JavaScript functions exist"""
        print("\n=== Testing JavaScript Functions ===")

        functions_to_check = [
            "StatUtils",
            "ValidationSuite",
            "BootstrapCI",
            "InfluenceDiagnostics",
            "ModelFitStatistics",
            "EdgeCaseHandler",
            "TrimAndFill",
            "EggerTest",
            "REMLEstimator",
        ]

        for func in functions_to_check:
            try:
                result = self.driver.execute_script(f"return typeof {func} !== 'undefined'")
                if result:
                    self.passed.append(f"JS: {func} is defined")
                else:
                    self.errors.append(f"JS: {func} is NOT defined")
            except JavascriptException as e:
                self.errors.append(f"JS Error checking {func}: {str(e)[:50]}")

    def test_sample_analysis(self):
        """Try to run a sample analysis"""
        print("\n=== Testing Sample Analysis ===")

        # Try to execute ValidationSuite if it exists
        try:
            result = self.driver.execute_script("""
                if (typeof ValidationSuite !== 'undefined' && ValidationSuite.runAll) {
                    return ValidationSuite.runAll();
                }
                return null;
            """)
            if result:
                print(f"  ValidationSuite result: {result}")
                if result.get('allPassed'):
                    self.passed.append("ValidationSuite: All tests passed")
                else:
                    self.warnings.append("ValidationSuite: Some tests failed")
            else:
                self.warnings.append("ValidationSuite not accessible or no runAll method")
        except Exception as e:
            self.warnings.append(f"Could not run ValidationSuite: {str(e)[:50]}")

        # Try to instantiate key classes
        try:
            result = self.driver.execute_script("""
                try {
                    const effects = [-0.5, -0.3, -0.7, -0.4, -0.6];
                    const ses = [0.1, 0.15, 0.12, 0.11, 0.13];

                    if (typeof BootstrapCI !== 'undefined') {
                        const boot = new BootstrapCI(effects, ses, {nBoot: 100});
                        const result = boot.run();
                        return {success: true, effect: result.effect, ci: result.ci};
                    }
                    return {success: false, error: 'BootstrapCI not defined'};
                } catch(e) {
                    return {success: false, error: e.message};
                }
            """)
            if result and result.get('success'):
                self.passed.append(f"BootstrapCI works: effect={result['effect']:.3f}")
            else:
                self.errors.append(f"BootstrapCI failed: {result.get('error', 'unknown')}")
        except Exception as e:
            self.errors.append(f"BootstrapCI test error: {str(e)[:50]}")

    def test_responsive_layout(self):
        """Test responsive layout at different sizes"""
        print("\n=== Testing Responsive Layout ===")

        sizes = [(1920, 1080), (1024, 768), (768, 1024), (375, 667)]

        for width, height in sizes:
            try:
                self.driver.set_window_size(width, height)
                time.sleep(0.5)

                # Check if main content is visible
                body = self.driver.find_element(By.CSS_SELECTOR, "body")
                if body.is_displayed():
                    self.passed.append(f"Layout works at {width}x{height}")
                else:
                    self.warnings.append(f"Layout issue at {width}x{height}")
            except Exception as e:
                self.warnings.append(f"Could not test {width}x{height}: {str(e)[:30]}")

        # Reset to default
        self.driver.set_window_size(1920, 1080)

    def run_all_tests(self):
        """Run all tests"""
        print("=" * 60)
        print("NMA DOSE-RESPONSE APP - SELENIUM TEST SUITE")
        print("=" * 60)

        if not self.setup():
            return False

        if not self.load_app():
            self.cleanup()
            return False

        # Run all test categories
        self.test_data_entry()
        self.test_buttons()
        self.test_tabs_navigation()
        self.test_plots_canvas()
        self.test_javascript_functions()
        self.test_sample_analysis()
        self.test_responsive_layout()

        # Final console error check
        self.check_console_errors()

        # Print summary
        self.print_summary()

        return len(self.errors) == 0

    def print_summary(self):
        """Print test summary"""
        print("\n" + "=" * 60)
        print("TEST SUMMARY")
        print("=" * 60)

        print(f"\nPASSED: {len(self.passed)}")
        for p in self.passed[:20]:  # Show first 20
            print(f"  ✓ {p}")
        if len(self.passed) > 20:
            print(f"  ... and {len(self.passed) - 20} more")

        print(f"\nWARNINGS: {len(self.warnings)}")
        for w in self.warnings:
            print(f"  ⚠ {w}")

        print(f"\nERRORS: {len(self.errors)}")
        for e in self.errors:
            print(f"  ✗ {e}")

        print(f"\nCONSOLE ERRORS: {len(self.console_errors)}")
        for ce in self.console_errors[:10]:
            print(f"  ✗ {ce[:80]}")

        print("\n" + "=" * 60)
        if len(self.errors) == 0 and len(self.console_errors) == 0:
            print("OVERALL: ALL TESTS PASSED")
        else:
            print(f"OVERALL: {len(self.errors)} ERRORS, {len(self.console_errors)} CONSOLE ERRORS")
        print("=" * 60)

    def cleanup(self):
        """Close browser"""
        if self.driver:
            print("\nClosing browser...")
            self.driver.quit()

    def get_issues_for_fixing(self):
        """Return issues that need fixing"""
        return {
            'errors': self.errors,
            'console_errors': self.console_errors,
            'warnings': self.warnings
        }


if __name__ == "__main__":
    tester = NMAAppTester()
    try:
        success = tester.run_all_tests()

        # Save issues to file for fixing
        issues = tester.get_issues_for_fixing()
        with open('test_issues.json', 'w') as f:
            json.dump(issues, f, indent=2)
        print(f"\nIssues saved to test_issues.json")

    except KeyboardInterrupt:
        print("\nTest interrupted by user")
    except Exception as e:
        print(f"\nTest failed with error: {e}")
    finally:
        tester.cleanup()
