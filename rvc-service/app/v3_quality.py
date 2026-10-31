"""RVC v3 cover-quality stages: switches, pitch repair, vocal finishing, master.

Every stage has its own environment switch and the master switch
``RVC_V3=0`` restores the exact legacy chain (each helper below returns its
input unchanged when disabled).  The defaults are the stages that did not
regress on the end-to-end RVC A/B (docs/rvc-v3-quality.md).

Design rules carried over from the R41/R42 history:
* never mix the original singer's waveform into the converted vocal;
* never fold a sustained real octave leap - only short, isolated islands
  that leave and return to the same register are repaired;
* unvoiced frames are never turned into singing (only <=20 ms tracker
  dropouts inside a periodic vowel may be bridged, and only with waveform
  support);
* processing is relative to the *source* vocal (we remove what the source did
  not have), bounded in dB, smoothed in time - no global EQ.
"""
from __future__ import annotations

import json
import math
import os
from pathlib import Path

import numpy as np

REVISION = 'rvc-v3-quality-2'

# name -> default when RVC_V3 is enabled.  Decided on the end-to-end A/B
# through a real RVC conversion (tools/rvc_v3_e2e.py, CPU ONNX, arona v2,
# 3 songs x {clean stem, separated vocal} x {auto shift, +12 st},
# docs/rvc-v3-quality.md, 2026-10-31).  A stage defaults to on only when no
# case got worse on the decision metrics (RMVPE F0 error, breakup, voicing,
# HF excess, loudness, true peak, clipping).  Everything else stays an
# explicit opt-in (RVC_V3_<NAME>=1).
DEFAULTS = {
    'SEPARATOR': '0',       # opt-in (not A/B'd): v3 separation chain (main + lead/backing + dereverb)
    'KARAOKE': '0',         # opt-in (not A/B'd): convert only the lead vocal, keep backing harmony
    'DEREVERB': '0',        # opt-in (not A/B'd): dry lead into RVC
    'REVERB_RETURN': '0',   # opt-in (not A/B'd): matched synthetic room on the converted lead
    'OCTAVE_FIX': '1',      # protective (r2): 0/12 worse; ~no-op on real input, repairs injected octave islands
    'RANGE_GUARD': '0',     # opt-in (not A/B'd): automatic register adaptation beyond range
    'DEESS': '0',           # opt-in: 0/12 worse but tiny effect; with HARSH Mallory F0 RMSE +2.1 cents (over tol.)
    'HARSH': '1',           # e2e A/B 0/12 worse, 12/12 better: HF excess -2.3..-3.4 dB
    'LOUDNESS': '1',        # e2e A/B: |delta LU| vs upload 0.0-3.9 -> <=0.002
    'LIMITER': '1',         # e2e A/B: true peak never above legacy -1 dBTP trim, 0 clipped samples
    'HIRES': '0',           # opt-in (not A/B'd): 48 kHz / 24-bit WAV output
    'PHRASE_OCTAVE': '0',   # opt-in: per-phrase octave transposition beyond range
}


def master_enabled() -> bool:
    """Master switch.  Default ON since the 2026-10-31 end-to-end A/B (the
    default stage set did not regress on any case); ``RVC_V3=0`` restores the
    exact legacy chain."""
    return os.getenv('RVC_V3', '1').strip().lower() not in ('0', 'false', 'off', 'no')


def enabled(name: str) -> bool:
    if not master_enabled():
        return False
    return os.getenv(f'RVC_V3_{name}', DEFAULTS.get(name, '0')).strip() == '1'


def status() -> dict:
    return dict(revision=REVISION, master=master_enabled(),
                stages={name.lower(): enabled(name) for name in DEFAULTS})


# ---------------------------------------------------------------------------
# Pitch timeline repair (100 Hz frames, continuous Hz, 0 = unvoiced)
# ---------------------------------------------------------------------------

def _runs(mask):
    edges = np.flatnonzero(np.diff(np.r_[False, mask, False].astype(np.int8)))
    return list(zip(edges[::2], edges[1::2]))


