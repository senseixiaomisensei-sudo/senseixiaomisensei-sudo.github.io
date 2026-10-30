"""Lightweight (CPU-only, no RVC inference) A/B for the v3 stages.

The full end-to-end bench (tools/rvc_v3_bench.py) needs the GPU service.
This script isolates the two stage groups that can be judged without a
voice model and runs them old-vs-new on short clips with a clean reference
vocal (e.g. MUSDB18 stems):

1. Post-processing  (de-ess / dynamic 4-10 kHz cut / loudness match /
   true-peak limiter).  The input "converted vocal" is either a real RVC
   output (--converted) or, when none is available, a *synthetic artefact
   stand-in*: the clean vocal plus vowel-gated 4-10 kHz noise (metallic-buzz
   proxy) and boosted sibilance, mixed hot enough to clip.  A = no v3
   finishing (plain sum, as the legacy remix), B = v3 finishing + master.
   A control run feeds the *clean* vocal through the same finishing to check
   that audio without excess is left alone.

2. F0 repair.  The reference contour is tracked from the clean vocal with the
   metrics tracker; known octave islands (30-120 ms, +-12 st) and 1-2 frame
   spikes are injected; A = corrupted contour, B = repair_pitch(corrupted).
   The repair is also run on the uncorrupted contour to count false edits.
   Contours are sonified (harmonic synth with the reference envelope) so the
   difference can be heard.

Usage:
  python tools/rvc_v3_lite_ab.py --name clip --vocal vocals.wav \
      --accompaniment accompaniment.wav --mix mixture.wav --out OUT \
      [--offset 30 --seconds 20] [--converted rvc_vocal.wav]
"""
from __future__ import annotations

import argparse
import json
import math
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import butter, resample_poly, sosfilt

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'rvc-service'))
sys.path.insert(0, str(ROOT / 'tools'))
from app import v3_quality as q  # noqa: E402
from rvc_v3_metrics import evaluate, frame_pitch, octave_jump_rate, voiced_mask  # noqa: E402


def load(path, offset, seconds, rate=44100):
    info = sf.info(str(path))
    start = int(offset * info.samplerate)
    frames = int(seconds * info.samplerate)
    audio, sr = sf.read(str(path), start=start, frames=frames, dtype='float64', always_2d=True)
    if sr != rate:
        g = math.gcd(sr, rate)
        audio = resample_poly(audio, rate // g, sr // g, axis=0)
    return audio


def write(path, audio, rate):
    sf.write(str(path), audio, rate, subtype='FLOAT')


def mp3(wav, dst):
    subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', str(wav), '-c:a', 'libmp3lame',
                    '-b:a', '192k', str(dst)], check=True)


def stand_in(vocal_mono, rate, seed=7):
    """Clean vocal + vowel-gated HF buzz + exaggerated sibilance."""
    rng = np.random.default_rng(seed)
    band = sosfilt(butter(4, [4500, 9500], 'band', fs=rate, output='sos'), rng.standard_normal(len(vocal_mono)))
    mid = sosfilt(butter(2, [300, 3000], 'band', fs=rate, output='sos'), vocal_mono)
    hop = 441
    env = np.sqrt(np.convolve(mid ** 2, np.ones(hop) / hop, mode='same'))
    buzz = band / (np.sqrt(np.mean(band ** 2)) + 1e-12) * env * .35
    sib = sosfilt(butter(2, 5000, 'high', fs=rate, output='sos'), vocal_mono) * 1.0
    return vocal_mono + buzz + sib


