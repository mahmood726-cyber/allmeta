# sentinel:skip-file — hardcoded paths are fixture/registry/audit-narrative data for this repo's research workflow, not portable application configuration. Same pattern as push_all_repos.py and E156 workbook files.
#!/usr/bin/env python3
"""Quick JavaScript error check for IPD Meta-Analysis Pro"""

import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from selenium import webdriver
from selenium.common.exceptions import SessionNotCreatedException, WebDriverException
from selenium.webdriver.common.by import By
from selenium.webdriver.edge.options import Options
from selenium.webdriver.edge.service import Service

from edge_webdriver import load_local_app_with_ready_check

_EDGE_BACKGROUND_LOG_MARKERS = (
    "assets.msn.com",
    "service/msn/user",
    "c.msn.com/c.gif",
)

_EDGE_BINARY_CANDIDATES = [
    os.environ.get("EDGE_BINARY"),
    "/home/user/.local/bin/microsoft-edge",
    "/mnt/c/Users/user/.local/bin/microsoft-edge",
    shutil.which("microsoft-edge"),
    shutil.which("microsoft-edge-stable"),
    shutil.which("msedge"),
]

_EDGE_DRIVER_CANDIDATES = [
    os.environ.get("EDGE_DRIVER"),
    "/home/user/.local/bin/msedgedriver",
    "/mnt/c/Users/user/.local/bin/msedgedriver",
    shutil.which("msedgedriver"),
]


def _first_executable(candidates) -> str | None:
    for c in candidates:
        if c and os.path.isfile(c) and os.access(c, os.X_OK):
            return c
    return None


def _resolve_edge_runtime() -> tuple[str | None, str | None]:
    edge_binary = _first_executable(_EDGE_BINARY_CANDIDATES)
    edge_driver = _first_executable(_EDGE_DRIVER_CANDIDATES)
    return edge_binary, edge_driver


def _cleanup_stale_webdriver() -> None:
    """Best-effort cleanup for orphaned Selenium driver processes."""
    try:
        if sys.platform == "win32":
            subprocess.run(
                ["taskkill", "/F", "/T", "/IM", "msedgedriver.exe"],
                capture_output=True,
                text=True,
                check=False,
            )
            subprocess.run(
                ["taskkill", "/F", "/T", "/IM", "chromedriver.exe"],
                capture_output=True,
                text=True,
                check=False,
            )
        else:
            subprocess.run(
                ["pkill", "-f", "msedgedriver|chromedriver"],
                capture_output=True,
                text=True,
                check=False,
            )
    except Exception:
        # Cleanup is opportunistic only.
        pass


def _build_options(profile_dir: str, edge_binary: str | None = None) -> Options:
    options = Options()
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-first-run")
    options.add_argument("--no-default-browser-check")
    options.add_argument(f"--user-data-dir={profile_dir}")
    if edge_binary:
        options.binary_location = edge_binary
    options.set_capability("goog:loggingPrefs", {"browser": "ALL"})
    return options


def _create_driver(max_attempts: int = 3):
    """Create a webdriver with startup retries for transient Edge failures."""
    edge_binary, edge_driver = _resolve_edge_runtime()
    if edge_binary:
        print(f"  [INFO] Using Edge binary: {edge_binary}")
    if edge_driver:
        print(f"  [INFO] Using EdgeDriver: {edge_driver}")

    last_exc = None
    for attempt in range(1, max_attempts + 1):
        profile_dir = tempfile.mkdtemp(prefix="ipdmp_quickjs_")
        try:
            options = _build_options(profile_dir, edge_binary=edge_binary)
            if edge_driver:
                driver = webdriver.Edge(
                    service=Service(executable_path=edge_driver),
                    options=options,
                )
            else:
                driver = webdriver.Edge(options=options)
            return driver, profile_dir
        except (SessionNotCreatedException, WebDriverException) as exc:
            last_exc = exc
            message = str(exc)
            retryable = (
                isinstance(exc, SessionNotCreatedException)
                or "Edge instance exited" in message
                or "Chrome instance exited" in message
                or "DevToolsActivePort" in message
            )
            shutil.rmtree(profile_dir, ignore_errors=True)
            if retryable and attempt < max_attempts:
                first_line = message.splitlines()[0] if message else repr(exc)
                print(f"  [WARN] Browser startup attempt {attempt} failed: {first_line}")
                _cleanup_stale_webdriver()
                time.sleep(1.5 * attempt)
                continue
            raise

    if last_exc is not None:
        raise last_exc
    raise RuntimeError("Unable to create Edge webdriver")


def _is_external_edge_background_log(message: str) -> bool:
    return any(marker in message for marker in _EDGE_BACKGROUND_LOG_MARKERS)


