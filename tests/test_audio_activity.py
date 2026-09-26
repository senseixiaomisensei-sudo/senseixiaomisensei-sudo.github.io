import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "rvc-service"))
from app.audio_activity import suppress_silent_synthesis


class SourceActivityTests(unittest.TestCase):
    def test_removes_model_tone_only_in_definite_silent_cores(self):
        source_rate, output_rate = 16000, 40000
        rng = np.random.default_rng(7)
        source = np.zeros(source_rate * 4, dtype="float32")
        source[source_rate:source_rate * 3 // 2] = rng.normal(0, .0005, source_rate // 2)
        voiced_t = np.arange(source_rate * 3 // 2) / source_rate
        source[source_rate * 3 // 2:source_rate * 3] = .06 * np.sin(2 * np.pi * 220 * voiced_t)
        t = np.arange(output_rate * 4) / output_rate
        synth = .001 * np.sin(2 * np.pi * 100 * t)
        synth[int(1.5 * output_rate):3 * output_rate] += .05 * np.sin(
            2 * np.pi * 330 * t[:int(1.5 * output_rate)])
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            src, out = root / "source.wav", root / "synth.wav"
            sf.write(src, source, source_rate, subtype="FLOAT")
            sf.write(out, synth, output_rate, subtype="FLOAT")
            details = suppress_silent_synthesis(out, src)
            result, rate = sf.read(out)
        self.assertEqual(rate, output_rate)
        self.assertEqual(len(result), len(synth))
        self.assertTrue(details["applied"])
        self.assertGreater(details["states"]["weak"], 0)
        self.assertLess(np.max(np.abs(result[int(.3 * output_rate):int(.7 * output_rate)])), 2e-7)
        self.assertLess(np.max(np.abs(result[int(3.3 * output_rate):int(3.7 * output_rate)])), 2e-7)
        np.testing.assert_allclose(result[int(1.1 * output_rate):int(1.4 * output_rate)],
                                   synth[int(1.1 * output_rate):int(1.4 * output_rate)], atol=1e-7)
        np.testing.assert_allclose(result[int(2 * output_rate):int(2.5 * output_rate)],
                                   synth[int(2 * output_rate):int(2.5 * output_rate)], atol=1e-7)


if __name__ == "__main__":
    unittest.main()
