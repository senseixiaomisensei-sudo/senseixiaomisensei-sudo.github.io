import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "rvc-service"))
from app.main import encoded_true_peak_dbfs, transcode_mp3_true_peak_safe


class Mp3PeakTests(unittest.TestCase):
    def test_encoded_peak_is_checked_and_reencoded_from_wav(self):
        with tempfile.TemporaryDirectory() as root:
            wave = Path(root) / "mix.wav"
            output = Path(root) / "mix.mp3"
            t = np.arange(44100) / 44100
            signal = .99 * np.sin(2 * np.pi * 997 * t)
            sf.write(wave, np.column_stack((signal, signal)), 44100, subtype="FLOAT")
            before = wave.read_bytes()
            measured = transcode_mp3_true_peak_safe(wave, output)
            self.assertTrue(output.is_file())
            self.assertLessEqual(measured, -1.0)
            self.assertLessEqual(encoded_true_peak_dbfs(output), -1.0)
            self.assertEqual(wave.read_bytes(), before)
            self.assertFalse(list(Path(root).glob("mix-*.mp3")))


if __name__ == "__main__":
    unittest.main()
