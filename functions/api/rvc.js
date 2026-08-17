import {
  configuredRvcBackend,
  failure,
  fetchWithTimeout,
  json,
  sameOrigin,
  validOutputJobId,
  validOutputToken,
  verifyGateway,
} from "./_rvc-shared.js";

const MAX_REQUEST_BYTES = 25 * 1024 * 1024;
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const ALLOWED_FIELDS = new Set([
  "modelId",
  "pitch",
  "indexRate",
  "protect",
  "f0Method",
  "format",
  "resample",
  "rmsMixRate",
  "filterRadius",
  "language",
  "audio",
]);
const ALLOWED_EXTENSIONS = new Set(["wav", "mp3", "m4a", "ogg", "webm"]);
const ALLOWED_MIME_TYPES = new Set([
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/ogg",
  "audio/webm",
]);
const ALLOWED_FORMATS = new Set(["wav", "mp3"]);
const ALLOWED_F0_METHODS = new Set(["rmvpe", "crepe", "fcpe", "harvest"]);
const ALLOWED_RESAMPLE = new Set(["0", "16000", "24000", "32000", "44100", "48000"]);

function declaredRequestIsTooLarge(request) {
  const contentLength = Number.parseInt(request.headers.get("Content-Length") || "", 10);
  return Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES;
}

function valueAsString(formData, field) {
  const values = formData.getAll(field);
  return values.length === 1 && typeof values[0] === "string" ? values[0].trim() : "";
}

function valueAsFile(formData, field) {
  const values = formData.getAll(field);
  const value = values.length === 1 ? values[0] : null;
  return value && typeof value === "object" && typeof value.arrayBuffer === "function" && typeof value.size === "number" ? value : null;
}

function extensionFor(file) {
  const match = String(file && file.name || "").toLowerCase().match(/\.([a-z0-9]+)$/u);
  return match ? match[1] : "";
}

function validAudio(file) {
  if (!file || file.size < 1 || file.size > MAX_AUDIO_BYTES) return false;
  const extension = extensionFor(file);
  const type = String(file.type || "").toLowerCase();
  return ALLOWED_EXTENSIONS.has(extension) && (!type || ALLOWED_MIME_TYPES.has(type));
}

function safeFilename(file, fallback) {
  const extension = extensionFor(file);
  return `${fallback}.${ALLOWED_EXTENSIONS.has(extension) ? extension : "wav"}`;
}

function validFormFields(formData) {
  for (const [field] of formData.entries()) {
    if (!ALLOWED_FIELDS.has(field)) return false;
  }
  return true;
}

function validModelId(value) {
  return /^[A-Za-z0-9_-]{1,64}$/u.test(String(value || ""));
}

function validInteger(value, min, max) {
  if (!/^-?\d+$/u.test(String(value))) return false;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max;
}

function validDecimal(value, min, max) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max;
}

function validInferencePayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  const jobId = typeof payload.jobId === "string" ? payload.jobId : "";
  const downloadToken = typeof payload.downloadToken === "string" ? payload.downloadToken : "";
  const expiresAt = typeof payload.expiresAt === "string" ? payload.expiresAt : "";
  const format = typeof payload.format === "string" && ALLOWED_FORMATS.has(payload.format) ? payload.format : "wav";
  const expiry = new Date(expiresAt);
  if (!validOutputJobId(jobId) || !validOutputToken(downloadToken)
    || Number.isNaN(expiry.getTime()) || expiry.getTime() <= Date.now() || expiry.getTime() > Date.now() + 24 * 60 * 60 * 1000) return null;
  return { jobId, downloadToken, expiresAt: expiry.toISOString(), format };
}

