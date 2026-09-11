import ast
from pathlib import Path
import unittest
from unittest.mock import Mock


class CloudDurationTests(unittest.TestCase):
    def test_real_normalizer_accepts_900_seconds_and_rejects_anything_longer(self):
        tree = ast.parse((Path(__file__).resolve().parents[1] / "rvc-service/app/main.py").read_text(encoding="utf-8"))
        limit = next(ast.literal_eval(node.value) for node in tree.body
                     if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name)
                     and node.targets[0].id == "MAX_AUDIO_SECONDS")
        self.assertEqual(limit, 900)
        function = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "normalize_audio")
        for duration in (899.99, 900, 900.01):
            process = Mock()
            process.run.return_value.returncode = 0
            destination = Mock()
            destination.stat.return_value.st_size = 10
            scope = dict(Path=Path, AudioProfile=object, probe_duration=lambda _: duration,
                         MIN_AUDIO_SECONDS=1, MAX_AUDIO_SECONDS=limit, RvcServiceError=ValueError,
                         analyze_audio_profile=lambda _: Mock(high_energy=False),
                         SINGING_INPUT_FILTER="song", HIGH_ENERGY_INPUT_FILTER="loud", INPUT_SAFETY_FILTER="voice",
                         subprocess=process)
            exec(compile(ast.Module(body=[function], type_ignores=[]), "normalizer", "exec"), scope)
            if duration <= 900:
                scope["normalize_audio"](Path("fixture.wav"), destination, singing=True)
                process.run.assert_called_once()
            else:
                with self.assertRaisesRegex(ValueError, "RVC_AUDIO_TOO_LONG"):
                    scope["normalize_audio"](Path("fixture.wav"), destination, singing=True)
                process.run.assert_not_called()


if __name__ == "__main__":
    unittest.main()
