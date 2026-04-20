from pathlib import Path
import json

from selenium import webdriver
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.support.ui import WebDriverWait


options = Options()
driver = webdriver.Firefox(options=options)


def require_validation_pass(results: dict) -> None:
    if not isinstance(results, dict):
        raise SystemExit("Validation results were not returned.")
    if not results.get("passed"):
        failed = [row.get("name", "Unnamed test") for row in results.get("results", []) if not row.get("passed")]
        detail = ", ".join(failed[:5]) or "unknown validation failure"
        raise SystemExit(f"Validation suite reported FAIL: {detail}")


try:
    app_uri = (Path(__file__).resolve().parent / "dose-response-pro.html").resolve().as_uri()
    driver.get(app_uri)
    driver.execute_script('window.DEBUG_EXPOSE_APPSTATE = true;')
    driver.execute_script('if (typeof exposeAppState === "function") { exposeAppState(true); }')
    driver.execute_script('runValidationSuite();')

    WebDriverWait(driver, 300).until(
        lambda d: d.execute_script(
            'return typeof AppState !== "undefined" && AppState.validationResults !== null;'
        )
    )

    results = driver.execute_script('return AppState.validationResults;')
    print(json.dumps(results, indent=2))
    require_validation_pass(results)
finally:
    driver.quit()
