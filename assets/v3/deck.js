// PostPrep v3 · stacked glass card deck
// Stack ⇄ grid, drag/fling with spring physics, hover fan, keyboard, inert rear cards.
// Touch contract (lessons from the v2 Xiaomi 15S Pro fixes):
//  - no 3D perspective: 2D transforms only, so finger and card never drift apart
//  - grabbing mid-animation freezes the card where it is drawn (no jump)
//  - the grab point stays under the finger even while the card rotates
//  - only the first pointer drives; a second finger is ignored; cancel springs back
//  - transform strings are cached and only written when they change
import { Spring, Velocity, addTask, clamp, reduced } from './motion.js';

const GAP_Y = 14;

export class Deck {
  constructor(root, glass) {
    this.root = root; this.glass = glass;
    this.cards = [...root.querySelectorAll('.v3-card')];
    if (!this.cards.length) return;
    this.mode = 'stack'; this.fan = 0; this.order = this.cards.map((_, i) => i);
    this.state = this.cards.map(el => ({
      el, x: new Spring(0, { stiffness: 340, damping: 30 }), y: new Spring(0, { stiffness: 340, damping: 30 }),
      a: new Spring(0, { stiffness: 260, damping: 24 }), s: new Spring(1, { stiffness: 300, damping: 26 }),
      o: 1, css: '', lens: null, flying: 0,
    }));
    root.classList.add('is-live');
    this.state.forEach(st => {
      if (glass) { st.lens = glass.lens(st.el, { managed: true, strength: 24 }); }
    });
    this.controls = document.querySelector(`[data-deck-controls="${root.id}"]`);
    this.frameFn = (now, dt) => this.frame(now, dt);
    this.wake = () => addTask(this.frameFn);
    this.bind();
    this.layout(true);
    this.wake();
    new ResizeObserver(() => this.layout(false)).observe(root.parentElement);
  }

  depthOf(i) { return this.order.indexOf(i); }

  layout(first) {
    const W = this.root.parentElement.clientWidth;
    if (!W) return;
    const cardW = Math.min(W, 392);
    if (cardW !== this.cardW) { this.cardW = cardW; this.cards.forEach(c => { c.style.width = cardW + 'px'; }); }
    this.cardH = Math.max(...this.cards.map(c => c.offsetHeight));
    this.cards.forEach(c => { c.style.height = this.cardH + 'px'; });
    this.W = W;
    const gap = 16;
    this.cols = Math.max(1, Math.floor((W + gap) / (cardW + gap)));
    const rows = Math.ceil(this.cards.length / this.cols);
    const h = this.mode === 'stack' ? this.cardH + GAP_Y * 3 + 36 : rows * this.cardH + (rows - 1) * gap;
    if (this.height !== h) { this.height = h; this.root.style.height = h + 'px'; }
    this.retarget(first);
    this.measure();
  }

  measure() {
    const r = this.root.getBoundingClientRect();
    this.docX = r.left; this.docY = r.top + scrollY;
    this.state.forEach(st => st.lens?.setLayout(this.docX, r.top, this.cardW, this.cardH));
  }

  slot(i) {
    const d = this.depthOf(i);
    if (this.mode === 'grid') {
      const gap = 16, cols = this.cols, used = Math.min(cols, this.cards.length);
      const x0 = (this.W - (used * this.cardW + (used - 1) * gap)) / 2;
      const idx = i; // grid keeps reading order
      return { x: x0 + (idx % cols) * (this.cardW + gap), y: Math.floor(idx / cols) * (this.cardH + gap), a: 0, s: 1, o: 1 };
    }
    const x0 = (this.W - this.cardW) / 2, f = this.fan;
    const side = d % 2 ? 1 : -1;
    return {
      x: x0 + (d ? side * (6 + d * 4) * f : 0),
      y: d * (GAP_Y + 10 * f),
      a: d ? side * (.012 + .02 * f) * Math.min(d, 3) : 0,
      s: 1 - Math.min(d, 4) * .045,
      o: d > 3 ? 0 : 1,
    };
  }

  retarget(snap) {
    this.state.forEach((st, i) => {
      if (st === this.drag?.st || st.flying) return;
      const t = this.slot(i);
      st.x.target = t.x; st.y.target = t.y; st.a.target = t.a; st.s.target = t.s;
      if (snap) { st.x.set(t.x); st.y.set(t.y); st.a.set(t.a); st.s.set(t.s); }
      if (st.o !== t.o) { st.o = t.o; st.el.style.opacity = t.o; if (st.lens) st.lens.targetAlpha = t.o; }
    });
    this.restack();
    this.wake?.();
  }

