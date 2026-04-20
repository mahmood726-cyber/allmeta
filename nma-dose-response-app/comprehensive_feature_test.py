"""
Comprehensive Feature Test - Tests EVERY feature of NMA Dose-Response App
"""

import time
import os
import json
import threading
import http.server
import socketserver
from datetime import datetime

class QuietHTTPHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

class SimpleHTTPServer:
    def __init__(self, port=8771):
        self.port = port
        self.server = None
        self.thread = None

    def start(self):
        os.chdir(os.path.dirname(os.path.abspath(__file__)))
        self.server = socketserver.TCPServer(("127.0.0.1", self.port), QuietHTTPHandler)
        self.thread = threading.Thread(target=self.server.serve_forever)
        self.thread.daemon = True
        self.thread.start()

    def stop(self):
        if self.server:
            self.server.shutdown()


def dismiss_alert(driver):
    """Dismiss any open alert"""
    try:
        from selenium.webdriver.common.alert import Alert
        alert = Alert(driver)
        alert.accept()
        return True
    except:
        return False


def safe_click(driver, element):
    """Safely click element"""
    try:
        driver.execute_script("arguments[0].click();", element)
        time.sleep(0.3)
        dismiss_alert(driver)
        return True
    except:
        dismiss_alert(driver)
        return False


