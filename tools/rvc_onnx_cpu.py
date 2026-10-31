"""CPU reference of the browser RVC engine (assets/rvc-engine) in Python.

Bench-only: it runs the same ONNX graphs the website ships (HuBERT 768-d
content encoder, RMVPE salience model, RVC v2 NSF synthesizer) with
onnxruntime on CPU so the v3 A/B can measure artefacts *after* RVC instead of
on post-processing stand-ins.  Mirrors inference.worker.js:

* HuBERT: raw 16 kHz waveform (no layer norm), padded to a multiple of 320,
  50 Hz features repeated x2 to the 100 Hz pitch clock.
* RMVPE: HTK mel (128 bins, 30-8000 Hz, n_fft 1024, hop 160, reflect pad),
  log(max(1e-5, .)), padded to a multiple of 160 frames, salience decoded
  with the local 9-bin weighted average and threshold 0.03.
* Synth: coarse pitch on the 50-1100 Hz mel scale (1..255), continuous nsff0,
  seeded Gaussian latent (noise scale from rvc-models.json) and source noise.

Not reproduced: the 1 s fixed-window timeline, retrieval index blending and
the voicing sanity gate (whole 7 s clips are synthesized in one call, index
rate 0).  Both A and B arms use the identical runner, so differences between
arms come from the stage under test only.
"""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np

SR16 = 16000
HOP = 160
F0_MIN, F0_MAX = 50.0, 1100.0
MEL_MIN = 1127 * math.log(1 + F0_MIN / 700)
MEL_MAX = 1127 * math.log(1 + F0_MAX / 700)


def _htk(hz):
    return 2595 * np.log10(1 + hz / 700)


def _htk_inv(mel):
    return 700 * (10 ** (mel / 2595) - 1)


