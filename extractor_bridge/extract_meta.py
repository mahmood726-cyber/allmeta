"""
Thin, loosely-coupled CLI bridge to the rct-extractor-v2 cardiology/malaria
extractor. Builds a meta-starter-kit config (the shared interchange JSON) from
trial texts, AUTO-DETECTING the topic and engaging only for malaria/cardiology.

Loose coupling: this shells out to rct-extractor-v2 -- nothing here imports it,
and it is a friendly no-op if the extractor is not present. Point
RCT_EXTRACTOR_PATH at the rct-extractor-v2 repo root (or it tries common paths).

CLI:
    python extractor_bridge/extract_meta.py records.json --out config.json
    # records.json: {title, effect_measure, endpoint?, intervention?, ...,
    #                records:[{name, text, nct?, pmid?, year?}]}

The produced config is the meta-starter-kit contract; this project consumes it
through its own pipeline (forest plot / capsule / audit). Default topics:
malaria,cardiology,hiv -- other topics are skipped so existing flows are untouched.
"""
import os
import subprocess
import sys
from pathlib import Path


def _candidate_roots():
    here = Path(__file__).resolve()
    repo_root = here.parents[1]
    configured = os.getenv("RCT_EXTRACTOR_PATH")
    candidates = [
        Path(configured).expanduser() if configured else None,
        repo_root.parent / "rct-extractor-v2",
        Path.home() / "code" / "rct-extractor-v2",
        Path.home() / "rct-extractor-v2",
    ]
    return [c for c in candidates if c]


def _find_extractor():
    for c in _candidate_roots():
        if (c / "scripts" / "build_metakit_config.py").exists():
            return str(c)
    return None


def main():
    root = _find_extractor()
    if not root:
        sys.stderr.write(
            "rct-extractor-v2 not found. Set RCT_EXTRACTOR_PATH to its repo root.\n"
            "(Loose-coupled bridge: no-op without the extractor.)\n")
        return 2
    script = os.path.join(root, "scripts", "build_metakit_config.py")
    args = sys.argv[1:]
    if not any(a == "--topics" for a in args):
        args += ["--topics", "malaria,cardiology,hiv"]   # auto-detect, only these topics
    return subprocess.call([sys.executable, script] + args)


if __name__ == "__main__":
    raise SystemExit(main())
