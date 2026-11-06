import {
  configuredRvcBackend,
  failure,
  fetchWithTimeout,
  responseHeaders,
  sameOrigin,
  validOutputJobId,
  validOutputToken,
  verifyGateway,
} from "./_rvc-shared.js";

export async function onRequest(context) {
  const { request, env } = context;
  if (!sameOrigin(request, env)) return failure(request, env, 403, "ORIGIN_NOT_ALLOWED", "Origin is not allowed");
  const gateway = verifyGateway(request, env);
  if (gateway.error) return failure(request, env, gateway.error.status, gateway.error.code, gateway.error.message);
  if (request.method.toUpperCase() !== "GET") return failure(request, env, 405, "METHOD_NOT_ALLOWED", "Use GET for voice output");
  const url = new URL(request.url);
  const job = url.searchParams.get("job") || "";
  const token = url.searchParams.get("token") || "";
  if (!validOutputJobId(job) || !validOutputToken(token)) return failure(request, env, 400, "INVALID_RVC_OUTPUT_TOKEN", "Invalid voice output address");
  const backend = configuredRvcBackend(env);
  if (!backend) return failure(request, env, 503, "RVC_BACKEND_NOT_CONFIGURED", "Voice conversion is not configured");

  const outputUrl = new URL(`/v1/output/${encodeURIComponent(job)}`, backend.url.origin);
  outputUrl.searchParams.set("token", token);
  const upstreamHeaders = new Headers({ Authorization: `Bearer ${backend.token}` });
  const range = request.headers.get("Range");
  if (range && /^bytes=(?:\d+-\d*|-\d+)$/u.test(range)) upstreamHeaders.set("Range", range);
  let upstream;
  try {
    upstream = await fetchWithTimeout(outputUrl.toString(), { headers: upstreamHeaders }, 30000);
  } catch (error) {
    return failure(request, env, error && error.name === "AbortError" ? 504 : 502, "RVC_OUTPUT_UNAVAILABLE", "Voice output is temporarily unavailable");
  }
  const contentType = String(upstream.headers.get("Content-Type") || "").toLowerCase();
  if (upstream.status === 202 && contentType.startsWith("application/json")) {
    const body = await upstream.text();
    const headers = new Headers(responseHeaders(request, env));
    headers.set("Retry-After", upstream.headers.get("Retry-After") || "6");
    return new Response(body, { status: 202, headers });
  }
  if (upstream.status === 416) {
    const headers = new Headers(responseHeaders(request, env));
    const contentRange = upstream.headers.get("Content-Range");
    if (contentRange) headers.set("Content-Range", contentRange);
    return new Response(upstream.body, { status: 416, headers });
  }
  if (!upstream.ok || !contentType.startsWith("audio/")) return failure(request, env, 502, "RVC_OUTPUT_UNAVAILABLE", "Voice output is temporarily unavailable");
  const headers = new Headers(responseHeaders(request, env, contentType));
  for (const name of ["Accept-Ranges", "Content-Length", "Content-Range"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("Content-Disposition", `attachment; filename="postprep-rvc-audio.${contentType.startsWith("audio/mpeg") ? "mp3" : "wav"}"`);
  const actualF0 = upstream.headers.get("X-RVC-F0-Method") || "";
  if (/^(rmvpe|fcpe|pm)(\+(rmvpe|fcpe|pm))*$/u.test(actualF0)) headers.set("X-RVC-F0-Method", actualF0);
  headers.set("X-RVC-Mix-Revision", upstream.headers.get("X-RVC-Mix-Revision") || "0");
  const speechSteps = upstream.headers.get("X-RVC-Speech-Steps") || "";
  if (/^(?:[1-9]\d?|1\d\d|200)$/u.test(speechSteps)) headers.set("X-RVC-Speech-Steps", speechSteps);
  for (const name of ["X-RVC-Engine", "X-RVC-Engine-Revision", "X-RVC-Reference-Sha256", "X-RVC-Backend-Build"]) {
    const value = upstream.headers.get(name) || "";
    if (/^[a-zA-Z0-9_-]{1,80}$/u.test(value)) headers.set(name, value);
  }
  headers.set("X-RVC-Remix-Available", upstream.headers.get("X-RVC-Remix-Available") === "true" ? "true" : "false");
  headers.set("Referrer-Policy", "no-referrer");
  return new Response(upstream.body, { status: upstream.status, headers });
}
