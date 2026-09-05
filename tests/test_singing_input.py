import ast
from pathlib import Path
import subprocess
import unittest
from unittest.mock import Mock, patch

import numpy as np


SOURCE = Path(__file__).resolve().parents[1] / "rvc-service/app/main.py"
TREE = ast.parse(SOURCE.read_text(encoding="utf-8"))
CONSTANTS = {
    node.targets[0].id: ast.literal_eval(node.value)
    for node in TREE.body if isinstance(node, ast.Assign)
    and isinstance(node.targets[0], ast.Name)
    and node.targets[0].id in {"SINGING_INPUT_FILTER", "INPUT_SAFETY_FILTER", "HIGH_ENERGY_INPUT_FILTER"}
}


class SingingInputTests(unittest.TestCase):
    def test_song_stem_is_explicitly_marked_as_singing(self):
        self.assertIn("normalize_audio, stems.vocals, separated_vocals, singing=True", SOURCE.read_text(encoding="utf-8"))

    def test_song_and_speech_select_their_own_filter_even_when_loud(self):
        function = next(node for node in TREE.body if isinstance(node, ast.FunctionDef) and node.name == "normalize_audio")
        scope = dict(CONSTANTS, Path=Path, AudioProfile=object, probe_duration=lambda p: 2,
                     MIN_AUDIO_SECONDS=1, MAX_AUDIO_SECONDS=600, subprocess=subprocess)
        exec(compile(ast.Module(body=[function], type_ignores=[]), str(SOURCE), "exec"), scope)
        for loud in (False, True):
            scope["analyze_audio_profile"] = lambda p: Mock(high_energy=loud)
            for singing in (False, True):
                destination = Mock()
                destination.stat.return_value.st_size = 100
                with patch.object(subprocess, "run", return_value=Mock(returncode=0)) as run:
                    scope["normalize_audio"](Path("input.wav"), destination, singing=singing)
                command = run.call_args.args[0]
                chosen = command[command.index("-af") + 1]
                expected = "SINGING_INPUT_FILTER" if singing else "HIGH_ENERGY_INPUT_FILTER" if loud else "INPUT_SAFETY_FILTER"
                self.assertEqual(chosen, CONSTANTS[expected])

    def test_real_ffmpeg_preserves_sustained_pitch_and_duration(self):
        for hz in (440, 1100, 1500):
            samples = (0.25 * np.sin(2 * np.pi * hz * np.arange(32000) / 16000)).astype("<f4")
            result = subprocess.run([
                "ffmpeg", "-v", "error", "-f", "f32le", "-ar", "16000", "-ac", "1", "-i", "pipe:0",
                "-af", CONSTANTS["SINGING_INPUT_FILTER"], "-f", "f32le", "pipe:1",
            ], input=samples.tobytes(), capture_output=True, check=True)
            output = np.frombuffer(result.stdout, dtype="<f4")
            self.assertEqual(len(output), len(samples))
            self.assertTrue(np.isfinite(output).all())
            self.assertLess(np.max(np.abs(output)), 0.9)
            spectrum = np.abs(np.fft.rfft(output[8000:24000])) ** 2
            self.assertEqual(np.argmax(spectrum), hz)
            self.assertGreater(spectrum[hz] / spectrum.sum(), 0.999)


if __name__ == "__main__":
    unittest.main()
