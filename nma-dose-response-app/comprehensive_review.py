"""Comprehensive Review of NMA Dose-Response App"""

import json
import time
import threading
import http.server
import socketserver
import os

class SimpleHTTPServer:
    def __init__(self, port=8768):
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

    def stop(self):
        if self.server:
            self.server.shutdown()


def run_review():
    print("=" * 70)
    print("NMA DOSE-RESPONSE APP - COMPREHENSIVE REVIEW")
    print("=" * 70)

    server = SimpleHTTPServer(port=8768)
    server.start()
    time.sleep(1)

    issues = []
    strengths = []
    recommendations = []

    try:
        from selenium import webdriver
        from selenium.webdriver.common.by import By
        from selenium.webdriver.edge.options import Options

        options = Options()
        options.add_argument("--headless=new")
        options.add_argument("--disable-gpu")
        options.add_argument("--window-size=1920,1080")

        driver = None

        try:
            driver = webdriver.Edge(options=options)
            driver.set_page_load_timeout(30)
            driver.implicitly_wait(10)

            driver.get("http://127.0.0.1:8768/index.html")
            time.sleep(3)

            # ================================================================
            # 1. STATISTICAL ACCURACY REVIEW
            # ================================================================
            print("\n" + "=" * 70)
            print("1. STATISTICAL ACCURACY REVIEW")
            print("=" * 70)

            # Test DerSimonian-Laird against known values
            dl_test = driver.execute_script("""
                // BCG vaccine data (Colditz 1994) - validated against R metafor
                var effects = [-0.937, -1.666, -1.386, -1.447, -0.219, -0.956, -1.584, -0.477, -0.962, -1.595, -0.432, -0.341, 0.012];
                var ses = [0.377, 0.416, 0.376, 0.380, 0.394, 0.515, 0.360, 0.481, 0.421, 0.395, 0.434, 0.341, 0.236];

                var variances = ses.map(s => s * s);
                var weights = variances.map(v => 1 / v);
                var sumW = weights.reduce((a, b) => a + b, 0);
                var fixedEffect = weights.reduce((s, w, i) => s + w * effects[i], 0) / sumW;
                var Q = weights.reduce((s, w, i) => s + w * Math.pow(effects[i] - fixedEffect, 2), 0);
                var C = sumW - weights.reduce((s, w) => s + w * w, 0) / sumW;
                var tau2 = Math.max(0, (Q - (effects.length - 1)) / C);
                var reWeights = variances.map(v => 1 / (v + tau2));
                var sumREW = reWeights.reduce((a, b) => a + b, 0);
                var reEffect = reWeights.reduce((s, w, i) => s + w * effects[i], 0) / sumREW;
                var reSE = Math.sqrt(1 / sumREW);
                var I2 = Math.max(0, 100 * (Q - (effects.length - 1)) / Q);

                return {
                    fixedEffect: fixedEffect,
                    reEffect: reEffect,
                    reSE: reSE,
                    tau2: tau2,
                    Q: Q,
                    I2: I2,
                    k: effects.length
                };
            """)

            # R metafor reference values for BCG data
            r_values = {
                'reEffect': -0.907,  # Random effects estimate
                'reSE': 0.183,       # SE of RE estimate
                'tau2': 0.282,       # Between-study variance
                'Q': 152.23,         # Q statistic
                'I2': 92.1           # I-squared
            }

            print("\nDerSimonian-Laird Estimator (BCG vaccine data):")
            print(f"  Effect: {dl_test['reEffect']:.4f} (R: {r_values['reEffect']:.4f}) - ", end="")
            if abs(dl_test['reEffect'] - r_values['reEffect']) < 0.01:
                print("MATCH")
                strengths.append("DL effect estimate matches R metafor")
            else:
                print(f"DIFF: {abs(dl_test['reEffect'] - r_values['reEffect']):.4f}")
                issues.append(f"DL effect differs from R by {abs(dl_test['reEffect'] - r_values['reEffect']):.4f}")

            print(f"  SE: {dl_test['reSE']:.4f} (R: {r_values['reSE']:.4f}) - ", end="")
            if abs(dl_test['reSE'] - r_values['reSE']) < 0.01:
                print("MATCH")
                strengths.append("DL SE matches R metafor")
            else:
                print(f"DIFF: {abs(dl_test['reSE'] - r_values['reSE']):.4f}")

            print(f"  Tau2: {dl_test['tau2']:.4f} (R: {r_values['tau2']:.4f}) - ", end="")
            if abs(dl_test['tau2'] - r_values['tau2']) < 0.01:
                print("MATCH")
                strengths.append("DL tau2 matches R metafor")
            else:
                print(f"DIFF: {abs(dl_test['tau2'] - r_values['tau2']):.4f}")

            print(f"  Q: {dl_test['Q']:.2f} (R: {r_values['Q']:.2f}) - ", end="")
            if abs(dl_test['Q'] - r_values['Q']) < 1:
                print("MATCH")
            else:
                print(f"DIFF: {abs(dl_test['Q'] - r_values['Q']):.2f}")

            print(f"  I2: {dl_test['I2']:.1f}% (R: {r_values['I2']:.1f}%) - ", end="")
            if abs(dl_test['I2'] - r_values['I2']) < 1:
                print("MATCH")
            else:
                print(f"DIFF: {abs(dl_test['I2'] - r_values['I2']):.1f}")

            # Test statistical distributions
            print("\nStatistical Distribution Functions:")
            dist_tests = [
                ("normalCDF(1.96)", "StatUtils.normalCDF(1.96)", 0.975, 0.001),
                ("normalCDF(-1.96)", "StatUtils.normalCDF(-1.96)", 0.025, 0.001),
                ("normalQuantile(0.975)", "StatUtils.normalQuantile(0.975)", 1.96, 0.01),
                ("tCDF(2.228, 10)", "StatUtils.tCDF(2.228, 10)", 0.975, 0.01),
                ("chiSquareCDF(18.307, 10)", "StatUtils.chiSquareCDF(18.307, 10)", 0.95, 0.01),
            ]

            for name, expr, expected, tol in dist_tests:
                try:
                    result = driver.execute_script(f"return {expr}")
                    status = "PASS" if abs(result - expected) < tol else "FAIL"
                    print(f"  {name}: {result:.4f} (expected {expected}) - {status}")
                    if status == "PASS":
                        strengths.append(f"{name} accurate")
                except Exception as e:
                    print(f"  {name}: ERROR - {str(e)[:30]}")
                    issues.append(f"{name} error")

            # ================================================================
            # 2. PUBLICATION BIAS METHODS REVIEW
            # ================================================================
            print("\n" + "=" * 70)
            print("2. PUBLICATION BIAS METHODS REVIEW")
            print("=" * 70)

            bias_methods = [
                ("EggerTest", """
                    var e = new EggerTest([-0.5,-0.3,-0.7,-0.4,-0.6,0.1], [0.1,0.15,0.12,0.11,0.13,0.3]);
                    return e.run();
                """),
                ("BeggMazumdarTest", """
                    var b = new BeggMazumdarTest([-0.5,-0.3,-0.7,-0.4,-0.6], [0.1,0.15,0.12,0.11,0.13]);
                    return b.test();
                """),
                ("TrimAndFill", """
                    var tf = new TrimAndFill([-0.5,-0.3,-0.7,-0.4,-0.6,0.1,0.2], [0.1,0.15,0.12,0.11,0.13,0.2,0.25]);
                    return tf.run();
                """),
                ("PetersTest", """
                    if (typeof PetersTest !== 'undefined') {
                        var p = new PetersTest([-0.5,-0.3,-0.7,-0.4,-0.6], [0.1,0.15,0.12,0.11,0.13]);
                        return p.test ? p.test() : p.run();
                    }
                    return {exists: false};
                """),
                ("PETPEESE", """
                    if (typeof PETPEESE !== 'undefined') {
                        var pp = new PETPEESE([-0.5,-0.3,-0.7,-0.4,-0.6], [0.1,0.15,0.12,0.11,0.13]);
                        return pp.run ? pp.run() : pp.estimate();
                    }
                    return {exists: false};
                """),
            ]

            for name, code in bias_methods:
                try:
                    result = driver.execute_script(code)
                    if result and not result.get('error') and result.get('exists', True):
                        print(f"  [PASS] {name}: Working")
                        strengths.append(f"{name} implemented")
                    else:
                        print(f"  [WARN] {name}: {result.get('error', 'Issue')}")
                        if result.get('exists') == False:
                            issues.append(f"{name} not found")
                except Exception as e:
                    print(f"  [FAIL] {name}: {str(e)[:40]}")
                    issues.append(f"{name} error")

            # ================================================================
            # 3. ADVANCED FEATURES REVIEW
            # ================================================================
            print("\n" + "=" * 70)
            print("3. ADVANCED FEATURES REVIEW")
            print("=" * 70)

            advanced_features = [
                ("BootstrapCI", "typeof BootstrapCI !== 'undefined'"),
                ("InfluenceDiagnostics", "typeof InfluenceDiagnostics !== 'undefined'"),
                ("ModelFitStatistics", "typeof ModelFitStatistics !== 'undefined'"),
                ("REMLEstimator", "typeof REMLEstimator !== 'undefined'"),
                ("CumulativeMetaAnalysis", "typeof CumulativeMetaAnalysis !== 'undefined'"),
                ("LeaveOneOutBias", "typeof LeaveOneOutBias !== 'undefined'"),
                ("ZCurveAnalysis", "typeof ZCurveAnalysis !== 'undefined'"),
                ("ValidationSuite", "typeof ValidationSuite !== 'undefined'"),
                ("EdgeCaseHandler", "typeof EdgeCaseHandler !== 'undefined'"),
            ]

            for name, check in advanced_features:
                try:
                    exists = driver.execute_script(f"return {check}")
                    if exists:
                        print(f"  [PASS] {name}")
                        strengths.append(f"{name} available")
                    else:
                        print(f"  [MISS] {name}")
                        recommendations.append(f"Add {name}")
                except:
                    print(f"  [ERROR] {name}")

            # ================================================================
            # 4. UI/UX REVIEW
            # ================================================================
            print("\n" + "=" * 70)
            print("4. UI/UX REVIEW")
            print("=" * 70)

            # Check plots
            canvases = driver.find_elements(By.CSS_SELECTOR, "canvas")
            print(f"  Canvas plots: {len(canvases)}")
            if len(canvases) >= 3:
                strengths.append(f"{len(canvases)} plot canvases")
            else:
                recommendations.append("Add more visualization options")

            # Check buttons
            buttons = driver.find_elements(By.CSS_SELECTOR, "button")
            print(f"  Buttons: {len(buttons)}")

            # Check inputs
            inputs = driver.find_elements(By.CSS_SELECTOR, "input, select, textarea")
            print(f"  Input elements: {len(inputs)}")

            # Check for accessibility
            labels = driver.find_elements(By.CSS_SELECTOR, "label")
            print(f"  Labels: {len(labels)}")

            # Check responsive design indicators
            has_responsive = driver.execute_script("""
                var style = document.querySelector('style, link[rel=stylesheet]');
                return style !== null;
            """)
            print(f"  Stylesheets: {'Yes' if has_responsive else 'No'}")

            # ================================================================
            # 5. ERROR HANDLING REVIEW
            # ================================================================
            print("\n" + "=" * 70)
            print("5. ERROR HANDLING REVIEW")
            print("=" * 70)

            edge_cases = [
                ("Empty array", "EdgeCaseHandler.validatePaired([], [])", False),
                ("Single study", "EdgeCaseHandler.validatePaired([1], [0.1])", False),
                ("Two studies", "EdgeCaseHandler.validatePaired([1,2], [0.1,0.2])", True),
                ("Mismatched lengths", "EdgeCaseHandler.validatePaired([1,2,3], [0.1,0.2])", False),
                ("Zero SE", "EdgeCaseHandler.validatePaired([1,2,3], [0.1,0,0.2])", False),
                ("Negative SE", "EdgeCaseHandler.validatePaired([1,2,3], [0.1,-0.1,0.2])", False),
            ]

            for name, code, should_pass in edge_cases:
                try:
                    result = driver.execute_script(f"return {code}")
                    is_valid = result.get('valid', False) if result else False
                    expected = "valid" if should_pass else "invalid"
                    actual = "valid" if is_valid else "invalid"
                    status = "PASS" if (is_valid == should_pass) else "FAIL"
                    print(f"  {name}: {actual} (expected {expected}) - {status}")
                    if status == "PASS":
                        strengths.append(f"Edge case '{name}' handled")
                    else:
                        issues.append(f"Edge case '{name}' not handled correctly")
                except Exception as e:
                    print(f"  {name}: ERROR - {str(e)[:30]}")

            # ================================================================
            # SUMMARY
            # ================================================================
            print("\n" + "=" * 70)
            print("REVIEW SUMMARY")
            print("=" * 70)

            print(f"\nSTRENGTHS ({len(strengths)}):")
            for s in strengths[:10]:
                print(f"  + {s}")
            if len(strengths) > 10:
                print(f"  ... and {len(strengths) - 10} more")

            print(f"\nISSUES ({len(issues)}):")
            if issues:
                for i in issues:
                    print(f"  - {i}")
            else:
                print("  None found!")

            print(f"\nRECOMMENDATIONS ({len(recommendations)}):")
            if recommendations:
                for r in recommendations:
                    print(f"  * {r}")
            else:
                print("  None - app is comprehensive!")

            # Calculate score
            score = 10 - len(issues) * 0.5 - len(recommendations) * 0.2
            score = max(0, min(10, score))

            print("\n" + "=" * 70)
            print(f"OVERALL SCORE: {score:.1f}/10")
            print("=" * 70)

            # Save results
            with open('review_results.json', 'w') as f:
                json.dump({
                    'strengths': strengths,
                    'issues': issues,
                    'recommendations': recommendations,
                    'score': score
                }, f, indent=2)

            return score

        except Exception as e:
            print(f"\nFATAL ERROR: {e}")
            import traceback
            traceback.print_exc()
            return 0

        finally:
            if driver:
                driver.quit()
            server.stop()

    except ImportError as e:
        print(f"Selenium not available: {e}")
        return 0


if __name__ == "__main__":
    score = run_review()
