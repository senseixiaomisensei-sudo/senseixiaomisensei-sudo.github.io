"""Export an RVC checkpoint with an explicit, caller-controlled noise tensor.

The upstream RVC ONNX path exposes ``rnd`` as an input. Keeping random noise
inside the graph makes identical conversions vary between runs and prevents a
browser client from choosing a conservative noise scale.
"""

from __future__ import annotations

import argparse
import io
from pathlib import Path

import torch
from torch import nn
from torch.nn import functional as F
from rvc_python.lib.infer_pack.models import (
    SynthesizerTrnMs256NSFsid,
    SynthesizerTrnMs768NSFsid,
)


class ExplicitNoiseRvc(nn.Module):
    def __init__(self, net: nn.Module, sample_rate: int) -> None:
        super().__init__()
        self.net = net
        self.sample_rate = sample_rate

    def forward(
        self,
        phone: torch.Tensor,
        phone_lengths: torch.Tensor,
        pitch: torch.Tensor,
        nsff0: torch.Tensor,
        sid: torch.Tensor,
        rnd: torch.Tensor,
        source_noise: torch.Tensor,
    ) -> tuple[torch.Tensor, torch.Tensor]:
        g = self.net.emb_g(sid).unsqueeze(-1)
        m_p, logs_p, x_mask = self.net.enc_p(phone, pitch, phone_lengths)
        z_p = (m_p + torch.exp(logs_p) * rnd) * x_mask
        z = self.net.flow(z_p, x_mask, g=g, reverse=True)
        audio = self.decode(z * x_mask, nsff0, g, source_noise)
        sample_rate = torch.tensor([self.sample_rate], dtype=torch.int64)
        return audio, sample_rate

    def decode(
        self,
        latent: torch.Tensor,
        f0: torch.Tensor,
        speaker: torch.Tensor,
        source_noise: torch.Tensor,
    ) -> torch.Tensor:
        """Run the checkpoint decoder with externally supplied NSF noise.

        Every bundled model uses the standard one-harmonic RVC source. The
        equations match upstream SineGen, but the Gaussian source is supplied
        by the caller so ONNX does not hide a second random generator.
        """
        decoder = self.net.dec
        sine_gen = decoder.m_source.l_sin_gen
        if sine_gen.dim != 1:
            raise RuntimeError("Only the standard one-harmonic RVC source is supported")

        f0_column = f0[:, None].transpose(1, 2)
        rad_values = (f0_column / sine_gen.sampling_rate) % 1
        accumulated = torch.cumsum(rad_values, dim=1) * decoder.upp
        accumulated = F.interpolate(
            accumulated.transpose(2, 1),
            scale_factor=decoder.upp,
            mode="linear",
            align_corners=True,
        ).transpose(2, 1)
        rad_values = F.interpolate(
            rad_values.transpose(2, 1),
            scale_factor=decoder.upp,
            mode="nearest",
        ).transpose(2, 1)
        accumulated %= 1
        wrapped = (accumulated[:, 1:, :] - accumulated[:, :-1, :]) < 0
        cumulative_shift = torch.zeros_like(rad_values)
        cumulative_shift[:, 1:, :] = wrapped * -1.0
        sine_waves = torch.sin(torch.cumsum(rad_values + cumulative_shift, dim=1) * 2 * torch.pi)
        sine_waves *= sine_gen.sine_amp
        voiced = (f0_column > sine_gen.voiced_threshold).to(f0_column.dtype)
        voiced = F.interpolate(voiced.transpose(2, 1), scale_factor=decoder.upp, mode="nearest").transpose(2, 1)
        noise_amplitude = voiced * sine_gen.noise_std + (1 - voiced) * sine_gen.sine_amp / 3
        sine_waves = sine_waves * voiced + noise_amplitude * source_noise
        harmonic_source = decoder.m_source.l_tanh(decoder.m_source.l_linear(sine_waves)).transpose(1, 2)

        x = decoder.conv_pre(latent)
        x = x + decoder.cond(speaker)
        for stage in range(decoder.num_upsamples):
            x = F.leaky_relu(x, 0.1)
            x = decoder.ups[stage](x)
            x = x + decoder.noise_convs[stage](harmonic_source)
            combined = decoder.resblocks[stage * decoder.num_kernels](x)
            for kernel in range(1, decoder.num_kernels):
                combined = combined + decoder.resblocks[stage * decoder.num_kernels + kernel](x)
            x = combined / decoder.num_kernels
        x = F.leaky_relu(x, 0.1)
        return torch.tanh(decoder.conv_post(x))


