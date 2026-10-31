import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  integratedLufs, masterMix, truePeakDb, truePeakLimit, v3MasterEnabled,
} from "../assets/rvc-engine/v3-master.mjs";

const tone = (seconds, rate, amp, hz = 997) => {
  const x = new Float32Array(Math.round(seconds * rate));
  for (let i = 0; i < x.length; i += 1) x[i] = amp * Math.sin(2 * Math.PI * hz * i / rate);
  return x;
};

test("v3 master LUFS matches the BS.1770 997 Hz reference", () => {
  const rate = 48000;
  const x = tone(4, rate, 0.1);
  assert.ok(Math.abs(integratedLufs([x], rate) - -23) < 0.3);
  assert.ok(Math.abs(integratedLufs([x, x], rate) - -20) < 0.3);
});

test("v3 true-peak limiter reaches the ceiling and leaves quiet audio untouched", () => {
  const rate = 44100;
  const loud = tone(1, rate, 1.6);
  const { channels } = truePeakLimit([loud, loud], rate, { ceilingDb: -1 });
  assert.ok(truePeakDb(channels) <= -0.99, `tp ${truePeakDb(channels)}`);
  const quiet = tone(1, rate, 0.1);
  const out = truePeakLimit([quiet], rate, { ceilingDb: -1 });
  assert.equal(out.reducedSamples, 0);
  assert.deepEqual(Array.from(out.channels[0].subarray(0, 64)), Array.from(quiet.subarray(0, 64)));
});

test("v3 true-peak meter sees inter-sample overs a sample-peak meter misses", () => {
  const rate = 44100;
  // fs/4 tone at 45 degrees: samples peak at 0.707 of the true crest
  const x = new Float32Array(4410);
  for (let i = 0; i < x.length; i += 1) x[i] = Math.sin(Math.PI / 2 * i + Math.PI / 4);
  const tp = truePeakDb([x]);
  assert.ok(tp > -0.5 && tp < 0.5, `tp ${tp}`);
});

test("v3 master matches loudness within +-6 dB and is bounded", () => {
  const rate = 44100;
  const reference = [tone(3, rate, 0.4, 440), tone(3, rate, 0.4, 440)];
  const mix = [tone(3, rate, 0.1, 440), tone(3, rate, 0.1, 440)];
  const { channels, report } = masterMix(mix, rate, reference);
  assert.ok(Math.abs(report.loudnessGainDb - 6) < 1e-9, `gain ${report.loudnessGainDb}`); // 12 dB asked, clamped
  assert.ok(report.truePeakDb <= -0.99);
  const unmatched = masterMix(mix, rate, reference, { matchLoudness: false });
  assert.equal(unmatched.report.loudnessGainDb, undefined);
  assert.equal(channels.length, 2);
});

test("v3 master is opt-out and runs in a module worker", async () => {
  assert.equal(v3MasterEnabled({}), true);
  assert.equal(v3MasterEnabled({ localStorage: { getItem: () => "0" } }), false);
  assert.equal(v3MasterEnabled({ location: { href: "https://x.test/rvc.html?v3master=0" } }), false);
  const worker = await readFile(new URL("../assets/rvc-engine/v3-master.worker.js", import.meta.url), "utf8");
  assert.match(worker, /import \{ masterMix \} from "\.\/v3-master\.mjs"/u);
  assert.match(worker, /postMessage\(\{ ok: true, channels, report \}, channels\.map/u);
});
