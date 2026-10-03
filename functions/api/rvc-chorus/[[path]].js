import { configuredRvcBackend, failure, fetchWithTimeout, sameOrigin, verifyGateway } from "../_rvc-shared.js";

export async function onRequest(context) {
  const { request, env } = context;
  if (!sameOrigin(request, env) || !verifyGateway(request, env).ok) {
    return failure(request, env, 403, "GATEWAY_NOT_ALLOWED", "Use the protected gateway");
  }
  const incoming = new URL(request.url);
  const suffix = incoming.pathname.replace(/^\/api\/rvc-chorus\//u, "");
  if (!/^(?:status|analyze|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}(?:\/convert|\/stem\/[1-4])?)$/iu.test(suffix)) {
    return failure(request, env, 404, "CHORUS_NOT_FOUND", "Unknown chorus route");
  }
  const post = suffix === "analyze" || suffix.endsWith("/convert");
  if (request.method !== (post ? "POST" : "GET")) return failure(request, env, 405, "METHOD_NOT_ALLOWED", "Unsupported method");
  const token = incoming.searchParams.get("token") || "";
  if (!["analyze", "status"].includes(suffix) && !/^[A-Za-z0-9_-]{32,128}$/u.test(token)) {
    return failure(request, env, 400, "INVALID_RVC_OUTPUT_TOKEN", "Invalid chorus session");
  }
  const limit = suffix === "analyze" ? 26 * 1024 * 1024 : 64 * 1024;
  const declared = Number(request.headers.get("Content-Length") || "0");
  if (post && declared > limit) return failure(request, env, 413, "CHORUS_REQUEST_TOO_LARGE", "Request is too large");
  const backend = configuredRvcBackend(env);
  if (!backend) return failure(request, env, 503, "RVC_BACKEND_NOT_CONFIGURED", "Chorus service is unavailable");
  backend.url.pathname = `/v1/chorus/${suffix}`;
  if (token) backend.url.searchParams.set("token", token);
  const headers = new Headers({ Authorization: `Bearer ${backend.token}` });
  if (post && request.headers.get("Content-Type")) headers.set("Content-Type", request.headers.get("Content-Type"));
  if (request.headers.get("Range")) headers.set("Range", request.headers.get("Range"));
  try {
    const upstream = await fetchWithTimeout(backend.url.toString(), { method: request.method,
      headers, body: post ? request.body : undefined }, 210000);
    return new Response(upstream.body, { status: upstream.status, headers: {
      "Content-Type": upstream.headers.get("Content-Type") || "application/json",
      "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
      "Access-Control-Allow-Origin": request.headers.get("Origin") || incoming.origin,
      "Accept-Ranges": upstream.headers.get("Accept-Ranges") || "none",
      ...(upstream.headers.get("Content-Range") ? {"Content-Range": upstream.headers.get("Content-Range")} : {}),
    }});
  } catch { return failure(request, env, 502, "CHORUS_UNAVAILABLE", "Chorus service is unavailable"); }
}
