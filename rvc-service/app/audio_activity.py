"""Conservative source-activity evidence for synthesized vocal silence."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.ndimage import binary_erosion, gaussian_filter1d, percentile_filter

from app.audio_dynamics import envelope


def classify_activity(source: np.ndarray, rate: int) -> tuple[np.ndarray, np.ndarray, dict]:
    """Return a silence-only guard and four diagnostic activity states.

    Periodicity is a coarse spectral indicator, never a gating decision. Only
    sustained near-digital-zero source cores are suppressed. This avoids
    treating a quiet breath or an unvoiced consonant as absent singing.
    """
    times, rms = envelope(source, rate)
    if not len(rms):
        return times, np.ones(0), {"states": {}}
    local_floor = percentile_filter(rms, percentile=20, size=501, mode="nearest")
    definite_silence = rms <= 1e-6
    weak = ~definite_silence & (rms <= np.maximum(.003, local_floor * 3))
    periodic = np.zeros(len(rms), dtype=bool)
    mono = np.mean(source, axis=1) if source.ndim == 2 else source
    window = max(256, round(rate * .04))
    for frame in range(0, len(rms), 10):
        if definite_silence[frame] or weak[frame]:
            continue
        center = min(len(mono) - 1, round(times[frame] * rate))
        start = max(0, center - window // 2)
        segment = mono[start:start + window]
        if len(segment) < window:
            continue
        power = np.abs(np.fft.rfft(segment * np.hanning(window))) ** 2 + 1e-15
        # Speech/singing tends to have a concentrated spectrum, whereas
        # uncertain noise is flatter. The label is explanatory only.
        flatness = np.exp(np.mean(np.log(power))) / np.mean(power)
        periodic[frame:min(frame + 10, len(rms))] = flatness < .18
    states = np.full(len(rms), "uncertain", dtype="<U9")
    states[periodic] = "periodic"
    states[weak] = "weak"
    states[definite_silence] = "silence"
    # A 180 ms margin sits *inside* the source silence on both sides of every
    # phrase. Gaussian smoothing affects only this already-silent margin.
    core = (np.ones_like(definite_silence, dtype=bool) if np.all(definite_silence)
            else binary_erosion(definite_silence, iterations=18, border_value=0))
    attenuation = gaussian_filter1d(core.astype(np.float64), sigma=3)
    gains = np.clip(1 - attenuation, 0, 1)
    details = {
        "states": {name: int(np.count_nonzero(states == name)) for name in
                   ("silence", "weak", "periodic", "uncertain")},
        "frameHopSeconds": round(float(times[1] - times[0]), 6) if len(times) > 1 else 0,
        "silenceCoreSeconds": round(float(np.count_nonzero(core)) * .01, 3),
        "applied": bool(np.any(core)),
        "rule": "Only source RMS <= 1e-6 for a sustained core, with 180 ms protected edges",
    }
    return times, gains, details


def suppress_silent_synthesis(converted_path: Path, source_path: Path) -> dict:
    source, source_rate = sf.read(source_path, dtype="float32", always_2d=False)
    if not np.isfinite(source).all():
        raise ValueError("Non-finite source audio")
    with sf.SoundFile(converted_path) as converted:
        if abs(len(source) / source_rate - len(converted) / converted.samplerate) > .2:
            raise ValueError("Source and synthesized audio duration mismatch")
        times, gains, details = classify_activity(source, source_rate)
        if not details["applied"]:
            return details
        staged = converted_path.with_name(converted_path.stem + "-activity.wav")
        try:
            with sf.SoundFile(staged, mode="w", samplerate=converted.samplerate,
                              channels=converted.channels, subtype="FLOAT") as target:
                position = 0
                while True:
                    block = converted.read(65536, dtype="float32", always_2d=True)
                    if not len(block):
                        break
                    if not np.isfinite(block).all():
                        raise ValueError("Non-finite synthesized vocal")
                    sample_times = (position + np.arange(len(block))) / converted.samplerate
                    local_gain = np.interp(sample_times, times, gains, left=1, right=1)
                    target.write(block * local_gain[:, None])
                    position += len(block)
            # Windows keeps the original WAV locked until its reader closes.
            converted.close()
            staged.replace(converted_path)
        finally:
            staged.unlink(missing_ok=True)
    return details
