#!/usr/bin/env python3
"""Test HTA functionality in TruthCert-PairwisePro."""
import os
from pathlib import Path
import time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from selenium.common.exceptions import TimeoutException, NoSuchElementException


def resolve_app_html(default_name="TruthCert-PairwisePro-v1.0-bundle.html"):
    override = os.environ.get("TRUTHCERT_HTML")
    if override:
        path = Path(override).expanduser()
        if path.is_file():
            return path.resolve()
        raise FileNotFoundError(f"TRUTHCERT_HTML not found: {path}")

    base = Path(__file__).resolve().parent
    candidates = [
        base / default_name,
        base / "TruthCert-PairwisePro-v1.0.html",
        base / "TruthCert-PairwisePro-v1.0-fast.html",
    ]
    for candidate in candidates:
        if candidate.is_file():
            return candidate.resolve()

    raise FileNotFoundError("Could not locate a TruthCert HTML file in script directory")

def main():
    print("=" * 60)
    print("TruthCert-PairwisePro - HTA Tab Test")
    print("=" * 60)

    options = Options()
    options.add_argument('--start-maximized')
    options.add_argument('--disable-gpu')
    options.add_argument('--no-sandbox')

    print("\n[*] Starting Chrome...")
    driver = webdriver.Chrome(options=options)

    try:
        app_path = resolve_app_html()
        print(f"[*] Loading: {app_path}")
        driver.get(app_path.as_uri())
        time.sleep(2)

        # Step 1: Load Demo Data
        print("\n[STEP 1] Loading demo data...")
        loaded = driver.execute_script(
            """
            if (typeof loadDemoDataset === 'function') {
              loadDemoDataset('SGLT2_HFH');
              return true;
            }
            return false;
            """
        )
        time.sleep(2)
        if loaded:
            print("  Demo data loaded (SGLT2_HFH)")
        else:
            load_demo_btn = driver.find_element(By.ID, 'loadDemoBtn')
            driver.execute_script("arguments[0].click();", load_demo_btn)
            time.sleep(1)
            try:
                alert = WebDriverWait(driver, 5).until(EC.alert_is_present())
                alert.send_keys("5")
                alert.accept()
                time.sleep(2)
                print("  Demo data loaded via prompt")
            except TimeoutException:
                print("  No prompt dialog - demo may have loaded automatically")

        # Step 2: Run Analysis
        print("\n[STEP 2] Running analysis...")
        run_btn = driver.find_element(By.ID, 'runAnalysisBtn')
        driver.execute_script("arguments[0].click();", run_btn)
        time.sleep(5)  # Wait for analysis to complete

        # Dismiss any alerts
        try:
            alert = driver.switch_to.alert
            print(f"  Alert: {alert.text[:50]}...")
            alert.accept()
            time.sleep(1)
        except:
            pass

        print("  Analysis completed")

        # Step 3: Check verdict panel
        print("\n[STEP 3] Checking TruthCert verdict...")
        try:
            verdict_tab = driver.find_element(By.CSS_SELECTOR, '[data-tab="verdict"]')
            driver.execute_script("arguments[0].click();", verdict_tab)
            time.sleep(1)

            verdict_panel = driver.find_element(By.ID, 'panel-verdict')
            verdict_content = verdict_panel.get_attribute('innerHTML')

            if 'verdict' in verdict_content.lower() or 'tier' in verdict_content.lower():
                print("  Verdict panel has content")
                # Look for verdict value
                try:
                    verdict_value = driver.find_element(By.CLASS_NAME, 'verdict-value')
                    print(f"  Verdict: {verdict_value.text}")
                except:
                    pass
            else:
                print("  WARNING: Verdict panel appears empty")
        except Exception as e:
            print(f"  ERROR checking verdict: {e}")

        # Step 4: Go to HTA Tab
        print("\n[STEP 4] Navigating to HTA tab...")
        try:
            hta_tab = driver.find_element(By.CSS_SELECTOR, '[data-tab="hta"]')
            driver.execute_script("arguments[0].click();", hta_tab)
            time.sleep(1)
            print("  Clicked HTA tab")
        except Exception as e:
            print(f"  ERROR clicking HTA tab: {e}")
            return

        # Step 5: Check HTA panel state
        print("\n[STEP 5] Checking HTA panel state...")

        # Check prerequisites section
        prereq = driver.find_element(By.ID, 'htaPrerequisites')
        prereq_display = prereq.value_of_css_property('display')
        print(f"  Prerequisites section display: {prereq_display}")

        # Check config section
        config = driver.find_element(By.ID, 'htaConfigSection')
        config_display = config.value_of_css_property('display')
        print(f"  Config section display: {config_display}")

        if config_display == 'none':
            print("\n  [!] HTA Config is HIDDEN - Prerequisites not met")
            print("  This could mean:")
            print("    - TruthCert verdict is UNCERTAIN (Tier D)")
            print("    - Verdict wasn't computed yet")
            print("    - There's a bug in the prerequisite check")
        else:
            print("\n  [OK] HTA Config is visible")

            # Try running HTA
            print("\n[STEP 6] Running HTA analysis...")
            try:
                run_hta_btn = driver.find_element(By.ID, 'runHTABtn')
                driver.execute_script("arguments[0].click();", run_hta_btn)
                time.sleep(3)

                # Check for results
                try:
                    results_section = driver.find_element(By.ID, 'htaResultsSection')
                    results_display = results_section.value_of_css_property('display')
                    print(f"  Results section display: {results_display}")

                    if results_display != 'none':
                        print("  [OK] HTA Results displayed!")
                    else:
                        print("  [!] HTA Results not showing")
                except NoSuchElementException:
                    print("  [!] Results section not found")

            except Exception as e:
                print(f"  ERROR running HTA: {e}")

        # Check for JS errors
        print("\n[STEP 7] Checking for JavaScript errors...")
        try:
            logs = driver.get_log('browser')
            severe_errors = [log for log in logs if log['level'] == 'SEVERE']
            if severe_errors:
                print(f"  Found {len(severe_errors)} severe JS errors:")
                for err in severe_errors[:5]:
                    print(f"    - {err['message'][:100]}")
            else:
                print("  No severe JS errors")
        except Exception as e:
            print(f"  Could not check logs: {e}")

        print("\n" + "=" * 60)
        print("Test complete.")
        print("=" * 60)

    except Exception as e:
        print(f"\n[FATAL] Error: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        try:
            driver.quit()
        except Exception:
            pass

if __name__ == '__main__':
    main()
