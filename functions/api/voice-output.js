import {
  configuredVoiceBackend,
  failure,
  fetchWithTimeout,
  responseHeaders,
  sameOrigin,
  validOutputJobId,
  validOutputToken,
  verifyGateway,
} from "./_voice-shared.js";

export async function onRequest(context) {
  const { request, env } = context;
  if (!sameOrigin(request, env)) return failure(request, env, 403, "ORIGIN_NOT_ALLOWED", "Origin is not allowed");
  const gateway = verifyGateway(request, env);
  if (gateway.error) return failure(request, env, gateway.error.status, gateway.error.code, gateway.error.message);
  if (request.method.toUpperCase() !== "GET") return failure(request, env, 405, "METHOD_NOT_ALLOWED", "Use GET for voice output");
  const url = new URL(request.url);
  const job = url.searchParams.get("job") || "";
  const token = url.searchParams.get("token") || "";
  if (!validOutputJobId(job) || !validOutputToken(token)) return failure(request, env, 400, "INVALID_VOICE_OUTPUT_TOKEN", "Invalid voice output address");
  const backend = configuredVoiceBackend(env);
  if (!backend) return failure(request, env, 503, "VOICE_BACKEND_NOT_CONFIGURED", "Voice generation is not configured");

  const outputUrl = new URL(`/v1/output/${encodeURIComponent(job)}`, backend.url.origin);
  outputUrl.searchParams.set("token", token);
  let upstream;
  try {
    upstream = await fetchWithTimeout(outputUrl.toString(), { headers: { Authorization: `Bearer ${backend.token}` } }, 30000);
  } catch (error) {
    return failure(request, env, error && error.name === "AbortError" ? 504 : 502, "VOICE_OUTPUT_UNAVAILABLE", "Voice output is temporarily unavailable");
  }
  const contentType = String(upstream.headers.get("Content-Type") || "").toLowerCase();
  if (!upstream.ok || !contentType.startsWith("audio/")) return failure(request, env, 502, "VOICE_OUTPUT_UNAVAILABLE", "Voice output is temporarily unavailable");
  const headers = new Headers(responseHeaders(request, env, contentType));
  headers.set("Content-Disposition", 'attachment; filename="postprep-ai-audio.wav"');
  headers.set("Referrer-Policy", "no-referrer");
  return new Response(upstream.body, { status: 200, headers });
}
