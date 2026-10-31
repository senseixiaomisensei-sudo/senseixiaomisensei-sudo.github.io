// PostPrep v3 · home: a real caption checked live in an editor (the hero), the
// four-tool storyboard, and the studio teaser. Everything is event-driven: no per-frame
// work unless the typing demo or a spring is running, and no scroll listeners at all.
import { Seg, reduced } from './motion.js';

const PLAT = { // limits mirror PLATFORM_PRESETS in postprep.js (title-type fields)
  xhs: { limit: 20, scope: 'title' }, douyin: { limit: 55, scope: 'title' }, wechat: { limit: 64, scope: 'title' }, ig: { limit: 2200, scope: 'all' },
};
const EXTREME = ['全网最', '全城最', '最好', '最佳', '最低价', '最便宜', '第一', '唯一', '顶级', '绝对', '万能', '史上', '国家级', '首选', '100%', 'best ever', 'No.1', '#1 ', 'guaranteed', 'cheapest'];
const DEMO = {
  zh: '秋天的第一杯｜街角这家咖啡店绝对是全城最好喝的\n周末路过梧桐路，被门口那棵银杏吸引进去。\n燕麦拿铁奶香很足，豆子是店主自己烘的，酸度\u200b刚好。\n\n\n人均 38，下午三点后人少，靠窗位置拍照很出片。  \n#咖啡探店 #城市漫步 #秋天 #咖啡探店',
  en: 'The best flat white in the city, guaranteed — our autumn find\nWandered down Plane Tree Road on Sunday and the ginkgo out front pulled us in.\nOat latte, beans roasted in-house, just the\u200b right acidity.\n\n\nAbout $6. Quiet after 3 pm, and the window seat is made for photos.  \n#coffee #citywalk #autumn #coffee',
};
const T = {
  zh: { title: '标题', all: '全文', chars: '字', over: n => `超出 ${n}`, fits: '合适', extreme: '极限词', none: '无', tags: n => `话题 ${n} 个`, dup: n => `重复 ${n} 个`, noDup: '无重复', clean: '隐形字符与多余空格', spots: n => `${n} 处`, lines: '多余空行', todo: n => `${n} 项待处理`, ready: '可以发布', sep: '、' },
  en: { title: 'Title', all: 'Caption', chars: 'chars', over: n => `${n} over`, fits: 'Fits', extreme: 'Risky claims', none: 'None', tags: n => `${n} hashtag${n === 1 ? '' : 's'}`, dup: n => `${n} duplicate${n === 1 ? '' : 's'}`, noDup: 'No duplicates', clean: 'Invisible chars & extra spaces', spots: n => `${n} found`, lines: 'Extra blank lines', todo: n => `${n} to fix`, ready: 'Ready to post', sep: ', ' },
};
const lang = () => (document.documentElement.lang.startsWith('en') ? 'en' : 'zh');

let seg;
const graphemes = (() => { try { const s = new Intl.Segmenter(undefined, { granularity: 'grapheme' }); return str => [...s.segment(str)].map(x => x.segment); } catch { return str => Array.from(str); } })();
const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

