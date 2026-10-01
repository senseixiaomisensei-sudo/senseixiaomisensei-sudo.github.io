import { Spring } from './motion.js';

// The original option buttons remain the only source of selection and model IDs.
// This controller changes their presentation, never their inference state.
export function initCharacterModes({ root, document, isClassic, text, reduced,
  storage, Observer = globalThis.MutationObserver,
  raf = globalThis.requestAnimationFrame, caf = globalThis.cancelAnimationFrame,
  now = () => performance.now() }) {
  let mode = 'default';
  try { storage ??= globalThis.localStorage; if (storage.getItem('postprep-character-view') === 'stack') mode = 'stack'; } catch {}
  const galleries = ['rvc-model-gallery', 'rvc-trained-model-gallery']
    .map(id => document.getElementById(id)).filter(Boolean);
  if (!galleries.length) return () => {};
  const switcher = document.createElement('div');
  switcher.className = 'classic-only classic-character-toolbar';
  const label = document.createElement('span');
  const toggle = document.createElement('div');
  toggle.className = 'classic-character-switch'; toggle.setAttribute('role', 'group');
  const pill = document.createElement('span');
  pill.className = 'classic-character-pill'; pill.setAttribute('aria-hidden', 'true');
  toggle.append(pill);
  const modes = ['default', 'stack'].map(value => {
    const button = document.createElement('button'); button.type = 'button';
    button.dataset.view = value;
    button.addEventListener('click', () => {
      mode = value;
      try { storage.setItem('postprep-character-view', mode); } catch {}
      refresh();
    });
    toggle.append(button); return button;
  });
  switcher.append(label, toggle); galleries[0].before(switcher);
  const controllers = galleries.map(gallery => {
    const nav = document.createElement('div'); nav.className = 'classic-character-nav';
    const prev = document.createElement('button'), status = document.createElement('span'), next = document.createElement('button');
    prev.type = next.type = 'button'; prev.textContent = '←'; next.textContent = '→';
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    nav.append(prev, status, next); gallery.after(nav);
    let cards = [], snapshots = new Map(), springs = new Map(), frontId = '', frame = 0, previous = 0, grab = null, suppressClick = false;
    const pull = new Spring(0);
    const active = () => isClassic() && mode === 'stack';
    const index = () => Math.max(0, cards.findIndex(card => card.dataset.modelId === frontId));
    function restore() {
      cards.forEach(card => {
        const saved = snapshots.get(card); if (!saved) return;
        ['transform','filter','opacity','z-index','--character-content'].forEach(name => card.style.removeProperty(name));
        card.inert = saved.inert;
        if (saved.hidden === null) card.removeAttribute('aria-hidden'); else card.setAttribute('aria-hidden', saved.hidden);
        if (saved.tab === null) card.removeAttribute('tabindex'); else card.setAttribute('tabindex', saved.tab);
        delete card.dataset.stackRear; delete card.dataset.stackOff;
      });
      gallery.classList.remove('is-character-stack');
      delete gallery.dataset.dragging; grab = null; pull.value = pull.target = pull.velocity = 0;
      caf(frame); frame = 0;
    }
    function paint(time) {
      frame = 0;
      if (!active() || document.hidden) return;
      const dt = (time - previous) / 1000 || 1/60; previous = time;
      let moving = pull.step(dt, reduced.matches);
      cards.forEach(card => {
        const spring = springs.get(card); moving = spring.step(dt, reduced.matches) || moving;
        const depth = Math.max(0, Math.min(3, spring.value));
        card.style.transform = `translate3d(${card.dataset.modelId === frontId ? pull.value : 0}px,${depth * 22}px,0) scale(${1 - depth * .055})`;
        card.style.filter = depth < .001 ? 'none' : `blur(${depth * 1.3}px) brightness(${1 - depth * .035})`;
        card.style.opacity = String(Math.max(0, 1 - depth * .13));
        card.style.zIndex = String(Math.round((4 - depth) * 10));
        card.style.setProperty('--character-content', String(Math.max(0, 1 - depth * 2.5)));
        card.dataset.stackOff = String(spring.target > 2 && depth >= 2.98);
      });
      if (moving) frame = raf(paint);
    }
    function wake() {
      if (active() && !document.hidden && !frame) { previous = now(); frame = raf(paint); }
      if (!active() || document.hidden) { caf(frame); frame = 0; }
    }
    function update() {
      gallery.classList.add('is-character-stack');
      const front = index();
      cards.forEach((card, i) => {
        // At most three neighbours stay visible. Every filtered role remains reachable.
        const depth = (i - front + cards.length) % cards.length;
        springs.get(card).target = Math.min(3, depth);
        card.dataset.stackRear = String(depth !== 0); card.dataset.stackOff = String(depth > 2 && springs.get(card).value >= 2.98);
        card.inert = depth !== 0; card.setAttribute('aria-hidden', String(depth !== 0));
        card.tabIndex = depth === 0 ? 0 : -1;
      });
      const chosen = cards[front]?.getAttribute('aria-selected') === 'true';
      status.textContent = cards.length ? `${front + 1} / ${cards.length} · ${chosen ? text('已选用','Selected') : text('点击前卡选用','Click card to select')}` : text('没有匹配角色','No matching voices');
      prev.disabled = next.disabled = cards.length < 2;
      wake();
    }
    function browse(delta) {
      if (!active() || !cards.length) return;
      frontId = cards[(index() + delta + cards.length) % cards.length].dataset.modelId;
      pull.target = 0; update();
    }
    prev.addEventListener('click', () => browse(-1)); next.addEventListener('click', () => browse(1));
    gallery.addEventListener('keydown', event => {
      if (!active() || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key) || event.target.closest('input,select,textarea')) return;
      event.preventDefault();
      if (event.key === 'Home' || event.key === 'End') {
        frontId = cards[event.key === 'Home' ? 0 : cards.length - 1]?.dataset.modelId || ''; update();
      } else browse(event.key === 'ArrowRight' ? 1 : -1);
      cards[index()]?.focus({ preventScroll: true });
    });
    gallery.addEventListener('pointerdown', event => {
      if (!active() || reduced.matches || event.button !== 0 || cards.length < 2) return;
      suppressClick = false;
      // Keep taps on the original card intact; capture only once a horizontal drag is established.
      grab = { id:event.pointerId, x:event.clientX, y:event.clientY, dragged:false };
    });
    gallery.addEventListener('pointermove', event => {
      if (!grab || grab.id !== event.pointerId) return;
      const dx = event.clientX - grab.x, dy = event.clientY - grab.y;
      if (!grab.dragged && Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { grab = null; return; }
      if (!grab.dragged && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        grab.dragged = true; gallery.setPointerCapture(event.pointerId); gallery.dataset.dragging = 'true';
      }
      if (grab.dragged) { pull.target = Math.max(-90, Math.min(90, dx * .65)); wake(); }
    });
    function release(event, cancelled = false) {
      if (!grab || grab.id !== event.pointerId) return;
      const drag = grab, dx = event.clientX - drag.x; grab = null;
      delete gallery.dataset.dragging;
      // Suppress only the click generated by this completed drag, not the next tap.
      suppressClick = drag.dragged && !cancelled;
      if (!cancelled && drag.dragged && Math.abs(dx) > 42) browse(dx < 0 ? 1 : -1);
      else { pull.target = 0; wake(); }
    }
    gallery.addEventListener('pointerup', event => release(event));
    gallery.addEventListener('pointercancel', event => release(event, true));
    gallery.addEventListener('lostpointercapture', event => release(event, true));
    gallery.addEventListener('click', event => {
      if (suppressClick) { event.preventDefault(); event.stopImmediatePropagation(); suppressClick = false; }
    }, true);
    return {
      refresh() {
        const nextCards = [...gallery.querySelectorAll('[data-model-id]')];
        const changed = nextCards.length !== cards.length || nextCards.some((card,i) => card !== cards[i]);
        if (changed) {
          restore(); cards = nextCards; snapshots = new Map(); springs = new Map();
          if (!cards.some(card => card.dataset.modelId === frontId)) frontId = (cards.find(card => card.getAttribute('aria-selected') === 'true') || cards[0])?.dataset.modelId || '';
          cards.forEach((card,i) => {
            snapshots.set(card, { inert:card.inert, hidden:card.getAttribute('aria-hidden'), tab:card.getAttribute('tabindex') });
            springs.set(card, new Spring(Math.min(3,(i-index()+cards.length)%cards.length)));
          });
        }
        nav.hidden = !active() || !cards.length;
        prev.setAttribute('aria-label', text('上一个角色','Previous voice')); next.setAttribute('aria-label', text('下一个角色','Next voice'));
        if (active()) update(); else restore();
      }, wake
    };
  });
  function refresh() {
    switcher.hidden = !isClassic();
    label.textContent = text('角色呈现','Voice view');
    toggle.setAttribute('aria-label', text('角色选择模式','Voice selection view'));
    toggle.dataset.active = mode;
    modes.forEach((button,i) => {
      button.textContent = i === 0 ? text('默认','Default') : text('组件堆叠','Stack');
      button.setAttribute('aria-pressed', String(button.dataset.view === mode));
    });
    controllers.forEach(controller => controller.refresh());
  }
  galleries.forEach(gallery => new Observer(refresh).observe(gallery, { childList:true, subtree:true }));
  document.addEventListener('visibilitychange', () => controllers.forEach(controller => controller.wake()));
  reduced.addEventListener?.('change', refresh);
  refresh(); return refresh;
}
