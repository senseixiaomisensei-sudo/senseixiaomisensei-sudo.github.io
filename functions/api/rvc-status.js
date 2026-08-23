import { configuredRvcBackend, failure, fetchWithTimeout, json, sameOrigin, verifyGateway } from "./_rvc-shared.js";

export async function onRequest(context) {
  const { request, env } = context;
  if (!sameOrigin(request, env)) return failure(request, env, 403, "ORIGIN_NOT_ALLOWED", "Origin is not allowed");
  const gateway = verifyGateway(request, env);
  if (gateway.error) return failure(request, env, gateway.error.status, gateway.error.code, gateway.error.message);
  if (request.method.toUpperCase() !== "GET") return failure(request, env, 405, "METHOD_NOT_ALLOWED", "Use GET for service status");
  const backend = configuredRvcBackend(env);
  if (!backend) return json(request, env, { ready: false });
  const healthUrl = new URL("/healthz", backend.url.origin);
  try {
    const upstream = await fetchWithTimeout(healthUrl.toString(), {
      headers: { Authorization: `Bearer ${backend.token}` },
    // Cross-border mobile routes can take several seconds before the tunnel
    // responds. A health probe is non-destructive, so leave enough headroom
    // before the page concludes that the cloud engine is unavailable.
    }, 15000);
    const payload = await upstream.json().catch(() => null);
    const ready = Boolean(upstream.ok && payload && payload.ready === true);
    return json(request, env, ready ? {
      ready: true,
      engine: typeof payload.engine === "string" ? payload.engine : "",
      tag: typeof payload.tag === "string" ? payload.tag : "",
      commit: typeof payload.commit === "string" ? payload.commit : "",
      device: typeof payload.device === "string" ? payload.device : "",
      half: payload.half === true,
    } : { ready: false });
  } catch {
    return json(request, env, { ready: false });
  }
}
