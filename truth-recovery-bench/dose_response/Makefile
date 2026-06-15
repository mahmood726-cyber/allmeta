# Dose-response truth-recovery bench -- one-command reproduction.
# Usage: `make all` (full), `make smoke` (fast), `make paper`, `make test`.
# On Windows without GNU make, use the identical `python run_all.py` entry point.

PY ?= python

.PHONY: all smoke env full report figures paper test clean

all: ## full reproduction: simulate -> report -> figures -> paper -> tests
	$(PY) run_all.py

smoke: ## fast end-to-end check (~1 min)
	$(PY) run_all.py --smoke

env: ## install pinned dependencies
	$(PY) -m pip install -r requirements.txt

full: ## run the full seeded benchmark only (1000 reps)
	$(PY) harness_dose.py --profile full --reps 1000 --procs 4

report: ## rebuild REPORT.md from results_dose_full.json
	$(PY) report_dose.py

figures: ## regenerate manuscript figures from results JSON
	$(PY) tools/make_figures.py

paper: figures ## build the manuscript PDF (reportlab; no pandoc needed)
	$(PY) tools/md2pdf.py paper/manuscript.md paper/manuscript.pdf "Dose-Response Truth-Recovery"

paper-pandoc: figures ## nicer PDF if pandoc + a LaTeX engine are installed
	pandoc paper/manuscript.md -o paper/manuscript.pdf --pdf-engine=xelatex -V geometry:margin=2cm

test: ## correctness gate
	$(PY) -m pytest tests -q

clean: ## remove generated artifacts (keeps committed results JSON)
	-$(PY) -c "import shutil,glob,os; [os.remove(p) for p in glob.glob('paper/figures/*.png')]; os.path.exists('paper/manuscript.pdf') and os.remove('paper/manuscript.pdf')"
