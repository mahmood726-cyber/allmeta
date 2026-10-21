"""Exercise the production leave-one-out feature through the existing page VM pattern."""
import subprocess
from pathlib import Path


def test_leave_one_out_limit_feature():
    script = Path(__file__).resolve().parents[1] / 'validate' / 'loo' / 'test-feature.cjs'
    result = subprocess.run(['node', str(script)], capture_output=True, text=True,
                            encoding='utf-8', timeout=60)
    assert result.returncode == 0, result.stdout + result.stderr
    assert '12/12 feature checks passed' in result.stdout
