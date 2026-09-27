"""Pitch adapter for the pinned upstream pipeline; retain unvoiced frames.

Continuous pitch may exceed the training embedding range. Only the coarse
embedding is bounded: clamping continuous pitch flattens high notes.
"""
import os
from pathlib import Path

import numpy as np
from app.inference_errors import PitchExtractionError


def sanitize_pitch(values):
    result = np.asarray(values, dtype=np.float64).reshape(-1).copy()
    result[~np.isfinite(result) | (result < 40) | (result > 2000)] = 0
    return result


def repair_octave_glitches(values):
    result = sanitize_pitch(values)
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


def repair_waveform_octave_drops(values, audio, sample_rate, hop):
    """Correct short octave-down islands only with supporting waveform periods.

    Synthetic vowels can confuse neural trackers for longer than 30 ms. A
    real lower note has negative/weak correlation at half its period, so never
    extend contour-only interpolation to these longer islands.
    """
    original = np.asarray(values, dtype=np.float64)
    result = original.copy()
    samples = np.asarray(audio, dtype=np.float64)
    tolerance = 2 ** (3 / 12)
    max_frames = max(1, int(0.4 * sample_rate / hop))
    radius = max(1, round(0.02 * sample_rate))
    i = 1
    while i < len(original) - 1:
        lower, before = original[i], original[i - 1]
        # A tracker may pass through a few ambiguous intermediate frames
        # before landing an octave low. Never search across an unvoiced gap.
        if lower > 0 and before > 0 and before / lower > 1.3:
            for index in range(i - 1, max(-1, i - 7), -1):
                if original[index] <= 0:
                    break
                if 2 / tolerance < original[index] / lower < 2 * tolerance:
                    before = original[index]
                    break
        if lower <= 0 or before <= 0 or not 2 / tolerance < before / lower < 2 * tolerance:
            i += 1
            continue
        end = i
        while end < len(original) and end - i <= max_frames:
            value = original[end]
            if value <= 0 or not 1 / tolerance < value / lower < tolerance:
                break
            end += 1
        if (end < len(original) and end - i <= max_frames and original[end] > 0
                and 1 / tolerance < original[end] / before < tolerance
                and 2 / tolerance < original[end] / lower < 2 * tolerance):
            for frame in range(i, end):
                target = original[frame] * 2
                if target > 2000:
                    continue
                center = frame * hop
                segment = samples[max(0, center - radius):min(len(samples), center + radius)]
                segment = segment - np.mean(segment) if segment.size else segment
                if not np.isfinite(segment).all() or not segment.size or np.mean(segment ** 2) < 1e-8:
                    continue
                def correlation(hz):
                    lag = max(1, round(sample_rate / hz))
                    if len(segment) < 3 * lag:
                        return -1.0
                    a, b = segment[:-lag], segment[lag:]
                    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-12)
                higher = correlation(target)
                if higher >= 0.80 and higher >= correlation(original[frame]) - 0.03:
                    result[frame] = target
        i = max(i + 1, end)
    return result


def median_smooth_pitch(f0, radius=1):
    """Restore the post-F0 median filter that upstream 2.3.260718 removed.

    Tracker flutter (single-frame pitch spikes between voiced frames) reads as
    hoarseness/metallic roughness after synthesis. A 3-tap median over voiced
    frames removes exactly that, while vibrato and glissandi - which span many
    frames - pass untouched. Windows touching an unvoiced frame keep their
    original value, so silence, breaths and voiced boundaries never drift.
    """
    values = np.asarray(f0, dtype=np.float64)
    if values.size < 3 or radius <= 0:
        return values
    result = values.copy()
    for _ in range(min(int(radius), 3)):
        voiced = result > 0
        interior = voiced & np.roll(voiced, 1) & np.roll(voiced, -1)
        interior[0] = False
        interior[-1] = False
        if not np.any(interior):
            break
        stacked = np.vstack((np.roll(result, 1), result, np.roll(result, -1)))
        smoothed = np.median(stacked, axis=0)
        result = np.where(interior, smoothed, result)
    return result


