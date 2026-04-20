#!/usr/bin/env python3
"""
Script to update sensitivity analysis functions in the HTML file
"""

import re

# Read the HTML file
with open(r'C:\dosehtml\dose-response-pro-v4-light.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the sensitivity analysis section
pattern = r'    // =============================================\n    // SENSITIVITY ANALYSIS\n    // =============================================\n\n    function runSensitivityAnalysis\(\) \{.*?\n    \}\n'

# This is complex - let's create a simpler marker-based replacement
# First, let's find where to insert the new functions

marker = '// =============================================\n    // SENSITIVITY ANALYSIS\n    // ============================================='

if marker in content:
    # Find the position
    pos = content.find(marker)

    # Find the end of the sensitivity analysis section (next major section)
    next_section = '    // =============================================\n    // SUBGROUP ANALYSIS'
    next_pos = content.find(next_section, pos)

    if next_pos > pos:
        # Extract the section to replace
        old_section = content[pos:next_pos]

        # Read the new functions from the patch file
        with open(r'C:\dosehtml\sensitivity_analysis_patch.txt', 'r', encoding='utf-8') as f:
            new_functions = f.read()

        # Create the new section
        new_section = marker + '\n' + new_functions + '\n'

        # Replace
        new_content = content[:pos] + new_section + content[next_pos:]

        # Write back
        with open(r'C:\dosehtml\dose-response-pro-v4-light.html', 'w', encoding='utf-8') as f:
            f.write(new_content)

        print("Successfully updated sensitivity analysis functions!")
    else:
        print("Could not find the end of sensitivity analysis section")
else:
    print("Could not find sensitivity analysis marker")