  restack() {
    const n = this.cards.length;
    this.order.forEach((ci, d) => {
      const st = this.state[ci];
      const z = String(n - d);
      if (st.el.style.zIndex !== z) st.el.style.zIndex = z;
      const inert = this.mode === 'stack' && d > 0;
      if (st.el.inert !== inert) { st.el.inert = inert; inert ? st.el.setAttribute('aria-hidden', 'true') : st.el.removeAttribute('aria-hidden'); }
    });
    const top = this.cards[this.order[0]];
    const label = this.controls?.querySelector('[data-deck-count]');
    if (label) label.textContent = `${String(this.order[0] + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}`;
    this.root.dataset.top = top?.dataset.tone || '';
  }

  frame(now, dt) {
    let moving = false;
    for (const st of this.state) {
      if (st !== this.drag?.st) {
        moving = st.x.step(dt) | moving; moving = st.y.step(dt) | moving;
        moving = st.a.step(dt) | moving; moving = st.s.step(dt) | moving;
      }
      if (st.flying && Math.abs(st.x.value - st.x.target) < this.cardW * .55 || st.flying && now - st.flying > 420) {
        if (st.flying) { st.flying = 0; this.retarget(); moving = true; }
      }
      const css = `translate3d(${st.x.value.toFixed(2)}px,${st.y.value.toFixed(2)}px,0) rotate(${st.a.value.toFixed(4)}rad) scale(${st.s.value.toFixed(4)})`;
      if (css !== st.css) { st.css = css; st.el.style.transform = css; }
      if (st.lens) {
        const t = st.lens.transform || (st.lens.transform = {});
        t.x = st.x.value; t.y = st.y.value; t.angle = st.a.value; t.sx = t.sy = st.s.value;
        st.lens.animating = moving || !!this.drag;
      }
    }
    if (this.drag) moving = true;
    if (moving) this.glass?.wake();
    return moving;
  }

