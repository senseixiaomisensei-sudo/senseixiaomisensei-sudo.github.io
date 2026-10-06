import test from 'node:test';
import assert from 'node:assert/strict';
import {initChorus,readChorusTracks,fetchChorusJson,chorusSuggestedParams,publishChorusResult,chorusAgreementWarning} from '../assets/rvc-chorus.js';
import {chorusRoleMatches,createChorusRolePicker} from '../assets/rvc-chorus-picker.js';

// Controller contracts, not a substitute for browser rendering or real audio.
class Node {
  constructor(tag='div'){this.tag=tag;this.children=[];this.events={};this.attrs={};this.hidden=false;this.disabled=false;}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(){this.children=[];}
  setAttribute(key,value){this.attrs[key]=String(value);}
  removeAttribute(key){delete this.attrs[key];}
  addEventListener(name,handler){(this.events[name]??=[]).push(handler);}
  async fire(name,extra={}){for(const handler of this.events[name]||[])await handler({target:this,preventDefault(){},...extra});}
  querySelectorAll(selector){const tags=selector.split(',');return this.children.flatMap(n=>[...(tags.includes(n.tag)?[n]:[]),...n.querySelectorAll(selector)]);}
  pause(){this.paused=true;}
  load(){}
  scrollIntoView(){this.revealed=true;}
  focus(){this.focused=true;}
  contains(node){return this===node||this.children.some(child=>child.contains(node));}
}
function completed(count=2){return {jobId:'analysis',downloadToken:'token',state:'completed',requestedCount:'auto',estimatedCount:count,
  expiresAt:'2026-10-04T20:00:00Z',tracks:Array.from({length:count},(_,i)=>({trackId:i+1}))};}
