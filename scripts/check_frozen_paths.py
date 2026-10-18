"""Fail closed on frozen numerical/validation edits and optional lane scope drift."""
import argparse
from fnmatch import fnmatchcase
from pathlib import Path
import subprocess
import sys

FROZEN = {f"shared/{name}.js" for name in (
    "ma-core", "dta-bivariate", "dose-response", "multilevel-reml",
    "nma-multiarm-v1", "heterogeneity-ci", "selmodel", "trimfill")}
COMMON = {"REPORT.md", "BROWSER_TODO.md", "PROGRESS.md"}
LANES = {
    "W0": {"scripts/replay_baseline.mjs", "scripts/check_frozen_paths.py",
           "scripts/tests/wave0.test.mjs", "scripts/tests/dom-fixture.mjs",
           "audit/replay-baseline.json", "docs/addons-api.md", ".github/workflows/lint.yml",
           "hub/shared/addons-host.js", "shared/alm-validate.js",
           "hub/shared/tests/addons-wave0.spec.mjs", "hub/shared/tests/playwright.wave0.config.mjs",
           "hub/shared/tests/validate-heterogeneity.spec.mjs", "hub/shared/tests/validate-screen.spec.mjs", "hub/shared/tests/validate-nma.spec.mjs"},
    "A1": {"hub/shared/analysis-lifecycle.js", "hub/shared/tests/analysis-lifecycle.test.mjs", "hub/shared/tests/r1fix-lifecycle.spec.mjs"},
    "A2": {"hub/shared/xlsx-import.js", "hub/shared/csv-upload.js", "shared/vendor/jszip-3.10.1/**"},
    "A3": {"hub/shared/plot-presets.js", "hub/shared/plot-export.js"},
    "A4": {"shared/method-refs.js", "hub/shared/report-text.js", "scripts/ground_citations.py", "shared/citations.cache.json"},
    "A5": {"shared/sensitivity-v1.js", "shared/sensitivity-v1.manifest.json", "hub/shared/tests/_sensitivity_gen.R", "hub/shared/tests/fixtures/sensitivity/**"},
    "A6": {"hub/shared/r-export.js", "hub/shared/sensitivity-panel.js", "hub/shared/tests/fixtures/r-export/**"},
}
for lane in range(1, 7):
    LANES[f"A{lane}"].add(f"hub/shared/tests/addons-a{lane}*")
for app in ("pubbias-tests", "limit-ma", "proportion-ma", "mh-peto", "multilevel-ma", "cumulative-subgroup", "meta-regression"):
    LANES[f"B:{app}"] = {f"{app}/index.html", f"{app}/addons.js", f"hub/shared/tests/addons-{app}.spec.mjs"}

def violations(paths, lane=None):
    if lane is not None and lane not in LANES:
        raise ValueError(f"Unknown lane: {lane}")
    errors = []
    for path in sorted(set(paths)):
        parts = path.split('/')
        if path in FROZEN or (len(parts) >= 3 and parts[1] == 'validate'):
            errors.append(f"FROZEN: {path}")
        elif lane and not any(fnmatchcase(path, pat) for pat in LANES[lane] | COMMON):
            errors.append(f"OUTSIDE {lane}: {path}")
    return errors

def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args]).decode('utf-8').split('\0')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', required=True, help='Explicit baseline commit; includes committed, staged and unstaged changes')
    parser.add_argument('--lane', choices=sorted(LANES))
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    # --no-renames inspects both sides of a move, including frozen deletions.
    paths = git(args.repo, 'diff', '--name-only', '-z', '--no-renames', args.base, '--')
    paths += git(args.repo, 'ls-files', '--others', '--exclude-standard', '-z')
    errors = violations(filter(None, paths), args.lane)
    if errors:
        print('\n'.join(errors), file=sys.stderr)
        return 1
    print(f"PASS: frozen paths unchanged" + (f"; {args.lane} scope respected" if args.lane else ''))
    return 0

if __name__ == '__main__':
    try:
        sys.exit(main())
    except (subprocess.CalledProcessError, OSError, ValueError) as error:
        print(f"Guard refused: {error}", file=sys.stderr)
        sys.exit(2)
