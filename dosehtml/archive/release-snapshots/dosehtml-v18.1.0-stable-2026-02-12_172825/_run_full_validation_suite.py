from selenium import webdriver
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.support.ui import WebDriverWait
import datetime
from pathlib import Path

options = Options()
driver = webdriver.Firefox(options=options)
driver.set_script_timeout(600)

try:
    driver.get((Path(__file__).resolve().parent / "dose-response-pro.html").resolve().as_uri())
    driver.execute_script('window.DEBUG_EXPOSE_APPSTATE = true;')
    driver.execute_script('if (typeof exposeAppState === "function") { exposeAppState(true); }')

    # Ensure full-fidelity settings
    driver.execute_script('if (document.getElementById("coverageFastToggle")) { document.getElementById("coverageFastToggle").checked = false; }')
    driver.execute_script('if (document.getElementById("coverageSimpleRngToggle")) { document.getElementById("coverageSimpleRngToggle").checked = false; }')
    driver.execute_script('if (typeof setCoverageSimOptions === "function") { setCoverageSimOptions(); }')
    driver.execute_script('delete window.COVERAGE_SIM_ITERATIONS; delete window.TYPE1_SIM_ITERATIONS;')

    # Run full validation suite
    driver.execute_script('runValidationSuite();')
    WebDriverWait(driver, 300).until(
        lambda d: d.execute_script('return typeof AppState !== "undefined" && AppState.validationResults !== null;')
    )

    # Run coverage simulation (default 1000)
    driver.execute_script('runCoverageSimulation();')
    WebDriverWait(driver, 600).until(
        lambda d: d.execute_script('return typeof AppState !== "undefined" && AppState.coverageResults !== null;')
    )

    # Run Type I error test (default 500)
    driver.execute_script('runTypeIErrorTest();')
    WebDriverWait(driver, 600).until(
        lambda d: d.execute_script('return typeof AppState !== "undefined" && AppState.type1Results !== null;')
    )

    report_text = driver.execute_script('return buildValidationReportText();')
    if not report_text:
        raise SystemExit('Failed to build validation report text')

    date_tag = datetime.datetime.now().strftime('%Y-%m-%d_%H%M%S')
    out_path = Path(__file__).resolve().parent / f"validation_report_{date_tag}.txt"
    out_path.write_text(report_text, encoding='utf-8')
    print(f"Report saved: {out_path}")
finally:
    driver.quit()
