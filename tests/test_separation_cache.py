"""Cache integrity and expiry contracts; GPU timings are measured separately."""
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import time
import unittest
from unittest.mock import patch
import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'rvc-service'))
from app import separation_cache as cache


class SeparationCacheTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.env = patch.dict(os.environ, {'RVC_SEPARATION_CACHE_DIR': str(self.root / 'private-cache')})
        self.env.start()
        self.source = self.root / 'input.wav'
        self.music = self.root / 'music.wav'
        sf.write(self.source, np.linspace(-.1, .1, 44100, dtype='float32'), 44100, subtype='FLOAT')
        sf.write(self.music, np.zeros((44100, 2), dtype='float32'), 44100, subtype='FLOAT')
        self.resource = self.root / 'resource'
        self.resource.write_bytes(b'resource-v1')
        self.key = cache.cache_key(self.source, [self.resource], 'runtime-v1')

    def tearDown(self):
        self.env.stop()
        self.tmp.cleanup()

    def store(self):
        cache.store(self.key, self.source, self.music, 44100)

    def test_lossless_reuse_does_not_alias_mutable_job_stems(self):
        self.store()
        output = self.root / 'job'
        self.assertEqual(cache.restore(self.key, output), 44100)
        self.assertEqual(cache.digest(output / 'vocals.wav'), cache.digest(self.source))
        self.assertEqual(cache.digest(output / 'instrumental.wav'), cache.digest(self.music))
        (output / 'vocals.wav').write_bytes(b'job gain changed')
        self.assertEqual(cache.restore(self.key, self.root / 'next-job'), 44100)

    def test_source_resource_and_runtime_changes_invalidate_reuse(self):
        self.assertNotEqual(self.key, cache.cache_key(self.source, [self.resource], 'runtime-v2'))
        self.resource.write_bytes(b'resource-v2')
        self.assertNotEqual(self.key, cache.cache_key(self.source, [self.resource], 'runtime-v1'))
        self.source.write_bytes(b'different audio')
        self.assertNotEqual(self.key, cache.cache_key(self.source, [self.resource], 'runtime-v2'))

    def test_corruption_and_expiry_are_cache_misses(self):
        self.store()
        entry = cache.cache_root() / self.key
        (entry / 'vocals.wav').write_bytes(b'corrupt')
        self.assertIsNone(cache.restore(self.key, self.root / 'job'))
        self.store()
        manifest = entry / 'manifest.json'
        meta = json.loads(manifest.read_text()); meta['createdAt'] = time.time() - cache.TTL_SECONDS - 1
        manifest.write_text(json.dumps(meta))
        self.assertIsNone(cache.restore(self.key, self.root / 'job'))
        self.assertFalse(entry.exists())

    def test_capacity_is_bounded_and_unrelated_directories_are_preserved(self):
        self.store()
        unrelated = cache.cache_root() / 'keep-user-files'; unrelated.mkdir()
        (unrelated / 'notes.txt').write_text('keep')
        with patch.object(cache, 'MAX_BYTES', 1): cache.cleanup()
        self.assertFalse((cache.cache_root() / self.key).exists())
        self.assertTrue((unrelated / 'notes.txt').is_file())


if __name__ == '__main__': unittest.main()
