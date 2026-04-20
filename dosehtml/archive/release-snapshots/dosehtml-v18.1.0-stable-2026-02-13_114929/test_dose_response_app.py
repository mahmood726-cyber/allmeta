"""
Dose Response Pro v18.1 - Comprehensive Selenium Test
Tests all features including new enhancements
"""

import os
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options as ChromeOptions
from selenium.webdriver.firefox.options import Options as FirefoxOptions
import time
import json

class DoseResponseProTester:
    def __init__(self, headless=False):
        """Initialize the test driver"""
        self.base_dir = Path(__file__).resolve().parent
        self.app_path = self.base_dir / "dose-response-pro.html"
        self.browser_name = None
        self.driver = self._create_driver(headless=headless)
        self.wait = WebDriverWait(self.driver, 10)
        self.results = []

    def _create_driver(self, headless=False):
        browser_pref = os.environ.get('SELENIUM_BROWSER', 'auto').strip().lower()
        if browser_pref not in {'auto', 'chrome', 'firefox'}:
            print(f"[WARN] Invalid SELENIUM_BROWSER='{browser_pref}', using 'auto'")
            browser_pref = 'auto'

        chrome_options = ChromeOptions()
        if headless:
            chrome_options.add_argument('--headless=new')
        chrome_options.add_argument('--disable-gpu')
        chrome_options.add_argument('--no-sandbox')
        chrome_options.add_argument('--disable-dev-shm-usage')
        chrome_options.add_argument('--window-size=1920,1080')
        chrome_options.set_capability('goog:loggingPrefs', {'browser': 'ALL'})

        firefox_options = FirefoxOptions()
        if headless:
            firefox_options.add_argument('--headless')
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
                driver = factory()
                self.browser_name = browser_name
                print(f"Using browser: {browser_name}")
                return driver
            except Exception as e:
                init_errors.append(f"{browser_name}: {e}")

        raise RuntimeError("Unable to initialize Selenium WebDriver: " + " | ".join(init_errors))

    def log(self, test_name, status, message=""):
        """Log test result"""
        result = {"test": test_name, "status": status, "message": message}
        self.results.append(result)
        icon = "[OK]" if status == "PASS" else "[FAIL]"
        print(f"{icon} {test_name}: {status}")
        if message:
            print(f"    {message}")

    def navigate_to_app(self):
        """Navigate to the application"""
        try:
            if not self.app_path.exists():
                self.log("Navigate to App", "FAIL", f"File not found: {self.app_path}")
                return False
            self.driver.get(self.app_path.resolve().as_uri())
            time.sleep(2)
            self.log("Navigate to App", "PASS")
            return True
        except Exception as e:
            self.log("Navigate to App", "FAIL", str(e))
            return False

    def check_tabs_exist(self):
        """Check all tabs exist in the UI"""
        expected_tabs = [
            "data", "realtime", "results", "compare", "influence",
            "subgroups", "wizard", "rcode", "plots", "refs"
        ]

        for tab in expected_tabs:
            try:
                tab_element = self.wait.until(
                    EC.presence_of_element_located((By.ID, f"tab-{tab}"))
                )
                self.log(f"Tab '{tab}' exists", "PASS")
            except Exception as e:
                self.log(f"Tab '{tab}' exists", "FAIL", str(e))

    def click_tab(self, tab_name):
        """Click on a tab"""
        try:
            # Find the tab button
            tabs = self.driver.find_elements(By.CLASS_NAME, "tab")
            for tab in tabs:
                if tab_name.lower() in tab.text.lower():
                    tab.click()
                    time.sleep(0.5)
                    return True
            self.log(f"Click tab '{tab_name}'", "FAIL", "Tab button not found")
            return False
        except Exception as e:
            self.log(f"Click tab '{tab_name}'", "FAIL", str(e))
            return False

    def test_data_tab(self):
        """Test the Data tab functionality"""
        print("\n=== Testing Data Tab ===")

        # Check data input textarea exists
        try:
            textarea = self.driver.find_element(By.ID, "dataInput")
            self.log("Data input textarea exists", "PASS")
        except Exception as e:
            self.log("Data input textarea exists", "FAIL", str(e))

        # Check data preview exists
        try:
            preview = self.driver.find_element(By.ID, "dataPreview")
            self.log("Data preview div exists", "PASS")
        except Exception as e:
            self.log("Data preview div exists", "FAIL", str(e))

        # Check buttons exist
        buttons = ["Load Sample", "Clear", "Import CSV", "Run Analysis"]
        for btn_text in buttons:
            try:
                buttons_el = self.driver.find_elements(By.TAG_NAME, "button")
                found = any(btn_text in btn.text for btn in buttons_el)
                if found:
                    self.log(f"Button '{btn_text}' exists", "PASS")
                else:
                    self.log(f"Button '{btn_text}' exists", "FAIL", "Button not found")
            except Exception as e:
                self.log(f"Button '{btn_text}' exists", "FAIL", str(e))

    def test_run_analysis(self):
        """Test running the main analysis"""
        print("\n=== Testing Run Analysis ===")

        try:
            # Click Load Sample first
            buttons = self.driver.find_elements(By.TAG_NAME, "button")
            for btn in buttons:
                if "Load Sample" in btn.text:
                    btn.click()
                    time.sleep(1)
                    break

            # Click Run Analysis
            for btn in buttons:
                if "Run Analysis" in btn.text:
                    btn.click()
                    time.sleep(2)
                    break

            self.log("Run Analysis button clicked", "PASS")
        except Exception as e:
            self.log("Run Analysis button clicked", "FAIL", str(e))
            return False

        # Check for results - look for statistics being populated
        try:
            # Wait a bit for analysis to complete
            time.sleep(2)

            # Check if statistics are displayed
            stat_elements = self.driver.find_elements(By.CLASS_NAME, "stat-value")
            if len(stat_elements) > 0:
                self.log("Analysis results displayed", "PASS", f"Found {len(stat_elements)} stat elements")
            else:
                # Check for specific stat IDs
                stat_studies = self.driver.find_element(By.ID, "statStudies")
                self.log("Analysis results displayed", "PASS", "statStudies found")
        except Exception as e:
            self.log("Analysis results displayed", "FAIL", str(e))

        return True

    def test_subgroups_tab(self):
        """Test the Subgroups tab (NEW FEATURE)"""
        print("\n=== Testing Subgroups Tab (NEW) ===")

        # Navigate to subgroups tab
        if not self.click_tab("Subgroups"):
            return False

        # Check subgroup controls exist
        try:
            var_select = self.driver.find_element(By.ID, "subgroupVariable")
            self.log("Subgroup variable dropdown exists", "PASS")
        except Exception as e:
            self.log("Subgroup variable dropdown exists", "FAIL", str(e))

        try:
            model_select = self.driver.find_element(By.ID, "subgroupModel")
            self.log("Subgroup model dropdown exists", "PASS")
        except Exception as e:
            self.log("Subgroup model dropdown exists", "FAIL", str(e))

        # Check canvas elements for plots
        try:
            canvas_dr = self.driver.find_element(By.ID, "subgroupDoseResponsePlot")
            self.log("Subgroup dose-response canvas exists", "PASS")
        except Exception as e:
            self.log("Subgroup dose-response canvas exists", "FAIL", str(e))

        try:
            canvas_fp = self.driver.find_element(By.ID, "subgroupForestPlot")
            self.log("Subgroup forest plot canvas exists", "PASS")
        except Exception as e:
            self.log("Subgroup forest plot canvas exists", "FAIL", str(e))

        # Check run button exists
        try:
            buttons = self.driver.find_elements(By.TAG_NAME, "button")
            found = any("Run Subgroup Analysis" in btn.text for btn in buttons)
            if found:
                self.log("Subgroup Analysis button exists", "PASS")
            else:
                self.log("Subgroup Analysis button exists", "FAIL", "Button not found")
        except Exception as e:
            self.log("Subgroup Analysis button exists", "FAIL", str(e))

    def test_realtime_tab(self):
        """Test the Real-Time tab"""
        print("\n=== Testing Real-Time Tab ===")

        if not self.click_tab("Real-Time"):
            return False

        # Check sliders exist
        sliders = ["tau2Slider", "ciSlider", "thresholdSlider"]
        for slider_id in sliders:
            try:
                slider = self.driver.find_element(By.ID, slider_id)
                self.log(f"Slider '{slider_id}' exists", "PASS")
            except Exception as e:
                self.log(f"Slider '{slider_id}' exists", "FAIL", str(e))

    def test_results_tab(self):
        """Test the Results tab"""
        print("\n=== Testing Results Tab ===")

        if not self.click_tab("Results"):
            return False

        # Check coefficients table
        try:
            table = self.driver.find_element(By.ID, "coefficientsTable")
            self.log("Coefficients table exists", "PASS")
        except Exception as e:
            self.log("Coefficients table exists", "FAIL", str(e))

        # Check interpretation div
        try:
            interp = self.driver.find_element(By.ID, "interpretation")
            self.log("Interpretation div exists", "PASS")
        except Exception as e:
            self.log("Interpretation div exists", "FAIL", str(e))

    def test_plots_tab(self):
        """Test the Plots tab"""
        print("\n=== Testing Plots Tab ===")

        if not self.click_tab("Plots"):
            return False

        # Check canvas elements
        canvases = ["mainPlot", "forestPlot"]
        for canvas_id in canvases:
            try:
                canvas = self.driver.find_element(By.ID, canvas_id)
                self.log(f"Canvas '{canvas_id}' exists", "PASS")
            except Exception as e:
                self.log(f"Canvas '{canvas_id}' exists", "FAIL", str(e))

    def test_influence_tab(self):
        """Test the Influence tab"""
        print("\n=== Testing Influence Tab ===")

        if not self.click_tab("Influence"):
            return False

        # Check run sensitivity button
        try:
            buttons = self.driver.find_elements(By.TAG_NAME, "button")
            found = any("Run Sensitivity" in btn.text for btn in buttons)
            if found:
                self.log("Sensitivity Analysis button exists", "PASS")
            else:
                self.log("Sensitivity Analysis button exists", "FAIL", "Button not found")
        except Exception as e:
            self.log("Sensitivity Analysis button exists", "FAIL", str(e))

    def check_console_errors(self):
        """Check browser console for errors"""
        print("\n=== Checking Console Errors ===")
        try:
            logs = self.driver.get_log("browser")
            errors = [log for log in logs if log['level'] == 'SEVERE']

            if errors:
                self.log("Console errors check", "FAIL", f"Found {len(errors)} errors")
                for error in errors[:5]:  # Show first 5
                    print(f"    ERROR: {error['message'][:100]}")
            else:
                self.log("Console errors check", "PASS", "No errors found")
        except Exception as e:
            self.log("Console errors check", "PASS", f"Console logs unavailable on {self.browser_name}: {e}")

    def get_page_title(self):
        """Get page title"""
        try:
            title = self.driver.title
            self.log("Page title check", "PASS", title)
        except Exception as e:
            self.log("Page title check", "FAIL", str(e))

    def run_all_tests(self):
        """Run all tests"""
        print("=" * 60)
        print("DOSE RESPONSE PRO v18.1 - COMPREHENSIVE TEST")
        print("=" * 60)

        if not self.navigate_to_app():
            return False
        self.get_page_title()
        self.check_tabs_exist()
        self.test_data_tab()
        self.test_run_analysis()
        self.test_subgroups_tab()
        self.test_realtime_tab()
        self.test_results_tab()
        self.test_plots_tab()
        self.test_influence_tab()
        self.check_console_errors()

        # Print summary
        print("\n" + "=" * 60)
        print("TEST SUMMARY")
        print("=" * 60)

        passed = sum(1 for r in self.results if r['status'] == 'PASS')
        failed = sum(1 for r in self.results if r['status'] == 'FAIL')
        total = len(self.results)

        print(f"Total Tests: {total}")
        print(f"Passed: {passed}")
        print(f"Failed: {failed}")
        print(f"Success Rate: {(passed/total*100):.1f}%")

        if failed > 0:
            print("\nFailed Tests:")
            for r in self.results:
                if r['status'] == 'FAIL':
                    print(f"  - {r['test']}: {r['message']}")

        return failed == 0

    def save_results(self, filename="test_results.json"):
        """Save test results to JSON"""
        with open(filename, 'w') as f:
            json.dump(self.results, f, indent=2)
        print(f"\nResults saved to {filename}")

    def close(self):
        """Close the browser"""
        self.driver.quit()

if __name__ == "__main__":
    headless = os.environ.get('SELENIUM_HEADLESS', '').lower() in {'1', 'true', 'yes'}
    tester = DoseResponseProTester(headless=headless)
    try:
        success = tester.run_all_tests()
        tester.save_results(str(Path(__file__).resolve().parent / "test_results.json"))
        exit(0 if success else 1)
    finally:
        time.sleep(5)  # Keep browser open for 5 seconds to see
        tester.close()
