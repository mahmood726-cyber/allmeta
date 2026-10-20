"""Run strict-input regressions against the actual page and sensitivity engines."""
from pathlib import Path
import subprocess


def test_input_validation():
    result = subprocess.run(["node", "--test-reporter=tap", str(Path(__file__).with_name("input-validation.test.cjs"))],
                            capture_output=True, text=True, encoding="utf-8", timeout=120)
    assert result.returncode == 0, result.stdout + result.stderr
    assert "# fail 0" in result.stdout