def main() -> int:
    print("=" * 60)
    print("IPD Meta-Analysis Pro - JavaScript Error Check")
    print("=" * 60)

    driver = None
    profile_dir = None
    failures: list[str] = []

    try:
        driver, profile_dir = _create_driver()
        driver.set_window_size(1400, 900)
    except Exception as exc:
        print(f"\n[FAIL] Browser startup failed: {exc}")
        return 1

    try:
        # Load the app
        app_path = Path(__file__).resolve().parents[2] / "ipd-meta-pro.html"
        load_state = load_local_app_with_ready_check(
            driver,
            app_path,
            required_functions=(
                "toggleTheme",
                "showHelp",
                "closeHelp",
                "loadExampleData",
                "runAnalysis",
            ),
            required_objects=("APP", "MetaAnalysis", "MathUtils", "Stats", "Plots"),
        )
        if load_state.get("timed_out"):
            print("  [INFO] Continued after local runtime became ready despite CDN page-load timeout")
        time.sleep(1)

        print("\n[1] Checking for JavaScript errors...")
        logs = driver.get_log("browser")
        severe_logs = [log for log in logs if log["level"] == "SEVERE"]
        errors = [
            log
            for log in severe_logs
            if not _is_external_edge_background_log(log.get("message", ""))
        ]
        ignored = len(severe_logs) - len(errors)

        if errors:
            print(f"  FOUND {len(errors)} JavaScript errors:")
            for err in errors:
                msg = err["message"][:100]
                print(f"    - {msg}")
            failures.append(f"{len(errors)} JavaScript error log(s)")
        else:
            print("  [OK] No JavaScript errors!")
        if ignored:
            print(f"  [INFO] Ignored {ignored} known external Edge background log(s)")

        print("\n[2] Checking core functions...")
        functions = [
            "toggleTheme",
            "showHelp",
            "closeHelp",
            "loadExampleData",
            "runAnalysis",
            "switchPanel",
            "showNotification",
            "switchHelpTab",
            "copyValidationCode",
        ]

        for func in functions:
            try:
                exists = driver.execute_script(f"return typeof {func} === 'function'")
                status = "[OK]" if exists else "[MISSING]"
                print(f"  {status} {func}")
                if not exists:
                    failures.append(f"Missing function: {func}")
            except Exception as exc:
                print(f"  [ERROR] {func}: {str(exc)[:50]}")
                failures.append(f"Function probe failed: {func}")

        print("\n[3] Checking global objects...")
        objects = ["APP", "MetaAnalysis", "MathUtils", "Stats", "Plots"]

        for obj in objects:
            try:
                exists = driver.execute_script(f"return typeof {obj} !== 'undefined'")
                status = "[OK]" if exists else "[MISSING]"
                print(f"  {status} {obj}")
                if not exists:
                    failures.append(f"Missing object: {obj}")
            except Exception as exc:
                print(f"  [ERROR] {obj}: {str(exc)[:50]}")
                failures.append(f"Object probe failed: {obj}")

        print("\n[4] Testing theme toggle...")
        try:
            initial_theme = driver.execute_script(
                "return document.body.classList.contains('light-theme')"
            )
            driver.execute_script("toggleTheme()")
            time.sleep(0.5)
            new_theme = driver.execute_script(
                "return document.body.classList.contains('light-theme')"
            )
            if initial_theme != new_theme:
                print("  [OK] Theme toggle works")
            else:
                print("  [WARN] Theme may not have changed")
                failures.append("Theme toggle did not change theme state")
        except Exception as exc:
            print(f"  [ERROR] Theme toggle: {str(exc)[:50]}")
            failures.append("Theme toggle raised an exception")

        print("\n[5] Testing load example data...")
        try:
            driver.execute_script("loadExampleData('survival')")
            time.sleep(2)
            logs = driver.get_log("browser")
            new_errors = [log for log in logs if log["level"] == "SEVERE"]
            if not new_errors:
                print("  [OK] loadExampleData executed without errors")
            else:
                print(f"  [ERROR] {len(new_errors)} errors after loading data")
                for err in new_errors[:3]:
                    print(f"    - {err['message'][:80]}")
                failures.append("loadExampleData produced browser errors")
        except Exception as exc:
            print(f"  [ERROR] loadExampleData: {str(exc)[:50]}")
            failures.append("loadExampleData raised an exception")

        print("\n[6] Testing help modal...")
        try:
            driver.execute_script("showHelp()")
            time.sleep(0.5)
            modal_visible = driver.execute_script(
                "return document.getElementById('helpModal').classList.contains('active')"
            )
            if modal_visible:
                print("  [OK] Help modal opened")
            else:
                print("  [WARN] Help modal may not have opened")
                failures.append("Help modal did not become active")

            tabs = driver.find_elements(By.CSS_SELECTOR, "#helpTabs .inner-tab")
            print(f"  [INFO] Found {len(tabs)} help tabs")
            if not tabs:
                failures.append("Help modal rendered no tabs")
        except Exception as exc:
            print(f"  [ERROR] Help modal: {str(exc)[:50]}")
            failures.append("Help modal probe raised an exception")

        print("\n" + "=" * 60)
        print("Quick JS test complete!")
        print("=" * 60)
        if failures:
            print("[FAIL] Quick JS test detected issues:")
            for failure in failures:
                print(f"  - {failure}")

    finally:
        if driver:
            driver.quit()
        if profile_dir:
            shutil.rmtree(profile_dir, ignore_errors=True)

    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
