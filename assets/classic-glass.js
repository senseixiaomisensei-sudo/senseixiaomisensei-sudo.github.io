import { Spring, rangeFraction } from './classic-glass/motion.js';
import { initCharacterModes } from './classic-glass/characters.js?v=20261004-fluid-4';
import { clamp, dragAxis, expansionThreshold, deckExtent } from './classic-glass/interaction-core.js?v=20261003-fluid-1';

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
    if(event.target.closest?.('[data-dragging="true"]')){clear();return;}
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
  const positions=cards.map((_,i)=>({x:new Spring(0),y:new Spring(i*20)}));
  const spread=new Spring(0),vertical=new Spring(0);
  let index = 0, frame = 0, previous = 0, grab = null,layout='stack',suppressClick=false,paintedHeight='';
  let width=deck.clientWidth||242;
  function access(){cards.forEach((card,i)=>{
    const rear=layout==='stack'&&i!==index;card.inert=rear;card.setAttribute('aria-hidden',String(rear));
    controls[i].setAttribute('aria-pressed',String(i===index));
  });}
  function paintCard(i){
    const state=positions[i],rank=Math.max(0,springs[i].value),held=grab?.dragged&&grab.card===cards[i];
    const x=held?grab.anchorX+grab.dx:state.x.value,y=held?grab.anchorY+grab.dy:state.y.value;
    cards[i].style.transform=`translate3d(${x}px,${y}px,0)`;
    cards[i].style.opacity=String(held?1:1-rank*.085);
    cards[i].style.zIndex=held?'100':String(Math.round((3-rank)*10));
    return{id:i,x,y,w:width,h:252};
  }
  function paint(time) {
    frame = 0;
    const dt = (time - previous) / 1000 || 1 / 60; previous = time;
    let moving = spread.step(dt,reduced.matches)|vertical.step(dt,reduced.matches);
    const q=clamp(spread.value,0,1),v=clamp(vertical.value,0,1),bounds=[];
    springs.forEach((spring, i) => {
      const rank=(i-index+cards.length)%cards.length,state=positions[i];
      spring.target=rank*(1-q);
      state.x.target=rank*(width+16)*q*(1-v);state.y.target=rank*20*(1-q)+rank*268*q*v;
      moving = spring.step(dt, reduced.matches) || moving;
      moving=state.x.step(dt,reduced.matches)||moving;moving=state.y.step(dt,reduced.matches)||moving;
      bounds.push(paintCard(i));
    });
    const h=`${Math.ceil(deckExtent(bounds,{targetHeight:layout==='vertical'?788:292,gap:16,heldId:grab?.dragged?cards.indexOf(grab.card):null}))}px`;
    if(h!==paintedHeight){deck.style.height=h;paintedHeight=h;}
    if (moving && isClassic() && !document.hidden) frame = requestAnimationFrame(paint);
    else if(!grab?.dragged)delete deck.dataset.animating;
  }
  function wake() {
    if (isClassic() && !document.hidden && !frame) { deck.dataset.animating='true';previous = performance.now(); frame = requestAnimationFrame(paint); }
    if (!isClassic() || document.hidden) { cancelAnimationFrame(frame); frame = 0; delete deck.dataset.animating; }
  }
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => {
    const next = deck.clientWidth;
    if (next > 0 && next !== width) { width = next; wake(); }
  }).observe(deck);
  function select(next) {
    index = (next + cards.length) % cards.length;
    access();
    wake();
  }
  function setLayout(value){layout=value;deck.dataset.stackLayout=value;spread.target=value==='stack'?0:1;
    vertical.target=value==='vertical'?1:0;access();wake();}
  controls.forEach((control, i) => control.addEventListener('click', () => select(i < 3 ? i : index + 1)));
  deck.addEventListener('keydown', event => {
    if (event.target !== deck || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','Escape'].includes(event.key)) return;
    event.preventDefault();
    if(event.key==='Escape'){setLayout('stack');return;}
    select(event.key === 'Home' ? 0 : event.key === 'End' ? 2 : index + (['ArrowRight','ArrowDown'].includes(event.key) ? 1 : -1));
  });
  deck.addEventListener('pointerdown', event => {
    if (!isClassic()||grab||event.isPrimary===false||event.button !== 0 || event.target.closest('a,input,select')) return;
    const card=event.target.closest('.classic-pane')||cards[index],i=cards.indexOf(card);
    if(i<0||card.inert)return;
    width=deck.clientWidth||242;index=i;suppressClick=false;
    grab = { id:event.pointerId,card,x:event.clientX,y:event.clientY,dx:0,dy:0,
      anchorX:positions[i].x.value,anchorY:positions[i].y.value,startLayout:layout,
      axis:layout==='vertical'?'vertical':'horizontal',threshold:expansionThreshold(width,252,{ratio:.8,min:160,max:220}),
      scrollX:deck.scrollLeft||0,kind:layout==='horizontal'?null:'card',pointerType:event.pointerType,dragged:false,expanded:false };
    grab.capture=event.target.closest('button')||card;
    try{grab.capture.setPointerCapture(event.pointerId);}catch{}
  });
  deck.addEventListener('pointermove', event => {
    if (!grab || grab.id !== event.pointerId) return;
    grab.dx=event.clientX-grab.x;grab.dy=event.clientY-grab.y;
    if(!grab.dragged&&Math.hypot(grab.dx,grab.dy)<=3)return;
    if(grab.kind===null)grab.kind=Math.abs(grab.dx)>=Math.abs(grab.dy)?'pan':'card';
    if(grab.kind==='pan'){
      grab.dragged=true;deck.dataset.panning='true';
      if(grab.pointerType!=='touch'){event.preventDefault?.();deck.scrollLeft=grab.scrollX-grab.dx;}
      return;
    }
    grab.dragged=true;deck.dataset.dragging='true';event.preventDefault?.();
    grab.axis=dragAxis(grab.dx,grab.dy,grab.axis);
    const distance=Math.abs(grab.axis==='vertical'?grab.dy:grab.dx);
    if(distance>=grab.threshold){grab.expanded=true;if(layout!==grab.axis)setLayout(grab.axis);}
    else if(grab.expanded&&distance<grab.threshold*.44){grab.expanded=false;setLayout('stack');}
    paintCard(cards.indexOf(grab.card));wake();
  });
  function release(event,cancelled=false){
    if (!grab || grab.id !== event.pointerId) return;
    const held=grab,state=positions[cards.indexOf(held.card)];grab=null;delete deck.dataset.dragging;
    if(held.kind==='pan'){
      delete deck.dataset.panning;try{held.capture.releasePointerCapture(held.id);}catch{}
      suppressClick=held.dragged&&!cancelled;return;
    }
    if(held.dragged){state.x.value=held.anchorX+held.dx;state.y.value=held.anchorY+held.dy;state.x.velocity=state.y.velocity=0;}
    try{held.capture.releasePointerCapture(held.id);}catch{}
    suppressClick=held.dragged&&!cancelled;
    if(cancelled){setLayout(held.startLayout);return;}
    if(!held.dragged)return;
    if(held.expanded){setLayout(layout);return;}
    setLayout(layout);
    if(held.startLayout==='stack'){const delta=held.axis==='vertical'?held.dy:held.dx;if(Math.abs(delta)>=24)select(index+(delta<0?1:-1));}
  }
  deck.addEventListener('pointerup',event=>release(event));
  ['pointercancel','lostpointercapture'].forEach(name => deck.addEventListener(name,event=>release(event,true)));
  deck.addEventListener('click',event=>{if(suppressClick){event.preventDefault();event.stopImmediatePropagation();suppressClick=false;}},true);
  section.querySelectorAll('[data-jump]').forEach(button => button.addEventListener('click', () => {
    const target = document.getElementById(button.dataset.jump);
    if (!target) return;
    window.PostPrepStudio?.revealTarget(target);
    target.scrollIntoView({ behavior: reduced.matches ? 'instant' : 'smooth', block: 'center' });
    if (!target.matches('input,button')) target.tabIndex = -1;
    target.focus({ preventScroll: true });
  }));
  function refresh() {
    section.hidden = !isClassic();
    section.setAttribute('aria-label', text('叠层声音工作台','Stacked voice workspace'));
    section.querySelector('.classic-console-top span').textContent = text('声音工作台','Voice workspace');
    deck.setAttribute('aria-label', text('短滑切换卡片，大幅横拖或竖拖摊开，回拉收拢','Short swipe to switch, long horizontal or vertical pull to spread, pull back to stack'));
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
  document.addEventListener('visibilitychange',()=>{if(grab&&document.hidden)release({pointerId:grab.id},true);wake();});
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
