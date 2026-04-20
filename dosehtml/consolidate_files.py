#!/usr/bin/env python3
"""
Dose Response Pro - File Consolidation Script
================================================

This script consolidates multiple versions of Dose Response Pro into
a single clean directory structure.

Directory structure after consolidation:
├── dose-response-pro.html          (Canonical browser entry)
├── docs/
│   ├── Complete_Documentation.md
│   ├── GLS_Method_Documentation.md
│   └── CSV_Import_Documentation.md
├── tests/
│   └── validate_dose_response_pro.R
└── archive/                         (Old versions moved here)
    ├── dose-response-pro-v*.html
    └── ...
"""

import os
import shutil
from pathlib import Path

# Configuration
DOSEHTML_DIR = Path(__file__).resolve().parent
MAIN_FILE = "dose-response-pro.html"
ARCHIVE_DIR = DOSEHTML_DIR / "archive"
DOCS_DIR = DOSEHTML_DIR / "docs"
TESTS_DIR = DOSEHTML_DIR / "tests"

# Files to keep in main directory
KEEP_FILES = [
    "dose-response-pro.html",
    "dose-response-pro-v18.3-fixed.html",
    "dose-response-pro-v19.0.html",
    "sample_dose_response_data.csv"
]

# Documentation files to organize
DOC_FILES = {
    "Dose_Response_Pro_Complete_Documentation.md": DOCS_DIR / "Complete_Documentation.md",
    "GLS_METHOD_DOCUMENTATION.md": DOCS_DIR / "GLS_Method_Documentation.md",
    "CSV_IMPORT_DOCUMENTATION.md": DOCS_DIR / "CSV_Import_Documentation.md",
    "SENSITIVITY_ANALYSIS_COMPLETE.md": DOCS_DIR / "Sensitivity_Analysis.md",
    "CHANGES_SUMMARY.md": DOCS_DIR / "Changes_Summary.md"
}

# Test files to organize
TEST_FILES = {
    "validate_dose_response_pro.R": TESTS_DIR / "validate_dose_response_pro.R"
}

# Files to archive (old versions)
ARCHIVE_PATTERNS = [
    "dose-response-pro-v*.html",
    "dose-response-pro-v*.*.html",
    "pairwise-*.html"
]


def create_directories():
    """Create required directories if they don't exist."""
    print("Creating directories...")
    ARCHIVE_DIR.mkdir(exist_ok=True)
    DOCS_DIR.mkdir(exist_ok=True)
    TESTS_DIR.mkdir(exist_ok=True)
    print("  [OK] Directories created")


def archive_old_versions():
    """Move old version files to archive directory."""
    print("\nArchiving old versions...")

    archived_count = 0
    for pattern in ARCHIVE_PATTERNS:
        for file in DOSEHTML_DIR.glob(pattern):
            # Skip files we want to keep in main directory
            if file.name not in KEEP_FILES and file.is_file():
                dest = ARCHIVE_DIR / file.name
                if not dest.exists():
                    shutil.move(str(file), str(dest))
                    print(f"  Archived: {file.name}")
                    archived_count += 1

    print(f"  [OK] Archived {archived_count} files")


def organize_documentation():
    """Move documentation files to docs directory."""
    print("\nOrganizing documentation...")

    for src_name, dest_path in DOC_FILES.items():
        src_path = DOSEHTML_DIR / src_name
        if src_path.exists():
            shutil.copy(str(src_path), str(dest_path))
            print(f"  Copied: {src_name} -> docs/{dest_path.name}")

    # Also move existing doc files
    for file in DOSEHTML_DIR.glob("*.md"):
        if file.name not in [os.path.basename(p) for p in DOC_FILES.keys()]:
            dest = DOCS_DIR / file.name
            if not dest.exists():
                shutil.move(str(file), str(dest))
                print(f"  Moved: {file.name} -> docs/")

    print("  [OK] Documentation organized")


def organize_tests():
    """Move test files to tests directory."""
    print("\nOrganizing tests...")

    for src_name, dest_path in TEST_FILES.items():
        if dest_path.exists():
            # Already in tests directory
            continue

        # Check if it exists in the current location
        for file in DOSEHTML_DIR.rglob(src_name):
            if str(file) != str(dest_path):
                shutil.copy(str(file), str(dest_path))
                print(f"  Copied: {src_name} -> tests/{dest_path.name}")

    print("  [OK] Tests organized")


