import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../assets/rvc.js',import.meta.url),'utf8');
function fn(name,dependencies={}){
  const start=source.indexOf(`function ${name}(`),end=source.indexOf('\n  }',start)+4;
  const prefix=source.slice(start-6,start)==='async '?'async ':'';
  return Function(...Object.keys(dependencies),`return (${prefix}${source.slice(start,end)});`)(...Object.values(dependencies));
}
test('Apple mobile detection includes iPad with desktop user agent',()=>{
  for(const [nav,expected] of [[{userAgent:'iPhone'},true],[{userAgent:'Macintosh',platform:'MacIntel',maxTouchPoints:5},true],
    [{userAgent:'Macintosh',platform:'MacIntel',maxTouchPoints:0},false],[{userAgent:'Android'},false]])
    assert.equal(fn('isAppleMobile',{globalThis:{navigator:nav}})(),expected);
});
test('iPhone completed result cancels polling body and streams, without allocating the full output',async()=>{
  let cancelled=false,downloaded=false;
  const result=fn('cloudResultUrl',{isAppleMobile:()=>true,downloadLongCloudOutput:()=>{downloaded=true;throw Error('must not download');}});
  assert.equal(await result('/protected/result',{body:{cancel:async()=>{cancelled=true;}}},'mp3',60000),'/protected/result');
  assert.equal(cancelled,true);assert.equal(downloaded,false);
});
test('iPhone cloud failure never silently switches to the large local ONNX pipeline',async()=>{
  let options;
  const run=fn('runRvcInference',{chorusController:null,isAppleMobile:()=>true,
    document:{getElementById:()=>null},OWN_MODEL_PREFIX:'own:',
    state:{catalog:[{id:'hoshino'}],selectedModelId:'hoshino',inferenceMode:'official',audioMode:'voice',engineReady:false},
    hasDeviceFallbackModel:()=>true,runWebRvcInference:()=>{throw Error('must not allocate ONNX');},
    refreshOfficialService:()=>{throw Error('automatic local probe must be skipped');},
    runOfficialRvcInference:async value=>{options=value;return {failed:true};}});
  await run();assert.equal(options.allowDeviceFallback,false);
});
test('cloud iPhone and song inputs use only metadata; local mode retains decoding',async()=>{
  for(const [apple,mode,audioMode,decodes] of [[true,'official','voice',0],[false,'official','song',0],[true,'local','voice',1]]){
    let calls=0;const state={inferenceMode:mode,audioMode},controller={refresh(){}};
    const handle=fn('handleAudioSelected',{state,chorusController:controller,isAppleMobile:()=>apple,
      document:{getElementById:()=>null},t:x=>x,probeAudioDuration:async()=>327,audioDurationLimit:()=>900,
      decodeAudioFileTo16kMono:async()=>{calls++;return {duration:327,float32:new Float32Array(1)};},updateStatusDisplay(){},showToast(){}});
    await handle(new File(['test'],'song.mp3'));assert.equal(calls,decodes);assert.equal(state.audio.duration,327);
  }
});