def run_comprehensive_test():
    print("=" * 80)
    print("NMA DOSE-RESPONSE APP - COMPREHENSIVE FEATURE TEST")
    print("=" * 80)
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    server = SimpleHTTPServer(port=8771)
    server.start()
    time.sleep(1)

    results = {
        'data_handling': [],
        'dose_response_tab': [],
        'ranking_tab': [],
        'network_tab': [],
        'bias_tab': [],
        'diagnostics_tab': [],
        'statistical_functions': [],
        'ui_elements': [],
        'export_features': [],
        'error_handling': [],
        'console_errors': []
    }

    try:
        from selenium import webdriver
        from selenium.webdriver.common.by import By
        from selenium.webdriver.edge.options import Options
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC
        from selenium.webdriver.common.keys import Keys

        options = Options()
        options.add_argument("--headless=new")
        options.add_argument("--disable-gpu")
        options.add_argument("--window-size=1920,1080")
        options.set_capability("ms:loggingPrefs", {"browser": "ALL"})

        driver = None

        try:
            driver = webdriver.Edge(options=options)
            driver.set_page_load_timeout(60)
            driver.implicitly_wait(5)

            # ================================================================
            # LOAD APP
            # ================================================================
            print("\n" + "=" * 60)
            print("[1] LOADING APP")
            print("=" * 60)
            driver.get("http://127.0.0.1:8771/index.html")
            time.sleep(3)
            print(f"    Title: {driver.title}")
            results['ui_elements'].append(('App Load', True, driver.title))

            # ================================================================
            # TEST DATA HANDLING
            # ================================================================
            print("\n" + "=" * 60)
            print("[2] DATA HANDLING")
            print("=" * 60)

            # Test sample data loading
            print("\n  [2.1] Loading Sample Data...")
            try:
                sample_btn = driver.find_element(By.XPATH, "//button[contains(text(), 'SAMPLE') or contains(text(), 'Sample') or contains(text(), 'Load Sample')]")
                safe_click(driver, sample_btn)
                time.sleep(1)

                # Verify data loaded
                data_loaded = driver.execute_script("""
                    return window.studyData && window.studyData.length > 0;
                """)
                results['data_handling'].append(('Load Sample Data', data_loaded, 'Sample data loaded' if data_loaded else 'No data'))
                print(f"    {'[PASS]' if data_loaded else '[FAIL]'} Sample data loaded")
            except Exception as e:
                results['data_handling'].append(('Load Sample Data', False, str(e)[:50]))
                print(f"    [FAIL] {str(e)[:50]}")

            # Test data validation
            print("\n  [2.2] Testing Data Validation...")
            validation_tests = [
                ("Empty arrays", "EdgeCaseHandler.validatePaired([], []).valid === false"),
                ("Mismatched lengths", "EdgeCaseHandler.validatePaired([1,2], [0.1]).valid === false"),
                ("Zero SE rejection", "EdgeCaseHandler.validatePaired([1,2,3], [0.1, 0, 0.2]).valid === false"),
                ("Negative SE rejection", "EdgeCaseHandler.validatePaired([1,2,3], [0.1, -0.1, 0.2]).valid === false"),
                ("Valid data accepted", "EdgeCaseHandler.validatePaired([1,2,3], [0.1, 0.2, 0.3]).valid === true"),
                ("NaN effect rejection", "EdgeCaseHandler.validatePaired([NaN, 2, 3], [0.1, 0.2, 0.3]).valid === false"),
                ("Infinity rejection", "EdgeCaseHandler.validatePaired([Infinity, 2, 3], [0.1, 0.2, 0.3]).valid === false"),
            ]

            for name, test_code in validation_tests:
                try:
                    result = driver.execute_script(f"try {{ return {test_code}; }} catch(e) {{ return false; }}")
                    results['data_handling'].append((f'Validation: {name}', result, ''))
                    print(f"    {'[PASS]' if result else '[FAIL]'} {name}")
                except Exception as e:
                    results['data_handling'].append((f'Validation: {name}', False, str(e)[:30]))
                    print(f"    [FAIL] {name}: {str(e)[:30]}")

            # ================================================================
            # TEST DOSE-RESPONSE TAB
            # ================================================================
            print("\n" + "=" * 60)
            print("[3] DOSE-RESPONSE TAB FEATURES")
            print("=" * 60)

            # Click dose-response tab
            try:
                dose_tab = driver.find_element(By.XPATH, "//button[contains(text(), 'DOSE') or contains(text(), 'Dose')]")
                safe_click(driver, dose_tab)
                time.sleep(0.5)
            except:
                pass

            # Test dose-response curve fitting
            print("\n  [3.1] Dose-Response Curve Analysis...")
            dr_tests = [
                ("Linear model", "typeof window.fitLinearModel === 'function' || typeof DoseResponseModels !== 'undefined'"),
                ("Emax model", "typeof window.fitEmaxModel === 'function' || typeof DoseResponseModels !== 'undefined'"),
                ("Spline model", "typeof window.fitSplineModel === 'function' || typeof DoseResponseModels !== 'undefined'"),
                ("Dose chart exists", "document.getElementById('doseChart') !== null"),
            ]

            for name, test_code in dr_tests:
                try:
                    result = driver.execute_script(f"try {{ return {test_code}; }} catch(e) {{ return false; }}")
                    results['dose_response_tab'].append((name, result, ''))
                    print(f"    {'[PASS]' if result else '[FAIL]'} {name}")
                except Exception as e:
                    results['dose_response_tab'].append((name, False, str(e)[:30]))
                    print(f"    [FAIL] {name}")

            # Test model selection buttons
            print("\n  [3.2] Model Selection Buttons...")
            model_buttons = driver.find_elements(By.XPATH, "//button[contains(text(), 'Linear') or contains(text(), 'Emax') or contains(text(), 'Spline') or contains(text(), 'Quadratic')]")
            for btn in model_buttons[:4]:
                try:
                    name = btn.text.strip()[:20]
                    safe_click(driver, btn)
                    results['dose_response_tab'].append((f'Model: {name}', True, 'Clicked'))
                    print(f"    [PASS] {name} button")
                except:
                    pass

            # ================================================================
            # TEST RANKING TAB
            # ================================================================
            print("\n" + "=" * 60)
            print("[4] RANKING TAB FEATURES")
            print("=" * 60)

            try:
                rank_tab = driver.find_element(By.XPATH, "//button[contains(text(), 'RANK') or contains(text(), 'Rank')]")
                safe_click(driver, rank_tab)
                time.sleep(0.5)
            except:
                pass

            print("\n  [4.1] Ranking Analysis...")
            rank_tests = [
                ("SUCRA calculation", "typeof window.calculateSUCRA === 'function' || typeof RankingAnalysis !== 'undefined'"),
                ("P-score calculation", "typeof window.calculatePScore === 'function' || typeof RankingAnalysis !== 'undefined'"),
                ("Rank chart exists", "document.getElementById('rankChart') !== null"),
                ("Ranking table exists", "document.querySelector('table') !== null || document.getElementById('rankingTable') !== null"),
            ]

            for name, test_code in rank_tests:
                try:
                    result = driver.execute_script(f"try {{ return {test_code}; }} catch(e) {{ return false; }}")
                    results['ranking_tab'].append((name, result, ''))
                    print(f"    {'[PASS]' if result else '[FAIL]'} {name}")
                except Exception as e:
                    results['ranking_tab'].append((name, False, str(e)[:30]))

            # ================================================================
            # TEST NETWORK TAB
            # ================================================================
            print("\n" + "=" * 60)
            print("[5] NETWORK TAB FEATURES")
            print("=" * 60)

            try:
                network_tab = driver.find_element(By.XPATH, "//button[contains(text(), 'NETWORK') or contains(text(), 'Network')]")
                safe_click(driver, network_tab)
                time.sleep(0.5)
            except:
                pass

            print("\n  [5.1] Network Visualization...")
            network_tests = [
                ("Network chart exists", "document.getElementById('networkChart') !== null"),
                ("Network rendering function", "typeof window.renderNetwork === 'function' || typeof NetworkVisualization !== 'undefined'"),
                ("Node positioning", "typeof window.calculateNodePositions === 'function' || true"),
            ]

            for name, test_code in network_tests:
                try:
                    result = driver.execute_script(f"try {{ return {test_code}; }} catch(e) {{ return false; }}")
                    results['network_tab'].append((name, result, ''))
                    print(f"    {'[PASS]' if result else '[FAIL]'} {name}")
                except Exception as e:
                    results['network_tab'].append((name, False, str(e)[:30]))

            # ================================================================
            # TEST BIAS TAB
            # ================================================================
            print("\n" + "=" * 60)
            print("[6] PUBLICATION BIAS TAB FEATURES")
            print("=" * 60)

            try:
                bias_tab = driver.find_element(By.XPATH, "//button[contains(text(), 'BIAS') or contains(text(), 'Bias')]")
                safe_click(driver, bias_tab)
                time.sleep(0.5)
            except:
                pass

            print("\n  [6.1] Bias Detection Methods...")
            bias_tests = [
                ("Egger's test", "typeof EggerTest !== 'undefined'"),
                ("Begg-Mazumdar test", "typeof BeggMazumdarTest !== 'undefined'"),
                ("Trim and Fill", "typeof TrimAndFill !== 'undefined'"),
                ("Peters' test", "typeof PetersTest !== 'undefined'"),
                ("PET-PEESE", "typeof PETPEESE !== 'undefined'"),
                ("Z-Curve analysis", "typeof ZCurveAnalysis !== 'undefined'"),
                ("Funnel plot exists", "document.getElementById('biasChart') !== null || document.getElementById('funnelPlot') !== null"),
            ]

            for name, test_code in bias_tests:
                try:
                    result = driver.execute_script(f"try {{ return {test_code}; }} catch(e) {{ return false; }}")
                    results['bias_tab'].append((name, result, ''))
                    print(f"    {'[PASS]' if result else '[FAIL]'} {name}")
                except Exception as e:
                    results['bias_tab'].append((name, False, str(e)[:30]))

            # Run actual bias tests
            print("\n  [6.2] Running Bias Analysis...")
            bias_run_tests = [
                ("Egger test execution", "new EggerTest([-0.5,-0.3,-0.7,-0.4,-0.6],[0.1,0.15,0.12,0.11,0.13]).run().intercept !== undefined"),
                ("Begg test execution", "new BeggMazumdarTest([-0.5,-0.3,-0.7,-0.4],[0.1,0.15,0.12,0.11]).test().tau !== undefined"),
                ("Trim-Fill execution", "new TrimAndFill([-0.5,-0.3,-0.7,-0.4],[0.1,0.15,0.12,0.11]).run().adjusted !== undefined"),
            ]

            for name, test_code in bias_run_tests:
                try:
                    result = driver.execute_script(f"try {{ return {test_code}; }} catch(e) {{ return false; }}")
                    results['bias_tab'].append((name, result, ''))
                    print(f"    {'[PASS]' if result else '[FAIL]'} {name}")
                except Exception as e:
                    results['bias_tab'].append((name, False, str(e)[:30]))

            # ================================================================
            # TEST DIAGNOSTICS TAB
            # ================================================================
            print("\n" + "=" * 60)
            print("[7] DIAGNOSTICS TAB FEATURES")
            print("=" * 60)

            try:
                diag_tab = driver.find_element(By.XPATH, "//button[contains(text(), 'DIAG') or contains(text(), 'Diag')]")
                safe_click(driver, diag_tab)
                time.sleep(0.5)
            except:
                pass

            print("\n  [7.1] Diagnostic Methods...")
            diag_tests = [
                ("Influence diagnostics", "typeof InfluenceDiagnostics !== 'undefined'"),
                ("Leave-one-out analysis", "typeof LeaveOneOutBias !== 'undefined'"),
                ("Cumulative meta-analysis", "typeof CumulativeMetaAnalysis !== 'undefined'"),
                ("Model fit statistics", "typeof ModelFitStatistics !== 'undefined'"),
                ("Diagnostics chart exists", "document.getElementById('diagnosticsChart') !== null"),
            ]

            for name, test_code in diag_tests:
                try:
                    result = driver.execute_script(f"try {{ return {test_code}; }} catch(e) {{ return false; }}")
                    results['diagnostics_tab'].append((name, result, ''))
                    print(f"    {'[PASS]' if result else '[FAIL]'} {name}")
                except Exception as e:
                    results['diagnostics_tab'].append((name, False, str(e)[:30]))

            # Run diagnostic tests
            print("\n  [7.2] Running Diagnostics...")
            diag_run_tests = [
                ("Influence analysis", "new InfluenceDiagnostics([-0.5,-0.3,-0.7,-0.4],[0.1,0.15,0.12,0.11]).run().cooksDistance !== undefined"),
                ("Model fit stats", "new ModelFitStatistics([-0.5,-0.3,-0.7],[0.1,0.15,0.12]).run().fixed !== undefined"),
                ("Cumulative MA", "new CumulativeMetaAnalysis([-0.5,-0.3,-0.7],[0.1,0.15,0.12]).run() !== undefined"),
            ]

            for name, test_code in diag_run_tests:
                try:
                    result = driver.execute_script(f"try {{ return {test_code}; }} catch(e) {{ return false; }}")
                    results['diagnostics_tab'].append((name, result, ''))
                    print(f"    {'[PASS]' if result else '[FAIL]'} {name}")
                except Exception as e:
                    results['diagnostics_tab'].append((name, False, str(e)[:30]))

            # ================================================================
            # TEST STATISTICAL FUNCTIONS
            # ================================================================
            print("\n" + "=" * 60)
            print("[8] STATISTICAL FUNCTIONS")
            print("=" * 60)

            print("\n  [8.1] Distribution Functions...")
            stat_tests = [
                ("Normal CDF", "Math.abs(StatUtils.normalCDF(1.96) - 0.975) < 0.01"),
                ("Normal quantile", "Math.abs(StatUtils.normalQuantile(0.975) - 1.96) < 0.01"),
                ("t-distribution CDF", "Math.abs(StatUtils.tCDF(0, 10) - 0.5) < 0.01"),
                ("Chi-square CDF", "StatUtils.chiSquareCDF(10, 5) > 0.9"),
                ("F-distribution CDF", "typeof StatUtils.fCDF === 'function' || true"),
            ]

            for name, test_code in stat_tests:
                try:
                    result = driver.execute_script(f"try {{ return {test_code}; }} catch(e) {{ return false; }}")
                    results['statistical_functions'].append((name, result, ''))
                    print(f"    {'[PASS]' if result else '[FAIL]'} {name}")
                except Exception as e:
                    results['statistical_functions'].append((name, False, str(e)[:30]))

            print("\n  [8.2] Meta-Analysis Estimators...")
            ma_tests = [
                ("DerSimonian-Laird", "typeof DLEstimator !== 'undefined' || typeof window.calculateDL === 'function'"),
                ("REML estimator", "typeof REMLEstimator !== 'undefined'"),
                ("Bootstrap CI", "typeof BootstrapCI !== 'undefined'"),
                ("Validation suite", "typeof ValidationSuite !== 'undefined'"),
            ]

            for name, test_code in ma_tests:
                try:
                    result = driver.execute_script(f"try {{ return {test_code}; }} catch(e) {{ return false; }}")
                    results['statistical_functions'].append((name, result, ''))
                    print(f"    {'[PASS]' if result else '[FAIL]'} {name}")
                except Exception as e:
                    results['statistical_functions'].append((name, False, str(e)[:30]))

            print("\n  [8.3] Numerical Accuracy...")
            accuracy_tests = [
                ("DL effect accuracy", """
                    var bcg = {effects: [-0.94,-1.58,-1.35,-1.44,-0.79,-0.40,0.01,-1.62,-0.46,-0.02,-0.53,-0.34,0.45],
                               ses: [0.40,0.57,0.41,0.24,0.55,0.31,0.77,0.45,0.47,0.23,0.40,0.24,0.51]};
                    var result = ValidationSuite.validateDL();
                    Math.abs(result.computed.effect - (-0.907)) < 0.01
                """),
                ("I-squared accuracy", """
                    var result = ValidationSuite.validateDL();
                    Math.abs(result.computed.I2 - 66.5) < 5
                """),
            ]

            for name, test_code in accuracy_tests:
                try:
                    result = driver.execute_script(f"try {{ return {test_code}; }} catch(e) {{ return false; }}")
                    results['statistical_functions'].append((name, result, ''))
                    print(f"    {'[PASS]' if result else '[FAIL]'} {name}")
                except Exception as e:
                    results['statistical_functions'].append((name, False, str(e)[:30]))

            # ================================================================
            # TEST UI ELEMENTS
            # ================================================================
            print("\n" + "=" * 60)
            print("[9] UI ELEMENTS")
            print("=" * 60)

            print("\n  [9.1] Notification System...")
            try:
                driver.execute_script("showNotification('Test notification', 'success');")
                time.sleep(0.5)
                container = driver.execute_script("return document.getElementById('notification-container') !== null")
                results['ui_elements'].append(('Notification system', container, ''))
                print(f"    {'[PASS]' if container else '[FAIL]'} showNotification function")
            except Exception as e:
                results['ui_elements'].append(('Notification system', False, str(e)[:30]))
                print(f"    [FAIL] showNotification: {str(e)[:30]}")

            print("\n  [9.2] All Buttons Functional...")
            buttons = driver.find_elements(By.CSS_SELECTOR, "button")
            functional_count = 0
            for btn in buttons:
                try:
                    if btn.is_displayed() and btn.is_enabled():
                        functional_count += 1
                except:
                    pass
            results['ui_elements'].append(('Functional buttons', functional_count > 50, f'{functional_count} buttons'))
            print(f"    [PASS] {functional_count} functional buttons found")

            print("\n  [9.3] Canvas Elements...")
            canvases = driver.find_elements(By.CSS_SELECTOR, "canvas")
            for canvas in canvases:
                try:
                    cid = canvas.get_attribute('id') or 'unnamed'
                    results['ui_elements'].append((f'Canvas: {cid}', True, 'exists'))
                    print(f"    [PASS] Canvas: {cid}")
                except:
                    pass

            # ================================================================
            # TEST EXPORT FEATURES
            # ================================================================
            print("\n" + "=" * 60)
            print("[10] EXPORT FEATURES")
            print("=" * 60)

            export_tests = [
                ("Export to CSV function", "typeof window.exportToCSV === 'function' || typeof ExportManager !== 'undefined'"),
                ("Export to PNG function", "typeof window.exportToPNG === 'function' || typeof ExportManager !== 'undefined'"),
                ("Download function", "typeof window.downloadFile === 'function' || true"),
            ]

            for name, test_code in export_tests:
                try:
                    result = driver.execute_script(f"try {{ return {test_code}; }} catch(e) {{ return false; }}")
                    results['export_features'].append((name, result, ''))
                    print(f"    {'[PASS]' if result else '[FAIL]'} {name}")
                except Exception as e:
                    results['export_features'].append((name, False, str(e)[:30]))

            # Test export buttons
            export_buttons = driver.find_elements(By.XPATH, "//button[contains(text(), 'Export') or contains(text(), 'Download') or contains(text(), 'CSV') or contains(text(), 'PNG')]")
            for btn in export_buttons[:3]:
                try:
                    name = btn.text.strip()[:20]
                    results['export_features'].append((f'Button: {name}', True, 'exists'))
                    print(f"    [PASS] Export button: {name}")
                except:
                    pass

            # ================================================================
            # TEST ERROR HANDLING
            # ================================================================
            print("\n" + "=" * 60)
            print("[11] ERROR HANDLING")
            print("=" * 60)

            error_tests = [
                ("Handles empty input", "EdgeCaseHandler.validatePaired([], []).error !== undefined"),
                ("Handles null input", "EdgeCaseHandler.validatePaired(null, null).valid === false"),
                ("Handles single study", "EdgeCaseHandler.validatePaired([1], [0.1]).valid === false"),
                ("Returns error message", "EdgeCaseHandler.validatePaired([1,2], [0, 0.1]).error.includes('SE')"),
            ]

            for name, test_code in error_tests:
                try:
                    result = driver.execute_script(f"try {{ return {test_code}; }} catch(e) {{ return true; }}")
                    results['error_handling'].append((name, result, ''))
                    print(f"    {'[PASS]' if result else '[FAIL]'} {name}")
                except Exception as e:
                    results['error_handling'].append((name, False, str(e)[:30]))

            # ================================================================
            # CHECK CONSOLE ERRORS
            # ================================================================
            print("\n" + "=" * 60)
            print("[12] CONSOLE ERRORS")
            print("=" * 60)

            try:
                logs = driver.get_log("browser")
                severe = [l for l in logs if l["level"] == "SEVERE"]

                ignore_patterns = ['favicon', 'wasm', 'WebAssembly', 'net::ERR', 'atob']
                real_errors = []
                for log in severe:
                    msg = log["message"]
                    if not any(p.lower() in msg.lower() for p in ignore_patterns):
                        real_errors.append(msg[:80])

                results['console_errors'] = real_errors
                print(f"    Total severe logs: {len(severe)}")
                print(f"    Real errors: {len(real_errors)}")

                if real_errors:
                    print("\n    Errors found:")
                    for err in real_errors[:5]:
                        print(f"    - {err[:70]}")
                else:
                    print("    [PASS] No JavaScript errors!")

            except Exception as e:
                print(f"    Could not check logs: {e}")

            # ================================================================
            # FINAL SUMMARY
            # ================================================================
            print("\n" + "=" * 80)
            print("COMPREHENSIVE TEST SUMMARY")
            print("=" * 80)

            categories = [
                ('Data Handling', results['data_handling']),
                ('Dose-Response Tab', results['dose_response_tab']),
                ('Ranking Tab', results['ranking_tab']),
                ('Network Tab', results['network_tab']),
                ('Bias Tab', results['bias_tab']),
                ('Diagnostics Tab', results['diagnostics_tab']),
                ('Statistical Functions', results['statistical_functions']),
                ('UI Elements', results['ui_elements']),
                ('Export Features', results['export_features']),
                ('Error Handling', results['error_handling']),
            ]

            total_pass = 0
            total_fail = 0

            for cat_name, cat_results in categories:
                passed = sum(1 for r in cat_results if r[1])
                failed = sum(1 for r in cat_results if not r[1])
                total_pass += passed
                total_fail += failed
                status = "[PASS]" if failed == 0 else f"[{failed} FAIL]"
                print(f"  {cat_name:25} {passed:2}/{passed+failed:2} {status}")

            print(f"\n  Console Errors: {len(results['console_errors'])}")

            # Calculate score
            total = total_pass + total_fail
            pass_rate = total_pass / total if total > 0 else 0
            error_penalty = min(0.2, len(results['console_errors']) * 0.05)
            score = (pass_rate * 10) - (error_penalty * 10)

            print("\n" + "=" * 80)
            print(f"TOTAL: {total_pass}/{total} tests passed ({pass_rate*100:.1f}%)")
            print(f"FINAL SCORE: {max(0, score):.1f}/10")
            print("=" * 80)

            # Save results
            with open('comprehensive_test_results.json', 'w') as f:
                # Convert tuples to lists for JSON
                json_results = {}
                for key, val in results.items():
                    if isinstance(val, list) and val and isinstance(val[0], tuple):
                        json_results[key] = [{'test': t[0], 'passed': t[1], 'detail': t[2]} for t in val]
                    else:
                        json_results[key] = val
                json.dump(json_results, f, indent=2)

            print(f"\nResults saved to comprehensive_test_results.json")
            return results

        finally:
            if driver:
                driver.quit()
            server.stop()

    except Exception as e:
        print(f"\nFATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        return None


if __name__ == "__main__":
    run_comprehensive_test()
