"""Objective cover-quality metrics for the RVC v3 A/B bench.

Every number here is a signal proxy, not a listening verdict:

* octaveJumpRate      - fraction of voiced output frames inside short
                        (<=200 ms) islands that jump >=9 semitones away from
                        both neighbours and come back (octave glitches).
* grossPitchError     - fraction of frames voiced in the reference where the
                        output pitch differs from reference*2^(shift/12) by
                        more than 600 cents (mostly octave/half errors).
* breakupRate         - fraction of strongly periodic reference frames where
                        the output loses periodicity (破音 / voice breaks).
* hfNoiseDb           - median 4-10 kHz to 300-3000 Hz energy ratio over
                        voiced output frames, and its excess over the
                        reference vocal (电音 / metallic buzz proxy).
* hfFlatness          - median spectral flatness of 4-10 kHz in voiced
                        frames (buzz is noise-like, high flatness).
* clicksPerMinute     - isolated high-pass transients >8x local median.
* samplePeakDb / truePeakDb (4x oversampled) / clippedFraction.
* integratedLufs      - BS.1770 loudness (pyloudnorm when installed).

Usage:
  python tools/rvc_v3_metrics.py --output out_vocal.wav --reference ref_vocal.wav \
      [--shift 0] [--mix out_mix.wav] [--json result.json]
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly, stft

HOP_S = 0.01


def load_mono(path, rate=None):
    audio, sr = sf.read(str(path), dtype='float64', always_2d=True)
    mono = audio.mean(axis=1)
    if rate and sr != rate:
        g = math.gcd(int(sr), int(rate))
        mono = resample_poly(mono, int(rate) // g, int(sr) // g)
        sr = rate
    return mono, int(sr), audio


def frame_pitch(x, sr, fmin=60.0, fmax=1400.0):
    """Normalised-autocorrelation pitch + periodicity at 10 ms hop.

    Deterministic, dependency-free; used identically for reference and output
    so differences reflect the audio, not the tracker.
    """
    hop = int(round(sr * HOP_S))
    win = int(round(sr * 0.04))
    n = max(1, (len(x) - win) // hop + 1)
    lag_min = max(2, int(sr / fmax))
    lag_max = min(win - 2, int(sr / fmin))
    nfft = 1 << int(np.ceil(np.log2(2 * win)))
    w = np.hanning(win)
    rw = np.fft.irfft(np.abs(np.fft.rfft(w, nfft)) ** 2)[:win]
    rw /= rw[0]
    f0 = np.zeros(n)
    per = np.zeros(n)
    rms = np.zeros(n)
    for i in range(n):
        seg = x[i * hop:i * hop + win]
        if len(seg) < win:
            break
        rms[i] = np.sqrt(np.mean(seg ** 2))
        s = (seg - seg.mean()) * w
        r = np.fft.irfft(np.abs(np.fft.rfft(s, nfft)) ** 2)[:win]
        if r[0] <= 1e-12:
            continue
        r = r / r[0] / np.maximum(rw, 1e-3)
        band = r[lag_min:lag_max + 1]
        if len(band) < 3:
            continue
        mx = float(band.max())
        peaks = np.flatnonzero((band[1:-1] >= band[:-2]) & (band[1:-1] >= band[2:]) & (band[1:-1] >= .92 * mx)) + 1
        k = (int(peaks[0]) if len(peaks) else int(np.argmax(band))) + lag_min
        y0, y1, y2 = r[k - 1], r[k], r[k + 1]
        d = float(np.clip(0.5 * (y0 - y2) / (y0 - 2 * y1 + y2 + 1e-12), -1, 1))
        per[i] = min(1.0, max(0.0, y1 - .25 * (y0 - y2) * d))
        f0[i] = sr / (k + d)
    return f0, per, rms


def voiced_mask(f0, per, rms, threshold=.55):
    gate = rms > max(1e-4, np.percentile(rms, 95) * 10 ** (-35 / 20))
    return (per >= threshold) & gate & (f0 > 0)


def octave_jump_rate(f0, voiced):
    st = np.where(voiced, 12 * np.log2(np.maximum(f0, 1)), np.nan)
    n = len(st)
    flagged = np.zeros(n, bool)
    i = 0
    max_island = 20
    while i < n:
        if not np.isfinite(st[i]):
            i += 1
            continue
        # find island start where jump from previous voiced frame >= 9 st
        if i > 0 and np.isfinite(st[i - 1]) and abs(st[i] - st[i - 1]) >= 9:
            base = st[i - 1]
            j = i
            while j < n and j - i < max_island and np.isfinite(st[j]) and abs(st[j] - base) >= 9:
                j += 1
            if j < n and np.isfinite(st[j]) and abs(st[j] - base) < 4 and j - i < max_island:
                flagged[i:j] = True
                i = j
                continue
        i += 1
    return float(flagged.sum() / max(1, voiced.sum())), int(flagged.sum())


def band_energy(x, sr):
    f, _, z = stft(x, fs=sr, nperseg=int(sr * .04), noverlap=int(sr * .04) - int(sr * HOP_S), boundary=None, padded=False)
    p = np.abs(z) ** 2
    return f, p


def hf_metrics(x, sr, voiced):
    f, p = band_energy(x, sr)
    n = min(p.shape[1], len(voiced))
    p = p[:, :n]
    v = voiced[:n]
    if v.sum() < 10:
        return dict(hfNoiseDb=None, hfFlatness=None)
    hi = (f >= 4000) & (f <= min(10000, sr / 2 - 100))
    mid = (f >= 300) & (f <= 3000)
    ratio = 10 * np.log10((p[hi][:, v].sum(0) + 1e-12) / (p[mid][:, v].sum(0) + 1e-12))
    hb = p[hi][:, v] + 1e-12
    flat = np.exp(np.mean(np.log(hb), axis=0)) / np.mean(hb, axis=0)
    return dict(hfNoiseDb=float(np.median(ratio)), hfFlatness=float(np.median(flat)),
                hfNoiseP90Db=float(np.percentile(ratio, 90)))


def clicks_per_minute(x, sr):
    if len(x) < 64:
        return 0.0
    d = x[1:-1] - .5 * (x[:-2] + x[2:])
    a = np.abs(d)
    from scipy.ndimage import median_filter
    local = median_filter(a, size=int(sr * .005) | 1, mode='nearest')
    hits = np.flatnonzero(a > np.maximum(8 * local, 0.02))
    if hits.size:
        hits = hits[np.r_[True, np.diff(hits) > int(sr * .002)]]
    return float(hits.size / (len(x) / sr / 60))


def peaks(audio):
    a = np.asarray(audio, dtype=np.float64)
    sample = float(np.max(np.abs(a))) if a.size else 0.0
    up = resample_poly(a, 4, 1, axis=0)
    true = float(np.max(np.abs(up))) if up.size else 0.0
    clipped = float(np.mean(np.abs(a) >= .999)) if a.size else 0.0
    db = lambda v: 20 * math.log10(max(v, 1e-12))
    return dict(samplePeakDb=db(sample), truePeakDb=db(true), clippedFraction=clipped)


def lufs(audio, sr):
    try:
        import pyloudnorm
        return float(pyloudnorm.Meter(sr).integrated_loudness(np.asarray(audio, dtype=np.float64)))
    except Exception:
        x = np.asarray(audio, dtype=np.float64)
        return float(-0.691 + 10 * np.log10(np.mean(x ** 2) + 1e-12))


def evaluate(output, reference=None, shift=0.0, mix=None, original_mix=None):
    rate = 32000
    out, sr, out_raw = load_mono(output, rate)
    res = dict(output=str(output), durationSeconds=len(out) / sr)
    f0o, pero, rmso = frame_pitch(out, sr)
    vo = voiced_mask(f0o, pero, rmso)
    res['voicedFraction'] = float(vo.mean())
    res['octaveJumpRate'], res['octaveJumpFrames'] = octave_jump_rate(f0o, vo)
    res.update(hf_metrics(out, sr, vo))
    res['clicksPerMinute'] = clicks_per_minute(load_mono(output)[0], load_mono(output)[1])
    res.update(peaks(out_raw))
    _, osr, oraw = load_mono(output)
    res['integratedLufs'] = lufs(oraw, osr)
    if reference:
        ref, _, _ = load_mono(reference, rate)
        n = min(len(ref), len(out))
        f0r, perr, rmsr = frame_pitch(ref[:n], sr)
        m = min(len(f0r), len(f0o))
        vr = voiced_mask(f0r[:m], perr[:m], rmsr[:m], .6)
        expected = f0r[:m] * 2 ** (shift / 12)
        both = vr & (f0o[:m] > 0) & (pero[:m] > .35)
        cents = np.abs(1200 * np.log2(np.maximum(f0o[:m], 1) / np.maximum(expected, 1)))
        res['grossPitchError'] = float(np.mean(cents[both] > 600)) if both.sum() else None
        res['medianPitchErrorCents'] = float(np.median(np.minimum(cents[both], 2400))) if both.sum() else None
        strong = vr & (perr[:m] > .8)
        res['breakupRate'] = float(np.mean(pero[:m][strong] < .4)) if strong.sum() else None
        href = hf_metrics(ref[:n], sr, vr)
        res['referenceHfNoiseDb'] = href['hfNoiseDb']
        if href['hfNoiseDb'] is not None and res['hfNoiseDb'] is not None:
            res['hfExcessDb'] = res['hfNoiseDb'] - href['hfNoiseDb']
    if mix:
        _, msr, mraw = load_mono(mix)
        res['mix'] = dict(integratedLufs=lufs(mraw, msr), **peaks(mraw), sampleRate=msr,
                          subtype=sf.info(str(mix)).subtype)
        if original_mix:
            _, rsr, rraw = load_mono(original_mix)
            res['mix']['originalLufs'] = lufs(rraw, rsr)
            res['mix']['loudnessDeltaDb'] = res['mix']['integratedLufs'] - res['mix']['originalLufs']
    return res


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--output', required=True)
    p.add_argument('--reference')
    p.add_argument('--shift', type=float, default=0)
    p.add_argument('--mix')
    p.add_argument('--original-mix')
    p.add_argument('--json')
    a = p.parse_args()
    r = evaluate(a.output, a.reference, a.shift, a.mix, a.original_mix)
    text = json.dumps(r, indent=2, ensure_ascii=False)
    if a.json:
        Path(a.json).write_text(text, encoding='utf-8')
    print(text)


if __name__ == '__main__':
    main()
