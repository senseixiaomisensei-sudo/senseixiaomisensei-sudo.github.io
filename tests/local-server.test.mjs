import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, copyFile, symlink, rm } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

function request(port, path) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
  });
}

test('local server uses its own directory, serves theme assets and rejects path escapes', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'postprep-server-'));
  const root = join(temp, 'site');
  await mkdir(join(root, 'assets'), { recursive: true });
  await copyFile(new URL('../serve.js', import.meta.url), join(root, 'serve.mjs'));
  await writeFile(join(root, 'rvc.html'), 'voice page');
  await writeFile(join(root, '.env'), 'private');
  await writeFile(join(root, 'assets', 'style.css'), 'body{}');
  await writeFile(join(root, 'assets', 'type.woff2'), 'font');
  await writeFile(join(root, 'assets', 'flower.webp'), 'image');
  await writeFile(join(temp, 'private.txt'), 'outside site');
  let symlinkAvailable = true;
  try { await symlink(join(temp, 'private.txt'), join(root, 'assets', 'outside.txt')); } catch { symlinkAvailable = false; }
  const child = spawn(process.execPath, [join(root, 'serve.mjs')], { cwd: temp, env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const port = await new Promise((resolve, reject) => {
      let text = '';
      const timeout = setTimeout(() => reject(Error('server did not start')), 5000);
      child.once('error', reject);
      child.stdout.on('data', data => {
        text += data;
        const match = text.match(/localhost:(\d+)\/rvc\.html/);
        if (match) { clearTimeout(timeout); resolve(Number(match[1])); }
      });
    });
    assert.equal((await request(port, '/')).body, 'voice page');
    assert.match((await request(port, '/assets/style.css')).type, /^text\/css/);
    assert.equal((await request(port, '/assets/type.woff2')).type, 'font/woff2');
    assert.equal((await request(port, '/assets/flower.webp')).type, 'image/webp');
    assert.equal((await request(port, '/..%2Fprivate.txt')).status, 403);
    assert.equal((await request(port, '/.env')).status, 403);
    assert.equal((await request(port, '/%E0%A4')).status, 400);
    if (symlinkAvailable) assert.equal((await request(port, '/assets/outside.txt')).status, 403);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      await new Promise(resolve => { child.once('exit', resolve); child.kill(); });
    }
    await rm(temp, { recursive: true, force: true });
  }
});
