import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "rvc-service"))
from app.pitch_safety import repair_octave_glitches, quantize_pitch, safe_get_f0, repair_waveform_octave_drops


class PitchSafetyTests(unittest.TestCase):
    def test_real_low_octave_note_with_strong_second_harmonic_is_not_raised(self):
        # The upper partial of a real 220 Hz note can be louder than its
        # fundamental. Half-period correlation alone must not erase the note.
        track = np.full(100, 440.0)
        track[40:60] = 220.0
        sample_f0 = np.repeat(track, 160)
        phase = 2 * np.pi * np.cumsum(sample_f0) / 16000
        audio = 0.07 * np.sin(phase) + np.sin(2 * phase)
        pipeline = SimpleNamespace(
            sr=16000, window=160, pitch_median_radius=0,
            model_rmvpe=SimpleNamespace(infer_from_audio=lambda *a, **k: track),
        )
        _, continuous = safe_get_f0(pipeline, audio, 100, 0, "rmvpe")
        np.testing.assert_allclose(continuous[40:60], 220)

    def test_crossing_embedding_ceiling_preserves_melody_and_transposition(self):
        frames = np.r_[np.linspace(950, 1200, 40), 0, np.linspace(1200, 950, 40)]
        pipeline = SimpleNamespace(sr=16000, window=160, pitch_median_radius=0,
            model_rmvpe=SimpleNamespace(infer_from_audio=lambda *a, **k: frames))
        for shift in (0, 12):
            coarse, continuous = safe_get_f0(pipeline, np.zeros(16000), len(frames), shift, "rmvpe")
            np.testing.assert_allclose(continuous, frames * 2 ** (shift / 12))
            self.assertTrue(np.all((coarse >= 1) & (coarse <= 255)))

    def test_breaths_and_invalid_frames_remain_unvoiced(self):
        frames = np.array([220, 220, 0, 0, 440, np.nan, np.inf, -5, 2500])
        pipeline = SimpleNamespace(sr=16000, window=160, model_rmvpe=SimpleNamespace(infer_from_audio=lambda *a, **k: frames))
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

    def test_synthetic_vowel_octave_island_requires_waveform_support(self):
        track = np.full(200, 610.0)
        track[70:100] = 305
        audio = 0.2 * np.sin(2 * np.pi * 610 * np.arange(32000) / 16000)
        np.testing.assert_allclose(repair_waveform_octave_drops(track, audio, 16000, 160), 610)
        ambiguous = track.copy()
        ambiguous[65:70] = 457.5
        repaired = repair_waveform_octave_drops(ambiguous, audio, 16000, 160)
        np.testing.assert_allclose(repaired[70:100], 610)
        # The same contour can be an intentional lower note: preserve it.
        true_audio = 0.2 * np.sin(2 * np.pi * np.cumsum(np.repeat(track, 160)) / 16000)
        np.testing.assert_array_equal(repair_waveform_octave_drops(track, true_audio, 16000, 160), track)

    def test_waveform_guard_preserves_silence_noise_long_notes_and_glides(self):
        rng = np.random.default_rng(7)
        track = np.full(200, 610.0)
        track[70:100] = 305
        for audio in (np.zeros(32000), rng.normal(0, .1, 32000), np.full(32000, .1)):
            np.testing.assert_array_equal(repair_waveform_octave_drops(track, audio, 16000, 160), track)
        audio = .2 * np.sin(2 * np.pi * 610 * np.arange(32000) / 16000)
        for frames in (np.geomspace(100, 1800, 200), np.r_[np.full(70, 610), np.full(60, 305), np.full(70, 610)],
                       np.r_[np.full(70, 610), 0, np.full(30, 305), 0, np.full(98, 610)]):
            np.testing.assert_array_equal(repair_waveform_octave_drops(frames, audio, 16000, 160), frames)


if __name__ == "__main__":
    unittest.main()
