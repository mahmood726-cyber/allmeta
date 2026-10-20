"""Regression coverage for the numeric axes in the actual page renderer."""
import subprocess
from pathlib import Path


def test_funnel_tick_calibration():
    script = Path(__file__).with_name('funnel-ticks.cjs')
    result = subprocess.run(['node', str(script)], capture_output=True, text=True,
                            encoding='utf-8', timeout=60)
    assert result.returncode == 0, result.stdout + result.stderr
    assert '9/9 funnel tick checks passed' in result.stdout
