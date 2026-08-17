import { configuredRvcBackend, failure, fetchWithTimeout, json, sameOrigin, verifyGateway } from "./_rvc-shared.js";

export async function onRequest(context) {
  const { request, env } = context;
  if (!sameOrigin(request, env)) return failure(request, env, 403, "ORIGIN_NOT_ALLOWED", "Origin is not allowed");
  const gateway = verifyGateway(request, env);
  if (gateway.error) return failure(request, env, gateway.error.status, gateway.error.code, gateway.error.message);
  if (request.method.toUpperCase() !== "GET") return failure(request, env, 405, "METHOD_NOT_ALLOWED", "Use GET for the voice list");
  const backend = configuredRvcBackend(env);
  if (!backend) return failure(request, env, 503, "RVC_BACKEND_NOT_CONFIGURED", "Voice conversion is not configured");
  const modelsUrl = new URL("/v1/models", backend.url.origin);
  try {
    const upstream = await fetchWithTimeout(modelsUrl.toString(), {
      headers: { Authorization: `Bearer ${backend.token}` },
    }, 8000);
    const payload = await upstream.json().catch(() => null);
    const models = upstream.ok && payload && Array.isArray(payload.models)
      ? payload.models.filter((model) => model && typeof model.id === "string" && /^[A-Za-z0-9_-]{1,64}$/u.test(model.id))
      : [];
    return json(request, env, { models });
  } catch {
    return json(request, env, { models: [] });
  }
}
