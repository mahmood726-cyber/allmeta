#!/usr/bin/env python3
"""Fix escaped backticks and dollar signs in the HTML file."""

def main():
    input_file = r'C:\Truthcert1\TruthCert-PairwisePro-v1.0-bundle.html'

    print("Reading file...")
    with open(input_file, 'r', encoding='utf-8') as f:
        content = f.read()

    # Count occurrences
    count1 = content.count('\\`')
    count2 = content.count('\\$')
    print(f"Found {count1} escaped backticks and {count2} escaped dollar signs")

    # Fix escaped backticks and dollar signs
    content = content.replace('\\`', '`')
    content = content.replace('\\$', '$')

    # Write back
    print("Writing fixed file...")
    with open(input_file, 'w', encoding='utf-8') as f:
        f.write(content)

    print("Done!")

if __name__ == '__main__':
    main()