def read_checkpoint(path: Path) -> dict:
    # Passing a file object also works for Windows paths containing non-ASCII
    # characters in older PyTorch builds.
    with path.open("rb") as checkpoint_file:
        return torch.load(io.BytesIO(checkpoint_file.read()), map_location="cpu")


def parse_sample_rate(value: object, config: list[object]) -> int:
    text = str(value or config[-1]).lower()
    if "48" in text or text == "48000":
        return 48_000
    if "32" in text or text == "32000":
        return 32_000
    return 40_000


def export_model(checkpoint_path: Path, output_path: Path, frame_count: int) -> None:
    checkpoint = read_checkpoint(checkpoint_path)
    config = list(checkpoint["config"])
    version = str(checkpoint.get("version", "v1")).lower()
    feature_size = 256 if version == "v1" or int(config[4]) == 256 else 768
    model_class = SynthesizerTrnMs256NSFsid if feature_size == 256 else SynthesizerTrnMs768NSFsid

    net = model_class(*config, is_half=False)
    if hasattr(net, "enc_q"):
        delattr(net, "enc_q")
    load_result = net.load_state_dict(checkpoint["weight"], strict=False)
    unexpected = [name for name in load_result.unexpected_keys if not name.startswith("enc_q.")]
    missing = [name for name in load_result.missing_keys if not name.startswith("enc_q.")]
    if unexpected or missing:
        raise RuntimeError(f"Checkpoint mismatch: missing={missing}, unexpected={unexpected}")
    net.eval()

    sample_rate = parse_sample_rate(checkpoint.get("sr"), config)
    wrapper = ExplicitNoiseRvc(net, sample_rate).eval()
    phone = torch.randn(1, frame_count, feature_size, dtype=torch.float32)
    phone_lengths = torch.tensor([frame_count], dtype=torch.int64)
    pitch = torch.randint(1, 255, (1, frame_count), dtype=torch.int64)
    nsff0 = torch.full((1, frame_count), 220.0, dtype=torch.float32)
    sid = torch.tensor([0], dtype=torch.int64)
    rnd = torch.zeros(1, int(config[2]), frame_count, dtype=torch.float32)
    source_noise = torch.zeros(1, frame_count * int(net.dec.upp), 1, dtype=torch.float32)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with torch.inference_mode():
        torch.onnx.export(
            wrapper,
            (phone, phone_lengths, pitch, nsff0, sid, rnd, source_noise),
            str(output_path),
            input_names=["phone", "phone_lengths", "pitch", "nsff0", "sid", "rnd", "source_noise"],
            output_names=["audio", "sr"],
            dynamic_axes={
                "phone": {1: "phone_len"},
                "pitch": {1: "phone_len"},
                "nsff0": {1: "phone_len"},
                "rnd": {2: "phone_len"},
                "source_noise": {1: "audio_len"},
                "audio": {2: "audio_len"},
            },
            opset_version=17,
            do_constant_folding=False,
        )

    print(
        f"exported={output_path} bytes={output_path.stat().st_size} "
        f"version={version} feature_size={feature_size} sample_rate={sample_rate}"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("checkpoint", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--frames", type=int, default=100)
    args = parser.parse_args()
    export_model(args.checkpoint.resolve(), args.output.resolve(), args.frames)


if __name__ == "__main__":
    main()
