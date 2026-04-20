#!/usr/bin/env python3
"""Fix Selenium test for advanced features menu"""

import sys
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def main():
    filepath = str((__import__('pathlib').Path(__file__).resolve().parent / 'selenium_test.py'))

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Fix advanced features menu test
    old_pattern = '''    def test_advanced_features_menu(self):
        """Test 40+ Advanced Features menu"""
        print("\\n[TEST] Advanced Features Menu")
        try:
            # Look for Advanced Features button
            adv_btn = self.driver.find_elements(By.XPATH, "//button[contains(text(), 'Advanced Features')]")
            if adv_btn:
                adv_btn[0].click()'''

    new_pattern = '''    def test_advanced_features_menu(self):
        """Test 40+ Advanced Features menu"""
        print("\\n[TEST] Advanced Features Menu")
        try:
            # Navigate to data tab first where the button is located
            self.click_element('.nav-tab[data-panel="data"]')
            time.sleep(0.5)

            # Scroll to top
            self.driver.execute_script("window.scrollTo(0, 0);")
            time.sleep(0.3)

            # Look for Advanced Features button
            adv_btn = self.driver.find_elements(By.XPATH, "//button[contains(text(), 'Advanced Features')]")
            if adv_btn:
                # Use JavaScript click to avoid interactability issues
                self.driver.execute_script("arguments[0].click();", adv_btn[0])'''

    if old_pattern in content:
        content = content.replace(old_pattern, new_pattern)
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print("[OK] Fixed advanced features menu test")
    else:
        print("[WARN] Pattern not found - may already be fixed or different")

    print("Done!")

if __name__ == '__main__':
    main()

