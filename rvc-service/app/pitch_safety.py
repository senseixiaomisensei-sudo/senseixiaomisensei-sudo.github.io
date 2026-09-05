"""Pitch adapter for the pinned upstream pipeline; retain unvoiced frames.

Continuous pitch may exceed the training embedding range. Only the coarse
embedding is bounded: clamping continuous pitch flattens high notes.
"""
import os

import numpy as np


def repair_octave_glitches(values):
    result = np.asarray(values, dtype=np.float64).copy()
    result[~np.isfinite(result) | (result < 40) | (result > 2000)] = 0
    original = result.copy()
    # Correct only <=30 ms islands bounded by matching voiced pitches.
    # Never bridge silence, sustained register changes or smooth glissandi.
    i = 1
    while i < len(original) - 1:
        left = original[i - 1]
        if left <= 0 or original[i] <= 0:
            i += 1
            continue
        for width in (1, 2, 3):
            end = i + width
            if end >= len(original) or original[end] <= 0:
                break
            right = original[end]
            if abs(12 * np.log2(right / left)) > 1:
                continue
            island = original[i:end]
            if np.any(island <= 0):
                break
            offset = 12 * np.log2(island / np.sqrt(left * right))
            if np.all(np.abs(offset - 12) < 1) or np.all(np.abs(offset + 12) < 1):
                result[i:end] = np.geomspace(left, right, width + 2)[1:-1]
                i = end - 1
                break
        i += 1
    return result


def quantize_pitch(f0):
    lower, upper = 1127 * np.log1p(np.array([50, 1100]) / 700)
    mel = 1127 * np.log1p(np.maximum(f0, 0) / 700)
    return np.rint(np.clip((mel - lower) * 254 / (upper - lower) + 1, 1, 255)).astype(np.int32)


def safe_get_f0(pipeline, x, p_len, f0_up_key, f0_method):
    if f0_method == "pm":
        import parselmouth
        track = parselmouth.Sound(np.asarray(x, dtype=np.float64), pipeline.sr).to_pitch_ac(
            time_step=pipeline.window / pipeline.sr, voicing_threshold=0.6,
            pitch_floor=40, pitch_ceiling=2000,
        )
        times = np.arange(p_len) * pipeline.window / pipeline.sr
        indices = np.rint((times - track.x1) / track.dx).astype(int)
        valid = (indices >= 0) & (indices < track.nx)
        f0 = np.zeros(p_len)
        f0[valid] = track.selected_array["frequency"][indices[valid]]
    elif f0_method == "rmvpe":
        if not hasattr(pipeline, "model_rmvpe"):
            from infer.rmvpe import RMVPE
            pipeline.model_rmvpe = RMVPE(
                os.path.join(os.environ["rmvpe_root"], "rmvpe.pt"),
                is_half=pipeline.is_half, device=pipeline.device,
            )
        f0 = pipeline.model_rmvpe.infer_from_audio(x, thred=0.03)
    elif f0_method == "fcpe":
        import torch
        if not hasattr(pipeline, "model_fcpe"):
            from infer.fcpe import FCPEInfer
            pipeline.model_fcpe = FCPEInfer(pipeline.device)
        f0 = pipeline.model_fcpe.infer(
            torch.from_numpy(x).unsqueeze(0).float(), sr=pipeline.sr,
            decoder_mode="local_argmax", threshold=0.006,
        ).squeeze().detach().cpu().numpy()
    else:
        raise ValueError(f"Unsupported F0 method: {f0_method}")
    f0 = repair_octave_glitches(np.asarray(f0).reshape(-1))
    f0 = np.pad(f0[:p_len], (0, max(0, p_len - len(f0))))
    f0 *= 2 ** (f0_up_key / 12)
    return quantize_pitch(f0), f0