def repair_pitch(f0, audio=None, rate=16000, hop=160, confidence=None, max_island=12,
                 context=15, low_confidence=.6, confidence_margin=.1, octave_tolerance=1.0,
                 context_agreement=2.0):
    """rvc-v3-quality-2 F0 repair: only low-confidence isolated octave islands.

    A frame run is repaired only when ALL of these hold (conservative gate):
    * it is voiced throughout, <= ``max_island`` frames (120 ms) long, entered
      and left by a >= 9 st jump;
    * >= 4 voiced frames of context on each side (within ``context`` frames)
      and the two contexts agree within ``context_agreement`` st;
    * the island sits 12 +- ``octave_tolerance`` st from that context;
    * RMVPE's own salience (``confidence``, max over bins per frame) is low on
      the island (< ``low_confidence``) AND lower than the context's median
      salience by ``confidence_margin``.
    Without salience nothing is changed: geometry alone mistook real ornaments
    and register flips for errors in rvc-v3-quality-1.  No spike smoothing and
    no dropout bridging (both regressed on the r1 A/B).  ``audio``/``rate``/
    ``hop`` are accepted for call compatibility and unused.
    """
    f0 = np.asarray(f0, dtype=np.float64).copy()
    report = dict(octaveIslands=0, octaveFrames=0, candidates=0, rejectedConfidence=0,
                  changedFrames=0, revision=REVISION)
    if confidence is None:
        report['skipped'] = 'no-confidence'
        return f0, report
    conf = np.asarray(confidence, dtype=np.float64)
    n = len(f0)
    if len(conf) < n:
        conf = np.pad(conf, (0, n - len(conf)), constant_values=1.0)
    conf = np.where(np.isfinite(conf), conf, 1.0)
    voiced = f0 > 0
    if voiced.sum() < 9:
        return f0, report
    st = np.where(voiced, 12 * np.log2(np.maximum(f0, 1e-6)), np.nan)
    i = 1
    while i < n - 1:
        if not (voiced[i] and voiced[i - 1]) or abs(st[i] - st[i - 1]) < 9:
            i += 1
            continue
        base = st[i - 1]
        direction = np.sign(st[i] - base)
        j = i
        while j < n and voiced[j] and j - i <= max_island and (st[j] - base) * direction >= 9:
            j += 1
        if j - i > max_island or j >= n or not voiced[j] or abs(st[j] - base) >= 9:
            i = max(j, i + 1)
            continue
        report['candidates'] += 1
        lidx = [k for k in range(max(0, i - context), i) if voiced[k]]
        ridx = [k for k in range(j, min(n, j + context)) if voiced[k]]
        if len(lidx) < 4 or len(ridx) < 4:
            i = j
            continue
        lm, rm = np.median(st[lidx]), np.median(st[ridx])
        island = np.median(st[i:j])
        level = (lm + rm) / 2
        if abs(lm - rm) > context_agreement or abs(abs(island - level) - 12) > octave_tolerance:
            i = j
            continue
        ic = float(np.mean(conf[i:j]))
        cc = float(np.median(conf[lidx + ridx]))
        if not (ic < low_confidence and ic < cc - confidence_margin):
            report['rejectedConfidence'] += 1
            i = j
            continue
        f0[i:j] *= 2.0 ** (-direction)
        st[i:j] -= 12 * direction
        report['octaveIslands'] += 1
        report['octaveFrames'] += int(j - i)
        i = j
    report['changedFrames'] = report['octaveFrames']
    return f0, report


