#!/usr/bin/env python3
"""
IPD-Meta-Pro Build System
=========================
`dev/modules/` is the authoritative source tree for application code.
`ipd-meta-pro.html` is a generated distributable artifact rebuilt from the
module manifest.

Usage:
  python dev/build.py build   # Reassemble dev/modules/ -> ipd-meta-pro.html
  python dev/build.py verify  # Fail if dev/modules/ and ipd-meta-pro.html are out of sync
  python dev/build.py bootstrap-from-html --force
                             # Recovery-only: regenerate modules from a trusted HTML artifact
  python dev/build.py stats   # Show module statistics
  python dev/build.py minify  # Build + basic minification (strip comments, whitespace)

Modules are split at clearly marked section boundaries (// ===...=== comments).
Each module is a standalone .js file that can be edited independently.
"""

import os
import re
import sys
import json
import hashlib
from pathlib import Path

ROOT = Path(__file__).parent.parent
HTML_FILE = ROOT / 'ipd-meta-pro.html'
MODULES_DIR = ROOT / 'dev' / 'modules'
MANIFEST_FILE = MODULES_DIR / 'manifest.json'
BENCHMARKS_DIR = ROOT / 'dev' / 'benchmarks'
EMBEDDED_VALIDATION_MODULE = MODULES_DIR / '02_21a_embedded-validation-manifest.js'
EMBEDDED_VALIDATION_ARTIFACTS = {
    'dev/benchmarks/latest_ipd_parity_gate.json': {
        'filename': 'latest_ipd_parity_gate.json',
        'summary_only': False,
    },
    'dev/benchmarks/latest_frontier_gap_methods_benchmark.json': {
        'filename': 'latest_frontier_gap_methods_benchmark.json',
        'summary_only': True,
    },
    'dev/benchmarks/latest_ipd_simulation_lab_benchmark.json': {
        'filename': 'latest_ipd_simulation_lab_benchmark.json',
        'summary_only': True,
    },
    'dev/benchmarks/latest_publication_replication_gate.json': {
        'filename': 'latest_publication_replication_gate.json',
        'summary_only': True,
    },
    'dev/benchmarks/latest_ipd_superiority_snapshot.json': {
        'filename': 'latest_ipd_superiority_snapshot.json',
        'summary_only': True,
    },
}

# Section markers to split on (order matters - first match wins)
SECTION_MARKERS = [
    (r'const MathUtils = \(function\(\) \{', 'math-utils'),
    (r'// =+\s*ERROR HANDLER', 'error-handler'),
    (r'// =+\s*SESSION MANAGER', 'session-manager'),
    (r'// =+\s*UNDO MANAGER|// Diff-based undo', 'undo-manager'),
    (r'// =+\s*INLINE (DATA )?EDITOR', 'inline-editor'),
    (r'// =+\s*MICE IMPUTATION', 'mice-imputation'),
    (r'// =+\s*COMPUTE WORKER', 'compute-worker'),
    (r'// =+\s*FORM VALID', 'form-validator'),
    (r'// =+\s*INPUT VALID', 'input-validator'),
    (r'const Stats = \{', 'stats'),
    (r'function getConfZ\(\)', 'confidence-utils'),
    (r'const MetaAnalysis = \{', 'meta-analysis'),
    (r'const SurvivalAnalysis = \{', 'survival-analysis'),
    (r'function createSeededRNG', 'seeded-rng'),
    (r'const BayesianMCMC = \{', 'bayesian-mcmc'),
    (r'const Plots = \{', 'plots'),
    (r'const PlotDefaults = \{', 'plot-defaults'),
    (r'const PublicationBias = \{', 'publication-bias'),
    (r'function runAnalysis\(\)', 'run-analysis'),
    (r'function loadExampleData', 'example-datasets'),
    (r'// =+\s*Q-PROFILE', 'q-profile'),
    (r'const HelpSystem = \{', 'help-system'),
    (r'const DataPaginator = \{', 'data-paginator'),
    (r'const ServiceWorkerManager = \{', 'service-worker'),
    (r'const VirtualScroller = \{', 'virtual-scroller'),
    (r'const TruthCert = \{', 'truthcert'),
    (r'const BeyondR40 = \{', 'beyond-r40'),
    (r'const CollaborationSystem = \{', 'collaboration'),
    (r'const BENCHMARK_DATASETS = \{', 'benchmark-datasets'),
    (r'function runNetworkMetaAnalysis', 'network-meta-analysis'),
    (r'function showAdvancedFeaturesMenu', 'advanced-features'),
]


