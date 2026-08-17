export const GATEWAY_HEADER = "X-PostPrep-Gateway";
export const GATEWAY_SECRET_BINDING = "POSTPREP_GATEWAY_SECRET";
export const DEFAULT_PUBLIC_SITE_ORIGINS = Object.freeze([
  "https://senseixiaomisensei-sudo.github.io",
  "https://postprep-ae6.pages.dev",
]);

export function normalizedHttpOrigin(value) {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : "";
  } catch {
    return "";
  }
}

export function publicSiteOrigins(env) {
  const configured = env && typeof env.ALLOWED_ORIGINS === "string" ? env.ALLOWED_ORIGINS : "";
  const extraOrigins = configured.split(",").map(normalizedHttpOrigin).filter(Boolean);
  return new Set([...DEFAULT_PUBLIC_SITE_ORIGINS, ...extraOrigins]);
}

export function sameOrigin(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return false;
  const requestOrigin = new URL(request.url).origin;
  return origin === requestOrigin || publicSiteOrigins(env).has(origin);
}

export function responseHeaders(request, env, contentType = "application/json; charset=UTF-8") {
  const headers = {
    "Cache-Control": "no-store",
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
    Vary: "Origin",
  };
  const origin = request.headers.get("Origin");
  if (origin && sameOrigin(request, env)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

export function json(request, env, body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders(request, env) });
}

export function failure(request, env, status, code, message, details = {}) {
  return json(request, env, { code, message, details }, status);
}

export function verifyGateway(request, env) {
  const secret = env && typeof env[GATEWAY_SECRET_BINDING] === "string"
    ? env[GATEWAY_SECRET_BINDING].trim()
    : "";
  if (!secret) {
    return { error: { status: 503, code: "GATEWAY_NOT_CONFIGURED", message: "Cloud processing safeguards are not configured" } };
  }
  if (request.headers.get(GATEWAY_HEADER) !== secret) {
    return { error: { status: 403, code: "GATEWAY_NOT_ALLOWED", message: "Cloud processing must use the protected gateway" } };
  }
  return { ok: true };
}

export function configuredRvcBackend(env) {
  const endpoint = env && typeof env.RVC_INFERENCE_URL === "string" ? env.RVC_INFERENCE_URL.trim() : "";
  const token = env && typeof env.RVC_INFERENCE_TOKEN === "string" ? env.RVC_INFERENCE_TOKEN.trim() : "";
  if (!endpoint || !token) return null;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/v1/convert" || url.search || url.hash) return null;
    return { url, token };
  } catch {
    return null;
  }
}

export function validOutputJobId(value) {
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(String(value || ""));
}

export function validOutputToken(value) {
  return /^[A-Za-z0-9_-]{32,128}$/u.test(String(value || ""));
}

export async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}