def cleanup_temp_files():
    """Remove temporary and backup files."""
    print("\nCleaning up temporary files...")

    temp_patterns = [
        "*.ps1",
        "*_backup.html",
        "*.backup",
        "temp_*.js",
        "temp_*.py",
        "*.txt",
        "final_replace*.py",
        "fix_*.py",
        "replace_*.py",
        "update_*.py",
        "update_*.ps1",
        "convergence_*.js",
        "insert_*.ps1",
        "apply_*.txt",
        "new_*.txt",
        "profile_*.txt"
    ]

    removed_count = 0
    for pattern in temp_patterns:
        for file in DOSEHTML_DIR.glob(pattern):
            if file.is_file():
                # Move to archive instead of deleting
                dest = ARCHIVE_DIR / file.name
                if not dest.exists():
                    shutil.move(str(file), str(dest))
                    removed_count += 1

    # Also remove the 'nul' file if it exists (Windows special file)
    nul_file = DOSEHTML_DIR / "nul"
    try:
        if nul_file.exists():
            nul_file.unlink()
            removed_count += 1
    except (PermissionError, OSError):
        # nul is a special Windows device file, skip it
        pass

    print(f"  [OK] Moved {removed_count} temporary files to archive")


def ensure_main_entry():
    """Ensure the canonical browser entry exists."""
    print("\nChecking canonical browser entry...")

    main_entry = DOSEHTML_DIR / MAIN_FILE
    if not main_entry.exists():
        raise FileNotFoundError(f"Missing canonical browser entry: {main_entry}")

    print(f"  [OK] Using existing canonical entry: {MAIN_FILE}")


def create_readme():
    """Create a README file for the consolidated directory."""
    print("\nCreating README...")

    readme_content = """# Dose Response Pro v18.1 - Ultimate Edition

## Quick Start

1. **Open the application**: `dose-response-pro.html`
2. **Load sample data**: Click "Load Demo Data" button
3. **Run analysis**: Click "Run Analysis"
4. **Explore results**: Check the Results and Plots tabs

## Directory Structure

```
dosehtml/
├── dose-response-pro.html              # Canonical browser entry (use this)
├── dose-response-pro-v18.3-fixed.html  # Historical named snapshot
├── dose-response-pro-v19.0.html        # Experimental newer snapshot
├── docs/                               # Documentation
│   ├── Complete_Documentation.md       # Full documentation
│   ├── GLS_Method_Documentation.md     # GLS methodology
│   ├── CSV_Import_Documentation.md     # CSV import guide
│   ├── Sensitivity_Analysis.md         # Sensitivity analysis docs
│   └── Changes_Summary.md              # Version changes
├── tests/                              # Validation scripts
│   └── validate_dose_response_pro.R    # R validation script
├── archive/                            # Old versions (archived)
└── README.md                           # This file
```

## Documentation

- **Complete Documentation**: See `docs/Complete_Documentation.md`
- **GLS Method Reference**: See `docs/GLS_Method_Documentation.md`
- **CSV Import Guide**: See `docs/CSV_Import_Documentation.md`

## Validation

To validate the JavaScript implementation against R packages:

```r
# In R console
source("tests/validate_dose_response_pro.R")
```

## Features

- **GLS Method**: Greenland & Longnecker two-stage method
- **Bayesian Analysis**: Multi-chain MCMC with convergence diagnostics
- **Sensitivity Analysis**: Leave-one-out with Cook's D and DFITS
- **Interactive Visualizations**: Dose-response curves, forest plots
- **R Code Export**: Validated R code for reproducibility
- **CSV Import**: Smart parsing with flexible column detection

## Version

- **Canonical Entry**: `dose-response-pro.html`
- **Historical Snapshots**: keep the versioned HTML files for audit/reference only

## Support

For issues or questions, refer to the documentation in the `docs/` directory.

---

**Generated by consolidate_files.py**
"""

    readme_path = DOSEHTML_DIR / "README.md"
    with open(readme_path, "w", encoding="utf-8") as f:
        f.write(readme_content)

    print("  [OK] Created README.md")


def print_summary():
    """Print summary of consolidation."""
    print("\n" + "=" * 60)
    print("CONSOLIDATION SUMMARY")
    print("=" * 60)

    print(f"\nMain directory: {DOSEHTML_DIR}")
    print(f"  Main application: {MAIN_FILE}")

    print(f"\nDocumentation: {DOCS_DIR}")
    for file in sorted(DOCS_DIR.glob("*")):
        if file.is_file():
            print(f"  - {file.name}")

    print(f"\nTests: {TESTS_DIR}")
    for file in sorted(TESTS_DIR.glob("*")):
        if file.is_file():
            print(f"  - {file.name}")

    print(f"\nArchive: {ARCHIVE_DIR}")
    archive_count = len(list(ARCHIVE_DIR.glob("*")))
    print(f"  {archive_count} files archived")

    print("\n" + "=" * 60)
    print("Consolidation complete!")
    print("=" * 60)


def main():
    """Main consolidation function."""
    print("=" * 60)
    print("DOSE RESPONSE PRO - FILE CONSOLIDATION")
    print("=" * 60)

    create_directories()
    archive_old_versions()
    organize_documentation()
    organize_tests()
    cleanup_temp_files()
    ensure_main_entry()
    create_readme()
    print_summary()


if __name__ == "__main__":
    main()
