"""Isolated PyMSS worker for one vocal/instrumental separation request."""

from __future__ import annotations

import argparse
import json
import os
import threading
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from pymss import create_separator, load_audio

_lock = threading.Lock()
_resident = None


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


def separate_file(source: Path, output_dir: Path, model_dir: Path, model_name: str,
                  device: str, revision: tuple | None = None) -> dict:
    global _resident
    source, output_dir, model_dir = source.resolve(), output_dir.resolve(), model_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    if not source.is_file() or not model_dir.is_dir():
        raise FileNotFoundError("Separation input or model directory is missing")

    if device == "cuda" and not torch.cuda.is_available():
        device = "cpu"
    mix, sample_rate = load_audio(str(source), sr=44100, mono=False)

    def create():
        return create_separator(
            model_name,
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
                "overlap_size": int(os.getenv("RVC_SEPARATOR_OVERLAP", "264600") or 264600),
                "standardize": False,
                "normalize": False,
                "use_amp": device == "cuda",
            },
        )
    if revision is None or device != 'cuda':
        with create() as separator:
            results = separator.separate(mix, pbar=False)
    else:
        # Keep one model in system RAM between requests. The GPU is shared
        # with RVC and speech, so no separator weights stay on it when idle.
        with _lock:
            if _resident is None or _resident[0] != revision:
                if _resident is not None:
                    _resident[1].close()
                    _resident = None
                _resident = (revision, create())
            separator = _resident[1]
            try:
                separator.model.to(device)
                results = separator.separate(mix, pbar=False)
            finally:
                try:
                    separator.model.to('cpu')
                except Exception:
                    _resident = None
                    separator.close()
                    raise
                finally:
                    torch.cuda.empty_cache()

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
    return {
        "vocals": str(vocals_path),
        "instrumental": str(instrumental_path),
        "sampleRate": sample_rate,
        "device": device,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--model-dir", type=Path, required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--device", default="cuda")
    args = parser.parse_args()
    print(json.dumps(separate_file(args.input,args.output_dir,args.model_dir,args.model,args.device),ensure_ascii=True))


if __name__ == "__main__":
    main()
