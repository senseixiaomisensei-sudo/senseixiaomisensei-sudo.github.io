import { Spring, rangeFraction } from './classic-glass/motion.js';
import { initCharacterModes } from './classic-glass/characters.js?v=20261004-fluid-2';

// Presentation only: no writes to inference parameters, uploads or audio processing.
const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const isClassic = () => root.dataset.ui === 'classic';
const text = (zh, en) => root.lang.startsWith('en') ? en : zh;

function init() {
  initCommunity();
  let classicReady = false, deckRefresh = () => {}, characterRefresh = () => {};
  function syncTheme() {
    if (isClassic() && !classicReady) {
      classicReady = true;
      const optics = document.createElement('script');
      optics.src = 'assets/classic-glass/optics.js?v=20261001-4';
      document.head.append(optics);
      initRanges();
      initReflections();
      deckRefresh = initDeck();
      characterRefresh = initCharacterModes({ root, document, isClassic, text, reduced });
    }
    deckRefresh();
    characterRefresh();
  }
  new MutationObserver(syncTheme).observe(root, { attributes: true, attributeFilter: ['data-ui', 'lang'] });
  syncTheme();
}

function initReflections() {
  const x = new Spring(.24), y = new Spring(.1);
  let target, frame = 0, previous = 0;
  function paint(time) {
    frame = 0;
    if (!target || !isClassic() || document.hidden) return;
    const dt = (time - previous) / 1000 || 1/60; previous = time;
    const movingX = x.step(dt, reduced.matches), movingY = y.step(dt, reduced.matches);
    target.style.setProperty('--classic-light-x', `${x.value * 100}%`);
    target.style.setProperty('--classic-light-y', `${y.value * 100}%`);
    if (movingX || movingY) frame = requestAnimationFrame(paint);
  }
  function clear() { cancelAnimationFrame(frame); frame = 0; target = null; }
  document.addEventListener('pointermove', event => {
    if (!isClassic() || reduced.matches || event.pointerType === 'touch') return;
    const next = event.target.closest?.('#site-header > header,.classic-pane,[data-model-id]');
    if (!next) { clear(); return; }
    const box = next.getBoundingClientRect();
    if (!box.width || !box.height) return;
    target = next;
    x.target = Math.max(0,Math.min(1,(event.clientX - box.left)/box.width));
    y.target = Math.max(0,Math.min(1,(event.clientY - box.top)/box.height));
    if (!frame) { previous = performance.now(); frame = requestAnimationFrame(paint); }
  }, { passive:true });
  document.addEventListener('visibilitychange', clear);
  document.addEventListener('pointerleave', clear);
  new MutationObserver(clear).observe(root, { attributes:true, attributeFilter:['data-ui'] });
}