async function fixture(run,{count=2}={}){
  const previous=globalThis.document;
  const panel=new Node(),tracks=new Node(),nodes={};
  for(const key of ['enable','analyze','update','convert','resume','status','workspace','count','kind']){nodes[key]=new Node(key==='count'||key==='kind'?'select':key==='enable'?'input':'button');panel.append(nodes[key]);}
  nodes.count.value='auto';nodes.kind.value='mix';nodes.tracks=tracks;panel.append(tracks);
  panel.querySelector=selector=>nodes[selector.slice(6,-1)];
  globalThis.document={documentElement:{lang:'zh'},getElementById:id=>id==='rvc-chorus'?panel:null,createElement:tag=>new Node(tag),querySelectorAll:selector=>panel.querySelectorAll(selector)};
  const state={busy:false,inferenceMode:'local',audioMode:'voice',selectedModelId:'hoshino',catalog:[{id:'hoshino',name:'星野',nameEn:'Hoshino'},{id:'arona',name:'阿罗娜',nameEn:'Arona'}]};
  const calls=[],results=[];let pollFailure=false,controller;
  controller=initChorus({state,getEndpoint:()=>'/rvc-api',wait:async()=>{},loadVoiceRanges:async()=>({profiles:{}}),setBusy:value=>{state.busy=value;},
    setMode:()=>{state.inferenceMode='official';controller.refresh();state.audioMode='song';controller.refresh();},
    request:async(url,options={})=>{
      calls.push({url,options});
      if(options.method==='POST')return {jobId:url.endsWith('/analyze')?'analysis':'converted',downloadToken:'token'};
      if(pollFailure)throw Object.assign(new Error('network'),{retryable:true});
      return url.includes('/converted?')?{...completed(count),jobId:'converted',format:'mp3'}:completed(count);
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
  const trigger=first.querySelectorAll('button').find(node=>node.className==='chorus-role-trigger');await trigger.fire('click');
  await first.querySelectorAll('button').find(node=>node.attrs['data-model-id']==='arona').fire('click');
  const pitch=first.querySelectorAll('input').find(node=>node.type==='range');pitch.value='5';await pitch.fire('input');
  assert.equal(second.querySelectorAll('input').find(node=>node.type==='range').value,0);
  await ui.nodes.convert.fire('click');
  const sent=JSON.parse(ui.calls.find(call=>call.url.includes('/convert?')).options.body);
  assert.equal(sent.tracks[0].modelId,'arona');assert.equal(sent.tracks[0].pitch,5);assert.equal(sent.tracks[1].pitch,0);
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
  assert.throws(()=>readChorusTracks({tracks:[{trackId:1,sourceSha256:'same'},{trackId:2,sourceSha256:'same'}]}),/重复声部/);
});

test('disagreeing estimates explicitly remain unresolved in both languages',()=>{
  const previous=globalThis.document;
  const job={countConfirmation:{sourceAgreement:{consistent:false}}};
  try{
    globalThis.document={documentElement:{lang:'zh'}};
    assert.match(chorusAgreementWarning(job),/未可靠拆开.*不能判定原曲只有一人/);
    globalThis.document.documentElement.lang='en';
    assert.match(chorusAgreementWarning(job),/Separation is unresolved.*does not mean there is only one singer/);
    assert.equal(chorusAgreementWarning({countConfirmation:{sourceAgreement:{consistent:true}}}),'');
  }finally{globalThis.document=previous;}
});

test('language changes keep auditions, selection and manually tuned parameters intact',async()=>fixture(async ui=>{
  ui.state.audio={file:new File(['source'],'duet.mp3')};await ui.nodes.analyze.fire('click');
  const card=ui.tracks.children[0],audio=card.querySelectorAll('audio')[0],pitch=card.querySelectorAll('input').find(node=>node.type==='range');
  const src=audio.src;pitch.value='3';await pitch.fire('input');
  globalThis.document.documentElement.lang='en';ui.controller.refreshLanguage();
  assert.equal(ui.tracks.children[0],card);assert.equal(card.querySelectorAll('audio')[0],audio);assert.equal(audio.src,src);
  assert.equal(pitch.value,'3');assert.equal(card.querySelectorAll('strong')[0].textContent,'Hoshino');
  assert.match(ui.nodes.status.textContent,/Separation complete/);assert.equal(ui.nodes.convert.textContent,'Confirm voices and convert');
  await ui.nodes.convert.fire('click');
  const sent=JSON.parse(ui.calls.find(call=>call.url.includes('/convert?')).options.body);
  assert.equal(sent.tracks[0].pitch,3);assert.equal(sent.tracks[0].modelId,'hoshino');
}));

test('range suggestions avoid forcing every singer up an octave and preserve model retrieval defaults',()=>{
  const track={trackId:1,voiceRange:{medianHz:125,classification:'low',confidence:.9}};
  assert.equal(chorusSuggestedParams(track,{id:'hoshino',tags:['女声'],defaultIndexRate:.35}).pitch,12);
  assert.equal(chorusSuggestedParams(track,{id:'male',tags:['男声']}).pitch,0);
  assert.equal(chorusSuggestedParams({trackId:1,voiceRange:{medianHz:280,classification:'high',confidence:.9}},{id:'male',tags:['男声']}).pitch,-11);
  assert.equal(chorusSuggestedParams({trackId:1},{id:'hoshino',tags:['女声']}).pitch,0);
  assert.equal(chorusSuggestedParams(track,{id:'hoshino',defaultIndexRate:.35}).indexRate,.35);
  assert.equal(readChorusTracks(completed(1)).length,1);
});
test('reference pitch comparison requires matching resource identity, uses bounded transposition, and leaves uncertain input alone',()=>{
  const model={id:'hoshino',checkpointSha256:'a'.repeat(64),tags:['女声']};
  const reference={characterId:'hoshino',checkpointSha256:model.checkpointSha256,referenceSha256:'b'.repeat(64),medianHz:300,confidence:.9};
  const track={trackId:1,voiceRange:{medianHz:190,classification:'middle',confidence:.9}};
  assert.equal(chorusSuggestedParams(track,model,reference).pitch,8);
  assert.equal(chorusSuggestedParams({...track,voiceRange:{...track.voiceRange,medianHz:260}},model,reference).pitch,2);
  assert.equal(chorusSuggestedParams(track,model,{...reference,checkpointSha256:'c'.repeat(64)}).pitch,0);
  assert.equal(chorusSuggestedParams({...track,voiceRange:{...track.voiceRange,confidence:.2}},model,reference).pitch,0);
});
test('single-person analysis exposes one usable card and manually tuned pitch survives role changes',async()=>fixture(async ui=>{
  ui.state.audio={file:new File(['source'],'solo.mp3')};await ui.nodes.analyze.fire('click');
  assert.equal(ui.tracks.children.length,1);assert.equal(ui.nodes.convert.disabled,false);
  const card=ui.tracks.children[0],pitch=card.querySelectorAll('input').find(node=>node.type==='range');
  pitch.value='3';await pitch.fire('input');await card.querySelectorAll('button').find(node=>node.className==='chorus-role-trigger').fire('click');
  await card.querySelectorAll('button').find(node=>node.attrs['data-model-id']==='arona').fire('click');
  assert.equal(pitch.value,'3');
  await ui.nodes.convert.fire('click');
  assert.equal(JSON.parse(ui.calls.find(c=>c.url.includes('/convert?')).options.body).tracks[0].pitch,3);
  assert.equal(ui.results[0].job.estimatedCount,1);
},{count:1}));
test('completed result and download are visible before metadata resolves, and remain available on playback failure',async()=>{
  const audio={hidden:true},result={hidden:true,classList:{remove(){}},scrollIntoView(){this.revealed=true;}},download={},meta={};
  let fail;
  const done=publishChorusResult({audio,result,download,meta},'/actual.mp3',{jobId:'actual',estimatedCount:2,format:'mp3'},
    ()=>new Promise((resolve,reject)=>{fail=reject;}));
  assert.equal(result.hidden,false);assert.equal(audio.hidden,false);assert.equal(result.revealed,true);
  assert.equal(download.href,'/actual.mp3');assert.match(download.download,/actual\.mp3$/);
  fail(new Error('metadata failed'));await done;
  assert.equal(result.hidden,false);assert.match(meta.textContent,/可直接下载结果/);
});
test('Safari-compatible JSON request handles non-JSON errors and enforces timeout',async()=>{
  let signal;
  const result=await fetchChorusJson('/job',{},async(url,options)=>{signal=options.signal;return Response.json({state:'completed'});});
  assert.equal(result.state,'completed');assert.equal(signal.aborted,false);
  await assert.rejects(fetchChorusJson('/job',{},async()=>new Response('<html>bad gateway</html>',{status:502})),/未返回任务状态/);
  await assert.rejects(fetchChorusJson('/job',{},async(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('timeout')))),5),/timeout/);
});

