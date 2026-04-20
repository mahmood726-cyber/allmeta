#!/usr/bin/env python3
# Legacy HTML mutator retired in manifest-first workflow.
raise SystemExit(
    "This script is retired. dev/modules/ is the authoritative source. "
    "Edit the relevant module and run `python dev/build.py build` instead of mutating ipd-meta-pro.html directly."
)

"""
Deduplicate function definitions in ipd-meta-pro.html.

Strategy: For each duplicated function, keep ONLY the LAST definition
(which is typically the most complete/fixed version due to iterative development).
Remove all earlier definitions.

This script:
1. Finds all function definitions matching pattern: function NAME(
2. Groups by function name
3. For functions defined >1 time, removes all but the last occurrence
4. Preserves the file structure otherwise
"""

import re
import sys
from pathlib import Path
from collections import defaultdict

HTML_FILE = Path(__file__).parent.parent / 'ipd-meta-pro.html'

def find_function_end(lines, start_idx):
    """Find the closing brace of a function starting at start_idx."""
    brace_count = 0
    in_string = False
    string_char = None
    escape_next = False

    for i in range(start_idx, len(lines)):
        line = lines[i]
        j = 0
        while j < len(line):
            char = line[j]

            if escape_next:
                escape_next = False
                j += 1
                continue

            if char == '\\':
                escape_next = True
                j += 1
                continue

            if in_string:
                if char == string_char:
                    in_string = False
                j += 1
                continue

            if char in '"\'`':
                in_string = True
                string_char = char
                j += 1
                continue

            # Skip single-line comments
            if char == '/' and j + 1 < len(line) and line[j + 1] == '/':
                break

            # Skip multi-line comment start (simplified)
            if char == '/' and j + 1 < len(line) and line[j + 1] == '*':
                # Find end of comment
                end_comment = line.find('*/', j + 2)
                if end_comment != -1:
                    j = end_comment + 2
                    continue
                else:
                    # Comment continues to next line - simplified handling
                    j += 2
                    continue

            if char == '{':
                brace_count += 1
            elif char == '}':
                brace_count -= 1
                if brace_count == 0:
                    return i

            j += 1

    return len(lines) - 1  # Fallback


def main():
    print(f"Reading {HTML_FILE}...")
    with open(HTML_FILE, 'r', encoding='utf-8') as f:
        content = f.read()

    lines = content.split('\n')

    # Find all named function definitions
    # Pattern: function NAME( at start of line or after whitespace
    func_pattern = re.compile(r'^(\s*)function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(')

    # Map: function_name -> [(start_line_idx, end_line_idx), ...]
    func_locations = defaultdict(list)

    print("Scanning for function definitions...")
    for i, line in enumerate(lines):
        match = func_pattern.match(line)
        if match:
            func_name = match.group(2)
            end_idx = find_function_end(lines, i)
            func_locations[func_name].append((i, end_idx))

    # Find duplicates
    duplicates = {name: locs for name, locs in func_locations.items() if len(locs) > 1}

    if not duplicates:
        print("No duplicate functions found!")
        return

    print(f"\nFound {len(duplicates)} duplicated functions:")
    for name, locs in sorted(duplicates.items()):
        print(f"  {name}: {len(locs)} copies at lines {[l[0]+1 for l in locs]}")

    # Mark lines to delete (all but last occurrence of each duplicate)
    lines_to_delete = set()
    for name, locs in duplicates.items():
        # Keep last, delete all others
        for start_idx, end_idx in locs[:-1]:
            for line_idx in range(start_idx, end_idx + 1):
                lines_to_delete.add(line_idx)

    print(f"\nMarking {len(lines_to_delete)} lines for deletion...")

    # Build new content
    new_lines = []
    deleted_count = 0
    skip_until = -1

    for i, line in enumerate(lines):
        if i in lines_to_delete:
            deleted_count += 1
            continue
        new_lines.append(line)

    # Clean up excessive blank lines (more than 2 consecutive)
    cleaned_lines = []
    blank_count = 0
    for line in new_lines:
        if line.strip() == '':
            blank_count += 1
            if blank_count <= 2:
                cleaned_lines.append(line)
        else:
            blank_count = 0
            cleaned_lines.append(line)

    new_content = '\n'.join(cleaned_lines)

    print(f"Deleted {deleted_count} lines")
    print(f"Original size: {len(content):,} bytes")
    print(f"New size: {len(new_content):,} bytes")
    print(f"Saved: {len(content) - len(new_content):,} bytes")

    # Write output
    backup_file = HTML_FILE.with_suffix('.html.bak')
    print(f"\nBacking up to {backup_file}...")
    with open(backup_file, 'w', encoding='utf-8') as f:
        f.write(content)

    print(f"Writing deduplicated file to {HTML_FILE}...")
    with open(HTML_FILE, 'w', encoding='utf-8') as f:
        f.write(new_content)

    print("Done!")

    # Verify
    print("\nVerifying no duplicates remain...")
    with open(HTML_FILE, 'r', encoding='utf-8') as f:
        verify_content = f.read()
    verify_lines = verify_content.split('\n')

    func_counts = defaultdict(int)
    for line in verify_lines:
        match = func_pattern.match(line)
        if match:
            func_counts[match.group(2)] += 1

    remaining_dups = {n: c for n, c in func_counts.items() if c > 1}
    if remaining_dups:
        print(f"WARNING: {len(remaining_dups)} functions still duplicated:")
        for name, count in remaining_dups.items():
            print(f"  {name}: {count}x")
    else:
        print("All duplicates removed successfully!")


if __name__ == '__main__':
    main()