def read_html():
    """Read and return the full HTML file."""
    with open(HTML_FILE, 'r', encoding='utf-8') as f:
        return f.read()


def _cleanup_generated_modules() -> None:
    """Remove generated split artifacts while preserving hand-maintained modules."""
    MODULES_DIR.mkdir(parents=True, exist_ok=True)
    for path in MODULES_DIR.iterdir():
        if path.name == MANIFEST_FILE.name:
            path.unlink()
            continue
        if re.match(r'^\d{2}_', path.name):
            path.unlink()


def _split_script_block(script_content: str, script_index: int) -> list[tuple[str, str]]:
    """Split a large inline script into ordered logical chunks."""
    boundaries: list[tuple[int, str]] = []
    seen_positions: set[int] = set()

    for pattern, name in SECTION_MARKERS:
        match = re.search(pattern, script_content)
        if not match:
            continue
        pos = match.start()
        if pos in seen_positions:
            continue
        seen_positions.add(pos)
        boundaries.append((pos, name))

    boundaries.sort(key=lambda item: item[0])
    if not boundaries:
        return [(f'{script_index:02d}_script_{script_index:02d}.js', script_content)]

    files: list[tuple[str, str]] = []
    first_pos = boundaries[0][0]
    if script_content[:first_pos].strip():
        files.append((f'{script_index:02d}_00_preamble.js', script_content[:first_pos]))

    for ordinal, (start, name) in enumerate(boundaries, start=1):
        end = boundaries[ordinal][0] if ordinal < len(boundaries) else len(script_content)
        chunk = script_content[start:end]
        if not chunk.strip():
            continue
        files.append((f'{script_index:02d}_{ordinal:02d}_{name}.js', chunk))

    return files or [(f'{script_index:02d}_script_{script_index:02d}.js', script_content)]


def _load_manifest() -> dict:
    if not MANIFEST_FILE.exists():
        print("ERROR: No manifest.json found. Run 'split' first.")
        sys.exit(1)

    with open(MANIFEST_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)


def _load_json_if_exists(path: Path):
    if not path.exists():
        return None
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def _stable_json_dumps(value) -> str:
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False)


def _sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def _current_app_build_id() -> str | None:
    build_id_pattern = re.compile(r"const IPD_APP_BUILD_ID = '([^']+)'")
    candidates = [
        MODULES_DIR / '02_03_collaboration.js',
        HTML_FILE,
    ]
    for path in candidates:
        if not path.exists():
            continue
        text = path.read_text(encoding='utf-8')
        match = build_id_pattern.search(text)
        if match:
            return match.group(1)
    return None


def _trim_validation_artifact(relpath: str, payload: dict, summary_only: bool) -> dict:
    if relpath.endswith('latest_ipd_parity_gate.json'):
        trimmed = {
            'generated_at': payload.get('generated_at'),
            'app_build_id': payload.get('app_build_id'),
            'seed': payload.get('seed'),
            'summary': payload.get('summary'),
            'gate': payload.get('gate'),
            'top_gaps': payload.get('top_gaps'),
        }
    elif relpath.endswith('latest_frontier_gap_methods_benchmark.json'):
        trimmed = {
            'generated_at': payload.get('generated_at'),
            'app_build_id': payload.get('app_build_id'),
            'seed': payload.get('seed'),
            'datasets': payload.get('datasets'),
            'km_imputations': payload.get('km_imputations'),
            'federated_epsilon': payload.get('federated_epsilon'),
            'comparison': {
                'summary': ((payload.get('comparison') or {}).get('summary')),
            },
        }
    elif relpath.endswith('latest_ipd_simulation_lab_benchmark.json'):
        trimmed = {
            'generated_at': payload.get('generated_at'),
            'app_build_id': payload.get('app_build_id'),
            'seed': payload.get('seed'),
            'scenarios': payload.get('scenarios'),
            'replicates': payload.get('replicates'),
            'min_valid_reps': payload.get('min_valid_reps'),
            'comparison': {
                'summary': ((payload.get('comparison') or {}).get('summary')),
            },
        }
    elif relpath.endswith('latest_publication_replication_gate.json'):
        trimmed = {
            'generated_at': payload.get('generated_at'),
            'app_build_id': payload.get('app_build_id'),
            'seed': payload.get('seed'),
            'profiles': payload.get('profiles'),
            'comparison': {
                'summary': ((payload.get('comparison') or {}).get('summary')),
            },
        }
    elif relpath.endswith('latest_ipd_superiority_snapshot.json'):
        trimmed = {
            'generated_at': payload.get('generated_at'),
            'app_build_id': payload.get('app_build_id'),
            'source_artifacts': payload.get('source_artifacts'),
            'artifact_availability': payload.get('artifact_availability'),
            'scorecards': payload.get('scorecards'),
            'metrics': payload.get('metrics'),
            'positioning': payload.get('positioning'),
        }
    else:
        trimmed = payload

    trimmed['metadata'] = {
        'embedded_validation_manifest': True,
        'embedded_summary_only': bool(summary_only),
        'source_path': relpath,
        'source_generated_at': payload.get('generated_at') or payload.get('generatedAt'),
    }
    return trimmed


