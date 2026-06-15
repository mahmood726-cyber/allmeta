"""
run_all.py -- single entry point that regenerates the numbers and artifacts for the
pairwise truth-recovery modality.

    python run_all.py            # full benchmark (1000 reps/cell, hours on 4 cores)
    python run_all.py --smoke    # fast end-to-end check (60 reps/cell)
    python run_all.py --no-sim   # skip the harness; rebuild figures/worked-example/
                                 # paper/tests from the committed results JSON (seconds)

Stages, in order:
  1. harness.py     -> results_<profile>.json   (seeded simulation; scores the ten
                       R-validated methods AND the pre-trained NPE/PVS/PartialID/
                       Unified, which load from the committed sbi_model.pkl)
  2. report.py      -> REPORT.md                 (tabular leaderboard)
  3. tools/make_figures.py    -> paper/figures/*.png   (from results_merged.json)
  4. tools/worked_example.py  (prints the worked-example numbers)
  5. tools/md2pdf.py          -> paper/manuscript.pdf
  6. pytest tests/  -> correctness gate (R-anchor parity + unified contracts)

The amortized NPE model `sbi_model.pkl` is a COMMITTED, pre-computed artifact (see
DATA_MANIFEST.md / READINESS.md). It is NOT retrained here -- retraining is a
separate, documented, offline step (`python train_sbi.py`; scikit-learn only, no
torch). The committed `results_merged.json` (with the merged NPE/Unified metrics)
is the source for the figures and the manuscript tables; `--no-sim` rebuilds
everything from it without touching the simulation.

Determinism: base seed 20260611; the same --reps reproduces every number
regardless of --procs.
"""
import argparse
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PY = sys.executable


def run(cmd, **kw):
    print("\n$ " + " ".join(cmd), flush=True)
    subprocess.run(cmd, cwd=HERE, check=True, **kw)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--smoke", action="store_true", help="fast 60-rep check")
    ap.add_argument("--no-sim", action="store_true",
                    help="skip simulation; rebuild from committed results JSON")
    ap.add_argument("--procs", type=int, default=max(1, (os.cpu_count() or 2) - 1))
    args = ap.parse_args()

    profile = "smoke" if args.smoke else "full"
    reps = 60 if args.smoke else 1000
    results_json = f"results_{profile}.json"

    if not args.no_sim:
        run([PY, "harness.py", "--profile", profile,
             "--reps", str(reps), "--procs", str(args.procs),
             "--out", results_json])
        run([PY, "report.py", "--results", results_json, "--out", "REPORT.md"])

    run([PY, os.path.join("tools", "make_figures.py")])
    run([PY, os.path.join("tools", "worked_example.py")])
    run([PY, os.path.join("tools", "md2pdf.py"),
         os.path.join("paper", "manuscript.md"),
         os.path.join("paper", "manuscript.pdf"),
         "Pairwise Truth-Recovery"])
    run([PY, "-m", "pytest", "tests", "-q"])
    print("\n[run_all] done -> REPORT.md, paper/manuscript.pdf, paper/figures/*.png")


if __name__ == "__main__":
    main()
