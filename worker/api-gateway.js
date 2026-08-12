const RATE_LIMITER_BINDING = "POSTPREP_RATE_LIMITER";
const GATEWAY_SECRET_BINDING = "POSTPREP_GATEWAY_SECRET";
const DEFAULT_PUBLIC_SITE_ORIGINS = Object.freeze([
  "https://senseixiaomisensei-sudo.github.io",
]);

function normalizedHttpOrigin(value) {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : "";
  } catch {
    return "";
  }
}

function publicSiteOrigins(env) {
  const configured = env && typeof env.ALLOWED_ORIGINS === "string" ? env.ALLOWED_ORIGINS : "";
  const extraOrigins = configured.split(",").map(normalizedHttpOrigin).filter(Boolean);
  return new Set([...DEFAULT_PUBLIC_SITE_ORIGINS, ...extraOrigins]);
}

function isAllowedOrigin(request, env) {
  const origin = request.headers.get("Origin");
  return Boolean(origin && publicSiteOrigins(env).has(origin));
}

function responseHeaders(request, env) {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=UTF-8",
    "X-Content-Type-Options": "nosniff",
    Vary: "Origin",
  });
  const origin = request.headers.get("Origin");
  if (origin && isAllowedOrigin(request, env)) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

function failure(request, env, status, code, message) {
  return new Response(JSON.stringify({ code, message, details: {} }), {
    status,
    headers: responseHeaders(request, env),
  });
}

function clientRateLimitKey(request) {
  const origin = normalizedHttpOrigin(request.headers.get("Origin")) || "unknown-origin";
  const ip = String(request.headers.get("CF-Connecting-IP") || "unknown-ip").trim();
  return `text:${origin}:${ip.slice(0, 128)}`;
}

async function enforceRateLimit(request, env) {
  const limiter = env && env[RATE_LIMITER_BINDING];
  if (!limiter || typeof limiter.limit !== "function") {
    return { error: { status: 503, code: "RATE_LIMITER_NOT_CONFIGURED", message: "Cloud processing safeguards are not configured" } };
  }
  try {
    const result = await limiter.limit({ key: clientRateLimitKey(request) });
    if (result && result.success === true) return { ok: true };
    if (result && result.success === false) {
      return { error: { status: 429, code: "RATE_LIMITED", message: "Please wait before requesting more cloud processing" } };
    }
    return { error: { status: 503, code: "RATE_LIMITER_UNAVAILABLE", message: "Cloud processing safeguards are temporarily unavailable" } };
  } catch {
    return { error: { status: 503, code: "RATE_LIMITER_UNAVAILABLE", message: "Cloud processing safeguards are temporarily unavailable" } };
  }
}

function protectedGatewaySecret(env) {
  return env && typeof env[GATEWAY_SECRET_BINDING] === "string" ? env[GATEWAY_SECRET_BINDING] : "";
}

export default {
  async fetch(request, env) {
    const method = request.method.toUpperCase();
    if (!isAllowedOrigin(request, env)) return failure(request, env, 403, "ORIGIN_NOT_ALLOWED", "Origin is not allowed");

    const gatewaySecret = protectedGatewaySecret(env);
    const upstreamUrl = env && typeof env.POSTPREP_UPSTREAM_URL === "string" ? env.POSTPREP_UPSTREAM_URL : "";
    if (!gatewaySecret || !upstreamUrl) {
      return failure(request, env, 503, "GATEWAY_NOT_CONFIGURED", "Cloud processing safeguards are not configured");
    }

    if (method === "OPTIONS") {
      const headers = responseHeaders(request, env);
      headers.set("Allow", "POST, OPTIONS");
      headers.set("Access-Control-Allow-Headers", "Content-Type");
      headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
      headers.set("Access-Control-Max-Age", "600");
      return new Response(null, { status: 204, headers });
    }
    if (method !== "POST") return failure(request, env, 405, "METHOD_NOT_ALLOWED", "Use POST for text processing");

    const rateLimit = await enforceRateLimit(request, env);
    if (rateLimit.error) return failure(request, env, rateLimit.error.status, rateLimit.error.code, rateLimit.error.message);

    const headers = new Headers();
    const contentType = request.headers.get("Content-Type");
    const origin = request.headers.get("Origin");
    const visitorIp = request.headers.get("CF-Connecting-IP");
    if (contentType) headers.set("Content-Type", contentType);
    if (origin) headers.set("Origin", origin);
    if (visitorIp) headers.set("CF-Connecting-IP", visitorIp);
    headers.set("X-PostPrep-Gateway", gatewaySecret);

    try {
      const upstream = await fetch(upstreamUrl, {
        method: "POST",
        headers,
        body: request.body,
      });
      const upstreamHeaders = new Headers(upstream.headers);
      upstreamHeaders.set("Cache-Control", "no-store");
      upstreamHeaders.set("X-Content-Type-Options", "nosniff");
      upstreamHeaders.set("Vary", "Origin");
      upstreamHeaders.set("Access-Control-Allow-Origin", origin);
      return new Response(upstream.body, { status: upstream.status, headers: upstreamHeaders });
    } catch {
      return failure(request, env, 502, "UPSTREAM_UNAVAILABLE", "Cloud processing is temporarily unavailable");
    }
  },
};
