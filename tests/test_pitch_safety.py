import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "rvc-service"))
from app.pitch_safety import repair_octave_glitches, quantize_pitch, safe_get_f0


class PitchSafetyTests(unittest.TestCase):
    def test_breaths_and_invalid_frames_remain_unvoiced(self):
        frames = np.array([220, 220, 0, 0, 440, np.nan, np.inf, -5, 2500])
        pipeline = SimpleNamespace(model_rmvpe=SimpleNamespace(infer_from_audio=lambda *a, **k: frames))
        coarse, continuous = safe_get_f0(pipeline, np.zeros(16000), len(frames), 12, "rmvpe")
        np.testing.assert_array_equal(continuous, [440, 440, 0, 0, 880, 0, 0, 0, 0])
        self.assertTrue(np.all((coarse >= 1) & (coarse <= 255)))

    def test_short_octave_error_is_repaired(self):
        for width in (1, 2, 3):
            np.testing.assert_allclose(repair_octave_glitches([600] * 4 + [1200] * width + [600] * 4), 600)

    def test_register_changes_glides_and_silence_are_preserved(self):
        for frames in ([600] * 5 + [1200] * 10 + [600] * 5,
                       [600, 0, 1200, 0, 600], np.geomspace(80, 1900, 100)):
            np.testing.assert_array_equal(repair_octave_glitches(frames), frames)

    def test_coarse_range_does_not_flatten_extreme_pitch(self):
        frames = np.array([40, 1100, 1500, 1900])
        before = frames.copy()
        self.assertEqual(quantize_pitch(frames).tolist(), [1, 255, 255, 255])
        np.testing.assert_array_equal(frames, before)

    def test_actual_pm_tracker_low_high_and_extreme_tones(self):
        pipeline = SimpleNamespace(sr=16000, window=160)
        for hz in (65, 220, 520, 1100, 1500, 1900):
            audio = 0.3 * np.sin(2 * np.pi * hz * np.arange(32000) / 16000)
            _, track = safe_get_f0(pipeline, audio, 200, 0, "pm")
            voiced = track[track > 0]
            self.assertGreater(len(voiced), 180, hz)
            self.assertLess(abs(np.median(voiced) - hz) / hz, 0.02, hz)


if __name__ == "__main__":
    unittest.main()
