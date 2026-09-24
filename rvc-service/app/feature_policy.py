"""Signal-derived retrieval and source-feature retention for pinned RVC v2.

The policy operates on HuBERT features, never on a mix of original and
converted waveform.  A user's index/protect values remain the base settings.
"""

import numpy as np
from scipy.ndimage import gaussian_filter1d


def frame_evidence(audio, f0, sample_rate=16000, hop=160):
    """Measure periodicity and noise character without inventing RMVPE scores."""
    signal = np.asarray(audio, dtype=np.float64)
    pitch = np.asarray(f0, dtype=np.float64).reshape(-1)
    count = len(pitch)
    rms = np.zeros(count)
    periodicity = np.zeros(count)
    flatness = np.ones(count)
    zcr = np.zeros(count)
    radius = max(1, round(0.02 * sample_rate))
    window = np.hanning(radius * 2)
    for frame in range(count):
        center = frame * hop
        segment = signal[max(0, center - radius):min(len(signal), center + radius)]
        if segment.size < radius:
            continue
        segment = np.pad(segment, (0, max(0, len(window) - len(segment))))[:len(window)]
        segment = segment - np.mean(segment)
        rms[frame] = np.sqrt(np.mean(segment * segment))
        zcr[frame] = np.mean(np.signbit(segment[1:]) != np.signbit(segment[:-1]))
        spectrum = np.abs(np.fft.rfft(segment * window)) + 1e-9
        useful = spectrum[2:]
        flatness[frame] = np.exp(np.mean(np.log(useful))) / np.mean(useful)
        hz = pitch[frame]
        if hz > 0 and np.isfinite(hz):
            lag = max(1, round(sample_rate / hz))
            if 3 * lag < len(segment):
                a, b = segment[:-lag], segment[lag:]
                periodicity[frame] = max(0, np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9))
    return rms, periodicity, flatness, zcr


def adaptive_feature_weights(audio, f0, index_rate, protect, sample_rate=16000, hop=160):
    """Return per-10ms index strength and retrieved-feature fraction.

    Upstream protect=0.5 disables source retention; smaller values preserve
    more of the original unvoiced HuBERT features.  The returned blend follows
    exactly that convention while adding conservative voiced-transition care.
    """
    pitch = np.asarray(f0, dtype=np.float64).reshape(-1)
    if not len(pitch):
        return np.zeros(0), np.zeros(0)
    base_index = float(np.clip(index_rate, 0, 1))
    base_protect = float(np.clip(protect, 0, 0.5))
    rms, periodicity, flatness, zcr = frame_evidence(audio, pitch, sample_rate, hop)
    active = rms > max(0.003, np.percentile(rms, 60) * 0.15)
    stable = (pitch > 0) & (periodicity > 0.58) & (flatness < 0.35) & active
    uncertain = (pitch > 0) & ((periodicity < 0.35) | (flatness > 0.48))
    noisy = (pitch <= 0) | (flatness > 0.5) | (zcr > 0.27)
    extreme = (pitch > 900) | ((pitch > 0) & (pitch < 75))
    retrieval_factor = np.where(stable, 1.07, 0.85)
    retrieval_factor = np.where(noisy, 0.55, retrieval_factor)
    retrieval_factor = np.where(uncertain | extreme, np.minimum(retrieval_factor, 0.68), retrieval_factor)
    # Do not turn a zero-index choice into retrieval.  A deliberate high user
    # setting is respected, while the automatic upward movement stays small.
    ceiling = min(1.0, max(base_index, 0.45))
    index_strength = np.clip(gaussian_filter1d(base_index * retrieval_factor, 2), 0, ceiling)
    # Keep stable voiced vowels fully converted.  Only the feature blend near
    # unreliable voicing and clear unvoiced content retains more source detail.
    retrieved_fraction = np.ones(len(pitch))
    if base_protect < 0.5:
        retrieved_fraction[uncertain] = 0.78
        retrieved_fraction[noisy] = base_protect
        retrieved_fraction = np.clip(gaussian_filter1d(retrieved_fraction, 3), base_protect, 1.0)
    return index_strength, retrieved_fraction
