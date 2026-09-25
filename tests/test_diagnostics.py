import json
import os
import sys
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "rvc-service"))
from app.diagnostics import capture_job, configured_root


class DiagnosticCaptureTests(unittest.TestCase):
    def test_private_opt_in_capture_has_audio_stats_and_rejects_public_root(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            site = base / "site"
            site.mkdir()
            with patch.dict(os.environ, {"RVC_DIAGNOSTIC_ROOT": str(site / "diagnostics")}):
                self.assertIsNone(configured_root(site))
            private = base / "diagnostics"
            with patch.dict(os.environ, {"RVC_DIAGNOSTIC_ROOT": str(private)}):
                self.assertEqual(configured_root(site), private)
            work = base / "work"
            work.mkdir()
            samples = np.array([0.0, 0.25, -0.5, 0.0], dtype=np.float32)
            sf.write(work / "input.wav", samples, 16000, subtype="FLOAT")
            output = base / "result.wav"
            sf.write(output, samples, 16000, subtype="FLOAT")
            job_id = str(uuid.uuid4())
            destination = capture_job(private, job_id, work, output, {"modelId": "example"})
            self.assertTrue((destination / "work" / "input.wav").is_file())
            evidence = json.loads((destination / "diagnostic.json").read_text(encoding="utf-8"))
            self.assertEqual(evidence["audioStages"]["work/input.wav"]["frames"], 4)
            self.assertAlmostEqual(evidence["audioStages"]["result.wav"]["samplePeak"], 0.5)


if __name__ == "__main__":
    unittest.main()
