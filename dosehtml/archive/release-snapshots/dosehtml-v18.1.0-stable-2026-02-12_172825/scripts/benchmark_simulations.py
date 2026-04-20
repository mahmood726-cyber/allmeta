#!/usr/bin/env python3
"""
Benchmark Monte Carlo simulation runtime for Dose Response Pro v18.1.

Runs coverage simulation and Type I error simulation in two modes:
- full fidelity
- fast mode
"""

import argparse
import json
import os
import time
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.chrome.options import Options as ChromeOptions
from selenium.webdriver.firefox.options import Options as FirefoxOptions
from selenium.webdriver.support.ui import WebDriverWait


def build_driver():
    browser_pref = os.environ.get("SELENIUM_BROWSER", "auto").strip().lower()
    if browser_pref not in {"auto", "chrome", "firefox"}:
        browser_pref = "auto"
    headless = os.environ.get("SELENIUM_HEADLESS", "1").strip().lower() in {"1", "true", "yes"}

    chrome_options = ChromeOptions()
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    if headless:
        chrome_options.add_argument("--headless=new")

    firefox_options = FirefoxOptions()
    if headless:
        firefox_options.add_argument("--headless")

    factories = []
    if browser_pref == "chrome":
        factories = [("Chrome", lambda: webdriver.Chrome(options=chrome_options))]
    elif browser_pref == "firefox":
        factories = [("Firefox", lambda: webdriver.Firefox(options=firefox_options))]
    else:
        factories = [
            ("Chrome", lambda: webdriver.Chrome(options=chrome_options)),
            ("Firefox", lambda: webdriver.Firefox(options=firefox_options)),
        ]

    init_errors = []
    for name, factory in factories:
        try:
            driver = factory()
            return name, driver
        except Exception as exc:  # pragma: no cover
            init_errors.append(f"{name}: {exc}")
    raise RuntimeError("Could not initialize webdriver: " + " | ".join(init_errors))


def run_js_timed(driver, start_script, done_predicate, timeout_s):
    t0 = time.perf_counter()
    driver.execute_script(start_script)
    WebDriverWait(driver, timeout_s).until(lambda d: d.execute_script(done_predicate))
    return time.perf_counter() - t0


def main():
    parser = argparse.ArgumentParser(description="Benchmark Dose Response Pro simulations")
    parser.add_argument("--coverage-iterations", type=int, default=1000)
    parser.add_argument("--type1-iterations", type=int, default=500)
    parser.add_argument("--output", type=str, default="-")
    args = parser.parse_args()

    base_dir = Path(__file__).resolve().parent.parent
    html_path = base_dir / "dose-response-pro.html"
    if not html_path.exists():
        raise FileNotFoundError(f"Missing HTML file: {html_path}")

    browser_name, driver = build_driver()
    driver.set_script_timeout(900)
    # Avoid client-side read timeout during heavy Monte Carlo runs.
    if hasattr(driver.command_executor, "_client_config"):
        driver.command_executor._client_config.timeout = 900

    summary = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "browser": browser_name,
        "coverage_iterations": args.coverage_iterations,
        "type1_iterations": args.type1_iterations,
        "results": [],
    }

    try:
        driver.get(f"file:///{str(html_path).replace(os.sep, '/')}")
        time.sleep(1)
        driver.execute_script("window.DEBUG_EXPOSE_APPSTATE = true;")
        driver.execute_script("if (typeof exposeAppState === 'function') { exposeAppState(true); }")
        driver.execute_script(f"window.COVERAGE_SIM_ITERATIONS = {args.coverage_iterations};")
        driver.execute_script(f"window.TYPE1_SIM_ITERATIONS = {args.type1_iterations};")

        for fast_mode in (False, True):
            driver.execute_script(f"window.COVERAGE_SIM_FAST = {str(fast_mode).lower()};")
            driver.execute_script("if (typeof setCoverageSimOptions === 'function') { setCoverageSimOptions(); }")
            driver.execute_script(
                "if (typeof AppState !== 'undefined') { "
                "AppState.coverageResults = null; AppState.coverageError = null; "
                "AppState.type1Results = null; AppState.coverageRunning = false; }"
            )

            coverage_seconds = run_js_timed(
                driver,
                "window.setTimeout(() => runCoverageSimulation(), 0);",
                "return typeof AppState !== 'undefined' && AppState.coverageRunning === false && "
                "(AppState.coverageResults !== null || AppState.coverageError !== null);",
                timeout_s=max(30, int(args.coverage_iterations * 0.35)),
            )
            coverage_results = driver.execute_script("return AppState.coverageResults;")

            type1_seconds = run_js_timed(
                driver,
                "window.setTimeout(() => runTypeIErrorTest(), 0);",
                "return typeof AppState !== 'undefined' && AppState.type1Results !== null;",
                timeout_s=max(20, int(args.type1_iterations * 0.3)),
            )
            type1_results = driver.execute_script("return AppState.type1Results;")

            summary["results"].append(
                {
                    "fast_mode": fast_mode,
                    "coverage_seconds": round(coverage_seconds, 3),
                    "type1_seconds": round(type1_seconds, 3),
                    "coverage": coverage_results,
                    "type1": type1_results,
                }
            )

    finally:
        driver.quit()

    payload = json.dumps(summary, indent=2)
    if args.output == "-":
        print(payload)
    else:
        Path(args.output).write_text(payload, encoding="utf-8")
        print(f"Wrote benchmark output to {args.output}")


if __name__ == "__main__":
    main()
