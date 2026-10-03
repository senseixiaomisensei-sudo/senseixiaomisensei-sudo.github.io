import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {chorusBase,chorusOutputUrl} from '../assets/rvc-chorus.js';
import gateway from '../worker/api-gateway.js';
const id='12345678-abcd-abcd-abcd-123456789abc';
const token='t'.repeat(43);
const origin='https://senseixiaomisensei-sudo.github.io';
const env={POSTPREP_RVC_DIRECT_BASE_URL:'https://chorus-test.trycloudflare.com',
 POSTPREP_RVC_INFERENCE_TOKEN:'s'.repeat(48),POSTPREP_RVC_UPSTREAM_URL:'https://postprep-ae6.pages.dev/api/rvc',
 POSTPREP_GATEWAY_SECRET:'internal-test',POSTPREP_RATE_LIMITER:{limit:async()=>({success:true})},
 POSTPREP_RVC_RATE_LIMITER:{limit:async()=>({success:true})}};
test('chorus URLs reach actual output routes on Pages, Worker, relay and direct service',()=>{
 const job={jobId:id,downloadToken:token};
 for(const [endpoint,expected] of [
  ['https://a.pages.dev/api/rvc',`https://a.pages.dev/api/rvc-output?job=${id}&token=${token}`],
  ['https://a.workers.dev/rvc',`https://a.workers.dev/rvc/output/${id}?token=${token}`],
  ['https://a.pages.dev/rvc-api',`https://a.pages.dev/rvc-api/output/${id}?token=${token}`],
  ['http://localhost:8091/v1/convert',`http://localhost:8091/v1/output/${id}?token=${token}`]]){
   assert.equal(chorusOutputUrl(chorusBase(endpoint),job),expected);
 }
});
test('chorus preview forwards byte ranges and preserves binary responses',async()=>{
 const old=globalThis.fetch;let received;
 globalThis.fetch=async(url,options)=>{received={url,options};return new Response(new Uint8Array([82,73,70,70]),
  {status:206,headers:{'Content-Type':'audio/wav','Content-Range':'bytes 0-3/100','Accept-Ranges':'bytes'}});};
 try{
  const response=await gateway.fetch(new Request(`https://a.workers.dev/rvc/chorus/${id}/stem/2?token=${token}`,
   {headers:{Origin:origin,Range:'bytes=0-3'}}),env);
  assert.equal(response.status,206);assert.match(received.url,new RegExp(`/v1/chorus/${id}/stem/2`));
  assert.equal(received.options.headers.get('Range'),'bytes=0-3');
  assert.equal(received.options.headers.get('Authorization'),`Bearer ${env.POSTPREP_RVC_INFERENCE_TOKEN}`);
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[82,73,70,70]);
 }finally{globalThis.fetch=old;}
});
test('chorus routes reject unsupported track, method and missing session token',async()=>{
 for(const [path,method,expected] of [
  [`/rvc/chorus/${id}/stem/5?token=${token}`,'GET',404],
  [`/rvc/chorus/${id}/stem/1`,'GET',400],
  ['/rvc/chorus/analyze','GET',405],
  [`/rvc/chorus/${id}/convert?token=${token}`,'GET',405]]){
  const response=await gateway.fetch(new Request(`https://a.workers.dev${path}`,{method,headers:{Origin:origin}}),env);
  assert.equal(response.status,expected);
 }
});

test('capability polling survives the normal twelve-request-per-minute limiter',async()=>{
 const old=globalThis.fetch;let limited=0;
 globalThis.fetch=async()=>Response.json({state:'processing'});
 const throttled={...env,POSTPREP_RATE_LIMITER:{limit:async()=>{limited++;return {success:false};}}};
 try{
  for(let i=0;i<16;i++){
   const response=await gateway.fetch(new Request(`https://a.workers.dev/rvc/chorus/${id}?token=${token}`,{headers:{Origin:origin}}),throttled);
   assert.equal(response.status,200);
  }
  assert.equal(limited,0);
 }finally{globalThis.fetch=old;}
});
