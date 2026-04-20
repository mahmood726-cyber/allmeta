"""
Debug script for Bias Panel issue
"""

import time
import sys
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from selenium.common.exceptions import NoAlertPresentException

sys.stdout.reconfigure(encoding='utf-8')

def dismiss_alerts(driver):
    try:
        alert = driver.switch_to.alert
        alert.dismiss()
        time.sleep(0.3)
    except NoAlertPresentException:
        pass

def get_js_errors(driver):
    try:
        logs = driver.get_log('browser')
        return [l for l in logs if l['level'] == 'SEVERE']
    except:
        return []

def main():
    print("=" * 60)
    print("Bias Panel Debug Script")
    print("=" * 60)

    options = Options()
    options.add_argument('--start-maximized')
    options.add_argument('--disable-gpu')
    options.add_argument('--no-sandbox')
    options.set_capability('goog:loggingPrefs', {'browser': 'ALL'})

    driver = None
    try:
        driver = webdriver.Chrome(options=options)

        file_path = r"C:\Truthcert1\TruthCert-PairwisePro-v1.0.html"
        driver.get(f"file:///{file_path}")
        time.sleep(3)

        print("\n1. Page loaded. Checking initial bias panel...")
        panel = driver.find_element(By.ID, "panel-bias")
        initial_content = panel.get_attribute('innerHTML')[:300]
        print(f"Initial bias panel: {len(initial_content)} chars")
        print(f"Content preview: {initial_content[:150]}...")

        print("\n2. Loading demo dataset SGLT2_ACM...")
        # Use correct function name and key
        driver.execute_script("loadDemoDataset('SGLT2_ACM');")
        time.sleep(2)
        dismiss_alerts(driver)

        # Check for JS errors after loading demo
        errors = get_js_errors(driver)
        if errors:
            print("JS ERRORS after demo load:")
            for e in errors[:5]:
                print(f"  - {e.get('message', '')[:100]}")
        else:
            print("No JS errors after demo load")

        # Check study table
        rows = driver.find_elements(By.CSS_SELECTOR, "#studyTableBody tr")
        print(f"\n3. Study table has {len(rows)} rows")

        print("\n4. Running analysis...")
        run_btn = driver.find_element(By.ID, "runAnalysisBtn")
        driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", run_btn)
        time.sleep(0.3)
        run_btn.click()
        time.sleep(5)
        dismiss_alerts(driver)

        # Check for JS errors after analysis
        errors = get_js_errors(driver)
        if errors:
            print("JS ERRORS after analysis:")
            for e in errors[:10]:
                print(f"  - {e.get('message', '')[:120]}")
        else:
            print("No JS errors after analysis")

        # Check AppState.results
        print("\n5. Checking AppState.results...")
        has_results = driver.execute_script("return window.AppState && window.AppState.results !== null")
        print(f"Has results: {has_results}")

        if has_results:
            # Check bias-related data
            checks = [
                ("egger", "return window.AppState.results.egger !== null && window.AppState.results.egger !== undefined"),
                ("peters", "return window.AppState.results.peters !== null && window.AppState.results.peters !== undefined"),
                ("trimfill", "return window.AppState.results.trimfill !== null && window.AppState.results.trimfill !== undefined"),
                ("metaoverfit", "return window.AppState.results.metaoverfit !== null && window.AppState.results.metaoverfit !== undefined"),
                ("loo", "return window.AppState.results.loo !== null && window.AppState.results.loo !== undefined"),
            ]

            print("\nBias data availability:")
            for name, script in checks:
                result = driver.execute_script(script)
                status = "✓" if result else "✗"
                print(f"  {status} {name}: {result}")

                if result and name == "egger":
                    egger_p = driver.execute_script("return window.AppState.results.egger.p_value")
                    print(f"    Egger p-value: {egger_p}")

        print("\n6. Checking bias panel after analysis...")
        panel = driver.find_element(By.ID, "panel-bias")
        after_content = panel.get_attribute('innerHTML')
        print(f"Bias panel content length: {len(after_content)} chars")

        if len(after_content) < 500:
            print(f"Content (short): {after_content}")
        else:
            print(f"Content preview (first 300): {after_content[:300]}...")
            print(f"Content preview (last 200): ...{after_content[-200:]}")

        print("\n7. Clicking on Bias tab...")
        bias_tabs = driver.find_elements(By.XPATH, "//button[@data-tab='bias']")
        if bias_tabs:
            bias_tabs[0].click()
            time.sleep(2)
            dismiss_alerts(driver)

            # Check again
            panel = driver.find_element(By.ID, "panel-bias")
            after_tab_content = panel.get_attribute('innerHTML')
            print(f"Bias panel after tab click: {len(after_tab_content)} chars")

            if len(after_tab_content) != len(after_content):
                print("Content changed after clicking tab!")
                print(f"New content preview: {after_tab_content[:300]}...")

            errors = get_js_errors(driver)
            if errors:
                print("JS ERRORS after clicking bias tab:")
                for e in errors[:5]:
                    print(f"  - {e.get('message', '')[:120]}")

        # Try manually calling renderBiasPanel
        print("\n8. Manually calling renderBiasPanel...")
        try:
            driver.execute_script("if(typeof renderBiasPanel === 'function' && AppState.results) { renderBiasPanel(AppState.results); }")
            time.sleep(1)
            dismiss_alerts(driver)

            panel = driver.find_element(By.ID, "panel-bias")
            manual_content = panel.get_attribute('innerHTML')
            print(f"After manual renderBiasPanel: {len(manual_content)} chars")

            if len(manual_content) > 500:
                print("SUCCESS - renderBiasPanel works when called directly!")
                # Check if it contains Egger
                if "Egger" in manual_content:
                    print("  Contains 'Egger' - rendering correctly!")
            else:
                print(f"Content still short: {manual_content}")

            errors = get_js_errors(driver)
            if errors:
                print("JS ERRORS after manual render:")
                for e in errors[:5]:
                    print(f"  - {e.get('message', '')[:120]}")

        except Exception as e:
            print(f"Error calling renderBiasPanel: {e}")

        print("\n" + "=" * 60)
        input("Press Enter to close browser...")

    except Exception as e:
        print(f"\nCRITICAL ERROR: {e}")
        import traceback
        traceback.print_exc()

    finally:
        if driver:
            try:
                driver.quit()
            except:
                pass

if __name__ == "__main__":
    main()
