import { readFile, writeFile } from 'node:fs/promises';
const source = await readFile(new URL('../assets/rvc-engine/inference.worker.js', import.meta.url), 'utf8');
const input = JSON.parse(await readFile(process.argv[2], 'utf8'));
function extract(name) {
  const start=source.indexOf(`function ${name}(`), body=source.indexOf('{',start);
  if(start<0)throw new Error(`Missing ${name}`);
  let depth=0;
  for(let end=body;end<source.length;end++) {
    if(source[end]==='{')depth++;
    if(source[end]==='}' && --depth===0)return source.slice(start,end+1);
  }
  throw new Error('Unclosed function');
}
// This represents only the Ort tensor container. Actual inference is run by
// ONNX Runtime against the real checkpoint in verify-rvc-device-export.py.
class Tensor { constructor(type,data,dims){Object.assign(this,{type,data,dims});} }
const names=['applyPitchShift','buildPitchPhaseTimeline','pitchPhaseAtFrame','buildSourceExcitationTensor'];
const functions=Function('Te',names.map(extract).join('\n')+';return {buildPitchPhaseTimeline,pitchPhaseAtFrame,buildSourceExcitationTensor};')(Tensor);
const clock=functions.buildPitchPhaseTimeline(Float32Array.from(input.f0),0);
const output=functions.buildSourceExcitationTensor(clock.shifted.slice(input.start,input.start+input.count),
  input.count,input.upp,{data:Float32Array.from(input.noise)},functions.pitchPhaseAtFrame(clock,input.start));
await writeFile(process.argv[3],Buffer.from(output.data.buffer));
