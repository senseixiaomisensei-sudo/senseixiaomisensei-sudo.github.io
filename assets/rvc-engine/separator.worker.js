// Module worker: on-device vocal/accompaniment separation for the offline
// cover fallback. Receives model bytes + 44.1 kHz stereo PCM, returns stems.
// WebGPU is used when available and verified; otherwise WASM SIMD.
import * as ort from "./ort126/ort.min.mjs";
import { separateStereo, MDX_CONFIG } from "./song-separator.mjs";

let cancelled = false;

function post(type, payload = {}, transfer = []) {
  self.postMessage({ type, ...payload }, transfer);
}

async function createSession(modelBytes, backend, wasmBase) {
  ort.env.wasm.wasmPaths = wasmBase;
  ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
  const options = {
    executionProviders: backend === "webgpu" ? [{ name: "webgpu" }] : ["wasm"],
    graphOptimizationLevel: "all",
    freeDimensionOverrides: { batch_size: 1 },
  };
  return ort.InferenceSession.create(new Uint8Array(modelBytes), options);
}

function runner(session) {
  const inName = session.inputNames[0];
  const outName = session.outputNames[0];
  return async (spec, dims) => {
    const result = await session.run({ [inName]: new ort.Tensor("float32", spec, dims) });
    const tensor = result[outName];
    const data = tensor.location && tensor.location !== "cpu" ? await tensor.getData() : tensor.data;
    return data;
  };
}

// Some mobile GPU drivers (documented for Adreno 6xx with onnxruntime-web)
// silently corrupt this U-Net on WebGPU. Compare the first chunk against
// WASM once per worker and fall back when they disagree.
function relativeError(a, b) {
  let num = 0;
  let den = 0;
  for (let i = 0; i < a.length; i += 97) {
    const d = a[i] - b[i];
    num += d * d;
    den += b[i] * b[i];
  }
  return den > 0 ? Math.sqrt(num / den) : 0;
}

self.onmessage = async (event) => {
  const msg = event.data || {};
  if (msg.type === "cancel") {
    cancelled = true;
    return;
  }
  if (msg.type !== "separate") return;
  cancelled = false;
  const started = performance.now();
  try {
    const { modelBytes, left, right, wasmBase, preferWebGPU = true, verifyWebGPU = true } = msg;
    let backend = "wasm";
    let session = null;
    if (preferWebGPU && self.navigator?.gpu) {
      try {
        session = await createSession(modelBytes, "webgpu", wasmBase);
        backend = "webgpu";
      } catch (error) {
        post("log", { message: `WebGPU unavailable for separation: ${error?.message || error}` });
        session = null;
      }
    }
    let run = session ? runner(session) : null;
    if (session && verifyWebGPU) {
      let checked = false;
      const gpuRun = run;
      run = async (spec, dims) => {
        const out = await gpuRun(spec, dims);
        if (checked) return out;
        checked = true;
        post("stage", { stage: "verify" });
        const cpu = await createSession(modelBytes, "wasm", wasmBase);
        const ref = await runner(cpu)(spec, dims);
        const err = relativeError(out, ref);
        if (!(err < 0.02)) {
          post("log", { message: `WebGPU output mismatch (${err.toFixed(4)}); using WASM.` });
          backend = "wasm";
          try { await session.release(); } catch {}
          session = cpu;
          run = runner(cpu);
          return ref;
        }
        try { await cpu.release(); } catch {}
        return out;
      };
    }
    if (!session) {
      session = await createSession(modelBytes, "wasm", wasmBase);
      run = runner(session);
    }
    post("stage", { stage: "separating", backend });
    const { vocals, instrumental } = await separateStereo(left, right, (spec, dims) => run(spec, dims), {
      config: MDX_CONFIG,
      onProgress: (current, total) => post("progress", { current, total, backend }),
      shouldCancel: () => cancelled,
      inPlaceInstrumental: true,
    });
    try { await session.release(); } catch {}
    post(
      "done",
      {
        backend,
        seconds: (performance.now() - started) / 1000,
        vocals,
        instrumental,
      },
      [vocals[0].buffer, vocals[1].buffer, instrumental[0].buffer, instrumental[1].buffer],
    );
  } catch (error) {
    post("error", { message: String(error?.message || error) });
  }
};
