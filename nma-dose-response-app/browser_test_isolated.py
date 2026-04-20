"""Browser test with isolated Chrome profile to avoid conflicts"""

import time
import os
import json
import threading
import http.server
import socketserver
import tempfile
import shutil

class SimpleHTTPServer:
    def __init__(self, port=8766):
        self.port = port
        self.server = None
        self.thread = None

    def start(self):
        os.chdir(os.path.dirname(os.path.abspath(__file__)))
        handler = http.server.SimpleHTTPRequestHandler
        handler.log_message = lambda *args: None  # Suppress logs
        self.server = socketserver.TCPServer(("127.0.0.1", self.port), handler)
        self.thread = threading.Thread(target=self.server.serve_forever)
        self.thread.daemon = True
        self.thread.start()
        print(f"Server started on http://127.0.0.1:{self.port}")

    def stop(self):
        if self.server:
            self.server.shutdown()


def run_tests():
    print("=" * 70)
    print("NMA DOSE-RESPONSE APP - BROWSER TEST (ISOLATED)")
    print("=" * 70)

    # Start local server
    server = SimpleHTTPServer(port=8766)
    server.start()
    time.sleep(1)

    # Create completely isolated temp directory for user data
    temp_dir = tempfile.mkdtemp(prefix="chrome_test_")
    print(f"Using temp profile: {temp_dir}")

    try:
        from selenium import webdriver
        from selenium.webdriver.common.by import By
        from selenium.webdriver.chrome.options import Options
        from selenium.webdriver.chrome.service import Service

        options = Options()
        options.add_argument("--headless=new")
        options.add_argument("--disable-gpu")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--window-size=1920,1080")
        options.add_argument(f"--user-data-dir={temp_dir}")
        options.add_argument("--remote-debugging-port=9444")  # Different port
        options.add_argument("--disable-extensions")
        options.add_argument("--disable-background-networking")
        options.set_capability("goog:loggingPrefs", {"browser": "ALL"})

        driver = None
        errors = []
        passed = []

        try:
            service = Service()
            driver = webdriver.Chrome(service=service, options=options)
            driver.set_page_load_timeout(30)
            driver.implicitly_wait(10)
            print("Browser started successfully!")

            # Load app
            driver.get("http://127.0.0.1:8766/index.html")
            time.sleep(3)
            print(f"Page title: {driver.title}")

            # ================================================================
            # TEST 1: Core JavaScript Classes
            # ================================================================
            print("\n--- Test 1: Core JavaScript Classes ---")
            core_classes = [
                "StatUtils", "ValidationSuite", "BootstrapCI", "InfluenceDiagnostics",
                "ModelFitStatistics", "EdgeCaseHandler", "TrimAndFill", "EggerTest",
                "REMLEstimator", "BeggMazumdarTest", "PetersTest", "PETPEESE"
            ]

            for cls in core_classes:
                try:
                    exists = driver.execute_script(f"return typeof window.{cls} !== 'undefined'")
                    if exists:
                        passed.append(f"Class {cls} defined")
                        print(f"  [PASS] {cls}")
                    else:
                        errors.append(f"Class {cls} NOT defined")
                        print(f"  [FAIL] {cls}")
                except Exception as e:
                    errors.append(f"Error checking {cls}: {str(e)[:50]}")
                    print(f"  [ERROR] {cls}")

            # ================================================================
            # TEST 2: Meta-Analysis Functions
            # ================================================================
            print("\n--- Test 2: Meta-Analysis Functions ---")

            # Test BootstrapCI
            try:
                result = driver.execute_script("""
                    var effects = [-0.5, -0.3, -0.7, -0.4, -0.6];
                    var ses = [0.1, 0.15, 0.12, 0.11, 0.13];
                    var boot = new BootstrapCI(effects, ses, {nBoot: 50});
                    return boot.run();
                """)
                if result and 'effect' in result:
                    passed.append(f"BootstrapCI: effect={result['effect']:.3f}")
                    print(f"  [PASS] BootstrapCI: effect={result['effect']:.3f}")
                else:
                    errors.append("BootstrapCI failed")
                    print("  [FAIL] BootstrapCI")
            except Exception as e:
                errors.append(f"BootstrapCI error: {str(e)[:50]}")
                print(f"  [ERROR] BootstrapCI: {str(e)[:50]}")

            # Test EggerTest
            try:
                result = driver.execute_script("""
                    var effects = [-0.5, -0.3, -0.7, -0.4, -0.6, 0.1];
                    var ses = [0.1, 0.15, 0.12, 0.11, 0.13, 0.3];
                    var egger = new EggerTest(effects, ses);
                    return egger.run();
                """)
                if result and 'intercept' in result:
                    passed.append(f"EggerTest: intercept={result['intercept']:.3f}")
                    print(f"  [PASS] EggerTest: intercept={result['intercept']:.3f}")
                else:
                    errors.append("EggerTest failed")
                    print(f"  [FAIL] EggerTest: {result}")
            except Exception as e:
                errors.append(f"EggerTest error: {str(e)[:50]}")
                print(f"  [ERROR] EggerTest: {str(e)[:50]}")

            # Test ValidationSuite
            try:
                result = driver.execute_script("return ValidationSuite.validateDL()")
                if result and result.get('passed'):
                    passed.append("ValidationSuite: DL validation PASSED")
                    print(f"  [PASS] ValidationSuite DL validation")
                else:
                    errors.append("ValidationSuite DL validation FAILED")
                    print(f"  [FAIL] ValidationSuite: {result}")
            except Exception as e:
                errors.append(f"ValidationSuite error: {str(e)[:50]}")
                print(f"  [ERROR] ValidationSuite: {str(e)[:50]}")

            # ================================================================
            # TEST 3: UI Elements
            # ================================================================
            print("\n--- Test 3: UI Elements ---")

            # Check canvas elements (plots)
            canvases = driver.find_elements(By.CSS_SELECTOR, "canvas")
            print(f"  Found {len(canvases)} canvas elements (plots)")
            passed.append(f"Found {len(canvases)} canvas elements")

            # Check buttons
            buttons = driver.find_elements(By.CSS_SELECTOR, "button")
            print(f"  Found {len(buttons)} buttons")
            passed.append(f"Found {len(buttons)} buttons")

            # Check tabs
            tabs = driver.find_elements(By.CSS_SELECTOR, "[role='tab'], .tab, .nav-tab")
            print(f"  Found {len(tabs)} tab elements")
            passed.append(f"Found {len(tabs)} tab elements")

            # ================================================================
            # TEST 4: Console Errors
            # ================================================================
            print("\n--- Test 4: Console Check ---")
            try:
                logs = driver.get_log("browser")
                severe_errors = [log for log in logs if log["level"] == "SEVERE"]
                if len(severe_errors) == 0:
                    passed.append("No console errors")
                    print("  [PASS] No severe console errors")
                else:
                    for err in severe_errors[:3]:
                        print(f"  [WARN] {err['message'][:80]}")
            except:
                print("  [INFO] Could not check console logs")

            # ================================================================
            # SUMMARY
            # ================================================================
            print("\n" + "=" * 70)
            print("TEST SUMMARY")
            print("=" * 70)
            print(f"\nPASSED: {len(passed)}")
            print(f"ERRORS: {len(errors)}")

            if errors:
                print("\nERRORS:")
                for e in errors:
                    print(f"  X {e}")

            print("\n" + "=" * 70)
            if len(errors) == 0:
                print("RESULT: ALL TESTS PASSED!")
            else:
                print(f"RESULT: {len(errors)} TESTS FAILED")
            print("=" * 70)

            # Save results
            with open('browser_test_results.json', 'w') as f:
                json.dump({'passed': passed, 'errors': errors}, f, indent=2)

            return errors

        except Exception as e:
            print(f"\nFATAL ERROR: {e}")
            import traceback
            traceback.print_exc()
            return [str(e)]

        finally:
            if driver:
                driver.quit()
            server.stop()

    finally:
        # Clean up temp directory
        try:
            shutil.rmtree(temp_dir, ignore_errors=True)
        except:
            pass


if __name__ == "__main__":
    errors = run_tests()
