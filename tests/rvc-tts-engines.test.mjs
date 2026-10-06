import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../assets/rvc.js',import.meta.url),'utf8');
const start=source.indexOf('    const ttsSynth = document.getElementById("rvc-tts-synth")');
const end=source.indexOf('    setupRecording();',start);
const connectionSource=source.slice(source.indexOf('  const OFFICIAL_RVC_ENDPOINT'),source.indexOf('  const ALLOWED_EXTENSIONS'));
const catalog={defaultModel:'qwen3-17b',models:[
  {modelId:'qwen3-17b',ready:true,languages:['zh','en','ja'],styles:['neutral','gentle','happy'],voices:['serena','ryan'],installAvailable:true},
  {modelId:'qwen3-06b',ready:true,languages:['zh','en','ja'],styles:['neutral'],voices:['serena','ryan'],installAvailable:true},
  {modelId:'indextts-25',ready:true,languages:['zh','en','ja','es','ar'],styles:['neutral','calm','happy'],voices:['female-soft','male-reference'],installAvailable:true},
  {modelId:'aishell-legacy',ready:false,state:'not-installed',languages:['zh'],styles:['neutral'],voices:[],installAvailable:true}
]};
function harness(fetchOverride, savedBase = null){
  const ids=['synth','convert','ready','status','text','install','engine','language','style','voice','capabilities','preview','result','adapt','manual-base'];
  const elements=new Map(ids.map(k=>[`rvc-tts-${k}`,{value:'',events:{},hidden:false,disabled:false,classList:{remove(){}},addEventListener(k,fn){this.events[k]=fn;},replaceChildren(...options){this.options=options;}}]));
  const calls=[];let input;const state={busy:false};
  const context={document:{getElementById:id=>elements.get(id)||null,addEventListener(){},createElement:()=>({})},state,
    POSTPREP_RVC_API_ENDPOINT:'https://example.invalid/rvc-api',
    window:{location:{origin:'https://postprep.example',protocol:'https:',hostname:'postprep.example'},localStorage:{getItem:key=>key==='rvcTtsBase'?savedBase:null,setItem(key,value){if(key==='rvcTtsBase')savedBase=value;}}},l:(zh,en)=>en,

    createCloudRequestId:()=> 'request-for-real-tts',setAudioMode(){},handleAudioSelected:async file=>{input=file;},runRvcInference(){},
    AbortController,DOMException,File,URL,queueMicrotask,
    setTimeout:(fn,ms)=>{if(ms===4000||ms===8000)queueMicrotask(fn);return 1;},clearTimeout(){},
    fetch:async (url,options)=>{calls.push({url,options});const override=fetchOverride?.(url,options);if(override)return override;if(url.includes('/health?'))return Response.json(catalog);
      if(url.endsWith('/install'))return Response.json({state:'ready'});
      if(url.endsWith('/jobs'))return Response.json({jobId:'id-for-tts',downloadToken:'private-job-token'},{status:202});
      return new Response(new Uint8Array([1,2,3,4]),{headers:{'Content-Type':'audio/wav'}});}
  };
  vm.runInNewContext(connectionSource+'\n'+source.slice(start,end),context);
  return {elements,state,calls,get savedBase(){return savedBase;},get input(){return input;},click:id=>elements.get(`rvc-tts-${id}`).events.click(),change:id=>elements.get(`rvc-tts-${id}`).events.change()};
}
async function settleHealth(h){
  for(let i=0;i<20&&h.state.ttsLoading;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.state.ttsLoading,false,'health response must finish before asserting readiness');
}
async function ready(h){h.elements.get('rvc-tts-engine').value='qwen3-06b';h.change('engine');await settleHealth(h);}

