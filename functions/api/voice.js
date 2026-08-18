import {
  configuredVoiceBackend,
  failure,
  fetchWithTimeout,
  json,
  sameOrigin,
  validOutputJobId,
  validOutputToken,
  verifyGateway,
  verifyTurnstile,
} from "./_voice-shared.js";

const MAX_REQUEST_BYTES = 45 * 1024 * 1024;
const MAX_REFERENCE_BYTES = 20 * 1024 * 1024;
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const MAX_TEXT_CHARS = 1000;
const REQUIRED_RIGHTS_DECLARATION = "I HAVE THE RIGHTS";
const ALLOWED_MODES = new Set(["read", "cover"]);
const ALLOWED_RIGHTS_SCOPES = new Set(["self", "written-permission", "original-fictional"]);
const ALLOWED_FIELDS = new Set([
  "mode",
  "text",
  "referenceAudio",
  "sourceAudio",
  "rightsScope",
  "rightsDeclaration",
  "aiDisclosure",
  "language",
  "turnstileToken",
]);
const ALLOWED_EXTENSIONS = new Set(["wav", "mp3", "m4a", "ogg"]);
const ALLOWED_MIME_TYPES = new Set([
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/ogg",
]);

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

function validAudio(file, maxBytes) {
  if (!file || file.size < 1 || file.size > maxBytes) return false;
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

function validInferencePayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  const jobId = typeof payload.jobId === "string" ? payload.jobId : "";
  const downloadToken = typeof payload.downloadToken === "string" ? payload.downloadToken : "";
  const expiresAt = typeof payload.expiresAt === "string" ? payload.expiresAt : "";
  const expiry = new Date(expiresAt);
  if (!validOutputJobId(jobId) || !validOutputToken(downloadToken)
    || Number.isNaN(expiry.getTime()) || expiry.getTime() <= Date.now() || expiry.getTime() > Date.now() + 24 * 60 * 60 * 1000) return null;
  return { jobId, downloadToken, expiresAt: expiry.toISOString() };
}