def _build_embedded_validation_manifest() -> dict:
    current_build_id = _current_app_build_id()
    artifacts = {}
    artifact_availability = {}
    artifact_digests = {}
    source_generated_ats = []

    for relpath, spec in EMBEDDED_VALIDATION_ARTIFACTS.items():
        filename = spec['filename']
        payload = _load_json_if_exists(BENCHMARKS_DIR / filename)
        available = isinstance(payload, dict)
        reason = None
        if available:
            artifact_build_id = payload.get('app_build_id')
            if current_build_id and artifact_build_id and str(artifact_build_id) != str(current_build_id):
                available = False
                reason = f'build_id_mismatch:{artifact_build_id}'
        else:
            reason = 'missing'

        artifact_availability[relpath] = {
            'available': available,
            'reason': reason,
        }
        if not available or not isinstance(payload, dict):
            continue

        trimmed = _trim_validation_artifact(relpath, payload, spec['summary_only'])
        source_generated_at = payload.get('generated_at') or payload.get('generatedAt')
        if isinstance(source_generated_at, str) and source_generated_at:
            source_generated_ats.append(source_generated_at)
        digest = _sha256_hex(_stable_json_dumps(trimmed))
        artifact_digests[relpath] = {
            'algorithm': 'SHA-256',
            'digest': digest,
            'summary_only': bool(spec['summary_only']),
            'source_filename': filename,
            'source_generated_at': source_generated_at,
        }
        artifacts[relpath] = trimmed

    generated_at = max(source_generated_ats) if source_generated_ats else None
    core = {
        'format': 'ipd_validation_manifest_v1',
        'generated_at': generated_at,
        'app_build_id': current_build_id,
        'artifact_availability': artifact_availability,
        'artifact_digests': artifact_digests,
        'artifacts': artifacts,
    }
    core['integrity_signature'] = {
        'type': 'stable-json-digest',
        'algorithm': 'SHA-256',
        'signer': 'IPD Meta-Analysis Pro build pipeline',
        'digest': _sha256_hex(_stable_json_dumps(core)),
    }
    return core


def _render_embedded_validation_module() -> str:
    manifest = _build_embedded_validation_manifest()
    manifest_json = json.dumps(manifest, indent=2, ensure_ascii=False)
    return (
        '// Generated by dev/build.py. Do not edit manually.\n'
        '(function() {\n'
        f'  const IPD_EMBEDDED_VALIDATION_MANIFEST = {manifest_json};\n'
        "  if (typeof window !== 'undefined') {\n"
        '    window.__IPD_EMBEDDED_VALIDATION_MANIFEST__ = IPD_EMBEDDED_VALIDATION_MANIFEST;\n'
        '    window.__IPD_EMBEDDED_BENCHMARK_ARTIFACTS__ = IPD_EMBEDDED_VALIDATION_MANIFEST.artifacts || {};\n'
        '  }\n'
        '})();\n'
    )


def _ensure_generated_modules() -> None:
    EMBEDDED_VALIDATION_MODULE.parent.mkdir(parents=True, exist_ok=True)
    content = _render_embedded_validation_module()
    existing = EMBEDDED_VALIDATION_MODULE.read_text(encoding='utf-8') if EMBEDDED_VALIDATION_MODULE.exists() else None
    if existing == content:
        return
    with open(EMBEDDED_VALIDATION_MODULE, 'w', encoding='utf-8', newline='\n') as f:
        f.write(content)


