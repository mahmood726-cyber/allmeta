# DTA truth-recovery bench -- one-command reproduction.
# Usage: `make all` (full), `make smoke` (fast), `make paper`, `make test`.
# On Windows without GNU make, use the identical `python run_all.py` entry point.

PY ?= python

.PHONY: all smoke env full report figures paper paper-pandoc test clean

all: ## full reproduction: simulate -> report -> figures -> paper -> tests
	$(PY) run_all.py

smoke: ## fast end-to-end check (~1 min)
	$(PY) run_all.py --smoke

env: ## install pinned dependencies
	$(PY) -m pip install -r requirements.txt

full: ## run the full seeded benchmark only (600 reps/cell) + partial-ID experiment
	$(PY) harness_dta.py --profile full --reps 600 --procs 4
	$(PY) partialid_dta.py

report: ## rebuild REPORT.md from results_dta_full.json + results_partialid.json
	$(PY) report_dta.py

figures: ## regenerate manuscript figures from the results JSON
	$(PY) tools/make_figures.py

paper: figures ## build the manuscript PDF (reportlab; no pandoc needed)
	$(PY) tools/md2pdf.py paper/manuscript.md paper/manuscript.pdf "DTA Truth-Recovery"

paper-pandoc: figures ## nicer PDF if pandoc + a LaTeX engine are installed
	pandoc paper/manuscript.md -o paper/manuscript.pdf --pdf-engine=xelatex -V geometry:margin=2cm

test: ## correctness + mada-anchor gate
	$(PY) -m pytest tests -q

clean: ## remove generated figures/PDF (keeps committed results JSON)
	-$(PY) -c "import glob,os; [os.remove(p) for p in glob.glob('paper/figures/*.png')]; os.path.exists('paper/manuscript.pdf') and os.remove('paper/manuscript.pdf')"
