"""Exercise the repaired vocal path with synthetic identity and artifact cases."""

import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "rvc-service"))
from app.audio_repair import protect_true_peak, repair_vocal, repair_vocal_file
from app.separation_runtime import remix_song


class OutputRepairTests(unittest.TestCase):
    def test_breath_fricative_and_high_sustained_note_are_retained(self):
        rate = 40000
        rng = np.random.default_rng(19)
        breath = rng.normal(0, .015, rate // 2)
        fricative = np.diff(rng.normal(0, .035, rate // 4 + 1))
        t = np.arange(rate) / rate
        high_note = .16 * np.sin(2 * np.pi * 710 * t) + .04 * np.sin(2 * np.pi * 1420 * t)
        signal = np.r_[breath, fricative, high_note].astype(np.float32)
        repaired = repair_vocal(signal, rate)
        self.assertEqual(len(repaired), len(signal))
        self.assertTrue(np.isfinite(repaired).all())
        for start, end in ((0, len(breath)), (len(breath), len(breath) + len(fricative)),
                           (len(breath) + len(fricative), len(signal))):
            before = np.sqrt(np.mean(signal[start:end] ** 2))
            after = np.sqrt(np.mean(repaired[start:end] ** 2))
            self.assertGreater(after / before, .68)
            self.assertLess(after / before, 1.15)
        self.assertGreater(np.corrcoef(signal[-rate:], repaired[-rate:])[0, 1], .99)

    def test_clean_voice_keeps_timing_pitch_and_character_harmonics(self):
        rate = 40000
        t = np.arange(rate * 2) / rate
        phase = 2 * np.pi * (230 * t + 0.9 * np.sin(2 * np.pi * 5 * t))
        clean = (0.16 * np.sin(phase) + 0.06 * np.sin(2 * phase) + 0.035 * np.sin(3 * phase)).astype(np.float32)
        repaired = repair_vocal(clean, rate)
        self.assertEqual(len(repaired), len(clean))
        self.assertGreater(np.corrcoef(clean, repaired)[0, 1], 0.999)
        self.assertLess(np.sqrt(np.mean((clean - repaired) ** 2)), 0.005)
        self.assertTrue(np.isfinite(repaired).all())

    def test_isolated_click_is_reduced_without_unverified_band_filtering(self):
        rate = 40000
        t = np.arange(rate * 2) / rate
        clean = 0.15 * np.sin(2 * np.pi * 220 * t) + 0.04 * np.sin(2 * np.pi * 660 * t)
        damaged = clean.copy()
        damaged[rate:rate + rate // 3] += 0.18 * np.sin(2 * np.pi * 3900 * t[:rate // 3])
        damaged[rate // 2] += 0.7
        repaired = repair_vocal(damaged, rate)
        self.assertLess(abs(repaired[rate // 2] - clean[rate // 2]), 0.2)
        np.testing.assert_allclose(repaired[rate:rate + rate // 3], damaged[rate:rate + rate // 3], atol=1e-7)
        self.assertLess(np.sqrt(np.mean((repaired[rate // 8:rate // 3] - clean[rate // 8:rate // 3]) ** 2)), 0.005)

    def test_short_flat_clip_is_smoothed_and_long_peak_is_untouched(self):
        rate = 40000
        t = np.arange(rate) / rate
        clean = 0.8 * np.sin(2 * np.pi * 300 * t)
        damaged = clean.copy()
        damaged[1001:1005] = 1.0
        repaired = repair_vocal(damaged, rate)
        self.assertLess(np.max(np.abs(np.diff(repaired[996:1010]))), np.max(np.abs(np.diff(damaged[996:1010]))))
        self.assertLess(np.max(np.abs(repaired[rate // 2:] - clean[rate // 2:])), 0.02)

    def test_file_path_and_true_peak_keep_duration_and_uniform_dynamics(self):
        rate = 44100
        t = np.arange(rate * 2) / rate
        signal = (0.4 * np.sin(2 * np.pi * 997 * t)).astype(np.float32)
        signal[rate:] *= 3
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "vocal.wav"
            sf.write(path, signal, rate, subtype="FLOAT")
            repair_vocal_file(path)
            processed, actual_rate = sf.read(path)
            self.assertEqual(actual_rate, rate)
            self.assertEqual(len(processed), len(signal))
            protect_true_peak(path, -1.0)
            safe, actual_rate = sf.read(path)
            self.assertEqual(actual_rate, rate)
            self.assertEqual(len(safe), len(signal))
            self.assertLess(np.max(np.abs(resample_poly(safe, 8, 1))), 10 ** (-1 / 20) + 0.002)
            first_gain = np.sqrt(np.mean(safe[:rate] ** 2) / np.mean(processed[:rate] ** 2))
            second_gain = np.sqrt(np.mean(safe[rate:] ** 2) / np.mean(processed[rate:] ** 2))
            self.assertAlmostEqual(first_gain, second_gain, delta=0.001)

    def test_song_remix_stays_float_until_one_final_peak_trim(self):
        rate = 44100
        t = np.arange(rate * 2) / rate
        wave = 0.65 * np.sin(2 * np.pi * 440 * t)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            instrumental = root / "music.wav"
            vocal = root / "voice.wav"
            mixed = root / "mix.wav"
            sf.write(instrumental, np.column_stack((wave, wave)), rate, subtype="FLOAT")
            sf.write(vocal, wave, rate, subtype="FLOAT")
            remix_song(instrumental, vocal, mixed, 2.0, rate)
            before, _ = sf.read(mixed)
            self.assertEqual(len(before), rate * 2)
            self.assertGreater(np.max(np.abs(before)), 1.0)
            protect_true_peak(mixed, -1.0)
            after, _ = sf.read(mixed)
            self.assertEqual(len(after), len(before))
            self.assertLess(np.max(np.abs(resample_poly(after, 8, 1, axis=0))), 10 ** (-1 / 20) + 0.002)


if __name__ == "__main__":
    unittest.main()