def extract_pitch(pipeline, x, p_len, f0_method):
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
        estimator = pipeline.model_rmvpe
        if (getattr(pipeline, 'diagnostic_f0_dir', None) is not None
                or getattr(pipeline, 'observe_pitch_confidence', False)):
            # Same operations as the pinned infer_from_audio(), with the
            # estimator's salience observed before decode. It is evidence,
            # not a calibrated probability or permission to rewrite melody.
            hidden = estimator.mel2hidden(estimator.extract_mel(x, center=True))
            if hasattr(hidden, 'detach'):
                hidden = hidden.squeeze(0).detach().cpu().numpy()
            else:
                hidden = hidden[0]
            hidden = np.asarray(hidden, dtype=np.float32)
            pipeline.pitch_confidence = np.max(hidden, axis=1)
            pipeline.pitch_confidence_kind = 'rmvpe-maximum-salience-not-calibrated'
            f0 = estimator.decode(hidden, thred=0.03)
        else:
            f0 = estimator.infer_from_audio(x, thred=0.03)
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
    return f0


def safe_get_f0(pipeline, x, p_len, f0_up_key, f0_method):
    pipeline.pitch_confidence = None
    pipeline.pitch_confidence_kind = 'unavailable'
    try:
        f0 = extract_pitch(pipeline, x, p_len, f0_method)
    except (RuntimeError, ValueError, OSError) as error:
        raise PitchExtractionError(str(error)) from error
    raw_f0 = np.asarray(f0).reshape(-1).copy()
    f0 = sanitize_pitch(raw_f0)
    f0 = np.pad(f0[:p_len], (0, max(0, p_len - len(f0))))
    numeric_f0 = f0.copy()
    contour_enabled = bool(getattr(pipeline, 'enable_contour_octave_repair', False))
    evidence_reason = ''
    if contour_enabled:
        # Contour shape alone cannot decide whether a short octave is music.
        # Offline callers must provide independently verified frame evidence.
        evidence = np.asarray(getattr(pipeline, 'contour_evidence_mask', []), dtype=bool)
        evidence_reason = str(getattr(pipeline, 'contour_evidence_reason', '')).strip()
        if evidence.shape != f0.shape or not evidence_reason:
            raise ValueError('Contour repair requires aligned independent evidence and a reason')
        proposal = repair_octave_glitches(f0)
        f0 = np.where(evidence, proposal, f0)
    contour_f0 = f0.copy()
    # Half-period correlation cannot distinguish an octave error from a real
    # lower note with a stronger second harmonic. Leave this experimental
    # repair off unless a caller explicitly supplies independent evidence.
    if getattr(pipeline, "enable_waveform_octave_repair", False):
        f0 = repair_waveform_octave_drops(f0, x, pipeline.sr, pipeline.window)
    f0 = median_smooth_pitch(f0, int(getattr(pipeline, "pitch_median_radius", 0) or 0))
    corrected_f0 = f0.copy()
    f0 *= 2 ** (f0_up_key / 12)
    diagnostic_dir = getattr(pipeline, "diagnostic_f0_dir", None)
    if diagnostic_dir is not None:
        target = Path(diagnostic_dir)
        target.mkdir(parents=True, exist_ok=True)
        number = int(getattr(pipeline, "diagnostic_f0_count", 0))
        pipeline.diagnostic_f0_count = number + 1
        np.savez_compressed(
            target / f"f0-{number:03d}-{f0_method}.npz",
            raw=raw_f0, numeric=numeric_f0, contour=contour_f0, corrected=corrected_f0,
            shifted=f0, voiced=corrected_f0 > 0,
            raw_voiced=np.isfinite(raw_f0) & (raw_f0 > 0),
            confidence_available=pipeline.pitch_confidence is not None,
            confidence=(pipeline.pitch_confidence if pipeline.pitch_confidence is not None else np.array([])),
            confidence_kind=pipeline.pitch_confidence_kind,
            contour_enabled=contour_enabled, contour_evidence=evidence_reason,
            changed_frames=np.flatnonzero(corrected_f0 != numeric_f0),
            hop=pipeline.window, sample_rate=pipeline.sr,
            semitones=f0_up_key, method=f0_method,
            time_origin_seconds=getattr(pipeline, 'time_origin_seconds', 0),
            padding_samples=getattr(pipeline, 't_pad', 0),
        )
    # The embedding ceiling is not a pitch ceiling. Folding frames above it
    # changes the melody and creates artificial octave/glide transitions.
    # Preserve continuous NSF pitch, including the requested transposition.
    return quantize_pitch(f0), f0
