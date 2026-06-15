"""
run_all.py -- single entry point that regenerates every number and figure for the
dose-response truth-recovery modality from scratch.

    python run_all.py            # full benchmark (1000 reps, ~9 min on 4 cores)
    python run_all.py --smoke    # fast end-to-end check (300 reps, ~1 min)
    python run_all.py --no-sim   # skip the harness; rebuild report/figures/paper
                                 # from the committed results JSON (seconds)

Stages, in order:
  1. harness_dose.py   -> results_dose_{profile}.json   (seeded simulation)
  2. report_dose.py    -> REPORT.md                      (tabular summary)
  3. tools/make_figures.py -> paper/figures/*.png
  4. tools/worked_example.py (prints the worked-example numbers)
  5. tools/md2pdf.py   -> paper/manuscript.pdf
  6. pytest tests/     -> correctness gate

Determinism: base seed 20260615; same --reps reproduce every number regardless of
--procs. The full profile reproduces the committed results_dose_full.json exactly.
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
    ap.add_argument("--smoke", action="store_true", help="fast 300-rep check")
    ap.add_argument("--no-sim", action="store_true",
                    help="skip simulation; rebuild from committed results JSON")
    ap.add_argument("--procs", type=int, default=max(1, (os.cpu_count() or 2) - 1))
    args = ap.parse_args()

    profile = "smoke" if args.smoke else "full"
    reps = 300 if args.smoke else 1000

    if not args.no_sim:
        run([PY, "harness_dose.py", "--profile", profile,
             "--reps", str(reps), "--procs", str(args.procs)])
        if not args.smoke:
            run([PY, "report_dose.py"])

    run([PY, os.path.join("tools", "make_figures.py")])
    run([PY, os.path.join("tools", "worked_example.py")])
    run([PY, os.path.join("tools", "md2pdf.py"),
         os.path.join("paper", "manuscript.md"),
         os.path.join("paper", "manuscript.pdf"),
         "Dose-Response Truth-Recovery"])
    run([PY, "-m", "pytest", "tests", "-q"])
    print("\n[run_all] done -> REPORT.md, paper/manuscript.pdf, paper/figures/*.png")


if __name__ == "__main__":
    main()
