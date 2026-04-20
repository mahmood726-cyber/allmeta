#!/usr/bin/env python3
"""Run the browser test harness in dev/tests/test-runner.html."""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from selenium.common.exceptions import SessionNotCreatedException, WebDriverException
from selenium.webdriver.common.by import By
from selenium.webdriver.edge.options import Options
from selenium.webdriver.support.ui import WebDriverWait

from edge_webdriver import create_edge_driver


if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


_NON_ACTIONABLE_BROWSER_LOG_MARKERS = (
    "assets.msn.com",
    "service/msn/user",
    "c.msn.com/c.gif",
    "favicon.ico",
)

_MIN_EXPECTED_TESTS = 40


class QuietHandler(SimpleHTTPRequestHandler):
    """Serve local files for the browser harness without noisy request logs."""

    def log_message(self, format: str, *args) -> None:  # noqa: A003
        return


def _cleanup_stale_webdriver() -> None:
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
        pass


def _build_options(profile_dir: str) -> Options:
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--no-first-run")
    options.add_argument("--no-default-browser-check")
    options.add_argument(f"--user-data-dir={profile_dir}")
    options.set_capability("goog:loggingPrefs", {"browser": "ALL"})
    return options


def _create_driver(max_attempts: int = 3):
    last_exc = None
    for attempt in range(1, max_attempts + 1):
        profile_dir = tempfile.mkdtemp(prefix="ipdmp_browser_tests_")
        try:
            driver = create_edge_driver(_build_options(profile_dir))
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
                print(f"[WARN] Browser startup attempt {attempt} failed: {message.splitlines()[0]}")
                _cleanup_stale_webdriver()
                time.sleep(1.5 * attempt)
                continue
            raise

    if last_exc is not None:
        raise last_exc
    raise RuntimeError("Unable to create Edge webdriver")


def _start_http_server(repo_root: Path) -> ThreadingHTTPServer:
    handler = partial(QuietHandler, directory=str(repo_root))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


def _parse_summary(summary_text: str) -> tuple[int, int] | None:
    match = re.search(r"(\d+)\s*/\s*(\d+)\s+tests passed", summary_text)
    if not match:
        return None
    return int(match.group(1)), int(match.group(2))


def _is_non_actionable_browser_log(message: str) -> bool:
    return any(marker in message for marker in _NON_ACTIONABLE_BROWSER_LOG_MARKERS)


def main() -> int:
    print("=" * 68)
    print("IPD Meta-Analysis Pro - Browser Test Runner")
    print("=" * 68)

    repo_root = Path(__file__).resolve().parents[2]
    test_runner_path = repo_root / "dev" / "tests" / "test-runner.html"
    artifact_path = repo_root / "dev" / "benchmarks" / "latest_browser_test_runner.json"
    if not test_runner_path.exists():
        print(f"[FAIL] Missing browser test runner: {test_runner_path}")
        return 1

    server = _start_http_server(repo_root)
    driver = None
    profile_dir = None
    artifact = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "FAIL",
        "status_text": "",
        "summary_text": "",
        "passed": None,
        "total": None,
        "failed_tests": [],
        "browser_console_errors": [],
    }

    try:
        _cleanup_stale_webdriver()
        driver, profile_dir = _create_driver()
        driver.set_window_size(1400, 900)

        url = f"http://127.0.0.1:{server.server_port}/dev/tests/test-runner.html"
        print(f"Loading {url}")
        driver.get(url)

        WebDriverWait(driver, 45).until(
            lambda d: d.find_element(By.ID, "status").text.strip() == "Tests complete."
        )
        time.sleep(0.5)

        status_text = driver.find_element(By.ID, "status").text.strip()
        summary_text = driver.find_element(By.ID, "summary").text.strip()
        parsed_summary = _parse_summary(summary_text)
        failed_nodes = driver.find_elements(By.CSS_SELECTOR, ".test.fail")
        failed_tests = [node.text.strip() for node in failed_nodes if node.text.strip()]
        severe_logs = [
            log
            for log in driver.get_log("browser")
            if log.get("level") == "SEVERE"
            and not _is_non_actionable_browser_log(log.get("message", ""))
        ]

        print(f"Status:  {status_text}")
        print(f"Summary: {summary_text}")

        artifact["status_text"] = status_text
        artifact["summary_text"] = summary_text
        artifact["failed_tests"] = failed_tests
        artifact["browser_console_errors"] = [log.get("message", "") for log in severe_logs]

        failures: list[str] = []
        if status_text != "Tests complete.":
            failures.append(f"Unexpected status text: {status_text}")
        if parsed_summary is None:
            failures.append(f"Could not parse summary text: {summary_text}")
        else:
            passed, total = parsed_summary
            artifact["passed"] = passed
            artifact["total"] = total
            if total < _MIN_EXPECTED_TESTS:
                failures.append(
                    f"Browser test count dropped below floor: observed {total}, expected at least {_MIN_EXPECTED_TESTS}"
                )
            if passed != total:
                failures.append(f"Browser harness reported failures: {passed}/{total} passed")
        if failed_tests:
            failures.append(f"{len(failed_tests)} failing browser assertions")
        if "ALL PASS" not in summary_text:
            failures.append("Browser harness summary did not report ALL PASS")
        if severe_logs:
            failures.append(f"{len(severe_logs)} browser console error log(s)")

        if failures:
            for item in failures:
                print(f"[FAIL] {item}")
            if failed_tests:
                print("Failing tests:")
                for item in failed_tests[:10]:
                    print(f"  - {item}")
            if severe_logs:
                print("Browser console errors:")
                for log in severe_logs[:10]:
                    print(f"  - {log.get('message', '')[:200]}")
            return 1

        artifact["status"] = "PASS"
        print("[OK] Browser harness completed with no failing assertions.")
        return 0
    except Exception as exc:
        print(f"[FAIL] Browser test runner failed: {exc}")
        artifact["error"] = str(exc)
        return 1
    finally:
        artifact_path.parent.mkdir(parents=True, exist_ok=True)
        artifact_path.write_text(json.dumps(artifact, indent=2), encoding="utf-8")
        if driver is not None:
            try:
                driver.quit()
            except Exception:
                pass
        server.shutdown()
        server.server_close()
        if profile_dir:
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
