import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const client=await readFile(new URL('../assets/rvc.js',import.meta.url),'utf8');
const recordingCode=client.slice(client.indexOf('  function recorderFormat()'),client.indexOf('  async function runWebRvcInference'));
const settle=()=>new Promise(resolve=>setImmediate(resolve));
class Element {
  constructor(){this.events={};this.attributes={};this.hidden=true;this.disabled=false;this.textContent='';this.classList={add(){},remove(){}};}
  addEventListener(name,callback){this.events[name]=callback;}
  setAttribute(name,value){this.attributes[name]=value;}
  pause(){}
}
function fixture({getUserMedia,MediaRecorder,AudioContext,secure=true}={}){
  const names=['toggle','label','timer','preview','hint'];
  const elements=Object.fromEntries(names.map(name=>[name,new Element()]));
  const events={},timers=new Map();let timerId=0,stopped=0,requests=0;
  const streams=[];
  const stream=()=>{const value={getTracks:()=>[{stop(){stopped++;}}]};streams.push(value);return value;};
  const recorders=[];
  class NativeRecorder {
    static isTypeSupported(type){return type==='audio/webm;codecs=opus';}
    constructor(value){this.stream=value;this.state='inactive';this.mimeType='audio/webm';recorders.push(this);}
    start(){this.state='recording';}
    requestData(){}
    stop(){this.state='inactive';queueMicrotask(()=>{this.ondataavailable?.({data:new Blob([new Uint8Array(80)])});this.onstop?.();});}
  }
  const state={recording:false,busy:false},files=[],toasts=[];
  const window={AudioContext,isSecureContext:secure,addEventListener:(name,callback)=>{events[name]=callback;}};
  const context={state,window,navigator:{mediaDevices:{getUserMedia:()=>{requests++;return getUserMedia?getUserMedia(stream):Promise.resolve(stream());}}},
    MediaRecorder:MediaRecorder===null?undefined:(MediaRecorder || NativeRecorder),File,Blob,Float32Array,ArrayBuffer,DataView,Date,
    URL:{createObjectURL:()=>`blob:recorded-${files.length}`,revokeObjectURL(){}},console:{error(){}},
    document:{getElementById:id=>elements[id.replace('rvc-record-','')] || null},
    l:zh=>zh,t:key=>({recordStart:'开始录音',recordStop:'停止录音',recordDenied:'麦克风权限被拒绝',recordError:'录音失败',decodeFailed:'解码失败'})[key] || key,
    formatTime:s=>`0:${String(Math.floor(s)).padStart(2,'0')}`,showToast:message=>toasts.push(message),
    setTimeout:(fn,delay)=>{timers.set(++timerId,{fn,delay});return timerId;},clearTimeout:id=>timers.delete(id),
    setInterval:()=>++timerId,clearInterval(){},
    handleAudioSelected:async file=>{files.push(file);state.audio={file};}};
  vm.runInNewContext(`${recordingCode}\nsetupRecording();`,context);
  return {elements,events,state,files,recorders,toasts,context,streams,
    get requests(){return requests;},get stopped(){return stopped;},click:()=>elements.toggle.events.click(),
    fireTimeout:delay=>{const found=[...timers.values()].find(t=>t.delay===delay);assert.ok(found);found.fn();},
    get timers(){return timers;}};
}

test('microphone click immediately reports permission waiting and prevents duplicate requests',async()=>{
  let grant;const ui=fixture({getUserMedia:stream=>new Promise(resolve=>{grant=()=>resolve(stream());})});
  const pending=ui.click();assert.match(ui.elements.hint.textContent,/允许麦克风/);
  assert.equal(ui.elements.toggle.disabled,true);await ui.click();assert.equal(ui.requests,1);
  grant();await pending;assert.equal(ui.state.recording,true);assert.equal(ui.elements.toggle.disabled,false);
  ui.events.pagehide();assert.ok(ui.stopped>0);
});

