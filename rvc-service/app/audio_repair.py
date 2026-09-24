"""Conservative, content-adaptive repair of synthesized RVC vocals.

Only the converted vocal is processed.  The detector never uses a character
name or a fixed boost/cut for every model, and it does not retune pitch.
"""

from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.ndimage import gaussian_filter1d, median_filter, uniform_filter1d
from scipy.signal import butter, resample_poly, sosfiltfilt


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


def _block_rms(audio: np.ndarray, block: int, count: int) -> np.ndarray:
    squared = np.square(audio.astype(np.float64), dtype=np.float64)
    padded = np.pad(squared, (0, count * block - len(audio)))
    return np.sqrt(np.mean(padded.reshape(count, block), axis=1))


def _adaptive_bands(audio: np.ndarray, sample_rate: int) -> np.ndarray:
    """Control abnormal voiced upper harmonics against local and global voice."""
    if len(audio) < sample_rate // 4 or sample_rate < 16000:
        return audio
    block = max(1, round(sample_rate * 0.01))
    count = (len(audio) + block - 1) // block
    body = sosfiltfilt(butter(2, [500, 2500], btype="bandpass", fs=sample_rate, output="sos"), audio)
    body_rms = _block_rms(body, block, count)
    active = body_rms > max(0.008, float(np.percentile(body_rms, 60)) * 0.3)
    if np.count_nonzero(active) < 10:
        return audio
    # Natural fricatives and breaths are noise-like.  Narrow synthetic vowel
    # harmonics have a lower flatness and appear inside a stable voiced run.
    flatness = np.ones(count)
    zcr = np.ones(count)
    radius = max(block, round(sample_rate * 0.02))
    taper = np.hanning(radius * 2)
    for frame in range(count):
        center = frame * block
        segment = audio[max(0, center - radius):min(len(audio), center + radius)]
        if len(segment) < radius:
            continue
        segment = np.pad(segment, (0, max(0, len(taper) - len(segment))))[:len(taper)]
        zcr[frame] = np.mean(np.signbit(segment[1:]) != np.signbit(segment[:-1]))
        spectrum = np.abs(np.fft.rfft(segment * taper))[2:] + 1e-9
        flatness[frame] = np.exp(np.mean(np.log(spectrum))) / np.mean(spectrum)
    voiced = active & (flatness < 0.38) & (zcr < 0.24)
    sustained = uniform_filter1d(voiced.astype(np.float64), size=13, mode="nearest") > 0.75
    if np.count_nonzero(sustained) < 8:
        return audio
    result = audio.copy()
    for low, high, floor, max_cut_db in (
        (2600, 4200, 0.50, 2.5),
        (4200, 6500, 0.35, 2.3),
        (6500, 9000, 0.25, 1.2),
    ):
        high = min(high, sample_rate * 0.45)
        if high <= low + 100:
            continue
        band = sosfiltfilt(butter(2, [low, high], btype="bandpass", fs=sample_rate, output="sos"), audio)
        band_rms = _block_rms(band, block, count)
        ratio = band_rms / (body_rms + 0.01)
        global_baseline = max(floor, float(np.percentile(ratio[sustained], 60)) * 1.18)
        local_baseline = median_filter(ratio, size=101, mode="nearest") * 1.20
        threshold = np.maximum(global_baseline, local_baseline)
        excess = np.maximum(0, np.log2(np.maximum(ratio, 1e-8) / threshold))
        cut_db = max_cut_db * np.minimum(excess, 1.0) * sustained
        cut_db = gaussian_filter1d(cut_db, sigma=4.0, mode="nearest")
        frame_gain = 1 - np.power(10.0, -cut_db / 20.0)
        sample_gain = np.interp(np.arange(len(audio)), np.arange(count) * block, frame_gain)
        result -= band * sample_gain
    return result


def _control_exceptional_peaks(audio: np.ndarray, sample_rate: int) -> np.ndarray:
    block = max(1, round(sample_rate * 0.01))
    count = (len(audio) + block - 1) // block
    levels = _block_rms(audio, block, count)
    active = levels[levels > 0.008]
    if active.size < 10:
        return audio
    threshold = max(0.25, float(np.percentile(active, 80)) * 1.8)
    desired = np.ones(count, dtype=np.float64)
    loud = levels > threshold
    desired[loud] = (threshold + (levels[loud] - threshold) / 1.3) / levels[loud]
    desired = gaussian_filter1d(np.clip(desired, 10 ** (-1.2 / 20), 1), sigma=2.0, mode="nearest")
    gain = np.interp(np.arange(len(audio)), np.arange(count) * block, desired)
    return audio * gain


def repair_vocal(audio: np.ndarray, sample_rate: int) -> np.ndarray:
    """Repair transients and anomalous bands without altering melody or timing."""
    samples = np.asarray(audio, dtype=np.float64)
    if samples.ndim != 1 or sample_rate <= 0:
        raise ValueError("Expected mono audio and a positive sample rate")
    if samples.size == 0:
        return samples.astype(np.float32)
    samples = np.nan_to_num(samples, nan=0.0, posinf=0.0, neginf=0.0)
    samples = _repair_flat_clips(samples)
    samples = _repair_isolated_clicks(samples)
    samples = _adaptive_bands(samples, sample_rate)
    samples = _control_exceptional_peaks(samples, sample_rate)
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
            with sf.SoundFile(staged, mode="w", samplerate=rate, channels=channels, subtype="PCM_16") as target_file:
                while True:
                    samples = source.read(block, dtype="float32", always_2d=True)
                    if not len(samples):
                        break
                    target_file.write(np.nan_to_num(samples * gain, nan=0.0, posinf=0.0, neginf=0.0))
        staged.replace(path)
    finally:
        staged.unlink(missing_ok=True)
