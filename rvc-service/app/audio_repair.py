"""Conservative sample-local repair of synthesized RVC vocals.

Only the converted vocal is processed.  The detector never uses a character
name or a fixed boost/cut for every model, and it does not retune pitch.
"""

from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.ndimage import median_filter
from scipy.signal import resample_poly


def _repair_flat_clips(audio: np.ndarray) -> np.ndarray:
    """Interpolate short, genuine flat-topped runs; leave normal peaks alone."""
    result = audio.copy()
    flat = np.abs(audio) >= 0.995
    edges = np.flatnonzero(np.diff(np.r_[False, flat, False].astype(np.int8)))
    for start, stop in edges.reshape(-1, 2):
        width = stop - start
        if start < 2 or stop + 1 >= len(audio) or not 2 <= width <= 24:
            continue
        plateau = audio[start:stop]
        if np.any(np.sign(plateau) != np.sign(plateau[0])) or np.ptp(plateau) > 0.008:
            continue
        left, right = audio[start - 1], audio[stop]
        if abs(left) >= 0.995 or abs(right) >= 0.995:
            continue
        left_slope = np.clip(left - audio[start - 2], -0.2, 0.2)
        right_slope = np.clip(audio[stop + 1] - right, -0.2, 0.2)
        t = np.arange(1, width + 1, dtype=np.float64) / (width + 1)
        span = width + 1
        result[start:stop] = (
            (2 * t**3 - 3 * t**2 + 1) * left
            + (t**3 - 2 * t**2 + t) * span * left_slope
            + (-2 * t**3 + 3 * t**2) * right
            + (t**3 - t**2) * span * right_slope
        )
    return result


def _repair_isolated_clicks(audio: np.ndarray) -> np.ndarray:
    if len(audio) < 35:
        return audio
    result = audio.copy()
    residual = audio[1:-1] - (audio[:-2] + audio[2:]) * 0.5
    local = median_filter(np.abs(residual), size=31, mode="nearest")
    isolated = (
        (np.abs(residual) > np.maximum(0.18, 8 * local))
        & (np.abs(audio[:-2] - audio[2:]) < np.maximum(0.06, 0.35 * np.abs(residual)))
    )
    positions = np.flatnonzero(isolated) + 1
    # Two adjacent flagged samples can be a real consonant or high note.
    positions = positions[np.r_[True, np.diff(positions) > 2]] if positions.size else positions
    result[positions] = (audio[positions - 1] + audio[positions + 1]) * 0.5
    return result


def repair_vocal(audio: np.ndarray, sample_rate: int) -> np.ndarray:
    """Repair real flat clips and isolated sample clicks without tonal EQ."""
    samples = np.asarray(audio, dtype=np.float64)
    if samples.ndim != 1 or sample_rate <= 0:
        raise ValueError("Expected mono audio and a positive sample rate")
    if samples.size == 0:
        return samples.astype(np.float32)
    samples = np.nan_to_num(samples, nan=0.0, posinf=0.0, neginf=0.0)
    samples = _repair_flat_clips(samples)
    samples = _repair_isolated_clicks(samples)
    # Band subtraction and automatic RMS compression are deliberately
    # bypassed: the same-source A/B did not establish a quality benefit and
    # they changed sustained vowels. Only sample-local defects are repaired.
    return samples.astype(np.float32)


def repair_vocal_file(path: Path) -> None:
    audio, rate = sf.read(path, dtype="float32", always_2d=False)
    if audio.ndim != 1:
        raise ValueError("RVC vocal output must be mono")
    repaired = repair_vocal(audio, rate)
    staged = path.with_name(path.stem + "-repaired.wav")
    try:
        sf.write(staged, repaired, rate, subtype="FLOAT")
        staged.replace(path)
    finally:
        staged.unlink(missing_ok=True)


def protect_true_peak(path: Path, ceiling_dbfs: float = -1.0) -> None:
    """Use a single uniform trim when needed; no sustained limiter pumping."""
    target = 10 ** (ceiling_dbfs / 20) * 0.998
    staged = path.with_name(path.stem + "-tpsafe.wav")
    try:
        with sf.SoundFile(path) as source:
            rate, channels, length = source.samplerate, source.channels, len(source)
            block = max(4096, rate)
            peak = 0.0
            for position in range(0, length, block):
                start = max(0, position - 64)
                source.seek(start)
                segment = source.read(min(length - start, position + block + 64 - start), dtype="float32", always_2d=True)
                raised = resample_poly(segment, 4, 1, axis=0)
                core = raised[(position - start) * 4:(min(position + block, length) - start) * 4]
                if core.size:
                    peak = max(peak, float(np.max(np.abs(core))))
            gain = min(1.0, target / peak) if peak > 0 else 1.0
            source.seek(0)
            # Keep the protected master in float until the final export codec.
            # Quantizing here can introduce distortion before MP3 encoding or
            # an additional remix pass.
            with sf.SoundFile(staged, mode="w", samplerate=rate, channels=channels, subtype="FLOAT") as target_file:
                while True:
                    samples = source.read(block, dtype="float32", always_2d=True)
                    if not len(samples):
                        break
                    target_file.write(np.nan_to_num(samples * gain, nan=0.0, posinf=0.0, neginf=0.0))
        staged.replace(path)
    finally:
        staged.unlink(missing_ok=True)