test('chorus role search matches Chinese, English, school and aliases without fuzzy identity guesses',()=>{
  const model={id:'hoshino',name:'小鸟游星野 (Hoshino)',avatarText:'星野',tags:['阿拜多斯']};
  assert.equal(chorusRoleMatches(model,'星野'),true);assert.equal(chorusRoleMatches(model,'HOSHINO'),true);
  assert.equal(chorusRoleMatches(model,'阿拜多斯 星野'),true);assert.equal(chorusRoleMatches(model,'ホシノ',['ホシノ']),true);
  assert.equal(chorusRoleMatches(model,'阿罗娜'),false);
});
test('search and empty results preserve each voice selection and manual pitch; keyboard selection is sent to conversion',async()=>fixture(async ui=>{
  ui.state.audio={file:new File(['source'],'duet.mp3')};await ui.nodes.analyze.fire('click');
  const [first,second]=ui.tracks.children,pitch=first.querySelectorAll('input').find(node=>node.type==='range');
  pitch.value='4';await pitch.fire('input');
  await first.querySelectorAll('button').find(node=>node.className==='chorus-role-trigger').fire('click');
  const search=first.querySelectorAll('input').find(node=>node.type==='search');
  search.value='不存在的角色';await search.fire('input');
  assert.equal(first.querySelectorAll('button').filter(node=>node.attrs.role==='option').length,0);
  assert.equal(first.querySelectorAll('strong')[0].textContent,'星野');
  search.value='阿罗娜';await search.fire('input');await search.fire('keydown',{key:'Enter'});
  assert.equal(first.querySelectorAll('strong')[0].textContent,'阿罗娜');assert.equal(second.querySelectorAll('strong')[0].textContent,'星野');
  assert.equal(pitch.value,'4');assert.equal(search.attrs['aria-expanded'],'false');
  await ui.nodes.convert.fire('click');
  const sent=JSON.parse(ui.calls.find(call=>call.url.includes('/convert?')).options.body);
  assert.equal(sent.tracks[0].modelId,'arona');assert.equal(sent.tracks[0].pitch,4);assert.equal(sent.tracks[1].modelId,'hoshino');
  assert.equal(ui.tracks.querySelectorAll('audio').length,4);
}));
test('picker Escape and IME keep selection; own uploaded models are excluded; keyboard arrows work',()=>{
  const previous=globalThis.document;globalThis.document={createElement:tag=>new Node(tag)};
  try{
    const changed=[],picker=createChorusRolePicker({trackId:4,modelId:'hoshino',catalog:[{id:'hoshino',name:'星野'},{id:'arona',name:'阿罗娜'},{id:'own:custom',name:'私人上传'}],onChange:id=>changed.push(id)});
    const trigger=picker.element.querySelectorAll('button')[0],search=picker.element.querySelectorAll('input')[0];
    trigger.fire('click');assert.equal(picker.element.querySelectorAll('button').filter(node=>node.attrs.role==='option').length,2);
    search.fire('keydown',{key:'Enter',isComposing:true});assert.deepEqual(changed,[]);
    search.fire('keydown',{key:'Escape'});assert.equal(picker.value,'hoshino');assert.equal(trigger.attrs['aria-expanded'],'false');
    trigger.fire('click');search.fire('keydown',{key:'ArrowDown'});search.fire('keydown',{key:'Enter'});
    assert.deepEqual(changed,['arona']);assert.equal(picker.value,'arona');
  }finally{globalThis.document=previous;}
});
