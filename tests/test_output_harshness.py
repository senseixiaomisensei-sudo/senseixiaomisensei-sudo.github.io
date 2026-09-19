"""Exercise the actual shared FFmpeg output guards, including their delay."""
import ast
from pathlib import Path
import subprocess
import unittest

import numpy as np
from scipy.signal import correlate


tree = ast.parse((Path(__file__).resolve().parents[1] / 'rvc-service/app/main.py').read_text(encoding='utf-8'))
names = {'OUTPUT_SAFETY_FILTER', 'HIGH_ENERGY_OUTPUT_FILTER',
         'SHOUT_HARSHNESS_FILTER', 'PITCH_COMPLEX_OUTPUT_FILTER'}
filters = {node.targets[0].id: ast.literal_eval(node.value) for node in tree.body
           if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name)
           and node.targets[0].id in names}


def process(audio, graph, rate=40000):
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-f', 'f32le',
        '-ar', str(rate), '-ac', '1', '-i', 'pipe:0', '-af', graph,
        '-f', 'f32le', 'pipe:1'], input=np.asarray(audio, dtype='<f4').tobytes())
    return np.frombuffer(raw, dtype='<f4')


class OutputHarshnessTests(unittest.TestCase):
    def test_every_profile_retains_transient_timing(self):
        audio = np.zeros(40000)
        audio[4000:36000] = np.random.default_rng(9).normal(0, .04, 32000)
        for name, graph in filters.items():
            with self.subTest(profile=name):
                out = process(audio, graph)
                self.assertEqual(len(audio), len(out))
                self.assertTrue(np.isfinite(out).all())
                lag = np.argmax(correlate(out, audio, method='fft')) - (len(audio)-1)
                self.assertLessEqual(abs(lag), 2)

    def test_shout_guard_reduces_harsh_energy_without_losing_voice_body(self):
        time = np.arange(40000) / 40000
        audio = .25*np.sin(2*np.pi*440*time) + .15*np.sin(2*np.pi*14000*time)
        out = process(audio, filters['HIGH_ENERGY_OUTPUT_FILTER'])[10000:30000]
        spectrum = abs(np.fft.rfft(out))*2/len(out)
        self.assertGreater(spectrum[220], .22)  # 440 Hz at 2 Hz per bin
        self.assertLess(spectrum[7000], .06)
        self.assertLess(abs(np.diff(out)).max(), .12)


if __name__ == '__main__':
    unittest.main()
