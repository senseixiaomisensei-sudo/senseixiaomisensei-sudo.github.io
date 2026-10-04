import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';
import { Spring, rangeFraction } from '../assets/classic-glass/motion.js';
import { clamp, dragAxis, expansionThreshold, deckExtent } from '../assets/classic-glass/interaction-core.js';

const file = name => readFile(new URL(`../${name}`, import.meta.url), 'utf8');
test('stack spring converges at different frame rates and respects reduced motion', () => {
  for (const fps of [30,60,120]) {
    const spring = new Spring(2); spring.target = 0;
    for (let i = 0; i < fps * 3; i++) assert.ok(Number.isFinite((spring.step(1/fps),spring.value)));
    assert.equal(spring.value,0); assert.equal(spring.velocity,0);
    spring.target = 2; spring.step(.01,true); assert.equal(spring.value,2);
  }
});
test('visual slider fraction handles pitch, negative gain, endpoints and invalid ranges', () => {
  assert.equal(rangeFraction({min:-12,max:12,value:0}),.5);
  assert.equal(rangeFraction({min:-24,max:6,value:0}),.8);
  assert.equal(rangeFraction({min:0,max:.6,value:.3}),.5);
  for (const [value,expected] of [[-99,0],[99,1],[NaN,0],[Infinity,0]]) assert.equal(rangeFraction({min:0,max:1,value}),expected);
  assert.equal(rangeFraction({min:1,max:1,value:1}),0);
});
test('every shared page includes the classic layer once and permits its owned frame', async () => {
  const pages = (await readdir(new URL('../',import.meta.url))).filter(name => name.endsWith('.html'));
  for (const page of pages) {
    const source = await file(page);
    assert.equal((source.match(/assets\/classic-glass\.js/g)||[]).length,1,page);
    assert.equal((source.match(/assets\/classic-glass\.css/g)||[]).length,1,page);
    assert.match(source,/frame-src 'self' https:/,page);
  }
  const source = await file('assets/classic-glass.js');
  assert.doesNotMatch(source,/input\.value\s*=|FormData|AudioContext|createMediaElementSource/);
  assert.match(source,/section\.hidden = !isClassic\(\)/);
  assert.match(await file('assets/classic-glass.css'),/\.classic-range-wrap \{ display: contents; \}/);
  assert.match(source,/aria-selected/);
  const owned = await readFile(new URL('../community/qq-1057798035.html',import.meta.url));
  assert.equal(createHash('sha256').update(owned).digest('hex'),'e539ce458a0e47a351d0959252004f31ab9e3c8595b297519c9edf2d6cf061dd');
});

