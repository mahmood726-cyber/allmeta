"""Replace hardcoded `C:/Projects/allmeta/...` oracle paths in
hub/shared/tests/*-parity.spec.mjs with relative URLs resolved from
import.meta.url. Closes the portability gap noted in lessons.md
"No hardcoded local paths in deployable code".

Before:
    JSON.parse(readFileSync(
      'C:/Projects/allmeta/tsa/tests/fixtures/tsa-oracle.json', 'utf-8'));

After:
    JSON.parse(readFileSync(
      new URL('../../../tsa/tests/fixtures/tsa-oracle.json', import.meta.url),
      'utf-8'));

The spec files live at `hub/shared/tests/`, so the repo root is
`../../../` relative to import.meta.url. Idempotent.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

PATTERN = re.compile(
    r"['\"]C:/Projects/allmeta/([^'\"]+)['\"]",
    re.IGNORECASE,
)
PATTERN_BS = re.compile(
    r"['\"]C:\\\\Projects\\\\allmeta\\\\([^'\"]+)['\"]",
    re.IGNORECASE,
)


def patch(text: str) -> tuple[str, int]:
    count = 0

    # `const URL = '...'` shadows the global URL constructor — so our
    # path-resolving `new URL(...)` would call the string. Rename the
    # baseURL constant to APP_URL and all whole-word usages.
    if re.search(r"^const URL\s*=", text, re.MULTILINE):
        text = re.sub(r"^const URL\s*=", "const APP_URL =", text, count=1, flags=re.MULTILINE)
        # Whole-word URL → APP_URL, but never inside `new URL(`, which is
        # the constructor we want to preserve.
        text = re.sub(r"\bURL\b(?!\s*\()", "APP_URL", text)
        # Restore `new URL` if the above accidentally rewrote it (defensive).
        text = text.replace("new APP_URL(", "new URL(")
        count += 1   # URL rename counts as 1 substitution

    def fwd(m: re.Match) -> str:
        nonlocal count
        count += 1
        rel = m.group(1).replace("\\", "/")
        return f"new URL('../../../{rel}', import.meta.url)"

    def bs(m: re.Match) -> str:
        nonlocal count
        count += 1
        rel = m.group(1).replace("\\\\", "/").replace("\\", "/")
        return f"new URL('../../../{rel}', import.meta.url)"

    text = PATTERN.sub(fwd, text)
    text = PATTERN_BS.sub(bs, text)
    return text, count


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    root = Path(__file__).resolve().parent.parent
    spec_dir = root / "hub" / "shared" / "tests"
    total_files = 0
    total_subs = 0
    for p in sorted(spec_dir.glob("*.spec.mjs")):
        text = p.read_text(encoding="utf-8")
        new, n = patch(text)
        if n == 0:
            continue
        total_files += 1
        total_subs += n
        if args.dry_run:
            print(f"WOULD PATCH ({n} subs): {p.name}")
        else:
            p.write_text(new, encoding="utf-8")
            print(f"PATCHED ({n} subs): {p.name}")
    print(f"\nSummary: files={total_files} subs={total_subs}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
