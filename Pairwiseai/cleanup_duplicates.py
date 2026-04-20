#!/usr/bin/env python3
"""
Remove duplicate functions from TruthCert-PairwisePro-v1.0-bundle.html
Keeps the better (more complete) version of each duplicate function.
"""
import re

def find_function_end(content, start_pos):
    """Find the closing brace of a function starting at start_pos."""
    brace_count = 0
    i = start_pos
    in_string = False
    string_char = None

    while i < len(content):
        char = content[i]

        # Handle string literals
        if char in '"\'`' and (i == 0 or content[i-1] != '\\'):
            if not in_string:
                in_string = True
                string_char = char
            elif char == string_char:
                in_string = False
                string_char = None

        if not in_string:
            if char == '{':
                brace_count += 1
            elif char == '}':
                brace_count -= 1
                if brace_count == 0:
                    return i + 1
        i += 1
    return i

def remove_function(content, func_name, line_number):
    """Remove a function definition starting near line_number."""
    lines = content.split('\n')

    # Find the exact start position
    char_pos = sum(len(line) + 1 for line in lines[:line_number-1])

    # Find function start pattern
    pattern = rf'^function {func_name}\s*\('

    # Search near the line number
    search_start = max(0, char_pos - 100)
    search_region = content[search_start:char_pos + 500]

    match = re.search(pattern, search_region, re.MULTILINE)
    if not match:
        print(f"  Warning: Could not find function {func_name} near line {line_number}")
        return content

    func_start = search_start + match.start()
    func_end = find_function_end(content, func_start)

    # Get the function text for logging
    func_text = content[func_start:func_end]
    line_count = func_text.count('\n') + 1

    print(f"  Removing {func_name} at position {func_start} ({line_count} lines)")

    # Remove the function (and any trailing newlines)
    while func_end < len(content) and content[func_end] == '\n':
        func_end += 1

    return content[:func_start] + content[func_end:]

def main():
    input_file = r'C:\Truthcert1\TruthCert-PairwisePro-v1.0-bundle.html'

    print("Reading file...")
    with open(input_file, 'r', encoding='utf-8') as f:
        content = f.read()

    original_size = len(content)
    print(f"Original size: {original_size:,} bytes")

    # Duplicates to remove (line numbers of the version to REMOVE)
    # Format: (function_name, line_number_to_remove, reason)
    duplicates_to_remove = [
        # qchisq: Keep line 4825 (Newton-Raphson, more robust), remove line 19272
        ('qchisq', 19272, 'simpler approximation'),

        # copasSelectionModel: Keep line 19125 (has grid search params), remove line 10337
        ('copasSelectionModel', 10337, 'less complete version'),

        # profileLikelihoodTau2CI: Keep line 19214 (has alpha param), remove line 15135
        ('profileLikelihoodTau2CI', 15135, 'less complete version'),

        # generateGRADESummary: Keep line 20210 (has 2 params), remove line 14397
        ('generateGRADESummary', 14397, 'single param version'),

        # calculateICER: Keep line 24356 (has options object), remove line 15668
        ('calculateICER', 15668, 'simple 2-param version'),

        # cumulativeByPrecision: Keep line 25234 (has names param), remove line 15112
        ('cumulativeByPrecision', 15112, 'no names param'),

        # renderCumulativePlot: Keep line 25259 (has title param), remove line 13840
        ('renderCumulativePlot', 13840, 'no title param'),

        # runSimplifiedMA: Keep line 24865, remove line 26156 (duplicate at end)
        ('runSimplifiedMA', 26156, 'duplicate at end of file'),

        # runValidation: Keep line 9580 (has parameter), remove line 20299 (no params)
        ('runValidation', 20299, 'no params version'),
    ]

    # Sort by line number descending (remove from end first to preserve line numbers)
    duplicates_to_remove.sort(key=lambda x: x[1], reverse=True)

    print(f"\nRemoving {len(duplicates_to_remove)} duplicate functions...")

    for func_name, line_num, reason in duplicates_to_remove:
        print(f"\n  {func_name} (line ~{line_num}): {reason}")
        content = remove_function(content, func_name, line_num)

    new_size = len(content)
    removed = original_size - new_size
    print(f"\nNew size: {new_size:,} bytes (removed {removed:,} bytes)")

    # Write back
    print(f"\nWriting cleaned file...")
    with open(input_file, 'w', encoding='utf-8') as f:
        f.write(content)

    print("Done!")

    # Verify no syntax errors by checking for basic structure
    func_count = len(re.findall(r'^function \w+', content, re.MULTILINE))
    print(f"\nRemaining functions: {func_count}")

if __name__ == '__main__':
    main()