test('stopping a native recording exposes an actual preview and selects its original input',async()=>{
  const ui=fixture();await ui.click();await ui.click();await settle();
  assert.equal(ui.files.length,1);assert.equal(ui.state.audio.file,ui.files[0]);assert.match(ui.files[0].name,/\.webm$/);
  assert.equal(ui.elements.preview.hidden,false);assert.match(ui.elements.preview.src,/^blob:/);
  assert.match(ui.elements.hint.textContent,/先试听/);assert.equal(ui.elements.toggle.disabled,false);assert.ok(ui.stopped>0);
});

test('denied permissions and insecure contexts show persistent inline errors and permit retry',async()=>{
  const ui=fixture({getUserMedia:()=>Promise.reject(Object.assign(new Error('denied'),{name:'NotAllowedError'}))});
  await ui.click();assert.match(ui.elements.hint.textContent,/权限被拒绝/);assert.equal(ui.elements.toggle.disabled,false);
  const insecure=fixture({secure:false});insecure.context.navigator.mediaDevices=null;
  await insecure.click();assert.match(insecure.elements.hint.textContent,/HTTPS/);assert.equal(insecure.requests,0);
});

test('a permission timeout releases the UI and stops any late microphone stream',async()=>{
  let grant;const ui=fixture({getUserMedia:stream=>new Promise(resolve=>{grant=()=>resolve(stream());})});
  const pending=ui.click();ui.fireTimeout(30000);await pending;
  assert.match(ui.elements.hint.textContent,/授权提示/);assert.equal(ui.elements.toggle.disabled,false);
  grant();await settle();assert.equal(ui.state.recording,false);assert.equal(ui.stopped,1);
});

test('cancelling a permission request cannot stop a newer recording or leave its timer active',async()=>{
  let oldGrant,count=0;const ui=fixture({getUserMedia:stream=>++count===1?new Promise(resolve=>{oldGrant=()=>resolve(stream());}):Promise.resolve(stream())});
  const old=ui.click();ui.state.cancelRecording();await ui.click();assert.equal(ui.state.recording,true);
  oldGrant();await old;assert.equal(ui.state.recording,true);assert.equal(ui.stopped,1);
  assert.equal([...ui.timers.values()].filter(t=>t.delay===30000).length,0);
});

test('native recorder failure releases the microphone without publishing a partial input',async()=>{
  const ui=fixture();await ui.click();ui.recorders[0].onerror({error:new Error('capture failed')});await settle();
  assert.equal(ui.files.length,0);assert.equal(ui.state.recording,false);assert.equal(ui.elements.toggle.disabled,false);
  assert.match(ui.elements.hint.textContent,/录音失败/);assert.ok(ui.stopped>0);
});

test('PCM fallback resumes suspended audio and returns real WAV bytes with the captured sample rate',async()=>{
  let audioContext;
  class Context {
    constructor(){audioContext=this;this.state='suspended';this.sampleRate=48000;this.destination={};this.closed=false;}
    async resume(){this.resumed=true;this.state='running';}
    createMediaStreamSource(){return {connect(){},disconnect(){}};}
    createGain(){return {gain:{value:1},connect(){},disconnect(){}};}
    createScriptProcessor(){return this.processor={connect(){},disconnect(){}};}
    async close(){this.closed=true;}
  }
  const ui=fixture({MediaRecorder:null,AudioContext:Context});await ui.click();assert.equal(audioContext.resumed,true);
  audioContext.processor.onaudioprocess({inputBuffer:{getChannelData:()=>new Float32Array([.1,-.1,.2,-.2])}});
  await ui.click();assert.equal(ui.files.length,1);const bytes=await ui.files[0].arrayBuffer();
  assert.equal(new TextDecoder().decode(bytes.slice(0,4)),'RIFF');assert.equal(new DataView(bytes).getUint32(24,true),48000);
  assert.equal(bytes.byteLength,52);assert.equal(audioContext.closed,true);assert.equal(ui.elements.preview.hidden,false);
});
