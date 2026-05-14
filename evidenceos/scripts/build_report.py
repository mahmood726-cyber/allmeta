"""Build the EvidenceOS demo report."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from evidenceos_engine import build_report, fetch_sources, load_json, write_json  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Build EvidenceOS source-backed demo report.")
    parser.add_argument("--offline", action="store_true", help="Use data/source-cache.json instead of live APIs.")
    parser.add_argument("--cache", default=str(ROOT / "data" / "source-cache.json"))
    parser.add_argument("--out", default=str(ROOT / "data" / "report.json"))
    args = parser.parse_args()

    cache_path = Path(args.cache)
    if args.offline:
        sources = load_json(cache_path)
    else:
        sources = fetch_sources()
        write_json(cache_path, sources)

    report = build_report(sources)
    write_json(Path(args.out), report)
    print(
        "EvidenceOS report built: "
        f"{report['summary']['core_trials']} core trials, "
        f"{report['summary']['publication_candidates']} publication candidates, "
        f"receipt {report['truthcert']['payload_hash'][:16]}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
