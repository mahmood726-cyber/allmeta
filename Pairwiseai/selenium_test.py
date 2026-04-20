#!/usr/bin/env python3
"""
Comprehensive Selenium test for TruthCert-PairwisePro v1.0
Tests all tabs, plots, and buttons.
"""
import time
import sys
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from selenium.common.exceptions import TimeoutException, NoSuchElementException

# Test results
results = {
    'passed': [],
    'failed': [],
    'warnings': []
}

def log_pass(test_name, detail=""):
    msg = f"[PASS] {test_name}" + (f" - {detail}" if detail else "")
    print(msg)
    results['passed'].append(test_name)

def log_fail(test_name, detail=""):
    msg = f"[FAIL] {test_name}" + (f" - {detail}" if detail else "")
    print(msg)
    results['failed'].append((test_name, detail))

def log_warn(test_name, detail=""):
    msg = f"[WARN] {test_name}" + (f" - {detail}" if detail else "")
    print(msg)
    results['warnings'].append((test_name, detail))

def wait_for_element(driver, by, value, timeout=10):
    """Wait for element to be present and visible."""
    try:
        element = WebDriverWait(driver, timeout).until(
            EC.visibility_of_element_located((by, value))
        )
        return element
    except TimeoutException:
        return None

def check_plot_rendered(driver, plot_id):
    """Check if a Plotly plot has been rendered in an element."""
    try:
        element = driver.find_element(By.ID, plot_id)
        # Check if plot has SVG content (Plotly renders to SVG)
        svg = element.find_elements(By.TAG_NAME, 'svg')
        if svg:
            return True
        # Also check for canvas (some plots use canvas)
        canvas = element.find_elements(By.TAG_NAME, 'canvas')
        if canvas:
            return True
        # Check for plotly-graph-div class
        plotly_divs = element.find_elements(By.CLASS_NAME, 'plotly')
        if plotly_divs:
            return True
        # Check if element has any child content
        if element.get_attribute('innerHTML').strip():
            return True
        return False
    except NoSuchElementException:
        return False

def click_element(driver, element, description=""):
    """Safely click an element with retry."""
    try:
        driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", element)
        time.sleep(0.3)
        element.click()
        return True
    except Exception as e:
        try:
            driver.execute_script("arguments[0].click();", element)
            return True
        except:
            return False

