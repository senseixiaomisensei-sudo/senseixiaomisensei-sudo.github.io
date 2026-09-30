// Execute the actual Worker orchestrator with real ONNX WASM sessions in Node.
// This tests Worker audio code, not browser/mobile integration or listening.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {File} from 'node:buffer';
const require=createRequire('E:/大肥鱼/rvc-local/convert/package.json');
const ort=require('onnxruntime-web');
const ortPackage=JSON.parse(fs.readFileSync(path.resolve(path.dirname(require.resolve('onnxruntime-web')),'../package.json'),'utf8'));
const site=fileURLToPath(new URL('../',import.meta.url));
const [input,output,character='hoshino',candidate,controlledOptions='{}']=process.argv.slice(2);
if(!input || !output) throw new Error('input.f32 output-directory character [shared-prior-directory]');
fs.mkdirSync(output,{recursive:true});
const catalog=JSON.parse(fs.readFileSync(path.join(site,'assets/rvc-models.json'),'utf8'));
const entry=catalog.models.find(m=>m.id===character);
const assemble=chunks=>Buffer.concat(chunks.map(c=>fs.readFileSync(path.join(site,c))));
globalThis.self={postMessage:()=>{}};
globalThis.File=File;globalThis.require=require;globalThis.ortEvidence=ort;
ort.env.wasm.numThreads=1;
ort.env.wasm.proxy=false;
const source=fs.readFileSync(path.join(site,'assets/rvc-engine/inference.worker.js'),'utf8');
// Supply only the module URL for the classic VM host; audio functions remain
// the exact Worker source. The ORT Web package supplies the Node WASM loader.
vm.runInThisContext(source.replaceAll('import.meta.url',JSON.stringify(new URL('../assets/rvc-engine/inference.worker.js',import.meta.url).href)),{filename:'actual-inference.worker.js'});
vm.runInThisContext('Te=ortEvidence.Tensor;qu=ortEvidence.InferenceSession;ne=ortEvidence.env;');
const encoder=entry.contentEncoder?.featureDimension===256 || entry.version==='v1' || character==='hoshino'
  ? catalog.baseModels.hubertV1 : catalog.baseModels.hubert;
const files={model:new File([candidate?fs.readFileSync(path.join(candidate,'decoder.onnx')):assemble(entry.chunks)],'model.onnx'),
  contentVec:new File([assemble(encoder.chunks)],'hubert.onnx'),
  rmvpe:new File([assemble(catalog.baseModels.rmvpe.chunks)],'rmvpe.onnx')};
if(candidate) files.prior=new File([fs.readFileSync(path.join(candidate,'prior.onnx'))],'prior.onnx');
const inputBuffer=fs.readFileSync(input);
const audio=new Float32Array(inputBuffer.buffer.slice(inputBuffer.byteOffset,inputBuffer.byteOffset+inputBuffer.length));
const events=[];const started=Date.now();
const options={inputSampleRate:16000,outputSampleRate:entry.sampleRate??40000,indexRate:0,protect:.33,
  pitchShift:0,rmsMixRate:1,noiseSeed:20260823,noiseScale:entry.noiseScale??.35,
  sharedContentTimeline:!!candidate,...JSON.parse(controlledOptions)};
const result=await runPipeline(files,{onEvent:event=>{
  events.push(event);
  if(event.type==='stage' || event.type==='chunk' && event.current%10===0) console.log(JSON.stringify(event));
},onDiagnostic:evidence=>{
  const metadata={};
  for(const [key,value] of Object.entries(evidence)) {
    if(ArrayBuffer.isView(value)) {
      const filename=`${evidence.stage}-${key}.${value instanceof Int32Array?'i32':'f32'}`;
      fs.writeFileSync(path.join(output,filename),Buffer.from(value.buffer,value.byteOffset,value.byteLength));
      metadata[key]={filename,length:value.length,type:value.constructor.name};
    } else metadata[key]=value;
  }
  fs.writeFileSync(path.join(output,`${evidence.stage}.json`),JSON.stringify(metadata,null,2));
}},options,{data:audio,sampleRate:16000});
const report={characterId:character,workerExecution:'actual Worker source; ONNX Runtime Web WASM in Node, no browser UI',
  onnxRuntimeWebVersion:ortPackage.version,
  workerSha256:(await import('node:crypto')).createHash('sha256').update(source).digest('hex'),
  state:result.state,error:result.errorMessage,seconds:audio.length/16000,elapsedSeconds:(Date.now()-started)/1000,
  options,candidate:!!candidate,listening:'unverified',events};
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
if(result.state==='failed') throw new Error(result.errorMessage);
fs.writeFileSync(path.join(output,'worker-output.f32'),Buffer.from(result.outputAudio.buffer));
fs.writeFileSync(path.join(output,'worker-output.wav'),Buffer.from(result.outputWav instanceof Blob
  ?await result.outputWav.arrayBuffer():result.outputWav));
console.log(JSON.stringify({state:result.state,outputFrames:result.outputAudio.length,elapsedSeconds:report.elapsedSeconds}));
