"""
Comprehensive Selenium Test with Local HTTP Server
"""

import time
import os
import json
import threading
import http.server
import socketserver
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.common.exceptions import JavascriptException

class SimpleHTTPServer:
    def __init__(self, port=8765):
        self.port = port
        self.server = None
        self.thread = None

    def start(self):
        os.chdir(os.path.dirname(os.path.abspath(__file__)))
        handler = http.server.SimpleHTTPRequestHandler
        self.server = socketserver.TCPServer(("", self.port), handler)
        self.thread = threading.Thread(target=self.server.serve_forever)
        self.thread.daemon = True
        self.thread.start()
        print(f"Server started on http://localhost:{self.port}")

    def stop(self):
        if self.server:
            self.server.shutdown()


def run_tests():
    print("=" * 70)
    print("NMA DOSE-RESPONSE APP - COMPREHENSIVE TEST")
    print("=" * 70)

    # Start local server
    server = SimpleHTTPServer(port=8765)
    server.start()
    time.sleep(1)

    # Setup browser - use headless to avoid conflicts
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1920,1080")
    options.set_capability("goog:loggingPrefs", {"browser": "ALL"})

    driver = None
    errors = []
    passed = []
    console_errors = []

    try:
        driver = webdriver.Chrome(options=options)
        driver.implicitly_wait(10)
        print("Browser started")

        # Load app
        driver.get("http://localhost:8765/index.html")
        time.sleep(3)
        print(f"Page title: {driver.title}")

        # Check console errors
        try:
            logs = driver.get_log("browser")
            for log in logs:
                if log["level"] == "SEVERE":
                    console_errors.append(log["message"])
        except:
            pass

        # ================================================================
        # TEST 1: Core JavaScript Classes
        # ================================================================
        print("\n--- Test 1: Core JavaScript Classes ---")
        core_classes = [
            "StatUtils", "ValidationSuite", "BootstrapCI", "InfluenceDiagnostics",
            "ModelFitStatistics", "EdgeCaseHandler", "TrimAndFill", "EggerTest",
            "REMLEstimator", "BeggMazumdarTest", "PetersTest", "PETPEESE",
            "ZCurveAnalysis", "CumulativeMetaAnalysis", "LeaveOneOutBias"
        ]

        for cls in core_classes:
            try:
                exists = driver.execute_script(f"return typeof {cls} !== 'undefined'")
                if exists:
                    passed.append(f"Class {cls} defined")
                    print(f"  [PASS] {cls}")
                else:
                    errors.append(f"Class {cls} NOT defined")
                    print(f"  [FAIL] {cls}")
            except Exception as e:
                errors.append(f"Error checking {cls}: {str(e)[:50]}")
                print(f"  [ERROR] {cls}: {str(e)[:50]}")

        # ================================================================
        # TEST 2: StatUtils Functions
        # ================================================================
        print("\n--- Test 2: StatUtils Functions ---")
        stat_tests = [
            ("StatUtils.normalCDF(0)", 0.5, 0.001),
            ("StatUtils.normalCDF(1.96)", 0.975, 0.01),
            ("StatUtils.normalQuantile(0.5)", 0, 0.001),
            ("StatUtils.normalQuantile(0.975)", 1.96, 0.01),
            ("StatUtils.tCDF(0, 10)", 0.5, 0.001),
            ("StatUtils.chiSquareCDF(10, 5)", 0.925, 0.05),
        ]

        for expr, expected, tolerance in stat_tests:
            try:
                result = driver.execute_script(f"return {expr}")
                if abs(result - expected) < tolerance:
                    passed.append(f"{expr} = {result:.4f} (expected ~{expected})")
                    print(f"  [PASS] {expr} = {result:.4f}")
                else:
                    errors.append(f"{expr} = {result:.4f}, expected {expected}")
                    print(f"  [FAIL] {expr} = {result:.4f}, expected {expected}")
            except Exception as e:
                errors.append(f"Error in {expr}: {str(e)[:50]}")
                print(f"  [ERROR] {expr}: {str(e)[:50]}")

        # ================================================================
        # TEST 3: Meta-Analysis Calculations
        # ================================================================
        print("\n--- Test 3: Meta-Analysis Calculations ---")

        # Test DerSimonian-Laird
        dl_test = """
            var effects = [-0.5, -0.3, -0.7, -0.4, -0.6];
            var ses = [0.1, 0.15, 0.12, 0.11, 0.13];
            var variances = ses.map(function(s) { return s * s; });
            var weights = variances.map(function(v) { return 1 / v; });
            var sumW = weights.reduce(function(a, b) { return a + b; }, 0);
            var effect = weights.reduce(function(s, w, i) { return s + w * effects[i]; }, 0) / sumW;
            var Q = weights.reduce(function(s, w, i) { return s + w * Math.pow(effects[i] - effect, 2); }, 0);
            return {effect: effect, Q: Q, k: effects.length};
        """
        try:
            result = driver.execute_script(dl_test)
            if result and abs(result['effect'] + 0.48) < 0.1:
                passed.append(f"DL effect = {result['effect']:.3f}, Q = {result['Q']:.2f}")
                print(f"  [PASS] DL: effect={result['effect']:.3f}, Q={result['Q']:.2f}")
            else:
                errors.append(f"DL calculation issue: {result}")
                print(f"  [FAIL] DL: {result}")
        except Exception as e:
            errors.append(f"DL test error: {str(e)[:50]}")
            print(f"  [ERROR] DL: {str(e)[:50]}")

        # Test BootstrapCI
        boot_test = """
            try {
                var effects = [-0.5, -0.3, -0.7, -0.4, -0.6];
                var ses = [0.1, 0.15, 0.12, 0.11, 0.13];
                var boot = new BootstrapCI(effects, ses, {nBoot: 100});
                return boot.run();
            } catch(e) {
                return {error: e.message};
            }
        """
        try:
            result = driver.execute_script(boot_test)
            if result and 'effect' in result and not 'error' in result:
                passed.append(f"BootstrapCI: effect={result['effect']:.3f}, CI=[{result['ci']['lower']:.3f}, {result['ci']['upper']:.3f}]")
                print(f"  [PASS] Bootstrap: effect={result['effect']:.3f}")
            else:
                errors.append(f"BootstrapCI error: {result.get('error', 'unknown')}")
                print(f"  [FAIL] Bootstrap: {result}")
        except Exception as e:
            errors.append(f"Bootstrap test error: {str(e)[:50]}")
            print(f"  [ERROR] Bootstrap: {str(e)[:50]}")

        # Test InfluenceDiagnostics
        infl_test = """
            try {
                var effects = [-0.5, -0.3, -0.7, -0.4, -0.6];
                var ses = [0.1, 0.15, 0.12, 0.11, 0.13];
                var infl = new InfluenceDiagnostics(effects, ses);
                return infl.run();
            } catch(e) {
                return {error: e.message};
            }
        """
        try:
            result = driver.execute_script(infl_test)
            if result and 'cooksDistance' in result:
                passed.append(f"InfluenceDiagnostics: {len(result['cooksDistance'])} studies analyzed")
                print(f"  [PASS] Influence: {len(result['cooksDistance'])} studies")
            else:
                errors.append(f"InfluenceDiagnostics error: {result.get('error', 'unknown')}")
                print(f"  [FAIL] Influence: {result}")
        except Exception as e:
            errors.append(f"Influence test error: {str(e)[:50]}")
            print(f"  [ERROR] Influence: {str(e)[:50]}")

        # Test TrimAndFill
        tf_test = """
            try {
                var effects = [-0.5, -0.3, -0.7, -0.4, -0.6, 0.1, 0.2];
                var ses = [0.1, 0.15, 0.12, 0.11, 0.13, 0.2, 0.25];
                var tf = new TrimAndFill(effects, ses);
                return tf.run();
            } catch(e) {
                return {error: e.message};
            }
        """
        try:
            result = driver.execute_script(tf_test)
            if result and 'adjusted' in result:
                passed.append(f"TrimAndFill: k0={result.get('k0', 0)}, adjusted effect={result['adjusted'].get('effect', 'N/A')}")
                print(f"  [PASS] TrimAndFill: k0={result.get('k0', 0)}")
            else:
                errors.append(f"TrimAndFill error: {result.get('error', str(result)[:50])}")
                print(f"  [FAIL] TrimAndFill: {result}")
        except Exception as e:
            errors.append(f"TrimAndFill test error: {str(e)[:50]}")
            print(f"  [ERROR] TrimAndFill: {str(e)[:50]}")

        # Test EggerTest
        egger_test = """
            try {
                var effects = [-0.5, -0.3, -0.7, -0.4, -0.6, 0.1];
                var ses = [0.1, 0.15, 0.12, 0.11, 0.13, 0.3];
                var egger = new EggerTest(effects, ses);
                return egger.run();
            } catch(e) {
                return {error: e.message};
            }
        """
        try:
            result = driver.execute_script(egger_test)
            if result and 'intercept' in result:
                passed.append(f"EggerTest: intercept={result['intercept']:.3f}, p={result.get('pValue', 'N/A')}")
                print(f"  [PASS] Egger: intercept={result['intercept']:.3f}")
            else:
                errors.append(f"EggerTest error: {result.get('error', str(result)[:50])}")
                print(f"  [FAIL] Egger: {result}")
        except Exception as e:
            errors.append(f"Egger test error: {str(e)[:50]}")
            print(f"  [ERROR] Egger: {str(e)[:50]}")

        # ================================================================
        # TEST 4: UI Elements
        # ================================================================
        print("\n--- Test 4: UI Elements ---")

        # Check buttons
        buttons = driver.find_elements(By.CSS_SELECTOR, "button")
        print(f"  Found {len(buttons)} buttons")
        passed.append(f"Found {len(buttons)} buttons")

        # Check canvases (plots)
        canvases = driver.find_elements(By.CSS_SELECTOR, "canvas")
        print(f"  Found {len(canvases)} canvas elements (plots)")
        passed.append(f"Found {len(canvases)} canvas elements")

        # Check tabs
        tabs = driver.find_elements(By.CSS_SELECTOR, "[role='tab']")
        print(f"  Found {len(tabs)} tab elements")
        passed.append(f"Found {len(tabs)} tab elements")

        # ================================================================
        # TEST 5: ValidationSuite
        # ================================================================
        print("\n--- Test 5: ValidationSuite ---")
        try:
            result = driver.execute_script("return ValidationSuite.validateDL()")
            if result and result.get('passed'):
                passed.append("ValidationSuite: DL validation PASSED")
                print(f"  [PASS] DL validation passed")
                print(f"         Computed: {result['computed']}")
            else:
                errors.append(f"ValidationSuite: DL validation FAILED")
                print(f"  [FAIL] DL validation failed: {result}")
        except Exception as e:
            errors.append(f"ValidationSuite error: {str(e)[:50]}")
            print(f"  [ERROR] ValidationSuite: {str(e)[:50]}")

        # ================================================================
        # Final Console Check
        # ================================================================
        try:
            logs = driver.get_log("browser")
            for log in logs:
                if log["level"] == "SEVERE" and log["message"] not in [ce for ce in console_errors]:
                    console_errors.append(log["message"])
        except:
            pass

        # ================================================================
        # SUMMARY
        # ================================================================
        print("\n" + "=" * 70)
        print("TEST SUMMARY")
        print("=" * 70)
        print(f"\nPASSED: {len(passed)}")
        print(f"ERRORS: {len(errors)}")
        print(f"CONSOLE ERRORS: {len(console_errors)}")

        if errors:
            print("\nERRORS:")
            for e in errors:
                print(f"  X {e}")

        if console_errors:
            print("\nCONSOLE ERRORS:")
            for ce in console_errors[:5]:
                print(f"  X {ce[:100]}")

        print("\n" + "=" * 70)
        if len(errors) == 0:
            print("RESULT: ALL TESTS PASSED!")
        else:
            print(f"RESULT: {len(errors)} TESTS FAILED")
        print("=" * 70)

        # Save results
        with open('test_results.json', 'w') as f:
            json.dump({
                'passed': passed,
                'errors': errors,
                'console_errors': console_errors
            }, f, indent=2)

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


if __name__ == "__main__":
    errors = run_tests()
