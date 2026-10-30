// PostPrep v3 · runtime entry (ES module, deferred) on every page.
// Kept deliberately small: nav droplet, reveals fallback, the SVG lens for glass controls,
// title morph between pages, and lazy page modules. No full-page canvas, no scroll handlers
// that write styles, nothing toggled on <html> while scrolling.
import { reduced, Pill, Seg } from './motion.js';

const root = document.documentElement;
const page = document.body.dataset.page || 'home';
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
const gfx = root.dataset.gfx || 'css';
const idle = (fn, timeout = 1200) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout }) : setTimeout(fn, 200));

// ---------------------------------------------------------------- nav droplet
function initNav() {
  const nav = document.querySelector('#site-header nav[aria-label="Primary navigation"]');
  if (!nav || nav.querySelector('.v3-pill')) return;
  const links = [...nav.querySelectorAll('a')];
  if (!links.length) return;
  const pill = new Pill(nav, { radius: 11 });
  nav.classList.add('has-drop');
  const current = () => nav.querySelector('a[aria-current]');
  const box = a => [a.offsetLeft, a.offsetLeft + a.offsetWidth];
  let rest = current();
  const place = (a, instant) => { if (!a) { pill.el.style.opacity = '0'; return; } const [l, r] = box(a); pill.to(l, r, instant); pill.el.style.opacity = '1'; };
  place(rest, true);
  if (fine) {
    nav.addEventListener('pointerover', e => { const a = e.target.closest('a'); if (a && nav.contains(a)) place(a); });
    nav.addEventListener('pointerleave', () => place(current()));
  }
  nav.addEventListener('focusin', e => { const a = e.target.closest('a'); if (a) place(a); });
  nav.addEventListener('focusout', () => place(current()));
  new ResizeObserver(() => place(current(), true)).observe(nav);
  document.fonts?.ready.then(() => place(current(), true));
}

// ---------------------------------------------------------------- reveals
// Scroll-driven CSS handles [data-reveal] where animation-timeline exists; elsewhere a
// one-shot IntersectionObserver adds .is-in (html.v3-io gates the hidden state, set once).
function initReveal() {
  const els = document.querySelectorAll('[data-reveal]');
  if (!els.length || reduced.matches) return;
  if (CSS.supports?.('animation-timeline: view()')) return;
  if (!('IntersectionObserver' in window)) return;
  const below = [...els].filter(e => e.getBoundingClientRect().top > innerHeight);
  if (!below.length) return;
  root.classList.add('v3-io');
  els.forEach(e => { if (!below.includes(e)) e.classList.add('is-in'); });
  const io = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -8% 0px' });
  below.forEach(e => io.observe(e));
}

