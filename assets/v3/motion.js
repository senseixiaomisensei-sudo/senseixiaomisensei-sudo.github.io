// PostPrep v3 · motion primitives: one rAF scheduler, frame-rate independent springs,
// and the liquid "pill" used by the nav droplet and segmented controls.
// Everything here writes transform only, and only while something is actually moving.

export const reduced = matchMedia('(prefers-reduced-motion: reduce)');

// Single rAF loop. Tasks return true while they still need frames; idle = zero frames.
const tasks = new Set();
let raf = 0, last = 0;
function loop(now) {
  raf = 0;
  const dt = Math.min(64, last ? now - last : 16.7);
  last = now;
  let again = false;
  for (const t of tasks) { if (t(now, dt) === true) again = true; else tasks.delete(t); }
  if (again) raf = requestAnimationFrame(loop); else last = 0;
}
export function wake() { if (!raf && !document.hidden) raf = requestAnimationFrame(loop); }
export function addTask(fn) { tasks.add(fn); wake(); return () => tasks.delete(fn); }
document.addEventListener('visibilitychange', () => { if (!document.hidden && tasks.size) { last = 0; wake(); } });

// Damped spring, fixed 1/240 s substeps: identical feel at 30/60/120 Hz.
export class Spring {
  constructor(value = 0, { stiffness = 320, damping = 30, mass = 1 } = {}) {
    this.value = value; this.target = value; this.velocity = 0;
    this.k = stiffness; this.c = damping; this.m = mass;
  }
  set(v) { this.value = v; this.target = v; this.velocity = 0; }
  step(dtMs) {
    if (reduced.matches) { this.value = this.target; this.velocity = 0; return false; }
    let t = Math.min(dtMs, 64) / 1000;
    const h = 1 / 240;
    while (t > 1e-6) {
      const s = Math.min(h, t);
      const a = (-this.k * (this.value - this.target) - this.c * this.velocity) / this.m;
      this.velocity += a * s; this.value += this.velocity * s; t -= s;
    }
    if (Math.abs(this.velocity) < .02 && Math.abs(this.value - this.target) < .05) { this.value = this.target; this.velocity = 0; return false; }
    return true;
  }
}

// Velocity tracker over the last ~90 ms of pointer samples (px / ms).
export class Velocity {
  constructor() { this.s = []; }
  reset() { this.s.length = 0; }
  push(x, y, t) { this.s.push({ x, y, t }); while (this.s.length > 2 && t - this.s[0].t > 90) this.s.shift(); }
  get() {
    const s = this.s; if (s.length < 2) return { x: 0, y: 0 };
    const a = s[0], b = s[s.length - 1], dt = Math.max(1, b.t - a.t);
    return { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt };
  }
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ------------------------------------------------------------------ segmented control
// role=radiogroup of role=radio buttons. Tap to pick; or grab the thumb and slide it —
// it follows the finger 1:1 and snaps to the nearest segment on release (spring).
export class Seg {
  constructor(el, { onChange } = {}) {
    this.el = el; this.onChange = onChange;
    this.btns = [...el.querySelectorAll('[role="radio"]')];
    this.pill = new Pill(el, { radius: 9 });
    el.classList.add('is-live');
    this.place(true);
    el.addEventListener('click', e => { const b = e.target.closest('[role="radio"]'); if (b && !this.dragged) this.select(b); this.dragged = false; });
    el.addEventListener('keydown', e => {
      const d = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key]; if (!d) return;
      const vis = this.visible(); const i = vis.indexOf(this.current()); const n = vis[(i + d + vis.length) % vis.length];
      e.preventDefault(); this.select(n); n.focus();
    });
    let drag = null;
    el.addEventListener('pointerdown', e => {
      if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const cur = this.current(); const b = e.target.closest('[role="radio"]');
      if (b !== cur) return; // only the thumb is draggable; other segments are taps
      drag = { id: e.pointerId, x0: e.clientX, w: cur.offsetWidth, off: e.clientX - el.getBoundingClientRect().left - cur.offsetLeft, live: false };
    });
    el.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.live) { if (Math.abs(e.clientX - drag.x0) < 6) return; drag.live = true; try { el.setPointerCapture(e.pointerId); } catch {} el.classList.add('is-held'); }
      const r = el.getBoundingClientRect(); const l = clamp(e.clientX - r.left - drag.off, 3, el.clientWidth - 3 - drag.w);
      this.pill.follow(l, l + drag.w);
    });
    const end = e => {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.live) {
        this.dragged = true; el.classList.remove('is-held');
        const r = el.getBoundingClientRect(), x = e.clientX - r.left;
        let best = null, bd = 1e9; for (const b of this.visible()) { const c = b.offsetLeft + b.offsetWidth / 2, dd = Math.abs(c - x); if (dd < bd) { bd = dd; best = b; } }
        this.select(best);
        setTimeout(() => { this.dragged = false; }, 0);
      }
      drag = null;
    };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    new ResizeObserver(() => this.place(true)).observe(el);
  }
  visible() { return this.btns.filter(b => b.offsetParent !== null); }
  current() { return this.btns.find(b => b.getAttribute('aria-checked') === 'true') || this.btns[0]; }
  select(b) {
    if (!b) return;
    const changed = b !== this.current();
    for (const x of this.btns) { const on = x === b; x.setAttribute('aria-checked', String(on)); x.tabIndex = on ? 0 : -1; }
    this.place(false);
    if (changed) this.onChange?.(b);
  }
  place(instant) { const b = this.current(); if (!b || !b.offsetWidth) return; this.pill.to(b.offsetLeft, b.offsetLeft + b.offsetWidth, instant); this.pill.el.style.opacity = '1'; }
}

