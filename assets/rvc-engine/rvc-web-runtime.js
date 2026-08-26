const DEFAULT_CDN_BASE = `https://cdn.jsdelivr.net/npm/rvc-web-runtime@${"1.0.5"}/dist/`;
const DEFAULT_ORT_CDN_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${"1.26.0"}/dist/`;
function createRVC(config = {}) {
  const rawAsset = config.assetBaseUrl ?? DEFAULT_CDN_BASE;
  const assetBaseUrl = rawAsset.endsWith("/") ? rawAsset : `${rawAsset}/`;
  const workerUrl = `${assetBaseUrl}inference.worker.js?v=20260826-v39`;
  const rawWasm = config.wasmBaseUrl ?? DEFAULT_ORT_CDN_BASE;
  const wasmBaseUrl = typeof rawWasm === "string"
    ? (rawWasm.endsWith("/") ? rawWasm : `${rawWasm}/`)
    : rawWasm;
  return {
    assetBaseUrl,
    workerUrl,
    wasmBaseUrl
  };
}
class RvcError extends Error {
  code;
  cause;
  constructor(code, message, cause) {
    super(message);
    this.code = code;
    this.cause = cause;
    this.name = "WebRvcError";
    Object.setPrototypeOf(this, RvcError.prototype);
  }
}
async function createWorkerUrl(workerScriptUrl) {
  const response = await fetch(workerScriptUrl);
  if (!response.ok) {
    throw new RvcError(
      "WORKER_FETCH_FAILED",
      `Failed to fetch worker script from ${workerScriptUrl}: ${response.status}`
    );
  }
  const code = await response.text();
  const blob = new Blob([code], { type: "application/javascript" });
  return URL.createObjectURL(blob);
}
async function runPipelineInWorker(ctx, files, audioData, audioSampleRate, callbacks = {}, options = {}) {
  const { timeout = 3e5, ...pipelineOptions } = options;
  const [modelBuf, contentVecBuf, rmvpeBuf, indexBuf, workerUrl] = await Promise.all([
    files.model.arrayBuffer(),
    files.contentVec.arrayBuffer(),
    files.rmvpe.arrayBuffer(),
    files.index?.arrayBuffer(),
    createWorkerUrl(ctx.workerUrl)
  ]);
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerUrl, {
      type: "module"
    });
    const timeoutId = setTimeout(() => {
      worker.terminate();
      reject(new RvcError("WORKER_TIMEOUT", `Pipeline timed out after ${timeout}ms`));
    }, timeout);
    worker.onmessage = (event) => {
      const { type } = event.data;
      switch (type) {
        case "EVENT": {
          callbacks.onEvent?.(event.data.event);
          break;
        }
        case "COMPLETE": {
          clearTimeout(timeoutId);
          worker.terminate();
          resolve(event.data.result);
          break;
        }
        case "ERROR": {
          clearTimeout(timeoutId);
          worker.terminate();
          const { code, error } = event.data;
          reject(new RvcError(code, error));
          break;
        }
        case "LOG": {
          const { level, message } = event.data;
          console[level](message);
          break;
        }
      }
    };

    // Clone audio buffer for transfer to ensure caller's audio buffer is NEVER detached
    let audioPayload = audioData;
    let audioBuf = null;
    if (audioData instanceof Float32Array) {
      const copy = new Float32Array(audioData.length);
      copy.set(audioData);
      audioPayload = copy;
      audioBuf = copy.buffer;
    } else if (audioData?.buffer instanceof ArrayBuffer) {
      const copyBuf = audioData.buffer.slice(0);
      audioPayload = new Float32Array(copyBuf);
      audioBuf = copyBuf;
    }

    const transferables = [
      modelBuf,
      contentVecBuf,
      rmvpeBuf,
      ...(indexBuf ? [indexBuf] : []),
      audioBuf
    ].filter(b => b instanceof ArrayBuffer && b.byteLength > 0);

    worker.postMessage(
      {
        type: "RUN_PIPELINE",
        wasmBaseUrl: ctx.wasmBaseUrl,
        audio: {
          data: audioPayload,
          sampleRate: audioSampleRate
        },
        files: {
          model: modelBuf,
          contentVec: contentVecBuf,
          rmvpe: rmvpeBuf,
          index: indexBuf
        },
        fileNames: {
          model: files.model.name,
          contentVec: files.contentVec.name,
          rmvpe: files.rmvpe.name,
          index: files.index?.name
        },
        options: pipelineOptions
      },
      transferables
    );
  });
}
function isWorkerSupported() {
  return typeof Worker !== "undefined";
}
const ErrorCodes = {
  AUDIO_FILE_EMPTY: "AUDIO_FILE_EMPTY",
  AUDIO_INVALID_TYPE: "AUDIO_INVALID_TYPE",
  AUDIO_FILE_READ_FAILED: "AUDIO_FILE_READ_FAILED",
  AUDIO_DECODE_FAILED: "AUDIO_DECODE_FAILED",
  AUDIO_RESAMPLE_INVALID_RATE: "AUDIO_RESAMPLE_INVALID_RATE"
};
const SUPPORTED_AUDIO_TYPES = /* @__PURE__ */ new Set(["audio/mpeg", "audio/wav", "audio/wave", "audio/x-wav"]);
const SUPPORTED_AUDIO_EXTENSIONS = /* @__PURE__ */ new Set([".mp3", ".wav"]);
async function readAsArrayBuffer(file) {
  validateAudioFile(file);
  try {
    return await file.arrayBuffer();
  } catch (cause) {
    throw new RvcError(
      ErrorCodes.AUDIO_FILE_READ_FAILED,
      `Failed to read audio file "${file.name}".`,
      cause
    );
  }
}
function validateAudioFile(file) {
  if (file.size === 0) {
    throw new RvcError(ErrorCodes.AUDIO_FILE_EMPTY, `The audio file "${file.name}" is empty.`);
  }
  const mime = file.type.toLowerCase();
  const extension = getFileExtension(file.name);
  const mimeAllowed = mime.length > 0 && SUPPORTED_AUDIO_TYPES.has(mime);
  const extensionAllowed = SUPPORTED_AUDIO_EXTENSIONS.has(extension);
  if (!mimeAllowed && !extensionAllowed) {
    throw new RvcError(
      ErrorCodes.AUDIO_INVALID_TYPE,
      `Unsupported audio file "${file.name}". Only mp3/wav are allowed.`
    );
  }
}
function getFileExtension(name) {
  const dot = name.lastIndexOf(".");
  if (dot < 0) {
    return "";
  }
  return name.slice(dot).toLowerCase();
}
async function decodeToAudioBuffer(buffer) {
  if (buffer.byteLength === 0) {
    throw new RvcError(
      ErrorCodes.AUDIO_DECODE_FAILED,
      "Failed to decode audio: input buffer is empty."
    );
  }
  const ctx = createAudioContext();
  try {
    return await ctx.decodeAudioData(buffer.slice(0));
  } catch (cause) {
    throw new RvcError(ErrorCodes.AUDIO_DECODE_FAILED, "Failed to decode audio data.", cause);
  } finally {
    try {
      await ctx.close();
    } catch {
    }
  }
}
function createAudioContext() {
  const g = globalThis;
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  if (!Ctor) {
    throw new RvcError(
      ErrorCodes.AUDIO_DECODE_FAILED,
      "Failed to decode audio: AudioContext is not supported in this environment."
    );
  }
  try {
    return new Ctor();
  } catch (cause) {
    throw new RvcError(
      ErrorCodes.AUDIO_DECODE_FAILED,
      "Failed to initialize AudioContext for decoding.",
      cause
    );
  }
}
function downmixToMono(audioBuffer) {
  if (audioBuffer.numberOfChannels === 1) {
    return new Float32Array(audioBuffer.getChannelData(0));
  }
  const mono = new Float32Array(audioBuffer.length);
  const channels = audioBuffer.numberOfChannels;
  for (let c = 0; c < channels; c += 1) {
    const ch = audioBuffer.getChannelData(c);
    for (let i = 0; i < audioBuffer.length; i += 1) {
      mono[i] += ch[i] / channels;
    }
  }
  return mono;
}
function resampleTo16k(data, originalRate) {
  const TARGET_RATE = 16e3;
  const resampled = resampleAudio(data, originalRate, TARGET_RATE);
  return { audio: resampled, sampleRate: TARGET_RATE };
}
function resampleAudio(data, originalRate, targetRate) {
  if (!Number.isFinite(originalRate) || originalRate <= 0) {
    throw new RvcError(
      ErrorCodes.AUDIO_RESAMPLE_INVALID_RATE,
      `Invalid input sample rate: ${originalRate}.`
    );
  }
  if (!Number.isFinite(targetRate) || targetRate <= 0) {
    throw new RvcError(
      ErrorCodes.AUDIO_RESAMPLE_INVALID_RATE,
      `Invalid target sample rate: ${targetRate}.`
    );
  }
  if (originalRate === targetRate) {
    return data;
  }
  if (data.length === 0) {
    return new Float32Array(0);
  }
  const ratio = originalRate / targetRate;
  const outputLength = Math.max(1, Math.round(data.length / ratio));
  const output = new Float32Array(outputLength);
  const lastIndex = data.length - 1;
  for (let i = 0; i < outputLength; i += 1) {
    const sourcePos = i * ratio;
    const left = Math.floor(sourcePos);
    const right = Math.min(left + 1, lastIndex);
    const t = sourcePos - left;
    output[i] = data[left] * (1 - t) + data[right] * t;
  }
  return output;
}
async function prepareInputAudio(file) {
  const bytes = await readAsArrayBuffer(file);
  const decoded = await decodeToAudioBuffer(bytes);
  const mono = downmixToMono(decoded);
  const audio16k = resampleTo16k(mono, decoded.sampleRate);
  return { audio: audio16k.audio, sampleRate: audio16k.sampleRate };
}
export {
  createRVC,
  isWorkerSupported,
  prepareInputAudio,
  runPipelineInWorker
};
//# sourceMappingURL=index.js.map
