"""Continuous register controls on the shared clock, not note snapping or DSP."""
from __future__ import annotations
import numpy as np
from scipy.ndimage import uniform_filter1d

REVISION = 'continuous-register-v1'


def register_controls(f0, index_rate, protect, strength=0., pitch_strength=0.):
    if not all(np.isfinite(v) and 0 <= v <= 1 for v in (strength, pitch_strength)):
        raise ValueError('Invalid register strength')
    f0 = np.asarray(f0, dtype=np.float64)
    if f0.ndim != 1 or not np.isfinite(f0).all() or np.any(f0 < 0):
        raise ValueError('Invalid register pitch')
    index = np.full(f0.shape, float(index_rate))
    protection = np.full(f0.shape, float(protect))
    offsets = np.zeros(f0.shape)
    voiced = f0 > 0
    info = dict(revision=REVISION, strength=float(strength), pitchStrength=float(pitch_strength),
                originalMelodyPreserved=pitch_strength == 0, pitchOffsetLimitSemitones=2.)
    if not np.any(voiced) or not (strength or pitch_strength):
        return index, protection, offsets, info
    median = float(np.median(f0[voiced]))
    # Smooth the *control signal*, never the measured F0. Breaths stay unvoiced.
    # A 410 ms continuous envelope avoids following vibrato or individual cycles.
    positions = np.arange(len(f0))
    semitones = np.interp(positions, positions[voiced], 12*np.log2(f0[voiced]/median))
    smooth = uniform_filter1d(semitones, size=41, mode='nearest')
    low = np.clip((-smooth-3)/9, 0, 1)
    high = np.clip((smooth-3)/9, 0, 1)
    extremes = np.maximum(low, high)
    # At most a 30% reduction of the user's retrieval blend, never a new
    # source-vocal audio mix. The selected checkpoint still synthesizes every frame.
    index *= 1-.30*strength*extremes
    # RVC protection affects clear consonants/breaths; voiced vowels stay voiced.
    # Never exceed the user's value or accidentally disable their protection.
    protection *= 1-.40*strength*extremes
    if pitch_strength:
        proposed = 2*pitch_strength*(low-high)
        # 5 semitones/s maximum for the optional compensation, on the full
        # timeline. No reset at chunk boundaries and no octave fold.
        for i in range(1, len(proposed)):
            proposed[i] = np.clip(proposed[i], proposed[i-1]-.05, proposed[i-1]+.05)
        offsets = proposed
    info.update(medianHz=median, lowFrames=int(np.count_nonzero(low)),
                highFrames=int(np.count_nonzero(high)),
                indexRange=[float(index.min()), float(index.max())],
                protectRange=[float(protection.min()), float(protection.max())],
                pitchOffsetRange=[float(offsets.min()), float(offsets.max())])
    return index, protection, offsets, info
