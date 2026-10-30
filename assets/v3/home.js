// PostPrep v3 · home page: liquid droplet, deck, scroll story, live spectrum.
import { Deck } from './deck.js';
import { addTask, wake, reduced, Spring, Velocity, clamp } from './motion.js';

export function initHome(ctx) {
  const { glass } = ctx;
  const hero = document.querySelector('.v3-hero');
  const audio = initSpectrum(ctx);
  if (hero) initHero(hero, ctx, audio);
  const deck = document.getElementById('v3-deck');
  if (deck) new Deck(deck, glass);
  initStory(ctx);
  initCounters();
}

// ------------------------------------------------------------ synthetic spectrum
// A deterministic "music" signal (kick + bass + hats) drives the waveform ribbons in the
// glass backdrop and the DOM equalizer. No microphone, no audio decoding.
function initSpectrum(ctx) {
  const bars = [...document.querySelectorAll('.v3-eq i')];
  const level = new Float32Array(8);
  const css = bars.map(() => '');
  let visible = true;
  const eq = document.querySelector('.v3-eq');
  if (eq) new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) wake(); }).observe(eq);
  const bpm = 104, beat = 60000 / bpm;
  const sample = now => {
    const ph = (now % beat) / beat, kick = Math.exp(-ph * 7), off = Math.exp(-(((now + beat / 2) % beat) / beat) * 9);
    for (let j = 0; j < 8; j++) {
      const f = j / 7;
      const tone = .35 + .25 * Math.sin(now / (900 + j * 170) + j * 1.3) + .15 * Math.sin(now / (330 + j * 60));
      level[j] = clamp(tone * (1 - f * .45) + kick * (1 - f) * .55 + off * f * .45, .04, 1.1);
    }
  };
  if (reduced.matches) { sample(1200); if (ctx.glass) ctx.glass.renderer.audio.set(level.map(v => v * .6)); return level; }
  addTask(now => {
    sample(now);
    if (ctx.glass) { const A = ctx.glass.renderer.audio; for (let j = 0; j < 8; j++) A[j] = level[j] * .55; }
    if (visible && !ctx.isScrolling()) {
      for (let i = 0; i < bars.length; i++) {
        const j = i % 8, k = Math.abs(Math.sin(now / (260 + i * 37) + i));
        const v = clamp(level[j] * (.55 + .45 * k), .06, 1);
        const s = `scaleY(${v.toFixed(3)})`;
        if (s !== css[i]) { css[i] = s; bars[i].style.transform = s; }
      }
    }
    return visible || !!ctx.glass;
  });
  return level;
}

