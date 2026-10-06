"""Conservative source validity checks, never a singer-identity classifier."""
from __future__ import annotations
import numpy as np
from scipy.signal import stft, correlate, correlation_lags
from scipy.ndimage import uniform_filter1d

RATE = 24000
COUNT_POLICY_REVISION = 'source-validity-v7-local-neural-selection'


def refine_local_leakage(primary: np.ndarray, reference: np.ndarray) -> tuple[np.ndarray, dict]:
    """Select a cleaner learned pair only for corroborated local leakage.

    Full-song coherence misses quiet copies underneath solo phrases. Require
    a bijective global correspondence, the same dominant waveform locally,
    and a correlated quiet copy that the independent separator reduces by
    >=9 dB. This is not a singer-count classifier or a silence/noise gate.
    Both output waveforms come from inference; independent weak components
    remain in the selected pair. Complementary fades preserve the mix.
    """
    agreement = source_agreement(primary, reference)
    evidence = {'selectedSeconds': 0., 'windows': [], 'sourceAgreement': agreement,
        'method': 'independent-neural-pair-selection-v1'}
    if not agreement['consistent']:
        evidence['reason'] = 'inconsistent-source-partitions'
        return primary, evidence
    ref = reference[::-1] if agreement['swapped'] else reference
    selection = np.zeros(primary.shape[1], dtype=np.float32)
    hop, window = RATE//4, RATE//2
    for start in range(0, primary.shape[1], hop):
        stop = min(start+window, primary.shape[1])
        a, b = primary[:,start:stop].astype(np.float64), ref[:,start:stop].astype(np.float64)
        pa, pb = np.mean(a*a, axis=1), np.mean(b*b, axis=1)
        strong, weak = int(np.argmax(pb)), 1-int(np.argmax(pb))
        if min(pa[strong], pb[strong]) < 1e-10:
            continue
        def correlation(x, y):
            return float(abs(np.dot(x,y))/max(np.linalg.norm(x)*np.linalg.norm(y),1e-15))
        match, shared = correlation(a[strong],b[strong]), correlation(a[strong],a[weak])
        ratio, alternate_ratio = float(pa[weak]/pa[strong]), float(pb[weak]/pb[strong])
        if (strong == int(np.argmax(pa)) and match > .9 and shared > .45
                and alternate_ratio < .0025 and max(alternate_ratio*8,1e-5) < ratio < .08):
            selection[start:stop] = 1.
            evidence['windows'].append({'startSample':start,'endSample':stop,
                'mainMatch':match,'sharedCorrelation':shared,
                'primaryEnergyRatio':ratio,'candidateEnergyRatio':alternate_ratio})
    evidence['selectedSeconds'] = float(selection.sum()/RATE)
    if not evidence['selectedSeconds']:
        return primary, evidence
    # A 200 ms complementary transition between two complete neural pairs.
    weight = uniform_filter1d(selection, size=RATE//5, mode='nearest')
    return primary*(1-weight)+ref*weight, evidence


def reference_assignment(current: np.ndarray, reference: np.ndarray) -> dict:
    """Assign learned estimates to full-song components, without changing audio.

    A strong dominant match can identify a solo phrase even when the second
    component is quiet. This is source tracking, not a human-count classifier.
    Unrelated/duplicate references cannot dictate a permutation.
    """
    if current.shape != reference.shape or current.ndim != 2 or current.shape[0] != 2:
        raise ValueError('CHORUS_INVALID_STEMS')
    if not np.isfinite(current).all() or not np.isfinite(reference).all():
        raise ValueError('CHORUS_INVALID_STEMS')
    a, b = current.astype(np.float64), reference.astype(np.float64)
    pa, pb = np.sum(a*a, axis=1), np.sum(b*b, axis=1)
    scores = np.abs(a@b.T)/np.maximum(np.sqrt(pa[:,None]*pb[None,:]), 1e-15)
    direct, reverse = float(np.trace(scores)), float(scores[0,1]+scores[1,0])
    margin = abs(direct-reverse)
    return {'confident': bool(scores.max() >= .65 and margin >= .15),
        'swapped': bool(reverse > direct), 'margin': margin,
        'correlationMatrix': scores.tolist()}

def source_agreement(first: np.ndarray, second: np.ndarray) -> dict:
    """Two valid binary partitions are not independent singer confirmation.

    Require a single bijective source correspondence over the full recording.
    This is a veto for inconsistent estimates, never proof of human identity.
    Only compare; do not remix, time-warp or replace either estimate.
    """
    if first.shape != second.shape or first.ndim!=2 or first.shape[0]!=2:
        raise ValueError('CHORUS_INVALID_STEMS')
    if not np.isfinite(first).all() or not np.isfinite(second).all():
        raise ValueError('CHORUS_INVALID_STEMS')
    a,b=first.astype(np.float64),second.astype(np.float64)
    power_a=np.sum(a*a,axis=1);power_b=np.sum(b*b,axis=1)
    scores=np.abs(a@b.T)/np.maximum(np.sqrt(power_a[:,None]*power_b[None,:]),1e-15)
    swapped=bool(scores[0,1]+scores[1,0]>np.trace(scores))
    order=[1,0] if swapped else [0,1]
    matched=[float(scores[i,order[i]]) for i in range(2)]
    margins=[float(scores[i,order[i]]-scores[i,1-order[i]]) for i in range(2)]
    best_rows=np.argmax(scores,axis=1)
    best_columns=np.argmax(scores,axis=0)
    bijective=(len(set(best_rows.tolist()))==2 and len(set(best_columns.tolist()))==2
        and all(best_rows[i]==order[i] for i in range(2)))
    confirmed=bool(bijective and min(matched)>=.5 and min(margins)>=.15)
    return {'consistent':confirmed,'bijective':bool(bijective),'swapped':swapped,
        'matchedCorrelations':matched,'matchMargins':margins,'correlationMatrix':scores.tolist(),
        'reason':'source-correspondence' if confirmed else 'inconsistent-source-partitions'}

def aligned_duplicate_evidence(pair: np.ndarray) -> dict:
    """Detect a delayed copy, without warping or aligning the exported stems.

    One fixed, small delay must explain multiple energetic sections. Similar
    voices, matching pitch and alternating delivery alone are never duplicates.
    """
    window = RATE * 2
    pieces = [(i, pair[:,i:i+window]) for i in range(0, pair.shape[1]-window+1, window)]
    pieces = sorted(pieces, key=lambda item:float(np.min(np.mean(item[1]**2,axis=1))), reverse=True)[:6]
    candidates = []
    for _, x in pieces:
        power = np.sum(x.astype(np.float64)**2,axis=1)
        if min(power) < 1e-8: continue
        correlations = correlate(x[0], x[1],mode='full',method='fft')
        lags = correlation_lags(window,window,mode='full')
        valid = abs(lags) <= RATE//50  # <=20 ms; no song timing correction.
        lag = int(lags[valid][np.argmax(abs(correlations[valid]))])
        candidates.append(lag)
    if not candidates: return {'alignedCorrelation':0.,'duplicateLagSamples':0,'duplicateWindowFraction':0.}
    lag = int(np.median(candidates))
    scores = []
    for _, x in pieces:
        a,b = (x[0,lag:],x[1,:window-lag]) if lag>=0 else (x[0,:window+lag],x[1,-lag:])
        norm = np.linalg.norm(a)*np.linalg.norm(b)
        if norm>1e-8: scores.append(float(abs(np.dot(a,b))/norm))
    return {'alignedCorrelation':float(np.median(scores)) if scores else 0.,
        'duplicateLagSamples':lag,'duplicateWindowFraction':float(np.mean(np.array(scores)>.985)) if scores else 0.}


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
    aligned = aligned_duplicate_evidence(pair) if ratio>.005 and correlation<.985 else {'alignedCorrelation':correlation,'duplicateLagSamples':0,'duplicateWindowFraction':float(correlation>.985)}
    duplicate = duplicate or (aligned['alignedCorrelation']>.985 and aligned['duplicateWindowFraction']>=.8)
    # A single singer changing delivery can produce disjoint leaves with tiny
    # transition overlaps. Require sustained overlap, not accumulated edges.
    runs = np.diff(np.r_[False, overlap if frames else [], False].astype(int))
    lengths = np.flatnonzero(runs==-1)-np.flatnonzero(runs==1)
    longest_overlap = float(max(lengths,default=0)*.5)
    overlap_seconds = simultaneous*.5
    distinct = (not duplicate and ratio>=.08 and correlation<.5
        and overlap_seconds>=min(1.5, len(pair[0])/RATE*.15)
        and longest_overlap>=min(1.,len(pair[0])/RATE*.15) and simultaneous>=2)
    return {**aligned, 'longestOverlapSeconds':longest_overlap, 'secondaryEnergyRatio':ratio, 'waveformCorrelation':correlation,
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
                merged.append({'first':i+1,'second':j+1,'waveformCorrelation':info['waveformCorrelation'],
                    'alignedCorrelation':info['alignedCorrelation'],'duplicateLagSamples':info['duplicateLagSamples']})
                # Sum, rather than drop, preserves every sample and source energy.
                leaves[i] = leaves[i]+leaves.pop(j)
            else:
                j += 1
        i += 1
    return leaves, merged