export async function onRequest(context) {
  const { request, env } = context;
  if (!sameOrigin(request, env)) return failure(request, env, 403, "ORIGIN_NOT_ALLOWED", "Origin is not allowed");
  const gateway = verifyGateway(request, env);
  if (gateway.error) return failure(request, env, gateway.error.status, gateway.error.code, gateway.error.message);
  if (request.method.toUpperCase() !== "POST") return failure(request, env, 405, "METHOD_NOT_ALLOWED", "Use POST for voice processing");
  if (declaredRequestIsTooLarge(request)) return failure(request, env, 413, "VOICE_AUDIO_TOO_LARGE", "The voice upload is too large");
  if (!String(request.headers.get("Content-Type") || "").toLowerCase().startsWith("multipart/form-data")) {
    return failure(request, env, 415, "UNSUPPORTED_MEDIA_TYPE", "Send a multipart voice request");
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return failure(request, env, 400, "VOICE_INVALID_FORM", "The voice request could not be read");
  }
  if (!validFormFields(formData)) return failure(request, env, 400, "VOICE_INVALID_FIELD", "The voice request contains an unsupported field");

  const mode = valueAsString(formData, "mode");
  const text = valueAsString(formData, "text");
  const referenceAudio = valueAsFile(formData, "referenceAudio");
  const sourceAudio = valueAsFile(formData, "sourceAudio");
  const rightsScope = valueAsString(formData, "rightsScope");
  const rightsDeclaration = valueAsString(formData, "rightsDeclaration");
  const aiDisclosure = valueAsString(formData, "aiDisclosure");
  const requestedLanguage = valueAsString(formData, "language") === "en" ? "en" : "zh";
  const turnstileToken = valueAsString(formData, "turnstileToken");

  if (!ALLOWED_MODES.has(mode)) return failure(request, env, 400, "VOICE_INVALID_MODE", "Choose a supported voice mode");
  if (!validAudio(referenceAudio, MAX_REFERENCE_BYTES)) return failure(request, env, 400, "VOICE_INVALID_AUDIO", "Use a permitted reference audio file");
  if (mode === "cover" && !validAudio(sourceAudio, MAX_SOURCE_BYTES)) {
    return failure(request, env, 400, "VOICE_INVALID_AUDIO", "Use a permitted source dry-vocal file");
  }
  if (mode === "read" && (!text || text.length > MAX_TEXT_CHARS)) {
    return failure(request, env, 400, "VOICE_INVALID_TEXT", "Enter a supported amount of text");
  }
  if (mode === "read" && sourceAudio) return failure(request, env, 400, "VOICE_INVALID_FIELD", "Source audio is not used for text reading");
  if (!ALLOWED_RIGHTS_SCOPES.has(rightsScope) || rightsDeclaration !== REQUIRED_RIGHTS_DECLARATION) {
    return failure(request, env, 403, "VOICE_RIGHTS_CONFIRMATION_REQUIRED", "Confirm the rights required to use this voice");
  }
  if (aiDisclosure !== "confirmed") return failure(request, env, 403, "VOICE_AI_DISCLOSURE_REQUIRED", "Confirm AI-generated-audio disclosure");
  if (referenceAudio.size + (sourceAudio ? sourceAudio.size : 0) > MAX_REQUEST_BYTES) {
    return failure(request, env, 413, "VOICE_AUDIO_TOO_LARGE", "The combined voice upload is too large");
  }

  const humanVerification = await verifyTurnstile(env, request, turnstileToken);
  if (humanVerification.error) return failure(request, env, humanVerification.error.status, humanVerification.error.code, humanVerification.error.message);
  const backend = configuredVoiceBackend(env);
  if (!backend) return failure(request, env, 503, "VOICE_BACKEND_NOT_CONFIGURED", "Voice generation is not configured");

  const upstreamBody = new FormData();
  upstreamBody.set("mode", mode);
  upstreamBody.set("rights_scope", rightsScope);
  upstreamBody.set("rights_declaration", REQUIRED_RIGHTS_DECLARATION);
  upstreamBody.set("ai_disclosure", "confirmed");
  upstreamBody.set("language", requestedLanguage);
  upstreamBody.set("reference_audio", referenceAudio, safeFilename(referenceAudio, "reference"));
  if (mode === "read") upstreamBody.set("text", text);
  if (mode === "cover") upstreamBody.set("source_audio", sourceAudio, safeFilename(sourceAudio, "source"));

  let upstream;
  try {
    upstream = await fetchWithTimeout(backend.url.toString(), {
      method: "POST",
      headers: { Authorization: `Bearer ${backend.token}` },
      body: upstreamBody,
    }, 110000);
  } catch (error) {
    return failure(request, env, error && error.name === "AbortError" ? 504 : 502, error && error.name === "AbortError" ? "VOICE_BACKEND_TIMEOUT" : "VOICE_BACKEND_UNAVAILABLE", "Voice generation is temporarily unavailable");
  }

  const declaredResponseLength = Number.parseInt(upstream.headers.get("Content-Length") || "", 10);
  if (Number.isFinite(declaredResponseLength) && declaredResponseLength > 64 * 1024) {
    return failure(request, env, 502, "VOICE_INVALID_OUTPUT", "Voice generation returned an invalid response");
  }
  const responseText = await upstream.text().catch(() => "");
  if (responseText.length > 64 * 1024) return failure(request, env, 502, "VOICE_INVALID_OUTPUT", "Voice generation returned an invalid response");
  let payload;
  try {
    payload = JSON.parse(responseText);
  } catch {
    payload = null;
  }
  if (!upstream.ok) return failure(request, env, 502, "VOICE_BACKEND_UNAVAILABLE", "Voice generation is temporarily unavailable");
  const result = validInferencePayload(payload);
  if (!result) return failure(request, env, 502, "VOICE_INVALID_OUTPUT", "Voice generation returned an invalid response");
  return json(request, env, { ok: true, ...result });
}
