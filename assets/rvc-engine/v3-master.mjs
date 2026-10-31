// PostPrep v3 master for the on-device (browser / offline) cover path.
//
// Pure JS port of rvc-service/app/v3_quality.py `master_file`:
//   1. BS.1770 integrated loudness (K-weighting, 400 ms / 75 % blocks,
//      -70 LUFS absolute + -10 LU relative gate) of the mix and of the
//      original upload; gain = clamp(target - current, -6, +6) dB.
//   2. Look-ahead true-peak limiter on 4x oversampled peaks (windowed-sinc
//      polyphase interpolation), 5 ms look-ahead, 80 ms release, then a
//      uniform safety trim for residual inter-sample overs.
// Both stages were the only ones that passed the end-to-end A/B
// (docs/rvc-v3-quality.md); nothing here colours the vocal (no EQ, no
// de-essing, no saturation).  Runs inside a Worker (v3-master.worker.js) so a
// 5-minute song never blocks the page.  Inputs are arrays of Float32Array
// channels; outputs are new Float32Arrays.

export const V3_MASTER_REVISION = "rvc-v3-quality-2-web";

function biquad(x, b, a) {
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const [b0, b1, b2] = b;
  const [, a1, a2] = a;
  for (let i = 0; i < x.length; i += 1) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v;
    y[i] = v;
  }
  return y;
}

export function kWeight(x, rate) {
  // BS.1770 pre-filter + RLB high-pass, bilinear designs valid at any rate
  let f0 = 1681.974450955533, g = 3.999843853973347, q = 0.7071752369554196;
  let k = Math.tan(Math.PI * f0 / rate);
  const vh = 10 ** (g / 20);
  const vb = vh ** 0.4996667741545416;
  let a0 = 1 + k / q + k * k;
  const y = biquad(x,
    [(vh + vb * k / q + k * k) / a0, 2 * (k * k - vh) / a0, (vh - vb * k / q + k * k) / a0],
    [1, 2 * (k * k - 1) / a0, (1 - k / q + k * k) / a0]);
  f0 = 38.13547087602444; q = 0.5003270373238773;
  k = Math.tan(Math.PI * f0 / rate);
  a0 = 1 + k / q + k * k;
  return biquad(y, [1, -2, 1], [1, 2 * (k * k - 1) / a0, (1 - k / q + k * k) / a0]);
}

export function integratedLufs(channels, rate) {
  const n = channels[0]?.length ?? 0;
  const block = Math.round(rate * 0.4);
  const step = Math.round(rate * 0.1);
  if (n < block) return -70;
  const weighted = channels.map((c) => kWeight(c, rate));
  // prefix sums of squared samples per channel -> O(n) block energies
  const energies = [];
  const prefix = weighted.map((w) => {
    const p = new Float64Array(w.length + 1);
    for (let i = 0; i < w.length; i += 1) p[i + 1] = p[i] + w[i] * w[i];
    return p;
  });
  for (let s = 0; s + block <= n; s += step) {
    let e = 0;
    for (const p of prefix) e += (p[s + block] - p[s]) / block;
    energies.push(e);
  }
  const loud = (e) => -0.691 + 10 * Math.log10(e + 1e-15);
  const abs = energies.filter((e) => loud(e) > -70);
  if (!abs.length) return -70;
  const rel = loud(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const gated = abs.filter((e) => loud(e) > rel);
  if (!gated.length) return -70;
  return loud(gated.reduce((a, b) => a + b, 0) / gated.length);
}

// 4x polyphase windowed-sinc interpolator (16 taps either side, Kaiser-ish
// Blackman window). Phase 0 is the sample itself.
const HALF = 16;
const PHASES = (() => {
  const out = [];
  for (let p = 1; p < 4; p += 1) {
    const frac = p / 4;
    const taps = new Float64Array(2 * HALF);
    let sum = 0;
    for (let j = 0; j < 2 * HALF; j += 1) {
      const t = j - HALF + 1 - frac; // offset of x[n + j - HALF + 1] from n + frac
      const sinc = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t);
      const w = 0.42 + 0.5 * Math.cos(Math.PI * t / (HALF + 1)) + 0.08 * Math.cos(2 * Math.PI * t / (HALF + 1));
      taps[j] = sinc * w;
      sum += taps[j];
    }
    for (let j = 0; j < taps.length; j += 1) taps[j] /= sum;
    out.push(taps);
  }
  return out;
})();

