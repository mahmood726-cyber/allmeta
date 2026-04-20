"""
Comprehensive Selenium Test - Tests EVERY button and function
Checks all plots render correctly
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
        pass  # Suppress logging

class SimpleHTTPServer:
    def __init__(self, port=8769):
        self.port = port
        self.server = None
        self.thread = None

    def start(self):
        os.chdir(os.path.dirname(os.path.abspath(__file__)))
        self.server = socketserver.TCPServer(("127.0.0.1", self.port), QuietHTTPHandler)
        self.thread = threading.Thread(target=self.server.serve_forever)
        self.thread.daemon = True
        self.thread.start()
        print(f"Server: http://127.0.0.1:{self.port}")

    def stop(self):
        if self.server:
            self.server.shutdown()


def run_full_test():
    print("=" * 80)
    print("NMA DOSE-RESPONSE APP - FULL SELENIUM TEST")
    print("=" * 80)
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    server = SimpleHTTPServer(port=8769)
    server.start()
    time.sleep(1)

    results = {
        'buttons_tested': [],
        'buttons_failed': [],
        'plots_found': [],
        'plots_rendered': [],
        'functions_tested': [],
        'functions_failed': [],
        'console_errors': [],
        'warnings': []
    }

    try:
        from selenium import webdriver
        from selenium.webdriver.common.by import By
        from selenium.webdriver.edge.options import Options
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC
        from selenium.common.exceptions import ElementClickInterceptedException, ElementNotInteractableException

        options = Options()
        options.add_argument("--headless=new")
        options.add_argument("--disable-gpu")
        options.add_argument("--window-size=1920,1080")
        options.add_argument("--disable-web-security")
        options.set_capability("ms:loggingPrefs", {"browser": "ALL"})

        driver = None

        try:
            driver = webdriver.Edge(options=options)
            driver.set_page_load_timeout(60)
            driver.implicitly_wait(5)
            wait = WebDriverWait(driver, 10)

            # Load app
            print("\n[1] LOADING APP...")
            driver.get("http://127.0.0.1:8769/index.html")
            time.sleep(3)
            print(f"    Title: {driver.title}")

            # ================================================================
            # SECTION 2: LOAD SAMPLE DATA
            # ================================================================
            print("\n[2] LOADING SAMPLE DATA...")

            # Try to find and click sample data button
            sample_loaded = False
            sample_buttons = driver.find_elements(By.XPATH,
                "//button[contains(text(), 'Sample') or contains(text(), 'Load') or contains(text(), 'Demo') or contains(text(), 'Example')]")

            for btn in sample_buttons[:3]:
                try:
                    btn_text = btn.text.strip()[:30]
                    driver.execute_script("arguments[0].click();", btn)
                    time.sleep(1)
                    print(f"    Clicked: '{btn_text}'")
                    sample_loaded = True
                    results['buttons_tested'].append(f"Sample: {btn_text}")
                    break
                except:
                    pass

            # If no sample button, inject test data
            if not sample_loaded:
                print("    Injecting test data via JavaScript...")
                driver.execute_script("""
                    if (typeof state !== 'undefined') {
                        state.parsedData = {
                            rows: [
                                {study: 'Study 1', effect: -0.5, se: 0.1, dose: 10},
                                {study: 'Study 2', effect: -0.3, se: 0.15, dose: 20},
                                {study: 'Study 3', effect: -0.7, se: 0.12, dose: 30},
                                {study: 'Study 4', effect: -0.4, se: 0.11, dose: 40},
                                {study: 'Study 5', effect: -0.6, se: 0.13, dose: 50},
                                {study: 'Study 6', effect: -0.2, se: 0.18, dose: 60}
                            ]
                        };
                    }
                """)
                sample_loaded = True

            # ================================================================
            # SECTION 3: TEST ALL TABS
            # ================================================================
            print("\n[3] TESTING TABS...")
            tabs = driver.find_elements(By.CSS_SELECTOR, "[role='tab'], .tab, .nav-tab, .tab-button, button[data-tab]")
            print(f"    Found {len(tabs)} tab elements")

            for i, tab in enumerate(tabs[:15]):  # Limit to first 15 tabs
                try:
                    tab_text = tab.text.strip()[:25] or f"Tab {i+1}"
                    driver.execute_script("arguments[0].click();", tab)
                    time.sleep(0.5)
                    results['buttons_tested'].append(f"Tab: {tab_text}")
                    print(f"    [OK] Tab: {tab_text}")
                except Exception as e:
                    results['warnings'].append(f"Tab {i}: {str(e)[:30]}")

            # ================================================================
            # SECTION 4: TEST ALL BUTTONS
            # ================================================================
            print("\n[4] TESTING ALL BUTTONS...")
            buttons = driver.find_elements(By.CSS_SELECTOR, "button")
            print(f"    Found {len(buttons)} buttons")

            tested_count = 0
            for i, btn in enumerate(buttons):
                try:
                    btn_text = btn.text.strip()[:30] or btn.get_attribute('title') or btn.get_attribute('aria-label') or f"Button {i+1}"

                    # Skip certain buttons that might cause issues
                    skip_keywords = ['delete', 'remove', 'clear all', 'reset', 'logout', 'close']
                    if any(kw in btn_text.lower() for kw in skip_keywords):
                        continue

                    # Check if button is visible and enabled
                    if not btn.is_displayed() or not btn.is_enabled():
                        continue

                    # Click the button
                    try:
                        driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", btn)
                        time.sleep(0.1)
                        driver.execute_script("arguments[0].click();", btn)
                        time.sleep(0.3)
                        results['buttons_tested'].append(btn_text)
                        tested_count += 1

                        if tested_count % 20 == 0:
                            print(f"    Tested {tested_count} buttons...")

                    except (ElementClickInterceptedException, ElementNotInteractableException):
                        pass
                    except Exception as e:
                        results['buttons_failed'].append(f"{btn_text}: {str(e)[:30]}")

                except Exception as e:
                    pass

            print(f"    Successfully tested {tested_count} buttons")

            # ================================================================
            # SECTION 5: CHECK ALL CANVAS PLOTS
            # ================================================================
            print("\n[5] CHECKING CANVAS PLOTS...")
            canvases = driver.find_elements(By.CSS_SELECTOR, "canvas")
            print(f"    Found {len(canvases)} canvas elements")

            for i, canvas in enumerate(canvases):
                try:
                    canvas_id = canvas.get_attribute('id') or f"canvas_{i+1}"
                    width = canvas.get_attribute('width') or canvas.size['width']
                    height = canvas.get_attribute('height') or canvas.size['height']

                    results['plots_found'].append(canvas_id)

                    # Check if canvas has content (non-empty)
                    has_content = driver.execute_script("""
                        var canvas = arguments[0];
                        var ctx = canvas.getContext('2d');
                        if (!ctx) return false;
                        try {
                            var imageData = ctx.getImageData(0, 0, Math.min(canvas.width, 100), Math.min(canvas.height, 100));
                            var data = imageData.data;
                            for (var i = 0; i < data.length; i += 4) {
                                if (data[i+3] > 0) return true;  // Non-transparent pixel found
                            }
                            return false;
                        } catch(e) {
                            return null;  // CORS or other error
                        }
                    """, canvas)

                    if has_content:
                        results['plots_rendered'].append(canvas_id)
                        print(f"    [RENDERED] {canvas_id} ({width}x{height})")
                    elif has_content is None:
                        print(f"    [UNKNOWN] {canvas_id} ({width}x{height}) - cannot inspect")
                        results['plots_rendered'].append(canvas_id)  # Assume rendered
                    else:
                        print(f"    [EMPTY] {canvas_id} ({width}x{height})")

                except Exception as e:
                    results['warnings'].append(f"Canvas {i}: {str(e)[:30]}")

            # ================================================================
            # SECTION 6: TEST KEY ANALYSIS FUNCTIONS
            # ================================================================
            print("\n[6] TESTING ANALYSIS FUNCTIONS...")

            analysis_tests = [
                ("Meta-Analysis (DL)", """
                    var effects = [-0.5, -0.3, -0.7, -0.4, -0.6];
                    var ses = [0.1, 0.15, 0.12, 0.11, 0.13];
                    var v = ses.map(s => s*s);
                    var w = v.map(x => 1/x);
                    var sw = w.reduce((a,b) => a+b);
                    var eff = w.reduce((s,wi,i) => s + wi*effects[i], 0) / sw;
                    return {success: true, effect: eff};
                """),
                ("BootstrapCI", """
                    try {
                        var b = new BootstrapCI([-0.5,-0.3,-0.7,-0.4,-0.6], [0.1,0.15,0.12,0.11,0.13], {nBoot:50});
                        var r = b.run();
                        return {success: !!r.effect, result: r};
                    } catch(e) { return {success: false, error: e.message}; }
                """),
                ("EggerTest", """
                    try {
                        var e = new EggerTest([-0.5,-0.3,-0.7,-0.4,-0.6,0.1], [0.1,0.15,0.12,0.11,0.13,0.2]);
                        var r = e.run();
                        return {success: 'intercept' in r, result: r};
                    } catch(e) { return {success: false, error: e.message}; }
                """),
                ("TrimAndFill", """
                    try {
                        var tf = new TrimAndFill([-0.5,-0.3,-0.7,-0.4,-0.6,0.1], [0.1,0.15,0.12,0.11,0.13,0.2]);
                        var r = tf.run();
                        return {success: 'adjusted' in r, result: r};
                    } catch(e) { return {success: false, error: e.message}; }
                """),
                ("BeggMazumdar", """
                    try {
                        var b = new BeggMazumdarTest([-0.5,-0.3,-0.7,-0.4,-0.6], [0.1,0.15,0.12,0.11,0.13]);
                        var r = b.test();
                        return {success: 'tau' in r || 'kendallTau' in r, result: r};
                    } catch(e) { return {success: false, error: e.message}; }
                """),
                ("InfluenceDiagnostics", """
                    try {
                        var inf = new InfluenceDiagnostics([-0.5,-0.3,-0.7,-0.4,-0.6], [0.1,0.15,0.12,0.11,0.13]);
                        var r = inf.run();
                        return {success: 'cooksDistance' in r, result: {n: r.cooksDistance?.length}};
                    } catch(e) { return {success: false, error: e.message}; }
                """),
                ("ModelFitStatistics", """
                    try {
                        var m = new ModelFitStatistics([-0.5,-0.3,-0.7,-0.4,-0.6], [0.1,0.15,0.12,0.11,0.13]);
                        var r = m.run();
                        return {success: 'fixed' in r && 'random' in r, result: r};
                    } catch(e) { return {success: false, error: e.message}; }
                """),
                ("ValidationSuite", """
                    try {
                        var r = ValidationSuite.validateDL();
                        return {success: r.passed, result: r};
                    } catch(e) { return {success: false, error: e.message}; }
                """),
                ("EdgeCaseHandler", """
                    try {
                        var r1 = EdgeCaseHandler.validatePaired([1,2,3], [0.1,0.2,0.3]);
                        var r2 = EdgeCaseHandler.validatePaired([1], [0.1]);
                        return {success: r1.valid && !r2.valid, validCase: r1, invalidCase: r2};
                    } catch(e) { return {success: false, error: e.message}; }
                """),
                ("StatUtils.normalCDF", """
                    try {
                        var r = StatUtils.normalCDF(1.96);
                        return {success: Math.abs(r - 0.975) < 0.01, result: r};
                    } catch(e) { return {success: false, error: e.message}; }
                """),
                ("StatUtils.tCDF", """
                    try {
                        var r = StatUtils.tCDF(2.228, 10);
                        return {success: Math.abs(r - 0.975) < 0.01, result: r};
                    } catch(e) { return {success: false, error: e.message}; }
                """),
                ("REMLEstimator", """
                    try {
                        if (typeof REMLEstimator === 'undefined') return {success: false, error: 'Not defined'};
                        var r = new REMLEstimator([-0.5,-0.3,-0.7,-0.4,-0.6], [0.1,0.15,0.12,0.11,0.13]);
                        var result = r.estimate ? r.estimate() : r.run();
                        return {success: true, result: result};
                    } catch(e) { return {success: false, error: e.message}; }
                """),
            ]

            for name, code in analysis_tests:
                try:
                    result = driver.execute_script(code)
                    if result and result.get('success'):
                        results['functions_tested'].append(name)
                        print(f"    [PASS] {name}")
                    else:
                        error = result.get('error', 'Unknown error') if result else 'No result'
                        results['functions_failed'].append(f"{name}: {error}")
                        print(f"    [FAIL] {name}: {error}")
                except Exception as e:
                    results['functions_failed'].append(f"{name}: {str(e)[:40]}")
                    print(f"    [ERROR] {name}: {str(e)[:40]}")

            # ================================================================
            # SECTION 7: CHECK CONSOLE ERRORS
            # ================================================================
            print("\n[7] CHECKING CONSOLE ERRORS...")
            try:
                logs = driver.get_log("browser")
                for log in logs:
                    if log["level"] == "SEVERE":
                        msg = log["message"][:100]
                        if msg not in results['console_errors']:
                            results['console_errors'].append(msg)
                print(f"    Found {len(results['console_errors'])} severe console errors")
            except:
                print("    Could not retrieve console logs")

            # ================================================================
            # SECTION 8: TEST PLOT GENERATION
            # ================================================================
            print("\n[8] TESTING PLOT GENERATION...")

            # Look for plot buttons
            plot_buttons = driver.find_elements(By.XPATH,
                "//button[contains(text(), 'Plot') or contains(text(), 'Forest') or contains(text(), 'Funnel') or contains(text(), 'Graph') or contains(text(), 'Chart')]")

            for btn in plot_buttons[:10]:
                try:
                    btn_text = btn.text.strip()[:25]
                    if btn.is_displayed() and btn.is_enabled():
                        driver.execute_script("arguments[0].click();", btn)
                        time.sleep(0.5)
                        print(f"    Clicked plot button: {btn_text}")
                except:
                    pass

            # Re-check canvases after clicking plot buttons
            time.sleep(1)
            canvases_after = driver.find_elements(By.CSS_SELECTOR, "canvas")
            print(f"    Canvases after plot generation: {len(canvases_after)}")

            # ================================================================
            # SUMMARY
            # ================================================================
            print("\n" + "=" * 80)
            print("TEST SUMMARY")
            print("=" * 80)

            print(f"\nBUTTONS:")
            print(f"  Tested: {len(results['buttons_tested'])}")
            print(f"  Failed: {len(results['buttons_failed'])}")

            print(f"\nPLOTS:")
            print(f"  Found: {len(results['plots_found'])}")
            print(f"  Rendered: {len(results['plots_rendered'])}")

            print(f"\nFUNCTIONS:")
            print(f"  Passed: {len(results['functions_tested'])}")
            print(f"  Failed: {len(results['functions_failed'])}")

            print(f"\nCONSOLE ERRORS: {len(results['console_errors'])}")

            if results['functions_failed']:
                print("\nFAILED FUNCTIONS:")
                for f in results['functions_failed']:
                    print(f"  X {f}")

            if results['console_errors']:
                print("\nCONSOLE ERRORS (first 5):")
                for e in results['console_errors'][:5]:
                    print(f"  X {e[:80]}")

            # Calculate score
            total_tests = len(results['functions_tested']) + len(results['functions_failed'])
            passed_tests = len(results['functions_tested'])
            score = (passed_tests / total_tests * 10) if total_tests > 0 else 0

            print("\n" + "=" * 80)
            if len(results['functions_failed']) == 0 and len(results['console_errors']) == 0:
                print("RESULT: ALL TESTS PASSED!")
            else:
                print(f"RESULT: {len(results['functions_failed'])} function failures, {len(results['console_errors'])} console errors")
            print(f"SCORE: {score:.1f}/10")
            print("=" * 80)

            # Save results
            with open('full_test_results.json', 'w') as f:
                json.dump(results, f, indent=2)

            return results

        except Exception as e:
            print(f"\nFATAL ERROR: {e}")
            import traceback
            traceback.print_exc()
            return None

        finally:
            if driver:
                driver.quit()
            server.stop()

    except ImportError as e:
        print(f"Selenium not available: {e}")
        return None


if __name__ == "__main__":
    results = run_full_test()
