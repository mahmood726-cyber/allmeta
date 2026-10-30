"""Run the unchanged P19-R4 unit suite with compact, complete wrapper output.

Full TAP diagnostics go to the OS temporary directory, never to the repo.
No test selection, assertion, or exit status is changed by this reporter.
"""
from pathlib import Path
import subprocess
import sys
import tempfile


root = Path(__file__).resolve().parents[2]
command = [
    "node", "--test", "--test-reporter=tap",
    "hub/shared/tests/unit/p19-r4-bus-import.test.mjs",
]
result = subprocess.run(
    command, cwd=root, capture_output=True, text=True,
    encoding="utf-8", errors="replace",
)
with tempfile.NamedTemporaryFile(
    mode="w", encoding="utf-8", prefix="p19-r4-", suffix=".tap", delete=False,
) as log:
    log.write(result.stdout)
    log.write(result.stderr)
    log_path = log.name

print("Command:", " ".join(command))
print("Full diagnostics:", log_path)
for line in result.stdout.splitlines():
    if line.startswith(("ok ", "not ok ", "# tests ", "# suites ",
                        "# pass ", "# fail ", "# cancelled ",
                        "# skipped ", "# todo ", "1..")):
        print(line)
if result.stderr:
    print(result.stderr)
if not any(line.startswith("1..") for line in result.stdout.splitlines()):
    print(result.stdout)
print("Exit:", result.returncode)
sys.exit(result.returncode)