def _repair_pitch_r1(f0, audio=None, rate=16000, hop=160, max_island=12, context=12,
                     bridge=2, spike_semitones=3.0):
    """rvc-v3-quality-1 repair, kept only as the A/B reference (not called by
    the service).  Repair short octave islands, 1-2 frame spikes and tiny dropouts.

    Returns (repaired_f0, report). ``audio`` (same 100 Hz clock, already
    padded like the timeline) enables waveform support for dropout bridging.
    """
    f0 = np.asarray(f0, dtype=np.float64).copy()
    original = f0.copy()
    voiced = f0 > 0
    report = dict(octaveIslands=0, octaveFrames=0, spikes=0, bridged=0)
    if voiced.sum() < 5:
        return f0, report
    st = np.where(voiced, 12 * np.log2(np.maximum(f0, 1e-6)), np.nan)
    n = len(f0)
    # 1) octave islands: a voiced run segment whose level differs from BOTH
    # neighbouring contexts by 12 +- 1.5 st, while those contexts agree.
    i = 1
    while i < n - 1:
        if not voiced[i] or not voiced[i - 1] or abs(st[i] - st[i - 1]) < 9:
            i += 1
            continue
        direction = np.sign(st[i] - st[i - 1])
        j = i
        while j < n and voiced[j] and j - i <= max_island and abs(st[j] - st[i - 1]) >= 9 \
                and np.sign(st[j] - st[i - 1]) == direction:
            j += 1
        if j - i > max_island or j >= n or not voiced[j]:
            i = j + 1 if j > i else i + 1
            continue
        left = st[max(0, i - context):i]
        right = st[j:min(n, j + context)]
        left = left[np.isfinite(left)]
        right = right[np.isfinite(right)]
        if len(left) < 3 or len(right) < 3:
            i = j
            continue
        lm, rm = np.median(left), np.median(right)
        island = np.median(st[i:j])
        if abs(lm - rm) <= 3 and abs(abs(island - (lm + rm) / 2) - 12) <= 1.5:
            f0[i:j] *= 2.0 ** (-direction)
            st[i:j] -= 12 * direction
            report['octaveIslands'] += 1
            report['octaveFrames'] += int(j - i)
        i = j
    # 2) single/double-frame spikes inside smooth voiced context
    for k in range(2, n - 2):
        if not (voiced[k - 1] and voiced[k] and voiced[k + 1]):
            continue
        a, b = st[k - 1], st[k + 1]
        width = 1
        if voiced[k + 2] and abs(st[k + 1] - st[k]) < 1 and abs(st[k + 2] - st[k - 1]) < 1:
            b = st[k + 2]
            width = 2
        if abs(a - b) <= 1 and abs(st[k] - a) >= spike_semitones and abs(st[k] - b) >= spike_semitones \
                and abs(abs(st[k] - a) - 12) > 1.5:
            for w in range(width):
                st[k + w] = (a + b) / 2
                f0[k + w] = 2 ** (st[k + w] / 12)
            report['spikes'] += 1
    # 3) <=bridge-frame dropouts inside a periodic vowel (waveform supported)
    if audio is not None and bridge > 0:
        from app.pitch_consensus import _period_correlation
        voiced = f0 > 0
        for start, end in _runs(~voiced):
            if end - start > bridge or start == 0 or end >= n:
                continue
            a, b = st[start - 1], st[end]
            if not (np.isfinite(a) and np.isfinite(b)) or abs(a - b) > 1:
                continue
            fill = np.linspace(a, b, end - start + 2)[1:-1]
            ok = True
            for frame, value in zip(range(start, end), fill):
                center = frame * hop
                radius = int(rate * .03)
                segment = np.asarray(audio[max(0, center - radius):center + radius], dtype=np.float64)
                if len(segment) < radius or np.sqrt(np.mean(segment ** 2)) < .01 \
                        or _period_correlation(segment, rate, 2 ** (value / 12)) < .6:
                    ok = False
                    break
            if ok:
                f0[start:end] = 2 ** (fill / 12)
                st[start:end] = fill
                report['bridged'] += int(end - start)
    report['changedFrames'] = int(np.count_nonzero(np.abs(f0 - original) > 1e-9))
    return f0, report


def phrase_octave_plan(f0, ceiling_hz, floor_hz, min_fraction=.6, gap_frames=25):
    """Opt-in: octave offsets (-12/0/+12 st) per phrase beyond the range.

    A phrase is a voiced region separated by >=250 ms of silence. Only whole
    phrases move, only by an octave (keeps key/harmony), only when most of the
    phrase is out of range and the move brings it inside.
    """
    f0 = np.asarray(f0, dtype=np.float64)
    offsets = np.zeros(len(f0))
    voiced = f0 > 0
    if not voiced.any() or not (ceiling_hz > floor_hz > 0):
        return offsets, []
    # merge voiced runs separated by short gaps into phrases
    runs = _runs(voiced)
    phrases = []
    for start, end in runs:
        if phrases and start - phrases[-1][1] < gap_frames:
            phrases[-1][1] = end
        else:
            phrases.append([start, end])
    moved = []
    for start, end in phrases:
        values = f0[start:end][voiced[start:end]]
        if len(values) < 20:
            continue
        high = np.mean(values > ceiling_hz)
        low = np.mean(values < floor_hz)
        if high >= min_fraction and np.median(values) / 2 >= floor_hz:
            offsets[start:end] = -12
            moved.append(dict(startFrame=int(start), endFrame=int(end), semitones=-12))
        elif low >= min_fraction and np.median(values) * 2 <= ceiling_hz:
            offsets[start:end] = 12
            moved.append(dict(startFrame=int(start), endFrame=int(end), semitones=12))
    return offsets, moved


def range_profile(model_id: str, assets_root: Path | None = None) -> dict | None:
    root = assets_root or Path(__file__).resolve().parents[2] / 'assets'
    try:
        profiles = json.loads((root / 'rvc-voice-ranges.json').read_text(encoding='utf-8'))['profiles']
    except (OSError, ValueError, KeyError):
        return None
    profile = profiles.get(model_id)
    if not profile or not profile.get('p90Hz') or not profile.get('p10Hz'):
        return None
    return profile