// skipBelow: samples whose +-2 neighbourhood stays below this linear level
// are not interpolated (an inter-sample over needs >6 dB of overshoot there,
// which band-limited music does not produce). 0 = interpolate everything.
export function oversampledPeaks(channels, skipBelow = 0) {
  const n = channels[0].length;
  const peak = new Float64Array(n);
  for (const x of channels) {
    for (let i = 0; i < n; i += 1) {
      let m = Math.abs(x[i]);
      if (skipBelow > 0) {
        let local = m;
        for (let j = Math.max(0, i - 2); j <= Math.min(n - 1, i + 2); j += 1) local = Math.max(local, Math.abs(x[j]));
        if (local < skipBelow) { if (m > peak[i]) peak[i] = m; continue; }
      }
      if (i >= HALF - 1 && i + HALF < n) {
        for (const taps of PHASES) {
          let v = 0;
          const base = i - HALF + 1;
          for (let j = 0; j < taps.length; j += 1) v += taps[j] * x[base + j];
          if (Math.abs(v) > m) m = Math.abs(v);
        }
      }
      if (m > peak[i]) peak[i] = m;
    }
  }
  return peak;
}

export function truePeakDb(channels, skipBelow = 0) {
  const p = oversampledPeaks(channels, skipBelow);
  let m = 0;
  for (let i = 0; i < p.length; i += 1) if (p[i] > m) m = p[i];
  return 20 * Math.log10(Math.max(m, 1e-12));
}

function runningMin(values, radius) {
  // O(n) monotone deque over the centred window [i - radius, i + radius]
  const n = values.length;
  const out = new Float64Array(n);
  const dq = new Int32Array(n + 2 * radius + 1);
  let head = 0, tail = 0, next = 0;
  for (let i = 0; i < n; i += 1) {
    const hi = Math.min(n - 1, i + radius);
    while (next <= hi) {
      while (tail > head && values[dq[tail - 1]] >= values[next]) tail -= 1;
      dq[tail++] = next++;
    }
    while (dq[head] < i - radius) head += 1;
    out[i] = values[dq[head]];
  }
  return out;
}

export function truePeakLimit(channels, rate, { ceilingDb = -1, lookahead = 0.005, release = 0.08 } = {}) {
  const n = channels[0].length;
  const ceiling = 10 ** (ceilingDb / 20);
  const skip = ceiling * 0.5;
  const peak = oversampledPeaks(channels, skip);
  const needed = new Float64Array(n);
  let anyCut = false;
  for (let i = 0; i < n; i += 1) {
    needed[i] = Math.min(1, ceiling / Math.max(peak[i], 1e-12));
    if (needed[i] < 1) anyCut = true;
  }
  let out = channels.map((c) => Float32Array.from(c));
  let reduced = 0;
  if (anyCut) {
    const la = Math.max(1, Math.round(rate * lookahead));
    const held = runningMin(needed, la);
    const g = new Float64Array(n);
    const aRel = Math.exp(-1 / (rate * release));
    let prev = 1;
    for (let i = 0; i < n; i += 1) {
      prev = held[i] < prev ? held[i] : aRel * prev + (1 - aRel) * held[i];
      g[i] = prev;
    }
    // symmetric Hann attack smoothing, never above the held need
    const klen = 2 * la + 1;
    const kernel = new Float64Array(klen);
    let ks = 0;
    for (let j = 0; j < klen; j += 1) { kernel[j] = 0.5 - 0.5 * Math.cos(2 * Math.PI * (j + 1) / (klen + 1)); ks += kernel[j]; }
    for (let j = 0; j < klen; j += 1) kernel[j] /= ks;
    // the smoothing only matters where some gain within +-la is below 1
    const near = runningMin(g, la);
    for (let i = 0; i < n; i += 1) {
      if (near[i] >= 1) continue;
      let s = 0;
      for (let j = 0; j < klen; j += 1) {
        const idx = Math.min(n - 1, Math.max(0, i + j - la));
        s += kernel[j] * g[idx];
      }
      const gi = Math.min(g[i], Math.max(s, held[i]));
      if (gi < 1) reduced += 1;
      for (const c of out) c[i] *= gi;
    }
  }
  const tp = 10 ** (truePeakDb(out, skip) / 20);
  let trim = 1;
  if (tp > ceiling) {
    trim = (ceiling * 0.998) / tp;
    for (const c of out) for (let i = 0; i < n; i += 1) c[i] *= trim;
  }
  return { channels: out, reducedSamples: reduced, safetyTrim: trim };
}

