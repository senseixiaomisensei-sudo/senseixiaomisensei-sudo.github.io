"""Transfer short-time dynamics, never the source speaker's waveform."""
from pathlib import Path

import numpy as np
import soundfile as sf


def envelope(audio, rate):
    mono = np.mean(audio, axis=1) if audio.ndim == 2 else audio
    hop = max(1, round(rate * .01))
    radius = max(1, round(rate * .02))
    centers = np.arange(0, len(mono), hop)
    squared = np.concatenate(([0.], np.cumsum(mono.astype(np.float64) ** 2)))
    left = np.maximum(0, centers - radius)
    right = np.minimum(len(mono), centers + radius + 1)
    rms = np.sqrt(np.maximum(0, (squared[right] - squared[left]) / (right - left)))
    return centers / rate, rms


def preserve_dynamics(converted, converted_rate, source, source_rate, strength=.5):
    """Gentle 40 ms envelope matching retains syllable/breath dynamics.

    No source samples are mixed in, and the converted pitch/timbre is kept.
    This does not identify emotions or reconstruct missing model expression.
    """
    converted = np.asarray(converted, dtype=np.float64)
    source = np.asarray(source, dtype=np.float64)
    if not 0 <= strength <= 1:
        raise ValueError('Invalid dynamics strength')
    if strength == 0:
        return converted.copy()
    if not converted.size or not source.size:
        return converted.copy()
    if not np.isfinite(converted).all() or not np.isfinite(source).all():
        raise ValueError('Non-finite audio')
    if min(converted_rate, source_rate) <= 0:
        raise ValueError('Invalid sample rate')
    if abs(len(converted)/converted_rate - len(source)/source_rate) > .2:
        raise ValueError('Source and converted duration mismatch')
    times, target_env = envelope(converted, converted_rate)
    source_times, source_env = envelope(source, source_rate)
    source_env = np.interp(times, source_times, source_env)
    # Match the device path: 1 on the public rms_mix_rate slider preserves the
    # synth, while 0 follows the *absolute* source envelope. Normalising both
    # tracks by their medians made the same 0.5 setting behave differently on
    # cloud and device and could leave converted song vocals far too loud.
    active = (source_env >= .003) & (target_env >= .003)
    ratio = source_env / np.maximum(target_env, 1e-4)
    gain = np.where(active, np.clip(np.power(ratio, strength), .3, 1.6), 1.)
    # Interpolation avoids 10 ms gain steps. Silent frames remain at unity;
    # the separate song-balance step never tries to amplify noise or leakage.
    samples = np.arange(len(converted)) / converted_rate
    gain = np.interp(samples, times, gain)
    return converted * (gain[:, None] if converted.ndim == 2 else gain)


def apply_dynamics(output_path: Path, source_path: Path, strength=.5):
    if strength == 0:
        return
    converted, rate = sf.read(output_path, dtype='float64')
    source, source_rate = sf.read(source_path, dtype='float64')
    result = preserve_dynamics(converted, rate, source, source_rate, strength)
    sf.write(output_path, result, rate, subtype='FLOAT')
