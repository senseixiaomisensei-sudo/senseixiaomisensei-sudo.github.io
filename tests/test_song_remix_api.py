import asyncio
import tempfile
import unittest
import uuid
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch

import numpy as np
import soundfile as sf
from fastapi import HTTPException
from starlette.requests import Request

import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "rvc-service"))
from app import main


class RemixApiTests(unittest.TestCase):
    def test_authorized_remix_reuses_stems_and_updates_both_preview_and_export(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            job_id = str(uuid.uuid4())
            token = "z" * 43
            rate = 44100
            time = np.arange(rate) / rate
            vocal = .1 * np.sin(2 * np.pi * 220 * time)
            accompaniment = .1 * np.sin(2 * np.pi * 880 * time)
            sf.write(root / f"{job_id}-vocals.wav", vocal, rate, subtype="FLOAT")
            sf.write(root / f"{job_id}-instrumental.wav",
                     np.column_stack((accompaniment, accompaniment)), rate, subtype="FLOAT")
            original_vocal_stem = (root / f"{job_id}-vocals.wav").read_bytes()
            original_music_stem = (root / f"{job_id}-instrumental.wav").read_bytes()
            original = root / f"{job_id}.wav"
            sf.write(original, np.column_stack((vocal + accompaniment,) * 2), rate, subtype="FLOAT")
            record = main.OutputRecord(
                path=original, token=token, expires_at=main.utcnow() + timedelta(hours=1),
                format="wav", state="completed", stage="completed", audio_mode="song",
                remix_available=True, source_duration_seconds=1.0, stem_sample_rate=rate,
            )
            with patch.object(main, "OUTPUT_ROOT", root), patch.object(main, "GATEWAY_TOKEN", "g" * 48), \
                    patch.dict(main.outputs, {job_id: record}, clear=True), \
                    patch.object(main, "separate_song", side_effect=AssertionError("must not separate again")):
                request = Request({"type": "http", "method": "POST", "path": "/v1/output/remix",
                                   "headers": [(b"authorization", b"Bearer " + b"g" * 48)]})
                payload = asyncio.run(main.remix_output(
                    request, job_id, token, "-6", "0", "false", "true"))
                self.assertEqual(payload["mixRevision"], 1)
                self.assertTrue(payload["remixAvailable"])
                served = asyncio.run(main.get_output(request, job_id, token))
                self.assertEqual(served.headers["x-rvc-mix-revision"], "1")
                actual, _ = sf.read(record.path)
                self.assertEqual(actual.shape, (rate, 2))
                np.testing.assert_allclose(actual[:, 0], vocal * 10 ** (-6 / 20), atol=5e-5)
                self.assertEqual((root / f"{job_id}-vocals.wav").read_bytes(), original_vocal_stem)
                self.assertEqual((root / f"{job_id}-instrumental.wav").read_bytes(), original_music_stem)
                with self.assertRaises(main.RvcServiceError) as invalid:
                    asyncio.run(main.remix_output(request, job_id, token, "nan", "0", "false", "false"))
                self.assertEqual(invalid.exception.status_code, 400)
                with self.assertRaises(HTTPException) as forbidden:
                    asyncio.run(main.remix_output(request, job_id, "x" * 43, "0", "0", "false", "false"))
                self.assertEqual(forbidden.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
