"""Verify the actual offline inference pack against its checked-in manifest."""
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1] / 'vendor' / 'semantic'


def test_optional_model_assets_are_complete_and_checksum_pinned():
    manifest = json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8'))
    assert len(manifest['files']) >= 8
    for item in manifest['files']:
        path = (ROOT / item['path']).resolve()
        assert path.is_relative_to(ROOT.resolve())
        data = path.read_bytes()
        assert len(data) == item['bytes'], item['path']
        assert hashlib.sha256(data).hexdigest() == item['sha256'], item['path']
        if 'upstreamSha256' in item:
            assert data.startswith(b'/* sentinel:skip-file')
            assert hashlib.sha256(data.split(b'\n', 1)[1]).hexdigest() == item['upstreamSha256']
