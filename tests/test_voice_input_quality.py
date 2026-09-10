"""Run the real FFmpeg filter on deterministic breath/cough/noise fixtures."""
import ast
from pathlib import Path
import subprocess
import tempfile
import unittest

import numpy as np
import soundfile as sf

tree = ast.parse((Path(__file__).resolve().parents[1] / "rvc-service/app/main.py").read_text(encoding="utf-8"))
filters = {node.targets[0].id: ast.literal_eval(node.value) for node in tree.body
           if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name)
           and node.targets[0].id in {"INPUT_SAFETY_FILTER", "HIGH_ENERGY_INPUT_FILTER"}}


class VoiceInputQualityTests(unittest.TestCase):
    def filter(self, audio, config):
        with tempfile.TemporaryDirectory() as directory:
            source, output = Path(directory) / "in.wav", Path(directory) / "out.wav"
            sf.write(source, audio, 16000, subtype="FLOAT")
            subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", str(source),
                            "-af", config, "-ar", "16000", "-c:a", "pcm_f32le", str(output)], check=True)
            return sf.read(output)[0]

    def test_breath_cough_wind_and_quiet_room_do_not_get_expanded(self):
        sr = 16000
        t = np.arange(sr * 6) / sr
        rng = np.random.default_rng(17)
        audio = rng.normal(0, .002, len(t))
        audio[sr:2*sr] += .1 * np.sin(2*np.pi*220*t[sr:2*sr])
        breath = np.sin(np.linspace(0, np.pi, sr)) ** 2
        audio[2*sr:3*sr] += rng.normal(0, .035, sr) * breath
        audio[3*sr:3*sr+2400] += rng.normal(0, .18, 2400) * np.hanning(2400)
        audio[4*sr:5*sr] += .1 * np.sin(2*np.pi*20*t[4*sr:5*sr])
        rms = lambda x: float(np.sqrt(np.mean(x*x)))
        for name, config in filters.items():
            with self.subTest(filter=name):
                output = self.filter(audio, config)
                self.assertLessEqual(abs(len(output)-len(audio)), 160)
                self.assertTrue(np.isfinite(output).all())
                self.assertLess(np.max(np.abs(output)), .91)
                self.assertGreater(rms(output[2*sr+4000:3*sr-4000]), .008)
                self.assertGreater(rms(output[3*sr:3*sr+3200]), .03)
                self.assertLess(rms(output[5*sr+4000:]), .003)
                self.assertLess(rms(output[4*sr+4000:5*sr-4000]), .025)
                self.assertGreater(rms(output[sr+4000:2*sr-4000]), .05)
                print(name, "room", rms(output[5*sr+4000:]), "breath", rms(output[2*sr+4000:3*sr-4000]), flush=True)

    def test_silence_stays_silent(self):
        output = self.filter(np.zeros(32000), filters["INPUT_SAFETY_FILTER"])
        self.assertLess(np.max(np.abs(output)), 1e-7)


if __name__ == "__main__":
    unittest.main()
