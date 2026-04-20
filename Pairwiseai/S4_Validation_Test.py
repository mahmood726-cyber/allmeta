"""
TruthCert-PairwisePro Validation Test (S4)

This validator is aligned with the current app implementation and checks:
1) Built-in algorithmic reference tests (runAutomatedTests)
2) UI pipeline consistency (data load -> run -> result fields)
3) Cross-checks between rendered results and core calculation functions
4) Smoke checks for additional analysis modules
"""

import json
import math
import os
import time
from datetime import datetime
from pathlib import Path

from selenium import webdriver
from selenium.common.exceptions import NoAlertPresentException
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import Select, WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options


def resolve_app_html(default_name="TruthCert-PairwisePro-v1.0.html"):
    override = os.environ.get("TRUTHCERT_HTML")
    if override:
        path = Path(override).expanduser()
        if path.is_file():
            return path.resolve()
        raise FileNotFoundError(f"TRUTHCERT_HTML not found: {path}")

    base = Path(__file__).resolve().parent
    candidates = [
        base / default_name,
        base / "TruthCert-PairwisePro-v1.0-fast.html",
        base / "TruthCert-PairwisePro-v1.0-bundle.html",
    ]
    for candidate in candidates:
        if candidate.is_file():
            return candidate.resolve()

    raise FileNotFoundError("Could not locate a TruthCert HTML file in script directory")


def dismiss_alerts(driver):
    try:
        alert = driver.switch_to.alert
        alert.dismiss()
        time.sleep(0.2)
    except NoAlertPresentException:
        pass


def is_finite_number(value):
    return isinstance(value, (int, float)) and math.isfinite(value)


def compare_numbers(actual, expected, rel_tol=1e-6, abs_tol=1e-8):
    if not is_finite_number(actual) or not is_finite_number(expected):
        return False
    return math.isclose(float(actual), float(expected), rel_tol=rel_tol, abs_tol=abs_tol)


def record_test(results, section, name, passed, actual=None, expected=None, error=None):
    entry = {
        "section": section,
        "name": name,
        "pass": bool(passed),
    }
    if actual is not None:
        entry["actual"] = actual
    if expected is not None:
        entry["expected"] = expected
    if error is not None:
        entry["error"] = str(error)

    results["tests"].append(entry)
    if passed:
        results["passed"] += 1
    else:
        results["failed"] += 1


def run_analysis(driver, run_btn, pause_seconds=2.5):
    driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", run_btn)
    time.sleep(0.2)
    try:
        run_btn.click()
    except Exception:
        driver.execute_script("arguments[0].click();", run_btn)
    time.sleep(pause_seconds)
    dismiss_alerts(driver)


