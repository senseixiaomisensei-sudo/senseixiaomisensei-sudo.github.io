"""Produce reproducible RVC audio diagnostics, including DNSMOS P.835 proxy scores."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import onnxruntime as ort
import soundfile as sf
from scipy.signal import resample_poly


DNSMOS_RATE = 16_000
DNSMOS_SECONDS = 9.01


def load_mono(path: Path) -> tuple[np.ndarray, int]:
    audio, sample_rate = sf.read(path, always_2d=True, dtype="float32")
    return np.mean(audio, axis=1, dtype=np.float32), sample_rate


def band_power(audio: np.ndarray, sample_rate: int, low: float, high: float) -> float:
    window = np.hanning(len(audio))
    spectrum = np.abs(np.fft.rfft(audio * window)) ** 2
    frequencies = np.fft.rfftfreq(len(audio), 1 / sample_rate)
    return float(np.sum(spectrum[(frequencies >= low) & (frequencies < high)]))


def dnsmos_scores(audio: np.ndarray, sample_rate: int, model_path: Path) -> dict[str, float]:
    if sample_rate != DNSMOS_RATE:
        divisor = np.gcd(sample_rate, DNSMOS_RATE)
        audio = resample_poly(audio, DNSMOS_RATE // divisor, sample_rate // divisor).astype(np.float32)
    target = int(DNSMOS_SECONDS * DNSMOS_RATE)
    if len(audio) == 0:
        raise ValueError("empty audio")
    while len(audio) < target:
        audio = np.concatenate([audio, audio])
    session = ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])
    input_name = session.get_inputs()[0].name
    raw_scores = []
    for start in range(0, len(audio) - target + 1, DNSMOS_RATE):
        segment = audio[start : start + target][None, :].astype(np.float32, copy=False)
        raw_scores.append(session.run(None, {input_name: segment})[0][0])
    sig_raw, bak_raw, ovr_raw = np.mean(raw_scores, axis=0)
    sig = np.poly1d([-0.08397278, 1.22083953, 0.0052439])(sig_raw)
    bak = np.poly1d([-0.13166888, 1.60915514, -0.39604546])(bak_raw)
    ovr = np.poly1d([-0.06766283, 1.11546468, 0.04602535])(ovr_raw)
    return {
        "dnsmos_sig": float(sig),
        "dnsmos_bak": float(bak),
        "dnsmos_ovrl": float(ovr),
    }


def audit(path: Path, dnsmos_model: Path | None) -> dict[str, object]:
    audio, sample_rate = load_mono(path)
    body = band_power(audio, sample_rate, 300, 1500)
    voice = band_power(audio, sample_rate, 150, min(6000, sample_rate / 2))
    harsh = band_power(audio, sample_rate, 3000, min(6000, sample_rate / 2))
    high = band_power(audio, sample_rate, 6000, min(10000, sample_rate / 2))
    peak = float(np.max(np.abs(audio))) if len(audio) else 0.0
    rms = float(np.sqrt(np.mean(audio ** 2))) if len(audio) else 0.0
    result: dict[str, object] = {
        "file": str(path),
        "sample_rate": sample_rate,
        "duration_seconds": len(audio) / sample_rate,
        "peak": peak,
        "rms": rms,
        "crest_factor": peak / max(rms, 1e-12),
        "clipped_samples": int(np.count_nonzero(np.abs(audio) >= 0.999)),
        "non_finite_samples": int(np.count_nonzero(~np.isfinite(audio))),
        "harsh_to_body_ratio": harsh / max(body, 1e-20),
        "high_to_voice_ratio": high / max(voice, 1e-20),
    }
    if dnsmos_model:
        result.update(dnsmos_scores(audio, sample_rate, dnsmos_model))
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("files", nargs="+", type=Path)
    parser.add_argument("--dnsmos-model", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    rows = [audit(path.resolve(), args.dnsmos_model.resolve() if args.dnsmos_model else None) for path in args.files]
    payload = json.dumps(rows, ensure_ascii=False, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload + "\n", encoding="utf-8")
    print(payload)


if __name__ == "__main__":
    main()