def singing_range(profile: dict | None):
    """Speech reference -> conservative singing envelope (Hz)."""
    if not profile:
        return None
    # A trained speech checkpoint generally extends ~10 st above its speech
    # p90 and ~10 st below its p10 before timbre collapses.
    return dict(ceilingHz=float(profile['p90Hz']) * 2 ** (10 / 12),
                floorHz=float(profile['p10Hz']) * 2 ** (-10 / 12))


def auto_register_strength(f0, shift, envelope, requested=0.0):
    """Turn on the validated register controls when notes leave the range."""
    if envelope is None:
        return requested, dict(reason='no-range-profile')
    f0 = np.asarray(f0, dtype=np.float64)
    voiced = f0 > 0
    if voiced.sum() < 20:
        return requested, dict(reason='too-few-voiced-frames')
    shifted = f0[voiced] * 2 ** (shift / 12)
    beyond = float(np.mean((shifted > envelope['ceilingHz']) | (shifted < envelope['floorHz'])))
    strength = requested
    if beyond >= .05:
        strength = max(requested, float(np.clip(.4 + beyond, .4, .8)))
    return strength, dict(beyondFraction=beyond, requested=requested, applied=strength, **envelope)


# ---------------------------------------------------------------------------
# Spectral finishing on the converted vocal
# ---------------------------------------------------------------------------

def _stft(x, n_fft=2048, hop=512):
    from scipy.signal import stft
    f, t, z = stft(x, nperseg=n_fft, noverlap=n_fft - hop, boundary='even', padded=True)
    return z


def _istft(z, length, n_fft=2048, hop=512):
    from scipy.signal import istft
    _, x = istft(z, nperseg=n_fft, noverlap=n_fft - hop, boundary=True)
    x = x[:length]
    if len(x) < length:
        x = np.pad(x, (0, length - len(x)))
    return x


def _smooth_gain_db(gain_db, hop_s, attack=.003, release=.06):
    out = np.empty_like(gain_db)
    prev = 0.0
    a_att = math.exp(-hop_s / attack)
    a_rel = math.exp(-hop_s / release)
    for i, g in enumerate(gain_db):
        coef = a_att if g < prev else a_rel
        prev = coef * prev + (1 - coef) * g
        out[i] = prev
    return out


