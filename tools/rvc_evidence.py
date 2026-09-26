"""Signal-only regression inventory; does not infer subjective sound quality."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from pathlib import Path

import numpy as np
from scipy.signal import resample_poly


def decoded_audio(path: Path, rate: int = 44100) -> np.ndarray:
    probe = json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-select_streams", "a:0",
        "-show_entries", "stream=channels", "-of", "json", str(path),
    ]))
    channels = int(probe["streams"][0]["channels"])
    raw = subprocess.check_output([
        "ffmpeg", "-nostdin", "-v", "error", "-i", str(path),
        "-ar", str(rate), "-f", "f32le", "-",
    ])
    return np.frombuffer(raw, dtype="<f4").copy().reshape(-1, channels)


def intervals(mask: np.ndarray, hop_seconds: float, minimum_seconds: float = 0.3):
    edges = np.flatnonzero(np.diff(np.r_[False, mask, False].astype(np.int8)))
    return [
        {"start": round(start * hop_seconds, 3), "end": round(stop * hop_seconds, 3)}
        for start, stop in edges.reshape(-1, 2)
        if (stop - start) * hop_seconds >= minimum_seconds
    ]


def analyze(path: Path) -> dict:
    rate = 44100
    audio = decoded_audio(path, rate)
    mono = np.mean(audio, axis=1)
    hop = rate // 10
    blocks = np.pad(mono, (0, (-len(mono)) % hop)).reshape(-1, hop)
    levels = np.sqrt(np.mean(blocks.astype(np.float64) ** 2, axis=1))
    peak = max(float(np.max(np.abs(audio))), 1e-12)
    true_peak = 0.0
    for start in range(0, len(audio), rate * 4):
        section = audio[max(0, start - 64):min(len(audio), start + rate * 4 + 64)]
        raised = resample_poly(section, 4, 1, axis=0)
        true_peak = max(true_peak, float(np.max(np.abs(raised))))
    return {
        "file": str(path),
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "decodedFrames44100": len(audio),
        "channels": audio.shape[1],
        "durationSeconds": round(len(audio) / rate, 6),
        "samplePeakDbfs": round(20 * np.log10(peak), 2),
        "truePeak4xDbfs": round(20 * np.log10(max(true_peak, 1e-12)), 2),
        "fullScaleClipSamples": int(np.count_nonzero(np.abs(audio) >= 1)),
        "rms100msBelowMinus60Fraction": round(float(np.mean(levels < 1e-3)), 4),
        "rms100msBelowMinus70Fraction": round(float(np.mean(levels < 10 ** (-70 / 20))), 4),
        "belowMinus70Spans": intervals(levels < 10 ** (-70 / 20), .1),
        "nonFiniteSamples": int(np.count_nonzero(~np.isfinite(audio))),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("files", nargs="+", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = {path.name: analyze(path) for path in args.files}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: {k: v for k, v in value.items() if k != "belowMinus70Spans"}
                      for key, value in report.items()}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
