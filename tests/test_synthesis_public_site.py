import unittest
from pathlib import Path
from hashlib import sha256
import re
ROOT=Path(__file__).resolve().parents[1]
class SiteTests(unittest.TestCase):
    def test_prompt_exists_and_is_full(self):
        p=(ROOT/'prompt-v1.2.txt').read_text()
        for term in ('Role and objective','Pass A','Pass B','Pass C','Pass D','Pass E','Pass F','Pass G','evidence floor','Evaluation instruction'):
            self.assertIn(term,p)
    def test_source_integrity(self):
        p=(ROOT/'prompt-v1.2.txt').read_bytes()
        page=(ROOT/'index.html').read_text()
        self.assertIn(sha256(p).hexdigest(),page)
        self.assertIn('Role and objective',page)
    def test_no_source_leakage_or_external_script(self):
        page=(ROOT/'index.html').read_text()
        self.assertNotIn('mail.google.com',page)
        self.assertNotIn('mahmood726@gmail.com',page)
        self.assertIn('<textarea id="fullPrompt" hidden readonly>',page)
        self.assertNotIn('<form',page.lower())
        self.assertIsNone(re.search(r'<script[^>]+src=',page,re.I))
        self.assertIn('Content-Security-Policy',page)
    def test_precise_labels(self):
        page=(ROOT/'index.html').read_text()
        self.assertIn('not a newly trained model',page)
        self.assertIn('false-positive rate',page)
        self.assertIn('No NHS endorsement',page)
if __name__=='__main__':unittest.main()
