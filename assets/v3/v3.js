// PostPrep v3 · runtime entry. Loaded as a module on every page (deferred).
// Tiered liquid glass, scroll + pointer state, reveals, magnetic controls, page modules.
import { GlassRenderer, Lens } from './glass.js';
import { addTask, wake, reduced, Spring, Velocity, clamp } from './motion.js';

const root = document.documentElement;
const page = document.body.dataset.page || 'home';
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
const gfx = root.dataset.gfx || 'css';
const en = () => root.lang.startsWith('en');

// ---------------------------------------------------------------- scroll state
// No classes are toggled on <html> while scrolling (that caused v2 style storms).
let scrolling = false, scrollTimer = 0, lastY = scrollY;
const scrollListeners = new Set();
addEventListener('scroll', () => {
  if (!scrolling) { scrolling = true; glass?.renderer.setScrolling(true); wake(); }
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => { scrolling = false; glass?.renderer.setScrolling(false); wake(); }, 170);
  for (const fn of scrollListeners) fn(scrollY);
}, { passive: true });

// ---------------------------------------------------------------- glass manager
let glass = null;
function createGlass() {
  if (gfx !== 'webgl') return null;
  const canvas = document.createElement('canvas');
  canvas.className = 'v3-glass-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const renderer = new GlassRenderer({ reducedMotion: reduced.matches, force: root.dataset.gfxForced === '1', onLost: () => { root.dataset.gfx = 'css'; canvas.remove(); glass = null; } });
  document.body.prepend(canvas);
  if (!renderer.init(canvas)) { canvas.remove(); root.dataset.gfx = 'css'; return null; }
  const lenses = new Map();
  const io = new IntersectionObserver(entries => { for (const e of entries) { const L = lenses.get(e.target); if (L) L.visible = e.isIntersecting; } wake(); }, { rootMargin: '80px' });
  let measureQueued = 0;
  const remeasure = () => { if (measureQueued) return; measureQueued = requestAnimationFrame(() => { measureQueued = 0; for (const L of lenses.values()) L.measure(); renderer.dirty = true; wake(); }); };
  const ro = new ResizeObserver(remeasure);
  ro.observe(document.body);
  const api = {
    renderer,
    lens(el, opts = {}) {
      const L = new Lens(el, opts);
      if (opts.managed) L.managed = true;
      lenses.set(el, L); renderer.add(L); io.observe(el); if (!opts.managed) ro.observe(el);
      el.classList.add('is-lensed');
      return L;
    },
    drop(el) { const L = lenses.get(el); if (L) { renderer.remove(L); io.unobserve(el); lenses.delete(el); } },
    wake: () => { renderer.dirty = true; wake(); },
    remeasure,
  };
  addTask((now, dt) => renderer.frame(now, dt, scrollY));
  addEventListener('resize', () => { renderer.resize(); remeasure(); }, { passive: true });
  document.fonts?.ready.then(remeasure);
  addEventListener('load', remeasure);
  document.addEventListener('postprep:languagechange', () => setTimeout(remeasure, 320));
  // occasional re-measure for content that changes height (tool results, accordions)
  new MutationObserver(() => { if (!scrolling) remeasure(); }).observe(document.querySelector('main') || document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'open', 'class'] });
  // detect refresh rate for the adaptive-resolution budget
  let n = 0, t0 = 0; const probe = t => { if (!t0) t0 = t; if (++n < 30) requestAnimationFrame(probe); else renderer.refresh = (t - t0) / 29; }; requestAnimationFrame(probe);
  reduced.addEventListener?.('change', () => { renderer.reduced = reduced.matches; wake(); });
  return api;
}

// ---------------------------------------------------------------- pointer light
function initPointer() {
  let hovered = null, qx = 0, qy = 0, queued = 0;
  addEventListener('pointermove', e => {
    if (glass) { const P = glass.renderer.pointer; P.tx = e.clientX; P.ty = e.clientY; P.active = true; wake(); }
    if (!fine || e.pointerType === 'touch') return;
    qx = e.clientX; qy = e.clientY;
    const target = e.target.closest?.('.lg, .v3-card');
    if (target !== hovered) { hovered?.style.removeProperty('--hx'); hovered = target; }
    if (!hovered || queued) return;
    queued = requestAnimationFrame(() => {
      queued = 0; if (!hovered) return;
      const r = hovered.getBoundingClientRect();
      hovered.style.setProperty('--hx', ((qx - r.left) / r.width * 100).toFixed(1) + '%');
      hovered.style.setProperty('--hy', ((qy - r.top) / r.height * 100).toFixed(1) + '%');
    });
  }, { passive: true });
  document.addEventListener('pointerleave', () => { if (glass) glass.renderer.pointer.active = false; });
  // touch devices: slowly orbiting light
  if (!fine && glass && !reduced.matches) {
    addTask(now => { const P = glass.renderer.pointer; if (P.active) return false; P.tx = innerWidth * (.5 + .4 * Math.cos(now / 2600)); P.ty = innerHeight * (.25 + .2 * Math.sin(now / 3100)); return false; });
  }
}

