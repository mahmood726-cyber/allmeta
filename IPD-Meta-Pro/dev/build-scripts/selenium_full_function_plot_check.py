#!/usr/bin/env python3
# sentinel:skip-file — hardcoded paths are fixture/registry/audit-narrative data for this repo's research workflow, not portable application configuration. Same pattern as push_all_repos.py and E156 workbook files.
"""
Comprehensive UI smoke check for function handler wiring and major plot rendering.

Checks:
1) Every function referenced by inline onclick exists on window (excluding JS keywords like 'if').
2) Core analysis workflows execute without JS exceptions.
3) Major plots are visible and non-blank after their workflow runs.
"""

from __future__ import annotations

import json
import os
import re
import time
from dataclasses import dataclass, field
from typing import Dict, List

from selenium import webdriver
from selenium.webdriver.edge.options import Options
from selenium.webdriver.edge.service import Service

from edge_webdriver import load_local_app_with_ready_check


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
HTML_PATH = os.path.join(ROOT, "ipd-meta-pro.html")
URL = "file://" + HTML_PATH
EDGE_BIN = "/home/user/.local/bin/microsoft-edge"
EDGE_DRIVER = "/home/user/.local/bin/msedgedriver"


@dataclass
class CheckResult:
    name: str
    ok: bool
    detail: str = ""


@dataclass
class Report:
    checks: List[CheckResult] = field(default_factory=list)

    def add(self, name: str, ok: bool, detail: str = "") -> None:
        self.checks.append(CheckResult(name=name, ok=ok, detail=detail))

    @property
    def passed(self) -> int:
        return sum(1 for c in self.checks if c.ok)

    @property
    def failed(self) -> int:
        return sum(1 for c in self.checks if not c.ok)

    def as_dict(self) -> Dict[str, object]:
        return {
            "total": len(self.checks),
            "passed": self.passed,
            "failed": self.failed,
            "checks": [
                {"name": c.name, "ok": c.ok, "detail": c.detail} for c in self.checks
            ],
        }


def make_driver() -> webdriver.Edge:
    opts = Options()
    opts.add_argument("--headless=new")
    opts.add_argument("--disable-gpu")
    opts.add_argument("--no-sandbox")
    opts.binary_location = EDGE_BIN
    service = Service(EDGE_DRIVER)
    return webdriver.Edge(service=service, options=opts)


def sleep_short(sec: float = 0.7) -> None:
    time.sleep(sec)


def parse_onclick_functions(source_text: str) -> List[str]:
    names = sorted(set(re.findall(r'onclick="\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(', source_text)))
    deny = {"if"}
    return [n for n in names if n not in deny]


def wait_until(driver: webdriver.Edge, js_expr: str, timeout: float = 20.0) -> bool:
    start = time.time()
    while (time.time() - start) < timeout:
        try:
            if driver.execute_script(f"return !!({js_expr});"):
                return True
        except Exception:
            pass
        time.sleep(0.25)
    return False


def switch_panel(driver: webdriver.Edge, panel: str) -> None:
    driver.execute_script(
        """
        if (typeof switchPanel === 'function') {
          switchPanel(arguments[0]);
        } else {
          const tab = document.querySelector(`.nav-tab[data-panel="${arguments[0]}"]`);
          if (tab) tab.click();
        }
        """,
        panel,
    )
    sleep_short(0.5)


def plot_state(driver: webdriver.Edge, canvas_id: str) -> Dict[str, object]:
    return driver.execute_script(
        """
        const id = arguments[0];
        const cv = document.getElementById(id);
        const out = {exists:false, visible:false, width:0, height:0, nonBlank:false};
        if (!cv) return out;
        out.exists = true;
        out.width = Number(cv.width || 0);
        out.height = Number(cv.height || 0);
        const cs = window.getComputedStyle(cv);
        const rect = cv.getBoundingClientRect();
        out.visible = cs.display !== 'none' && cs.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        if (cv.tagName !== 'CANVAS') return out;
        try {
          const ctx = cv.getContext('2d');
          if (!ctx) return out;
          const w = Math.min(cv.width || 0, 220);
          const h = Math.min(cv.height || 0, 180);
          if (w < 2 || h < 2) return out;
          const data = ctx.getImageData(0, 0, w, h).data;
          let nonWhite = 0;
          for (let i = 0; i < data.length; i += 4) {
            const a = data[i + 3];
            if (a === 0) continue;
            const r = data[i], g = data[i + 1], b = data[i + 2];
            if (!(r > 248 && g > 248 && b > 248)) {
              nonWhite++;
              if (nonWhite > 20) { out.nonBlank = true; break; }
            }
          }
        } catch (e) {
          out.nonBlank = false;
        }
        return out;
        """,
        canvas_id,
    )


