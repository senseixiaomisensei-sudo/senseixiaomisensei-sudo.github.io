/* Hoshino Harness — site.js (vanilla, deterministic: everything derives from scroll position or rAF time) */
(() => {
  const d = document, html = d.documentElement;
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const ease = x => 1 - Math.pow(1 - clamp(x), 3);
  const T0 = performance.now();

  /* arrival wipe when coming from another page of this site */
  try { if (!RM && d.referrer && new URL(d.referrer).origin === location.origin) html.classList.add('arrived'); } catch (e) {}

  /* ---------- glass nav: specular highlight follows scroll position ---------- */
  const bar = d.querySelector('.bar');
  const spec = () => { if (!bar) return; const m = Math.max(1, html.scrollHeight - innerHeight); bar.style.setProperty('--sy', clamp(scrollY / m).toFixed(3)); };
  const nv = d.querySelector('.nav [aria-current]');
  if (nv && nv.scrollIntoView) { const n = nv.parentElement; n.scrollLeft = nv.offsetLeft - (n.clientWidth - nv.offsetWidth) / 2; }

  /* ---------- kinetic type: split into masked tokens ---------- */
  const PUNCT = /^[，。、？！：；,.!?)）」』”’]$/;
  d.querySelectorAll('.kt').forEach(el => {
    el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
    let i = 0;
    const walk = node => {
      [...node.childNodes].forEach(n => {
        if (n.nodeType === 3) {
          const toks = n.textContent.match(/[A-Za-z0-9][A-Za-z0-9.\-+]*|\s+|[^\s]/g) || [];
          const frag = d.createDocumentFragment(); let last = null;
          toks.forEach(t => {
            if (/^\s+$/.test(t)) { frag.appendChild(d.createTextNode(' ')); last = null; return; }
            if (PUNCT.test(t) && last) { last.textContent += t; return; }
            const o = d.createElement('span'), s = d.createElement('span');
            o.className = 'k'; o.setAttribute('aria-hidden', 'true');
            s.style.setProperty('--i', i++); s.textContent = t; o.appendChild(s); frag.appendChild(o); last = s;
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') walk(n);
      });
    };
    walk(el);
  });
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { rootMargin: '0px 0px -12% 0px', threshold: 0.15 });
  d.querySelectorAll('.kt,.rv').forEach(el => (RM ? el.classList.add('in') : io.observe(el)));

  /* ---------- scroll progress engine ---------- */
  const P = [...d.querySelectorAll('[data-p]')];
  let raf = 0;
  function tick() {
    raf = 0;
    const vh = innerHeight;
    for (const el of P) {
      const r = el.getBoundingClientRect();
      if (r.bottom < -vh || r.top > vh * 2) continue;
      const m = el.dataset.p; let p;
      if (m === 'sticky') p = -r.top / Math.max(1, r.height - vh);
      else if (m === 'out') p = -r.top / r.height;
      else if (m === 'mid') p = (vh * 0.55 - r.top) / r.height;
      else p = (vh - r.top) / (vh + r.height);
      p = clamp(p);
      if (el._p !== p) { el._p = p; el.style.setProperty('--p', p.toFixed(4)); el._cb && el._cb(p); }
    }
  }
  const req = () => { if (!raf) raf = requestAnimationFrame(tick); };
  addEventListener('scroll', () => { req(); spec(); }, { passive: true });
  addEventListener('resize', () => { layout(); req(); });

  /* features: pinned sequence */
  d.querySelectorAll('.seq').forEach(sec => {
    const steps = sec.querySelectorAll('.step'), imgs = sec.querySelectorAll('.screen img'), rail = sec.querySelectorAll('.rail span'), cards = sec.querySelectorAll('.cards figure');
    let cur = -1; const n = steps.length;
    sec._cb = p => {
      const k = Math.min(n - 1, Math.floor(p * n * 0.999 + 0.0001));
      if (k === cur) return; cur = k;
      [steps, imgs, rail, cards].forEach(list => list.forEach((x, j) => x.classList.toggle('on', j === k)));
    };
  });

  /* features: horizontal strip driven by vertical scroll */
  const strips = [...d.querySelectorAll('.strip')];
  function layout() {
    strips.forEach(s => {
      const tr = s.querySelector('.track');
      const native = innerWidth <= 820;
      s._dist = native ? 0 : Math.max(0, tr.scrollWidth - innerWidth);
      s.style.height = native ? '' : (innerHeight + s._dist) + 'px';
      s._cb = p => tr.style.setProperty('--x', (p * s._dist).toFixed(1));
      s._p = -1;
    });
    H.forEach(h => h.size());
  }

  /* ---------- horizon canvas ---------- */
  const PRESET = {
    hero: { y: .8, cx: .5, curv: 2.2, span: .62, n: 14, speed: .11, timed: 1 },
    head: { y: .85, cx: .64, curv: 2.6, span: .6, n: 12, speed: .08, timed: 2 },
    dl:   { y: .8, cx: .7, curv: 2.4, span: .6, n: 12, speed: .09, timed: 2 },
    div:  { y: .42, cx: .5, curv: 3.2, span: .52, n: 9, speed: .07, timed: 0 }
  };
  const H = [];
  function Horizon(cv) {
    const o = Object.assign({}, PRESET[cv.dataset.hz] || PRESET.div);
    const ctx = cv.getContext('2d');
    const h = { cv, ctx, o, vis: false, ig: 0, gr: 0, burst: -1, bx: 0, by: 0, w: 1, hh: 1, s: 1 };
    h.size = () => {
      const r = cv.getBoundingClientRect();
      let s = Math.min(2, devicePixelRatio || 1);
      if (r.width * r.height * s * s > 3.2e6) s = Math.max(1, Math.sqrt(3.2e6 / (r.width * r.height)));
      h.s = s; h.w = cv.width = Math.round(r.width * s); h.hh = cv.height = Math.round(r.height * s);
      const host = cv.parentElement, cs = getComputedStyle(host);
      const hx = parseFloat(cs.getPropertyValue('--hx')), hy = parseFloat(cs.getPropertyValue('--hy'));
      if (!isNaN(hx)) o.cx = hx; if (!isNaN(hy)) o.y = hy;
      const mk = host.querySelector('.mark-big');
      if (mk) { const m = mk.getBoundingClientRect(); h.bx = (m.left + m.width / 2 - r.left) * s; h.by = (m.top + m.height * .5 - r.top) * s; }
      h.dirty = true; h.drawn = 0;
      if (h.vis) loop();
    };
    new IntersectionObserver(es => { h.vis = es[0].isIntersecting; if (h.vis) loop(); }).observe(cv);
    H.push(h); h.size();
    return h;
  }

  function draw(h, t) {
    const { ctx, w, hh, o, s } = h, ig = h.ig, gr = h.gr;
    const cx = o.cx * w, y = o.y * hh, R = w * o.curv, oy = y + R, top = Math.PI * 1.5;
    ctx.clearRect(0, 0, w, hh);
    if (ig <= 0 && h.burst < 0) return;
    // atmosphere above the edge
    ctx.save(); ctx.translate(cx, y); ctx.scale(1, .3);
    const rad = w * .8, g = ctx.createRadialGradient(0, 0, 0, 0, 0, rad);
    g.addColorStop(0, `rgba(76,125,255,${.34 * ig})`); g.addColorStop(.35, `rgba(76,125,255,${.11 * ig})`); g.addColorStop(1, 'rgba(76,125,255,0)');
    ctx.fillStyle = g; ctx.fillRect(-rad, -rad, rad * 2, rad * 2); ctx.restore();
    // planet body + grid, clipped under the curve
    ctx.save(); ctx.beginPath(); ctx.arc(cx, oy, R, 0, Math.PI * 2); ctx.clip();
    const bg = ctx.createLinearGradient(0, y, 0, hh);
    bg.addColorStop(0, `rgba(16,24,52,${ig})`); bg.addColorStop(.18, `rgba(7,9,16,${ig})`); bg.addColorStop(1, `rgba(5,6,8,${ig})`);
    ctx.fillStyle = bg; ctx.fillRect(0, y - 2, w, hh - y + 2);
    if (gr > 0) {
      const depth = hh - y, ph = RM ? 0 : (t * o.speed) % 1;
      ctx.lineWidth = s; ctx.setLineDash([3 * s, 9 * s]);
      for (let k = 0; k < o.n; k++) {
        const u = (k + ph) / o.n, off = depth * 1.08 * Math.pow(u, 2.1) + 4 * s;
        const a = gr * Math.min(1, u * 4) * (.68 - .3 * u);
        const rr = R - off, half = Math.asin(Math.min(1, (w * .75) / rr));
        ctx.strokeStyle = `rgba(150,178,255,${a.toFixed(3)})`;
        ctx.beginPath(); ctx.arc(cx, oy, rr, top - half, top + half); ctx.stroke();
      }
      // meridians converge on the horizon
      const mg = ctx.createLinearGradient(0, y, 0, hh);
      mg.addColorStop(0, 'rgba(150,178,255,0)'); mg.addColorStop(.35, `rgba(150,178,255,${.4 * gr})`); mg.addColorStop(1, `rgba(150,178,255,${.12 * gr})`);
      ctx.strokeStyle = mg; ctx.setLineDash([2 * s, 10 * s]); ctx.lineDashOffset = RM ? 0 : -t * 14 * s;
      const M = 9, spread = w * .55;
      for (let j = -M; j <= M; j++) {
        ctx.beginPath(); ctx.moveTo(cx, y); ctx.lineTo(cx + j * spread / M * 2.2, hh + depth * .2); ctx.stroke();
      }
      ctx.setLineDash([]); ctx.lineDashOffset = 0;
    }
    ctx.restore();
    // the glowing edge
    if (ig > 0) {
      const L = Math.min(R * .98, w * o.span * ig), half = Math.asin(L / R);
      const lg = (c1, c2) => { const q = ctx.createLinearGradient(cx - L, 0, cx + L, 0);
        q.addColorStop(0, 'rgba(76,125,255,0)'); q.addColorStop(.22, c1); q.addColorStop(.5, c2); q.addColorStop(.78, c1); q.addColorStop(1, 'rgba(76,125,255,0)'); return q; };
      const blue = lg('rgba(76,125,255,1)', 'rgba(140,175,255,1)'), white = lg('rgba(170,195,255,1)', '#ffffff');
      [[28, .05, blue], [12, .12, blue], [5, .32, blue], [2.2, .8, white], [1, 1, white]].forEach(([lw, al, st]) => {
        ctx.globalAlpha = al * Math.min(1, ig * 1.4); ctx.lineWidth = lw * s; ctx.strokeStyle = st;
        ctx.beginPath(); ctx.arc(cx, oy, R, top - half, top + half); ctx.stroke();
      });
      ctx.globalAlpha = 1;
    }
    // steady halo behind the mark once it has flashed
    if (h.bx && h.burst !== -2 && o.timed === 1 && ig > 0) {
      const hr = w * .16, hg = ctx.createRadialGradient(h.bx, h.by, 0, h.bx, h.by, hr);
      hg.addColorStop(0, `rgba(120,160,255,${.32 * ig})`); hg.addColorStop(.4, `rgba(76,125,255,${.12 * ig})`); hg.addColorStop(1, 'rgba(76,125,255,0)');
      ctx.fillStyle = hg; ctx.fillRect(h.bx - hr, h.by - hr, hr * 2, hr * 2);
    }
    // light burst behind the mark
    if (h.burst >= 0 && h.burst < 1) {
      const e = h.burst, bx = h.bx || cx, by = h.by || y, f = Math.pow(1 - e, 2);
      const rr = (30 + w * .32 * ease(e)), bgd = ctx.createRadialGradient(bx, by, 0, bx, by, rr);
      bgd.addColorStop(0, `rgba(255,255,255,${.9 * f})`); bgd.addColorStop(.18, `rgba(150,180,255,${.6 * f})`); bgd.addColorStop(1, 'rgba(76,125,255,0)');
      ctx.fillStyle = bgd; ctx.fillRect(bx - rr, by - rr, rr * 2, rr * 2);
      ctx.save(); ctx.translate(bx, by); ctx.lineCap = 'round';
      [[-.32, .5], [1.25, .3]].forEach(([ang, len]) => {
        const ln = w * len * (.25 + ease(e) * .9);
        ctx.rotate(ang); const q = ctx.createLinearGradient(-ln, 0, ln, 0);
        q.addColorStop(0, 'rgba(160,190,255,0)'); q.addColorStop(.5, `rgba(255,255,255,${f})`); q.addColorStop(1, 'rgba(160,190,255,0)');
        ctx.strokeStyle = q; ctx.lineWidth = 1.6 * s; ctx.beginPath(); ctx.moveTo(-ln, 0); ctx.lineTo(ln, 0); ctx.stroke(); ctx.rotate(-ang);
      });
      ctx.restore();
    }
  }

  let looping = false;
  function loop() {
    if (looping) return; looping = true;
    const frame = now => {
      const t = (now - T0) / 1000; let any = false;
      for (const h of H) {
        if (!h.vis) continue; any = true;
        const o = h.o;
        if (RM) { h.ig = 1; h.gr = 1; h.burst = -1; if (!h.drawn || h.dirty) { draw(h, 0); h.drawn = 1; h.dirty = false; } continue; }
        if (o.timed === 1) { h.burst = t > 1.42 && t < 2.6 ? (t - 1.42) / 1.18 : -1; h.ig = ease((t - 1.6) / 1.2); h.gr = ease((t - 2.2) / 1.5); }
        else if (o.timed === 2) { h.ig = ease((t - .35) / 1.2); h.gr = ease((t - .9) / 1.4); }
        else { const p = clamp((innerHeight - h.cv.getBoundingClientRect().top) / (innerHeight * .7)); h.ig = ease(p); h.gr = ease(p * 1.2 - .1); }
        draw(h, t);
      }
      if (any && !RM) requestAnimationFrame(frame); else { looping = false; if (RM && any) {} }
    };
    requestAnimationFrame(frame);
  }
  d.querySelectorAll('canvas[data-hz]').forEach(Horizon);

  /* film: only play while on screen */
  d.querySelectorAll('video').forEach(v => {
    if (RM) { v.removeAttribute('autoplay'); v.pause(); return; }
    new IntersectionObserver(es => {
      if (es[0].isIntersecting) { const pr = v.play(); pr && pr.catch(() => {}); } else v.pause();
    }, { threshold: .1 }).observe(v);
  });

  layout(); tick(); spec();
  addEventListener('load', () => { layout(); tick(); });
})();
