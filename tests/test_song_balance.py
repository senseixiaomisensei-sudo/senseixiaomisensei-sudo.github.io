import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "rvc-service"))
from app.separation_runtime import calibrate_song_vocals, remix_song


class SongBalanceTests(unittest.TestCase):
    def test_calibrates_vocal_only_with_different_sample_rates(self):
        with tempfile.TemporaryDirectory() as root:
            source = Path(root) / "source.wav"
            converted = Path(root) / "converted.wav"
            t_source = np.arange(44100 * 2) / 44100
            t_converted = np.arange(40000 * 2) / 40000
            source_audio = .12 * np.sin(2 * np.pi * 220 * t_source)
            converted_audio = .24 * np.sin(2 * np.pi * 220 * t_converted)
            sf.write(source, np.column_stack((source_audio, source_audio)), 44100, subtype="FLOAT")
            sf.write(converted, converted_audio, 40000, subtype="FLOAT")
            before_source = source.read_bytes()
            gain = calibrate_song_vocals(source, converted)
            output, rate = sf.read(converted)
            self.assertAlmostEqual(gain, .5, delta=.02)
            self.assertEqual(rate, 40000)
            self.assertEqual(len(output), len(converted_audio))
            self.assertEqual(source.read_bytes(), before_source)
            self.assertLess(np.max(np.abs(output)), .13)

    def test_silent_source_does_not_boost_model_noise(self):
        with tempfile.TemporaryDirectory() as root:
            source = Path(root) / "source.wav"
            converted = Path(root) / "converted.wav"
            sf.write(source, np.zeros(44100), 44100, subtype="FLOAT")
            sf.write(converted, np.full(40000, .001), 40000, subtype="FLOAT")
            before = converted.read_bytes()
            self.assertEqual(calibrate_song_vocals(source, converted), 1.)
            self.assertEqual(converted.read_bytes(), before)

    def test_remix_keeps_independent_stems_and_applies_user_gain_after_balance(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            rate = 44100
            t = np.arange(rate) / rate
            voice = .1 * np.sin(2 * np.pi * 220 * t)
            music = .05 * np.sin(2 * np.pi * 880 * t)
            vocal_path, music_path, out = root / "voice.wav", root / "music.wav", root / "mix.wav"
            sf.write(vocal_path, voice, rate, subtype="FLOAT")
            sf.write(music_path, np.column_stack((music, music)), rate, subtype="FLOAT")
            remix_song(music_path, vocal_path, out, 1.0, rate,
                       vocal_gain_db=-6.0, accompaniment_gain_db=6.0)
            mixed, _ = sf.read(out)
            expected = voice * 10 ** (-6 / 20) + music * 10 ** (6 / 20)
            np.testing.assert_allclose(mixed[:, 0], expected, atol=1e-5)
            np.testing.assert_allclose(mixed[:, 1], expected, atol=1e-5)
            remix_song(music_path, vocal_path, out, 1.0, rate, vocal_mute=True)
            muted, _ = sf.read(out)
            np.testing.assert_allclose(muted[:, 0], music, atol=1e-6)
            remix_song(music_path, vocal_path, out, 1.0, rate, accompaniment_mute=True)
            muted, _ = sf.read(out)
            np.testing.assert_allclose(muted[:, 0], voice, atol=1e-6)


if __name__ == "__main__":
    unittest.main()
