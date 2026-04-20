#!/usr/bin/env python3
"""Simple script to replace the Bayesian function"""

# Read the file
with open('C:\\dosehtml\\dose-response-pro-v4.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Read the new function
with open('C:\\dosehtml\\new_bayesian_function.txt', 'r', encoding='utf-8') as f:
    new_function = f.read()

# Find the old function
start_marker = '    // Bayesian Dose-Response Meta-Analysis using MCMC'
start_idx = content.find(start_marker)

if start_idx == -1:
    print("ERROR: Could not find start marker")
    exit(1)

print(f"Found start at position {start_idx}")

# Now find the end by looking for the pattern after the function
# The function ends with "    }\n" followed by "    // Helper: Initialize beta"
search_from = start_idx + len(start_marker)
end_pattern = '    }\n    // Helper: Initialize beta'
end_idx = content.find(end_pattern, search_from)

if end_idx == -1:
    print("ERROR: Could not find end pattern")
    # Try alternative pattern
    end_pattern = '    }\r\n    // Helper: Initialize beta'
    end_idx = content.find(end_pattern, search_from)
    if end_idx == -1:
        print("ERROR: Could not find end pattern (tried both LF and CRLF)")
        exit(1)

print(f"Found end at position {end_idx}")

# The function includes the closing brace
end_idx = end_idx + 4  # Include "    }"

# Extract old function for comparison
old_function = content[start_idx:end_idx]
print(f"Old function length: {len(old_function)} chars")
print(f"New function length: {len(new_function)} chars")

# Replace
new_content = content[:start_idx] + new_function + content[end_idx:]

# Write back
with open('C:\\dosehtml\\dose-response-pro-v4.html', 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Successfully replaced the function!")