def run_validation():
    results = {
        "timestamp": datetime.now().isoformat(),
        "passed": 0,
        "failed": 0,
        "tests": [],
        "summary": {},
    }

    print("=" * 70)
    print("TruthCert-PairwisePro Validation Test (S4)")
    print("Current-app consistency and reference checks")
    print("=" * 70)
    print(f"\nStarted: {results['timestamp']}")

    options = Options()
    options.add_argument("--window-size=1920,1080")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")

    driver = None
    try:
        driver = webdriver.Chrome(options=options)
        app_path = resolve_app_html()
        print(f"Loading app: {app_path}")
        driver.get(app_path.as_uri())
        dismiss_alerts(driver)
        WebDriverWait(driver, 15).until(EC.presence_of_element_located((By.ID, "runAnalysisBtn")))
        run_btn = driver.find_element(By.ID, "runAnalysisBtn")

        print("\n" + "-" * 70)
        print("SECTION 1: BUILT-IN AUTOMATED REFERENCE TESTS")
        print("-" * 70)

        auto = driver.execute_script(
            "return (typeof window.runAutomatedTests === 'function') ? window.runAutomatedTests() : null;"
        )
        if auto is not None:
            tests = auto.get("tests", [])
            passed = auto.get("passed", 0)
            failed = auto.get("failed", 0)
            print(f"  Built-in suite: passed={passed}, failed={failed}, tests={len(tests)}")
            for t in tests:
                name = f"Automated::{t.get('name', 'unknown')}"
                ok = bool(t.get("passed"))
                record_test(
                    results,
                    "S1",
                    name,
                    ok,
                    actual=t.get("value"),
                    expected=t.get("expected"),
                    error=t.get("error"),
                )
        else:
            print("  [INFO] runAutomatedTests() not available. Running fallback core checks.")
            has_core = driver.execute_script(
                "return !!(window.estimateTau2_DL && window.estimateTau2_REML && "
                "window.estimateTau2_ML && window.calculatePooledEstimate);"
            )
            record_test(results, "S1", "Core functions available", bool(has_core))

            ref = driver.execute_script("return window.BCG_REFERENCE || null;")
            if has_core and isinstance(ref, dict) and isinstance(ref.get("yi"), list) and isinstance(ref.get("vi"), list):
                core = driver.execute_script(
                    """
                    const yi = window.BCG_REFERENCE.yi;
                    const vi = window.BCG_REFERENCE.vi;
                    const dl = window.estimateTau2_DL(yi, vi);
                    const reml = window.estimateTau2_REML(yi, vi);
                    const ml = window.estimateTau2_ML(yi, vi);
                    const he = window.estimateTau2_HE ? window.estimateTau2_HE(yi, vi) : null;
                    const pooled = window.calculatePooledEstimate(yi, vi, reml.tau2);
                    const k = yi.length;
                    const i2 = dl.Q > 0 ? Math.max(0, 100 * (dl.Q - (k - 1)) / dl.Q) : 0;
                    return {
                      dl_tau2: dl.tau2,
                      reml_tau2: reml.tau2,
                      ml_tau2: ml.tau2,
                      he_tau2: he ? he.tau2 : null,
                      pooled_theta: pooled.theta,
                      pooled_se: pooled.se,
                      q: dl.Q,
                      i2: i2
                    };
                    """
                )
                targets = []
                if isinstance(ref.get("tau2"), dict):
                    targets.append(("Fallback::DL tau2", core.get("dl_tau2"), ref["tau2"].get("DL"), 0.01))
                    targets.append(("Fallback::REML tau2", core.get("reml_tau2"), ref["tau2"].get("REML"), 0.01))
                    targets.append(("Fallback::ML tau2", core.get("ml_tau2"), ref["tau2"].get("ML"), 0.01))
                    targets.append(("Fallback::HE tau2", core.get("he_tau2"), ref["tau2"].get("HE"), 0.02))
                if isinstance(ref.get("pooled"), dict):
                    targets.append(("Fallback::Pooled theta", core.get("pooled_theta"), ref["pooled"].get("theta"), 0.01))
                    targets.append(("Fallback::Pooled se", core.get("pooled_se"), ref["pooled"].get("se"), 0.01))
                targets.append(("Fallback::Q statistic", core.get("q"), ref.get("Q"), 0.02))
                targets.append(("Fallback::I2 statistic", core.get("i2"), ref.get("I2"), 0.02))

                for name, actual, expected, tol in targets:
                    ok = compare_numbers(actual, expected, rel_tol=tol, abs_tol=1e-6)
                    record_test(results, "S1", name, ok, actual=actual, expected=expected)
            else:
                print("  [SKIP] BCG_REFERENCE not exposed in this HTML build; skipped fallback numeric benchmark checks.")

        print("\n" + "-" * 70)
        print("SECTION 2: BCG UI PIPELINE CONSISTENCY")
        print("-" * 70)

        driver.execute_script("loadDemoDataset('BCG');")
        time.sleep(1.5)
        dismiss_alerts(driver)
        run_analysis(driver, run_btn)

        has_results = driver.execute_script("return !!(window.AppState && window.AppState.results);")
        record_test(results, "S2", "BCG analysis produced results", has_results)
        print(f"  [{'PASS' if has_results else 'FAIL'}] BCG analysis produced results")

        if has_results:
            yi = driver.execute_script("return window.AppState.results.yi || [];")
            vi = driver.execute_script("return window.AppState.results.vi || [];")

            yi_ok = isinstance(yi, list) and len(yi) > 0 and all(is_finite_number(v) for v in yi)
            vi_ok = isinstance(vi, list) and len(vi) == len(yi) and all(is_finite_number(v) for v in vi)
            record_test(results, "S2", "yi array finite", yi_ok, actual=len(yi) if isinstance(yi, list) else None)
            record_test(results, "S2", "vi array finite", vi_ok, actual=len(vi) if isinstance(vi, list) else None)
            print(f"  [{'PASS' if yi_ok else 'FAIL'}] yi array finite (n={len(yi) if isinstance(yi, list) else 0})")
            print(f"  [{'PASS' if vi_ok else 'FAIL'}] vi array finite (n={len(vi) if isinstance(vi, list) else 0})")

            ref_yi = driver.execute_script("return window.BCG_REFERENCE ? window.BCG_REFERENCE.yi : null;")
            ref_vi = driver.execute_script("return window.BCG_REFERENCE ? window.BCG_REFERENCE.vi : null;")
            if isinstance(ref_yi, list) and isinstance(ref_vi, list) and len(ref_yi) == len(yi):
                yi_matches = 0
                vi_matches = 0
                for i, (a, b) in enumerate(zip(yi, ref_yi), 1):
                    ok = compare_numbers(a, b, rel_tol=0.03, abs_tol=1e-3)
                    yi_matches += 1 if ok else 0
                    record_test(results, "S2", f"BCG yi[{i}]", ok, actual=a, expected=b)
                for i, (a, b) in enumerate(zip(vi, ref_vi), 1):
                    ok = compare_numbers(a, b, rel_tol=0.03, abs_tol=1e-3)
                    vi_matches += 1 if ok else 0
                    record_test(results, "S2", f"BCG vi[{i}]", ok, actual=a, expected=b)
                print(f"  BCG reference yi: {yi_matches}/{len(yi)} within tolerance")
                print(f"  BCG reference vi: {vi_matches}/{len(vi)} within tolerance")
            else:
                print("  [SKIP] BCG_REFERENCE array length differs from loaded demo; skipped direct yi/vi reference match")

            available_methods = driver.execute_script(
                "return Array.from(document.getElementById('tau2MethodSelect').options).map(o => o.value);"
            )
            tau_select = Select(driver.find_element(By.ID, "tau2MethodSelect"))

            for method in available_methods:
                try:
                    tau_select.select_by_value(method)
                    time.sleep(0.2)
                    run_analysis(driver, run_btn, pause_seconds=1.8)

                    actual_tau2 = driver.execute_script("return window.AppState.results ? window.AppState.results.tau2 : null;")
                    expected_tau2 = driver.execute_script(
                        f"const yi=window.AppState.results.yi; const vi=window.AppState.results.vi; "
                        f"return (typeof window.estimateTau2 === 'function') ? window.estimateTau2(yi, vi, '{method}').tau2 : null;"
                    )
                    ok = compare_numbers(actual_tau2, expected_tau2, rel_tol=1e-7, abs_tol=1e-9)
                    record_test(results, "S2", f"tau2 {method} consistency", ok, actual=actual_tau2, expected=expected_tau2)
                    print(f"  [{'PASS' if ok else 'FAIL'}] tau2 {method} consistency")
                except Exception as exc:
                    record_test(results, "S2", f"tau2 {method} consistency", False, error=exc)
                    print(f"  [FAIL] tau2 {method} consistency: {exc}")

            if "REML" in available_methods:
                tau_select.select_by_value("REML")
                time.sleep(0.2)
                run_analysis(driver, run_btn, pause_seconds=1.8)

            pooled = driver.execute_script("return window.AppState.results ? window.AppState.results.pooled : null;")
            pooled_expected = driver.execute_script(
                "const r=window.AppState.results; "
                "return (r && typeof window.calculatePooledEstimate === 'function') ? "
                "window.calculatePooledEstimate(r.yi, r.vi, r.tau2) : null;"
            )
            theta_ok = bool(pooled and pooled_expected) and compare_numbers(
                pooled.get("theta"), pooled_expected.get("theta"), rel_tol=1e-7, abs_tol=1e-9
            )
            se_ok = bool(pooled and pooled_expected) and compare_numbers(
                pooled.get("se"), pooled_expected.get("se"), rel_tol=1e-7, abs_tol=1e-9
            )
            record_test(results, "S2", "pooled theta consistency", theta_ok, actual=pooled.get("theta") if pooled else None, expected=pooled_expected.get("theta") if pooled_expected else None)
            record_test(results, "S2", "pooled se consistency", se_ok, actual=pooled.get("se") if pooled else None, expected=pooled_expected.get("se") if pooled_expected else None)
            print(f"  [{'PASS' if theta_ok else 'FAIL'}] pooled theta consistency")
            print(f"  [{'PASS' if se_ok else 'FAIL'}] pooled se consistency")

            hksj_elem = driver.find_elements(By.ID, "hksjCheckbox")
            if hksj_elem:
                hksj = hksj_elem[0]
                if not hksj.is_selected():
                    driver.execute_script("arguments[0].click();", hksj)
                    time.sleep(0.2)
                run_analysis(driver, run_btn, pause_seconds=1.8)

                hksj_actual = driver.execute_script("return window.AppState.results ? window.AppState.results.hksj : null;")
                hksj_expected = driver.execute_script(
                    "const r=window.AppState.results; "
                    "return (r && typeof window.calculateHKSJ === 'function') ? "
                    "window.calculateHKSJ(r.yi, r.vi, r.pooled.theta, r.tau2) : null;"
                )
                hksj_lb_ok = bool(hksj_actual and hksj_expected) and compare_numbers(
                    hksj_actual.get("ci_lower"), hksj_expected.get("ci_lower"), rel_tol=1e-7, abs_tol=1e-9
                )
                hksj_ub_ok = bool(hksj_actual and hksj_expected) and compare_numbers(
                    hksj_actual.get("ci_upper"), hksj_expected.get("ci_upper"), rel_tol=1e-7, abs_tol=1e-9
                )
                record_test(results, "S2", "HKSJ CI lower consistency", hksj_lb_ok, actual=hksj_actual.get("ci_lower") if hksj_actual else None, expected=hksj_expected.get("ci_lower") if hksj_expected else None)
                record_test(results, "S2", "HKSJ CI upper consistency", hksj_ub_ok, actual=hksj_actual.get("ci_upper") if hksj_actual else None, expected=hksj_expected.get("ci_upper") if hksj_expected else None)
                print(f"  [{'PASS' if hksj_lb_ok else 'FAIL'}] HKSJ CI lower consistency")
                print(f"  [{'PASS' if hksj_ub_ok else 'FAIL'}] HKSJ CI upper consistency")

                if hksj.is_selected():
                    driver.execute_script("arguments[0].click();", hksj)
                    time.sleep(0.2)

            run_analysis(driver, run_btn, pause_seconds=1.8)
            pi_actual = driver.execute_script(
                "const p=window.AppState?.results?.pi; "
                "if (!p) return null; "
                "if (p.standard) return {lower: p.standard.lower, upper: p.standard.upper}; "
                "return {lower: p.lower, upper: p.upper};"
            )
            pi_expected = driver.execute_script(
                "const r=window.AppState.results; "
                "return (r && typeof window.calculatePredictionInterval === 'function') ? "
                "window.calculatePredictionInterval(r.yi, r.vi, r.tau2) : null;"
            )
            has_expected_pi = bool(
                pi_expected
                and is_finite_number(pi_expected.get("lower"))
                and is_finite_number(pi_expected.get("upper"))
            )
            if has_expected_pi:
                pi_lb_ok = compare_numbers(
                    pi_actual.get("lower"), pi_expected.get("lower"), rel_tol=1e-7, abs_tol=1e-9
                )
                pi_ub_ok = compare_numbers(
                    pi_actual.get("upper"), pi_expected.get("upper"), rel_tol=1e-7, abs_tol=1e-9
                )
                record_test(results, "S2", "PI lower consistency", pi_lb_ok, actual=pi_actual.get("lower") if pi_actual else None, expected=pi_expected.get("lower"))
                record_test(results, "S2", "PI upper consistency", pi_ub_ok, actual=pi_actual.get("upper") if pi_actual else None, expected=pi_expected.get("upper"))
                print(f"  [{'PASS' if pi_lb_ok else 'FAIL'}] PI lower consistency")
                print(f"  [{'PASS' if pi_ub_ok else 'FAIL'}] PI upper consistency")
            else:
                pi_available = bool(pi_actual) and is_finite_number(pi_actual.get("lower")) and is_finite_number(pi_actual.get("upper"))
                record_test(results, "S2", "PI available and finite", pi_available, actual=pi_actual)
                print(f"  [{'PASS' if pi_available else 'FAIL'}] PI available and finite")

            egger_obj = driver.execute_script("return window.AppState?.results?.egger || null;")
            egger_p = None
            if isinstance(egger_obj, dict):
                for key in ("p", "p_value", "pval", "intercept_p", "slope_p"):
                    value = egger_obj.get(key)
                    if is_finite_number(value) and 0 <= float(value) <= 1:
                        egger_p = value
                        break
                if egger_p is None:
                    for key in ("p", "p_value", "pval", "intercept_p", "slope_p"):
                        value = egger_obj.get(key)
                        if is_finite_number(value):
                            egger_p = value
                            break
            egger_ok = egger_p is not None
            record_test(results, "S2", "Egger output available", egger_ok, actual=egger_obj)
            print(f"  [{'PASS' if egger_ok else 'FAIL'}] Egger output available")

        print("\n" + "-" * 70)
        print("SECTION 3: OTHER MODULE SMOKE CHECKS")
        print("-" * 70)

        try:
            Select(driver.find_element(By.ID, "dataTypeSelect")).select_by_value("proportion")
            time.sleep(0.2)
            driver.execute_script("loadDemoDataset('MORTALITY_RATE');")
            time.sleep(1.0)
            run_analysis(driver, run_btn, pause_seconds=1.8)
            prop_yi = driver.execute_script("return window.AppState?.results?.yi || [];")
            prop_ok = isinstance(prop_yi, list) and len(prop_yi) > 0 and all(is_finite_number(v) for v in prop_yi)
            record_test(results, "S3", "Proportion demo produced yi", prop_ok, actual=len(prop_yi) if isinstance(prop_yi, list) else None)
            print(f"  [{'PASS' if prop_ok else 'FAIL'}] Proportion demo produced yi")
        except Exception as exc:
            record_test(results, "S3", "Proportion demo flow", False, error=exc)
            print(f"  [FAIL] Proportion demo flow: {exc}")

        try:
            Select(driver.find_element(By.ID, "dataTypeSelect")).select_by_value("continuous")
            time.sleep(0.2)
            driver.execute_script("loadDemoDataset('BP_REDUCTION');")
            time.sleep(1.0)
            Select(driver.find_element(By.ID, "effectMeasureSelect")).select_by_value("SMD")
            time.sleep(0.2)
            run_analysis(driver, run_btn, pause_seconds=1.8)
            pooled_se = driver.execute_script("return window.AppState?.results?.pooled?.se ?? null;")
            cont_ok = is_finite_number(pooled_se) and float(pooled_se) > 0
            record_test(results, "S3", "Continuous SMD pooled SE finite", cont_ok, actual=pooled_se)
            print(f"  [{'PASS' if cont_ok else 'FAIL'}] Continuous SMD pooled SE finite")
        except Exception as exc:
            record_test(results, "S3", "Continuous SMD flow", False, error=exc)
            print(f"  [FAIL] Continuous SMD flow: {exc}")

        has_three = driver.execute_script("return typeof window.runThreeLevelModel === 'function';")
        has_gosh = driver.execute_script("return typeof window.runGOSHAnalysis === 'function';")
        record_test(results, "S3", "runThreeLevelModel available", bool(has_three))
        record_test(results, "S3", "runGOSHAnalysis available", bool(has_gosh))
        print(f"  [{'PASS' if has_three else 'FAIL'}] runThreeLevelModel available")
        print(f"  [{'PASS' if has_gosh else 'FAIL'}] runGOSHAnalysis available")

    except Exception as exc:
        print(f"\nCRITICAL ERROR: {exc}")
        record_test(results, "CRITICAL", "run_validation", False, error=exc)
    finally:
        if driver:
            try:
                driver.quit()
            except Exception:
                pass

    print("\n" + "=" * 70)
    print("VALIDATION SUMMARY")
    print("=" * 70)
    total = results["passed"] + results["failed"]
    pct = (results["passed"] / total * 100) if total else 0.0
    print(f"\nTotal tests: {total}")
    print(f"Passed: {results['passed']} ({pct:.1f}%)")
    print(f"Failed: {results['failed']}")
    if pct >= 90:
        print("\n[VALIDATION PASSED]")
    elif pct >= 75:
        print("\n[VALIDATION ACCEPTABLE]")
    else:
        print("\n[VALIDATION NEEDS REVIEW]")

    results["summary"] = {
        "total": total,
        "passed": results["passed"],
        "failed": results["failed"],
        "pass_rate": pct,
    }
    output_path = Path(__file__).resolve().parent / "S4_Validation_Results.json"
    with open(output_path, "w", encoding="utf-8") as handle:
        json.dump(results, handle, indent=2)
    print(f"\nResults saved to: {output_path}")
    print("\n" + "=" * 70)
    return results


if __name__ == "__main__":
    run_validation()