def _align_source(source, source_rate, rate, length):
    from scipy.signal import resample_poly
    src = np.asarray(source, dtype=np.float64)
    if src.ndim > 1:
        src = src.mean(axis=1)
    if source_rate != rate:
        g = math.gcd(int(rate), int(source_rate))
        src = resample_poly(src, int(rate) // g, int(source_rate) // g)
    src = src[:length]
    if len(src) < length:
        src = np.pad(src, (0, length - len(src)))
    return src


def _band(x, rate, low, high=None, order=4):
    """Zero-phase band (sosfiltfilt): no group delay, so x - band is the exact
    complementary remainder and a unity gain reconstructs x bit-for-bit."""
    from scipy.signal import butter, sosfiltfilt
    nyq = rate / 2
    if high is None or high >= nyq * .98:
        sos = butter(order, low, 'highpass', fs=rate, output='sos')
    else:
        sos = butter(order, [low, high], 'bandpass', fs=rate, output='sos')
    return sosfiltfilt(sos, x)


def _block_db(x, block):
    n = len(x) // block
    e = np.mean(x[:n * block].reshape(n, block) ** 2, axis=1) if n else np.zeros(0)
    return 10 * np.log10(e + 1e-14)


def _envelope_to_samples(gain_db, block, length):
    centers = (np.arange(len(gain_db)) + .5) * block
    g = np.interp(np.arange(length), centers, gain_db, left=gain_db[0] if len(gain_db) else 0,
                  right=gain_db[-1] if len(gain_db) else 0)
    return 10 ** (g / 20)


def _dynamic_gain(excess_db, hop_s, max_db, lookahead_s, attack_s, release_s):
    """Bounded cut with look-ahead (min over the next window, so the gain is
    already down when the event starts), then attack/release smoothing."""
    cut = -np.clip(np.asarray(excess_db, dtype=np.float64), 0, max_db)
    if not len(cut):
        return cut
    la = max(1, int(round(lookahead_s / hop_s)))
    # forward-looking minimum: block t sees blocks t..t+la
    padded = np.r_[cut, np.zeros(la)]
    cut = np.lib.stride_tricks.sliding_window_view(padded, la + 1).min(axis=1)[:len(cut)]
    return _smooth_gain_db(cut, hop_s, attack_s, release_s)


def finish_vocal(converted, rate, source, source_rate, deess=True, harsh=True,
                 max_deess_db=6.0, max_harsh_db=4.0, report=None):
    """rvc-v3-quality-2 finishing: band-split, relative to the source vocal.

    * DEESS: a zero-phase 5 kHz+ band is turned down only on *sibilant* 2.5 ms
      blocks (that band louder than the 1-4 kHz body by >= 3 dB, i.e. not a
      vowel) where the converted vocal's sibilance exceeds the source's own by
      more than 2 dB.  5 ms look-ahead, 1 ms attack / 30 ms release, <= 6 dB.
    * HARSH: a zero-phase 4-10 kHz band is turned down only on vowel blocks
      (300-3000 Hz dominant) where its ratio to the mids exceeds the source's
      by more than 4 dB.  10 ms look-ahead, 10/120 ms, <= 4 dB.
    The output is ``x + band * (gain - 1)``: blocks with unity gain are
    returned exactly, the low band (F0 and its first harmonics) is never
    touched, and there is no STFT overlap-add smearing of transients.
    """
    converted = np.asarray(converted, dtype=np.float64)
    if converted.ndim != 1 or not converted.size or not (deess or harsh):
        return converted
    src = _align_source(source, source_rate, rate, len(converted))
    block = max(1, int(round(rate * .0025)))
    hop_s = block / rate
    top = min(11000.0, rate / 2 * .95)
    body_c = _block_db(_band(converted, rate, 1000, 4000), block)
    body_s = _block_db(_band(src, rate, 1000, 4000), block)
    total_c = _block_db(converted, block)
    active = total_c > (np.percentile(total_c, 95) - 45 if len(total_c) else 0)
    stats = dict(deessBlocks=0, harshBlocks=0, maxDeessDb=0.0, maxHarshDb=0.0, revision=REVISION)
    out = converted.copy()
    if harsh:
        hi_c_sig = _band(converted, rate, 4000, min(10000.0, top))
        mid_c = _block_db(_band(converted, rate, 300, 3000), block)
        mid_s = _block_db(_band(src, rate, 300, 3000), block)
        hi_c = _block_db(hi_c_sig, block)
        hi_s = _block_db(_band(src, rate, 4000, min(10000.0, top)), block)
        vowel = active & (mid_c - total_c > -6) & (mid_s - _block_db(src, block) > -6)
        excess = np.where(vowel, (hi_c - mid_c) - (hi_s - mid_s) - 4.0, 0.0)
        gdb = _dynamic_gain(excess, hop_s, max_harsh_db, .010, .010, .120)
        stats['harshBlocks'] = int(np.count_nonzero(gdb < -.5))
        stats['maxHarshDb'] = float(-gdb.min()) if len(gdb) else 0.0
        if stats['harshBlocks']:
            g = _envelope_to_samples(gdb, block, len(out))
            out = out + hi_c_sig * (g - 1.0)
    if deess:
        sib_c_sig = _band(out, rate, 5000, top)
        sib_c = _block_db(sib_c_sig, block)
        sib_s = _block_db(_band(src, rate, 5000, top), block)
        from scipy.ndimage import maximum_filter1d
        # sibilant level relative to the surrounding sung body (+-150 ms
        # loudest 1-4 kHz block), in the conversion and in the source: an
        # "s" that RVC made louder *than the singer did* is the excess.
        radius = max(1, int(round(.15 / hop_s)))
        ctx_c = maximum_filter1d(body_c, 2 * radius + 1, mode='nearest')
        ctx_s = maximum_filter1d(body_s, 2 * radius + 1, mode='nearest')
        sibilant = active & (sib_c - body_c > 3.0)
        excess = np.where(sibilant, (sib_c - ctx_c) - (sib_s - ctx_s) - 2.0, 0.0)
        gdb = _dynamic_gain(excess, hop_s, max_deess_db, .005, .001, .030)
        stats['deessBlocks'] = int(np.count_nonzero(gdb < -.5))
        stats['maxDeessDb'] = float(-gdb.min()) if len(gdb) else 0.0
        if stats['deessBlocks']:
            g = _envelope_to_samples(gdb, block, len(out))
            out = out + sib_c_sig * (g - 1.0)
    if report is not None:
        report.update(stats)
    return out


def _finish_vocal_stft_r1(converted, rate, source, source_rate, deess=True, harsh=True,
                          max_deess_db=8.0, max_harsh_db=6.0, report=None):
    """rvc-v3-quality-1 STFT finishing, kept only as the A/B reference."""
    converted = np.asarray(converted, dtype=np.float64)
    if converted.ndim != 1 or not converted.size or not (deess or harsh):
        return converted
    from scipy.signal import resample_poly
    src = np.asarray(source, dtype=np.float64)
    if src.ndim > 1:
        src = src.mean(axis=1)
    if source_rate != rate:
        g = math.gcd(int(rate), int(source_rate))
        src = resample_poly(src, int(rate) // g, int(source_rate) // g)
    src = src[:len(converted)]
    if len(src) < len(converted):
        src = np.pad(src, (0, len(converted) - len(src)))
    n_fft = 2048 if rate > 24000 else 1024
    hop = n_fft // 4
    z = _stft(converted, n_fft, hop)
    zs = _stft(src, n_fft, hop)
    frames = min(z.shape[1], zs.shape[1])
    freqs = np.fft.rfftfreq(n_fft, 1 / rate)
    p = np.abs(z[:, :frames]) ** 2 + 1e-14
    ps = np.abs(zs[:, :frames]) ** 2 + 1e-14
    hop_s = hop / rate
    mid = (freqs >= 300) & (freqs < 3000)
    body = (freqs >= 1000) & (freqs < 4000)
    hi = (freqs >= 4000) & (freqs <= min(10000, rate / 2 - 50))
    sib = (freqs >= 4500) & (freqs <= min(11000, rate / 2 - 50))
    gains = np.ones(p.shape)
    total_db = 10 * np.log10(p.sum(0))
    active = total_db > np.percentile(total_db, 95) - 50
    stats = dict(deessFrames=0, harshFrames=0, maxDeessDb=0.0, maxHarshDb=0.0)
    if harsh:
        out_ratio = 10 * np.log10(p[hi].sum(0) / p[mid].sum(0))
        src_ratio = 10 * np.log10(ps[hi].sum(0) / ps[mid].sum(0))
        # only voiced-ish frames (mid band dominant) - consonants handled by deess
        vowel = (10 * np.log10(p[mid].sum(0) / p.sum(0)) > -6) & active
        excess = np.where(vowel, out_ratio - src_ratio - 3.0, 0.0)
        cut = -np.clip(excess, 0, max_harsh_db)
        cut = _smooth_gain_db(cut, hop_s, .01, .08)
        stats['harshFrames'] = int(np.count_nonzero(cut < -.5))
        stats['maxHarshDb'] = float(-cut.min()) if len(cut) else 0.0
        # frequency taper 3.5 -> 4.5 kHz so the cut has no edge
        taper = np.clip((freqs - 3500) / 1000, 0, 1)
        gains *= 10 ** (np.outer(taper, cut) / 20)
    if deess:
        sratio = 10 * np.log10(p[sib].sum(0) / p[body].sum(0))
        src_s = 10 * np.log10(ps[sib].sum(0) / ps[body].sum(0))
        # sibilant frames: sib band dominant; allow the source's own sibilance +2 dB
        over = np.where(active & (sratio > 0), sratio - np.maximum(src_s, 0) - 2.0, 0.0)
        cut = -np.clip(over, 0, max_deess_db)
        cut = _smooth_gain_db(cut, hop_s, .002, .05)
        stats['deessFrames'] = int(np.count_nonzero(cut < -.5))
        stats['maxDeessDb'] = float(-cut.min()) if len(cut) else 0.0
        taper = np.clip((freqs - 4000) / 1000, 0, 1)
        gains *= 10 ** (np.outer(taper, cut) / 20)
    z = z.copy()
    z[:, :frames] *= gains
    out = _istft(z, len(converted), n_fft, hop)
    if report is not None:
        report.update(stats)
    return out


# ---------------------------------------------------------------------------
# Loudness (BS.1770 K-weighted, gated) and true-peak limiting
# ---------------------------------------------------------------------------

def _k_weight(x, rate):
    from scipy.signal import lfilter
    # BS.1770 pre-filter + RLB, bilinear designs valid for any rate
    f0, g, q = 1681.974450955533, 3.999843853973347, .7071752369554196
    k = math.tan(math.pi * f0 / rate)
    vh = 10 ** (g / 20)
    vb = vh ** .4996667741545416
    a0 = 1 + k / q + k * k
    b = [(vh + vb * k / q + k * k) / a0, 2 * (k * k - vh) / a0, (vh - vb * k / q + k * k) / a0]
    a = [1, 2 * (k * k - 1) / a0, (1 - k / q + k * k) / a0]
    y = lfilter(b, a, x, axis=0)
    f0, q = 38.13547087602444, .5003270373238773
    k = math.tan(math.pi * f0 / rate)
    a0 = 1 + k / q + k * k
    b = [1, -2, 1]
    a = [1, 2 * (k * k - 1) / a0, (1 - k / q + k * k) / a0]
    return lfilter(b, a, y, axis=0)


def integrated_lufs(audio, rate):
    x = np.asarray(audio, dtype=np.float64)
    if x.ndim == 1:
        x = x[:, None]
    if len(x) < int(rate * .4):
        return -70.0
    y = _k_weight(x, rate)
    block, step = int(rate * .4), int(rate * .1)
    energies = []
    for s in range(0, len(y) - block + 1, step):
        energies.append(np.sum(np.mean(y[s:s + block] ** 2, axis=0)))
    energies = np.asarray(energies)
    if not len(energies):
        return -70.0
    loud = -0.691 + 10 * np.log10(energies + 1e-15)
    gated = energies[loud > -70]
    if not len(gated):
        return -70.0
    rel = -0.691 + 10 * np.log10(np.mean(gated)) - 10
    gated = energies[(loud > -70) & (loud > rel)]
    if not len(gated):
        return -70.0
    return float(-0.691 + 10 * np.log10(np.mean(gated)))


def true_peak_limit(audio, rate, ceiling_db=-1.0, lookahead=.005, release=.08):
    """Look-ahead limiter on 4x oversampled peaks; transparent below ceiling."""
    from scipy.ndimage import maximum_filter1d, minimum_filter1d
    from scipy.signal import resample_poly
    x = np.asarray(audio, dtype=np.float64)
    mono = x.ndim == 1
    if mono:
        x = x[:, None]
    ceiling = 10 ** (ceiling_db / 20)
    up = resample_poly(x, 4, 1, axis=0)
    peak4 = np.max(np.abs(up), axis=1).reshape(-1, 4).max(axis=1) if len(up) >= 4 * len(x) else \
        np.max(np.abs(x), axis=1)
    peak4 = peak4[:len(x)]
    if len(peak4) < len(x):
        peak4 = np.pad(peak4, (0, len(x) - len(peak4)))
    needed = np.minimum(1.0, ceiling / np.maximum(peak4, 1e-12))
    if needed.min() >= 1.0:
        out = x
    else:
        la = max(1, int(rate * lookahead))
        # hold the minimum over the look-ahead window, then smooth release
        held = minimum_filter1d(needed, size=2 * la + 1, mode='nearest')
        g = np.empty_like(held)
        prev = 1.0
        a_rel = math.exp(-1 / (rate * release))
        for i, v in enumerate(held):
            prev = v if v < prev else a_rel * prev + (1 - a_rel) * v
            g[i] = prev
        # attack smoothing (symmetric short window) never above the held need
        k = np.hanning(la * 2 + 1)
        k /= k.sum()
        smooth = np.convolve(g, k, mode='same')
        g = np.minimum(g, np.maximum(smooth, held))
        out = x * g[:, None]
        _ = maximum_filter1d  # keep import used for linters
    # final uniform safety trim for residual inter-sample overs
    up = resample_poly(out, 4, 1, axis=0)
    tp = float(np.max(np.abs(up))) if up.size else 0.0
    if tp > ceiling:
        out = out * (ceiling * .998 / tp)
    return out[:, 0] if mono else out


def apply_finish_file(converted_path: Path, source_path: Path, report: dict | None = None) -> bool:
    import soundfile as sf
    deess, harsh = enabled('DEESS'), enabled('HARSH')
    if not (deess or harsh):
        return False
    audio, rate = sf.read(str(converted_path), dtype='float64')
    source, source_rate = sf.read(str(source_path), dtype='float64')
    if audio.ndim != 1 or not np.isfinite(audio).all():
        return False
    out = finish_vocal(audio, rate, source, source_rate, deess, harsh, report=report)
    if not np.isfinite(out).all():
        return False
    sf.write(str(converted_path), out, rate, subtype='FLOAT')
    return True


# ---------------------------------------------------------------------------
# Matched synthetic room for the converted dry lead
# ---------------------------------------------------------------------------

def reverb_return(dry, rate, wet_to_dry_db, rt60=1.1, predelay=.02, seed=20260823, cap_db=-10.0):
    """Exponentially decaying stereo-decorrelated noise IR, low-passed.

    The level follows the energy ratio the dereverb stage removed from the
    original lead, capped so the vocal can never be washed out.
    """
    from scipy.signal import butter, fftconvolve, sosfiltfilt
    dry = np.asarray(dry, dtype=np.float64)
    if not np.isfinite(wet_to_dry_db) or wet_to_dry_db < -40:
        return dry
    level_db = min(cap_db, wet_to_dry_db)
    length = int(rate * min(2.5, rt60 * 1.2))
    rng = np.random.default_rng(seed)
    t = np.arange(length) / rate
    ir = rng.standard_normal(length) * np.exp(-6.9078 * t / rt60)
    ir[:int(predelay * rate)] = 0
    sos = butter(2, [250, min(7500, rate / 2 * .9)], btype='bandpass', fs=rate, output='sos')
    ir = sosfiltfilt(sos, ir)
    ir /= np.sqrt(np.sum(ir ** 2)) + 1e-12
    wet = fftconvolve(dry, ir)[:len(dry)]
    dry_rms = np.sqrt(np.mean(dry ** 2)) + 1e-12
    wet_rms = np.sqrt(np.mean(wet ** 2)) + 1e-12
    wet *= dry_rms / wet_rms * 10 ** (level_db / 20)
    return dry + wet


def apply_reverb_return_file(path: Path, stages: dict | None, report: dict | None = None) -> bool:
    import soundfile as sf
    if not enabled('REVERB_RETURN') or not stages:
        return False
    stage = (stages or {}).get('dereverb') or {}
    if not stage.get('ok'):
        return False
    ratio = float(stage.get('wetToDryDb', -100))
    audio, rate = sf.read(str(path), dtype='float64')
    if audio.ndim != 1 or not np.isfinite(audio).all():
        return False
    out = reverb_return(audio, rate, ratio)
    if report is not None:
        report.update(reverbReturnDb=min(-10.0, ratio) if ratio >= -40 else None)
    sf.write(str(path), out, rate, subtype='FLOAT')
    return True


def _decode_stereo(path: Path, rate: int):
    import subprocess
    result = subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-i', str(path), '-vn', '-ac', '2',
                             '-ar', str(rate), '-f', 'f32le', 'pipe:1'],
                            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=600, check=False)
    if result.returncode != 0 or len(result.stdout) < 8:
        return None
    return np.frombuffer(result.stdout, dtype='<f4').reshape(-1, 2).astype(np.float64)