def _render_manifest(manifest: dict) -> str:
    _ensure_generated_modules()
    output_parts = []
    for fname in manifest['order']:
        fpath = MODULES_DIR / fname
        if not fpath.exists():
            print(f"WARNING: {fname} not found, skipping")
            continue
        with open(fpath, 'r', encoding='utf-8') as f:
            content = f.read()

        if fname.endswith('.js'):
            output_parts.append(f'<script>{content}</script>')
        else:
            output_parts.append(content)

    output_parts.append(manifest.get('tail', '</body>\n</html>'))
    return '\n'.join(output_parts)


def _first_diff_line(expected: str, actual: str) -> tuple[int, str, str] | None:
    expected_lines = expected.splitlines()
    actual_lines = actual.splitlines()
    max_len = max(len(expected_lines), len(actual_lines))
    for idx in range(max_len):
        exp = expected_lines[idx] if idx < len(expected_lines) else ''
        act = actual_lines[idx] if idx < len(actual_lines) else ''
        if exp != act:
            return idx + 1, exp, act
    return None


def split_command(force: bool = False):
    """Recovery-only: regenerate modules from a trusted HTML artifact."""
    if not force:
        print(
            "split is retired. dev/modules is the authoritative source.\n"
            "Use `python dev/build.py build` after module edits, or run\n"
            "`python dev/build.py bootstrap-from-html --force` only when you\n"
            "intentionally need to recover modules from a trusted HTML artifact."
        )
        sys.exit(1)

    content = read_html()
    MODULES_DIR.mkdir(parents=True, exist_ok=True)
    _cleanup_generated_modules()

    # Separate HTML/CSS head from script content
    script_match = re.search(r'<script>(.*?)</script>\s*</body>', content, re.DOTALL)
    if not script_match:
        # Try finding the first <script> tag that's inline (no src)
        parts = re.split(r'(<script(?:\s[^>]*)?>)', content)
        # Find inline script blocks
        inline_scripts = []
        for i, part in enumerate(parts):
            if part.startswith('<script') and 'src=' not in part and i + 1 < len(parts):
                inline_scripts.append((i, parts[i + 1].rstrip('</script>')))

        if not inline_scripts:
            print("ERROR: Could not find inline <script> blocks")
            sys.exit(1)

    # Extract everything before first inline script as "head"
    first_script_pos = content.find('<script>')
    if first_script_pos == -1:
        # Look for script tags with just whitespace before them
        first_script_pos = content.find('\n<script>')

    # Find all inline script blocks
    script_blocks = []
    pos = 0
    head_html = ''
    tail_html = ''

    # Simple approach: extract between <body> open and </body>
    body_start = content.find('<body>')
    body_end = content.rfind('</body>')

    head_html = content[:body_start + 6] if body_start >= 0 else ''
    tail_html = content[body_end:] if body_end >= 0 else '</body>\n</html>'
    body_content = content[body_start + 6:body_end] if body_start >= 0 and body_end >= 0 else content

    # Split body into HTML chunks and script chunks
    # Find all <script>...</script> pairs
    chunks = []
    last_end = 0
    for m in re.finditer(r'<script>(.*?)</script>', body_content, re.DOTALL):
        # HTML before this script
        html_before = body_content[last_end:m.start()]
        if html_before.strip():
            chunks.append(('html', html_before))
        chunks.append(('script', m.group(1)))
        last_end = m.end()

    # Any HTML after last script
    remaining = body_content[last_end:]
    if remaining.strip():
        chunks.append(('html', remaining))

    # Save head
    with open(MODULES_DIR / '00_head.html', 'w', encoding='utf-8') as f:
        f.write(head_html)

    # Save chunks
    manifest = {'order': ['00_head.html'], 'tail': tail_html}
    for i, (chunk_type, chunk_content) in enumerate(chunks, 1):
        if chunk_type == 'html':
            fname = f'{i:02d}_body_html.html'
            with open(MODULES_DIR / fname, 'w', encoding='utf-8') as f:
                f.write(chunk_content)
            manifest['order'].append(fname)
            continue

        for fname, script_chunk in _split_script_block(chunk_content, i):
            with open(MODULES_DIR / fname, 'w', encoding='utf-8') as f:
                f.write(script_chunk)
            manifest['order'].append(fname)

    # Save manifest
    with open(MANIFEST_FILE, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)

    print(f"Split into {len(chunks) + 1} files in {MODULES_DIR}/")
    print(f"Manifest: {MANIFEST_FILE}")
    for fname in manifest['order']:
        fpath = MODULES_DIR / fname
        size = fpath.stat().st_size if fpath.exists() else 0
        print(f"  {fname:40s} {size:>10,} bytes")