function initRanges() {
  const controllers = new Map();
  function mount(input) {
    if (controllers.has(input) || input.closest('.glass-only')) return;
    const wrap = document.createElement('div');
    wrap.className = 'classic-range-wrap';
    const bubble = document.createElement('span');
    bubble.className = 'classic-range-feedback';
    bubble.setAttribute('aria-hidden', 'true');
    input.before(wrap); wrap.append(input, bubble);
    const spring = new Spring(rangeFraction(input));
    let frame = 0, previous = 0, fade = 0;
    let holding = false;
    function paint(time) {
      frame = 0;
      const moving = spring.step((time - previous) / 1000 || 1 / 60, reduced.matches);
      previous = time;
      const fill = `${(spring.value * 100).toFixed(3)}%`;
      wrap.style.setProperty('--classic-fill', fill);
      input.style.setProperty('--classic-fill', fill);
      if (moving && isClassic() && !document.hidden) frame = requestAnimationFrame(paint);
    }
    function sync(feedback = false) {
      spring.target = rangeFraction(input);
      const output = input.id && document.getElementById(`${input.id}-value`);
      bubble.textContent = output?.textContent?.trim() || input.value;
      if (feedback && isClassic()) {
        wrap.classList.add('is-adjusting');
        clearTimeout(fade);
        if (!holding) fade = setTimeout(() => wrap.classList.remove('is-adjusting'), 500);
      }
      if (isClassic() && !document.hidden && !frame) { previous = performance.now(); frame = requestAnimationFrame(paint); }
      if (!isClassic()) { cancelAnimationFrame(frame); frame = 0; wrap.classList.remove('is-adjusting'); }
    }
    input.addEventListener('input', () => queueMicrotask(() => sync(true)));
    input.addEventListener('change', () => queueMicrotask(() => sync(true)));
    input.addEventListener('focus', () => sync(true));
    input.addEventListener('pointerdown', () => { holding = true; sync(true); });
    const release = () => { holding = false; sync(true); };
    input.addEventListener('pointerup', release);
    input.addEventListener('pointercancel', release);
    input.addEventListener('lostpointercapture', release);
    input.addEventListener('blur', () => { holding = false; wrap.classList.remove('is-adjusting'); });
    // Existing preset/reset handlers update the real value; read it after they run.
    controllers.set(input, sync); sync();
  }
  document.querySelectorAll('main input[type="range"]').forEach(mount);
  document.addEventListener('click', () => queueMicrotask(() => controllers.forEach(sync => sync())));
  document.addEventListener('visibilitychange', () => controllers.forEach(sync => sync()));
  new MutationObserver(() => controllers.forEach(sync => sync())).observe(root, { attributes: true, attributeFilter: ['data-ui'] });
}

