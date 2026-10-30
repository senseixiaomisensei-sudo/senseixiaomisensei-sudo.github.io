// PostPrep v3 · motion primitives: frame scheduler + frame-rate independent springs.

export const reduced = matchMedia('(prefers-reduced-motion: reduce)');

// Single rAF loop. Tasks return true while they still need frames.
const tasks = new Set();
let raf = 0, last = 0;
function loop(now) {
  raf = 0;
  const dt = Math.min(64, last ? now - last : 16.7);
  last = now;
  let again = false;
  for (const t of tasks) { if (t(now, dt) === true) again = true; }
  if (again) raf = requestAnimationFrame(loop); else last = 0;
}
export function wake() { if (!raf && !document.hidden) raf = requestAnimationFrame(loop); }
export function addTask(fn) { tasks.add(fn); wake(); return () => tasks.delete(fn); }
document.addEventListener('visibilitychange', () => { if (!document.hidden) { last = 0; wake(); } });

// Damped spring integrated with fixed 1/240 s substeps: identical feel at 30/60/120 Hz.
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
    if (Math.abs(this.velocity) < .01 && Math.abs(this.value - this.target) < .01) { this.value = this.target; this.velocity = 0; return false; }
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
