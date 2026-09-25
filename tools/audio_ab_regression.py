"""Reproducible local RVC A/B probe; never used by the production service.

Run with the operator's official RVC virtualenv. Outputs stay under the
operator-selected directory so no customer audio is added to the repository.
"""

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from types import MethodType, ModuleType

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly, stft

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "rvc-service"))


def historical_module(commit, path, module_name):
    source = subprocess.check_output(
        ["git", "show", f"{commit}:{path}"],
        cwd=ROOT, text=True, encoding="utf-8",
    )
    module = ModuleType(module_name)
    module.__package__ = "app"
    sys.modules[module_name] = module
    exec(compile(source, f"{commit}:{path}", "exec"), module.__dict__)
    return module


def metrics(path):
    data, rate = sf.read(path, dtype="float64")
    if data.ndim > 1:
        data = data.mean(axis=1)
    if not np.isfinite(data).all():
        raise ValueError(f"Non-finite samples: {path}")
    length = len(data)
    if not length:
        raise ValueError(f"Empty audio: {path}")
    oversampled = resample_poly(data, 4, 1)
    _, times, spec = stft(data, fs=rate, nperseg=2048, noverlap=1536)
    magnitude = np.abs(spec) + 1e-12
    freqs = np.fft.rfftfreq(2048, 1 / rate)
    centroid = (freqs[:, None] * magnitude).sum(axis=0) / magnitude.sum(axis=0)
    flatness = np.exp(np.log(magnitude).mean(axis=0)) / magnitude.mean(axis=0)
    high = magnitude[(freqs >= 4500) & (freqs <= min(10000, rate / 2))]
    high_energy = np.sqrt(np.mean(high * high, axis=0)) if high.size else np.zeros(magnitude.shape[1])
    high_delta = np.abs(np.diff(high_energy))
    spectral_delta = np.linalg.norm(np.diff(magnitude, axis=1), axis=0) / np.maximum(
        np.linalg.norm(magnitude[:, :-1], axis=0), 1e-9,
    )
    # 20 ms loudness envelope, directly comparable between three variants.
    hop = max(1, round(rate * .02))
    padded = np.pad(data * data, (0, (-length) % hop))
    envelope = np.sqrt(padded.reshape(-1, hop).mean(axis=1))
    # Harmonicity/F0 diagnostic on the first 16 kHz channel; never retune audio.
    import librosa
    short = librosa.resample(data, orig_sr=rate, target_sr=16000)
    f0 = librosa.yin(short, fmin=65, fmax=1100, sr=16000, frame_length=1024, hop_length=160)
    energy = librosa.feature.rms(y=short, frame_length=1024, hop_length=160)[0][:len(f0)]
    voiced = energy > max(.004, float(np.percentile(energy, 65)) * .25)
    f0 = f0[:len(voiced)]
    voiced_f0 = f0[voiced]
    jumps = np.abs(12 * np.diff(np.log2(np.maximum(f0, 1))))
    both_voiced = voiced[1:] & voiced[:-1]
    # YIN confidence proxy: normalized autocorrelation near each estimated F0.
    periodicity = []
    for index in np.flatnonzero(voiced)[::3]:
        center = index * 160
        segment = short[max(0, center - 320):min(len(short), center + 320)]
        lag = int(round(16000 / max(f0[index], 1)))
        if len(segment) > 3 * lag:
            a, b = segment[:-lag], segment[lag:]
            periodicity.append(max(0, float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9))))
    periodicity = np.asarray(periodicity)
    return {
        "duration_s": round(length / rate, 4),
        "sample_rate": rate,
        "sample_peak": round(float(np.max(np.abs(data))), 6),
        "true_peak_4x": round(float(np.max(np.abs(oversampled))), 6),
        "rms": round(float(np.sqrt(np.mean(data * data))), 6),
        "loudness_envelope_p95": round(float(np.percentile(envelope, 95)), 6),
        "loudness_envelope_step_p99": round(float(np.percentile(np.abs(np.diff(envelope)), 99)), 6),
        "spectral_centroid_hz_median": round(float(np.median(centroid)), 1),
        "spectral_flatness_median": round(float(np.median(flatness)), 5),
        "hnr_proxy_db": round(float(10 * np.log10(max(1e-6, np.mean(periodicity)) / max(1e-6, 1 - np.mean(periodicity)))), 2) if periodicity.size else None,
        "f0_hz_median": round(float(np.median(voiced_f0)), 2) if voiced_f0.size else None,
        "f0_confidence_proxy_median": round(float(np.median(periodicity)), 4) if periodicity.size else None,
        "octave_jump_count": int(np.count_nonzero((jumps > 9) & both_voiced)),
        "voiced_unvoiced_transitions": int(np.count_nonzero(np.diff(voiced.astype(int)))),
        "high_frequency_transient_count": int(np.count_nonzero(high_delta > max(.004, float(np.percentile(high_delta, 95)) * 2))) if high_delta.size else 0,
        "spectral_discontinuity_p99": round(float(np.percentile(spectral_delta, 99)), 4) if spectral_delta.size else 0,
    }


