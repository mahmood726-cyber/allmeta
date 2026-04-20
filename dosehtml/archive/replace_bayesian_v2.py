#!/usr/bin/env python3
"""Script to fix the Bayesian MCMC function in dose-response-pro-v4.html"""

# Read the file
with open('C:\\dosehtml\\dose-response-pro-v4.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find the start and end of the function
start_line = None
end_line = None

for i, line in enumerate(lines):
    if '    // Bayesian Dose-Response Meta-Analysis using MCMC' in line:
        start_line = i
        # Now look for the closing brace that ends the function
        # It should be followed by a comment about initializeBeta
        for j in range(i + 1, min(i + 500, len(lines))):
            if lines[j].strip() == '    }' and j + 1 < len(lines):
                # Check if the next line is the initializeBeta comment
                if '    // Helper: Initialize beta using OLS' in lines[j + 1] or \
                   '    // Helper: Initialize beta' in lines[j + 1]:
                    end_line = j
                    break
        break

if start_line is None or end_line is None:
    print(f"ERROR: Could not find function boundaries. start_line={start_line}, end_line={end_line}")
    # Print some context for debugging
    for i, line in enumerate(lines[3545:3580], start=3546):
        print(f"{i}: {line.rstrip()}")
    exit(1)

print(f"Found function from line {start_line + 1} to {end_line + 1}")

# Read the new function from a file
new_function = open('C:\\dosehtml\\new_bayesian_function.txt', 'r', encoding='utf-8').read()

# Replace the function
new_lines = lines[:start_line] + [new_function + '\n'] + lines[end_line + 1:]

# Write back
with open('C:\\dosehtml\\dose-response-pro-v4.html', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print(f"Successfully replaced function!")
print(f"Old function was {end_line - start_line + 1} lines")
print(f"New function is {len(new_function.split(chr(10)))} lines")
