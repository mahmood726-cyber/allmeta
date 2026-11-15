r"""No damaged >= / <= signs in the shipped app code.

Root cause of 'Need =3 studies' (nma-pro-v2/nma-pro-v8.0.html, present since the import commit 85ffdd68): the
file had been converted to Windows-1252 with "best fit" mapping at some point before import. Best fit
(WideCharToMultiByte(1252) without WC_NO_BEST_FIT_CHARS) has no slot for U+2265 or U+2264 and maps BOTH to '='
(checked on this machine: 0x2265 -> b'=', 0x2264 -> b'='), so every ">= k" message became "= k". The code next to
each message says which sign was meant (n<10 -> 'Need >=10', n1<1 -> 'must be >=1').
A second class lives in Pairwiseai/app.min.js and its -dist / -min builds: UTF-8 >= / <= decoded as cp1252, i.e.
the mojibake 'â‰¥' / 'â‰¤'.
This test fails on either signature in the listed files and pins the corrected messages.
"""
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
GE, LE = chr(0x2265), chr(0x2264)
MOJIBAKE = [GE.encode('utf-8').decode('cp1252'), LE.encode('utf-8').decode('cp1252')]   # 'â‰¥', 'â‰¤'
BEST_FIT = re.compile(r'(?:must be|should be|Need|need|at least|[Rr]equires?|[Mm]inimum|[Mm]aximum) =\d')
FILES = ['nma-pro-v2/nma-pro-v8.0.html', 'Pairwiseai/app.min.js',
         'Pairwiseai/TruthCert-PairwisePro-v1.0-dist.html', 'Pairwiseai/TruthCert-PairwisePro-v1.0-min.html']


@pytest.mark.parametrize('rel', FILES)
def test_no_best_fit_equals_for_ge_le(rel):
    text = (ROOT / rel).read_text(encoding='utf-8')
    hits = [m.group(0) for m in BEST_FIT.finditer(text)]
    assert not hits, f'{rel}: >=/<= flattened to "=" by cp1252 best fit: {hits}'


@pytest.mark.parametrize('rel', FILES)
def test_no_utf8_as_cp1252_mojibake_for_ge_le(rel):
    text = (ROOT / rel).read_text(encoding='utf-8')
    hits = {m: text.count(m) for m in MOJIBAKE if m in text}
    assert not hits, f'{rel}: mojibake for >=/<=: {hits}'


def test_nma_pro_messages_say_at_least():
    text = (ROOT / 'nma-pro-v2/nma-pro-v8.0.html').read_text(encoding='utf-8')
    for msg in ['Need ' + GE + '3 studies', 'Need ' + GE + '10 studies', 'N1 must be ' + GE + '1',
                'N2 must be ' + GE + '1', 'Need ' + GE + '3 studies with dose data']:
        assert msg in text, msg