def mel_filterbank(n_fft=1024, n_mels=128, sr=SR16, fmin=30.0, fmax=8000.0):
    freqs = np.arange(n_fft // 2 + 1) * sr / n_fft
    pts = _htk_inv(np.linspace(_htk(fmin), _htk(fmax), n_mels + 2))
    fdiff = np.diff(pts)
    fb = np.zeros((n_mels, len(freqs)))
    for m in range(n_mels):
        lower = (freqs - pts[m]) / fdiff[m]
        upper = (pts[m + 2] - freqs) / fdiff[m + 1]
        fb[m] = np.maximum(0, np.minimum(lower, upper)) * (2.0 / (pts[m + 2] - pts[m]))
    return fb


_FB = None


def rmvpe_mel(x):
    global _FB
    if _FB is None:
        _FB = mel_filterbank()
    n_fft, pad = 1024, 512
    padded = np.pad(np.asarray(x, dtype=np.float64), pad, mode='reflect')
    frames = 1 + len(x) // HOP
    win = 0.5 - 0.5 * np.cos(2 * np.pi * np.arange(n_fft) / n_fft)
    idx = np.arange(n_fft)[None, :] + HOP * np.arange(frames)[:, None]
    seg = np.zeros((frames, n_fft))
    valid = idx < len(padded)
    seg[valid] = padded[idx[valid]]
    mag = np.abs(np.fft.rfft(seg * win, axis=1))
    mel = np.log(np.maximum(1e-5, mag @ _FB.T))  # frames x mels
    return mel.T.astype(np.float32), frames


def decode_salience(sal, threshold=0.03):
    cents_map = 20 * np.arange(360) + 1997.379408437619
    center = np.argmax(sal, axis=1)
    conf = sal[np.arange(len(sal)), center]
    f0 = np.zeros(len(sal))
    for i, c in enumerate(center):
        if conf[i] <= threshold:
            continue
        lo, hi = max(0, c - 4), min(360, c + 5)
        w = sal[i, lo:hi]
        cents = float(np.sum(w * cents_map[lo:hi]) / max(np.sum(w), 1e-12))
        f0[i] = 10 * 2 ** (cents / 1200) if cents > 0 else 0
    f0[(f0 < 40) | (f0 > 2000)] = 0
    return f0, conf


def coarse_pitch(f0):
    f0 = np.asarray(f0, dtype=np.float64)
    mel = 1127 * np.log(1 + np.maximum(f0, 0) / 700)
    q = (mel - MEL_MIN) * 254 / (MEL_MAX - MEL_MIN) + 1
    q = np.clip(np.rint(q), 1, 255)
    q[f0 <= 0] = 1
    return q.astype(np.int64)


class OnnxRvc:
    def __init__(self, onnx_dir: Path, voice: str, noise_scale=0.35, threads=2):
        import onnxruntime as ort
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = threads
        opts.inter_op_num_threads = 1
        prov = ['CPUExecutionProvider']
        d = Path(onnx_dir)
        self.hubert = ort.InferenceSession(str(d / 'hubert.onnx'), opts, providers=prov)
        self.rmvpe_s = ort.InferenceSession(str(d / 'rmvpe.onnx'), opts, providers=prov)
        self.voice = ort.InferenceSession(str(d / f'{voice}.onnx'), opts, providers=prov)
        self.noise_scale = noise_scale
        self.out_rate = 40000

    def features(self, x16):
        x = np.asarray(x16, dtype=np.float32)
        rem = len(x) % 320
        if rem:
            x = np.pad(x, (0, 320 - rem))
        out = self.hubert.run(None, {'source': x[None], 'padding_mask': np.zeros((1, len(x)), bool)})[0][0]
        return np.repeat(out, 2, axis=0)  # 100 Hz

    def rmvpe(self, x16):
        mel, frames = rmvpe_mel(x16)
        target = 160 * math.ceil(frames / 160)
        if target > frames:
            mel = np.pad(mel, ((0, 0), (0, target - frames)))
        sal = self.rmvpe_s.run(None, {'input': mel[None]})[0][0][:frames]
        f0, conf = decode_salience(sal)
        return f0, conf, sal

    def convert(self, x16, f0, shift=0.0, frames=100, context=.15, crossfade=.05, lookahead=.04,
                seed=20260821):
        """Browser geometry: fixed 100-frame generator windows (the exported
        graphs bake phone_len=100), 150 ms reflected/real context cropped
        after synthesis, 50 ms linear crossfade, 40 ms HuBERT look-ahead,
        latent/source noise indexed by absolute frame (same as
        timelineGaussian), whole-clip pitch timeline sliced per window."""
        x16 = np.asarray(x16, dtype=np.float64)
        rate_in, rate_out = SR16, self.out_rate
        frame_samples = frames * HOP
        ctx = int(round(context * rate_in))
        core = frame_samples - 2 * ctx
        overlap = int(round(crossfade * rate_in))
        step = core - overlap
        la = int(round(lookahead * rate_in))
        win = frame_samples + la
        total = 1 if len(x16) <= core else 1 + math.ceil((len(x16) - core) / step)
        target = int(round(len(x16) * rate_out / rate_in))
        out_overlap = int(round(overlap * rate_out / rate_in))
        merged = np.zeros(target)
        write_end = 0
        upp = rate_out // 100
        nf_total = len(f0) + frames * 4
        rng = np.random.default_rng(seed)
        latent = rng.standard_normal((192, nf_total + 64)) * self.noise_scale
        src_noise = rng.standard_normal((nf_total + 64) * upp)
        pad = frames * HOP * 2
        padded = np.pad(x16, (pad, pad), mode='reflect')
        f0 = np.asarray(f0, dtype=np.float64)
        for index in range(total):
            start = index * step
            a0 = start - ctx
            window = padded[a0 + pad:a0 + pad + win]
            feats = self.features(window)
            fstart = int(round(a0 / HOP))
            idx = np.arange(fstart, fstart + frames)
            pf = np.where((idx >= 0) & (idx < len(f0)), f0[np.clip(idx, 0, len(f0) - 1)], 0.0)
            # edge frames outside the clip mirror like the audio
            if fstart < 0:
                m = -fstart
                pf[:m] = f0[np.clip(np.arange(m, 0, -1), 0, len(f0) - 1)]
            n = frames
            if len(feats) < n:
                feats = np.pad(feats, ((0, n - len(feats)), (0, 0)), mode='edge')
            lo = fstart + frames * 2
            y = self._synth_window(feats[:n], pf, shift, latent[:, lo:lo + n], src_noise[lo * upp:(lo + n) * upp])
            crop = int(round(ctx * rate_out / rate_in))
            valid_in = max(0, min(core, len(x16) - start))
            valid = min(max(0, len(y) - crop), max(1, int(round(valid_in * rate_out / rate_in))))
            chunk = y[crop:crop + valid]
            cs = int(round(start * rate_out / rate_in))
            w = max(0, min(len(chunk), target - cs))
            if index == 0 or out_overlap <= 0:
                merged[cs:cs + w] = chunk[:w]
            else:
                ov = min(out_overlap, w, max(0, write_end - cs))
                pol = 1.0
                if ctx > 0 and ov >= 32:
                    e, c = merged[cs:cs + ov:2], chunk[:ov:2]
                    if np.dot(e, c) / math.sqrt(np.dot(e, e) * np.dot(c, c) + 1e-12) < -.35:
                        pol = -1.0
                ramp = np.arange(1, ov + 1) / (ov + 1)
                merged[cs:cs + ov] = merged[cs:cs + ov] * (1 - ramp) + chunk[:ov] * pol * ramp
                merged[cs + ov:cs + w] = chunk[ov:w] * pol
            write_end = max(write_end, cs + w)
        return merged

    def _synth_window(self, feats, f0, shift, latent, src):
        n = len(feats)
        f = np.asarray(f0[:n], dtype=np.float64) * 2 ** (shift / 12)
        f[~np.isfinite(f) | (f < 0)] = 0
        feeds = dict(phone=feats[None].astype(np.float32),
                     phone_lengths=np.array([n], np.int64),
                     pitch=coarse_pitch(f)[None],
                     nsff0=f[None].astype(np.float32),
                     sid=np.array([0], np.int64),
                     rnd=latent[None].astype(np.float32),
                     source_noise=src.reshape(1, -1, 1).astype(np.float32))
        names = {i.name for i in self.voice.get_inputs()}
        return self.voice.run(None, {k: v for k, v in feeds.items() if k in names})[0].reshape(-1).astype(np.float64)

    def synth(self, feats, f0, shift=0.0, seed=20260821):
        n = min(len(feats), len(f0))
        f = np.asarray(f0[:n], dtype=np.float64) * 2 ** (shift / 12)
        f[~np.isfinite(f) | (f < 0)] = 0
        rng = np.random.default_rng(seed)
        upp = self.out_rate // 100
        feeds = dict(phone=feats[None, :n].astype(np.float32),
                     phone_lengths=np.array([n], np.int64),
                     pitch=coarse_pitch(f)[None],
                     nsff0=f[None].astype(np.float32),
                     sid=np.array([0], np.int64),
                     rnd=(rng.standard_normal((1, 192, n)) * self.noise_scale).astype(np.float32),
                     source_noise=rng.standard_normal((1, n * upp, 1)).astype(np.float32))
        names = {i.name for i in self.voice.get_inputs()}
        feeds = {k: v for k, v in feeds.items() if k in names}
        return self.voice.run(None, feeds)[0].reshape(-1).astype(np.float64)


def to16k(x, sr):
    from scipy.signal import resample_poly
    g = math.gcd(int(sr), SR16)
    return resample_poly(np.asarray(x, dtype=np.float64), SR16 // g, int(sr) // g)
