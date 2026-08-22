"""Generate and objectively inspect every administrator-mounted RVC voice.

This is a regression check, not a perceptual quality or licensing certificate.
It intentionally loads only models already present in an operator-controlled
directory; RVC ``.pth`` files are pickle-based and must not come from uploads.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf


def model_id(path: Path, root: Path) -> str:
    if path.parent != root and path.stem in {path.parent.name, "model"}:
        return path.parent.name
    return path.stem


def index_path(model: Path) -> str:
    direct = model.with_suffix(".index")
    if direct.is_file():
        return str(direct)
    matches = sorted(model.parent.glob("*.index"))
    return str(matches[0]) if matches else ""


def audio_metrics(path: Path) -> dict[str, float | int]:
    audio, sample_rate = sf.read(path, dtype="float32", always_2d=False)
    if audio.ndim > 1:
        audio = np.mean(audio, axis=1)
    finite = np.isfinite(audio)
    clean = np.where(finite, audio, 0.0)
    magnitude = np.abs(clean)
    spectrum = np.abs(np.fft.rfft(clean)) ** 2
    frequencies = np.fft.rfftfreq(clean.size, 1 / sample_rate)
    total_power = float(np.sum(spectrum)) or 1.0
    high_power = float(np.sum(spectrum[frequencies >= 8000])) / total_power
    flatness = float(librosa.feature.spectral_flatness(y=clean).mean())
    f0, voiced, _ = librosa.pyin(clean, fmin=50, fmax=min(1100, sample_rate / 2 - 1), sr=sample_rate)
    voiced_f0 = f0[np.isfinite(f0)] if f0 is not None else np.empty(0)
    return {
        "sampleRate": int(sample_rate),
        "durationSeconds": round(clean.size / sample_rate, 4),
        "peak": round(float(magnitude.max(initial=0)), 6),
        "rms": round(float(np.sqrt(np.mean(clean**2))), 6),
        "clipFraction": round(float(np.mean(magnitude >= 0.999)), 8),
        "nonFiniteSamples": int(np.count_nonzero(~finite)),
        "dcOffset": round(float(np.mean(clean)), 8),
        "highFrequencyPowerRatio": round(high_power, 6),
        "spectralFlatness": round(flatness, 6),
        "voicedFraction": round(float(np.mean(voiced)) if voiced is not None else 0.0, 6),
        "medianF0": round(float(np.median(voiced_f0)), 3) if voiced_f0.size else 0.0,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--models-dir", required=True, type=Path)
    parser.add_argument("--official-root", required=True, type=Path)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--pitch", type=int, default=0)
    parser.add_argument("--index-rate", type=float, default=0.3)
    args = parser.parse_args()

    service_root = Path(__file__).resolve().parent.parent / "rvc-service"
    sys.path.insert(0, str(service_root))
    os.environ["RVC_OFFICIAL_ROOT"] = str(args.official_root.resolve())
    models_root = args.models_dir.resolve()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    from app.official_runtime import OfficialRvcModel

    results = []
    for model in sorted(models_root.rglob("*.pth")):
        # Candidate/backup folders are not active website voices.
        relative = model.relative_to(models_root)
        if any(part.startswith("backup_") or part.endswith("_candidates") for part in relative.parts):
            continue
        voice_id = model_id(model, models_root)
        output = args.output_dir / f"{voice_id}.wav"
        index = index_path(model)
        engine = OfficialRvcModel(model, index)
        engine.infer(
            args.input.resolve(),
            output,
            pitch=args.pitch,
            f0_method="rmvpe",
            index_rate=args.index_rate if index else 0.0,
            resample_rate=0,
            rms_mix_rate=1.0,
            protect=0.33,
        )
        metrics = audio_metrics(output)
        passed = (
            metrics["nonFiniteSamples"] == 0
            and metrics["clipFraction"] <= 0.0001
            and 0.01 <= metrics["rms"] <= 0.6
            and metrics["peak"] <= 1.0
        )
        results.append({
            "id": voice_id,
            "model": str(relative).replace("\\", "/"),
            "index": bool(index),
            "output": str(output),
            "passedSignalChecks": passed,
            "metrics": metrics,
        })

    report = {
        "engine": "RVC-Project/Retrieval-based-Voice-Conversion-WebUI",
        "tag": "2.3.260718",
        "commit": "8f2fdbf483955f924b4c87ab34919170d0b704ed",
        "input": str(args.input.resolve()),
        "voices": results,
        "limitations": "Signal checks cannot prove perceptual naturalness, role fidelity, consent, or model rights.",
    }
    report_path = args.output_dir / "report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if results and all(item["passedSignalChecks"] for item in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