// Unit DOM fixture for modal lifecycle. This does not launch or control a browser.
class Element {
  constructor(tag) { this.tag = tag; this.children=[]; this.listeners={}; this.attributes={}; this.open=false; this.hidden=false; this.isConnected=false; this.classes=new Set(); this.classList={add:x=>this.classes.add(x),remove:x=>this.classes.delete(x)}; this.properties={}; this.style={setProperty:(key,value)=>{this.properties[key]=value;}}; }
  set innerHTML(value) {
    this.html=value;
    if (value.includes('community-toolbar')) {
      this.parts={strong:new Element('strong'),a:new Element('a'),button:new Element('button'),'.community-content':new Element('div'),'.community-loading':new Element('div')};
    }
  }
  set textContent(value) { this.text=value; this.children=[]; }
  get textContent() { return this.text; }
  setAttribute(key,value) { this.attributes[key]=value; }
  querySelector(key) { return this.parts?.[key] || this.children.find(c=>c.tag===key) || null; }
  append(...items) { items.forEach(item=>{ item.parent=this; item.isConnected=true; this.children.push(item); }); }
  before(item) { this.parent.append(item); }
  remove() { this.isConnected=false; this.parent.children=this.parent.children.filter(x=>x!==this); }
  addEventListener(name,fn) { (this.listeners[name]??=[]).push(fn); }
  fire(name,event={}) { return Promise.all((this.listeners[name]||[]).map(fn=>fn(event))); }
  showModal() { this.open=true; }
  close() { this.open=false; return this.fire('close'); }
  focus() { this.focused=true; }
  closest() { return null; }
}
async function modalFixture(fetchImpl) {
  const root={lang:'zh-CN',dataset:{ui:'glass'}}, body=new Element('body'), header=new Element('header'), language=new Element('button');
  header.append(language); header.parts={'[data-language-toggle]':language};
  const document={documentElement:root,body,readyState:'loading',getElementById:id=>id==='site-header'?header:null,createElement:tag=>new Element(tag),addEventListener(){}};
  const pending=[];
  const context=vm.createContext({document,matchMedia:()=>({matches:true}),MutationObserver:class{observe(){}},AbortController,fetch:fetchImpl,setTimeout:fn=>(pending.push(fn),pending.length),clearTimeout(){}});
  vm.runInContext((await file('assets/classic-glass.js')).replace(/^import[^\n]+\n/gm,''),context);
  vm.runInContext('initCommunity()',context);
  return {body,button:header.children[1],dialog:body.children[0],pending};
}
test('community opens lazily, cleans its frame and restores trigger focus', async () => {
  let calls=0;
  const ui=await modalFixture(async ()=>{calls++; return {ok:true,text:async()=>'<html>owned page</html>'};});
  assert.equal(calls,0);
  await ui.button.fire('click'); await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls,1); assert.equal(ui.dialog.open,true);
  const content=ui.dialog.querySelector('.community-content'), frame=content.querySelector('iframe');
  assert.equal(frame.srcdoc,'<html>owned page</html>');
  await frame.fire('load'); assert.equal(ui.dialog.querySelector('.community-loading').hidden,true);
  let prevented=false;
  await ui.dialog.fire('cancel',{preventDefault(){prevented=true;}});
  assert.equal(prevented,true); ui.pending.forEach(fn=>fn());
  assert.equal(ui.dialog.open,false); assert.equal(content.querySelector('iframe'),null);
  assert.equal(ui.button.focused,true); assert.equal(ui.body.classes.has('community-open'),false);
});
test('closing during fetch prevents stale frame insertion and failed loads offer retry', async () => {
  let release;
  const ui=await modalFixture(()=>new Promise(resolve=>{release=resolve;}));
  await ui.button.fire('click'); await ui.dialog.fire('cancel',{preventDefault(){}}); ui.pending.forEach(fn=>fn());
  release({ok:true,text:async()=>'<html>late</html>'}); await new Promise(resolve=>setImmediate(resolve));
  assert.equal(ui.dialog.querySelector('.community-content').querySelector('iframe'),null);
  const failed=await modalFixture(async()=>({ok:false,status:503}));
  await failed.button.fire('click'); await new Promise(resolve=>setImmediate(resolve));
  assert.equal(failed.dialog.querySelector('.community-loading').children[0].textContent,'重试');
});
test('slider feedback follows actual values without changing inference state; theme switch stops motion', async () => {
  const input=new Element('input'); input.id='rvc-pitch'; input.min=-12; input.max=12; input.value='0';
  const container=new Element('div'); container.append(input);
  const output=new Element('output'); output.textContent='0';
  const root={dataset:{ui:'classic'}}, observers=[], frames=new Map(); let next=0;
  const document={documentElement:root,readyState:'loading',hidden:false,querySelectorAll:()=>[input],getElementById:()=>output,createElement:tag=>new Element(tag),addEventListener(){}};
  const context=vm.createContext({document,Spring,rangeFraction,performance:{now:()=>0},queueMicrotask,matchMedia:()=>({matches:false}),MutationObserver:class{constructor(fn){observers.push(fn);}observe(){}},requestAnimationFrame:fn=>(frames.set(++next,fn),next),cancelAnimationFrame:id=>frames.delete(id),setTimeout:()=>1,clearTimeout(){}});
  vm.runInContext((await file('assets/classic-glass.js')).replace(/^import[^\n]+\n/gm,''),context);
  vm.runInContext('initRanges()',context);
  function tick(time) { const callbacks=[...frames.values()]; frames.clear(); callbacks.forEach(fn=>fn(time)); }
  tick(16); assert.equal(input.properties['--classic-fill'],'50.000%');
  input.value='6'; output.textContent='+6'; await input.fire('input'); await new Promise(resolve=>setImmediate(resolve));
  const wrap=input.parent; assert.equal(wrap.classes.has('is-adjusting'),true);
  assert.equal(wrap.children[1].textContent,'+6');
  for(let t=32;t<2500;t+=16) tick(t);
  assert.equal(input.value,'6'); assert.equal(input.properties['--classic-fill'],'75.000%'); assert.equal(frames.size,0);
  input.value='-6'; await input.fire('input'); await new Promise(resolve=>setImmediate(resolve));
  assert.ok(frames.size>0);
  root.dataset.ui='glass'; observers.forEach(fn=>fn());
  assert.equal(frames.size,0); assert.equal(wrap.classes.has('is-adjusting'),false); assert.equal(input.value,'-6');
});

