from pathlib import Path
import datetime

from selenium import webdriver
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.support.ui import WebDriverWait


options = Options()
driver = webdriver.Firefox(options=options)
driver.set_script_timeout(600)


def parse_pct(results: dict, key: str) -> float:
    return float(results.get(key))


def require_validation_pass(results: dict) -> None:
    if not isinstance(results, dict):
        raise SystemExit('Validation results missing')
    if not results.get('passed'):
        failed = [row.get('name', 'Unnamed test') for row in results.get('results', []) if not row.get('passed')]
        detail = ', '.join(failed[:5]) or 'unknown validation failure'
        raise SystemExit(f'Validation suite reported FAIL: {detail}')


def require_coverage_in_band(results: dict) -> None:
    if not isinstance(results, dict):
        raise SystemExit('Coverage simulation results missing')
    issues = []
    for key in ('waldPct', 'hksjPct', 'piPct'):
        value = parse_pct(results, key)
        if value < 93.0 or value > 97.0:
            issues.append(f'{key}={value:.1f}%')
    failed_sims = int(results.get('nSimFailed') or 0)
    if failed_sims > 0:
        issues.append(f'nSimFailed={failed_sims}')
    if issues:
        raise SystemExit('Coverage simulation reported WARN/FAIL: ' + ', '.join(issues))


def require_type1_in_band(results: dict) -> None:
    if not isinstance(results, dict):
        raise SystemExit('Type I error results missing')
    issues = []
    for key in ('waldRate', 'hksjRate'):
        value = parse_pct(results, key)
        if value > 7.0:
            issues.append(f'{key}={value:.1f}%')
    failed_sims = int(results.get('nSimFailed') or 0)
    if failed_sims > 0:
        issues.append(f'nSimFailed={failed_sims}')
    if issues:
        raise SystemExit('Type I error test reported WARN/FAIL: ' + ', '.join(issues))


try:
    project_dir = Path(__file__).resolve().parent
    app_uri = (project_dir / "dose-response-pro.html").resolve().as_uri()

    driver.get(app_uri)
    driver.execute_script('window.DEBUG_EXPOSE_APPSTATE = true;')
    driver.execute_script('if (typeof exposeAppState === "function") { exposeAppState(true); }')

    # Ensure full-fidelity settings
    driver.execute_script(
        'if (document.getElementById("coverageFastToggle")) { '
        'document.getElementById("coverageFastToggle").checked = false; }'
    )
    driver.execute_script(
        'if (document.getElementById("coverageSimpleRngToggle")) { '
        'document.getElementById("coverageSimpleRngToggle").checked = false; }'
    )
    driver.execute_script('if (typeof setCoverageSimOptions === "function") { setCoverageSimOptions(); }')
    driver.execute_script('delete window.COVERAGE_SIM_ITERATIONS; delete window.TYPE1_SIM_ITERATIONS;')

    # Run full validation suite
    driver.execute_script('runValidationSuite();')
    WebDriverWait(driver, 300).until(
        lambda d: d.execute_script(
            'return typeof AppState !== "undefined" && AppState.validationResults !== null;'
        )
    )
    validation_results = driver.execute_script('return AppState.validationResults;')
    require_validation_pass(validation_results)

    # Run coverage simulation (default 1000)
    driver.execute_script('runCoverageSimulation();')
    WebDriverWait(driver, 600).until(
        lambda d: d.execute_script(
            'return typeof AppState !== "undefined" && AppState.coverageResults !== null;'
        )
    )
    coverage_results = driver.execute_script('return AppState.coverageResults;')
    require_coverage_in_band(coverage_results)

    # Run Type I error test (default 500)
    driver.execute_script('runTypeIErrorTest();')
    WebDriverWait(driver, 600).until(
        lambda d: d.execute_script(
            'return typeof AppState !== "undefined" && AppState.type1Results !== null;'
        )
    )
    type1_results = driver.execute_script('return AppState.type1Results;')
    require_type1_in_band(type1_results)

    report_text = driver.execute_script('return buildValidationReportText();')
    if not report_text:
        raise SystemExit('Failed to build validation report text')

    date_tag = datetime.datetime.now().strftime('%Y-%m-%d_%H%M%S')
    out_path = project_dir / f"validation_report_{date_tag}.txt"
    out_path.write_text(report_text, encoding='utf-8')
    print(f"Report saved: {out_path}")
finally:
    driver.quit()
