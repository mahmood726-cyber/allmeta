"""UTF-8 text decoded as Windows-1252 ('Ã'-marker mojibake) in the live Pairwise page and its app.js.

Before lane aitems (2026-11-15) the bundle (Pairwiseai/TruthCert-PairwisePro-v1.0-bundle.html, served via
Pairwiseai/main-screen.html) had 23 such sequences and app.js 18, all genuine damage, none a legitimate character:
L'AbbÃ© (L'Abbé plot title, errors and log lines), RÃ¼cker / LÃ³pez-LÃ³pez / fÃ¼r / TrucksÃ¤ss (reference
strings returned by the engine), (Ã±) and 'ÃÆ’ÌÆ’² = 4/Ã±' (n-tilde and sigma-tilde squared), and two comments.
The page's runtime DOM repair (normalizeMojibakeInDOM) hid most of it on screen, but the engine strings
(references in results objects, exports, console) still carried it. Restored at source; this test fails if any
Ã-marker sequence or one of the specific garbled strings comes back, and pins the restored text.
"""
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
FILES = ['Pairwiseai/TruthCert-PairwisePro-v1.0-bundle.html', 'Pairwiseai/app.js']
MARK = re.compile('Ã[\u0080-¿‘-›Œ-Ÿ]')
GARBLED = ['AbbÃ©', 'RÃ¼cker', 'LÃ³pez', 'fÃ¼r', 'TrucksÃ¤ss',
           'GÃ¶tz', '(Ã±)', '4/Ã±', 'Î¦(mu', "ABBÃ”°"]
RESTORED = {
    'Pairwiseai/TruthCert-PairwisePro-v1.0-bundle.html': [
        "L\\'Abbé Plot", 'Rücker et al. (2011)', 'López-López et al. (2014)',
        'Zeitschrift für Psychologie', 'Schmidt-Trucksäss (2019)', 'Effective sample size (ñ)',
        'Approximation: σ̃² = 4/ñ'],
    'Pairwiseai/app.js': [
        "L\\'Abbé Plot", 'López-López et al. (2014)', 'Effective sample size (ñ)',
        'Approximation: σ̃² = 4/ñ'],
}


@pytest.mark.parametrize('rel', FILES)
def test_no_atilde_mojibake(rel):
    text = (ROOT / rel).read_text(encoding='utf-8')
    hits = sorted({text[m.start() - 12:m.end() + 6] for m in MARK.finditer(text)})
    assert not hits, f'{rel}: {len(hits)} mojibake sequence(s): {hits[:10]}'
    back = [g for g in GARBLED if g in text]
    assert not back, f'{rel}: garbled strings present: {back}'


@pytest.mark.parametrize('rel', FILES)
def test_restored_text_present(rel):
    text = (ROOT / rel).read_text(encoding='utf-8')
    missing = [s for s in RESTORED[rel] if s not in text]
    assert not missing, f'{rel}: missing {missing}'
