import assert from 'node:assert/strict';
import test from 'node:test';
import { initCharacterModes } from '../assets/classic-glass/characters.js';

// DOM contract fixture only; no claim of browser rendering or touch acceptance.
class Node {
  constructor(tag='div') {
    this.tag=tag; this.children=[]; this.dataset={}; this.attrs=new Map(); this.events={}; this.inert=false;
    this.classes=new Set(); this.classList={add:x=>this.classes.add(x),remove:x=>this.classes.delete(x),contains:x=>this.classes.has(x)};
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
  releasePointerCapture() {}
}
function fixture({stored='default', trained=false, brokenStorage=false, reduced=false, Resize,count=6}={}) {
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
  populate(gallery,count); if(extra) populate(extra,2);
  const document={hidden:false,documentElement:{clientHeight:600},getElementById:id=>id==='rvc-model-gallery'?gallery:id==='rvc-trained-model-gallery'?extra:null,createElement:tag=>new Node(tag),addEventListener:(name,fn)=>{events[name]=fn;}};
  const refresh=initCharacterModes({root,document,isClassic:()=>root.dataset.ui==='classic',text:zh=>zh,reduced:{matches:reduced},
    Resize,
    storage:{getItem(){if(brokenStorage)throw Error('blocked');return stored;},setItem(k,v){written.push([k,v]);if(brokenStorage)throw Error('blocked');}},
    Observer:class{constructor(fn){observers.push(fn);}observe(){}},raf:fn=>(frames.set(++next,fn),next),caf:id=>frames.delete(id),now:()=>time});
  function tick(){time+=16;const batch=[...frames.values()];frames.clear();batch.forEach(fn=>fn(time));}
  function settle(){for(let i=0;i<180&&frames.size;i++)tick();}
  const toolbar=parent.children[0], toggle=toolbar.children[1], modeButtons=toggle.children.slice(1);
  return {parent,gallery,extra,root,document,frames,observers,events,written,refresh,settle,tick,modeButtons,
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
test('keyboard and short horizontal/vertical drags browse without selecting a role',()=>{
  const ui=fixture({stored:'stack'});ui.settle(); let prevented=false;
  ui.gallery.fire('keydown',{key:'End',preventDefault(){prevented=true;}});ui.settle();
  assert.equal(prevented,true);assert.equal(ui.cards().find(c=>!c.inert).dataset.modelId,'id-5');
  ui.gallery.fire('pointerdown',{pointerId:1,clientX:100,clientY:100});
  ui.gallery.fire('pointermove',{pointerId:1,clientX:101,clientY:130});
  ui.gallery.fire('pointerup',{pointerId:1,clientX:101,clientY:130});
  ui.settle();assert.equal(ui.gallery.dataset.dragging,undefined);
  assert.equal(ui.cards().find(c=>!c.inert).dataset.modelId,'id-4');
  ui.gallery.fire('pointerdown',{pointerId:2,clientX:100,clientY:100});
  ui.gallery.fire('pointermove',{pointerId:2,clientX:30,clientY:102});
  ui.gallery.fire('pointerup',{pointerId:2,clientX:30,clientY:102});ui.settle();
  assert.equal(ui.cards().find(c=>!c.inert).dataset.modelId,'id-5');
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

const pointer=(id,x,y)=>({pointerId:id,clientX:x,clientY:y,pointerType:'touch'});
test('held finger anchor survives page movement during a continuous drag',()=>{
  const ui=fixture({stored:'stack'});let top=200;
  ui.gallery.getBoundingClientRect=()=>({left:0,top,width:332,height:246});ui.settle();
  ui.gallery.fire('pointerdown',pointer(1,100,250));ui.gallery.fire('pointermove',pointer(1,140,250));
  const card=ui.cards()[0],before=card.style.transform;
  top=170;ui.gallery.fire('pointermove',pointer(1,140,250));ui.tick();
  assert.notEqual(card.style.transform,before);assert.match(card.style.transform,/translate3d\(56px,40px/);
  ui.gallery.fire('pointercancel',pointer(1,140,250));ui.settle();assert.equal(card.dataset.stackHeld,undefined);
});
test('held card follows each event immediately; large pulls in all four directions expand before release',()=>{
  for(const [x,y,layout] of [[100,-110,'vertical'],[100,310,'vertical'],[-110,100,'horizontal'],[310,100,'horizontal']]){
    const ui=fixture({stored:'stack'});ui.settle();const original=ui.cards(),card=original[0];
    const start=card.style.transform;
    ui.gallery.fire('pointerdown',pointer(1,100,100));ui.gallery.fire('pointermove',pointer(1,x,y));
    assert.equal(ui.gallery.dataset.stackLayout,layout);
    assert.equal(ui.gallery.dataset.dragging,'true');assert.equal(card.dataset.stackHeld,'true');
    assert.notEqual(card.style.transform,start);assert.doesNotMatch(card.style.transform,/scale/);
    assert.deepEqual(ui.cards(),original); // No card replacement during any gesture.
    ui.gallery.fire('pointerup',pointer(1,x,y));ui.settle();
    assert.equal(ui.gallery.dataset.stackLayout,layout);assert.equal(ui.cards().filter(c=>!c.inert).length,6);
    assert.equal(ui.selected(),'id-0');
  }
});

test('same gesture switches axis with hysteresis and pulls back into the original deck',()=>{
  const ui=fixture({stored:'stack'});ui.settle();
  ui.gallery.fire('pointerdown',pointer(1,100,240));ui.gallery.fire('pointermove',pointer(1,100,30));
  assert.equal(ui.gallery.dataset.stackLayout,'vertical');
  ui.gallery.fire('pointermove',pointer(1,300,50)); // Nearly diagonal; retain vertical.
  assert.equal(ui.gallery.dataset.stackLayout,'vertical');
  ui.gallery.fire('pointermove',pointer(1,390,140));assert.equal(ui.gallery.dataset.stackLayout,'horizontal');
  ui.gallery.fire('pointermove',pointer(1,120,235));assert.equal(ui.gallery.dataset.stackLayout,'stack');
  ui.gallery.fire('pointerup',pointer(1,120,235));ui.settle();
  assert.equal(ui.cards().filter(c=>!c.inert).length,1);assert.equal(ui.selected(),'id-0');
});

test('cancellation, lost capture and a second pointer do not leave a stuck drag or select a role',()=>{
  for(const action of ['pointercancel','lostpointercapture']){
    const ui=fixture({stored:'stack'});ui.settle();
    ui.gallery.fire('pointerdown',pointer(1,100,100));ui.gallery.fire('pointermove',pointer(1,280,100));
    ui.gallery.fire('pointerdown',pointer(2,100,100));ui.gallery.fire('pointermove',pointer(2,100,-100));
    assert.equal(ui.gallery.dataset.stackLayout,'horizontal');
    ui.gallery.fire(action,pointer(1,280,100));ui.settle();
    assert.equal(ui.gallery.dataset.stackLayout,'stack');assert.equal(ui.gallery.dataset.dragging,undefined);
    assert.ok(ui.cards().every(c=>c.dataset.stackHeld===undefined));
    ui.gallery.fire('pointerdown',pointer(3,100,100));ui.gallery.fire('pointermove',pointer(3,100,-100));
    assert.equal(ui.gallery.dataset.stackLayout,'vertical');assert.equal(ui.selected(),'id-0');
  }
});

test('layout changes preserve a reordered identity, original selection and actual position count',()=>{
  const ui=fixture({stored:'stack'});ui.settle();
  ui.gallery.fire('keydown',{key:'End',preventDefault(){}});ui.settle();
  ui.nav().children[3].children[1].fire('click');ui.settle();
  assert.match(ui.nav().children[1].textContent,/^1 \/ 6/);assert.equal(ui.selected(),'id-0');
  const chosen=ui.cards()[5];ui.gallery.fire('pointerdown',{...pointer(1,100,100),target:{closest:()=>chosen}});
  ui.gallery.fire('pointerup',pointer(1,100,100));assert.equal(ui.gallery.dataset.stackLayout,'horizontal');
  chosen.fire('click');ui.settle();assert.equal(ui.selected(),'id-5');assert.equal(ui.gallery.dataset.stackLayout,'horizontal');
  ui.gallery.scrollLeft=318;ui.gallery.fire('scroll');assert.match(ui.nav().children[1].textContent,/^2 \/ 6/);
  ui.nav().children[3].children[2].fire('click');ui.settle();
  ui.cards().forEach((card,i)=>card.getBoundingClientRect=()=>({top:(i-3)*200+120,bottom:(i-3)*200+304,height:184}));
  ui.events.scroll();assert.match(ui.nav().children[1].textContent,/^5 \/ 6/); // ID 3 follows ID 5 in this order.
});

test('interrupted collapse reserves current card bounds and a new grab continues from its visible position',()=>{
  const ui=fixture({stored:'stack'});ui.settle();
  ui.nav().children[3].children[2].fire('click');ui.settle();
  ui.nav().children[3].children[0].fire('click');ui.tick();
  assert.ok(parseFloat(ui.gallery.style.height)>1000); // It must not jump straight to 246px.
  const before=ui.cards()[0].style.transform;
  ui.gallery.fire('pointerdown',pointer(1,100,100));assert.equal(ui.cards()[0].style.transform,before);
  ui.gallery.fire('pointermove',pointer(1,130,100));
  assert.equal(ui.cards()[0].dataset.stackHeld,'true');assert.notEqual(ui.cards()[0].style.transform,before);
  ui.gallery.fire('pointercancel',pointer(1,130,100));ui.settle();assert.equal(ui.frames.size,0);
});

test('reduced motion retains button and drag operations; leaving first UI clears all layout styles',()=>{
  const ui=fixture({stored:'stack',reduced:true});ui.settle();
  ui.nav().children[3].children[1].fire('click');ui.settle();assert.equal(ui.gallery.dataset.stackLayout,'horizontal');
  ui.gallery.fire('keydown',{key:'Escape',preventDefault(){}});ui.settle();
  ui.gallery.fire('pointerdown',pointer(1,100,100));ui.gallery.fire('pointermove',pointer(1,100,-100));
  ui.gallery.fire('pointerup',pointer(1,100,-100));ui.settle();assert.equal(ui.gallery.dataset.stackLayout,'vertical');
  ui.root.dataset.ui='glass';ui.refresh();assert.equal(ui.frames.size,0);assert.equal(ui.gallery.style.height,undefined);
  assert.equal(ui.gallery.dataset.stackLayout,undefined);assert.ok(ui.cards().every(c=>c.style.width===undefined&&!c.inert));
});

test('a drop onto another expanded card re-stacks around it without changing the chosen voice',()=>{
  const ui=fixture({stored:'stack'});ui.settle();ui.nav().children[3].children[1].fire('click');ui.settle();
  const target=ui.cards()[2];target.getBoundingClientRect=()=>({left:200,right:400,top:100,bottom:300});
  ui.gallery.fire('pointerdown',pointer(1,100,100));ui.gallery.fire('pointermove',pointer(1,280,150));
  ui.gallery.fire('pointerup',pointer(1,280,150));ui.settle();
  assert.equal(ui.gallery.dataset.stackLayout,'stack');assert.equal(ui.cards().find(c=>!c.inert),target);
  assert.equal(ui.selected(),'id-0');
});

test('self-driven height changes do not cancel a held card; actual width changes cancel safely',()=>{
  let resize;const ui=fixture({stored:'stack',Resize:class{constructor(fn){resize=fn;}observe(){}}});ui.settle();
  ui.gallery.getBoundingClientRect=()=>({width:332,height:500});
  ui.gallery.fire('pointerdown',pointer(1,100,100));ui.gallery.fire('pointermove',pointer(1,280,100));
  resize();assert.equal(ui.gallery.dataset.dragging,'true');
  ui.gallery.getBoundingClientRect=()=>({width:280,height:500});resize();ui.settle();
  assert.equal(ui.gallery.dataset.dragging,undefined);assert.equal(ui.gallery.dataset.stackLayout,'stack');
  assert.equal(ui.cards()[0].style.width,'248px');
});

test('small mouse/touch swipes browse; medium pulls stay stacked and never rewrite hidden cards',()=>{
  for(const pointerType of ['mouse','touch']){
    const ui=fixture({stored:'stack',count:100});ui.settle();let hiddenWrites=0,geometryReads=0,accessWrites=0;
    ui.gallery.getBoundingClientRect=()=>{geometryReads++;return {left:0,top:0,width:332,height:246};};
    for(const card of ui.cards().slice(5))card.style=new Proxy(card.style,{set(target,key,value){hiddenWrites++;target[key]=value;return true;}});
    for(const card of ui.cards()){const original=card.setAttribute.bind(card);card.setAttribute=(k,v)=>{accessWrites++;original(k,v);};}
    const card=ui.cards()[0];ui.gallery.fire('pointerdown',{...pointer(1,100,100),pointerType});
    const baseline=accessWrites,reads=geometryReads;
    for(const distance of [4,8,16,24,60,110])ui.gallery.fire('pointermove',{...pointer(1,100+distance,100),pointerType});
    assert.equal(ui.gallery.dataset.stackLayout,'stack');assert.match(card.style.transform,/translate3d\(126px,10px/);
    assert.equal(geometryReads,reads);assert.equal(accessWrites,baseline);ui.tick();
    assert.equal(geometryReads,reads+1);assert.equal(hiddenWrites,0);
    ui.gallery.fire('pointerup',pointer(1,210,100));ui.settle();
    assert.equal(ui.cards().find(c=>!c.inert).dataset.modelId,'id-99');assert.equal(ui.frames.size,0);
    // A short slide in the opposite direction immediately returns to the next card.
    ui.gallery.fire('pointerdown',pointer(2,100,100));ui.gallery.fire('pointermove',pointer(2,76,100));
    ui.gallery.fire('pointerup',pointer(2,76,100));ui.settle();assert.equal(ui.cards().find(c=>!c.inert).dataset.modelId,'id-0');
  }
});
