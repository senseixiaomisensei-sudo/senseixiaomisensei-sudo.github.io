"""Isolated PyMSS worker for one vocal/instrumental separation request."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from pymss import create_separator, load_audio


def channel_last(audio: np.ndarray) -> np.ndarray:
    value = np.asarray(audio, dtype=np.float32)
    if value.ndim == 1:
        return value
    if value.ndim != 2:
        raise ValueError(f"Unsupported separated audio shape: {value.shape}")
    if value.shape[0] <= 8 and value.shape[1] > value.shape[0]:
        return value.T
    return value


def find_stem(results: dict[str, np.ndarray], name: str) -> np.ndarray | None:
    wanted = name.casefold()
    for key, value in results.items():
        if str(key).casefold() == wanted:
            return np.asarray(value, dtype=np.float32)
    return None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--model-dir", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--device", default="cuda")
    args = parser.parse_args()

    source = Path(args.input).resolve()
    output_dir = Path(args.output_dir).resolve()
    model_dir = Path(args.model_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    if not source.is_file() or not model_dir.is_dir():
        raise FileNotFoundError("Separation input or model directory is missing")

    device = args.device
    if device == "cuda" and not torch.cuda.is_available():
        device = "cpu"
    mix, sample_rate = load_audio(str(source), sr=44100, mono=False)
    with create_separator(
        args.model,
        model_dir=str(model_dir),
        device=device,
        device_ids=[0],
        output_format="wav",
        use_tta=False,
        store_dirs=str(output_dir),
        save_as_folder=False,
        inference_params={
            "batch_size": 1,
            "chunk_size": 352800,
            "overlap_size": 264600,
            "standardize": False,
            "normalize": False,
            "use_amp": device == "cuda",
        },
    ) as separator:
        results = separator.separate(mix, pbar=False)

    vocals = find_stem(results, "vocals")
    instrumental = find_stem(results, "instrumental")
    if instrumental is None:
        instrumental = find_stem(results, "other")
    if vocals is None:
        raise RuntimeError(f"PyMSS did not return a vocals stem: {sorted(results)}")
    if instrumental is None:
        instrumental = np.asarray(mix, dtype=np.float32) - vocals
    if not np.isfinite(vocals).all() or not np.isfinite(instrumental).all():
        raise FloatingPointError("PyMSS returned non-finite samples")

    vocals_path = output_dir / "vocals.wav"
    instrumental_path = output_dir / "instrumental.wav"
    sf.write(vocals_path, channel_last(vocals), sample_rate, format="WAV", subtype="FLOAT")
    sf.write(instrumental_path, channel_last(instrumental), sample_rate, format="WAV", subtype="FLOAT")
    if vocals_path.stat().st_size <= 44 or instrumental_path.stat().st_size <= 44:
        raise RuntimeError("PyMSS returned an empty stem")
    print(json.dumps({
        "vocals": str(vocals_path),
        "instrumental": str(instrumental_path),
        "sampleRate": sample_rate,
        "device": device,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