test('TTS catalog controls actual language, voice and supported tone options',async()=>{
  const h=harness();await ready(h);
  assert.equal(h.elements.get('rvc-tts-synth').disabled,false);
  assert.equal(h.elements.get('rvc-tts-style').disabled,true);
  h.elements.get('rvc-tts-engine').value='indextts-25';h.change('engine');await settleHealth(h);
  assert.equal(h.elements.get('rvc-tts-style').disabled,false);
  assert.ok(h.elements.get('rvc-tts-style').options.some(x=>x.value==='calm'));
  assert.ok(h.elements.get('rvc-tts-language').options.some(x=>x.value==='ar'));
  assert.ok(h.elements.get('rvc-tts-voice').options.some(x=>x.value==='female-soft'));
  h.elements.get('rvc-tts-engine').value='aishell-legacy';h.change('engine');await settleHealth(h);
  assert.equal(h.elements.get('rvc-tts-synth').disabled,true);
  assert.equal(h.elements.get('rvc-tts-install').hidden,false);
});
test('a full cover queue waits and retries the same TTS request without losing selected parameters',async()=>{
  let posts=0;
  const h=harness(url=>url.endsWith('/jobs')&&++posts===1?Response.json({code:'RVC_QUEUE_BUSY'},{status:429}):null);
  await ready(h);h.elements.get('rvc-tts-text').value='你好。';await h.click('synth');
  const submissions=h.calls.filter(x=>x.url.endsWith('/jobs'));
  assert.equal(submissions.length,2);assert.equal(submissions[0].options.body,submissions[1].options.body);
  assert.equal(h.input.size,4);assert.equal(h.state.ttsSynthBusy,false);
});
test('TTS options unlock after a cover finishes and unsupported tone errors explain the remedy',async()=>{
  const h=harness(url=>url.endsWith('/jobs')?Response.json({code:'RVC_TTS_STYLE_UNSUPPORTED'},{status:400}):null);
  await ready(h);h.state.busy=true;h.state.syncTtsControls();assert.equal(h.elements.get('rvc-tts-language').disabled,true);
  h.state.busy=false;h.state.syncTtsControls();assert.equal(h.elements.get('rvc-tts-language').disabled,false);
  h.elements.get('rvc-tts-text').value='你好。';await h.click('synth');assert.match(h.elements.get('rvc-tts-status').textContent,/does not support that tone/);
  assert.equal(h.elements.get('rvc-tts-synth').disabled,false);
});

test('TTS selected parameters reach background submission and completed audio becomes input',async()=>{
  const h=harness();await ready(h);h.elements.get('rvc-tts-text').value='Hello, today is a peaceful day.';
  h.elements.get('rvc-tts-language').value='en';h.elements.get('rvc-tts-voice').value='ryan';
  await h.click('synth');
  const post=h.calls.find(x=>x.url.endsWith('/jobs'));const body=JSON.parse(post.options.body);
  assert.equal(body.modelId,'qwen3-06b');assert.equal(body.language,'en');assert.equal(body.voice,'ryan');assert.equal(body.style,'neutral');
  assert.ok(h.calls.some(x=>x.url.includes('/output/id-for-tts?token=')));
  assert.equal(h.input.type,'audio/wav');assert.equal(h.input.size,4);
  assert.equal(h.elements.get('rvc-tts-result').hidden,false);
});

test('protected gateway forwards background TTS with bearer authentication and bounded JSON',async()=>{
  const gateway=(await import('../worker/api-gateway.js')).default;const original=globalThis.fetch;let received;
  globalThis.fetch=async(url,options)=>{received={url,options};return Response.json({state:'queued'},{status:202});};
  const env={POSTPREP_RVC_DIRECT_BASE_URL:'https://test.trycloudflare.com',POSTPREP_RVC_INFERENCE_TOKEN:'a'.repeat(48),POSTPREP_RATE_LIMITER:{limit:async()=>({success:true})}};
  try{
    const res=await gateway.fetch(new Request('https://a.workers.dev/rvc/tts/jobs',{method:'POST',headers:{Origin:'https://senseixiaomisensei-sudo.github.io','Content-Type':'application/json'},body:JSON.stringify({text:'你好',modelId:'qwen3-06b'})}),env);
    assert.equal(res.status,202);assert.match(received.url,/\/v1\/tts\/jobs$/);assert.equal(received.options.headers.get('Authorization'),`Bearer ${env.POSTPREP_RVC_INFERENCE_TOKEN}`);
  }finally{globalThis.fetch=original;}
});


