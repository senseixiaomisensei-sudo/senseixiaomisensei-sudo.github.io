"""Readiness must reflect verified data and synthesis, never a package import."""
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'rvc-service'))
from app import tts_runtime as t


class TtsRuntimeTest(unittest.TestCase):
    def test_corruption_never_enables_tts(self):
        with tempfile.TemporaryDirectory() as temporary, patch.object(t, 'ROOT', Path(temporary)), patch.object(t, '_state', {'state':'not-installed','ready':False}):
            model=t.ROOT/t.MODEL_ID;model.mkdir()
            hashes={name:hashlib.sha256(name.encode()).hexdigest() for name in t.FILES}
            for name in t.FILES: (model/name).write_text(name)
            (model/'installed.json').write_text(json.dumps({'archiveSha256':t.ARCHIVE_SHA256,'files':hashes}))
            (model/'model.onnx').write_text('corrupt')
            with patch.object(t, '_build') as build:
                self.assertFalse(t.status()['ready']);build.assert_not_called()

    def test_synthesis_probe_failure_is_not_ready(self):
        with tempfile.TemporaryDirectory() as temporary, patch.object(t, 'ROOT', Path(temporary)), patch.object(t, '_state', {'state':'not-installed','ready':False}):
            model=t.ROOT/t.MODEL_ID;model.mkdir()
            hashes={name:hashlib.sha256(name.encode()).hexdigest() for name in t.FILES}
            for name in t.FILES: (model/name).write_text(name)
            (model/'installed.json').write_text(json.dumps({'archiveSha256':t.ARCHIVE_SHA256,'files':hashes}))
            with patch.object(t,'_build',side_effect=RuntimeError('failed real probe')):
                self.assertFalse(t.status()['ready'])

    def test_wrong_download_hash_cannot_be_extracted(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder=Path(temporary);archive=folder/'data.tar';archive.write_bytes(b'untrusted')
            with self.assertRaisesRegex(ValueError,'RVC_TTS_DOWNLOAD_INVALID'):t.extract_verified(archive,folder)
            self.assertEqual([p.name for p in folder.iterdir()],['data.tar'])

    def test_repeated_install_joins_existing_download(self):
        with patch.object(t,'_state',{'state':'downloading','ready':False}),patch.object(t.threading,'Thread') as thread:
            t.install();t.install();thread.assert_not_called()

if __name__=='__main__': unittest.main()
