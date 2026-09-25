import ast
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'rvc-service'))
from app.audio_dynamics import preserve_dynamics


class DynamicsTests(unittest.TestCase):
    def test_slider_half_follows_absolute_level_like_device(self):
        source = np.full(16000, .1)
        synth = np.full(40000, .5)
        result = preserve_dynamics(synth, 40000, source, 16000, .5)
        self.assertAlmostEqual(float(np.median(result[2000:-2000] / synth[2000:-2000])),
                               (.1 / .5) ** .5, places=3)

    def test_silence_does_not_raise_noise_floor(self):
        source = np.zeros(16000)
        synth = np.full(16000, .001)
        np.testing.assert_array_equal(preserve_dynamics(synth, 16000, source, 16000, 1), synth)

    def test_preserves_identity_and_improves_syllable_dynamics(self):
        rate = 16000
        t = np.arange(rate * 3) / rate
        shape = .15 + .1 * np.sin(2 * np.pi * 4 * t)
        source = shape * np.sin(2 * np.pi * 220 * t)
        converted = .15 * np.sin(2 * np.pi * 440 * t)
        result = preserve_dynamics(converted, rate, source, rate)
        spectrum = abs(np.fft.rfft(result))
        self.assertLess(spectrum[660], spectrum[1320] * .001)
        self.assertLess(np.mean((abs(result)-abs(shape*np.sin(2*np.pi*440*t)))**2),
                        np.mean((abs(converted)-abs(shape*np.sin(2*np.pi*440*t)))**2))
        self.assertEqual(result.shape, converted.shape)
        self.assertTrue(np.isfinite(result).all())

    def test_constant_envelope_is_unchanged(self):
        t = np.arange(16000) / 16000
        audio = .1 * np.sin(2*np.pi*200*t)
        np.testing.assert_allclose(preserve_dynamics(audio, 16000, audio, 16000), audio)
        np.testing.assert_array_equal(preserve_dynamics(audio,16000,audio*.3,16000,0),audio)

    def test_stereo_different_rates_silence_and_invalid(self):
        mono = np.sin(np.arange(16000) / 16000 * 2*np.pi*220) * .1
        stereo = np.column_stack((np.repeat(mono, 3), np.repeat(mono, 3)*.5))
        out = preserve_dynamics(stereo, 48000, mono, 16000)
        np.testing.assert_allclose(out[:, 0]*.5, out[:, 1])
        np.testing.assert_array_equal(preserve_dynamics(mono*0,16000,mono*0,16000),mono*0)
        with self.assertRaises(ValueError):
            preserve_dynamics(mono, 16000, mono[:100], 16000)
        with self.assertRaises(ValueError):
            preserve_dynamics(np.array([np.nan]), 16000, mono, 16000)

    def test_peak_guard_preserves_rate_channels_duration_and_peak(self):
        tree = ast.parse((ROOT/'rvc-service/app/main.py').read_text(encoding='utf-8'))
        fn = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name=='finalize_true_peak_safe')
        scope = dict(Path=Path, subprocess=subprocess, probe_duration=lambda p:sf.info(p).duration,
                     RvcServiceError=lambda *args:RuntimeError(str(args)))
        exec(compile(ast.Module(body=[fn], type_ignores=[]), '<peak-guard>', 'exec'), scope)
        with tempfile.TemporaryDirectory() as d:
            for rate in (16000, 40000, 44100, 48000):
                with self.subTest(rate=rate):
                    t = np.arange(rate) / rate
                    wave = 1.1 * np.sin(2*np.pi*997*t)
                    stereo = np.column_stack((wave, wave*.3))
                    p = Path(d)/'test.wav'
                    sf.write(p, stereo, rate, subtype='FLOAT')
                    scope['finalize_true_peak_safe'](p)
                    data, actual_rate = sf.read(p)
                    self.assertEqual(actual_rate, rate)
                    self.assertEqual(data.shape, stereo.shape)
                    self.assertLess(abs(data).max(), .90)
                    # Check a separate 8x reconstruction, not only file samples.
                    raw = subprocess.check_output(['ffmpeg','-v','error','-i',str(p),
                        '-af',f'aresample={rate*8}','-f','f32le','-'])
                    self.assertLess(abs(np.frombuffer(raw,dtype='<f4')).max(), .92)


if __name__ == '__main__':
    unittest.main()
