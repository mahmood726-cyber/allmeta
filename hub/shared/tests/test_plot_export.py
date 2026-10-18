"""Decode a freshly produced JS TIFF; no checked-in binary or browser needed."""
import subprocess
from pathlib import Path

import pytest


@pytest.mark.parametrize('dpi', [300, 600])
def test_produced_tiff_pillow(tmp_path, dpi):
    image_module = pytest.importorskip('PIL.Image')
    module = Path(__file__).resolve().parents[1] / 'plot-export.js'
    out = tmp_path / 'produced.tiff'
    js = '''
const fs = require('node:fs'), vm = require('node:vm');
global.window = {}; global.document = { currentScript: null };
vm.runInThisContext(fs.readFileSync(process.argv[1], 'utf8'));
const rgb = new Uint8Array(17 * 9 * 3).fill(255);
fs.writeFileSync(process.argv[2], window.alm.plotExport._tiff(rgb, 17, 9, Number(process.argv[3])));
'''
    subprocess.run(['node', '-e', js, str(module), str(out), str(dpi)], check=True)
    with image_module.open(out) as image:
        image.load()
        assert image.size == (17, 9)
        assert image.mode == 'RGB'
        assert image.info['compression'] == 'tiff_lzw'
        assert image.info['dpi'] == (dpi, dpi)
        assert image.getpixel((0, 0)) == (255, 255, 255)
