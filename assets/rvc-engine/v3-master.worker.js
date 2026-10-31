// Module Worker for the v3 on-device master (loudness match + true-peak
// limiter). Keeps the O(n * taps) oversampling off the main thread.
import { masterMix } from "./v3-master.mjs";

self.onmessage = (event) => {
  const { type, mix, rate, reference, options } = event.data || {};
  if (type !== "MASTER") return;
  try {
    const { channels, report } = masterMix(mix, rate, reference, options || {});
    self.postMessage({ ok: true, channels, report }, channels.map((c) => c.buffer));
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