def main() -> int:
    if not os.path.exists(HTML_PATH):
        print(json.dumps({"error": f"Missing HTML: {HTML_PATH}"}, indent=2))
        return 2

    with open(HTML_PATH, "r", encoding="utf-8") as f:
        source = f.read()

    onclick_funcs = parse_onclick_functions(source)
    report = Report()

    driver = make_driver()
    try:
        load_local_app_with_ready_check(
            driver,
            Path(HTML_PATH),
            required_functions=("loadExampleData", "runAnalysis", "switchPanel"),
            required_objects=("APP", "Plots"),
            ready_timeout=20,
        )
        sleep_short(0.5)

        # 1) Onclick function existence check
        missing = driver.execute_script(
            """
            const funcs = arguments[0];
            const missing = [];
            funcs.forEach((name) => {
              if (typeof window[name] !== 'function') missing.push(name);
            });
            return missing;
            """,
            onclick_funcs,
        )
        report.add(
            "onclick_handlers_exist",
            len(missing) == 0,
            f"checked={len(onclick_funcs)}, missing={len(missing)}" + (f", sample={missing[:8]}" if missing else ""),
        )

        # 2) Survival workflow + core plots
        driver.execute_script("loadExampleData('survival')")
        sleep_short(1.0)
        driver.execute_script("runAnalysis()")
        ok = wait_until(
            driver,
            "typeof APP !== 'undefined' && APP.results && Array.isArray(APP.results.studies) && APP.results.studies.length >= 2",
            timeout=25,
        )
        report.add("run_analysis_survival", ok)

        switch_panel(driver, "results")
        forest = plot_state(driver, "forestPlot")
        report.add("forest_plot_visible_nonblank", bool(forest["visible"] and forest["nonBlank"]), json.dumps(forest))

        surv = plot_state(driver, "survivalPlot")
        report.add("survival_plot_visible_nonblank", bool(surv["visible"] and surv["nonBlank"]), json.dumps(surv))

        switch_panel(driver, "pubbias")
        funnel = plot_state(driver, "funnelPlot")
        report.add("funnel_plot_visible_nonblank", bool(funnel["visible"] and funnel["nonBlank"]), json.dumps(funnel))

        switch_panel(driver, "heterogeneity")
        driver.execute_script("if (typeof computeQProfile === 'function') computeQProfile();")
        sleep_short(1.2)
        qprof = plot_state(driver, "qProfilePlot")
        report.add("qprofile_plot_exists", bool(qprof["exists"]), json.dumps(qprof))

        # Bayesian plots
        switch_panel(driver, "bayesian")
        driver.execute_script(
            """
            if (document.getElementById('mcmcIter')) document.getElementById('mcmcIter').value = '1200';
            if (document.getElementById('mcmcBurnin')) document.getElementById('mcmcBurnin').value = '200';
            if (document.getElementById('mcmcChains')) document.getElementById('mcmcChains').value = '2';
            runBayesian();
            """
        )
        ok_bayes = wait_until(
            driver,
            "typeof APP !== 'undefined' && APP.bayesianResults && APP.bayesianResults.mu",
            timeout=35,
        )
        report.add("run_bayesian", ok_bayes)
        trace = plot_state(driver, "tracePlot")
        post = plot_state(driver, "posteriorPlot")
        report.add("trace_plot_visible_nonblank", bool(trace["visible"] and trace["nonBlank"]), json.dumps(trace))
        report.add("posterior_plot_visible_nonblank", bool(post["visible"] and post["nonBlank"]), json.dumps(post))

        # Meta-regression plot
        switch_panel(driver, "metareg")
        driver.execute_script(
            """
            const row0 = (typeof APP !== 'undefined' && Array.isArray(APP.data) && APP.data.length) ? APP.data[0] : {};
            const numericKey = Object.keys(row0 || {}).find((k) => typeof row0[k] === 'number' && !['study_id','treatment','event'].includes(k));
            if (numericKey) {
              runMetaRegression(numericKey);
            } else {
              const chip = document.querySelector('#moderatorVars .var-chip');
              if (chip) chip.classList.add('selected');
              runMetaRegression();
            }
            """
        )
        sleep_short(1.3)
        bubble = plot_state(driver, "bubblePlot")
        report.add("bubble_plot_visible_nonblank", bool(bubble["visible"] and bubble["nonBlank"]), json.dumps(bubble))

        # 3) Network workflow + network/ranking plots
        driver.execute_script("loadExampleData('network_antidepressants')")
        sleep_short(1.0)
        driver.execute_script("runAnalysis()")
        ok2 = wait_until(
            driver,
            "typeof APP !== 'undefined' && APP.results && Array.isArray(APP.results.studies) && APP.results.studies.length >= 2",
            timeout=25,
        )
        report.add("run_analysis_network_dataset", ok2)

        driver.execute_script("if (typeof runNetworkMetaAnalysis === 'function') runNetworkMetaAnalysis();")
        sleep_short(2.2)

        switch_panel(driver, "network")
        nplot = plot_state(driver, "networkPlot")
        report.add("network_plot_visible_nonblank", bool(nplot["visible"] and nplot["nonBlank"]), json.dumps(nplot))

        switch_panel(driver, "ranking")
        ranko = plot_state(driver, "rankogramPlot")
        csum = plot_state(driver, "cumulativeRankPlot")
        report.add("rankogram_plot_visible_nonblank", bool(ranko["visible"] and ranko["nonBlank"]), json.dumps(ranko))
        report.add("cumulative_rank_plot_visible_nonblank", bool(csum["visible"] and csum["nonBlank"]), json.dumps(csum))

        # Report
        out = report.as_dict()
        print(json.dumps(out, indent=2))
        return 0 if out["failed"] == 0 else 1

    finally:
        driver.quit()


if __name__ == "__main__":
    raise SystemExit(main())
