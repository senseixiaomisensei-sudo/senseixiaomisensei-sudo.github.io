import test from 'node:test';
import assert from 'node:assert/strict';
import {suggestVoiceParameters} from '../assets/rvc-auto-parameters.js';
import {initRegularAutoParameters} from '../assets/rvc-auto-tune.js';
import gateway from '../worker/api-gateway.js';
const model={id:'hoshino',checkpointSha256:'a'.repeat(64),tags:['女声'],defaultIndexRate:.35};
const reference={characterId:'hoshino',checkpointSha256:model.checkpointSha256,referenceSha256:'b'.repeat(64),medianHz:300,confidence:.9};
test('wide-register songs preserve their contour instead of raising a low verse and high chorus together',()=>{
  const wide={medianHz:190,p10Hz:90,p90Hz:800,confidence:.9};
  const song=suggestVoiceParameters(wide,model,reference,{audioMode:'song'});
  assert.equal(song.pitch,0);assert.equal(song.pitchPolicy,'wide-song-original-pitch');
  assert.equal(song.f0Method,'auto');assert.equal(song.filterRadius,0);assert.equal(song.indexRate,.25);
  assert.equal(song.registerAdaptation,.6);assert.equal(song.registerPitch,0);
  assert.equal(suggestVoiceParameters(wide,model,reference).pitch,8,'ordinary speech matching remains available');
  const high=suggestVoiceParameters({medianHz:190,p10Hz:180,p90Hz:500,confidence:.9},model,reference,{audioMode:'song'});
  assert.equal(high.pitch,8); // This range still has enough headroom.
  const highReference={...reference,medianHz:900};
  const bounded=suggestVoiceParameters({medianHz:500,p10Hz:450,p90Hz:800,confidence:.9},model,highReference,{audioMode:'song'});
  assert.equal(bounded.pitch,3);assert.ok(800*2**(bounded.pitch/12)<1000);
  const low=suggestVoiceParameters({medianHz:100,p10Hz:60,p90Hz:140,confidence:.9},model,{...reference,medianHz:50},{audioMode:'song'});
  assert.equal(low.pitch,-3);assert.ok(60*2**(low.pitch/12)>50);
});
test('active matching covers larger register gaps without exceeding an octave or trusting stale resources',()=>{
  assert.equal(suggestVoiceParameters({medianHz:125,classification:'low',confidence:.9},model,reference).pitch,12);
  assert.equal(suggestVoiceParameters({medianHz:190,confidence:.9},model,reference).pitch,8);
  assert.equal(suggestVoiceParameters({medianHz:190,confidence:.2},model,reference).pitch,0);
  assert.equal(suggestVoiceParameters({medianHz:190,confidence:.9},model,{...reference,checkpointSha256:'c'.repeat(64)}).pitch,0);
  const complex=suggestVoiceParameters({medianHz:190,p10Hz:90,p90Hz:800,confidence:.9},model,reference);
  assert.equal(complex.f0Method,'auto');assert.equal(complex.indexRate,.25);assert.equal(complex.filterRadius,0);assert.equal(complex.rmsMixRate,1);
  assert.equal(suggestVoiceParameters({medianHz:125,confidence:.9},{...model,indexAvailable:false},reference).indexRate,0);
});

