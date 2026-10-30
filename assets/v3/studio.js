// PostPrep v3 · voice studio monitor (UI layer only).
// Reads the audio the page already holds (chosen file, recording / TTS preview, conversion
// result) to draw waveforms, a spectrum and an A/B comparison, and mirrors conversion
// progress. It never touches inference, parameters, uploads or the gateway protocol:
// no input values are written, no requests are made except reading local blob: URLs,
// and audio is never re-routed through Web Audio (no createMediaElementSource).
import { addTask, wake, reduced, clamp } from './motion.js';

const T = {
  zh: { kicker: 'STUDIO MONITOR', title: '录音棚监视器', wave: '波形', spectrum: '频谱', compare: 'A/B 对比', hint: '拖动滑块比较原声与转换结果', playA: '播放原声', playB: '播放结果', swap: 'A/B 切换', waiting: '载入音频后显示波形', waitingB: '完成变声后显示结果波形', progress: '处理进度', idle: '待命', running: '处理中', done: '完成', a: '原声 A', b: '转换 B', large: '大文件：省略波形解码，仍可正常试听与转换', duration: '时长', rate: '峰值电平', voice: '当前声线' },
  en: { kicker: 'STUDIO MONITOR', title: 'Studio monitor', wave: 'Waveform', spectrum: 'Spectrum', compare: 'A/B compare', hint: 'Drag to compare original and converted audio', playA: 'Play original', playB: 'Play result', swap: 'Swap A/B', waiting: 'Load audio to see its waveform', waitingB: 'Convert to see the result waveform', progress: 'Progress', idle: 'Idle', running: 'Working', done: 'Done', a: 'Original A', b: 'Converted B', large: 'Large file: waveform skipped, playback and conversion still work', duration: 'Length', rate: 'Peak level', voice: 'Voice' },
};
const MAX_DECODE_BYTES = 20 * 1024 * 1024;
const SPEC_RATE = 8000, SPEC_MAX_SECONDS = 600, FFT = 1024, BANDS = 40;
const appleMobile = /iPhone|iPad|iPod/iu.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function initStudio(ctx) {
  const main = document.querySelector('main');
  const workflow = document.querySelector('[aria-labelledby="rvc-workflow-heading"]') || main?.querySelector('main > div, main > section');
  if (!main || document.getElementById('v3-studio')) return;
  const lang = () => (document.documentElement.lang.startsWith('en') ? 'en' : 'zh');
  const t = k => T[lang()][k];

  const el = document.createElement('section');
  el.id = 'v3-studio'; el.className = 'v3-studio lg';
  el.innerHTML = `
    <div class="v3-studio-head">
      <div><p class="v3-kicker" data-t="kicker"></p><h2 class="v3-studio-title"><span data-t="title"></span><em class="v3-studio-voice"></em></h2></div>
      <span class="v3-studio-state" data-state="idle"><i></i><b data-t="idle"></b></span>
    </div>
    <div class="v3-studio-body">
      <div class="v3-scope">
        <div class="v3-scope-labels"><span class="la" data-t="a"></span><span class="v3-scope-time">--:-- / --:--</span><span class="lb" data-t="b"></span></div>
        <div class="v3-scope-wave">
          <canvas aria-hidden="true"></canvas>
          <div class="v3-ab" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50"><span class="v3-ab-line"></span><span class="v3-ab-knob"><i class="fa-solid fa-left-right" aria-hidden="true"></i></span></div>
          <p class="v3-scope-empty"></p>
        </div>
        <canvas class="v3-scope-spec" aria-hidden="true"></canvas>
      </div>
      <div class="v3-studio-side">
        <div class="v3-ring" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
          <svg viewBox="0 0 120 120" aria-hidden="true"><defs><linearGradient id="v3-ring-g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#5eead4"/><stop offset=".55" stop-color="#a78bfa"/><stop offset="1" stop-color="#fb7185"/></linearGradient></defs><circle class="trk" cx="60" cy="60" r="52"/><circle class="val" cx="60" cy="60" r="52"/></svg>
          <div><strong>0<small>%</small></strong><span data-t="progress"></span></div>
        </div>
        <div class="v3-transport">
          <button type="button" class="v3-chip" data-play="a"><i class="fa-solid fa-play" aria-hidden="true"></i><span data-t="playA"></span></button>
          <button type="button" class="v3-chip" data-play="b" disabled><i class="fa-solid fa-play" aria-hidden="true"></i><span data-t="playB"></span></button>
          <button type="button" class="v3-chip" data-play="swap" disabled><i class="fa-solid fa-right-left" aria-hidden="true"></i><span data-t="swap"></span></button>
        </div>
        <dl class="v3-readouts"><div><dt data-t="duration"></dt><dd class="r-dur">--:--</dd></div><div><dt data-t="rate"></dt><dd class="r-rate">--</dd></div></dl>
      </div>
    </div>`;
  let anchor = workflow; while (anchor && anchor.parentElement !== main) anchor = anchor.parentElement;
  main.insertBefore(el, anchor || null);
  const glassLens = ctx.glass?.lens(el, { strength: 18 });

  const $ = s => el.querySelector(s);
  const waveBox = $('.v3-scope-wave'), waveCv = waveBox.querySelector('canvas'), specCv = $('.v3-scope-spec');
  const ab = $('.v3-ab'), empty = $('.v3-scope-empty'), timeEl = $('.v3-scope-time');
  const ring = $('.v3-ring'), ringVal = ring.querySelector('.val'), ringNum = ring.querySelector('strong');
  const state = $('.v3-studio-state');
  const btnA = $('[data-play="a"]'), btnB = $('[data-play="b"]'), btnSwap = $('[data-play="swap"]');
  const C = 2 * Math.PI * 52; ringVal.style.strokeDasharray = `${C}`; ringVal.style.strokeDashoffset = `${C}`;

  const S = { split: .5, A: null, B: null, aEl: null, bEl: document.getElementById('rvc-result-audio'), playing: null, emptyKey: 'waiting', progress: 0, busy: false, rev: { a: 0, b: 0 } };

  function localize() {
    el.setAttribute('aria-label', t('title'));
    el.querySelectorAll('[data-t]').forEach(n => { if (n !== state.querySelector('b')) n.textContent = t(n.dataset.t); });
    state.querySelector('b').textContent = t(state.dataset.state);
    ab.setAttribute('aria-label', t('compare') + ' · ' + t('hint'));
    empty.textContent = t(S.emptyKey);
    syncVoice();
  }
  function syncVoice() {
    const sel = document.querySelector('[data-model-id][aria-selected="true"] p');
    $('.v3-studio-voice').textContent = sel?.textContent?.trim() || '';
  }
  new MutationObserver(localize).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  const gallery = document.getElementById('rvc-model-gallery');
  if (gallery) new MutationObserver(syncVoice).observe(gallery, { subtree: true, attributes: true, attributeFilter: ['aria-selected'] });

  // ------------------------------------------------------------- decoding (bounded)
  let decoder = null;
  async function decode(blob) {
    if (!blob || appleMobile || blob.size > MAX_DECODE_BYTES) return { large: true };
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    decoder ||= new AC();
    const buf = await decoder.decodeAudioData(await blob.arrayBuffer());
    const n = buf.length, ch = buf.numberOfChannels, data = [];
    for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
    // peaks for the waveform
    const bins = 1200, peaks = new Float32Array(bins), rms = new Float32Array(bins);
    const step = Math.max(1, Math.floor(n / bins));
    for (let b = 0; b < bins; b++) {
      let mx = 0, sq = 0; const s0 = b * step, s1 = Math.min(n, s0 + step);
      for (let i = s0; i < s1; i += 2) { let v = 0; for (let c = 0; c < ch; c++) v += data[c][i]; v /= ch; const a = Math.abs(v); if (a > mx) mx = a; sq += v * v; }
      peaks[b] = mx; rms[b] = Math.sqrt(sq / Math.max(1, (s1 - s0) / 2));
    }
    let pk = 0; for (let b = 0; b < bins; b++) if (peaks[b] > pk) pk = peaks[b];
    const norm = Math.max(.05, pk);
    for (let b = 0; b < bins; b++) { peaks[b] /= norm; rms[b] /= norm; }
    // low-rate mono copy for the spectrum (bounded)
    const ratio = buf.sampleRate / SPEC_RATE, m = Math.min(Math.floor(n / ratio), SPEC_RATE * SPEC_MAX_SECONDS);
    const mono = new Float32Array(m);
    for (let i = 0; i < m; i++) { const j = Math.floor(i * ratio); let v = 0; for (let c = 0; c < ch; c++) v += data[c][j]; mono[i] = v / ch; }
    return { peaks, rms, mono, duration: buf.duration, peakDb: 20 * Math.log10(Math.max(1e-5, pk)) };
  }
  async function loadA(blob, audioEl) {
    const rev = ++S.rev.a; S.aEl = audioEl || S.aEl; S.A = null; S.emptyKey = 'waiting'; draw();
    if (!blob) { localize(); return; }
    try {
      const r = await decode(blob); if (rev !== S.rev.a) return;
      if (r?.large) { S.A = { large: true }; S.emptyKey = 'large'; } else S.A = r;
    } catch { S.A = null; }
    localize(); readouts(); draw(); btnState();
  }
  async function loadB(url) {
    const rev = ++S.rev.b; S.B = null; draw(); btnState();
    if (!url || !/^(blob:|data:)/.test(url)) { if (url) { S.B = { remote: true }; btnState(); } return; }
    try { const blob = await (await fetch(url)).blob(); const r = await decode(blob); if (rev !== S.rev.b) return; S.B = r?.large ? { large: true } : r; }
    catch { S.B = null; }
    readouts(); draw(); btnState();
  }

  // sources: chosen file (liquid-ui keeps its own preview element), recordings, TTS previews
  document.getElementById('rvc-audio-file')?.addEventListener('change', e => {
    const f = e.target.files?.[0];
    loadA(f || null, document.getElementById('studio-input-audio'));
  });
  for (const id of ['rvc-record-preview', 'rvc-tts-preview']) {
    const a = document.getElementById(id); if (!a) continue;
    a.addEventListener('loadedmetadata', async () => {
      if (!/^blob:/.test(a.currentSrc || a.src)) { S.aEl = a; btnState(); return; }
      try { loadA(await (await fetch(a.currentSrc || a.src)).blob(), a); } catch { S.aEl = a; btnState(); }
    });
  }
  if (S.bEl) {
    S.bEl.addEventListener('loadedmetadata', () => loadB(S.bEl.currentSrc || S.bEl.src));
    new MutationObserver(() => { if (!S.bEl.getAttribute('src')) loadB(null); }).observe(S.bEl, { attributes: true, attributeFilter: ['src'] });
  }

  // ------------------------------------------------------------- transport (play/pause/seek only)
  const fmt = s => Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '--:--';
  function btnState() {
    const aOk = !!(S.aEl && (S.aEl.currentSrc || S.aEl.src)), bOk = !!(S.bEl && (S.bEl.currentSrc || S.bEl.getAttribute('src')));
    btnA.disabled = !aOk; btnB.disabled = !bOk; btnSwap.disabled = !(aOk && bOk);
    for (const [b, which] of [[btnA, 'a'], [btnB, 'b']]) {
      const on = S.playing === which;
      b.querySelector('i').className = `fa-solid ${on ? 'fa-pause' : 'fa-play'}`;
      b.setAttribute('aria-pressed', String(on));
    }
    el.dataset.hasA = String(!!S.A?.peaks); el.dataset.hasB = String(!!S.B?.peaks);
  }
  function readouts() {
    const src = S.B?.duration ? S.B : S.A;
    $('.r-dur').textContent = fmt(src?.duration ?? S.aEl?.duration);
    $('.r-rate').textContent = Number.isFinite(src?.peakDb) ? `${src.peakDb.toFixed(1)} dBFS` : '--';
  }
  function play(which, at) {
    const target = which === 'a' ? S.aEl : S.bEl, other = which === 'a' ? S.bEl : S.aEl;
    if (!target) return;
    if (S.playing === which && !target.paused) { target.pause(); return; }
    if (other && !other.paused) other.pause();
    if (Number.isFinite(at)) { try { target.currentTime = Math.min(at, (target.duration || at) - .05); } catch {} }
    target.play().catch(() => {});
  }
  btnA.addEventListener('click', () => play('a'));
  btnB.addEventListener('click', () => play('b'));
  btnSwap.addEventListener('click', () => {
    const cur = S.playing === 'b' ? S.bEl : S.aEl, t0 = cur?.currentTime || 0;
    play(S.playing === 'a' ? 'b' : 'a', t0);
  });
  const onPlayState = () => {
    S.playing = S.aEl && !S.aEl.paused ? 'a' : S.bEl && !S.bEl.paused ? 'b' : null;
    btnState(); if (S.playing) addTask(tick); else draw();
  };
  document.addEventListener('play', onPlayState, true);
  document.addEventListener('pause', onPlayState, true);
  document.addEventListener('ended', onPlayState, true);

  // ------------------------------------------------------------- A/B divider + seek
  let dragging = false;
  const setSplit = v => { S.split = clamp(v, 0, 1); ab.style.left = (S.split * 100).toFixed(2) + '%'; ab.setAttribute('aria-valuenow', String(Math.round(S.split * 100))); draw(); };
  waveBox.addEventListener('pointerdown', e => {
    if (!e.isPrimary) return;
    const r = waveBox.getBoundingClientRect(), x = (e.clientX - r.left) / r.width;
    if (e.target.closest('.v3-ab') || Math.abs(x - S.split) * r.width < 22) {
      dragging = true; waveBox.setPointerCapture(e.pointerId); setSplit(x); e.preventDefault();
    } else {
      const cur = S.playing === 'b' ? S.bEl : S.playing === 'a' ? S.aEl : (x > S.split && S.bEl?.src ? S.bEl : S.aEl);
      if (cur && Number.isFinite(cur.duration)) { cur.currentTime = x * cur.duration; draw(); }
    }
  });
  waveBox.addEventListener('pointermove', e => { if (dragging) { const r = waveBox.getBoundingClientRect(); setSplit((e.clientX - r.left) / r.width); } });
  const stop = () => { dragging = false; };
  waveBox.addEventListener('pointerup', stop); waveBox.addEventListener('pointercancel', stop); waveBox.addEventListener('lostpointercapture', stop);
  ab.addEventListener('keydown', e => {
    const d = { ArrowLeft: -.05, ArrowRight: .05, Home: -1, End: 1 }[e.key];
    if (d !== undefined) { e.preventDefault(); setSplit(S.split + d); }
  });

  // ------------------------------------------------------------- drawing
  const dpr = () => Math.min(2, devicePixelRatio || 1);
  function fit(cv) { const r = cv.getBoundingClientRect(), w = Math.max(1, Math.round(r.width * dpr())), h = Math.max(1, Math.round(r.height * dpr())); if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; } return [w, h]; }
  new ResizeObserver(() => draw()).observe(waveBox);
  let gradB = null;
  function drawWave() {
    const [w, h] = fit(waveCv), g = waveCv.getContext('2d');
    g.clearRect(0, 0, w, h);
    const k = dpr();
    // grid
    g.fillStyle = 'rgba(255,255,255,.05)';
    for (let x = 0; x < w; x += 40 * k) g.fillRect(Math.round(x), 0, 1, h);
    g.fillRect(0, Math.round(h / 2), w, 1);
    const split = S.split * w;
    const lane = (data, x0, x1, style, glow) => {
      if (!data?.peaks) return;
      const P = data.peaks, R = data.rms, bars = Math.floor(w / (3 * k)), bw = Math.max(1, 2 * k);
      g.save(); g.beginPath(); g.rect(x0, 0, x1 - x0, h); g.clip();
      g.fillStyle = style; if (glow) { g.shadowColor = 'rgba(167,139,250,.6)'; g.shadowBlur = 10 * k; }
      for (let i = 0; i < bars; i++) {
        const j = Math.floor(i / bars * P.length), x = i * 3 * k;
        if (x + bw < x0 || x > x1) continue;
        const p = P[j] * .92, r = R[j];
        const hh = Math.max(2 * k, p * (h * .86)), hr = Math.max(k, r * h * .86);
        g.globalAlpha = .45; g.fillRect(x, (h - hh) / 2, bw, hh);
        g.globalAlpha = 1; g.fillRect(x, (h - hr) / 2, bw, hr);
      }
      g.restore();
    };
    if (!gradB || gradB.w !== w) { gradB = g.createLinearGradient(0, 0, w, 0); gradB.addColorStop(0, '#5eead4'); gradB.addColorStop(.5, '#a78bfa'); gradB.addColorStop(1, '#fb7185'); gradB.w = w; }
    const hasA = !!S.A?.peaks, hasB = !!S.B?.peaks;
    if (hasA && hasB) { lane(S.A, 0, split, 'rgba(203,213,225,.85)'); lane(S.B, split, w, gradB, true); }
    else if (hasA) lane(S.A, 0, w, 'rgba(203,213,225,.85)');
    else if (hasB) lane(S.B, 0, w, gradB, true);
    // playhead
    const cur = S.playing === 'b' ? S.bEl : S.playing === 'a' ? S.aEl : null;
    const ref = cur || S.aEl || S.bEl;
    if (ref && Number.isFinite(ref.duration) && ref.duration > 0) {
      const x = ref.currentTime / ref.duration * w;
      g.fillStyle = '#fff'; g.globalAlpha = .9; g.fillRect(Math.round(x), 0, Math.max(1, k * 1.5), h); g.globalAlpha = 1;
      timeEl.textContent = `${fmt(ref.currentTime)} / ${fmt(ref.duration)}`;
    }
    empty.hidden = hasA || hasB;
    el.dataset.compare = String(hasA && hasB);
  }
  // radix-2 FFT magnitude → log bands
  const re = new Float32Array(FFT), im = new Float32Array(FFT), win = new Float32Array(FFT).map((_, i) => .5 - .5 * Math.cos(2 * Math.PI * i / (FFT - 1)));
  const bands = new Float32Array(BANDS), smooth = new Float32Array(BANDS);
  function spectrum(mono, time) {
    const c = Math.floor(time * SPEC_RATE) - FFT / 2;
    for (let i = 0; i < FFT; i++) { const j = c + i; re[i] = (j >= 0 && j < mono.length ? mono[j] : 0) * win[i]; im[i] = 0; }
    for (let i = 1, j = 0; i < FFT; i++) { let bit = FFT >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; } }
    for (let len = 2; len <= FFT; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < FFT; i += len) { let cr = 1, ci = 0; for (let j = 0; j < len / 2; j++) {
        const a = i + j, b = a + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } }
    }
    const half = FFT / 2;
    for (let b = 0; b < BANDS; b++) {
      const lo = Math.floor(2 * Math.pow(half / 2, b / BANDS)), hi = Math.max(lo + 1, Math.floor(2 * Math.pow(half / 2, (b + 1) / BANDS)));
      let s = 0; for (let k = lo; k < hi; k++) s += Math.hypot(re[k], im[k]);
      bands[b] = clamp((Math.log10(1 + s / (hi - lo)) * .9), 0, 1);
    }
  }
  function drawSpec(now) {
    const [w, h] = fit(specCv), g = specCv.getContext('2d'), k = dpr();
    g.clearRect(0, 0, w, h);
    const src = S.playing === 'b' ? S.B : S.playing === 'a' ? S.A : null;
    const el2 = S.playing === 'b' ? S.bEl : S.aEl;
    if (src?.mono && el2) spectrum(src.mono, el2.currentTime);
    else for (let b = 0; b < BANDS; b++) bands[b] = S.busy && !reduced.matches ? .18 + .14 * Math.sin(now / 240 + b * .5) ** 2 : .04;
    const bw = w / BANDS;
    for (let b = 0; b < BANDS; b++) {
      smooth[b] += (bands[b] - smooth[b]) * (bands[b] > smooth[b] ? .55 : .18);
      const v = smooth[b], hh = Math.max(2 * k, v * h);
      const hue = 170 + b / BANDS * 170;
      g.fillStyle = `hsl(${hue} 85% ${60 + v * 15}%)`;
      g.globalAlpha = .35 + v * .65;
      g.fillRect(b * bw + bw * .18, h - hh, bw * .64, hh);
    }
    g.globalAlpha = 1;
    let moving = false; for (let b = 0; b < BANDS; b++) if (Math.abs(bands[b] - smooth[b]) > .004) moving = true;
    return moving;
  }
  let queued = 0;
  function draw() { if (queued) return; queued = requestAnimationFrame(now => { queued = 0; drawWave(); if (drawSpec(now)) addTask(tick); }); }
  function tick(now) {
    if (document.hidden) return false;
    drawWave(); const m = drawSpec(now);
    return !!S.playing || S.busy || m;
  }

  // ------------------------------------------------------------- progress mirror (read-only)
  const bar = document.getElementById('rvc-progress-bar'), wrap = document.getElementById('rvc-progress-bar-wrap'), convert = document.getElementById('rvc-convert');
  function syncProgress() {
    const pct = clamp(parseFloat(bar?.style.width) || 0, 0, 100);
    const busy = convert?.getAttribute('aria-busy') === 'true' || (wrap && !wrap.classList.contains('hidden') && pct > 0 && pct < 100);
    S.progress = pct; S.busy = busy;
    ringVal.style.strokeDashoffset = String(C * (1 - pct / 100));
    ringNum.firstChild.textContent = String(Math.round(pct));
    ring.setAttribute('aria-valuenow', String(Math.round(pct)));
    const st = busy ? 'running' : pct >= 100 || S.B?.peaks || S.B?.remote ? 'done' : 'idle';
    if (state.dataset.state !== st) { state.dataset.state = st; state.querySelector('b').textContent = t(st); }
    el.dataset.busy = String(busy);
    if (busy) addTask(tick);
  }
  if (bar) new MutationObserver(syncProgress).observe(bar, { attributes: true, attributeFilter: ['style'] });
  if (wrap) new MutationObserver(syncProgress).observe(wrap, { attributes: true, attributeFilter: ['class'] });
  if (convert) new MutationObserver(syncProgress).observe(convert, { attributes: true, attributeFilter: ['aria-busy'] });

  localize(); setSplit(.5); btnState(); syncProgress(); draw();
  if (glassLens) ctx.glass.remeasure();
  window.PostPrepV3 && (window.PostPrepV3.studio = { state: S, loadA, loadB, draw });
}
