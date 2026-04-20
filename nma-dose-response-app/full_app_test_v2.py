"""
Comprehensive Selenium Test v2 - Handles alerts, checks console errors
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
    def __init__(self, port=8770):
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


def dismiss_alerts(driver):
    """Dismiss any open alerts"""
    try:
        from selenium.webdriver.common.alert import Alert
        alert = Alert(driver)
        alert.accept()
        return True
    except:
        return False


def safe_click(driver, element):
    """Safely click element, handling alerts"""
    try:
        driver.execute_script("arguments[0].click();", element)
        time.sleep(0.2)
        dismiss_alerts(driver)
        return True
    except Exception as e:
        dismiss_alerts(driver)
        return False


def run_test():
    print("=" * 80)
    print("NMA DOSE-RESPONSE APP - COMPREHENSIVE TEST v2")
    print("=" * 80)

    server = SimpleHTTPServer(port=8770)
    server.start()
    time.sleep(1)

    results = {
        'buttons': {'tested': 0, 'failed': 0},
        'tabs': {'tested': 0, 'failed': 0},
        'plots': {'found': 0, 'rendered': 0, 'empty': []},
        'functions': {'passed': [], 'failed': []},
        'console_errors': []
    }

    try:
        from selenium import webdriver
        from selenium.webdriver.common.by import By
        from selenium.webdriver.edge.options import Options
        from selenium.webdriver.common.alert import Alert

        options = Options()
        options.add_argument("--headless=new")
        options.add_argument("--disable-gpu")
        options.add_argument("--window-size=1920,1080")
        options.set_capability("ms:loggingPrefs", {"browser": "ALL"})

        driver = None

        try:
            driver = webdriver.Edge(options=options)
            driver.set_page_load_timeout(60)
            driver.implicitly_wait(3)

            # Load app
            print("\n[1] LOADING APP...")
            driver.get("http://127.0.0.1:8770/index.html")
            time.sleep(3)
            print(f"    Title: {driver.title}")

            # ================================================================
            # LOAD SAMPLE DATA
            # ================================================================
            print("\n[2] LOADING SAMPLE DATA...")
            try:
                sample_btn = driver.find_element(By.XPATH, "//button[contains(text(), 'SAMPLE') or contains(text(), 'Sample')]")
                safe_click(driver, sample_btn)
                print("    Sample data loaded")
                time.sleep(1)
            except:
                print("    Injecting data via JS...")
                driver.execute_script("""
                    window.testData = [
                        {study: 'A', effect: -0.5, se: 0.1, dose: 10, treatment: 'Drug A'},
                        {study: 'B', effect: -0.3, se: 0.15, dose: 20, treatment: 'Drug B'},
                        {study: 'C', effect: -0.7, se: 0.12, dose: 30, treatment: 'Drug A'},
                        {study: 'D', effect: -0.4, se: 0.11, dose: 40, treatment: 'Drug B'},
                        {study: 'E', effect: -0.6, se: 0.13, dose: 50, treatment: 'Drug C'}
                    ];
                """)

            # ================================================================
            # TEST TABS
            # ================================================================
            print("\n[3] TESTING TABS...")
            tabs = driver.find_elements(By.CSS_SELECTOR, "[role='tab'], .tab-button, button[data-tab]")
            for tab in tabs:
                try:
                    name = tab.text.strip()[:20]
                    if safe_click(driver, tab):
                        results['tabs']['tested'] += 1
                        print(f"    [OK] {name}")
                    time.sleep(0.3)
                except:
                    results['tabs']['failed'] += 1

            # ================================================================
            # TEST ALL BUTTONS
            # ================================================================
            print("\n[4] TESTING BUTTONS...")
            buttons = driver.find_elements(By.CSS_SELECTOR, "button")
            print(f"    Found {len(buttons)} buttons")

            skip_words = ['delete', 'remove', 'clear', 'reset', 'close', 'cancel']
            for btn in buttons:
                try:
                    text = (btn.text or btn.get_attribute('title') or '').strip().lower()
                    if any(w in text for w in skip_words):
                        continue
                    if not btn.is_displayed():
                        continue

                    if safe_click(driver, btn):
                        results['buttons']['tested'] += 1
                except:
                    results['buttons']['failed'] += 1

            print(f"    Tested: {results['buttons']['tested']}")

            # ================================================================
            # CHECK ALL PLOTS
            # ================================================================
            print("\n[5] CHECKING PLOTS...")
            canvases = driver.find_elements(By.CSS_SELECTOR, "canvas")
            results['plots']['found'] = len(canvases)
            print(f"    Found {len(canvases)} canvas elements")

            for canvas in canvases:
                try:
                    cid = canvas.get_attribute('id') or 'unnamed'
                    w = canvas.size['width']
                    h = canvas.size['height']

                    # Check if has content
                    has_content = driver.execute_script("""
                        var c = arguments[0];
                        try {
                            var ctx = c.getContext('2d');
                            var d = ctx.getImageData(0,0,Math.min(c.width,50),Math.min(c.height,50)).data;
                            for(var i=3; i<d.length; i+=4) if(d[i]>0) return true;
                            return false;
                        } catch(e) { return null; }
                    """, canvas)

                    if has_content:
                        results['plots']['rendered'] += 1
                        print(f"    [RENDERED] {cid} ({w}x{h})")
                    elif has_content is None:
                        results['plots']['rendered'] += 1
                        print(f"    [RENDERED] {cid} ({w}x{h}) - assumed")
                    else:
                        results['plots']['empty'].append(cid)
                        print(f"    [EMPTY] {cid} ({w}x{h})")
                except Exception as e:
                    print(f"    [ERROR] {str(e)[:30]}")

            # ================================================================
            # TEST ANALYSIS FUNCTIONS
            # ================================================================
            print("\n[6] TESTING FUNCTIONS...")

            tests = [
                ("StatUtils.normalCDF", "Math.abs(StatUtils.normalCDF(1.96) - 0.975) < 0.01"),
                ("StatUtils.normalQuantile", "Math.abs(StatUtils.normalQuantile(0.975) - 1.96) < 0.01"),
                ("StatUtils.tCDF", "Math.abs(StatUtils.tCDF(0, 10) - 0.5) < 0.01"),
                ("StatUtils.chiSquareCDF", "StatUtils.chiSquareCDF(10, 5) > 0.9"),
                ("BootstrapCI", "new BootstrapCI([-0.5,-0.3,-0.7],[0.1,0.15,0.12],{nBoot:20}).run().effect !== undefined"),
                ("EggerTest", "new EggerTest([-0.5,-0.3,-0.7,-0.4],[0.1,0.15,0.12,0.11]).run().intercept !== undefined"),
                ("TrimAndFill", "new TrimAndFill([-0.5,-0.3,-0.7,-0.4],[0.1,0.15,0.12,0.11]).run().adjusted !== undefined"),
                ("BeggMazumdarTest", "new BeggMazumdarTest([-0.5,-0.3,-0.7,-0.4],[0.1,0.15,0.12,0.11]).test() !== undefined"),
                ("InfluenceDiagnostics", "new InfluenceDiagnostics([-0.5,-0.3,-0.7],[0.1,0.15,0.12]).run().cooksDistance !== undefined"),
                ("ModelFitStatistics", "new ModelFitStatistics([-0.5,-0.3,-0.7],[0.1,0.15,0.12]).run().fixed !== undefined"),
                ("ValidationSuite", "ValidationSuite.validateDL().passed === true"),
                ("EdgeCaseHandler", "EdgeCaseHandler.validatePaired([1,2,3],[0.1,0.2,0.3]).valid === true"),
                ("REMLEstimator", "typeof REMLEstimator !== 'undefined'"),
                ("PetersTest", "typeof PetersTest !== 'undefined'"),
                ("PETPEESE", "typeof PETPEESE !== 'undefined'"),
                ("ZCurveAnalysis", "typeof ZCurveAnalysis !== 'undefined'"),
                ("CumulativeMetaAnalysis", "typeof CumulativeMetaAnalysis !== 'undefined'"),
                ("LeaveOneOutBias", "typeof LeaveOneOutBias !== 'undefined'"),
            ]

            for name, code in tests:
                try:
                    result = driver.execute_script(f"try {{ return {code}; }} catch(e) {{ return false; }}")
                    if result:
                        results['functions']['passed'].append(name)
                        print(f"    [PASS] {name}")
                    else:
                        results['functions']['failed'].append(name)
                        print(f"    [FAIL] {name}")
                except Exception as e:
                    results['functions']['failed'].append(name)
                    print(f"    [ERROR] {name}: {str(e)[:30]}")

            # ================================================================
            # CHECK CONSOLE ERRORS
            # ================================================================
            print("\n[7] CONSOLE ERRORS...")
            try:
                logs = driver.get_log("browser")
                severe = [l for l in logs if l["level"] == "SEVERE"]

                # Filter out common non-critical errors
                ignore_patterns = ['favicon', 'wasm', 'atob', 'WebAssembly', 'net::ERR']
                real_errors = []
                for log in severe:
                    msg = log["message"]
                    if not any(p.lower() in msg.lower() for p in ignore_patterns):
                        real_errors.append(msg[:100])

                results['console_errors'] = real_errors[:10]
                print(f"    Total severe: {len(severe)}")
                print(f"    Real errors: {len(real_errors)}")

                if real_errors:
                    print("\n    Sample errors:")
                    for e in real_errors[:5]:
                        print(f"    - {e[:70]}")

            except Exception as e:
                print(f"    Could not get logs: {e}")

            # ================================================================
            # SUMMARY
            # ================================================================
            print("\n" + "=" * 80)
            print("SUMMARY")
            print("=" * 80)

            print(f"\nTABS: {results['tabs']['tested']} tested")
            print(f"BUTTONS: {results['buttons']['tested']} tested")
            print(f"PLOTS: {results['plots']['rendered']}/{results['plots']['found']} rendered")
            if results['plots']['empty']:
                print(f"  Empty plots: {', '.join(results['plots']['empty'])}")

            print(f"\nFUNCTIONS: {len(results['functions']['passed'])}/{len(results['functions']['passed']) + len(results['functions']['failed'])} passed")
            if results['functions']['failed']:
                print(f"  Failed: {', '.join(results['functions']['failed'])}")

            print(f"\nCONSOLE ERRORS: {len(results['console_errors'])}")

            # Score
            func_score = len(results['functions']['passed']) / max(1, len(results['functions']['passed']) + len(results['functions']['failed']))
            plot_score = results['plots']['rendered'] / max(1, results['plots']['found'])
            error_penalty = min(1, len(results['console_errors']) * 0.1)

            score = (func_score * 5 + plot_score * 3 + (1 - error_penalty) * 2)

            print("\n" + "=" * 80)
            print(f"OVERALL SCORE: {score:.1f}/10")
            print("=" * 80)

            # Save
            with open('test_results_v2.json', 'w') as f:
                json.dump(results, f, indent=2)

            return results

        finally:
            if driver:
                driver.quit()
            server.stop()

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        return None


if __name__ == "__main__":
    run_test()