  bind() {
    const root = this.root;
    const vel = new Velocity();
    root.addEventListener('pointerdown', e => {
      if (this.drag || this.mode !== 'stack' || e.button !== 0 || !e.isPrimary) return;
      const el = e.target.closest('.v3-card'); if (!el || el.inert) return;
      const st = this.state[this.cards.indexOf(el)];
      const rr = root.getBoundingClientRect();
      this.docX = rr.left; this.docY = rr.top + scrollY;
      // freeze where it is drawn right now
      for (const s of [st.x, st.y, st.a, st.s]) s.set(s.value);
      st.flying = 0;
      const cx = rr.left + st.x.value + this.cardW / 2, cy = rr.top + st.y.value + this.cardH / 2;
      const a = st.a.value, sc = st.s.value, gx = e.clientX - cx, gy = e.clientY - cy;
      // grab vector in card space (undo rotation and scale)
      const lx = (Math.cos(-a) * gx - Math.sin(-a) * gy) / sc, ly = (Math.sin(-a) * gx + Math.cos(-a) * gy) / sc;
      this.drag = { st, id: e.pointerId, sx: e.clientX, sy: e.clientY, lx, ly, a0: a, sc, rl: rr.left, rt: rr.top, moved: false, t: e.timeStamp };
      vel.reset(); vel.push(e.clientX, e.clientY, e.timeStamp);
      try { el.setPointerCapture(e.pointerId); } catch {}
      root.dataset.dragging = 'true';
      this.wake();
    });
    const move = e => {
      const D = this.drag; if (!D || e.pointerId !== D.id) return;
      const dx = e.clientX - D.sx, dy = e.clientY - D.sy;
      if (!D.moved && Math.hypot(dx, dy) > 6) D.moved = true;
      if (!D.moved) return;
      vel.push(e.clientX, e.clientY, e.timeStamp);
      const a = clamp(D.a0 + dx * .0011, -.32, .32);
      const gx = (Math.cos(a) * D.lx - Math.sin(a) * D.ly) * D.sc, gy = (Math.sin(a) * D.lx + Math.cos(a) * D.ly) * D.sc;
      const cx = e.clientX - gx - D.rl - this.cardW / 2, cy = e.clientY - gy - D.rt - this.cardH / 2;
      D.st.x.set(cx); D.st.y.set(cy); D.st.a.set(a);
    };
    const end = (e, cancel) => {
      const D = this.drag; if (!D || e.pointerId !== D.id) return;
      this.drag = null; delete root.dataset.dragging;
      try { D.st.el.releasePointerCapture(D.id); } catch {}
      const v = vel.get(); const st = D.st;
      const i = this.cards.indexOf(st.el), home = this.slot(i);
      const dx = st.x.value - home.x;
      this.suppressClick = D.moved;
      if (!cancel && D.moved && (Math.abs(dx) > this.cardW * .3 || Math.abs(v.x) > .55)) {
        this.fling(i, Math.sign(Math.abs(v.x) > .3 ? v.x : dx), v);
      } else {
        st.x.velocity = cancel ? 0 : v.x * 1000; st.y.velocity = cancel ? 0 : v.y * 1000;
        this.retarget();
      }
      this.wake();
    };
    root.addEventListener('pointermove', move);
    root.addEventListener('pointerup', e => end(e, false));
    root.addEventListener('pointercancel', e => end(e, true));
    root.addEventListener('lostpointercapture', e => end(e, true));
    root.addEventListener('click', e => { if (this.suppressClick) { e.preventDefault(); e.stopPropagation(); this.suppressClick = false; } }, true);
    root.addEventListener('dragstart', e => e.preventDefault());
    if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
      root.addEventListener('pointerenter', () => { if (this.mode === 'stack') { this.fan = 1; this.retarget(); } });
      root.addEventListener('pointerleave', () => { this.fan = 0; this.retarget(); });
    }
    root.addEventListener('keydown', e => {
      if (this.mode !== 'stack') return;
      if (e.key === 'ArrowRight') { e.preventDefault(); this.next(); this.focusTop(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); this.prev(); this.focusTop(); }
    });
    this.controls?.addEventListener('click', e => {
      const b = e.target.closest('[data-deck]'); if (!b) return;
      const act = b.dataset.deck;
      if (act === 'next') this.next(); else if (act === 'prev') this.prev(); else if (act === 'toggle') this.toggle(b);
    });
  }

  focusTop() { requestAnimationFrame(() => this.cards[this.order[0]]?.focus({ preventScroll: true })); }

  fling(i, dir, v = { x: 0, y: 0 }) {
    const st = this.state[i];
    st.flying = performance.now();
    st.x.target = (this.W - this.cardW) / 2 + dir * (this.cardW * 1.05 + 30);
    st.x.velocity = v.x * 1000 || dir * 1400; st.y.velocity = v.y * 1000;
    st.a.target = dir * .22;
    this.order = this.order.filter(k => k !== i).concat(i);
    // keep it above the others while it leaves; restack happens in retarget()
    st.el.style.zIndex = String(this.cards.length + 1);
    this.state.forEach((s, k) => { if (k !== i) { const t = this.slot(k); s.x.target = t.x; s.y.target = t.y; s.a.target = t.a; s.s.target = t.s; if (s.o !== t.o) { s.o = t.o; s.el.style.opacity = t.o; if (s.lens) s.lens.targetAlpha = t.o; } } });
    this.wake();
  }

  next() { if (this.mode === 'stack') this.fling(this.order[0], -1); }

  prev() {
    if (this.mode !== 'stack') return;
    const i = this.order[this.order.length - 1], st = this.state[i];
    this.order = [i].concat(this.order.slice(0, -1));
    st.x.set((this.W - this.cardW) / 2 + this.cardW * 1.1); st.a.set(.2);
    if (st.o !== 1) { st.o = 1; st.el.style.opacity = 1; if (st.lens) st.lens.targetAlpha = 1; }
    this.retarget();
    this.wake();
  }

  toggle(button) {
    this.mode = this.mode === 'stack' ? 'grid' : 'stack';
    this.root.dataset.mode = this.mode;
    this.fan = 0;
    if (this.mode === 'grid') this.order = this.cards.map((_, i) => i);
    button?.setAttribute('aria-expanded', String(this.mode === 'grid'));
    this.layout(reduced.matches);
    this.state.forEach((st, i) => { st.o = -1; });
    this.retarget();
    this.glass?.remeasure();
    this.wake();
  }
}