// ------------------------------------------------------------ hero droplet
function initHero(hero, ctx, audio) {
  const { glass } = ctx;
  const orb = hero.querySelector('.v3-orb');
  const stage = hero.querySelector('.v3-hero-stage');
  const inner = hero.querySelector('.v3-hero-inner');
  const cta = hero.querySelector('.v3-hero-cta .v3-btn-primary');
  let progress = 0; // 0..1 scroll-out of the pinned hero
  let ctaLens = null, orbLens = null;
  if (glass && cta) { ctaLens = glass.lens(cta, { fixed: true, strength: 16 }); }
  if (!orb || !stage) return;
  const R = () => orb.offsetWidth / 2;
  const x = new Spring(0, { stiffness: 120, damping: 14 }), y = new Spring(0, { stiffness: 120, damping: 14 });
  const sq = new Spring(0, { stiffness: 420, damping: 16 }); // squash amount
  let home = { x: 0, y: 0 }, angle = 0, drag = null, css = '', t0 = performance.now(), interacted = false;
  const vel = new Velocity();
  const place = () => {
    const s = stage.getBoundingClientRect();
    home = { x: s.width * (innerWidth < 720 ? .72 : .78) - R(), y: s.height * (innerWidth < 720 ? .1 : .2) - R() };
    if (!drag) { x.target = home.x; y.target = home.y; }
    if (orbLens) { orbLens.setLayout(s.left, s.top, orb.offsetWidth, orb.offsetHeight); }
    if (ctaLens) ctaLens.measure();
  };
  if (glass) { orbLens = glass.lens(orb, { fixed: true, managed: true, strength: 30, radius: 999 }); }
  place(); x.set(home.x); y.set(home.y);
  new ResizeObserver(place).observe(stage);

  orb.addEventListener('pointerdown', e => {
    if (drag || !e.isPrimary) return;
    const s = stage.getBoundingClientRect();
    drag = { id: e.pointerId, ox: e.clientX - s.left - x.value, oy: e.clientY - s.top - y.value, sl: s.left, st: s.top };
    x.set(x.value); y.set(y.value);
    vel.reset(); vel.push(e.clientX, e.clientY, e.timeStamp);
    try { orb.setPointerCapture(e.pointerId); } catch {}
    orb.classList.add('is-held'); interacted = true; hero.classList.add('has-played');
    addTask(step);
  });
  orb.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    vel.push(e.clientX, e.clientY, e.timeStamp);
    x.set(e.clientX - drag.sl - drag.ox); y.set(e.clientY - drag.st - drag.oy);
    const v = vel.get(), sp = Math.hypot(v.x, v.y);
    sq.target = clamp(sp * .16, 0, .32); if (sp > .05) angle = Math.atan2(v.y, v.x);
  });
  const release = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const v = vel.get(); drag = null; orb.classList.remove('is-held');
    try { orb.releasePointerCapture(e.pointerId); } catch {}
    x.target = home.x; y.target = home.y; x.velocity = v.x * 1000; y.velocity = v.y * 1000;
    sq.target = 0; sq.velocity = -2.5; // wobble
    addTask(step);
  };
  orb.addEventListener('pointerup', release); orb.addEventListener('pointercancel', release);
  orb.addEventListener('keydown', e => {
    const m = { ArrowLeft: [-24, 0], ArrowRight: [24, 0], ArrowUp: [0, -24], ArrowDown: [0, 24] }[e.key];
    if (!m) return; e.preventDefault(); x.velocity += m[0] * 30; y.velocity += m[1] * 30; sq.velocity -= 1.5; addTask(step);
  });

  function step(now, dt) {
    let moving = false;
    if (!drag) { moving = x.step(dt) | moving; moving = y.step(dt) | moving; const v = Math.hypot(x.velocity, y.velocity); if (v > 30) { angle = Math.atan2(y.velocity, x.velocity); sq.target = clamp(v / 4000, 0, .25); } else if (sq.target > 0 && !drag) sq.target = 0; }
    moving = sq.step(dt) | moving || !!drag;
    // idle float
    const f = reduced.matches || drag ? 0 : Math.sin((now - t0) / 1400) * 6;
    const s = 1 + sq.value, k = 1 / Math.max(.6, s);
    const fade = 1 - progress;
    const cssNext = `translate3d(${x.value.toFixed(1)}px,${(y.value + f).toFixed(1)}px,0) rotate(${angle.toFixed(3)}rad) scale(${s.toFixed(3)},${k.toFixed(3)}) rotate(${(-angle).toFixed(3)}rad)`;
    if (cssNext !== css) { css = cssNext; orb.style.transform = cssNext; }
    if (orbLens) {
      const t = orbLens.transform || (orbLens.transform = {});
      // circle squash along the velocity direction == ellipse rotated by angle
      t.x = x.value; t.y = y.value + f; t.angle = angle; t.sx = s; t.sy = k;
      orbLens.targetAlpha = fade > .02 ? 1 : 0; orbLens.animating = true;
      glass.wake();
    }
    return moving || (!reduced.matches && progress < 1);
  }
  addTask(step);

  // scroll-out: pinned hero fades, scales and the droplet sinks; CSS scroll timelines
  // do the DOM part where supported, JS keeps the glass in sync.
  const supportsTimeline = CSS.supports?.('animation-timeline: scroll()');
  let innerCss = '';
  const onScroll = sy => {
    const h = hero.offsetHeight || innerHeight;
    progress = clamp(sy / (h * .55), 0, 1);
    if (!supportsTimeline && inner) {
      const c = `translate3d(0,${(-progress * 60).toFixed(1)}px,0) scale(${(1 - progress * .06).toFixed(3)})`;
      if (c !== innerCss) { innerCss = c; inner.style.transform = c; inner.style.opacity = String(1 - progress); }
    }
    if (ctaLens) ctaLens.targetAlpha = progress < .6 ? 1 : 0;
    if (glass) glass.renderer.wave = 1 - progress * .7;
    addTask(step);
  };
  ctx.scrollListeners.add(onScroll); onScroll(scrollY);
  // first-time hint fades after the droplet is touched
  setTimeout(() => { if (!interacted) hero.classList.add('hint'); }, 2200);
}

// ------------------------------------------------------------ scroll story
function initStory(ctx) {
  const story = document.querySelector('.v3-story');
  if (!story) return;
  const steps = [...story.querySelectorAll('[data-step]')];
  const stage = story.querySelector('.v3-story-stage');
  const set = i => { if (stage && stage.dataset.active !== String(i)) { stage.dataset.active = String(i); steps.forEach((s, k) => s.classList.toggle('is-active', k === i)); } };
  set(0);
  const io = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) set(steps.indexOf(e.target));
  }, { rootMargin: '-45% 0px -45% 0px' });
  steps.forEach(s => io.observe(s));
}

// ------------------------------------------------------------ count-up numbers
function initCounters() {
  const els = document.querySelectorAll('[data-count]');
  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue; io.unobserve(e.target);
      const el = e.target, to = +el.dataset.count, dur = reduced.matches ? 0 : 1100, t0 = performance.now();
      addTask(now => { const p = dur ? clamp((now - t0) / dur, 0, 1) : 1; el.textContent = String(Math.round(to * (1 - Math.pow(1 - p, 3)))); return p < 1; });
    }
  });
  els.forEach(e => io.observe(e));
}