export async function onRequest(context) {
  const { request, env } = context;
  if (!sameOrigin(request, env)) return failure(request, env, 403, "ORIGIN_NOT_ALLOWED", "Origin is not allowed");
  const gateway = verifyGateway(request, env);
  if (gateway.error) return failure(request, env, gateway.error.status, gateway.error.code, gateway.error.message);
  if (request.method.toUpperCase() !== "POST") return failure(request, env, 405, "METHOD_NOT_ALLOWED", "Use POST for voice conversion");
  if (declaredRequestIsTooLarge(request)) return failure(request, env, 413, "RVC_AUDIO_TOO_LARGE", "The audio upload is too large");
  if (!String(request.headers.get("Content-Type") || "").toLowerCase().startsWith("multipart/form-data")) {
    return failure(request, env, 415, "UNSUPPORTED_MEDIA_TYPE", "Send a multipart conversion request");
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return failure(request, env, 400, "RVC_INVALID_FORM", "The conversion request could not be read");
  }
  if (!validFormFields(formData)) return failure(request, env, 400, "RVC_INVALID_FIELD", "The conversion request contains an unsupported field");

  const modelId = valueAsString(formData, "modelId");
  const pitch = valueAsString(formData, "pitch");
  const indexRate = valueAsString(formData, "indexRate");
  const protect = valueAsString(formData, "protect");
  const f0Method = valueAsString(formData, "f0Method");
  const format = valueAsString(formData, "format");
  const resample = valueAsString(formData, "resample");
  const rmsMixRate = valueAsString(formData, "rmsMixRate");
  const filterRadius = valueAsString(formData, "filterRadius");
  const requestedLanguage = valueAsString(formData, "language") === "en" ? "en" : "zh";
  const audio = valueAsFile(formData, "audio");

  if (!validModelId(modelId)) return failure(request, env, 400, "RVC_INVALID_MODEL", "Choose a supported character voice");
  if (!validInteger(pitch, -24, 24)) return failure(request, env, 400, "RVC_INVALID_PARAMETER", "Pitch must be between -24 and 24");
  if (!validDecimal(indexRate, 0, 1)) return failure(request, env, 400, "RVC_INVALID_PARAMETER", "Similarity must be between 0 and 1");
  if (!validDecimal(protect, 0, 0.5)) return failure(request, env, 400, "RVC_INVALID_PARAMETER", "Consonant protection must be between 0 and 0.5");
  if (!validDecimal(rmsMixRate, 0, 1)) return failure(request, env, 400, "RVC_INVALID_PARAMETER", "Volume tracking must be between 0 and 1");
  if (!ALLOWED_F0_METHODS.has(f0Method)) return failure(request, env, 400, "RVC_INVALID_PARAMETER", "Choose a supported f0 method");
  if (!ALLOWED_FORMATS.has(format)) return failure(request, env, 400, "RVC_INVALID_PARAMETER", "Choose a supported output format");
  if (!ALLOWED_RESAMPLE.has(resample)) return failure(request, env, 400, "RVC_INVALID_PARAMETER", "Choose a supported resample rate");
  if (!validInteger(filterRadius, 0, 7)) return failure(request, env, 400, "RVC_INVALID_PARAMETER", "Filter radius must be between 0 and 7");
  if (!validAudio(audio)) return failure(request, env, 400, "RVC_INVALID_AUDIO", "Use a permitted audio file");

  const backend = configuredRvcBackend(env);
  if (!backend) return failure(request, env, 503, "RVC_BACKEND_NOT_CONFIGURED", "Voice conversion is not configured");

  const upstreamBody = new FormData();
  upstreamBody.set("model_id", modelId);
  upstreamBody.set("pitch", pitch);
  upstreamBody.set("index_rate", indexRate);
  upstreamBody.set("protect", protect);
  upstreamBody.set("f0_method", f0Method);
  upstreamBody.set("format", format);
  upstreamBody.set("resample", resample);
  upstreamBody.set("rms_mix_rate", rmsMixRate);
  upstreamBody.set("filter_radius", filterRadius);
  upstreamBody.set("language", requestedLanguage);
  upstreamBody.set("audio", audio, safeFilename(audio, "input"));

  let upstream;
  try {
    upstream = await fetchWithTimeout(backend.url.toString(), {
      method: "POST",
      headers: { Authorization: `Bearer ${backend.token}` },
      body: upstreamBody,
    }, 170000);
  } catch (error) {
    return failure(request, env, error && error.name === "AbortError" ? 504 : 502, error && error.name === "AbortError" ? "RVC_BACKEND_TIMEOUT" : "RVC_BACKEND_UNAVAILABLE", "Voice conversion is temporarily unavailable");
  }

  const declaredResponseLength = Number.parseInt(upstream.headers.get("Content-Length") || "", 10);
  if (Number.isFinite(declaredResponseLength) && declaredResponseLength > 64 * 1024) {
    return failure(request, env, 502, "RVC_INVALID_OUTPUT", "Voice conversion returned an invalid response");
  }
  const responseText = await upstream.text().catch(() => "");
  if (responseText.length > 64 * 1024) return failure(request, env, 502, "RVC_INVALID_OUTPUT", "Voice conversion returned an invalid response");
  let payload;
  try {
    payload = JSON.parse(responseText);
  } catch {
    payload = null;
  }
  if (!upstream.ok) return failure(request, env, 502, "RVC_BACKEND_UNAVAILABLE", "Voice conversion is temporarily unavailable");
  const result = validInferencePayload(payload);
  if (!result) return failure(request, env, 502, "RVC_INVALID_OUTPUT", "Voice conversion returned an invalid response");
  return json(request, env, { ok: true, ...result });
}