def build_command():
    """Reassemble modules into the monolith."""
    manifest = _load_manifest()
    output = _render_manifest(manifest)

    # Write output
    with open(HTML_FILE, 'w', encoding='utf-8') as f:
        f.write(output)

    size = HTML_FILE.stat().st_size
    print(f"Built {HTML_FILE} ({size:,} bytes)")


def verify_command():
    """Fail if the rendered module manifest differs from the checked-in HTML."""
    manifest = _load_manifest()
    expected = _render_manifest(manifest)
    actual = read_html()

    if expected == actual:
        print("Manifest and ipd-meta-pro.html are in sync.")
        return

    diff = _first_diff_line(expected, actual)
    if diff:
        line_no, exp, act = diff
        print(f"Out of sync at line {line_no}:")
        print(f"  expected: {exp[:180]}")
        print(f"  actual:   {act[:180]}")
    else:
        print("Manifest and ipd-meta-pro.html differ.")
    sys.exit(1)


def stats_command():
    """Show statistics about the current HTML file."""
    content = read_html()
    lines = content.count('\n') + 1
    size = len(content.encode('utf-8'))

    # Count functions
    funcs = len(re.findall(r'function\s+\w+\s*\(', content))
    arrow_funcs = len(re.findall(r'=>\s*\{', content))
    try_catch = len(re.findall(r'\btry\s*\{', content))
    math_random = len(re.findall(r'Math\.random\(\)', content))
    seeded_rng = len(re.findall(r'SeededRNG|createSeededRNG', content))
    plot_defaults = len(re.findall(r'PlotDefaults\.\w+\(\)', content))
    inline_margins = len(re.findall(r'const margin = \{ top:', content))

    print(f"IPD-Meta-Pro Statistics")
    print(f"{'=' * 40}")
    print(f"File size:            {size:>12,} bytes ({size/1024/1024:.2f} MB)")
    print(f"Lines:                {lines:>12,}")
    print(f"Named functions:      {funcs:>12,}")
    print(f"Arrow functions:      {arrow_funcs:>12,}")
    print(f"Try-catch blocks:     {try_catch:>12,}")
    print(f"Math.random() calls:  {math_random:>12,}")
    print(f"SeededRNG references: {seeded_rng:>12,}")
    print(f"PlotDefaults usage:   {plot_defaults:>12,}")
    print(f"Inline margins left:  {inline_margins:>12,}")


def minify_command():
    """Basic minification: strip JS comments and excess whitespace."""
    content = read_html()
    original_size = len(content.encode('utf-8'))

    # Strip single-line JS comments (careful not to strip URLs)
    content = re.sub(r'(?<!:)//(?!.*(?:http|src|cdn|onerror)).*?$', '', content, flags=re.MULTILINE)

    # Collapse multiple blank lines
    content = re.sub(r'\n{3,}', '\n\n', content)

    # Strip trailing whitespace
    content = re.sub(r'[ \t]+$', '', content, flags=re.MULTILINE)

    new_size = len(content.encode('utf-8'))
    savings = original_size - new_size

    with open(HTML_FILE, 'w', encoding='utf-8') as f:
        f.write(content)

    print(f"Minified: {original_size:,} -> {new_size:,} bytes (saved {savings:,} bytes, {100*savings/original_size:.1f}%)")


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(0)

    cmd = sys.argv[1].lower()
    args = sys.argv[2:]
    force = '--force' in args
    if cmd == 'split':
        split_command(force=False)
    elif cmd in ('bootstrap-from-html', 'bootstrap'):
        split_command(force=force)
    elif cmd == 'build':
        build_command()
    elif cmd == 'verify':
        verify_command()
    elif cmd == 'stats':
        stats_command()
    elif cmd == 'minify':
        minify_command()
    else:
        print(f"Unknown command: {cmd}")
        print("Valid commands: build, verify, bootstrap-from-html, stats, minify")
        sys.exit(1)
