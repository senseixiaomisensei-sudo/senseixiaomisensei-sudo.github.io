"""Conservative source validity checks, never a singer-identity classifier."""
from __future__ import annotations
import numpy as np
from scipy.signal import stft

RATE = 24000
COUNT_POLICY_REVISION = 'source-validity-v2'

def pair_quality(pair: np.ndarray) -> dict:
    if pair.ndim != 2 or pair.shape[0] != 2 or not np.isfinite(pair).all():
        raise ValueError('CHORUS_INVALID_STEMS')
    energy = np.mean(pair.astype(np.float64)**2, axis=1)
    ratio = float(min(energy)/max(max(energy), 1e-15))
    correlation = float(abs(np.dot(pair[0].astype(np.float64), pair[1]) /
        max(np.sqrt(np.sum(pair[0].astype(np.float64)**2)*np.sum(pair[1].astype(np.float64)**2)), 1e-15)))
    block = RATE//2
    frames = len(pair[0])//block
    simultaneous = 0
    local_correlation = []
    envelope_correlation = 0.
    if frames:
        blocks = pair[:, :frames*block].astype(np.float64).reshape(2, frames, block)
        local = np.mean(blocks**2, axis=2)
        floor = max(1e-10, float(np.percentile(local.max(axis=0), 90))*.005)
        overlap = (local.min(axis=0)>floor) & (local.min(axis=0)/np.maximum(local.max(axis=0), 1e-15)>=.12)
        simultaneous = int(np.count_nonzero(overlap))
        local_correlation = np.abs(np.mean(blocks[0]*blocks[1], axis=1)[overlap]) / np.maximum(np.sqrt(local[0,overlap]*local[1,overlap]), 1e-15)
        if np.std(local[0])>1e-15 and np.std(local[1])>1e-15:
            envelope_correlation = float(np.corrcoef(np.sqrt(local))[0,1])
    coherence_median = high_coherence_ratio = 0.
    if len(pair[0])>=960 and simultaneous:
        specs = np.stack([stft(x, RATE, nperseg=960, noverlap=720)[2] for x in pair])
        power = np.sum(abs(specs)**2, axis=1)
        active = power.min(axis=0)>max(1e-10, float(np.percentile(power.max(axis=0),90))*.005)
        coherence = np.abs(np.sum(specs[0]*np.conj(specs[1]), axis=0))/np.maximum(np.sqrt(power.prod(axis=0)),1e-15)
        if active.any():
            coherence_median = float(np.median(coherence[active]))
            high_coherence_ratio = float(np.mean(coherence[active]>.85))
    # Similar timbre / harmonies alone must NOT merge real singers. Require
    # near-identical waveforms or near-identical local phase AND envelopes.
    duplicate = ratio>.005 and (correlation>.985 or (
        len(local_correlation)>=2 and float(np.mean(local_correlation>.98))>.95
        and coherence_median>.98 and envelope_correlation>.95))
    overlap_seconds = simultaneous*.5
    distinct = (not duplicate and ratio>=.08 and correlation<.5
        and overlap_seconds>=min(1.5, len(pair[0])/RATE*.15) and simultaneous>=2)
    return {'secondaryEnergyRatio':ratio, 'waveformCorrelation':correlation,
        'simultaneousSeconds':overlap_seconds, 'distinctCandidate':distinct,
        'duplicateCandidate':bool(duplicate), 'envelopeCorrelation':envelope_correlation,
        'sharedCoherenceMedian':coherence_median, 'highCoherenceRatio':high_coherence_ratio,
        'crossTalkRisk':bool(duplicate or (coherence_median>.75 and high_coherence_ratio>.3))}

def accept_pair(info: dict, manual: bool) -> bool:
    """Manual count may allow alternating singers, never duplicate/empty stems."""
    return (not info['duplicateCandidate'] and info['secondaryEnergyRatio']>=.04
        and (manual or (info['distinctCandidate'] and not info['crossTalkRisk'])))

def merge_duplicate_leaves(leaves: list[np.ndarray]) -> tuple[list[np.ndarray], list[dict]]:
    leaves = list(leaves)
    merged = []
    i = 0
    while i<len(leaves):
        j = i+1
        while j<len(leaves):
            info = pair_quality(np.stack([leaves[i],leaves[j]]))
            if info['duplicateCandidate']:
                merged.append({'first':i+1,'second':j+1,'waveformCorrelation':info['waveformCorrelation']})
                # Sum, rather than drop, preserves every sample and source energy.
                leaves[i] = leaves[i]+leaves.pop(j)
            else:
                j += 1
        i += 1
    return leaves, merged
