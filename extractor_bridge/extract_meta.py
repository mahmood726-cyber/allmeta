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
malaria,cardiology -- other topics are skipped so existing flows are untouched.
"""
import os
import sys
import subprocess

_CANDIDATES = [
    os.getenv("RCT_EXTRACTOR_PATH"),
    r"C:\Projects\rct-extractor-v2",
    "/c/Projects/rct-extractor-v2",
    r"F:\rct-extractor-v2",
    os.path.expanduser("~/rct-extractor-v2"),
]


def _find_extractor():
    for c in _CANDIDATES:
        if c and os.path.exists(os.path.join(c, "scripts", "build_metakit_config.py")):
            return c
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
        args += ["--topics", "malaria,cardiology"]   # auto-detect, only these topics
    return subprocess.call([sys.executable, script] + args)


if __name__ == "__main__":
    raise SystemExit(main())
