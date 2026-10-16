import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {canExportOnnx,onnxFilename,prepareOnnxExport,initModelExport} from '../assets/rvc-model-export.js';

const content = new Uint8Array([8,8,18,3,82,86,67]);
const sha256 = createHash('sha256').update(content).digest('hex');
const model = {id:'hoshino',name:'星野',chunks:['chunk_0.bin','chunk_1.bin'],sha256,totalSize:content.length};
const verifyBytes = async (bytes, expected) => {
  if (expected) assert.equal(createHash('sha256').update(new Uint8Array(bytes)).digest('hex'),expected);
};
const config = overrides => ({model,loadModel:async()=>new Blob([content]),readOwnModel:async()=>null,
  cacheKey:m=>`${m.id}.onnx`,verifyBytes,...overrides});

test('published model exports complete verified bytes with the actual revision in its filename', async()=>{
  let loaded,verified=false;
  const result=await prepareOnnxExport(config({loadModel:async m=>{loaded=m;return new Blob([content]);},
    verifyBytes:async(bytes,hash)=>{await verifyBytes(bytes,hash);verified=true;}}));
  assert.equal(loaded,model);assert.equal(verified,true);
  assert.deepEqual(new Uint8Array(await result.blob.arrayBuffer()),content);
  assert.equal(result.filename,`hoshino-${sha256.slice(0,12)}.onnx`);
});

test('local imported model is read only from its own cache, without uploading or fetching', async()=>{
  let key;const own={id:'own:my_voice'};
  const result=await prepareOnnxExport(config({model:own,loadModel:()=>{throw Error('must not fetch');},
    readOwnModel:async value=>{key=value;return new Blob([content]);}}));
  assert.equal(key,'own:my_voice.onnx');assert.equal(result.filename,'my_voice.onnx');
  assert.deepEqual(new Uint8Array(await result.blob.arrayBuffer()),content);
});

test('missing local cache, truncated downloads and invalid hashes never become downloadable exports', async()=>{
  await assert.rejects(prepareOnnxExport(config({model:{id:'own:missing'}})),/ONNX_LOCAL_MODEL_MISSING/);
  await assert.rejects(prepareOnnxExport(config({loadModel:async()=>new Blob([content.slice(0,3)])})),/SIZE_MISMATCH/);
  await assert.rejects(prepareOnnxExport(config({model:{...model,sha256:'0'.repeat(64)}})));
});

test('cloud-only voices cannot be passed off as converted ONNX files', async()=>{
  for(const unavailable of [{id:'cloud-only'}, {...model,supportsDevice:false},{...model,sha256:''}]){
    assert.equal(canExportOnnx(unavailable),false);
    await assert.rejects(prepareOnnxExport(config({model:unavailable})),/ONNX_EXPORT_UNAVAILABLE/);
  }
  assert.match(onnxFilename({id:'own:../../bad name',sha256:'../../'}),/^[a-zA-Z0-9_-]+\.onnx$/);
});

class Element {
  constructor(){this.hidden=false;this.disabled=false;this.attrs={};this.events={};this.textContent='';}
  setAttribute(k,v){this.attrs[k]=String(v);}
  removeAttribute(k){delete this.attrs[k];if(k==='href')delete this.href;}
  addEventListener(k,handler){this.events[k]=handler;}
}
function fixture(load=async()=>new Blob([content])){
  const nodes=Object.fromEntries(['title','hint','action','download','status'].map(k=>[k,new Element()]));
  const panel=new Element();panel.querySelector=selector=>nodes[selector.slice(11,-1)];
  const doc={getElementById:()=>panel,defaultView:new Element()};
  const revoked=[],created=[];const urls={createObjectURL:blob=>{created.push(blob);return `blob:${created.length}`;},revokeObjectURL:url=>revoked.push(url)};
  const state={lang:'zh',busy:false};let selected=model;
  const controller=initModelExport({...config({}),state,getModel:()=>selected,name:m=>m.name || m.id,loadModel:load,doc,urls});
  return {nodes,state,controller,revoked,created,select:m=>{selected=m;controller.refresh();},click:()=>nodes.action.events.click()};
}

test('controller keeps an explicit mobile Save link, refreshes language and revokes replaced downloads', async()=>{
  const ui=fixture();await ui.click();
  assert.equal(ui.nodes.download.hidden,false);assert.equal(ui.nodes.download.href,'blob:1');
  assert.match(ui.nodes.status.textContent,/星野.*已就绪/);assert.deepEqual(ui.revoked,[]);
  ui.state.lang='en';ui.controller.refresh();assert.match(ui.nodes.status.textContent,/is ready/);
  await ui.click();assert.deepEqual(ui.revoked,['blob:1']);assert.equal(ui.nodes.download.href,'blob:2');
});

test('export captures the selected character and rejects duplicate clicks while downloading', async()=>{
  let complete;const ui=fixture(()=>new Promise(resolve=>{complete=resolve;}));
  const pending=ui.click();assert.equal(ui.nodes.action.disabled,true);
  ui.select({...model,id:'arona',name:'阿罗娜'});await ui.click();
  complete(new Blob([content]));await pending;
  assert.match(ui.nodes.download.download,/^hoshino-/);assert.match(ui.nodes.status.textContent,/星野/);
});

test('failure never displays a Save link and the control can retry', async()=>{
  let fail=true;const ui=fixture(async()=>{if(fail)throw Error('offline');return new Blob([content]);});
  await ui.click();assert.equal(ui.nodes.download.hidden,true);assert.equal(ui.nodes.action.disabled,false);
  fail=false;await ui.click();assert.equal(ui.nodes.download.hidden,false);
  ui.state.busy=true;ui.controller.refresh();assert.equal(ui.nodes.action.disabled,true);
});