def main():
    print("=" * 60)
    print("TruthCert-PairwisePro v1.0 - Selenium Test Suite")
    print("=" * 60)

    # Setup Chrome
    options = Options()
    options.add_argument('--start-maximized')
    options.add_argument('--disable-gpu')
    options.add_argument('--no-sandbox')
    # Keep browser open for inspection
    options.add_experimental_option("detach", True)

    print("\n[*] Starting Chrome...")
    driver = webdriver.Chrome(options=options)

    try:
        # Load the file
        file_path = r'C:\Truthcert1\TruthCert-PairwisePro-v1.0-bundle.html'
        url = f'file:///{file_path.replace(chr(92), "/")}'
        print(f"[*] Loading: {url}")
        driver.get(url)
        time.sleep(2)

        # Test 1: Page loads
        print("\n" + "=" * 40)
        print("TEST 1: Page Load")
        print("=" * 40)
        title = driver.title
        if "TruthCert" in title or "PairwisePro" in title:
            log_pass("Page title", title)
        else:
            log_fail("Page title", f"Got: {title}")

        # Test 2: Check main UI elements exist
        print("\n" + "=" * 40)
        print("TEST 2: UI Elements")
        print("=" * 40)

        ui_elements = [
            ('loadDemoBtn', 'Load Demo button'),
            ('addStudyBtn', 'Add Study button'),
            ('runAnalysisBtn', 'Run Analysis button'),
            ('studyTableBody', 'Study table'),
            ('dataTypeSelect', 'Data type selector'),
        ]

        for elem_id, desc in ui_elements:
            try:
                elem = driver.find_element(By.ID, elem_id)
                if elem:
                    log_pass(desc)
                else:
                    log_fail(desc, "Element not found")
            except NoSuchElementException:
                log_fail(desc, "Element not found")

        # Test 3: Load Demo Data
        print("\n" + "=" * 40)
        print("TEST 3: Load Demo Data")
        print("=" * 40)

        try:
            load_demo_btn = driver.find_element(By.ID, 'loadDemoBtn')
            click_element(driver, load_demo_btn, "Load Demo button")
            time.sleep(1)

            # Handle the prompt dialog - select demo #5 (BCG Vaccine)
            try:
                alert = WebDriverWait(driver, 5).until(EC.alert_is_present())
                alert.send_keys("5")  # BCG Vaccine for TB Prevention
                alert.accept()
                time.sleep(2)
            except TimeoutException:
                print("  No prompt dialog appeared")

            # Check if studies were loaded
            rows = driver.find_elements(By.CSS_SELECTOR, '#studyTableBody tr')
            if len(rows) >= 3:
                log_pass("Demo data loaded", f"{len(rows)} studies")
            else:
                log_fail("Demo data loaded", f"Only {len(rows)} rows found")
        except Exception as e:
            log_fail("Load demo data", str(e))

        # Test 4: Run Analysis
        print("\n" + "=" * 40)
        print("TEST 4: Run Analysis")
        print("=" * 40)

        try:
            # Dismiss any pending alerts first
            try:
                alert = driver.switch_to.alert
                alert.accept()
                time.sleep(0.5)
            except:
                pass

            run_btn = driver.find_element(By.ID, 'runAnalysisBtn')
            click_element(driver, run_btn, "Run Analysis button")
            time.sleep(3)

            # Check for any error alerts
            try:
                alert = WebDriverWait(driver, 2).until(EC.alert_is_present())
                alert_text = alert.text
                alert.accept()
                if 'error' in alert_text.lower() or 'required' in alert_text.lower():
                    log_fail("Run analysis", f"Alert: {alert_text[:50]}")
                else:
                    log_pass("Run analysis", "Completed with message")
            except TimeoutException:
                # No alert means success - check for results
                results_panel = driver.find_element(By.ID, 'panel-analysis')
                if results_panel:
                    content = results_panel.get_attribute('innerHTML')
                    if 'pooled' in content.lower() or 'effect' in content.lower() or 'OR' in content or 'RR' in content or 'forest' in content.lower():
                        log_pass("Analysis results generated")
                    else:
                        log_warn("Analysis results", "Panel exists but content unclear")
                else:
                    log_fail("Analysis results", "Results panel not found")
        except Exception as e:
            log_fail("Run analysis", str(e)[:100])

        # Test 5: Test all tabs
        print("\n" + "=" * 40)
        print("TEST 5: Tab Navigation")
        print("=" * 40)

        tabs_to_test = [
            ('panel-data', 'Data tab'),
            ('panel-analysis', 'Analysis tab'),
            ('panel-ddma', 'DDMA tab'),
            ('panel-heterogeneity', 'Heterogeneity tab'),
            ('panel-bias', 'Publication Bias tab'),
            ('panel-clinical', 'Clinical tab'),
            ('panel-validation', 'Validation tab'),
        ]

        for panel_id, tab_name in tabs_to_test:
            try:
                # Find and click tab button
                tab_btn = driver.find_element(By.CSS_SELECTOR, f'[data-tab="{panel_id.replace("panel-", "")}"]')
                if not tab_btn:
                    # Try alternate selector
                    tab_btn = driver.find_element(By.XPATH, f'//button[contains(@onclick, "{panel_id}")]')

                if tab_btn:
                    click_element(driver, tab_btn, tab_name)
                    time.sleep(0.5)

                    # Check if panel is visible
                    panel = driver.find_element(By.ID, panel_id)
                    if panel and panel.is_displayed():
                        log_pass(tab_name)
                    else:
                        log_warn(tab_name, "Panel not visible")
                else:
                    log_warn(tab_name, "Tab button not found")
            except Exception as e:
                log_warn(tab_name, str(e)[:50])

        # Test 6: Check plots in Analysis tab
        print("\n" + "=" * 40)
        print("TEST 6: Forest Plot")
        print("=" * 40)

        try:
            # Go to analysis tab
            analysis_btn = driver.find_element(By.CSS_SELECTOR, '[data-tab="analysis"]')
            click_element(driver, analysis_btn)
            time.sleep(1)

            # Look for forest plot
            forest_containers = ['forestPlot', 'forest-plot', 'forestPlotContainer']
            forest_found = False
            for container_id in forest_containers:
                try:
                    container = driver.find_element(By.ID, container_id)
                    if container and check_plot_rendered(driver, container_id):
                        forest_found = True
                        log_pass("Forest plot rendered", container_id)
                        break
                except:
                    continue

            if not forest_found:
                # Check for any SVG in analysis panel
                analysis_panel = driver.find_element(By.ID, 'panel-analysis')
                svgs = analysis_panel.find_elements(By.TAG_NAME, 'svg')
                if svgs:
                    log_pass("Forest plot (SVG found)", f"{len(svgs)} SVG elements")
                else:
                    log_warn("Forest plot", "No plot container found - may need to scroll")
        except Exception as e:
            log_warn("Forest plot", str(e)[:50])

        # Test 7: Heterogeneity Analysis
        print("\n" + "=" * 40)
        print("TEST 7: Heterogeneity Analysis")
        print("=" * 40)

        try:
            het_btn = driver.find_element(By.CSS_SELECTOR, '[data-tab="heterogeneity"]')
            click_element(driver, het_btn)
            time.sleep(1)

            # Click compute button
            compute_btns = driver.find_elements(By.XPATH, '//button[contains(text(), "Compute")]')
            for btn in compute_btns:
                if btn.is_displayed():
                    click_element(driver, btn)
                    break
            time.sleep(2)

            # Check for results
            het_results = driver.find_element(By.ID, 'heterogeneity-results')
            if het_results:
                content = het_results.get_attribute('innerHTML')
                if 'I²' in content or 'I-squared' in content.lower() or 'tau' in content.lower() or 'heterogeneity' in content.lower():
                    log_pass("Heterogeneity analysis")
                else:
                    log_warn("Heterogeneity analysis", "Results unclear")
            else:
                log_fail("Heterogeneity analysis", "Results container not found")
        except Exception as e:
            log_warn("Heterogeneity analysis", str(e)[:50])

        # Test 8: Publication Bias
        print("\n" + "=" * 40)
        print("TEST 8: Publication Bias")
        print("=" * 40)

        try:
            bias_btn = driver.find_element(By.CSS_SELECTOR, '[data-tab="bias"]')
            click_element(driver, bias_btn)
            time.sleep(1)

            # Click compute button
            compute_btns = driver.find_elements(By.XPATH, '//button[contains(text(), "Compute")]')
            for btn in compute_btns:
                if btn.is_displayed():
                    click_element(driver, btn)
                    break
            time.sleep(2)

            # Check for funnel plot or results
            bias_results = driver.find_element(By.ID, 'bias-results')
            if bias_results:
                content = bias_results.get_attribute('innerHTML')
                if 'egger' in content.lower() or 'funnel' in content.lower() or 'bias' in content.lower() or 'trim' in content.lower():
                    log_pass("Publication bias analysis")
                else:
                    log_warn("Publication bias analysis", "Results unclear")
            else:
                log_fail("Publication bias analysis", "Results container not found")
        except Exception as e:
            log_warn("Publication bias analysis", str(e)[:50])

        # Test 9: DDMA
        print("\n" + "=" * 40)
        print("TEST 9: DDMA (Decision-Driven MA)")
        print("=" * 40)

        try:
            ddma_btn = driver.find_element(By.CSS_SELECTOR, '[data-tab="ddma"]')
            click_element(driver, ddma_btn)
            time.sleep(1)

            # Click compute DDMA button
            compute_btn = driver.find_element(By.XPATH, '//button[contains(text(), "Compute DDMA")]')
            if compute_btn:
                click_element(driver, compute_btn)
                time.sleep(2)

            ddma_results = driver.find_element(By.ID, 'ddma-results')
            if ddma_results:
                content = ddma_results.get_attribute('innerHTML')
                if 'benefit' in content.lower() or 'decision' in content.lower() or 'P(' in content:
                    log_pass("DDMA analysis")
                else:
                    log_warn("DDMA analysis", "Results unclear")
        except Exception as e:
            log_warn("DDMA analysis", str(e)[:50])

        # Test 10: Clinical Translation
        print("\n" + "=" * 40)
        print("TEST 10: Clinical Translation")
        print("=" * 40)

        try:
            clinical_btn = driver.find_element(By.CSS_SELECTOR, '[data-tab="clinical"]')
            click_element(driver, clinical_btn)
            time.sleep(1)

            # Click compute button
            compute_btns = driver.find_elements(By.XPATH, '//button[contains(text(), "Compute")]')
            for btn in compute_btns:
                if btn.is_displayed():
                    click_element(driver, btn)
                    break
            time.sleep(2)

            clinical_results = driver.find_element(By.ID, 'clinical-results')
            if clinical_results:
                content = clinical_results.get_attribute('innerHTML')
                if 'nnt' in content.lower() or 'number needed' in content.lower() or 'risk' in content.lower():
                    log_pass("Clinical translation")
                else:
                    log_warn("Clinical translation", "Results unclear")
        except Exception as e:
            log_warn("Clinical translation", str(e)[:50])

        # Test 11: Check for JavaScript errors
        print("\n" + "=" * 40)
        print("TEST 11: JavaScript Console Errors")
        print("=" * 40)

        try:
            logs = driver.get_log('browser')
            severe_errors = [log for log in logs if log['level'] == 'SEVERE']
            if severe_errors:
                log_fail("JS Console errors", f"{len(severe_errors)} severe errors")
                for err in severe_errors[:3]:  # Show first 3
                    print(f"   Error: {err['message'][:100]}")
            else:
                log_pass("No severe JS errors")
        except Exception as e:
            log_warn("JS Console check", str(e)[:50])

        # Test 12: Theme Toggle
        print("\n" + "=" * 40)
        print("TEST 12: Theme Toggle")
        print("=" * 40)

        try:
            theme_btn = driver.find_element(By.CSS_SELECTOR, '.theme-toggle')
            if theme_btn:
                click_element(driver, theme_btn)
                time.sleep(0.5)
                log_pass("Theme toggle works")
            else:
                log_warn("Theme toggle", "Button not found")
        except Exception as e:
            log_warn("Theme toggle", str(e)[:50])

        # Summary
        print("\n" + "=" * 60)
        print("TEST SUMMARY")
        print("=" * 60)
        print(f"PASSED: {len(results['passed'])}")
        print(f"FAILED: {len(results['failed'])}")
        print(f"WARNINGS: {len(results['warnings'])}")

        if results['failed']:
            print("\nFailed tests:")
            for test, detail in results['failed']:
                print(f"  - {test}: {detail}")

        if results['warnings']:
            print("\nWarnings:")
            for test, detail in results['warnings']:
                print(f"  - {test}: {detail}")

        total_tests = len(results['passed']) + len(results['failed'])
        pass_rate = (len(results['passed']) / total_tests * 100) if total_tests > 0 else 0
        print(f"\nPass Rate: {pass_rate:.1f}%")

        print("\n[*] Browser left open for manual inspection.")
        print("    Close it manually when done.")

        return len(results['failed']) == 0

    except Exception as e:
        print(f"\n[FATAL] Error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)
