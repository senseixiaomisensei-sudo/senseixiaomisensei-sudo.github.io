"""Regression cases for content-driven RVC feature blending."""

import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "rvc-service"))
from app.feature_policy import adaptive_feature_weights
from app.pitch_safety import stabilize_pitch_by_evidence


class AdaptiveFeaturePolicyTests(unittest.TestCase):
    def test_voiced_vowel_breath_and_fricative_keep_distinct_weights(self):
        rate = 16000
        t = np.arange(rate) / rate
        vowel = .2 * (np.sin(2 * np.pi * 220 * t) + .2 * np.sin(2 * np.pi * 440 * t))
        rng = np.random.default_rng(11)
        breath = rng.normal(0, .015, rate)
        fricative = rng.normal(0, .05, rate)
        fricative = np.r_[0, np.diff(fricative)]
        audio = np.r_[vowel, breath, fricative]
        f0 = np.r_[np.full(100, 220.), np.zeros(200)]
        index, blend = adaptive_feature_weights(audio, f0, .3, .25)
        self.assertEqual(len(index), len(f0))
        self.assertTrue(np.isfinite(index).all() and np.isfinite(blend).all())
        self.assertGreater(np.median(index[20:80]), np.median(index[120:180]))
        self.assertLess(np.median(blend[120:180]), np.median(blend[20:80]))
        self.assertLess(np.median(blend[220:280]), np.median(blend[20:80]))
        self.assertLess(np.max(np.abs(np.diff(index))), .04)
        self.assertLess(np.max(np.abs(np.diff(blend))), .13)

    def test_user_zero_index_and_disabled_protect_keep_official_meaning(self):
        audio = np.zeros(16000)
        f0 = np.zeros(100)
        index, blend = adaptive_feature_weights(audio, f0, 0, .5)
        np.testing.assert_array_equal(index, 0)
        np.testing.assert_array_equal(blend, 1)

    def test_pitch_repairs_only_waveform_rejected_short_island(self):
        rate = 16000
        t = np.arange(rate) / rate
        true_220 = .2 * np.sin(2 * np.pi * 220 * t)
        contour = np.full(100, 220.)
        contour[40] = 440
        fixed = stabilize_pitch_by_evidence(contour, true_220, rate, 160)
        self.assertAlmostEqual(fixed[40], 220, delta=1)
        np.testing.assert_array_equal(fixed[:40], contour[:40])

        true_440 = .2 * np.sin(2 * np.pi * 440 * t)
        np.testing.assert_array_equal(stabilize_pitch_by_evidence(contour, true_440, rate, 160), contour)
        glide = np.geomspace(160, 540, 100)
        np.testing.assert_array_equal(stabilize_pitch_by_evidence(glide, true_220, rate, 160), glide)
        paused = contour.copy()
        paused[39] = paused[41] = 0
        np.testing.assert_array_equal(stabilize_pitch_by_evidence(paused, true_220, rate, 160), paused)


if __name__ == "__main__":
    unittest.main()
