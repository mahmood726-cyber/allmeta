import shutil
import subprocess
from pathlib import Path
import pytest

FIXTURES = Path(__file__).parent / "fixtures"
AUDIT_DIR = Path(__file__).parent.parent


@pytest.fixture
def fixtures_root() -> Path:
    return FIXTURES


def _playwright_test_available() -> bool:
    """True if the @playwright/test npm package resolves from the audit dir.

    The probe specs do ``import { test } from '@playwright/test'``, so without
    the package installed every probe exits with ERR_MODULE_NOT_FOUND. It is a
    declared devDependency (audit/package.json), not committed, so a fresh clone
    that never ran ``npm install`` in audit/ legitimately lacks it. Tests that
    drive the probe should SKIP — not fail — on such hosts, mirroring how the
    R-parity helpers skip when an R package is absent.
    """
    if (AUDIT_DIR / "node_modules" / "@playwright" / "test").is_dir():
        return True
    node = shutil.which("node")
    if node is None:
        return False
    try:
        # --input-type=commonjs forces CJS eval so require.resolve works even
        # though audit/package.json declares "type": "module".
        proc = subprocess.run(
            [node, "--input-type=commonjs", "-e", "require.resolve('@playwright/test')"],
            cwd=str(AUDIT_DIR), capture_output=True, timeout=20,
        )
        return proc.returncode == 0
    except (OSError, subprocess.SubprocessError):
        return False


@pytest.fixture
def require_playwright():
    """Skip the test unless the @playwright/test npm package is installed."""
    if not _playwright_test_available():
        pytest.skip(
            "@playwright/test not installed — run `npm install` in audit/ "
            "(declared devDependency; required for browser-driven probe tests)"
        )