// ---------------------------------------------------------------- SVG lens (CSS tier refraction)
// Chromium can feed a backdrop through an SVG filter: feDisplacementMap bends the real DOM
// under the glass near its rim, like a thick lens. Built once per control at idle, sized to
// the control. Desktop fine pointers only; switched off while the page scrolls (one attribute
// write at scroll start and one at the end, never per frame).
function lensMap(w, h, r) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data;
  const t = Math.min(h * .42, 22);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // signed distance to a rounded rect, and its outward normal
    const qx = Math.abs(x + .5 - w / 2) - (w / 2 - r), qy = Math.abs(y + .5 - h / 2) - (h / 2 - r);
    const ox = Math.max(qx, 0), oy = Math.max(qy, 0), out = Math.hypot(ox, oy);
    const sd = out + Math.min(Math.max(qx, qy), 0) - r;
    let nx = 0, ny = 0;
    if (out > 0) { nx = ox / out; ny = oy / out; } else if (qx > qy) nx = 1; else ny = 1;
    nx *= Math.sign(x + .5 - w / 2); ny *= Math.sign(y + .5 - h / 2);
    const k = sd > -t ? Math.pow(1 - Math.min(1, -sd / t), 2.2) : 0;
    const i = (y * w + x) * 4;
    d[i] = 128 - nx * k * 127; d[i + 1] = 128 - ny * k * 127; d[i + 2] = 128; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return { url: c.toDataURL(), t };
}
function initLens() {
  const chromium = !!navigator.userAgentData?.brands?.some(b => /Chromium/.test(b.brand));
  if (!chromium || !fine || gfx === 'lite' || matchMedia('(prefers-reduced-transparency: reduce)').matches) return;
  const els = () => [...document.querySelectorAll('#site-header > header, .v3-glass[data-lens-ok]')];
  idle(() => {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    document.body.append(svg);
    let n = 0;
    const build = el => {
      const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
      if (w < 40 || h < 20 || (el.dataset.lensSize === `${w}x${h}`)) return;
      el.dataset.lensSize = `${w}x${h}`;
      const r = Math.min(h / 2, parseFloat(getComputedStyle(el).borderTopLeftRadius) || 16);
      const { url, t } = lensMap(w, h, r);
      const id = el.dataset.lensId || (el.dataset.lensId = `v3-lens-${++n}`);
      svg.querySelector('#' + id)?.remove();
      const f = document.createElementNS(NS, 'filter');
      f.id = id; f.setAttribute('x', '0'); f.setAttribute('y', '0'); f.setAttribute('width', '100%'); f.setAttribute('height', '100%'); f.setAttribute('color-interpolation-filters', 'sRGB');
      f.innerHTML = `<feImage href="${url}" x="0" y="0" width="${w}" height="${h}" result="m" preserveAspectRatio="none"/><feDisplacementMap in="SourceGraphic" in2="m" scale="${(t * 1.1).toFixed(1)}" xChannelSelector="R" yChannelSelector="G"/>`;
      svg.append(f);
      el.style.setProperty('--lens', `url(#${id})`);
      el.setAttribute('data-lens-ok', '');
    };
    const all = els(); all.forEach(build);
    const ro = new ResizeObserver(entries => idle(() => entries.forEach(e => build(e.target))));
    all.forEach(el => ro.observe(el));
    root.dataset.lens = 'on';
    // pause refraction while the page moves (two writes per scroll gesture, not per frame)
    let moving = false, timer = 0;
    addEventListener('scroll', () => {
      if (!moving) { moving = true; for (const el of all) el.setAttribute('data-moving', ''); }
      clearTimeout(timer);
      timer = setTimeout(() => { moving = false; for (const el of all) el.removeAttribute('data-moving'); }, 180);
    }, { passive: true });
  });
}

// ---------------------------------------------------------------- view transitions (cross-document)
// The header keeps its name across pages; the first <h1> morphs into the next page's <h1>.
function initTransitions() {
  const title = () => document.querySelector('main h1');
  addEventListener('pageswap', e => { if (e.viewTransition) { const h = title(); if (h) h.style.viewTransitionName = 'v3-title'; } });
  addEventListener('pagereveal', e => {
    if (!e.viewTransition) return;
    const h = title(); if (h) h.style.viewTransitionName = 'v3-title';
    e.viewTransition.finished.finally(() => { if (h) h.style.viewTransitionName = ''; });
  });
  addEventListener('pageshow', () => { const h = title(); if (h) h.style.viewTransitionName = ''; });
}

// ---------------------------------------------------------------- QA probe (window.PostPrepV3)
function initProbe() {
  const box = {
    frames: [], on: false,
    start() { this.frames = []; let last = 0; const f = t => { if (last) this.frames.push(t - last); last = t; if (this.on) requestAnimationFrame(f); }; this.on = true; requestAnimationFrame(f); },
    stop() { this.on = false; const s = this.frames.slice().sort((a, b) => a - b); const p = q => s[Math.min(s.length - 1, Math.floor(s.length * q))] || 0; return { n: s.length, avg: s.reduce((a, b) => a + b, 0) / (s.length || 1), p50: p(.5), p95: p(.95), p99: p(.99), long: s.filter(x => x > 25).length }; },
  };
  window.PostPrepV3 = { gfx: () => root.dataset.gfx, probe: box, Seg };
}

// ---------------------------------------------------------------- boot
function boot() {
  initProbe();
  root.dataset.gfxReady = 'css';
  // the header is rendered by postprep.js (classic script, runs before modules)
  initNav();
  document.addEventListener('postprep:languagechange', () => setTimeout(initNav, 50));
  initReveal();
  initTransitions();
  initLens();
  const p404 = document.querySelector('[data-404-path]');
  if (p404) p404.textContent = location.pathname + location.search;
  if (page === 'home') import('./home.js').then(m => m.initHome({ fine, gfx, idle }));
  if (page === 'rvc') import('./studio.js').then(m => m.initStudio({ fine, gfx, idle }));
  root.classList.add('v3-ready');
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