async function deckFixture(){
  class DeckElement extends Element{
    constructor(tag){super(tag);this.dataset={};this.inert=false;this.clientWidth=242;}
    closest(selector){if(selector==='.classic-pane'&&this.tag==='article')return this;
      if(selector==='button'&&this.tag==='button')return this;
      if(selector==='a,input,select')return null;
      return this.parent?.closest(selector)||null;}
    setPointerCapture(id){this.captured=id;}
    releasePointerCapture(){this.captured=null;}
    set innerHTML(value){
      const deck=new DeckElement('div'),cards=Array.from({length:3},()=>new DeckElement('article'));
      for(const card of cards){card.parts={h3:new DeckElement('h3'),p:new DeckElement('p'),button:new DeckElement('button')};card.parts.button.dataset.jump='rvc-pitch';card.append(...Object.values(card.parts));}
      deck.append(...cards);
      const controls=Array.from({length:4},()=>new DeckElement('button'));
      this.parts={'.classic-deck':deck,'.classic-console-top span':new DeckElement('span')};
      this.lists={'.classic-pane':cards,'.classic-deck-controls button':controls,'[data-jump]':cards.map(card=>card.parts.button)};
    }
    querySelectorAll(key){return this.lists?.[key]||[];}
    prepend(item){this.append(item);}
  }
  const aside=new DeckElement('aside'),root={dataset:{ui:'classic'},lang:'zh-CN'},frames=new Map(),events={};let next=0,time=0;
  const document={documentElement:root,readyState:'loading',hidden:false,querySelector:()=>aside,getElementById:()=>null,
    createElement:tag=>new DeckElement(tag),addEventListener:(name,fn)=>{events[name]=fn;}};
  const context=vm.createContext({document,Spring,rangeFraction,clamp,dragAxis,expansionThreshold,deckExtent,performance:{now:()=>time},queueMicrotask,
    matchMedia:()=>({matches:false}),MutationObserver:class{observe(){}},requestAnimationFrame:fn=>(frames.set(++next,fn),next),cancelAnimationFrame:id=>frames.delete(id)});
  vm.runInContext((await file('assets/classic-glass.js')).replace(/^import[^\n]+\n/gm,''),context);vm.runInContext('initDeck()',context);
  const section=aside.children[0],deck=section.querySelector('.classic-deck'),cards=section.querySelectorAll('.classic-pane');
  const settle=()=>{for(let i=0;i<180&&frames.size;i++){time+=16;const batch=[...frames.values()];frames.clear();batch.forEach(fn=>fn(time));}};settle();
  const fire=(name,id,x,y,target=cards.find(card=>!card.inert))=>deck.fire(name,{target,button:0,pointerId:id,clientX:x,clientY:y,preventDefault(){},stopImmediatePropagation(){}});
  return {deck,cards,frames,fire,settle,document,events};
}

test('workspace deck follows the pointer directly, short-swipes, spreads by direction and retracts',async()=>{
  const ui=await deckFixture(),card=ui.cards[0];
  await ui.fire('pointerdown',1,100,100);await ui.fire('pointermove',1,124,100);
  assert.match(card.style.transform,/translate3d\(24px,0px/);assert.notEqual(ui.deck.dataset.stackLayout,'horizontal');
  await ui.fire('pointerup',1,124,100);ui.settle();assert.equal(ui.cards.find(c=>!c.inert),ui.cards[2]);
  await ui.fire('pointerdown',2,100,100);await ui.fire('pointermove',2,320,100);
  assert.equal(ui.deck.dataset.stackLayout,'horizontal');assert.equal(ui.cards.filter(c=>!c.inert).length,3);
  await ui.fire('pointermove',2,100,350);assert.equal(ui.deck.dataset.stackLayout,'vertical');
  await ui.fire('pointermove',2,100,125);assert.equal(ui.deck.dataset.stackLayout,'stack');
  await ui.fire('pointerup',2,100,125);ui.settle();assert.equal(ui.frames.size,0);
  assert.equal(ui.deck.dataset.animating,undefined);
});

test('workspace link surface can drag; cancellation releases the pointer and returns to the original layout',async()=>{
  const ui=await deckFixture(),button=ui.cards[0].querySelector('button');
  await ui.fire('pointerdown',1,100,100,button);assert.equal(button.captured,1);
  await ui.fire('pointermove',1,100,330,button);assert.equal(ui.deck.dataset.stackLayout,'vertical');
  await ui.fire('pointercancel',1,100,330,button);ui.settle();
  assert.equal(button.captured,null);assert.equal(ui.deck.dataset.stackLayout,'stack');assert.equal(ui.deck.dataset.dragging,undefined);
  await ui.fire('pointerdown',2,100,100);await ui.fire('pointermove',2,-130,100);await ui.fire('pointerup',2,-130,100);ui.settle();
  assert.equal(ui.deck.dataset.stackLayout,'horizontal');
  await ui.fire('pointerdown',3,100,100);await ui.fire('pointermove',3,330,100);await ui.fire('pointermove',3,105,100);await ui.fire('pointerup',3,105,100);ui.settle();
  assert.equal(ui.deck.dataset.stackLayout,'stack');assert.equal(ui.frames.size,0);
});