// mix: Float32Array[] at `rate`; reference: original upload channels (same
// rate) or null. matchLoudness=false when the user moved the vocal/backing
// faders or muted a stem (same rule as the cloud path).
export function masterMix(mix, rate, reference = null, { matchLoudness = true, ceilingDb = -1 } = {}) {
  const report = { revision: V3_MASTER_REVISION, ceilingDb };
  let channels = mix;
  if (matchLoudness && reference && reference[0]?.length > rate) {
    const target = integratedLufs(reference, rate);
    const current = integratedLufs(mix, rate);
    if (target > -60 && current > -60) {
      const gainDb = Math.max(-6, Math.min(6, target - current));
      const g = 10 ** (gainDb / 20);
      channels = mix.map((c) => { const o = new Float32Array(c.length); for (let i = 0; i < c.length; i += 1) o[i] = c[i] * g; return o; });
      Object.assign(report, { targetLufs: target, beforeLufs: current, loudnessGainDb: gainDb });
    }
  }
  const limited = truePeakLimit(channels, rate, { ceilingDb });
  report.limiterReducedSamples = limited.reducedSamples;
  report.safetyTrim = limited.safetyTrim;
  report.afterLufs = integratedLufs(limited.channels, rate);
  report.truePeakDb = truePeakDb(limited.channels, 10 ** (ceilingDb / 20) * 0.5);
  return { channels: limited.channels, report };
}

// Opt-out switch: localStorage "postprep.v3Master" = "0" or ?v3master=0.
export function v3MasterEnabled(scope = globalThis) {
  try {
    const url = scope.location ? new URL(scope.location.href) : null;
    if (url?.searchParams.get("v3master") === "0") return false;
    if (scope.localStorage?.getItem("postprep.v3Master") === "0") return false;
  } catch { /* storage blocked: keep default */ }
  return true;
}

// Main-thread helper: run masterMix in a dedicated module Worker and fall
// back to the untouched mix on any failure (never lose the user's cover).
export function masterMixInWorker(mix, rate, reference, options = {}, workerUrl = new URL("./v3-master.worker.js", import.meta.url)) {
  return new Promise((resolve) => {
    let worker;
    try {
      worker = new Worker(workerUrl, { type: "module" });
    } catch (error) {
      resolve({ channels: mix, report: { skipped: "worker-unavailable", error: String(error) } });
      return;
    }
    worker.onmessage = (event) => {
      worker.terminate();
      const data = event.data || {};
      resolve(data.ok ? { channels: data.channels, report: data.report }
        : { channels: mix, report: { skipped: "worker-failed", error: data.error } });
    };
    worker.onerror = (event) => {
      worker.terminate();
      resolve({ channels: mix, report: { skipped: "worker-error", error: event.message } });
    };
    const copy = mix.map((c) => Float32Array.from(c));
    const ref = reference ? reference.map((c) => Float32Array.from(c)) : null;
    worker.postMessage({ type: "MASTER", mix: copy, rate, reference: ref, options },
      [...copy.map((c) => c.buffer), ...(ref ? ref.map((c) => c.buffer) : [])]);
  });
}
