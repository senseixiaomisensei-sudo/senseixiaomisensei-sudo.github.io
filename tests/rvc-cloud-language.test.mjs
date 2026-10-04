import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../assets/rvc.js',import.meta.url),'utf8');
const start=source.indexOf('  async function pollCloudOutput(');
const end=source.indexOf('  async function readCloudAudioBody(',start);

test('English cloud progress keeps resumable polling for songs and long jobs',async()=>{
  for(const longJob of [false,true]){
    let calls=0;const messages=[];
    const deps={state:{audioMode:'song',lang:'en'},l:(zh,en)=>en,fetch:async()=>++calls===1
      ?new Response(JSON.stringify({stage:'separating'}),{status:202})
      :new Response(new Uint8Array([1,2,3])),
      updateProgressBar:()=>{},updateStatusDisplay:s=>messages.push(s),waitFor:async()=>{}};
    const poll=Function(...Object.keys(deps),`${source.slice(start,end)};return pollCloudOutput;`)(...Object.values(deps));
    const result=await poll('https://example.invalid/output',30000,longJob);
    assert.equal(result.status,200);assert.equal(calls,2);
    assert.match(messages[0],/Separating/);assert.doesNotMatch(messages[0],/[\p{Han}]/u);
  }
});
