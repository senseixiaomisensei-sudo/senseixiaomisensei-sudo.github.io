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
    }, 20000);
    const payload = await upstream.json().catch(() => null);
    const models = upstream.ok && payload && Array.isArray(payload.models)
      ? payload.models
        .filter((model) => model && typeof model.id === "string" && /^[A-Za-z0-9_-]{1,64}$/u.test(model.id))
        .map((model) => ({
          id: model.id,
          name: typeof model.name === "string" ? model.name.slice(0, 120) : model.id,
          emoji: typeof model.emoji === "string" ? model.emoji.slice(0, 8) : "🎵",
          description: typeof model.description === "string" ? model.description.slice(0, 400) : "",
          tags: Array.isArray(model.tags) ? model.tags.filter((tag) => typeof tag === "string").slice(0, 8).map((tag) => tag.slice(0, 40)) : [],
          hasIndex: model.hasIndex === true,
          license: typeof model.license === "string" ? model.license.slice(0, 120) : "unverified",
          source: typeof model.source === "string" && /^https:\/\//u.test(model.source) ? model.source.slice(0, 500) : "",
          modelVersion: typeof model.modelVersion === "string" ? model.modelVersion.slice(0, 40) : "",
          trained: model.trained === true,
          createdAt: typeof model.createdAt === "string" ? model.createdAt.slice(0, 40) : "",
        }))
      : [];
    return json(request, env, { models });
  } catch {
    return json(request, env, { models: [] });
  }
}