// ---------------------------------------------------------------- surfaces
const SURFACES = [
  'main > div > section.bg-surface', 'main > div > aside.bg-surface', 'main > section.bg-surface',
  'main > div > div > section.bg-surface', 'main .lg-auto', '[data-lg]',
];
function registerSurfaces() {
  const els = new Set();
  for (const sel of SURFACES) document.querySelectorAll(sel).forEach(el => els.add(el));
  els.forEach(el => {
    el.classList.add('lg');
    if (glass && !el.closest('.v3-deck')) glass.lens(el, { strength: +(el.dataset.lgStrength || 20) });
  });
}

// ---------------------------------------------------------------- reveals
function initReveal() {
  const els = document.querySelectorAll('[data-reveal]');
  if (!els.length) return;
  if (reduced.matches || !('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('is-in')); return; }
  const io = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -8% 0px', threshold: .05 });
  els.forEach(e => io.observe(e));
}

// ---------------------------------------------------------------- magnetic controls (fine pointers only)
function initMagnets() {
  if (!fine || reduced.matches) return;
  document.querySelectorAll('.v3-magnet').forEach(el => {
    const sx = new Spring(0, { stiffness: 260, damping: 18 }), sy = new Spring(0, { stiffness: 260, damping: 18 });
    let css = '';
    const step = (now, dt) => { const a = sx.step(dt), b = sy.step(dt); const c = `translate3d(${sx.value.toFixed(2)}px,${sy.value.toFixed(2)}px,0)`; if (c !== css) { css = c; el.style.translate = `${sx.value.toFixed(2)}px ${sy.value.toFixed(2)}px`; } return a || b; };
    el.addEventListener('pointermove', e => { const r = el.getBoundingClientRect(); sx.target = (e.clientX - r.left - r.width / 2) * .22; sy.target = (e.clientY - r.top - r.height / 2) * .3; addTask(step); });
    el.addEventListener('pointerleave', () => { sx.target = 0; sy.target = 0; addTask(step); });
  });
}

// ---------------------------------------------------------------- ripple on press (glass "pressure" response)
function initPress() {
  document.addEventListener('pointerdown', e => {
    const el = e.target.closest?.('.v3-btn, .v3-chip, #site-header nav a, [data-deck]');
    if (!el || reduced.matches) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--px', (e.clientX - r.left) + 'px');
    el.style.setProperty('--py', (e.clientY - r.top) + 'px');
    el.classList.remove('is-pressed'); void el.offsetWidth; el.classList.add('is-pressed');
  }, { passive: true });
  document.addEventListener('animationend', e => { if (e.animationName === 'v3-press') e.target.classList.remove('is-pressed'); });
}

// ---------------------------------------------------------------- view transitions (cross-document)
function initTransitions() {
  let lastCard = null;
  document.addEventListener('click', e => {
    const a = e.target.closest?.('a[href]');
    if (!a || a.target || e.metaKey || e.ctrlKey) return;
    lastCard = a.closest('.v3-card, .v3-tool-link');
  }, true);
  addEventListener('pageswap', e => {
    if (!e.viewTransition) return;
    if (lastCard) lastCard.style.viewTransitionName = 'v3-surface';
  });
  addEventListener('pagereveal', e => {
    if (!e.viewTransition) return;
    root.classList.add('vt-in');
    e.viewTransition.finished.finally(() => root.classList.remove('vt-in'));
  });
}

// ---------------------------------------------------------------- fps probe for QA (?fps=1)
function initProbe() {
  const box = { frames: [], start() { this.frames = []; let last = 0; const f = t => { if (last) this.frames.push(t - last); last = t; if (this.on) requestAnimationFrame(f); }; this.on = true; requestAnimationFrame(f); }, stop() { this.on = false; const s = this.frames.slice().sort((a, b) => a - b); const p = q => s[Math.min(s.length - 1, Math.floor(s.length * q))] || 0; return { n: s.length, avg: s.reduce((a, b) => a + b, 0) / (s.length || 1), p50: p(.5), p95: p(.95), p99: p(.99), long: s.filter(x => x > 25).length }; } };
  window.PostPrepV3 = { gfx: () => root.dataset.gfx, glass: () => glass, probe: box, scale: () => glass?.renderer.scale };
}

// ---------------------------------------------------------------- boot
function boot() {
  initProbe();
  glass = createGlass();
  root.dataset.gfxReady = glass ? 'webgl' : 'css';
  initPointer();
  registerSurfaces();
  initReveal();
  initMagnets();
  initPress();
  initTransitions();
  const ctx = { glass, en, scrollListeners, fine, isScrolling: () => scrolling };
  if (page === 'home') import('./home.js').then(m => m.initHome(ctx));
  if (page === 'rvc') import('./studio.js').then(m => m.initStudio(ctx));
  root.classList.add('v3-ready');
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