def quality_gate(baseline, candidate):
    """Fail on hard defects or obvious regression; never claim perceptual parity."""
    checks = {
        "duration": abs(candidate["duration_s"] - baseline["duration_s"]) <= .03,
        "true_peak": candidate["true_peak_4x"] <= .895,
        "rms": .80 <= candidate["rms"] / max(baseline["rms"], 1e-8) <= 1.25,
        "loudness_envelope": candidate["loudness_envelope_step_p99"] <= baseline["loudness_envelope_step_p99"] * 1.15,
        "octave_jumps": candidate["octave_jump_count"] <= baseline["octave_jump_count"] + 2,
        "voiced_transitions": candidate["voiced_unvoiced_transitions"] <= baseline["voiced_unvoiced_transitions"] + 2,
        "high_frequency_transients": candidate["high_frequency_transient_count"] <= baseline["high_frequency_transient_count"] + 2,
        "spectral_discontinuity": candidate["spectral_discontinuity_p99"] <= baseline["spectral_discontinuity_p99"] * 1.12,
    }
    return checks


def run(args):
    os.environ.setdefault("RVC_OFFICIAL_ROOT", r"D:\数据\rvc-runtime\official-rvc")
    os.environ.setdefault("RVC_RUNTIME_CACHE", r"D:\rvc-cache")
    os.environ.setdefault("CUBLAS_WORKSPACE_CONFIG", ":4096:8")
    from app.official_runtime import OfficialRvcModel
    from app.audio_repair import repair_vocal_file, protect_true_peak

    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    model = OfficialRvcModel(args.model.resolve(), str(args.index.resolve()) if args.index else "")
    from infer.vc.pipeline import Pipeline
    baseline_pitch = historical_module("bf097e4", "rvc-service/app/pitch_safety.py", "ab_baseline_pitch").safe_get_f0
    current_pitch = historical_module("80b7373", "rvc-service/app/pitch_safety.py", "ab_current_pitch").safe_get_f0
    historical_module("80b7373", "rvc-service/app/feature_policy.py", "app.feature_policy")
    adaptive_vc = historical_module("80b7373", "rvc-service/app/adaptive_inference.py", "ab_current_adaptive").adaptive_vc
    current_repair = historical_module("80b7373", "rvc-service/app/audio_repair.py", "ab_current_repair").repair_vocal_file
    from app.pitch_safety import safe_get_f0
    variants = (["baseline", "current", "adaptive_only", "pitch_only"] if args.variant == "all"
                else ["adaptive_only", "pitch_only"] if args.variant == "diagnostic"
                else [args.variant])
    results = {}
    for variant in variants:
        pipeline = model._vc.pipeline
        pipeline.vc = MethodType(adaptive_vc if variant in ("current", "adaptive_only") else Pipeline.vc, pipeline)
        pipeline.get_f0 = MethodType(current_pitch if variant in ("current", "pitch_only") else
                                     safe_get_f0 if variant == "stable" else baseline_pitch, pipeline)
        raw = output / f"{variant}-raw.wav"
        model.infer(args.input.resolve(), raw, pitch=args.pitch, f0_method=args.f0,
                    index_rate=args.index_rate, protect=args.protect,
                    resample_rate=0, rms_mix_rate=1, filter_radius=args.filter_radius)
        final = output / f"{variant}.wav"
        final.write_bytes(raw.read_bytes())
        if variant == "current":
            current_repair(final)
        elif variant == "stable":
            repair_vocal_file(final)
        protect_true_peak(final)
        results[variant] = {"raw": metrics(raw), "final": metrics(final)}
        print(f"{variant}: {final}", flush=True)
    report_path = output / "ab-metrics.json"
    if report_path.exists():
        previous = json.loads(report_path.read_text(encoding="utf-8"))
        results = {**previous.get("results", {}), **results}
    report_path.write_text(json.dumps({
        "baseline_commit": "bf097e4", "current_commit": "80b7373",
        "input": str(args.input), "model": str(args.model),
        "params": {"pitch": args.pitch, "index_rate": args.index_rate,
                   "protect": args.protect, "rms_mix_rate": 1, "f0": args.f0,
                   "noise_seed": 20260823, "filter_radius": args.filter_radius}, "results": results,
    }, indent=2, ensure_ascii=False), encoding="utf-8")
    if "baseline" in results and "stable" in results:
        checks = quality_gate(results["baseline"]["final"], results["stable"]["final"])
        (output / "quality-gate.json").write_text(json.dumps({"passed": all(checks.values()), "checks": checks}, indent=2), encoding="utf-8")
        if not all(checks.values()):
            raise SystemExit("Audio regression gate failed: " + ", ".join(name for name, passed in checks.items() if not passed))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--model", required=True, type=Path)
    parser.add_argument("--index", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--variant", choices=["all", "diagnostic", "baseline", "current", "adaptive_only", "pitch_only", "stable"], default="all")
    parser.add_argument("--pitch", type=int, default=0)
    parser.add_argument("--index-rate", type=float, default=.45)
    parser.add_argument("--protect", type=float, default=.33)
    parser.add_argument("--f0", default="rmvpe")
    parser.add_argument("--filter-radius", type=int, default=0)
    run(parser.parse_args())
