"""End-to-end v3 A/B through a real RVC conversion on CPU.

Runs the browser engine's own ONNX graphs (tools/rvc_onnx_cpu.py: HuBERT +
RMVPE + an RVC v2 character) so every v3 stage is judged on *converted*
audio with real RVC artefacts, not on post-processing stand-ins.

Phases (each is short and resumable; run them one after another):

  python tools/rvc_v3_e2e.py rvc   --clips DIR --sep DIR --onnx DIR --out OUT [--only NAME]
  python tools/rvc_v3_e2e.py post  --clips DIR --sep DIR --out OUT
  python tools/rvc_v3_e2e.py combo --clips DIR --sep DIR --onnx DIR --out OUT
  python tools/rvc_v3_e2e.py mp3   --out OUT --mp3 DIR
  python tools/rvc_v3_e2e_table.py OUT/results.json > OUT/table.md

Inputs per clip NAME: DIR/NAME__voc.wav (clean stem = "dry" reference),
DIR/NAME__acc.wav, DIR/NAME__mix.wav and SEP/NAME__BS-Roformer-Resurrec.wav
(separated vocal = what the cover service really feeds RVC).

F0 arms (each a separate RVC conversion, identical seeds/windows):
  raw     RMVPE contour as the browser/cloud use it today
  fix2    rvc-v3-quality-2 repair (low-confidence octave islands only)
  fix1    rvc-v3-quality-1 repair (geometry only, the regressed version)
  inj     clean contour with 2 injected +12 st islands (salience set low,
          simulating RMVPE's uncertain frames) - a positive control
  injfix2 the same corrupted contour after the v2 repair
Post arms on the raw conversion: none / deess2 / harsh2 / finish2 / finish1.
Master arms on the mix: legacy (sum, uniform true-peak trim to -1 dBTP) vs
v3 (BS.1770 loudness match to the original mix +-6 dB, then look-ahead
true-peak limiter, then the same legacy trim).
Combo (the RVC_V3=1 default chain end to end): fix2 conversion -> HARSH r2
-> sum -> loudness match + limiter -> trim, vs the legacy chain.

F0 reference = RMVPE on the clean stem x 2^(shift/12) for both inputs.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / 'rvc-service'))

from rvc_onnx_cpu import OnnxRvc, to16k  # noqa: E402
import rvc_v3_metrics as M  # noqa: E402
from app import v3_quality as Q  # noqa: E402

OUT_RATE = 40000
F0_ARMS = ('raw', 'fix2', 'fix1', 'inj', 'injfix2', 'hi_raw', 'hi_fix2')
BASES = ('raw', 'hi_raw')  # post/master arms are applied to both conversions
POST_ARMS = ('none', 'deess2', 'harsh2', 'finish2', 'finish1')


def clip_names(clips: Path):
    return sorted(p.name[:-len('__voc.wav')] for p in clips.glob('*__voc.wav'))


def load_mono(path):
    x, sr = sf.read(str(path), dtype='float64', always_2d=True)
    return x.mean(axis=1), sr


def auto_shift(f0):
    v = f0[f0 > 0]
    if not len(v):
        return 0
    # the website's same-register rule of thumb for a bright female voice
    return 12 if np.median(v) < 220 else 0


def inject(f0, conf, seed=7):
    """Two 80 ms +12 st islands on stable voiced stretches, salience 0.3."""
    f0 = f0.copy()
    conf = conf.copy()
    st = np.where(f0 > 0, 12 * np.log2(np.maximum(f0, 1)), np.nan)
    good = []
    for k in range(30, len(f0) - 30):
        w = st[k - 12:k + 20]
        if np.all(np.isfinite(w)) and np.ptp(w) < 3:
            good.append(k)
    rng = np.random.default_rng(seed)
    spots = []
    for k in rng.permutation(good):
        if all(abs(k - s) > 80 for s in spots):
            spots.append(int(k))
        if len(spots) == 2:
            break
    for s in spots:
        f0[s:s + 8] *= 2
        conf[s:s + 8] = .3
    return f0, conf, spots


def phase_rvc(a):
    clips, sep, out = Path(a.clips), Path(a.sep), Path(a.out)
    (out / 'raw').mkdir(parents=True, exist_ok=True)
    (out / 'f0').mkdir(parents=True, exist_ok=True)
    rvc = OnnxRvc(Path(a.onnx), a.voice, noise_scale=a.noise_scale)
    for name in clip_names(clips):
        if a.only and a.only not in name:
            continue
        clean, sr = load_mono(clips / f'{name}__voc.wav')
        clean16 = to16k(clean, sr)
        ref_f0, ref_conf, _ = rvc.rmvpe(clean16)
        shift = auto_shift(ref_f0)
        inputs = {'clean': clean16}
        sp = sep / f'{name}__BS-Roformer-Resurrec.wav'
        if sp.is_file():
            s, ssr = load_mono(sp)
            inputs['sep'] = to16k(s, ssr)
        for kind, x16 in inputs.items():
            tag = f'{name}__{kind}'
            f0, conf, _ = (ref_f0, ref_conf, None) if kind == 'clean' else rvc.rmvpe(x16)
            arms = {'raw': f0}
            arms['fix2'], rep2 = Q.repair_pitch(f0, confidence=conf)
            arms['fix1'], rep1 = Q._repair_pitch_r1(f0, x16, 16000, 160)
            info = dict(shift=shift, fix2=rep2, fix1=rep1)
            if kind == 'clean':
                inj_f0, inj_conf, spots = inject(f0, conf)
                arms['inj'] = inj_f0
                arms['injfix2'], repi = Q.repair_pitch(inj_f0, confidence=inj_conf)
                info.update(injectedAt=spots, injfix2=repi)
            np.savez_compressed(out / 'f0' / f'{tag}.npz', ref=ref_f0, refconf=ref_conf, f0=f0, conf=conf,
                                **{f'arm_{k}': v for k, v in arms.items()})
            (out / 'f0' / f'{tag}.json').write_text(json.dumps(info, indent=1, default=float))
            done = {}
            # register stress: the same contours one octave up (RVC's high
            # notes are where 电音/破音 live)
            arms['hi_raw'], arms['hi_fix2'] = arms['raw'], arms['fix2']
            for arm, contour in arms.items():
                arm_shift = shift + (12 if arm.startswith('hi_') else 0)
                path = out / 'raw' / f'{tag}__{arm}.wav'
                if path.is_file() and not a.force:
                    continue
                key = contour.tobytes() + bytes([arm_shift + 64])
                if key in done:  # identical contour -> identical conversion
                    sf.write(str(path), sf.read(str(done[key]))[0], OUT_RATE, subtype='FLOAT')
                    continue
                y = rvc.convert(x16, contour, arm_shift)
                sf.write(str(path), y, OUT_RATE, subtype='FLOAT')
                done[key] = path
                print(tag, arm, 'shift', arm_shift, 'peak', round(float(np.abs(y).max()), 3), flush=True)


# ---------------------------------------------------------------------------

def rmvpe_track(rvc, y, rate):
    f0, conf, _ = rvc.rmvpe(to16k(y, rate))
    return f0, conf


def f0_metrics(out_f0, ref_f0, shift):
    n = min(len(out_f0), len(ref_f0))
    o, r = out_f0[:n], ref_f0[:n] * 2 ** (shift / 12)
    both = (o > 0) & (r > 0)
    res = {}
    if both.sum():
        c = 1200 * np.log2(o[both] / r[both])
        res['f0RmseCents'] = float(np.sqrt(np.mean(np.minimum(np.abs(c), 2400) ** 2)))
        res['f0GrossRate'] = float(np.mean(np.abs(c) > 600))
        res['f0OctaveErrRate'] = float(np.mean(np.abs(np.abs(c) - 1200) < 300))
    voiced = o > 0
    res['rmvpeOctaveJumpRate'], res['rmvpeOctaveJumpFrames'] = M.octave_jump_rate(o, voiced)
    res['voicingRecall'] = float(np.mean(o[r > 0] > 0)) if (r > 0).sum() else None
    return res


def spectral_flatness_voiced(y, rate):
    f, p = M.band_energy(y, rate)
    hi = (f >= 4000) & (f <= min(10000, rate / 2 - 100))
    hb = p[hi] + 1e-12
    flat = np.exp(np.mean(np.log(hb), axis=0)) / np.mean(hb, axis=0)
    e = p.sum(0)
    act = 10 * np.log10(e + 1e-12) > np.percentile(10 * np.log10(e + 1e-12), 95) - 30
    return float(np.median(flat[act])) if act.sum() else None


def legacy_trim(mix, rate, ceiling_db=-1.0):
    from scipy.signal import resample_poly
    tp = float(np.max(np.abs(resample_poly(mix, 4, 1, axis=0))))
    c = 10 ** (ceiling_db / 20)
    return mix * (c * .998 / tp) if tp > c else mix


def to_rate(x, src, dst):
    from scipy.signal import resample_poly
    g = math.gcd(int(src), int(dst))
    return resample_poly(x, dst // g, src // g, axis=0)


def phase_post(a):
    clips, sep, out = Path(a.clips), Path(a.sep), Path(a.out)
    (out / 'post').mkdir(exist_ok=True)
    (out / 'mix').mkdir(exist_ok=True)
    rvc = OnnxRvc(Path(a.onnx), a.voice, noise_scale=a.noise_scale)
    results = json.loads((out / 'results.json').read_text()) if (out / 'results.json').is_file() and not a.force else {}
    for name in clip_names(clips):
        if a.only and a.only not in name:
            continue
        mix_orig, msr = sf.read(str(clips / f'{name}__mix.wav'), dtype='float64', always_2d=True)
        acc_true, _ = sf.read(str(clips / f'{name}__acc.wav'), dtype='float64', always_2d=True)
        for kind in ('clean', 'sep'):
            tag = f'{name}__{kind}'
            npz = out / 'f0' / f'{tag}.npz'
            if not npz.is_file() or tag in results:
                continue
            info = json.loads((out / 'f0' / f'{tag}.json').read_text())
            shift = info['shift']
            d = np.load(npz)
            ref_f0 = d['ref']
            if kind == 'clean':
                src_path = clips / f'{name}__voc.wav'
                acc = acc_true
            else:
                src_path = sep / f'{name}__BS-Roformer-Resurrec.wav'
                s2, _ = sf.read(str(src_path), dtype='float64', always_2d=True)
                n = min(len(s2), len(mix_orig))
                acc = mix_orig[:n] - s2[:n]  # separated instrumental
            source, ssr = load_mono(src_path)
            row = dict(shift=shift, repair=info, f0={}, post={}, master={})
            for arm in F0_ARMS:
                p = out / 'raw' / f'{tag}__{arm}.wav'
                if not p.is_file():
                    continue
                arm_shift = shift + (12 if arm.startswith('hi_') else 0)
                y, _ = sf.read(str(p))
                of0, _ = rmvpe_track(rvc, y, OUT_RATE)
                row['f0'][arm] = dict(**f0_metrics(of0, ref_f0, arm_shift),
                                      **{k: v for k, v in M.evaluate(p, src_path, arm_shift).items()
                                         if k in ('octaveJumpRate', 'grossPitchError', 'breakupRate', 'clicksPerMinute')})
            for base in BASES:
                base_shift = shift + (12 if base.startswith('hi_') else 0)
                y, _ = sf.read(str(out / 'raw' / f'{tag}__{base}.wav'))
                variants = {'none': y}
                rep = {}
                variants['deess2'] = Q.finish_vocal(y, OUT_RATE, source, ssr, deess=True, harsh=False, report=rep.setdefault('deess2', {}))
                variants['harsh2'] = Q.finish_vocal(y, OUT_RATE, source, ssr, deess=False, harsh=True, report=rep.setdefault('harsh2', {}))
                variants['finish2'] = Q.finish_vocal(y, OUT_RATE, source, ssr, report=rep.setdefault('finish2', {}))
                variants['finish1'] = Q._finish_vocal_stft_r1(y, OUT_RATE, source, ssr, report=rep.setdefault('finish1', {}))
                row['post'][base] = {}
                for arm, v in variants.items():
                    p = out / 'post' / f'{tag}__{base}__{arm}.wav'
                    sf.write(str(p), v, OUT_RATE, subtype='FLOAT')
                    of0, _ = rmvpe_track(rvc, v, OUT_RATE)
                    ev = M.evaluate(p, src_path, base_shift)
                    row['post'][base][arm] = dict(**f0_metrics(of0, ref_f0, base_shift),
                        **{k: ev.get(k) for k in ('octaveJumpRate', 'grossPitchError', 'breakupRate',
                                                 'clicksPerMinute', 'hfNoiseDb', 'hfExcessDb', 'hfFlatness',
                                                 'hfNoiseP90Db')},
                        flatness=spectral_flatness_voiced(v, OUT_RATE),
                        changeRmsDb=float(10 * np.log10(np.mean((v - y) ** 2) / np.mean(y ** 2) + 1e-30)),
                        report=rep.get(arm))
                # master: converted vocal (no finishing) + instrumental
                voc = to_rate(y, OUT_RATE, msr)
                n = min(len(voc), len(acc))
                mix = acc[:n] + voc[:n, None]
                legacy = legacy_trim(mix, msr)
                ref_mix_path = clips / f'{name}__mix.wav'
                pa = out / 'mix' / f'{tag}__{base}__legacy.wav'
                sf.write(str(pa), legacy, msr, subtype='FLOAT')
                pb = out / 'mix' / f'{tag}__{base}__v3.wav'
                sf.write(str(pb), mix, msr, subtype='FLOAT')
                env = {'RVC_V3': '1', 'RVC_V3_LOUDNESS': '1', 'RVC_V3_LIMITER': '1'}
                import os
                old = {k: os.environ.get(k) for k in env}
                os.environ.update(env)
                try:
                    mrep = {}
                    Q.master_file(pb, ref_mix_path, -1.0, True, mrep)
                finally:
                    for k, v in old.items():
                        if v is None:
                            os.environ.pop(k, None)
                        else:
                            os.environ[k] = v
                b, _ = sf.read(str(pb), dtype='float64', always_2d=True)
                sf.write(str(pb), legacy_trim(b, msr), msr, subtype='FLOAT')
                row['master'][base] = {}
                for arm, p in (('legacy', pa), ('v3', pb)):
                    ev = M.evaluate(p, None, 0, p, ref_mix_path)
                    row['master'][base][arm] = dict(ev['mix'], clicksPerMinute=ev['clicksPerMinute'])
                row['master'][base]['v3']['report'] = mrep
            results[tag] = row
            (out / 'results.json').write_text(json.dumps(results, indent=1, default=float))
            print('post done', tag, flush=True)


def phase_combo(a):
    """Default RVC_V3=1 chain end to end vs the legacy chain, per case.

    legacy = raw conversion, no finishing, sum + uniform -1 dBTP trim
             (already measured by ``post``: post[base]['none'] + master[base]['legacy']).
    v3     = OCTAVE_FIX r2 conversion -> HARSH r2 -> sum -> loudness match +
             true-peak limiter -> same -1 dBTP trim.
    """
    import os
    clips, sep, out = Path(a.clips), Path(a.sep), Path(a.out)
    (out / 'combo').mkdir(exist_ok=True)
    rvc = OnnxRvc(Path(a.onnx), a.voice, noise_scale=a.noise_scale)
    results = json.loads((out / 'results.json').read_text())
    for name in clip_names(clips):
        if a.only and a.only not in name:
            continue
        mix_orig, msr = sf.read(str(clips / f'{name}__mix.wav'), dtype='float64', always_2d=True)
        acc_true, _ = sf.read(str(clips / f'{name}__acc.wav'), dtype='float64', always_2d=True)
        for kind in ('clean', 'sep'):
            tag = f'{name}__{kind}'
            row = results.get(tag)
            if row is None or ('combo' in row and not a.force):
                continue
            shift = row['shift']
            ref_f0 = np.load(out / 'f0' / f'{tag}.npz')['ref']
            if kind == 'clean':
                src_path, acc = clips / f'{name}__voc.wav', acc_true
            else:
                src_path = sep / f'{name}__BS-Roformer-Resurrec.wav'
                s2, _ = sf.read(str(src_path), dtype='float64', always_2d=True)
                n = min(len(s2), len(mix_orig))
                acc = mix_orig[:n] - s2[:n]
            source, ssr = load_mono(src_path)
            row['combo'] = {}
            for base, conv in (('raw', 'fix2'), ('hi_raw', 'hi_fix2')):
                base_shift = shift + (12 if base.startswith('hi_') else 0)
                y, _ = sf.read(str(out / 'raw' / f'{tag}__{conv}.wav'))
                rep = {}
                v = Q.finish_vocal(y, OUT_RATE, source, ssr, deess=False, harsh=True, report=rep)
                pv = out / 'combo' / f'{tag}__{base}__v3vocal.wav'
                sf.write(str(pv), v, OUT_RATE, subtype='FLOAT')
                of0, _ = rmvpe_track(rvc, v, OUT_RATE)
                ev = M.evaluate(pv, src_path, base_shift)
                voc_m = dict(**f0_metrics(of0, ref_f0, base_shift),
                             **{k: ev.get(k) for k in ('octaveJumpRate', 'breakupRate', 'clicksPerMinute',
                                                      'hfExcessDb', 'hfNoiseP90Db')})
                vv = to_rate(v, OUT_RATE, msr)
                n = min(len(vv), len(acc))
                pm = out / 'combo' / f'{tag}__{base}__v3mix.wav'
                sf.write(str(pm), acc[:n] + vv[:n, None], msr, subtype='FLOAT')
                env = {'RVC_V3': '1', 'RVC_V3_LOUDNESS': '1', 'RVC_V3_LIMITER': '1'}
                old = {k: os.environ.get(k) for k in env}
                os.environ.update(env)
                try:
                    mrep = {}
                    Q.master_file(pm, clips / f'{name}__mix.wav', -1.0, True, mrep)
                finally:
                    for k, val in old.items():
                        if val is None:
                            os.environ.pop(k, None)
                        else:
                            os.environ[k] = val
                b, _ = sf.read(str(pm), dtype='float64', always_2d=True)
                sf.write(str(pm), legacy_trim(b, msr), msr, subtype='FLOAT')
                em = M.evaluate(pm, None, 0, pm, clips / f'{name}__mix.wav')
                row['combo'][base] = dict(vocal=voc_m, mix=dict(em['mix'], clicksPerMinute=em['clicksPerMinute']),
                                          finish=rep, master=mrep)
            results[tag] = row
            (out / 'results.json').write_text(json.dumps(results, indent=1, default=float))
            print('combo done', tag, flush=True)


def phase_mp3(a):
    import subprocess
    out = Path(a.out)
    dst = Path(a.mp3 or out)
    dst.mkdir(parents=True, exist_ok=True)
    for sub in ('raw', 'post', 'mix', 'combo'):
        for p in sorted((out / sub).glob('*.wav')):
            if sub == 'raw' and not any(p.stem.endswith(f'__{k}') for k in ('raw', 'fix2', 'inj', 'injfix2', 'fix1')):
                continue
            m = dst / f'{sub}__{p.stem}.mp3'
            if m.is_file():
                continue
            subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', str(p), '-c:a', 'libmp3lame',
                            '-b:a', '192k', str(m)], check=False)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('phase', choices=['rvc', 'post', 'combo', 'mp3'])
    ap.add_argument('--clips')
    ap.add_argument('--sep')
    ap.add_argument('--onnx')
    ap.add_argument('--voice', default='arona')
    ap.add_argument('--noise-scale', type=float, default=.35)
    ap.add_argument('--out', required=True)
    ap.add_argument('--mp3')
    ap.add_argument('--only')
    ap.add_argument('--force', action='store_true')
    a = ap.parse_args()
    dict(rvc=phase_rvc, post=phase_post, combo=phase_combo, mp3=phase_mp3)[a.phase](a)


if __name__ == '__main__':
    main()
