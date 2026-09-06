import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest

import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "rvc-service"))
from app.official_runtime import (
    DEFAULT_NOISE_SCALE, UPSTREAM_NOISE_SCALE,
    configure_synthesis_noise, model_noise_scale,
)


class SynthesisNoiseTests(unittest.TestCase):
    def test_mounted_metadata_and_invalid_values(self):
        with tempfile.TemporaryDirectory() as root:
            model = Path(root) / "model.pth"
            metadata = model.with_name("meta.json")
            self.assertEqual(model_noise_scale(model), DEFAULT_NOISE_SCALE)
            for value in (.3, .35, .6):
                metadata.write_text(json.dumps({"noiseScale": value}))
                self.assertEqual(model_noise_scale(model), value)
            for value in (None, True, "bad", 0, -1, 2, float("nan"), float("inf")):
                metadata.write_text(json.dumps({"noiseScale": value}))
                self.assertEqual(model_noise_scale(model), DEFAULT_NOISE_SCALE)
            for text in ("{", "null", "[]"):
                metadata.write_text(text)
                self.assertEqual(model_noise_scale(model), DEFAULT_NOISE_SCALE)

    def test_noise_changes_without_changing_mean_mask_or_other_models(self):
        class Prior(torch.nn.Module):
            def forward(self, mean, log_std, mask):
                return mean, log_std, mask

        for dtype in (torch.float32, torch.float16):
            with self.subTest(dtype=dtype):
                prior = Prior()
                other = Prior()
                mean = torch.linspace(-1, 1, 256, dtype=dtype)
                log_std = torch.linspace(-2, 1, 256, dtype=dtype)
                original = log_std.clone()
                mask = torch.tensor([1, 0] * 128, dtype=dtype)
                hook = configure_synthesis_noise(SimpleNamespace(enc_p=prior), .3)
                m, logs, uv = prior(mean, log_std, mask)
                self.assertIs(m, mean)
                self.assertIs(uv, mask)
                self.assertEqual(logs.dtype, dtype)
                torch.testing.assert_close(log_std, original)
                torch.testing.assert_close(other(mean, log_std, mask)[1], original)
                # Actual upstream sampling equation: the residual must match
                # the configured noise multiplier, including silent frames.
                noise = torch.linspace(-2, 2, 256, dtype=dtype)
                expected = (mean + log_std.exp() * noise * .3) * mask
                actual = (m + logs.exp() * noise * UPSTREAM_NOISE_SCALE) * uv
                torch.testing.assert_close(actual, expected, atol=.002, rtol=.002)
                hook.remove()
                self.assertIs(prior(mean, log_std, mask)[1], log_std)


if __name__ == "__main__":
    unittest.main()