test('one click on a phone replaces a stale LAN address and unlocks both actions',async()=>{
  const h=harness(null,'http://192.168.1.3:8080');
  assert.equal(h.elements.get('rvc-tts-convert').disabled,true);
  await h.click('adapt');
  assert.equal(h.savedBase,'https://example.invalid/rvc-api');
  assert.equal(h.elements.get('rvc-tts-convert').disabled,false);
  assert.equal(h.elements.get('rvc-tts-synth').disabled,false);
  assert.ok(h.calls.every(call=>call.url.startsWith('https://')));
});
test('public relay fallback uses its own catalog, never a losing probe',async()=>{
  const h=harness(url=>url.startsWith('https://example.invalid')?Promise.reject(new TypeError('network')):null);
  await h.click('adapt');
  assert.equal(h.savedBase,'https://postprep-text-gateway.postprep.workers.dev/rvc');
  assert.equal(h.state.ttsInfo.modelId,'qwen3-17b');
  assert.equal(h.elements.get('rvc-tts-convert').disabled,false);
});
test('a reachable uninstalled model connects without pretending it is ready',async()=>{
  const h=harness();h.elements.get('rvc-tts-engine').value='aishell-legacy';h.change('engine');await settleHealth(h);
  await h.click('adapt');
  assert.equal(h.elements.get('rvc-tts-convert').disabled,true);
  assert.equal(h.elements.get('rvc-tts-install').disabled,false);
  assert.equal(h.savedBase,'https://example.invalid/rvc-api');
});
test('a ready different model does not enable an unavailable selected model',async()=>{
  const h=harness(url=>url.includes('/health?')?Response.json({ready:true,models:[catalog.models[1]]}):null);
  await h.click('adapt');
  assert.equal(h.state.ttsEnabled,false);
  assert.equal(h.elements.get('rvc-tts-convert').disabled,true);
});
test('model changes during a probe commit only the current selection',async()=>{
  let finish;const response=new Promise(resolve=>{finish=resolve;});
  const h=harness(url=>url.includes('/health?')?response:null);
  const adaptation=h.click('adapt');h.elements.get('rvc-tts-engine').value='aishell-legacy';h.change('engine');
  finish(Response.json(catalog));await adaptation;
  assert.equal(h.state.ttsInfo.modelId,'aishell-legacy');
  assert.equal(h.state.ttsEnabled,false);
});
test('full health URLs normalize and mixed-content addresses are rejected on HTTPS',async()=>{
  const h=harness();h.elements.get('rvc-tts-manual-base').value='https://example.invalid/rvc-api/tts/health?old=1';
  await h.click('adapt');assert.equal(h.savedBase,'https://example.invalid/rvc-api');
  const bad=harness();bad.elements.get('rvc-tts-manual-base').value='http://192.168.1.3:8080';await bad.click('adapt');
  assert.equal(bad.calls.length,0);assert.match(bad.elements.get('rvc-tts-status').textContent,/public HTTPS/);
});


test('public TTS health forwards the selected model to the private server',async()=>{
  const gateway=(await import('../worker/api-gateway.js')).default;const original=globalThis.fetch;let target;
  globalThis.fetch=async url=>{target=new URL(url);return Response.json(catalog);};
  try {
    const res=await gateway.fetch(new Request('https://a.workers.dev/rvc/tts/health?modelId=qwen3-17b',{headers:{Origin:'https://senseixiaomisensei-sudo.github.io'}}),{POSTPREP_RVC_DIRECT_BASE_URL:'https://test.trycloudflare.com',POSTPREP_RVC_INFERENCE_TOKEN:'a'.repeat(48)});
    assert.equal(res.status,200);assert.equal(target.pathname,'/v1/tts-health');assert.equal(target.searchParams.get('model_id'),'qwen3-17b');
  } finally {globalThis.fetch=original;}
});
