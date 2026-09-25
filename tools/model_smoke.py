"""Run a short offline conversion for every mounted operator model."""

import argparse
import gc
import json
import os
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "rvc-service"))


def main(args):
    os.environ.setdefault("RVC_OFFICIAL_ROOT", r"D:\数据\rvc-runtime\official-rvc")
    os.environ.setdefault("RVC_RUNTIME_CACHE", r"D:\rvc-cache")
    os.environ.setdefault("CUBLAS_WORKSPACE_CONFIG", ":4096:8")
    from app.official_runtime import OfficialRvcModel
    from app.audio_repair import repair_vocal_file, protect_true_peak
    import torch

    args.output.mkdir(parents=True, exist_ok=True)
    input_audio, rate = sf.read(args.input, dtype="float32")
    if input_audio.ndim > 1:
        input_audio = input_audio.mean(axis=1)
    if rate != 16000:
        input_audio = resample_poly(input_audio, 16000, rate)
    input_audio = input_audio[:round(16000 * args.seconds)]
    expected_duration = len(input_audio) / 16000
    short_input = args.output / "smoke-input-16k.wav"
    sf.write(short_input, input_audio, 16000)
    models = sorted(path for path in args.models.rglob("*.pth") if not any(
        part.startswith("backup_") or part.endswith("_candidates") for part in path.relative_to(args.models).parts
    ))
    if args.only:
        models = [path for path in models if path.parent.name in args.only or path.stem in args.only]
    report = []
    for number, path in enumerate(models, 1):
        name = path.parent.name if path.stem == "model" else path.stem
        indexes = list(path.parent.glob("*.index"))
        index = next((item for item in indexes if item.stem == path.stem), indexes[0] if len(indexes) == 1 else None)
        output = args.output / f"{name}.wav"
        item = {"model": name, "index": bool(index), "status": "failed"}
        model = None
        try:
            model = OfficialRvcModel(path, str(index) if index else "")
            model.infer(short_input, output, pitch=0, f0_method="rmvpe",
                        index_rate=.3 if index else 0., protect=.25,
                        resample_rate=0, rms_mix_rate=1., filter_radius=0)
            repair_vocal_file(output)
            protect_true_peak(output)
            audio, output_rate = sf.read(output, dtype="float32")
            duration = len(audio) / output_rate
            true_peak = float(np.max(np.abs(resample_poly(audio, 4, 1))))
            if not np.isfinite(audio).all() or abs(duration - expected_duration) > .15 or true_peak > .899:
                raise ValueError(f"quality gate: duration={duration:.3f}, true_peak={true_peak:.3f}")
            item.update(status="passed", duration=round(duration, 3), true_peak=round(true_peak, 4))
        except Exception as error:
            item["error"] = str(error)[:300]
        finally:
            report.append(item)
            (args.output / "model-smoke.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
            print(f"[{number}/{len(models)}] {name}: {item['status']}", flush=True)
            del model
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
    if any(item["status"] != "passed" for item in report):
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--models", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--seconds", type=float, default=2)
    parser.add_argument("--only", nargs="*")
    main(parser.parse_args())
