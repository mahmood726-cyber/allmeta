"""
run_all.py -- single entry point that regenerates every number and figure for the
DTA (diagnostic test accuracy) truth-recovery modality from scratch.

    python run_all.py            # full benchmark (600 reps/cell, ~7 min on 4 cores)
    python run_all.py --smoke    # fast end-to-end check (200 reps, ~1 min)
    python run_all.py --no-sim   # skip the harness; rebuild report/figures/paper
                                 # from the committed results JSON (seconds)

Stages, in order:
  1. harness_dta.py     -> results_dta_{profile}.json     (seeded simulation)
  2. partialid_dta.py   -> results_partialid.json         (SROC partial-ID experiment)
  3. report_dta.py      -> REPORT.md                       (tabular summary)
  4. tools/make_figures.py -> paper/figures/*.png
  5. tools/worked_example.py (prints the worked-example numbers)
  6. tools/md2pdf.py    -> paper/manuscript.pdf
  7. pytest tests/      -> correctness + mada-anchor gate

Determinism: base seed 20260615; same --reps reproduce every number regardless of
--procs. The full profile reproduces the committed results_dta_full.json /
results_partialid.json exactly.
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
    ap.add_argument("--smoke", action="store_true", help="fast 200-rep check")
    ap.add_argument("--no-sim", action="store_true",
                    help="skip simulation; rebuild from committed results JSON")
    ap.add_argument("--procs", type=int, default=max(1, (os.cpu_count() or 2) - 1))
    args = ap.parse_args()

    profile = "smoke" if args.smoke else "full"
    reps = 200 if args.smoke else 600

    if not args.no_sim:
        run([PY, "harness_dta.py", "--profile", profile,
             "--reps", str(reps), "--procs", str(args.procs)])
        if not args.smoke:
            # the SROC partial-ID experiment + the tabular report only rebuild for
            # the full profile (the smoke grid is a 3-cell sanity check, not the
            # committed result set).
            run([PY, "partialid_dta.py"])
            run([PY, "report_dta.py"])

    run([PY, os.path.join("tools", "make_figures.py")])
    run([PY, os.path.join("tools", "worked_example.py")])
    run([PY, os.path.join("tools", "md2pdf.py"),
         os.path.join("paper", "manuscript.md"),
         os.path.join("paper", "manuscript.pdf"),
         "DTA Truth-Recovery"])
    run([PY, "-m", "pytest", "tests", "-q"])
    print("\n[run_all] done -> REPORT.md, paper/manuscript.pdf, paper/figures/*.png")


if __name__ == "__main__":
    main()
