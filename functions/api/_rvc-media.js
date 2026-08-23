import {
  configuredRvcBackend,
  failure,
  fetchWithTimeout,
  responseHeaders,
  sameOrigin,
  validOutputJobId,
  validOutputToken,
} from "./_rvc-shared.js";

const SAFE_RANGE = /^bytes=\d*-\d*$/u;

function allowedMediaRequest(request, env) {
  if (request.headers.get("Origin")) return sameOrigin(request, env);

  // Chromium omits Origin on a same-origin GET made by <audio crossorigin>,
  // while still sending the Fetch Metadata headers and a same-origin referrer.
  // Accept only that exact browser navigation shape; the random output token
  // remains the short-lived capability for the generated file itself.
  let referrerOrigin = "";
  try {
    referrerOrigin = new URL(request.headers.get("Referer") || "").origin;
  } catch {
    return false;
  }
  return referrerOrigin === new URL(request.url).origin
    && request.headers.get("Sec-Fetch-Site") === "same-origin"
    && request.headers.get("Sec-Fetch-Mode") === "cors"
    && request.headers.get("Sec-Fetch-Dest") === "audio";
}

export async function serveRvcMedia(context) {
  const { request, env, params = {} } = context;
  if (!allowedMediaRequest(request, env)) return failure(request, env, 403, "ORIGIN_NOT_ALLOWED", "Origin is not allowed");
  if (request.method.toUpperCase() !== "GET") return failure(request, env, 405, "METHOD_NOT_ALLOWED", "Use GET for voice playback");

  const job = String(params.job || "");
  const token = new URL(request.url).searchParams.get("token") || "";
  if (!validOutputJobId(job) || !validOutputToken(token)) {
    return failure(request, env, 404, "RVC_MEDIA_NOT_FOUND", "Voice playback is not available");
  }

  const backend = configuredRvcBackend(env);
  if (!backend) return failure(request, env, 503, "RVC_BACKEND_NOT_CONFIGURED", "Voice conversion is not configured");

  const outputUrl = new URL(`/v1/output/${encodeURIComponent(job)}`, backend.url.origin);
  outputUrl.searchParams.set("token", token);
  const upstreamHeaders = { Authorization: `Bearer ${backend.token}` };
  const range = String(request.headers.get("Range") || "").trim();
  if (range && SAFE_RANGE.test(range)) upstreamHeaders.Range = range;

  let upstream;
  try {
    upstream = await fetchWithTimeout(outputUrl.toString(), { headers: upstreamHeaders }, 30000);
  } catch (error) {
    return failure(request, env, error && error.name === "AbortError" ? 504 : 502, "RVC_MEDIA_UNAVAILABLE", "Voice playback is temporarily unavailable");
  }

  const contentType = String(upstream.headers.get("Content-Type") || "").toLowerCase();
  if (![200, 206].includes(upstream.status) || !contentType.startsWith("audio/")) {
    return failure(request, env, upstream.status === 404 ? 404 : 502, "RVC_MEDIA_UNAVAILABLE", "Voice playback is temporarily unavailable");
  }

  const headers = new Headers(responseHeaders(request, env, contentType));
  headers.set("Cache-Control", "private, no-store, max-age=0");
  headers.set("Content-Disposition", 'inline; filename="postprep-rvc-preview"');
  headers.set("Referrer-Policy", "no-referrer");
  for (const name of ["Accept-Ranges", "Content-Length", "Content-Range"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}