function fixture(request){
  const ids=['rvc-auto-parameters','rvc-auto-parameters-status','rvc-pitch','rvc-index-rate','rvc-protect','rvc-rms-mix','rvc-f0-method','rvc-filter-radius'];
  const nodes=new Map(ids.map(id=>[id,{value:'0',textContent:'',disabled:false,events:{},addEventListener(k,fn){(this.events[k]??=[]).push(fn);},dispatchEvent(e){for(const fn of this.events[e.type]||[])fn(e);},async click(){for(const fn of this.events.click||[])await fn();}}]));
  const before=globalThis.document;globalThis.document={getElementById:id=>nodes.get(id)};
  const state={audio:{file:new File(['test'],'voice.wav')},audioMode:'voice',lang:'en',busy:false};
  let role=model,modern=false;
  const controller=initRegularAutoParameters({state,getEndpoint:()=>'/rvc-api',getModel:()=>role,prepareFile:async x=>x,
    isModernSpeech:()=>modern,createRequestId:()=> 'request-autotune-123',setBusy:x=>{state.busy=x;},request,wait:async()=>{}});
  return {state,nodes,controller,role:m=>{role=m;},modern:x=>{modern=x;},close:()=>{globalThis.document=before;}};
}
const job={jobId:'j',downloadToken:'t',state:'completed',analysisOnly:true,tracks:[{voiceRange:{medianHz:125,classification:'low',confidence:.9}}]};
test('normal auto settings upload once, cache by source and mode, and respect manual edits',async()=>{
  let uploads=0;
  const ui=fixture(async(url,options)=>{if(url.includes('voice-ranges'))return {profiles:{hoshino:reference}};uploads++;assert.equal(options.body.get('analysis_only'),'true');assert.equal(options.body.get('input_kind'),'vocals');return job;});
  try{
    await ui.nodes.get('rvc-auto-parameters').click();assert.equal(ui.nodes.get('rvc-pitch').value,'12');assert.equal(uploads,1);
    ui.nodes.get('rvc-pitch').value='3';ui.nodes.get('rvc-pitch').dispatchEvent(new Event('input'));
    ui.role({...model,id:'another'});ui.controller.refresh();assert.equal(ui.nodes.get('rvc-pitch').value,'3');
    await ui.nodes.get('rvc-auto-parameters').click();assert.equal(uploads,1);
    ui.state.audio={file:new File(['changed'],'other.wav')};await ui.nodes.get('rvc-auto-parameters').click();assert.equal(uploads,2);
  }finally{ui.close();}
});
test('interrupted auto analysis resumes the existing job without uploading again',async()=>{
  let uploads=0,polls=0;
  const ui=fixture(async(url)=>{if(url.includes('voice-ranges'))return {profiles:{}};if(url.endsWith('/analyze')){uploads++;return {...job,state:'queued'};}if(++polls===1)throw new Error('network');return job;});
  try{await ui.nodes.get('rvc-auto-parameters').click();await ui.nodes.get('rvc-auto-parameters').click();assert.equal(uploads,1);assert.equal(ui.state.busy,false);assert.equal(ui.nodes.get('rvc-pitch').value,'12');}finally{ui.close();}
});
test('explicit automatic tuning applies register settings even when speech was selected',async()=>{
  const ui=fixture(async url=>url.includes('voice-ranges')?{profiles:{}}:job);
  try{ui.modern(true);ui.nodes.get('rvc-pitch').value='4';await ui.nodes.get('rvc-auto-parameters').click();assert.equal(ui.nodes.get('rvc-pitch').value,'12');assert.equal(ui.nodes.get('rvc-rms-mix').value,'1');}finally{ui.close();}
});
test('terminal analysis failure starts a new job on retry instead of polling a failed job forever',async()=>{
  let uploads=0;
  const ui=fixture(async url=>url.includes('voice-ranges')?{profiles:{}}:++uploads===1?{...job,state:'failed',code:'RVC_SEPARATION_FAILED'}:job);
  try{await ui.nodes.get('rvc-auto-parameters').click();await ui.nodes.get('rvc-auto-parameters').click();assert.equal(uploads,2);assert.equal(ui.nodes.get('rvc-pitch').value,'12');}finally{ui.close();}
});
test('TTS installation is an authenticated bounded route; health polling survives the text limiter',async()=>{
  const old=globalThis.fetch;let received;
  globalThis.fetch=async(url,options)=>{received={url,options};return Response.json({state:'downloading',ready:false});};
  const env={POSTPREP_RVC_DIRECT_BASE_URL:'https://unit-test.trycloudflare.com',POSTPREP_RVC_INFERENCE_TOKEN:'s'.repeat(48),POSTPREP_RATE_LIMITER:{limit:async()=>({success:true})}};
  const origin='https://senseixiaomisensei-sudo.github.io';
  try{
    const response=await gateway.fetch(new Request('https://a.workers.dev/rvc/tts/install',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'}),env);
    assert.equal(response.status,200);assert.match(received.url,/\/v1\/tts\/install$/u);assert.equal(received.options.headers.get('Authorization'),`Bearer ${env.POSTPREP_RVC_INFERENCE_TOKEN}`);
    const health=await gateway.fetch(new Request('https://a.workers.dev/rvc/tts/health',{headers:{Origin:origin}}),{...env,POSTPREP_RATE_LIMITER:{limit:async()=>({success:false})}});assert.equal(health.status,200);
  }finally{globalThis.fetch=old;}
});