// ------------------------------------------------------------------ liquid pill
// A capsule built from three transform-only parts (left cap, stretchable middle, right
// cap). Each edge has its own spring: the leading edge is stiff, the trailing edge soft,
// so the pill stretches like a droplet when it travels and settles back into a capsule.
// No width/left writes, so moving it never triggers layout.
export class Pill {
  constructor(host, { className = 'v3-pill', radius = 9 } = {}) {
    this.r = radius;
    this.el = document.createElement('span');
    this.el.className = className; this.el.setAttribute('aria-hidden', 'true');
    this.el.innerHTML = '<i class="l"></i><i class="m"></i><i class="r"></i>';
    [this.lc, this.mid, this.rc] = this.el.children;
    host.prepend(this.el);
    this.L = new Spring(0, { stiffness: 420, damping: 34 });
    this.R = new Spring(0, { stiffness: 420, damping: 34 });
    this.css = ['', '', ''];
    this.shown = false;
    this.task = (now, dt) => this.step(dt);
  }
  to(l, r, instant = false) {
    const dir = l > this.L.value ? 1 : -1;
    // leading edge stiff, trailing edge soft → stretch
    (dir > 0 ? this.R : this.L).k = 560; (dir > 0 ? this.R : this.L).c = 38;
    (dir > 0 ? this.L : this.R).k = 300; (dir > 0 ? this.L : this.R).c = 30;
    if (instant || !this.shown || reduced.matches) { this.L.set(l); this.R.set(r); this.shown = true; this.paint(); this.el.style.opacity = '1'; return; }
    this.L.target = l; this.R.target = r; addTask(this.task);
  }
  follow(l, r) { this.L.k = this.R.k = 900; this.L.c = this.R.c = 60; this.L.target = l; this.R.target = r; addTask(this.task); }
  step(dt) { const a = this.L.step(dt), b = this.R.step(dt); this.paint(); return a || b; }
  paint() {
    const r = this.r, L = this.L.value, R = Math.max(this.R.value, L + 2 * r);
    const w = Math.max(0, R - L - 2 * r);
    const c0 = `translate3d(${L.toFixed(2)}px,0,0)`;
    const c1 = `translate3d(${(L + r - .5).toFixed(2)}px,0,0) scaleX(${((w + 1) / 100).toFixed(4)})`;
    const c2 = `translate3d(${(R - r).toFixed(2)}px,0,0)`;
    if (c0 !== this.css[0]) { this.css[0] = c0; this.lc.style.transform = c0; }
    if (c1 !== this.css[1]) { this.css[1] = c1; this.mid.style.transform = c1; }
    if (c2 !== this.css[2]) { this.css[2] = c2; this.rc.style.transform = c2; }
  }
}