def master_file(path: Path, reference: Path | None, ceiling_db: float, match_loudness: bool,
                report: dict | None = None) -> bool:
    """Loudness-match to the original upload, then look-ahead true-peak limit."""
    import soundfile as sf
    do_loud = enabled('LOUDNESS') and match_loudness and reference is not None
    do_limit = enabled('LIMITER')
    if not (do_loud or do_limit):
        return False
    audio, rate = sf.read(str(path), dtype='float64', always_2d=True)
    if not np.isfinite(audio).all() or not len(audio):
        return False
    info = {}
    if do_loud:
        original = _decode_stereo(reference, rate)
        if original is not None and len(original) > rate:
            target = integrated_lufs(original, rate)
            current = integrated_lufs(audio, rate)
            if target > -60 and current > -60:
                gain = float(np.clip(target - current, -6.0, 6.0))
                audio = audio * 10 ** (gain / 20)
                info.update(targetLufs=target, beforeLufs=current, loudnessGainDb=gain)
    if do_limit:
        audio = true_peak_limit(audio, rate, ceiling_db)
        info['limiterCeilingDb'] = ceiling_db
    info['afterLufs'] = integrated_lufs(audio, rate)
    if report is not None:
        report.update(info)
    sf.write(str(path), audio, rate, subtype='FLOAT')
    return True


def hires_rate(rate: int) -> int:
    return 48000 if enabled('HIRES') else rate


def encode_wav(source: Path, destination: Path) -> bool:
    """48 kHz / 24-bit PCM WAV (TPDF dither by ffmpeg's resampler)."""
    import subprocess
    if not enabled('HIRES'):
        return False
    for chain in ('aresample=48000:resampler=soxr:precision=28:dither_method=triangular',
                  'aresample=48000:dither_method=triangular'):
        result = subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', str(source),
                                 '-af', chain, '-c:a', 'pcm_s24le', str(destination)],
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=600, check=False)
        if result.returncode == 0 and destination.is_file() and destination.stat().st_size > 44:
            return True
        destination.unlink(missing_ok=True)
    return False
