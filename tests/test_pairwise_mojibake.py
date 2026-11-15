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


# ---------------------------------------------------------------------------------------------------------------
# Lane mojifix (2026-11-15): the NON-'Ã' damage in the same files, and the -min builds.
#
# Root cause (worked out against the clean copies in Pairwiseai/_archive, e.g. ...bundle.backup-20260118-215949.html):
# the text went UTF-8 -> cp1252 once and, in most regions, twice; afterwards a partial repair mapped some of the
# second layer back ('Ã'+x -> x, 'Â'+printable -> x, 'â€œ' -> '“', 'â€'+c -> '”'+c, curly single quotes -> ASCII ').
# What was left is a mix of first-layer mojibake ('Î¼' for μ, 'â€“' for –) and unrepaired second-layer pieces
# ('Å¸' for Ÿ, 'Å“' for œ, 'Ë†' for ˆ, 'Â'+C1 control), e.g. '🔬' (F0 9F 94 AC) became 'ðŸ”¬' and then 'ðÅ¸”¬'.
# The page's normalizeMojibakeInDOM cannot undo these: it re-encodes a whole text node and gives up as soon as the
# bytes are not valid UTF-8, which they never are for the partial second layer ('ð' followed by 'Å' = F0 C5).
# app.min.js and its inline -dist / -min builds carried the same strings with the second layer unrepaired ('Ã'+x).
# Every repaired sequence was checked against the clean archive copies (same text with 12 ASCII characters of
# context either side); the handful not present there were decided from the code around them.
# ---------------------------------------------------------------------------------------------------------------
ALL_FILES = FILES + ['Pairwiseai/app.min.js', 'Pairwiseai/TruthCert-PairwisePro-v1.0-dist.html',
                     'Pairwiseai/TruthCert-PairwisePro-v1.0-min.html']
_CP1252_CONT = ('\u0080-¿ŒœŠšŸŽžƒˆ˜–—'
                '‘-„†-•…‰‹›€™')
# a UTF-8 lead byte (C2-F4) shown as its cp1252 character, followed by a continuation byte shown the same way:
# 'Å¸', 'â€', 'Î¼', 'Ã©', 'Â\x8f' ... No legitimate text in these files has that shape (zero hits after the repair).
SIG = re.compile('[Â-ô][' + _CP1252_CONT + ']')
GARBLED_2 = [
    'ðÅ¸', 'âÅ', 'âË', 'â”', 'âÂ', 'Ì”š', 'Î´', 'Î¼', 'Î»', '””', 'ï¸Â',
    'ðÅ¸”¬ Run Full Analysis', 'âÅ¸³', 'âÅ““', 'âÅ“””', 'âÅ¡ ï¸Â', 'â”°¥', 'â”°¤', 'â€“', 'â€”',
    'Ã\u008f„Â²',     # τ² in the -min builds
]
RESTORED_2 = {
    'Pairwiseai/TruthCert-PairwisePro-v1.0-bundle.html': [
        '"🔬 Run Full Analysis"', '<span class="btn-spinner">⟳</span> Computing...',
        '💊 Number Needed to Treat (NNT)', '🔄 Leave-One-Out Summary', '"lower"===a.direction?"↓":"↑"',
        "console.log('✗ Mantel-Haenszel OR: FAIL", "'D = (zα/2 + zβ)² / δ²'", 'Bartoš et al.',
        'replace(/[‐–—]/g, "-")', '<span class="alert__icon">⚠️</span>'],
    'Pairwiseai/app.js': [
        '"🔬 Run Full Analysis"', '<span class="btn-spinner">⟳</span> Computing...',
        '💊 Number Needed to Treat (NNT)', '🔄 Leave-One-Out Summary', "'D = (zα/2 + zβ)² / δ²'", 'Bartoš et al.'],
    'Pairwiseai/app.min.js': [
        '"🔬 Run Full Analysis"', '<span class="btn-spinner">⟳</span> Computing...',
        '💊 Number Needed to Treat (NNT)', '🔄 Leave-One-Out Summary', 'replace(/[‐–—]/g,"-")', 'Bartoš et al.',
        'σ̃² = 4/ñ'],
    'Pairwiseai/TruthCert-PairwisePro-v1.0-dist.html': [
        '"🔬 Run Full Analysis"', '<span class="btn-spinner">⟳</span> Computing...',
        '💊 Number Needed to Treat (NNT)', '🔄 Leave-One-Out Summary', 'Bartoš et al.', 'σ̃² = 4/ñ'],
    'Pairwiseai/TruthCert-PairwisePro-v1.0-min.html': [
        '"🔬 Run Full Analysis"', '<span class="btn-spinner">⟳</span> Computing...',
        '💊 Number Needed to Treat (NNT)', '🔄 Leave-One-Out Summary', 'Bartoš et al.', 'σ̃² = 4/ñ'],
}


@pytest.mark.parametrize('rel', ALL_FILES)
def test_no_utf8_as_cp1252_signature(rel):
    text = (ROOT / rel).read_text(encoding='utf-8')
    hits = sorted({text[max(0, m.start() - 10):m.end() + 6] for m in SIG.finditer(text)})
    assert not hits, f'{rel}: {len(hits)} mojibake sequence(s), e.g. {hits[:8]}'


@pytest.mark.parametrize('rel', ALL_FILES)
def test_no_partial_second_layer_strings(rel):
    text = (ROOT / rel).read_text(encoding='utf-8')
    back = {g: text.count(g) for g in GARBLED_2 if g in text}
    assert not back, f'{rel}: garbled strings present: {back}'


@pytest.mark.parametrize('rel', ALL_FILES)
def test_restored_symbols_present(rel):
    text = (ROOT / rel).read_text(encoding='utf-8')
    missing = [s for s in RESTORED_2[rel] if s not in text]
    assert not missing, f'{rel}: missing {missing}'
