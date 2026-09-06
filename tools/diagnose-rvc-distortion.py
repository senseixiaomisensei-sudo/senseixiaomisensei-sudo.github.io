"""Compare pitch trackers and synthesis on an operator-provided regression clip."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys

import numpy as np
import soundfile as sf

parser = argparse.ArgumentParser()
parser.add_argument("source", type=Path)
parser.add_argument("output", type=Path)
parser.add_argument("--runtime", type=Path, required=True)
parser.add_argument("--models", type=Path, required=True)
parser.add_argument("--model", default="maki")
parser.add_argument("--pitch", type=int, default=0)
parser.add_argument("--methods", nargs="+", default=["rmvpe", "fcpe", "pm"])
args = parser.parse_args()
args.source = args.source.resolve()
args.output = args.output.resolve()
args.output.mkdir(parents=True, exist_ok=True)
os.environ["RVC_OFFICIAL_ROOT"] = str(args.runtime / "official-rvc")
os.environ["RVC_MODELS_DIR"] = str(args.models)
os.environ["RVC_RUNTIME_CACHE"] = "D:/rvc-cache"
os.environ["RVC_WORK_ROOT"] = str(args.output / "work")
os.environ["RVC_OUTPUT_ROOT"] = str(args.output / "output")
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "rvc-service"))
from app import main
from app.official_runtime import OfficialRvcModel
from app.pitch_safety import safe_get_f0

decoded = args.output / "decoded.wav"
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(args.source), "-vn",
                "-ac", "1", "-ar", "16000", "-c:a", "pcm_f32le", str(decoded)], check=True)
normalized = args.output / "normalized.wav"
normalized.unlink(missing_ok=True)
profile = main.normalize_audio(args.source, normalized)
print("PROFILE", profile, flush=True)
model_dir = args.models / args.model
model = OfficialRvcModel(next(model_dir.glob("*.pth")), str(next(model_dir.glob("*.index"), "")))
tracks = {}
rows = []
for label, path in [("decoded", decoded), ("normalized", normalized)]:
    audio, rate = sf.read(path, dtype="float32")
    for method in args.methods:
        _, f0 = safe_get_f0(model._vc.pipeline, audio, len(audio)//160, 0, method)
        tracks[f"{label}-{method}"] = f0.tolist()
        voiced = f0[f0 > 0]
        adjacent = (f0[1:] > 0) & (f0[:-1] > 0)
        steps = np.abs(12 * np.log2(np.maximum(f0[1:], 1) / np.maximum(f0[:-1], 1)))
        row = dict(input=label, method=method, f0_percentiles=np.percentile(voiced, [5,50,95]).tolist(),
                   voiced=float(np.mean(f0>0)), octave_jumps=int(np.sum(adjacent & (steps > 8))))
        out = args.output / f"{args.model}-{label}-{method}-p{args.pitch}.wav"
        model.infer(path, out, pitch=args.pitch, f0_method=method, index_rate=.3,
                    resample_rate=0, rms_mix_rate=1, protect=.25)
        result, sr = sf.read(out)
        row.update(output=str(out), peak=float(np.max(abs(result))),
                   max_step=float(np.max(abs(np.diff(result)))))
        rows.append(row)
        print(json.dumps(row), flush=True)
(args.output / "tracks.json").write_text(json.dumps(tracks), encoding="utf-8")
(args.output / "results.json").write_text(json.dumps(rows, indent=2), encoding="utf-8")
