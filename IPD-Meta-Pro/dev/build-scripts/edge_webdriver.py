#!/usr/bin/env python3
"""Shared Edge webdriver bootstrap helpers for local benchmark scripts."""

from __future__ import annotations

import os
import shutil
import time
from pathlib import Path
from typing import Sequence

from selenium import webdriver
from selenium.common.exceptions import TimeoutException, WebDriverException
from selenium.webdriver.edge.options import Options
from selenium.webdriver.edge.service import Service

_EDGE_BINARY_CANDIDATES = [
    os.environ.get("EDGE_BINARY"),
    "/home/user/.local/bin/microsoft-edge",
    "/mnt/c/Users/user/.local/bin/microsoft-edge",
    "/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/mnt/c/Program Files/Microsoft/Edge/Application/msedge.exe",
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


def _first_executable(candidates: list[str | None]) -> str | None:
    for candidate in candidates:
        if candidate and os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate
    return None


def create_edge_driver(options: Options) -> webdriver.Edge:
    """Prefer fixed local runtime paths over Selenium Manager auto-discovery."""
    edge_binary = _first_executable(_EDGE_BINARY_CANDIDATES)
    edge_driver = _first_executable(_EDGE_DRIVER_CANDIDATES)
    if edge_binary and not getattr(options, "binary_location", None):
        options.binary_location = edge_binary
    if edge_driver:
        return webdriver.Edge(service=Service(executable_path=edge_driver), options=options)
    return webdriver.Edge(options=options)


def load_local_app_with_ready_check(
    driver: webdriver.Edge,
    app_path: Path,
    *,
    required_functions: Sequence[str] = (),
    required_objects: Sequence[str] = (),
    load_timeout: float = 25,
    ready_timeout: float = 12,
) -> dict:
    """
    Load the local app and wait for the explicit runtime-ready contract.

    The page is considered usable once the in-app ready signal is present and
    any extra required symbols requested by the caller also exist.
    """
    timed_out = False
    driver.set_page_load_timeout(load_timeout)

    try:
        driver.get(app_path.resolve().as_uri())
    except TimeoutException:
        timed_out = True
        try:
            driver.execute_script("window.stop();")
        except WebDriverException:
            pass

    deadline = time.time() + ready_timeout
    last_state: dict | None = None
    while time.time() < deadline:
        try:
            state = driver.execute_script(
                """
                const requiredFunctions = Array.isArray(arguments[0]) ? arguments[0] : [];
                const requiredObjects = Array.isArray(arguments[1]) ? arguments[1] : [];
                const runtimeSignal = window.__IPD_META_PRO_READY__ || null;
                const symbolType = (name) => {
                    try {
                        return Function('return typeof ' + name)();
                    } catch (e) {
                        return 'undefined';
                    }
                };
                const functionsReady = requiredFunctions.every(name => symbolType(name) === 'function');
                const objectsReady = requiredObjects.every(name => symbolType(name) !== 'undefined');
                const appRuntimeReady = !!(
                    runtimeSignal &&
                    runtimeSignal.ready === true &&
                    typeof APP === 'object' &&
                    APP &&
                    APP.runtime &&
                    APP.runtime.ready === true
                );
                return {
                    title: document.title || '',
                    readyState: document.readyState || '',
                    appRuntimeReady,
                    runtimePhase: runtimeSignal && runtimeSignal.phase ? runtimeSignal.phase : null,
                    runtimeMissing: runtimeSignal && Array.isArray(runtimeSignal.missing) ? runtimeSignal.missing : [],
                    functionsReady,
                    objectsReady,
                    ready: appRuntimeReady && functionsReady && objectsReady
                };
                """,
                list(required_functions),
                list(required_objects),
            )
        except WebDriverException:
            time.sleep(0.5)
            continue

        if isinstance(state, dict):
            last_state = state
            if state.get("ready"):
                state["timed_out"] = timed_out
                return state

        time.sleep(0.5)

    detail = last_state if last_state is not None else {"readyState": "unknown", "title": ""}
    raise RuntimeError(
        "App runtime did not become ready after local navigation "
        f"(load_timed_out={timed_out}): {detail}"
    )