function initDeck() {
  const aside = document.querySelector('body[data-page="rvc"] main aside');
  if (!aside) return () => {};
  const section = document.createElement('section');
  section.className = 'classic-only classic-console';
  section.innerHTML = `<div class="classic-console-top"><span>VOICE / WORKSPACE</span><i class="fa-solid fa-layer-group" aria-hidden="true"></i></div>
    <div class="classic-deck" role="group" tabindex="0">
      <article class="classic-pane"><span class="classic-pane-icon"><i class="fa-solid fa-user-group" aria-hidden="true"></i></span><h3></h3><p></p><button type="button" data-jump="rvc-model-search"></button></article>
      <article class="classic-pane"><span class="classic-pane-icon"><i class="fa-solid fa-microphone" aria-hidden="true"></i></span><h3></h3><p></p><button type="button" data-jump="rvc-step-audio-label"></button></article>
      <article class="classic-pane"><span class="classic-pane-icon"><i class="fa-solid fa-sliders" aria-hidden="true"></i></span><h3></h3><p></p><button type="button" data-jump="rvc-pitch"></button></article>
    </div><div class="classic-deck-controls"><button type="button" aria-pressed="true"></button><button type="button" aria-pressed="false"></button><button type="button" aria-pressed="false"></button><button type="button"><i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button></div>`;
  aside.prepend(section);
  const deck = section.querySelector('.classic-deck');
  const cards = [...section.querySelectorAll('.classic-pane')];
  const controls = [...section.querySelectorAll('.classic-deck-controls button')];
  const springs = cards.map((_, i) => new Spring(i));
  const pull = new Spring(0);
  let index = 0, frame = 0, previous = 0, grab = null;
  function paint(time) {
    frame = 0;
    const dt = (time - previous) / 1000 || 1 / 60; previous = time;
    let moving = pull.step(dt, reduced.matches);
    springs.forEach((spring, i) => {
      moving = spring.step(dt, reduced.matches) || moving;
      const rank = Math.max(0, spring.value);
      cards[i].style.transform = `translate3d(${i === index ? pull.value : 0}px,${rank * 20}px,0) scale(${1 - rank * .055})`;
      cards[i].style.filter = rank < .001 ? 'none' : `blur(${rank * 2.8}px)`;
      cards[i].style.opacity = String(1 - rank * .085);
      cards[i].style.zIndex = String(Math.round((3 - rank) * 10));
      cards[i].style.setProperty('--content-opacity', String(Math.max(0, 1 - rank * 2)));
    });
    if (moving && isClassic() && !document.hidden) frame = requestAnimationFrame(paint);
  }
  function wake() {
    if (isClassic() && !document.hidden && !frame) { previous = performance.now(); frame = requestAnimationFrame(paint); }
    if (!isClassic() || document.hidden) { cancelAnimationFrame(frame); frame = 0; }
  }
  function select(next) {
    pull.target = 0;
    index = (next + cards.length) % cards.length;
    cards.forEach((card, i) => {
      springs[i].target = (i - index + cards.length) % cards.length;
      card.inert = i !== index; card.setAttribute('aria-hidden', String(i !== index));
      controls[i].setAttribute('aria-pressed', String(i === index));
    });
    wake();
  }
  controls.forEach((control, i) => control.addEventListener('click', () => select(i < 3 ? i : index + 1)));
  deck.addEventListener('keydown', event => {
    if (event.target !== deck || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    select(event.key === 'Home' ? 0 : event.key === 'End' ? 2 : index + (event.key === 'ArrowRight' ? 1 : -1));
  });
  deck.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('button,a,input')) return;
    grab = { id: event.pointerId, x: event.clientX, y: event.clientY };
    deck.setPointerCapture(event.pointerId);
  });
  deck.addEventListener('pointermove', event => {
    if (!grab || grab.id !== event.pointerId) return;
    const dx = event.clientX - grab.x, dy = event.clientY - grab.y;
    if (Math.abs(dx) > Math.abs(dy)) { pull.target = Math.max(-60, Math.min(60, dx * .35)); wake(); }
  });
  deck.addEventListener('pointerup', event => {
    if (!grab || grab.id !== event.pointerId) return;
    const dx = event.clientX - grab.x, dy = event.clientY - grab.y; grab = null;
    select(index + (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : -1) : 0));
  });
  ['pointercancel','lostpointercapture'].forEach(name => deck.addEventListener(name, () => { grab = null; pull.target = 0; wake(); }));
  section.querySelectorAll('[data-jump]').forEach(button => button.addEventListener('click', () => {
    const target = document.getElementById(button.dataset.jump);
    if (!target) return;
    target.scrollIntoView({ behavior: reduced.matches ? 'instant' : 'smooth', block: 'center' });
    if (!target.matches('input,button')) target.tabIndex = -1;
    target.focus({ preventScroll: true });
  }));
  function refresh() {
    section.hidden = !isClassic();
    section.setAttribute('aria-label', text('叠层声音工作台','Stacked voice workspace'));
    section.querySelector('.classic-console-top span').textContent = text('声音工作台','Voice workspace');
    deck.setAttribute('aria-label', text('左右滑动或使用方向键切换卡片','Swipe or use arrow keys to switch cards'));
    const selected = document.querySelector('[data-model-id][aria-selected="true"]');
    const name = selected?.querySelector('p.font-black')?.textContent || text('选择角色','Choose a voice');
    cards[0].querySelector('h3').textContent = name;
    cards[0].querySelector('p').textContent = text('查看并切换当前声线。','View and change the current voice.');
    const file = document.getElementById('rvc-audio-file')?.files?.[0];
    cards[1].querySelector('h3').textContent = text('原声输入','Source audio');
    cards[1].querySelector('p').textContent = file?.name || text('上传一首歌，或录制一段声音。','Upload a song or record your voice.');
    cards[2].querySelector('h3').textContent = `${document.getElementById('rvc-pitch')?.value || 0} ${text('半音','semitones')}`;
    cards[2].querySelector('p').textContent = text('音高、动态和混音参数，各自独立调节。','Adjust pitch, dynamics and mix independently.');
    const names = [text('角色','Voice'),text('声音','Audio'),text('调音','Tune')];
    controls.slice(0,3).forEach((button, i) => { button.textContent = names[i]; });
    controls[3].setAttribute('aria-label', text('下一张卡片','Next card'));
    cards.forEach((card, i) => { card.querySelector('button').textContent = `${names[i]} →`; });
    wake();
  }
  document.getElementById('rvc-model-gallery') && new MutationObserver(refresh).observe(document.getElementById('rvc-model-gallery'), { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-selected'] });
  document.getElementById('rvc-audio-file')?.addEventListener('change', refresh);
  document.getElementById('rvc-pitch')?.addEventListener('input', refresh);
  document.addEventListener('click', () => queueMicrotask(refresh));
  document.addEventListener('visibilitychange', wake);
  select(0); refresh();
  return refresh;
}

function initCommunity() {
  const header = document.getElementById('site-header');
  if (!header) return;
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'community-toggle';
  button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-controls', 'community-dialog');
  button.innerHTML = '<i class="fa-brands fa-qq" aria-hidden="true"></i>';
  const dialog = document.createElement('dialog');
  dialog.id = 'community-dialog'; dialog.className = 'community-dialog';
  dialog.setAttribute('aria-labelledby', 'community-title');
  dialog.innerHTML = `<div class="community-toolbar"><strong id="community-title"></strong><a href="community/qq-1057798035.html" target="_blank" rel="noopener"></a><button class="community-close" type="button" autofocus><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div><div class="community-content"><div class="community-loading" role="status"></div></div>`;
  document.body.append(dialog);
  const content = dialog.querySelector('.community-content'), loading = dialog.querySelector('.community-loading');
  let controller, closeTimer = 0, closing = false;
  function localize() {
    button.title = text('QQ群 · 二次元 / 配音 / AI','QQ community · Anime / Voice / AI');
    button.setAttribute('aria-label', button.title);
    dialog.querySelector('strong').textContent = text('QQ群 1057798035','QQ Group 1057798035');
    dialog.querySelector('a').textContent = text('独立打开','Open page');
    dialog.querySelector('button').setAttribute('aria-label', text('关闭QQ群宣传页','Close community page'));
  }
  function mount() {
    const language = header.querySelector('[data-language-toggle]');
    if (language && !button.isConnected) language.before(button);
    localize();
  }
  async function load() {
    controller?.abort(); controller = new AbortController();
    const signal = controller.signal;
    loading.hidden = false; loading.textContent = text('正在打开群聊空间…','Opening the community…');
    content.querySelector('iframe')?.remove();
    try {
      const response = await fetch('community/qq-1057798035.html', { signal });
      if (!response.ok) throw new Error(String(response.status));
      const html = await response.text();
      if (signal.aborted || !dialog.open || closing) return;
      const iframe = document.createElement('iframe');
      iframe.title = text('二次元、配音、AI 群聊宣传页','Anime, voice and AI community');
      iframe.allow = 'clipboard-write';
      // srcdoc keeps the owned, self-contained page independent of Pages' DENY
      // response header. No site-wide framing/security policy is loosened.
      iframe.srcdoc = html;
      iframe.addEventListener('load', () => { if (!signal.aborted) loading.hidden = true; }, { once: true });
      content.append(iframe);
    } catch (error) {
      if (signal.aborted) return;
      loading.textContent = text('页面暂时未能载入，可重试或独立打开。','Unable to load. Retry or open the page directly.');
      const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = text('重试','Retry');
      retry.addEventListener('click', load); loading.append(retry);
    }
  }
  function cleanup() {
    clearTimeout(closeTimer); controller?.abort();
    content.querySelector('iframe')?.remove(); // Release the embedded WebGL/audio context.
    dialog.classList.remove('is-closing'); document.body.classList.remove('community-open'); closing = false;
    if (button.isConnected) button.focus({ preventScroll: true });
  }
  function close() {
    if (!dialog.open || closing) return;
    closing = true; controller?.abort(); dialog.classList.add('is-closing');
    closeTimer = setTimeout(() => dialog.close(), reduced.matches ? 0 : 200);
  }
  button.addEventListener('click', () => {
    if (dialog.open) return;
    dialog.showModal(); document.body.classList.add('community-open'); load();
  });
  dialog.querySelector('button').addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('close', cleanup);
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close();
  });
  new MutationObserver(mount).observe(header, { childList: true, subtree: true });
  new MutationObserver(localize).observe(root, { attributes: true, attributeFilter: ['lang'] });
  mount();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
