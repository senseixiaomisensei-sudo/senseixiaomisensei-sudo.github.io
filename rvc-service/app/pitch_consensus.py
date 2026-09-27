"""Evidence-constrained alternatives to a neural pitch track.

Agreement alone is not proof: two estimators can follow the same overtone.
Require independent waveform support, and never turn an unvoiced frame into
singing or erase it. All values remain continuous Hz, including extreme notes.
"""
import numpy as np


def _period_correlation(segment, rate, hz):
    lag = int(round(rate / hz))
    if lag < 1 or lag >= len(segment) - 8:
        return 0.0
    a, b = segment[:-lag], segment[lag:]
    a, b = a - a.mean(), b - b.mean()
    return float(a @ b / np.sqrt((a @ a) * (b @ b) + 1e-30))


def choose_supported_pitch(primary, alternative, independent, audio, rate=16000, hop=160,
                           independent_cc=None, confidence=None):
    """Return a conservative track and auditable per-frame evidence.

    Thresholds are deliberately exclusionary, not a quality score. The 60 ms
    waveform test must favor the alternative; >=30 ms contiguous evidence is
    required. Uncertain phonation, rapid glides, breaths and harmonic-rich real
    lower notes are retained for review rather than forcibly corrected.
    """
    primary = np.asarray(primary, dtype=np.float64)
    alternative = np.asarray(alternative, dtype=np.float64)
    independent = np.asarray(independent, dtype=np.float64)
    if primary.shape != alternative.shape or primary.shape != independent.shape:
        raise ValueError('Pitch evidence must share the same absolute frame grid')
    if not all(np.isfinite(a).all() for a in (primary, alternative, independent, audio)):
        raise ValueError('Non-finite pitch evidence')
    both = (primary > 0) & (alternative > 0)
    valid = both & (independent > 0)
    difference = np.zeros(len(primary))
    agreement = np.full(len(primary), np.inf)
    difference[both] = abs(1200*np.log2(alternative[both]/primary[both]))
    agreement[valid] = abs(1200*np.log2(alternative[valid]/independent[valid]))
    candidates = both & (difference >= 200)
    current_ac = np.zeros(len(primary))
    alternative_ac = np.zeros(len(primary))
    evidence = np.zeros(len(primary), dtype=bool)
    harmonic_family = np.zeros(len(primary), dtype=bool)
    high_register = np.zeros(len(primary), dtype=bool)
    high_register_ac = np.zeros(len(primary))
    proposal = alternative.copy()
    radius = round(rate * .03)
    for frame in np.flatnonzero(candidates):
        center = frame * hop
        segment = np.asarray(audio[max(0, center-radius):center+radius], dtype=np.float64)
        if len(segment) < radius or np.sqrt(np.mean(segment**2)) < .003:
            continue
        current_ac[frame] = _period_correlation(segment, rate, primary[frame])
        alternative_ac[frame] = _period_correlation(segment, rate, alternative[frame])
        evidence[frame] = (current_ac[frame] < .35 and alternative_ac[frame] > .65
                           and agreement[frame] <= 100)
        # Praat can select a third/fourth sub-period of a stable sung vowel.
        # Requiring literal Hz equality then leaves an unrelated RMVPE note
        # (e.g. 337 Hz instead of 407 Hz) in place. Only relax that equality
        # when the current note has *negative/weak* waveform support and the
        # neural alternative has strong periodic support. A real lower note
        # with a strong upper partial also supports its own full period and
        # cannot pass the current_ac < .25 guard.
        if independent[frame] > 0:
            ratio = alternative[frame] / independent[frame]
            multiple = round(ratio)
            harmonic_family[frame] = (
                multiple in (2, 3, 4)
                and abs(1200*np.log2(ratio/multiple)) <= 50
                and current_ac[frame] < .25 and alternative_ac[frame] > .85
            )
            evidence[frame] |= harmonic_family[frame]
    if independent_cc is not None and confidence is not None:
        independent_cc = np.asarray(independent_cc, dtype=np.float64)
        confidence = np.asarray(confidence, dtype=np.float64)
        if independent_cc.shape != primary.shape or confidence.shape != primary.shape:
            raise ValueError('Secondary pitch evidence must share the absolute frame grid')
        if not np.isfinite(independent_cc).all():
            raise ValueError('Non-finite secondary pitch evidence')
        # RMVPE's salience is not a probability. It is used only as a veto:
        # high-register fallback additionally needs AC+CC agreement and a
        # stronger period in the actual waveform. No source audio is replaced,
        # no unvoiced frame is filled, and continuous Hz is never octave-folded.
        high = ((primary > 0) & (independent > 1000) & (independent_cc > 1000)
                & np.isfinite(confidence) & (confidence < .15)
                & (independent_cc > primary*1.75))
        high &= abs(1200*np.log2(np.maximum(independent_cc,1)/np.maximum(independent,1))) <= 100
        for frame in np.flatnonzero(high):
            center=frame*hop
            segment=np.asarray(audio[max(0,center-radius):center+radius],dtype=np.float64)
            if len(segment)<radius or np.sqrt(np.mean(segment**2))<.003:
                continue
            before=_period_correlation(segment,rate,primary[frame])
            after=_period_correlation(segment,rate,independent_cc[frame])
            high_register_ac[frame]=after
            high_register[frame]=(after>.80 and before<.75 and after-before>.15)
            if high_register[frame]:
                proposal[frame]=independent_cc[frame]
                evidence[frame]=True
    # An isolated disagreement by the independent tracker must not insert a
    # one-frame wrong-note island inside an otherwise supported correction.
    # Bridge at most 10 ms, only with voiced and independently measured strong
    # waveform evidence at that frame; never bridge an unvoiced consonant.
    bridged = np.zeros(len(primary), dtype=bool)
    if len(primary)>2:
        # A bridge is only for a dropout in the same neural proposal. Never
        # combine a high-register fallback with a different FCPE note.
        neural_neighbors = ~high_register[:-2] & ~high_register[2:]
        adjacent_cents = abs(1200*np.log2(np.maximum(proposal[1:-1],1) /
                                         np.maximum(proposal[:-2],1)))
        next_cents = abs(1200*np.log2(np.maximum(proposal[1:-1],1) /
                                     np.maximum(proposal[2:],1)))
        bridged[1:-1] = (evidence[:-2] & evidence[2:] & ~evidence[1:-1]
            & neural_neighbors & (adjacent_cents<=100) & (next_cents<=100)
            & candidates[1:-1] & (current_ac[1:-1]<.35) & (alternative_ac[1:-1]>.65))
    evidence |= bridged
    # Correct contiguous, independently supported regions only. Do not bridge
    # consonants or fill short gaps with invented vibrato/pitch interpolation.
    edges = np.flatnonzero(np.diff(np.r_[False, evidence, False].astype(np.int8)))
    accepted = np.zeros(len(primary), dtype=bool)
    for start, end in zip(edges[::2], edges[1::2]):
        if (end-start)*hop/rate >= .03:
            accepted[start:end] = True
    result = np.where(accepted, proposal, primary)
    return result, dict(candidate=alternative, independent=independent,
        primary_correlation=current_ac, candidate_correlation=alternative_ac,
        supported=evidence, accepted=accepted, bridged=bridged,
        harmonic_family=harmonic_family,high_register=high_register,
        high_register_correlation=high_register_ac,proposed=proposal,
        independent_cc=(independent_cc if independent_cc is not None else np.zeros(len(primary))))
