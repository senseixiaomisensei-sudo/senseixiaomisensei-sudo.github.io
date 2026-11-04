import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectMp3Duration } from '../assets/rvc-mp3-duration.mjs';

function frames(count, header = [0xff, 0xfb, 0x90, 0]) {
  const frame = new Uint8Array(417); // MPEG-1 Layer III, 128 kbps, 44.1 kHz
  frame.set(header);
  return Array.from({length:count}, () => frame);
}

test('counts actual MP3 frames across bounded reads, ignoring stale Xing data', async () => {
  const blocks = frames(7000);
  blocks[0] = blocks[0].slice();
  blocks[0].set(new TextEncoder().encode('Xing'), 36);
  blocks[0].set([0,0,0,1,0,0,0,10], 40);
  const source = new Blob(blocks, {type:'audio/mpeg'});
  let largestRead = 0;
  const file = {size:source.size, slice(start,end){largestRead=Math.max(largestRead,end-start);return source.slice(start,end);}};
  const result = await inspectMp3Duration(file);
  assert.equal(result.frames, 7000);
  assert.ok(Math.abs(result.duration - 7000 * 1152 / 44100) < 1e-8);
  assert.ok(largestRead <= 256 * 1024);
});

test('handles ID3 tags and MPEG-2 frames without counting tags as audio', async () => {
  const tag = new Uint8Array([0x49,0x44,0x33,4,0,0,0,0,0,5,1,2,3,4,5]);
  const tail = new Uint8Array(128); tail.set([0x54,0x41,0x47]);
  const result = await inspectMp3Duration(new Blob([tag,...frames(10),tail]));
  assert.equal(result.frames, 10);
  const mpeg2 = new Uint8Array(208); mpeg2.set([0xff,0xf3,0x80,0]); // 64 kbps, 22.05 kHz
  const lowerRate = await inspectMp3Duration(new Blob(Array(10).fill(mpeg2)));
  assert.equal(lowerRate.frames, 10);
  assert.ok(Math.abs(lowerRate.duration - 10*576/22050) < 1e-8);
});

test('does not invent durations for malformed, truncated or unrelated files', async () => {
  assert.equal(await inspectMp3Duration(new Blob(['not an audio file'])), null);
  const damaged = frames(20); damaged[10] = damaged[10].slice(); damaged[10][0] = 0;
  assert.equal(await inspectMp3Duration(new Blob(damaged)), null);
  const clipped = frames(20); clipped[19] = clipped[19].slice(0,100);
  assert.equal(await inspectMp3Duration(new Blob(clipped)), null);
});