def postprocess_ab(name, vocal, acc, mix, rate, out, converted=None):
    ref = vocal.mean(axis=1)
    conv = converted.mean(axis=1) if converted is not None else stand_in(ref, rate)
    # hot gain so the plain sum overs like an unguarded legacy mix would
    gain = 1.0
    rows = {}
    files = {}
    # A: legacy = plain sum, no finishing
    a_v = conv * gain
    a_mix = acc + a_v[:, None]
    # B: v3 finishing then master (loudness to the original mix + TP limit)
    report = {}
    b_v = q.finish_vocal(conv * gain, rate, ref, rate, True, True, report=report)
    b_mix = acc + b_v[:, None]
    target = q.integrated_lufs(mix, rate)
    current = q.integrated_lufs(b_mix, rate)
    loud_gain = float(np.clip(target - current, -6, 6))
    b_mix = q.true_peak_limit(b_mix * 10 ** (loud_gain / 20), rate, -1.0)
    # control: clean vocal through the same finishing (should be ~unchanged)
    c_v = q.finish_vocal(ref, rate, ref, rate, True, True)
    tmp = out / 'wav'
    tmp.mkdir(parents=True, exist_ok=True)
    paths = dict(ref=tmp / f'{name}_ref_vocal.wav', a_v=tmp / f'{name}_A_vocal.wav', b_v=tmp / f'{name}_B_vocal.wav',
                 a_mix=tmp / f'{name}_A_mix.wav', b_mix=tmp / f'{name}_B_mix.wav', mix=tmp / f'{name}_orig_mix.wav',
                 c_v=tmp / f'{name}_ctrl_vocal.wav')
    write(paths['ref'], ref, rate)
    write(paths['a_v'], a_v, rate)
    write(paths['b_v'], b_v, rate)
    write(paths['c_v'], c_v, rate)
    write(paths['a_mix'], a_mix, rate)
    write(paths['b_mix'], b_mix, rate)
    write(paths['mix'], mix, rate)
    rows['A_legacy'] = evaluate(paths['a_v'], paths['ref'], 0, paths['a_mix'], paths['mix'])
    rows['B_v3'] = evaluate(paths['b_v'], paths['ref'], 0, paths['b_mix'], paths['mix'])
    rows['control_clean_in'] = evaluate(paths['c_v'], paths['ref'], 0)
    rows['control_clean_in']['maxAbsDiffFromInput'] = float(np.max(np.abs(c_v - ref)))
    rows['control_clean_in']['diffRmsDbRelInput'] = float(
        10 * np.log10(np.mean((c_v - ref) ** 2) / (np.mean(ref ** 2) + 1e-15) + 1e-15))
    rows['B_v3']['finish'] = report
    rows['B_v3']['loudnessGainDb'] = loud_gain
    for key in ('a_mix', 'b_mix', 'a_v', 'b_v'):
        dst = out / f'{name}__post_{"A_legacy" if key.startswith("a") else "B_v3"}_{"mix" if key.endswith("mix") else "vocal"}.mp3'
        mp3(paths[key], dst)
        files[key] = str(dst)
    return rows, files


def inject(f0, rng, voiced_seconds):
    f0 = f0.copy()
    truth = f0.copy()
    voiced = f0 > 0
    runs = q._runs(voiced)
    long_runs = [(s, e) for s, e in runs if e - s >= 40]
    n_islands = max(2, int(voiced_seconds / 2))
    n_spikes = max(2, int(voiced_seconds / 2))
    injected = dict(islands=0, islandFrames=0, spikes=0)
    for _ in range(n_islands):
        if not long_runs:
            break
        s, e = long_runs[rng.integers(len(long_runs))]
        width = int(rng.integers(3, 13))
        start = int(rng.integers(s + 14, max(s + 15, e - 14 - width)))
        if start + width >= e - 13:
            continue
        f0[start:start + width] *= 2.0 if rng.random() < .5 else .5
        injected['islands'] += 1
        injected['islandFrames'] += width
    for _ in range(n_spikes):
        s, e = long_runs[rng.integers(len(long_runs))]
        k = int(rng.integers(s + 3, e - 3))
        f0[k] *= 2 ** (5 / 12)
        injected['spikes'] += 1
    return f0, truth, injected


def gpe(f0, truth):
    both = (f0 > 0) & (truth > 0)
    cents = np.abs(1200 * np.log2(np.maximum(f0[both], 1) / np.maximum(truth[both], 1)))
    return float(np.mean(cents > 600)), float(np.mean(cents > 50))


def sonify(f0, rms, rate, hop_s=.01):
    n = int(len(f0) * hop_s * rate)
    t_frames = np.arange(len(f0)) * hop_s
    t = np.arange(n) / rate
    hz = np.interp(t, t_frames, f0)
    amp = np.interp(t, t_frames, rms * (f0 > 0))
    phase = 2 * np.pi * np.cumsum(hz) / rate
    y = sum((.6 / k) * np.sin(k * phase) * (k * hz < rate / 2 - 500) for k in range(1, 9))
    return y * amp / (np.max(np.abs(y * amp)) + 1e-9) * .5