export function analyse(text, plat) {
  const P = PLAT[plat] || PLAT.xhs;
  const n = text.length, mark = new Array(n).fill('');
  const put = (a, b, cls, force) => { for (let i = a; i < b && i < n; i++) if (force || !mark[i]) mark[i] = cls; };
  const nl = text.indexOf('\n'), titleEnd = nl < 0 ? n : nl;
  const scope = P.scope === 'title' ? text.slice(0, titleEnd) : text;
  const g = graphemes(scope), count = g.length, over = Math.max(0, count - P.limit);
  if (over) { const at = g.slice(0, P.limit).join('').length; put(at, scope.length, 'm-over', true); }
  // invisible characters
  let zw = 0; for (const m of text.matchAll(/[\u200b-\u200d\u2060\ufeff\u00ad]/g)) { zw++; put(m.index, m.index + 1, 'm-zw', true); }
  // hashtags (+ duplicates)
  const seen = new Set(); let tags = 0, dups = 0; const tagRanges = [];
  for (const m of text.matchAll(/[#＃][^\s#＃]+/g)) {
    tags++; const key = m[0].replace('＃', '#').toLowerCase(); tagRanges.push([m.index, m.index + m[0].length]);
    if (seen.has(key)) { dups++; put(m.index, m.index + m[0].length, 'm-dup'); } else { seen.add(key); put(m.index, m.index + m[0].length, 'm-tag'); }
  }
  const inTag = i => tagRanges.some(([a, b]) => i >= a && i < b);
  // risky superlatives (outside hashtags)
  const found = []; const low = text.toLowerCase();
  for (const w of EXTREME) { const k = w.toLowerCase(); let i = low.indexOf(k); while (i >= 0) { if (!inTag(i)) { put(i, i + w.length, 'm-warn'); found.push(w.trim()); } i = low.indexOf(k, i + k.length); } }
  // doubled spaces / trailing spaces
  let sp = 0; for (const m of text.matchAll(/ {2,}|[ \t]+(?=\n|$)/g)) { sp++; put(m.index, m.index + m[0].length, 'm-sp'); }
  const blank = (text.match(/\n{3,}/g) || []).length;
  return { mark, count, limit: P.limit, scope: P.scope, over, extreme: [...new Set(found)], tags, dups, zw, sp, blank };
}
function toHTML(text, mark, caret) {
  let out = '', cur = null, buf = '';
  const flush = () => { if (!buf) return; out += cur ? `<span class="${cur}">${esc(buf)}</span>` : esc(buf); buf = ''; };
  const nl = text.indexOf('\n'), te = nl < 0 ? text.length : nl;
  for (let i = 0; i < text.length; i++) { const c = mark[i] || (i < te ? 'm-title' : null); if (c !== cur) { flush(); cur = c; } buf += text[i]; }
  flush();
  return out + (caret ? '<span class="m-caret"></span>' : '');
}
export function tidy(text) {
  const seen = new Set();
  return text.replace(/[\u200b-\u200d\u2060\ufeff\u00ad]/g, '')
    .replace(/[#＃][^\s#＃]+/g, t => { const k = t.replace('＃', '#').toLowerCase(); if (seen.has(k)) return ''; seen.add(k); return t.replace('＃', '#'); })
    .replace(/[ \t]+(?=\n|$)/g, '').replace(/ {2,}/g, ' ').replace(/\n{3,}/g, '\n\n').replace(/ +(?=\n|$)/g, '');
}

function initEditor() {
  const d0 = document.documentElement;
  const dev = document.getElementById('h-device'); if (!dev) return;
  const ta = dev.querySelector('.h-input'), mirror = dev.querySelector('.h-mirror'), scroller = dev.querySelector('.h-scroll');
  const meterN = dev.querySelector('.h-meter-n'), meterMax = dev.querySelector('.h-meter-max'), meter = dev.querySelector('.h-meter');
  const list = dev.querySelector('.h-findings'), sum = dev.querySelector('.h-report-sum'), fix = dev.querySelector('.h-fix');
  let plat = 'xhs', typing = null, userEdited = false, lastStates = '';

  // upto: scan position (chars) while the opening pass runs; Infinity once live
  function render(upto = Infinity) {
    const text = ta.value, r = analyse(text, plat), L = T[lang()];
    const scanning = upto < text.length;
    if (scanning) for (let i = upto; i < r.mark.length; i++) r.mark[i] = '';
    mirror.innerHTML = scanning ? toHTML(text.slice(0, upto), r.mark, true) + `<span class="m-rest">${esc(text.slice(upto))}</span>` : toHTML(text, r.mark, false);
    const shownCount = scanning ? Math.min(r.count, graphemes(text.slice(0, Math.min(upto, text.indexOf('\n') < 0 ? upto : text.indexOf('\n')))).length) : r.count;
    meterN.textContent = String(shownCount); meterMax.textContent = `/ ${r.limit}`;
    meter.dataset.state = shownCount > r.limit ? 'bad' : 'ok';
    const rows = [
      [r.over ? 'bad' : 'ok', `${r.scope === 'title' ? L.title : L.all} ${r.count} / ${r.limit} ${L.chars}`, r.over ? L.over(r.over) : L.fits],
      [r.extreme.length ? 'warn' : 'ok', L.extreme, r.extreme.length ? r.extreme.slice(0, 3).join(L.sep) : L.none],
      [r.dups ? 'bad' : 'ok', L.tags(r.tags), r.dups ? L.dup(r.dups) : L.noDup],
      [r.zw + r.sp ? 'warn' : 'ok', L.clean, r.zw + r.sp ? L.spots(r.zw + r.sp) : L.none],
      [r.blank ? 'warn' : 'ok', L.lines, r.blank ? L.spots(r.blank) : L.none],
    ];
    const shown = scanning ? Math.floor(upto / Math.max(1, text.length) * rows.length) : rows.length;
    const states = rows.map((x, i) => i < shown ? x[0] : '-').join();
    const prev = lastStates.split(','); lastStates = states;
    if (states !== prev.join() || !scanning) list.innerHTML = rows.map(([s, a, b], i) => i < shown
      ? `<li data-s="${s}"${prev[i] && prev[i] !== s ? ' class="is-new"' : ''}><span>${esc(a)}</span><em>${esc(b)}</em></li>`
      : `<li data-s="wait"><span>${esc(a)}</span><em>…</em></li>`).join('');
    const todo = rows.filter(x => x[0] !== 'ok').length;
    sum.textContent = todo ? L.todo(todo) : L.ready;
    fix.disabled = !(r.dups || r.zw || r.sp || r.blank);
  }
  const scan = dev.querySelector('.h-scan');
  // glass ruler follows the caret line (transform only; one layout read per tick of a contained box)
  // low tier on phones: no ruler (hidden by CSS), so no caret read; the pass types in bigger steps
  let useScan = true; const lowPhone = d0.dataset.gfx !== 'webgl' && matchMedia('(hover: none), (max-width: 900px)').matches;
  const follow = () => { const c = useScan && scan && mirror.querySelector('.m-caret'); if (c) scan.style.transform = `translate3d(0,${c.offsetTop - 7}px,0)`; };
  const land = () => { dev.classList.remove('is-scanning'); dev.classList.add('is-landed'); };
  const stopDemo = () => { if (!typing) return; clearTimeout(typing.t); typing = null; land(); dev.classList.add('is-live'); render(); };
  ta.addEventListener('input', () => { userEdited = true; render(); });
  ta.addEventListener('focus', () => stopDemo());
  ta.addEventListener('pointerdown', () => stopDemo());
  fix.addEventListener('click', () => { stopDemo(); ta.value = tidy(ta.value); userEdited = true; render(); });

  seg = new Seg(dev.querySelector('.v3-seg'), {
    onChange: b => {
      plat = b.dataset.plat; scroller.dataset.plat = plat; render(typing ? typing.i : Infinity);
      if (!reduced.matches) meterN.animate([{ transform: 'translateY(-.2em)', opacity: .35 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.16,1,.3,1)' });
    },
  });
  dev.querySelector('.v3-seg').addEventListener('pointerdown', () => { if (typing) typing.touched = true; }, { capture: true });

  // Opening pass: the caption is already on the page (it is the LCP text); a caret sweeps
  // through it once and the checks light up behind it, then the editor is yours.
  const demo = () => {
    if (reduced.matches || userEdited) { stopDemo(); return; }
    const len = ta.value.length;
    typing = { i: 0, t: 0, touched: false };
    const tick = () => {
      if (!typing) return;
      const c = ta.value[typing.i] || '';
      typing.i = Math.min(len, typing.i + (c === '\n' ? 1 : lowPhone ? 6 : 3));
      render(typing.i); follow();
      if (typing.i >= len) { const touched = typing.touched; typing = null; land(); dev.classList.add('is-live'); render(); if (!touched && !userEdited) showcase(); return; }
      typing.t = setTimeout(tick, ta.value[typing.i - 1] === '\n' ? 140 : 22);
    };
    useScan = !!scan && getComputedStyle(scan).display !== 'none';
    render(0); follow(); dev.classList.add('is-scanning');
    typing.t = setTimeout(tick, 260);
  };
  // one unattended pass of the platform switch, so the liquid control explains itself
  const showcase = () => {
    const pick = id => seg.select(seg.btns.find(b => b.dataset.plat === id));
    const t1 = setTimeout(() => { if (!userEdited) pick('douyin'); }, 1300);
    const t2 = setTimeout(() => { if (!userEdited) pick('xhs'); }, 3000);
    const cancel = () => { clearTimeout(t1); clearTimeout(t2); };
    dev.addEventListener('pointerdown', cancel, { once: true });
    ta.addEventListener('input', cancel, { once: true });
  };
  if (lang() === 'en' && ta.value.startsWith('秋天')) ta.value = DEMO.en;
  render();
  // start only once the editor is on screen and the main thread is idle
  let started = false;
  const io = new IntersectionObserver(([e]) => {
    if (e.isIntersecting) { if (!started) { started = true; (window.requestIdleCallback || setTimeout)(demo, { timeout: 900 }); } }
    else if (started) { io.disconnect(); stopDemo(); } // scrolled away mid-pass: land at once, no typing while the page moves
  }, { threshold: .35 });
  io.observe(dev);
  document.addEventListener('postprep:languagechange', () => setTimeout(() => {
    if (!userEdited) { stopDemo(); ta.value = DEMO[lang()]; }
    render();
  }, 60));
}

function initFlow() {
  const pin = document.querySelector('.h-flow-pin'); if (!pin) return;
  const io = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting && pin.dataset.step !== e.target.dataset.i) pin.dataset.step = e.target.dataset.i;
  }, { rootMargin: '-50% 0px -50% 0px' });
  document.querySelectorAll('.h-flow-sentinel').forEach(s => io.observe(s));
}

function initRack() {
  const rack = document.querySelector('.h-rack'); if (!rack) return;
  const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { rack.classList.add('is-in'); io.disconnect(); } }, { threshold: .5 });
  io.observe(rack);
}

// Hero depth: the editor is an object under light. A very small parallax follows a fine
// pointer (or the gyroscope on phones), transform-only, one rAF while it settles, nothing
// at rest; off for reduced motion and the lite tier, flat while the editor has focus.
function initTilt() {
  const stage = document.querySelector('[data-tilt]'); if (!stage) return;
  const d = document.documentElement;
  if (reduced.matches || d.dataset.gfx === 'lite' || d.dataset.motion === 'reduced') return;
  const obj = stage.querySelector('.h-obj'), floor = stage.querySelector('.h-floor'), ruler = stage.querySelector('.h-ruler');
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (!fine && !matchMedia('(min-width: 901px)').matches) return; // phones: the tilt is flattened by CSS anyway
  const rest = { x: -4.5, y: 2 }; let tx = 0, ty = 0, x = 0, y = 0, raf = 0, on = false, focus = false;
  const step = () => {
    const gx = focus ? 0 : tx, gy = focus ? 0 : ty;
    x += (gx - x) * .12; y += (gy - y) * .12;
    const rx = focus ? 0 : rest.y - y * 2.2, ry = focus ? 0 : rest.x + x * 3.2;
    obj.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
    if (floor) floor.style.transform = `translate3d(${(-x * 10).toFixed(1)}px,0,0)`;
    if (ruler) ruler.style.transform = `translate3d(${(x * 6).toFixed(1)}px,${(y * 4).toFixed(1)}px,40px) rotate(4deg)`;
    raf = Math.abs(gx - x) + Math.abs(gy - y) > .002 ? requestAnimationFrame(step) : 0;
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(step); };
  const hero = stage.closest('section') || stage;
  hero.addEventListener('pointermove', e => {
    if (!on || e.pointerType !== 'mouse') return;
    const r = hero.getBoundingClientRect();
    tx = (e.clientX - r.left) / r.width * 2 - 1; ty = (e.clientY - r.top) / r.height * 2 - 1; kick();
  }, { passive: true });
  hero.addEventListener('pointerleave', () => { tx = ty = 0; kick(); });
  stage.addEventListener('focusin', () => { focus = true; obj.style.transition = 'none'; kick(); });
  stage.addEventListener('focusout', () => { focus = false; kick(); });
  new IntersectionObserver(([e]) => { on = e.isIntersecting; if (!on) { tx = ty = 0; } }).observe(stage);
  obj.style.transition = 'none'; obj.style.transform = `rotateX(${rest.y}deg) rotateY(${rest.x}deg)`;
}

export function initHome() {
  initEditor();
  initFlow();
  initRack();
  initTilt();
}
