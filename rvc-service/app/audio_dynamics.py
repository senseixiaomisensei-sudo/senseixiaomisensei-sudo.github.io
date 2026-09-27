"""Transfer short-time dynamics, never the source speaker's waveform."""
from pathlib import Path
import json

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


def preserve_dynamics(converted, converted_rate, source, source_rate, strength=.5, diagnostic_path=None):
    """Gentle 40 ms envelope matching retains syllable/breath dynamics.

    No source samples are mixed in, and the converted pitch/timbre is kept.
    This does not identify emotions or reconstruct missing model expression.
    """
    converted = np.asarray(converted, dtype=np.float64)
    source = np.asarray(source, dtype=np.float64)
    if not 0 <= strength <= 1:
        raise ValueError('Invalid dynamics strength')
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
    # Confidence in an *envelope ratio*, not a voiced/unvoiced gate. Both
    # endpoints are continuous; crossing the old .003 boundary has no special
    # effect. Activity protection owns silence, calibration owns whole-song
    # level, and no source waveform is returned to the output.
    def confidence(env):
        db = 20*np.log10(np.maximum(env, 1e-12))
        x = np.clip((db + 90)/30, 0, 1)
        return x*x*(3-2*x)
    confidence_weight = confidence(source_env)*confidence(target_env)
    ratio_db = 20*np.log10(np.maximum(source_env, 1e-12)/np.maximum(target_env, 1e-12))
    desired_db = confidence_weight*np.clip(strength*ratio_db, 20*np.log10(.3), 20*np.log10(1.6))
    gain_db = np.empty_like(desired_db)
    gain_db[0] = desired_db[0]
    for i in range(1,len(gain_db)):
        dt = times[i]-times[i-1]
        # A low-confidence region returns gently to unity. Reductions follow
        # 25 ms attack, recovery 80 ms; a 120 dB/s bound prevents abrupt steps.
        tau = .25 if confidence_weight[i] < .1 else (.025 if desired_db[i] < gain_db[i-1] else .08)
        delta = (desired_db[i]-gain_db[i-1])*(-np.expm1(-dt/tau))
        gain_db[i] = gain_db[i-1] + np.clip(delta, -120*dt, 120*dt)
    if diagnostic_path is not None:
        path = Path(diagnostic_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(path,times=times,source_rms=source_env,target_rms=target_env,
                            confidence=confidence_weight,desired_db=desired_db,gain_db=gain_db)
        step = np.diff(gain_db)
        path.with_suffix('.json').write_text(json.dumps({
            'strength':strength,'hopSeconds':.01,'attackSeconds':.025,'releaseSeconds':.08,
            'lowConfidenceReleaseSeconds':.25, 'timeOriginSeconds':0,
            'sourceDuration':len(source)/source_rate,'targetDuration':len(converted)/converted_rate,
            'maxStepDb':float(abs(step).max()) if len(step) else 0,
            'changedControlFrames':int(np.count_nonzero(abs(gain_db)>1e-6)),
        },indent=2),encoding='utf-8')
    if strength == 0:
        return converted.copy()
    samples = np.arange(len(converted)) / converted_rate
    gain = 10**(np.interp(samples, times, gain_db)/20)
    return converted * (gain[:, None] if converted.ndim == 2 else gain)


def apply_dynamics(output_path: Path, source_path: Path, strength=.5, diagnostic_path=None):
    if strength == 0 and diagnostic_path is None:
        return
    converted, rate = sf.read(output_path, dtype='float64')
    source, source_rate = sf.read(source_path, dtype='float64')
    result = preserve_dynamics(converted, rate, source, source_rate, strength, diagnostic_path)
    sf.write(output_path, result, rate, subtype='FLOAT')


def apply_static_gain(path: Path, gain_db: float = 0.0, mute: bool = False) -> None:
    """Apply a user gain after automatic dynamics, retaining float headroom."""
    if not np.isfinite(gain_db) or not -24 <= gain_db <= 6:
        raise ValueError('Invalid user gain')
    if gain_db == 0 and not mute:
        return
    gain = 0.0 if mute else 10 ** (gain_db / 20)
    staged = path.with_name(path.stem + '-user-gain.wav')
    try:
        with sf.SoundFile(path) as source, sf.SoundFile(
            staged, mode='w', samplerate=source.samplerate,
            channels=source.channels, subtype='FLOAT',
        ) as target:
            while True:
                block = source.read(65536, dtype='float32', always_2d=True)
                if not len(block):
                    break
                if not np.isfinite(block).all():
                    raise ValueError('Non-finite vocal audio')
                target.write(block * gain)
        staged.replace(path)
    finally:
        staged.unlink(missing_ok=True)
