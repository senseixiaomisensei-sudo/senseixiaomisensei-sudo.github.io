import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const run=promisify(execFile);
const helper=fileURLToPath(new URL('../rvc-service/startup_health.ps1',import.meta.url));
const quote=value=>`'${String(value).replaceAll("'","''")}'`;
const ps=async(script,options={})=>(await run('pwsh.exe',['-NoProfile','-NonInteractive','-Command',`. ${quote(helper)}; ${script}`],{timeout:15000,...options})).stdout.trim();
const windowsOnly={skip:process.platform!=='win32'};

test('startup detects listening ports and authenticated readiness without CIM privileges',windowsOnly,async()=>{
  const server=createServer((req,res)=>{
    if(req.headers.authorization!=='Bearer local-test-token'){res.writeHead(401).end();return;}
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ready:true}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;
  try {
    const result=JSON.parse(await ps(`@{tcp=(Test-RvcTcpPort ${port}); ready=(Wait-RvcLocalReady ${port} 'local-test-token' 3); unauthorized=(Test-RvcLocalReady ${port} 'wrong')} | ConvertTo-Json -Compress`));
    assert.deepEqual(result,{tcp:true,ready:true,unauthorized:false});
  } finally { await new Promise(resolve=>server.close(resolve)); }
  const closed=JSON.parse(await ps(`@{tcp=(Test-RvcTcpPort ${port}); ready=(Wait-RvcLocalReady ${port} 'local-test-token' 0)} | ConvertTo-Json -Compress`));
  assert.deepEqual(closed,{tcp:false,ready:false});
});

test('startup mutex rejects a concurrent launcher and can be acquired after it exits',windowsOnly,async()=>{
  const name=`Local\PostPrepRvcTest-${process.pid}-${Date.now()}`;
  const holder=spawn('pwsh.exe',['-NoProfile','-NonInteractive','-Command',`. ${quote(helper)}; $m=Enter-RvcStartupMutex ${quote(name)}; if(-not $m){exit 1}; Write-Output 'owned'; [Console]::Out.Flush(); [Console]::ReadLine() | Out-Null; $m.ReleaseMutex(); $m.Dispose()`],{stdio:['pipe','pipe','pipe']});
  const exit=new Promise((resolve,reject)=>{holder.once('error',reject);holder.once('close',resolve);});
  try {
    await new Promise((resolve,reject)=>{let out='';holder.stdout.on('data',data=>{out+=data;if(out.includes('owned'))resolve();});holder.once('error',reject);holder.once('exit',()=>reject(new Error('holder exited before owning mutex')));});
    assert.equal(await ps(`$m=Enter-RvcStartupMutex ${quote(name)}; if($m){$m.ReleaseMutex();$m.Dispose();'owned'}else{'busy'}`),'busy');
  } finally { holder.stdin.end('\n'); await exit; }
  assert.equal(await ps(`$m=Enter-RvcStartupMutex ${quote(name)}; if($m){$m.ReleaseMutex();$m.Dispose();'owned'}else{'busy'}`),'owned');
});

test('Wrangler resolves an existing install and rejects stale explicit paths',windowsOnly,async()=>{
  const prefix=join(tmpdir(),'postprep-startup-');
  const root=await mkdtemp(prefix);
  assert.ok(root.startsWith(prefix),'temporary installation stays inside its dedicated directory');
  try {
    const entry=join(root,'node_modules','wrangler','bin','wrangler.js');
    await mkdir(join(root,'node_modules','wrangler','bin'),{recursive:true});await writeFile(entry,'// resolver fixture');
    assert.equal(await ps(`$env:RVC_WRANGLER_JS=''; Resolve-RvcWrangler ${quote(root)}`),entry);
    assert.equal(await ps(`$env:RVC_WRANGLER_JS=${quote(join(root,'missing.js'))}; try { Resolve-RvcWrangler ${quote(root)} } catch { 'missing-install' }`),'missing-install');
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('service startup discards unavailable desktop proxies in its own environment',windowsOnly,async()=>{
  const result=JSON.parse(await ps(`$env:HTTP_PROXY='http://127.0.0.1:9'; $env:HTTPS_PROXY='http://127.0.0.1:9'; $env:ALL_PROXY='socks5://127.0.0.1:9'; $env:npm_config_proxy='http://127.0.0.1:9'; Set-RvcDirectNetwork; @{http=$env:HTTP_PROXY;https=$env:HTTPS_PROXY;all=$env:ALL_PROXY;npm=$env:npm_config_proxy;noProxy=$env:NO_PROXY;direct=$env:RVC_DIRECT_NETWORK} | ConvertTo-Json -Compress`));
  for(const field of ['http','https','all','npm']) assert.ok(!result[field], `${field} proxy must be absent or empty`);
  assert.equal(result.noProxy,'*');
  assert.equal(result.direct,'1');
});

test('Cloudflare preload retains normal DNS and removes inherited proxies only for service mode',async()=>{
  const preload=fileURLToPath(new URL('../rvc-service/clean-cf-dns.cjs',import.meta.url));
  const script=`const dns=require('node:dns');const lookup=dns.lookup;require(${JSON.stringify(preload)});console.log(JSON.stringify({dnsUnchanged:dns.lookup===lookup,proxy:process.env.HTTPS_PROXY||null,noProxy:process.env.NO_PROXY}));`;
  const environment={...process.env,HTTPS_PROXY:'http://127.0.0.1:9',RVC_DIRECT_NETWORK:'1'};
  const result=JSON.parse((await run(process.execPath,['-e',script],{env:environment})).stdout);
  assert.deepEqual(result,{dnsUnchanged:true,proxy:null,noProxy:'*'});
});