def real_tracker_ab(vocal, separated, sr=32000):
    """Repair on a *real* tracker contour of the separated vocal vs. the GT contour."""
    gt = resample_poly(vocal.mean(axis=1), 320, 441)
    sv = resample_poly(separated.mean(axis=1), 320, 441)
    f0g, perg, rmsg = frame_pitch(gt, sr)
    truth = np.where(voiced_mask(f0g, perg, rmsg), f0g, 0.0)
    f0s, pers, rmss = frame_pitch(sv, sr)
    track = np.where(voiced_mask(f0s, pers, rmss), f0s, 0.0)
    n = min(len(truth), len(track))
    truth, track = truth[:n], track[:n]
    fixed, rep = q.repair_pitch(track)
    res = dict(repairReport=rep)
    for label, contour in (('A_tracked', track), ('B_repaired', fixed)):
        g600, g50 = gpe(contour, truth)
        r, frames = octave_jump_rate(contour, contour > 0)
        res[label] = dict(grossErrorVsTruth=g600, over50CentVsTruth=g50, octaveJumpRate=r, octaveJumpFrames=frames)
    return res


def pitch_ab(name, vocal, rate, out, seed, separated=None):
    ref = vocal.mean(axis=1)
    sr = 32000
    x = resample_poly(ref, 320, 441)
    f0, per, rms = frame_pitch(x, sr)
    v = voiced_mask(f0, per, rms)
    clean = np.where(v, f0, 0.0)
    rng = np.random.default_rng(seed)
    bad, truth, injected = inject(clean, rng, v.sum() / 100)
    fixed, rep = q.repair_pitch(bad)
    clean_fixed, rep_clean = q.repair_pitch(clean)
    res = dict(injected=injected, repairReport=rep, falseEditsOnClean=rep_clean.get('changedFrames', 0),
               cleanVoicedFrames=int((clean > 0).sum()), cleanRepairReport=rep_clean)
    for label, contour in (('A_corrupted', bad), ('B_repaired', fixed)):
        g600, g50 = gpe(contour, truth)
        rate_, frames = octave_jump_rate(contour, contour > 0)
        res[label] = dict(grossErrorVsTruth=g600, over50CentVsTruth=g50, octaveJumpRate=rate_, octaveJumpFrames=frames)
    rate_, frames = octave_jump_rate(clean, clean > 0)
    res['truth'] = dict(octaveJumpRate=rate_, octaveJumpFrames=frames)
    tmp = out / 'wav'
    tmp.mkdir(parents=True, exist_ok=True)
    files = {}
    for label, contour in (('A_corrupted', bad), ('B_repaired', fixed)):
        wav = tmp / f'{name}_f0_{label}.wav'
        write(wav, sonify(contour, rms, 44100), 44100)
        dst = out / f'{name}__f0_{label}_sonified.mp3'
        mp3(wav, dst)
        files[label] = str(dst)
    if separated is not None:
        res['realTracker'] = real_tracker_ab(vocal, separated)
    return res, files


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--name', required=True)
    p.add_argument('--vocal', required=True)
    p.add_argument('--accompaniment', help='default: mix - vocal')
    p.add_argument('--mix', required=True)
    p.add_argument('--converted')
    p.add_argument('--separated', help='real separated vocal of the same mix (optional)')
    p.add_argument('--offset', type=float, default=30)
    p.add_argument('--seconds', type=float, default=20)
    p.add_argument('--seed', type=int, default=20261030)
    p.add_argument('--out', required=True)
    a = p.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    rate = 44100
    vocal = load(a.vocal, a.offset, a.seconds, rate)
    mix = load(a.mix, a.offset, a.seconds, rate)
    if a.accompaniment:
        acc = load(a.accompaniment, a.offset, a.seconds, rate)
    else:
        n = min(len(mix), len(vocal))
        mix, vocal = mix[:n], vocal[:n]
        acc = mix - vocal
    conv = load(a.converted, a.offset, a.seconds, rate) if a.converted else None
    sep = load(a.separated, a.offset, a.seconds, rate) if a.separated else None
    post, post_files = postprocess_ab(a.name, vocal, acc, mix, rate, out, conv)
    result = dict(name=a.name, offset=a.offset, seconds=a.seconds,
                  convertedSource='real RVC output' if conv is not None else 'synthetic artefact stand-in',
                  post=post)
    files = dict(post=post_files)
    if sep is not None:
        # second post-processing case: a real separated vocal (true separation
        # artefacts, no synthetic excess) run through the same A/B
        post_sep, post_sep_files = postprocess_ab(a.name + '_sepvocal', vocal, acc, mix, rate, out, sep)
        result['postSeparatedVocal'] = post_sep
        files['postSeparatedVocal'] = post_sep_files
    pitch, pitch_files = pitch_ab(a.name, vocal, rate, out, a.seed, sep)
    result['pitch'] = pitch
    files['pitch'] = pitch_files
    result['files'] = files
    (out / f'{a.name}__lite_ab.json').write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False)[:2000])


if __name__ == '__main__':
    main()
