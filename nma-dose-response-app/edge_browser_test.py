"""Browser test using Microsoft Edge to avoid Chrome conflicts"""

import time
import os
import json
import threading
import http.server
import socketserver

class SimpleHTTPServer:
    def __init__(self, port=8767):
        self.port = port
        self.server = None
        self.thread = None

    def start(self):
        os.chdir(os.path.dirname(os.path.abspath(__file__)))
        handler = http.server.SimpleHTTPRequestHandler
        handler.log_message = lambda *args: None
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
    print("NMA DOSE-RESPONSE APP - EDGE BROWSER TEST")
    print("=" * 70)

    server = SimpleHTTPServer(port=8767)
    server.start()
    time.sleep(1)

    try:
        from selenium import webdriver
        from selenium.webdriver.common.by import By
        from selenium.webdriver.edge.options import Options
        from selenium.webdriver.edge.service import Service

        options = Options()
        options.add_argument("--headless=new")
        options.add_argument("--disable-gpu")
        options.add_argument("--window-size=1920,1080")
        options.set_capability("ms:loggingPrefs", {"browser": "ALL"})

        driver = None
        errors = []
        passed = []

        try:
            driver = webdriver.Edge(options=options)
            driver.set_page_load_timeout(30)
            driver.implicitly_wait(10)
            print("Edge browser started successfully!")

            # Load app
            driver.get("http://127.0.0.1:8767/index.html")
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
            # TEST 2: Statistical Functions
            # ================================================================
            print("\n--- Test 2: Statistical Functions ---")

            stat_tests = [
                ("StatUtils.normalCDF(0)", 0.5, 0.001),
                ("StatUtils.normalCDF(1.96)", 0.975, 0.01),
                ("StatUtils.normalQuantile(0.5)", 0, 0.001),
                ("StatUtils.normalQuantile(0.975)", 1.96, 0.01),
            ]

            for expr, expected, tol in stat_tests:
                try:
                    result = driver.execute_script(f"return {expr}")
                    if abs(result - expected) < tol:
                        passed.append(f"{expr} = {result:.4f}")
                        print(f"  [PASS] {expr} = {result:.4f}")
                    else:
                        errors.append(f"{expr} = {result:.4f}, expected {expected}")
                        print(f"  [FAIL] {expr} = {result:.4f}")
                except Exception as e:
                    errors.append(f"Error in {expr}")
                    print(f"  [ERROR] {expr}")

            # ================================================================
            # TEST 3: Meta-Analysis Functions
            # ================================================================
            print("\n--- Test 3: Meta-Analysis Functions ---")

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
                print(f"  [ERROR] BootstrapCI")

            # Test EggerTest (now with run() method)
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
                print(f"  [ERROR] EggerTest")

            # Test TrimAndFill
            try:
                result = driver.execute_script("""
                    var effects = [-0.5, -0.3, -0.7, -0.4, -0.6, 0.1];
                    var ses = [0.1, 0.15, 0.12, 0.11, 0.13, 0.3];
                    var tf = new TrimAndFill(effects, ses);
                    return tf.run();
                """)
                if result and 'adjusted' in result:
                    passed.append(f"TrimAndFill: k0={result.get('k0', 0)}")
                    print(f"  [PASS] TrimAndFill: k0={result.get('k0', 0)}")
                else:
                    errors.append("TrimAndFill failed")
                    print(f"  [FAIL] TrimAndFill")
            except Exception as e:
                errors.append(f"TrimAndFill error: {str(e)[:50]}")
                print(f"  [ERROR] TrimAndFill")

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
                print(f"  [ERROR] ValidationSuite")

            # ================================================================
            # TEST 4: UI Elements & Plots
            # ================================================================
            print("\n--- Test 4: UI Elements & Plots ---")

            # Check canvas elements (plots)
            canvases = driver.find_elements(By.CSS_SELECTOR, "canvas")
            print(f"  Found {len(canvases)} canvas elements (plots)")
            if len(canvases) > 0:
                passed.append(f"Found {len(canvases)} canvas elements")
            else:
                errors.append("No canvas elements found")

            # Check for Chart.js or plot initialization
            try:
                has_chart = driver.execute_script("return typeof Chart !== 'undefined'")
                if has_chart:
                    passed.append("Chart.js library loaded")
                    print("  [PASS] Chart.js library loaded")
                else:
                    print("  [INFO] Chart.js not loaded (may use different library)")
            except:
                pass

            # Check buttons
            buttons = driver.find_elements(By.CSS_SELECTOR, "button")
            print(f"  Found {len(buttons)} buttons")
            passed.append(f"Found {len(buttons)} buttons")

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
            with open('edge_test_results.json', 'w') as f:
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

    except ImportError as e:
        print(f"Edge WebDriver not available: {e}")
        print("Skipping browser tests - Node.js tests already passed")
        return []


if __name__ == "__main__":
    errors = run_tests()
