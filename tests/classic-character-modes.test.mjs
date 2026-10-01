import assert from 'node:assert/strict';
import test from 'node:test';
import { initCharacterModes } from '../assets/classic-glass/characters.js';

// DOM contract fixture only; no claim of browser rendering or touch acceptance.
class Node {
  constructor(tag='div') {
    this.tag=tag; this.children=[]; this.dataset={}; this.attrs=new Map(); this.events={}; this.inert=false;
    this.classes=new Set(); this.classList={add:x=>this.classes.add(x),remove:x=>this.classes.delete(x)};
    this.values={}; this.style={setProperty:(k,v)=>this.values[k]=v,removeProperty:k=>{delete this.values[k]; delete this.style[k];}};
  }
  append(...nodes) { for(const node of nodes) { node.parent=this; this.children.push(node); } }
  before(node) { node.parent=this.parent; this.parent.children.splice(this.parent.children.indexOf(this),0,node); }
  after(node) { node.parent=this.parent; this.parent.children.splice(this.parent.children.indexOf(this)+1,0,node); }
  setAttribute(k,v) { this.attrs.set(k,String(v)); }
  getAttribute(k) { return this.attrs.get(k)??null; }
  removeAttribute(k) { this.attrs.delete(k); }
  set tabIndex(value) { this.setAttribute('tabindex',value); }
  get tabIndex() { return Number(this.getAttribute('tabindex')??0); }
  addEventListener(k,fn) { (this.events[k]??=[]).push(fn); }
  fire(k,event={}) { for(const fn of this.events[k]??[]) fn({target:this,button:0,...event}); }
  closest() { return null; }
  querySelectorAll() { return this.children.flatMap(child=>[...(child.dataset.modelId?[child]:[]),...child.querySelectorAll()]); }
  focus() { this.focused=true; }
  setPointerCapture() {}
}
function fixture({stored='default', trained=false, brokenStorage=false}={}) {
  const parent=new Node(), gallery=new Node(), extra=trained?new Node():null;
  parent.append(gallery); if(extra) parent.append(extra);
  let selected='id-0', time=0, next=0;
  const root={dataset:{ui:'classic'},lang:'zh-CN'}, frames=new Map(), observers=[], events={}, written=[];
  function populate(target,count=6) {
    target.children=[]; const grid=new Node(); grid.setAttribute('role','group'); target.append(grid);
    for(let i=0;i<count;i++) {
      const card=new Node('button'); card.dataset.modelId=`id-${i}`; card.setAttribute('aria-selected',String(card.dataset.modelId===selected));
      card.addEventListener('click',()=>{selected=card.dataset.modelId; populate(target,count); observers.forEach(fn=>fn());}); grid.append(card);
    }
  }
  populate(gallery); if(extra) populate(extra,2);
  const document={hidden:false,getElementById:id=>id==='rvc-model-gallery'?gallery:id==='rvc-trained-model-gallery'?extra:null,createElement:tag=>new Node(tag),addEventListener:(name,fn)=>{events[name]=fn;}};
  const refresh=initCharacterModes({root,document,isClassic:()=>root.dataset.ui==='classic',text:zh=>zh,reduced:{matches:false},
    storage:{getItem(){if(brokenStorage)throw Error('blocked');return stored;},setItem(k,v){written.push([k,v]);if(brokenStorage)throw Error('blocked');}},
    Observer:class{constructor(fn){observers.push(fn);}observe(){}},raf:fn=>(frames.set(++next,fn),next),caf:id=>frames.delete(id),now:()=>time});
  function settle(){ for(let i=0;i<180&&frames.size;i++){time+=16;const batch=[...frames.values()];frames.clear();batch.forEach(fn=>fn(time));} }
  const toolbar=parent.children[0], toggle=toolbar.children[1], modeButtons=toggle.children.slice(1);
  return {parent,gallery,extra,root,document,frames,observers,events,written,refresh,settle,modeButtons,
    cards:()=>gallery.querySelectorAll(),nav:()=>parent.children[parent.children.indexOf(gallery)+1],selected:()=>selected};
}
test('default keeps native options; stack previews every filtered ID and original click selects it',()=>{
  const ui=fixture(); const original=ui.cards();
  assert.equal(ui.gallery.classes.has('is-character-stack'),false);
  assert.deepEqual(original.map(c=>c.getAttribute('aria-hidden')),[null,null,null,null,null,null]);
  ui.modeButtons[1].fire('click');ui.settle();
  assert.equal(ui.gallery.classes.has('is-character-stack'),true);
  for(let i=1;i<6;i++) {
    ui.nav().children[2].fire('click');ui.settle();
    assert.equal(ui.cards().find(c=>!c.inert).dataset.modelId,`id-${i}`);
    assert.equal(ui.selected(),'id-0');
  }
  ui.cards().find(c=>!c.inert).fire('click');ui.settle();
  assert.equal(ui.selected(),'id-5'); assert.equal(ui.cards().find(c=>!c.inert).dataset.modelId,'id-5');
  ui.modeButtons[0].fire('click');
  assert.equal(ui.gallery.classes.has('is-character-stack'),false);
  for(const card of ui.cards()) { assert.equal(card.inert,false);assert.equal(card.getAttribute('aria-hidden'),null);assert.equal(card.getAttribute('tabindex'),null);assert.equal(card.style.transform,undefined); }
  assert.deepEqual(ui.written.at(-1),['postprep-character-view','default']);
});
test('filter rerender, trained roles, empty results and second UI restore safely',()=>{
  const ui=fixture({stored:'stack',trained:true});ui.settle();
  assert.equal(ui.extra.classes.has('is-character-stack'),true);
  const keep=ui.cards()[4]; ui.gallery.children[0].children=[keep]; ui.observers.forEach(fn=>fn());ui.settle();
  assert.equal(keep.inert,false);assert.equal(ui.nav().children[0].disabled,true);
  ui.root.dataset.ui='glass';ui.refresh();
  assert.equal(ui.frames.size,0);assert.equal(keep.inert,false);assert.equal(keep.getAttribute('aria-hidden'),null);
  assert.equal(ui.parent.children[0].hidden,true);assert.equal(ui.nav().hidden,true);
  ui.root.dataset.ui='classic';ui.refresh();ui.settle();
  ui.gallery.children=[];ui.observers.forEach(fn=>fn());ui.settle();
  assert.equal(ui.nav().hidden,true); assert.equal(ui.cards().length,0);
});
test('keyboard and dragging browse without hijacking taps or vertical scrolling',()=>{
  const ui=fixture({stored:'stack'});ui.settle(); let prevented=false;
  ui.gallery.fire('keydown',{key:'End',preventDefault(){prevented=true;}});ui.settle();
  assert.equal(prevented,true);assert.equal(ui.cards().find(c=>!c.inert).dataset.modelId,'id-5');
  ui.gallery.fire('pointerdown',{pointerId:1,clientX:100,clientY:100});
  ui.gallery.fire('pointermove',{pointerId:1,clientX:101,clientY:130});
  ui.gallery.fire('pointerup',{pointerId:1,clientX:101,clientY:130});
  assert.equal(ui.gallery.dataset.dragging,undefined);
  ui.gallery.fire('pointerdown',{pointerId:2,clientX:100,clientY:100});
  ui.gallery.fire('pointermove',{pointerId:2,clientX:30,clientY:102});
  ui.gallery.fire('pointerup',{pointerId:2,clientX:30,clientY:102});ui.settle();
  assert.equal(ui.cards().find(c=>!c.inert).dataset.modelId,'id-0');
  let stopped=false;
  ui.gallery.fire('click',{preventDefault(){},stopImmediatePropagation(){stopped=true;}});assert.equal(stopped,true);
  stopped=false;ui.gallery.fire('click',{preventDefault(){},stopImmediatePropagation(){stopped=true;}});assert.equal(stopped,false);
  ui.nav().children[2].fire('click');assert.ok(ui.frames.size > 0);
  ui.document.hidden=true;ui.events.visibilitychange();assert.equal(ui.frames.size,0);
  ui.document.hidden=false;ui.events.visibilitychange();ui.settle();
  ui.root.dataset.ui='glass';ui.refresh();assert.equal(ui.frames.size,0);
});
test('blocked preference storage does not disable either presentation mode',()=>{
  const ui=fixture({brokenStorage:true});ui.modeButtons[1].fire('click');ui.settle();
  assert.equal(ui.gallery.classes.has('is-character-stack'),true);
});
