import test from 'node:test';
import assert from 'node:assert/strict';
import {initChorus,readChorusTracks,fetchChorusJson} from '../assets/rvc-chorus.js';

// Controller contracts, not a substitute for browser rendering or real audio.
class Node {
  constructor(tag='div'){this.tag=tag;this.children=[];this.events={};this.attrs={};this.hidden=false;this.disabled=false;}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(){this.children=[];}
  setAttribute(key,value){this.attrs[key]=String(value);}
  removeAttribute(key){delete this.attrs[key];}
  addEventListener(name,handler){(this.events[name]??=[]).push(handler);}
  async fire(name){for(const handler of this.events[name]||[])await handler({target:this});}
  querySelectorAll(selector){const tags=selector.split(',');return this.children.flatMap(n=>[...(tags.includes(n.tag)?[n]:[]),...n.querySelectorAll(selector)]);}
  pause(){this.paused=true;}
  load(){}
  scrollIntoView(){this.revealed=true;}
}
function completed(count=2){return {jobId:'analysis',downloadToken:'token',state:'completed',requestedCount:'auto',estimatedCount:count,
  expiresAt:'2026-10-04T20:00:00Z',tracks:Array.from({length:count},(_,i)=>({trackId:i+1}))};}
async function fixture(run){
  const previous=globalThis.document;
  const panel=new Node(),tracks=new Node(),nodes={};
  for(const key of ['enable','analyze','update','convert','resume','status','workspace','count','kind']){nodes[key]=new Node(key==='count'||key==='kind'?'select':key==='enable'?'input':'button');panel.append(nodes[key]);}
  nodes.count.value='auto';nodes.kind.value='mix';nodes.tracks=tracks;panel.append(tracks);
  panel.querySelector=selector=>nodes[selector.slice(6,-1)];
  globalThis.document={getElementById:id=>id==='rvc-chorus'?panel:null,createElement:tag=>new Node(tag),querySelectorAll:selector=>panel.querySelectorAll(selector)};
  const state={busy:false,inferenceMode:'local',audioMode:'voice',selectedModelId:'hoshino',catalog:[{id:'hoshino',name:'星野'},{id:'arona',name:'阿罗娜'}]};
  const calls=[],results=[];let pollFailure=false,controller;
  controller=initChorus({state,getEndpoint:()=>'/rvc-api',wait:async()=>{},setBusy:value=>{state.busy=value;},
    setMode:()=>{state.inferenceMode='official';controller.refresh();state.audioMode='song';controller.refresh();},
    request:async(url,options={})=>{
      calls.push({url,options});
      if(options.method==='POST')return {jobId:url.endsWith('/analyze')?'analysis':'converted',downloadToken:'token'};
      if(pollFailure)throw Object.assign(new Error('network'),{retryable:true});
      return url.includes('/converted?')?{...completed(),jobId:'converted',format:'mp3'}:completed();
    },onResult:async(url,job)=>results.push({url,job})});
  try{await run({state,nodes,tracks,panel,controller,calls,results,setFailure:value=>{pollFailure=value;}});}finally{globalThis.document=previous;}
}
test('enabling chorus survives intermediate mode refresh; audio ready enables analysis',async()=>fixture(async ui=>{
  assert.equal(ui.nodes.analyze.disabled,true);
  ui.nodes.enable.checked=true;await ui.nodes.enable.fire('change');
  assert.equal(ui.nodes.enable.checked,true);assert.equal(ui.nodes.workspace.hidden,false);
  ui.state.audio={file:new File(['source'],'duet.mp3')};ui.controller.refresh();
  assert.equal(ui.nodes.analyze.disabled,false);assert.equal(ui.nodes.convert.disabled,true);
}));
test('successful analysis displays one original audition and independent controls per returned voice',async()=>fixture(async ui=>{
  ui.state.audio={file:new File(['source'],'duet.mp3')};await ui.nodes.analyze.fire('click');
  assert.equal(ui.tracks.children.length,2);assert.equal(ui.nodes.convert.disabled,false);
  assert.match(ui.nodes.status.textContent,/分离完成.*2 张声部卡片/);
  for(const [i,card] of ui.tracks.children.entries()){
    const audio=card.querySelectorAll('audio')[0];assert.equal(audio.preload,'none');
    assert.match(audio.src,new RegExp(`/analysis/stem/${i+1}\\?`));
  }
  const first=ui.tracks.children[0],second=ui.tracks.children[1];
  const role=first.querySelectorAll('select')[0];role.value='arona';await role.fire('change');
  const pitch=first.querySelectorAll('input')[0];pitch.value='5';await pitch.fire('input');
  assert.equal(second.querySelectorAll('input')[0].value,12);
  await ui.nodes.convert.fire('click');
  const sent=JSON.parse(ui.calls.find(call=>call.url.includes('/convert?')).options.body);
  assert.equal(sent.tracks[0].modelId,'arona');assert.equal(sent.tracks[0].pitch,5);assert.equal(sent.tracks[1].pitch,12);
  assert.equal(ui.results[0].url,'/rvc-api/output/converted?token=token');
  assert.equal(ui.tracks.querySelectorAll('audio').length,4);
  assert.match(ui.tracks.children[0].querySelectorAll('audio')[0].src,/analysis\/stem/);
  assert.match(ui.tracks.children[0].querySelectorAll('audio')[1].src,/converted\/stem/);
}));
test('interrupted accepted analysis resumes the same job without another upload',async()=>fixture(async ui=>{
  ui.state.audio={file:new File(['source'],'duet.mp3')};ui.setFailure(true);
  await ui.nodes.analyze.fire('click');assert.equal(ui.nodes.resume.hidden,false);
  assert.match(ui.nodes.status.textContent,/识别未完成/);assert.equal(ui.nodes.convert.disabled,true);
  ui.setFailure(false);await ui.nodes.resume.fire('click');
  assert.equal(ui.calls.filter(c=>c.options.method==='POST').length,1);
  assert.equal(ui.tracks.children.length,2);assert.equal(ui.nodes.resume.hidden,true);
}));
test('only valid returned track identities, up to four, constitute analysis success',()=>{
  assert.equal(readChorusTracks(completed(4)).length,4);
  for(const job of [{},completed(0),completed(5),{tracks:[{trackId:2}]}])assert.throws(()=>readChorusTracks(job),/没有返回有效声部/);
});
test('Safari-compatible JSON request handles non-JSON errors and enforces timeout',async()=>{
  let signal;
  const result=await fetchChorusJson('/job',{},async(url,options)=>{signal=options.signal;return Response.json({state:'completed'});});
  assert.equal(result.state,'completed');assert.equal(signal.aborted,false);
  await assert.rejects(fetchChorusJson('/job',{},async()=>new Response('<html>bad gateway</html>',{status:502})),/未返回任务状态/);
  await assert.rejects(fetchChorusJson('/job',{},async(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('timeout')))),5),/timeout/);
});
